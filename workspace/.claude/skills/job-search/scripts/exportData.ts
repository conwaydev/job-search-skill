import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, out } from './db.ts';
import { dataDir, ensureDir } from './paths.ts';

const db = getDb();

const dump = {
  exportedAt: new Date().toISOString(),
  jobs: db.prepare('SELECT * FROM jobs').all(),
  statusHistory: db.prepare('SELECT * FROM status_history').all(),
  resumeVersions: db.prepare('SELECT * FROM resume_versions').all(),
  jobScores: db.prepare('SELECT * FROM job_scores').all(),
  coverLetters: db.prepare('SELECT * FROM cover_letters').all(),
  digestEntries: db.prepare('SELECT * FROM digest_entries').all(),
};

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filePath = path.join(ensureDir(path.join(dataDir, 'exports')), `export-${timestamp}.json`);
writeFileSync(filePath, JSON.stringify(dump, null, 2), 'utf8');

out({ filePath, counts: Object.fromEntries(Object.entries(dump).filter(([k]) => k !== 'exportedAt').map(([k, v]) => [k, (v as unknown[]).length])) });
