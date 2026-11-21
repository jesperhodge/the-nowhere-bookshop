# Handoff — phase 6 done, phase 7 next

Read `IMPLEMENTATION.md` first (§3's order-of-work row 6, "Props as
textured planes", point 9, depends on phases 2 & 3), then
`PLAN-ARCH.md`'s `src/js/scene/` file layout ("`props.js`  SVG art ->
alpha-mapped billboard planes") and "Keeping the look". `HANDOFF-
PHASE6.md` (phase 5) is still accurate about the doors/passages
substrate this phase builds on top of — nothing in it changed this
session.

This session did **only phase 6**: every prop type `scene.js`'s
`buildProp()` handles now has a three.js equivalent, wired into the
standalone preview harness. Nothing in `src/js/scene.js` (old CSS
scene, still live), `scene.css`, `themes.css`, `main.js`, or
`index.html` was touched. The new code lives entirely under
`src/js/scene/` and is only reachable via `tools/preview-stage.html`;
nothing wires it into the shop yet.

Committed as `07c7892`, "phase 6: props as textured planes" — 7 files,
no push (not asked for).

## What changed

```
src/js/scene/props.js       818 lines  new — every prop type, SVG art texture pipeline
src/js/scene/coords.js       +41       lampAnchor(), propBoxCenter() exports
src/js/scene/stage.js        ~15       buildRoomLights() now calls lampAnchor(), not its own inline copy
src/js/scene/books.js        +18       sideCaseExists()/SIDE_CD exported (see below)
src/js/scene/textures.js      +7       hex/rgba/mix/pinstripe re-exported for props.js to reuse
src/js/covers.js             +44/-12   fillerStyle() bugfix (see below) — pre-existing, not phase 6's own bug
tools/preview-stage.html     +32/-1    props wired in; ?props=0
```

### `src/js/scene/props.js` (new)

Two families, matching `scene.js`'s `buildProp()` switch:

1. **`'art'` props** (globe, plant, armchair, clock, telescope, candle,
   mushrooms, stack, starchart, shipmodel, umbrella, herbs, typewriter,
   ladder, cat — the majority, ~124 of 205 prop instances across the
   50 rooms). `artTexture(name, args)` calls `src/js/data/props.js`'s
   `ART[name](...args)` directly (not `artURI()`, which wraps the
   result in a CSS `url("...")` string three.js has no use for),
   builds a `data:image/svg+xml` URI from the raw markup, loads it
   into an `Image`, and on `onload` draws it via
   `ctx.drawImage(img, 0, 0, W, H)` into a canvas sized explicitly by
   this file — **not** `THREE.TextureLoader` on the data URI directly.
   Reason: `src/js/data/props.js`'s `S()` helper deliberately omits
   `width`/`height` on the `<svg>` root (it was authored for CSS
   `background-size: contain`, which only needs the *aspect ratio*
   from `viewBox`) — this is exactly the ambiguity phase 2's "Finding
   C" was about, and a bare `<img>`/`Texture` load of such an SVG can
   rasterize at whatever default size the browser picks.
   `drawImage(img, 0, 0, W, H)` sidesteps that by specifying the
   *output* size explicitly, independent of any intrinsic-size
   fallback. The aspect ratio itself is read synchronously from the
   same `viewBox` string via regex (not from the image), so a prop's
   display-plane geometry (sized by CONTAIN-fit within its `w`/`h`
   box, matching CSS's `background: var(--art) center/contain
   no-repeat`) never waits on image decode — only the texture's pixels
   arrive late. `buildRoomProps()` returns a `ready` promise
   (`Promise.all` of every art texture's load-or-fail) for
   settle-before-screenshot polling, exposed as `window.__propsReady`
   in the harness.

2. **The ten specially-coded types** (`lamp`, `window`, `hearth`,
   `blinds`, `rug`, `skylight`, `trunk`, `column`, `monolith`,
   `orrery`) — hand-painted canvas2d textures, reusing `textures.js`'s
   `hex`/`rgba`/`mix`/`pinstripe` helpers (now exported) rather than
   duplicating gradient math. All of them are box-fill planes (no
   contain-fit — matches the CSS recipes, which are 100%-size
   backgrounds, not `contain`-fit art) at their `propBoxCenter()`
   position, **except**:
   - `rug`/`skylight` lie flat (`geo.rotateX(±90°)`) instead of
     standing as vertical billboards — CSS's `.prop-rug`/skylight's
     own `rotateX(90deg)` on the prop div itself.
   - `lamp` is real 3D geometry (see below), not a plane at all.

   `'lamp'` was the one explicitly called out as most important in the
   brief, since `stage.js`'s `buildRoomLights()` previously rendered
   only a bare bulb-glow sphere with no fixture around it. It now
   gets: a **cord** (thin `CylinderGeometry`, from the true ceiling
   `WORLD.h` down to the shade's top — the length is therefore always
   exactly however far `dy` dropped the shade, no need to trust
   `p.cord`'s authored px value for geometry), a **shade** (an open
   `CylinderGeometry` frustum, `radiusTop ≈ w*0.28`/`radiusBottom =
   w/2`, matching CSS's `clip-path: polygon(22% 0, 78% 0, 100% 100%, 0
   100%)`, canvas-textured, `DoubleSide` so the warm interior is
   visible from below), and a **beam** (a soft additive-blended glow
   cone below the bulb, cosmetic complement to the real `PointLight`).
   The bulb itself is deliberately **not** duplicated here — `stage.js`
   already places a glow sphere at the light's position; props.js only
   adds the fixture around it.

   **Anchor sharing, not duplication**: `coords.js` gained
   `lampAnchor(p)`, and `stage.js`'s `buildRoomLights()` was refactored
   to call it instead of its own inline `cx`/`cy`/`cz` arithmetic —
   per the brief's explicit warning ("make sure your lamp prop
   geometry lines up with that light position exactly ... don't
   recompute it independently and risk drift"), both the light+bulb
   and the shade+cord now resolve from the exact same function.

3. **Grounded contact shadow + depth dimming** (`scene.js`'s
   `groundStyle()`): ported the contact-shadow half only — a shared,
   cached radial-gradient decal texture, one `PlaneGeometry` instance
   per grounded prop sized `pw*.92 × pw*.46` (CSS's exact ellipse
   proportions), opacity = CSS's exact `0.72 - depth*0.3` `--lift`
   formula. **Did not** port the brightness-dimming half
   (`--art-filter: brightness(...)`) — per the brief's own suggestion,
   checked first whether the scene's real point lights + decay already
   produce a "further from the lamp reads darker" effect before
   re-implementing a second, competing dimming term. They do (see
   "Verified this session"). Only `'art'` props at `floor-*`/`tall-*`
   get this treatment, ported faithfully from `scene.js`: the
   specially-coded types never call `groundStyle()` in the original
   switch either, even `trunk`/`column`/`monolith` which sit at
   `tall-l`/`tall-r`.

4. **Cat `breathe`**: implemented as a small `Math.sin()`-driven
   `mesh.scale` pulse, called from `buildRoomProps().update(elapsedSec)`
   every frame. **Simplified from the CSS original**: CSS's
   `transform-origin: 50% 100%` scales from the prop's own
   bottom-centre; this pulses from the plane's geometric centre
   instead. Only one room (`front`) uses `breathe: true`, so a second
   bottom-pivot geometry code path for a single prop instance wasn't
   worth it — still reads as breathing (verified, see below).

### `tools/preview-stage.html`

`buildRoomProps(room)` called after doors, `propsRig.group` added to
the scene, `propsRig.update(elapsedSec)` driven from its own small
`requestAnimationFrame` loop (same pattern as `doorRig.updateSigns()`).
New: `?props=0` (skip set dressing entirely — isolates a props
regression from shell/books/doors, same spirit as `?books=0`/
`?doors=0`). `window.__propsGroup`/`__propsReady` exposed for
Playwright (`__propsReady` is a plain boolean, not the Promise itself
— `page.evaluate()` can't hand a live Promise back across the bridge,
so the harness resolves it into a boolean flag and polls that).

## The `dy:` sign-flip audit (left for this phase by phase 3's handoff)

**Result: all correct, no bugs found.** Grepped `dy:` in
`src/js/data/rooms.js` — 19 occurrences, across `hang`/`hang-l`/
`hang-r` (lamps, `dy:290` repeated), `above` (`dy:20`/`22`/`285`),
`tall-r` (`dy:240`, the `longnow` monolith), `back-l-hi`/`back-r-hi`
(`dy:240`/`250`/`290`), and `ceil` (`dy:-130`, the `orrery` prop —
notably the one *negative* `dy` in the data, and therefore the most
useful single case to hand-check since it exercises the sign flip in
both directions at once).

Verified two ways:

1. **Per-slot substitution check**: for all 18 entries in `coords.js`'s
   `SLOT` table, confirmed `new_y === 470 - old_y` (`threeY(old_y)`)
   against `scene.js`'s original `SLOT` table's `y` values, by hand,
   one at a time. All 18 match exactly.
2. **General algebraic proof**, not just spot-checks: `placeProp()`'s
   `y: c.y - (p.dy || 0)` is correct for *every* slot simultaneously,
   not slot-by-slot, because if `Y_new(w,h) = threeY(Y_old(w,h))` holds
   for a slot (verified in step 1), then for any `dy`:
   `Y_new - dy = 470 - Y_old - dy = threeY(Y_old + dy)`, which is
   exactly `threeY` of the old-convention final position
   (`Y_old + dy`, scene.js's `place()`: `y: c.y + (p.dy || 0)`). So the
   sign flip is provably correct for all 19 occurrences at once, given
   step 1 holds — I did not need to hand-trace all 19 individually,
   though I did spot-check `orrery`'s negative `dy:-130` by hand as a
   sanity check (`SLOT.ceil` old `y:-190` + `dy:-130` = `-320` (old
   convention) → `threeY(-320) = 790`; `placeProp()`: `660 - (-130) =
   790`. Matches.).

## Things phase 7 should know

- **`floor-c`/`floor-cl` are unused by every current room's props (0
  occurrences)**, unlike every other slot in `coords.js`'s `SLOT`
  table. Both centre the prop horizontally (`x: -w/2 ± offset`) rather
  than anchoring it to a wall, which strongly suggests they were
  reserved for exactly what phase 7 needs: a table sitting in the
  middle of the room. There is **no `table` field anywhere in
  `rooms.js`** — the front room's table is represented only as the
  `viaTable: true` flag on its `fronttable` child room (a room reached
  by clicking a table, not a door) — so phase 7 will need to invent
  the table's own position/size convention from scratch, not read it
  out of `room.props`. `floor-c`/`floor-cl` existing, unused, and
  centred is worth checking as a candidate before inventing a new one.
- **The side-case clearance fix (see below) only covers `room.props`
  entries, not whatever phase 7 adds for tables.** If a table ends up
  centred in the room (per the point above) it's nowhere near a side
  case's 170-unit depth from the wall, so this is unlikely to bite —
  but if a table pose or its geometry ever extends toward a side wall,
  the same `Box3.intersectsBox()` technique (used three times this
  session — see below) is the way to check, and `books.js` now exports
  `sideCaseExists(room, side)`/`SIDE_CD` for exactly this kind of
  cross-file conflict check, precedent already established.
- **The lamp beam plane's lowest point was checked against the floor
  across all 50 rooms and never clips through it** — worst case
  (`underworld`) bottoms out at world `y ≈ 34`, comfortably above
  `y=0`. This was worth checking explicitly (not assuming) because a
  `dy`-dropped lamp (e.g. `landing`'s `dy:290`) combined with a large
  `beam` value could plausibly have pushed the glow cone below the
  floor; it doesn't, for any of the 52 lamp instances in the current
  data. If a future room's lamp uses a much larger `dy` or `beam`, this
  is worth re-checking with the same technique (`tools/_scratch-
  beamcheck.mjs`-style traversal, not committed — see "Environment").
- **Does a `shelf:<case>` pose's camera ever end up inside a prop's
  billboard plane?** Not checked exhaustively (poses don't exist yet —
  that's phase 7's own job), but by construction this is unlikely to
  be a *new* problem: a `shelf:<case>` pose is "square-on and close" to
  a *case* (§4.3), and props never overlap a case's bounding volume
  any more (see below) — so a camera close enough to a case to read a
  spine is, by the same fix, clear of any nearby prop's plane too. The
  lamp fixture (shade/cord/beam) is the one prop type that was never
  part of the side-case clearance check (it's never at a `floor-*`/
  `back-*` slot, always `hang`/`hang-l`/`hang-r` near the ceiling), and
  sits well above any case's height range (case top is at most `ch ≈
  544`; the lowest `hang-x` shade bottom found across all 50 rooms
  still clears that — same `underworld` beam-check data point above
  implies the shade itself, which sits above the beam, clears it by
  more).
- **Real lights already do the depth-dimming job `--art-filter:
  brightness(...)` did in CSS** — verified by screenshot (see below),
  not just asserted. If a future phase changes the lamp lighting model
  (intensity/decay/distance), it's worth a fresh look at whether
  far-from-the-lamp grounded props still read as appropriately dim —
  this was tuned/observed against the CURRENT `LAMP_INTENSITY`/
  `LAMP_DISTANCE`/`LAMP_DECAY` constants in `stage.js`, not derived
  independently.
- **`propBoxCenter()` (new, in `coords.js`) is the "vertical billboard
  centre" convention every prop type except `rug` uses.** If phase 7
  adds a new prop-like thing (a table isn't one, per the point above,
  but something else might be), reuse this rather than re-deriving the
  box-centre-from-top-left-anchor arithmetic a third time.

## Two pre-existing bugs found and fixed (neither is phase 6's own bug)

Both were found because this phase, for the first time, screenshot-
verified real rooms with real cases AND real props simultaneously —
neither surfaces from either half alone.

1. **`covers.js`'s `fillerStyle()` emitted CSS Color-4 space-separated
   `hsl(H S% L%)` strings** (e.g. `hsl(38 20% 15%)`). Valid CSS — the
   live `scene.js`/`scene.css` build renders it fine — but
   `vendor/three/build/three.core.js`'s `Color.setStyle()` only
   matches the legacy COMMA-separated form
   (`/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%.../`).
   Space-separated silently matches nothing, and `Color` falls back to
   its default (white). Every filler book's cover material
   (`books.js`'s `makeBookMesh()`, `new THREE.Color(item.coverColor)`)
   was therefore rendering as a flat white box — exactly the "no white
   box around a prop" failure mode the brief asked me to screenshot-
   check for `'art'` props, except it turned out to live in a
   DIFFERENT, pre-existing part of the scene (filler books, phase 4).
   The same string also broke `books.js`'s `parseStops()` (a hex-only
   regex, `#[0-9a-fA-F]{6}`) — every filler spine's atlas gradient
   silently fell back to a flat `#333` grey instead of its intended
   colour. Fixed by having `fillerStyle()` emit hex via a new
   `hslToHex()` helper (same colours, numerically — a no-op for the
   still-live CSS site) and giving its `bg` gradient's first/last stops
   explicit `0%`/`100%` positions (matching `spineStyle()`'s real-book
   format) so `parseStops()` captures all three stops, not just the
   one that already had an explicit `%`. Reproduced with `?props=0`
   (still broken with props off entirely — confirms it's a books.js/
   covers.js bug, not a props.js one) before and after the fix.
2. **40 of 50 rooms had at least one prop genuinely inside a side
   case's bounding volume** — a real `Box3.intersectsBox()`
   intersection, not just visual occlusion. `SLOT`'s `floor-l`/
   `floor-r`/`floor-ml`/`floor-mr` x-anchors (and `back-l`/`back-r`/
   `back-l-hi`/`back-r-hi` when a large `dy` pulls them down far
   enough) all sit well within `books.js`'s `SIDE_CD` (170 units) case
   depth from the wall — harmless in the CSS build, where the side
   "shelf" was `spineRun()`'s flat painted card with zero real depth to
   collide with, but a genuine collision now that `books.js`'s side
   cases (phase 4) are real carcass geometry. Found via the exact same
   `Box3.intersectsBox()` sweep technique `HANDOFF-PHASE6.md` documents
   phase 5 using for its case/door overlap — swept all 50 rooms, found
   40 with a real intersection, confirmed by screenshot that the
   intersecting props (a `translator` `quill`+`globe`, a `front`
   `hearth`) were genuinely partially hidden/glitching (light bleeding
   through shelf gaps) rather than just theoretically overlapping.
   Fixed the same way phase 5 fixed its overlap — not by moving the
   case (that's phase 4/5's verified sizing logic, already checked
   against doors; re-touching it risks a regression I can't fully
   re-verify against phase 5's own door tests in the time I have) but
   by nudging the AFFECTED PROP toward room-centre just enough to
   clear the case's depth, when a same-side case actually exists
   (`books.js` now exports `sideCaseExists(room, side)` for this).
   Re-swept after the fix: 0/50 rooms have any remaining case overlap
   (or door overlap — checked simultaneously, see below).

## Known simplifications / deviations from a literal reading of the brief

- **Depth-brightness dimming (`--art-filter: brightness(...)`) was
  deliberately not ported** — see "What changed" point 3. This is the
  brief's own suggested path ("leaning on the scene's existing
  point-light falloff, which may already produce a similar
  depth-darkening effect naturally — check before re-implementing"),
  taken because it checked out.
- **`rug`/`skylight` placement is a "box-centre" approximation, not an
  exact port of CSS's `transform-origin`/`rotateX(90deg)` pivot
  arithmetic.** `SLOT.rug`/`SLOT.ceil`'s authored x/z already bake in
  enough of the original intent (x centred via `-w/2`, z as a single
  centre-ish value) that reproducing the literal CSS transform pivot
  math seemed like more precision than a flat decorative rug/skylight
  plane needs. Reads correctly in every room screenshotted this
  session; flagged in case a future phase's camera gets close enough
  to a rug or skylight for the approximation to show.
- **Cat `breathe` pulses from the plane's centre, not CSS's
  bottom-anchored `transform-origin: 50% 100%`.** Only one room
  (`front`) uses it; a second bottom-pivot geometry code path for one
  prop instance wasn't worth building. Still reads as breathing
  (verified, scale visibly oscillates frame to frame).
- **Window `weather` (rain streaks / snow dots) is static, not
  animated** — CSS's `.prop-window .weather` has a `rainfall` CSS
  keyframe animation; this phase paints a fixed rain-streak or
  snow-dot pattern into the canvas texture once. A nice-to-have,
  matching the brief's own framing of `breathe` as optional polish —
  applied the same reasoning to the other small CSS animations this
  phase touches (window rain, hearth fire flicker): implement the
  static "reads correctly at a glance" version, skip the animation
  unless it's cheap and clearly asked for (`breathe` was explicitly
  named in the brief; window rain/hearth flicker were not).
- **Hearth fire has no flicker animation** (CSS: `@keyframes flicker`)
  — same reasoning as window weather above; the emissive-lit static
  texture reads as a warm fireplace glow without it.
- **No decorative frame/trim mesh on window/hearth/blinds beyond what
  the canvas texture paints in** — matches phase 5's own precedent
  ("No decorative door frame mesh... the extrusion's own geometry IS
  the frame") for the same reason: the painted texture already
  supplies the visual cue (a frame border baked into the canvas),
  and a separate trim mesh is more geometry for a look that already
  reads correctly.
- **Lamp shade UV/gradient direction is approximate.** The shade's
  canvas texture (`lampShadeTexture()`) is a simple top-lit/bottom-dark
  vertical gradient; `CylinderGeometry`'s exact UV `v`-direction
  (top-vs-bottom) wasn't verified against three.js source the way
  phase 5 verified `EllipseCurve`'s arc-direction for door arches — the
  shade's gradient is subtle and roughly symmetric enough that getting
  the direction backwards wouldn't be visually obvious, and screenshots
  looked correct (lit top, darker underside) in every room checked.
  Worth a closer look only if a future close-up camera pose makes the
  shade's shading read as inverted.

## Verified this session

Server: `python3 -m http.server 8099` from the repo root (same as
prior phases). Playwright scripts lived in `tools/_scratch-*.mjs`
(written, run, `rm -f`'d before committing — not part of the commit,
per the established pattern).

- **All 50 rooms build with zero console errors**, swept via a fresh
  browser page per room (`window.dataset.frame > 5 &&
  window.__propsReady === true` as the settle condition — never a
  fixed timeout). Two full sweeps: one that found the 40-room case
  overlap (pre-fix), one after the fix that confirmed 0 remaining
  overlaps of any kind.
- **Case overlap sweep**: `THREE.Box3().setFromObject()` on
  `case:left`/`case:right` and every prop mesh (excluding
  `prop-shadow` decals, which are cosmetic floor decals, not real
  geometry that should avoid a case), `Box3.intersectsBox()` — same
  technique, explicitly reused, that phase 5's handoff documents for
  its own case/door overlap. Found 40/50 rooms with a real
  intersection before the fix, 0/50 after.
- **Door overlap sweep**: the same technique against every door's
  sensor mesh (`window.__doorEntries[i].mesh`), simultaneously with
  the case sweep. 0/50 rooms have any prop/door overlap, both before
  and after the case-overlap fix (the fix only ever moves a prop
  toward room-centre, away from both the wall AND the door bays, which
  sit even closer to the wall than a case's depth does — so this
  never had a door-overlap risk to begin with, but checked anyway,
  explicitly, rather than assumed).
- **`'art'` prop transparency**: screenshotted `front` (cat, armchair,
  ladder — plain floor silhouettes) and `glasshouse` (two `plant`
  props) close up. No white or black box around any of them; the
  SVG's alpha channel survives the `Image` → `drawImage` → `CanvasTexture`
  round trip.
- **Lamp fixture reads as a fixture, not a bare bulb**: a custom
  from-below close-up camera angle (`front` room) shows the shade's
  underside lit warmly, the bulb-glow sphere (stage.js) visible
  beneath it, and the cord above — confirmed by screenshot, not
  assumed from the code alone.
- **Grounded props read as sitting in the room**: `glasshouse`'s two
  `plant` props (both `floor-l`/`floor-r`) show a clearly visible soft
  dark ellipse beneath each pot in the default camera pose — the
  contact-shadow decal, confirmed by screenshot.
- **Depth dimming from real lights, not a filter**: compared a
  near-lamp prop against a far-from-any-lamp prop across several
  screenshotted rooms; farther props read visibly darker purely from
  the point light's inverse-square falloff + lower ambient
  contribution, matching the CSS original's intent without a second,
  hand-coded dimming term. This is what let me skip porting
  `--art-filter` (see "Known simplifications").
- **`k-panel`/`k-glass`/`k-void` wall kinds**, each with props:
  `front` (`k-panel`, hearth/window/rug/lamp/several `art`),
  `glasshouse` (`k-glass`, two plants, mullion-grid wall texture
  visible behind them), `orrery` (`k-void`, starfield wall + the
  `orrery` ceiling prop + telescope/globe/starchart `art` props).
  All render correctly, no material/texture errors.
- **A room with a tall prop (`trunk`) on a side wall AND that wall's
  door bays** (`oak`, `trunk` at `tall-r`, doors on both walls):
  screenshotted — the trunk billboard and the door arches sit visibly
  clear of each other, no collision. (Consistent with
  `HANDOFF-PHASE6.md`'s note that `sideCaseSpec()` never builds a case
  on a `tall-l`/`tall-r` wall, so there's no case there to conflict
  with either the trunk or a door — only the trunk-vs-door geometry
  itself needed checking, and it's clear.)
- **Cat `breathe` animation**: read `prop-art:cat`'s `mesh.scale`
  across 4 samples 400ms apart — values genuinely oscillate
  (`0.977`–`0.983` on the y-axis across the samples taken), confirming
  `buildRoomProps().update()` is actually being driven from the
  harness's render loop, not a dead no-op.
- **Lamp beam floor clearance**: traversed every room's
  `prop-lamp-beam` mesh, computed its geometry's world-space minimum
  Y. Worst case (`underworld`) is `y ≈ 34` — comfortably clear of the
  floor (`y=0`) in all 50 rooms, for the full range of `dy`/`beam`
  values actually used in the current data.
- **What I did NOT test**: an actual screen reader (props aren't
  focusable per the brief, so this is a smaller gap than prior phases'
  — nothing in the a11y mirror changed this session). Didn't test
  `?orbit=1` free-look against props specifically (no reason to expect
  a difference from books/doors, which already verified the camera-
  agnostic rendering path, but not screenshotted). Didn't exhaustively
  screenshot all 50 rooms' props by eye — spot-checked ~10 across the
  distinct wall kinds and prop-density range, relied on the
  zero-console-error + zero-overlap sweep for the other 40.

One environment note worth repeating from prior handoffs: this
machine's `rm` is aliased to `rm -i`. Used `rm -f` throughout for
scratch-file cleanup. A full 50-room sweep (fresh browser page per
room) takes a few minutes on this machine — long enough that it's
worth backgrounding explicitly and waiting for the process to exit
rather than assuming a sweep that hasn't printed its last line yet has
hung (same note `HANDOFF-PHASE6.md` made about its own sweep).

## Environment

Same as prior handoffs: the owner's real local machine, not the
sandboxed environment `IMPLEMENTATION.md` §1 describes — no proxy,
`git push` not attempted (not asked for).
