import { out, die } from './db.ts';
import { detectBoard, searchSuccessFactors, searchPhenom, searchIcims } from './moreBoards.ts';

/**
 * Print every job title/location/id on a company's live Greenhouse, Lever,
 * Ashby or Workday board, unfiltered. Filtering by keyword substring is exactly what caused a
 * real miss during discovery ("Manager, Engineering" doesn't match a
 * fixed-phrase "engineering manager" check) — titles vary in word order and
 * phrasing too much for that to be reliable. Let the model read the full
 * list and judge relevance instead of pre-filtering with brittle string
 * matching.
 */

async function checkGreenhouse(slug: string) {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`);
  if (!res.ok) die({ error: 'fetch_failed', status: res.status, slug, ats: 'greenhouse' });
  const data = (await res.json()) as { jobs: { id: number; title: string; location?: { name?: string } }[] };
  return data.jobs.map((j) => ({ id: j.id, title: j.title, location: j.location?.name }));
}

async function checkLever(slug: string) {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!res.ok) die({ error: 'fetch_failed', status: res.status, slug, ats: 'lever' });
  const data = (await res.json()) as { id: string; text: string; categories?: { location?: string } }[];
  return data.map((j) => ({ id: j.id, title: j.text, location: j.categories?.location }));
}

async function checkAshby(slug: string) {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  if (!res.ok) die({ error: 'fetch_failed', status: res.status, slug, ats: 'ashby' });
  const data = (await res.json()) as { jobs: { id: string; title: string; location?: string; jobUrl?: string }[] };
  return data.jobs.map((j) => ({ id: j.id, title: j.title, location: j.location, url: j.jobUrl }));
}

/** Workday takes the board's public URL, e.g. https://target.wd5.myworkdayjobs.com/targetcareers */
async function checkWorkday(boardUrl: string) {
  const u = new URL(boardUrl);
  const tenant = u.hostname.split('.')[0];
  const site = u.pathname.split('/').filter((p) => p && !/^[a-z]{2}-[A-Z]{2}$/.test(p))[0];
  if (!site) die({ error: 'bad_workday_url', hint: 'Use the board URL, like https://<tenant>.wd5.myworkdayjobs.com/<site>' });
  const api = `${u.origin}/wday/cxs/${tenant}/${site}/jobs`;
  const jobs: { title: string; location?: string; url: string }[] = [];
  for (let offset = 0; offset < 2000; offset += 20) {
    const res = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: process.argv[4] ?? '' }),
    });
    if (!res.ok) die({ error: 'fetch_failed', status: res.status, board: boardUrl, ats: 'workday' });
    const data = (await res.json()) as { total: number; jobPostings: { title: string; locationsText?: string; externalPath: string }[] };
    for (const p of data.jobPostings ?? []) jobs.push({ title: p.title, location: p.locationsText, url: `${u.origin}/${site}${p.externalPath}` });
    if (!data.jobPostings?.length || offset + 20 >= data.total) break;
  }
  return jobs;
}

// These three have no list-everything endpoint; they search, with the given words or none.
const words = process.argv[4] ?? '';
const checkSuccessFactors = (url: string) => searchSuccessFactors(url, words, 4);
const checkPhenom = (url: string) => searchPhenom(url, words, 5);
const checkIcims = (url: string) => searchIcims(url, words, 2);

async function main() {
  const [, , ats, slug] = process.argv;
  if (ats === 'detect' && slug) {
    // Which job system does this careers page run on, and what goes in sources.json?
    out(await detectBoard(slug));
    return;
  }
  const checkers: Record<string, (s: string) => Promise<unknown[]>> = {
    greenhouse: checkGreenhouse,
    lever: checkLever,
    ashby: checkAshby,
    workday: checkWorkday,
    successfactors: checkSuccessFactors,
    phenom: checkPhenom,
    icims: checkIcims,
  };
  if (!checkers[ats] || !slug) {
    die({ error: 'usage', message: 'checkBoard.ts <greenhouse|lever|ashby> <companySlug>  |  checkBoard.ts <workday|successfactors|phenom|icims> <boardUrl> ["search words"]  |  checkBoard.ts detect <careers page url>' });
  }
  const jobs = await checkers[ats](slug);
  out({ company: slug, ats, count: jobs.length, jobs });
}

main();
