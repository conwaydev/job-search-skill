# Setting up the computer

Read this when Node is missing or too old, when a script can't find Playwright or a browser, or when they want to update the skill. Follow the steps in order. Tell them what each step does in one plain sentence before running it. Nothing here needs admin rights, and nothing is installed outside the JobSearch folder.

You can tell Mac from Windows from the platform in your environment (`darwin` or `win32`).

## 1. Is Node ready?

```
node --version
```

- **v22.18 or newer:** go to step 3.
- **Older, or "not found" / "not recognized":** go to step 2.

## 2. Install Node into this folder

Say something like: "This computer needs Node, a free tool the job search runs on. I'll download the official version into your JobSearch folder. It doesn't change anything else on your computer and takes about a minute."

**Mac:**
```
sh .claude/skills/job-search/setup/install-node.sh
```

**Windows:**
```
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/job-search/setup/install-node.ps1
```

The script does four things:
1. Downloads the current Node LTS from nodejs.org.
2. Checks the download against Node's published checksum.
3. Installs the skill's one dependency, Playwright.
4. Adds Node to the PATH for this folder in `.claude/settings.local.json`.

When it finishes, use the Node it installed for the rest of this session: `.runtime/node/bin/node` on Mac, `.runtime/node/node.exe` on Windows. Put that path in place of `node` in every command. **Don't ask them to restart anything.** The PATH line the script wrote takes effect by itself in their next session.

Check it works with `.runtime/node/bin/node --version` (or `.runtime/node/node.exe --version`), then go to step 4.

If the script fails, read its last line to them in plain words. The usual causes are no internet connection, or the folder being somewhere they can't write, such as a synced or read-only drive. Moving `JobSearch` into their home folder fixes the second.

## 3. Install the dependency (Node was already there)

Only needed when step 2 was skipped and `node_modules` is missing:

```
npm --prefix .claude/skills/job-search ci --no-audit --no-fund
```

## 4. A browser

Run `node --no-warnings .claude/skills/job-search/scripts/doctor.ts`, using the folder's own Node if you installed it in step 2.

**If the Browser line fails:**
- **Best:** they install Google Chrome from google.com/chrome. LinkedIn also treats real Chrome better than a test browser.
- **Or:** run `scripts/installBrowser.ts` (with the folder's Node if that's the one in use). That's a download of about 150 MB.

## 5. Confirm

Run `doctor.ts` once more and tell them it's ready in one line, with no checklist dump. Then mark `setup` as `done` in `profile/onboarding-state.json` and carry on with [onboarding.md](onboarding.md).

## Updating the skill

When they have a newer `JobSearch` zip:
1. Ask them to double-click the zip so it unzips, usually into Downloads. **Don't** unzip it over their current folder.
2. Find the new folder yourself before asking. It's usually `Downloads/JobSearch` (or `Downloads/JobSearch 2`, or `Downloads/JobSearch/JobSearch`, which is how Windows unzips it) in their home folder. List the Downloads folder to find it. Ask only if it isn't there. Then run its update script from their current JobSearch folder:
   ```
   node "<path to the new JobSearch folder>/.claude/skills/job-search/setup/update.mjs"
   ```
   - It replaces the skill, `CLAUDE.md` and `.claude/settings.json`.
   - It never touches `profile/`, `data/`, `applications/`, `readouts/` or their Node.
   - The old version is kept in `.runtime/job-search.previous`.
3. Tell them it's done and what version it is now. Suggest starting a new session so the new version loads.
4. They can delete the downloaded zip and folder afterwards.

## Moving to a new computer

Copy the whole `JobSearch` folder over, for example with a USB stick, cloud drive or AirDrop. Then:
- Delete `.runtime/` and `.claude/settings.local.json` in the copy, since Node is built per computer.
- Delete `data/browser-profile/` and `data/sessions/`. They are a LinkedIn login and should not travel.
- Open the folder and say "set me up". Setup reinstalls Node, and they sign in to LinkedIn again.
