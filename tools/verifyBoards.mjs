#!/usr/bin/env node
/**
 * Builds references/company-boards.json from a candidate list by checking every
 * board against its live API. Only boards that answer are kept, so onboarding
 * never offers a dead slug.
 *
 *   node tools/verifyBoards.mjs tools/board-candidates.json > workspace/.claude/skills/job-search/references/company-boards.json
 *
 * Candidate shape: { "industry": [ { "company": "...", "ats": "greenhouse|lever|ashby|workday", "slug": "...", "site"?: "...", "tenant"?: "..." } ] }
 * For Workday, the wdN host number varies, so wd1..wd12 and wd103 are tried.
 */
import { readFileSync } from 'node:fs';

const candidates = JSON.parse(readFileSync(process.argv[2], 'utf8'));

async function ok(url, init) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function verify(c) {
  if (c.ats === 'greenhouse') {
    const d = await ok(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs`);
    return d && { company: c.company, ats: 'greenhouse', slug: c.slug, openings: d.jobs?.length ?? 0 };
  }
  if (c.ats === 'lever') {
    const d = await ok(`https://api.lever.co/v0/postings/${c.slug}?mode=json`);
    return Array.isArray(d) && { company: c.company, ats: 'lever', slug: c.slug, openings: d.length };
  }
  if (c.ats === 'ashby') {
    const d = await ok(`https://api.ashbyhq.com/posting-api/job-board/${c.slug}`);
    return d?.jobs && { company: c.company, ats: 'ashby', slug: c.slug, openings: d.jobs.length };
  }
  if (c.ats === 'workday') {
    const tenant = c.tenant ?? c.slug;
    for (const n of [5, 1, 12, 3, 103, 10, 2, 4, 6, 7, 8, 9, 11]) {
      const origin = `https://${tenant}.wd${n}.myworkdayjobs.com`;
      const d = await ok(`${origin}/wday/cxs/${tenant}/${c.site}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: '' }),
      });
      if (d && typeof d.total === 'number') {
        return { company: c.company, ats: 'workday', url: `${origin}/${c.site}`, openings: d.total };
      }
    }
    return null;
  }
  return null;
}

const outIndustries = {};
const failed = [];
for (const [industry, list] of Object.entries(candidates)) {
  const results = await Promise.all(list.map(async (c) => [c, await verify(c)]));
  outIndustries[industry] = results.filter(([, r]) => r).map(([, r]) => r);
  for (const [c, r] of results) if (!r) failed.push(`${industry}: ${c.company} (${c.ats} ${c.slug}${c.site ? '/' + c.site : ''})`);
}

process.stderr.write(`kept ${Object.values(outIndustries).flat().length}, dropped ${failed.length}\n${failed.join('\n')}\n`);
process.stdout.write(
  JSON.stringify(
    {
      _note:
        'Verified live by tools/verifyBoards.mjs. Onboarding offers these by industry; picked ones go into profile/sources.json (greenhouse/lever/ashby as slugs, workday as {company, url}). openings is the board size on the day it was checked.',
      verifiedOn: new Date().toISOString().slice(0, 10),
      industries: outIndustries,
    },
    null,
    2
  ) + '\n'
);
