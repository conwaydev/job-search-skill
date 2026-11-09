/**
 * Whether a posting title is worth cataloguing, by title alone.
 *
 * Shared by `scanLinkedIn`, `scanBuiltIn`, `ingest` and the board scanners so
 * every discovery path agrees on what is in band. Whole-board ingestion needs
 * it most: a large company's board runs to hundreds of postings, nearly all of
 * them outside the person's field. Without a filter the catalog gets buried.
 *
 * The keyword lists come from `profile/search-profile.json` → `titleFilter`.
 * When a list is empty, that check is skipped, so a brand-new profile lets
 * almost everything through rather than silently dropping good roles.
 *
 * Title-only and deliberately loose. A title that passes still gets read and
 * scored against the real responsibilities, because a promising title does
 * not guarantee a match and an unremarkable one does not rule one out. When
 * checking one specific company, use `checkBoard.ts` and read every title
 * rather than routing through here.
 */
import { loadProfile, wordsToRegex } from './profile.ts';

/** Always out: internships, unless the profile says otherwise. */
const DEFAULT_EXCLUDE = ['intern', 'internship'];

interface Compiled {
  exclude: RegExp | null;
  wrongFunction: RegExp | null;
  level: RegExp | null;
  domain: RegExp | null;
  alwaysInclude: RegExp | null;
}

let compiled: Compiled | undefined;

function compile(): Compiled {
  if (compiled) return compiled;
  const f = loadProfile().titleFilter ?? {};
  compiled = {
    exclude: wordsToRegex([...DEFAULT_EXCLUDE, ...(f.excludeKeywords ?? [])]),
    wrongFunction: wordsToRegex(f.wrongFunctionKeywords),
    level: wordsToRegex(f.levels),
    // Domain words are matched as substrings so "market" catches "marketing".
    domain: wordsToRegex(f.domainKeywords, { wholeWord: false }),
    alwaysInclude: wordsToRegex(f.alwaysIncludeKeywords, { wholeWord: false }),
  };
  return compiled;
}

/**
 * @param opts.anyDomain skip the domain check (used for listings that are
 * already narrowed to the person's field, such as a Built In category page).
 */
export function isInBandTitle(title: string, opts: { anyDomain?: boolean } = {}): boolean {
  if (!title) return false;
  const c = compile();
  if (c.exclude?.test(title)) return false;
  if (c.wrongFunction?.test(title)) return false;
  if (c.alwaysInclude?.test(title)) return true;
  if (c.level && !c.level.test(title)) return false;
  if (opts.anyDomain || !c.domain) return true;
  return c.domain.test(title);
}
