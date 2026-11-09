#!/usr/bin/env node
/**
 * Builds dist/JobSearch-v<version>.zip, the one file a person needs.
 *
 *   node tools/package.mjs
 *
 * The zip holds a single JobSearch/ folder: exactly the git-tracked files
 * under workspace/ plus "START HERE.txt". Building from `git ls-files` means
 * nothing personal (profile, jobs.db, a LinkedIn session, node_modules,
 * .runtime) can ever ride along, even if this checkout has been used.
 * Refuses to build if the tree has uncommitted changes under workspace/ or
 * if a scrub word appears in a shipped file.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });

if (git('status', '--porcelain', '--', 'workspace').trim()) {
  console.error('workspace/ has uncommitted changes. Commit them first so the zip matches the repo.');
  process.exit(1);
}

const version = JSON.parse(readFileSync(path.join(root, 'workspace/.claude/skills/job-search/package.json'), 'utf8')).version;
const files = git('ls-files', 'workspace').split('\n').filter(Boolean);

// Words that must never ship. Built In's city site names are allowed.
const SCRUB = /\b(justin|conway|conwaydev|sprout)\b/i;
const leaks = files.filter((f) => !/\.(png|jpg|ico)$/.test(f) && SCRUB.test(readFileSync(path.join(root, f), 'utf8')));
if (leaks.length) {
  console.error('Scrub words found in:\n  ' + leaks.join('\n  '));
  process.exit(1);
}

const dist = path.join(root, 'dist');
const stage = path.join(dist, 'stage');
const top = path.join(stage, 'JobSearch');
rmSync(stage, { recursive: true, force: true });
for (const f of files) {
  const to = path.join(top, path.relative('workspace', f));
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(path.join(root, f), to);
}
writeFileSync(path.join(top, 'START HERE.txt'), readFileSync(path.join(root, 'tools/START HERE.txt'), 'utf8').replace(/\r?\n/g, '\r\n'));

const zip = path.join(dist, `JobSearch-v${version}.zip`);
rmSync(zip, { force: true });
execFileSync('zip', ['-rqX', zip, 'JobSearch'], { cwd: stage });
rmSync(stage, { recursive: true, force: true });
console.log(`${zip}\n${files.length + 1} files, version ${version}`);
if (!existsSync(zip)) process.exit(1);
