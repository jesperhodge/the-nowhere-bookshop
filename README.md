# The Nowhere Bookshop

A small, cosy, slightly magic bookshop you walk around in three dimensions —
built because finding a good book online is either an ocean of everything or
a table of the same twelve bestsellers.

Fifty rooms, ~2,500 books, three doorways deep at the furthest point. Nothing
is on a shelf because it sold well; everything came off a prize list, a
critics' poll, or a long argument. Every book links out to an independent
bookseller — deliberately never Amazon. 409 of the books carry a hand-written
curator's note and are marked as the shopkeeper's picks; the rest were
harvested from prize lists, with the exact page and revision id that named
each accolade kept alongside it.

## Run it

**No install needed to just look at it.** Open `index.html` in a browser, or
serve the folder with anything static:

```sh
python3 -m http.server 8000     # then visit http://localhost:8000
```

That gives you the whole shop on baked data — every book's ISBN, page count
and description that was already fetched and committed. No Node, no network
calls, nothing to configure.

**With `/api`** — a live-or-fixture lookup for the handful of books the baked
snapshot missed, plus the harvested award lists:

```sh
npm install          # only needed once
npm start            # Express on :8099
```

Then open <http://localhost:8099>. Without a `.env` holding `HARDCOVER_TOKEN`
this runs on fixtures, which is the intended offline default — nothing is
broken, `/api/book` just answers from `data/cache/` and
`server/fixtures/catalogue.json` instead of a live API. `npm run mock` forces
fixture mode even when a token is present, for deterministic offline work.

No build step, ever. This is a static folder plus ES modules; the server is
optional and only adds `/api`.

## Deploy it

The shop deploys to **Vercel** as a static site (CDN: `index.html`, `src/`,
`vendor/`) plus one serverless function (`api/index.js`) wrapping the exact
same router `server/index.js` uses locally — `server/routes.js` is the one
place `/api/book` and `/api/list/:slug` are implemented, imported by both.
`vercel.json` wires it up:

```sh
npx vercel build      # or: npx vercel deploy, with a real account/project
```

What to know before deploying for real:

- **Set `HARDCOVER_TOKEN`** as a Vercel project environment variable if you
  want live lookups; leave it unset and the function runs on
  `data/cache/*.json` + `server/fixtures/catalogue.json` (committed, via
  `vercel.json`'s `includeFiles`) — the same offline default as local
  fixture mode. **Never** put it in the client — nothing under `src/` or
  `index.html` ever references it (checked: `grep -r HARDCOVER_TOKEN src/
  index.html` — zero hits), and it must stay server-side per Hardcover's own
  terms.
- **`GOOGLE_BOOKS_KEY`** is build/tooling-only (`tools/describe.mjs`, run by
  hand, not by the deployed function) and is not read anywhere `api/`
  touches. It has no reason to be set on Vercel at all.
- The function's filesystem is **read-only**. A live lookup that resolves
  still tries to update `data/cache/*.json` the way it does locally, for a
  warm-container speedup — `server/cache.js` catches the write failure
  (`EROFS`) rather than letting it 500 the request; it just won't persist
  across cold starts on that platform. This is expected, not a bug to chase.
- `HANDOFF-FINAL.md` records exactly what was proved about this setup with
  a local `vercel build` (the config is valid, `includeFiles` matches the
  intended files, a simulated invocation of the built function answers
  `/api/book` and `/api/list/:slug` correctly against those files) and what
  could **not** be proved without a live account (that Vercel's own deploy
  step actually places those files where the function expects them at
  request time — asserted by Vercel's docs, not eyes-on here).

## Getting around

| | |
|---|---|
| Point at a spine, or Tab to it | read the title and the prize it won |
| Click a book, or Enter/Space on it | take it off the shelf — blurb, curator's note (if it has one), where to buy |
| Click a lit doorway | walk through into the next room |
| Click a case, or the table | fly the camera to it, close enough to read |
| Wheel / pinch | dolly the camera between the room view and the nearest case |
| `←` `→` | the next book along the shelf (or, with none open, walk to a side case) |
| `↑` | walk to the back case |
| `/` or `⌘K` / `Ctrl+K` | search titles, authors, prizes and moods — try *islands*, *grief*, *Booker* |
| `M` | the shop plan |
| `P` | your parcel |
| `S` | everything on this shelf, as a list |
| `B` | ring the bell — the shopkeeper hands you something from anywhere in the shop |
| `H` | back to The Front Room, from however deep in you are |
| `Esc` | put the book back, step out of a case/table view, or step back a room |

`M`/`P`/`S`/`B`/`H` only fire unmodified — `⌘P` opens the print dialog and
nothing else, `⌘S` saves the page and nothing else. The dock at the bottom
holds the two ways back (one room at a time, and all the way to the front)
and the shelf/bell shortcuts; everywhere else is reachable through the
doorways, the plan, or search, so nothing depends on finding it in the 3D
view.

If WebGL will not start, the shop opens as a complete text UI instead:
search, the shop plan, and "everything on this shelf" cover every room.

## How it is built

```
index.html
vercel.json          Vercel: static + the one /api function, headers, includeFiles
api/index.js         the Vercel serverless function — wraps server/routes.js, nothing else
server/
  index.js           Express: static (local dev only) + mounts the same router
  routes.js           /api/book and /api/list/:slug — the ONE implementation
  hardcover.js        the Hardcover API client (live or fixture)
  openlibrary.js      the Open Library client, incl. cleanDescription()
  cache.js            disk cache under data/cache/ (committed = the snapshot)
  lookup.js           which upstream answers, in what order, always reported in `source`
  fixtures/           recorded responses, used when there is no token
src/styles/
  base.css            foundations, the entrance door, overlays, panels
  ui.css              dock, topbar, search, plan, parcel chrome
src/js/
  main.js             routing, state, keyboard, the bell, the parcel
  shop.js             the data layer: search index, STATS, room/book lookups
  scene/              the three.js stage — renderer, rooms, cases, books, doors,
                       tables, camera poses, the accessibility mirror
  covers.js           procedural jackets and spines (the source for scene/'s atlas)
  ambience.js         dust, rain, snow, embers, spores — one canvas
  audio.js            room tone, generated with the Web Audio API
  links.js            where to buy — the only file with vendor URLs in it
  views/              book panel, shop plan overlay
  data/
    rooms.js          the plan of the shop: palettes, wall kinds, props, doors
    props.js          SVG set dressing (ladders, globes, moths, candles…)
    books/*.js         the 409 hand-curated shelves, one file per hall
    generated/         the ~2,100 harvested books + sources.js's provenance
    enrich.js           baked ISBNs/pages/years/descriptions for the curated books
vendor/three/          three.js r185, vendored and committed — no CDN, no bundler
tools/                 harvest, enrich, describe, qa, the preview harness — build-time only
```

**The rooms are a real three.js/WebGL stage**, not DOM elements with CSS 3D
transforms — that swap-over is what phase 10 did. Every book, doorway, case
and table is still a real, focusable `<button>` though: `scene/a11y.js`
maintains a visually-hidden mirror of the room so the whole shop works with a
keyboard and a screen reader, with the camera following focus. The DOM UI —
dock, book panel, search, plan, parcel — sits on top of the canvas exactly as
it did before the swap.

**Nothing is downloaded for the art.** Covers, spines and page-block textures
are generated from a hash of each book's id, so a given book always looks the
same and no two neighbours look alike, then painted once per room into a
canvas2d texture atlas. Thirty-odd cover motifs, thirty palettes. Ambient
sound is filtered noise from an oscillator, off unless you ask for it.

## Where the buy links go

`src/js/links.js` is the only file that knows about shops. The primary link is
**Bookshop.org**, which pays a share of every sale into a pool for independent
bookshops. Underneath it are Bookshop.org UK, Hive (which pays a share to a
high-street shop of your choice), Better World Books and Biblio for secondhand,
and Open Library so you can borrow it for nothing instead.

An ISBN is only ever taken from a **specific edition record**, and only when
that edition is in English — both APIs hand back every ISBN of every printing
in an unattributed heap, and picking one out of that heap is how a reader
ends up ordering a German paperback. No ISBN at all is better than the wrong
one; a book without one still works, it just searches by title and author.

To earn affiliate income, put your id in `AFFILIATE.bookshop` at the top of
that file; every Bookshop link then carries it. There is no tracking of any
kind in the page otherwise.

## Curation

There are two tiers on every shelf, and the shop says which is which.

**The shopkeeper's picks** are the 409 books with a curator's note — why
*this* book is on *this* shelf, written by hand. They stand in the top row of
every case with a gilt band on the spine, they are marked in search and in
the shelf list, and their note is the first thing in the panel.

**The rest are harvested**, and their accolades are checkable. Each one was
parsed out of a prize list that was actually fetched, and the exact page *and
revision id* it came from is committed beside it in
`src/js/data/generated/sources.js`. Harvested books get a title, an author, a
year, a page count, an ISBN and a description where one could be sourced and
verified (Open Library primarily, Google Books and a strictly-gated Wikipedia
lookup filling in more since phase 11) — and no hand-written note, tags or
opening line.

The shop will not quote a book's opening lines unless it can say where the
quotation came from. Instead each book points at somewhere you can read the
real pages: a publisher preview, a library loan, or — for anything out of
copyright — the whole text, free.

## Accessibility

- Every book, doorway, case and table is a focusable control with a
  descriptive label, in a mirror that tracks the room (`scene/a11y.js`).
  Focusing one moves the camera to it; activating one does what a click does.
- `prefers-reduced-motion` makes every camera move and room transition an
  instant cut instead of a tween, and turns off the weather/particle
  ambience.
- The room's contents are also reachable entirely through search and the
  plan, and are the fallback UI if WebGL will not start at all.
- Ambient sound is off by default and never autoplays.
- **Not yet independently verified**: no real screen reader has been run
  against the mirror, only programmatic name/role assertions. See
  `TRY-IT.md`'s "what is not done" for the honest state of this.

## The documents in this repo — what is current, what is archive

This project ran across twelve phases, and every one left a plan and (from
phase 7 on) a handoff. That is deliberate: the handoffs are the project's
memory, and every trap recorded in one already cost a session before it was
written down. None of it is deleted. But a reader picking this repo up cold
needs to know which four files to read and which twenty to skip.

**Read these, in this order, for the current state:**

| file | answers |
|---|---|
| this README | what this is, how to run it, how to deploy it |
| `TRY-IT.md` | how to try the live build, and — its "what is not done" section — the honest, current list of gaps |
| `HANDOFF-FINAL.md` | **this phase's own account**: what shipped, how the Vercel deploy was actually proved, what is still open, every trap that would cost the next session |
| `IMPLEMENTATION.md` | the architecture brief a fresh session should read first — the server contract, the data pipeline, "things not to do" |

**Everything else is archive** — the record of how the shop got here, kept
for the reasoning, not as a live spec:

| files | what they were |
|---|---|
| `PLAN.md`, `PLAN-ARCH.md` | iteration 2's diagnosis (ten measured defects in the old CSS-3D build) and the decision to move to three.js |
| `HANDOVER.md` | iteration 1's handover — data and tooling notes, superseded by `IMPLEMENTATION.md` for architecture |
| `PLAN-PHASE7.md` … `PLAN-PHASE12.md` | the plan written *before* each phase's own work |
| `HANDOFF-PHASE2.md` … `HANDOFF-PHASE10.md` | what the *next* session needed to know, at the time — several of their "not yet fixed" items were closed in later phases; `TRY-IT.md` and this phase's `HANDOFF-FINAL.md` are what to trust for current status, not these |
| `REVIEW-PHASE10.md`, `REVIEW-PHASE11.md` | adversarial review passes against a specific phase's diff |
| `DESCRIPTIONS-FEASIBILITY.md` | the measured sources for phase 11's description backfill, and why Goodreads/Open-Library-alone were ruled out |

If a handoff and `TRY-IT.md`/`HANDOFF-FINAL.md` ever disagree about whether
something is fixed, the more recent, narrower document wins — that is
exactly the ordering the table above is in.

## Licence

Code is free to reuse. The shelves are opinions.
