/**
 * Stores profile/baseline-resume.json as the current baseline resume version.
 *
 * Every score records which baseline it was made against, so run this after
 * onboarding builds the baseline and whenever the person says their resume
 * has really changed. Re-running with no changes is a no-op.
 *
 * Shape: templates/resume.schema.json. RESUME_JSON_PATH overrides the path.
 */
import { readFileSync, existsSync } from 'node:fs';
import { getDb, out, die } from './db.ts';
import { profileFiles } from './paths.ts';

const RESUME_JSON_PATH = process.env.RESUME_JSON_PATH ?? profileFiles.baselineResume;

interface Role { title: string; dates: string; bullets: string[] }
interface Resume {
  header: { name: string; headline?: string; location?: string; email?: string; phone?: string; links?: { label?: string; url: string }[] };
  summary: string;
  skills?: { category: string; items: string[] }[];
  experience: { company: string; location?: string; roles: Role[] }[];
  education?: { institution: string; location?: string; dates?: string; credential?: string; field?: string }[];
  certifications?: { name: string; issuer?: string; date?: string }[];
  sections?: { heading: string; items: string[] }[];
}

/** The markdown form is what scoring reads, so it carries everything. */
export function toMarkdown(r: Resume): string {
  const L: string[] = [];
  const h = r.header;
  L.push(`# ${h.name}`);
  L.push([h.headline, h.location, h.email, h.phone, ...(h.links ?? []).map((l) => l.url)].filter(Boolean).join(' | '));
  L.push('', '## Summary', r.summary, '');
  if (r.skills?.length) {
    L.push('## Skills');
    for (const s of r.skills) L.push(`- **${s.category}:** ${s.items.join(', ')}`);
    L.push('');
  }
  L.push('## Experience');
  for (const job of r.experience) {
    L.push(`### ${[job.company, job.location].filter(Boolean).join(', ')}`);
    for (const role of job.roles ?? []) {
      L.push(`**${role.title}** | ${role.dates}`);
      for (const b of role.bullets) L.push(`- ${b}`);
      L.push('');
    }
  }
  if (r.education?.length) {
    L.push('## Education');
    for (const e of r.education) {
      const detail = [e.credential, e.field, e.dates].filter(Boolean).join(' | ');
      L.push(`- ${[e.institution, e.location].filter(Boolean).join(', ')}${detail ? ` (${detail})` : ''}`);
    }
    L.push('');
  }
  if (r.certifications?.length) {
    L.push('## Certifications');
    for (const c of r.certifications) L.push(`- ${[c.name, c.issuer, c.date].filter(Boolean).join(', ')}`);
    L.push('');
  }
  for (const s of r.sections ?? []) {
    L.push(`## ${s.heading}`);
    for (const i of s.items) L.push(`- ${i}`);
    L.push('');
  }
  return L.join('\n').trim() + '\n';
}

function main() {
  if (!existsSync(RESUME_JSON_PATH)) {
    die({ error: 'resume_json_not_found', path: RESUME_JSON_PATH, hint: 'Onboarding builds this from their resume file.' });
  }
  const resume = JSON.parse(readFileSync(RESUME_JSON_PATH, 'utf8')) as Resume;
  if (!resume.header?.name || !resume.summary || !Array.isArray(resume.experience)) {
    die({ error: 'invalid_resume', hint: 'Needs header.name, summary and experience[]. See templates/resume.schema.json.' });
  }
  const json = JSON.stringify(resume);
  const markdown = toMarkdown(resume);

  const db = getDb();
  const current = db
    .prepare("SELECT id, content_json FROM resume_versions WHERE kind = 'baseline' AND is_current_baseline = 1")
    .get() as { id: number; content_json: string } | undefined;
  if (current && current.content_json === json) {
    out({ resumeVersionId: current.id, unchanged: true });
    return;
  }

  db.exec("UPDATE resume_versions SET is_current_baseline = 0 WHERE kind = 'baseline'");
  const result = db
    .prepare(
      `INSERT INTO resume_versions (kind, job_id, label, content_json, content_markdown, is_current_baseline)
       VALUES ('baseline', NULL, ?, ?, ?, 1)`
    )
    .run(`baseline ${new Date().toISOString().slice(0, 10)}`, json, markdown);

  out({ resumeVersionId: Number(result.lastInsertRowid), markdownLength: markdown.length });
}

main();
