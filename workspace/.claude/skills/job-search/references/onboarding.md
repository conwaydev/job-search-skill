# Onboarding

Read this when `profile/onboarding-state.json` is missing or has a step that isn't `done` or `skipped`, or when they say "set me up".

The person may never have used anything like this. The whole thing should feel like a friendly conversation, not a form.

## Contents
1. How to run it
2. setup: get this computer ready
3. resume: their baseline
4. search: what they're looking for
5. metrics: their numbers, checked once
6. voice: how they write
7. linkedin: optional sign-in
8. companies: who to watch
9. tracker: their application tracker
10. firstRun: the first search
11. When it's finished

## 1. How to run it

- **Progress lives in a script.** Run `scripts/onboardingState.ts` to see where they are. After each step, run `scripts/onboardingState.ts set <step> done`, or `skipped`. Set a step `in_progress` when you start it. Never edit the state file by hand.
- **Draft, then ask.** Wherever you can work something out from their resume, draft it and show it once for corrections instead of asking question by question. Otherwise, one question at a time. Use `AskUserQuestion` when there are clear options. Use a plain question when the answer is open.
- **Every step can be skipped.** If they want to skip, mark it `skipped`, say in one line what they'll miss, and move on. They can come back any time by saying "let's finish setup".
- **They can stop at any point.** Everything is saved as you go. If they say they need to stop, tell them: "Just open this folder again and say hi. I'll pick up right here."
- **Show what you made.** End each step by showing the result in a few lines, or naming the file. Then say what's next.
- **Opening message**, the first time only. Say in a few lines:
  - this finds jobs, scores them against their background, writes tailored resumes and letters from facts they've confirmed, and tracks every application;
  - setup takes about 15 minutes and has eight short parts, mostly confirming things it drafts for them;
  - any part can be skipped, and they can stop any time.

  Then start with whichever step is next.

## 2. setup: get this computer ready

Follow [setup.md](setup.md). Mark `setup` done when `doctor.ts` says ready. Setup never needs a restart: if Node was just installed, keep using the folder's own Node for the rest of the session.

## 3. resume: their baseline

Their baseline is the resume every score and every tailored version starts from. It lives in `profile/baseline-resume.json`, in the shape of `templates/resume.schema.json`.

1. **Ask for their current resume.** A PDF or Word file works best. They can drag it into this chat, or just tell you its name ("it's in Downloads, called Resume 2026").
   - **They named a file or a place:** run `scripts/importResume.ts "<path or file name>"`. It finds the file, copies it into `profile/`, and prints the text of a Word file. For a PDF, read the copy it names. If it can't find the file, it lists likely candidates, so offer those.
   - **They dragged it into the chat:** read it from there. Keeping a copy is optional. Don't make them hunt for the path.
   - **Older .doc or Pages:** ask them to export it as a PDF. In Word or Pages, that's File, then Export or Save As, then PDF.
   - **No file:** offer to paste their LinkedIn profile text instead, or to build it together, role by role.
2. **Map it to the schema**, faithfully.
   - Keep their wording. Don't improve, shorten or reorder bullets. The baseline is their record, not a draft.
   - Put each job under `experience` with its `roles`. Promotions at one company are several roles under one company.
   - Anything that doesn't fit (volunteering, publications, languages) goes in `sections`.
   - If something is unclear, such as a missing date or two jobs that might be one, ask rather than guess.
3. **Show it back.** Give a short, plain summary:
   - their name and headline;
   - each company with the titles and dates;
   - how many bullets in all.

   Ask: "Does this look right? Anything missing or wrong?"
4. **Save it.** Write `profile/baseline-resume.json`, then run `scripts/syncBaseline.ts`.

## 4. search: what they're looking for

Draft the whole profile from their resume, show it once, then ask the two things a resume can't tell you. That's about three messages.

1. **Draft it.** Start from `templates/profile/search-profile.json` and fill in what the resume implies:
   - `targetTitles`: three to five titles, covering their current level, the next step up, and common other names for the same job;
   - `titleFilter.levels`, `excludeKeywords` (too junior, too senior), `domainKeywords`, and `wrongFunctionKeywords` (functions that share their titles but aren't their work). Leave a list empty when unsure. Empty means the filter lets everything through;
   - `locations`: their current city. Leave `remote` as true;
   - `industries`: the ones they've worked in;
   - `positioning`: one or two sentences on what they do best.
2. **Show it in plain words**, not JSON, as a short list: titles, level, field, where, industries. Ask: "Here's what I'd search for, based on your resume. What would you change? Different titles, other cities, remote or not, industries to add or avoid?"
3. **Ask what the resume can't say**, in one message:
   - the lowest base salary they'd consider (`minSalaryUSD`; if they'd rather not say, leave it null and pay isn't judged);
   - any dealbreakers or must-haves, such as heavy travel, agencies, or company size (`dealbreakers`, `mustHave`). "None" is a fine answer.
4. **Save** `profile/search-profile.json` and confirm in one line.

## 5. metrics: their numbers, checked once

This is one pass over a list, not an interview. Most people's numbers are fine. The point is to catch the few that aren't.

1. **Seed the list.** Run `scripts/seedMetrics.ts`. It copies every resume line with a number in it into `profile/verified-metrics.md` as `unverified`. Then run `scripts/metrics.ts list` to get them numbered.
2. **Show the whole list in one message.** Use a short numbered list, with each claim on one line. Then ask once:

   > These are the numbers on your resume. I'll only put numbers in applications that you could back up if an interviewer asked how you measured them. Any here you'd have trouble backing up, or that shouldn't be in writing (confidential figures, say)? If they're all fine, just say so.

3. **Confirm the rest in one go.** Everything they didn't flag:

   ```
   scripts/metrics.ts set all confirmed --except <flagged numbers> --source "<what they said, e.g. their own records>"
   ```

4. **Ask about the flagged ones only**, together in one short follow-up. For each, find out whether it's:
   - an estimate they're comfortable with (`confirmed`, with "own estimate" as the source);
   - fine to say but not write (`--use interview-only`);
   - fine in an application but not on public profiles (`--use applications-only`);
   - something to drop (`do-not-use`).

   Set them with `scripts/metrics.ts set <n,n> <status> [--use …] [--source …]`.
5. **One question about what's missing.** Ask: "Anything you're proud of that has a number but isn't on your resume? Team size, a budget, money made or saved, time saved, a launch, an award?" Add each real one as a new `### claim` with its source. If they say no, move on.
6. **Show the result in one line**, for example: "12 confirmed, 2 for interviews only, 1 dropped."

If they ask why at any point, say in one line: anything they can't back up is a risk in an interview, so it stays out.

## 6. voice: how they write

One ask. Start from `templates/profile/my-voice.md` and write the result to `profile/my-voice.md`.

1. Ask for one thing they wrote themselves and liked: an email, a LinkedIn post, or a note to their team. A paragraph is plenty. Say why: "so letters sound like you and not like a robot."
2. From it, write a few plain notes under "How they sound": sentence length, how formal they are, words they use. Put a short excerpt under "Samples".
3. **Don't ask for stories now.** Stories are collected the first time a cover letter needs one ([letters.md](letters.md)) and saved under "Stories" then. Tell them that in one line, so they know it's coming.

## 7. linkedin: optional sign-in

Explain in one short paragraph:

> LinkedIn has the most job listings. I can search it without signing in, but signed in I see more. If you want that, I'll open a browser window and you sign in yourself. I never see your password. LinkedIn's rules don't allow automated searching, so there's a small chance it asks you to verify your account. I keep the searches slow and occasional to avoid that. You can skip this and still get plenty of jobs from company sites.

- **If they want it:** run `scripts/login.ts linkedin --wait 300`. Tell them a window will open, and that they should sign in and then come back here. When it returns, confirm with `scripts/login.ts --status`.
- **If they don't:** mark it skipped. LinkedIn is still searched every time, through the signed-out view (`--guest`). Skipping sign-in never means skipping LinkedIn.

Never ask for their password, and never read anything in `data/sessions/` or `data/browser-profile/`.

## 8. companies: who to watch

Many companies post jobs on their own careers site first, and the skill can check those sites directly.

1. **Propose a list.** Read `references/company-boards.json`. Pick 15 to 20 companies that fit their industries, field and locations.
   - The list leans toward tech and big national brands. If fewer than about ten fit their field, fill the gap: search the web for the larger employers in their field in their cities (for example "largest 3PL companies Denver"), and keep the ones whose boards you can confirm (step 2). Don't pad the list with poor fits.
   - Show them as one short list grouped by industry. Ask: "I'll watch these companies' job pages. Want to drop any, or add companies you'd love to work at?"
2. **For each company they add,** find its jobs board, following "When they name a company to add" in [discovery.md](discovery.md).
   - Big employers rarely show their job system on the surface. `scripts/checkBoard.ts detect "<careers page url>"` finds it.
   - Greenhouse, Lever, Ashby, Workday, SuccessFactors, Phenom and iCIMS are pulled directly.
   - If the board runs on something the skill can't pull (Taleo, Oracle, a custom site), it goes under `careerPages`, and it gets checked by web search on each run. Say that plainly. Don't tell them it's watched directly.
3. Write `profile/sources.json`, starting from `templates/profile/sources.json`. Greenhouse, Lever and Ashby entries are slugs. Workday, SuccessFactors, Phenom and iCIMS entries are `{company, url}`, with the `entry` that `detect` returned as the url.
4. Tell them how many companies are being watched, and that they can add more any time by naming a company.

## 9. tracker: their application tracker

The tracker is one page that shows everything at a glance:
- how many jobs are at each stage, from found to offer;
- what changed recently;
- applications that have gone quiet;
- the best open roles.

1. Run `scripts/renderReadout.ts`. It writes `readouts/pipeline.html` and prints the path.
2. **If you have the Artifact tool,** publish that file as a private artifact titled "Application Tracker".
   - Save the link in `profile/links.json` as `{"tracker": "<url>"}`.
   - Tell them it's private to them, and that it's the page to bookmark. It's refreshed whenever they ask to see it, or after a search ([tracking.md](tracking.md)).
3. **If you don't,** tell them the file is `readouts/pipeline.html` and that they can open it in their browser.

It's empty now, and that's fine. It fills up after the first search.

## 10. firstRun: the first search

Tell them this takes a few minutes. Then:

1. Run `scripts/ingest.ts` to check the company boards.
2. Run the LinkedIn scan and `scripts/scanBuiltIn.ts`, per [discovery.md](discovery.md). Always run LinkedIn: signed in if they signed in, otherwise with `--guest`.
3. Check liveness, then score the **five** most promising new roles, following [scoring.md](scoring.md). Ask **at most three** gap questions, all in one message, about the things that would move scores most. The rest can come up later, one job at a time.
4. Refresh the tracker (step 9).
5. Show the top few in plain words: role, company, score, and one line on why. Ask which, if any, they'd like a tailored resume and letter for. Tailoring follows [tailoring.md](tailoring.md).

## 11. When it's finished

Run `scripts/onboardingState.ts`. When `finished` is true, tell them in a few lines what they can say from now on:

- "Find new jobs" or "what's new?"
- "Score this" with a job link
- "Tailor my resume for this one"
- "I applied to …", "I heard back from …", or "I have an interview with …"
- "Help me prep for my interview"
- "Show my tracker"

Also tell them that when something isn't right, they can just say so. You'll remember it for next time.
