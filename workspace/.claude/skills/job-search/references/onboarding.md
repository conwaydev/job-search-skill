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
- **One question at a time**, unless a step says to show a list and ask once. Use `AskUserQuestion` when there are clear options. Use a plain question when the answer is open.
- **Every step can be skipped.** If they want to skip, mark it `skipped`, say in one line what they'll miss, and move on. They can come back any time by saying "let's finish setup".
- **They can stop at any point.** Everything is saved as you go. If they say they need to stop, tell them: "Just open this folder again and say hi. I'll pick up right here."
- **Show what you made.** End each step by showing the result in a few lines, or naming the file. Then say what's next.
- **Opening message**, the first time only. Say in a few lines:
  - this finds jobs, scores them against their background, writes tailored resumes and letters from facts they've confirmed, and tracks every application;
  - setup takes about 20 minutes and has eight short parts;
  - any part can be skipped, and they can stop any time.

  Then start with whichever step is next.

## 2. setup: get this computer ready

Follow [setup.md](setup.md). Mark `setup` done when `doctor.ts` says ready. If setup needs a new session (the PATH step), mark it `in_progress` first so the next session picks up here.

## 3. resume: their baseline

Their baseline is the resume every score and every tailored version starts from. It lives in `profile/baseline-resume.json`, in the shape of `templates/resume.schema.json`.

1. **Ask for their current resume.** They can drag the file into this chat, or put it in the `profile` folder and tell you. A PDF or Word file works best.
   - **PDF:** read it directly.
   - **Word (.docx):** `scripts/extractDocx.ts "<path>"`.
   - **Older .doc or Pages:** ask them to export it as a PDF. In Word or Pages, that's File, then Export or Save As, then PDF.
   - **No file:** offer to paste their LinkedIn profile text instead, or to build it together, role by role.
2. **Keep the original.** Copy it to `profile/resume-original.<ext>`.
3. **Map it to the schema**, faithfully.
   - Keep their wording. Don't improve, shorten or reorder bullets. The baseline is their record, not a draft.
   - Put each job under `experience` with its `roles`. Promotions at one company are several roles under one company.
   - Anything that doesn't fit (volunteering, publications, languages) goes in `sections`.
   - If something is unclear, such as a missing date or two jobs that might be one, ask rather than guess.
4. **Show it back.** Give a short, plain summary:
   - their name and headline;
   - each company with the titles and dates;
   - how many bullets in all.

   Ask: "Does this look right? Anything missing or wrong?"
5. **Save it.** Write `profile/baseline-resume.json`, then run `scripts/syncBaseline.ts`. When `scripts/renderDocument.ts --baseline` exists, render it and tell them where the PDF is, so they can see it laid out.

## 4. search: what they're looking for

Start from `templates/profile/search-profile.json`. Write the answers into `profile/search-profile.json` as you go. Ask in this order, one at a time, and suggest answers from their resume so they mostly confirm rather than type.

1. **Titles.** "What job titles are you looking for?" Suggest three to five based on their recent roles, including the next step up and common other names for the same job. These go in `targetTitles`.
2. **Level.** Which levels are in range? Fill `titleFilter.levels` with words like "director" or "senior manager". Also fill `titleFilter.excludeKeywords` with levels that are too junior or too senior.
3. **Field.** Fill `titleFilter.domainKeywords` with words that tie a title to their field, and `wrongFunctionKeywords` with functions that share their titles but aren't their work. For example, "sales" for someone in marketing operations. Leave a list empty when you aren't sure. An empty list means the filter lets everything through.
4. **Where.**
   - Is remote OK? That's `remote`.
   - Which cities would work for hybrid or on-site? Those go in `locations`, as `{city, region, country}`.
   - Would they move?
5. **Pay.** "What's the lowest base salary you'd consider?" That's `minSalaryUSD`. If they'd rather not say, leave it null. Scoring then doesn't judge pay.
6. **Must-haves and dealbreakers.** Examples: "no travel over 25%", "must be a public company", "no agencies". These go in `mustHave` and `dealbreakers`.
7. **Industries** they want, or want to avoid.
8. **In their words**, what they're best at and what they want next. Write it into `positioning`.

Show the profile back as a short list in plain words, not JSON, and ask if it's right.

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

Start from `templates/profile/my-voice.md` and write the result to `profile/my-voice.md`.

1. Ask for one or two things they wrote themselves and liked: an email, a LinkedIn post, a note to their team. A paragraph or two is plenty. Say why: "so letters sound like you and not like a robot."
2. From the samples, write a few plain notes under "How they sound": sentence length, how formal they are, words they use. Put short excerpts under "Samples".
3. **Stories.** Ask for two or three moments from their work they're proud of. For each one: what was going on, what they did, and what changed. Write each one under "Stories" in their words, and note the kinds of roles it fits. Letters are built on these stories, so this is worth five minutes. Facts with numbers also go into `verified-metrics.md`.

If they'd rather skip it, letters still work, but you'll ask for a story each time you draft one.

## 7. linkedin: optional sign-in

Explain in one short paragraph:

> LinkedIn has the most job listings. I can search it without signing in, but signed in I see more. If you want that, I'll open a browser window and you sign in yourself. I never see your password. LinkedIn's rules don't allow automated searching, so there's a small chance it asks you to verify your account. I keep the searches slow and occasional to avoid that. You can skip this and still get plenty of jobs from company sites.

- **If they want it:** run `scripts/login.ts linkedin --wait 300`. Tell them a window will open, and that they should sign in and then come back here. When it returns, confirm with `scripts/login.ts --status`.
- **If they don't:** mark it skipped. Searches use the signed-out view.

Never ask for their password, and never read anything in `data/sessions/` or `data/browser-profile/`.

## 8. companies: who to watch

Many companies post jobs on their own careers site first, and the skill can check those sites directly.

1. Read `references/company-boards.json`. Offer the industries that match their `industries` and background, and let them pick companies from those groups. Keep each list short.
2. Ask: "Any other companies you'd love to work at?" For each one, find their jobs board.
   - Run `scripts/checkBoard.ts` on a likely slug.
   - Or search the web for "<company> careers" and work out which system hosts it (Greenhouse, Lever, Ashby or Workday).
   - If the board isn't one of those, add the careers page URL under `careerPages`.
3. Write `profile/sources.json`, starting from `templates/profile/sources.json`. Greenhouse, Lever and Ashby entries are slugs. Workday entries are `{company, url}`.
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
   - Tell them it's private to them, and that it's the page to bookmark.
   - From then on, after each update, publish to the same link: read it first with `action: read`, then publish with its `url`.
3. **If you don't,** tell them the file is `readouts/pipeline.html` and that they can open it in their browser.

It's empty now, and that's fine. It fills up after the first search.

## 10. firstRun: the first search

Tell them this takes a few minutes. Then:

1. Run `scripts/ingest.ts` to check the company boards.
2. Run the LinkedIn scan (signed in, or `--guest` if they skipped sign-in) and `scripts/scanBuiltIn.ts`, per [discovery.md](discovery.md).
3. Check liveness, then score the ten most promising new roles, following [scoring.md](scoring.md). Ask about any gaps in one batch, as that guide says.
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
