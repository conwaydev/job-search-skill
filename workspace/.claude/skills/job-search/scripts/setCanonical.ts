import { getDb, out, die, isAggregatorUrl } from './db.ts';

/**
 * Record the employer's own posting URL for a job that was catalogued from an
 * aggregator. Aggregator listings rot within weeks and can't be applied
 * through, so this is the URL the person actually opens and the one
 * checkLiveness.ts asks when deciding whether a posting still exists.
 *
 *   setCanonical.ts <jobId> <url>
 *
 * Refuses another aggregator link, which would just move the problem.
 */

const [, , idArg, url] = process.argv;
const id = Number(idArg);
if (!id || !url) die({ error: 'usage', message: 'setCanonical.ts <jobId> <employerPostingUrl>' });
if (isAggregatorUrl(url)) {
  die({ error: 'aggregator_url', message: 'that is another aggregator listing — find the ATS or careers-site posting', url });
}
try {
  new URL(url);
} catch {
  die({ error: 'invalid_url', url });
}

const db = getDb();
const job = db.prepare('SELECT id, company, title, url, canonical_url FROM jobs WHERE id = ?').get(id) as
  | { id: number; company: string; title: string; url: string; canonical_url: string | null }
  | undefined;
if (!job) die({ error: 'job_not_found', id });

db.prepare('UPDATE jobs SET canonical_url = ? WHERE id = ?').run(url, id);
out({ jobId: id, company: job.company, title: job.title, previous: job.canonical_url, canonicalUrl: url });
