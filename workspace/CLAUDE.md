# Job search

This folder is one person's job search. It runs on the `job-search` skill in `.claude/skills/job-search/`. Use that skill for anything to do with jobs, resumes, cover letters, applications or interviews.

## First message of every session

Before replying to their first message:

1. Run `node --version`. If it fails or is older than v22.18, follow `.claude/skills/job-search/references/setup.md` before anything else.
2. Run `node --no-warnings .claude/skills/job-search/scripts/doctor.ts --quiet`. It prints nothing when all is well. Fix anything it reports.
3. Read `profile/onboarding-state.json`.
   - **If it is missing:** welcome them. Say in two or three short lines what this does and that setup takes about 20 minutes, can be paused any time, and that any step can be skipped. Then start onboarding (`.claude/skills/job-search/references/onboarding.md`).
   - **If a step isn't finished:** welcome them back and offer to continue at that step, naming it. If they asked for something else, do that first.
   - **Otherwise:** just answer them.

## How to talk to them

- They may not be technical. Use plain words, one question at a time, and short replies.
- Never paste raw command output. Say what it means.
- Before running a command, say in one short line what it's for.

## Never

- Change anything in `.claude/skills/` unless they ask to update the skill (see `setup.md`).
- Read, copy or share anything in `data/sessions/` or `data/browser-profile/`. Those files are their LinkedIn login.
- Submit an application, send a message or contact anyone for them.
