import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { getDb, out } from './db.ts';
import { digestsDir, scriptsDir, ensureDir } from './paths.ts';


const db = getDb();

const lastDigest = db
  .prepare('SELECT generated_at FROM digest_entries ORDER BY generated_at DESC LIMIT 1')
  .get() as { generated_at: string } | undefined;
const since = lastDigest?.generated_at ?? '1970-01-01 00:00:00';

const newlyScored = db
  .prepare(
    `SELECT j.id, j.company, j.title, j.url, j.canonical_url, s.score, s.recommended_action, s.rationale
     FROM jobs j
     JOIN job_scores s ON s.id = j.latest_score_id
     WHERE s.created_at > ?
     ORDER BY s.score DESC`
  )
  .all(since) as {
  id: number;
  company: string;
  title: string;
  url: string;
  canonical_url: string | null;
  score: number;
  recommended_action: string;
  rationale: string;
}[];

const snapshotScript = path.join(scriptsDir, 'statusSnapshot.ts');
const snapshot = JSON.parse(execFileSync(process.execPath, ['--no-warnings', snapshotScript]).toString());

const date = new Date().toISOString().slice(0, 10);
const lines: string[] = [];
lines.push(`# Job Search Digest — ${date}`);
lines.push('');
lines.push(`## New / rescored (${newlyScored.length})`);
if (newlyScored.length === 0) {
  lines.push('Nothing new since the last digest.');
} else {
  for (const j of newlyScored) {
    lines.push(`- **[${j.score}] ${j.title}** — ${j.company} (${j.recommended_action}) — ${j.canonical_url ?? j.url}`);
    lines.push(`  ${j.rationale}`);
  }
}
lines.push('');
lines.push('## Pipeline snapshot');
for (const c of snapshot.counts as { status: string; count: number }[]) {
  lines.push(`- ${c.status}: ${c.count}`);
}
if (snapshot.possiblyGhosted.length > 0) {
  lines.push('');
  lines.push(`## ⚠️ Possibly ghosted (no update in ${snapshot.staleAfterDays}+ days)`);
  for (const g of snapshot.possiblyGhosted as { id: number; company: string; title: string; status_updated_at: string }[]) {
    lines.push(`- #${g.id} ${g.title} — ${g.company} (last update ${g.status_updated_at})`);
  }
}

const markdown = lines.join('\n');
const filePath = path.join(ensureDir(digestsDir), `${date}.md`);
writeFileSync(filePath, markdown, 'utf8');

db.prepare('INSERT INTO digest_entries (summary_markdown, job_ids) VALUES (?, ?)').run(
  markdown,
  JSON.stringify(newlyScored.map((j) => j.id))
);

const topScore = newlyScored.length > 0 ? newlyScored[0].score : null;
const notifTitle = 'Job Search Digest';
const notifBody =
  newlyScored.length > 0
    ? `${newlyScored.length} new/rescored job${newlyScored.length === 1 ? '' : 's'}, top score ${topScore}`
    : 'No new jobs today';
// macOS only; on other systems the file itself is the deliverable.
if (process.platform === 'darwin') try {
  execFileSync('osascript', ['-e', `display notification "${notifBody}" with title "${notifTitle}"`]);
} catch {
  // notifications are a nice-to-have; don't fail the digest over it
}

out({ filePath, newlyScoredCount: newlyScored.length, possiblyGhostedCount: snapshot.possiblyGhosted.length });
