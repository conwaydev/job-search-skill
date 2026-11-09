/**
 * Turns interview prep notes into a page that reads well on a phone.
 *
 *   renderPrep.ts <application-slug> [file.md]
 *
 * Reads applications/<slug>/prep.md (or the given file) and writes the
 * matching .html next to it, ready to open in a browser or publish as a
 * private Claude artifact. The first "# " heading becomes the page title.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { applicationsDir } from './paths.ts';
import { page, markdown } from './html.ts';
import { out, die } from './db.ts';

const [slug, given] = process.argv.slice(2);
if (!slug) die({ error: 'usage', hint: 'renderPrep.ts <application-slug> [file.md]' });
const src = given ? path.resolve(given) : path.join(applicationsDir, slug, 'prep.md');
if (!existsSync(src)) die({ error: 'missing_file', file: src, hint: 'Write the prep notes first (references/interview-prep.md).' });
const md = readFileSync(src, 'utf8');
const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? `Interview prep: ${slug}`;
const css = `
main { max-width: 760px; }
h1 { margin-bottom: 16px; }
h2 { padding-top: 12px; border-top: 1px solid var(--line); }
ul, ol { padding-left: 22px; }
li { margin: 4px 0; }
blockquote { margin: 12px 0; padding: 10px 14px; background: var(--accent-soft); border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0; }
code { font-size: 0.9em; }
`;
const file = src.replace(/\.md$/i, '') + '.html';
writeFileSync(file, page(title, markdown(md), css));
out({ file, title });
