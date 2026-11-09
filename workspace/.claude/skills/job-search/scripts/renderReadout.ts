/**
 * The application tracker: one page with the whole search at a glance.
 *
 *   renderReadout.ts [--open]
 *
 * Writes readouts/pipeline.html and prints its path. The page is
 * self-contained (no outside scripts or fonts), so the same file opens in a
 * browser and publishes as a private Claude artifact. Run it after every
 * status change.
 *
 * Sections: headline numbers, how far applications get (funnel), active
 * applications with days since the last news, recent activity with notes,
 * and the best open roles not yet applied to.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { getDb, out } from './db.ts';
import { readoutsDir, profileFiles, ensureDir } from './paths.ts';
import { esc, page } from './html.ts';

let staleAfterDays = 21;
let who = '';
try {
  const p = JSON.parse(readFileSync(profileFiles.searchProfile, 'utf8'));
  if (typeof p.staleAfterDays === 'number') staleAfterDays = p.staleAfterDays;
  who = p.name ?? '';
} catch {
  // defaults
}

const db = getDb();
const all = <T>(sql: string, ...a: unknown[]) => db.prepare(sql).all(...(a as never[])) as T[];

const STAGES = ['applied', 'screening', 'interview', 'offer'] as const;
const ACTIVE = ['applied', 'screening', 'interview', 'offer'];

// Furthest stage each job ever reached, from its history and its current status.
const reached = new Map<number, number>();
for (const r of all<{ job_id: number; status: string }>(
  `SELECT job_id, status FROM status_history UNION SELECT id, status FROM jobs`
)) {
  const i = STAGES.indexOf(r.status as (typeof STAGES)[number]);
  if (i >= 0) reached.set(r.job_id, Math.max(reached.get(r.job_id) ?? -1, i));
}
const atLeast = (i: number) => [...reached.values()].filter((v) => v >= i).length;
const found = (all<{ n: number }>(`SELECT COUNT(*) n FROM jobs`)[0]?.n ?? 0);
const scored = (all<{ n: number }>(`SELECT COUNT(*) n FROM jobs WHERE latest_score_id IS NOT NULL`)[0]?.n ?? 0);
const funnel = [
  { label: 'Found', n: found },
  { label: 'Scored', n: scored },
  { label: 'Applied', n: atLeast(0) },
  { label: 'Moved forward', n: atLeast(1) },
  { label: 'Interviewed', n: atLeast(2) },
  { label: 'Offer', n: atLeast(3) },
];
const applied = atLeast(0);
const rejectedAfterApplying = all<{ n: number }>(
  `SELECT COUNT(DISTINCT j.id) n FROM jobs j JOIN status_history h ON h.job_id = j.id
   WHERE j.status = 'rejected' AND h.status = 'applied'`
)[0]?.n ?? 0;
const responded = atLeast(1) + rejectedAfterApplying;
const closed = all<{ status: string; n: number }>(
  `SELECT status, COUNT(*) n FROM jobs WHERE status IN ('rejected','ghosted','withdrawn') GROUP BY status`
);

const daysSince = (ts: string | null) =>
  ts ? Math.floor((Date.now() - Date.parse(ts.replace(' ', 'T') + (ts.endsWith('Z') ? '' : 'Z'))) / 86400000) : null;

const active = all<{ id: number; company: string; title: string; status: string; status_updated_at: string; url: string; canonical_url: string | null }>(
  `SELECT id, company, title, status, status_updated_at, url, canonical_url FROM jobs
   WHERE status IN (${ACTIVE.map(() => '?').join(',')})
   ORDER BY CASE status WHEN 'offer' THEN 0 WHEN 'interview' THEN 1 WHEN 'screening' THEN 2 ELSE 3 END, status_updated_at DESC`,
  ...ACTIVE
);
const recent = all<{ job_id: number; company: string; title: string; status: string; note: string | null; changed_at: string }>(
  `SELECT h.job_id, j.company, j.title, h.status, h.note, h.changed_at FROM status_history h JOIN jobs j ON j.id = h.job_id
   WHERE h.status NOT IN ('new','scored') ORDER BY h.changed_at DESC, h.id DESC LIMIT 15`
);
const top = all<{ id: number; company: string; title: string; status: string; score: number; recommended_action: string; url: string; canonical_url: string | null; liveness: string | null; location: string | null }>(
  `SELECT j.id, j.company, j.title, j.status, s.score, s.recommended_action, j.url, j.canonical_url, j.liveness, j.location
   FROM jobs j JOIN job_scores s ON s.id = j.latest_score_id
   WHERE j.status IN ('scored','interested') AND s.score >= 70 AND COALESCE(j.liveness,'') NOT IN ('dead','removed')
   ORDER BY (j.status = 'interested') DESC, s.score DESC LIMIT 10`
);

const LABEL: Record<string, string> = {
  applied: 'Applied', screening: 'Screening', interview: 'Interviewing', offer: 'Offer', rejected: 'Rejected',
  ghosted: 'Ghosted', withdrawn: 'Withdrawn', interested: 'Want to apply', archived: 'Closed', ignored: 'Not interested',
};
const pill = (s: string) => `<span class="pill s-${esc(s)}">${esc(LABEL[s] ?? s)}</span>`;
const link = (r: { url: string; canonical_url: string | null }, text: string) =>
  `<a href="${esc(r.canonical_url ?? r.url)}" target="_blank" rel="noopener">${esc(text)}</a>`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

const isQuiet = (a: (typeof active)[number]) => {
  const d = daysSince(a.status_updated_at);
  return d !== null && d >= staleAfterDays && a.status !== 'offer';
};
const fresh = active.filter((a) => !isQuiet(a));
const quiet = active.filter(isQuiet).sort((x, y) => (y.status_updated_at ?? '').localeCompare(x.status_updated_at ?? ''));
const activeRow = (a: (typeof active)[number]) => {
  const d = daysSince(a.status_updated_at);
  const q = isQuiet(a);
  return `<li class="row${q ? ' quiet' : ''}"><div class="main">${link(a, a.title)}<div class="muted small">${esc(a.company)} · #${a.id}</div></div><div class="side">${pill(a.status)}<div class="small ${q ? 'warn' : 'muted'}">${d === null ? '' : d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago`}</div></div></li>`;
};

const max = Math.max(1, ...funnel.map((f) => f.n));
const updated = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

const body = `
<header>
  <h1>Application Tracker</h1>
  <div class="muted small">${who ? `${esc(who)} · ` : ''}Updated ${esc(updated)}</div>
</header>

<section class="kpis">
  <div class="kpi"><div class="v">${fresh.length}</div><div class="l">Active, recent news</div></div>
  <div class="kpi"><div class="v">${active.filter((a) => a.status === 'interview').length}</div><div class="l">Interviewing now</div></div>
  <div class="kpi"><div class="v">${applied}</div><div class="l">Applied, all time</div></div>
  <div class="kpi"><div class="v">${pct(responded, applied)}</div><div class="l">Got a reply</div></div>
</section>

<h2>How far applications get</h2>
<section class="funnel">
${funnel
  .map(
    (f) => `<div class="frow"><div class="flabel">${f.label}</div><div class="fbar"><span style="width:${Math.max(f.n ? 2 : 0, (f.n / max) * 100).toFixed(1)}%"></span></div><div class="fn">${f.n}</div></div>`
  )
  .join('\n')}
</section>
${closed.length ? `<p class="muted small">Closed: ${closed.map((c) => `${c.n} ${esc((LABEL[c.status] ?? c.status).toLowerCase())}`).join(', ')}.</p>` : ''}

<h2>Active applications</h2>
${active.length ? '' : `<p class="muted">Nothing in progress yet. When you apply somewhere, say so and it shows up here.</p>`}
${fresh.length ? `<ul class="rows">${fresh.map(activeRow).join('\n')}</ul>` : active.length ? `<p class="muted">Nothing has moved in the last ${staleAfterDays} days.</p>` : ''}
${
  quiet.length
    ? `<details class="quietgroup"><summary><span class="warn">${quiet.length} gone quiet</span> <span class="muted small">· no news in ${staleAfterDays}+ days. Worth a follow-up, or calling it ghosted.</span></summary><ul class="rows">${quiet.map(activeRow).join('\n')}</ul></details>`
    : ''
}

<h2>Recent activity</h2>
${
  recent.length
    ? `<ol class="timeline">${recent
        .map(
          (r) => `<li><div class="small muted">${esc(r.changed_at.slice(0, 10))}</div><div>${pill(r.status)} <strong>${esc(r.company)}</strong> · ${esc(r.title)}</div>${r.note ? (r.note.length > 240 ? `<details class="small note"><summary>${esc(r.note.slice(0, 200).replace(/\s+\S*$/, ''))}…</summary>${esc(r.note)}</details>` : `<div class="small note">${esc(r.note)}</div>`) : ''}</li>`
        )
        .join('\n')}</ol>`
    : `<p class="muted">No activity yet.</p>`
}

<h2>Best open roles, not applied yet</h2>
${
  top.length
    ? `<ul class="rows">${top
        .map(
          (t) => `<li class="row"><div class="main">${link(t, t.title)}<div class="muted small">${esc(t.company)}${t.location ? ` · ${esc(t.location)}` : ''} · #${t.id}</div></div><div class="side"><span class="score">${t.score}</span>${t.status === 'interested' ? pill('interested') : ''}</div></li>`
        )
        .join('\n')}</ul>`
    : `<p class="muted">No scored roles at 70 or above yet. Say "find new jobs" to look.</p>`
}

<p class="muted small foot">"Got a reply" counts any answer after applying, rejections included. "Moved forward" means a screen or better. A role goes quiet after ${staleAfterDays} days with no news.</p>
`;

const css = `
header { margin-bottom: 24px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 640px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
.kpi { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.kpi .v { font-size: 1.6rem; font-weight: 650; font-variant-numeric: tabular-nums; }
.kpi .l { color: var(--muted); font-size: 0.85rem; }
.funnel { display: grid; gap: 8px; }
.frow { display: grid; grid-template-columns: 112px 1fr 44px; gap: 10px; align-items: center; }
.flabel { font-size: 0.9rem; }
.fbar { height: 14px; background: var(--accent-soft); border-radius: 4px; overflow: hidden; }
.fbar span { display: block; height: 100%; background: var(--accent); border-radius: 4px; }
.fn { text-align: right; font-variant-numeric: tabular-nums; }
.rows { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.row { display: flex; justify-content: space-between; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--line); }
.row:first-child { border-top: 0; }
.row .main { min-width: 0; overflow-wrap: anywhere; }
.row .side { text-align: right; flex-shrink: 0; }
.row.quiet { box-shadow: inset 3px 0 0 var(--warn); }
.warn { color: var(--warn); }
.quietgroup { margin-top: 12px; }
.quietgroup summary { cursor: pointer; padding: 8px 0; }
.quietgroup .rows { margin-top: 8px; }
.pill { display: inline-block; font-size: 0.78rem; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); white-space: nowrap; }
.s-interview, .s-offer { border-color: var(--good); color: var(--good); }
.s-screening { border-color: var(--accent); color: var(--accent); }
.s-rejected, .s-withdrawn { color: var(--muted); }
.s-ghosted { border-color: var(--warn); color: var(--warn); }
.score { font-weight: 650; font-variant-numeric: tabular-nums; margin-right: 6px; }
.timeline { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--line); }
.timeline li { margin: 0 0 14px; position: relative; }
.timeline li::before { content: ""; position: absolute; left: -20px; top: 7px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
.note { color: var(--muted); margin-top: 2px; overflow-wrap: anywhere; }
details.note summary { cursor: pointer; list-style: none; }
details.note summary::-webkit-details-marker { display: none; }
details.note[open] summary { display: none; }
.foot { margin-top: 40px; }
`;

ensureDir(readoutsDir);
const file = path.join(readoutsDir, 'pipeline.html');
writeFileSync(file, page('Application Tracker', body, css));
if (process.argv.includes('--open')) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  execFile(cmd, [file], () => {});
}
out({ file, active: active.length, goneQuiet: quiet.length, applied, topOpen: top.length });
