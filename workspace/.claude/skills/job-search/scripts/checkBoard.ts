import { out, die } from './db.ts';

/**
 * Print every job title/location/id on a company's live Greenhouse or Lever
 * board, unfiltered. Filtering by keyword substring is exactly what caused a
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

async function main() {
  const [, , ats, slug] = process.argv;
  if ((ats !== 'greenhouse' && ats !== 'lever') || !slug) {
    die({ error: 'usage', message: 'checkBoard.ts <greenhouse|lever> <companySlug>' });
  }
  const jobs = ats === 'greenhouse' ? await checkGreenhouse(slug) : await checkLever(slug);
  out({ company: slug, ats, count: jobs.length, jobs });
}

main();
