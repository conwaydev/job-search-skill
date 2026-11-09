/**
 * Authenticated browser sessions for the job boards.
 *
 * The person logs in themselves, in a real headed Chrome, and the session that
 * login produces is what everything here reuses. No credentials are ever
 * passed to or stored by these scripts: `login.ts` opens the browser, waits,
 * and keeps whatever cookies the site handed back.
 *
 * 🚨 The files this writes under `data/` ARE the login. Anyone holding
 * `data/sessions/linkedin.json` is logged in as the person until it expires.
 * Both paths are gitignored and written 0600; keep them that way.
 *
 * Two artifacts per site, deliberately:
 *   data/browser-profile/<site>/  the persistent Chromium profile. Survives
 *                                 restarts, so a checkpoint or 2FA prompt is
 *                                 answered once rather than every run.
 *   data/sessions/<site>.json     exported cookies, so a scan can go straight
 *                                 through `fetch` without paying ~3s of
 *                                 browser startup.
 *
 * Playwright comes from the skill's own node_modules (setup runs `npm ci`),
 * falling back to a global install if one exists.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { skillDir, profileRoot, sessionRoot } from './paths.ts';

export { profileRoot, sessionRoot };

export interface SiteDef {
  /** Where login starts. */
  loginUrl: string;
  /** A page that is cheap to load and differs when signed in. */
  homeUrl: string;
  /** Cookie whose presence means the session is real. */
  authCookie: RegExp;
  /** Cookies that say nothing about auth (bot checks, analytics). */
  noise: RegExp;
}

export const SITES: Record<string, SiteDef> = {
  linkedin: {
    loginUrl: 'https://www.linkedin.com/login',
    homeUrl: 'https://www.linkedin.com/jobs/',
    // li_at is the session. JSESSIONID rotates and is only the CSRF source.
    authCookie: /^li_at$/,
    noise: /^(bcookie|bscookie|lidc|lang|JSESSIONID|li_gc|li_alerts|UserMatchHistory|AnalyticsSyncHistory)$/,
  },
  builtin: {
    loginUrl: 'https://builtin.com/login',
    homeUrl: 'https://builtin.com/jobs',
    // 🚨 Unverified. Nobody has logged in to Built In yet, so this pattern is
    // a guess at the session cookie's name rather than one that was observed.
    // Check it against the real jar the first time this runs, or login.ts will
    // sit there waiting for a cookie that is named something else.
    // Cloudflare fronts the whole site, so __cf_bm is present signed out too.
    authCookie: /session|auth|token|logged/i,
    noise: /^(__cf_bm|_ga|_gid|_gcl_au|cf_clearance|OptanonConsent|__cfruid)/i,
  },
};

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface StoredSession {
  site: string;
  savedAt: string;
  cookies: Cookie[];
}

/**
 * Load `playwright` from wherever npm put it. Checked in order of how much the
 * caller controls it: a local install first, then the global one that
 * @playwright/mcp brings along.
 */
export async function loadPlaywright(): Promise<any> {
  const candidates = [path.join(skillDir, 'node_modules'), globalNodeModules()].filter(Boolean) as string[];
  const nested = candidates.map((d) => path.join(d, '@playwright', 'mcp', 'node_modules'));
  for (const dir of [...candidates, ...nested]) {
    const entry = path.join(dir, 'playwright', 'index.js');
    // playwright ships CommonJS, so a dynamic import lands its exports on
    // `.default` rather than on the namespace itself.
    // A file URL, not a bare path: Windows drive letters break a plain import.
    if (existsSync(entry)) return import(pathToFileURL(entry).href).then((m) => m.default ?? m);
  }
  throw new Error(
    'playwright not found. Run setup again ("set me up"), or run `npm ci` in the skill folder. ' +
      'If Chrome is not installed, also run `npx playwright install chromium` there.'
  );
}

function globalNodeModules(): string | undefined {
  try {
    return execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

export function sessionPath(site: string): string {
  return path.join(sessionRoot, `${site}.json`);
}

export function readSession(site: string): StoredSession | undefined {
  const file = sessionPath(site);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as StoredSession;
  } catch {
    return undefined;
  }
}

export function writeSession(site: string, cookies: Cookie[]): void {
  mkdirSync(sessionRoot, { recursive: true });
  const file = sessionPath(site);
  writeFileSync(file, JSON.stringify({ site, savedAt: new Date().toISOString(), cookies }, null, 2));
  chmodSync(file, 0o600);
}

/** Whether the stored cookies still amount to a usable login. */
export function sessionStatus(site: string): {
  ok: boolean;
  reason?: string;
  savedAt?: string;
  expiresAt?: string;
} {
  const def = SITES[site];
  if (!def) return { ok: false, reason: `unknown site "${site}"` };
  const stored = readSession(site);
  if (!stored) return { ok: false, reason: 'no saved session' };
  const auth = stored.cookies.filter((c) => def.authCookie.test(c.name) && !def.noise.test(c.name));
  if (!auth.length) return { ok: false, reason: 'saved session has no auth cookie', savedAt: stored.savedAt };
  // -1 is Playwright's "session cookie, dies with the browser" sentinel. It is
  // still usable right now, so treat only a real past timestamp as expired.
  const now = Date.now() / 1000;
  const dated = auth.filter((c) => typeof c.expires === 'number' && c.expires > 0);
  const soonest = dated.length ? Math.min(...dated.map((c) => c.expires as number)) : undefined;
  if (soonest !== undefined && soonest < now) {
    return { ok: false, reason: 'auth cookie expired', savedAt: stored.savedAt, expiresAt: iso(soonest) };
  }
  return { ok: true, savedAt: stored.savedAt, expiresAt: soonest === undefined ? undefined : iso(soonest) };
}

function iso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Cookies for `url` as a request header. Domain matching is the cookie rule,
 * not a substring test: a `.linkedin.com` cookie goes to www.linkedin.com, and
 * a `www.linkedin.com` cookie does not go to another host.
 */
export function cookieHeader(site: string, url: string): string {
  const stored = readSession(site);
  if (!stored) return '';
  const host = new URL(url).hostname.toLowerCase();
  return stored.cookies
    .filter((c) => {
      const d = c.domain.replace(/^\./, '').toLowerCase();
      return c.domain.startsWith('.') ? host === d || host.endsWith(`.${d}`) : host === d;
    })
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

/**
 * LinkedIn's CSRF token is the JSESSIONID value with its quotes stripped. Every
 * voyager (authenticated API) call needs it in a `csrf-token` header or it
 * comes back 403.
 */
export function linkedinCsrf(): string | undefined {
  const raw = readSession('linkedin')?.cookies.find((c) => c.name === 'JSESSIONID')?.value;
  return raw?.replace(/"/g, '');
}

/**
 * Open the site's persistent profile. `headed: false` reuses an existing login
 * for scraping; `headed: true` is for the login itself.
 *
 * Note the profile can only be open once at a time; Chromium locks the
 * directory. Two scans in parallel will fight over it.
 */
export async function openContext(site: string, headed: boolean): Promise<{ context: any; close: () => Promise<void> }> {
  const pw = await loadPlaywright();
  const dir = path.join(profileRoot, site);
  mkdirSync(dir, { recursive: true });
  const context = await pw.chromium.launchPersistentContext(dir, {
    headless: !headed,
    viewport: { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
    ...browserChannel(),
  });
  return { context, close: () => context.close() };
}

/**
 * Prefer the real Google Chrome over Playwright's bundled Chromium. Two
 * reasons, and the second is the one that bites: the bundled build for the
 * installed Playwright version is usually not downloaded on this machine
 * (the global @playwright/mcp brings the library, not the browsers), and
 * LinkedIn treats a stock Chromium far more suspiciously than Chrome.
 * Falls back to whatever Chromium is present if Chrome is not installed.
 */
function browserChannel(): { channel?: string } {
  return findChrome() ? { channel: 'chrome' } : {};
}

/** Pull the current cookies out of a live context and persist them. */
export async function captureFrom(context: any, site: string): Promise<Cookie[]> {
  const cookies = (await context.cookies()) as Cookie[];
  writeSession(site, cookies);
  return cookies;
}

/** Where Google Chrome is installed, if it is. Mac, Windows and Linux. */
export function findChrome(): string | null {
  const local = process.env.LOCALAPPDATA ?? '';
  const candidates =
    process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app', path.join(process.env.HOME ?? '', 'Applications', 'Google Chrome.app')]
      : process.platform === 'win32'
        ? [
            path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
  return candidates.find((c) => c && existsSync(c)) ?? null;
}
