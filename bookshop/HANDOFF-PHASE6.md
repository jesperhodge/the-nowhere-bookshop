# Handoff — phase 5 done, phase 6 next

Read `IMPLEMENTATION.md` first (§3's order-of-work row 5: "Doorways
with real openings; signs on hover", points 2 & 3; §4.4 The shell;
§4.7 Accessibility), then `PLAN-ARCH.md`'s "Doorways" section and the
point-2/point-3 rows of "The ten points on the new substrate" table.
`HANDOFF-PHASE5.md` (phase 4) is still accurate about the
books/atlas/raycast/mirror substrate this phase builds on top of —
`books.js` had one small fix this session (see below), everything
else in it is untouched.

This session did **only phase 5**: real arched holes cut into side
walls, a point-light spill in each opening, a DOM sign shown on
hover/focus, and raycast + a11y-mirror reachability for doors. Nothing
in `src/js/scene.js`, `scene.css`, `themes.css`, `main.js` or
`index.html` was touched — the live site still runs the CSS-3D scene
exactly as before. The new code lives entirely under `src/js/scene/`
and is only reachable via the standalone preview harness; nothing
wires it into the shop yet.

Committed as `98d298f`, "phase 5: real doorway openings, light spill,
hover/focus signs" — 7 files, no push (not asked for).

## What changed

```
src/js/scene/passages.js    ~106 lines   new — shared BAY/doorSlots + coordinate helpers
src/js/scene/doors.js       ~271 lines   new — holes, sensors, light spill, signs, entries
src/js/scene/shell.js        +50 lines   opts.holes; [cap, reveal] material pair
src/js/scene/books.js         +9/-14     BAY/doorSlots now imported; door-margin fix
src/js/scene/interact.js     +58/-42     createDoorController/attachDoorPicking, deduped
src/js/scene/a11y.js         +21/-11     per-entry .controller override, data-room-id
tools/preview-stage.html     extended    doors wired in; ?doors=0/?signs=0/?dli=/?ddist=
```

### `src/js/scene/passages.js` (new)

The hoist phase 4's handoff explicitly asked for: `BAY`, `doorSlots()`
(values unchanged from `scene.js`) plus four new coordinate-mapping
functions that didn't exist before because nothing needed them until
doors became real geometry:

- `bayZRange(bayIndex)` — a bay's world z-interval.
- `doorLocalXRange(side, bayIndex)` — the doorway's rectangle in the
  wall **shape's own local coordinates** (pre-rotation, pre-translation
  — what `shell.js`'s `buildFace()` needs to cut a hole). Derived by
  hand by composing `shell.js`'s wall placement (rotation.y = ±90°)
  with the old `scene.js`'s `doorTransform()`, then cross-checked
  numerically: for every one of the 3 bays, on both walls, it produces
  exactly a 240-unit-wide span, matching `DOOR_W`. The formula:
  `left wall: localX = -WORLD.d/2 - worldZ`, `right wall: localX =
  WORLD.d/2 + worldZ`. If a future phase adds a third wall orientation
  (there's no current plan to), or a doorway ever looks like it's cut
  on the wrong side/bay, re-derive this from `shell.js`'s
  `buildShell()` placements rather than trusting the comment — same
  caution `books.js`'s `buildCaseGroup()` comment gives for its own
  rotation handedness, and the same kind of derivation (I did it by
  hand, cross-checked against `BAY`'s own numbers, then confirmed by
  screenshot rather than trusting either alone).
- `doorLocalYRange()` — floor to the arch apex, in shape-local y.
- `doorWorldAnchor(side, bayIndex)` — the doorway's position in
  three.js world space (wall inner face x, bay z-centre), for
  `doors.js`'s light/sensor/sign placement.

`books.js` now imports `BAY`/`doorSlots` from here instead of keeping
its own copy — exactly the refactor `HANDOFF-PHASE5.md` asked for
("worth doing the moment phase 5 has a second consumer").

### `src/js/scene/doors.js` (new)

Two entry points, used in this order (see the file's own doc comment):

1. **`computeRoomDoorHoles(room)`** — call before `buildShell()`.
   Returns `{left: THREE.Path[], right: THREE.Path[]}`. Builds a
   Norman-arch hole per doorway: two straight jambs up to a
   springline, then `absarc()` to the apex, radius `DOOR_W/2` (a true
   semicircle spanning the full opening). I derived the arc's
   direction (`absarc`'s `clockwise` flag) by hand from
   `EllipseCurve.getPoint()`'s source in `vendor/three/build/
   three.core.js` (grep `class EllipseCurve`) — with `aClockwise:
   true`, a sweep from `Math.PI` to `0` decreases monotonically and
   passes through `Math.PI/2` (the top), which is the arch; the other
   direction sweeps through `3*Math.PI/2` (the bottom) and produces a
   degenerate/wrong shape. Confirmed by screenshot afterward, not
   trusted blind — see "Verified this session".

2. **`buildRoomDoors(room, opts)`** — call after `buildShell()` (same
   room). Returns `{group, entries, updateSigns(stage)}`. For each
   doorway: an invisible raycast-target box (`MeshBasicMaterial`,
   `opacity: 0, depthWrite: false` — invisible but still raycastable,
   since `Raycaster` only checks `object.visible`, not material), a
   `PointLight` + faint bulb glow sphere (the light spill), and
   optionally (if `opts.signContainer` is given) a DOM sign element.
   `entries` is shaped exactly like `books.js`'s book entries (`.mesh`,
   `.ariaLabel`, `.setHighlight(bool)`) plus `.room`/`.slot`, so
   `interact.js`'s raycast pattern and `a11y.js`'s `addEntry()` both
   work unmodified.

Both entry points derive from the same internal `doorwaySpecs(room)`
— filters `room.children` for non-`viaTable` kids, calls
`doorSlots(kids.length)`, zips them together. This is a direct port of
`scene.js`'s `buildRoom()` kid-filtering/slot-assignment, and it's the
single source of truth both the hole-cutter and the light/sensor
builder read from, so they can't drift apart from each other.

**Light spill tuning** (`DOOR_LIGHT_INTENSITY = 220_000`,
`DOOR_LIGHT_DISTANCE = 900`, `DOOR_LIGHT_DECAY = 2`): tuned by
screenshot against `stage.js`'s existing lamp convention (physically-
based units, CSS-px-scale world — see `stage.js`'s own comment on the
candela trap). A doorway doesn't need lamp-scale intensity
(`LAMP_INTENSITY = 1_800_000`) since there's nothing large to light
beyond it — 220k reads as a warm, clearly-lit passage without blowing
out the reveal or the near wall. `HOVER_LIGHT_BOOST = 1.35` bumps
intensity on hover/focus, standing in for the old CSS
`.door3d:hover { filter: brightness(1.22) }`.

**The sign** (`buildSignEl()`): a small `position:fixed` DOM element,
opacity 0 by default, `opacity: 1` on hover/focus (toggled inside the
door entry's own `setHighlight()`, the same function the controller
calls from either raycast hover or a11y-mirror focus — no separate
subscription mechanism needed). Repositioned every frame via
`updateSigns(stage)` (projects a world anchor through the camera,
converts NDC to a pixel `left`/`top`) — `preview-stage.html` drives
this from its own small `requestAnimationFrame` loop, the same pattern
it already used for `OrbitControls.update()`. Content format matches
`scene.js`'s old `doorSign()` exactly: room name, then `sub ||
'further in'` + ' · ' + `total`. I tuned the sign's world-space anchor
offset (how far it's pulled toward room-centre / above the arch) twice
by screenshot — an initial offset (26/34 units) visually drifted
noticeably off-arch for the nearest bay because of how much more
perspective parallax a close-to-camera point has for the same world
offset than a far one; a smaller offset (10/12 units) tracks the arch
much more tightly. If a later phase revisits sign placement, expect
the same near-bay-drifts-more-than-far-bay effect and budget for it.

### `src/js/scene/shell.js`

`buildShell(room, opts)` now accepts `opts.holes = {left, right}`
(arrays of `THREE.Path`, built by `doors.js`'s
`computeRoomDoorHoles()`), threaded onto the left/right walls' shapes
— back wall, floor, ceiling never get holes.

The more consequential change: every wall's `material` is now a
**2-element array** `[cap, reveal]` instead of one material. This
isn't specific to doorways — `ExtrudeGeometry` always calls
`addGroup()` twice regardless of whether the shape has holes (I
confirmed this by reading `vendor/three/build/three.core.js`'s
`ExtrudeGeometry` source directly, `buildLidFaces()`/`buildSideFaces()`
— group 0 is the front/back caps, group 1 is every "side wall" strip
the extrusion produces, which includes BOTH the thin perimeter around
the whole slab (previously invisible, tucked into the corners) AND, once
a hole exists, its reveal faces). So passing `[capMaterial,
revealMaterial]` gives every wall's hidden perimeter edge a plain tone
instead of the cap's stretched texture too, not just doorway reveals —
a small bonus fix for exactly the bug phase 3's handoff flagged
("the inner reveal faces of a doorway are exactly these strips, and a
stretched wall texture will look wrong there") in a place nobody could
see it yet. `revealMaterial(pal)` is one flat-color
`MeshStandardMaterial` per room (`pal.wood || pal.wall`, no map),
shared across all 5 faces since there's nothing per-face about a flat
tone.

### `src/js/scene/interact.js`

Refactored, not rewritten: the phase-4 `createBookController()`/
`attachPointerPicking()` behavior is **byte-for-byte unchanged**
(same `book:open` event, same detail shape `{id, title, author,
entry}`) — both are now thin calls into a shared `makeController(
eventName, detailOf)` / `attachRaycastPicking()` pair, parameterised
only by which `CustomEvent` gets dispatched and how its `detail` is
built. `createDoorController()` dispatches `door:go` with `{roomId,
slot, entry}`. `attachDoorPicking()` is the same raycast wiring
against a door's own `entries` list.

**Books and doors get separate controller instances**, not one merged
controller — I considered generalizing to one "scene controller" that
branches on `entry.book` vs `entry.room`, but a book being hovered and
a door being hovered are independent facts about the room (raycasting
already queries disjoint mesh lists), so there's nothing to reconcile
between two hover states, and keeping them separate means neither
controller's `activate()` needs to know the other kind of entry
exists. See `a11y.js` below for how they still share one mirror
despite being separate controllers.

### `src/js/scene/a11y.js`

One deliberate, minimal change: `addEntry(entry)` now resolves
`const ctl = entry.controller || controller;` and routes
hover/blur/click through `ctl` instead of the mirror's default
`controller` unconditionally. Book entries never set `.controller`, so
they're completely unaffected — this was verified, not assumed (see
"Verified this session"). Door entries have `entry.controller` set to
their own `doorController` by the caller (`preview-stage.html`, right
before `mirror.addEntry(entry)`) so a `door:go` fires instead of
`book:open` when a door's mirror button is activated, while both kinds
of button still live in the exact same `<div role="list">`.

I chose this over the alternative (one controller, `activate()`
branches on entry shape) because it keeps `interact.js`'s controllers
symmetric and ignorant of each other, and it's the smaller, more
legible diff to `a11y.js` — a fallback default plus an optional
override, not new control flow inside `activate()`.

Also added: `data-room-id` on a door's mirror button (parallel to the
existing `data-book-id`), and updated the mirror's `aria-label` from
"Books on the shelves in this room" to "Books and doorways in this
room" since it's no longer books-only.

### `tools/preview-stage.html`

Extended, not replaced — all phase-3/phase-4 params still work
unchanged. New: `?doors=0` (skip doorway holes/sensors/lights/signs
entirely — isolates a books/shell regression from a doors one, same
spirit as `?books=0`), `?signs=0` (build doors, skip the DOM sign
layer only), `?dli=`/`?ddist=` (override the door light's
intensity/distance for tuning). `window.__doorEntries`/
`__doorController` exposed for Playwright, same pattern as
`__entries`/`__controller`.

Door holes are computed **before** `buildShell()` is called (ordering
matters — `doors.js`'s own doc comment says so) and the harness
follows that exactly: `computeRoomDoorHoles()` → `buildShell(room, {
holes })` → `buildRoomDoors()`.

## Things phase 6 should know

- **Props and door reveals could visually conflict, and nothing in
  this phase checked for it.** `coords.js`'s `SLOT` table has
  `'tall-l'`/`'tall-r'` (trunk/column/monolith props) and books.js's
  `sideCaseSpec()` already checks those before building a side case —
  but doors.js's `doorwaySpecs()` does **not** consult `room.props` at
  all, faithfully matching `scene.js`'s old `buildRoom()` (which also
  never checked prop placement before placing a door). In practice
  this hasn't produced a visible conflict in any of the 50 rooms this
  session swept, because the data was authored for the CSS build where
  a `tall-l`/`tall-r` prop and a same-side door apparently don't
  co-occur in the shipped rooms — but I did not verify this
  positively (I verified the reverse: that doors and side *cases*
  don't overlap, which is a different, already-guarded case). If phase
  6 places a floor/wall prop near `SIDE_NEAR`/`SIDE_FAR` z or near a
  bay's z-range on a side wall, check it against `doorwaySpecs()`'s
  output the same way this session checked cases against it (Box3
  overlap test — see "Verified this session" for the exact technique).
  A prop overlapping a real doorway hole would be much more visually
  obvious than the 14-unit case/door overlap this session found and
  fixed, so it's worth a deliberate look rather than discovering it in
  a screenshot after the fact.
- **The reveal material's tone follows `pal.wood`, not the wall
  `kind`.** On `k-void` rooms (starfield walls, e.g. `orrery`) this
  means the doorway's arch/jamb reads as warm olive-wood, matching the
  side cases' carcass color (which has always used `pal.wood`,
  unchanged from phase 4) rather than the wall's cool blue palette. I
  judged this a feature, not a bug — the reveal and the shelving both
  read as "wooden fittings," visually distinct from the exotic wall
  material, which is arguably more coherent than a reveal that tried
  to match the wall. Worth a second look if a future phase's props
  (also often wood-toned, e.g. `column`, `trunk`) are meant to
  contrast with or blend into a `k-void`/`k-glass` wall on purpose —
  the palette convention (`pal.wood` = "furniture," `pal.wall` =
  "envelope") is doing real work here and is worth keeping consistent.
- **The sign's screen-space projection assumes a static, non-tweened
  camera.** `updateSigns(stage)` re-projects every frame from
  `stage.camera`'s CURRENT transform, so it already tracks `?orbit=1`
  free-look correctly (verified — see below) — but there's no camera
  pose system yet (that's phase 7, `IMPLEMENTATION.md` §4.3). Once
  poses/tweening exist, nothing here needs to change (it reads the
  camera every frame regardless of what's driving it), but it's worth
  knowing the sign was only ever exercised against the fixed §4.2 pose
  and free manual orbiting, not an animated transition.
- **`entries.controller` is a slightly unusual shape** — an entry
  object gaining a field (`.controller`) that isn't set by whichever
  module built the entry (`books.js` never sets it; `doors.js` never
  sets it either — it's set by the CALLER, `preview-stage.html`,
  after both `buildRoomDoors()` and `createDoorController()` exist).
  If phase 6 or 7 adds a third entry kind (props aren't focusable per
  the brief, so this may not come up until tables in phase 7), keep
  this same caller-side-tag convention rather than teaching
  `books.js`/`doors.js`/`tables.js` about each other's controllers.
- **No shadow maps still** (inherited from phase 3, still off). Doors'
  point lights, like the lamp lights, pass through geometry without
  occlusion — I leaned on this explicitly when placing the light
  slightly toward the room from the wall's inner face rather than
  reasoning about literal line-of-sight through the reveal. If shadow
  maps are ever turned on, every light in the scene (lamps and doors
  both) needs a fresh look at position/distance/decay, not just doors'.
- **The a11y mirror's order is books-then-doors, not interleaved.**
  The old CSS `buildRoom()` appended doors and cases to the DOM in a
  particular interleaved order; the new mirror (per `preview-stage.
  html`'s wiring) mounts with book entries first, then appends door
  entries afterward via `addEntry()`. A screen-reader user tabbing
  through a room hears all books, then all doors, not shelf-then-door-
  then-shelf. This is a known, deliberate simplification (see below),
  not an oversight — flagging it because "shelf order" is explicitly
  named as a design goal in `HANDOFF-PHASE5.md` and this session's
  interpretation of that goal is looser than a literal DOM-order match.

## Known simplifications / deviations from a literal reading of the brief

- **Mirror order is books-then-doors** (see above) rather than
  matching the old CSS DOM's interleaved order. I judged "one complete
  accessible list per room, correct content, correct activation" more
  important than exact ordering fidelity to a DOM structure that no
  longer exists in this substrate, and the brief's own example (§4.7)
  describes shelf order as "every book, doorway and table... in shelf
  order" without specifying whether "shelf order" means literally
  interleaved with cases. Worth a deliberate decision, not a silent
  one, if a screen-reader pass in a later phase finds it disorienting.
- **The door sensor is a rectangular box, not the true arch shape.**
  Per the file's own comment, this is intentional — a hover/click
  target only needs to cover roughly where the opening is, the same
  way a book's box mesh stands in for a shape that's mostly hidden
  between neighbours. The rectangle is slightly larger than the arch
  at the top corners (outside the true curve), so a pointer very close
  to a top corner could register as "over the door" a few pixels
  before/after the true silhouette. Not worth the complexity of an
  arch-shaped hit-test for a target this size.
- **No decorative door frame mesh.** The brief's "give the hole's
  inner reveal faces a dedicated plain material" is satisfied entirely
  by `shell.js`'s `[cap, reveal]` material pair — the extrusion's own
  geometry IS the frame, there's no separate wood-trim mesh layered on
  top the way the old CSS `.door3d__frame` was a distinct painted
  element. This reads correctly in every room I checked (see
  screenshots) and is less geometry, so I didn't add one.
- **`PANEL_T`-driven door margin (`DOOR_MARGIN = PANEL_T * 2`) is my
  own invented constant**, like `books.js`'s `PANEL_T` itself
  (flagged as invented in `HANDOFF-PHASE5.md`). `scene.js`'s CSS case
  model has no carcass overhang to create this problem in the first
  place (flat `.case__panel` divs, no real depth) — this is a fix for
  a problem the three.js port itself introduced, not a ported number.

## Verified this session

Server: `python3 -m http.server 8099` from the repo root for the
harness (same as phase 4 — Express under `npm start`/`node server/
index.js` still only serves `/src`, `/vendor`, `index.html`, not
`/tools`). Playwright scripts lived in `tools/_scratch-*.mjs` (written,
run, `rm -f`'d — not part of the commit, per the established pattern).

- **All 50 rooms build with zero console errors**, swept twice: once
  before the door/case overlap fix (found the bug, see below), once
  after (confirmed clean). `window.__stageError` stayed null and no
  `pageerror`/`console.error` fired for any room. Read each room's
  `window.__doorEntries.length` off the page to cross-check door
  counts against `doorSlots()`'s expected mapping — `front` (5 kids,
  1 viaTable) → 5 doors, `landing` (6 kids) → 6 doors,
  `translator`/`brokenmirror`/`bonelibrary` (1 kid each) → 1 door
  each, every 0-kid leaf room → 0 doors, `fronttable` (the viaTable
  destination itself, 0 real children) → 0 doors. All matched.
- **Real hole, not a painted rectangle**: screenshotted `front` from
  an angled, close, grazing camera position (not the fixed §4.2 pose —
  a custom `camera.position.set()`/`lookAt()` via `page.evaluate()`,
  since there's no orbit-drag automation in headless Playwright) that
  looks nearly along the wall, close enough to see the jamb. The
  reveal strip is visibly a flat, undecorated tone distinct from the
  wall's pinstriped `k-panel` texture immediately next to it, and the
  opening itself is pure black (the renderer's `scene.background`,
  confirmed nothing is drawn beyond it — there's no room there yet,
  which is correct for this phase).
- **Light spill reads as a lit passage, not a black hole**: a
  close-up screenshot centred on one doorway shows the bulb-glow
  sphere, warm falloff onto the reveal and the wall immediately beside
  it, fading to black by the edges of frame — tuned to this by
  adjusting `DOOR_LIGHT_INTENSITY` and looking, not by formula.
- **Door/side-case overlap check — found and fixed a real bug.** Used
  `THREE.Box3().setFromObject()` on both a room's `case:right` group
  and each door's sensor mesh (via `page.evaluate()` importing
  `three.module.js` fresh inside the page, since `THREE` isn't
  otherwise exposed on `window`), then `Box3.intersectsBox()`. First
  run on `front` (which has a side case AND 2 doors on its right wall)
  found a genuine 14-unit overlap between `case:right`'s bounding box
  and door `lamproom` (slot `r2`)'s sensor box — traced to
  `buildCarcass()`'s side panels extending `PANEL_T` (14 units) past
  the case's nominal shelf width, which the old `sideCaseSpec()` logic
  never accounted for because there was no real door geometry to
  overlap before this phase. Fixed in `books.js` (see "What changed"
  above); re-ran the same Box3 check after the fix and confirmed
  `intersects: false` for both doors on that wall, with a clean 14-unit
  gap remaining. This is exactly the kind of bug the brief's process
  step 3 asked me to specifically go looking for, and it was real.
- **Hover/focus sign show/hide, mouse path**: projected a door's mesh
  position through the camera to get a screen coordinate (`Vector3.
  project()`), moved the mouse there with `page.mouse.move()`, and
  confirmed `doorController.hovered` became that door's entry AND the
  sign's computed `opacity` became `1`, in the same check. Moved the
  mouse far away and confirmed both `hovered` returned to `null` and
  opacity returned to `0`. Screenshotted both states.
- **Keyboard-only pass**: `Tab`bed from `document.body` until
  `document.activeElement.dataset.roomId` was set (first door button,
  11 tabs in, after the room's book buttons — confirms mirror order is
  books-then-doors, see "Things phase 6 should know"), confirmed its
  `aria-label` matched the exact `` `Go through to ${name}${sub ? '
  — ' + sub : ''}` `` format, confirmed the sign's opacity was `1`
  purely from keyboard focus (no mouse involved at any point in this
  check). Pressed a REAL `Enter` (Playwright's `page.keyboard.press()`,
  which triggers the browser's native button-activation behavior, not
  a synthetic `dispatchEvent()` — I tried the synthetic approach first
  and confirmed it does NOT fire a click on a button, which is
  expected and a useful negative check) and confirmed exactly one
  `door:go` event fired with `roomId` matching the focused button.
  Tabbed to the next button and pressed `Space`, confirmed a
  DIFFERENT `door:go` fired with the newly-focused door's `roomId` —
  both keys route through the native `<button>` click path, same as
  phase 4 verified for books, no separate keydown handler (still true,
  untouched this phase).
- **6-door room (`landing`) and 0-door leaf rooms
  (`longtable`/many others)**: both build with zero errors;
  `landing` shows exactly 6 arches (3 per wall) and, correctly, no
  side cases at all (matches `HANDOFF-PHASE5.md`'s note that `landing`
  is one of the 4 rooms with no side case — now confirmed to be
  *because* every bay on both walls is a real door, leaving no run
  wide enough for `SIDE_MIN_W`, not a coincidence).
- **Different wall `kind`s**: screenshotted `landing` (`k-paper`),
  `orrery` (`k-void`), `translator` (`k-plaster`) in addition to
  `front` (`k-panel`) — doors/reveal/light spill render correctly in
  every one; noted the `k-void` reveal-vs-case color relationship
  above.
- **What I did NOT test**: an actual screen reader (none available in
  this environment, same caveat `HANDOFF-PHASE5.md` recorded for
  books) — the checks above are the same practical substitute, not a
  replacement. Also didn't test touch input, `?orbit=1` sign tracking
  under active mouse-drag orbiting (I confirmed `updateSigns()` reads
  the live camera transform, which is sufficient reasoning that it
  would track correctly, but didn't screenshot an orbiting sequence to
  visually confirm), or a room with more than 6 non-table children
  (none exist in the current 50 rooms — `doorwaySpecs()`'s `if
  (!slot) return;` silent-drop path for children 7+ is therefore
  exercised by no real room, only reachable in principle).

One environment note worth repeating from `HANDOFF-PHASE5.md`: this
machine's `rm` is aliased to `rm -i`. Used `rm -f` throughout for
scratch-file cleanup.

## Environment

Same as prior handoffs: the owner's real local machine, not the
sandboxed environment `IMPLEMENTATION.md` §1 describes — no proxy,
`git push` not attempted (not asked for). One thing worth noting for
whoever runs phase 6's Playwright checks: a full 50-room sweep (fresh
browser context per room) takes noticeably longer than 120 seconds on
this machine — long enough that a foreground `node tools/_scratch-
*.mjs` run gets moved to the background automatically. Backgrounding
it explicitly and polling for the process to exit (or using a
Monitor-style until-loop) works fine; just don't assume a sweep that
hasn't printed its last line yet has hung.
