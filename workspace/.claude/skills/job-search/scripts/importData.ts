import { readFileSync } from 'node:fs';
import { getDb, out, die } from './db.ts';
import { upsertJob } from './upsertJob.ts';

interface ExportJob {
  id: number;
  source: string;
  company: string;
  title: string;
  location: string | null;
  url: string;
  canonical_url: string | null;
  description_text: string;
  dedup_key: string;
  raw_payload: string | null;
  discovery_query: string | null;
}
interface ExportStatusHistory {
  job_id: number;
  status: string;
  note: string | null;
  changed_at: string;
}
interface ExportResumeVersion {
  id: number;
  kind: string;
  job_id: number | null;
  label: string | null;
  content_json: string;
  content_markdown: string;
}
interface ExportJobScore {
  job_id: number;
  resume_version_id: number;
  score: number;
  confidence: number;
  rationale: string;
  strengths: string | null;
  gaps: string | null;
  recommended_action: string;
  created_at: string;
}
interface ExportCoverLetter {
  job_id: number;
  resume_version_id: number;
  content_markdown: string;
  status: string;
  created_at: string;
}
interface ExportDump {
  jobs: ExportJob[];
  statusHistory: ExportStatusHistory[];
  resumeVersions: ExportResumeVersion[];
  jobScores: ExportJobScore[];
  coverLetters: ExportCoverLetter[];
}

const [, , filePath] = process.argv;
if (!filePath) die({ error: 'usage', message: 'importData.ts <path-to-export.json>' });

const dump: ExportDump = JSON.parse(readFileSync(filePath, 'utf8'));
const db = getDb();

// Step 1: upsert jobs via the same dedup logic ingestion uses, building a map
// from the export's job id to this machine's local job id.
const jobIdMap = new Map<number, number>();
let jobsInserted = 0;
let jobsUpdated = 0;
let jobsUnchanged = 0;
for (const j of dump.jobs) {
  const result = upsertJob({
    source: j.source,
    company: j.company,
    title: j.title,
    location: j.location ?? undefined,
    url: j.url,
    // Older dumps predate this column; upsertJob backfills without clobbering.
    canonicalUrl: j.canonical_url ?? undefined,
    descriptionText: j.description_text,
    // Carry the original dedup_key rather than letting upsertJob recompute
    // one. A job ingested from an ATS keyed on its source id, not its URL, so
    // recomputing from the URL produced a different key and re-inserted every
    // such job as a duplicate — a self-import on 2026-09-15 created 23 of
    // them. The key is already the identity we want to match on.
    dedupKeyOverride: j.dedup_key,
    rawPayload: j.raw_payload ? JSON.parse(j.raw_payload) : undefined,
    discoveryQuery: j.discovery_query ?? undefined,
  });
  jobIdMap.set(j.id, result.jobId);
  if (result.action === 'inserted') jobsInserted++;
  else if (result.action === 'updated') jobsUpdated++;
  else jobsUnchanged++;
}

// Step 2: merge status_history — append-only, so this unions safely.
// Dedup on (local job id, status, changed_at) to make re-imports idempotent.
let historyInserted = 0;
for (const h of dump.statusHistory) {
  const localJobId = jobIdMap.get(h.job_id);
  if (!localJobId) continue;
  const exists = db
    .prepare('SELECT 1 FROM status_history WHERE job_id = ? AND status = ? AND changed_at = ?')
    .get(localJobId, h.status, h.changed_at);
  if (exists) continue;
  db.prepare('INSERT INTO status_history (job_id, status, note, changed_at) VALUES (?, ?, ?, ?)').run(
    localJobId,
    h.status,
    h.note,
    h.changed_at
  );
  historyInserted++;
}

// Step 3: recompute jobs.status/status_updated_at from whichever history row
// (local or imported) is actually latest for each affected job, rather than
// trusting either machine's existing pointer.
for (const localJobId of new Set(jobIdMap.values())) {
  const latest = db
    .prepare('SELECT status, changed_at FROM status_history WHERE job_id = ? ORDER BY changed_at DESC LIMIT 1')
    .get(localJobId) as { status: string; changed_at: string } | undefined;
  if (latest) {
    db.prepare('UPDATE jobs SET status = ?, status_updated_at = ? WHERE id = ?').run(
      latest.status,
      latest.changed_at,
      localJobId
    );
  }
}

// Step 4: import tailored resume versions only (baseline is re-synced
// locally via syncBaseline.ts on each machine, not merged across machines).
const resumeVersionIdMap = new Map<number, number>();
let resumeVersionsInserted = 0;
for (const rv of dump.resumeVersions) {
  if (rv.kind !== 'tailored' || rv.job_id === null) continue;
  const localJobId = jobIdMap.get(rv.job_id);
  if (!localJobId) continue;
  const exists = db
    .prepare('SELECT id FROM resume_versions WHERE job_id = ? AND content_markdown = ?')
    .get(localJobId, rv.content_markdown) as { id: number } | undefined;
  if (exists) {
    resumeVersionIdMap.set(rv.id, exists.id);
    continue;
  }
  const result = db
    .prepare(
      `INSERT INTO resume_versions (kind, job_id, label, content_json, content_markdown, is_current_baseline)
       VALUES ('tailored', ?, ?, ?, ?, 0)`
    )
    .run(localJobId, rv.label, rv.content_json, rv.content_markdown);
  resumeVersionIdMap.set(rv.id, Number(result.lastInsertRowid));
  resumeVersionsInserted++;
}

function localBaselineId(): number | undefined {
  const row = db
    .prepare("SELECT id FROM resume_versions WHERE kind = 'baseline' AND is_current_baseline = 1")
    .get() as { id: number } | undefined;
  return row?.id;
}

// Step 5: import job_scores, remapping resume_version_id where possible and
// falling back to the local current baseline when the original was a
// baseline version (not imported/comparable across machines).
let scoresInserted = 0;
for (const s of dump.jobScores) {
  const localJobId = jobIdMap.get(s.job_id);
  if (!localJobId) continue;
  const exists = db
    .prepare('SELECT id FROM job_scores WHERE job_id = ? AND created_at = ?')
    .get(localJobId, s.created_at);
  if (exists) continue;
  const resumeVersionId = resumeVersionIdMap.get(s.resume_version_id) ?? localBaselineId();
  if (!resumeVersionId) continue;
  const result = db
    .prepare(
      `INSERT INTO job_scores (job_id, resume_version_id, score, confidence, rationale, strengths, gaps, recommended_action, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(localJobId, resumeVersionId, s.score, s.confidence, s.rationale, s.strengths, s.gaps, s.recommended_action, s.created_at);
  scoresInserted++;
  // keep latest_score_id pointed at whichever score is actually newest
  const current = db.prepare('SELECT created_at FROM job_scores WHERE id = (SELECT latest_score_id FROM jobs WHERE id = ?)').get(localJobId) as { created_at: string } | undefined;
  if (!current || s.created_at > current.created_at) {
    db.prepare("UPDATE jobs SET latest_score_id = ?, status = CASE WHEN status = 'new' THEN 'scored' ELSE status END WHERE id = ?").run(
      Number(result.lastInsertRowid),
      localJobId
    );
  }
}

// Step 6: import cover letters, deduped on (job, created_at).
let coverLettersInserted = 0;
for (const cl of dump.coverLetters) {
  const localJobId = jobIdMap.get(cl.job_id);
  if (!localJobId) continue;
  const exists = db
    .prepare('SELECT 1 FROM cover_letters WHERE job_id = ? AND created_at = ?')
    .get(localJobId, cl.created_at);
  if (exists) continue;
  const resumeVersionId = resumeVersionIdMap.get(cl.resume_version_id) ?? localBaselineId();
  if (!resumeVersionId) continue;
  db.prepare(
    `INSERT INTO cover_letters (job_id, resume_version_id, content_markdown, status, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(localJobId, resumeVersionId, cl.content_markdown, cl.status, cl.created_at);
  coverLettersInserted++;
}

out({
  jobsInserted,
  jobsUpdated,
  jobsUnchanged,
  historyInserted,
  resumeVersionsInserted,
  scoresInserted,
  coverLettersInserted,
});
