/**
 * Onboarding progress, in profile/onboarding-state.json.
 *
 *   onboardingState.ts                         show every step and the next one
 *   onboardingState.ts set <step> <status> ["note"]
 *
 * Status is one of: todo, in_progress, done, skipped. Every step can be
 * skipped and resumed, so the person can stop at any point and pick up later.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { profileDir, profileFiles, ensureDir } from './paths.ts';
import { out, die } from './db.ts';

export const STEPS = [
  { id: 'setup', label: 'Get this computer ready' },
  { id: 'resume', label: 'Turn your resume into your baseline' },
  { id: 'search', label: 'What you are looking for' },
  { id: 'metrics', label: 'Your numbers and facts, checked one by one' },
  { id: 'voice', label: 'How you write' },
  { id: 'linkedin', label: 'LinkedIn sign-in (optional)' },
  { id: 'companies', label: 'Companies to watch' },
  { id: 'tracker', label: 'Your application tracker' },
  { id: 'firstRun', label: 'First search' },
] as const;
const STATUSES = ['todo', 'in_progress', 'done', 'skipped'];

interface State { startedAt: string; updatedAt: string; steps: Record<string, string>; notes: Record<string, string> }

function load(): State {
  try {
    const s = JSON.parse(readFileSync(profileFiles.onboardingState, 'utf8')) as State;
    for (const step of STEPS) s.steps[step.id] ??= 'todo';
    s.notes ??= {};
    return s;
  } catch {
    const now = new Date().toISOString();
    return { startedAt: now, updatedAt: now, steps: Object.fromEntries(STEPS.map((s) => [s.id, 'todo'])), notes: {} };
  }
}

const [, , cmd, step, status, ...note] = process.argv;
const state = load();

if (cmd === 'set') {
  if (!STEPS.some((s) => s.id === step)) die({ error: 'unknown_step', steps: STEPS.map((s) => s.id) });
  if (!STATUSES.includes(status)) die({ error: 'bad_status', statuses: STATUSES });
  state.steps[step] = status;
  if (note.length) state.notes[step] = note.join(' ');
  state.updatedAt = new Date().toISOString();
  ensureDir(profileDir);
  writeFileSync(profileFiles.onboardingState, JSON.stringify(state, null, 2) + '\n');
}

const next = STEPS.find((s) => !['done', 'skipped'].includes(state.steps[s.id]));
out({
  finished: !next,
  next: next ? { id: next.id, label: next.label } : null,
  steps: STEPS.map((s) => ({ id: s.id, label: s.label, status: state.steps[s.id], note: state.notes[s.id] })),
});
