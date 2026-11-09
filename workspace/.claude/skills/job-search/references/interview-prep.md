# Interview prep

Read this when they have an interview coming up, ask for prep, or say "help me get ready for…". Also read it after an interview, to write the debrief.

## Contents
1. What good prep looks like
2. Gather first
3. The prep notes
4. Where the prep goes (doc, artifact or file)
5. After the interview
6. Rules

## 1. What good prep looks like

They should be able to read it on their phone in ten minutes before the call and walk in knowing:
- who they're meeting;
- what this round is for;
- which three or four of their stories to tell;
- what they'll probably be asked;
- what to ask back.

Write one prep per round. A panel gets one section per interviewer.

## 2. Gather first

Ask in one batch for whatever you don't already know:
- the date and time;
- who they're meeting, with names and titles if they have them;
- the format (phone, video, on-site, case, technical);
- anything the recruiter said about the round.

Then:

1. **Re-read the posting** and the latest score with `scripts/query.ts job <id>`. Also re-read `applications/<slug>/notes.md` and whatever was sent: the tailored resume and the letter. The prep has to match what the interviewer has in front of them.
2. **Research the company.** Use recent news, what it says about itself, the product, and how the team describes its own work. Search the web. Prefer the company's own pages, engineering or team blogs, and interviews with its leaders. Note the source for each thing you use.
3. **Research each interviewer**, from public information only:
   - their role and how long they've been in it;
   - talks, posts or articles they've published;
   - what they say about their team and how they like to work.

   With LinkedIn signed in, `scripts/peopleLookup.ts --urls <file>` reads a profile in full, including posts and comments. Space runs out. Never contact anyone.
4. **Pull their material** from `profile/my-voice.md` (Stories) and `profile/verified-metrics.md`.
   - Numbers marked `interview-only` are fine here, since this is spoken.
   - Numbers marked `do-not-use` are never fine.

## 3. The prep notes

Write `applications/<slug>/prep-<round>.md`, for example `prep-hiring-manager.md`. Use the structure below and keep it tight. Every line should earn its place on a phone screen.

```markdown
# <Company>: <round>, <date>

## In one minute
Three or four lines: what this round is for, what they most need to hear, and the one story to make sure lands.

## Who you're meeting
### <Name>, <title>
- Background: <facts, each with where it came from>
- What they care about: <from their own words: posts, talks, team pages>
- Likely angle: <your read, marked as a read, not a fact>

## What the role really is
The job in plain words: what they'd own, the problem behind the hire, and how success is measured if the posting says.

## Your stories for this one
For each story: the moment, what they did, what changed, and the one number that backs it up (verified only). Then a line on which likely question it answers.

## Questions you'll probably get
The question, then a short answer outline in their voice, built from their stories. Outlines, not scripts.

## Questions to ask them
Four or five, specific to this team and this interviewer. None that the posting or website already answers.

## Watch out for
- Gaps or soft spots, with an honest way to talk about each.
- Anything about the company to handle carefully.

## Logistics
Time, time zone, link or address, what to have open, and who to follow up with.
```

Keep "a read" and "a fact" clearly apart. Anything you inferred is labeled as your read.

## 4. Where the prep goes (doc, artifact or file)

They'll want to open it on their phone right before the call, so publish it somewhere they can reach. Use the first of these that's available:

1. **A Claude Docs connector**, if you have one. Create a doc titled `<Company> <round> prep` from the markdown. A doc is easy for them to edit and comment on. Follow the connector's own instructions for creating it.
2. **The Artifact tool.**
   - Run `scripts/renderPrep.ts <slug> applications/<slug>/prep-<round>.md`. It writes the `.html` next to the notes.
   - Publish that file as a private artifact with the same title.
   - When you change the prep, re-render it and publish to the same link.
3. **Neither.** Tell them where the `.html` file is, and that they can open it or email it to themselves.

Whichever you use, save the link in `profile/links.json` under `prep`, keyed by slug and round, for example `{"prep": {"acme-ops-director/hiring-manager": "<url>"}}`. Keep any other keys in the file. Mention the link in `notes.md` too.

Published pages are private to them unless they choose to share. Tell them that, since prep contains their own read on real people.

## 5. After the interview

Ask how it went, then write a dated debrief into `applications/<slug>/notes.md`:
- who they met;
- what was asked, as close to word for word as they remember;
- what landed and what felt off;
- the next step and its date.

Then:
- update the status if it changed (`scripts/updateStatus.ts`), and refresh the tracker ([tracking.md](tracking.md));
- add any new confirmed fact or story to `verified-metrics.md` or `my-voice.md`;
- for the next round, start the new prep from what this debrief taught you about how they interview;
- if they want a thank-you note, draft it under [writing.md](writing.md). Short, specific to the conversation, and in their voice. They send it, never you.

## 6. Rules

- **Research only what's public,** and only what's about their work. No personal life, family or anything unrelated to the job.
- **Never contact anyone,** and never message on their behalf.
- **Nothing negative** about the company or the interviewer goes in a thank-you note or anything else the company reads. In private prep you can be candid about risks, labeled as a read.
- **Numbers in answers come from `verified-metrics.md`.** `interview-only` numbers are fine to say out loud. `do-not-use` numbers are never fine.
- **Every fact about a person names its source.** When the source is thin, such as only a preview of their profile, say so.
