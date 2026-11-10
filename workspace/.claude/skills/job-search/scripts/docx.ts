/**
 * Writes a resume or cover letter as a Word (.docx) file, with no extra
 * software: the XML is built here and zipped with node:zlib.
 *
 * Everything hangs off Word's named styles (Normal, Title, Subtitle,
 * Heading 1, List Bullet and a few of our own), so changing the font or size
 * of a style in Word changes the whole document. One column, no tables or
 * text boxes, so applicant tracking systems read it the same as the PDF.
 * Dates sit on a right tab stop rather than in a table for the same reason.
 */
import { deflateRawSync, crc32 } from 'node:zlib';

export interface Link { label?: string; url: string }
export interface Header { name: string; headline?: string; location?: string; email?: string; phone?: string; links?: Link[] }
export interface Resume {
  header: Header;
  targetRole?: string;
  summary: string;
  skills?: { category: string; items: string[] }[];
  experience: { company: string; location?: string; roles: { title: string; dates: string; bullets: string[] }[] }[];
  education?: { institution: string; location?: string; dates?: string; credential?: string; field?: string }[];
  certifications?: { name: string; issuer?: string; date?: string }[];
  sections?: { heading: string; items: string[] }[];
}
export interface Letter {
  role: string; company: string; date?: string;
  recipient?: { name?: string; title?: string; company?: string; location?: string };
  greeting?: string; body: string[]; closing?: string; signature?: string;
}

// ---------- XML pieces ----------

const x = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Run = string | { t: string; b?: boolean; i?: boolean; tab?: boolean; br?: boolean };
const run = (r: Run) => {
  if (typeof r === 'string') r = { t: r };
  if (r.tab) return '<w:r><w:tab/></w:r>';
  if (r.br) return '<w:r><w:br/></w:r>';
  const pr = r.b || r.i ? `<w:rPr>${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}</w:rPr>` : '';
  return `<w:r>${pr}<w:t xml:space="preserve">${x(r.t)}</w:t></w:r>`;
};
// Paragraphs with a date or place on the right also carry the tab stop
// directly. Word reads it from the style, but Pages and Quick Look only read
// it from the paragraph.
let RIGHT_TAB = '';
const p = (style: string, runs: Run[]) =>
  `<w:p><w:pPr><w:pStyle w:val="${style}"/>${runs.some((r) => typeof r !== 'string' && r.tab) ? RIGHT_TAB : ''}</w:pPr>${runs.map(run).join('')}</w:p>`;
const TAB: Run = { t: '', tab: true };
const BR: Run = { t: '', br: true };

function headerParas(h: Header): string[] {
  const contact = [h.location, h.email, h.phone, ...(h.links ?? []).map((l) => l.url.replace(/^https?:\/\/(www\.)?/, ''))]
    .filter(Boolean)
    .join('  |  ');
  return [p('Title', [h.name]), ...(h.headline ? [p('Subtitle', [h.headline])] : []), p('Contact', [contact])];
}

function resumeBody(r: Resume): string[] {
  const L = headerParas(r.header);
  if (r.summary) L.push(p('Heading1', ['Summary']), p('Normal', [r.summary]));
  // Same order as the PDF: Summary, Skills, Experience, Education.
  if (r.skills?.length) {
    L.push(p('Heading1', ['Skills']));
    for (const s of r.skills) L.push(p('SkillLine', [{ t: `${s.category}: `, b: true }, s.items.join(', ')]));
  }
  L.push(p('Heading1', ['Experience']));
  for (const job of r.experience ?? []) {
    L.push(p('Company', [job.company, TAB, job.location ?? '']));
    for (const role of job.roles ?? []) {
      L.push(p('Role', [role.title, TAB, role.dates]));
      for (const b of role.bullets ?? []) L.push(p('ListBullet', [b]));
    }
  }
  if (r.education?.length) {
    L.push(p('Heading1', ['Education']));
    for (const e of r.education) {
      const what = [e.credential, e.field].filter(Boolean).join(', ');
      L.push(p('Education', [{ t: e.institution, b: true }, ...(what ? [`, ${what}`] : []), TAB, e.dates ?? '']));
    }
  }
  if (r.certifications?.length) {
    L.push(p('Heading1', ['Certifications']));
    for (const c of r.certifications) L.push(p('ListBullet', [[c.name, c.issuer, c.date].filter(Boolean).join(', ')]));
  }
  for (const s of r.sections ?? []) {
    L.push(p('Heading1', [s.heading]));
    for (const i of s.items) L.push(p('ListBullet', [i]));
  }
  return L;
}

function letterBody(l: Letter, h: Header): string[] {
  const date = l.date ?? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const to = l.recipient ? [l.recipient.name, l.recipient.title, l.recipient.company ?? l.company, l.recipient.location].filter(Boolean) as string[] : [];
  const L = headerParas(h);
  L.push(p('LetterSpaced', [date]));
  if (to.length) L.push(p('LetterSpaced', to.flatMap((t, i) => (i ? [BR, t] : [t]))));
  L.push(p('LetterBody', [{ t: `Re: ${l.role}`, b: true }]));
  L.push(p('LetterBody', [l.greeting ?? 'Hello,']));
  for (const para of l.body) L.push(p('LetterBody', [para]));
  L.push(p('LetterSign', [l.closing ?? 'Thank you,', BR, l.signature ?? h.name]));
  return L;
}

// Page geometry in twentieths of a point. Margins match the PDF (0.55in by 0.65in).
const PAGE = { letter: { w: 12240, h: 15840 }, a4: { w: 11906, h: 16838 } };
const MARGIN_TB = 792, MARGIN_LR = 936;

const rightTab = (a4: boolean) => `<w:tabs><w:tab w:val="right" w:pos="${(a4 ? PAGE.a4.w : PAGE.letter.w) - 2 * MARGIN_LR}"/></w:tabs>`;

function documentXml(build: () => string[], a4: boolean): string {
  const pg = a4 ? PAGE.a4 : PAGE.letter;
  RIGHT_TAB = rightTab(a4);
  const body = build().join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:pgSz w:w="${pg.w}" w:h="${pg.h}"/><w:pgMar w:top="${MARGIN_TB}" w:right="${MARGIN_LR}" w:bottom="${MARGIN_TB}" w:left="${MARGIN_LR}" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

function stylesXml(a4: boolean): string {
  const tabs = rightTab(a4);
  const font = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>';
  // Sizes are in half-points: 21 = 10.5pt.
  const style = (id: string, name: string, ppr: string, rpr: string, extra = '') =>
    `<w:style w:type="paragraph"${id === 'Normal' ? ' w:default="1"' : ''} w:customStyle="${['Normal', 'Title', 'Subtitle', 'Heading1', 'ListBullet'].includes(id) ? 0 : 1}" w:styleId="${id}"><w:name w:val="${name}"/>${id === 'Normal' ? '' : '<w:basedOn w:val="Normal"/>'}<w:qFormat/>${extra}<w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:color w:val="111111"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
${style('Normal', 'Normal', '', font)}
${style('Title', 'Title', '<w:spacing w:after="0"/>', '<w:b/><w:sz w:val="40"/><w:szCs w:val="40"/>')}
${style('Subtitle', 'Subtitle', '<w:spacing w:before="40" w:after="0"/>', '<w:sz w:val="22"/><w:szCs w:val="22"/>')}
${style('Contact', 'Contact', '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="6" w:color="999999"/></w:pBdr><w:spacing w:before="80" w:after="200"/>', '<w:color w:val="333333"/><w:sz w:val="19"/><w:szCs w:val="19"/>')}
${style('Heading1', 'heading 1', '<w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/>', '<w:b/><w:caps/><w:spacing w:val="12"/><w:sz w:val="21"/><w:szCs w:val="21"/>')}
${style('SkillLine', 'Skill Line', '<w:spacing w:after="60"/>', '')}
${style('Company', 'Company', `<w:keepNext/>${tabs}<w:spacing w:before="160" w:after="0"/>`, '<w:b/>')}
${style('Role', 'Role', `<w:keepNext/>${tabs}<w:spacing w:before="40" w:after="20"/>`, '<w:i/>')}
${style('Education', 'Education', `${tabs}<w:spacing w:after="40"/>`, '')}
${style('ListBullet', 'List Bullet', '<w:numPr><w:numId w:val="1"/></w:numPr><w:spacing w:after="40"/><w:ind w:left="320" w:hanging="240"/>', '')}
${style('LetterBody', 'Letter Body', '<w:spacing w:after="200" w:line="336" w:lineRule="auto"/>', '<w:sz w:val="22"/><w:szCs w:val="22"/>')}
${style('LetterSpaced', 'Letter Date and Address', '<w:spacing w:before="80" w:after="280" w:line="336" w:lineRule="auto"/>', '<w:sz w:val="22"/><w:szCs w:val="22"/>')}
${style('LetterSign', 'Letter Signature', '<w:spacing w:before="160" w:line="336" w:lineRule="auto"/>', '<w:sz w:val="22"/><w:szCs w:val="22"/>')}
</w:styles>`;
}

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="320" w:hanging="240"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

function files(title: string, author: string, document: string, a4: boolean): [string, string][] {
  return [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(title)}</dc:title><dc:creator>${x(author)}</dc:creator><cp:lastModifiedBy>${x(author)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`],
    ['word/document.xml', document],
    ['word/styles.xml', stylesXml(a4)],
    ['word/numbering.xml', NUMBERING],
  ];
}

// ---------- zip ----------

function zip(entries: [string, string][]): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  // 1980-01-01 00:00, the zip epoch. The date isn't meaningful here.
  const DOS_TIME = 0, DOS_DATE = 0x21;
  for (const [name, text] of entries) {
    const data = Buffer.from(text, 'utf8');
    const comp = deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10); central.writeUInt16LE(DOS_TIME, 12); central.writeUInt16LE(DOS_DATE, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, comp);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---------- public ----------

export function resumeDocx(r: Resume, title: string, a4: boolean): Buffer {
  return zip(files(title, r.header.name, documentXml(() => resumeBody(r), a4), a4));
}

export function letterDocx(l: Letter, h: Header, title: string, a4: boolean): Buffer {
  return zip(files(title, h.name, documentXml(() => letterBody(l, h), a4), a4));
}
