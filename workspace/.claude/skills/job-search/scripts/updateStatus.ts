import { getDb, out, die, nowIso } from './db.ts';

const VALID_STATUSES = [
  'new', 'scored', 'interested', 'applied', 'screening', 'interview',
  'offer', 'rejected', 'ghosted', 'withdrawn', 'archived', 'ignored',
];

const [, , jobIdArg, status, ...noteParts] = process.argv;
const jobId = Number(jobIdArg);
const note = noteParts.join(' ') || null;

if (!jobId || !status) {
  die({ error: 'usage', message: 'updateStatus.ts <jobId> <status> [note]', validStatuses: VALID_STATUSES });
}
if (!VALID_STATUSES.includes(status)) {
  die({ error: 'invalid_status', status, validStatuses: VALID_STATUSES });
}

const db = getDb();
const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId);
if (!job) die({ error: 'job_not_found', jobId });

const timestamp = nowIso();
db.prepare('INSERT INTO status_history (job_id, status, note, changed_at) VALUES (?, ?, ?, ?)').run(
  jobId,
  status,
  note,
  timestamp
);
db.prepare('UPDATE jobs SET status = ?, status_updated_at = ? WHERE id = ?').run(status, timestamp, jobId);

out({ jobId, status, note, changedAt: timestamp });
