/**
 * Sort scan results into "already in the catalog" and "genuinely new".
 *
 * The scanners used to print every in-scope card and leave the duplicate check
 * to whoever read the output. On 2026-10-01 that check was a job-id lookup
 * against known URLs, which can never catch a LinkedIn repost of a posting
 * catalogued under its Greenhouse or Ashby URL, so 15 of 56 "new" postings were
 * already in the catalog: two applied, one ghosted, several archived or
 * ignored, the rest scored. Matching belongs here, at scan time, in code.
 *
 * Three signals, strongest first:
 *   1. a shared posting id (ATS req, LinkedIn id) within the same company
 *   2. the same company with a near-identical title, whatever the URL
 *   3. the same company with a different title: not a duplicate, but worth
 *      showing, since a second role at an employer already applied to is a
 *      different decision from a cold one
 *
 * Every status counts as known, archived and ignored included. Those are the
 * ones that re-surface as "new" and get scored twice.
 */
import { getDb, postingIds } from './db.ts';

export interface Candidate {
  title: string;
  company: string;
  url: string;
}

export interface CatalogHit {
  id: number;
  title: string;
  status: string;
}

export type Verdict =
  | { state: 'known'; by: 'posting-id' | 'title'; hits: CatalogHit[] }
  | { state: 'new'; sameCompany: CatalogHit[] };

interface Row extends CatalogHit {
  company: string;
  url: string;
  canonical_url: string | null;
}

const STOP = new Set(['of', 'the', 'and', 'a', 'for', 'to', 'in', 'at']);

/** Title tokens with location tags and punctuation removed: "(Remote, Riverside)" is not part of the role. */
function tokens(title: string): string[] {
  return (title || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !STOP.has(t));
}

export function sameTitle(a: string, b: string): boolean {
  const x = new Set(tokens(a));
  const y = new Set(tokens(b));
  if (!x.size || !y.size) return false;
  const shared = [...x].filter((t) => y.has(t)).length;
  const jaccard = shared / (x.size + y.size - shared);
  // A subset match covers a catalog title that dropped a suffix ("Senior
  // Engineering Manager" vs "Senior Engineering Manager, Growth"), but only
  // when enough words agree that it is not just "Director".
  const subset = shared === Math.min(x.size, y.size) && shared >= 3;
  return jaccard >= 0.75 || subset;
}

/** Whole words of a company name, lowercased, legal suffixes and punctuation dropped. */
function words(company: string): string[] {
  return (company || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|holdings|group|plc|gmbh|ag|nv|sa|the)\b/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Company names differ by suffix and punctuation ("DEPT®" vs "DEPT"), and
 * sources disagree on how much of the name to use: LinkedIn says "Jane App"
 * where the catalog says "Jane". One name matches another when its whole words
 * are a prefix of the other's, so "Meta" does not match "Metabase". The title
 * or posting id still has to agree before anything counts as known.
 */
function sameCompany(a: string, b: string): boolean {
  const x = words(a);
  const y = words(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.join('') === long.join('')) return true;
  return short.every((w, i) => w === long[i]);
}

let rows: Row[] | undefined;
function catalog(): Row[] {
  rows ??= getDb()
    .prepare('SELECT id, company, title, status, url, canonical_url FROM jobs')
    .all() as unknown as Row[];
  return rows;
}

export function classify(c: Candidate): Verdict {
  const incoming = new Set(postingIds(c.url));
  const companyRows = catalog().filter((r) => sameCompany(r.company, c.company));
  const brief = (r: Row): CatalogHit => ({ id: r.id, title: r.title, status: r.status });

  const byId = companyRows.filter(
    (r) => incoming.size && [...postingIds(r.url), ...postingIds(r.canonical_url)].some((id) => incoming.has(id))
  );
  if (byId.length) return { state: 'known', by: 'posting-id', hits: byId.map(brief) };

  const byTitle = companyRows.filter((r) => sameTitle(r.title, c.title));
  if (byTitle.length) return { state: 'known', by: 'title', hits: byTitle.map(brief) };

  return { state: 'new', sameCompany: companyRows.map(brief) };
}

export interface Partitioned<T> {
  fresh: { item: T; sameCompany: CatalogHit[] }[];
  known: { item: T; by: 'posting-id' | 'title'; hits: CatalogHit[] }[];
  /** Postings dropped because the same run already listed the same role at the same company. */
  collapsed: number;
}

/**
 * Split scan results against the catalog. Also collapses the same role listed
 * more than once in the run (one posting in several cities is common).
 */
export function partition<T extends Candidate>(items: T[]): Partitioned<T> {
  const out: Partitioned<T> = { fresh: [], known: [], collapsed: 0 };
  const kept: T[] = [];
  for (const item of items) {
    if (kept.some((k) => sameCompany(k.company, item.company) && sameTitle(k.title, item.title))) {
      out.collapsed++;
      continue;
    }
    kept.push(item);
    const v = classify(item);
    if (v.state === 'known') out.known.push({ item, by: v.by, hits: v.hits });
    else out.fresh.push({ item, sameCompany: v.sameCompany });
  }
  return out;
}

const fmt = (h: CatalogHit) => `#${h.id} ${h.status}`;

/** "also at this company: #416 applied, #174 archived", or an empty string. */
export function companyNote(sameCompany: CatalogHit[]): string {
  if (!sameCompany.length) return '';
  const shown = sameCompany.slice(0, 3).map(fmt).join(', ');
  const more = sameCompany.length > 3 ? ` +${sameCompany.length - 3}` : '';
  return `also in catalog for this company: ${shown}${more}`;
}

/** One line saying how many were hidden and what state they are in, so the filtering is never silent. */
export function knownSummary<T>(known: Partitioned<T>['known'], collapsed: number): string {
  const byStatus = new Map<string, number>();
  for (const k of known) {
    const status = k.hits[0].status;
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
  }
  const parts = [...byStatus.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${n} ${s}`);
  const tail = collapsed ? `, ${collapsed} repeat listings collapsed` : '';
  return `${known.length} already in catalog (${parts.join(', ') || 'none'})${tail}; --show-known lists them`;
}

export function knownLine<T extends Candidate>(k: Partitioned<T>['known'][number]): string {
  return `${k.item.company.slice(0, 24).padEnd(24)} | ${k.item.title.slice(0, 50).padEnd(50)} -> ${k.hits.map(fmt).join(', ')} (by ${k.by})`;
}
