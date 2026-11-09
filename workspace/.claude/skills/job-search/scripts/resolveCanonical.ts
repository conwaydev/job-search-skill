import { getDb, out, die, isAggregatorUrl } from './db.ts';

/**
 * Find the employer's own posting for jobs catalogued from an aggregator.
 *
 * A LinkedIn or Built In card is a sighting, not a listing: it rots within
 * weeks, it can't be applied through, and checkLiveness.ts can't tell from it
 * whether the job is still open. This walks the company's own ATS board —
 * Greenhouse, Lever and Ashby all publish one as JSON, and the board token is
 * nearly always the company name squashed down — and matches by title.
 *
 *   resolveCanonical.ts                 # every open job missing one
 *   resolveCanonical.ts --ids 155,173   # specific jobs
 *   resolveCanonical.ts --write         # persist the matches it is sure of
 *
 * Without --write it only reports, so a run can be eyeballed before it
 * touches the catalog. Companies on Workday, Oracle, or a bespoke careers
 * site won't resolve here — those need a search and setCanonical.ts by hand.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface Posting {
  title: string;
  url: string;
  location?: string;
}

function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Board tokens worth trying for a company name, most likely first. */
function slugCandidates(company: string): string[] {
  // Strip the parenthetical we often carry for disambiguation
  // ("Employ (Jobvite/Lever/JazzHR)"), then the legal suffixes.
  const base = company.replace(/\([^)]*\)/g, ' ').trim();
  const stripped = base.replace(/\b(inc|llc|ltd|corp|co|company|group|holdings|labs|technologies|software|app)\b/gi, ' ');
  const out = new Set<string>();
  out.add(squash(stripped));
  out.add(squash(base));
  out.add(squash(stripped.split(/[\s,]+/).filter(Boolean)[0] ?? ''));
  out.add(squash(stripped).replace(/ai$/, ''));
  out.add(squash(stripped) + 'inc');
  return [...out].filter((s) => s.length >= 2 && s.length <= 40);
}

/**
 * Title match that tolerates how much boards and aggregators reword a title.
 * "Director, Web Product Management" and "Director - Web Product Management"
 * are the same job; so are "Senior Manager, Website" and "Sr. Manager,
 * Website". Compares significant words rather than the whole string.
 */
const NOISE = new Set([
  'a', 'an', 'the', 'of', 'and', 'for', 'to', 'at', 'in', 'on', 'remote', 'us', 'usa', 'hybrid',
  'sr', 'senior', 'jr', 'i', 'ii', 'iii',
]);

function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !NOISE.has(w))
  );
}

function titleScore(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared += 1;
  return shared / Math.max(ta.size, tb.size);
}

async function getJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function greenhouseBoard(slug: string): Promise<Posting[] | null> {
  const data = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`)) as {
    jobs?: { title: string; absolute_url: string; location?: { name?: string } }[];
  } | null;
  if (!data?.jobs?.length) return null;
  return data.jobs.map((j) => ({ title: j.title, url: j.absolute_url, location: j.location?.name }));
}

async function leverBoard(slug: string): Promise<Posting[] | null> {
  const data = (await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`)) as
    | { text: string; hostedUrl: string; categories?: { location?: string } }[]
    | null;
  if (!Array.isArray(data) || !data.length) return null;
  return data.map((j) => ({ title: j.text, url: j.hostedUrl, location: j.categories?.location }));
}

async function ashbyBoard(slug: string): Promise<Posting[] | null> {
  const data = (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)) as {
    jobs?: { title: string; jobUrl: string; location?: string }[];
  } | null;
  if (!data?.jobs?.length) return null;
  return data.jobs.map((j) => ({ title: j.title, url: j.jobUrl, location: j.location }));
}

async function findBoard(company: string): Promise<{ ats: string; slug: string; postings: Posting[] } | null> {
  for (const slug of slugCandidates(company)) {
    for (const [ats, fn] of [
      ['greenhouse', greenhouseBoard],
      ['lever', leverBoard],
      ['ashby', ashbyBoard],
    ] as const) {
      const postings = await fn(slug);
      if (postings) return { ats, slug, postings };
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const idsArg = args.includes('--ids') ? args[args.indexOf('--ids') + 1] : null;
  const threshold = args.includes('--threshold') ? Number(args[args.indexOf('--threshold') + 1]) : 0.6;

  const db = getDb();
  type Row = { id: number; company: string; title: string; url: string; status: string; canonical_url: string | null };
  let rows: Row[];
  if (idsArg) {
    const ids = idsArg.split(',').map((s) => Number(s.trim())).filter(Boolean);
    if (!ids.length) die({ error: 'no_ids' });
    rows = db
      .prepare(
        `SELECT id, company, title, url, status, canonical_url FROM jobs WHERE id IN (${ids.map(() => '?').join(',')})`
      )
      .all(...ids) as Row[];
  } else {
    rows = (
      db
        .prepare(
          `SELECT id, company, title, url, status, canonical_url FROM jobs
           WHERE canonical_url IS NULL AND status NOT IN ('archived','ignored','rejected','withdrawn')
           ORDER BY id`
        )
        .all() as Row[]
    ).filter((r) => isAggregatorUrl(r.url));
  }

  const results: Record<string, unknown>[] = [];
  // One company's board serves every one of its postings — fetch it once.
  const boardCache = new Map<string, Awaited<ReturnType<typeof findBoard>>>();

  for (const row of rows) {
    const key = squash(row.company);
    if (!boardCache.has(key)) boardCache.set(key, await findBoard(row.company));
    const board = boardCache.get(key);
    if (!board) {
      results.push({ id: row.id, company: row.company, title: row.title, outcome: 'no_board_found' });
      continue;
    }
    const ranked = board.postings
      .map((p) => ({ ...p, score: titleScore(row.title, p.title) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < threshold) {
      results.push({
        id: row.id,
        company: row.company,
        title: row.title,
        outcome: 'no_title_match',
        ats: board.ats,
        slug: board.slug,
        closest: best ? { title: best.title, score: Number(best.score.toFixed(2)) } : null,
        boardSize: board.postings.length,
        // Not necessarily evidence the posting is down: the slug guess may have
        // landed on a different company that happens to share a name. An Ashby
        // board of 8 postings under "flock" is not Flock Safety. Check the
        // board's size and its other titles before reading anything into this.
        note: 'title absent from the board this slug resolved to — confirm the board is actually this company before concluding the posting is down',
      });
      continue;
    }
    if (write) db.prepare('UPDATE jobs SET canonical_url = ? WHERE id = ?').run(best.url, row.id);
    results.push({
      id: row.id,
      company: row.company,
      title: row.title,
      outcome: write ? 'written' : 'matched',
      ats: board.ats,
      matchedTitle: best.title,
      confidence: Number(best.score.toFixed(2)),
      canonicalUrl: best.url,
    });
  }

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome as string] = (acc[r.outcome as string] ?? 0) + 1;
    return acc;
  }, {});
  out({ checked: results.length, write, summary, results });
}

main();
