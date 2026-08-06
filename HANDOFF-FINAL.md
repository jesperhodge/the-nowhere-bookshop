# Handoff — phase 12 done. This is the last one.

Phase 12 (`PLAN-PHASE12.md`) is **complete: planned, implemented, verified**.
`npm run qa` passes clean — 67 checks, 0 failures, 0 console/page errors, 0
failed requests, across a full 50-room sweep. Tree clean at commit time,
scratch deleted. This document is both this phase's handoff and the
project's closing account: twelve phases, and this is where it stands.

---

## What shipped

1. **Vercel deployment** — `vercel.json`, `api/index.js`, `server/routes.js`
   (the routes extracted out of `server/index.js` so both entry points share
   one implementation), plus the fixes that made it actually work: a
   read-only-filesystem guard in `server/cache.js`, and a `.gitignore` entry
   for `.vercel/`.
2. **The three standing bugs** — two fixed (modifier keys, `Back`'s hash
   rewrite), one measured fresh and formally recorded as accepted (the deep
   side case).
3. **The truncation bug found after the plan was written** — `March: Book
   Three` and 150 other books' descriptions were being cut short of content
   `cleanDescription()` already had in hand. Fixed at the source, and
   backfilled onto the already-generated data.
4. **Polish** — README rewritten with a doc map, `.env.example` documents
   Vercel's env vars, Open Graph/Twitter card tags + a real rendered image,
   a pure-static smoke test and an `/api`-returns-500 smoke test (both new,
   both green).

---

## 1. Vercel — what was built, what was proved, what wasn't

### The shape

```
vercel.json          static (index.html, src/**, vendor/**) + the one
                     function (api/index.js) + cache headers, via the
                     LEGACY `builds` array — see "the vercelignore trap"
                     below for why not the modern zero-config path
api/index.js         the function: an Express app that does nothing but
                     mount server/routes.js under /api
server/routes.js     NEW — /api/book and /api/list/:slug, extracted out of
                     server/index.js so it's the ONE implementation both
                     entry points share (PLAN-ARCH.md's rule, one level
                     lower than before)
server/index.js      now: static serving (local dev only) + mounts the
                     same router
server/env.js        ROOT computation, comment rewritten to explain what
                     was actually checked about Vercel (see below) — the
                     computation itself is UNCHANGED from before this phase
server/hardcover.js  fixture path now reads through ROOT instead of its
                     own import.meta.url — one less thing to keep in sync
server/cache.js      write() now swallows EROFS/EACCES — see "the read-only
                     filesystem" below
.gitignore           +.vercel/ (build output + project link, both
                     machine-specific, neither ever committed)
```

### Deploying it for real

```sh
npx vercel link      # once, to a real Vercel project
npx vercel env add HARDCOVER_TOKEN    # optional — see .env.example
npx vercel deploy --prod
```

No build step is introduced for local dev — `vercel.json`'s `builds` array
is read only by Vercel's own pipeline. `npm start` and opening `index.html`
directly are exactly as they were.

### The vercelignore trap — the biggest thing this phase found

**First attempt** used the modern `functions.includeFiles` config (no
`builds` array — the zero-config "Other framework" path `vercel.json`
would use by default). Running `vercel build` and inspecting
`.vercel/output/static/` showed **the entire repository root** had become
the public static bucket: `CLAUDE.md`, every `PLAN*.md`/`HANDOFF*.md`,
`server/*.js` (source), `tools/*.mjs` (including the enrichment scripts),
and `data/cache/*.json` were all sitting there, publicly servable. Nothing
in the plan or in Vercel's zero-config docs makes this obvious in advance —
it is what "no framework detected → treat the whole directory as public"
actually means once you have anything else in the repo besides the site.

**The fix that did NOT work**: a `.vercelignore` with `*` plus negations
for `index.html`/`src/**`/`vendor/**` (keeping `server/`, `data/cache/`,
`data/lists/` un-ignored so the function's build step could still see
them). Rebuilding produced **byte-identical** static output to not having
a `.vercelignore` at all — proved by diffing the two builds, not assumed.
`.vercelignore` is real (`@vercel/build-utils`'s `get-ignore-filter.js`
uses the standard `ignore` npm package, gitignore-compatible, negations and
all) but it is consulted for the **upload** step of a real `vercel deploy`,
not for local `vercel build`'s static-file collection. If you only ever run
`vercel build` locally, `.vercelignore` alone will not save you.

**What actually worked**: the legacy `builds` array, naming exactly three
static globs (`index.html`, `src/**`, `vendor/**`) and one function
(`api/index.js`). This is an **explicit allowlist**, not an ignore-list —
nothing not named becomes public, full stop. Rebuilding with this
`vercel.json` produced a static bucket containing exactly those three
things and nothing else — checked with `find .vercel/output/static`, not
assumed. `.vercelignore` was deleted; it was doing nothing.

**If you ever "modernise" this back to `functions.includeFiles`**, re-run
this exact check (`vercel build` + `find .vercel/output/static -maxdepth 1`)
before trusting it. Do not assume `.vercelignore` will save you a second
time either.

### `includeFiles`: string, not array — schema lies about what the runtime accepts

`@vercel/node`'s actual build code (`dist/index.js`) does
`typeof config.includeFiles === 'string' ? [config.includeFiles] : config.includeFiles`
— it clearly accepts an array. **The CLI's own config validator rejects an
array anyway**: `vercel build` fails with `Invalid vercel.json -
functions['api/index.js'].includeFiles should be string` the moment
`includeFiles` is an array, checked by actually running it, not by reading
the type declarations (which also just say `string`, contradicting the
runtime code that clearly branches on it not being one). Multiple globs
have to be one string, brace-expanded:
`"{data/cache/hardcover.json,data/cache/openlibrary.json,server/fixtures/**,data/lists/**}"`
— confirmed working (the underlying `glob` package is v8, which does brace
expansion by default). Don't waste a retry passing an array.

The include list is **narrower than "everything under data/cache/"** on
purpose: `server/cache.js` only ever reads `data/cache/hardcover.json` and
`data/cache/openlibrary.json` at request time (the namespace is the
filename). `data/cache/describe.json`, `harvest-attempts.json` and
`isbn-wanted.json` are read only by `tools/*.mjs`, never by the deployed
function — including them would have shipped ~2,300 extra files (the
gitignored-but-locally-present `data/cache/describe/` raw dump alone is
2,210) for zero runtime benefit. Checked by grepping `cache('...')` call
sites, not guessed.

### `vercel build` needs a token even to run locally — and a fake one is enough

Running the CLI with no credentials fails immediately (`Loading
teams… Error: The specified token is not valid`) even for `build`, which
has no obvious reason to phone home. A **fake local project link** gets
past this without any real account:

```sh
mkdir .vercel
cat > .vercel/project.json <<'EOF'
{"projectId":"prj_dummy0000000000000000000000000","orgId":"team_dummy00000000000000000000000","settings":{"createdAt":0}}
EOF
npx vercel build --yes --token dummytoken123
```

This is how everything in this section was actually run and checked in a
sandbox with no Vercel account — `.vercel/` is gitignored, so none of this
travels with the repo.

### What running `vercel build` locally actually proves — and what it does not

Checked, with a real local `vercel build` (not assumed):

- the config is valid and accepted
- `includeFiles`'s glob matches exactly the 80 files intended (2
  `data/cache/*.json` + 1 `server/fixtures/catalogue.json` + 77
  `data/lists/*.json`) — visible in `.vc-config.json`'s `filePathMap`,
  counted, not eyeballed
- the static bucket contains exactly `index.html`, `src/**`, `vendor/**`
  and nothing else
- the function's own code is **not** bundled into one file by esbuild for
  this runtime/config — `server/env.js`, `server/routes.js`, etc. all sit
  in the built function at their real repo-relative paths, comments
  intact, importable and readable as themselves. (This contradicted an
  assumption I made and then had to walk back — see "the bundling
  assumption that turned out wrong" below.)

**Not checked, and could not be, without a live account**: whether Vercel's
*deploy* step (as opposed to a local `build`) actually places the
`includeFiles`-matched content at the same relative path inside the
function at *request* time. Locally, `filePathMap` is a **logical** map —
`vercel build` does not physically copy `data/cache/hardcover.json` into
`.vercel/output/functions/api/index.js.func/`. That copy is asserted by
Vercel's own docs to happen as part of a real deploy, not observed here.

To get as close to proof as this sandbox allows, I built a **manual
simulation**: copied the built function's own directory, placed
copies of the exact `includeFiles`-matched files (`data/cache/hardcover.json`,
`data/cache/openlibrary.json`, `server/fixtures/catalogue.json`,
`data/lists/*.json`) at the same relative paths the `filePathMap` names,
set `VERCEL=1`, and ran the function's own exported Express app for real
with `app.listen()`. Then drove real HTTP requests at it:

```
GET /api/book?title=Piranesi&author=Susanna%20Clarke
  → {"isbn13":"9781526622419","pages":272,"year":2020,
     "description":"...","source":"live","via":"openlibrary"}
    (answered straight from data/cache/openlibrary.json — no network)

GET /api/list/booker
  → {"slug":"booker","source":"fixture", items: 586 entries}
    (answered from data/lists/booker.json)

GET /api/list/nonexistent-slug-xyz
  → HTTP 200 {"slug":"nonexistent-slug-xyz","items":[],"source":"miss"}
    (never a 404, per contract)

GET /api/book  (no query params at all)
  → HTTP 200, clean miss, no 500
```

This proves the module resolution, the fixture/cache file reads, and the
route contract all work correctly **once the files are where the
`filePathMap` says they should be**. It does not and cannot prove Vercel's
own deploy mechanics place them there — that is the one real deploy this
sandbox cannot run. **Do this before trusting the deployment**: `vercel
deploy` to a real project, then hit `/api/book?title=Piranesi&author=Susanna
Clarke` and confirm `source` isn't `miss`.

### The bundling assumption that turned out wrong

I initially assumed Vercel's Node builder would bundle every imported
module into one file (a common esbuild behaviour for serverless
functions), and rewrote `server/env.js`'s `ROOT` to prefer `process.cwd()`
under `process.env.VERCEL` for that reason. **The actual build output
proved this wrong** — files stay separate, at their real relative paths, so
the original `import.meta.url`-relative computation
(`path.dirname(fileURLToPath(import.meta.url))` one directory up) already
worked correctly under Vercel, unchanged. I reverted the `process.cwd()`
special-case rather than ship a "fix" for a problem that doesn't exist in
this build configuration — `ROOT` in `server/env.js` is textually identical
to what it was before this phase, only the comment changed, now describing
what was actually checked instead of what was assumed. If a future Vercel
CLI version *does* start bundling into one file, this would need
revisiting — re-run the `find .vercel/output/functions/` check above before
assuming either way.

### The read-only filesystem — a real bug this surfaced

`server/openlibrary.js`'s and `server/hardcover.js`'s `lookupBook()` call
`cache().set()` after every successful **live** answer, which calls
`server/cache.js`'s `write()` — an un-guarded `fs.writeFileSync`. On
Vercel's function filesystem (read-only outside `/tmp`), this throws
`EROFS`, and since it's called after the routes' own try/catch already
exited, nothing would have caught it — turning what should be a working
live answer into a 500, specifically **only** on Vercel, specifically
**only** when a lookup actually succeeds live (so fixture-mode testing,
including everything above, would never have exposed it). This is exactly
the class of bug `IMPLEMENTATION.md` §5's "it never 500s on an upstream
failure" promise exists to prevent, just from an unexpected direction
(the filesystem, not the upstream API). Fixed: `write()` now catches
`EROFS`/`EACCES` specifically and returns without persisting — the
in-memory answer this request needed is already correct (`.set()` updates
`s.mem` before calling `write()`), it just won't survive to the next cold
start. Given Vercel functions aren't guaranteed to reuse a container
between requests anyway, this cache was never going to be durable there —
the committed `data/cache/*.json` files (shipped via `includeFiles`) are
what actually carry answers forward on that platform, not a write from
inside the function.

---

## 2. The three standing bugs

### Bug 1 — keyboard shortcuts didn't guard modifiers

**Reproduction (before):** open the shop, press ⌘P (or Ctrl+P). The
browser's print dialog opens **and** the parcel overlay opens.

**Fix:** `src/js/main.js`'s keydown handler now computes one `noMods` flag
(`!e.metaKey && !e.ctrlKey && !e.altKey`) and gates `m`/`p`/`s`/`b` on it,
matching the guard `h` already had since phase 8.

**Reproduction (after) — confirmed no longer reproduces:**
```
plain "p" opens parcel: YES (expected)
Cmd+P still opens the parcel shortcut too: NO — fixed
```

### Bug 2 — `Back` rewrote the hash to the room you'd just left

**Reproduction (before):** open a book, Tab to the dock's Back button,
Enter, then Escape.
```
room after Back click: landing, hash: #/landing
book panel still open after Back: true
room after Back+Escape: landing, hash: #/glasshouse    ← MISMATCH
```
`closeBook()`'s default rewrites the hash to *the book's own room* — the
one just left — because `Back`'s click handler never called it, unlike
`goHome()` a few lines up in the same file, which already did, for the
same reason.

**Fix:** `dom.back`'s click handler now calls `closeBook(true)` before
`go(r.parent, 'out')` when a book is open, exactly mirroring `goHome()`.

**Reproduction (after) — confirmed no longer reproduces:**
```
room after Back click: landing, hash: #/landing
book panel still open after Back: false
room after Back+Escape: front, hash: #/front    ← MATCH
```
(Escape now falls through to its own "step back a room" branch, since
there's no book left to close — `front` is `landing`'s parent, so this is
correct, not a new bug.)

### Bug 3 — the far end of a deep side case is unreachable — RECORDED AS ACCEPTED

Phases 7 through 10 each independently found and re-confirmed this;
phase 10's handoff asserted "unchanged" **without** re-measuring against
the actual post-swap three.js geometry. This phase did:

**Fresh measurement** (`front` room, `shelf:right` pose, current build):
the case's own run is 342 units wide, world x=670, z from −1190 (far/deep
end) to −848 (near end) — same shape phases 7-9 measured pre-swap. At the
case's own `shelf:right` pose (camera at x=−190, y=395, z=−636), a raycast
from the camera to 11 evenly-spaced points along the run's top edge finds:
**t=0.0 through t=0.4 (the far 41% of the run, z −1190 to −1053) are
occluded by the back case's own geometry** (`case:back` group, hit at its
right edge x=590); **t=0.5 through t=1.0 (the near 59%) are unoccluded.**
A screenshot at this exact pose (taken, not described) shows seven real
spines readable in the near half and the back case's own side panel
filling the frame where the far half would be.

This is not a rendering bug — it is the room's own shape. The back case
(1180 wide) and the side case (342 wide, pushed back by two door bays)
share the same corner of the room, and there is no legal camera position
(inside the room, outside every case's own padded volume, with a clear
sightline) that sees the far end without standing where the back case's
own volume already is. `src/js/scene/poses.js`'s own `CLEARANCE` comment
block already documents the adjacent problem (camera ending up *inside*
the back case) in detail; this is the harder, unsolved half of the same
geometry.

**Decision: accepted, not fixed.** A real fix needs one of: a room-shape
change (moving the case, which four independent phases have now looked at
and none took), or a second named pose per case (`poses.js`'s rig currently
allows exactly one `shelf:<caseId>` pose — a "look at the far end"
alternate would need a new pose name and a new a11y/dock affordance to
reach it, which is a real feature addition, not a bug fix). Both are
architecture calls outside this phase's brief. Left as a known, measured,
accepted limitation — not a fourth unexplained carry-forward.

---

## 3. The truncation bug (found after the plan was written)

**The defect**: `server/openlibrary.js`'s `cleanDescription(raw, max=460)`
sliced to `max` characters *first*, then searched **only inside that
slice** for the last sentence-ending punctuation. If the raw text's next
real sentence boundary landed even a little past `max`, everything after
the slice point was silently discarded — including, for `March: Book
Three`, the only sentence that named the third book. The March extract was
597 characters; the old code cut it to 381, stopping mid-narrative on Book
One, even though the two remaining sentences (Book Two, then Book Three)
were sitting right there in the same string it already had in memory.

**The fix**: search for sentence-ending punctuation across the **whole**
string, and take the last one at or before `max + round(max/3)` (a ~153-
character grace window — "about one more clause"), not `max` itself. Only
falls back to the old mid-word-cut-plus-"…" behaviour when no boundary
exists at all inside that widened window (self-limiting: the worst case is
bounded by the same window, not unbounded). Verified against
`tools/describe.mjs selftest`'s existing fixtures (all 8 still pass) and
against the March text directly: the fixed function now returns the full
597-character extract intact, ending on its real final sentence, naming
Book Three.

**Backfilling the already-generated data** (not just future fetches):

| source | method | books touched |
|---|---|---|
| Wikipedia | re-ran the fixed `cleanDescription()` against the raw MediaWiki responses already cached at `data/cache/describe/wikipedia/*.json` — no network | **107** changed |
| Open Library | the raw text was never retained on disk (`server/openlibrary.js` only ever cached the post-clean result) — required a live re-fetch, `NODE_USE_ENV_PROXY=1`, for the 55 blurbs that showed the OLD algorithm's unambiguous failure signature (ending in the mid-word "…" cut) | **44** fixed live; 11 left as-is (see below) |
| **Total improved** | | **151** |

The 11 remaining ellipsis-ending blurbs (all Open Library) were checked,
not ignored: for 4 of them a fresh re-fetch returned different or unusable
raw text (kept the old, working blurb rather than overwrite with worse);
for the other 7, the fresh re-fetch returned the **same** raw text as
before, and it genuinely has no sentence-ending punctuation within budget
(e.g. `Virtual War` by Michael Ignatieff: a single 1,451-character block
whose first real full stop doesn't land until deep past any reasonable
grace window — checked by printing the raw text, not assumed). These are
correctly falling back to the word-boundary-plus-ellipsis path; there is
nothing left to fix without inventing text that wasn't in the source.

No book **lost** a description: `describe:report`'s totals are unchanged
before and after (1,291 with a blurb, 991 Open Library + 300 Wikipedia + 0
Google Books, out of 2,096 generated books) — only the *content* of 151
entries changed, verified by re-running the report, not assumed from the
diff.

One-off migration scripts used to do the backfill were deleted before
committing, per this phase's own instructions — the *fix* is permanent
(`server/openlibrary.js`), the *backfill* is a one-time data change already
baked into the committed `src/js/data/generated/*.js` files. Re-running
`tools/describe.mjs run`/`apply` from here forward will use the fixed
function automatically; no further migration is needed.

---

## 4. Polish

- **README.md** rewritten from scratch — what this is, how to run it (pure
  static, or with `/api`), how to deploy it to Vercel, and a doc map
  splitting the 20+ markdown files into "read these four" and "archive, for
  the reasoning."
- **`.env.example`** documents which env vars matter on Vercel
  (`HARDCOVER_TOKEN`, optional, server-side-only there too) and which don't
  (`GOOGLE_BOOKS_KEY` — build-tooling only, never read by the deployed
  function).
- **Open Graph / Twitter card tags** added to `index.html` — the shop had a
  title/description/favicon already; it had no social preview. `og:image`
  points at a real rendered PNG (`src/og-image.png`, 1200×630), made by
  writing a tiny throwaway HTML file and screenshotting it with Playwright
  (already a devDependency — no new one added), not hand-drawn and not a
  data URI (most link-preview crawlers don't rasterise SVG for `og:image`).
  The generator HTML itself was a scratch file and was deleted; regenerate
  by writing a similarly small HTML page (dark background, the door
  motif's palette, a row of generated-looking spines, the title/tagline
  text) and screenshotting it the same way if the copy ever needs to
  change.
- **Pure-static smoke test**: served the repo root with plain
  `python3 -m http.server` (no Node, no `/api` route at all) and drove a
  real walk — enter, change rooms, open a book, search, add to parcel —
  through Playwright. 8/8 checks pass, zero console/page errors.
- **`/api`-returns-500 smoke test**: a second, separate tiny Express
  server that serves the same static files but answers every `/api/*`
  route with a genuine HTTP 500, then the same walk plus opening a book
  that has no baked ISBN (the one path that actually calls
  `src/js/data/live.js`'s `fetchBookFacts()`). 8/8 checks pass — the shop
  opens, walks rooms, opens the book panel (still showing its baked
  content), and searches, all while a real 500 fires and is silently
  absorbed by `live.js`'s own `catch`/`!res.ok` handling. Both scratch test
  scripts were deleted after use, per this phase's instructions; the
  procedure is recorded here and in `PLAN-PHASE12.md` §2 if it needs
  re-running.

---

## 5. Verification summary

```
npm run qa
  → 67 checks, 0 failures, 0 console/page/request errors, 50-room sweep

grep -rn "HARDCOVER_TOKEN\|GOOGLE_BOOKS_KEY" src/ index.html vendor/ api/
  → zero hits (checked, not assumed)

pure-static walk (no Node, no /api): 8/8
/api-returns-500 walk (real 500s, real degrade): 8/8

vercel build (fake local project link, no real account): succeeds,
  config valid, static bucket = exactly index.html/src/**/vendor/**,
  includeFiles matches exactly the 80 intended files

simulated function invocation (files staged at their filePathMap paths,
  VERCEL=1, real app.listen()): /api/book and /api/list/:slug both answer
  correctly from the committed cache/fixture/list files
```

---

## What is still open

- **No real Vercel deploy has been run.** Everything in §1 above is proved
  as far as a sandbox with no Vercel account can prove it. The one thing
  that still needs a human with real credentials: `vercel deploy`, then
  confirm `/api/book?title=Piranesi&author=Susanna+Clarke` doesn't answer
  `source: "miss"`.
- **No real screen reader has ever been run against the a11y mirror.**
  Carried since phase 4. Every check so far is programmatic (names, roles,
  focus order) — `IMPLEMENTATION.md` §4.7's own warning that an axe pass is
  green on a page that is unusable has never actually been tested against.
- **The deep side case (bug 3) is accepted, not fixed** — see §2. A real
  fix is a room-shape or pose-model change, both architecture calls.
- **805 of 2,096 harvested books still have no description at all** —
  not a truncation issue, a coverage one. `DESCRIPTIONS-FEASIBILITY.md`'s
  numbers on this stand; nothing verifiable was found for these 805 across
  any of the three sources this project uses, and inventing one is exactly
  what this project's own rules forbid.
- **`og-image.png` is a first pass.** It reads fine and matches the shop's
  palette, but it was made in one sitting with no design iteration — worth
  a second look if the shop ever gets a real marketing push.

---

## Traps for whoever reads this next

- **`.vercelignore` does nothing for local `vercel build`'s static output
  selection.** Use the `builds` array's explicit allowlist instead. This
  cost real time this session — don't re-discover it.
- **`functions.includeFiles` must be a single (possibly brace-expanded)
  string, never an array**, despite `@vercel/node`'s own runtime code
  branching on `typeof … === 'string'` as if arrays were fine. The CLI's
  config validator rejects an array outright.
- **`vercel build` needs *a* token, even locally, even with no intent to
  deploy.** A fake `.vercel/project.json` + `--token anything` is enough —
  see the exact recipe above. Don't burn time trying to find a "local-only,
  no-auth" flag; there isn't one that gets past team-loading.
- **Local `vercel build`'s function output does not physically stage
  `includeFiles`-matched content inside the function folder** — only a
  logical `filePathMap` in `.vc-config.json`. Don't read "the file isn't
  physically there" as "the config is broken"; also don't read "the config
  validated" as "a real deploy will definitely work" — both directions are
  wrong without an actual `vercel deploy`.
- **This build's function code is NOT esbuild-bundled into one file** —
  don't assume it is (I did, and had to revert a "fix" for a problem this
  specific setup doesn't have). If a future Vercel version changes this,
  `server/env.js`'s `ROOT` computation is the one place that would need
  revisiting; the check to re-run is `find .vercel/output/functions/ -name
  '*.js'` and see whether your own source files are still there as
  themselves.
- **A live-mode cache write throws on Vercel's read-only filesystem.**
  Already fixed (`server/cache.js`), but if `write()`'s try/catch is ever
  "cleaned up," this comes back as an intermittent 500 that only shows up
  with a real `HARDCOVER_TOKEN` set on Vercel — fixture-mode testing will
  never catch it, which is exactly how it got this far unnoticed.
- **`data/cache/describe/` (raw Google/Wikipedia/Wikidata responses,
  gitignored) only exists in a sandbox that has actually run
  `tools/describe.mjs run`.** A fresh clone won't have it. The
  `cleanDescription()` fix itself needs nothing from that directory going
  forward — new fetches (`describe.mjs run`) call the fixed function
  directly — but redoing this phase's *backfill* of already-generated text
  a second time (if `harvest.mjs shelve` is ever re-run and wipes
  `src/js/data/generated/`) would need that raw cache to still be present,
  or a fresh `describe.mjs run` against a populated `GOOGLE_BOOKS_KEY`/live
  Wikipedia to regenerate it.
- **`PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` is
  still required** for every Playwright invocation in this sandbox (`npm
  run qa`, any scratch smoke test) — the default `chromium_headless_shell`
  path doesn't exist here. Never run `playwright install` to "fix" this.
