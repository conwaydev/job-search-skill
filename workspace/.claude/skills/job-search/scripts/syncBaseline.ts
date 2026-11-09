import { readFileSync, existsSync } from 'node:fs';
import { getDb, out, die } from './db.ts';

import { profileFiles } from './paths.ts';

const RESUME_JSON_PATH = process.env.RESUME_JSON_PATH ?? profileFiles.baselineResume;

interface ResumeData {
  header: { name: string; title: string; location: string; phone: string; url: string };
  summary: string;
  competencies: { category: string; items: string[] }[];
  experience: {
    company: string;
    location: string;
    title: string;
    dates: string;
    bullets: string[];
    earlierRoles?: { titles: string; bullets: string[] };
  }[];
  earlierCareer: { heading: string; jobs: { company: string; location: string; title: string; dates: string; bullets: string[] }[] };
  awards: { heading: string; items: string[] };
}

function toMarkdown(r: ResumeData): string {
  const lines: string[] = [];
  lines.push(`# ${r.header.name}`);
  lines.push(`${r.header.title} | ${r.header.location} | ${r.header.phone}`);
  lines.push('');
  lines.push('## Professional Summary');
  lines.push(r.summary);
  lines.push('');
  // Heading is "Skills" (renamed from "Core Competencies" 2026-08-14): every ATS
  // parser recognizes it, while "Core Competencies" is sometimes folded into the
  // summary instead of parsed as skill entities. The JSON key stays `competencies`.
  lines.push('## Skills');
  for (const c of r.competencies) lines.push(`- **${c.category}:** ${c.items.join(' • ')}`);
  lines.push('');
  lines.push('## Professional Experience');
  for (const job of r.experience) {
    lines.push(`### ${job.company}, ${job.location}`);
    if (job.title) lines.push(`${job.title} | ${job.dates}`);
    if (job.bullets) for (const b of job.bullets) lines.push(`- ${b}`);
    // Multi-title tenures split into dated sub-sections (see `roles` in resume.ts).
    if (job.roles) {
      for (const role of job.roles) {
        lines.push(`${role.title} | ${role.dates}`);
        for (const b of role.bullets) lines.push(`- ${b}`);
        lines.push('');
      }
    }
    if (job.earlierRoles) {
      lines.push(`Earlier roles: ${job.earlierRoles.titles}`);
      for (const b of job.earlierRoles.bullets) lines.push(`- ${b}`);
    }
    lines.push('');
  }
  lines.push(`### ${r.earlierCareer.heading}`);
  for (const job of r.earlierCareer.jobs) {
    lines.push(`**${job.company}, ${job.location}** (${job.title}, ${job.dates})`);
    for (const b of job.bullets) lines.push(`- ${b}`);
  }
  if (r.education) {
    lines.push('');
    lines.push(`## ${r.education.heading}`);
    for (const e of r.education.entries) {
      const detail = [e.credential, e.field, e.dates].filter(Boolean).join(' | ');
      lines.push(`**${e.institution}, ${e.location}**${detail ? ` — ${detail}` : ''}`);
    }
  }
  lines.push('');
  lines.push(`## ${r.awards.heading}`);
  for (const a of r.awards.items) lines.push(`- ${a}`);
  return lines.join('\n');
}

function main() {
  if (!existsSync(RESUME_JSON_PATH)) {
    die({ error: 'resume_json_not_found', path: RESUME_JSON_PATH });
  }
  const resume: ResumeData = JSON.parse(readFileSync(RESUME_JSON_PATH, 'utf8'));
  const markdown = toMarkdown(resume);

  const db = getDb();
  db.exec("UPDATE resume_versions SET is_current_baseline = 0 WHERE kind = 'baseline'");
  const result = db
    .prepare(
      `INSERT INTO resume_versions (kind, job_id, label, content_json, content_markdown, is_current_baseline)
       VALUES ('baseline', NULL, ?, ?, ?, 1)`
    )
    .run(`synced from ${RESUME_JSON_PATH}`, JSON.stringify(resume), markdown);

  out({ resumeVersionId: Number(result.lastInsertRowid), markdownLength: markdown.length });
}

main();
