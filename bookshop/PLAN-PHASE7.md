# Phase 7 implementation plan — Tables and camera poses

Brief: `IMPLEMENTATION.md` §3 row 7 ("Tables and camera poses", points 1, 6,
10, depends on 4), §4.3 (poses), `PLAN.md` points 1 / 6+8 / 10,
`PLAN-ARCH.md` "Camera poses — points 6, 8 and 10", `HANDOFF-PHASE7.md`.

Same discipline as phases 3–6: **everything lands under `src/js/scene/` and
`tools/preview-stage.html`.** `main.js`, `index.html`, `scene.js`,
`scene.css`, `themes.css`, `views/*` are NOT touched. The swap-over of the
live site to the three.js stage is not this phase's job, and neither is
retiring `fronttable` as a route (that is `main.js`/`views/map.js` work).

---

## 0. Scope decisions made up front

| Question | Decision | Why |
|---|---|---|
| Which rooms get a table? | `front` (via its `viaTable` child `fronttable`), plus rooms whose **name** matches `/table/i` and are not themselves `viaTable` → `cartographer`, `longtable`. 3 of 50. | PLAN.md point 10 states exactly this rule. |
| Where does a table sit? | Ported from `scene.js`'s `TABLE = {w:470,h:232,d:300,z:-330}` + its `-w/2-300` x offset → three.js box x −535…−65, z −630…−330, top surface y = 232. | `HANDOFF-PHASE7.md` asks whether `floor-c`/`floor-cl` should be used. **Answer: no** — those are prop-box anchors (a single z plane, height growing floor-ward), and a table needs a *depth run* in z plus a top surface. The CSS `TABLE` constant is authored, shipped geometry; `floor-c/cl` are unused reserved slots. Record this answer in the handoff. |
| What books go on a table? | `book.onTable === true` if present; else, for a `viaTable` child, **all of that child's books** (`fronttable`'s 15 — a genuinely separate selection); else (`cartographer`, `longtable`) a deterministic pick from the room's own books, **removed from the shelf list** so no book appears twice. | PLAN.md point 10: "a table carries its own selection, separate from the room's shelf". `onTable` does not exist in the data until phase 9 — this is the interim rule, and it is one `filter` away from becoming the real one. |
| Atlas re-render at higher resolution in a shelf pose (§4.6) | **Measure first, implement only if needed.** Current `ATLAS_SCALE = 3` px/world-unit; at the shelf distance derived below a 22-unit spine subtends ≈35 screen px while carrying 66 atlas px, i.e. the atlas is already ~2× oversampled. Screenshot the shelf pose; only if titles read mushy do we add the re-render. | Same "check before re-implementing" move phase 6 made for `--art-filter` depth dimming, and it is the honest reading of "that is the only time the resolution is visible". |
| Point 10's DOM overlay table view (`views/table.js`) | **Not built.** On this substrate the table view *is* a camera pose looking down at a table that actually exists — PLAN-ARCH.md says so explicitly ("No overlay, no view pretending to be a room"). | PLAN.md point 10 was written against the CSS substrate. |

---

## 1. Files

```
NEW  src/js/scene/tables.js     table geometry, cover textures, book layout, entries
NEW  src/js/scene/poses.js      named camera poses, tweening, dolly, controls
EDIT src/js/scene/books.js      return `cases` descriptors; tag entries with .caseId
EDIT src/js/scene/interact.js   attachScenePicking() (nearest-hit across all kinds), createPoseController()
EDIT src/js/scene/a11y.js       optional opts.onFocus(entry) hook (fills the TODO(phase 7))
EDIT src/js/scene/stage.js      stage.onFrame(cb) — per-frame callbacks, run before render
EDIT src/js/scene/textures.js   svgTexture() — hoisted SVG→canvas→Texture helper
EDIT src/js/scene/props.js      artTexture() uses the hoisted helper instead of its own copy
EDIT tools/preview-stage.html   wire tables + poses; ?tables=0 ?poses=0 ?pose= ?reduced=1
```

---

## 2. API contracts (fixed — implementers must match these exactly)

### 2.1 `stage.js`

```js
createStage(canvas, opts) → { …existing…, onFrame(fn): () => void }
```
`tick()` calls every registered callback with `performance.now()` **before**
`renderer.render()`, so a camera tween is applied to the frame it belongs to.
Existing behaviour (`dataset.frame`, `start/stop/dispose`) unchanged.

### 2.2 `textures.js`

```js
/** SVG markup → { texture: THREE.Texture, aspect: number, ready: Promise<void> } */
export function svgTexture(markup, { scale = 4, maxPx = 1600 } = {})
```
Exactly `props.js`'s current `artTexture()` internals, minus the `ART`
lookup and the cache: read `viewBox` w/h by regex (synchronously — callers
size geometry from `aspect` without waiting on decode), rasterise via
`new Image()` → `ctx.drawImage(img, 0, 0, W, H)` into a canvas of the
caller's chosen size, never `TextureLoader` on the data URI. **Keep
`props.js`'s doc comment explaining why** (moved, not deleted). `onerror`
resolves `ready` anyway rather than hanging `Promise.all` forever.

`props.js`'s `artTexture()` keeps its own `artCache` and its ART-args
handling; only the rasterise step delegates. Its observable behaviour must
not change.

### 2.3 `books.js`

`buildRoomBooks(room, books)` return value gains `cases`:

```js
{ group, entries, atlas,
  cases: [ {
    id: 'back' | 'left' | 'right',
    group: THREE.Group,     // the case group (already positioned/rotated)
    w, ch, depth,           // local dims: ch = rows*(ROW_H+BOARD)+26 = 530
    entry: {                // a pose target, shaped like a door entry
      caseId, meshes: [...carcass meshes, sensor],
      ariaLabel, setHighlight(on),
      pose: 'shelf:<caseId>',
    },
  } ]
}
```

* Every carcass mesh gets `userData.entry = caseEntry`, **plus** one
  invisible `PlaneGeometry(w, ch)` sensor at local `(w/2, ch/2, depth - 12)`
  (`MeshBasicMaterial{transparent:true, opacity:0, depthWrite:false}`, same
  recipe as `doors.js`'s sensor) so rays through the gaps between spines
  still land on the case. **12 units behind the spine plane** (spines front
  at `depth - 6`) so a book is always the nearer hit — this is what stops a
  click on a book from also triggering the shelf pose.
* `setHighlight(on)` sets `emissive`/`emissiveIntensity` on the case's own
  `matWood`/`matDark` (per-case instances already — `buildCarcass()` creates
  them per call), 0x2a2114 @ 0.35 on, black @ 0 off. Replaces CSS's
  grouping-property `filter` hover (Finding B) with the emissive change
  PLAN-ARCH.md point 1 asks for.
* `ariaLabel`: `Step up to the shelves on the back wall` /
  `… on the left wall` / `… on the right wall`.
* Each **book** entry gains `.caseId` (`'back'` for every real book today —
  side cases hold only filler — but set it from the case being built, not
  hard-coded), so a11y focus can fly to the right shelf.

Nothing else in `books.js` changes. Do **not** touch `sideCaseSpec()`,
`planBackRows()`, the atlas, or the packing constants.

### 2.4 `interact.js`

```js
export function createPoseController()   // 'pose:go', detail {pose, entry}
export function attachScenePicking(stage, groups, opts) → detach
//   groups: [{ entries, controller }, …]   opts: { onMiss?: () => void }
```

* One raycaster, one flat mesh list built from `entry.meshes || [entry.mesh]`,
  **nearest hit across all groups wins** — this is the whole point: separate
  raycasters per kind would fire a book-open *and* a shelf-pose from one
  click.
* Resolve `hits[0].object.userData.entry`; its controller is
  `entry.controller || <its group's controller>` (keeps the caller-side
  `.controller` tag convention `HANDOFF-PHASE6.md` asks to preserve).
* On hover: `hover(entry)` on the owning controller, `hover(null)` on all
  others. Set `canvas.style.cursor = entry ? 'pointer' : ''`.
* On click with no hit: `opts.onMiss?.()` — PLAN.md point 6's "a click on
  empty floor steps out".
* `attachPointerPicking()` / `attachDoorPicking()` stay exported and become
  one-line wrappers over `attachScenePicking()` — one implementation, no
  behaviour change for existing callers.

`createPoseController()` covers **both** case entries and table entries
(both mean "move the camera to this pose"; they can never be hovered at
once). Table *books* keep using the book controller — clicking a book on the
table opens the panel, exactly as on a shelf.

### 2.5 `a11y.js`

```js
mountA11yMirror(container, entries, controller, opts = {})
//   opts.onFocus?: (entry) => void
```
Called from the existing `focus` listener, after `ctl.hover(entry)`. This is
the `TODO(phase 7)` comment's exact call site — **delete the TODO** and
replace it with a comment saying focus-flies-to-pose is now wired through
`opts.onFocus` by the caller (so `a11y.js` still knows nothing about
cameras). `addEntry()` must honour the same hook for late-added entries.

### 2.6 `tables.js` (new)

```js
export const TABLE = { w: 470, h: 232, d: 300, x0: -535, zNear: -330 };

/** Decide what this room's table (if any) holds, and what's left on the shelf.
 * @param room       a ROOMS entry
 * @param roomBooks  the room's own books (shop.js's booksIn(room.id))
 * @param booksFor   (roomId) => book[]  — used only to read a viaTable child
 * @returns {{ shelfBooks, table: null | {id, name, sub, books} }}
 */
export function planRoomTable(room, roomBooks, booksFor)

/** @returns {{ group, tableEntry, bookEntries, ready, surface }} */
export function buildRoomTable(room, table)
```

`planRoomTable` rules, in order:
1. `viaTable` child exists → `table = {id: child.id, name: child.name,
   sub: child.sub, books: booksFor(child.id)}`, `shelfBooks = roomBooks`
   (unchanged — the child's books were never on this room's shelf).
2. else `/table/i.test(room.name) && !room.viaTable` → candidates =
   `roomBooks.filter(b => b.onTable)`; if empty, sort a **copy** of
   `roomBooks` by `(won?.length || 0)` desc, then `year` desc, then `id`
   asc (a total order — no ties, so it is deterministic), take
   `Math.min(4, Math.floor(n / 2))`. `shelfBooks` = the rest, in the
   original shelf order. `table.id = `${room.id}:table``,
   `name = room.name`, `sub = room.sub`.
3. else `{shelfBooks: roomBooks, table: null}`.

`buildRoomTable` geometry (all `MeshStandardMaterial`, colours from
`room.pal` — `wood`, `wood-lit`, `wood-dark`, exactly the CSS custom
properties `.table3d__*` reads):

* **top** `BoxGeometry(w, 18, d)` centred at `(cx, 232-9, cz)`, top face
  carrying a canvas plank texture (see below).
* **apron** `BoxGeometry(w, 30, 12)` at the near edge (z = −330 − 6), top
  flush with the underside of the slab (y 184…214).
* **two side rails** `BoxGeometry(12, 30, d - 24)`, same y band, at the
  left/right edges — PLAN.md point 1 names "top, apron, two side rails,
  four legs, stacks" as the shape that reads as a table.
* **four legs** `BoxGeometry(20, 214, 20)` at the corners inset 14 units,
  y 0…214. **Under the corners of the top** — the root cause of point 1 was
  legs that were not; make this obviously true by deriving leg x/z from the
  top's own extents.
* **plank texture**: canvas, `mix()`/`pinstripe()` from `textures.js`
  (props.js's precedent), reproducing `.table3d__top`'s
  `repeating-linear-gradient(96deg, transparent 0 34px, rgba(0,0,0,.10)
  34px 38px)` over a `wood-dark → wood → wood-lit` vertical gradient. Worth
  the effort here specifically because the `table:<id>` pose looks straight
  down at this surface.

**Books on the table** — laid flat, covers up:

* Grid fit: usable area is `(w - 2*44) × (d - 2*36)`. For `cols` in 1…6
  compute `rows = ceil(n/cols)`, cell = usable/cols × usable/rows, then the
  largest 2:3 (100:150, `coverSVG`'s viewBox) cover that fits the cell with
  an 8% gutter; **pick the `cols` maximising cover area**, cap cover width
  at 130 world units. (15 books → 5×3, cover ≈ 63×95. At the table pose
  that is ~250 screen px tall — legible.)
* Each book: `BoxGeometry(coverW, thickness, coverH)` lying flat, where
  `thickness = clamp(shelfSize(book).t * (coverW / 100), 6, 30)` — the
  book's real spine width, scaled by the same factor the cover is.
* Materials in BoxGeometry's `[+x,-x,+y,-y,+z,-z]` order:
  `[page, page, coverMat, backMat, page, page]` — **+y is the cover**
  (`map = svgTexture(coverSVG(book, {w:200,h:300}))`, `colorSpace` sRGB),
  back is a solid darkened cover colour, sides share one page-block
  material (`#e9dec5`, matching `books.js`'s `pageMaterial()`).
* Placement: cell centre + deterministic jitter and rotation from
  `hash(book.id)` (covers.js exports `hash`) — `mesh.rotation.y = ±4°`,
  jitter ≤ 6 units in x/z. Rests **on** the top: `y = 232 + thickness/2`.
* Per-book entry: `{book, index, mesh, tableId, caseId: null,
  ariaLabel: `${title} by ${author}. Take it off the table.`,
  setHighlight(on)}` — highlight lifts the book `+8` in y and sets the same
  emissive as `books.js`'s `HOVER_EMISSIVE` on the cover material (a lift
  *toward the camera* is wrong for a book lying flat; up is the equivalent
  gesture).
* `tableEntry`: `{tableId, meshes:[top, apron, rails…, legs…], pose:
  `table:<id>`, ariaLabel: `Look at the display table: ${name}${sub ? ' — '
  + sub : ''}`, setHighlight(on)}` — emissive on the top + apron materials
  (PLAN-ARCH point 1: "Hover is an emissive change on a material").
* `surface`: `{center: THREE.Vector3(cx, 232, cz), w, d}` — what `poses.js`
  needs, so it never re-derives the table's placement.
* `ready`: `Promise.all` of every cover's `svgTexture().ready` — the
  settle-before-screenshot signal, same contract as `props.js`'s `ready`.

### 2.7 `poses.js` (new)

```js
export function createPoseRig(stage, opts = {}) → rig
//   opts: { cases: [], tables: [], reducedMotion?: boolean }
```

`rig`:
```
rig.goTo(name, { instant = false })   // 'room' | 'shelf:<caseId>' | 'table:<id>'
rig.back()                            // pop the stack; empty → 'room'
rig.dolly(delta)                      // wheel/pinch, delta in [-1,1] units of t
rig.focusEntry(entry)                 // entry.pose | entry.caseId | entry.tableId → goTo
rig.update(nowMs)                     // stage.onFrame drives this
rig.current                           // pose name
rig.tweening                          // boolean
rig.t                                 // 0..1 dolly/tween parameter (tests)
rig.poseNames()                       // for the harness HUD + tests
```

Camera model: every pose is `{position: Vector3, target: Vector3}`. The rig
holds `from`, `to`, `t`, and each frame sets
`camera.position.lerpVectors(from.position, to.position, e)` and
`camera.lookAt(lerp(from.target, to.target, e))`. Two drivers of `t`:
`goTo` animates it 0→1 over `TWEEN_MS`; `dolly` sets it directly. **One
lerp, two drivers** — do not build a second animation path.

* `TWEEN_MS = 700`, ease cubic-in-out (`t<.5 ? 4t³ : 1-(-2t+2)³/2`).
* Reduced motion: `opts.reducedMotion ?? matchMedia('(prefers-reduced-motion:
  reduce)').matches` → duration 0, i.e. jump. (§4.3, PLAN.md point 6.)
* **`room` pose must be byte-identical to `makeCamera()`'s framing**: build
  it from `stage.js`'s exported `CAMERA` (`position (0, WORLD.h/2,
  CAMERA.eyeZ)`, `target (0, CAMERA.lookY, CAMERA.lookZ)`). Import the
  constant; do not retype the numbers.
* **`shelf:<caseId>`**, computed at `goTo` time (so a resize is picked up):
  ```
  c.group.updateWorldMatrix(true, false);
  face   = c.group.localToWorld(new Vector3(c.w/2, c.ch/2, c.depth));
  normal = c.group.localToWorld(new Vector3(c.w/2, c.ch/2, c.depth + 1)).sub(face).normalize();
  dist   = max((c.ch/2 + 30) / tan(fovRad/2), 420);
  pose   = { position: face.clone().addScaledVector(normal, dist), target: face };
  ```
  Deriving the normal from the group's own matrix rather than by hand is
  deliberate — `books.js`'s rotation handedness has already been re-derived
  twice in this repo (see its own and `passages.js`'s comments); this makes
  it impossible to get wrong a third time. `dist ≈ 947` for the standard
  530-tall case: ~2.9× closer than the room pose, and a 22-unit spine
  subtends ≈35 screen px at 900px viewport height.
* **`table:<id>`**: essentially straight down, tilted 14° off vertical:
  ```
  vt = tan(fovRad/2); ht = vt * camera.aspect;
  dist = max(d/2 / vt, w/2 / ht) * 1.12;
  pos  = center + (0, dist*cos(14°), dist*sin(14°));   // clamp pos.y ≤ WORLD.h - 40
  ```
  **Not literally straight down**: a camera looking along −y with the
  default `up = (0,1,0)` is degenerate (`lookAt` produces an undefined
  basis). The 14° tilt avoids that without touching `camera.up`, which
  would otherwise have to be interpolated too. Document as a deliberate
  deviation from §4.3's "straight down".
* Stack: `goTo` pushes the previous pose name (cap 8, drop the oldest);
  `back()` pops; `back()` at 'room' is a no-op. Escape → `back()`.
* Dolly: target pose = the shelf pose whose **position** is nearest the
  camera's current position (from the room pose that is the back case;
  deterministic, no projection maths). `dolly()` sets `from = room pose`,
  `to = that shelf pose`, `t = clamp(t + delta, 0, 1)`, cancels any running
  tween, and sets `current` to `'room'` at t=0, `'shelf:<id>'` at t=1,
  `'dolly'` in between.

```js
export function attachPoseControls(stage, rig, opts = {}) → detach
```
* `wheel` on the canvas, `{passive:false}` + `preventDefault()` (never let
  the page scroll under the stage): `rig.dolly(-e.deltaY * 0.0012)`.
* pinch: track pointers in a `Map` on `pointerdown/move/up/cancel`; with
  exactly 2 down, `rig.dolly((distNow - distPrev) * 0.0016)`.
* `keydown` on `window`: `Escape` → `rig.back()`; `ArrowLeft` /
  `ArrowRight` / `ArrowUp` → `shelf:left` / `shelf:right` / `shelf:back`
  when that case exists (PLAN.md point 6). Ignore when the event target is
  an `<input>`/`<textarea>` or when a modifier key is held. **Do not**
  intercept Tab/Enter/Space — the a11y mirror owns those.
* Everything is `detach`able, and the harness skips attaching when
  `?orbit=1` (OrbitControls owns the camera then).

---

## 3. Harness (`tools/preview-stage.html`)

* Order: `planRoomTable()` → `buildRoomBooks(room, shelfBooks)` →
  doors → props → `buildRoomTable()` → `createPoseRig` →
  `attachScenePicking` → `attachPoseControls`.
* One `attachScenePicking(stage, groups, {onMiss})` call replaces the two
  `attachPointerPicking`/`attachDoorPicking` calls. Groups, in order:
  books+table-books (book controller), doors (door controller),
  cases+table (pose controller). `onMiss: () => rig.back()`.
* Mirror order: shelf books → doors → cases → table → table books, all via
  `addEntry()` on the one mirror. `onFocus: (e) => rig.focusEntry(e)`.
* `poseController.onActivate(e => rig.goTo(e.pose))`.
* `stage.onFrame(rig.update)`.
* New params: `?tables=0`, `?poses=0` (fixed §4.2 camera, no rig),
  `?pose=<name>` (start there, instant), `?reduced=1` (force jump).
  Existing params keep working unchanged.
* HUD gains `pose: <current>  t: <n>  tweening: <bool>` and a table line.
* Expose `window.__poseRig`, `window.__cases`, `window.__tableRig`,
  `window.__tableEntries`, and `window.__tablesReady` (a plain **boolean**,
  set from `ready.then()` — Playwright cannot carry a Promise across the
  bridge; same reason `__propsReady` is a boolean).
* Update the file's header comment block for phase 7, same style as the
  phase 5/6 additions.

---

## 4. Verification (Playwright, `tools/_scratch-*.mjs`, deleted before commit)

Settle condition — never a fixed timeout:
`canvas.dataset.frame > 5 && __propsReady && (__tablesReady !== false) &&
!__poseRig?.tweening`.

1. **All 50 rooms, zero console errors**, fresh page per room. (A full
   sweep takes minutes on this machine — background it and wait for exit,
   per HANDOFF-PHASE6/7's note.)
2. **Table rooms** (`front`, `cartographer`, `longtable`): `Box3` overlap
   sweep of every table mesh against `case:back`/`left`/`right`, every door
   sensor, and every prop mesh (excluding `prop-shadow` decals). Same
   `Box3.intersectsBox()` technique phases 5 and 6 both used. Expect 0
   overlaps; if any, nudge the *table* (never the case — phase 4/5's sizing
   is verified against doors).
3. **No book appears twice**: for the 3 table rooms, assert the shelf entry
   ids and table book entry ids are disjoint, and that their union equals
   the expected set.
4. **Every pose is reachable and Escape returns to `room`** (§7's QA list):
   for `front`, `goTo` each of `room`, `shelf:back`, `shelf:left`,
   `shelf:right`, `table:fronttable`; assert `tweening` goes true→false,
   the camera lands within 1 unit of the computed pose position, the
   camera stays inside the room box, then `Escape` → `current === 'room'`.
5. **Dolly**: wheel events move `t` monotonically and move the camera;
   clamped at 0 and 1.
6. **Reduced motion** (`?reduced=1`): `goTo` completes within one frame
   (`tweening === false` immediately after).
7. **Screenshots**: room pose (table reads as a table — legs under the
   corners, no hover jump), `table:fronttable` (covers legible, no white or
   black box around any cover — the `coverSVG` grain filter rasterising is
   the specific risk), `shelf:back` (**judge spine legibility here** and
   report whether the §4.6 hi-res atlas re-render is actually needed),
   `shelf:left` (a side case seen square-on — point 6's whole purpose).
8. **a11y**: focusing a shelf-book button flies to `shelf:back`; focusing a
   case button flies to that shelf pose; focusing a table-book button flies
   to the table pose; Tab order is shelf books → doors → cases → table →
   table books; every button has a non-empty accessible name.
9. **Hover does not move the table** (point 1's original symptom): sample
   the table top's world position before/during/after hover — must be
   identical.

---

## 5. Sub-agent breakdown (Sonnet, effort per CLAUDE.md)

* **Round 1, parallel** (disjoint files):
  * **A (high)** — `textures.js` `svgTexture()`, `props.js` delegation,
    `tables.js` in full.
  * **B (high)** — `books.js` `cases`, `interact.js` `attachScenePicking()`
    + `createPoseController()`, `a11y.js` `onFocus`, `stage.js` `onFrame`.
* **Round 2** — **C (high)**: `poses.js` + harness wiring + params + HUD.
* **Round 3** — **D (high)**: the verification sweep above; report only.
* **Round 4** — Opus code review of the whole diff → scoped fix tasks to
  Sonnet (high) → Opus writes `HANDOFF-PHASE8.md`.

Sub-agents that hit an architectural call not in this plan stop and hand
back rather than improvising.

---

## 6. Traps for implementers (all already paid for once in this repo)

* `dy`/y-flip: never re-derive. `coords.js` is the one conversion site.
* `filter`/`opacity`/`mask` are grouping properties — the hover affordance
  is **emissive on a material**, never a filter (Finding B).
* Do not touch `sideCaseSpec()`, `BAY`, `doorSlots()`, `SLOT`, or the atlas
  packing — all verified against door/case overlap in phases 4–6.
* `rm` is aliased to `rm -i` on this machine; use `rm -f` for scratch files.
* Serve with `python3 -m http.server 8099` from the repo root; `npm start`
  does not serve `/tools`.
* `fillerStyle()`/`spineStyle()` emit CSS gradient strings — three.js's
  `Color.setStyle()` only parses comma-separated `hsl()`. Anything new that
  reads a colour out of `covers.js` must go through hex (phase 6's bug).
