# What the research says about resumes and letters

This is background for the rules in [tailoring.md](tailoring.md) and [letters.md](letters.md). Read it before changing how documents are structured, or when they ask "is it true that…?".

Credibility marks:
- **VENDOR**: the applicant-tracking vendor's own docs
- **STUDY**: a named study with a method
- **SURVEY**: practitioner surveys, direction only
- **LOW**: content marketing, recorded only where it agrees with better sources

## Contents
1. The "robots reject 75% of resumes" myth
2. What actually breaks parsing
3. Length
4. The seven-second scan
5. Job titles
6. Headings and dates
7. Hidden text
8. Cover letters

## 1. The "robots reject 75% of resumes" myth

The figure traces to a 2012 sales pitch from a resume-optimization company that closed in 2013. No method was ever published.

- Greenhouse's documentation says its AI "does not automatically disposition any candidates nor does it make any hiring decisions." It sorts candidates into match categories for a human to review. (VENDOR)
- The real constraint is volume, plus recruiters running keyword searches over parsed text. Greenhouse documents Boolean candidate search. (VENDOR)
- **What follows:** parse cleanly, and make sure the words a recruiter would type appear somewhere true. Keyword stuffing buys nothing, because matchers group related terms into one skill. (VENDOR)

## 2. What actually breaks parsing

Greenhouse lists these causes of a failed parse (VENDOR):
- files over 2.5 MB
- letter-spacing
- graphics or word art
- image-only PDFs
- complex tables, headers and footers
- contact details in a header, footer or text box
- columns
- inconsistent section formatting
- incomplete job titles
- company names with no legal suffix

**On the legal suffix:** use the common name people recognize. Never guess at a legal suffix.

A clean, text-based, single-column PDF parses reliably in Workday, Greenhouse, Lever and iCIMS. The failure case is an image-based PDF exported from a design tool. (LOW, consistent with VENDOR)

**Fonts can split words.** If a PDF's font is substituted glyph by glyph, a parser can read "Jordan" as "Jor Dan". `renderDocument.ts` uses installed system fonts to avoid this.

## 3. Length

ResumeGo (2018) ran a hiring simulation: 482 reviewers made 7,712 selections. (STUDY)
- Reviewers were 2.3 times more likely to prefer two-page resumes, and the preference held at every level.
- They spent about 4 minutes on two-page resumes and about 2.5 on one-page ones.

Two pages is right for experienced candidates. Don't trim real content to fit one.

## 4. The seven-second scan

The 2018 Ladders eye-tracking study measured 7.4 seconds. That is the time spent deciding whether to keep reading, not the whole read. (STUDY)
- The resumes that survived it had simple layouts, clear headings, bold job titles and bullets.
- Columns and clutter failed.
- Titles and headings carry those seconds.

## 5. Job titles

Recruiters search titles first, and internal titles often don't match the market's words. Put the posting's exact title on the resume as the target role. (VENDOR mechanism; a vendor's "10x" claim is unverified.)

Mirror the title. Never mirror the posting's prose.

## 6. Headings and dates

- Conventional headings: Summary, Skills, Experience, Education. "Core Competencies" is sometimes folded into the summary instead of parsed as skills. (SURVEY)
- Use both the acronym and the full form once.
- Format dates as `Month YYYY – Month YYYY`, the same way every time. Use "Present", not "Now" or "Current". Being consistent matters more than which format you pick.
- Don't omit Education. An honest minimal entry is better than an empty field. (SURVEY)

## 7. Hidden text

White-on-white keywords or instructions aimed at an AI screener are an active detection target. Research (ACL 2026, plus several arXiv papers) finds the benefit disappears as more people do it. Applicant systems can flag the candidate. Never do it.

## 8. Cover letters

**Who reads them.** About half of recruiters skip letters. Most hiring managers read them, and few read the letter first. (SURVEY) Write the letter for the hiring manager, and assume they have read the resume.

**Quality matters.** One independent study found that better-written resumes and letters led to more interviews and faster offers: Wingate, Robie, Powell and Bourdage, 2025, *International Journal of Selection and Assessment*, 183 job seekers. (STUDY)

**What the stronger sources agree on:**
- Forbes HR Council, 2026: resumes have gone uniform, so the letter is where a reader learns how someone thinks.
- Show who they are and how they think, through one story rather than adjectives.
- For leaders, character (judgment, humility, collaboration) is read before competence (MIT Sloan Management Review). Crediting the team reads as strength.
- Show that you understand the company's situation. Quoting its news doesn't do that (Carney Sandoe, executive search).
- Keep it short and plain. The opening decides whether the rest is read.

**Where mass-market advice conflicts:**
- "Open with a quantified achievement" is popular on career sites. It is the opposite of what the senior-hiring sources say. Don't open on a number.
- "Show enthusiasm" is fine, but show it through the story and never with the word.

**Phrases readers flag as AI-written:** "I am writing to express", "passionate about", "proven track record", "leverage", "thrive", "unique blend", "excited to contribute". The fix is always to name the specific thing.
