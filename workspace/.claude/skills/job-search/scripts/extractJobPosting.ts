import { out, die } from './db.ts';

/**
 * Given raw HTML fetched from a career page or discovered URL, try to pull
 * out schema.org JobPosting structured data (the same markup many sites
 * embed for Google for Jobs) — free, no LLM call needed. If none is found,
 * this prints {"found": false} so the caller (the skill, reasoning) can fall
 * back to a WebFetch-based extraction pass instead.
 */

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripHtml(html: string): string {
  return decodeEntities(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const [, , htmlPath] = process.argv;
  let html: string;
  if (htmlPath && htmlPath !== '-') {
    html = await (await import('node:fs')).readFileSync(htmlPath, 'utf8');
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    html = Buffer.concat(chunks).toString('utf8');
  }

  const scriptBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const [, block] of scriptBlocks) {
    try {
      const parsed = JSON.parse(block);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        const items = candidate['@graph'] ? candidate['@graph'] : [candidate];
        for (const item of items) {
          if (item['@type'] === 'JobPosting') {
            out({
              found: true,
              title: item.title,
              descriptionText: stripHtml(item.description ?? ''),
              company: item.hiringOrganization?.name,
              location:
                item.jobLocation?.address?.addressLocality ??
                item.jobLocation?.address?.addressRegion ??
                undefined,
              url: item.url,
              datePosted: item.datePosted,
            });
            return;
          }
        }
      }
    } catch {
      // not valid JSON in this block, try the next one
      continue;
    }
  }

  out({ found: false });
}

main().catch((e) => die({ error: 'extract_failed', message: String(e) }));
