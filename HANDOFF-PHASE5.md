# Handoff — phase 4 done, phase 5 next

Read `IMPLEMENTATION.md` first (§3's order-of-work row 4: "Cases,
books, spine atlas, raycast, a11y mirror", points 5 & 8; §4.6 Books;
§4.7 Accessibility), then `PLAN-ARCH.md` ("Books at scale" and "Why a
canvas atlas and not an SDF text library"). `HANDOFF-PHASE4.md` (phase
3) is still accurate about the stage/shell/lighting substrate this
phase builds on top of — nothing in `stage.js`/`shell.js`/`coords.js`/
`textures.js` was touched this session.

This session did **only phase 4**: real 3D bookcases (back wall + both
side walls), a per-room canvas2d spine atlas, individual book meshes,
pointer raycasting, and the accessibility mirror. Nothing in
`src/js/scene.js`, `scene.css`, `themes.css`, `main.js` or
`index.html` was touched — the live site still runs the CSS-3D scene
exactly as before. The new code lives entirely under `src/js/scene/`
and is only reachable via the standalone preview harness; nothing
wires it into the shop yet.

Committed as `1263145`, "phase 4: real 3D cases, books, spine atlas,
raycast, a11y mirror" — 5 files, no push (not asked for).

## What changed

```
src/js/scene/books.js       ~520 lines   cases, books, the atlas
src/js/scene/interact.js     ~90 lines   raycast + the shared controller
src/js/scene/a11y.js        ~100 lines   the DOM mirror
tools/preview-stage.html    extended     books/mirror wired into the phase-3 harness
server/index.js             +6 lines     /vendor static route
```

### `src/js/scene/books.js`

`buildRoomBooks(room, books)` → `{ group, entries, atlas }`. `entries`
is real books only, in shelf order — exactly what both the a11y
mirror and the raycaster need, and (per a comment in the file) it
comes out in that order for free because filler never gets pushed
into it and side cases never hold real books.

**Geometry model** — one thing to internalize before touching this
file: a book's local **+z face is its spine**, matching `scene.css`'s
`.bk__spine { transform: translateZ(bd/2) }` exactly. A case's local
frame is `x: 0..w` (left→right along the shelf), `y: 0..ch`
(floor→top), `z: 0..depth` (wall→room). Books need **no rotation of
their own** — only the case *group* is rotated per wall (`rotY = 0`
back, `+90°` left, `-90°` right), and every book inherits that
rotation for free, spine correctly facing into the room on every
wall. I did the Y-rotation matrix algebra by hand (in the file's
comments and, more thoroughly, in my own scratch work this session —
not committed) to confirm `local +z → world +x` for the left wall and
`local +z → world -x` for the right, and cross-checked the resulting
anchor-z conventions against `scene.js`'s `addSideCase()` (`z0` for
left, `z0 - w` for right) — they matched, which was a good sign the
derivation was right rather than coincidentally plausible. **If phase
5's doors ever seem to open into the wrong side of a case, or a future
phase adds a third case orientation, re-derive this from the comment
block at the top of `buildCaseGroup()` rather than trusting muscle
memory** — it's exactly the kind of handedness mistake `coords.js`'s
header warns about.

**Row packing is ported, not reinvented.** `planBackRows()` mirrors
`scene.js`'s `fillRow()`/`buildFiller()` line-for-line in spirit: real
books split evenly across exactly 2 rows (measured fact, not
`scene.js`'s live dynamic `rows = min(3, max(2, ceil(n/9)))` — the
brief says every room's back case is 2 rows and I trusted that over
the dynamic formula), each row flanked by filler up to a **20-filler
cap**, which is *why* the whole shop nets out to 40 filler/room (2
rows × 20) — I'd read that as a design target before tracing the
actual loop condition (`pad.length < 20`) and realized it's a hard cap
that happens to average out to ~55% occupancy, not an occupancy target
computed some other way. `planSideRows()` packs filler edge-to-edge
(spineRun()'s own `x += w + 1` gutter) with no 20-cap, since a side
case never has real books to flank — see "known simplification" below
for why that's not a literal count-match to the old `spineRun()`.

**`sideCaseSpec()`** derives whether a room has a usable side case (and
how wide) from the same `BAY`/near/far/`SIDE_MAX_W`/`SIDE_MIN_W`
numbers `scene.js`'s `addSideCase()` uses, plus the same
trunk/column/monolith "tall" check. I did **not** hard-code "these
four rooms have no side case" even though IMPLEMENTATION.md states it
as a measured fact — I let the derivation produce that result and then
checked it: a Playwright sweep of all 50 rooms (see "Verified this
session") confirmed `landing`, `bonelibrary`, `understory`, `longtable`
are exactly the four that come out with only a `case:back` child and
no `case:left`/`case:right`, matching the brief. This means the
behavior stays correct if room data changes later, rather than rotting
the day someone adds a 51st room.

**The atlas.** One canvas per room (`ATLAS_SCALE = 3` canvas px per
world px, packed into rows up to `ATLAS_MAX_W = 2048` wide, shelf-style
bin packing sorted tallest-first). `spineStyle()`/`fillerStyle()`
return CSS `linear-gradient(90deg, ...)` strings — canvas can't consume
that syntax, so `parseStops()` regex-extracts the `#rrggbb NN%` pairs
and rebuilds the identical gradient with `ctx.createLinearGradient()`.
The `band` field (head/tail bands) needed **no parsing at all** — it's
already either `'transparent'`, a hex colour, or an `rgba(...)`/`hsl(...)`
string, and `ctx.fillStyle` accepts all of those directly. Titles are
drawn rotated -90° (vertical, reading top-to-bottom like the CSS
`writing-mode: vertical-rl`), truncated to fit the spine's height,
using the same thickness-tier font-size logic as `scene.css`'s
`--sp-size`. I verified the rotation direction empirically (screenshot,
read the text) rather than reasoning it out — see "Verified this
session".

**Per-book UV remap** (`remapFaceUV()`): rather than hand-deriving
which of `BoxGeometry`'s four per-face vertices maps to which UV
corner (order isn't guaranteed to be obvious and I didn't want to
trust memory), the function does an **affine remap** of whatever UVs
are already there — `newU = u0 + oldU*(u1-u0)`, same for V — into the
atlas sub-rect. This is correct regardless of which corner is which,
as long as the existing UVs are the standard `[0,1]²` BoxGeometry
default, which they are for an unsubdivided box. Face index 4 (`+z`,
the spine, per `BoxGeometry`'s documented `[+x,-x,+y,-y,+z,-z]` group
order) is the only face remapped; the other five get a per-book solid
colour (front/back cover from the jacket palette's `bg`, darkened for
the back) or a shared cream "page block" material — not textured, a
deliberate simplification (see below).

**Per-book emissive isolation**: the atlas material is shared (one
`THREE.CanvasTexture`, one base `MeshStandardMaterial` per room), but
each book's spine-face material is a **clone** of it (`atlas.material.
clone()`), so `setHighlight()` can set emissive on exactly one book
without lighting up the whole shelf. The clone shares the texture
(cheap) but is a distinct material instance (one per real *and* filler
book — filler books get a clone too even though they're never
highlighted, for code-path uniformity; this could be skipped for
filler as a memory optimization if profiling ever asks).

### `src/js/scene/interact.js`

`createBookController()` is the one shared state machine: `hover(entry)`
and `activate(entry)`. **Both** `attachPointerPicking()` (mouse/touch
raycasting) and `a11y.js`'s mirror buttons call these same two methods
— neither the raycaster nor the mirror has its own idea of "what
hovering/activating a book means." `activate()` dispatches a
`book:open` CustomEvent on `window` (`detail: {id, title, author,
entry}`) and also runs any `onActivate()` subscribers — a
console-loggable signal, per the brief; real book-panel UI wiring is
explicitly deferred to `main.js` integration time, not this phase.

Raycasting only intersects `entries.map(e => e.mesh)` — filler meshes
are never in that list, matching `scene.css`'s `.fill { pointer-events:
none }` treatment of the CSS build's decorative spines.

### `src/js/scene/a11y.js`

`mountA11yMirror(container, entries, controller)` builds one real
`<button>` per entry, in the order `entries` was given (shelf order,
per `books.js`'s guarantee above), each with the exact aria-label
format `scene.js`'s `buildBook()` already uses:
`` `${title} by ${author}. Take it off the shelf.` ``. Visually hidden
via the standard clip-rect pattern (not `display:none`/`visibility:
hidden`, which several ATs skip; and deliberately not `filter`/
`backdrop-filter`, per `IMPLEMENTATION.md`'s inherited-trap list about
grouping properties, even though this element has no 3D transform to
break).

Focus → `controller.hover(entry)` (same visual treatment as mouse
hover: lift + tilt + emissive). Click → `controller.activate(entry)`.
**No separate keydown handler** — a real `<button>` already turns
Enter/Space into a native `click` event, so adding an explicit keydown
listener that also called `activate()` would have double-fired on
every Enter press. This was deliberate, not an oversight; I mention it
because it's an easy thing to "fix" by someone who doesn't check
first.

`addEntry()` is exposed so phase 5 (doors) and phase 7 (tables) can
push more entries onto the **same** mirror list rather than building a
parallel one — the module takes a plain `{ariaLabel, setHighlight}`
shape, nothing book-specific, on purpose.

**Not done this phase, by design**: focusing a mirror button does
**not** move the camera (poses don't exist until phase 7 — see
IMPLEMENTATION.md §4.3). There's a `TODO(phase 7)` comment at the
exact call site in `a11y.js`'s `focus` listener.

### `tools/preview-stage.html`

Extended, not replaced — the phase-3 `?orbit=`/`?exposure=`/`?li=`/
`?ai=`/`?ld=` params all still work unchanged. New: `?books=0` skips
cases/books/mirror entirely (reverts to the phase-3 shell-only view,
useful for isolating a lighting/shell regression from a books
regression); `?mirror=1` makes the mirror's buttons visibly rendered
in a sidebar (CSS override, not the real accessibility path — the
real path is clip-hidden, this is a "let a human look at it" aid).
`window.__entries`/`__controller`/`__mirror` are exposed for
Playwright, same pattern as phase 3's `window.__stage`.

### `server/index.js`

Added `app.use('/vendor', express.static(path.join(ROOT, 'vendor')))`,
flagged as missing by `HANDOFF-PHASE4.md`. Purely additive — verified
the live CSS site's door/enter/room-render flow still works unchanged
under `npm start` after this change (see "Verified this session").
`/tools` is still **not** served by Express (deliberately — `server/
index.js`'s existing comment about not handing out `server/`,
`tools/`, `node_modules/`, `data/cache/` to anyone who asks still
applies), so the preview harness itself still needs the plain static
server; only a future real `vendor/three` import from `main.js`/
`index.html` would benefit from the new route today.

## Things phase 5 should know

- **`spineRun()` is still in `covers.js`, still called by the live
  `scene.js`, and was deliberately NOT deleted.** IMPLEMENTATION.md
  §4.6 says to delete it "when the side shelves become real" — they
  are now real in the new stage, but the CSS scene (still the live
  site) still uses `spineRun()` for its own side cases. Deletion is
  blocked on the `main.js`/`index.html` swap-over, not on this phase.
  Don't delete it in phase 5 either unless that swap-over is also
  phase 5's job.
- **`BAY`/door-slot logic is now duplicated in `books.js`**, ported
  from `scene.js` to compute side-case width (a case can't overlap a
  future doorway). Phase 5 owns real doors — when it cuts actual
  `ExtrudeGeometry` holes for doorways, **make sure the door positions
  it chooses stay consistent with the `BAY` array `books.js` already
  assumes**, or a real 3D case could end up abutting/overlapping a real
  3D doorway. Easiest fix: phase 5 should probably hoist `BAY`/
  `doorSlots()` into a small shared module (`coords.js`, or a new
  `passages.js`) that both `books.js` and the new door-building code
  import, rather than each maintaining its own copy. I didn't do this
  refactor myself because phase 4 has no doors to share the constant
  with yet, and speculative shared modules for a consumer that doesn't
  exist felt like the wrong kind of premature abstraction — but it's
  worth doing the moment phase 5 has a second consumer.
- **Camera poses don't exist yet** (phase 7). The a11y mirror's
  `focus` handler has a `TODO(phase 7)` comment exactly where "fly to
  `shelf:<caseId>` and centre this book" should go; nothing about the
  current mirror implementation anticipates poses beyond that comment.
- **No shadow maps** (inherited from phase 3, still off). Now that
  cases and ~80-140 book meshes per room exist, a lamp's light passes
  through them without occlusion — doesn't currently look wrong (the
  cases are against walls, lamps are ceiling-hung, geometry mostly
  doesn't self-shadow in ways that matter yet), but it's a compounding
  decision, not a one-time one; still worth revisiting deliberately
  rather than by accident once props (phase 6) add more opaque
  geometry into the room's open floor space.
- **The atlas is never disposed** in the current code — `buildAtlas()`
  returns a `dispose()` method but nothing calls it, because the
  standalone harness only ever builds one room per page load. The
  moment a later phase needs to rebuild a room in place (room
  switching without a full page reload, which `main.js` integration
  will need), call `atlas.dispose()` and also drop every entry's
  cloned spine material (`entry.mesh.material[4].dispose()`) before
  discarding the old `group` — otherwise every room visited leaks one
  `~2048×N` canvas texture and its GPU-side texture.
- **Real book width is unclamped** in row packing (only filler is
  capped, matching `scene.js`). At today's ~7-15 real books/room this
  never overflows a case's 1180px width, but phase 9 (harvest ~2,000
  more books, ~2,400 total, maybe 40-50/room) will push some rooms
  much closer to the 43-books-per-row edge-to-edge ceiling the measured
  facts describe. Nothing will crash — books will just start visually
  overlapping/poking past the case's right-hand carcass panel — but
  it's worth a dedicated look at row-overflow behavior before phase 9
  ships, not discovered by a screenshot afterward.

## Known simplifications / deviations from a literal reading of the brief

- **Side-case filler count is an approximation, not an exact match**
  to the measured "11 or 22 books per row" figures. My `planSideRows()`
  packs edge-to-edge using `innerW = w - 68` (the measured usable-width
  formula) with each filler book's own generated width + a 1px gutter,
  which nets out close to but not exactly 11/22 depending on the
  random widths drawn for that room/row's seed — I did not force an
  exact count. This matches the *spirit* of "reproduce the current
  mix" (per the brief's explicit permission to approximate here) more
  than the letter of the specific numbers.
- **Front/back cover and top/edge faces are solid colours, not
  textures.** Only the spine face (the one thing the brief's atlas
  requirement actually asks for) is textured. The other five faces of
  each book box use the jacket palette's flat `bg` colour (cover) or a
  single shared cream "page block" material (top/edge) — reasonable
  given these faces are rarely visible (mostly hidden between
  neighbouring books) and PLAN-ARCH's atlas requirement is specifically
  about the spine ("a spine is one image... `spineStyle()` already
  produces them together").
- **`perspective-origin`/lens-shift approximation, no shadow maps, the
  `k-paper` texture caveat** — all inherited from phase 3 unchanged,
  not re-litigated this session. See `HANDOFF-PHASE4.md`.
- **Carcass panel thickness (`PANEL_T = 14`) is my own invented
  constant** — `scene.js`'s CSS case model doesn't have a directly
  analogous "carcass wall thickness" value (CSS cases are built from
  flat `.case__panel` divs with no real depth), so I picked a value
  that reads reasonably in the render rather than porting a number
  that doesn't exist in the source.

## Verified this session

Server: `python3 -m http.server 8099` from the repo root for the
harness (Express under `npm start`/`node server/index.js` still only
serves `/src`, `/vendor`, `index.html` — not `/tools`).

```sh
python3 -m http.server 8099
# http://localhost:8099/tools/preview-stage.html?room=glasshouse
```

Playwright checks run this session (scratch scripts — written, run,
and deleted, per the same pattern `HANDOFF-PHASE4.md` used; not part
of the commit):

- **`npm start` / `/vendor` route**: booted `node server/index.js`
  directly, confirmed `GET /`, `GET /vendor/three/build/three.module.js`
  and `GET /src/js/main.js` all return 200. Separately, loaded the live
  CSS site through that same server (`http://localhost:8099/`, clicked
  `#enter`, waited for `.travel`'s transform to settle — same technique
  `tools/qa.mjs`'s `settle()` uses) and confirmed the front room still
  renders (`11` books, `6` doors, `2` cases via the CSS DOM selectors)
  with **zero console errors** — the `/vendor` addition doesn't affect
  the live site's own behavior. Did **not** re-run `tools/qa.mjs`
  itself this session (nothing in `scene.js`/DOM/CSS changed, matching
  phase 3's same reasoning) — worth running as a clean baseline before
  phase 5 lands its own DOM/CSS-adjacent changes (doorway signs).
- **All 50 rooms build with zero console errors**: swept every room id
  in `rooms.js` (`?room=<id>`, waited for `canvas.dataset.frame > 10`,
  never a fixed timeout) and confirmed `window.__stageError` stays
  null and no `pageerror`/`console.error` events fire for any of them.
  Also read each room's `books:<id>` group's children names off
  `window.__stage.scene` to confirm the case set (`case:back` alone
  vs. `case:back`+`case:left`+`case:right`) — **`landing`,
  `bonelibrary`, `understory`, `longtable` are exactly the four with
  no side case**, matching IMPLEMENTATION.md's measured fact, derived
  rather than hard-coded (see `books.js`'s "Things phase 5 should
  know" note above).
- **Screenshots, looked at directly** (`page.screenshot()`, real
  browser-level capture): `glasshouse` (k-glass, full room + zoomed
  crops of both side cases + a zoomed crop of the back-wall spines),
  `front` (k-panel), `orrery` (k-void), `landing` (k-paper, back-case-
  only room). In every case: spine titles are legible, upright, and
  read left-to-right when the vertical rotation is accounted for (no
  mirroring); real books (with visible titles) sit in one contiguous
  block per row flanked by filler, matching the ported packing
  algorithm; side-case rows are populated (not empty — an earlier
  fixed-camera screenshot made the bottom side-shelf look dark/empty,
  but a closer crop showed it was fully populated, just dim from the
  lighting angle); no z-fighting or geometry gaps between case,
  shelves and books at the angles checked.
- **Mouse hover/click raycasting**: projected each real book mesh's
  world position through the camera (`Vector3.project()`) to get a
  reliable screen coordinate (rather than guessing pixels), then:
  moved the mouse onto a book → `controller.hovered` matched that
  book's id (PASS); moved the mouse away → `controller.hovered` became
  `null` (PASS); clicked a book → exactly one `book:open` window event
  fired with the correct id (PASS).
- **Keyboard-only, no mouse**: read `document.activeElement` after
  each `Tab` press from `document.body` — confirmed the mirror's
  buttons are reached in shelf order (same order as `entries`/the
  room's real book list) with correct, non-empty `aria-label`s in the
  exact `"{title} by {author}. Take it off the shelf."` format
  (PASS, all buttons checked in the tested room). Focused a mirror
  button directly (`.focus()`) → `controller.hovered` became that
  book's entry, i.e. the scene-side highlight fires on focus (PASS).
  Pressed **Enter** on a focused button → exactly one `book:open` event
  fired for that book (PASS). Focused a different button, pressed
  **Space** → exactly one `book:open` event fired for that different
  book (PASS) — confirming both keys route through the native
  `<button>` click, not a hand-rolled keydown handler (see `a11y.js`
  notes above for why there's deliberately no separate keydown
  listener).
- **What I did NOT test**: an actual screen reader (VoiceOver,
  NVDA, JAWS) — none available in this environment. The checks above
  (focus order via `document.activeElement`, non-empty accessible
  names, Enter/Space parity with click) are the practical substitute
  IMPLEMENTATION.md's task description itself names, not a replacement
  for the real thing. **A real screen-reader pass is still owed before
  ship** — per `PLAN-ARCH.md`'s own words, "An axe pass will be green
  on a page that is unusable," and everything I ran this session is
  closer to an axe pass than a screen-reader pass, however much more
  targeted it is than a generic automated audit. I also didn't test
  touch input (mobile raycasting/tap), reduced-motion behavior for the
  hover lift/tilt (there's no `prefers-reduced-motion` check on the
  highlight transform at all right now — worth adding whenever camera
  poses/tweening pick up that concern properly in phase 7), or
  screen-magnifier/high-contrast-mode rendering.
- **Atlas visual correctness across kinds**: checked `k-panel`
  (`front`), `k-glass` (`glasshouse`), `k-void` (`orrery`), `k-paper`
  (`landing`) rooms directly. Did not specifically re-check every one
  of the 14 wall kinds' *book* rendering in combination with the wall
  (the wall-texture-kind coverage caveats from `HANDOFF-PHASE4.md`
  are about the walls, not the books, and are unaffected by this
  session — books render the same way regardless of which wall kind
  they're shelved against).

One environment note worth recording: this machine's `rm` is aliased
to `rm -i` (interactive-confirm). A plain `rm <file>` from a
non-interactive tool call hangs waiting for a `y/n` that never arrives
— it looks exactly like a stuck browser/server process but isn't one.
Always use `rm -f` for scratch-file cleanup here, the same way
`HANDOFF-PHASE4.md` flagged the stray-`:8099`-listener trap for its
own session.

## Environment

Same as `HANDOFF-PHASE4.md`/`HANDOFF-PHASE3.md` reported: the owner's
real local machine, not the sandboxed environment `IMPLEMENTATION.md`
§1 describes — no proxy, `git push` not attempted (not asked for),
Playwright resolved its own managed Chromium build fine from `tools/`
(scripts must live inside the repo tree to resolve the gitignored
`node_modules/playwright`, same as prior sessions found). New this
session: `rm` is aliased to `-i` here (see above) — use `rm -f` for
any non-interactive cleanup.
