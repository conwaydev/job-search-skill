# Tracking applications

Read this for "mark it applied", "I heard back", "I have an interview", "what's still open", "pipeline", or "who ghosted me".

## Contents
1. Statuses
2. Changing a status
3. Notes on an application
4. Pipeline and possibly-ghosted
5. Liveness checks
6. The tracker

## 1. Statuses

| Status | Meaning |
|---|---|
| `new` | Found, not yet scored |
| `scored` | Scored, no decision yet |
| `interested` | They want to apply |
| `applied` | They submitted it |
| `screening` | A recruiter or first call is set or done |
| `interview` | Real interviews |
| `offer` | Offer in hand |
| `rejected` | The company said no |
| `ghosted` | No reply for a long time, and they agreed to call it that |
| `withdrawn` | They pulled out |
| `archived` | The posting is gone, or it was a duplicate |
| `ignored` | Not interested, so keep it out of lists |

## 2. Changing a status

```
scripts/updateStatus.ts 42 applied "applied on the company site, resume and letter v1"
scripts/updateStatus.ts 42 screening "recruiter call Tue 3pm with Dana (recruiter)"
```

- History is append-only, so the note is the record. Make it useful: the date of the news, who it came from, and what is next.
- **Only change a status on real news** from them or from the company. If they forward a message, summarize it in the note.
- **When they say they applied,** also ask which documents they sent if it isn't obvious. That ties the outcome back to the version. Then run `scripts/searchReview.ts --due`. If it says due, offer the look-back in [learning.md](learning.md).
- **After every status change, run `scripts/renderReadout.ts`** so `readouts/pipeline.html` is current. A status change isn't finished until the readout matches. Publishing the shared copy waits until they ask to see it (section 6).

## 3. Notes on an application

Each application has a folder, `applications/<company-role>/`. Keep a `notes.md` there with dated sections:

- **Before an interview:** write a prep page and publish it so they can read it on their phone. See [interview-prep.md](interview-prep.md).
- **After an interview:** write a debrief in their words. [interview-prep.md](interview-prep.md) covers it too.
- **Offers:** the numbers, the deadline and their questions.

Facts that come up and could be used later go to `profile/verified-metrics.md` once they confirm them.

## 4. Pipeline and possibly-ghosted

```
scripts/statusSnapshot.ts
```

This prints counts by status and any role sitting in `applied`, `screening` or `interview` with no update for `staleAfterDays` days (21 by default; set in `search-profile.json`).

- **"Possibly ghosted" is a flag, not a decision.** Tell them which roles look stale and ask. Only mark `ghosted` when they agree.
- Offer a short, friendly follow-up note for a stale role they still want. They send it, not you. It follows [writing.md](writing.md).

## 5. Liveness checks

Postings vanish constantly, and job boards keep showing them for weeks. In one real catalog, a sixth of the "open" roles had already closed.

```
scripts/checkLiveness.ts                    # all open roles (new, scored, interested)
scripts/checkLiveness.ts --ids 14,169       # specific roles
scripts/checkLiveness.ts --status applied,screening
```

| Verdict | Meaning | What to do |
|---|---|---|
| `dead` | 404, gone from the employer's board, or redirected to a general jobs page | Archive it |
| `removed` | The page says the job is closed or filled | Archive it |
| `live` | Still there | Keep it |
| `blocked` | Bot wall or login wall, so unknown | Never archive. Show it as unconfirmed. |
| `error` | Network failure | Retry later |

To archive: `scripts/updateStatus.ts <id> archived "posting gone, liveness check <date>"`.

- **When a company runs a known board system, ask the board, not the page.** A Greenhouse, Lever, Ashby or Workday careers page shows a normal page even for a job that's long gone. The script already knows this.
- **A `live` verdict on a LinkedIn link is weak.** It confirms the card, not the job. Find the employer's posting when it matters.
- **Never archive a role they applied to just because the posting closed.** That's normal once they are in the process.
- Run a full check every couple of weeks, and always before they sit down to apply.

## 6. The tracker

`scripts/renderReadout.ts` writes `readouts/pipeline.html` from the database. That page is their Application Tracker. It shows:
- counts: applied, reached a screen, reached interviews, in process, offers, rejected, waiting;
- a flow chart of where applications went, from applied through screens and interviews to where each stands now (hover a ribbon to see the companies);
- applications that have gone quiet;
- recent changes, each with the note saved on that status change, so notes are worth writing well;
- applications per week, and a table of every application with how far it got and where it stands;
- the best open roles they haven't applied to.

**The local file is refreshed after every status change. The published copy is refreshed less often**, so they don't get an approval prompt for every "I applied". Publish only when:
- they ask to see it ("show my tracker", "how's it looking"), or
- a "find new jobs" run has finished.

To publish:
1. Read `profile/links.json`.
2. **If it has a `tracker` link and you have the Artifact tool,** read that artifact first (`action: read` with its URL). Then publish `readouts/pipeline.html` to the same URL. The link they bookmarked keeps working.
3. **If there's no link yet,** publish it as a new private artifact titled "Application Tracker". Save the URL under `tracker` in `profile/links.json`, keeping any other keys.
4. **If you don't have the Artifact tool,** tell them it's updated at `readouts/pipeline.html`. `--open` opens it in their browser.

After a status change, a one-line "Updated your tracker." is enough. Don't publish.

"Show my tracker" means: refresh, publish, and give them the link.

Digests (`scripts/renderDigest.ts`) are the dated "what's new" summaries, in `readouts/digests/`.

**Queries you write yourself** must exclude `archived` and `ignored`, or a dead duplicate will come back as a "new top match".
