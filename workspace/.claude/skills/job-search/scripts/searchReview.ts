/**
 * The numbers behind "how's my search going": what gets responses, by source,
 * work model and score band, plus whether a look-back is due.
 *
 *   searchReview.ts          stats, and due: true when 10+ applications since the last review
 *   searchReview.ts --due    just { due, appliedSinceLastReview }
 *   searchReview.ts --mark   record that a review was done now
 *
 * Small counts are directions, not results; say so when you report them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, out } from './db.ts';
import { profileDir, ensureDir } from './paths.ts';

const statePath = path.join(profileDir, 'last-review.json');
const EVERY = 10;
let lastReviewAt = '1970-01-01 00:00:00';
try {
  lastReviewAt = JSON.parse(readFileSync(statePath, 'utf8')).at ?? lastReviewAt;
} catch {
  // never reviewed
}

if (process.argv.includes('--mark')) {
  ensureDir(profileDir);
  const at = new Date().toISOString().replace('T', ' ').slice(0, 19);
  writeFileSync(statePath, JSON.stringify({ at }, null, 2) + '\n');
  out({ marked: at });
  process.exit(0);
}

const db = getDb();
const sinceLast = (db
  .prepare(`SELECT COUNT(DISTINCT job_id) n FROM status_history WHERE status = 'applied' AND changed_at > ?`)
  .get(lastReviewAt) as { n: number }).n;
const due = sinceLast >= EVERY;
if (process.argv.includes('--due')) {
  out({ due, appliedSinceLastReview: sinceLast, every: EVERY });
  process.exit(0);
}

// Every job ever applied to, with whether it got past "applied".
const rows = db
  .prepare(
    `SELECT j.id, j.source, COALESCE(j.work_model,'unknown') work_model, s.score,
       EXISTS (SELECT 1 FROM status_history h2 WHERE h2.job_id = j.id AND h2.status IN ('screening','interview','offer'))
         OR j.status IN ('screening','interview','offer') AS heard
     FROM jobs j
     LEFT JOIN job_scores s ON s.id = j.latest_score_id
     WHERE EXISTS (SELECT 1 FROM status_history h WHERE h.job_id = j.id AND h.status = 'applied')
        OR j.status IN ('applied','screening','interview','offer')`
  )
  .all() as { id: number; source: string; work_model: string; score: number | null; heard: number }[];

const band = (s: number | null) => (s == null ? 'unscored' : s >= 85 ? '85+' : s >= 70 ? '70-84' : 'under 70');
function by(key: (r: (typeof rows)[number]) => string) {
  const m = new Map<string, { applied: number; heardBack: number }>();
  for (const r of rows) {
    const k = key(r);
    const v = m.get(k) ?? { applied: 0, heardBack: 0 };
    v.applied++;
    if (r.heard) v.heardBack++;
    m.set(k, v);
  }
  return [...m].map(([k, v]) => ({ [k]: `${v.heardBack}/${v.applied}` })).reduce((a, b) => ({ ...a, ...b }), {});
}

// Roles the profile liked that they passed on, for "what's being skipped".
const skipped = db
  .prepare(
    `SELECT j.id, j.company, j.title, s.score FROM jobs j JOIN job_scores s ON s.id = j.latest_score_id
     WHERE j.status = 'ignored' AND s.score >= 80 ORDER BY j.status_updated_at DESC LIMIT 10`
  )
  .all();

// Where good roles come from, to spot searches that find nothing.
const goodBySource = db
  .prepare(
    `SELECT j.source, COALESCE(j.discovery_query,'') query, COUNT(*) found,
       SUM(CASE WHEN s.score >= 70 THEN 1 ELSE 0 END) good, MAX(j.first_seen_at) lastFound
     FROM jobs j LEFT JOIN job_scores s ON s.id = j.latest_score_id
     GROUP BY j.source, query ORDER BY good DESC, found DESC LIMIT 30`
  )
  .all();

const topIds = (db.prepare(`SELECT j.id FROM jobs j JOIN job_scores s ON s.id = j.latest_score_id WHERE s.score >= 80 ORDER BY s.score DESC LIMIT 15`).all() as { id: number }[]).map((r) => r.id);

out({
  due,
  appliedSinceLastReview: sinceLast,
  lastReviewAt: lastReviewAt.startsWith('1970') ? null : lastReviewAt,
  applied: rows.length,
  heardBack: rows.filter((r) => r.heard).length,
  heardBackBy: { source: by((r) => r.source), workModel: by((r) => r.work_model), scoreBand: by((r) => band(r.score)) },
  passedOnDespiteHighScore: skipped,
  sources: goodBySource,
  topScoringIdsToReadForThemes: topIds,
  note: rows.length < 20 ? 'Fewer than 20 applications: treat every pattern here as a direction, not a result.' : undefined,
});
