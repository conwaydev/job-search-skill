import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, out, die } from './db.ts';
import { applicationsDir, ensureDir } from './paths.ts';

const outputDir = path.join(applicationsDir, '_drafts');

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const [, , jobIdArg, draftType] = process.argv;
  const jobId = Number(jobIdArg);
  if (!jobId || (draftType !== 'resume' && draftType !== 'cover_letter')) {
    die({ error: 'usage', message: 'writeDraft.ts <jobId> resume|cover_letter  (content via stdin)' });
  }

  const content = await readStdin();
  if (!content.trim()) die({ error: 'empty_content' });

  const db = getDb();
  const job = db.prepare('SELECT company, title FROM jobs WHERE id = ?').get(jobId) as
    | { company: string; title: string }
    | undefined;
  if (!job) die({ error: 'job_not_found', jobId });

  const baseline = db
    .prepare("SELECT id FROM resume_versions WHERE kind = 'baseline' AND is_current_baseline = 1")
    .get() as { id: number } | undefined;
  if (!baseline) die({ error: 'no_baseline', message: 'Run syncBaseline.ts first' });

  const slug = `${job.company}-${job.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const filename = `job-${jobId}-${draftType}-${slug}.md`;
  const filePath = path.join(ensureDir(outputDir), filename);
  writeFileSync(filePath, content, 'utf8');

  let recordId: number;
  if (draftType === 'resume') {
    const result = db
      .prepare(
        `INSERT INTO resume_versions (kind, job_id, label, content_json, content_markdown, is_current_baseline)
         VALUES ('tailored', ?, ?, '{}', ?, 0)`
      )
      .run(jobId, `tailored for job ${jobId}`, content);
    recordId = Number(result.lastInsertRowid);
  } else {
    const result = db
      .prepare(
        `INSERT INTO cover_letters (job_id, resume_version_id, content_markdown, status)
         VALUES (?, ?, ?, 'draft')`
      )
      .run(jobId, baseline.id, content);
    recordId = Number(result.lastInsertRowid);
  }

  out({ recordId, filePath });
}

main();
