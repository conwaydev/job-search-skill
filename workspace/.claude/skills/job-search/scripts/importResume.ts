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
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { profileDir, scriptsDir, ensureDir } from './paths.ts';
import { out, die } from './db.ts';

let src = process.argv[2];
if (!src) die({ error: 'usage', hint: 'importResume.ts "<path to resume>"' });
src = src.replace(/^~(?=$|[\\/])/, os.homedir());

// A bare file name: look in the usual places.
if (!existsSync(src) && !/[\\/]/.test(src)) {
  for (const dir of ['Downloads', 'Desktop', 'Documents'].map((d) => path.join(os.homedir(), d))) {
    if (existsSync(path.join(dir, src))) { src = path.join(dir, src); break; }
  }
}
if (!existsSync(src)) {
  // Help find it: recent resume-looking files in Downloads, Desktop, Documents.
  const found: string[] = [];
  for (const dir of ['Downloads', 'Desktop', 'Documents'].map((d) => path.join(os.homedir(), d))) {
    try {
      for (const f of readdirSync(dir)) if (/\.(pdf|docx)$/i.test(f) && /resume|cv/i.test(f)) found.push(path.join(dir, f));
    } catch {
      // folder missing or not readable
    }
  }
  die({ error: 'not_found', path: src, candidates: found.slice(0, 10) });
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
