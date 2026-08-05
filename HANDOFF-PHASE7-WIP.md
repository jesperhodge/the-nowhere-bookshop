# Handoff — phase 7 IN PROGRESS (stopped mid-workflow)

Phase 7 ("Tables and camera poses", `IMPLEMENTATION.md` §3 row 7, points 1,
6, 10) is **implemented but not reviewed**. This is a work-in-progress
marker, not a phase-completion handoff — do not treat it like
`HANDOFF-PHASE6.md`.

Read `PLAN-PHASE7.md` (committed alongside this file) first: it holds the
full plan, every API contract the code was built against, and the scope
decisions with their justifications. Then `HANDOFF-PHASE7.md` (the phase-6
handoff), which is still accurate about the substrate underneath.

## Where the workflow stopped

Per `CLAUDE.md`'s Plan → Implement → Review → Adjust → Handoff:

| step | state |
|---|---|
| Plan (Opus) | **done** — `PLAN-PHASE7.md` |
| Implement (Sonnet sub-agents) | **done** — 2 rounds, 9 files |
| Code review (Opus) | **NOT DONE** ← resume here |
| Implement adjustments | not started |
| `HANDOFF-PHASE8.md` (Opus) | not started |

Nothing is committed as a finished phase. The diff is on `main` in one
commit so the work is not lost; treat it as a draft awaiting review.

## What landed

```
src/js/scene/tables.js     new  — TABLE, planRoomTable(), buildRoomTable()
src/js/scene/poses.js      new  — createPoseRig(), attachPoseControls()
src/js/scene/books.js      +    — buildRoomBooks() now returns `cases`; entries carry .caseId
src/js/scene/interact.js   +    — attachScenePicking() (ONE raycaster, nearest hit wins), createPoseController()
src/js/scene/a11y.js       +    — opts.onFocus(entry); the TODO(phase 7) is now wired
src/js/scene/stage.js      +    — stage.onFrame(cb), runs before render
src/js/scene/textures.js   +    — svgTexture() hoisted out of props.js
src/js/scene/props.js      ~    — artTexture() delegates to it
tools/preview-stage.html   +    — tables + poses wired; ?tables=0 ?poses=0 ?pose=<name> ?reduced=1
```

`main.js`, `index.html`, `scene.js`, `scene.css`, `themes.css`, `views/*`
and all data files are untouched, same as phases 3–6. The new stage is
still reachable only through `tools/preview-stage.html`.

## Verified (Playwright, scratch scripts deleted per the usual pattern)

- 6 rooms build with **zero console errors**; `__tablesReady` resolves.
- Tables in 3 of 50 rooms, and no book is on both a shelf and a table:
  `front` 11 shelf / 15 table (`fronttable`'s own books), `cartographer`
  5/4, `longtable` 4/4, `glasshouse` none.
- **Every pose is reachable, lands within 1.5 units of its computed
  position, and `Escape` returns to `room`** — checked in all 6 rooms.
  Wheel dolly moves `t`. `?reduced=1` jumps (no tween).
- **The table pose is the payoff and it works**: 15 covers face-up in a
  5×3 grid, titles and authors legible. This is `coverSVG()` finally in
  front of the reader (point 10).
- **Spine titles are legible in `shelf:back`** ("Piranesi", "The Rings of
  Saturn", …). **So §4.6's higher-resolution atlas re-render is NOT
  needed** — `ATLAS_SCALE = 3` already out-resolves the closest pose.
  That open question is answered; don't build it.

## The one known bug — fix this first

**14 side-shelf poses across 9 of 50 rooms put the camera inside the back
case's geometry** (measured with `Box3.containsPoint()` over all 50 rooms;
`shelf:left` 8, `shelf:right` 6). Affected rooms include `front`,
`longroom`, `orrery`, `oak`.

Cause, and it is arithmetic, not a coding slip: `poses.js` derives the
shelf distance from the case's height alone —
`dist = max((ch/2 + 30) / tan(fov/2), 420)` ≈ **947** for a standard
530-tall case. The room is only 1680 wide, so a side case's square-on
camera lands *past room centre* (x ≈ ∓271), and where that case sits deep
in the room (z-centre ≈ −1019) the point is inside the back case's volume
(x ±590, z −1200…−1000). `front`'s `shelf:right` screenshot is a wall of
shelf boards seen edge-on.

The pose needs a **clearance clamp against the room's own geometry**, not
just against the room box — the same "two now-real pieces of geometry
collide" fix phases 5 and 6 each had to make. Cheapest correct version:
clamp `dist` so the camera stays clear of every *other* case's `Box3`
(and of any table), accepting a closer, narrower framing. That is probably
better anyway: at 947 the 1180-wide back case already overflows the frame
horizontally, and spines read *more* easily closer. A `shelf:back` pose in
a table room is also partly occluded by the table for the same reason —
one clamp fixes both.

`tools/_scratch-clearance.mjs` (deleted) did the sweep: build each room's
cases + table into a detached `THREE.Scene`, `createPoseRig(...,
{reducedMotion: true})`, then `Box3().setFromObject()` per case and
`containsPoint(rig.poseFor(name).position)`. Recreate it to confirm 0/50
after the fix.

## Also worth knowing

- **Cover size came out smaller than the plan's estimate**: the plan
  guessed ~63×95 world units for `fronttable`'s 15 covers; the real
  joint width-AND-depth fit gives ~43×64 (the plan's figure ignored the
  row-depth constraint). It reads fine at the table pose — see the
  screenshot note above — so this is recorded, not a defect.
- **`table:<id>` is 14° off vertical, not straight down** (§4.3 says
  "straight down"): a camera looking along −y with the default
  `up = (0,1,0)` gives `lookAt()` a degenerate basis. Deliberate, and
  documented in `poses.js`.
- **`floor-c`/`floor-cl` were considered and rejected** for table
  placement — the question `HANDOFF-PHASE7.md` left open. They are
  prop-box anchors (one z plane, height growing floor-ward); a table needs
  a depth run in z plus a top surface. The table's placement is ported
  from `scene.js`'s authored `TABLE` constant instead. Reasoning is in
  `tables.js`.
- **`onTable` still does not exist in the data.** For the two
  "Table"-named rooms (`cartographer`, `longtable`) `planRoomTable()`
  falls back to a deterministic pick (most accolades, then most recent,
  then id) and *removes those books from the shelf* so nothing appears
  twice. One `if` away from deletion when phase 9 lands the real flag.
- **Not done**: full 50-room console-error sweep (only 6 rooms), the
  `Box3` table-vs-case/door/prop overlap sweep, the a11y focus-follows-
  camera check, hover-does-not-move-the-table check, `?orbit=1` against
  poses, and a real screen reader. All are listed as steps 1–9 in
  `PLAN-PHASE7.md` §4.

## Environment

The owner's real machine (not the sandbox `IMPLEMENTATION.md` §1
describes). `rm` is aliased to `rm -i` — use `rm -f`. Serve with
`python3 -m http.server 8099` from the repo root; `npm start` does not
serve `/tools`. A 50-room sweep takes minutes — background it and wait for
the process to exit.
