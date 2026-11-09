/**
 * Small shared pieces for the pages this skill writes: escaping, a page shell
 * that works as a local file and as a published Claude artifact (title, color
 * tokens, dark mode, phone width, no outside scripts), and a tiny markdown
 * converter for prep notes.
 */
export const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function page(title: string, body: string, extraCss = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root {
  --bg: #fbfaf8; --surface: #ffffff; --text: #1d1f22; --muted: #62666d; --line: #e4e1dc;
  --accent: #2f5d8a; --accent-soft: #e6eef6; --good: #2e7d4f; --warn: #a3620a; --bad: #a33a3a;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #16181b; --surface: #1e2125; --text: #e9e7e3; --muted: #a0a4ab; --line: #30343a;
    --accent: #8db6dd; --accent-soft: #24313d; --good: #7cc79a; --warn: #e0a85a; --bad: #e08a8a;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #16181b; --surface: #1e2125; --text: #e9e7e3; --muted: #a0a4ab; --line: #30343a;
  --accent: #8db6dd; --accent-soft: #24313d; --good: #7cc79a; --warn: #e0a85a; --bad: #e08a8a;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
main { max-width: 880px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 1.6rem; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 1.1rem; margin: 36px 0 12px; }
h3 { font-size: 1rem; margin: 24px 0 8px; }
a { color: var(--accent); }
.muted { color: var(--muted); }
.small { font-size: 0.875rem; }
${extraCss}
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

/** Headings, paragraphs, lists, quotes, bold, italics, code and links. Enough for prep notes. */
export function markdown(md: string): string {
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])[*_]([^*_]+)[*_](?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) { flush(); closeList(); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flush(); closeList();
      const n = Math.min(m[1].length, 4);
      out.push(`<h${n}>${inline(m[2])}</h${n}>`);
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flush();
      const kind = /^\s*\d/.test(line) ? 'ol' : 'ul';
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flush(); closeList();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flush(); closeList();
  return out.join('\n');
}

export const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
