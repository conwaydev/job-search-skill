import { out, die } from './db.ts';

// A miss is an answer, not an error: print it and exit cleanly so the chat
// doesn't show a failed command for a board name that was only a guess.
function miss(info: Record<string, unknown>): never {
  const status = info.status as number | undefined;
  out({
    found: false,
    ...info,
    hint:
      status === 404
        ? 'No board under that name. Try another job system, or run detect on their careers page.'
        : status === 403 || status === 429
          ? 'The site blocked the check. Search the web for the company name plus "careers" instead.'
          : 'The check did not work. Try again later, or search the web for the posting.',
  });
  process.exit(0);
}
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
  if (!res.ok) miss({ status: res.status, slug, ats: 'greenhouse' });
  const data = (await res.json()) as { jobs: { id: number; title: string; location?: { name?: string } }[] };
  return data.jobs.map((j) => ({ id: j.id, title: j.title, location: j.location?.name }));
}

async function checkLever(slug: string) {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!res.ok) miss({ status: res.status, slug, ats: 'lever' });
  const data = (await res.json()) as { id: string; text: string; categories?: { location?: string } }[];
  return data.map((j) => ({ id: j.id, title: j.text, location: j.categories?.location }));
}

async function checkAshby(slug: string) {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  if (!res.ok) miss({ status: res.status, slug, ats: 'ashby' });
  const data = (await res.json()) as { jobs: { id: string; title: string; location?: string; jobUrl?: string }[] };
  return data.jobs.map((j) => ({ id: j.id, title: j.title, location: j.location, url: j.jobUrl }));
}

async function checkWorkable(slug: string) {
  const res = await fetch(`https://apply.workable.com/api/v3/accounts/${slug}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [] }),
  });
  if (!res.ok) miss({ status: res.status, slug, ats: 'workable' });
  const data = (await res.json()) as { results: { shortcode: string; title: string; workplace?: string; location?: { city?: string; region?: string; country?: string } }[] };
  return data.results.map((j) => ({
    id: j.shortcode,
    title: j.title,
    location: [j.location?.city, j.location?.region, j.workplace].filter(Boolean).join(', '),
    url: `https://apply.workable.com/${slug}/j/${j.shortcode}/`,
  }));
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
    if (!res.ok) miss({ status: res.status, board: boardUrl, ats: 'workday' });
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
    try {
      out(await detectBoard(slug));
    } catch (e) {
      const status = Number(String((e as Error)?.message ?? e).match(/HTTP (\d+)/)?.[1]) || undefined;
      miss({ url: slug, status, ats: 'unknown' });
    }
    return;
  }
  const checkers: Record<string, (s: string) => Promise<unknown[]>> = {
    greenhouse: checkGreenhouse,
    lever: checkLever,
    ashby: checkAshby,
    workable: checkWorkable,
    workday: checkWorkday,
    successfactors: checkSuccessFactors,
    phenom: checkPhenom,
    icims: checkIcims,
  };
  if (!checkers[ats] || !slug) {
    die({ error: 'usage', message: 'checkBoard.ts <greenhouse|lever|ashby|workable> <companySlug>  |  checkBoard.ts <workday|successfactors|phenom|icims> <boardUrl> ["search words"]  |  checkBoard.ts detect <careers page url>' });
  }
  const jobs = await checkers[ats](slug);
  out({ company: slug, ats, count: jobs.length, jobs });
}

main().catch((e) => miss({ message: String((e as Error)?.message ?? e) }));
