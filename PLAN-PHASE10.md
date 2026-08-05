# Phase 10 — the swap-over (`PLAN.md` point 10, `PLAN-ARCH.md`'s substrate move)

The three.js stage has existed since phase 3 and has never been the shop.
`index.html` and `main.js` still run `scene.js`. This phase makes the stage the
shop, retires the CSS scene, and lands the four things that were deferred
because they only become real at the swap: the no-WebGL fallback, `fronttable`
ceasing to be a room, a QA suite that checks a canvas instead of a DOM tree,
and the a11y mirror's `role="listitem"` defect.

Plus one thing the owner asked for directly: **the front table's books are far
too small.** Phase 7 measured 43×64 world units with 15 books; phase 9 put
**58** on the same 470×300 table, which drops the covers to **12.8×19.2**.
That is §5 below and it is a design change, not a bug fix.

Read `HANDOFF-PHASE10.md` first. Do not re-derive `PLAN.md`.

---

## 0. Decisions taken up front

| question | decision | why |
|---|---|---|
| One assembly path, or two? | **One.** The room-assembly code that lives inline in `tools/preview-stage.html` moves into **`src/js/scene/room.js`** — the file `PLAN-ARCH.md` "Shape" already names and nobody ever wrote. `main.js` and the harness both call it. | Two divergent paths to the same thing is the exact defect this repo already carries once (`tools/hardcover.mjs` vs `server/hardcover.js`, `IMPLEMENTATION.md` §5). The harness is the *reference* for mounting order; a reference that drifts is worse than none. |
| Does a room get disposed? | **Yes, explicitly.** The harness built one room and never tore one down. Walking 50 rooms leaks 50 spine atlases (2048×~700 RGBA ≈ 5 MB each). `room.js` owns `dispose()`. | New requirement created by the swap. Nobody has ever exercised teardown on this substrate. |
| What gets disposed? | Every **geometry** in the room group, every **material** not tagged `userData.shared`, and the room's own atlas texture. **Never** a texture from a cross-room cache (`textures.js`'s wall cache, `props.js`'s `artCache`/`paintCache`, `tables.js`'s cover cache). | Those caches are keyed by content and shared by every room; disposing one breaks the next room that wants it. The two module-level `pageMaterial()` singletons get `userData.shared = true` so the rule is declarative rather than a list of exceptions. |
| Travel animation | Stays **CSS, on the canvas element**, same four keyframes and the same 300 ms hand-over `go()` already does — but expressed as `scale()` rather than `translateZ()`, since there is no perspective context left. | A camera-driven travel would fight the pose rig for ownership of the camera, which `poses.js` warns about twice. The felt effect is unchanged and it is 12 lines of CSS. |
| Who owns the keyboard? | **`main.js`.** `attachPoseControls()` gains `opts.keys` (default `true`, so the harness is unchanged); `main.js` passes `false` and wires Escape/Arrows itself. | Otherwise Escape closes the book panel *and* pops the pose stack, and ArrowLeft steps to the previous book *and* flies to the left shelf. Two window listeners, no coordination. |
| Narrow viewports | `stage.js` widens the vertical fov when `aspect < 1.0` so horizontal framing is preserved. Above 1.0 nothing changes, **bit-identical**. | The CSS build cropped and let you drag along the shelf; that mechanic dies with the swap. Without this a phone in portrait sees ±216 of the room's ±840. The threshold is set so no existing measurement or screenshot moves. |
| `STATS.rooms` | Becomes **49** — rooms you can stand in. `fronttable` is a table. | The plan renders `${STATS.rooms} rooms`. Once the plan stops listing the table as a room, saying 50 is a small lie in the one place that counts them. |
| Phase 7's table/bottom-row occlusion | **Already decided and fixed by phase 9** (`poses.js`'s `LIFTS` ladder + `isClear()`'s third test). Phase 10 **re-measures it on the live build** and reports, because the table's obstacle box changes shape this phase. | `HANDOFF-PHASE10.md` "Phase 7's carried-forward item, closed". Re-opening a closed decision costs a session; verifying it costs ten minutes. |
| `cartographer` / `longtable` table counts | **Unchanged** (4 books each, `planRoomTable` rule 2). At n=4 the grid is 4×1 and the covers land at 80×120 — the largest this table geometry can produce. Nothing to fix. | The owner's complaint is specific to `front`, and 4 books at 80×120 already read well. Changing rule 2 would move books off two rooms' shelves for no visual gain. |

---

## 1. Files

```
DEL   src/js/scene.js                 469 → 0   the CSS-3D scene
DEL   src/styles/scene.css            782 → 0   (surviving rules move to ui.css first — §2.3)
DEL   src/styles/themes.css           158 → 0   wall treatments; ported as textures since phase 3

NEW   src/js/scene/room.js            one room, assembled and disposable

EDIT  index.html                      importmap, canvas + mirror + signs hosts, stylesheet links
EDIT  src/js/main.js                  the swap: stage, routing, fronttable, fallback, keyboard
EDIT  src/styles/ui.css               adopt .stage/.ambience/.vignette/.grain/.tag; travel keyframes;
                                      the no-WebGL notice; the plan's table node
EDIT  src/styles/base.css             drop the CSS-3D-only custom properties
EDIT  src/js/scene/stage.js           narrow-viewport fov; context-loss event; frame counter unchanged
EDIT  src/js/scene/a11y.js            role="listitem" onto a wrapper, off the <button>
EDIT  src/js/scene/interact.js        controller.onHover(); picking skips invisible meshes
EDIT  src/js/scene/poses.js           opts.keys; a table obstacle box supplied by tables.js
EDIT  src/js/scene/tables.js          two layouts + setSpread(); unit-box geometry; analytic bounds
EDIT  src/js/scene/books.js           entry.setSeen(); shared page material tagged
EDIT  src/js/covers.js                delete spineRun()  (IMPLEMENTATION.md §4.6)
EDIT  src/js/shop.js                  table-room helpers; STATS.rooms counts rooms
EDIT  src/js/views/map.js             the table is not a room
EDIT  server/index.js                 serve tools/preview-stage.html (kills the two-server trap)
EDIT  tools/preview-stage.html        assemble through room.js
EDIT  tools/qa.mjs                    rewritten per IMPLEMENTATION.md §7
EDIT  tools/shot.mjs                  reads the scene, not `.bk[data-book]`
EDIT  TRY-IT.md, README.md            there is one build now
```

---

## 2. The swap-over

### 2.1 `src/js/scene/room.js` (new) — fixed contract

```js
export function buildRoom(stage, room, opts = {}) -> handle
```

`opts`, all optional: `books`/`doors`/`signs`/`props`/`tables`/`poses` (booleans,
default `true`), `booksFor` (default `shop.js`'s `booksIn`), `signContainer`,
`mirrorContainer`, `reducedMotion`, `onBookActivate`, `onDoorActivate`,
`onPoseActivate`, `onBookHover`, `onMiss`.

Order — **this is the harness's order and it is load-bearing** (`doors.js`'s own
doc comment: holes before the shell; `books.js` is handed `shelfBooks`, never
the raw list):

1. `planRoomTable(room, booksFor(room.id), booksFor)` → `{ shelfBooks, table }`
2. `computeRoomDoorHoles(room)` → `buildShell(room, { holes })`
3. `buildRoomLights(room)`
4. `buildRoomBooks(room, shelfBooks)` → `entries`, `cases`, `atlas`
5. `buildRoomDoors(room, { signContainer })` → `doorEntries`, `updateSigns`
6. `buildRoomProps(room)`
7. `buildRoomTable(room, table)` → `tableEntry`, `bookEntries`, `surface`, `bounds`
8. mount the a11y mirror; add entries in the mandated order: **shelf books →
   doors → cases → table → table books**
9. `createPoseRig(stage, { cases, tables: [{id, surface, box}], reducedMotion })`
10. `attachScenePicking(...)`, `attachPoseControls(stage, rig, { keys: false })`
11. one `stage.onFrame` callback: `rig.update` → `tableRig.tick` → `updateSigns`
    → `propsRig.update`

Everything from steps 2–7 goes into **one** `THREE.Group` named `room:<id>`,
added to `stage.scene`. Nothing else is added to the scene.

The single frame callback replaces the harness's three independent
`requestAnimationFrame` loops. `stage.js`'s `tick()` comment already explains
why a second rAF loop has no ordering guarantee against the render; three of
them is three times that bug waiting.

Returned handle:

```js
{ room, group, rig, mirror, atlas,
  entries, tableEntries, doorEntries, cases, table, tableRig,
  bookController, doorController, poseController,
  ready,                 // Promise: props + table covers decoded
  get isReady(),         // plain boolean — page.evaluate() cannot hand back a Promise
  entryFor(bookId),      // shelf OR table entry, for openBook()'s camera follow
  dispose() }
```

`dispose()`, in order: unsubscribe the frame callback → `detachPicking()` →
`detachPoseControls()` → `mirror.dispose()` → remove every sign element →
`stage.scene.remove(group)` → traverse and dispose geometries + non-shared
materials → `atlas.dispose()`.

### 2.2 `index.html`

* Drop `scene.css` and `themes.css` from `<head>`; keep `base.css`, `ui.css`.
* Add the import map **before** the module script:
  `three` → `/vendor/three/build/three.module.js`,
  `three/addons/` → `/vendor/three/examples/jsm/`.
  (`three.module.js` imports `./three.core.js` relatively — both files are
  already committed side by side. `PLAN-ARCH.md` "The one dependency".)
* `.stage` becomes:

```html
<div class="stage" id="stage">
  <canvas class="scene" id="scene" aria-hidden="true"></canvas>
  <div class="mirror" id="mirror"></div>          <!-- focusable; NOT aria-hidden -->
  <div class="signs" id="signs" aria-hidden="true"></div>
  <canvas class="ambience" id="ambience" aria-hidden="true"></canvas>
  <div class="vignette" aria-hidden="true"></div>
  <div class="grain" aria-hidden="true"></div>
  <div class="flat" id="flat" hidden>…</div>       <!-- the no-WebGL notice -->
</div>
```

`#stage__fit` and `#room` go. The mirror sits where the books used to sit in
document order, so **Tab order is unchanged**: room contents → Search / Plan /
Parcel / Sound → Back / Home / Shelf / Bell.

### 2.3 CSS

Move out of `scene.css` **before** deleting it, into `ui.css` under a new
"the stage" section, otherwise the overlays that carry the mood go with it:

`.stage` (minus `perspective`/`perspective-origin`/`cursor:grab`),
`.ambience`, `.vignette`, `.grain`, `.tag` + `.tag__t/__a/__x`,
`.stage { transition }` + `body.is-reading .stage`.

New in `ui.css`:

```css
.scene { position:absolute; inset:0; width:100%; height:100%; display:block; }
#scene.go-in     { animation: travelInOut .46s var(--ease-in-out) forwards; }
#scene.go-out    { animation: travelOutIn .46s var(--ease-in-out) forwards; }
#scene.arrive-in { animation: arriveIn   .62s var(--ease) backwards; }
#scene.arrive-out{ animation: arriveOut  .62s var(--ease) backwards; }
@keyframes travelInOut { to   { transform: scale(2.6);  opacity:0; filter:brightness(1.5) } }
@keyframes arriveIn    { from { transform: scale(.45);  opacity:0 } }
@keyframes travelOutIn { to   { transform: scale(.45);  opacity:0; filter:brightness(.4) } }
@keyframes arriveOut   { from { transform: scale(2.4);  opacity:0; filter:brightness(1.4) } }
@media (prefers-reduced-motion: reduce) { #scene { animation: none !important } }
```

`.mirror` needs no rules — `a11y.js` inlines the clip-hidden CSS on each
listitem itself.

Delete from `base.css`: `--world-w`, `--world-h`, `--fit`, `--lamp-size`,
`--haze`, and any room-theme default (`--wall`, `--floor`, `--ceiling`, …) that
nothing outside the deleted files reads. Phase 8's rule: *a rule that matches
nothing is the thing that actually rots.* Grep each one before deleting it;
`views/book.js` sets `--cv-bg`/`--sp-bg`/`--hw`/`--hh`/`--ht` inline and those
stay.

### 2.4 `main.js`

**Goes:** `buildRoom` from `scene.js`; `fit()`, `fitK`, `panMax`, `pivot`,
`applyPivot()`, `onMove()`, the three drag handlers, `is-panning`,
`is-tracking`, and the `.bk`/`.door3d` delegated click/hover listeners on
`#room`.

**Stays, untouched in behaviour:** persistence, overlays, search, parcel, toast,
the bell, breadcrumbs, the placard, the dock, the sheet, `go()`'s
`travelling`/`queued` discipline and its 300 ms hand-over.

**New:**

```js
let stage = null;      // null == no WebGL
let handle = null;     // the live room, or null

try { stage = createStage(dom.scene); stage.start(); }
catch (err) { flat(err); }
```

`go()`'s `paint()`:

```js
handle?.dispose();
handle = stage ? buildRoom(stage, room, {...}) : null;
state.room = id;
paintChrome(room);
```

Wiring into the existing UI:

| scene event | does |
|---|---|
| `onBookActivate(entry)` | `openBook(entry.book.id)` |
| `onDoorActivate(entry)` | `go(entry.room.id, 'in')` |
| `onPoseActivate(entry)` | handled inside `room.js` (`rig.goTo(entry.pose)`) |
| `onBookHover(entry)` | show/hide the floating `.tag`, positioned by projecting the mesh's world position through `stage.camera` |
| `onMiss()` | `rig.back()` — a click on empty floor steps out (point 6) |

The `.tag` is re-projected every frame while it is on (one `project()` + two
style writes) — the camera moves under it during a pose tween, and a tag
pinned to a stale screen position is the same class of lie as a screenshot
taken before the room settles.

`openBook(id)` additionally calls `handle.rig.focusEntry(handle.entryFor(id))`
when the book is in the room you are standing in — so opening a book from
search, the parcel or the bell brings the camera to its shelf (or its table)
behind the panel. `entry.setSeen()` replaces `bk.classList.add('is-read')`.

Keyboard, in `main.js`'s existing single `keydown` handler:

* `Escape`: search → map → parcel → shelf → book panel → **pose**
  (`handle.rig.current !== 'room'` → `rig.back()`, and stop) → parent room.
* `ArrowLeft`/`Right` with a book open: step the shelf (unchanged).
  With no book open and no overlay: `rig.goTo('shelf:left'|'shelf:right')`;
  `ArrowUp` → `shelf:back`. `preventDefault()` only when `goTo()` returned
  true, which is `poses.js`'s own existing rule.

The hint text gains the new verbs: *point at a spine · click a shelf to step
up to it · scroll to move closer · Escape to step back.*

### 2.5 `stage.js`

* `resize()` gains the narrow-viewport adaptation:

```js
const MIN_ASPECT = 1.0;           // portrait only; desktop is untouched
camera.aspect = w / h;
camera.fov = camera.aspect >= MIN_ASPECT ? CAMERA.fovDeg
  : 2 * atan(tan(CAMERA.fovDeg/2 * DEG) * MIN_ASPECT / camera.aspect) / DEG;
```

  `poses.js` reads `camera.fov` fresh on every `goTo()`, so shelf and table
  poses follow it for free. **Verify at 1600×1000 that `camera.fov` is
  unchanged to 6 decimal places** before trusting anything else in this phase.

* `createStage()` is allowed to throw (it already does — `new WebGLRenderer`
  throws on context-creation failure). It additionally attaches a
  `webglcontextlost` listener that calls `opts.onContextLost`.

### 2.6 `a11y.js` — the carried-forward defect

`role="listitem"` currently sits on the `<button>`, which overrides the implicit
`button` role: a screen reader announces a list item, not a button, and the
"press Enter" affordance disappears. Untouched since phase 4.

Fix: each entry becomes

```html
<div role="listitem" style="…clip-hidden…"><button type="button" aria-label="…">…</button></div>
```

The clip-hidden CSS moves to the wrapper (standard visually-hidden pattern —
the button inside stays a plain focusable button with no role override). Root
`aria-label` becomes *"Everything in this room"* — it is no longer only books
and doorways. `?mirror=1`'s un-hiding CSS in the harness moves to the wrapper
too.

### 2.7 `interact.js`

* `makeController()` gains `onHover(fn)`, symmetric with `onActivate(fn)` and
  returning the same unsubscribe. Both input paths already funnel through
  `hover()`, so this is one `Set` and two lines — and it is what lets the
  `.tag` work identically for mouse and for Tab.
* `pick()` takes the nearest **visible** hit, not the nearest hit.
  `Raycaster` does *not* skip invisible objects (checked in
  `vendor/three/build/three.core.js` — `intersect()` tests `object.layers`
  only), and §5 leaves 48 of the front table's books invisible in the room
  pose. Without this they are clickable through the table top.

### 2.8 `poses.js`

* `attachPoseControls(stage, rig, { keys = true })` — `keys:false` attaches
  wheel and pinch but no `keydown`. See §0.
* `tableObstacleBox(tb)` prefers `tb.box` (a `THREE.Box3` from `tables.js`)
  over `tb.group`. The group's bounds now depend on where the spread animation
  happens to be when `obstacles()` first runs and caches — a camera pose whose
  chosen lift depends on animation timing is non-deterministic, which is worse
  than being slightly wrong. `tables.js` publishes one analytic box covering
  the frame plus the tallest book in **either** layout.

### 2.9 `covers.js`

Delete `spineRun()` (§4.6 — the side shelves are real meshes now, and its only
caller goes with `scene.js`). Everything else in the file stays; `fillerStyle()`
in particular, even though its last caller also goes — no. **Check that.** If
nothing calls `fillerStyle()` after `scene.js` goes, it is dead too; decide it
explicitly in review and record whichever way it lands.

---

## 3. `fronttable` stops being a room

`tables.js` already models it correctly. The data is ready; the routing is not.
It is still a full room record, in the route, the plan, the breadcrumbs, and
the shelf overlay's "Doors out of this room".

**`shop.js` gains the vocabulary** so no consumer re-derives it:

```js
export const isTable = (id) => !!ROOM_BY_ID[id]?.viaTable;
export const standIn = (id) => (isTable(id) ? ROOM_BY_ID[id].parent : id);  // where you actually stand
export const tableOf = (id) => ROOM_BY_ID[id]?.children.find(k => k.viaTable) || null;
```

Then:

| site | change |
|---|---|
| **route** | `fromHash()` resolves a table id through `standIn()`, `replaceState`s the hash to `#/front`, and queues `rig.goTo('table:fronttable')` once the room is built. `#/fronttable` and `#/fronttable/<book>` keep working as inbound deep links — they are in the wild in this repo's own docs — and normalise on arrival. Poses never write to the URL (§4.3: "no route change, no entry in `history`"). |
| **`go()`** | `go('fronttable')` from anywhere (the plan, search, a stale link) resolves the same way: travel to `front`, then the table pose. |
| **`openBook()`** | writes `#/${standIn(book.room)}/${id}`, so a table book's URL is `#/front/<id>` rather than `#/fronttable/<id>`. |
| **breadcrumbs** | never reached, because the route never lands there. `paintChrome()` is handed `front`. |
| **the plan** (`views/map.js`) | `offFront` filters `viaTable` children out of the grid. The table appears once, in its own line under the front room, marked as a table and not a room: *"On the table — The Front Table · New & Much Talked About · 58 books"*. Clicking it goes to `front` + the table pose. |
| **the shelf overlay** | `room.children` filtered by `!viaTable` for "Doors out of this room" — and the table's books are appended under their own heading, *"On the front table"*. Without this the 58 books become unreachable in the text UI, which is exactly the UI the no-WebGL fallback depends on. |
| **`STATS.rooms`** | counts non-table rooms → **49**. |
| **search** | a table still matches as a result; its `res__where` reads "on the front table" rather than a book count. Clicking navigates as above. |

---

## 4. The no-WebGL fallback (§4.7)

`createStage()` throws → `flat(err)`:

1. `document.body.classList.add('is-flat')`, `#flat` unhidden. It says what
   happened and what to do: *"This browser could not start WebGL, so the rooms
   cannot be drawn. Everything in the shop is still here as a list — press S
   for this shelf, / to search, M for the plan."*
2. The shelf overlay is opened — the existing complete text UI, per §4.7.
3. It is re-opened after every room change, 420 ms after the paint and only if
   all four overlays are hidden and the book panel is closed. Clicking a
   doorway in the shelf list therefore walks you to the next room and shows you
   its shelf, which is a usable way round the whole shop with no canvas at all.

`go()` skips the scene entirely when `stage` is null; routing, state, hash,
persistence, chrome, the placard and the dock all still work. The same path is
reached from `webglcontextlost`.

**Forcing it for the test**: a Playwright init script that makes
`HTMLCanvasElement.prototype.getContext` return `null` for `webgl2`/`webgl` —
a real context-creation failure, not a mocked flag.

---

## 5. The table: fewer books in the room, all of them in the table pose

### 5.1 The measurement

`fitCoverGrid(n, 470, 300)` — usable area 382 × 228, best-area column count:

| n | grid | cover (world units) | at the room pose, on a 1000 px viewport |
|---|---|---|---|
| 4 | 4 × 1 | **80.2 × 120.3** | ~105 px tall |
| 6 | 3 × 2 | 63.8 × 95.7 | ~84 px |
| **10** | **5 × 2** | **63.8 × 95.7** | **~84 px** |
| 12 | 6 × 2 | 53.5 × 80.2 | ~70 px |
| 15 | 5 × 3 | 42.6 × 63.8 | ~56 px  ← phase 7's measured figure |
| **58** | **6 × 10** | **12.8 × 19.2** | **~17 px**  ← today |

Two rows is where the table's *depth* stops binding: 6, 8 and 10 books all
produce the same 63.8 × 95.7 cover, so ten is the number that fills the table
without costing size (5 × 63.8 = 319 of 382 usable width). **Ten in the room
pose, all 58 in the table pose.** Which ten: the first ten of the table's own
list, which `shop.js` already sorts picks-first — so the front table shows the
shopkeeper's picks, in shelf order, and the harvested prize lists appear when
you walk up to it.

### 5.2 How

`tables.js` computes **two layouts** — `roomLayout` (featured books only) and
`tableLayout` (every book) — and each book mesh carries both. Geometry becomes
**one shared unit `BoxGeometry(1,1,1)`** for every table book, with
`mesh.scale = (coverW, thickness, coverH)`; a layout change is then a lerp of
`position` and `scale` and nothing else. (Box UVs are per-face 0–1, so scaling
never distorts a cover.)

```js
tableRig.tick(nowMs)         // called from room.js's single frame callback
tableRig.setSpread(target)   // 0 = room layout, 1 = table layout
```

`room.js` sets the target from the rig each frame — `rig.current === 'table:<id>'`
→ 1, else 0 — and eases `u` toward it over the same 700 ms `TWEEN_MS` with the
same cubic-in-out, so the books spread as the camera arrives rather than
snapping when it lands. Non-featured books get a small per-book stagger
(`delay = 0.3 * i / n`) so the table fills rather than pops. `reducedMotion`
jumps: `u` is set, not eased.

A non-featured book is `visible = false` at `u = 0` (and §2.7 makes picking
skip it). **It stays in the a11y mirror and stays focusable** — hiding 48 books
from the keyboard to serve a camera decision would be a real accessibility
regression, and focusing one already flies to `table:<id>` via
`focusEntry()`'s `entry.tableId` branch, which spreads them out. Pointer and
keyboard therefore agree: you can reach any book on the table, and the ones you
cannot see you reach by going to the table.

Rooms whose table holds ≤ 10 books (`cartographer`, `longtable`, 4 each) get
two identical layouts and `setSpread` is a no-op. No special case needed.

### 5.3 Judged by eye, not by arithmetic

Screenshot `front` at `pose=room` and at `pose=table:fronttable`, plus the
transition mid-way, and iterate on the featured count and the grid until it
genuinely looks good. The table above is where to start, not where to stop.

---

## 6. `tools/qa.mjs`, rewritten (`IMPLEMENTATION.md` §7)

Keeps, unchanged: the ART viewBox check, the data-integrity block (ids, fields,
provenance, held-back opening lines, ISBN check digits, `note` optional), the
outbound-link checks, the search / parcel round trips.

Replaces every DOM-scene assertion:

| §7 asks | how |
|---|---|
| the canvas exists and a room renders | after settle, `renderer.render()` then `gl.readPixels()` on a downsampled grid, in-page. Assert the frame is non-uniform (variance above a floor), in a sane luminance band, and that its 8×8 signature **differs from the previous room's**. There is no committed baseline to diff against and inventing one this phase is a trap — a signature sweep catches "every room renders the same grey box", which is what a baseline diff was for. |
| one focusable control per book, door and table | `mirror.root.querySelectorAll('button').length === entries + doorEntries + cases + (table ? 1 + tableEntries : 0)`, every one with a non-empty accessible name, every one inside a `role="listitem"` wrapper, and **no button carrying a `role` attribute of its own**. |
| keyboard: tab to a book, Enter opens the panel | focus the first mirror button, `keyboard.press('Enter')`, assert `#sheet` is open and `.bd__title` is non-empty. |
| every pose reachable, Escape returns to `room` | `rig.poseNames()`, `goTo` each, settle on `!rig.tweening`, assert `rig.current === name`; then Escape until `rig.current === 'room'`. |
| no `filter` on a `preserve-3d` node | unchanged in spirit — now only the book panel's `.hold` can violate it. |
| zero filler spines | the modern form: every mesh is a real book. `entries.length + tableEntries.length === booksIn(room).length` (+ the table's own list where the table borrows a `viaTable` child's shelf), and every entry's `book.id` resolves in `BOOK_BY_ID`. |

New: `#/fronttable` normalises to `#/front` and lands in the table pose; the
plan lists 49 rooms and no table; the shelf overlay lists the table's books and
no table door.

**Settle condition** — a real condition, never a timeout:

```js
window.__shop.state.room === id && !window.__shop.state.travelling
  && window.__room?.isReady && window.__stage.frame > 5 && !window.__room.rig?.tweening
```

`state.travelling` is promoted from a module-local to a field on `state` for
exactly this. The `--shots` path stays, because the only test for "the warmth
survived" is a human looking at it.

---

## 7. Verification

`npm start` on :8099 — **check what is answering first**
(`curl -sI --noproxy '*' http://127.0.0.1:8099/ | grep -i server`; a
`SimpleHTTP/0.6` reply is the wrong answer). `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
Scratch scripts at `tools/_scratch-*.mjs`, deleted before the commit.

1. **All 50 room records render on the live site, fresh page per room**, zero
   console errors, zero page errors, zero failed requests. `fronttable` renders
   as `front` + the table pose.
2. Routing: deep links, `hashchange`, browser back/forward, the dock's Back and
   Home, breadcrumbs, the plan, the shelf overlay.
3. Book panel from a click and from the keyboard; the parcel persists across a
   reload.
4. A11y mirror: counts, names, no role override, Tab order.
5. Escape from a pose returns to `room` and does **not** navigate; Escape in
   the `room` pose navigates to the parent.
6. The no-WebGL fallback, forced by nulling `getContext`, is usable: the notice
   shows, the shelf opens, and a doorway in the shelf list walks you to the
   next room and shows you its shelf.
7. **Phase 7's occlusion item, re-measured on the live build**: ray-vs-`Box3`
   per bottom-row book from `shelf:back` in `front`, `cartographer`,
   `longtable`, and in `oak`/`saltline` as the no-table control. Report the
   camera and the blocked count for each, as phase 9 did.
8. Teardown: walk 30 rooms, then assert the scene holds exactly one
   `room:<id>` group and that `renderer.info.memory.geometries`/`.textures`
   are not growing without bound.
9. `tools/qa.mjs` passes in its rewritten form.
10. Screenshots of `front`, `longroom`, `orrery`, `oak`, `cartographer` judged
    **by eye against the old build's** — the warmth has to survive, not just
    the geometry. Settle before every one.

---

## 8. Not in this phase

* Descriptions backfill — phase 11, and `DESCRIPTIONS-FEASIBILITY.md` already
  measured the sources. Do not re-probe them.
* Filling the side cases (the `CASE_ROWS`/`FILL` budget in `tools/harvest.mjs`).
  It doubles page weight, and the swap-over is enough risk for one phase.
  Carried to the handoff with the numbers.
* The four keyboard shortcuts that do not guard modifiers (`m`, `p`, `s`, `b` —
  ⌘P opens the parcel *and* the print dialog). Documented since phase 8;
  normalise all five at once or none, and this phase is already touching the
  keyboard for other reasons — **decide it in review**, do not drift into it.
* Back's `closeBook()` hash bug (phase 8).
* Any real screen-reader run. Nobody has done one and this phase cannot.
