import { getDb } from './db.ts';
import type { RawJob } from './upsertJob.ts';

/**
 * Career-page adapters for sources that aren't Greenhouse or Lever.
 *
 * Each adapter turns a curated board into RawJobs. Unlike the ATS APIs, these
 * boards are indexes: they give a title and a link, not a description. Where a
 * board exposes the underlying ATS link we follow it, both to get the real job
 * description and to confirm the posting is still live. Curated boards keep
 * serving listings for weeks after the employer pulls them down, which has
 * already produced one confident score for a job that closed months earlier.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36';

export interface CareerPageResult {
  jobs: RawJob[];
  /** Non-fatal notes (unhandled host, skipped stale entries, enrichment misses). */
  notes: string[];
}

async function getText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    process.stderr.write(`careerPage ${url}: HTTP ${res.status}\n`);
    return null;
  }
  return res.text();
}

function ldJsonBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(m[1]));
    } catch {
      // A malformed block on one posting shouldn't take down the whole run.
    }
  }
  return blocks;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function knownUrls(): Set<string> {
  const rows = getDb().prepare('SELECT url FROM jobs').all() as { url: string }[];
  return new Set(rows.map((r) => r.url));
}

/** Brand Engineering slugs end in the posting date, e.g. `...-2026-07-29`. */
function slugDate(url: string): Date | null {
  const m = url.match(/-(\d{4})-(\d{2})-(\d{2})\/?$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Result of chasing a curated listing back to the employer's own ATS.
 *
 * `dead` is the important one: the employer's board answered, and this job
 * wasn't on it. Curated boards keep serving listings after the employer pulls
 * them, so a confirmed absence is the cheapest staleness check available and
 * is worth more than the description we came for.
 */
type Enrichment =
  | { status: 'ok'; text: string }
  | { status: 'dead' }
  | { status: 'unknown' };

/** Greenhouse's `content` field is HTML-entity-encoded twice over. */
function decodeGreenhouse(content: string): string {
  const once = content
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  return stripTags(once);
}

async function enrichGreenhouse(token: string, jobId: string): Promise<Enrichment> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs/${jobId}?content=true`);
  if (res.ok) {
    const data = (await res.json()) as { content?: string };
    if (data.content) return { status: 'ok', text: decodeGreenhouse(data.content) };
    return { status: 'unknown' };
  }
  // Distinguish "this posting is gone" from "wrong board token". Only the
  // former is evidence the listing is stale.
  const board = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`);
  return board.ok ? { status: 'dead' } : { status: 'unknown' };
}

async function enrichAshby(org: string, jobId: string): Promise<Enrichment> {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${org}`);
  if (!res.ok) return { status: 'unknown' };
  const data = (await res.json()) as { jobs?: { id?: string; descriptionPlain?: string; descriptionHtml?: string }[] };
  const job = (data.jobs ?? []).find((j) => j.id === jobId);
  if (!job) return { status: 'dead' };
  const text = job.descriptionPlain ?? (job.descriptionHtml ? stripTags(job.descriptionHtml) : '');
  return text ? { status: 'ok', text } : { status: 'unknown' };
}

async function enrichLever(company: string, jobId: string): Promise<Enrichment> {
  const res = await fetch(`https://api.lever.co/v0/postings/${company}/${jobId}?mode=json`);
  if (res.ok) {
    const data = (await res.json()) as { descriptionPlain?: string };
    if (data.descriptionPlain) return { status: 'ok', text: data.descriptionPlain };
    return { status: 'unknown' };
  }
  const board = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`);
  return board.ok ? { status: 'dead' } : { status: 'unknown' };
}

/**
 * Pull the real description from the employer's own ATS. Brand Engineering's
 * JobPosting markup carries only a one-line summary, but its apply link points
 * at the underlying board, so the full text is one request away.
 */
async function enrichFromAts(applyUrl: string): Promise<Enrichment> {
  const ghPath = applyUrl.match(/(?:job-boards|boards)\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/);
  if (ghPath) return enrichGreenhouse(ghPath[1], ghPath[2]);

  // Companies that embed Greenhouse on their own careers domain expose the job
  // id as `gh_jid` but never name the board. The board token is conventionally
  // the bare company name, which the hostname gives us
  // (careers.airbnb.com → airbnb).
  const ghEmbed = applyUrl.match(/[?&]gh_jid=(\d+)/);
  if (ghEmbed) {
    const host = new URL(applyUrl).hostname.replace(/^(www|careers|jobs|boards)\./, '');
    const token = host.split('.')[0];
    if (token) return enrichGreenhouse(token, ghEmbed[1]);
  }

  const ashby = applyUrl.match(/jobs\.ashbyhq\.com\/([^/]+)\/([0-9a-f-]+)/i);
  if (ashby) return enrichAshby(ashby[1], ashby[2]);

  const lever = applyUrl.match(/jobs\.lever\.co\/([^/]+)\/([0-9a-f-]+)/i);
  if (lever) return enrichLever(lever[1], lever[2]);

  return { status: 'unknown' };
}

interface DetailPage {
  title: string;
  company: string;
  location?: string;
  summary: string;
  applyUrl?: string;
  postedAt?: string;
}

function parseDetail(html: string): DetailPage | null {
  const posting = ldJsonBlocks(html).find(
    (b): b is Record<string, any> =>
      typeof b === 'object' && b !== null && (b as Record<string, unknown>)['@type'] === 'JobPosting'
  );
  if (!posting) return null;

  const applyUrl = html.match(
    /https?:\/\/(?:job-boards\.greenhouse\.io|boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|[a-z0-9.-]*\.myworkdayjobs\.com|careers\.[a-z0-9.-]+)\/[^"'\\ <]*/i
  )?.[0];

  const remote = posting.jobLocationType === 'TELECOMMUTE';
  const rawLoc = posting.jobLocation?.address?.addressLocality as string | undefined;

  return {
    title: String(posting.title ?? '').trim(),
    company: String(posting.hiringOrganization?.name ?? '').trim(),
    location: rawLoc ?? (remote ? 'Remote' : undefined),
    summary: stripTags(String(posting.description ?? '')),
    applyUrl,
    postedAt: posting.datePosted ? String(posting.datePosted) : undefined,
  };
}

/**
 * brandengineering.ai — a curated board for marketing/GTM/brand engineering.
 * The index page ships all listings as a schema.org ItemList in the static
 * HTML, so no browser is needed.
 *
 * `maxAgeDays` keeps the first run from dumping the entire back catalogue into
 * the scoring queue. It filters on the posting date in the slug, never on
 * title keywords: substring matching on titles has already caused a real miss
 * here ("Manager, Engineering" skipped by a filter looking for "engineering
 * manager").
 */
async function fetchBrandEngineering(url: string, maxAgeDays: number): Promise<CareerPageResult> {
  const notes: string[] = [];
  const html = await getText(url);
  if (!html) return { jobs: [], notes: [`brandengineering: index fetch failed`] };

  const list = ldJsonBlocks(html).find(
    (b): b is Record<string, any> =>
      typeof b === 'object' && b !== null && (b as Record<string, unknown>)['@type'] === 'ItemList'
  );
  if (!list) return { jobs: [], notes: ['brandengineering: no ItemList markup found (page layout changed?)'] };

  const items = (list.itemListElement ?? []) as { name?: string; url?: string }[];
  const seen = knownUrls();
  const cutoff = Date.now() - maxAgeDays * 86_400_000;

  const candidates = items.filter((it) => {
    if (!it.url || seen.has(it.url)) return false;
    const d = slugDate(it.url);
    return d ? d.getTime() >= cutoff : true;
  });

  const skippedOld = items.length - candidates.length - items.filter((it) => it.url && seen.has(it.url)).length;
  if (skippedOld > 0) notes.push(`brandengineering: skipped ${skippedOld} postings older than ${maxAgeDays}d`);

  const jobs: RawJob[] = [];
  for (const item of candidates) {
    const detailHtml = await getText(item.url!);
    if (!detailHtml) continue;
    const detail = parseDetail(detailHtml);
    if (!detail) {
      notes.push(`brandengineering: no JobPosting markup at ${item.url}`);
      continue;
    }

    let description = detail.summary;
    if (detail.applyUrl) {
      const enriched = await enrichFromAts(detail.applyUrl);
      if (enriched.status === 'ok') {
        description = enriched.text;
      } else if (enriched.status === 'dead') {
        // The employer's own board says this is gone. Don't catalogue it: a
        // stale listing scored as a strong fit wastes more time than a miss.
        notes.push(`brandengineering: SKIPPED ${detail.title} (${detail.company}) — no longer on the employer's board`);
        continue;
      } else {
        notes.push(`brandengineering: thin description for ${detail.title} (${detail.company}) — could not reach its ATS`);
      }
    }

    jobs.push({
      source: 'brandengineering',
      company: detail.company || 'Unknown',
      title: detail.title,
      location: detail.location,
      // Prefer the employer's own posting so the catalogue links somewhere
      // that stays authoritative if the curated board goes stale.
      url: detail.applyUrl ?? item.url!,
      descriptionText: description,
      sourceId: item.url!,
      rawPayload: { indexEntry: item, detail },
    });
  }

  return { jobs, notes };
}

/**
 * Dispatch a configured career page to its adapter. Unhandled hosts return a
 * note rather than nothing, so a source that silently never runs can't sit in
 * config looking configured.
 */
export async function fetchCareerPage(
  entry: { company: string; url: string },
  maxAgeDays = 30
): Promise<CareerPageResult> {
  const host = new URL(entry.url).hostname.replace(/^www\./, '');

  if (host === 'brandengineering.ai') return fetchBrandEngineering(entry.url, maxAgeDays);

  if (host === 'builtinchicago.org' || host === 'builtin.com') {
    return {
      jobs: [],
      notes: [
        `${entry.company}: Built In renders its listings client-side and its API is private, so it can't be ingested by this script. Run the Playwright discovery path in conversation instead.`,
      ],
    };
  }

  return { jobs: [], notes: [`${entry.company}: no adapter for ${host} — nothing was fetched`] };
}
