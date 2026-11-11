/**
 * The application tracker: one page with the whole search at a glance.
 *
 *   renderReadout.ts [--open]
 *
 * Writes readouts/pipeline.html and prints its path. Everything comes from
 * jobs.db, so it opens offline in a browser and publishes as a private Claude
 * artifact. It uses the same system font and colors as the prep pages, and
 * loads nothing from outside. Run it after every status change.
 *
 * Sections:
 *   tiles: applied, reached a screen, reached interviews, in process, offers,
 *          rejected, waiting (and ghosted or withdrew when there are any);
 *   a flow chart from applied to screen to interviews to where each stands now;
 *   gone quiet: active applications with no news in staleAfterDays;
 *   recent changes, with the note saved on each status change;
 *   every application by week, and a table of all of them;
 *   the best open roles not applied to yet.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { getDb, out } from './db.ts';
import { readoutsDir, profileFiles, ensureDir } from './paths.ts';
import { esc, page } from './html.ts';

let staleAfterDays = 21;
try {
  const p = JSON.parse(readFileSync(profileFiles.searchProfile, 'utf8'));
  if (typeof p.staleAfterDays === 'number') staleAfterDays = p.staleAfterDays;
} catch {
  // defaults
}

const db = getDb();
const all = <T>(sql: string, ...a: unknown[]) => db.prepare(sql).all(...(a as never[])) as T[];

// ---------- data ----------

type Job = { id: number; company: string; title: string; status: string; status_updated_at: string | null; first_seen_at: string | null; url: string; canonical_url: string | null };
const jobs = new Map(all<Job>(`SELECT id, company, title, status, status_updated_at, first_seen_at, url, canonical_url FROM jobs`).map((j) => [j.id, j]));
const history = all<{ id: number; job_id: number; status: string; note: string | null; changed_at: string }>(
  `SELECT id, job_id, status, note, changed_at FROM status_history ORDER BY changed_at, id`
);

const STAGES = ['applied', 'screening', 'interview', 'offer'];
type Stage = 'app' | 'scr' | 'int';
type App = Job & { applied: string; furthest: number; stage: Stage; outcome: string };

// An application is any job that reached applied or later, in its history or its current status.
const reach = new Map<number, number>();
const appliedOn = new Map<number, string>();
for (const h of history) {
  const i = STAGES.indexOf(h.status);
  if (i < 0) continue;
  reach.set(h.job_id, Math.max(reach.get(h.job_id) ?? -1, i));
  if (!appliedOn.has(h.job_id)) appliedOn.set(h.job_id, h.changed_at);
}
for (const j of jobs.values()) {
  const i = STAGES.indexOf(j.status);
  if (i >= 0) reach.set(j.id, Math.max(reach.get(j.id) ?? -1, i));
}
// Where each application stands now.
const OUTCOME: Record<string, string> = {
  applied: 'wai', screening: 'act', interview: 'act', offer: 'off',
  rejected: 'rej', archived: 'rej', withdrawn: 'wd', ghosted: 'gho',
};
const apps: App[] = [...reach.entries()]
  .filter(([id]) => jobs.has(id))
  .map(([id, furthest]) => {
    const j = jobs.get(id)!;
    const applied = (appliedOn.get(id) ?? j.status_updated_at ?? j.first_seen_at ?? '').slice(0, 10);
    const stage: Stage = furthest >= 2 ? 'int' : furthest === 1 ? 'scr' : 'app';
    return { ...j, applied, furthest, stage, outcome: OUTCOME[j.status] ?? 'wai' };
  })
  .sort((a, b) => a.applied.localeCompare(b.applied) || a.id - b.id);

const N = apps.length;
const NS = apps.filter((a) => a.stage !== 'app').length;
const NI = apps.filter((a) => a.stage === 'int').length;
const count = (o: string) => apps.filter((a) => a.outcome === o).length;

const daysSince = (ts: string | null) =>
  ts ? Math.floor((Date.now() - Date.parse(ts.replace(' ', 'T') + (ts.endsWith('Z') ? '' : 'Z'))) / 86400000) : null;
const quiet = apps
  .filter((a) => ['applied', 'screening', 'interview'].includes(a.status))
  .filter((a) => (daysSince(a.status_updated_at) ?? 0) >= staleAfterDays)
  .sort((a, b) => (a.status_updated_at ?? '').localeCompare(b.status_updated_at ?? ''));

const top = all<{ id: number; company: string; title: string; status: string; score: number; url: string; canonical_url: string | null; location: string | null }>(
  `SELECT j.id, j.company, j.title, j.status, s.score, j.url, j.canonical_url, j.location
   FROM jobs j JOIN job_scores s ON s.id = j.latest_score_id
   WHERE j.status IN ('scored','interested') AND s.score >= 70 AND COALESCE(j.liveness,'') NOT IN ('dead','removed')
   ORDER BY (j.status = 'interested') DESC, s.score DESC LIMIT 10`
);

// ---------- helpers ----------

const fmt = (d: string, year = false) =>
  d ? new Date(d.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }) : '';
const link = (r: { url: string; canonical_url: string | null }, text: string) =>
  `<a href="${esc(r.canonical_url ?? r.url)}" target="_blank" rel="noopener">${esc(text)}</a>`;
const tip = (title: string, lines: string[]) =>
  esc(JSON.stringify({ t: title, l: lines.slice(0, 14), m: Math.max(0, lines.length - 14) }));

// Current status: label and color.
const NOW: Record<string, [string, string]> = {
  applied: ['Waiting', '--wait'], screening: ['Screening', '--screen'], interview: ['Interviewing', '--interview'],
  offer: ['Offer', '--active'], rejected: ['Rejected', '--reject'], archived: ['Closed', '--closed'],
  withdrawn: ['Withdrew', '--closed'], ghosted: ['Ghosted', '--ghost'], interested: ['Want to apply', '--applied'],
  ignored: ['Not interested', '--closed'], scored: ['Scored', '--closed'], new: ['New', '--closed'],
};
const pill = (s: string) => {
  const [l, c] = NOW[s] ?? [s, '--closed'];
  return `<span class="pill" style="color:var(${c})">${esc(l)}</span>`;
};
const FURTHEST = ['Application', 'Screen', 'Interview', 'Offer'];

// ---------- tiles ----------

const tiles: [string, number, string][] = [
  ['Applied', N, '--applied'],
  ['Reached a screen', NS, '--screen'],
  ['Reached interviews', NI, '--interview'],
  ['In process', count('act'), '--active'],
  ['Offers', count('off'), '--active'],
  ['Rejected', count('rej'), '--reject'],
  ['Waiting', count('wai'), '--wait'],
];
if (count('gho')) tiles.push(['Ghosted', count('gho'), '--ghost']);
if (count('wd')) tiles.push(['Withdrew', count('wd'), '--closed']);
const tilesHtml = tiles
  .map(([l, v, c]) => `<div class="tile"><i style="background:var(${c})"></i><b>${v}</b><span>${l}</span></div>`)
  .join('');

// ---------- flow chart ----------

function sankey(): string {
  if (!N) return '';
  const OUTS = [
    { id: 'off', l: 'Offer', c: '--active' },
    { id: 'act', l: 'In process', c: '--active' },
    { id: 'rej', l: 'Rejected', c: '--reject' },
    { id: 'wd', l: 'Withdrew', c: '--closed' },
    { id: 'gho', l: 'Ghosted', c: '--ghost' },
    { id: 'wai', l: 'Waiting, no word', c: '--wait' },
  ].filter((o) => count(o.id));
  const STG = [
    { id: 'app', l: 'Applied', v: N, c: '--applied', x: 0 },
    { id: 'scr', l: 'Reached a screen', v: NS, c: '--screen', x: 260 },
    { id: 'int', l: 'Reached interviews', v: NI, c: '--interview', x: 520 },
  ].filter((s) => s.v);
  const GAP = 30, W = 14, XO = 790, TOP = 56;
  // Scale so the tallest column fits in about 480px, and one application is never thinner than 3px.
  const S = Math.max(3, Math.min(14, (480 - GAP * (OUTS.length - 1)) / N));
  const NAMES: Record<string, string> = { app: 'Applied', scr: 'Reached a screen', int: 'Reached interviews' };
  OUTS.forEach((o) => (NAMES[o.id] = o.l));

  type Edge = { from: string; to: string; list: App[] };
  const edges: Edge[] = [];
  if (NS) edges.push({ from: 'app', to: 'scr', list: apps.filter((a) => a.stage !== 'app') });
  if (NI) edges.push({ from: 'scr', to: 'int', list: apps.filter((a) => a.stage === 'int') });
  for (const s of STG) for (const o of OUTS) {
    const list = apps.filter((a) => a.stage === s.id && a.outcome === o.id);
    if (list.length) edges.push({ from: s.id, to: o.id, list });
  }

  const pos: Record<string, { x: number; y: number; h: number }> = {};
  STG.forEach((s) => (pos[s.id] = { x: s.x, y: TOP, h: s.v * S }));
  let y = TOP;
  for (const o of OUTS) {
    const h = count(o.id) * S;
    pos[o.id] = { x: XO, y, h };
    y += h + GAP;
  }
  const height = Math.ceil(Math.max(y - GAP, TOP + N * S) + 24);
  const color: Record<string, string> = {};
  [...STG, ...OUTS].forEach((n) => (color[n.id] = n.c));

  // Stack ribbons: out of a stage, the next stage first and then outcomes top to bottom;
  // into an outcome, the furthest stage on top.
  const order = (id: string) => (STG.some((s) => s.id === id) ? -1 : OUTS.findIndex((o) => o.id === id));
  const srcOff = new Map<Edge, number>(), dstOff = new Map<Edge, number>();
  for (const s of STG) {
    let off = 0;
    for (const e of edges.filter((e) => e.from === s.id).sort((a, b) => order(a.to) - order(b.to))) {
      srcOff.set(e, off); off += e.list.length * S;
    }
  }
  for (const o of OUTS) {
    let off = 0;
    for (const e of edges.filter((e) => e.to === o.id).sort((a, b) => pos[b.from].x - pos[a.from].x)) {
      dstOff.set(e, off); off += e.list.length * S;
    }
  }

  let svg = `<text class="h" x="${XO}" y="16">Where it stands</text>`;
  for (const e of [...edges].sort((a, b) => b.list.length - a.list.length)) {
    const f = pos[e.from], t = pos[e.to], hh = e.list.length * S;
    const x0 = f.x + W, y0 = f.y + srcOff.get(e)!, x1 = t.x, y1 = t.y + (dstOff.get(e) ?? 0), m = (x0 + x1) / 2;
    const names = [...new Set(e.list.map((a) => a.company))];
    svg += `<path class="rb" d="M${x0},${y0} C${m},${y0} ${m},${y1} ${x1},${y1} L${x1},${y1 + hh} C${m},${y1 + hh} ${m},${y0 + hh} ${x0},${y0 + hh} Z" style="fill:var(${color[e.to]})" data-tip="${tip(`${e.list.length} · ${NAMES[e.from]} → ${NAMES[e.to]}`, names)}"/>`;
  }
  for (const s of STG) {
    const p = pos[s.id];
    svg += `<rect x="${p.x}" y="${p.y}" width="${W}" height="${p.h}" rx="1" style="fill:var(${s.c})"/><text x="${p.x}" y="${p.y - 8}"><tspan class="n">${s.v}</tspan>  ${s.l}</text>`;
  }
  for (const o of OUTS) {
    const p = pos[o.id];
    const names = [...new Set(apps.filter((a) => a.outcome === o.id).map((a) => a.company))];
    svg += `<rect class="nd" x="${p.x}" y="${p.y}" width="${W}" height="${p.h}" rx="1" style="fill:var(${o.c})" data-tip="${tip(`${count(o.id)} · ${o.l}`, names)}"/><text x="${p.x + W + 8}" y="${(p.y + Math.max(p.h, 16) / 2 + 4).toFixed(1)}"><tspan class="n">${count(o.id)}</tspan>  ${o.l}</text>`;
  }
  return `<section class="panel chart"><svg viewBox="0 0 960 ${height}" role="img" aria-label="Flow of ${N} applications from applied to screen, interviews and where each stands now">${svg}</svg></section>`;
}

// ---------- recent changes ----------

const SAY: Record<string, (t: string) => string> = {
  applied: (t) => `Applied for ${t}`,
  screening: (t) => `Moved to a screen for ${t}`,
  interview: (t) => `Interviewing for ${t}`,
  offer: (t) => `Offer for ${t}`,
  rejected: (t) => `Rejected for ${t}`,
  ghosted: (t) => `Marked ghosted for ${t}`,
  withdrawn: (t) => `Withdrew from ${t}`,
  interested: (t) => `Saved ${t} to apply to`,
  archived: (t) => `Closed ${t}`,
};
const DOT: Record<string, string> = {
  applied: '--applied', screening: '--screen', interview: '--interview', offer: '--active', rejected: '--reject',
  ghosted: '--ghost', withdrawn: '--closed', interested: '--applied', archived: '--closed',
};
const changes = history
  .filter((h) => SAY[h.status] && jobs.has(h.job_id))
  .reverse()
  .slice(0, 60);
const SHOW = 5;
const changesHtml = changes.length
  ? `<ol id="rc">${changes
      .map((h, i) => {
        const j = jobs.get(h.job_id)!;
        return `<li${i >= SHOW ? ' class="extra"' : ''}><span class="rd">${fmt(h.changed_at)}</span><i class="dot" style="background:var(${DOT[h.status]})"></i><span class="rt"><b>${esc(j.company)}</b> <span>${esc(SAY[h.status](j.title))}</span>${h.note ? `<span class="rn">${esc(h.note)}</span>` : ''}</span></li>`;
      })
      .join('')}</ol>${changes.length > SHOW ? `<button class="more" id="rcb" type="button" aria-expanded="false" hidden>Show ${changes.length - SHOW} more</button>` : ''}`
  : `<p class="muted">Nothing yet. When you apply somewhere, say so and it shows up here.</p>`;

// ---------- by week ----------

function weeks(): string {
  if (!N) return '';
  const weekOf = (d: string) => {
    const x = new Date(d + 'T12:00:00Z');
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.toISOString().slice(0, 10);
  };
  const by = new Map<string, App[]>();
  for (const a of apps) by.set(weekOf(a.applied), [...(by.get(weekOf(a.applied)) ?? []), a]);
  const keys = [...by.keys()].sort().slice(-20);
  const max = Math.max(...keys.map((k) => by.get(k)!.length));
  const GROUPS: [string, string, (a: App) => boolean][] = [
    ['Rejected or closed', '--reject', (a) => ['rej', 'wd'].includes(a.outcome)],
    ['Ghosted', '--ghost', (a) => a.outcome === 'gho'],
    ['Waiting', '--wait', (a) => a.outcome === 'wai'],
    ['Screening, interviewing or offer', '--active', (a) => ['act', 'off'].includes(a.outcome)],
  ];
  const used = GROUPS.filter(([, , f]) => apps.some(f));
  const cols = keys
    .map((k) => {
      const L = by.get(k)!;
      const segs = used
        .map(([n, c, f]) => {
          const m = L.filter(f);
          return m.length
            ? `<i class="seg" style="height:${((m.length / L.length) * 100).toFixed(1)}%;background:var(${c})" data-tip="${tip(`${n} · ${m.length} of ${L.length} · week of ${fmt(k)}`, m.map((a) => `${a.company} · ${a.title}`))}"></i>`
            : '';
        })
        .join('');
      return `<div class="wcol" style="height:${((L.length / max) * 100).toFixed(1)}%"><span>${L.length}</span>${segs}</div>`;
    })
    .join('');
  const every = Math.ceil(keys.length / 10);
  return `<div class="wleg">${used.map(([n, c]) => `<span><i style="background:var(${c})"></i>${n}</span>`).join('')}<span class="ax">Applications per week, by where each stands now</span></div>
<div class="wk">${cols}</div>
<div class="wl">${keys.map((k, i) => `<div>${i % every === 0 ? fmt(k) : ''}</div>`).join('')}</div>`;
}

const table = N
  ? `<div class="tw"><table><thead><tr><th>Applied</th><th>Company</th><th>Role</th><th>Furthest</th><th>Now</th></tr></thead><tbody>${[...apps]
      .reverse()
      .map((a) => `<tr><td class="d">${fmt(a.applied)}</td><td><b>${esc(a.company)}</b></td><td>${link(a, a.title)}</td><td>${FURTHEST[a.furthest]}</td><td>${pill(a.status)}</td></tr>`)
      .join('')}</tbody></table></div>`
  : '';

// ---------- page ----------

const today = new Date().toISOString().slice(0, 10);
const sub = N
  ? `${N} application${N === 1 ? '' : 's'} since ${fmt(apps[0].applied, true)}. Each ribbon shows where applications went after you applied, as of ${fmt(today)}.`
  : `No applications yet. When you apply somewhere, say so and it shows up here.`;

const body = `
<header>
  <h1>Application Tracker</h1>
  <p class="sub">${esc(sub)}</p>
</header>
<section class="tiles">${tilesHtml}</section>
<div id="tip" hidden></div>
${sankey()}
${
  quiet.length
    ? `<section class="panel quiet"><h2>Gone quiet</h2><p class="muted small">No news in ${staleAfterDays} days or more. Worth a follow-up, or calling it ghosted.</p><ul>${quiet
        .map((a) => `<li><span class="rd">${fmt(a.status_updated_at ?? '')}</span><span class="rt"><b>${esc(a.company)}</b> ${link(a, a.title)}</span>${pill(a.status)}</li>`)
        .join('')}</ul></section>`
    : ''
}
<section class="panel rc"><h2>Recent changes</h2>${changesHtml}</section>
${N ? `<section class="panel tbl"><h2>Every application, by date</h2>${weeks()}${table}</section>` : ''}
<section class="panel top"><h2>Best open roles, not applied yet</h2>${
  top.length
    ? `<ul>${top
        .map((t) => `<li><span class="score">${t.score}</span><span class="rt">${link(t, t.title)}<span class="muted small">${esc(t.company)}${t.location ? ` · ${esc(t.location)}` : ''} · #${t.id}</span></span>${t.status === 'interested' ? pill('interested') : ''}</li>`)
        .join('')}</ul>`
    : `<p class="muted">No scored roles at 70 or above yet. Say "find new jobs" to look.</p>`
}</section>
<p class="note">Waiting means applied with no word yet. Furthest is the furthest an application got, even if it later closed. Something goes quiet after ${staleAfterDays} days with no news.</p>
<script>
(() => {
  const tip = document.getElementById('tip');
  const show = (el, ev) => {
    const d = JSON.parse(el.getAttribute('data-tip'));
    const e = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    tip.innerHTML = '<b>' + e(d.t) + '</b>' + (d.l.length ? '<ul>' + d.l.map((x) => '<li>' + e(x) + '</li>').join('') + (d.m ? '<li class="m">+' + d.m + ' more</li>' : '') + '</ul>' : '');
    tip.hidden = false;
    document.querySelectorAll('.rb').forEach((r) => r.classList.toggle('dim', el.classList.contains('rb') && r !== el));
    move(ev);
  };
  const move = (ev) => {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = y + 'px';
  };
  const hide = () => { tip.hidden = true; document.querySelectorAll('.rb').forEach((r) => r.classList.remove('dim')); };
  document.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('pointerenter', (ev) => show(el, ev));
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', hide);
    el.addEventListener('click', (ev) => show(el, ev));
  });
  const rc = document.getElementById('rc'), b = document.getElementById('rcb');
  if (rc && b) {
    rc.classList.add('short'); b.hidden = false;
    const label = b.textContent;
    b.addEventListener('click', () => {
      const open = rc.classList.toggle('short') === false;
      b.textContent = open ? 'Show fewer' : label;
      b.setAttribute('aria-expanded', String(open));
    });
  }
})();
</script>
`;

// Page colors, font and dark mode come from html.ts, shared with the prep
// pages. These are only the status colors, tuned to sit on that palette.
const TOKENS_LIGHT = `--applied:var(--accent); --wait:#a8a49d; --ghost:var(--warn); --reject:var(--bad); --closed:#8a8780;
  --screen:#3d7f8f; --interview:#2f6f62; --active:var(--good);`;
const TOKENS_DARK = `--applied:var(--accent); --wait:#6c6a66; --ghost:var(--warn); --reject:var(--bad); --closed:#8d8a85;
  --screen:#7fb8c4; --interview:#6fbfa8; --active:var(--good);`;

const css = `
:root { ${TOKENS_LIGHT} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${TOKENS_DARK} } }
:root[data-theme="dark"] { ${TOKENS_DARK} }
main { max-width: 1000px; display: grid; gap: 24px; }
h1 { margin: 0; }
h2 { margin: 0; }
.sub { color: var(--muted); margin: 8px 0 0; max-width: 62ch; }
.panel p { margin: 0; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 24px 20px; display: grid; gap: 14px; min-width: 0; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); gap: 10px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 14px 16px; min-width: 0; }
.tile i { display: block; height: 3px; width: 28px; margin-bottom: 10px; }
.tile b { display: block; font-weight: 600; font-size: 30px; line-height: 1; font-variant-numeric: tabular-nums; }
.tile span { display: block; color: var(--muted); font-size: 13px; margin-top: 6px; }
.chart { overflow-x: auto; display: block; }
.chart svg { display: block; min-width: 720px; width: 100%; height: auto; }
.chart text { fill: var(--text); font-family: inherit; font-size: 13px; }
.chart .n { font-weight: 600; font-variant-numeric: tabular-nums; }
.chart .h { fill: var(--muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.rb { opacity: .34; transition: opacity .12s; cursor: pointer; }
.rb:hover { opacity: .7; } .rb.dim { opacity: .16; } .nd { cursor: pointer; }
#tip { position: fixed; z-index: 10; pointer-events: none; background: var(--text); color: var(--bg); border-radius: 6px; padding: 9px 12px; font-size: 13px; max-width: 280px; box-shadow: 0 4px 18px rgba(0,0,0,.25); }
#tip b { display: block; font-weight: 600; }
#tip ul { margin: 6px 0 0; padding: 0; list-style: none; font-size: 12px; opacity: .9; }
#tip li.m { opacity: .7; }
.rc ol, .quiet ul, .top ul { list-style: none; margin: 0; padding: 0; }
.rc li { display: grid; grid-template-columns: 56px 10px minmax(0, 1fr); gap: 0 12px; align-items: baseline; padding: 8px 0; border-top: 1px solid var(--line); }
.rc li:first-child, .quiet li:first-child, .top li:first-child { border-top: 0; }
.rc ol.short li.extra { display: none; }
.rd { color: var(--muted); font-size: 13px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.dot { width: 10px; height: 10px; border-radius: 50%; align-self: center; }
.rt { min-width: 0; overflow-wrap: anywhere; }
.rt > span { color: var(--muted); }
.rn { display: block; font-size: 13px; margin-top: 2px; }
.more { justify-self: start; background: none; border: 1px solid var(--line); color: var(--text); font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 99px; cursor: pointer; }
.more:hover { border-color: var(--muted); }
.more:focus-visible { outline: 2px solid var(--applied); outline-offset: 2px; }
.quiet { box-shadow: inset 3px 0 0 var(--ghost); }
.quiet li, .top li { display: flex; gap: 12px; align-items: baseline; padding: 8px 0; border-top: 1px solid var(--line); }
.quiet li .rt, .top li .rt { flex: 1; }
.top li .rt .small { display: block; }
.score { font-weight: 600; font-size: 18px; min-width: 2ch; font-variant-numeric: tabular-nums; }
.pill { display: inline-block; padding: 1px 9px; border-radius: 99px; font-size: 12px; font-weight: 500; border: 1px solid currentColor; white-space: nowrap; }
.wleg { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--muted); align-items: center; }
.wleg i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }
.wleg .ax { margin-left: auto; }
.wk { display: flex; gap: 6px; align-items: flex-end; height: 110px; margin-top: 10px; }
.wcol { flex: 1; min-width: 0; position: relative; display: flex; flex-direction: column; border-radius: 2px 2px 0 0; }
.wcol > span { position: absolute; bottom: 100%; left: 0; right: 0; text-align: center; font-size: 11px; color: var(--muted); }
.seg { display: block; width: 100%; cursor: pointer; border-top: 1px solid var(--surface); }
.seg:first-of-type { border-top: 0; }
.seg:hover { filter: brightness(1.15); }
.wl { display: flex; gap: 6px; font-size: 11px; color: var(--muted); }
.wl div { flex: 1; text-align: center; min-width: 0; white-space: nowrap; }
.tw { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; min-width: 560px; font-variant-numeric: tabular-nums; }
th { text-align: left; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 500; padding: 6px 10px; border-bottom: 1px solid var(--line); }
td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
td.d { white-space: nowrap; color: var(--muted); }
td a { color: inherit; }
.note { color: var(--muted); font-size: 13px; max-width: 75ch; margin: 0; }
`;

ensureDir(readoutsDir);
const file = path.join(readoutsDir, 'pipeline.html');
writeFileSync(file, page('Application Tracker', body, css));
if (process.argv.includes('--open')) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  execFile(cmd, [file], () => {});
}
out({ file, applied: N, inProcess: count('act') + count('off'), goneQuiet: quiet.length, topOpen: top.length });
