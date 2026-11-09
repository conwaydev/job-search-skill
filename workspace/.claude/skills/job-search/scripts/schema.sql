CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,               -- 'greenhouse' | 'lever' | 'career_page' | 'discovery' | 'manual'
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  url TEXT NOT NULL,
  description_text TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new|scored|interested|applied|screening|interview|offer|rejected|ghosted|withdrawn|archived|ignored
  status_updated_at TEXT,
  dedup_key TEXT NOT NULL UNIQUE,
  raw_payload TEXT,
  latest_score_id INTEGER,
  discovery_query TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  work_model TEXT,                     -- 'remote' | 'hybrid' | 'onsite' | 'unknown', extracted from the JD at scoring time
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs (company);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  status TEXT NOT NULL,
  note TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_status_history_job ON status_history (job_id, changed_at);

CREATE TABLE IF NOT EXISTS resume_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                 -- 'baseline' | 'tailored'
  job_id INTEGER REFERENCES jobs(id), -- null for baseline
  label TEXT,
  content_json TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  is_current_baseline INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id),
  score INTEGER NOT NULL,
  confidence REAL NOT NULL,
  rationale TEXT NOT NULL,
  strengths TEXT,                     -- JSON array
  gaps TEXT,                          -- JSON array
  recommended_action TEXT,            -- strong_fit|worth_applying|stretch|pass
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_job_scores_job ON job_scores (job_id, created_at);

CREATE TABLE IF NOT EXISTS cover_letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id),
  content_markdown TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft|final|sent
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS digest_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  summary_markdown TEXT NOT NULL,
  job_ids TEXT NOT NULL -- JSON array
);
