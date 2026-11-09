/**
 * Built In job-board scanner.
 *
 * Complements scanLinkedIn.ts. Built In cards carry a compensation band and a
 * posting age that LinkedIn's guest cards do not, which is worth a second
 * source even though the two overlap heavily.
 *
 * The URL shape is the whole trick. `builtin.com/jobs?search=<terms>` returns
 * an Alpine.js shell with no job data in the HTML, which is why this site was
 * written off as unusable once. The PATH form is server-rendered and needs no
 * browser:
 *   builtin.com/jobs/<remote|hub>/<category>/search/<slug>
 *   builtin.com/jobs/<hub>/<hybrid|office>/<category>?page=N
 * Playwright was what surfaced that difference; keep it in mind for any site
 * that looks like an empty shell on the first curl.
 *
 * 🚨 Compensation on these cards has NO currency marker. StackAdapt's
 * "76K-105K Annually" was Canadian dollars, roughly $55-76K USD. Always
 * confirm the currency on the source posting before scoring a band.
 *
 * Usage:
 *   node --no-warnings scripts/scanBuiltIn.ts [--json]
 */
import { isInBandTitle } from './titleFilter.ts';
import { loadProfile, isInScopeLocation } from './profile.ts';
import { partition, companyNote, knownSummary, knownLine } from './catalogMatch.ts';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * Built In only has city listings for its hubs. Any other path segment still
 * returns 200 with unrelated cards, so a city is only searched when it maps to
 * one of these. Remote is searched across the whole site.
 */
const HUBS: Record<string, string> = {
  chicago: 'chicago',
  'new york': 'nyc',
  'new york city': 'nyc',
  nyc: 'nyc',
  austin: 'austin',
  boston: 'boston',
  denver: 'colorado',
  boulder: 'colorado',
  'los angeles': 'los-angeles',
  seattle: 'seattle',
  'san francisco': 'san-francisco',
};

/** Category slugs Built In uses in its URLs. */
export const BUILTIN_CATEGORIES = [
  'marketing', 'dev-engineering', 'operations', 'sales', 'product', 'finance', 'hr',
  'data-analytics', 'design-ux', 'customer-success', 'project-management', 'content',
  'legal', 'it', 'cybersecurity', 'consulting',
];

const profile = loadProfile();
const hubs = [...new Set(profile.locations.map((l) => HUBS[l.city.toLowerCase()]).filter(Boolean))];
const SCOPES = [...(profile.remote ? ['remote'] : []), ...hubs];
const configured = (profile.builtInCategories as string[] | undefined) ?? [];
const CATEGORIES = configured.length ? configured.filter((c) => BUILTIN_CATEGORIES.includes(c)) : ['marketing', 'dev-engineering', 'operations', 'product'];
const slug = (t: string) => t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SEARCHES: [string, string][] = CATEGORIES.flatMap((c) => profile.targetTitles.map((t) => [c, slug(t)] as [string, string]));

if (!SCOPES.length) {
  console.error('Built In: none of your locations is a Built In city and remote is off, so there is nothing to scan here.');
  process.exit(0);
}

interface Row {
  id: string;
  company: string;
  title: string;
  age: string;
  workModel: string;
  location: string;
  comp: string;
  level: string;
  url: string;
  query: string;
}

const stripTags = (s: string) =>
  s
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&[a-z]+;/g, ' ');

async function scan(url: string, label: string) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return [];
  const html = await res.text();

  // One block per card; the numeric job id lives in the element id.
  const blocks = html.split('data-id="job-card"').slice(1);
  const rows: Row[] = [];

  for (const raw of blocks) {
    // Splitting on the attribute leaves the tail of the opening tag as text,
    // which otherwise lands in `company` and shifts every field by one.
    const block = raw.slice(raw.indexOf('>') + 1, 12000);
    const href = block.match(/\/job\/([a-z0-9-]+)\/(\d+)/);
    if (!href) continue;
    const lines = stripTags(block)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      // "Saved" and "Save" are UI chrome sitting between title and work model.
      .filter((s) => !/^(Saved|Save|Apply|View)$/i.test(s));

    // Card text runs: company, title, age, work model, location, comp, level.
    const [company = '', title = '', age = '', workModel = '', location = '', ...rest] = lines;
    const comp = rest.find((s) => /\d+K[-–]\d+K|\$\d/.test(s)) ?? '';
    const level = rest.find((s) => /(level|Expert|Leader|Junior|Senior)/i.test(s)) ?? '';

    rows.push({
      id: href[2],
      company,
      title,
      age,
      workModel,
      location,
      comp,
      level,
      url: `https://builtin.com/job/${href[1]}/${href[2]}`,
      query: label,
    });
  }
  return rows;
}

const seen = new Map<string, Row>();
let pages = 0;
const add = (rows: Row[]) => {
  for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r);
};

for (const scope of SCOPES) {
  for (const [category, slug] of SEARCHES) {
    try {
      add(await scan(`https://builtin.com/jobs/${scope}/${category}/search/${slug}`, `${scope}/${category}/${slug}`));
      pages++;
    } catch {
      // A dead slug is not worth failing the run over.
    }
  }
}

// Whole-category crawl of each hub city by work model. Keyword searches only
// read page 1 and miss postings whose titles don't contain the term, so each
// category is paged to its end and the title filter does the narrowing.
// Server-rendered and anonymous, ten cards a page; a short page is the end.
const MODELS = ['hybrid', 'office'];
const MAX_PAGES = 25;
for (const hub of hubs) {
  for (const model of MODELS) {
    for (const category of CATEGORIES) {
      for (let n = 1; n <= MAX_PAGES; n++) {
        const url = `https://builtin.com/jobs/${hub}/${model}/${category}?page=${n}`;
        try {
          const rows = await scan(url, `${hub}-${model}/${category}`);
          pages++;
          add(rows);
          if (rows.length < 10) break;
        } catch {
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }
}

// Remote cards are kept only if remote is in scope; everything else must be in
// one of the person's cities.
const inBand = [...seen.values()].filter(
  (r) => isInBandTitle(r.title) && (isInScopeLocation(`${r.workModel} ${r.location}`))
);
const { fresh, known, collapsed } = partition(inBand);

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      {
        scanned: seen.size,
        pages,
        relevant: fresh.map((f) => ({ ...f.item, alsoInCatalog: f.sameCompany })),
        known: known.map((k) => ({ ...k.item, matchedBy: k.by, catalog: k.hits })),
        collapsed,
      },
      null,
      2
    )
  );
} else {
  console.log(`scanned ${seen.size} postings across ${pages} searches`);
  console.log(`${fresh.length} new in scope (in-band title); ${knownSummary(known, collapsed)}\n`);
  for (const { item: r, sameCompany } of fresh) {
    console.log(
      `${r.age.padEnd(20)} | ${r.title.slice(0, 44).padEnd(44)} | ${r.company.slice(0, 22).padEnd(22)} | ${r.workModel} · ${r.location}`,
    );
    console.log(`${' '.repeat(21)}${r.comp || 'no band'}   ${r.url}`);
    const note = companyNote(sameCompany);
    if (note) console.log(`${' '.repeat(21)}${note}`);
  }
  if (process.argv.includes('--show-known')) {
    console.log('\nalready in catalog:');
    for (const k of known) console.log(`  ${knownLine(k)}`);
  }
  console.log('\nCompensation bands carry no currency marker. Confirm on the source posting.');
}
