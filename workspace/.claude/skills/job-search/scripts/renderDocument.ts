/**
 * Turns a tailored resume and cover letter into PDFs an employer can read and
 * an applicant tracking system can parse: one column, real text, system fonts.
 *
 *   renderDocument.ts <application-slug> [--a4]
 *     reads  applications/<slug>/resume.json and cover-letter.json
 *     writes applications/<slug>/<Name> - <Role>.pdf
 *            applications/<slug>/<Name> - <Role> - Cover Letter.pdf
 *            applications/<slug>/<Name> - <Role> - Cover Letter and Resume.pdf
 *   renderDocument.ts --baseline [--a4]
 *     writes profile/<Name> - Resume.pdf from the baseline, to check the layout
 *
 * The letterhead always comes from the baseline header, so it can't drift.
 * Run scripts/auditProse.ts on both files first; this does not check content.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { applicationsDir, profileDir, profileFiles, ensureDir } from './paths.ts';
import { esc, fileSafe } from './html.ts';
import { findChrome, loadPlaywright } from './browserSession.ts';
import { out, die } from './db.ts';

interface Link { label?: string; url: string }
interface Header { name: string; headline?: string; location?: string; email?: string; phone?: string; links?: Link[] }
interface Resume {
  header: Header;
  targetRole?: string;
  summary: string;
  skills?: { category: string; items: string[] }[];
  experience: { company: string; location?: string; roles: { title: string; dates: string; bullets: string[] }[] }[];
  education?: { institution: string; location?: string; dates?: string; credential?: string; field?: string }[];
  certifications?: { name: string; issuer?: string; date?: string }[];
  sections?: { heading: string; items: string[] }[];
}
interface Letter {
  role: string; company: string; date?: string;
  recipient?: { name?: string; title?: string; company?: string; location?: string };
  greeting?: string; body: string[]; closing?: string; signature?: string;
}

const CSS = `
@page { margin: 0.55in 0.65in; }
* { box-sizing: border-box; }
body { margin: 0; color: #111; font: 10.5pt/1.38 Arial, Helvetica, sans-serif; }
.doc + .doc { break-before: page; }
.head h1 { font-size: 20pt; margin: 0; }
.head .headline { font-size: 11pt; margin-top: 2px; }
.head .contact { font-size: 9.5pt; color: #333; margin-top: 4px; }
.head { padding-bottom: 8px; border-bottom: 1px solid #999; margin-bottom: 10px; }
h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: 0.06em; margin: 14px 0 6px; }
.co { margin-top: 8px; break-inside: avoid-page; }
.co-line, .role-line { display: flex; justify-content: space-between; gap: 12px; }
.co-line { font-weight: 700; }
.role-line { font-style: italic; margin-top: 2px; }
ul { margin: 3px 0 0 0; padding-left: 16px; }
li { margin: 2px 0; }
p { margin: 0 0 10px; }
.letter { font-size: 11pt; line-height: 1.5; }
.letter .date, .letter .to { margin: 14px 0; }
.letter .sign { margin-top: 18px; }
a { color: inherit; text-decoration: none; }
`;

function header(h: Header): string {
  const contact = [h.location, h.email, h.phone, ...(h.links ?? []).map((l) => l.url.replace(/^https?:\/\/(www\.)?/, ''))]
    .filter(Boolean)
    .map(esc)
    .join(' &nbsp;|&nbsp; ');
  return `<div class="head"><h1>${esc(h.name)}</h1>${h.headline ? `<div class="headline">${esc(h.headline)}</div>` : ''}<div class="contact">${contact}</div></div>`;
}

function resumeHtml(r: Resume): string {
  const L: string[] = [header(r.header)];
  if (r.summary) L.push(`<h2>Summary</h2><p>${esc(r.summary)}</p>`);
  L.push('<h2>Experience</h2>');
  for (const job of r.experience ?? []) {
    L.push(`<div class="co"><div class="co-line"><span>${esc(job.company)}</span><span>${esc(job.location ?? '')}</span></div>`);
    for (const role of job.roles ?? []) {
      L.push(`<div class="role-line"><span>${esc(role.title)}</span><span>${esc(role.dates)}</span></div>`);
      if (role.bullets?.length) L.push(`<ul>${role.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`);
    }
    L.push('</div>');
  }
  if (r.skills?.length) {
    L.push('<h2>Skills</h2>');
    for (const s of r.skills) L.push(`<p style="margin:0 0 3px"><strong>${esc(s.category)}:</strong> ${s.items.map(esc).join(', ')}</p>`);
  }
  if (r.education?.length) {
    L.push('<h2>Education</h2>');
    for (const e of r.education) {
      const what = [e.credential, e.field].filter(Boolean).join(', ');
      L.push(`<div class="co-line" style="font-weight:400"><span><strong>${esc(e.institution)}</strong>${what ? `, ${esc(what)}` : ''}</span><span>${esc(e.dates ?? '')}</span></div>`);
    }
  }
  if (r.certifications?.length) {
    L.push('<h2>Certifications</h2><ul>');
    for (const c of r.certifications) L.push(`<li>${esc([c.name, c.issuer, c.date].filter(Boolean).join(', '))}</li>`);
    L.push('</ul>');
  }
  for (const s of r.sections ?? []) L.push(`<h2>${esc(s.heading)}</h2><ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`);
  return `<div class="doc">${L.join('\n')}</div>`;
}

function letterHtml(l: Letter, h: Header): string {
  const date = l.date ?? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const to = l.recipient ? [l.recipient.name, l.recipient.title, l.recipient.company ?? l.company, l.recipient.location].filter(Boolean) : [];
  return `<div class="doc letter">${header(h)}
<div class="date">${esc(date)}</div>
${to.length ? `<div class="to">${to.map(esc).join('<br>')}</div>` : ''}
<p><strong>Re: ${esc(l.role)}</strong></p>
<p>${esc(l.greeting ?? 'Hello,')}</p>
${l.body.map((p) => `<p>${esc(p)}</p>`).join('\n')}
<div class="sign">${esc(l.closing ?? 'Thank you,')}<br>${esc(l.signature ?? h.name)}</div></div>`;
}

const wrap = (title: string, inner: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${inner}</body></html>`;

async function toPdf(jobs: { html: string; file: string }[], a4: boolean) {
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch({ headless: true, ...(findChrome() ? { channel: 'chrome' } : {}) });
  try {
    const page = await browser.newPage();
    for (const j of jobs) {
      await page.setContent(j.html, { waitUntil: 'load' });
      await page.pdf({ path: j.file, format: a4 ? 'A4' : 'Letter', printBackground: true, preferCSSPageSize: true });
    }
  } finally {
    await browser.close();
  }
}

const readJson = <T>(p: string, what: string): T => {
  if (!existsSync(p)) die({ error: 'missing_file', file: p, hint: `No ${what} yet.` });
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch (e) {
    return die({ error: 'bad_json', file: p, message: String(e) }) as never;
  }
};

const args = process.argv.slice(2);
const a4 = args.includes('--a4');
const baseline = readJson<Resume>(profileFiles.baselineResume, 'baseline resume (onboarding step "resume")');
const name = baseline.header.name;

if (args.includes('--baseline')) {
  const file = path.join(profileDir, fileSafe(`${name} - Resume.pdf`));
  await toPdf([{ html: wrap(`${name} - Resume`, resumeHtml(baseline)), file }], a4);
  out({ written: [file] });
} else {
  const slug = args.find((a) => !a.startsWith('--'));
  if (!slug) die({ error: 'usage', hint: 'renderDocument.ts <application-slug> | --baseline' });
  const dir = path.join(applicationsDir, slug!);
  const resume = readJson<Resume>(path.join(dir, 'resume.json'), 'tailored resume for this application');
  resume.header = { ...baseline.header, ...resume.header };
  const letterPath = path.join(dir, 'cover-letter.json');
  const letter = existsSync(letterPath) ? readJson<Letter>(letterPath, 'cover letter') : null;
  const role = letter?.role ?? resume.targetRole ?? slug!;
  const base = fileSafe(`${name} - ${role}`);
  const rHtml = resumeHtml(resume);
  const jobs = [{ html: wrap(`${name} - ${role}`, rHtml), file: path.join(dir, `${base}.pdf`) }];
  if (letter) {
    const lHtml = letterHtml(letter, baseline.header);
    jobs.push({ html: wrap(`${name} - ${role} - Cover Letter`, lHtml), file: path.join(dir, `${base} - Cover Letter.pdf`) });
    jobs.push({ html: wrap(`${name} - ${role} - Cover Letter and Resume`, lHtml + rHtml), file: path.join(dir, `${base} - Cover Letter and Resume.pdf`) });
  }
  ensureDir(dir);
  await toPdf(jobs, a4);
  out({ written: jobs.map((j) => j.file), ...(letter ? {} : { note: 'No cover-letter.json, so only the resume was rendered. Every application gets a letter.' }) });
}
