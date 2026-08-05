# tools

Development harnesses. Not part of the site — nothing in `src/` imports them.

    npm install
    npm start &                 # or: python3 -m http.server 8099 &  (no /api, baked data only)
    node tools/qa.mjs            # full sweep: all 50 rooms, links, keyboard, search
    node tools/qa.mjs --shots    # also writes tools/rooms/<roomId>.png
    node tools/shot.mjs cellar out.png 1600 1000

`EXE` at the top of each script points at the bundled Chromium; change it if
your Playwright browsers live elsewhere. Don't edit files in `src/` while the
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
