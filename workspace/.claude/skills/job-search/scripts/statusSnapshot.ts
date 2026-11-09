import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, out } from './db.ts';
import { profileFiles } from './paths.ts';

const searchProfilePath = profileFiles.searchProfile;

let staleAfterDays = 21;
try {
  const profile = JSON.parse(readFileSync(searchProfilePath, 'utf8'));
  if (typeof profile.staleAfterDays === 'number') staleAfterDays = profile.staleAfterDays;
} catch {
  // fall back to default
}

const db = getDb();

const counts = db
  .prepare('SELECT status, COUNT(*) as count FROM jobs GROUP BY status ORDER BY count DESC')
  .all();

const staleThreshold = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1000)
  .toISOString()
  .replace('T', ' ')
  .slice(0, 19);

const possiblyGhosted = db
  .prepare(
    `SELECT id, company, title, status, status_updated_at
     FROM jobs
     WHERE status IN ('applied', 'screening', 'interview')
       AND status_updated_at IS NOT NULL
       AND status_updated_at < ?
     ORDER BY status_updated_at ASC`
  )
  .all(staleThreshold);

out({ counts, staleAfterDays, possiblyGhosted });
