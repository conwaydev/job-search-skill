# Job Search

Howdy! Job hunting right now is exhausting. A lot of what's posted isn't real, every application wants its own resume, and it's easy to lose track of who wrote back. When I started my own search, I built a Claude skill to do that work with me.

This is that skill, cleaned up so anyone can use it. It finds jobs that are actually open, tells you honestly where you fit, and writes a cover letter and resume for each one from your own stories. It never makes up a number, and it never sends anything for you. Setup takes about 15 minutes, and you won't touch any code.

**See it work at [conwaydev.com/job-search](https://conwaydev.com/job-search).**

## What it does

- **Finds jobs and checks they're real.** It searches LinkedIn, Built In and the careers pages of the companies you pick, from startups on Greenhouse and Ashby to big companies on Workday, SuccessFactors and iCIMS. It checks each posting is still open before showing it to you.
- **Scores every role against your background.** You get a score and a plain reason. When it can't tell whether you have something a job asks for, it asks you.
- **Writes a cover letter and resume for each one.** Written from scratch for that job, in your voice, using only numbers you've confirmed. You get PDFs to send, plus Word copies if you want to change the font or fix a line yourself.
- **Keeps track of everything.** Say "I applied to Acme" or "I heard back" and it updates your Application Tracker, a private page that shows where everything stands and what's gone quiet.
- **Helps you prep for interviews.** It writes a prep page you can read on your phone, covering who you're meeting, which of your stories fit and what to ask back.
- **Learns from you.** Tell it a score is off or a sentence doesn't sound like you, and it follows that from then on.

## What you need

- A Mac or a Windows PC.
- The Claude desktop app ([claude.ai/download](https://claude.ai/download)) on a Pro plan or higher. It runs in the app's **Code** tab, which isn't on the free plan.
- About 15 minutes, plus your resume as a PDF or Word file.

You won't open a terminal, and nothing is installed outside the folder.

## Install

1. **Download** [`JobSearch.zip`](https://github.com/conwaydev/job-search-skill/releases/latest/download/JobSearch.zip), unzip it, and move the `JobSearch` folder somewhere you'll keep it, like your home folder. Skip Downloads and synced folders like iCloud Drive, OneDrive or Dropbox.
2. **Open it.** In the Claude app, go to the **Code** tab, open the `JobSearch` folder, and say yes when it asks if you trust the folder.
3. **Type `set me up`.** Claude takes it from there.

Setup drafts from your resume wherever it can, so you're fixing things instead of filling out forms. Any part can be skipped, and if you close the app it picks up where you left off.

## Day to day

Say what you want in your own words, like "what's new?", "score this" with a link, "tailor my resume for this one", "I applied to the Acme job" or "I have an interview Thursday, help me prep."

## Privacy

Your resume, your search, every application and every note stay in the `JobSearch` folder. What leaves your computer is the job searches it runs and the pages it reads, plus your conversation with Claude, same as any other Claude chat. Your LinkedIn sign-in is saved in the folder, and Claude never sees your password.

## Updating

Download the newest zip and unzip it into Downloads, not over your folder. Open your existing `JobSearch` folder in Claude and say "update the job search skill". It swaps in the new version and leaves your data alone.

## FAQ

**Is using it with LinkedIn allowed?** LinkedIn's terms don't allow automated searching. It keeps searches slow and spaced out, and the worst I've seen is LinkedIn asking you to confirm it's you. Signing in is optional.

**Can it apply for me?** No, and it won't. Every application is yours to read and send.

**Can it make things up?** It's built not to. A script blocks any number that isn't on your confirmed list. Read everything before you send it anyway.

**New computer?** Copy the folder over, delete `.runtime`, `data/browser-profile` and `data/sessions` in the copy, then open it and say "set me up".

**Something's broken.** Tell Claude in plain words, like "the search isn't working". It checks itself and walks you through the fix. If it can't, [open an issue](https://github.com/conwaydev/job-search-skill/issues) and I'll take a look.

**Is there a version that doesn't need Claude?** Not yet, but I'm building one! It's a standalone version that doesn't need a download or a Claude account. If you're interested in beta testing, please reach out.

## Say hi

If you get stuck, find a bug or land the job, I want to hear about it. Say hi at conway.justin@gmail.com.
