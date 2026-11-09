/**
 * LinkedIn job scanner. Runs signed in when a session exists, guest otherwise.
 *
 * This is the freshness source for discovery: plain WebSearch serves listings
 * companies pulled down months ago (a 2026-09-09 run fetched 14 search-sourced
 * candidates and 12 were already dead). Verify anything promising against the
 * company's live ATS board before scoring, since a card can outlive the
 * posting by a few days.
 *
 * SIGNED IN is the default and much the better source, so keep the session
 * alive (`scripts/login.ts linkedin`). It adds the salary band, whether anyone
 * the person knows works there, and LinkedIn's own competitive read ("Actively
 * reviewing applicants", "You'd be a top applicant"). Salary is the one that
 * changes the work: guest cards carry no compensation at all, so without a
 * session every band has to be chased down by hand. See linkedinAuth.ts.
 *
 * GUEST is the fallback below. No auth, no cookies. LinkedIn's terms prohibit
 * automated access; the person opts in to this during onboarding. Expect
 * intermittent blocking, and expect a title, company, city and date only.
 *
 * Usage:
 *   node --no-warnings scripts/scanLinkedIn.ts [--days 14] [--json]
 *   node --no-warnings scripts/scanLinkedIn.ts --guest            # skip the session
 *   node --no-warnings scripts/scanLinkedIn.ts --show-known       # also list what the catalog already has
 *   node --no-warnings scripts/scanLinkedIn.ts --fetch <jobId>   # full JD text
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { isInBandTitle } from './titleFilter.ts';
import { loadProfile, searchQueries, placeLabel, isInScopeLocation } from './profile.ts';
import { partition, companyNote, knownSummary, knownLine } from './catalogMatch.ts';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const BASE = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';

// Search phrases and places come from profile/search-profile.json. Remote
// roles are found by searching the whole country and keeping cards whose
// location says remote (or is just the country, which is how LinkedIn labels
// many remote cards); on-site and hybrid roles by searching each city.
const QUERIES = searchQueries();
const profile = loadProfile();
const LOCATIONS = [
  ...(profile.remote ? [profile.country ?? 'United States'] : []),
  ...profile.locations.map(placeLabel),
];

interface Row {
  title: string;
  company: string;
  location: string;
  date: string;
  url: string;
  query: string;
}

const strip = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, '')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const all = (re: RegExp, s: string) => [...s.matchAll(re)].map((m) => m[1]);

async function page(query: string, location: string, start: number, days: number) {
  const url =
    `${BASE}?keywords=${encodeURIComponent(query)}` +
    `&location=${encodeURIComponent(location)}` +
    `&f_TPR=r${days * 86400}&start=${start}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const html = await res.text();

  const titles = all(/base-search-card__title"[^>]*>([\s\S]*?)<\/h3>/g, html);
  const companies = all(/base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/g, html);
  const locations = all(/job-search-card__location"[^>]*>([\s\S]*?)<\/span>/g, html);
  const links = all(/href="(https:\/\/www\.linkedin\.com\/jobs\/view\/[^"?]+)/g, html);
  const dates = all(/datetime="([^"]+)"/g, html);

  return titles.map((t, i) => ({
    title: strip(t),
    company: strip(companies[i] ?? ''),
    location: strip(locations[i] ?? ''),
    date: dates[i] ?? '',
    url: links[i] ?? '',
    query,
  }));
}

// The guest jobPosting endpoint returns the complete description, unauthenticated.
// This matters for the rubric's no-truncated-JD rule: the search cards alone are
// not scoreable, and WebFetch on a /jobs/view/ URL returns a summary plus a
// location header geolocated to the VIEWER (it reported "Glen Ellyn, IL" for a
// remote role, a Boston role and a Denver role in the same run). Use this for
// the real description and trust the card's location field over the page header.
async function fetchPosting(jobId: string) {
  const res = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const raw = await res.text();
  const markup = raw.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? raw;
  const text = markup
    .replace(/<(li|p|br|div|h\d)[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return { jobId, chars: text.length, text };
}

const fetchIdx = process.argv.indexOf('--fetch');
if (fetchIdx > -1) {
  const id = process.argv[fetchIdx + 1];
  if (!/^\d+$/.test(id ?? '')) {
    console.error('usage: scanLinkedIn.ts --fetch <numeric job id>');
    process.exit(1);
  }
  const posting = await fetchPosting(id);
  console.log(posting.text);
  process.exit(0);
}

// Signed in unless told otherwise. `--guest` is for checking what an
// unauthenticated run sees, and for when the session has lapsed mid-run.
if (!process.argv.includes('--guest')) {
  const { sessionStatus } = await import('./browserSession.ts');
  const status = sessionStatus('linkedin');
  if (status.ok) {
    const { scanAuthenticated, inScope } = await import('./linkedinAuth.ts');
    const days = Number(process.argv[process.argv.indexOf('--days') + 1]) || 14;
    const { cards, requests, failures } = await scanAuthenticated(days);
    const inBand = cards.filter(inScope).sort((a, b) => b.listedAt.localeCompare(a.listedAt));
    const { fresh, known, collapsed } = partition(inBand);
    const failText = Object.entries(failures).map(([k, n]) => `${n}x${k}`).join(' ') || 'none';
    if (process.argv.includes('--json')) {
      console.log(
        JSON.stringify(
          {
            mode: 'authenticated',
            scanned: cards.length,
            requests,
            failures,
            relevant: fresh.map((f) => ({ ...f.item, alsoInCatalog: f.sameCompany })),
            known: known.map((k) => ({ ...k.item, matchedBy: k.by, catalog: k.hits })),
            collapsed,
          },
          null,
          2
        )
      );
    } else {
      console.log(`signed in: scanned ${cards.length} postings over ${requests} requests (failures: ${failText})`);
      console.log(`${fresh.length} new in scope (your locations, in-band title); ${knownSummary(known, collapsed)}\n`);
      for (const { item: r, sameCompany } of fresh) {
        console.log(
          `${r.listedAt.slice(0, 10)} | ${r.title.slice(0, 50).padEnd(50)} | ${r.company.slice(0, 22).padEnd(22)} | ${r.location.slice(0, 32)}`
        );
        const bits = [r.salaryText || 'no band', r.easyApply ? 'easy apply' : '', r.insight, companyNote(sameCompany)].filter(Boolean);
        console.log(`${' '.repeat(13)}${bits.join('  ·  ')}`);
        console.log(`${' '.repeat(13)}${r.url}`);
      }
      if (process.argv.includes('--show-known')) {
        console.log('\nalready in catalog:');
        for (const k of known) console.log(`  ${knownLine(k)}`);
      }
    }
    process.exit(0);
  }
  console.error(`falling back to the guest endpoint: ${status.reason}. Run scripts/login.ts linkedin for salary bands.`);
}

const days = Number(process.argv[process.argv.indexOf('--days') + 1]) || 14;
const asJson = process.argv.includes('--json');

const seen = new Map<string, Row>();
let requests = 0;
let failures = 0;

for (const query of QUERIES) {
  for (const location of LOCATIONS) {
    for (const start of [0, 10, 20]) {
      let rows: Row[];
      try {
        rows = await page(query, location, start, days);
        requests++;
      } catch (err) {
        failures++;
        break; // Blocked or empty; move to the next query rather than hammering.
      }
      if (!rows.length) break;
      for (const row of rows) {
        // The numeric job id is the only stable key; the same posting shows up
        // under several queries and both locations.
        const key = row.url.match(/-(\d+)$/)?.[1] ?? row.url;
        if (!seen.has(key)) seen.set(key, row);
      }
      await sleep(600);
    }
  }
}

const inBand = [...seen.values()]
  .filter((r) => isInBandTitle(r.title) && isInScopeLocation(r.location))
  .sort((a, b) => b.date.localeCompare(a.date));
const { fresh, known, collapsed } = partition(inBand);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        scanned: seen.size,
        requests,
        failures,
        relevant: fresh.map((f) => ({ ...f.item, alsoInCatalog: f.sameCompany })),
        known: known.map((k) => ({ ...k.item, matchedBy: k.by, catalog: k.hits })),
        collapsed,
      },
      null,
      2
    )
  );
} else {
  console.log(`scanned ${seen.size} postings over ${requests} requests (${failures} blocked/empty)`);
  console.log(`${fresh.length} new in scope (your locations, in-band title); ${knownSummary(known, collapsed)}\n`);
  for (const { item: r, sameCompany } of fresh) {
    console.log(`${r.date.slice(0, 10)} | ${r.title.slice(0, 58).padEnd(58)} | ${r.company.slice(0, 24).padEnd(24)} | ${r.location.slice(0, 30)}`);
    const note = companyNote(sameCompany);
    if (note) console.log(`${' '.repeat(13)}${note}`);
    console.log(`${' '.repeat(13)}${r.url}`);
  }
  if (process.argv.includes('--show-known')) {
    console.log('\nalready in catalog:');
    for (const k of known) console.log(`  ${knownLine(k)}`);
  }
}
