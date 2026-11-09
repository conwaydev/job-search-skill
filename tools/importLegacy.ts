/**
 * Brings Justin's history from the original skill into a new JobSearch
 * workspace, for the dogfood run. Maintainer tool; not shipped in the zip.
 *
 *   node --no-warnings tools/importLegacy.ts --from <old skill dir> --to <JobSearch folder>
 *
 * Run it after onboarding's resume step, so the new baseline exists.
 *
 * - data/jobs.db: the old database replaces the new one (the new one is kept
 *   as jobs.db.before-import). The schema migrates on open, then the new
 *   baseline is synced in as the current version, so old scores keep their
 *   old resume version and new scores use the new one.
 * - sources.json: merged into profile/sources.json (deduped).
 * - verified-metrics.md, the voice file, searchProfile.json and every dated
 *   [JUSTIN, …] rule from the old SKILL.md go to profile/legacy/ for a
 *   Claude session to convert. They are NOT copied into the live profile
 *   files: the old dossier keeps retracted numbers in tables, and
 *   auditProse would read those as verified.
 *
 * Never copies sessions/, browser-profile/ or people-research/.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const from = arg('--from');
const to = arg('--to');
if (!from || !to) {
  console.error('usage: importLegacy.ts --from <old skill dir> --to <JobSearch folder>');
  process.exit(2);
}
const skill = path.join(to, '.claude/skills/job-search');
const run = (script: string, ...a: string[]) =>
  execFileSync(process.execPath, ['--no-warnings', path.join(skill, 'scripts', script), ...a], {
    cwd: to,
    env: { ...process.env, JOBSEARCH_HOME: to },
    encoding: 'utf8',
  });

const report: Record<string, unknown> = {};
const legacy = path.join(to, 'profile/legacy');
mkdirSync(legacy, { recursive: true });
mkdirSync(path.join(to, 'data'), { recursive: true });

// 1. Database.
const oldDb = path.join(from, 'data/jobs.db');
const newDb = path.join(to, 'data/jobs.db');
if (existsSync(newDb)) renameSync(newDb, newDb + '.before-import');
copyFileSync(oldDb, newDb);
if (existsSync(path.join(to, 'profile/baseline-resume.json'))) {
  report.baseline = JSON.parse(run('syncBaseline.ts'));
} else {
  report.baseline = 'no profile/baseline-resume.json yet; run syncBaseline.ts after the resume step';
}
report.snapshot = JSON.parse(run('statusSnapshot.ts')).counts;

// 2. Sources, merged.
const oldSources = JSON.parse(readFileSync(path.join(from, 'references/sources.json'), 'utf8'));
const srcPath = path.join(to, 'profile/sources.json');
const cur = existsSync(srcPath) ? JSON.parse(readFileSync(srcPath, 'utf8')) : {};
for (const k of ['greenhouse', 'lever', 'ashby', 'workday', 'careerPages']) {
  const all = [...(cur[k] ?? []), ...(oldSources[k] ?? [])];
  const seen = new Set<string>();
  cur[k] = all.filter((x) => {
    const key = typeof x === 'string' ? x.toLowerCase() : String(x.url ?? x.company).toLowerCase();
    return seen.has(key) ? false : (seen.add(key), true);
  });
}
writeFileSync(srcPath, JSON.stringify(cur, null, 2) + '\n');
report.sources = Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, (v as unknown[]).length]));

// 3. Files to convert by hand (with Claude).
const stash: [string, string][] = [
  ['references/verified-metrics.md', 'verified-metrics-legacy.md'],
  ['references/justin-voice.md', 'voice-legacy.md'],
  ['references/searchProfile.json', 'searchProfile-legacy.json'],
];
for (const [src, dst] of stash) if (existsSync(path.join(from, src))) copyFileSync(path.join(from, src), path.join(legacy, dst));

// Dated rules: every paragraph or bullet carrying a [JUSTIN, date] marker.
const skillMd = readFileSync(path.join(from, 'SKILL.md'), 'utf8');
// A marked heading takes its whole section; a marked bullet or paragraph is taken alone.
const rules: string[] = [];
const lines = skillMd.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (!/\[JUSTIN/.test(lines[i])) continue;
  if (/^#{1,6}\s/.test(lines[i])) {
    let j = i + 1;
    while (j < lines.length && !/^#{1,6}\s/.test(lines[j])) j++;
    rules.push(lines.slice(i, j).join('\n').trim());
    i = j - 1;
  } else {
    let a = i, b = i;
    while (a > 0 && lines[a - 1].trim() && !/^\s*([-*]|\d+\.)\s/.test(lines[a]) && !/^#/.test(lines[a - 1])) a--;
    while (b + 1 < lines.length && lines[b + 1].trim() && !/^\s*([-*]|\d+\.)\s|^#/.test(lines[b + 1])) b++;
    const text = lines.slice(a, b + 1).join('\n').trim();
    if (!rules.includes(text)) rules.push(text);
    i = b;
  }
}
writeFileSync(
  path.join(legacy, 'rules-to-sort.md'),
  `# Rules from the old SKILL.md, to sort into learned-rules.md\n\n${rules.length} passages carry a [JUSTIN, …] marker.\n\n` +
    rules.map((r, i) => `## ${i + 1}\n\n${r}\n`).join('\n')
);
report.legacyFiles = { dir: legacy, rulesFound: rules.length };
report.next = [
  'Open the JobSearch folder in the Claude Code tab.',
  'Ask: "convert profile/legacy into my profile". Convert verified-metrics-legacy.md into ### claim blocks with Status and Use (retracted ones as do-not-use), merge voice-legacy.md into my-voice.md, and sort rules-to-sort.md into learned-rules.md (one dated line each, reason kept).',
  'Delete profile/legacy when done.',
];
console.log(JSON.stringify(report, null, 2));
