import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { dbPath, scriptsDir, dataDir, ensureDir } from './paths.ts';

export { dbPath };
const schemaPath = path.join(scriptsDir, 'schema.sql');

let db: DatabaseSync | undefined;

function migrate(instance: DatabaseSync): void {
  const columns = (instance.prepare('PRAGMA table_info(jobs)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('salary_min')) instance.exec('ALTER TABLE jobs ADD COLUMN salary_min INTEGER');
  if (!columns.includes('salary_max')) instance.exec('ALTER TABLE jobs ADD COLUMN salary_max INTEGER');
  if (!columns.includes('work_model')) instance.exec('ALTER TABLE jobs ADD COLUMN work_model TEXT');
  // The employer's own posting, when `url` points at an aggregator. LinkedIn
  // and Built In URLs rot within weeks and can't be applied through, so the
  // canonical one is what survives and what the person actually opens.
  if (!columns.includes('canonical_url')) instance.exec('ALTER TABLE jobs ADD COLUMN canonical_url TEXT');
  if (!columns.includes('liveness')) instance.exec('ALTER TABLE jobs ADD COLUMN liveness TEXT');
  if (!columns.includes('liveness_checked_at')) instance.exec('ALTER TABLE jobs ADD COLUMN liveness_checked_at TEXT');
}

/**
 * Hosts that list other companies' jobs. A posting whose only URL is on one of
 * these is half-catalogued: the aggregator drops it long before the employer
 * does, and the apply button leads somewhere else anyway.
 */
const AGGREGATOR_HOSTS = [
  'linkedin.com',
  'builtin.com',
  'builtinchicago.org',
  'builtinnyc.com',
  'builtinaustin.com',
  'builtinboston.com',
  'builtincolorado.com',
  'builtinla.com',
  'builtinseattle.com',
  'builtinsf.com',
  'indeed.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'simplyhired.com',
  'wellfound.com',
  'angel.co',
  'simplify.jobs',
  'dice.com',
  'monster.com',
  'jobgether.com',
  'theladders.com',
  'otta.com',
  'welcometothejungle.com',
];

export function isAggregatorUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return AGGREGATOR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function getDb(): DatabaseSync {
  if (db) return db;
  ensureDir(dataDir);
  const isNew = !existsSync(dbPath);
  db = new DatabaseSync(dbPath);
  if (isNew) db.exec(readFileSync(schemaPath, 'utf8'));
  // Always migrate: schema.sql predates some columns, so a brand-new database
  // needs them added just like an old one does.
  migrate(db);
  return db;
}

export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function die(obj: unknown, code = 1): never {
  process.stderr.write(JSON.stringify(obj) + '\n');
  process.exit(code);
}

export function out(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function dedupKey(company: string, title: string, urlOrSourceId: string): string {
  const raw = `${normalize(company)}|${normalize(title)}|${normalize(urlOrSourceId)}`;
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Company name reduced to something stable across how different sources write
 * it: "Brown & Brown (Arrowhead Intermediaries)" and "Brown & Brown, Inc.
 * (Arrowhead Intermediaries)" both come out as "brownbrown".
 */
export function companyKey(company: string): string {
  return (company || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|holdings|group|plc|gmbh|ag|nv|sa|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Stable posting identifiers pulled out of a job URL, namespaced by scheme.
 *
 * This exists because `dedupKey` folds the URL into the hash, so the same req
 * seen at a second URL (LinkedIn card vs. the employer's board vs. an
 * ATS-hosted page) always produced a different key and always re-inserted.
 * Five duplicate pairs accumulated that way before it was caught, including a
 * job already in `applied`. The req id is what actually identifies a posting,
 * so matching on it is what makes dedup work across sources.
 *
 * The trailing `num:` fallback is deliberately loose, which is why callers
 * MUST also require the company to match before treating a hit as the same
 * posting. Two postings at one company that share a seven-digit run are the
 * same posting; two unrelated companies sharing one are a coincidence.
 */
export function postingIds(url: string | null | undefined): string[] {
  if (!url) return [];
  const u = url.toLowerCase();
  const ids = new Set<string>();
  const add = (scheme: string, v?: string | null) => {
    if (v) ids.add(`${scheme}:${v}`);
  };
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

  add('gh', u.match(/[?&]gh_jid=(\d+)/)?.[1]);
  add('gh', u.match(/greenhouse\.io\/(?:[^/]+\/)?jobs\/(\d+)/)?.[1]);
  add('li', u.match(/linkedin\.com\/jobs\/view\/(?:[^/?#]*?-)?(\d{6,})/)?.[1]);
  add('ashby', u.match(new RegExp(`ashbyhq\\.com/[^/]+/(${uuid})`))?.[1]);
  add('lever', u.match(new RegExp(`lever\\.co/[^/]+/(${uuid})`))?.[1]);
  add('wd', u.match(/_((?:jr|req|r)[-_]?\d[\w-]*?)(?:[/?#]|$)/)?.[1]);
  for (const m of u.matchAll(/\d{7,}/g)) ids.add(`num:${m[0]}`);

  return [...ids];
}
