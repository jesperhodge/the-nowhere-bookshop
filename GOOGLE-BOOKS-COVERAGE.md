<!-- GENERATED — rewritten by `node tools/google-coverage.mjs report`. Edits made
     directly to this file will be overwritten the next time that command runs.
     The numbers below come only from data/cache/gbcoverage.json and
     data/cache/gbcoverage-runs.json; the match-rule prose is a template literal
     in tools/google-coverage.mjs itself, so neither can drift from what the tool
     actually measured. -->

# Google Books coverage — PHI-4

## Headline

**This is a 30-book uniform random sample, not a census.**

**90.0% matched** (27 / 30), tiers A+B+C only.

n = 30 of 2444 distinct title+author keys (2505 books). 95% CI ±10.7 pp (finite-population corrected).

Upper bound including tiers D and E ("found something, not confidently"): **90.0%** (27 / 30).

## How a match was defined

**A match is:** one unqualified text query of `"<title> <author>"` against the Google Books Volumes API, returning up to 20 volumes, scored client-side. A volume matches when, after normalisation (lowercased, accents and punctuation stripped, leading article and subtitle removed), **either** the shop's checksum-valid ISBN-13 appears verbatim in the volume's `industryIdentifiers` and the title heads agree (**tier A**), **or** the bare titles are equal and the author's surname appears in the volume's author list (**tier B**), **or** one bare title is a ≥4-character prefix of the other and the author's surname appears in the volume's author list (**tier C**). A volume whose listed authors do not contain the author's surname is rejected outright. Where the shop's title carries a distinctive subtitle that the volume's title and subtitle fail to corroborate, the volume is demoted to **tier E** and is *not* counted as a match — this is the "Abarat" guard from `REVIEW-PHASE11.md`, which stops a later series volume matching volume one. A volume with an exact title and **no** authors listed is **tier D** and is also not counted. **The headline match rate counts tiers A + B + C only.** An upper bound including D and E is reported alongside it.

| tier | count | share of measured |
|---|---:|---:|
| A | 8 | 26.7% |
| B | 19 | 63.3% |
| C | 0 | 0.0% |
| D | 0 | 0.0% |
| E | 0 | 0.0% |
| miss | 3 | 10.0% |

## `accessInfo.viewability` across the matched set (tiers A+B+C)

| viewability | count | share |
|---|---:|---:|
| ALL_PAGES | 0 | 0.0% |
| PARTIAL | 12 | 44.4% |
| NO_PAGES | 15 | 55.6% |
| UNKNOWN | 0 | 0.0% |
| (field absent) | 0 | 0.0% |

`accessInfo.country` distribution over the same set:

| country | count | share |
|---|---:|---:|
| US | 27 | 100.0% |

Viewability is jurisdiction-dependent; these numbers describe **US**.

## `accessInfo.embeddable`

| embeddable | count | share |
|---|---:|---:|
| true | 12 | 44.4% |
| false | 15 | 55.6% |

## `volumeInfo.imageLinks`

| | count | share |
|---|---:|---:|
| present | 25 | 92.6% |
| — of which carries a `thumbnail` (not merely `smallThumbnail`) | 25 | 100.0% of present |
| absent (would need the generated spine fallback) | 2 | 7.4% |

## Twenty misses (first 3 tier-null records in shuffle order)

Signal below is computed over all **3** miss(es) measured so far, not just the 3 shown below.

*Too few misses (3 < 10) to judge whether misses look like a matching bug — treat this as anecdotal until more of the shelf is measured.*

- **The Guardener's Tale** / Bruce Boston (isbn 9781933556789)
  query: `The Guardener's Tale Bruce Boston` — totalItems: 337
  - candidate[0] "The Gardener's Monthly and Horticultural Advertiser" / (no authors listed) — tier null, score 0, title mismatch
  - candidate[1] "The Gardeners' Chronicle" / (no authors listed) — tier null, score 0, title mismatch
  - candidate[2] "Nor-west Farmer for the Stock-raiser, the Gardener, Etc" / (no authors listed) — tier null, score 0, title mismatch
- **The Immeasurable Heaven** / Caspar Geon (isbn 9781837864737)
  query: `The Immeasurable Heaven Caspar Geon` — totalItems: 0
  - (no candidates returned)
- **Through the Heart** / Richard Grant
  query: `Through the Heart Richard Grant` — totalItems: 352
  - candidate[0] "The International Library of Famous Literature" / Richard Garnett — tier null, score 0, title matched but the listed author(s) do not include the shop's author surname
  - candidate[1] "The International Library of Famous Literature" / (no authors listed) — tier null, score 0, title mismatch
  - candidate[2] "The Roxburghe Library of Classics" / (no authors listed) — tier null, score 0, title mismatch

## Requests used

Total across all runs: **31**.

| date | requests | books measured | stop reason |
|---|---:|---:|---|
| 2026-10-03T20:49:55.420Z | 31 | 30 | budget |

## Threshold band

Confirmed rate (A+B+C): 90.0% — **≥80% — good**.
Upper bound (A+B+C+D+E): 90.0% — **≥80% — good**.

## Caveats

- **ISBN confirmation is conservative.** Tier A requires the shop's checksum-valid ISBN-13 to appear
  verbatim in a volume's `industryIdentifiers`. No ISBN-10↔13 arithmetic is performed, so a volume
  carrying only an ISBN-10 record never confirms — this under-counts tier A and never over-counts it.
- **Tier E (0 record(s))** is the subtitle-corroboration guard (REVIEW-PHASE11.md's "Abarat"
  guard, ported from the Wikipedia path to the Google path) firing: a head-title match whose distinctive
  subtitle isn't corroborated by the volume's own title/subtitle is demoted out of the matched set.
- **Viewability and embeddability are jurisdiction-dependent.** These numbers describe US,
  the country Google's own geolocation returned for this run — a different request origin could read
  differently.
- **The query is plain unqualified text, not a field-restricted one, by design.** `intitle:`/`inauthor:`/
  `isbn:` were measured returning `totalItems: 0` for books unambiguously present (2026-10-03, valid key,
  HTTP 200) — a regression in Google's API relative to phase 11's run, not a bug this tool introduced.
  Reusing a field-restricted operator here would silently resurrect that false-negative factory.

## What this means

_TBD after the real harvest run._
