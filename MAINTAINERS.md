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

1. Bump `version` in `workspace/.claude/skills/job-search/package.json`.
2. Commit and merge to main.
3. Run `node tools/package.mjs`.
4. Publish it as a GitHub release, tagged with the version:

   ```
   gh release create v<version> dist/JobSearch.zip --title "v<version>" --notes "<what changed, in plain words>"
   ```

The download button on conwaydev.com/job-search points at `https://github.com/conwaydev/job-search-skill/releases/latest/download/JobSearch.zip`, so a new release is live there as soon as it's published. Keep the file name `JobSearch.zip`.

The zip is built from git-tracked files only. The build stops if `workspace/` has uncommitted changes or if a scrub word appears in a shipped file.

## Testing a change

Point any script at a scratch folder with `JOBSEARCH_HOME=/some/folder`, so your own search is never touched.
