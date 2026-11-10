# Finding jobs

Read this for "find jobs", "check for new jobs", "what's new", a pasted job link, or "add a company".

## Contents
1. The regular run
2. LinkedIn: signed in and signed out
3. Built In
4. Company boards and `sources.json`
5. Web search, last
6. A job they paste in
7. Finding the employer's own posting
8. Triage: what to open, what to skip
9. Duplicates

## 1. The regular run

When they ask what's new, do these steps in order. Say in one line what each step found.

1. `scripts/ingest.ts` pulls every board in `profile/sources.json`. It filters by title and location and needs no judgment.
2. `scripts/login.ts --status` checks whether LinkedIn is signed in. Skip it if they opted out.
3. `scripts/scanLinkedIn.ts --days 14`, then `scripts/scanLinkedIn.ts --guest --days 14`.
4. `scripts/scanBuiltIn.ts`, if any of their places has a Built In site or they want remote.
5. For each new posting worth reading:
   - find the employer's posting (section 7)
   - add it (section 6 shows the shape)
   - score it ([scoring.md](scoring.md))
6. `scripts/query.ts pending-score` and score whatever is left.
7. `scripts/checkLiveness.ts --ids <ids you plan to show>`, then show only live roles.
8. `scripts/renderDigest.ts` writes `readouts/digests/<date>.md`. Then refresh the readout with `scripts/renderReadout.ts`.

A first run can be large. Score the best-looking 10 to 15 first, show those, and offer to keep going.

## 2. LinkedIn: signed in and signed out

LinkedIn is the best freshness signal for most fields. Plain web search mostly turns up postings that already closed.

**Run both modes every time.** They return different results:
- A signed-in search is ranked against the person's own profile and history.
- A signed-out search is ranked against nothing.
- Each buries good roles the other shows. A side-by-side test found about 40% of the signed-out results were missing from the signed-in run.
- The signed-out scan takes about a minute.

**What signing in adds:**
- salary bands on the cards
- "connections work here", which is a referral path
- exact posting times

**Signing in is their choice. Explain it before the first time:**

> LinkedIn's terms don't allow automated searching. If you sign in, this tool searches LinkedIn using your account, the way you would by hand but faster. The risk is that LinkedIn could flag or restrict your account. It's uncommon at this volume, but it's your account and your call. You can skip this and still search LinkedIn signed out.

If they agree, run `scripts/login.ts linkedin`. A Chrome window opens, they sign in themselves (including any code), and the window closes once it sees they are signed in.
- Never ask for their password.
- The session usually lasts months. `--status` tells you when it has lapsed, and the scan quietly falls back to signed-out results when it has.

**Useful flags:**
- `--fetch <linkedinJobId>` gets a posting's full text when the employer's own posting can't be found. Don't use WebFetch on a LinkedIn `/jobs/view/` page for scoring: it returns a summary, and the location it shows is guessed from *your* computer's location.
- `--show-known` lists postings already in the catalog, which are hidden by default.
- `--json` gives machine-readable output.

Searches, places and remote come from `search-profile.json` (`targetTitles`, `searchQueries`, `locations`, `remote`). To change what LinkedIn searches for, change the profile, with their OK.

## 3. Built In

`scripts/scanBuiltIn.ts` covers remote roles plus any of their cities that has a Built In site: Chicago, New York, Austin, Boston, Colorado, Los Angeles, Seattle and San Francisco.
- It needs no login. Its cards show the posting age and often a pay band.
- Its pay bands carry no currency. Confirm USD on the employer's posting before comparing a band to their floor.
- Categories come from `search-profile.json` → `builtInCategories`. When that is missing, it uses a sensible default.

## 4. Company boards and `sources.json`

`profile/sources.json` lists companies whose career boards are pulled directly. These are the most reliable source because they come straight from the employer.

```json
{
  "greenhouse": ["airbnb", "stripe"],
  "lever": ["plaid"],
  "ashby": ["ramp"],
  "workday": [{ "company": "Target", "url": "https://target.wd5.myworkdayjobs.com/targetcareers" }],
  "careerPages": []
}
```

**When they name a company to add:**
1. Check `references/company-boards.json` first. It holds over 100 checked boards grouped by industry.
2. Otherwise open the company's careers page and look at where the job links point:
   - `boards.greenhouse.io/<slug>` or `job-boards.greenhouse.io/<slug>`
   - `jobs.lever.co/<slug>`
   - `jobs.ashbyhq.com/<slug>`
   - `<tenant>.wdN.myworkdayjobs.com/<site>`
   - A `gh_jid=` in a link means the site runs on Greenhouse underneath.
3. Confirm it answers before saving it: `scripts/checkBoard.ts greenhouse <slug>`, `... lever <slug>`, `... ashby <slug>`, or `... workday <boardUrl>`.
4. Add it to `sources.json` and tell them how many open roles the board has now.
5. **If it runs on something else** (SuccessFactors, iCIMS, Taleo, Phenom, a custom site), put `{company, url}` under `careerPages`. Those can't be pulled automatically, and `ingest.ts` says so with a "no adapter" note. On each search, check them by hand instead: one `WebSearch` per company for its open roles matching their target titles, then read any hits and run them through liveness like any other find. Tell them plainly that these are checked by search, not pulled directly.

**To look at one company directly,** use `checkBoard.ts` and read every title yourself. Don't filter by keyword. Titles vary too much, and "Manager, Operations" will slip past a filter looking for "operations manager".

## 5. Web search, last

Use `WebSearch` only after the scans and boards, and expect most results to be dead.
- Search the employer's site or a recent date: `<title> careers <city> 2026`.
- Before fetching a result, check `scripts/query.ts known-urls` so you don't fetch something already in the catalog.
- Check every hit for closed-posting language ("no longer accepting applications", or a redirect to a general jobs page) and for the employer's live board.

## 6. A job they paste in

- **A link:** run `scripts/fetchPosting.ts "<url>" --save data/tmp/job.json` first. It reads Greenhouse, Lever, Ashby and Workday postings through their own systems, and any page with embedded job data, and saves a file ready for `addJob.ts`. Its result includes pay, schedule and posting date when the system has them. Use it for jobs you find too, not only pasted ones; it's faster and cheaper than WebFetch or a helper agent. If it says `found: false`, use `WebFetch`. If the page is blocked:
  1. use a browser (`openContext` in `scripts/browserSession.ts`; a visible window gets past most bot walls)
  2. if that fails too, ask them to paste the text
- **Indeed:** never fetch. Ask for the text.
- **`extractJobPosting.ts`:** run it on fetched HTML. It reads the structured data many career pages embed, at no model cost.

**Adding it:** write the job to `data/tmp/job.json`:

```json
{
  "source": "manual",
  "company": "Acme",
  "title": "Operations Manager",
  "url": "<where it was found>",
  "canonicalUrl": "<employer's own posting>",
  "descriptionText": "<the full text>",
  "location": "Denver, CO"
}
```

Then run `scripts/addJob.ts --file data/tmp/job.json`.
- `source` is `manual` for pasted jobs and `discovery` for ones you found.
- A `warning` about an aggregator-only URL is work to finish (section 7), not a note to pass along.
- A `possibleDuplicateOf` result means open the row it names and decide.

## 7. Finding the employer's own posting

A LinkedIn, Built In, Indeed, Glassdoor or ZipRecruiter link is a sighting. Those links rot within weeks, the copy is often incomplete, and the liveness check can't learn much from them. **Every job they might apply to needs the employer's own posting as `canonicalUrl`.**

Try these in order and stop at the first that works:
1. **`scripts/resolveCanonical.ts --ids <id>`** searches the company's Greenhouse, Lever and Ashby boards for a title match.
   - Check the report first, then run it with `--write --threshold 0.95`.
   - A `no_title_match` is not proof the job closed. The guessed board may belong to a different company with a similar name, so check the board's size and titles.
2. **A targeted search,** `<company> careers "<exact title>"`, then `scripts/setCanonical.ts <id> "<url>"`. It refuses aggregator links.
3. **Workday:** run `scripts/fetchPosting.ts` on the `myworkdayjobs.com` link. It confirms the job is live and gives the full text.

To list what still needs this, run `scripts/query.ts needs-canonical`. Jobs they have applied to come first.

**Staffing and "for our client" listings.** If a listing names no employer ("For our client, a leader in the healthcare space…"), it is not a job yet.
- Never catalog, score or draft from it.
- Use the distinctive phrases, industry, pay band and place to find the real employer. Check the catalog first, because it is often already there, sometimes already applied to.
- If you can't identify the employer, leave it out and mention it in one line.

## 8. Triage: what to open, what to skip

Scan output only tells you a posting exists. It says nothing about fit.

- **You may skip on the title alone only for two things:**
  - a title their profile excludes (`titleFilter.excludeKeywords`, `dealbreakers`)
  - a place they would not work
- **Everything else in range gets its full description read before a verdict.** "Sounds generic" is not a reason to skip. It scores lower; it is not discarded.
- **A company already in the catalog with a different title is a different job.** Open it.
- **Record every pass** as a `pass` score with a one-line reason.
- **In the hand-off, say how many postings you opened and how many you skipped, and why.**

## 9. Duplicates

- `upsertJob` matches a new sighting to an existing row by the posting id hidden in the URL (Greenhouse, Lever, Ashby, Workday or LinkedIn), within the same company.
- `catalogMatch` hides postings already known (any status) from scan output.
- What still slips through: a Built In or LinkedIn repost of a job they applied to under its original link. When a new posting's company and title closely match something already applied to, screening, interviewing or rejected, check before scoring it as new.
