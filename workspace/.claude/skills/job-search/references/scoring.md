# Scoring a job

Read this before scoring anything. Also read `profile/learned-rules.md`, because its rules beat these defaults.

## Contents
1. Before you score
2. What to weigh
3. Writing the score
4. Explaining a score to them

## 1. Before you score

**Get the whole posting.**
- Never score from a truncated slice of the description. The disqualifying part (required degree, salary range, on-site days, a specialty they lack) is usually near the bottom.
- If the text is very long, still read all of it. If context is tight, hand the full text to a subagent and have it report back. Do not skim.

**Read the details panel too.**
- Many career sites (Workday, Oracle, Phenom, iCIMS) show salary, degree level, locations, schedule and posting date in a panel outside the description. `extractJobPosting.ts` returns only the description.
- After fetching a page, search the raw HTML for that panel:
  ```
  (minimum|maximum) salary | degree level | posting date | locations | job schedule
  ```
- No salary in the extracted text means "not checked yet," not "not posted." Only write "no salary posted" after you have looked for it.

**"Hybrid" with no day count is a question.**
- Application forms often hide the real requirement in a screening question, such as "Can you be in our office four days a week?", visa sponsorship, or travel.
- When the work model decides the score, open the apply form and read the questions. A browser is fine for this: `openContext` in `scripts/browserSession.ts`, or ask them to look.

**Ask about gaps instead of inferring them.**
- The baseline resume is a summary. Something missing from it is not evidence they lack it.
- Batch every open question into one `AskUserQuestion` call ("Have you managed a budget?", "Any experience with Salesforce?") and wait.
- Record a gap only when they confirm it or the resume plainly contradicts it.
- Anything they confirm that is a real fact about their work goes into `profile/verified-metrics.md` (see [learning.md](learning.md)).
- This keeps scores honest. It also keeps invented weaknesses out of cover letters.

**Find the employer's posting first** if all you have is a LinkedIn or Built In sighting. The employer's copy is the complete one. See [discovery.md](discovery.md).

## 2. What to weigh

Score role fit against `profile/search-profile.json` and the baseline resume. Match on meaning, not shared keywords: titles for the same job vary wildly.

| Factor | How to weigh it |
|---|---|
| **The actual work** | The strongest signal. Read the responsibilities, and match them against what they have really done and what their profile says they want. A promising title does not guarantee a match, and a dull title does not rule one out. |
| **Level** | Does the scope match the `targetTitles` and `titleFilter.levels` they chose? A role one step below or above costs points. A role far off is a pass. |
| **Salary** | If a range is posted, compare it to `minSalaryUSD`. A top end below the floor is a serious drag. A posting with no range gets no penalty, so note it as an open question. Built In and some boards show bands with no currency, so confirm the currency before comparing. |
| **Location and work model** | Remote is fine if `remote` is true. Hybrid or on-site in one of their `locations` is fine. Being required in some other city is a real constraint, so name it plainly. |
| **Must-haves** | Anything in `mustHave` that is missing from the posting costs points. |
| **Dealbreakers** | Anything in `dealbreakers` that is present makes it a `pass`, and the rationale says which one. |
| **Hard requirements they lack** | A required license, clearance or degree they do not have is a gate. Say so plainly. Do not paper over it. |
| **Industry** | A match with their `industries` is a plus. A mismatch is a small minus unless they said it matters. |

**Score bands:**
- 85 and up: `strong_fit`
- 70 to 84: `worth_applying`
- 55 to 69: `stretch`
- Below 55: `pass`

`confidence` runs from 0 to 1. Lower it when the posting is thin, the salary or work model is unknown, or you scored from an aggregator copy.

## 3. Writing the score

Get the resume version id from `scripts/query.ts baseline`. Write this to `data/tmp/score.json`:

```json
{
  "jobId": 42,
  "resumeVersionId": 1,
  "score": 78,
  "confidence": 0.8,
  "rationale": "Two or three plain sentences on why.",
  "strengths": ["..."],
  "gaps": ["only gaps they confirmed"],
  "recommendedAction": "worth_applying",
  "salaryMin": 120000,
  "salaryMax": 150000,
  "workModel": "hybrid"
}
```

Then run `scripts/writeScore.ts --file data/tmp/score.json`.

- `workModel` is `remote`, `hybrid`, `onsite` or `unknown`. Use `unknown` rather than guessing.
- Leave out `salaryMin` and `salaryMax` when no range is posted. Never estimate one.
- Write the rationale so they can skim it and know why, especially when the title and the score seem to disagree.

**A role you read and passed on still gets a score** (`pass`, with a one-line reason). That way the next scan hides it and the decision is on file. A role you only glanced at is unreviewed, not passed.

## 4. Explaining a score to them

- Lead with the verdict and the one or two reasons that drive it.
- Be candid. Scoring is for them, so real gaps, low pay and long commutes all belong here, even though none of it ever goes in a letter.
- If they disagree, ask what you missed. Rescore, then record the lesson in `learned-rules.md` under `## Scoring`.
