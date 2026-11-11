/**
 * Reads one job posting from its link, the cheap and reliable way: through the
 * employer's job system where there is one, else the job data many career pages
 * embed for search engines.
 *
 *   fetchPosting.ts "<job url>" [--save data/tmp/job.json]
 *
 * Handles Greenhouse, Lever, Ashby and Workday links, and any page that embeds
 * schema.org JobPosting data. Prints {found, title, company, location,
 * descriptionText, ...}. With --save it also writes a file ready for addJob.ts.
 * LinkedIn links: use scanLinkedIn.ts --fetch <id>. Indeed: never fetched.
 * When it prints found:false, fall back to WebFetch.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { out, die } from './db.ts';
import { workspaceDir, ensureDir } from './paths.ts';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36';

const args = process.argv.slice(2);
const raw = args.find((a) => !a.startsWith('--'));
const saveAt = args.includes('--save') ? args[args.indexOf('--save') + 1] : undefined;
if (!raw) die({ error: 'usage', hint: 'fetchPosting.ts "<job url>" [--save data/tmp/job.json]' });

let url: URL;
try {
  url = new URL(raw!);
} catch {
  die({ error: 'bad_url', url: raw });
}
// iCIMS job pages are a shell around an iframe; the posting itself (with its
// job data) only comes back when asked for the inner page.
if (/\.icims\.com$/.test(url!.hostname)) url!.searchParams.set('in_iframe', '1');

interface Posting {
  found: boolean;
  via?: string;
  title?: string;
  company?: string;
  location?: string;
  descriptionText?: string;
  salary?: string;
  datePosted?: string;
  employmentType?: string;
  canonicalUrl?: string;
  hint?: string;
}

const text = (html = '') =>
  html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

async function get(u: string, json = false) {
  const res = await fetch(u, {
    headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html,*/*;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(u).hostname}`);
  return json ? res.json() : res.text();
}

const parts = url!.pathname.split('/').filter(Boolean);
const host = url!.hostname.replace(/^www\./, '');

async function greenhouse(): Promise<Posting | null> {
  if (!/greenhouse\.io$/.test(host)) return null;
  const i = parts.indexOf('jobs');
  if (i < 1 || !parts[i + 1]) return null;
  const slug = parts[i - 1];
  const d = (await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${parts[i + 1]}`, true)) as any;
  return {
    found: true,
    via: 'greenhouse',
    title: d.title,
    company: d.company_name,
    location: d.location?.name,
    descriptionText: text(d.content),
    datePosted: d.first_published ?? d.updated_at,
    canonicalUrl: d.absolute_url,
  };
}

async function lever(): Promise<Posting | null> {
  if (host !== 'jobs.lever.co' || parts.length < 2) return null;
  const d = (await get(`https://api.lever.co/v0/postings/${parts[0]}/${parts[1]}`, true)) as any;
  const lists = (d.lists ?? []).map((l: any) => `${l.text}\n${text(l.content)}`).join('\n');
  const pay = d.salaryRange ? `${d.salaryRange.min}-${d.salaryRange.max} ${d.salaryRange.currency ?? ''} ${d.salaryRange.interval ?? ''}`.trim() : undefined;
  return {
    found: true,
    via: 'lever',
    title: d.text,
    location: d.categories?.location,
    descriptionText: [d.descriptionPlain, lists, d.additionalPlain].filter(Boolean).join('\n'),
    salary: pay,
    employmentType: d.categories?.commitment,
    datePosted: d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : undefined,
    canonicalUrl: d.hostedUrl,
  };
}

async function ashby(): Promise<Posting | null> {
  if (host !== 'jobs.ashbyhq.com' || parts.length < 2) return null;
  const d = (await get(`https://api.ashbyhq.com/posting-api/job-board/${parts[0]}?includeCompensation=true`, true)) as any;
  const j = (d.jobs ?? []).find((x: any) => x.id === parts[1]);
  if (!j) return { found: false, via: 'ashby', hint: 'Not on the live board: it has probably closed.' };
  return {
    found: true,
    via: 'ashby',
    title: j.title,
    location: [j.location, j.isRemote ? 'Remote' : ''].filter(Boolean).join(', '),
    descriptionText: j.descriptionPlain ?? text(j.descriptionHtml),
    salary: j.compensation?.compensationTierSummary,
    employmentType: j.employmentType,
    datePosted: j.publishedAt?.slice(0, 10),
    canonicalUrl: j.jobUrl,
  };
}

async function workable(): Promise<Posting | null> {
  // Workable's job search site (jobs.workable.com/jobs/<id>) serves the
  // posting as markdown with the company named, but no link to the board.
  if (host === 'jobs.workable.com') {
    const md = String(await get(url!.href));
    if (!md.startsWith('# ')) return null;
    const field = (k: string) => md.match(new RegExp(`\\*\\*${k}:\\*\\* *(.+)`))?.[1]?.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
    const body = md.slice(md.indexOf('\n## ') + 1 || 0);
    return {
      found: true,
      via: 'workable',
      title: md.match(/^# +(.+)/)?.[1]?.trim(),
      company: field('Company'),
      location: [field('Location'), field('Workplace')].filter(Boolean).join(', '),
      descriptionText: body.replace(/[#*]+ ?/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim(),
      employmentType: field('Employment type'),
      canonicalUrl: url!.href,
    };
  }
  if (host !== 'apply.workable.com') return null;
  let p = parts;
  // apply.workable.com/j/<code> redirects to /<company>/j/<code>.
  if (p[0] === 'j') {
    const res = await fetch(url!.href, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    p = new URL(res.url).pathname.split('/').filter(Boolean);
  }
  // apply.workable.com/api/v2/accounts/<company>/jobs/<code>
  if (p[0] === 'api') p = [p[3], 'j', p[5]];
  if (p.length < 3 || p[0] === 'j') return null;
  const slug = p[0];
  const code = p[p.length - 1].replace(/\.md$/, '');
  const res = await fetch(`https://apply.workable.com/api/v2/accounts/${slug}/jobs/${code}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (res.status === 404) {
    return { found: false, via: 'workable', hint: `Not on the live board: it has probably closed, or the link is old. Run checkBoard.ts workable ${slug} to see what's open now.` };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} from apply.workable.com`);
  const d = (await res.json()) as any;
  const where = [d.location?.city, d.location?.region].filter(Boolean).join(', ');
  return {
    found: true,
    via: 'workable',
    title: d.title,
    location: [where, d.workplace].filter(Boolean).join(', '),
    descriptionText: text([d.description, d.requirements, d.benefits].filter(Boolean).join('\n')),
    employmentType: d.type,
    datePosted: d.published?.slice(0, 10),
    canonicalUrl: `https://apply.workable.com/${slug}/j/${d.shortcode ?? code}/`,
  };
}

async function workday(): Promise<Posting | null> {
  if (!/myworkdayjobs\.com$/.test(host)) return null;
  // /<site>/job/<location>/<slug>_<id>  or  /<locale>/<site>/details/<slug>_<id>
  const anchor = parts.findIndex((p) => p === 'job' || p === 'details');
  if (anchor < 1) return null;
  const tenant = url!.hostname.split('.')[0];
  const cxs = `${url!.origin}/wday/cxs/${tenant}/${parts[anchor - 1]}/job/${parts.slice(anchor + 1).join('/')}`;
  const d = (await get(cxs, true)) as any;
  const j = d.jobPostingInfo;
  if (!j) return { found: false, via: 'workday', hint: 'Workday returned no posting: it has probably closed.' };
  return {
    found: true,
    via: 'workday',
    title: j.title,
    company: d.hiringOrganization?.name,
    location: [j.location, ...(j.additionalLocations ?? [])].filter(Boolean).join('; '),
    descriptionText: text(j.jobDescription),
    employmentType: j.timeType,
    datePosted: j.startDate ?? j.postedOn,
    canonicalUrl: j.externalUrl ?? url!.href,
  };
}

async function embedded(): Promise<Posting> {
  const html = (await get(url!.href)) as string;
  for (const [, block] of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: any;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }
    const items = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((c: any) => c?.['@graph'] ?? [c]);
    const j = items.find((i: any) => i?.['@type'] === 'JobPosting');
    if (!j) continue;
    const places = [j.jobLocation].flat().filter(Boolean);
    const where = places.map((p: any) => [p.address?.addressLocality, p.address?.addressRegion].filter(Boolean).join(', '));
    if (j.jobLocationType === 'TELECOMMUTE') where.push('Remote');
    const v = j.baseSalary?.value;
    const pay = v ? `${v.minValue ?? v.value ?? ''}${v.maxValue ? `-${v.maxValue}` : ''} ${j.baseSalary.currency ?? ''} ${v.unitText ?? ''}`.trim() : undefined;
    return {
      found: true,
      via: 'page data',
      title: j.title,
      company: j.hiringOrganization?.name,
      location: where.filter(Boolean).join('; ') || undefined,
      descriptionText: text(j.description),
      salary: pay,
      employmentType: [j.employmentType].flat().join(', ') || undefined,
      datePosted: j.datePosted,
      canonicalUrl: j.url ?? url!.href,
    };
  }
  return { found: false, hint: 'No job data in the page. Read it with WebFetch (or a web-fetch helper agent if WebFetch is not available), or ask them to paste the text.' };
}

async function main() {
  if (/indeed\./.test(host)) die({ error: 'indeed', hint: 'Never fetch Indeed. Ask them to paste the text.' });
  if (/linkedin\.com$/.test(host)) {
    const id = url!.pathname.match(/(\d{6,})/)?.[1] ?? url!.searchParams.get('currentJobId');
    die({ error: 'linkedin', hint: `Use scanLinkedIn.ts --fetch ${id ?? '<job id>'} instead.` });
  }
  const p = (await greenhouse()) ?? (await lever()) ?? (await ashby()) ?? (await workable()) ?? (await workday()) ?? (await embedded());
  if (p.found && saveAt) {
    const file = path.resolve(workspaceDir, saveAt);
    ensureDir(path.dirname(file));
    const job = {
      source: 'discovery',
      company: p.company ?? '',
      title: p.title,
      url: url!.href,
      canonicalUrl: p.canonicalUrl ?? url!.href,
      descriptionText: p.descriptionText,
      location: p.location,
    };
    writeFileSync(file, JSON.stringify(job, null, 2));
    out({ ...p, savedTo: path.relative(workspaceDir, file), note: p.company ? undefined : 'Fill in "company" in the saved file before addJob.ts.' });
    return;
  }
  out(p);
}

// Not reading a page is an answer, not a crash: report it and exit cleanly.
main().catch((e) => out({ found: false, error: 'fetch_failed', message: String(e?.message ?? e), hint: 'Read the page with WebFetch (or a web-fetch helper agent if WebFetch is not available), or ask them to paste the text.' }));
