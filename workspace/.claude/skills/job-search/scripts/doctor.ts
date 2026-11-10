/**
 * Is this computer ready to run the job search? Checks everything a script
 * needs and says what to do about anything missing, in plain words.
 *
 *   doctor.ts           full checklist
 *   doctor.ts --quiet   prints nothing when all is well (run at session start)
 *   doctor.ts --json    machine-readable
 *
 * Exits 1 when something required is missing. Never changes anything except
 * creating the workspace's own empty folders if they are missing.
 */
import { existsSync, accessSync, constants, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { skillDir, workspaceDir, profileDir, dataDir, applicationsDir, readoutsDir, profileFiles, sessionRoot } from './paths.ts';

interface Check { name: string; ok: boolean; required: boolean; detail: string; fix?: string }
const checks: Check[] = [];
const add = (c: Check) => checks.push(c);

// Node: native TypeScript needs 22.18+, node:sqlite needs 22.13+.
const [maj, min] = process.versions.node.split('.').map(Number);
const nodeOk = maj > 22 || (maj === 22 && min >= 18);
add({
  name: 'Node',
  ok: nodeOk,
  required: true,
  detail: `version ${process.versions.node}`,
  fix: 'Install Node 22.18 or newer. Follow references/setup.md.',
});

// SQLite, built into Node.
try {
  const { DatabaseSync } = await import('node:sqlite');
  new DatabaseSync(':memory:').exec('CREATE TABLE t (x)');
  add({ name: 'SQLite', ok: true, required: true, detail: 'built into Node' });
} catch (e) {
  add({ name: 'SQLite', ok: false, required: true, detail: String(e).slice(0, 120), fix: 'Node is too old. Follow references/setup.md.' });
}

// Workspace folders: create if missing, then check they are writable.
for (const dir of [profileDir, dataDir, applicationsDir, readoutsDir, path.join(dataDir, 'tmp')]) {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
  } catch {
    add({
      name: `Folder ${path.relative(workspaceDir, dir)}`,
      ok: false,
      required: true,
      detail: 'cannot write here',
      fix: 'Move the JobSearch folder somewhere you own, such as your home folder, and open it again.',
    });
  }
}
if (!checks.some((c) => c.name.startsWith('Folder'))) {
  add({ name: 'Folders', ok: true, required: true, detail: workspaceDir });
}

// Playwright, from the skill's own node_modules.
const pwEntry = path.join(skillDir, 'node_modules', 'playwright', 'index.js');
const pwOk = existsSync(pwEntry);
add({
  name: 'Playwright',
  ok: pwOk,
  required: true,
  detail: pwOk ? 'installed' : 'not installed',
  fix: 'Run `npm ci` in .claude/skills/job-search (see references/setup.md, step 3).',
});

// A browser: real Chrome preferred, Playwright's Chromium as a fallback.
const { findChrome } = await import('./browserSession.ts');
const chrome = findChrome();
let chromium: string | null = null;
if (!chrome && pwOk) {
  try {
    const { loadPlaywright } = await import('./browserSession.ts');
    const pw = await loadPlaywright();
    const p = pw.chromium.executablePath();
    if (p && existsSync(p)) chromium = p;
  } catch {
    // reported below
  }
}
add({
  name: 'Browser',
  ok: Boolean(chrome || chromium),
  required: true,
  detail: chrome ? 'Google Chrome' : chromium ? "Playwright's Chromium" : 'none found',
  fix: 'Install Google Chrome (google.com/chrome), or run scripts/installBrowser.ts.',
});

// Informational: onboarding progress and LinkedIn sign-in.
let onboarding = 'not started';
try {
  const state = JSON.parse(readFileSync(profileFiles.onboardingState, 'utf8')) as { steps?: Record<string, string> };
  const steps = Object.entries(state.steps ?? {});
  const done = steps.filter(([, v]) => v === 'done' || v === 'skipped').length;
  onboarding = steps.length && done === steps.length ? 'finished' : `${done} of ${steps.length} steps done`;
} catch {
  // not started
}
add({ name: 'Onboarding', ok: true, required: false, detail: onboarding });
add({
  name: 'LinkedIn',
  ok: true,
  required: false,
  detail: existsSync(path.join(sessionRoot, 'linkedin.json')) ? 'signed in before (check with login.ts --status)' : 'not signed in (optional)',
});

const problems = checks.filter((c) => c.required && !c.ok);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ready: problems.length === 0, checks }, null, 2));
} else if (process.argv.includes('--quiet')) {
  if (problems.length) {
    console.log('Setup problems:');
    for (const p of problems) console.log(`- ${p.name}: ${p.detail}. ${p.fix ?? ''}`);
  }
} else {
  for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}${!c.ok && c.fix ? `\n    → ${c.fix}` : ''}`);
  console.log(problems.length ? `\n${problems.length} thing(s) to fix.` : '\nReady.');
}
process.exit(problems.length ? 1 : 0);
