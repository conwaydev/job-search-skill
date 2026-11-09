import { getDb, dedupKey, nowIso, isAggregatorUrl, companyKey, postingIds } from './db.ts';

export interface RawJob {
  source: string;
  company: string;
  title: string;
  location?: string;
  url: string;
  /** The employer's own posting (ATS or careers site), when `url` is an aggregator. */
  canonicalUrl?: string;
  descriptionText: string;
  sourceId?: string;
  rawPayload?: unknown;
  discoveryQuery?: string;
  /**
   * Use this exact dedup key instead of deriving one. Only importData.ts sets
   * it, so a job synced from another machine matches the row it already is
   * rather than being re-derived from a different field and inserted twice.
   */
  dedupKeyOverride?: string;
}

export interface UpsertResult {
  jobId: number;
  action: 'inserted' | 'updated' | 'unchanged';
  /** Set when the job was filed with only an aggregator URL — go find the real one. */
  warning?: string;
  /**
   * How the row was recognized, when it wasn't the plain dedup key: 'posting-id'
   * means the same req was already catalogued under a different URL. Surfaced so
   * a duplicate that nearly got inserted is visible in the run rather than silent.
   */
  matchedBy?: 'posting-id';
  /** Same company and title already in the catalog, but no shared req id. Check it. */
  possibleDuplicateOf?: { id: number; title: string; status: string; url: string }[];
}

interface JobRow {
  id: number;
  company: string;
  title: string;
  status: string;
  url: string;
  description_text: string;
  canonical_url: string | null;
}

/**
 * Find a row that is the same posting as `job` but was filed under a different
 * URL, by matching a shared ATS req id AND the same company. The company check
 * is required: `postingIds` falls back to any long digit run, which is only
 * meaningful within one employer.
 */
function findByPostingId(job: RawJob): JobRow | undefined {
  const incoming = new Set([...postingIds(job.url), ...postingIds(job.canonicalUrl)]);
  if (incoming.size === 0) return undefined;
  const co = companyKey(job.company);
  const rows = getDb()
    .prepare('SELECT id, company, title, status, url, description_text, canonical_url FROM jobs')
    .all() as JobRow[];
  return rows.find(
    (r) =>
      companyKey(r.company) === co &&
      [...postingIds(r.url), ...postingIds(r.canonical_url)].some((id) => incoming.has(id))
  );
}

/** Same company and title, no shared req id — worth a look, not worth auto-merging. */
function sameCompanyAndTitle(job: RawJob, excludeId?: number): JobRow[] {
  const co = companyKey(job.company);
  const ti = job.title.trim().toLowerCase();
  const rows = getDb()
    .prepare('SELECT id, company, title, status, url, description_text, canonical_url FROM jobs')
    .all() as JobRow[];
  return rows.filter(
    (r) => r.id !== excludeId && companyKey(r.company) === co && r.title.trim().toLowerCase() === ti
  );
}

/**
 * Whether two descriptions are the same posting text, ignoring how they were
 * encoded on the way in.
 *
 * The same Greenhouse posting arrives differently depending on the path that
 * fetched it: `ingest` double-decodes entities, a discovery fetch may leave
 * `&nbsp;` literal. Comparing raw strings made every scored job look changed on
 * every ingest run and reset it to 'new' for re-scoring. On 2026-09-22 that
 * reopened six jobs judged `pass` two weeks earlier, over nothing but `&nbsp;`.
 */
function sameDescription(a: string, b: string): boolean {
  const norm = (t: string) =>
    (t || '')
      .replace(/&nbsp;|\u00a0/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return norm(a) === norm(b);
}

/**
 * Insert a new job, update one whose description changed, or just bump
 * last_seen_at for an unchanged repost. Returns whether the job needs
 * (re-)scoring so callers don't score unchanged reposts.
 */
export function upsertJob(job: RawJob): UpsertResult {
  const db = getDb();
  const key = job.dedupKeyOverride ?? dedupKey(job.company, job.title, job.sourceId ?? job.url);
  const byKey = db
    .prepare('SELECT id, company, title, status, url, description_text, canonical_url FROM jobs WHERE dedup_key = ?')
    .get(key) as JobRow | undefined;

  // The dedup key hashes the URL in, so the same req arriving from a second
  // source never matches it. Fall back to the req id before inserting.
  const byPostingId = byKey ? undefined : findByPostingId(job);
  const existing = byKey ?? byPostingId;

  // A canonical URL that is itself an aggregator link defeats the point.
  const canonical = job.canonicalUrl && !isAggregatorUrl(job.canonicalUrl) ? job.canonicalUrl : null;
  const warning =
    !canonical && isAggregatorUrl(job.url)
      ? 'url is an aggregator listing and no canonicalUrl was supplied — find the employer posting and backfill it'
      : undefined;

  if (!existing) {
    const result = db
      .prepare(
        `INSERT INTO jobs (source, company, title, location, url, canonical_url, description_text, dedup_key, raw_payload, discovery_query, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        job.source,
        job.company,
        job.title,
        job.location ?? null,
        job.url,
        canonical,
        job.descriptionText,
        key,
        job.rawPayload ? JSON.stringify(job.rawPayload) : null,
        job.discoveryQuery ?? null,
        nowIso(),
        nowIso()
      );
    const jobId = Number(result.lastInsertRowid);
    // No shared req id, but the same company and title are already here. Often
    // a real second posting (one title, several locations), sometimes a
    // duplicate whose URLs share nothing. Report it; don't decide it.
    const near = sameCompanyAndTitle(job, jobId);
    return {
      jobId,
      action: 'inserted',
      warning,
      ...(near.length
        ? {
            possibleDuplicateOf: near.map((r) => ({
              id: r.id,
              title: r.title,
              status: r.status,
              url: r.canonical_url ?? r.url,
            })),
          }
        : {}),
    };
  }

  const matchedBy = byPostingId ? ({ matchedBy: 'posting-id' } as const) : {};

  // Backfill rather than overwrite: a later sighting that found the employer
  // posting should fill the gap, but shouldn't clobber one already recorded.
  if (canonical && !existing.canonical_url) {
    db.prepare('UPDATE jobs SET canonical_url = ? WHERE id = ?').run(canonical, existing.id);
  }

  if (sameDescription(existing.description_text, job.descriptionText)) {
    db.prepare('UPDATE jobs SET last_seen_at = ? WHERE id = ?').run(nowIso(), existing.id);
    return { jobId: existing.id, action: 'unchanged', warning, ...matchedBy };
  }

  // Re-queue for scoring only while the job is still untouched. Once the person has
  // acted on it, the row carries application state and a reworded posting (or
  // just a fuller copy of the same one, which is the usual cause) must not
  // knock it back to 'new' and out of the pipeline.
  const reopenable = existing.status === 'new' || existing.status === 'scored';
  db.prepare(
    reopenable
      ? "UPDATE jobs SET description_text = ?, last_seen_at = ?, status = 'new' WHERE id = ?"
      : 'UPDATE jobs SET description_text = ?, last_seen_at = ? WHERE id = ?'
  ).run(job.descriptionText, nowIso(), existing.id);
  return { jobId: existing.id, action: 'updated', warning, ...matchedBy };
}
