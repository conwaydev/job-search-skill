import { getDb, out, die } from './db.ts';
import { readInput } from './input.ts';

interface ScoreInput {
  jobId: number;
  resumeVersionId: number;
  score: number;
  confidence: number;
  rationale: string;
  strengths?: string[];
  gaps?: string[];
  recommendedAction: string;
  salaryMin?: number;
  salaryMax?: number;
  workModel?: 'remote' | 'hybrid' | 'onsite' | 'unknown';
}

async function main() {
  const raw = await readInput();
  let input: ScoreInput;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    die({ error: 'invalid_json', message: String(e) });
  }

  const db = getDb();
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(input.jobId);
  if (!job) die({ error: 'job_not_found', jobId: input.jobId });

  const result = db
    .prepare(
      `INSERT INTO job_scores (job_id, resume_version_id, score, confidence, rationale, strengths, gaps, recommended_action)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.jobId,
      input.resumeVersionId,
      input.score,
      input.confidence,
      input.rationale,
      JSON.stringify(input.strengths ?? []),
      JSON.stringify(input.gaps ?? []),
      input.recommendedAction
    );
  const scoreId = Number(result.lastInsertRowid);

  // Only auto-advance status on first scoring (status = 'new'). A rescore
  // must not clobber a manually-set status like 'ignored' or 'applied'.
  db.prepare(
    "UPDATE jobs SET latest_score_id = ?, status = CASE WHEN status = 'new' THEN 'scored' ELSE status END WHERE id = ?"
  ).run(scoreId, input.jobId);

  // Salary/work-model come from reading the JD, same as the score itself, so
  // they're captured here rather than at ingestion (which is deterministic
  // and doesn't read/understand the description).
  if (input.salaryMin !== undefined || input.salaryMax !== undefined || input.workModel !== undefined) {
    db.prepare('UPDATE jobs SET salary_min = ?, salary_max = ?, work_model = ? WHERE id = ?').run(
      input.salaryMin ?? null,
      input.salaryMax ?? null,
      input.workModel ?? null,
      input.jobId
    );
  }

  out({ scoreId, jobId: input.jobId });
}

main();
