# Writing anything an employer will read

These rules cover resumes, cover letters, follow-up notes, recruiter replies and application form answers. Read this before drafting any of them. Then read `profile/my-voice.md` and `profile/learned-rules.md`, which beat everything here.

## Contents
1. Facts: verified-metrics.md
2. Nothing negative, ever
3. Sound like them
4. AI tells to avoid
5. Read it out loud
6. Check before handing it over

## 1. Facts: verified-metrics.md

Every number and every specific claim about their work comes from `profile/verified-metrics.md`, from the baseline resume, or from something they told you in this conversation. If a claim comes from the conversation, add it to the file first.

Each entry looks like this:

```markdown
### Cut new-hire onboarding from 6 weeks to 3
Status: confirmed
Use: anywhere
Source: HR dashboard export, Q3 2025; manager confirmed in review
Notes: Team of 14. Don't round to "half".
```

- **Status:**
  - `confirmed` means it can be used.
  - `unverified` means they haven't confirmed it yet, so don't use it.
  - `do-not-use` means they ruled it out.
- **Use:**
  - `anywhere`: fine on the baseline resume and LinkedIn.
  - `applications-only`: fine in a document sent to one employer, but not on public profiles. Revenue figures at a public company often fall here.
  - `interview-only`: say it out loud, never write it.

`scripts/auditProse.ts` blocks any number that isn't in a usable entry. If it flags one, either confirm it with them and add it, or cut it. Don't rephrase the number to get past the check.

**When a number looks unusually good, ask how it was measured.** Growth that starts the day the tracking started is a tracking change, not growth.

## 2. Nothing negative, ever

This is the most important writing rule. Anything an employer reads states what the person does and owns, in plain declarative sentences, and stops there.

- **Never concede a gap.** No "I haven't done X yet," "I'd be learning," or "I want to be upfront about…".
  - When a posting wants something they haven't done, there are two correct moves. State the closest thing they really own, affirmatively. Or leave it out and let the interview raise it.
- **Never mention a failure, a decline, a layoff or a mistake.** A number that went down does not appear, even with a good explanation next to it.
- **No unflattering metrics,** such as a low win rate, a coverage gap or a failure percentage. Check the direction before using any trend.
- **Never rank them below anyone,** and no modesty.
- **No hedging.** Cut "I think," "I believe," "I hope to," "could potentially," "fairly" and "somewhat".
- **Nothing negative about the company either.** Describe what is happening there, never what is wrong with it.

This is the opposite of scoring. A score is candid and private. A document is confident and public.

## 3. Sound like them

- **Read `profile/my-voice.md` first,** and read their actual samples, not just the notes about them. Calibrate to their real sentences.
- **Plain declarative sentences a person would say out loud.** Subordinate clauses are fine. Avoid clipped ad copy ("Shipped it. Twice.") and avoid manufactured wisdom (a big general statement tacked onto a concrete sentence).
- **Plain verbs:** led, managed, built, ran, cut, opened, fixed, hired, trained, launched.
  - Avoid weak verbs: responsible for (as an opener for their own duties), helped, worked on, assisted, handled, participated in, utilized.
  - Avoid inflated verbs: spearheaded, orchestrated, pioneered, transformed, championed, fostered.
- **Credit the team when a team did it.** "My team rebuilt…" reads stronger at a senior level than "I rebuilt…", and it is true.
- **No fight metaphors,** such as fought for, battled, pushed back or defended. Say what happened.
- **Spell things out.** "Organization," not "org". Common acronyms in their field are fine.

## 4. AI tells to avoid

Readers spot these immediately. Fix them by changing the sentence's structure, not by swapping words.

| Tell | Example | Instead |
|---|---|---|
| Em dashes | "the team — and the work —" | Commas or two sentences |
| "Not just X, but Y" / "rather than" | "not just a manager, but a coach" | Say the one thing |
| Paired opposites, used for effect | "fast to ship and slow to break" | At most one per document |
| Colon reveals | "The result: fewer tickets." | "Tickets dropped." |
| Rule of three | "clear, consistent, and scalable" | Name the one that matters |
| Trailing "-ing" clause | "…, enabling the team to grow" | A new sentence that says what happened |
| Buzzwords | leverage, unlock, robust, seamless, elevate, delve, passionate, dynamic, synergy, thrive, proven track record | The specific thing |
| Lines lifted from the posting | Their bullet, lightly reworded | What they actually did that answers it |
| Uniform rhythm | Every bullet 20 words, every sentence the same shape | Vary it, from 12 to 40 words |
| Repeated phrasing | The same six-word phrase in two places | Say it once |

**Real lists are fine.** Four department names are information, not a tell. Don't mangle facts to dodge a pattern.

Mirror the posting's **job title** (recruiters search for it). Never mirror its **prose**.

## 5. Read it out loud

A sentence can be true and still unusable. Before handing anything over, read each line and ask how it *sounds*. These shapes come up again and again:

- **Bookkeeping.** "Hired eight people and promoted three." Lead with the judgment call and let the staffing be the evidence. Growth belongs to the people who earned it.
- **A job description dressed as an achievement.** "Set priorities and reported results." Say what changed because they were there.
- **Repetition that sounds like failure.** "Rebuilt the process three times." Frame it as steady evolution they led.
- **The wrong altitude.** A single tactical win in a senior document. Senior readers want standing responsibility across teams.
- **Explaining things nobody asked about.** Cut the closing generalization. The concrete sentence was already finished.

## 6. Check before handing it over

1. Run `scripts/auditProse.ts <file>`.
   - Fix every hard hit.
   - Read each soft hit and keep it only if it survives being said out loud.
2. Search for first-person negatives (I have not, I don't, I lack, no direct experience) and hedges, and rewrite them affirmatively.
3. Check that every number appears in a usable entry in `verified-metrics.md`.
4. Make sure no line matches a line from another application's documents.
5. **Never hide text** for screening software (white text, tiny text, instructions to an AI). The big applicant systems detect it and can flag the candidate. The downside is severe, and there is no upside.
