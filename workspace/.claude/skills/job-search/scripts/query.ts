import { getDb, out, die, isAggregatorUrl } from './db.ts';

const [, , cmd, ...args] = process.argv;
const db = getDb();

function currentBaseline() {
  return db
    .prepare("SELECT id, content_markdown FROM resume_versions WHERE kind = 'baseline' AND is_current_baseline = 1")
    .get();
}

switch (cmd) {
  case 'baseline': {
    const row = currentBaseline();
    if (!row) die({ error: 'no_baseline', hint: 'No baseline resume yet. Do the resume step of onboarding (references/onboarding.md), which ends with syncBaseline.ts.' });
    out(row);
    break;
  }

  case 'pending-score': {
    const rows = db
      .prepare("SELECT id, company, title, url, description_text, discovery_query FROM jobs WHERE status = 'new'")
      .all();
    out(rows);
    break;
  }

  case 'job': {
    const id = Number(args[0]);
    if (!id) die({ error: 'missing_job_id' });
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    if (!job) die({ error: 'job_not_found', id });
    const scores = db
      .prepare('SELECT * FROM job_scores WHERE job_id = ? ORDER BY created_at DESC')
      .all(id);
    const history = db
      .prepare('SELECT * FROM status_history WHERE job_id = ? ORDER BY changed_at ASC')
      .all(id);
    const drafts = db
      .prepare(
        "SELECT id, kind, created_at, is_current_baseline FROM resume_versions WHERE job_id = ? ORDER BY created_at DESC"
      )
      .all(id);
    const coverLetters = db
      .prepare('SELECT id, status, created_at FROM cover_letters WHERE job_id = ? ORDER BY created_at DESC')
      .all(id);
    out({ job, scores, history, drafts, coverLetters });
    break;
  }

  case 'jobs': {
    // list [--status s] [--company c] [--min-score n] [--source s] [--limit n]
    const filters: string[] = [];
    const params: (string | number)[] = [];
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i];
      const val = args[i + 1];
      if (flag === '--status') {
        filters.push('j.status = ?');
        params.push(val);
      } else if (flag === '--company') {
        filters.push('j.company LIKE ?');
        params.push(`%${val}%`);
      } else if (flag === '--source') {
        filters.push('j.source = ?');
        params.push(val);
      } else if (flag === '--min-score') {
        filters.push('s.score >= ?');
        params.push(Number(val));
      } else if (flag === '--min-salary') {
        // matches jobs whose stated max clears the floor; nulls (no salary
        // stated) are excluded since we can't tell either way
        filters.push('j.salary_max >= ?');
        params.push(Number(val));
      } else if (flag === '--work-model') {
        filters.push('j.work_model = ?');
        params.push(val);
      }
    }
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 50;
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT j.id, j.company, j.title, j.location, j.url, j.canonical_url, j.status, j.status_updated_at, j.source,
                j.first_seen_at, j.salary_min, j.salary_max, j.work_model, j.liveness, j.liveness_checked_at,
                s.score, s.recommended_action
         FROM jobs j
         LEFT JOIN job_scores s ON s.id = j.latest_score_id
         ${where}
         ORDER BY j.first_seen_at DESC
         LIMIT ?`
      )
      .all(...params, limit);
    out(rows);
    break;
  }

  case 'known-urls': {
    // for discovery dedup-before-fetch checks — both URLs, since the same
    // posting is often seen once on an aggregator and once on its own board
    const rows = db.prepare('SELECT url, canonical_url FROM jobs').all() as {
      url: string;
      canonical_url: string | null;
    }[];
    out(rows.flatMap((r) => [r.url, r.canonical_url]).filter(Boolean));
    break;
  }

  case 'known-listings': {
    // company+title pairs, for deduping an aggregator sighting of a posting
    // already catalogued under its ATS URL (the URLs differ, so known-urls
    // can't catch it)
    const rows = db.prepare('SELECT id, company, title, status FROM jobs ORDER BY company, title').all();
    out(rows);
    break;
  }

  case 'needs-canonical': {
    // open jobs whose only URL is an aggregator listing — these are the rows
    // that go dead first and can't be applied through
    const rows = db
      .prepare(
        `SELECT id, company, title, url, status FROM jobs
         WHERE canonical_url IS NULL AND status NOT IN ('archived', 'ignored', 'rejected', 'withdrawn')
         ORDER BY id`
      )
      .all() as { url: string }[];
    out(rows.filter((r) => isAggregatorUrl(r.url)));
    break;
  }

  default:
    die({
      error: 'unknown_command',
      usage:
        'query.ts baseline|pending-score|job <id>|jobs [--status s] [--company c] [--source s] [--min-score n] [--min-salary n] [--work-model remote|hybrid|onsite] [--limit n]|known-urls|known-listings|needs-canonical',
    });
}
