/**
 * Every path the skill reads or writes, in one place.
 *
 * The workspace is the folder the person opened in Claude Desktop. The skill
 * lives inside it at `.claude/skills/job-search/`, so by default the workspace
 * is three levels above this file's folder. `JOBSEARCH_HOME` overrides that,
 * which is how testing against a scratch folder works.
 *
 * Code and data are kept apart on purpose. An update replaces only the skill
 * folder; everything below `profile/`, `data/`, `applications/` and
 * `readouts/` belongs to the person and is never touched by an update.
 *
 * All paths are built with `path.join`, so they work on Windows too.
 */
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
export const skillDir = path.dirname(scriptsDir);
export const templatesDir = path.join(skillDir, 'templates');
export const referencesDir = path.join(skillDir, 'references');

// scripts -> job-search -> skills -> .claude -> workspace
const defaultHome = path.resolve(skillDir, '..', '..', '..');
export const workspaceDir = path.resolve(process.env.JOBSEARCH_HOME ?? defaultHome);

export const profileDir = path.join(workspaceDir, 'profile');
export const dataDir = path.join(workspaceDir, 'data');
export const applicationsDir = path.join(workspaceDir, 'applications');
export const readoutsDir = path.join(workspaceDir, 'readouts');

export const dbPath = path.join(dataDir, 'jobs.db');
export const sessionRoot = path.join(dataDir, 'sessions');
export const profileRoot = path.join(dataDir, 'browser-profile');
export const peopleResearchDir = path.join(dataDir, 'people-research');
export const digestsDir = path.join(readoutsDir, 'digests');

export const profileFiles = {
  baselineResume: path.join(profileDir, 'baseline-resume.json'),
  searchProfile: path.join(profileDir, 'search-profile.json'),
  verifiedMetrics: path.join(profileDir, 'verified-metrics.md'),
  voice: path.join(profileDir, 'my-voice.md'),
  learnedRules: path.join(profileDir, 'learned-rules.md'),
  sources: path.join(profileDir, 'sources.json'),
  onboardingState: path.join(profileDir, 'onboarding-state.json'),
  links: path.join(profileDir, 'links.json'),
};

/** Create a directory (and parents) if it is missing, and return it. */
export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}
