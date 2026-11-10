/**
 * Brings their resume file into the folder, wherever it is now (Downloads,
 * Desktop, Documents), so it can be read without extra permission prompts.
 *
 *   importResume.ts "<path to resume>"
 *
 * Copies it to profile/resume-original.<ext>. For Word (.docx) it also prints
 * the text. For PDF, read the copy it names. Older .doc and Pages files need
 * exporting to PDF first.
 */
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { profileDir, scriptsDir, ensureDir } from './paths.ts';
import { out, die } from './db.ts';

let src = process.argv[2];
if (!src) die({ error: 'usage', hint: 'importResume.ts "<path to resume>"' });
src = src.replace(/^~(?=$|[\\/])/, os.homedir());

// People name a file the way they see it: "Resume 2026", no extension, maybe
// a folder, maybe not. Match on the name without its extension, ignoring case.
const usual = ['Downloads', 'Desktop', 'Documents'].map((d) => path.join(os.homedir(), d));
const DOC = /\.(pdf|docx|doc|pages)$/i;
const READABLE = /\.(pdf|docx)$/i;
const list = (dir: string) => {
  try {
    return readdirSync(dir).filter((f) => DOC.test(f)).map((f) => path.join(dir, f));
  } catch {
    return []; // folder missing or not readable
  }
};
const stem = (f: string) => path.basename(f).replace(DOC, '').toLowerCase().trim();

if (!existsSync(src) || statSync(src).isDirectory()) {
  const isDir = existsSync(src);
  const dirs = isDir ? [src] : /[\\/]/.test(src) ? [path.dirname(src)] : usual;
  const want = isDir ? '' : stem(src);
  const files = dirs.flatMap(list);
  const matches = want ? files.filter((f) => stem(f) === want) : [];
  const readable = matches.filter((f) => READABLE.test(f));
  // One match, or one PDF/Word file among several formats of the same name.
  if (matches.length === 1 || readable.length === 1) src = readable[0] ?? matches[0];
  else {
    const near = matches.length
      ? matches
      : files.filter((f) => /resume|cv/i.test(path.basename(f)) || (want !== '' && stem(f).includes(want)));
    die({
      error: matches.length ? 'several_matches' : 'not_found',
      path: src,
      candidates: (near.length ? near : files).slice(0, 10),
      hint: 'Offer these by name and ask which one.',
    });
  }
}

const ext = path.extname(src).toLowerCase();
if (ext === '.doc' || ext === '.pages') {
  die({ error: 'old_format', hint: 'Ask them to export it as a PDF (File, then Export or Save As, then PDF).' });
}
if (ext !== '.pdf' && ext !== '.docx') die({ error: 'unsupported', ext, hint: 'A PDF or Word (.docx) file works.' });

const dest = path.join(ensureDir(profileDir), `resume-original${ext}`);
copyFileSync(src, dest);
const text =
  ext === '.docx'
    ? execFileSync(process.execPath, ['--no-warnings', path.join(scriptsDir, 'extractDocx.ts'), dest], { encoding: 'utf8' })
    : undefined;
out({ copiedTo: dest, ...(text ? { text } : { next: `Read ${path.relative(path.resolve(profileDir, '..'), dest)} to get the text.` }) });
