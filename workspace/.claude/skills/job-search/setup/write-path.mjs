// Adds Node's folder to the front of PATH in <workspace>/.claude/settings.local.json,
// keeping anything else already in that file. Claude Code reads the `env` block
// at the start of a session, which is how the Code tab finds this Node without
// any system-wide install. Called by install-node.sh / install-node.ps1.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [workspace, binDir] = process.argv.slice(2);
const file = path.join(workspace, '.claude', 'settings.local.json');
let settings = {};
try {
  settings = JSON.parse(readFileSync(file, 'utf8'));
} catch {
  // new file
}
const sep = process.platform === 'win32' ? ';' : ':';
const current = (process.env.PATH ?? process.env.Path ?? '').split(sep).filter((p) => p && p !== binDir);
settings.env = { ...(settings.env ?? {}), PATH: [binDir, ...current].join(sep) };
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
console.log(`Node is on the PATH for this folder (${path.relative(workspace, file)}).`);
