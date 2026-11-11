/**
 * Job systems common outside tech, where big employers in logistics,
 * manufacturing, retail and healthcare post: SAP SuccessFactors career sites
 * (jobs.<company>.com with /search/ and /job/ pages) and Phenom career sites
 * (/<country>/<lang>/search-results and /job/<id>).
 *
 * Neither has a public API, but both serve their listings in the page itself.
 * Search with each of the person's target titles, keep in-band titles, then
 * read each posting's full text, the same way the Workday adapter works.
 *
 * Also: detectBoard(url) works out which job system a careers page runs on.
 */
import type { RawJob } from './upsertJob.ts';
import { isInBandTitle } from './titleFilter.ts';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const pause = () => new Promise((r) => setTimeout(r, 300));

export interface Listing {
  title: string;
  location?: string;
  date?: string;
  url: string;
}

async function getPage(url: string): Promise<{ html: string; finalUrl: string }> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return { html: await res.text(), finalUrl: res.url };
}

const decode = (s = '') =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

export const htmlToText = (html = '') =>
  decode(
    html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

// --- SuccessFactors -----------------------------------------------------------

/** One page of search results is 25 rows; `pages` caps how far to read. */
export async function searchSuccessFactors(siteUrl: string, query: string, pages = 2): Promise<Listing[]> {
  const origin = new URL(siteUrl).origin;
  const found: Listing[] = [];
  for (let page = 0; page < pages; page++) {
    const { html } = await getPage(`${origin}/search/?q=${encodeURIComponent(query)}&startrow=${page * 25}`);
    const rows = html.split(/<tr class="data-row/).slice(1);
    for (const row of rows) {
      const link = row.match(/<a[^>]*href="([^"]+)"[^>]*class="jobTitle-link"[^>]*>([^<]+)<\/a>/) ?? row.match(/class="jobTitle-link"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/);
      if (!link) continue;
      found.push({
        title: decode(link[2]).trim(),
        url: new URL(decode(link[1]), origin).href,
        location: decode(row.match(/<span class="jobLocation">\s*([^<]+?)\s*<\/span>/)?.[1] ?? '').trim() || undefined,
        date: row.match(/<span class="jobDate[^"]*">\s*([^<]+?)\s*<\/span>/)?.[1],
      });
    }
    const total = Number(html.match(/Results\s*<b>[^<]*<\/b>\s*of\s*<b>(\d+)<\/b>/)?.[1] ?? 0);
    if (rows.length < 25 || (page + 1) * 25 >= total) break;
    await pause();
  }
  return found;
}

export async function successFactorsDetail(url: string) {
  const { html } = await getPage(url);
  const body =
    html.match(/class="jobdescription">([\s\S]*?)<\/span>\s*<\/span>\s*<\/div>/)?.[1] ??
    html.match(/class="jobdescription">([\s\S]*?)<\/span>\s*<\/span>/)?.[1] ??
    '';
  const meta = (prop: string) => html.match(new RegExp(`itemprop="${prop}" content="([^"]*)"`))?.[1];
  const title = html.match(/itemprop="title"[^>]*>\s*([^<]+?)\s*</)?.[1];
  const posted = meta('datePosted');
  return {
    title: title ? decode(title) : undefined,
    company: meta('hiringOrganization'),
    location: [meta('addressLocality'), meta('addressRegion')].filter(Boolean).join(', ') || undefined,
    descriptionText: htmlToText(body),
    datePosted: posted && !Number.isNaN(Date.parse(posted)) ? new Date(posted).toISOString().slice(0, 10) : posted,
  };
}

export async function fetchSuccessFactors(site: { company: string; url: string }, queries: string[]): Promise<RawJob[]> {
  const seen = new Map<string, Listing>();
  for (const q of queries) {
    for (const l of await searchSuccessFactors(site.url, q)) if (isInBandTitle(l.title)) seen.set(l.url, l);
    await pause();
  }
  const jobs: RawJob[] = [];
  for (const l of seen.values()) {
    try {
      const d = await successFactorsDetail(l.url);
      jobs.push({
        source: 'successfactors',
        company: site.company,
        title: l.title,
        location: l.location ?? d.location,
        url: l.url,
        descriptionText: d.descriptionText,
        sourceId: l.url.match(/\/(\d+)\/?(?:\?|$)/)?.[1] ?? l.url,
        rawPayload: { ...l, datePosted: d.datePosted },
      });
    } catch {
      // one posting failing shouldn't lose the rest
    }
    await pause();
  }
  return jobs;
}

// --- Phenom -------------------------------------------------------------------

/** Phenom pages carry their data in `phApp.ddo = {...};`. */
function phenomData(html: string): Record<string, any> | null {
  const m = html.match(/phApp\.ddo\s*=\s*(\{[\s\S]*?\});\s*phApp\./);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** The site's locale root, e.g. https://www.jobs-ups.com/us/en, found by following the home page. */
async function phenomBase(siteUrl: string): Promise<string> {
  const u = new URL(siteUrl);
  if (/^\/[a-z]{2,}\/[a-z]{2}(\/|$)/.test(u.pathname)) return `${u.origin}${u.pathname.match(/^\/[a-z]{2,}\/[a-z]{2}/)![0]}`;
  const { finalUrl } = await getPage(u.origin);
  const f = new URL(finalUrl);
  const root = f.pathname.match(/^\/[a-z]{2,}\/[a-z]{2}/)?.[0];
  if (!root) throw new Error(`couldn't find the Phenom locale path on ${f.hostname}; use a URL like https://${f.hostname}/us/en`);
  return `${f.origin}${root}`;
}

/** Ten results per page; `pages` caps how far to read. */
export async function searchPhenom(siteUrl: string, query: string, pages = 3): Promise<Listing[]> {
  const base = await phenomBase(siteUrl);
  const found: Listing[] = [];
  for (let page = 0; page < pages; page++) {
    const { html } = await getPage(`${base}/search-results?keywords=${encodeURIComponent(query)}&from=${page * 10}&s=1`);
    const search = phenomData(html)?.eagerLoadRefineSearch;
    const list: any[] = search?.data?.jobs ?? [];
    for (const j of list) {
      if (!j.jobId || !j.title) continue;
      found.push({
        title: j.title,
        url: `${base}/job/${j.jobId}`,
        location: j.cityStateCountry ?? j.location,
        date: j.postedDate?.slice(0, 10),
      });
    }
    if (list.length < 10 || (page + 1) * 10 >= (search?.totalHits ?? 0)) break;
    await pause();
  }
  return found;
}

export async function phenomDetail(url: string) {
  const { html } = await getPage(url);
  const job = phenomData(html)?.jobDetail?.data?.job ?? {};
  return {
    title: job.title as string | undefined,
    company: (job.companyName ?? job.company) as string | undefined,
    location: (job.cityStateCountry ?? job.location) as string | undefined,
    descriptionText: htmlToText(job.description ?? ''),
    datePosted: (job.postedDate as string | undefined)?.slice(0, 10),
  };
}

export async function fetchPhenom(site: { company: string; url: string }, queries: string[]): Promise<RawJob[]> {
  const seen = new Map<string, Listing>();
  for (const q of queries) {
    for (const l of await searchPhenom(site.url, q)) if (isInBandTitle(l.title)) seen.set(l.url, l);
    await pause();
  }
  const jobs: RawJob[] = [];
  for (const l of seen.values()) {
    try {
      const d = await phenomDetail(l.url);
      jobs.push({
        source: 'phenom',
        company: site.company,
        title: l.title,
        location: l.location ?? d.location,
        url: l.url,
        descriptionText: d.descriptionText,
        sourceId: l.url.split('/job/')[1],
        rawPayload: { ...l, datePosted: d.datePosted },
      });
    } catch {
      // one posting failing shouldn't lose the rest
    }
    await pause();
  }
  return jobs;
}

// --- iCIMS --------------------------------------------------------------------

/** "US-TX-Houston | US-IL-Chicago" → "Houston, TX, US | Chicago, IL, US"; anything else is left as it is. */
const icimsPlace = (s: string) =>
  s
    .split('|')
    .map((one) => {
      const p = one.trim().split('-');
      return p.length >= 3 && /^[A-Z]{2}$/.test(p[0]) ? `${p.slice(2).join('-')}, ${p[1]}, ${p[0]}` : one.trim();
    })
    .join(' | ');

/** Pages are 0-based (`pr`) and hold up to 50 jobs; `pages` caps how far to read. */
export async function searchIcims(siteUrl: string, query: string, pages = 2): Promise<Listing[]> {
  // careers-x.icims.com often redirects (careersen-x, uscareers-x); follow it once.
  const first = await getPage(`${new URL(siteUrl).origin}/jobs/search?ss=1&searchKeyword=${encodeURIComponent(query)}&pr=0&in_iframe=1`);
  const origin = new URL(first.finalUrl).origin;
  const found: Listing[] = [];
  let html = first.html;
  for (let page = 0; page < pages; page++) {
    if (page > 0) html = (await getPage(`${origin}/jobs/search?ss=1&searchKeyword=${encodeURIComponent(query)}&pr=${page}&in_iframe=1`)).html;
    const cards = html.split(/class="iCIMS_JobCardItem|class="iCIMS_JobListingRow/).slice(1);
    for (const card of cards) {
      const a = card.match(/<a href="([^"]*\/jobs\/\d+\/[^"]*)"[^>]*class="iCIMS_Anchor"[^>]*title="\d+ - ([^"]+)"/);
      if (!a) continue;
      const place = card.match(/Job Locations<\/span>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>/)?.[1];
      const link = new URL(decode(a[1]));
      link.searchParams.delete('in_iframe');
      found.push({ title: decode(a[2]).trim(), url: link.href, location: place ? icimsPlace(decode(place)) : undefined });
    }
    const [, at, of] = html.match(/Page (\d+) of (\d+)/) ?? [];
    if (!cards.length || !of || Number(at) >= Number(of)) break;
    await pause();
  }
  return found;
}

export async function icimsDetail(url: string) {
  const u = new URL(url);
  u.searchParams.set('in_iframe', '1');
  const { html } = await getPage(u.href);
  let posting: any = {};
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]);
      const found = [j, ...(j['@graph'] ?? [])].find((x: any) => x?.['@type'] === 'JobPosting');
      if (found) posting = found;
    } catch {
      // not every block is valid JSON
    }
  }
  const body = posting.description ?? html.match(/class="iCIMS_JobContent[^"]*"[^>]*>([\s\S]*?)<div class="iCIMS_Footer/)?.[1] ?? '';
  const addr = [].concat(posting.jobLocation ?? [])[0] as any;
  return {
    title: posting.title as string | undefined,
    company: posting.hiringOrganization?.name as string | undefined,
    location: [addr?.address?.addressLocality, addr?.address?.addressRegion].filter(Boolean).join(', ') || undefined,
    descriptionText: htmlToText(decode(body)),
    datePosted: (posting.datePosted as string | undefined)?.slice(0, 10),
  };
}

export async function fetchIcims(site: { company: string; url: string }, queries: string[]): Promise<RawJob[]> {
  const seen = new Map<string, Listing>();
  for (const q of queries) {
    for (const l of await searchIcims(site.url, q)) if (isInBandTitle(l.title)) seen.set(l.url, l);
    await pause();
  }
  const jobs: RawJob[] = [];
  for (const l of seen.values()) {
    try {
      const d = await icimsDetail(l.url);
      jobs.push({
        source: 'icims',
        company: site.company,
        title: l.title,
        location: l.location ?? d.location,
        url: l.url,
        descriptionText: d.descriptionText,
        sourceId: l.url.match(/\/jobs\/(\d+)\//)?.[1] ?? l.url,
        rawPayload: { ...l, datePosted: d.datePosted },
      });
    } catch {
      // one posting failing shouldn't lose the rest
    }
    await pause();
  }
  return jobs;
}

// --- Which system is this? ---------------------------------------------------

export interface Detected {
  ats: 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'successfactors' | 'phenom' | 'icims' | 'unknown';
  /** What to put in sources.json: a slug for greenhouse/lever/ashby, a URL otherwise. */
  entry?: string;
  finalUrl: string;
  hint?: string;
}

/** Fetch a careers page and work out which job system it runs on, following links one step. */
export async function detectBoard(url: string): Promise<Detected> {
  const { html, finalUrl } = await getPage(url);
  const page = decode(html);
  const gh = page.match(/(?:boards|job-boards)(?:-api)?\.greenhouse\.io\/(?:embed\/job_board\?for=|v1\/boards\/)?([a-z0-9_-]+)/i);
  if (gh && gh[1] !== 'embed') return { ats: 'greenhouse', entry: gh[1], finalUrl };
  const lv = page.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);
  if (lv) return { ats: 'lever', entry: lv[1], finalUrl };
  const ab = page.match(/jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/i);
  if (ab) return { ats: 'ashby', entry: ab[1], finalUrl };
  const wk = page.match(/apply\.workable\.com\/([a-z0-9_-]+)/i);
  if (wk && wk[1] !== 'api') return { ats: 'workable', entry: wk[1], finalUrl };
  const wd = page.match(/https:\/\/[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?[A-Za-z0-9_-]+/);
  if (wd) return { ats: 'workday', entry: wd[0], finalUrl };
  if (/phApp\.ddo|cdn\.phenompeople\.com/.test(html)) {
    try {
      return { ats: 'phenom', entry: await phenomBase(finalUrl), finalUrl };
    } catch (e) {
      return { ats: 'phenom', finalUrl, hint: String(e) };
    }
  }
  if (/rmkcdn|successfactors|career_ns/i.test(html)) return { ats: 'successfactors', entry: new URL(finalUrl).origin, finalUrl };
  // A company can have several iCIMS portals (internal ones need a sign-in);
  // keep the first that lists jobs to the public.
  const portals = [...new Set([...page.matchAll(/https:\/\/[a-z0-9-]+\.icims\.com/gi)].map((m) => m[0].toLowerCase()))];
  for (const p of portals) {
    try {
      const r = await getPage(`${p}/jobs/search?ss=1&in_iframe=1`);
      if (!/\/jobs\/login/.test(r.finalUrl) && /iCIMS_JobsTable/.test(r.html)) return { ats: 'icims', entry: new URL(r.finalUrl).origin, finalUrl };
    } catch {
      // try the next one
    }
  }
  if (portals.length) return { ats: 'icims', finalUrl, hint: `Found iCIMS portals (${portals.join(', ')}) but none lists jobs publicly. Use careerPages.` };
  return { ats: 'unknown', finalUrl, hint: 'Look for a "search jobs" link on the page and run detect on that URL.' };
}
