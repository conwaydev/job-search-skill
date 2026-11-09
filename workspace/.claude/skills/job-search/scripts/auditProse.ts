/**
 * auditProse — one prose audit, run the same way on every resume, cover letter
 * and summary before it is handed over.
 *
 * Hand-rolled checks drift: one quietly drops out of a run and the tell it
 * catches ships. One script, one check list.
 *
 *   node --no-warnings scripts/auditProse.ts <file.md|file.json|->
 *   node --no-warnings scripts/auditProse.ts --resume        # the baseline resume
 *
 *   ⛔ hard  never ship a hit: widely agreed AI tells, any number that is not
 *           in profile/verified-metrics.md, and every phrase the person has
 *           banned under "## Banned phrases" in profile/learned-rules.md.
 *   ⚠️  soft  a smoke detector, not a verdict. Read the line and ask whether it
 *           would survive being said out loud.
 *
 * Exits 1 when there is any hard hit.
 */
import fs from 'node:fs';
import { profileFiles } from './paths.ts';

interface Check {
  id: string;
  pattern: RegExp;
  note: string;
  hard?: boolean; // hard = never ship a hit
}

const CHECKS: Check[] = [
  { id: 'weak-verb', pattern: /\b(responsible for (?:managing|leading|the team)|helped|worked on|(?<!AI-)assisted|handled|participated in|was involved in|utilized)\b/gi, hard: true, note: 'Weak verb. Note "responsible for" is fine when stating what a TEAM is responsible for.' },
  { id: 'inflated-verb', pattern: /\b(orchestrat|spearhead|pioneer|transform|craft|foster|enhanc|champion)(ed|ing|s)?\b/gi, hard: true, note: 'Inflated verb. Plain verbs carry more authority: led, built, cut, filled, took over.' },
  { id: 'buzzword', pattern: /\b(leverage|unlock|robust|seamless|elevate|delve|tapestry|testament|underscore|harness|realm|navigate|multifaceted|pivotal|empower|crucial|quietly|grounded|results-driven|visionary|passionate about)\b/gi, hard: true, note: 'Buzzword.' },
  { id: 'hedge', pattern: /\b(I think|I believe|I hope to|I would try|could potentially|may be able to|somewhat|fairly|relatively|a bit(?! of))\b/gi, hard: true, note: 'Hedge. Say the thing.' },
  { id: 'self-negation', pattern: /\b(I have not|I haven't|I am not|I'm not|I do not|I don't|I would not|I cannot|I lack|no direct experience|less experience)\b/gi, hard: true, note: 'Never concede a gap in anything an employer reads.' },
  { id: 'combat', pattern: /\b(argued for|demanded|defended|made the case|fought for|championed|pushed back|competing incentives)\b/gi, hard: true, note: 'Combat metaphor. Say the straightforward version.' },

  { id: 'empty-transition', pattern: /\b(it is important to note|it's important to note|without further ado|fast-paced|ever-evolving|digital landscape|in today's|at the end of the day|when it comes to)\b/gi, hard: true, note: 'Empty transition or filler. Say the thing.' },
  { id: 'contrastive-framing', pattern: /\b(it's|it is|this is|that's) not (just |only |merely )?[^.,;]{1,40}[,;] ?(it's|it is|but|this is)\b|\bnot (just|only|merely) [^.,;]{1,40}, (but|it's)\b|\bisn't (just|only|merely)\b/gi, hard: true, note: 'Contrastive framing ("not just X but Y", "it is not X, it is Y"). A top AI tell. State Y.' },
  { id: 'manufactured-sass', pattern: /\b(here's the thing|here's the deal|here's why|here's what|then I realized|hot take|and honestly\?|the result\?|that's the real \w+|no (fluff|\w+)\. no \w+\. just)\b/gi, hard: true, note: 'Manufactured edge or ta-da phrasing (Hunting the Muse). Replace with a plain sentence, or just "But".' },
  { id: 'cliche-opener', pattern: /\b(in the dynamic world of|as the world continues to evolve|shouting into the void|looming challenges)\b/gi, hard: true, note: 'Cliché phrase.' },
  { id: 'rule-of-three', pattern: /[\w-]+,\s[\w-]+,\sand\s[\w-]+/g, note: 'Three-item list. Factual enumerations of real things are fine; rhetorical triads are not.' },
  { id: 'trailing-participial', pattern: /,\s+(cutting|removing|lifting|organizing|enabling|driving|allowing|creating|building|ensuring|resulting in)\b/gi, note: 'Trailing participial.' },
  { id: 'rather-than', pattern: /\brather than\b/gi, note: 'Overused connector. Try "instead of" or restructure.' },
  { id: 'manufactured-profundity', pattern: /\b(someone has to|somebody has to|that is the (job|work|question)|which is what .{1,40} (is|are) (for|about))\b/gi, note: 'Portentous generalization bolted onto a finished sentence. Impersonal subjects that dodge saying who did it.' },
  { id: 'process-not-achievement', pattern: /\b(set what .{1,30} is accountable for|own the standards|took ownership of .{1,25} and process|responsible for overseeing)\b/gi, note: 'Names a responsibility instead of a consequence. Say what changed.' },
  { id: 'personnel-bookkeeping', pattern: /\b(promoted (them|on both sides)|been through a promotion cycle|grew (it|the team) to \d+)\b/gi, note: 'Growth belongs to the people who earned it. Never make a headcount the climax.' },
  // ---- From published AI-writing guides. All soft. ----
  // Source W = https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing (WikiProject AI Cleanup field guide, 2025). Source J = https://www.jobillico.com/blog/en/ai-resumes-are-everywhere-in-2026-heres-how-hiring-managers-are-catching-them-instantly . Source I = https://blog.theinterviewguys.com/?p=6394 .
  { id: 'copula-avoidance', pattern: /\b(serves as|stands as|functions as|acts as|boasts)\b/gi, note: 'Fancy stand-in for "is" or "has". Source: Wikipedia Signs of AI writing (copula avoidance).' },
  { id: 'significance-puffery', pattern: /\b(setting the stage for|key turning point|indelible mark|evolving landscape|is a reminder|marking a|shaping the (future|way))\b/gi, note: 'Inflated significance. Source: Wikipedia Signs of AI writing (significance puffery).' },
  { id: 'era-vocabulary', pattern: /\b(vibrant|intricate|intricacies|meticulous(ly)?|showcas(e|es|ed|ing)|diverse array|commitment to|renowned)\b/gi, note: 'Vocabulary the guides tie to 2024-25 models. Judge in context; word lists age fast. Source: Wikipedia Signs of AI writing; https://arxiv.org/pdf/2609.23090 (marker shelf life).' },
  { id: 'trailing-ing-clause', pattern: /,\s+(highlighting|underscoring|emphasizing|reflecting|symbolizing|contributing to|fostering|showcasing|demonstrating|reinforcing)\b/gi, note: 'Trailing -ing clause that comments on its own sentence. Source: Wikipedia Signs of AI writing. (Companion to trailing-participial.)' },
  { id: 'vague-attribution', pattern: /\b(industry reports|observers have|experts (argue|agree)|many (believe|agree)|it is widely)\b/gi, note: 'Vague authority. Name the source or cut. Source: Wikipedia Signs of AI writing.' },
  { id: 'signposting', pattern: /\b(key takeaways?|in this (section|letter|document)|one might wonder|let me (explain|walk you))\b/gi, note: 'Announces what the text will do instead of doing it. Source: Wikipedia Signs of AI writing.' },
  { id: 'stock-letter-phrase', pattern: /\b(I am writing to express|excited to contribute|passion for innovation|proven track record|dynamic professional|immediately thought of|when I (first )?read about|spearheaded initiatives|cross-functional collaboration)\b/gi, note: 'Stock cover-letter or resume phrase recruiters name as an AI tell. Source: jobillico (J) and theinterviewguys (I) URLs above.' },
  { id: 'em-dash', pattern: /—/g, note: 'Em dashes read as machine-written to many hiring managers. Prefer a comma or a period.' },
  { id: 'colon-elaboration', pattern: /[^\s]+:\s+\S+/g, note: 'Colon joining two clauses. Stacked across a document it reads formulaic; a period usually works better.' },
  { id: 'paired-opposite', pattern: /\b(\w+) is \w+ and \w+ (isn't|is not)\b|\bnot (just|only) .{1,40}, but\b|\b(less|more) .{1,25} than .{1,25}, and\b/gi, note: 'Binary antithesis. A draft should have at most one, and only if it earns it.' },
  { id: 'summing-up-filler', pattern: /\b(that'?s|this is) (most|half|all|really|basically|essentially|the whole|the heart) (of )?(the |it|what )?(job|point|work|role|thing)?\b|\bthat'?s (the job|what the job is|the whole job)\b/gi, note: 'Filler line that sums up the paragraph before it ("That\'s most of the job."). Cut it; the paragraph stands without it.' },
];


function extract(file: string): string {
  const raw = file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
  if (!file.endsWith('.json')) return raw;
  const d = JSON.parse(raw);
  const out: string[] = [d.summary ?? ''];
  for (const a of d.achievements ?? []) out.push(a);
  for (const e of d.experience ?? []) {
    for (const b of e.bullets ?? []) out.push(b);
    for (const r of e.roles ?? []) for (const b of r.bullets ?? []) out.push(b);
  }
  for (const j of d.earlierCareer?.jobs ?? []) for (const b of j.bullets ?? []) out.push(b);
  for (const p of d.body ?? []) out.push(p); // cover letters
  return out.join('\n');
}

const args = process.argv.slice(2);
const target = args[0] === '--resume' ? profileFiles.baselineResume : args[0];

if (!target) {
  console.error('usage: auditProse.ts <file|-|--resume>');
  process.exit(2);
}

const text = extract(target);
const lines = text.split('\n').filter((l) => l.trim());

// The person's own banned phrases, from learned-rules.md: every "- phrase" line
// under a "## Banned phrases" heading. Each becomes a hard check.
function bannedPhrases(): string[] {
  try {
    const md = fs.readFileSync(profileFiles.learnedRules, 'utf8');
    const section = md.split(/^## /m).find((s) => /^banned phrases/i.test(s));
    if (!section) return [];
    return section
      .split('\n')
      .slice(1)
      .map((l) => l.match(/^\s*[-*]\s+"?([^"]+?)"?\s*(?:\(.*\))?\s*$/)?.[1]?.trim())
      .filter((x): x is string => !!x && x.length > 1);
  } catch {
    return [];
  }
}
for (const phrase of bannedPhrases()) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  CHECKS.push({ id: `banned: ${phrase.slice(0, 40)}`, pattern: new RegExp(escaped, 'gi'), hard: true, note: 'You banned this phrase (profile/learned-rules.md).' });
}
let hard = 0;
let soft = 0;

for (const check of CHECKS) {
  const hits: string[] = [];
  for (const line of lines) {
    for (const m of line.matchAll(check.pattern)) {
      hits.push(`${m[0].trim()}  ←  ${line.slice(0, 90).trim()}…`);
    }
  }
  if (!hits.length) continue;
  check.hard ? (hard += hits.length) : (soft += hits.length);
  console.log(`\n${check.hard ? '⛔' : '⚠️ '} ${check.id} (${hits.length})`);
  console.log(`   ${check.note}`);
  for (const h of hits.slice(0, 4)) console.log(`   · ${h}`);
  if (hits.length > 4) console.log(`   · …${hits.length - 4} more`);
}

// ---- Density and rhythm (added 2026-10-30) ----
// Sources: sentences of near-equal length and even emphasis are named as a tell by
// https://www.jobillico.com/blog/en/ai-resumes-are-everywhere-in-2026-heres-how-hiring-managers-are-catching-them-instantly
// and stacked triads by https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing (rule of three).
// Burstiness is a contested signal (https://arxiv.org/pdf/2609.23090 notes formal writing runs flat),
// so every threshold below is conservative and soft. Comma stacking per sentence was a requested check without its own source.
const sentencesOf = (para: string) =>
  para.split(/(?<=[.!?])\s+(?=[A-Z"“])/).map((x) => x.trim()).filter(Boolean);
const wc = (x: string) => x.split(/\s+/).filter(Boolean).length;
const commas = (x: string) => (x.match(/,/g) ?? []).length;
const softExtra: { id: string; note: string; hits: string[] }[] = [];

// comma-density: a sentence with 4+ commas is stacking clauses or lists. Resume bullets get 5+
// because a tool list legitimately carries commas.
const isLetter = /cover-letter/.test(target);
const sentenceCommaHits: string[] = [];
const longParaHits: string[] = [];
for (const line of lines) {
  const sents = sentencesOf(line);
  const limit = isLetter || sents.length > 1 ? 3 : 4; // flag > limit
  for (const sent of sents) {
    if (commas(sent) > limit) sentenceCommaHits.push(`${commas(sent)} commas  ←  ${sent.slice(0, 90)}…`);
  }
  // paragraph check needs at least 3 sentences to mean anything
  if (sents.length >= 3) {
    const longN = sents.filter((x) => wc(x) > 30).length;
    if (longN / sents.length > 1 / 3) longParaHits.push(`${longN}/${sents.length} sentences over 30 words  ←  ${line.slice(0, 80)}…`);
  }
}
// A comma count alone passes long sentences with only one or two commas, so
// long sentences and from-X-to-Y-to-Z chains are checked directly.
const longSentHits: string[] = [];
const fromChainHits: string[] = [];
for (const line of lines) {
  for (const sent of sentencesOf(line)) {
    if (wc(sent) > 38) longSentHits.push(`${wc(sent)} words  ←  ${sent.slice(0, 90)}…`);
    if (/\bfrom [\w'-]+( [\w'-]+)? to [\w'-]+( [\w'-]+)? to [\w'-]+/i.test(sent)) fromChainHits.push(sent.slice(0, 100));
  }
}
softExtra.push({ id: 'long-sentence', note: 'Sentence over 38 words. Split it. Say one thing per sentence.', hits: longSentHits });
softExtra.push({ id: 'from-x-to-y-to-z', note: '"From A to B to C" chain. A list of three dressed as a journey.', hits: fromChainHits });
softExtra.push({ id: 'comma-density', note: 'Sentence with more than 3 commas (5+ for a single-sentence resume bullet). Split it or cut a clause.', hits: sentenceCommaHits });
softExtra.push({ id: 'long-sentence-paragraph', note: 'More than a third of the sentences in a paragraph run past 30 words. Break one up.', hits: longParaHits });

// rhythm: coefficient of variation of sentence length across multi-sentence paragraphs.
// Real prose lands around 0.45 to 0.7; below 0.30 over 6+ sentences is suspiciously even.
const allSents = lines.filter((l) => sentencesOf(l).length > 1).flatMap(sentencesOf).map(wc);
if (allSents.length >= 6) {
  const mean = allSents.reduce((a, b) => a + b, 0) / allSents.length;
  const sd = Math.sqrt(allSents.reduce((a, b) => a + (b - mean) ** 2, 0) / allSents.length);
  const cv = sd / mean;
  if (cv < 0.3) softExtra.push({ id: 'uniform-rhythm', note: `Sentence-length variation is low (CV ${cv.toFixed(2)} over ${allSents.length} sentences; below 0.30 reads machine-even). Mix in a short sentence.`, hits: [`lengths: ${allSents.join(' ')}`] });
}
for (const e of softExtra) {
  if (!e.hits.length) continue;
  soft += e.hits.length;
  console.log(`\n⚠️  ${e.id} (${e.hits.length})`);
  console.log(`   ${e.note}`);
  for (const h of e.hits.slice(0, 4)) console.log(`   · ${h}`);
  if (e.hits.length > 4) console.log(`   · …${e.hits.length - 4} more`);
}

// Every number must come from verified-metrics.md. Years and single digits are
// skipped. A number that appears anywhere in the dossier passes; the dossier
// itself records where it is safe to use. Skipped for the baseline resume,
// which is the source the dossier is built from.
if (target !== profileFiles.baselineResume) {
  let dossier = '';
  try {
    dossier = fs.readFileSync(profileFiles.verifiedMetrics, 'utf8');
  } catch {
    // no dossier yet
  }
  const NUM = /\$?\d[\d,.]*\s?(?:%|k\b|m\b|b\b|x\b|million\b|billion\b)?/gi;
  const norm = (n: string) => n.trim().replace(/[.,]$/, '').replace(/[,$\s]/g, '').toLowerCase();
  // Each claim is a "### " block with a "Status:" line. Numbers in blocks the
  // person has not confirmed, or has ruled out, do not count as verified.
  const usable = dossier
    .split(/\n(?=###\s)/)
    .filter((block) => !/^\s*status:\s*(unverified|do-not-use)\b/im.test(block))
    .filter((block) => !/^\s*use:\s*interview-only\b/im.test(block))
    .join('\n');
  const dossierNums = new Set([...usable.matchAll(NUM)].map((m) => norm(m[0])));
  const nums = [...text.matchAll(NUM)].map((m) => norm(m[0])).filter((n) => !/^(19|20)\d\d$/.test(n) && !/^\d$/.test(n));
  const unverified = [...new Set(nums)].filter((n) => !dossierNums.has(n));
  if (unverified.length) {
    hard += unverified.length;
    console.log(`\n⛔ unverified-number (${unverified.length})`);
    console.log(
      dossier
        ? '   Not in profile/verified-metrics.md. Confirm it with the person and add it there, or cut it.'
        : '   There is no profile/verified-metrics.md yet, so no number can be used. Build it first.'
    );
    console.log(`   · ${unverified.join(', ')}`);
  }
}

// Uniform bullet length is itself a tell.
const lens = lines.map((l) => l.replace(/^[•\-*]\s*/, '').split(/\s+/).length).filter((n) => n > 4);
if (lens.length > 2) {
  const min = Math.min(...lens);
  const max = Math.max(...lens);
  console.log(`\n📏 item length: ${min} to ${max} words across ${lens.length} items`);
  if (max - min < 12) console.log('   Too uniform. Real writing varies from roughly 12 to 45 words.');
}

console.log(`\n${hard === 0 && soft === 0 ? '✅ clean' : `${hard} hard, ${soft} soft`}`);
console.log('Soft hits are smoke detectors, not verdicts. The voice to match is profile/my-voice.md.');
process.exit(hard > 0 ? 1 : 0);
