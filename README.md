# Job Search

A job-search assistant that lives in a folder on your computer and runs in the Claude desktop app. You talk to it in plain English. It does four things.

**1. It finds jobs, scores them, and checks they're still real.**
- It searches LinkedIn, Built In, and the careers pages of the companies you care about. That includes Greenhouse, Lever, Ashby and Workday, which is where most tech and Fortune 500 companies post.
- It scores each role against your actual background, not keyword overlap.
- Before showing you anything, it checks the posting is still open. Dead listings and staffing-agency reposts never make the list.

**2. It tailors a resume and cover letter that sound like you.**
- Every application gets its own resume and letter, built from scratch for that role.
- Every number comes from a list of facts you've confirmed. Nothing unverified goes in front of an employer.
- Letters are built on stories you've told it and written in your voice, then checked for the phrases that make writing sound machine-made.
- You get print-ready PDFs.

**3. It tracks every application.**
- Tell it "I applied", "I heard back" or "I have an interview Tuesday", and it keeps the record, with notes.
- You get an Application Tracker page:
  - how far applications get;
  - what's active;
  - what's gone quiet;
  - the best roles you haven't applied to yet.
- Before an interview it writes a prep page you can read on your phone: who you're meeting, which of your stories fit, likely questions, and questions to ask back.

**4. It gets better as you use it.**
- When you correct it ("hybrid in Boulder is fine", "never say *results-oriented*"), it writes the rule down and follows it from then on.
- Every ten applications it looks at what's getting responses and suggests changes to your search.

## What you need

- A Mac or a Windows PC.
- The Claude desktop app ([claude.ai/download](https://claude.ai/download)) on a paid plan, which includes the **Code** tab.
- About 20 minutes for setup. You can stop and pick up later.

You don't need to know anything technical. You won't need a terminal, and nothing gets installed anywhere except inside the folder.

## Install

1. **Unzip** `JobSearch-vX.Y.zip` and move the `JobSearch` folder somewhere you'll keep it, like your home folder or Documents. Avoid Downloads and synced folders such as iCloud Drive, OneDrive or Dropbox.
2. **Open it.** In the Claude app, go to the **Code** tab, open the `JobSearch` folder, and say yes when it asks if you trust the folder.
3. **Type `set me up`.**

The folder also has a `START HERE.txt` with these same three steps.

## What "set me up" does

Claude walks you through eight short parts, one question at a time. Any part can be skipped.

1. **Gets the computer ready.** It downloads Node, the free tool the scripts run on, into the folder, and checks there's a browser. This needs no admin password.
2. **Your resume.** Drop in a PDF or Word file. It turns the resume into your baseline and shows it back so you can check it.
3. **What you're looking for.** Titles, level, places, remote, pay floor, and dealbreakers.
4. **Your numbers.** It shows every figure on your resume in one list and asks which, if any, you couldn't back up in an interview. Only those get a follow-up. Only confirmed facts are used in applications.
5. **How you write.** Paste something you wrote, and tell it two or three stories you're proud of.
6. **LinkedIn, optional.** A browser window opens and you sign in yourself. It never sees your password. You can skip this; it still searches LinkedIn signed out.
7. **Companies to watch.** Pick from a list of about 100 verified company boards in eight industries, or name your own.
8. **Your tracker and a first search.** It runs a first search and shows you the best matches.

Close the app any time. When you open the folder again and say hi, it picks up where you left off.

## Day to day

Just say what you want:

- "Find new jobs" or "what's new?"
- "Score this" and paste a job link
- "Tailor my resume for this one"
- "I applied to the Acme job"
- "I have an interview with Acme on Thursday. Help me prep"
- "Show my tracker"
- "That's wrong, I've managed a budget before." It fixes the mistake and remembers.

## Privacy

- **Everything stays in the `JobSearch` folder on your computer:** your resume, your search, every application and every note. There's no account and no server.
- **The only things sent out** are the searches and page visits you ask for, plus your conversation with Claude, as with any Claude chat.
- **Your LinkedIn sign-in is stored in the folder** and never leaves it. Claude is told never to read those files.
- **It never applies, sends a message or contacts anyone for you.** It drafts, and you decide.
- **Tracker and prep pages** can be published as private pages in your Claude account, so you can open them on your phone. They stay private unless you share them.

## Updating

When you get a newer zip, unzip it into Downloads. Don't unzip it over your folder. Then open your existing `JobSearch` folder in Claude and say "update the job search skill". It swaps in the new version and leaves your data alone. You can delete the download afterwards.

## FAQ

**Is using it with LinkedIn allowed?** LinkedIn's terms don't allow automated searching. It keeps searches slow and occasional, and you sign in yourself, but there's a small chance LinkedIn asks you to verify your account. Signing in is optional.

**Does it apply to jobs for me?** No. It finds, scores, writes and tracks. You decide and you apply.

**Can it make things up?** It's built not to. Numbers have to be on your confirmed list, and a script blocks any that aren't. It asks about apparent gaps instead of assuming them. Still, read everything before you send it. It's your name on it.

**New computer?** Copy the folder over. Delete `.runtime` and `data/browser-profile` and `data/sessions` from the copy, then open it and say "set me up". Setup reinstalls what's needed, and you sign in to LinkedIn again.

**Something's broken.** Say so in plain words, such as "the search isn't working". It checks itself and walks you through the fix.

## For maintainers

```
workspace/              becomes the JobSearch folder
  CLAUDE.md             first-message checks, how to talk, hard limits
  .claude/settings.json pre-approved commands, denied paths
  .claude/skills/job-search/
    SKILL.md            routing and rules
    references/         one guide per job (onboarding, scoring, tailoring, …)
    scripts/            Node 22.18+ TypeScript, no build step
    setup/              Node installers (sh, ps1), updater
    templates/          resume and letter schemas, profile starters
tools/package.mjs       builds dist/JobSearch-v<version>.zip
tools/verifyBoards.mjs  re-checks the company board list
```

- **Release:**
  1. Bump `version` in `workspace/.claude/skills/job-search/package.json`.
  2. Commit.
  3. Run `node tools/package.mjs`.
  4. Send the zip.
- **The zip is built from git-tracked files only,** and the build refuses to run if a scrub word appears.
- **Testing a change:** point any script at a scratch folder with `JOBSEARCH_HOME=/some/folder`.
