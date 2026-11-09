# Getting better with use

The skill improves by writing down what it learns about the person. It never rewrites itself. Learned things live in their profile, and an update to the skill never touches them.

| What was learned | Where it goes |
|---|---|
| A correction to how you score, search, write or behave | `profile/learned-rules.md` |
| A new fact or number about their work | `profile/verified-metrics.md` |
| A change to what they're looking for | `profile/search-profile.json` (with their OK) |
| How they sound, from their own writing and their edits | `profile/my-voice.md` |
| A company they want watched | `profile/sources.json` |

## When they correct you

1. Fix the thing they pointed at. Then check the rest of the document or list for the same problem. Don't patch only the one line.
2. Add a dated rule to `profile/learned-rules.md` under the right heading, in their words where possible, with the reason.
3. Tell them in one line: "Noted for next time: <rule>."

```markdown
# What I've learned

## Scoring
- 2026-11-09: Hybrid in Boulder is fine, not a drag. Their words: "Boulder's 30 minutes, that's not relocating."

## Discovery
- 2026-11-12: Skip staffing agencies entirely, even when the client is named.

## Writing
- 2026-11-14: No exclamation points in letters. "Sounds like a sales email."

## Banned phrases
- results-oriented
- hit the ground running

## Other
```

- **Banned phrases are enforced.** Every `- phrase` line under `## Banned phrases` becomes a hard failure in `scripts/auditProse.ts`. Put exact phrases there, one per line, with no date or quotes.
- **Newer rules beat older ones.** When a new rule contradicts an old one, update the old one rather than leaving both.
- **Their rules beat the skill's defaults.** If a rule in this skill and a rule in their file disagree, theirs wins.
- **Only write a rule they would agree with.** If you are unsure what they meant, ask.

## New facts

When they mention something real about their work, offer to add it to `verified-metrics.md`. Examples: a number, a project, an award, a team they ran, a problem they solved.
- Ask where it comes from and whether it's fine on a public profile.
- Record it as a `###` entry with `Status:` and `Use:` ([writing.md](writing.md)).
- A fact confirmed while scoring ("yes, I've managed a budget, about $2M") goes in too.

## Looking back

Every tenth application, or when they ask "how's my search going", look at the catalog and offer a short readout:

- **What the best-scoring postings ask for.** List the themes that come up again and again in roles scored 80 and up. Offer to add any that are missing to `search-profile.json` (`titleFilter.domainKeywords`, `searchQueries`).
- **What's getting responses.** Compare roles that reached `screening` or later with roles that didn't: source, title, industry, remote or not, how far over their floor the pay was. With a small count, say it's a direction, not a result.
- **What's being skipped.** If they keep passing on roles the profile likes, ask why. The profile may be wrong.
- **Searches that find nothing.** A query or city that hasn't produced a role worth reading in weeks can be dropped.

Propose changes. Don't make them silently. Put a short "What I've learned about your search" section at the end of the digest when anything changed.
