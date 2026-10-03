# tools

Development harnesses. Not part of the site — nothing in `src/` imports them.

    npm install
    npm start &                 # or: python3 -m http.server 8099 &  (no /api, baked data only)
    node tools/qa.mjs            # full sweep: all 50 rooms, links, keyboard, search
    node tools/qa.mjs --shots    # also writes tools/rooms/<roomId>.png
    node tools/shot.mjs cellar out.png 1600 1000

`qa.mjs` finds Chromium via the `PW_CHROMIUM` environment variable (falls
back to Playwright's own default if unset — see its own header comment for
the exact invocation); `shot.mjs` has the executable path written directly
into its one `chromium.launch()` call. Change whichever applies if your
Playwright browsers live elsewhere. Don't edit files in `src/` while the
sweep is running — a mid-run reload produces failures that aren't real.

## shot.mjs / qa.mjs and the arrival animation

A room's arrival animation is not composited — it runs on the main thread
behind a few hundred `preserve-3d` nodes, so it takes longer in wall-clock
time than its own 620ms duration. Both harnesses wait for
`getComputedStyle('.travel').transform === 'none'` rather than a fixed
timeout. An earlier fixed 800ms wait photographed every room mid-flight, at
the wrong scale, which hid the very things the screenshots were for. `qa.mjs`
also reports the median and worst settle time and flags any room over 2.5s.

## hardcover.mjs

A thin CLI over `server/hardcover.js` — the one client implementation, shared
with the `/api/book` route and the MCP tool (`server/mcp.js`). Fetches the
plain facts — ISBN-13, page count, first-publication year — that make an
outbound link land on the book instead of on a search box.

    HARDCOVER_TOKEN=… node tools/hardcover.mjs enrich
    HARDCOVER_TOKEN=… node tools/hardcover.mjs suggest --limit 40

It writes `src/js/data/enrich.js`, which `shop.js` merges *underneath* each
book — so anything written by hand on a shelf always wins. It is resumable:
re-running only looks up what is missing. `--dry-run` fetches and reports
without writing.

This runs here, on your machine, and never in the browser. Hardcover's own
documentation says queries must not run in a browser, and a token shipped to
the client would be public. The site itself still has no build step and no
runtime dependencies — only `server/` and the tooling need `npm install`.

`suggest` deliberately only writes a report to `tools/suggestions/`. It never
adds a book to a shelf: a lookup can find a well-rated book, but it cannot
write the curator's note saying why it belongs, and that note is the thing a
reader is actually here for.

### Testing it without a token

    node tools/hardcover.mjs enrich --mock --dry-run --limit 8

`--mock` (or `HARDCOVER_MOCK=1`) switches `server/hardcover.js` to
`server/fixtures/catalogue.json` instead of the network — no separate process
to start. It's the same small fixture that used to be served by
`tools/mock-hardcover.mjs` (now folded in), including the awkward cases: a
right-title/wrong-author decoy, an edition list where only some entries carry
an ISBN-13, and a book with no usable edition at all.

### The token is a credential

`hardcover.mjs` reads `HARDCOVER_TOKEN` from the environment or from an
untracked `.env` at the repo root — never from anything committed:

    cp .env.example .env && $EDITOR .env
    node tools/hardcover.mjs enrich

Prefer that over `HARDCOVER_TOKEN=… node tools/hardcover.mjs`: a command line
lands in your shell history and is readable in the process list by anyone else
on the machine. A shell-exported variable still wins over `.env` if you want to
override it for one run.

The token can read *and write* your Hardcover account. If it ever reaches a
chat window, a screenshot, a commit or a log, generate a new one — the old one
stays valid until you do.

## harvest.mjs — phase 9's pipeline (`IMPLEMENTATION.md` §6)

Fills the shelves with real books: **harvest → enrich → shelve.**

    npm run harvest              # prize lists  → data/lists/*.json
    npm run harvest:enrich       # Open Library → data/cache/openlibrary.json
    npm run harvest:shelve       # allocate     → src/js/data/generated/
    npm run harvest:isbns        # one edition request per shelved book
    npm run harvest:shelve       # again, to pick the ISBNs up
    npm run harvest:report       # counts, per list, with permalinks

Every step is resumable and cached to disk; a crash at book 1,400 restarts at
1,400. All four npm scripts set `NODE_USE_ENV_PROXY=1`, which is not optional
— see `IMPLEMENTATION.md` §8.2.

**The rule the whole thing exists to enforce.** A title, an author and an
accolade may only come from a page that was actually fetched, and that page's
URL *and revision id* are written into the committed data next to them
(`src/js/data/generated/sources.js`; every book's `acc[].s` is a key in it).
Nothing is reconstructed from memory. A list that will not fetch or will not
parse is skipped and counted in `data/lists/_gaps.json`, because a
plausible-looking wrong shortlist is worse than a missing one — once the
session that made it is over, the two are indistinguishable.

`fetch` also refuses to be quiet about the one failure mode that produces a
false claim rather than a missing one: if a list's winners run to more than
2.5 a year it says so, because that is what "every shortlisting recorded as a
win" looks like. It caught 240 CWA shortlistings being written up as Gold
Dagger wins.

`tools/lists.js` is the list configuration (page, prize, which rooms it may
shelve into). `tools/rooms-rules.js` decides which of those rooms a given book
lands in, from Open Library subjects and publication year. `tools/wikitable.js`
is the wikitext table reader — rowspan, templates and all five different
winner-marking conventions these pages use.

## describe.mjs — phase 11's backfill (`DESCRIPTIONS-FEASIBILITY.md`)

1,105 of the 2,096 generated books came out of `harvest.mjs shelve` with no
`blurb` — Open Library's genuine gap, not a bug in phase 9. This fills as many
as a fetched source will actually support, in order:

    NODE_USE_ENV_PROXY=1 node tools/describe.mjs run     # google books → wikipedia → wikidata
                         node tools/describe.mjs apply   # replay the store onto generated/*.js, no network
                         node tools/describe.mjs report  # counts, by source
                         node tools/describe.mjs selftest # google books matcher + wikipedia subtitle gate, against fixtures — no network

Same conventions as `harvest.mjs`: disk-cached under `data/cache/describe/`
(gitignored — regenerable from the URL), resumable via a persistent record at
`data/cache/describe.json` (committed, same footing as `openlibrary.json`), and
throttled. A crash or a kill mid-run loses nothing already resolved; `run`
only ever fetches a source for a book it has not already tried that source
against, and `--force` overrides that.

**Google Books** is gated on `GOOGLE_BOOKS_KEY` (`.env` or the shell) and does
most of the work — but 429s from this sandbox's IP at any pacing, keyed or
not, so `run` skips it cleanly here and the path is proven with `selftest`'s
fixture instead. **Wikipedia** sits behind a strict gate
(`verifyWikipediaCandidate`) because its search is confidently wrong about as
often as it is right: it will hand back the author's own page, an award's
page, or a screen adaptation ahead of the book. Expect most candidates to be
rejected — that is the gate working. It also requires a book title's subtitle
to be corroborated by the page's own title or extract (`REVIEW-PHASE11.md`) —
otherwise a book whose title extends a series' first-volume title (`Abarat:
Days of Magic, Nights of War` vs. the `Abarat` page) passes on the main title
alone. **Wikidata**'s one-line fact
("1982 novel by Gene Wolfe") is stored separately as `fact`/`factUrl`, never
as `blurb` — it is a fact, not a description.

`run` calls `apply` itself when it finishes. Run `apply` on its own after
`harvest.mjs shelve` regenerates `src/js/data/generated/` from scratch — shelve
does not know this tool exists and will wipe its fills; `apply` puts them back
without a single new request.

## google-coverage.mjs — PHI-4's measurement

A measurement, not a build: what fraction of the shop's ~2,500 books (2,444
distinct title+author keys) can be resolved to a Google Books volume at all.
Nothing under `src/js/**` is touched — no book is modified, no cover or
preview link is wired into the site. That is all gated on the number this
tool produces.

    NODE_USE_ENV_PROXY=1 node tools/google-coverage.mjs plan                     # zero requests
    NODE_USE_ENV_PROXY=1 node tools/google-coverage.mjs run [--budget N] [--force] [--limit N]
                         node tools/google-coverage.mjs report                   # zero requests, writes GOOGLE-BOOKS-COVERAGE.md

**The query is plain unqualified text — `${title} ${author}` — never
`intitle:`/`inauthor:`/`isbn:`.** Those field-restricted operators were
measured returning `totalItems: 0` for books unambiguously present
(2026-10-03, valid key, HTTP 200) — this repo's own `data/cache/describe/
google/` from phase 11 (gitignored, not present in a fresh checkout) proves
they worked when that run happened. This is a regression in Google's API,
not a bug either tool introduced, but it means a field-restricted query here
would silently reproduce it as a false-negative factory. `maxResults` is
capped at 20 server-side regardless of what is requested, so there is no
pagination — one request answers the question this tool asks, and a
per-volume follow-up fetch is never made (the search response already
carries `accessInfo` and `imageLinks`).

The match rule (`tools/google-books.mjs`'s `classifyMatch`/`classifyVolume`)
is stricter and tiered (A–E) rather than the plain accept/reject
`pickGoogleMatch` describe.mjs uses — it needs to say *why*, at what
confidence, with an upper bound, not just fill in a blurb. ISBN confirmation
is a strengthener (tier A), not a requirement — a book's shop ISBN is often a
different edition than Google's top-ranked volume, so requiring it would
produce an artificially low, wrong number. The Abarat guard (tier E) is the
same subtitle-corroboration check `describe.mjs`'s Wikipedia path uses,
ported to the Google path, so a later series volume cannot match the first
one's record just because `bareTitle()` strips the subtitle off both sides.

Disk-cached under `data/cache/gbcoverage/` (gitignored — regenerable from
the query alone, ~100 MB), with the derived per-book verdict committed at
`data/cache/gbcoverage.json` (same footing as `describe.json`) and a
request ledger at `data/cache/gbcoverage-runs.json` (same footing as
`harvest-attempts.json`). `run` walks all 2,444 distinct keys in a fixed
seeded shuffle, not shelf order, so any partial run — interrupted,
budget-limited, multi-day — is a uniform random sample with a computable
confidence interval rather than a biased slice correlated with room/hub.
Resumable the same way as `describe.mjs`/`links.mjs`: a key already measured
is skipped unless `--force`, and a raw response already on disk is replayed
rather than re-fetched. Stops cleanly — never mid-write — at the daily
budget, on a genuine daily-quota error (distinguished from a transient
429/5xx, which is retried with backoff instead), or after five consecutive
transport failures. A transport failure is never cached, same rule as
`links.mjs`.

`report` makes no requests; it only reads the two cache files above and
(re)writes `GOOGLE-BOOKS-COVERAGE.md` at the repo root, banner-marked as
generated so its numbers can never drift from what was actually measured.
