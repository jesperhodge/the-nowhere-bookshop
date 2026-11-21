# Where the missing descriptions can actually come from

Measured against this repo's real data and the live APIs, from this sandbox,
before phase 11 was planned. **Do not re-probe these — the numbers cost an
afternoon.** Re-measure only if you are on a different machine, in which case
the Google Books row is the one that changes.

## The gap, counted

```
curated     409 books | blurb  409 (100%) | note 409
generated  2096 books | blurb  991 (47.3%) | note 0
TOTAL      2505 books | blurb 1400 (55.9%)

generated missing a blurb: 1105
  of those, carrying an ISBN: 971
```

So 44% of the shelf has no "What it is" section. That is what the owner
noticed. The visible symptom they reported is actually the *note* placeholder
in `views/book.js:85` ("On the shelf for what it won, not for a note — the
shopkeeper hasn't written about this one"), which is a different field, but
the underlying complaint is the same: too many books say nothing about
themselves.

## Sources, tested against books that are actually missing

| source | status here | yield | verdict |
|---|---|---|---|
| **Open Library** | 200, working | **exhausted** | Phase 9 already took everything it has. Tested work-level, edition-level and `api/books?jscmd=details` on known-missing books: all `none`. The 1105 are OL's genuine gaps, not a bug in phase 9. |
| **Google Books** | **429, hard** | would be highest | Blocked from this shared sandbox IP at *any* pacing — 3s spacing, with and without `&country=US`, six ISBNs, 12/12 refused. Not a burst limit. Works from a normal machine, and with an API key gets 1,000 req/day free. |
| **Wikipedia** | 200, rate-limited | **low, ~10–20%** | 429s after ~10 rapid requests; needs ≥1s spacing and a `User-Agent`. Worse, search is *confidently wrong*: of 10 successful lookups only 1 was the right page. It returned "List of Father Ted characters" for *Sins of the Father*, "Mark Dapin" (the author) for *King of the Cross*, "Waterstones Children's Book Prize" for *Wildlands*. Usable **only** behind a strict verification gate. |
| **Wikidata** | 200, working | ~high, but one line | Returns a factual one-liner — "1982 novel by Gene Wolfe", "2006 novel by M. John Harrison". CC0, structured, reliable. This is a **fact, not a blurb**, and must never be dressed up as one. |
| **Bookshop.org** | **403** | — | Bot-protected. Tried the documented `/a/<id>/<isbn>` deep link the repo already builds in `links.js`; returns a 5.5KB challenge page, no `og:description`. |
| **Goodreads** | reachable | — | **Declined — do not scrape.** See below. |

## Why not Goodreads, given it was suggested

Its `robots.txt` (fetched, 200) names AI crawlers explicitly and disallows the
whole site to them:

```
User-agent: GPTBot
Disallow: /
User-agent: CCBot
Disallow: /
```

The `Allow: /book/show` lines that also appear are scoped to other agents
(`AmazonAdBot`, `facebookexternalhit`), not to us. On top of that Goodreads'
terms prohibit automated collection, and the descriptions themselves are
publisher copy under copyright — the same copy Google Books serves *with*
permission through a documented API.

So the honest move is not "scrape it anyway", it is: build the Google Books
path properly, and let the owner run it with a key. Same data, obtained the
way the publisher intended it to be obtained. Bookshop.org would have been
the licensed-in-spirit equivalent — the shop already sends every sale there —
but it refuses bots outright.

## The decision

Build **one** programmatic backfill tool. No agent hand-writing descriptions,
no agent recalling them from memory, and nothing invented — a missing blurb
degrades gracefully, a fabricated one is a lie that outlives the session.

Source order, each recording its own provenance on the book:

1. **Google Books** — primary. Gated behind `GOOGLE_BOOKS_KEY`; skipped
   automatically when absent, so it costs nothing here and fills most of the
   1105 the moment the owner runs it.
2. **Wikipedia** — behind a strict gate: reject disambiguation pages, reject
   a page whose title is the author's name, reject a page titled like an
   award, and require the extract to mention both the title and the author's
   surname and to read as a work ("novel", "collection", "memoir", …).
   Throttle ≥1s. Expect it to reject most candidates — that is it working.
3. **Wikidata** — last, and stored in its **own field**, not as `blurb`. A
   one-line fact is worth showing; it is not a description and must not be
   rendered as one.

Everything cached to disk, resumable, and re-runnable without re-fetching.

## And the UI half of it

Sourcing will not reach 100%, ever. So the book panel has to stop apologising.
Where there is no note, lead with what the shop genuinely knows — the
accolades, every one of which phase 9 made traceable to a fetched page and
revision id. "Shortlisted for the Booker, 2017 · Winner, Arthur C. Clarke
Award, 2017" is real, specific and more interesting than publisher copy. The
placeholder that reads as an apology should go.
