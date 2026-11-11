/**
 * Keeps the skill up to date from its GitHub releases. Nothing about the
 * person is sent: these are plain downloads of the public release.
 *
 *   update.ts check            is there a newer version? (always asks GitHub)
 *   update.ts check --quiet    at most once a week; prints only when there is one
 *   update.ts install          download the newest version and swap it in
 *
 * install runs the new copy's setup/update.mjs, which replaces the skill,
 * CLAUDE.md and .claude/settings.json and never touches profile/, data/,
 * applications/ or readouts/. The old skill is kept in .runtime/job-search.previous.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { skillDir, workspaceDir, dataDir } from './paths.ts';
import { out, die } from './db.ts';

const REPO = 'conwaydev/job-search-skill';
const ZIP_URL = `https://github.com/${REPO}/releases/latest/download/JobSearch.zip`;
const stateFile = path.join(dataDir, 'update-check.json');
const WEEK = 7 * 24 * 60 * 60 * 1000;

const current: string = JSON.parse(readFileSync(path.join(skillDir, 'package.json'), 'utf8')).version;

const newer = (a: string, b: string) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

async function latest(): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from GitHub`);
  const d = (await res.json()) as { tag_name: string };
  return d.tag_name.replace(/^v/, '');
}

async function check(quiet: boolean) {
  if (quiet) {
    try {
      const s = JSON.parse(readFileSync(stateFile, 'utf8')) as { checkedAt: string };
      if (Date.now() - Date.parse(s.checkedAt) < WEEK) return;
    } catch {
      // never checked
    }
  }
  let v: string;
  try {
    v = await latest();
  } catch (e) {
    if (quiet) return; // offline or GitHub busy: say nothing, try again next session
    out({ found: false, current, message: String((e as Error).message), hint: 'Could not reach GitHub. Try again later.' });
    return;
  }
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ checkedAt: new Date().toISOString(), latest: v }, null, 2));
  const isNewer = newer(v, current);
  if (quiet && !isNewer) return;
  out({ current, latest: v, newer: isNewer, hint: isNewer ? 'Tell them in one line, and offer to update when they say "update".' : undefined });
}

/** Writes every file in the zip under dest. Refuses paths that would land outside it. */
function unzip(zip: Buffer, dest: string) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const root = path.resolve(dest);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('damaged zip file');
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    const to = path.resolve(root, name);
    if (!to.startsWith(root + path.sep)) throw new Error(`unsafe path in zip: ${name}`);
    if (name.endsWith('/')) { mkdirSync(to, { recursive: true }); continue; }
    const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const data = zip.subarray(start, start + compSize);
    mkdirSync(path.dirname(to), { recursive: true });
    writeFileSync(to, method === 0 ? data : inflateRawSync(data));
  }
}

async function install() {
  const v = await latest().catch((e) => die({ error: 'offline', message: String((e as Error).message), hint: 'Could not reach GitHub. Try again later.' }));
  if (!newer(v, current)) {
    out({ updated: false, current, latest: v, message: 'Already on the newest version.' });
    return;
  }
  const work = path.join(workspaceDir, '.runtime', 'update');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const res = await fetch(ZIP_URL, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
  if (!res.ok) die({ error: 'download_failed', status: res.status, hint: 'Try again later.' });
  unzip(Buffer.from(await res.arrayBuffer()), work);
  const script = path.join(work, 'JobSearch', '.claude', 'skills', 'job-search', 'setup', 'update.mjs');
  if (!existsSync(script)) die({ error: 'bad_download', hint: 'The download did not look like the job search skill. Try again later.' });
  // The new copy's own update script does the swap, so a release can change
  // how updating works without this old copy knowing about it.
  try {
    execFileSync(process.execPath, [script], { cwd: workspaceDir, stdio: 'inherit' });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ checkedAt: new Date().toISOString(), latest: v }, null, 2));
  out({ updated: true, from: current, to: v, notes: `https://github.com/${REPO}/releases/tag/v${v}`, hint: 'Suggest starting a new session so the new version loads.' });
}

const [cmd] = process.argv.slice(2);
if (cmd === 'check') await check(process.argv.includes('--quiet'));
else if (cmd === 'install') await install();
else die({ error: 'usage', hint: 'update.ts check [--quiet] | update.ts install' });
