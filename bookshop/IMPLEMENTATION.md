# Implementation brief — iteration 2

Written for a fresh session with no prior context. Read this file first, then
`PLAN.md` (the diagnosis — what is broken and why, measured) and
`PLAN-ARCH.md` (the decision — three.js, the server, the API routes).
`HANDOVER.md` is iteration 1 and is still accurate about the data and the tools.

Do not re-derive the diagnosis. It was measured in a browser, the numbers are in
`PLAN.md`, and re-measuring costs a day.

---

## 0. The project in six lines

A curated 3D bookshop. Fifty rooms in a tree, 409 books, all hand-picked from
prize lists — never bestsellers. You walk through lit doorways, pull a book off
a shelf, read a blurb and a curator's note, and buy from an independent seller.
Everything is a static folder plus ES modules; there is no build step and that
is a deliberate value, not an accident.

The brief that matters: *"I had no idea this existed"* is the feeling. The
curator's note is the product.

## 1. Environment

* Working dir `/home/user/the-nowhere-bookshop`. Branch
  **`claude/nowhere-bookshop-polish-gki72l`**. Commit there; do not create others.
* **`git push` returns 403.** The owner takes the work as a zip and pushes it
  themselves. Commit anyway — commits are the record — but do not burn retries
  on the push.
* Serve with `python3 -m http.server 8099` from the repo root (until the Express
  server exists, then `npm start`).
* Playwright is installed but `package.json` is **gitignored**, so scripts that
  `import { chromium } from 'playwright'` must live inside the repo tree
  (`tools/`) to resolve. Chromium is at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Never run
  `playwright install`.
* Outbound HTTPS goes through a proxy. `api.hardcover.app` **is now reachable** —
  the owner set the environment's network access to Full.
* **Node's built-in `fetch` ignores the proxy.** `curl` works, `node` gets a flat
  `403 "Host not in allowlist"` that reads exactly like an auth failure. Run
  `NODE_USE_ENV_PROXY=1 node …`. This is the single most expensive trap in the
  repo — it cost the previous session the entire enrichment step. See §8.2.
* The Hardcover token is in **`.env`** at the repo root, gitignored, as
  `HARDCOVER_TOKEN`. Never print it, never put it on a command line, never write
  it anywhere else. Verified working: `{ me { username } }` → `jesperh`.
* Rate limit 60 req/min. Pace at 40.

## 2. Inherited traps

From iteration 1, still true:

* **Never sort `.gitignore`.** It is last-match-wins; sorting puts
  `!.env.example` above `.env.*` and silently ignores the template. There is a
  comment in the file saying so.
* `git check-ignore` exits 0 on *any* rule match including negations, so it
  reports `.env.example` as ignored when it is fine. Use `git status`.
* A screenshot taken before the room settles is a lie. The old QA waited a fixed
  800ms; the arrival animation took 1.2–1.9s. Anything you inherit from before
  iteration 1 is at the wrong scale.

New, from this iteration:

* **`three.module.js` imports `./three.core.js` by a relative path.** The import
  map never sees it. Both files must sit together in `vendor/three/build/`.
* `filter`, `opacity`, `mask` and `backdrop-filter` are *grouping properties*:
  applying one forces `transform-style: flat` on the subtree. This is what broke
  the table and the door signs. It stops mattering for the scene once the scene
  is WebGL, but `book.js` still has a CSS-3D "hold the book" object in the DOM
  panel — **do not put a filter on `.hold` or `.hold__obj`.**
* The CSS world is **y-down** (`y: -470` is the ceiling, `+470` the floor).
  three.js is y-up. See §4.1 — this will bite if it is not converted in exactly
  one place.

## 3. Order of work

Each phase ends in a commit and a working shop. Do not start a phase before the
previous one runs.

| # | phase | points | depends on |
|---|---|---|---|
| 1 | Express server, fixtures, client fallback | 7 (data) | — |
| 2 | `props.js` viewBox fixes | 9 | — |
| 3 | Stage skeleton: renderer, camera, one room shell, real lights | — | — |
| 4 | Cases, books, spine atlas, raycast, a11y mirror | 5, 8 | 3 |
| 5 | Doorways with real openings; signs on hover | 2, 3 | 3 |
| 6 | Props as textured planes | 9 | 2, 3 |
| 7 | Tables and camera poses | 1, 6, 10 | 4 |
| 8 | Dock | 4 | — |
| 9 | Harvest and shelve ~2,000 books | 7 | 1 |

**Phase 3 is a checkpoint.** The shop's warmth is currently made of CSS
gradients. Real lighting should beat that, but if the skeleton looks like grey
plastic, stop and say so before phases 4–7 depend on it. Phases 1, 2, 8 and 9
are all valid on the current CSS code if the substrate move is abandoned.

## 4. The scene

### 4.1 Coordinates — read this before writing any geometry

The CSS world, which all the existing data is expressed in:

```
x  -840 … +840     (1680 wide)
y  -470 (ceiling) … +470 (floor)     ← y grows DOWNWARD
z  -1200 (back wall) … 0 (where you stand)
```

The three.js world: keep the same units (1 unit = 1 CSS px) and the same x and
z, but **flip y** so it grows upward, floor at `y = 0`:

```
threeY = 470 - cssY        // ceiling 940, floor 0
```

Put that in one exported function and use it nowhere else twice. Then:

* Rewrite the `SLOT` table (currently `scene.js` lines ~49–68) in the new
  convention directly. Do not adapt it.
* `rooms.js` prop entries carry `dy:` offsets in the **old** convention — about
  fifteen of them, all positive-is-downward (`dy: 290`, `dy: -130`, …). Negate
  each one as you port, and grep for `dy` afterwards to confirm none is missed.

### 4.2 Camera

To reproduce the current framing exactly: CSS used `perspective: 1500px` with
`perspective-origin: 50% 45%`. The equivalent is a camera at `z = +1500`
looking at the room centre with

```
fov = 2 * atan(470 / 1500) ≈ 34.6°
```

Start there so the port can be compared against the old screenshots, then tune.

### 4.3 Poses (points 6, 8, 10)

A rig with named poses, tweened:

* `room` — the default above.
* `shelf:<caseId>` — square-on to a case, close enough that a 22px spine reads.
  Works for the back wall and both side walls.
* `table:<id>` — looking straight down at a table.

Wheel and pinch dolly between `room` and the nearest shelf pose. Clicking a case
or a table goes to its pose. Escape steps back. `prefers-reduced-motion` jumps
instead of tweening. Poses are transient state — **no route change**, no entry in
`history`.

### 4.4 The shell

Walls, floor and ceiling as `THREE.Shape` → `ExtrudeGeometry` with
`bevelEnabled: false`. Doorways are `THREE.Path` holes pushed onto
`shape.holes`, wound opposite to the outer contour, with `absarc()` for the arch
top. Extruding gives the inner reveal faces for free — that is the whole point,
and it is what makes points 2 and 3 real rather than painted.

The wall treatments in `themes.css` (`k-panel` wainscot, `k-glass` glazing,
`k-void` stars, `k-brick`, …) port as **textures**, not as re-invented geometry.
Most are already SVG data-URIs or repeating gradients; render each to a canvas
once and cache per kind. Note that three of the five faces have never rendered
in the current build, so there is no reference screenshot for what `k-panel` on a
side wall is supposed to look like — you are implementing the intent, not
matching a picture.

### 4.5 Lighting

One warm `PointLight` per lamp prop, positioned where the lamp is, plus a low
ambient. Distance/decay tuned so the side walls fall off toward the camera
rather than to black. This is the thing that finally makes the "cosy interior"
real: it is currently faked with radial gradients on planes that turned out not
to be drawn at all.

Keep the DOM `.grain` and `.vignette` overlays on top of the canvas exactly as
they are. They already work and they carry a lot of the mood.

### 4.6 Books

Measured facts, do not re-measure:

* Every room's back-wall case is **exactly 2 rows**. Row usable width **1152px**.
* Average spine width **22.1px**; a row packed edge to edge holds **43 books**.
* Rows currently sit at ~55% occupancy. 409 real books, **2000 filler spines**
  (exactly 40 per room, regardless of that room's real count).
* Side cases: `--cw` 370px (7 rooms) or 640px (39 rooms), 2 rows each, usable
  `cw − 68` → **11 or 22 books per row**. Four rooms have no side case at all:
  `landing`, `bonelibrary`, `understory`, `longtable`.

Build one **canvas2d texture atlas per room** holding every spine — ground
gradient, head/tail bands and the title, all composited together, because
`spineStyle()` in `covers.js` already produces them as one thing. Books are
individual meshes sharing that one material; that keeps per-book hover animation
trivial. Merge into a single geometry only if profiling asks.

Re-render the atlas at higher resolution when the camera enters a `shelf` pose —
that is the only time the resolution is visible, and it is the answer to point 8.

Do **not** reach for `troika-three-text`. The reasoning is in `PLAN-ARCH.md`;
short version, a spine is one image and troika means five vendored packages or a
runtime CDN request.

Delete `spineRun()` from `covers.js` when the side shelves become real. Keep
everything else in that file — the procedural jacket generator is the best thing
in the repo and its SVG output becomes a texture.

### 4.7 Accessibility — not optional

The current design's one real virtue, stated at the top of `scene.js`: books are
real focusable buttons, so the shop works with a keyboard and a screen reader. A
canvas has none of that.

`src/js/scene/a11y.js` maintains a visually-hidden but focusable list mirroring
the room — every book, doorway and table as a real `<button>` carrying the
aria-label it has today, in shelf order. Focusing one moves the camera to it and
highlights it in the scene; activating one does what a click does. Pointer input
uses raycasting; keyboard and AT use the mirror.

Test it with an actual screen reader, not an audit tool. An axe pass will be
green on a page that is unusable.

No-WebGL fallback: on context-creation failure, open the existing "The shelf"
overlay instead of the stage and say why. Search, plan and shelf together are
already a complete text UI for the whole shop.

## 5. The server

```
server/index.js        express: static + /api
server/hardcover.js    the API client — ONE implementation
server/cache.js        disk cache under data/cache/ (committable = the snapshot)
server/fixtures/*.json recorded responses, used when there is no token
server/mcp.js          the same client exposed as an MCP tool
```

* Token read from `.env` **server-side only**; it must never reach the browser.
  Hardcover's own terms require this.
* `GET /api/book?title=&author=&isbn=` → `{isbn13, pages, year, description, source}`
* `GET /api/list/:slug` → a harvested award list
* Three modes, always reported in `source`: `live` · `fixture` · `miss`.
  **It never 500s on an upstream failure** — it falls back and says which.
* `npm start` = live if `.env` has a token, fixtures if not.
  `npm run mock` = fixtures even with a token.
* Opening the site through any static server with no Node still works, on baked
  data only.

`package.json` must become **tracked** (it is currently gitignored). Keep
`node_modules/` ignored. Vendor three.js under `vendor/three/` and commit it, so
viewing the shop still needs no install.

Fold `tools/mock-hardcover.mjs` into `server/` as fixture mode, and make
`tools/hardcover.mjs` a client of `server/hardcover.js` rather than a second
implementation of it. There are currently two divergent code paths to the same
API.

The exact working GraphQL queries are in §8 — they were established against the
live API this session, so do not guess them.

## 6. Data and curation (phase 9)

Target: replace all 2000 filler spines with real books, ~2400 total.

Decided with the owner: **no hand-written blurbs, notes or tags for new books.**

1. **Harvest** title/author pairs from prize lists and critics' polls — Booker,
   International Booker, Women's Prize, Pulitzer, National Book Award, Hugo,
   Nebula, World Fantasy, Costa, Goldsmiths, Republic of Consciousness, CWA
   Daggers, Wainwright, Baillie Gifford, Griffin, T. S. Eliot, Eisner — each
   mapped to the rooms it belongs in. **Provenance is the point**: a book's
   `won`/`cited` then comes from the list it was drawn from, not from model
   memory, which retires the accolade-accuracy risk that has been top of the
   backlog since iteration 1.
2. **Enrich** via the server: ISBN-13, pages, year, publisher description.
3. **Shelve.** Generated entries get title, author, year, pages, isbn, the
   accolade, and a description. No `note`, no hand-written `tags`, no `first`.

The existing 409 keep their curator's notes and become a visible tier — the
shopkeeper's picks — rather than being diluted.

**`note` must become optional** throughout: `views/book.js`, the search index in
`shop.js`, and `tools/qa.mjs` all currently assume it is present.

**`first` lines stay held back** unless a book also has `firstSource`. None do.
That rule exists because a misquoted opening presented as the real one
discredits the whole shelf. Do not relax it.

## 7. QA

`tools/qa.mjs` asserts DOM structure (`.bk[data-book]`, `.travel` transform
settling) and will not survive the move. Rewrite it to check:

* the canvas exists and a room renders (screenshot diff against a baseline)
* the a11y mirror has one focusable control per book, door and table
* keyboard: tab to a book, Enter opens the panel
* every camera pose is reachable and Escape returns to `room`
* every `ART` entry draws inside its viewBox (§ Finding C in `PLAN.md`)
* no `filter` on any node with `transform-style: preserve-3d`
* zero filler spines once phase 9 lands
* the data checks that already exist (duplicate ids, missing fields, link hosts)
  — with `note` moved from required to optional

Keep the settle-before-screenshot discipline: wait for a real condition, never a
fixed timeout.

## 8. Hardcover: verified against the live API

All of this was run against the live endpoint this session. Do not guess it and
do not re-probe it.

### 8.1 The queries in `tools/hardcover.mjs` are correct

`HANDOVER.md` warns that Hardcover's `search` is in beta, that "the shape has
moved", and that you should "expect to fix `hits()` first". **That was a
misdiagnosis.** `SEARCH_Q`, `BOOK_Q`, `hits()` and `scoreMatch()` all work
unmodified against the live schema. Do not rewrite them.

What actually blocked the previous session was environmental — see 8.2.

### 8.2 Node's `fetch` does not honour the proxy

`curl` reads `https_proxy` natively and works. **Node's built-in `fetch` does
not**, and fails with a flat `403 "Host not in allowlist"` that looks exactly
like a token or policy problem. That is why a curl smoke test passed while every
node-based call failed, and why the API was written off as blocked.

Fix (Node ≥ 22.21; this box is v22.22.2):

```
NODE_USE_ENV_PROXY=1 node tools/hardcover.mjs enrich
```

Put this in `package.json`'s scripts and in `tools/README.md`. If a call 403s
with "Host not in allowlist", check this **before** suspecting the token.

### 8.3 Search

```graphql
query Find($q: String!) {
  search(query: $q, query_type: "Book", per_page: 5, page: 1) { results }
}
```

Results path is **`data.search.results.hits[].document`** — Typesense-shaped,
but the key is `document`, not `_source`.

Per-hit fields: `id` (**a string — `Number()` it before using as `Int!`**),
`title`, `author_names[]` (includes translators), `contributions[].author.{id,name}`,
`release_year`, `release_date`, `pages`, `description`, `slug`,
`isbns[]` (ISBN-10 and -13 mixed across every edition, unattributed — not usable
as "the" ISBN; use 8.4).

`search.ids[]` is also returned. **Do not use it.** It is ranked by text
relevance, not correctness:

| query | raw rank 1 | the book we want |
|---|---|---|
| `Piranesi Susanna Clarke` | a 13-page study guide by William J. Collopy | rank 2 |
| `Stoner John Williams` | a biography *about* the novel | **rank 4 of 4** |

`scoreMatch()` recovers all three test cases (exact title 100 + author surname
50 = 150, against 20 or −10 for the decoys). **Never simplify to `ids[0]`.**

### 8.4 Book detail, and the ISBN

```graphql
query Book($id: Int!) {
  books(where: { id: { _eq: $id } }, limit: 1) {
    id title slug pages release_year description
    default_physical_edition_id
    default_physical_edition {
      id isbn_13 isbn_10 pages publisher { name } language { language }
    }
    contributions { author { name } }
    editions(limit: 25) {
      isbn_13 pages release_year reading_format_id language { language }
    }
  }
}
```

`books` carries title, year, canonical `pages`, description. `editions` carries
`isbn_13`, its own `pages`, publisher and language.

**`default_physical_edition` is Hardcover's own canonical pick** and is available
in the same round trip at no extra cost. Prefer it when it has an `isbn_13`, and
fall back to the existing `pickEdition()` heuristic only when it does not. For
Piranesi the heuristic happens to agree — by a margin of 38.65 to 38.6, which is
luck rather than design.

The depth-limit comment in `tools/hardcover.mjs` ("Hardcover's query depth limit
is 3") did not reproduce: `books → default_physical_edition → publisher` is depth
3 and resolves fine. Treat the comment as unverified rather than as a constraint.

### 8.5 Two data gotchas

* `release_year` is the **original-language** year. *The Employees* returns 2004
  (Danish), not 2020 (English translation). `scoreMatch()` penalises year
  mismatch by up to 20 points, so a harvested list holding English publication
  years will drag scores down on translated titles. Weight year lightly.
* `author_names[]` includes translators — Olga Ravn's entry lists Martin Aitken.
  Good for matching, wrong if displayed as the author.

### 8.6 Rate limiting

The API returns **no rate-limit headers at all** — no `X-RateLimit-*`, no
`Retry-After`. The 60/min limit is enforced silently. There is nothing to adapt
to, so the existing client-side throttle (`MIN_INTERVAL_MS`, 50/min) plus the
429 backoff in `gql()` is the only defence. Keep both.

## 9. Things not to do

* Do not create a pull request. The owner pushes.
* Do not relax the `first`/`firstSource` rule.
* Do not reduce the number of shelves or placeholder slots to make phase 9
  smaller. The owner was explicit.
* Do not put the Hardcover token in the browser, in argv, or in the repo.
* Do not re-run the diagnosis in `PLAN.md`.
* Do not add a bundler. No build step is a project value.
* Do not delete the DOM UI. Only `scene.js`, `scene.css` and `themes.css` go.
