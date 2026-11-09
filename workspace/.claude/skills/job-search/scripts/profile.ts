/**
 * The person's search profile (`profile/search-profile.json`), loaded once and
 * turned into the pieces the scanners need: search queries, locations, and
 * title keywords.
 *
 * Onboarding writes this file. Nothing about any one person's search is
 * hardcoded in the scripts; if a scanner needs to know what to look for, it
 * asks here.
 */
import { readFileSync, existsSync } from 'node:fs';
import { profileFiles } from './paths.ts';

export interface Place {
  city: string;
  /** State, province or region, e.g. "Illinois". */
  region?: string;
  country?: string;
}

export interface SearchProfile {
  name?: string;
  positioning?: string;
  /** The job titles the person wants. Also the default search queries. */
  targetTitles: string[];
  /** Extra search phrases beyond the titles. Optional. */
  searchQueries?: string[];
  /** Places they would work on-site or hybrid. */
  locations: Place[];
  /** Whether fully remote roles are in scope. */
  remote: boolean;
  /** Country for remote searches. Defaults to "United States". */
  country?: string;
  minSalaryUSD?: number;
  staleAfterDays?: number;
  titleFilter?: {
    /** Words a title must contain one of, e.g. "director", "manager". Empty = any level. */
    levels?: string[];
    /** Words that tie a title to their field. Empty = any field. */
    domainKeywords?: string[];
    /** Titles containing any of these are skipped, e.g. "vp", "intern". */
    excludeKeywords?: string[];
    /** Other job functions to skip, e.g. "sales", "recruiter". */
    wrongFunctionKeywords?: string[];
    /** Titles containing any of these pass at any level (still not excluded ones). */
    alwaysIncludeKeywords?: string[];
  };
  mustHave?: string[];
  dealbreakers?: string[];
  industries?: string[];
  notes?: string;
  [key: string]: unknown;
}

let cached: SearchProfile | undefined;

export function hasProfile(): boolean {
  return existsSync(profileFiles.searchProfile);
}

export function loadProfile(): SearchProfile {
  if (cached) return cached;
  if (!hasProfile()) {
    process.stderr.write(
      JSON.stringify({
        error: 'no_search_profile',
        hint: 'No search profile yet. Run onboarding ("set me up") to create profile/search-profile.json.',
        path: profileFiles.searchProfile,
      }) + '\n'
    );
    process.exit(1);
  }
  const p = JSON.parse(readFileSync(profileFiles.searchProfile, 'utf8')) as SearchProfile;
  p.targetTitles ??= [];
  p.locations ??= [];
  p.remote ??= true;
  p.country ??= 'United States';
  cached = p;
  return p;
}

/** Search phrases: the target titles plus any extra queries, deduped. */
export function searchQueries(): string[] {
  const p = loadProfile();
  const all = [...p.targetTitles, ...(p.searchQueries ?? [])].map((q) => q.trim()).filter(Boolean);
  return [...new Set(all.map((q) => q.toLowerCase()))];
}

/** "Chicago, Illinois, United States": the plain-text form LinkedIn accepts. */
export function placeLabel(place: Place): string {
  const p = loadProfile();
  return [place.city, place.region, place.country ?? p.country].filter(Boolean).join(', ');
}

/** Whether a posting's location text is somewhere the person would work. */
export function isInScopeLocation(location: string): boolean {
  const p = loadProfile();
  const text = (location || '').toLowerCase();
  if (p.remote && /remote/.test(text)) return true;
  // A bare country ("United States") is how LinkedIn labels many remote cards.
  if (p.remote && p.country && text.trim() === p.country.toLowerCase()) return true;
  return p.locations.some((place) => {
    const city = place.city.toLowerCase();
    return text.includes(city);
  });
}

/** Escape words for use inside a regex alternation. */
export function wordsToRegex(words: string[] | undefined, { wholeWord = true } = {}): RegExp | null {
  const list = (words ?? []).map((w) => w.trim()).filter(Boolean);
  if (list.length === 0) return null;
  const body = list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|');
  return new RegExp(wholeWord ? `\\b(?:${body})\\b` : `(?:${body})`, 'i');
}
