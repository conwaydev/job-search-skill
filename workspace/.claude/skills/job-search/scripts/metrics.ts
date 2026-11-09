/**
 * Bulk view and update of profile/verified-metrics.md, so checking numbers
 * is one pass over a list instead of a question per claim.
 *
 *   metrics.ts list [--status unverified]       numbered claims
 *   metrics.ts set <numbers|all> <status> [--use <use>] [--source "text"] [--except 3,7]
 *
 *   e.g. metrics.ts set all confirmed --except 3,7 --source "their own records, confirmed in setup"
 *        metrics.ts set 7 do-not-use
 *        metrics.ts set 3 confirmed --use interview-only
 *
 * Numbers refer to the order in the file (the same numbers `list` prints).
 * Status: confirmed | unverified | do-not-use. Use: anywhere | applications-only | interview-only.
 * A Source line that is already filled in is kept unless --source is given.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { profileFiles } from './paths.ts';
import { out, die } from './db.ts';

if (!existsSync(profileFiles.verifiedMetrics)) die({ error: 'no_metrics', hint: 'Run seedMetrics.ts first.' });
const md = readFileSync(profileFiles.verifiedMetrics, 'utf8');
const parts = md.split(/\n(?=###\s)/);
const head = parts[0].startsWith('###') ? '' : parts.shift()!;
const field = (b: string, k: string) => b.match(new RegExp(`^${k}:[ \\t]*(.*)$`, 'im'))?.[1].trim() ?? '';
const setField = (b: string, k: string, v: string) =>
  new RegExp(`^${k}:.*$`, 'im').test(b) ? b.replace(new RegExp(`^${k}:.*$`, 'im'), `${k}: ${v}`) : b.replace(/^(###.*)$/m, `$1\n${k}: ${v}`);
const claims = parts.map((b, i) => ({
  n: i + 1,
  claim: b.match(/^###\s+(.*)$/m)?.[1].trim() ?? '',
  status: field(b, 'Status'),
  use: field(b, 'Use'),
  source: field(b, 'Source'),
}));

const [cmd, which, status] = process.argv.slice(2);
const opt = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : undefined;
};

if (cmd === 'list' || !cmd) {
  const only = opt('--status');
  out({ claims: claims.filter((c) => !only || c.status === only) });
} else if (cmd === 'set') {
  const STAT = ['confirmed', 'unverified', 'do-not-use'];
  const USE = ['anywhere', 'applications-only', 'interview-only'];
  if (!STAT.includes(status)) die({ error: 'bad_status', statuses: STAT });
  const use = opt('--use');
  if (use && !USE.includes(use)) die({ error: 'bad_use', uses: USE });
  const except = new Set((opt('--except') ?? '').split(',').filter(Boolean).map(Number));
  const targets = which === 'all' ? claims.map((c) => c.n) : which.split(',').map(Number);
  const source = opt('--source');
  const changed: number[] = [];
  for (const n of targets) {
    if (except.has(n) || n < 1 || n > parts.length) continue;
    let b = setField(parts[n - 1], 'Status', status);
    if (use) b = setField(b, 'Use', use);
    if (source && (!field(b, 'Source') || process.argv.includes('--source'))) b = setField(b, 'Source', source);
    parts[n - 1] = b;
    changed.push(n);
  }
  writeFileSync(profileFiles.verifiedMetrics, [head, ...parts].filter((x) => x !== '').join('\n'));
  out({ changed, totals: Object.fromEntries(STAT.map((s) => [s, parts.filter((b) => field(b, 'Status') === s).length])) });
} else {
  die({ error: 'usage', hint: 'metrics.ts list | set <numbers|all> <status> [--use] [--source] [--except]' });
}
