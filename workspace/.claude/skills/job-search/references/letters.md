# Writing a cover letter

Every resume ships with a letter. Read [writing.md](writing.md) and `profile/my-voice.md` first. The research behind this is in [research.md](research.md).

## What the letter is for

The resume carries the facts. **The letter is the story:**
- who this person is at work
- how they think
- why this job is the next chapter

It is read by the hiring manager, not the screener. Most recruiters skip letters and most hiring managers read them. Assume the resume was read already. Never put something important only in the letter.

A letter earns its place only if it couldn't have been sent to any other company.

## The story comes from them

Every letter is built around **one real story from their working life.** It's a specific moment that shows how they work: a team that pulled something off, a problem they untangled, or a customer they turned around.

- **Never invent one.** If no story fits this job, ask before drafting: "Is there a moment from your work that shows <theme>? A few sentences is plenty, I'll shape it." Then wait for their reply.
- Keep their stories in `applications/<slug>/notes.md`. Offer to save a good one to `profile/my-voice.md` under `## Stories` so it can be considered (never copied) for future letters.
- If the story is about leading people, the team does the work and they make room for it. Credit sits in the same sentence as the result.

## Shape

Four short paragraphs, about 220 to 300 words. Open with "Hello," unless the posting names the hiring manager.

1. **Open with them and the role, plainly.** Which job, and in a sentence, why it caught their eye. Don't open with a hook, a press-release fact or a number.
2. **What the work is really about for this company.** A plain sentence about their situation that shows you read between the lines of the posting. Use at most one company fact, and only if it sharpens the point.
3. **The story,** told simply. It answers the posting's main theme. Use at most one result, and only if it's verified and passes the "nothing negative" rule.
4. **A plain close.** In one or two sentences, say what they'd like (a conversation) and stop. Don't restate the pitch, and don't write "I hope to hear from you."

## What to leave out

- Lists of accomplishments, tools, systems or projects. That's the resume's job.
- Percentages, counts and team sizes. A letter stays at the level of themes, not tactics.
- Anything that diagnoses the company's problems, or any bad news about them.
- Flattery ("I have long admired…"), and claims to already embody their culture.
- Lines lifted from the posting or from their own marketing copy.
- Bullets, bold lead-ins and headings. The letter is prose only, which the `body` array enforces.
- Anything that concedes a gap.

## Writing it

Write `applications/<slug>/cover-letter.json` in the shape of `templates/cover-letter.schema.json`:

```json
{
  "role": "Operations Manager",
  "company": "Acme",
  "greeting": "Hello,",
  "body": ["First paragraph.", "Second.", "Third.", "Fourth."]
}
```

The letterhead (name and contact details) comes from the baseline automatically.

## Before it goes to them

1. Does the opening sound like a person talking?
2. Is there one real story, from them, with credit shared?
3. Does paragraph two say something that couldn't be pasted onto another company?
4. Could they say every line out loud without wincing?
5. Is there no negative, no percentage, no lifted phrase and no AI tell? Run `scripts/auditProse.ts applications/<slug>/cover-letter.json`.
6. Does the close say plainly what they want?

Hand it over as the PDF (see [tailoring.md](tailoring.md)) and paste the plain text in the chat too, so they can read it right away. When they react, fix it, and record what they disliked in `learned-rules.md` under `## Writing`.
