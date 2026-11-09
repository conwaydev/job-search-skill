/**
 * Hand the person a real browser, wait for them to sign in, keep the session.
 *
 * This is the only place a job board gets logged into, and it is deliberately
 * manual: the window that opens is theirs, they type the password and answer the
 * 2FA prompt, and nothing here ever sees a credential. What gets kept is the
 * cookie jar the site handed back, so the automated
 * scans run on their own session, never on borrowed credentials.
 *
 * The profile is persistent, so a second login usually needs no password at
 * all: Chrome reopens already signed in and this exits in a second.
 *
 * Usage:
 *   node --no-warnings scripts/login.ts linkedin [--wait 300]
 *   node --no-warnings scripts/login.ts builtin
 *   node --no-warnings scripts/login.ts --status        # no browser
 */
import { SITES, openContext, captureFrom, sessionStatus, sessionPath } from './browserSession.ts';

const args = process.argv.slice(2);

if (args.includes('--status') || args.length === 0) {
  for (const site of Object.keys(SITES)) {
    const s = sessionStatus(site);
    const detail = s.ok
      ? `saved ${s.savedAt?.slice(0, 19).replace('T', ' ')}${s.expiresAt ? `, expires ${s.expiresAt}` : ''}`
      : s.reason;
    console.log(`${site.padEnd(10)} ${s.ok ? 'signed in' : 'signed out'}  (${detail})`);
  }
  process.exit(0);
}

const site = args[0];
const def = SITES[site];
if (!def) {
  console.error(`unknown site "${site}". known: ${Object.keys(SITES).join(', ')}`);
  process.exit(1);
}

const waitIdx = args.indexOf('--wait');
const waitSeconds = waitIdx > -1 ? Number(args[waitIdx + 1]) || 300 : 300;

const { context, close } = await openContext(site, true);
const page = context.pages()[0] ?? (await context.newPage());

// Land on the signed-in destination first. A persistent profile that is still
// authenticated never sees the login form, and this exits immediately.
await page.goto(def.homeUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});

const signedIn = async () => {
  const cookies = await context.cookies();
  return cookies.some((c: { name: string }) => def.authCookie.test(c.name) && !def.noise.test(c.name));
};

if (!(await signedIn())) {
  await page.goto(def.loginUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  console.log(`Chrome is open at ${def.loginUrl}. Sign in there; this waits up to ${waitSeconds}s.`);
}

const deadline = Date.now() + waitSeconds * 1000;
let ok = false;
while (Date.now() < deadline) {
  if (await signedIn()) {
    ok = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 2000));
}

if (!ok) {
  await close();
  console.error(`timed out after ${waitSeconds}s without an auth cookie for ${site}. Nothing saved.`);
  process.exit(2);
}

// Give the site a moment to finish setting the rest of the jar (LinkedIn sets
// li_at before the redirect completes, and li_gc/lidc land after).
await new Promise((r) => setTimeout(r, 2000));
const cookies = await captureFrom(context, site);
await close();

const status = sessionStatus(site);
console.log(`signed in to ${site}: ${cookies.length} cookies saved to ${sessionPath(site)}`);
if (status.expiresAt) console.log(`session good until ${status.expiresAt}`);
