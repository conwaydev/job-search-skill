/**
 * Who got the job? Looks up people who now hold a title at a company, using
 * the person's signed-in LinkedIn session, so a rejected or ghosted application can
 * be compared against the background of whoever was hired.
 *
 *   node --no-warnings scripts/peopleLookup.ts "<company>" "<title>" [--profiles 3]
 *
 * Writes the rendered text of the people search and of each top match's full
 * profile (overview with About expanded, experience, education, skills,
 * certifications, plus the Posts, Comments and Reactions tabs, scrolled) to
 * data/people-research/<company>--<title>.txt. It only reads
 * public profile pages the person could open themselves, sends nothing, and contacts no
 * one. Keep conclusions in the job notes as patterns ("came up through PLG
 * product engineering"), not as a file on a person.
 *
 * Hires often take weeks to show up on LinkedIn, so a posting under about two
 * months old frequently has no visible match yet. Report that as "no clear
 * match", never as a guess.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openContext, captureFrom, sessionStatus } from './browserSession.ts';
import { peopleResearchDir } from './paths.ts';

/**
 * Click through the whole profile, not just the overview.
 * The overview shows only a preview of Activity (eight items for Alex Takacs),
 * and the About section is cut at "more". So this expands "see more", then opens
 * the full Posts and Comments tabs and scrolls each so nothing sits below the fold.
 * Returns labelled text blocks. A thin read is the thing this exists to prevent.
 */
async function readFullProfile(page: any, base: string): Promise<string[]> {
  const parts: string[] = [];
  const settle = async (ms = 3000) => page.waitForTimeout(ms + Math.random() * 1500);
  const guard = () => {
    if (/\/(login|authwall|checkpoint)/.test(page.url())) throw new Error(`session rejected: ${page.url()}`);
  };
  const text = (n: number) => page.evaluate((max: number) => (document.querySelector('main')?.innerText ?? '').slice(0, max), n);
  const scroll = async (rounds: number) => {
    for (let i = 0; i < rounds; i++) {
      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(1200);
    }
  };

  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  guard();
  await settle();
  // Expand the truncated About and any "…more" text before reading.
  // Only buttons inside <main> whose whole label is "more"; a broader match hit
  // site navigation and sent the page to the home feed (2026-11-06).
  for (const b of await page.locator('main button').filter({ hasText: /^\s*(…|\.\.\.)?\s*(see )?more\s*$/i }).all()) {
    await b.click({ timeout: 1500 }).catch(() => {});
    if (!page.url().includes(base.split('/in/')[1] ?? '/in/')) {
      await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle();
    }
  }
  await scroll(3);
  parts.push('## overview', await text(12000));

  for (const section of ['/details/experience/', '/details/education/', '/details/skills/', '/details/certifications/', '/details/projects/', '/details/publications/', '/details/honors/', '/details/volunteering-experiences/']) {
    try {
      await page.goto(base + section, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
      // A flaky subpage (net::ERR_ABORTED) must not lose the whole run.
      parts.push(`## ${section}`, `(skipped: ${String(e).split('\n')[0]})`);
      continue;
    }
    guard();
    await settle(2500);
    // LinkedIn redirects an empty section back to the profile; keep only real pages.
    if (!page.url().includes('/details/')) continue;
    await scroll(2);
    parts.push(`## ${section}`, await text(12000));
  }

  // Posts, comments and reactions each get their own tab, scrolled to load past the first screen.
  for (const tab of ['all', 'comments', 'reactions']) {
    await page.goto(`${base}/recent-activity/${tab}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    guard();
    await settle(4000);
    await scroll(5);
    parts.push(`## activity: ${tab}`, await text(25000));
  }
  return parts;
}

const args = process.argv.slice(2);
// --urls <file>: skip the search and read the listed profiles (one URL per line).
if (args[0] === '--urls') {
  const { readFileSync } = await import('node:fs');
  const urls = readFileSync(args[1], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  if (!sessionStatus('linkedin').ok) {
    console.error('not signed in to linkedin. Run: scripts/login.ts linkedin');
    process.exit(1);
  }
  const dir = path.join(peopleResearchDir, 'profiles');
  mkdirSync(dir, { recursive: true });
  const { context, close } = await openContext('linkedin', false);
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    for (const u of urls) {
      const base = u.replace(/\/$/, '');
      const parts: string[] = [`# ${base}`, ...(await readFullProfile(page, base))];
      const name = base.split('/in/')[1] ?? 'profile';
      writeFileSync(path.join(dir, `${name}.txt`), parts.join('\n\n'));
      console.log(name);
      await page.waitForTimeout(4000 + Math.random() * 3000);
    }
    await captureFrom(context, 'linkedin');
  } finally {
    await close();
  }
  process.exit(0);
}
const [company, title] = args;
const profiles = Number(args[args.indexOf('--profiles') + 1]) || 3;
if (!company || !title) {
  console.error('usage: peopleLookup.ts "<company>" "<title>" [--profiles 3]');
  process.exit(2);
}
const status = sessionStatus('linkedin');
if (!status.ok) {
  console.error(`not signed in to linkedin (${status.reason}). Run: scripts/login.ts linkedin`);
  process.exit(1);
}

const outDir = peopleResearchDir;
mkdirSync(outDir, { recursive: true });
const slug = `${company}--${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const out: string[] = [`# ${title} at ${company}`, `searched ${new Date().toISOString()}`, ''];

const { context, close } = await openContext('linkedin', false);
try {
  const page = context.pages()[0] ?? (await context.newPage());
  const keywords = encodeURIComponent(`${title} ${company}`);
  await page.goto(`https://www.linkedin.com/search/results/people/?keywords=${keywords}&origin=GLOBAL_SEARCH_HEADER`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  if (/\/(login|authwall|checkpoint)/.test(page.url())) throw new Error(`session rejected: ${page.url()}`);
  await page.waitForTimeout(3500);

  const results: { href: string; text: string }[] = await page.evaluate(() => {
    const seen = new Set<string>();
    const rows: { href: string; text: string }[] = [];
    for (const a of Array.from(document.querySelectorAll('a[href*="/in/"]')) as HTMLAnchorElement[]) {
      const href = a.href.split('?')[0];
      if (seen.has(href)) continue;
      const card = a.closest('li') ?? a.parentElement;
      const text = (card?.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text.length < 20) continue;
      seen.add(href);
      rows.push({ href, text: text.slice(0, 400) });
    }
    return rows;
  });

  out.push('## Search results', ...results.map((r, i) => `${i + 1}. ${r.text}\n   ${r.href}`), '');

  // Only open profiles whose card mentions the company, to stay on target.
  const wanted = results.filter((r) => r.text.toLowerCase().includes(company.toLowerCase().split(' ')[0])).slice(0, profiles);
  for (const r of wanted) {
    await page.waitForTimeout(2500 + Math.random() * 2000);
    out.push(`## ${r.href}`, ...(await readFullProfile(page, r.href.replace(/\/$/, ''))), '');
  }
  await captureFrom(context, 'linkedin');
} finally {
  await close();
}

const file = path.join(outDir, `${slug}.txt`);
writeFileSync(file, out.join('\n'));
console.log(file);
