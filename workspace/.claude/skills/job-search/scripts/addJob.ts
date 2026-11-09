import { out, die, getDb } from './db.ts';
import { classify } from './catalogMatch.ts';
import { upsertJob } from './upsertJob.ts';
import type { RawJob } from './upsertJob.ts';

/**
 * Generic single-job entry point for paths that aren't the Greenhouse/Lever
 * loop in ingest.ts: discovery results and manual paste-in. Takes a RawJob
 * as JSON on stdin, runs it through the same dedup/upsert logic as ingestion.
 */

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const raw = await readStdin();
  let job: RawJob;
  try {
    job = JSON.parse(raw);
  } catch (e) {
    die({ error: 'invalid_json', message: String(e) });
  }
  if (!job.source || !job.company || !job.title || !job.url || !job.descriptionText) {
    die({ error: 'missing_fields', required: ['source', 'company', 'title', 'url', 'descriptionText'] });
  }
  // Hard stop before inserting: a same-company near-duplicate title, or a same-company
  // posting whose description opens identically (LinkedIn cards often retitle a
  // posting, as "Website Manager" did for a "Director of Digital Experience").
  // Uniti was inserted and scored at 82 on 2026-10-15 although the existing row
  // was in the same warning output; a warning in a JSON blob is not a stop.
  // Pass "allowDuplicate": true only after opening the named row and deciding.
  if (!(job as any).allowDuplicate) {
    const v = classify({ title: job.title, company: job.company, url: job.url });
    let hits = v.state === 'known' && v.by === 'title' ? v.hits : [];
    if (!hits.length && v.state === 'new') {
      const head = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 300);
      const mine = head(job.descriptionText);
      const rows = getDb().prepare('SELECT id, title, status, description_text FROM jobs WHERE company LIKE ?')
        .all(`%${job.company.split(' ')[0]}%`) as any[];
      hits = rows.filter((r) => r.description_text && head(r.description_text) === mine)
        .map((r) => ({ id: r.id, title: r.title, status: r.status }));
    }
    if (hits.length) {
      die({ error: 'possible_duplicate', existing: hits,
        message: 'Not inserted. Open the named row(s); if this is a different posting, resend with "allowDuplicate": true.' });
    }
  }
  const result = upsertJob(job);
  out(result);
}

main();
