# Handoff — phase 7 done, phase 8 next

Phase 7 ("Tables and camera poses", `IMPLEMENTATION.md` §3 row 7, points
1, 6, 10) is **complete: planned, implemented, reviewed, adjusted and
verified.** `HANDOFF-PHASE7-WIP.md` has been **deleted** in the same
commit — it described a mid-workflow stop and its "one known bug" is
fixed, so leaving it would tell a fresh session that phase 7 is still
unreviewed. It is in git history if you want the original diagnosis.
Keep `PLAN-PHASE7.md`: its API contracts are still accurate apart from
the two amendments noted below.

## Phase 8 is a different codebase from phases 3–7. Read this twice.

Phases 3–7 all landed **only** under `src/js/scene/` and
`tools/preview-stage.html`, and deliberately never touched the live
site. Phase 8 (the Dock, `PLAN.md` point 4) is the opposite: it is DOM
and CSS surgery on the **live CSS build** — `index.html`,
`src/js/main.js`, `src/styles/ui.css`. There is no three.js in it, the
preview harness is irrelevant to it, and none of phases 3–7's
verification technique (Playwright against `preview-stage.html`,
`canvas.dataset.frame` settling, `Box3` sweeps) applies. Serve the live
site with `npm start` for phase 8 — **not** `python3 -m http.server`,
which was only ever needed because `npm start` does not serve `/tools`.

Point 4 in full: *the doorways are the way through; the dock should not
compete.* Delete `#dockDoors` / `showWaysOn()` / `.godoor` /
`.dock__doors` and the dock click handler. **Decided (do not re-open):**
keep *both* back controls — the existing Back ("Back to The Hollow Oak",
one level up) plus a new always-home button beside it returning to The
Front Room from any depth, disabled in the front room itself.

Every line phase 8 has to touch, as of this commit:

| what | where |
|---|---|
| `<div class="dock__doors" id="dockDoors">` | `index.html:91` — delete |
| the `<footer class="dock">` the home button joins | `index.html:76-92`; Back is `76-80` |
| `dockDoors: $('#dockDoors')` in the `dom` map | `src/js/main.js:23` |
| the ways-on block (builds `.godoor` markup, calls `showWaysOn`) | `src/js/main.js:220-231` |
| `showWaysOn()` + its `waysTimer` | `src/js/main.js:249-255` |
| `dom.back.disabled` / `backLabel` — where the home button's own disabled state belongs | `src/js/main.js:233-236` |
| the Back click handler (the model to copy) | `src/js/main.js:556-559` |
| the `dockDoors` click handler | `src/js/main.js:561-566` |
| `.dock__doors` incl. `.is-resting` | `src/styles/ui.css:164-179` |
| `.godoor*` | `src/styles/ui.css:181-221` |
| the mobile `.dock__doors { order: 3 }` rule | `src/styles/ui.css:728` |

### Phase 8 traps

- **`go(id, dir)` (`main.js:157`) early-returns when `state.room === id`.**
  That is not a substitute for the disabled state the plan asks for —
  a home button that silently does nothing in the front room looks
  broken. Set `disabled` alongside `dom.back.disabled` at `main.js:234`,
  in the same per-room update, not once at startup.
- Home is `go('front', 'out')`. `'out'` matters: `go()`'s direction
  drives the travel animation, and arriving home "inward" reads wrong.
- **The dock's ways-on list is the only place `fronttable` currently
  shows up as a walk-to destination** — `main.js:225` uses
  `room.children` raw, without `scene.js:417`'s `.filter(k => !k.viaTable)`.
  Deleting `#dockDoors` therefore also quietly removes the last dock
  route into the table room. That is aligned with point 10, not a
  regression, but it is **not** the whole of point 10's "`fronttable`
  stops being a room": the hash route, `views/map.js` and the
  breadcrumbs still list it. That work belongs to the main.js/three.js
  swap-over, which is nobody's phase yet.
- `.godoor` markup is the one `innerHTML` sink in the dock; deleting it
  removes a sink rather than adding one. `esc()` stays in use elsewhere.
- Keyboard shortcuts already taken in `main.js`'s `window` keydown
  (`658-693`): `Escape`, `/`, `Cmd/Ctrl-K`, `m`, `p`, `s`, `b`, and
  `←`/`→` while a book is open. `h` is free if the home button wants one.
- **Never sort `.gitignore`** (last-match-wins; sorting hides
  `.env.example`). Inherited, still true.

---

# What phase 7 shipped

Committed as one commit on `claude/nowhere-bookshop-phases-7-9-p4j8th`.
`main.js`, `index.html`, `src/js/scene.js`, `scene.css`, `themes.css`,
`views/*` and every data file are untouched, same as phases 3–6. The new
stage is still reachable only through `tools/preview-stage.html`.

```
src/js/scene/tables.js     new  TABLE, roomHasTable(), planRoomTable(),
                                buildRoomTable(), tableFootprint()
src/js/scene/poses.js      new  createPoseRig(), attachPoseControls()
src/js/scene/books.js       +   buildRoomBooks() returns `cases`; book entries carry .caseId
src/js/scene/interact.js    +   attachScenePicking() (ONE raycaster, nearest hit), createPoseController()
src/js/scene/a11y.js        +   opts.onFocus(entry) — fills phase 5's TODO(phase 7)
src/js/scene/stage.js       +   stage.onFrame(cb), run before render
src/js/scene/textures.js    +   svgTexture() hoisted out of props.js
src/js/scene/props.js       ~   artTexture() delegates; propBox() = clearSideCase + clearTable
tools/preview-stage.html    +   tables + poses; ?tables=0 ?poses=0 ?pose=<name> ?reduced=1
```

## The one thing to understand about `poses.js`

`shelf:<caseId>` derives its distance from the case's own height —
`(ch/2 + 30) / tan(fov/2)` ≈ **941.5** for the standard 530-tall case.
That number takes no notice of the room. **The room is 1680 wide**, so a
side case's square-on camera lands at x ≈ ∓271 — past room centre — and
the back case occupies x -604…604, z -1214…-1000. In the 9 rooms whose
side case is pushed deep by two door bays (`used === 2` in `books.js`'s
`sideCaseSpec()`, z-centre exactly **-1019**), that put the camera
**inside the back case**: 14 poses over the 50 rooms. `front`'s
`shelf:right` was a wall of shelf boards seen edge-on.

The fix is a search, in `shelfPoseFor()`:

1. Keep the distance (it is the whole of point 8 — a 22-unit spine has
   to subtend ~35 screen px), turn the camera about world +Y as little
   as possible until it reaches free floor.
2. A candidate is accepted only if **both** (a) the camera point is
   outside every other case's / the table's `Box3` padded by
   `CLEAR_PAD = 40`, and inside the room with `ROOM_MARGIN = 40`; and
   (b) the **centre sight line** from camera to case face crosses none
   of those boxes, unpadded.
3. `DIST_SCALES` (shrink the distance) is the fallback if turning never
   works. **It never fires for the 50 rooms as they stand.**

**(b) is the part that is easy to get wrong, and I got it wrong first.**
Getting the camera *out of* the back case is not the same as getting the
back case *out of the way*: with only test (a), `front`'s `shelf:right`
settled at 8° and then looked straight along the back case's front face,
which filled the left half of the frame. Screenshot said so; the point
test did not. If you ever loosen this, re-shoot `front&pose=shelf:right`
— the metric passes long before the picture does.

Why turning and not shortening: the gap between the back case's side
panel (x 604) and a side case's face (x 670) is **66 units**. "Back off
along the normal until clear" leaves the camera 66 units from a 342-wide
case. There is no free floor square-on to a case whose centre is deeper
than the back case's front face; the only way out is around.
`PLAN.md` point 6 sanctions this in its own words — "side-wall poses
turn ~70–80° so the run is seen face-on", i.e. off square, not at 90°.

Measured over all 50 rooms, 139 shelf poses: **125 at 0°, 13 at 24°, 1
at 45°** — i.e. exactly the 14 that were broken moved, and nothing else.
Distance unchanged (941.5) in every one. **0 poses have a blocked centre
sight line.** The single 45° case is `front`'s `shelf:right`, where the
table also occupies the 24° standing spot.

`obstacles()` caches the boxes on first use. Do not remove that cache:
`dolly()` calls `nearestShelfPose()` on **every wheel event**, which is
one `shelfPoseFor()` per case, and `Box3.setFromObject()` on a case
walks all 40–80 of its book meshes. Case and table geometry never move
after build, so caching is correct as well as necessary.

## Amendments to `PLAN-PHASE7.md`'s contracts

Two, both additive:

- **§2.7** `createPoseRig(stage, {tables})` — a table descriptor is now
  `{id, surface, group?}`. `group` is used only as a clearance obstacle;
  without it a box is derived from `surface` (floor to top + 60).
- **`tables.js`** gained `roomHasTable(room)` (the has-a-table rule, data
  only) and `tableFootprint()` (the table's world AABB). Both exist so
  `props.js` can read them without book data and without re-deriving
  `TABLE`'s placement — the same split `books.js` made when it exported
  `sideCaseExists()` for phase 6.

## Decisions phase 7 made — do not re-open

- **§4.6's higher-resolution atlas re-render is not needed.**
  `ATLAS_SCALE = 3` already out-resolves the closest pose: "Piranesi",
  "Independent People", "The Rings of Saturn" are all cleanly legible in
  `front&pose=shelf:back`. Measured, then eyeballed. Do not build it.
- **`floor-c`/`floor-cl` were rejected** for table placement. They anchor
  a *prop box* — one z plane, height growing floor-ward — and a table
  needs a depth run in z plus a top surface. `TABLE` is a port of
  `scene.js`'s own authored constant. Reasoning is in `tables.js`.
- **`table:<id>` is 14° off vertical, not straight down** (§4.3 says
  "straight down"). A camera looking along −y with the default
  `up = (0,1,0)` hands `lookAt()` a degenerate basis. Deliberate;
  documented in `poses.js`.
- **No `views/table.js`.** On this substrate the table view *is* a camera
  pose looking down at a table that exists.
- **`?orbit=1` now builds no pose rig at all** (it used to build one and
  skip only the key/wheel bindings). OrbitControls' own drag ends in a
  `click` on empty floor, which `onMiss` turned into `rig.back()` — a
  700ms tween racing `controls.update()` on a different rAF loop. One
  owner of the camera at a time. `?pose=` is ignored under `?orbit=1`.

## Traps this phase paid for

- **A shelf pose that clears the geometry can still be a useless
  picture.** See above. Point tests are necessary, not sufficient.
- **`goTo()` used to restart a full 700 ms tween, and push another undo
  entry, when asked for the pose it was already in.** `a11y.js`'s
  `opts.onFocus` fires `focusEntry()` → `goTo()` **once per Tab**, so
  walking a shelf of 11 books restarted the same `shelf:back` tween 11
  times and stacked `'shelf:back'` 10 deep — Escape then did nothing
  visible for 10 presses, and `rig.tweening` never settled while the
  reader was tabbing, which is exactly the flag every screenshot waits
  on. `goTo()` now no-ops on a settled re-request and never stacks a
  pose on itself. If you add another `goTo()` caller, assume it fires
  repeatedly.
- **A table is real geometry now, so props can stand inside it.** Same
  class as phase 5's case/door overlap and phase 6's prop/case overlap,
  third time. `cartographer`'s `globe` (at `floor-l`, already nudged
  inward off the left case by phase 6's `clearSideCase()`) had its
  billboard plane passing through the table slab. `props.js`'s new
  `clearTable()` nudges it **forward in z**, not sideways: the corridor
  between the left case's inner face (x -670) and the table's left edge
  (x -535) is 135 units and the globe is 196 wide, so no x clears both.
  Only `floor-l`/`floor-r` can ever trigger it (the only SLOT entries
  whose z, -430, falls inside the table's -630…-330 run), but the test
  is a real box test so a future `dz:` cannot sneak past.
- **A table standing on a rug is not an overlap to fix.** `front`'s two
  near table legs genuinely intersect `prop-rug`'s `Box3`, and should.
  `clearTable()` excludes flat planes via `GROUNDED` (rug is at
  `SLOT.rug`, skylight at `SLOT.ceil`); the sweep excludes
  `prop-shadow` for the same reason phase 6 did.
- **`covers.js`'s `coverSVG()` viewBox is always `0 0 100 150`**
  regardless of the `{w, h}` you pass — those set the root `<svg>`'s
  width/height attributes only. `tables.js`'s `COVER_ASPECT = 150/100`
  and its `coverW / 100` thickness scale both depend on that. If a
  future caller changes the viewBox, both break silently.
- `fillerStyle()`/`spineStyle()` emit CSS gradient strings; three's
  `Color.setStyle()` only parses comma-separated `hsl()`. Anything new
  reading a colour out of `covers.js` must go through hex. (Phase 6's
  bug; `tables.js` reads `spineStyle(book).pal.bg`, which is a raw
  `PALETTES` hex, so it is safe — check any new one.)

## Known, deliberate, not fixed

- **In the 3 table rooms, the table partly occludes the bottom shelf row
  from `shelf:back`.** The camera lands at z -58.5 and the table spans
  z -630…-330, x -535…-65, so sight lines to the *left* of the case's
  bottom row pass through it. Only the centre sight line is tested, on
  purpose: clamping hard enough to clear the whole case would put the
  camera 280 units from a 1180-wide case, which is worse. Today the
  occluded books are all filler (`front` has 11 real books, all on the
  top row) — that stops being true when phase 9 lands ~2,000 books.
  Fixing it properly means moving the table or stepping the `shelf:back`
  pose around it; both are real design calls, not clamps.
- **The far end of a `used === 2` side case cannot be seen from any
  usable pose.** It sits at z -1204, behind the back case's right end;
  seeing all of it needs the camera at x ≈ 600, z ≈ -900, i.e. 138 units
  from a 342-wide case. The pose sees the near half well and that is the
  best the room shape allows.
- **`a11y.js` puts `role="listitem"` on its `<button>`s** (phase 4,
  `a11y.js:85`), which overrides the implicit `button` role — a screen
  reader announces list items, not buttons. Pre-existing, untouched by
  phase 7, and out of its scope, but it is a genuine defect: the fix is
  a wrapper element carrying `listitem` rather than the button itself.
  Every button *does* have a non-empty accessible name (verified, 34/34
  in `front`).
- **No real screen reader was run.** Same gap as phases 4–6.
- **`?orbit=1` free-look was not screenshotted**, only asserted inert
  (no rig, camera unmoved by a floor click).
- Table books are laid out left-aligned in a partial last row rather
  than centred. No room has a partial row today (15 → 5×3, 4 → 4×1).
- `pageMaterial()`'s shared singleton in `tables.js` is not cleared by
  `clearTableTextureCache()`. Harmless — it is never mutated.

## Verified this session

Playwright, fixed 1280×900 viewport, fresh page per room, settle
condition `canvas.dataset.frame > 5 && __propsReady && __tablesReady !==
false && !__poseRig?.tweening` — **never a fixed timeout.** Scratch
scripts lived in `tools/_scratch-*.mjs` and were deleted before the
commit, per the established pattern.

`PLAN-PHASE7.md` §4, steps 1–9, all actually run:

1. **All 50 rooms build with zero console errors.** (The browser's own
   `/favicon.ico` 404 against `python -m http.server` is excluded
   explicitly, not silently — it is the only one.)
2. **Table geometry vs. cases / door sensors / prop meshes**, `Box3`
   sweep over the 3 table rooms: **0 real overlaps** after the
   `clearTable()` fix (2 before: `cartographer`'s globe vs. table top
   and rail). The 2 remaining hits are `front`'s table legs standing on
   its rug — correct, see above.
3. **No book on both a shelf and a table**, all 3 table rooms:
   `front` 11 shelf / 15 table (`fronttable`'s own books), `cartographer`
   5/4, `longtable` 4/4. Zero intersection. `fronttable` itself builds no
   table of its own (`roomHasTable()`'s `!room.viaTable` guard).
4. **Every pose reachable, `tweening` goes true→false, camera lands
   within 0.000 units of the computed pose, camera inside the room box,
   Escape returns to `room`** — all four poses in `front`.
5. **Dolly**: `t` moves monotonically 0.144 → 0.864 over 6 wheel events,
   camera z 1276 → 153, clamps at exactly 1 (`shelf:back`) and 0
   (`room`), page does not scroll.
6. **`?reduced=1`**: `goTo()` completes with `tweening === false` and the
   camera already there, same tick.
7. **Screenshots** (judged by eye, not just asserted): `front` room —
   table reads as a table, legs under the corners, books resting on it;
   `table:fronttable` — 15 covers face-up in a 5×3 grid, titles and
   authors legible, no white or black box around any cover (the
   `coverSVG` grain filter rasterises fine); `shelf:back` — spine titles
   legible, hence no hi-res atlas; `shelf:right` in `front` (45°) and
   `shelf:left` in `longroom` (24°) — the case is the subject of the
   frame in both; `cartographer` room — globe now stands in front of the
   table, not through it.
8. **a11y**: 34 mirror buttons in `front` = 11 shelf + 5 doors + 2 cases
   + 1 table + 15 table books, in exactly that Tab order, all with
   non-empty names; focusing a shelf book flies to `shelf:back`, a case
   button to that case's pose (checked for `right` specifically, not
   just the first case), the table button and a table book to
   `table:fronttable`.
9. **Hover does not move the table**: top/apron/rails/legs world
   positions byte-identical before, during and after hover (with a
   forced `updateMatrixWorld` — without it the test passes vacuously),
   while the emissive *does* change (0x3a2f1c → 0x0). A table **book**
   does lift, 235.2 → 243.2 → 235.2, which is the intended gesture.

Plus: `?orbit=1` builds no rig and a floor click moves the camera 0.000
units; `?poses=0`, `?tables=0` and `?pose=<name>` all behave as
documented. 36/36 behaviour assertions, 0 console errors during the run.

## Environment (this session's sandbox — differs from earlier handoffs)

Earlier handoffs describe the owner's machine. This was a fresh cloud
sandbox:

- `node_modules/` does not exist until `npm install`. Playwright and
  Express both come from it.
- **Playwright 1.62 wants Chromium build 1234; `/opt/pw-browsers` has
  1194.** Do **not** run `playwright install`. Pass
  `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`
  to `chromium.launch()` — 1194 drives fine.
- `rm` is **not** aliased here; the `rm -f` note in earlier handoffs is
  about the owner's box.
- Serve the harness with `python3 -m http.server 8099` from the repo
  root. `npm start` does not serve `/tools`.
- A 50-room sweep takes ~4 minutes. Background it and wait for the
  process to exit.
- `git push` returns 403 — the repo is read-only here. The local commit
  is the record; no PR was opened.
- No `.env`, no `HARDCOVER_TOKEN`. Phase 7 does not need the API.
  Node's built-in `fetch` ignores the proxy and 403s with a message that
  reads exactly like an auth failure — use `NODE_USE_ENV_PROXY=1 node …`
  if you ever need the network.

## Workflow deviation, recorded honestly

`CLAUDE.md`'s split is Opus plans/reviews/writes handoffs, Sonnet
sub-agents write the code. **No sub-agent tool was available in this
session's harness**, so the review, the fixes, the verification scripts
and this document were all done by the one agent. The review was still
done first and in full against `PLAN-PHASE7.md`, and every fix below
came out of it. Nothing about the split is wrong; it just could not be
executed here. A future session with the Agent tool should go back to it.
