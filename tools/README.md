# tools

Development harnesses. Not part of the site — nothing in `src/` imports them.

    npm i playwright
    python3 -m http.server 8099 &
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

Fetches the plain facts — ISBN-13, page count, first-publication year — that
make an outbound link land on the book instead of on a search box.

    HARDCOVER_TOKEN=… node tools/hardcover.mjs enrich
    HARDCOVER_TOKEN=… node tools/hardcover.mjs suggest --limit 40

It writes `src/js/data/enrich.js`, which `shop.js` merges *underneath* each
book — so anything written by hand on a shelf always wins. It is resumable:
re-running only looks up what is missing. `--dry-run` fetches and reports
without writing.

This runs here, on your machine, and never in the browser. Hardcover's own
documentation says queries must not run in a browser, and a token shipped to
the client would be public. The site itself still has no build step and no
runtime dependencies.

`suggest` deliberately only writes a report to `tools/suggestions/`. It never
adds a book to a shelf: a lookup can find a well-rated book, but it cannot
write the curator's note saying why it belongs, and that note is the thing a
reader is actually here for.

### Testing it without a token

    node tools/mock-hardcover.mjs &
    node tools/hardcover.mjs enrich --endpoint http://127.0.0.1:8123 --dry-run --limit 8

`mock-hardcover.mjs` answers the same queries with the same shapes from a
small fixture, including the awkward cases: a right-title/wrong-author decoy,
an edition list where only some entries carry an ISBN-13, and a book with no
usable edition at all.

Node prints a `MODULE_TYPELESS_PACKAGE_JSON` warning when `hardcover.mjs`
imports the shelf files. It is cosmetic — silencing it would mean adding a
`package.json` to the root, and this project is deliberately a folder you can
open rather than something you install.

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
