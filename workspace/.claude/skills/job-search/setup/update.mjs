// Updates the skill in this JobSearch folder from a newer download, leaving
// the person's data alone. Run the NEW copy's script, from the JobSearch
// folder being updated:
//
//   node "<new JobSearch folder>/.claude/skills/job-search/setup/update.mjs"
//
// Replaced:  .claude/skills/job-search/, CLAUDE.md, .claude/settings.json
// Untouched: profile/, data/, applications/, readouts/, .runtime/, .claude/settings.local.json
//
// The old skill folder is kept as .runtime/job-search.previous until the next
// update, so a bad update can be undone by moving it back.
import { existsSync, readFileSync, renameSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const newSkill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(newSkill, '..', '..', '..');
const workspace = process.cwd();
const skillDir = path.join(workspace, '.claude', 'skills', 'job-search');

if (!existsSync(path.join(workspace, 'profile')) && !existsSync(skillDir)) {
  console.error('Run this from the JobSearch folder you want to update.');
  process.exit(1);
}
if (path.resolve(newSkill) === path.resolve(skillDir)) {
  console.error("This is the installed copy. Run the update script from the new download's folder instead.");
  process.exit(1);
}

const version = (dir) => {
  try {
    return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
};
const from = version(skillDir);
const to = version(newSkill);

// Outside .claude/skills, or Claude would load the old copy as a second skill.
const previous = path.join(workspace, '.runtime', 'job-search.previous');
rmSync(previous, { recursive: true, force: true });
mkdirSync(path.dirname(previous), { recursive: true });
if (existsSync(skillDir)) renameSync(skillDir, previous);
cpSync(newSkill, skillDir, { recursive: true, filter: (src) => !src.split(path.sep).includes('node_modules') });
for (const f of ['CLAUDE.md', path.join('.claude', 'settings.json')]) {
  if (existsSync(path.join(source, f))) cpSync(path.join(source, f), path.join(workspace, f));
}

console.log(`Updated the job search skill from ${from} to ${to}. Installing its dependencies...`);
// Use the npm that ships with the Node running this script. Node installed by
// setup lives in .runtime and usually isn't on PATH yet, so a bare `npm` fails.
const nodeDir = path.dirname(process.execPath);
const npmCli = [
  path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Windows layout
  path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Mac and Linux layout
].find((p) => existsSync(p));
const npmArgs = ['ci', '--no-audit', '--no-fund', '--loglevel=error'];
try {
  if (npmCli) execFileSync(process.execPath, [npmCli, ...npmArgs], { cwd: skillDir, stdio: 'inherit' });
  else execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', npmArgs, { cwd: skillDir, stdio: 'inherit', shell: process.platform === 'win32' });
} catch {
  console.log('The skill was updated, but installing its dependencies failed. Run setup again ("set me up") to finish.');
  process.exit(1);
}
console.log('Done. Your profile, jobs and applications were not touched.');
