# Maintaining Job Search

How the repo is laid out, how to release, and how to test a change. The user-facing guide is [README.md](README.md).

## Layout

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
tools/package.mjs       builds dist/JobSearch.zip
tools/START HERE.txt    added to the top of the zip
tools/verifyBoards.mjs  re-checks the company board list
tools/board-candidates.json  boards verifyBoards checks
```

## Releasing

Releases are automatic. Every change to the skill bumps `version` in `workspace/.claude/skills/job-search/package.json` (and the two matching lines in `package-lock.json`) in the same PR. When it merges, `.github/workflows/release.yml` builds `JobSearch.zip` with `tools/package.mjs` and publishes it as release `v<version>`, with notes generated from the merged PRs. If the version on main is already released, the workflow skips, so a change that doesn't bump the version doesn't ship.

To build the zip locally without releasing, run `node tools/package.mjs`.

The download button on conwaydev.com/job-search points at `https://github.com/conwaydev/job-search-skill/releases/latest/download/JobSearch.zip`, so a new release is live there as soon as it's published. Keep the file name `JobSearch.zip`.

The zip is built from git-tracked files only. The build stops if `workspace/` has uncommitted changes or if a scrub word appears in a shipped file.

## Testing a change

Point any script at a scratch folder with `JOBSEARCH_HOME=/some/folder`, so your own search is never touched.
