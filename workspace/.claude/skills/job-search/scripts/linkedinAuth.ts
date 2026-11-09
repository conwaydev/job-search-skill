/**
 * LinkedIn job search, signed in.
 *
 * The guest endpoint in `scanLinkedIn.ts` gives a title, a company, a city and
 * a date. Signed in, the same search returns the salary band, whether anyone
 * the person knows works there, and an exact posting timestamp instead of "2
 * weeks ago". Salary in particular is the point: guest cards carry no
 * compensation at all, so every band has to be chased down on the employer's
 * site one posting at a time.
 *
 * How it works, and why it is built this way:
 *
 * The browser does the talking. `browserSession` opens the persistent Chrome
 * profile the person logged into, and the voyager (LinkedIn's own internal API)
 * calls are issued from inside a real linkedin.com page via `fetch`. That
 * means real cookies, real TLS, real headers, and same-origin credentials,
 * none of which have to be reconstructed. Replaying voyager from plain node
 * works until it doesn't and fails in ways that look like a logged-out
 * session.
 *
 * The query format was read off the wire rather than guessed, and the one
 * thing worth knowing is that `locationUnion` takes plain text
 * (`seoLocation:(location:Denver, Colorado, United States)`). There is no
 * geoId table to keep current.
 *
 * Usage (normally through scanLinkedIn.ts --auth):
 *   node --no-warnings scripts/linkedinAuth.ts [--days 14] [--json]
 */
import { openContext, captureFrom, sessionStatus } from './browserSession.ts';
import { pathToFileURL } from 'node:url';
import { isInBandTitle } from './titleFilter.ts';
import { loadProfile, searchQueries, placeLabel, isInScopeLocation } from './profile.ts';

export interface AuthCard {
  jobId: string;
  title: string;
  company: string;
  location: string;
  /** Exact listing time, not "2 weeks ago". */
  listedAt: string;
  url: string;
  easyApply: boolean;
  /** Raw band text as shown, e.g. "$250K/yr - $320K/yr · Vision, Medical". */
  salaryText: string;
  salaryMin?: number;
  salaryMax?: number;
  /** "1 connection works here" and similar. Only exists signed in. */
  insight: string;
  query: string;
}

/**
 * Search passes, built from the profile: remote across the whole country, and
 * anything in each of the person's cities.
 *
 * 🚨 Both sort orders have to run, and this is not a tuning preference. A
 * date-sorted-only scan was once diffed against the guest scan and they barely
 * overlapped. Sorting by date inside a 14-day window fills every page with
 * whatever was posted in the last few hours, which on LinkedIn is mostly
 * staffing-agency reposts, so the run never reaches the good older postings
 * still inside the window. Relevance sort finds those on its first page.
 *
 * workplaceType:2 is LinkedIn's own Remote tag, which employers set
 * inconsistently, so the unfiltered country pass is not redundant with it: it
 * catches postings whose remoteness is only in the title or the body. The
 * location check below is what actually enforces scope.
 */
type Pass = { location: string; workplaceType?: string; sort: 'DD' | 'R'; label: string };

function buildPasses(): Pass[] {
  const p = loadProfile();
  const country = p.country ?? 'United States';
  const passes: Pass[] = [];
  if (p.remote) {
    passes.push(
      { location: country, workplaceType: '2', sort: 'DD', label: 'remote/new' },
      { location: country, workplaceType: '2', sort: 'R', label: 'remote/best' },
      { location: country, sort: 'R', label: 'country-any/best' }
    );
  }
  for (const place of p.locations) {
    const label = place.city.toLowerCase().replace(/\s+/g, '-');
    passes.push(
      { location: placeLabel(place), sort: 'DD', label: `${label}/new` },
      { location: placeLabel(place), sort: 'R', label: `${label}/best` }
    );
  }
  return passes;
}

const ENDPOINT = 'https://www.linkedin.com/voyager/api/voyagerJobsDashJobCards';
const DECORATION = 'com.linkedin.voyager.dash.deco.jobs.search.JobSearchCardsCollection-220';

function buildUrl(
  keywords: string,
  location: string,
  days: number,
  start: number,
  sort: string,
  workplaceType?: string
): string {
  const filters = [
    `sortBy:List(${sort})`,
    `timePostedRange:List(r${days * 86400})`,
    ...(workplaceType ? [`workplaceType:List(${workplaceType})`] : []),
  ].join(',');
  const query =
    `(origin:JOB_SEARCH_PAGE_OTHER_ENTRY,keywords:${rl(keywords)},` +
    `locationUnion:(seoLocation:(location:${rl(location)})),` +
    `selectedFilters:(${filters}),spellCorrectionEnabled:true)`;
  return (
    `${ENDPOINT}?decorationId=${DECORATION}&count=25&q=jobSearch` +
    `&query=${query}&start=${start}`
  );
}

/**
 * Escape a VALUE going into the Rest.li query string. The structural parens,
 * colons and commas have to stay literal, so the whole query cannot simply be
 * URI-encoded; only the characters inside a value that would otherwise be read
 * as structure.
 *
 * 🚨 The comma is the one that bites. "Denver, Colorado, United States"
 * unescaped reads as three more fields and the whole request comes back 400 --
 * which is exactly half the scan silently returning nothing, since the remote
 * pass ("United States") has no comma and succeeds.
 */
function rl(value: string): string {
  return value.replace(/[(),:%\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
}

const text = (v: unknown): string =>
  (v && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string'
    ? (v as { text: string }).text
    : ''
  )
    .replace(/ /g, ' ')
    .trim();

/** "$120K/yr - $150K/yr · 4 benefits" and "$95,000.00/yr - $130,000.00/yr". */
function parseSalary(s: string): { min?: number; max?: number } {
  const nums = [...s.matchAll(/\$([\d,]+(?:\.\d+)?)(K)?/gi)].map((m) => {
    const n = Number(m[1].replace(/,/g, ''));
    return m[2] ? n * 1000 : n;
  });
  // Hourly bands share the dollar sign and are not comparable to the floor.
  if (/\/(hr|hour)/i.test(s)) return {};
  if (!nums.length) return {};
  return { min: nums[0], max: nums.length > 1 ? nums[1] : undefined };
}

function parseCards(payload: any, query: string): AuthCard[] {
  const included: any[] = payload?.included ?? [];
  const byUrn = new Map<string, AuthCard>();
  for (const rec of included) {
    if (!String(rec?.$type ?? '').endsWith('JobPostingCard')) continue;
    const urn: string = rec.jobPostingUrn ?? rec['*jobPosting'] ?? '';
    const jobId = urn.match(/(\d{6,})/)?.[1];
    const title = text(rec.title);
    // The same posting appears more than once per response, and some copies
    // come back as an empty shell. Keep the first one carrying real fields.
    if (!jobId || !title || byUrn.has(jobId)) continue;

    const footers: any[] = rec.footerItems ?? [];
    const listed = footers.find((f) => f?.type === 'LISTED_DATE')?.timeAt;
    const tertiary = text(rec.tertiaryDescription);
    const { min, max } = parseSalary(tertiary);

    byUrn.set(jobId, {
      jobId,
      title,
      company: text(rec.primaryDescription),
      location: text(rec.secondaryDescription),
      listedAt: listed ? new Date(listed).toISOString() : '',
      url: `https://www.linkedin.com/jobs/view/${jobId}/`,
      easyApply: footers.some((f) => f?.type === 'EASY_APPLY_TEXT'),
      salaryText: tertiary,
      salaryMin: min,
      salaryMax: max,
      insight: text(rec.relevanceInsight?.text ?? rec.relevanceInsight),
      query,
    });
  }
  return [...byUrn.values()];
}

export async function scanAuthenticated(
  days = 14,
  pages = 2,
  queries: string[] = searchQueries()
): Promise<{ cards: AuthCard[]; requests: number; failures: Record<string, number> }> {
  const status = sessionStatus('linkedin');
  if (!status.ok) throw new Error(`not signed in to linkedin (${status.reason}). Run: scripts/login.ts linkedin`);

  const { context, close } = await openContext('linkedin', false);
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto('https://www.linkedin.com/jobs/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (/\/(login|authwall|checkpoint)/.test(page.url())) {
      throw new Error(`session rejected, landed on ${page.url()}. Run: scripts/login.ts linkedin`);
    }

    const seen = new Map<string, AuthCard>();
    let requests = 0;
    const failures: Record<string, number> = {};
    const fail = (k: string) => {
      failures[k] = (failures[k] ?? 0) + 1;
    };

    for (const pass of buildPasses()) {
      for (const keywords of queries) {
        for (let p = 0; p < pages; p++) {
          const url = buildUrl(keywords, pass.location, days, p * 25, pass.sort, pass.workplaceType);
          const payload = await page.evaluate(async (u: string) => {
            // JSESSIONID is readable from JS on purpose: it IS the CSRF token,
            // quotes and all, and voyager 403s without the header.
            const csrf = (document.cookie.match(/JSESSIONID="?([^";]+)"?/) ?? [])[1] ?? '';
            const res = await fetch(u, {
              credentials: 'include',
              headers: { 'csrf-token': csrf, accept: 'application/vnd.linkedin.normalized+json+2.1' },
            });
            if (!res.ok) return { error: res.status };
            return res.json();
          }, url);

          if (!payload || payload.error) {
            fail(String(payload?.error ?? 'no-response'));
            break;
          }
          requests++;
          const cards = parseCards(payload, `${keywords} [${pass.label}]`);
          for (const c of cards) if (!seen.has(c.jobId)) seen.set(c.jobId, c);
          if (cards.length < 25) break; // last page for this query
          await page.waitForTimeout(400);
        }
      }
    }

    // The jar rotates while browsing; keep the fresh copy so the fast path
    // and the next run don't start from a stale JSESSIONID.
    await captureFrom(context, 'linkedin');
    return { cards: [...seen.values()], requests, failures };
  } finally {
    await close();
  }
}

// The pass location already narrows the search, but LinkedIn widens it on its
// own, so the card's location text is checked again here.

export function inScope(c: AuthCard): boolean {
  return isInBandTitle(c.title) && isInScopeLocation(c.location);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const days = Number(process.argv[process.argv.indexOf('--days') + 1]) || 14;
  const { cards, requests, failures } = await scanAuthenticated(days);
  const relevant = cards.filter(inScope).sort((a, b) => b.listedAt.localeCompare(a.listedAt));
  const failText = Object.entries(failures).map(([k, n]) => `${n}x${k}`).join(' ') || 'none';
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ scanned: cards.length, requests, failures, relevant }, null, 2));
  } else {
    console.log(`scanned ${cards.length} postings over ${requests} requests (failures: ${failText})`);
    console.log(`${relevant.length} in scope:\n`);
    for (const r of relevant) {
      console.log(
        `${r.listedAt.slice(0, 10)} | ${r.title.slice(0, 50).padEnd(50)} | ${r.company.slice(0, 22).padEnd(22)} | ${r.location.slice(0, 32)}`
      );
      const bits = [r.salaryText || 'no band', r.easyApply ? 'easy apply' : '', r.insight].filter(Boolean);
      console.log(`${' '.repeat(13)}${bits.join('  ·  ')}`);
      console.log(`${' '.repeat(13)}${r.url}`);
    }
  }
}
