/**
 * Prints the text of a Word (.docx) file, one paragraph per line, so a resume
 * can be read without any extra software. PDFs don't need this; Claude reads
 * them directly. Older .doc and Pages files: ask the person to save as PDF.
 *
 *   extractDocx.ts <file.docx>
 *
 * A .docx is a zip; this reads its central directory, inflates
 * word/document.xml with node:zlib, and turns the XML into plain text.
 */
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

function readEntry(zip: Buffer, name: string): Buffer | null {
  // End of central directory record: signature 0x06054b50, within the last 64KB.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const entryName = zip.toString('utf8', p + 46, p + 46 + nameLen);
    if (entryName === name) {
      const lNameLen = zip.readUInt16LE(localOffset + 26);
      const lExtraLen = zip.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = zip.subarray(start, start + compSize);
      return method === 0 ? data : inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');

const file = process.argv[2];
if (!file) {
  console.error('usage: extractDocx.ts <file.docx>');
  process.exit(2);
}
const xml = readEntry(readFileSync(file), 'word/document.xml');
if (!xml) {
  console.error('This does not look like a Word .docx file. Ask for a PDF instead.');
  process.exit(1);
}
const text = xml
  .toString('utf8')
  .replace(/<w:tab\/>/g, '\t')
  .replace(/<w:br\/>/g, '\n')
  .replace(/<\/w:p>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .split('\n')
  .map((l) => decode(l).trim())
  .filter(Boolean)
  .join('\n');
console.log(text);
