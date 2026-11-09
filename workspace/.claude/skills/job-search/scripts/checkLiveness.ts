import { getDb, out, die, nowIso } from './db.ts';

/**
 * Check whether catalogued postings still exist, so dead listings can be
 * archived instead of sitting in the open pipeline forever.
 *
 * Postings disappear constantly — a 2026-09-09 discovery run found twelve of
 * fourteen search-sourced candidates already dead — and nothing in the catalog
 * noticed until someone tried to apply. This walks the open jobs and reports a
 * verdict per row. It never writes: archiving is the person's call, made with
 * updateStatus.ts.
 *
 * Verdicts:
 *   live     — the posting is still there
 *   dead     — 404/410, gone from its ATS board, or redirected to a board index
 *   removed  — page loads but says the posting is closed/filled
 *   blocked  — bot protection or a login wall; tells us nothing either way
 *   error    — network failure
 *
 * Where a company is on a known ATS we ask that ATS's API rather than fetching
 * the page, because a JS-rendered SPA returns HTTP 200 for a posting that no
 * longer exists.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

type Verdict = 'live' | 'dead' | 'removed' | 'blocked' | 'error';

interface Result {
  id: number;
  company: string;
  title: string;
  status: string;
  url: string;
  verdict: Verdict;
  detail: string;
  finalUrl?: string;
  canonicalUrl?: string;
}

// Phrases an ATS puts on a posting it has taken down. Checked against the
// page text, not the raw HTML, so script tags can't produce a false positive.
const REMOVAL_PHRASES = [
  'no longer accepting applications',
  'no longer available',
  'no longer accepting',
  'this position has been filled',
  'position is no longer',
  'posting is no longer',
  'job is no longer',
  'this job has been closed',
  'this posting has closed',
  'has been closed',
  'we are no longer accepting',
  'job not found',
  'position not found',
  'this job is no longer posted',
  'sorry, this job is no longer',
  'the job you are looking for',
  'oops! we could not find',
];

function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

async function get(url: string, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// --- ATS-specific checks -----------------------------------------------------

async function checkGreenhouse(slug: string, jobId: string): Promise<Partial<Result>> {
  const res = await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`);
  if (res.status === 404) return { verdict: 'dead', detail: 'greenhouse: job id 404 on live board' };
  if (!res.ok) return { verdict: 'blocked', detail: `greenhouse api ${res.status}` };
  const data = (await res.json()) as { absolute_url?: string; title?: string };
  return { verdict: 'live', detail: `greenhouse: ${data.title ?? 'posting present'}`, canonicalUrl: data.absolute_url };
}

async function checkLever(slug: string, postingId: string): Promise<Partial<Result>> {
  const res = await get(`https://api.lever.co/v0/postings/${slug}/${postingId}`);
  if (res.status === 404) return { verdict: 'dead', detail: 'lever: posting id 404 on live board' };
  if (!res.ok) return { verdict: 'blocked', detail: `lever api ${res.status}` };
  const data = (await res.json()) as { text?: string; hostedUrl?: string };
  return { verdict: 'live', detail: `lever: ${data.text ?? 'posting present'}`, canonicalUrl: data.hostedUrl };
}

async function checkAshby(slug: string, postingId: string): Promise<Partial<Result>> {
  const res = await get(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  if (res.status === 404) return { verdict: 'dead', detail: 'ashby: board itself 404s' };
  if (!res.ok) return { verdict: 'blocked', detail: `ashby api ${res.status}` };
  const data = (await res.json()) as { jobs?: { id?: string; title?: string; jobUrl?: string }[] };
  const hit = (data.jobs ?? []).find((j) => j.id === postingId);
  if (!hit) return { verdict: 'dead', detail: `ashby: id absent from board (${(data.jobs ?? []).length} live postings)` };
  return { verdict: 'live', detail: `ashby: ${hit.title}`, canonicalUrl: hit.jobUrl };
}

async function checkLinkedIn(jobId: string): Promise<Partial<Result>> {
  const res = await get(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`);
  if (res.status === 404 || res.status === 410) return { verdict: 'dead', detail: 'linkedin: guest posting 404' };
  if (res.status === 429 || res.status === 403 || res.status === 999) {
    return { verdict: 'blocked', detail: `linkedin: rate-limited/blocked (${res.status})` };
  }
  if (!res.ok) return { verdict: 'blocked', detail: `linkedin: ${res.status}` };
  const text = textOf(await res.text());
  if (!text.trim()) return { verdict: 'dead', detail: 'linkedin: empty posting body' };
  const phrase = REMOVAL_PHRASES.find((p) => text.includes(p));
  if (phrase) return { verdict: 'removed', detail: `linkedin: "${phrase}"` };
  return { verdict: 'live', detail: 'linkedin: guest posting still served' };
}

async function checkWorkday(url: URL): Promise<Partial<Result>> {
  // Two public shapes, both backed by the same CXS endpoint:
  //   /<site>/job/<location>/<slug>_<reqId>
  //   /<locale>/<site>/details/<slug>_<reqId>
  // The rendered page is a JS shell that answers 200 for a posting that is
  // long gone, so the CXS JSON is the only honest signal here.
  const parts = url.pathname.split('/').filter(Boolean);
  const anchor = parts.findIndex((p) => p === 'job' || p === 'details');
  if (anchor < 1) return {};
  const site = parts[anchor - 1];
  const rest = parts.slice(anchor + 1).join('/');
  const cxs = `${url.origin}/wday/cxs/${url.hostname.split('.')[0]}/${site}/job/${rest}`;
  const res = await get(cxs);
  if (res.status === 404) return { verdict: 'dead', detail: 'workday: CXS job 404' };
  if (!res.ok) return {};
  const data = (await res.json()) as { jobPostingInfo?: { title?: string; externalUrl?: string } };
  if (!data.jobPostingInfo) return { verdict: 'dead', detail: 'workday: CXS returned no posting' };
  return {
    verdict: 'live',
    detail: `workday: ${data.jobPostingInfo.title ?? 'posting present'}`,
    canonicalUrl: data.jobPostingInfo.externalUrl,
  };
}

// A redirect that lands on a board index rather than a posting means the
// posting is gone and the ATS quietly bounced us to the listing page.
function looksLikeBoardIndex(final: URL, original: URL): boolean {
  if (final.hostname !== original.hostname) return false;
  const origDepth = original.pathname.split('/').filter(Boolean).length;
  const finalDepth = final.pathname.split('/').filter(Boolean).length;
  if (finalDepth >= origDepth) return false;
  return /^\/(jobs?|careers?|openings|search|positions|en-us|us\/en)?\/?$/i.test(final.pathname);
}

async function checkGeneric(url: URL): Promise<Partial<Result>> {
  let res: Response;
  try {
    res = await get(url.toString());
  } catch (err) {
    return { verdict: 'error', detail: String((err as Error).message ?? err) };
  }
  const finalUrl = res.url || url.toString();
  if (res.status === 404 || res.status === 410) {
    return { verdict: 'dead', detail: `http ${res.status}`, finalUrl };
  }
  if (res.status === 403 || res.status === 429 || res.status >= 500) {
    return { verdict: 'blocked', detail: `http ${res.status}`, finalUrl };
  }
  let final: URL;
  try {
    final = new URL(finalUrl);
  } catch {
    final = url;
  }
  if (looksLikeBoardIndex(final, url)) {
    return { verdict: 'dead', detail: 'redirected to board index', finalUrl };
  }
  const text = textOf(await res.text());
  const phrase = REMOVAL_PHRASES.find((p) => text.includes(p));
  if (phrase) return { verdict: 'removed', detail: `page says "${phrase}"`, finalUrl };
  if (text.length < 400) return { verdict: 'blocked', detail: 'page rendered no readable text (SPA or wall)', finalUrl };
  return { verdict: 'live', detail: 'page still serves the posting', finalUrl };
}

/**
 * Plenty of "custom" career sites are a Greenhouse board in a wrapper, and
 * give themselves away with a gh_jid query parameter (Duolingo, Lyft via
 * CareerPuck, Fivetran, Okta). The page itself is a JS shell that returns 200
 * forever, but the board behind it answers honestly — we just have to guess
 * the board token, which is nearly always the company name squashed down.
 */
function greenhouseSlugCandidates(company: string, url: URL): string[] {
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const candidates = new Set<string>();
  candidates.add(squash(company));
  candidates.add(squash(company.replace(/\b(inc|llc|ltd|corp|co|company|software|technologies|labs)\b/gi, '')));
  candidates.add(squash(company.split(/[\s,]/)[0]));
  candidates.add(squash(url.hostname.replace(/^(www|careers|jobs|boards|apply)\./, '').split('.')[0]));
  for (const part of url.pathname.split('/').filter(Boolean)) {
    if (/^[a-z0-9-]{2,30}$/i.test(part) && !/^\d+$/.test(part)) candidates.add(squash(part));
  }
  return [...candidates].filter((c) => c.length >= 2);
}

async function checkEmbeddedGreenhouse(company: string, url: URL, jobId: string): Promise<Partial<Result>> {
  for (const slug of greenhouseSlugCandidates(company, url)) {
    const res = await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`);
    if (res.status === 404) {
      // Confirm the board itself exists before calling the posting dead —
      // a wrong slug guess also 404s and would look identical.
      const board = await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`);
      if (board.ok) return { verdict: 'dead', detail: `greenhouse(${slug}): job id 404 on live board` };
      continue;
    }
    if (res.ok) {
      const data = (await res.json()) as { absolute_url?: string; title?: string };
      return {
        verdict: 'live',
        detail: `greenhouse(${slug}): ${data.title ?? 'posting present'}`,
        canonicalUrl: data.absolute_url,
      };
    }
  }
  return {};
}

async function checkOne(job: { id: number; company: string; title: string; status: string; url: string }): Promise<Result> {
  const base: Result = { ...job, verdict: 'error', detail: 'unchecked' };
  let url: URL;
  try {
    url = new URL(job.url);
  } catch {
    return { ...base, verdict: 'error', detail: 'unparseable url' };
  }
  const host = url.hostname.replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
      const idx = parts.indexOf('jobs');
      if (idx > 0) return { ...base, ...(await checkGreenhouse(parts[0], parts[idx + 1])) } as Result;
    }
    if (host === 'jobs.lever.co' && parts.length >= 2) {
      return { ...base, ...(await checkLever(parts[0], parts[1])) } as Result;
    }
    if (host === 'jobs.ashbyhq.com' && parts.length >= 2) {
      return { ...base, ...(await checkAshby(parts[0], parts[1])) } as Result;
    }
    if (host === 'linkedin.com') {
      const m = url.pathname.match(/(\d{8,})/) ?? url.searchParams.get('currentJobId')?.match(/(\d+)/);
      if (m) return { ...base, ...(await checkLinkedIn(m[1])) } as Result;
    }
    if (/\.myworkdayjobs\.com$/.test(host)) {
      const wd = await checkWorkday(url);
      if (wd.verdict) return { ...base, ...wd } as Result;
    }
    const ghJid = url.searchParams.get('gh_jid');
    if (ghJid) {
      const embedded = await checkEmbeddedGreenhouse(job.company, url, ghJid);
      if (embedded.verdict) return { ...base, ...embedded } as Result;
    }
    return { ...base, ...(await checkGeneric(url)) } as Result;
  } catch (err) {
    return { ...base, verdict: 'error', detail: String((err as Error).message ?? err) };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const statusArg = args.includes('--status') ? args[args.indexOf('--status') + 1] : 'new,scored,interested';
  const limitArg = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 500;
  const idsArg = args.includes('--ids') ? args[args.indexOf('--ids') + 1] : null;
  const concurrency = args.includes('--concurrency') ? Number(args[args.indexOf('--concurrency') + 1]) : 6;

  const db = getDb();
  type Row = { id: number; company: string; title: string; status: string; url: string; canonical_url: string | null };
  let rows: Row[];
  if (idsArg) {
    const ids = idsArg.split(',').map((s) => Number(s.trim())).filter(Boolean);
    if (!ids.length) die({ error: 'no_ids' });
    rows = db
      .prepare(
        `SELECT id, company, title, status, url, canonical_url FROM jobs WHERE id IN (${ids.map(() => '?').join(',')})`
      )
      .all(...ids) as Row[];
  } else {
    const statuses = statusArg.split(',').map((s) => s.trim());
    rows = db
      .prepare(
        `SELECT id, company, title, status, url, canonical_url FROM jobs
         WHERE status IN (${statuses.map(() => '?').join(',')})
         ORDER BY id LIMIT ?`
      )
      .all(...statuses, limitArg) as Row[];
  }

  // Ask the employer's own posting when we have it. An aggregator dropping a
  // listing says nothing about whether the job is still open.
  const jobs = rows.map((r) => ({ ...r, url: r.canonical_url ?? r.url }));

  const results: Result[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      results.push(await checkOne(job));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  results.sort((a, b) => a.id - b.id);

  const stamp = nowIso();
  const record = db.prepare('UPDATE jobs SET liveness = ?, liveness_checked_at = ? WHERE id = ?');
  const backfill = db.prepare('UPDATE jobs SET canonical_url = ? WHERE id = ? AND canonical_url IS NULL');
  for (const r of results) {
    record.run(r.verdict, stamp, r.id);
    // The ATS APIs hand back the employer's own posting URL for free.
    if (r.canonicalUrl) backfill.run(r.canonicalUrl, r.id);
  }

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
    return acc;
  }, {});
  out({ checked: results.length, summary, results });
}

main();
