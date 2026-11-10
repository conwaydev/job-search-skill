import { readFileSync } from 'node:fs';
import path from 'node:path';
import { out, die } from './db.ts';
import { upsertJob } from './upsertJob.ts';
import type { RawJob } from './upsertJob.ts';
import { fetchCareerPage } from './careerPages.ts';
import { fetchSuccessFactors, fetchPhenom, fetchIcims } from './moreBoards.ts';
import { isInBandTitle } from './titleFilter.ts';
import { profileFiles } from './paths.ts';
import { hasProfile, searchQueries, isInScopeLocation } from './profile.ts';

const sourcesPath = profileFiles.sources;

interface Sources {
  greenhouse?: string[];
  lever?: string[];
  ashby?: string[];
  /** Workday career sites, e.g. { company: "Target", url: "https://target.wd5.myworkdayjobs.com/targetcareers" }. */
  workday?: { company: string; url: string }[];
  /** SAP SuccessFactors career sites, e.g. { company: "XPO", url: "https://jobs.xpo.com" }. */
  successfactors?: { company: string; url: string }[];
  /** Phenom career sites, with the locale path, e.g. { company: "UPS", url: "https://www.jobs-ups.com/us/en" }. */
  phenom?: { company: string; url: string }[];
  /** iCIMS career portals, e.g. { company: "PepsiCo", url: "https://uscareers-pepsico.icims.com" }. */
  icims?: { company: string; url: string }[];
  careerPages?: { company: string; url: string }[];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripHtml(html: string): string {
  // Greenhouse's `content` field comes back HTML-entity-encoded even
  // though it's markup, so tags must be decoded before they can be stripped.
  const decoded = decodeEntities(html);
  return decoded
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchGreenhouse(boardToken: string): Promise<RawJob[]> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`);
  if (!res.ok) {
    process.stderr.write(`greenhouse ${boardToken}: HTTP ${res.status}\n`);
    return [];
  }
  const data = (await res.json()) as {
    jobs: { id: number; title: string; absolute_url: string; content: string; location?: { name?: string } }[];
  };
  return data.jobs.map((j) => ({
    source: 'greenhouse',
    company: boardToken,
    title: j.title,
    location: j.location?.name,
    url: j.absolute_url,
    descriptionText: stripHtml(j.content ?? ''),
    sourceId: String(j.id),
    rawPayload: j,
  }));
}

async function fetchLever(company: string): Promise<RawJob[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`);
  if (!res.ok) {
    process.stderr.write(`lever ${company}: HTTP ${res.status}\n`);
    return [];
  }
  const data = (await res.json()) as {
    id: string;
    text: string;
    hostedUrl: string;
    descriptionPlain?: string;
    categories?: { location?: string };
  }[];
  return data.map((j) => ({
    source: 'lever',
    company,
    title: j.text,
    location: j.categories?.location,
    url: j.hostedUrl,
    descriptionText: j.descriptionPlain ?? '',
    sourceId: j.id,
    rawPayload: j,
  }));
}

async function fetchAshby(board: string): Promise<RawJob[]> {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`);
  if (!res.ok) {
    process.stderr.write(`ashby ${board}: HTTP ${res.status}\n`);
    return [];
  }
  const data = (await res.json()) as {
    jobs: { id: string; title: string; location?: string; jobUrl: string; descriptionPlain?: string; isRemote?: boolean }[];
  };
  return (data.jobs ?? []).map((j) => ({
    source: 'ashby',
    company: board,
    title: j.title,
    location: j.isRemote ? `Remote${j.location ? ` (${j.location})` : ''}` : j.location,
    url: j.jobUrl,
    descriptionText: j.descriptionPlain ?? '',
    sourceId: j.id,
    rawPayload: j,
  }));
}

/**
 * Workday has no public board API, but every career site is backed by a JSON
 * endpoint (CXS) that its own page calls. Search it with each of the person's
 * target titles, keep in-band titles, then fetch each posting's full
 * description. Most Fortune 500 employers post here.
 */
async function fetchWorkday(site: { company: string; url: string }, queries: string[]): Promise<RawJob[]> {
  const u = new URL(site.url);
  const tenant = u.hostname.split('.')[0];
  const parts = u.pathname.split('/').filter(Boolean);
  // Some sites put a locale first: /en-US/<site>.
  const siteName = /^[a-z]{2}-[A-Z]{2}$/.test(parts[0] ?? '') ? parts[1] : parts[0];
  if (!siteName) throw new Error(`could not read the Workday site name from ${site.url}`);
  const base = `${u.origin}/wday/cxs/${tenant}/${siteName}`;

  const postings = new Map<string, { title: string; externalPath: string; locationsText?: string }>();
  for (const q of queries) {
    const res = await fetch(`${base}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: q }),
    });
    if (!res.ok) {
      process.stderr.write(`workday ${site.company}: HTTP ${res.status}\n`);
      break;
    }
    const data = (await res.json()) as { jobPostings?: { title: string; externalPath: string; locationsText?: string }[] };
    for (const p of data.jobPostings ?? []) if (isInBandTitle(p.title)) postings.set(p.externalPath, p);
    await new Promise((r) => setTimeout(r, 300));
  }

  const jobs: RawJob[] = [];
  for (const p of postings.values()) {
    const res = await fetch(`${base}${p.externalPath}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) continue;
    const detail = (await res.json()) as { jobPostingInfo?: { jobDescription?: string; location?: string; jobReqId?: string; externalUrl?: string } };
    const info = detail.jobPostingInfo ?? {};
    jobs.push({
      source: 'workday',
      company: site.company,
      title: p.title,
      location: info.location ?? p.locationsText,
      url: info.externalUrl ?? `${site.url.replace(/\/$/, '')}${p.externalPath}`,
      descriptionText: stripHtml(info.jobDescription ?? ''),
      sourceId: info.jobReqId ?? p.externalPath,
      rawPayload: { ...p, ...info },
    });
    await new Promise((r) => setTimeout(r, 300));
  }
  return jobs;
}

async function main() {
  let sources: Sources;
  try {
    sources = JSON.parse(readFileSync(sourcesPath, 'utf8'));
  } catch (e) {
    die({ error: 'sources_read_failed', hint: 'No company list yet. Onboarding step "companies" creates profile/sources.json.', message: String(e) });
  }

  const results = {
    inserted: [] as number[],
    updated: [] as number[],
    unchanged: 0,
    errors: [] as string[],
    notes: [] as string[],
    // Same company and title as a row already in the catalog, but no shared req
    // id: usually a repost under a new ATS id. Bounteous job 135 came back this
    // way on 2026-09-22 under a fresh Lever uuid while the original was already
    // in `applied`. upsertJob flags it; discarding the flag hides the collision.
    possibleDuplicates: [] as { jobId: number; company: string; title: string; existing: number[] }[],
  };

  // Whole boards are worldwide; keep only postings somewhere the person would work.
  // A posting with no location at all is kept, since it may well be remote.
  const inScope = (job: RawJob) => !hasProfile() || !job.location || isInScopeLocation(job.location);

  const record = (job: RawJob) => {
    if (!inScope(job)) return;
    const r = upsertJob(job);
    if (r.possibleDuplicateOf?.length) {
      results.possibleDuplicates.push({
        jobId: r.jobId,
        company: job.company,
        title: job.title,
        existing: r.possibleDuplicateOf.map((d) => d.id),
      });
    }
    if (r.action === 'inserted') results.inserted.push(r.jobId);
    else if (r.action === 'updated') results.updated.push(r.jobId);
    else results.unchanged++;
  };

  const boards: [string, string[], (slug: string) => Promise<RawJob[]>][] = [
    ['greenhouse', sources.greenhouse ?? [], fetchGreenhouse],
    ['lever', sources.lever ?? [], fetchLever],
    ['ashby', sources.ashby ?? [], fetchAshby],
  ];
  for (const [kind, slugs, fetcher] of boards) {
    for (const slug of slugs) {
      try {
        for (const job of (await fetcher(slug)).filter((j) => isInBandTitle(j.title))) record(job);
      } catch (e) {
        results.errors.push(`${kind}:${slug}: ${String(e)}`);
      }
    }
  }

  const queries = hasProfile() ? searchQueries() : [];
  for (const site of sources.workday ?? []) {
    try {
      for (const job of await fetchWorkday(site, queries)) record(job);
    } catch (e) {
      results.errors.push(`workday:${site.company}: ${String(e)}`);
    }
  }

  const searchBoards = [
    ['successfactors', sources.successfactors, fetchSuccessFactors],
    ['phenom', sources.phenom, fetchPhenom],
    ['icims', sources.icims, fetchIcims],
  ] as const;
  for (const [ats, sites, fetchSite] of searchBoards) {
    for (const site of sites ?? []) {
      try {
        for (const job of await fetchSite(site, queries)) record(job);
      } catch (e) {
        results.errors.push(`${ats}:${site.company}: ${String(e)}`);
      }
    }
  }

  for (const page of sources.careerPages ?? []) {
    try {
      const { jobs, notes } = await fetchCareerPage(page);
      results.notes.push(...notes);
      for (const job of jobs) {
        const r = upsertJob(job);
        if (r.action === 'inserted') results.inserted.push(r.jobId);
        else if (r.action === 'updated') results.updated.push(r.jobId);
        else results.unchanged++;
      }
    } catch (e) {
      results.errors.push(`careerPage:${page.company}: ${String(e)}`);
    }
  }

  // An ingest that reached nothing at all is almost always empty config rather
  // than a quiet week, and it has looked like success here before.
  const configured =
    (sources.greenhouse?.length ?? 0) +
    (sources.lever?.length ?? 0) +
    (sources.ashby?.length ?? 0) +
    (sources.workday?.length ?? 0) +
    (sources.successfactors?.length ?? 0) +
    (sources.phenom?.length ?? 0) +
    (sources.icims?.length ?? 0) +
    (sources.careerPages?.length ?? 0);
  if (configured === 0) results.notes.push('No companies configured in profile/sources.json — nothing was fetched.');

  out({
    ...results,
    needsScoring: [...results.inserted, ...results.updated],
  });
}

main();
