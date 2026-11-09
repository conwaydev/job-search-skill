# When something goes wrong

Fix what you can yourself. Then tell them in a sentence what happened and what you did. Ask them to act only when only they can do it, such as signing in or approving an install.

## Contents
1. Script errors and what they mean
2. Pages that won't load
3. Board quirks
4. Shell differences on Windows

## 1. Script errors and what they mean

| What you see | What it means | What to do |
|---|---|---|
| `node: command not found`, `'node' is not recognized`, or a Node version below 22.18 | Node isn't installed or isn't on the path | Follow [setup.md](setup.md) |
| `Cannot find package 'playwright'` | Dependencies aren't installed | Run `npm ci` in `.claude/skills/job-search/` (see [setup.md](setup.md)) |
| `Executable doesn't exist` from Playwright | No browser for Playwright | Install Chrome, or run `npx playwright install chromium` in the skill folder |
| `no_search_profile` | Onboarding hasn't built `search-profile.json` yet | Do that onboarding step ([onboarding.md](onboarding.md)) |
| `no_baseline` | No baseline resume yet | Build `profile/baseline-resume.json` ([onboarding.md](onboarding.md)), then run `scripts/syncBaseline.ts` |
| `database is locked` | Two scripts wrote at once | Wait a moment and run it again. Don't run writers in parallel. |
| `invalid_json` | The `--file` payload isn't valid JSON | Fix the file and rerun |
| `login.ts --status` says LinkedIn is signed out | The session lapsed | Ask whether they want to sign in again (`scripts/login.ts linkedin`). Meanwhile, the scan runs signed out. |
| A LinkedIn scan returns very few results | Session lapsed or rate-limited | Check `--status`. If it's signed in, wait an hour. Never run scans back to back. |
| `ExperimentalWarning: SQLite` | Harmless | Add `--no-warnings` |
| `does not provide an export named` | A type was imported without `import type` | Use `import type` for interfaces in the scripts |

`scripts/doctor.ts` checks Node, SQLite, Playwright, Chrome, the folders and write access in one go. Run it first when you're unsure.

## 2. Pages that won't load

**A 403 or a blank page from a careers site is a bot wall, not a closed job.** Try these in order:
1. The board's API, if the site runs on Greenhouse, Lever, Ashby or Workday ([discovery.md](discovery.md)).
2. A headless browser: `openContext(name, false)` from `scripts/browserSession.ts`. Go to the URL, wait a few seconds, and read `document.documentElement.innerText`.
3. A visible browser window: `openContext(name, true)`. Many bot walls let a visible window through.
4. Ask them to paste the posting.

Use a throwaway name for these browser sessions, and delete its folder under `data/browser-profile/` when you're done.

**JavaScript-only pages.** Plain fetches can't run JavaScript, but a browser can. Rendering a careers page once often shows which board system it runs on: a `gh_jid=` in the links means Greenhouse. Use that board's API from then on.

**A page that returns 200 for a job that's gone.** Workday, Greenhouse-hosted and many custom careers pages show a normal page forever. A status code proves nothing on those sites. Ask the board API (`checkLiveness.ts` does).

## 3. Board quirks

- **Greenhouse** descriptions are HTML-encoded twice. Decode the entities before stripping tags (`ingest.ts` does this).
- **Workday** has two public URL shapes for one job, `/<site>/job/<location>/<slug>` and `/<locale>/<site>/details/<slug>`. Both map to `/wday/cxs/<tenant>/<site>/job/<rest>`. The host number (`wd1`, `wd5`, `wd103`) varies by company.
- **Built In** pages carry no structured job data, so `extractJobPosting.ts` returns `{"found": false}`. Find the employer's posting instead. Built In pay bands show no currency.
- **LinkedIn** `/jobs/view/` pages fetched without a browser show a summary and a location guessed from *this* computer. Use `scanLinkedIn.ts --fetch <id>` for the full text, and trust the scanner's location field.
- **Board slugs can collide.** "flock" on Ashby is not Flock Safety. Check the board's size and titles before trusting a miss.

## 4. Shell differences on Windows

- The Code tab may use PowerShell. Heredocs (`<<'EOF'`) and `&&` chains may fail there.
  - Write payloads to `data/tmp/` with the Write tool and pass `--file`.
  - Run commands one at a time.
- Use forward slashes in paths. Node accepts them on Windows.
- `curl` in PowerShell can be an alias for something else. Use `curl.exe`, or let the Node scripts do the fetching.
