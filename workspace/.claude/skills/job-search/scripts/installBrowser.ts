/**
 * Downloads Playwright's own Chromium (about 150 MB) for computers without
 * Google Chrome. Runs Playwright's installer with this same Node, so it works
 * before Node is on the PATH.
 *
 *   installBrowser.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { skillDir } from './paths.ts';

const cli = path.join(skillDir, 'node_modules', 'playwright', 'cli.js');
if (!existsSync(cli)) {
  console.error(JSON.stringify({ error: 'no_playwright', hint: 'Install the dependency first (references/setup.md).' }));
  process.exit(1);
}
const r = spawnSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
