/**
 * Starts the metrics walkthrough: copies every line of the baseline resume
 * that carries a number into profile/verified-metrics.md as `unverified`,
 * so nothing is used until the person has said where it comes from.
 *
 *   seedMetrics.ts
 *
 * Safe to re-run: a claim already in the file (same heading) is left alone,
 * including whatever status the person gave it.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { profileFiles, templatesDir } from './paths.ts';
import { out, die } from './db.ts';

if (!existsSync(profileFiles.baselineResume)) {
  die({ error: 'no_baseline', hint: 'The resume step comes first: there is no profile/baseline-resume.json yet.' });
}
const r = JSON.parse(readFileSync(profileFiles.baselineResume, 'utf8'));
if (!existsSync(profileFiles.verifiedMetrics)) {
  copyFileSync(path.join(templatesDir, 'profile', 'verified-metrics.md'), profileFiles.verifiedMetrics);
}
let md = readFileSync(profileFiles.verifiedMetrics, 'utf8');
const existing = new Set([...md.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].trim().toLowerCase()));

// Lines with a figure in them. Plain years alone ("2019 – 2023") aren't claims.
const hasFigure = (s: string) => /\d/.test(s.replace(/\b(19|20)\d{2}\b/g, ''));
const candidates: { claim: string; where: string }[] = [];
for (const s of String(r.summary ?? '').split(/(?<=[.!?])\s+/)) {
  if (hasFigure(s)) candidates.push({ claim: s.trim(), where: 'summary' });
}
for (const job of r.experience ?? []) {
  for (const role of job.roles ?? []) {
    for (const b of role.bullets ?? []) {
      if (hasFigure(b)) candidates.push({ claim: b.trim(), where: `${role.title}, ${job.company}` });
    }
  }
}
for (const sec of r.sections ?? []) {
  for (const item of sec.items ?? []) if (hasFigure(item)) candidates.push({ claim: item.trim(), where: sec.heading });
}

const added: string[] = [];
for (const c of candidates) {
  const heading = c.claim.replace(/\s+/g, ' ').replace(/\.$/, '');
  if (existing.has(heading.toLowerCase())) continue;
  existing.add(heading.toLowerCase());
  md = md.replace(/\s*$/, '\n\n');
  md += `### ${heading}\nStatus: unverified\nUse: anywhere\nSource: \nNotes: From the baseline resume (${c.where}).\n`;
  added.push(heading);
}
writeFileSync(profileFiles.verifiedMetrics, md);
const total = [...md.matchAll(/^Status:\s*(\S+)/gim)].map((m) => m[1].toLowerCase());
out({
  added: added.length,
  claims: added,
  totals: {
    confirmed: total.filter((s) => s === 'confirmed').length,
    unverified: total.filter((s) => s === 'unverified').length,
    doNotUse: total.filter((s) => s === 'do-not-use').length,
  },
});
