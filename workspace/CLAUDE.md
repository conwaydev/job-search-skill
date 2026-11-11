# Job search

This folder is one person's job search. It runs on the `job-search` skill in `.claude/skills/job-search/`. Use that skill for anything to do with jobs, resumes, cover letters, applications or interviews.

## First message of every session

Before replying to their first message:

1. Read `profile/onboarding-state.json`.
   - **If it is missing, or the `setup` step isn't done:** this is a new install, and setup hasn't run yet. Don't run the setup check, and don't mention anything missing. Welcome them. Say in two or three short lines what this does and that setup takes about 15 minutes, can be paused any time, and that any step can be skipped. Then start onboarding (`.claude/skills/job-search/references/onboarding.md`). Its first step gets this computer ready, so present that as the first step, not as a problem.
2. Otherwise, run `node --no-warnings .claude/skills/job-search/scripts/doctor.ts --quiet`. It prints nothing when all is well.
   - **If `node` isn't found, or the script won't run** (Node too old), try the Node that setup installs inside this folder: `.runtime/node/bin/node` on Mac, `.runtime/node/node.exe` on Windows. If that works, use that path in place of `node` for every command this session.
   - **If neither works,** follow `.claude/skills/job-search/references/setup.md`.
   - **If it reports a problem,** fix it quietly, then tell them in one line what you fixed.
   - Also run `node --no-warnings .claude/skills/job-search/scripts/update.ts check --quiet`. It checks for a newer version at most once a week and prints nothing otherwise. If it prints one, end your reply with one line like: "There's a newer version of the job search skill. Say "update" whenever you want it." Never update without them asking.
3. Then:
   - **If an onboarding step isn't finished:** welcome them back and offer to continue at that step, naming it. If they asked for something else, do that first.
   - **Otherwise:** just answer them.

## How to talk to them

- They may not be technical. Use plain words, one question at a time, and short replies.
- Never paste raw command output. Say what it means.
- Before running a command, say in one short line what it's for.

## Running commands

Only the skill's own scripts are pre-approved. Anything else stops and asks them for permission, which is confusing for someone who isn't technical.
- Run each script on its own, exactly in the form `node --no-warnings .claude/skills/job-search/scripts/<name>.ts …` (or with the folder's Node path in place of `node`). Don't chain commands with `;`, `&&` or pipes, and don't add `echo`, `cat`, `ls` or `$?`. Use the Read tool to look at files, and the Glob tool to find them.
- Don't use `curl` or write inline `node -e` code. To read a job link, use `scripts/fetchPosting.ts`. If no script does what you need, use WebFetch.

## Never

- Change anything in `.claude/skills/` unless they ask to update the skill (see `setup.md`).
- Read, copy or share anything in `data/sessions/` or `data/browser-profile/`. Those files are their LinkedIn login.
- Submit an application, send a message or contact anyone for them.
