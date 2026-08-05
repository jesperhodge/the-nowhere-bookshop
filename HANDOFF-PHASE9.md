# Handoff — phase 8 done, phase 9 next

Phase 8 (the Dock, `PLAN.md` point 4, `IMPLEMENTATION.md` §3 row 8) is
**complete: planned, implemented, self-reviewed, adjusted, verified and
committed** as `324a38f` on `claude/nowhere-bookshop-phases-7-9-p4j8th`.
Tree clean, scratch scripts deleted. The plan of record is
`PLAN-PHASE8.md`.

Phase 9 is the last row: **harvest and shelve ~2,000 books**
(`IMPLEMENTATION.md` §6, `PLAN.md` point 7).

---

## Read this before you plan phase 9. It decides the whole shape of it.

**There is no Hardcover token in this sandbox, and there never was.** No
`.env`, no `HARDCOVER_TOKEN` in the environment, and `npm start` reports
`(hardcover: fixture)`. Everything below was measured this session, not
assumed:

| probe | result |
|---|---|
| `api.hardcover.app/v1/graphql`, no token | **401** `{"error":"Unable to verify token"}` — a real answer from Hardcover |
| the same, with `NODE_USE_ENV_PROXY=1` | identical 401 |
| `openlibrary.org/search.json` | **200**, full JSON |
| `openlibrary.org/works/OL…W.json` | **200**, 1,242-char description |
| `www.googleapis.com/books/v1/volumes` | **429** quota exceeded for the shared egress IP — unusable without a key |

Three things follow, and they contradict the older docs:

1. **The blocker is the token, not egress.** `IMPLEMENTATION.md` §8.2 says
   Node's `fetch` 403s with "Host not in allowlist" unless you pass
   `NODE_USE_ENV_PROXY=1`. **That is not true in this sandbox** — plain
   `node` reached both hosts. Keep using the flag (it is harmless and the
   note may hold on the owner's box), but do **not** read a 401 as a proxy
   problem. It is Hardcover telling you there is no token.
2. **`PLAN.md` point 7 says `openlibrary.org` is refused with a 403 at the
   proxy. It is not, any more.** That reopens PLAN.md's option (c) — but
   as a *build-time* fetch on the server, not the browser fetch PLAN.md
   framed it as, which means no runtime network dependency and no blank
   descriptions at read time. Open Library returns everything §6 step 2
   asks for: ISBN-13, page count, first-publish year, and a real
   publisher description. One search + one work fetch ≈ **740 ms**, so
   ~2,000 books is well under an hour paced politely.
3. So **§6 step 1 (harvest) and step 2 (enrich) are both runnable here** —
   just not through Hardcover. `WebSearch` works and returns current prize
   lists (checked against the Booker 2025 shortlist). If the owner would
   rather the snapshot came from Hardcover, that is PLAN.md option (a) and
   it has to happen on their machine; say so early rather than half-doing
   it.

### What is actually in the repo today, counted

* `src/js/data/enrich.js` exports **`ENRICH = {}`** — *zero* entries. The
  enrichment step has never been run against anything. The file's own
  comment says it is deliberately empty.
* **0 of the 409 books have an `isbn`.** Every buy/borrow/preview link is
  falling back to a title+author search right now.
* All 409 have both `note` and `blurb`.
* `server/fixtures/` holds **one** file, `catalogue.json`, with **4**
  books (Piranesi and three others). It is a smoke-test fixture, not a
  snapshot — fixture mode cannot enrich a shelf.
* `server/fixtures/lists/` **does not exist**, so `/api/list/:slug`
  reports a clean miss for every slug, as designed.
* `tools/harvest.mjs` does not exist. `tools/rooms/` is empty.
  `tools/hardcover.mjs` has `SKIP = new Set([])` and enriches
  `!b.isbn` books, i.e. all 409.

### `note` becoming optional — the three places, checked

`IMPLEMENTATION.md` §6 names `views/book.js`, "the search index in
`shop.js`" and `tools/qa.mjs`. Two of the three are right:

* `src/js/views/book.js:108` renders `${rich(book.note)}` unguarded.
* `tools/qa.mjs:94` requires `title, author, blurb, note` on every book —
  it will fail 2,000 times the moment phase 9 lands.
* **`shop.js` does not reference `note` at all.** Its search index (line
  ~68) already does `(b.blurb || '')`. Nothing to do there. Do not go
  looking.

---

## What phase 8 shipped

One commit, `324a38f`. `index.html`, `src/js/main.js`, `src/styles/ui.css`,
`README.md`, plus `PLAN-PHASE8.md`. **`src/js/scene/` and
`tools/preview-stage.html` are untouched** — phase 8 was the live CSS
build, phases 3–7 were the three.js stage, and the two still do not meet.

Deleted: `#dockDoors`, `showWaysOn()` + `waysTimer`, the `.godoor*` and
`.dock__doors` CSS, the mobile `order: 3` rule, and the dock click
handler. That was the dock's only `innerHTML` sink; `esc()` stays in use
elsewhere.

Added: `#btnHome` beside Back — `go('front', 'out')` from any depth, real
`[disabled]` in the front room, set in `paintChrome()` on **every** room
paint beside `dom.back.disabled`. Bound to `H`.

### Phase 8 decisions — do not re-open

* **Visible label "The Front Room", accessible name "Go to The Front
  Room".** The name contains the visible label word for word because
  WCAG 2.5.3 requires it. Change one, change both. Phrasing deliberately
  differs from Back's "Back to …" so that in a depth-1 room, where the two
  buttons do exactly the same thing, they still announce distinctly.
* **The label is static in `index.html`, not read from
  `ROOM_BY_ID['front'].name`.** If the front room is ever renamed the
  button lies. Judged not worth the plumbing; recorded so it is a choice
  and not an oversight.
* **`dock__btn--home` (and now `--back`) match no CSS rule.** The disabled
  styling is generic `.dock__btn[disabled]`. They stay as hooks. No rule
  matches nothing, which is the thing that actually rots.
* **Nothing replaces the chips.** The empty right half of the dock *is*
  point 4. The ways on are the doorways, the plan (M), search (/) and the
  shelf list (S).

### Traps phase 8 paid for

* **`pointer-events: none` on a disabled button is not "disabled", it is a
  hole.** The inherited `.dock__btn--back[disabled]` rule had it. Measured:
  `document.elementFromPoint()` at the centre of the dimmed Back button
  returned `DIV.stage`, not the button — at 1280×900 *and* 900×620. A real
  `[disabled]` button swallows the click by itself. The rule is now
  `.dock__btn[disabled] { opacity: .32; cursor: default }` with the hover
  rule narrowed to `:hover:not([disabled])` — which is the only thing
  `pointer-events: none` was buying. Latent rather than live today
  (`.stage` has no click handler; the room's listener is on `#room`), but
  the dock is painted over the room and phase 9 fills the room.
* **Disabling the control you are standing on drops focus to `<body>`.**
  Press Enter on Back in a depth-1 room and Back disables itself under
  your finger. Pre-existing; the home button would have doubled it.
  `setDisabled()` hands focus to `#btnShelf` first. Both back controls go
  through it.
* **`closeBook()` rewrites the hash to *the book's* room**, so any
  navigation that leaves an open sheet behind leaves the address bar
  pointing at a room you are not in. `goHome()` calls `closeBook(true)`
  first. **The Back button still has this bug** — deliberately not fixed,
  it is outside point 4 and "Back still does what it did" was a
  requirement. Reproduce: open a book, Tab to Back, Enter, then Escape.
* **`h`/`H` checks `metaKey/ctrlKey/altKey`; `m`, `p`, `s`, `b` do not.**
  So ⌘P today opens the parcel *and* the print dialog, ⌘S the shelf *and*
  Save. Inherited, not copied. If you ever normalise them, do it to all
  five at once.
* `go(id, dir)` early-returns when `state.room === id`. That is not a
  substitute for a `disabled` state and never was.

### `fronttable` — `HANDOFF-PHASE8.md` is wrong about this

It says the dock's ways-on list was "the only place `fronttable` shows up
as a walk-to destination". Checked in the browser: **it is not.**
`scene.js:346 buildTablePortal()` puts a `.door3d.table3d` carrying
`data-go="fronttable"` in the front room, and clicking it still travels
there. It is also still listed in the shelf overlay (`main.js:466`, raw
`room.children`) and in the plan (`views/map.js:23`, same). Only the
dock's route to it went. **Nothing was added to compensate, deliberately** —
`fronttable` ceasing to be a room is point 10's swap-over, and that is
still nobody's phase.

---

## Carried forward — phase 7's open items. Do not let these fall off.

The first one is phase 9's problem specifically.

* **In the 3 table rooms the table occludes the bottom shelf row from the
  `shelf:back` pose — and that stops being cosmetic when phase 9 lands.**
  Camera at z −58.5, table spanning z −630…−330, x −535…−65, so sight
  lines to the left of the case's bottom row pass through it. Only the
  centre sight line is clamped, on purpose (clamping the whole case would
  put the camera 280 units from a 1180-wide case, which is worse). Today
  every occluded book is filler, so nobody notices. **Fill the shelves
  and those become real books that cannot be seen.** Fixing it means
  moving the table or stepping the pose around it — a design call, not a
  clamp. This is in the **three.js** build (`src/js/scene/poses.js`), so
  it bites whenever the swap-over happens, not the day the data lands.
* **`a11y.js:85` puts `role="listitem"` on its `<button>`s**, overriding
  the implicit `button` role — a screen reader announces list items, not
  buttons. Real defect, three.js build, untouched since phase 4. The fix
  is a wrapper element carrying `listitem`, not the button. Every button
  does have a non-empty accessible name (34/34 in `front`).
* **The far end of a `used === 2` side case cannot be seen from any usable
  pose.** It sits at z −1204 behind the back case's right end; seeing all
  of it needs the camera 138 units from a 342-wide case. The pose sees
  the near half well and that is what the room shape allows.
* **No real screen reader has ever been run on this project** — phases
  4–8 all asserted names and roles programmatically instead. An axe pass
  is green on a page that is unusable; `IMPLEMENTATION.md` §4.7 says so
  explicitly. Still outstanding.

Also still true and relevant to phase 9's node budget: `PLAN.md` point 7
estimates ~86 book nodes per room instead of ~45, roughly tripling face
count unless shelved books drop to 3 faces. Measured room transition
today (live CSS build, `tools/qa.mjs`): **median 1091 ms, worst 1255 ms,
heaviest room `front` at 320 nodes.** That is the number to compare
against after shelving, and it is already flagged as needing watching.

---

## Environment — this sandbox, corrected

* `node_modules/` exists. Node v22.22.2.
* **Playwright 1.62 wants Chromium build 1234; `/opt/pw-browsers` has
  1194.** Never run `playwright install`. Pass
  `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`
  to `chromium.launch()`. `tools/qa.mjs` calls bare `chromium.launch()`
  and therefore **cannot run as committed** — copy it, sed the path in,
  run the copy, delete the copy. Do not edit the tracked file for this.
* **Serve with `npm start` (Express, :8099). Check what actually answers
  before you trust a run.** This cost time this session: a
  `python3 -m http.server 8099` left running by phase 7 was still holding
  the port, `npm start` printed its banner and then died, and an entire
  62-assertion pass ran against the static server. The only symptom was a
  single console 404 on `/api/book` — which is exactly the route Express
  exists to serve. One command tells you:
  `curl -sI http://127.0.0.1:8099/ | grep -i server` → `SimpleHTTP/0.6
  Python/3.11.15` is the wrong answer. Also start it with
  `nohup npm start &`; backgrounding inside `( … & )` did not survive.
* Scratch scripts must live at `tools/_scratch-*.mjs` — Playwright only
  resolves inside the repo tree. Delete before committing.
  `tools/qa-report.json` is gitignored but is still an artefact you
  created; clean it up too.
* `git push` returns **403 — read-only.** The local commit is the record.
  No PR. (`IMPLEMENTATION.md` §9: the owner pushes.)
* **Never sort `.gitignore`** — last-match-wins, and sorting hides
  `.env.example`. There is a comment in the file saying so. Inherited,
  still true, still one line away from costing someone an afternoon.

## Verified this session

Playwright against `npm start`, fresh context per viewport, settle on a
real condition and **never a fixed timeout**: `state.room === id` (set at
the very end of `go()`'s `paint()`, behind a 300 ms outgoing animation),
then the `#room > .travel` node's **own** animations all
`playState === 'finished'` — not `{subtree: true}`, which catches the
grain/rain/`breathe` loops that never finish.

**62/62 assertions, 0 console errors, 0 page errors, 0 non-2xx
responses.** `tools/qa.mjs` also re-run: clean, 409 books, 50 rooms, all
26 ART entries inside their viewBox, no console or page errors.

* Chips gone: no `#dockDoors` node, no `.godoor`/`.dock__doors` nodes, and
  **no stylesheet rule mentions either** (walked `document.styleSheets`).
  No `dock` selector matches nothing.
* Home returns to `front` from depth 1, 2, 3 and from `fronttable`; hash
  is `#/front` each time; disabled again on arrival each time.
* **Direction is `out` every time** — a `MutationObserver` on `#room`
  recording only *newly added* classes saw `["go-out","arrive-out"]`,
  never `*-in`. (Recording the whole `classList` instead reports last
  trip's `arrive-in`, because a `.travel` node keeps its arrive class for
  life. That produced four false failures before it was fixed.)
* Disabled state tracks the room per paint, not once at startup:
  `front:off oak:on front:off saltline:on front:off`, then **all 50 rooms
  swept — home disabled iff `front`**, back disabled iff no parent.
* Back unchanged: label names the parent (read from data, not guessed),
  goes exactly one level up, still travels outward, twice in a row.
* Keyboard: dock order Back → Home → shelf → bell; Enter travels; focus
  lands on `#btnShelf` rather than `<body>` when either control disables
  itself; `getByRole('button', { name: 'Go to The Front Room' })` resolves
  to exactly one node; visible text is `The Front Room`; the attribute is
  real `disabled`, not `aria-disabled`.
* `H` travels and travels outward; is inert in `front`; does not fire
  while typing in search; **Ctrl-H and Alt-H do not travel**; with a book
  open it closes the sheet and the hash ends at `#/front`, not
  `#/oak/jonathan-strange`.
* Disabled buttons hit-test as themselves (`elementFromPoint` → the
  button); clicking one changes nothing; dimmed to `opacity: .32` with
  `pointer-events: auto` and `cursor: default`. Hover, sampled only after
  the .2s transitions settle: enabled lifts to
  `rgb(239,227,205)` / border `.55` / `translateY(-2px)`; disabled matches
  `:hover` but keeps every resting value.
* `fronttable` still walk-to-able via the table portal, still in the shelf
  overlay, still in the plan.
* Desktop 1280×900 and phone 390×740: no horizontal overflow, dock
  children are exactly the four buttons, home on screen and working on
  the phone (the dock wraps to three rows there, as it did before).
* `prefers-reduced-motion: reduce`: home still arrives, still disables.
* Screenshots judged by eye, not just asserted: the front room now reads
  as five lit doorways with signs plus a table, and a dock holding two
  dimmed back controls, the shelf and the bell.

## Workflow deviation, recorded honestly

`CLAUDE.md` splits Opus (plans, reviews, handoffs) from Sonnet sub-agents
(diffs). **No Agent/Task tool was available in this harness**, so the
implementation was done by the same agent that planned it — the same
deviation phase 7 recorded. The discipline was kept: `PLAN-PHASE8.md` was
written before any edit, and the review was a separate deliberate pass
over the whole diff afterwards. It earned its keep — four of the items
above (`pointer-events` pass-through, focus dropped to `<body>`, the
`closeBook()` hash rewrite, modifier keys on `H`) were found in that pass
and none of them were in the plan. A session with the Agent tool should
go back to the split.
