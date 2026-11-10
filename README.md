# Job Search

Howdy! When I started looking for my next job, I built a Claude skill to handle the parts of a search that wear you down. This is that skill, cleaned up so anyone can use it. It lives in a folder on your computer, runs in the Claude desktop app, and you talk to it in plain English.

It handles the searching, the checking and the bookkeeping. You decide what to apply for, and you send every application yourself. It won't put a number in an application unless you've confirmed it. Hiring managers are buried in machine-written applications right now. This is built to help you send fewer, better ones that are actually yours.

**See it work, with a demo video and a setup walkthrough, at [conwaydev.com/job-search](https://conwaydev.com/job-search).**

## What it does

**Finds jobs and checks they're still open.**
- It searches LinkedIn, Built In and the careers pages of companies you pick. It reads the job systems a lot of employers post on, from startups on Greenhouse, Lever and Ashby to big companies on Workday, SuccessFactors, Phenom and iCIMS.
- It checks each posting is still open before showing it to you, and skips listings that don't name the employer.

**Scores each role against your background.**
- You get a score and a plain reason for it.
- When it can't tell whether you have something a job asks for, it asks you.

**Writes a cover letter and resume for each application.**
- Each one is written from scratch for that role.
- Numbers come only from a list of facts you've confirmed.
- Letters are built on stories you've told it, in your own voice, and checked for phrasing that sounds machine-made.
- You get PDFs ready to send, plus Word copies if you want to change the font or tweak the wording.

**Tracks every application.**
- Tell it "I applied", "I heard back" or "I have an interview Tuesday" and it updates the record.
- Your Application Tracker page shows where every application went, from applied through screens and interviews to where it stands now. It also shows recent changes with your notes, what's gone quiet, and the best roles you haven't applied to yet.
- Before an interview it writes a prep page you can read on your phone. It covers who you're meeting, which of your stories fit, likely questions and questions to ask back.

**Learns from you.**
- Correct it ("hybrid in Boulder is fine", "never say *results-oriented*") and it writes the rule down and follows it from then on.
- After every ten applications it looks at what's getting responses and suggests changes to your search.

## What you need

- A Mac or a Windows PC.
- The Claude desktop app ([claude.ai/download](https://claude.ai/download)) on a Pro plan or higher. It runs in the app's **Code** tab, which isn't on the free plan.
- Room in your Claude usage. It shares limits with your regular chats, and setup and the first search use the most.
- About 15 minutes for setup. You can stop and pick up later.

You don't need to know anything technical. You won't open a terminal, and nothing is installed outside the folder.

## Install

1. **Unzip** `JobSearch.zip` and move the `JobSearch` folder somewhere you'll keep it, like your home folder or Documents. Avoid Downloads and synced folders such as iCloud Drive, OneDrive or Dropbox.
2. **Open it.** In the Claude app, go to the **Code** tab, open the `JobSearch` folder, and say yes when it asks if you trust the folder.
3. **Type `set me up`.**

The folder also has a `START HERE.txt` with these same three steps.

## What "set me up" does

Claude walks you through eight short parts. Wherever it can, it drafts from your resume and you correct it. Any part can be skipped.

1. **Gets the computer ready.** It downloads Node, the free tool its scripts run on, into the folder, and checks for a browser. No admin password is needed.
2. **Your resume.** Drop in a PDF or Word file, or say where it is ("it's in Downloads, called Resume 2026"). It turns your resume into a baseline and shows it back so you can check it.
3. **What you're looking for.** It drafts titles, level and locations from your resume for you to adjust, then asks your lowest acceptable pay and any dealbreakers.
4. **Your numbers.** It lists every figure on your resume and asks which, if any, you couldn't back up in an interview. Only those get a follow-up.
5. **How you write.** Paste one thing you wrote, like an email or a post. Stories for cover letters come later, when the first letter needs one.
6. **LinkedIn, if you want.** A browser window opens and you sign in yourself. Claude never sees your password. If you skip it, LinkedIn is still searched without signing in.
7. **Companies to watch.** It suggests 15 to 20 that fit you. Drop any, or add your own.
8. **Your tracker and a first search.** It runs the first search, scores the five best matches and walks you through them.

Close the app any time. When you open the folder again and say hi, it picks up where you left off.

## Day to day

Say what you want in your own words. Some examples.

- "Find new jobs" or "what's new?"
- "Score this" with a job link
- "Tailor my resume for this one"
- "I applied to the Acme job"
- "I have an interview with Acme on Thursday. Help me prep."
- "Show my tracker"
- "That's wrong, I've managed a budget before." It fixes the mistake and remembers.

## Privacy

- **Your resume, your search, every application and every note stay in the `JobSearch` folder** on your computer. There's no separate account to create.
- **What leaves your computer** is the job searches and pages it reads, plus your conversation with Claude, the same as any Claude chat.
- **Your LinkedIn sign-in is saved in the folder** and never leaves it. Claude is told never to read those files.
- **Your tracker and prep pages** can be published as private pages in your Claude account so you can open them on your phone. Only you can see them unless you share them.

## Updating

When you get a newer zip, unzip it into Downloads. Don't unzip it over your folder. Then open your existing `JobSearch` folder in Claude and say "update the job search skill". It swaps in the new version and leaves your data alone. You can delete the download afterwards.

## FAQ

**Is using it with LinkedIn allowed?** LinkedIn's terms don't allow automated searching. It keeps searches slow and spaced out, and you sign in yourself, but LinkedIn may still ask you to verify your account. Signing in is optional.

**Does it apply to jobs for me?** No, and it won't. Every application is yours to read and send.

**Can it make things up?** It's built not to. A script blocks any number that isn't on your confirmed list, and it asks about possible gaps instead of assuming them. Read everything before you send it anyway.

**New computer?** Copy the folder over. In the copy, delete `.runtime`, `data/browser-profile` and `data/sessions`, then open it and say "set me up". Setup reinstalls what's needed, and you sign in to LinkedIn again.

**Something's broken.** Say so in plain words, like "the search isn't working". It checks itself and walks you through the fix. If it can't sort it out, open an issue here and I'll take a look.

**Is there a version that doesn't need Claude?** Not yet, but I'm building one! It's a standalone version of this skill that doesn't need a download or a Claude account. If you're interested in beta testing, please reach out.

## Say hi

If you have questions, find a bug or land the job, I want to hear about it. Say hi at conway.justin@gmail.com.
