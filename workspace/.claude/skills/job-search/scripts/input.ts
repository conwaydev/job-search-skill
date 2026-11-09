/**
 * Reads a script's input from `--file <path>` when given, otherwise from stdin.
 *
 * `--file` is the cross-platform path. Heredocs (`<<'JSON'`) only work in a
 * POSIX shell, and on Windows the Code tab may be running PowerShell, so the
 * skill writes the payload to a file with the Write tool and passes its path.
 */
import { readFileSync } from 'node:fs';

export async function readInput(): Promise<string> {
  const i = process.argv.indexOf('--file');
  if (i !== -1 && process.argv[i + 1]) return readFileSync(process.argv[i + 1], 'utf8');
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
