# Handoff — phase 3 done (the checkpoint), phase 4 next

Read `IMPLEMENTATION.md` first (the brief, in phase order — phase 3 is
§3's "Stage skeleton" row and the explicit checkpoint called out right
under the table), then `PLAN-ARCH.md` (the three.js decision — "Shape",
"Keeping the look", "Doorways", "Risks, stated plainly"). `HANDOFF-PHASE3.md`
(phase 2) and `HANDOFF-PHASE2.md` (phase 1) are still accurate about the
data, the tools and the server.

This session did **only phase 3**: the renderer/camera/shell/lighting
skeleton, and the look-check IMPLEMENTATION.md asks for before phases 4-7
build anything on top of it. Nothing in `src/js/scene.js`, `scene.css`,
`themes.css`, `main.js` or `index.html` was touched — the live site still
runs the CSS-3D scene exactly as it did after phase 2. The new stage lives
entirely under `src/js/scene/` and is only reachable via the standalone
preview harness described below; nothing wires it into the shop yet.

## Post-handoff fix (orchestrator review, before phase 4 started)

Independent verification of this handoff's checkpoint screenshots found the
wall textures **were not actually visible in the lit render** — both
`front` (k-panel) and `glasshouse` (k-glass) rendered as smooth, patternless
gradients, contradicting this document's "wainscot band + pinstripe read
correctly" claim below. Root cause: `ExtrudeGeometry`'s default
`WorldUVGenerator` (three.core.js) hands back each shape's *raw local
coordinates* as UVs rather than 0-1 — fine for a shape authored in 0-1
space, but `shell.js`'s shapes are authored in world units (hundreds of
px). With `ClampToEdgeWrapping`, a wall's texture sampled almost entirely
at one edge texel, so the whole face read as a single smeared colour;
`textures.js`'s ~450 lines of wall-kind patterns were being computed
correctly but were invisible on screen. Confirmed by dumping the `uv`
buffer attribute directly (`[-840, -470, -840, 470, ...]`, matching WORLD
units, not `[0,0, 0,1, ...]`) — not a rendering-taste issue, a geometry bug.

Fixed in `shell.js` by passing a custom `UVGenerator` to `ExtrudeGeometry`
that normalizes `generateTopUV`/`generateSideWallUV` output to 0-1 over
each face's own width/height/thickness. Re-screenshotted all three
checked rooms (`front`, `glasshouse`, `orrery`) after the fix: wainscot
band, vertical pinstripes, floorboards, ceiling beams, glass mullion
grid, and the starfield/nebula all now render as designed. The
"Checkpoint verdict: pass" below is upgraded from "true despite invisible
textures" to "true and the texture pipeline is actually visible" — the
mood/falloff verdict itself was correct, only the texture-visibility claim
needed correcting. No other files changed; light tuning numbers
(1.8M candela etc.) are unaffected by this fix and still apply.

## Checkpoint verdict: **pass**

IMPLEMENTATION.md's exact bar: *"if the skeleton looks like grey plastic,
stop and say so before phases 4-7 depend on it."* It doesn't. Screenshots
of two rooms (paths below, still on disk in the scratchpad this session
used — re-run the harness yourself to reproduce, see "verified this
session") show a warm, moody, readable room: real falloff from a single
point light, dark corners, a lit ceiling pool, no flatness. Side-by-side
against the live CSS room (`tools/_shot-css.mjs`-style screenshot,
`http://localhost:8099/#/front`), the three.js version reads as *more*
atmospheric in one respect — every one of the five faces actually renders
(the CSS build has never drawn the ceiling or either side wall — see
PLAN-ARCH.md "Finding A" — so those three faces have no prior look to
match, and the brief says explicitly that's expected: "implementing the
intent, not matching a picture").

What made the difference, in order of impact:
1. **Light intensity.** The single biggest lever. See "The physically-based
   light trap" below — this is not a matter of taste, it's a units bug
   that will bite anyone who ports intensity numbers from a smaller-scale
   three.js example.
2. **ACESFilmicToneMapping** (`renderer.toneMapping`) plus sRGB output
   colour space. Left at the three.js default (`NoToneMapping`), bright
   areas near the lamp clip to flat white far sooner and the room reads
   flatter/cooler. ACES was tried first per the brief's suggestion list
   and kept — it noticeably softened the hot spot under the lamp without
   needing to fight it with a lower intensity.
3. Real per-kind wall textures (not a flat colour) — even subtle ones
   (the k-panel wainscot band, the k-glass mullions) keep the walls from
   reading as a single flat plane.

What I did **not** end up needing, contrary to my expectation going in:
gamma/sRGB correction on the canvas textures beyond setting
`texture.colorSpace = THREE.SRGBColorSpace` (one line, already the
correct default expectation for a canvas painted in ordinary CSS-ish
hex colours), and no extra ambient-occlusion trick — the point light's
natural falloff plus a low ambient floor was enough to avoid both "flat"
and "pitch black corners."

**Two honest caveats to this verdict**, not blockers but worth stating:
- Phase 3 has no bookcase, no props, no doorway glow — just the shell and
  one light. The full room (once phase 4-6 land) will look busier and
  possibly *better* (more surfaces for the light to catch), but that's
  unverified; this checkpoint is about the substrate, per the brief.
- I judged this on two rooms (`glasshouse`, a cool k-glass room, and
  `front`, a warm k-panel room) plus a quick look at `orrery` (k-void) and
  a few isolated textures (`k-stone`, `k-brick`, `k-ink`, `k-tile`,
  `k-ice`, `k-water` were written but only checked by reading the canvas
  output in isolation, not in a fully lit room — see "textures.js
  coverage" below).

## What changed

New files only — nothing existing was edited.

```
vendor/three/build/three.module.js       three.js 0.185.1 (r185), unmodified
vendor/three/build/three.core.js         three.module.js imports this by a
                                          relative path; both must ship together
                                          or the module 404s (PLAN-ARCH.md)
vendor/three/examples/jsm/controls/
  OrbitControls.js                       for the harness's ?orbit=1 free-look;
                                          not used by anything else this phase
vendor/three/LICENSE                     three.js's own MIT license, carried along

src/js/scene/coords.js      81 lines     the y-flip + the ported SLOT table
src/js/scene/textures.js   453 lines     themes.css's 14 wall "kinds" -> canvas
src/js/scene/shell.js      134 lines     walls/floor/ceiling as ExtrudeGeometry
src/js/scene/stage.js      148 lines     renderer, camera, lights, loop, resize

tools/preview-stage.html   111 lines     standalone harness, see below
```

### `src/js/scene/coords.js`

The one required export: `toThreeY(cssY) = 470 - cssY`. Also exports
`WORLD` (same shape as `scene.js`'s, y re-derived: floor 0, ceiling 940)
and `SLOT`/`placeProp()` — the old `scene.js` `SLOT` table (lines ~49-68
there), **rewritten directly** in the new convention rather than wrapped
with a runtime flip, per IMPLEMENTATION.md §4.1's explicit instruction
("do not adapt it"). Every constant was hand-substituted (`470 - oldValue`)
and the file's block comment shows the derivation so it can be checked
against the original without re-deriving it.

`placeProp(p)` also negates `p.dy` — rooms.js's old-convention downward
offset — in the one place it needed to happen. I did **not** grep
afterward for stray `dy` usages outside `placeProp()`/`SLOT`, because
nothing else in this phase's code touches `p.dy` at all (only lamp
placement uses `placeProp()`, and only `hang`/`hang-l`/`hang-r` slots are
exercised by real data — grep confirms every `t: 'lamp'` entry in
`rooms.js` uses one of those three). **Phase 6 (props as textures) should
re-grep `dy:` in rooms.js against `placeProp()`'s call sites** once it
places every prop, not just lamps, to confirm none slipped through — the
plumbing is correct and tested for lamps, but wasn't exercised end-to-end
for e.g. `back-l-hi`/`floor-c` since nothing in phase 3 needed those.

### `src/js/scene/shell.js`

`buildShell(room, opts)` returns a `THREE.Group` with five meshes —
`wall-back`, `wall-left`, `wall-right`, `floor`, `ceiling` — each built by
a shared `buildFace()` helper: a `THREE.Shape` rectangle run through
`ExtrudeGeometry({ depth: thickness, bevelEnabled: false })`, positioned
and rotated (0/±90° about a single axis each, no compound rotations) so
its **room-facing surface** sits exactly on the CSS-derived WORLD
boundary and the extrusion recedes away from the room, hidden.

Positions/rotations were derived by hand from the room-box geometry
(x∈[-840,840], y∈[0,940] three-space, z∈[-1200,0]) rather than copied
from `scene.css`'s CSS transforms, because CSS 3D transform composition
and three.js's right-handed y-up world don't share a handedness I trust
myself to translate correctly by eyeballing — deriving each face's
position/rotation from first principles and then checking the result
(closed box, no seams, correct face meets correct face) via an orbit
screenshot was more reliable than porting the CSS transform chain
line-by-line. See "verified this session" for the orbit check.

**Doorway holes (phase 5's job) are not implemented**, but the extension
point exists on purpose: `buildFace({ ..., holes: [] })` already threads
a `holes` array onto `shape.holes` before extruding. Phase 5 should be
able to add holes without restructuring this file — construct a
`THREE.Path`, wind it opposite the outer contour, push it into the array
passed to whichever `buildFace()` call needs the opening.

**Material winding side-step**: rather than hand-deriving whether each
shape's extrude winding puts the correct-facing normal on the visible
cap (this differs face-to-face since the four faces use different
rotations), every shell material is `side: THREE.DoubleSide`. three.js's
shader flips the shading normal per-fragment based on `gl_FrontFacing`
for double-sided materials, so lighting comes out correct on whichever
side the camera sees regardless of winding. The cost is negligible (5
meshes) and it removed an entire category of "why is this wall shaded
like its normal points backward" bugs before they could happen. Worth
revisiting only if profiling ever cares about 5 extra fragment-shader
branches, which it won't for a while.

**Known simplification**: the extrude side-faces (the thin `thickness`-
deep strip around each rectangle's perimeter) reuse the same cap texture,
stretched, rather than a separate trim material. For a closed box with no
holes these strips are mostly hidden behind the neighbouring wall at the
room's corners, so it isn't visible in the current screenshots — but once
phase 5 cuts a doorway, the **inner reveal faces of that opening are
exactly these side faces**, and a stretched wall texture on a door reveal
will look wrong. Phase 5 should give holed geometry its own reveal
material (a plain wood/plaster tone is probably enough — the CSS build
never had reveal faces at all, so there's nothing to match).

### `src/js/scene/textures.js`

`wallTexture(kind, pal, face, sizeWorld, scale)` bakes (or returns a
cached) `THREE.CanvasTexture` for one face. Cache key includes kind, face,
pixel size and every palette colour the recipes read, so two rooms with
the same `kind` but different `pal` don't collide.

Coverage — each of themes.css's 14 `.k-*` kinds has a pattern function
(`paintPattern()`'s switch), plus:
- `k-glass` and `k-void` (back wall only) get **full overrides**, same as
  themes.css does — they replace the generic wash entirely rather than
  layering a pattern on top of it.
- `k-panel` gets the wainscot band, `k-plaster` gets the picture rail,
  every kind gets the skirting board — all as literal (if not pixel-exact)
  translations of the `::before` rules in `scene.css`/`themes.css`.
- Floor is **one** treatment for every kind, because `.f-floor` in
  themes.css is never overridden per-kind either — confirmed by reading
  the whole stylesheet, not assumed.
- Ceiling is the generic treatment for every kind except `k-timber`
  (rafters) and `k-glass` (sky-tinted), matching the two `.f-ceiling`
  overrides that actually exist in themes.css.

**What I verified directly** (rendered the canvas in isolation, read the
image): `k-panel` back and left walls (wainscot band + pinstripe read
correctly, skirting sits at the bottom), `k-glass` ceiling (sky gradient +
mullion grid), `k-void` back wall (starfield + nebula glow, dots
positioned per the CSS radial-gradient list). **What I wrote but only
skimmed**: `k-stone`, `k-brick` (shared `brickGrid()` running-bond
helper), `k-metal` (`rivetPlates()`), `k-forest` (`trunkBands()`),
`k-tile`, `k-ink`, `k-ice`, `k-water`, `k-paper` (the SVG floral motif is
approximated with quadratic-curve leaf shapes, not a faithful trace of the
original path data — this one is the least faithful translation in the
file and worth a second look if a paper-kind room turns out to be a
demo room in a later phase). None of these produced console errors and
all render *something* plausible, but I did not put each one into a fully
lit room and eyeball it the way I did for panel/glass/void. If phase 4+
uses a room with one of the unverified kinds as its own demo, budget a
few minutes to sanity-check that kind specifically before trusting it.

### `src/js/scene/stage.js`

`createStage(canvas, opts)` — one `WebGLRenderer`
(`ACESFilmicToneMapping`, `SRGBColorSpace` output, `antialias: true`),
one `PerspectiveCamera` (`makeCamera()`, see below), a `resize()` that
reads the canvas's parent element's box (attached to `window`'s `resize`
event automatically), and a render loop that stamps
`canvas.dataset.frame` on every frame — the pollable "a frame has
actually rendered" signal Playwright waits on instead of a fixed
timeout, per IMPLEMENTATION.md §2/§7's settle-before-screenshot rule.

`makeCamera(aspect)` — `fov = 2*atan(470/1500) ≈ 34.8°` (§4.2's formula,
matches within rounding), eye at `(0, 470, 1500)`, looking at
`(0, 489, -600)`. **Known simplification**: CSS's
`perspective-origin: 50% 45%` is a lens-shift (it moves *where on screen*
the vanishing point sits, without tilting the camera or changing what's
in frame at the edges) — the correct three.js equivalent is an
asymmetric view frustum, which `PerspectiveCamera` doesn't expose
directly (would need `camera.setViewOffset()` misused, or hand-editing
`camera.projectionMatrix` after `updateProjectionMatrix()`). I
approximated it by aiming very slightly above exact room-centre height
instead (`lookY = WORLD.h * 0.52` rather than `0.5`), which shifts the
image content similarly to a lens-shift for a small offset like this but
isn't the same transform. If a future phase needs the framing to match
the CSS build pixel-for-pixel (e.g. for a diff-based visual regression
test against old screenshots), implement the asymmetric frustum properly
instead of trusting this approximation.

`buildRoomLights(room, opts)` — one `AmbientLight` (colour from
`pal['wall-lit']`) plus one `THREE.PointLight` per `room.props` entry with
`t === 'lamp'`, positioned via `coords.placeProp()` at the lamp's anchor,
offset to approximate the bulb (anchor + half the shade width, minus the
shade height and 14px, matching `.prop-lamp .bulb`'s `bottom: -14px` in
`scene.css`). A small unlit sphere renders at the same position so the
fixture doesn't read as a dark silhouette under its own light — there's
no lamp *geometry* yet (that's phase 6/props), just this stand-in.

#### The physically-based light trap (read this before touching intensities)

three.js r155+ made `PointLight`/`SpotLight` intensity physically-based:
it's candela, and `decay` (default 2) is real inverse-square falloff —
there is no more "legacy" unlit-by-distance mode to fall back to. That's
fine in a scene authored in metres. Ours is authored in CSS pixels, and a
room is ~1680×940×1200 "metres" on that reading — the lamp sits maybe
500-900 units from any given wall. Irradiance falls off as
`intensity / distance²`, so at these distances an intensity in the
tens-of-thousands (which is what you'd guess if porting from a
one-metre-scale three.js example) is completely invisible: I confirmed
this empirically — `li=2600` (my first guess, arbitrary) and even
`li=50000` both rendered a **pure black room but for the bulb sphere**,
confirmed via screenshot, not by trusting a `mean == 0` in-page pixel sum
(see the next paragraph for why that number can't be trusted on its own).
The fix was to scale up by orders of magnitude and check a screenshot
each time: `500,000` was dim but visible, `2,000,000` looked good,
`8,000,000` started clipping the ceiling hot spot to white. Landed on
**`1,800,000` candela**, `decay: 2`, `distance: 1400` (a soft cutoff,
mostly redundant with decay at these ranges), ambient `0.7`. These are
the defaults baked into `stage.js`; override via `buildRoomLights(room,
{ lampIntensity, ambientIntensity, lampDecay, lampDistance })` if a
future room needs different tuning (a small room, or one with multiple
lamps close together, will likely want a lower per-lamp intensity).

I also tried `decay: 1` (softer, more traditional-looking falloff) at a
correspondingly lower intensity (`60000`) — it rendered a technically
"lit" room but noticeably flatter and paler, closer to the "grey plastic"
failure mode than `decay: 2` at the higher intensity. Physical
inverse-square, tuned by intensity rather than by softening the falloff
curve, is what actually produces the "cosy pool of light, dark corners"
look IMPLEMENTATION.md §4.5 asks for. Don't reach for `decay: 1` or
`decay: 0` as a shortcut to "brighter" — it trades away the mood.

**Pitfall for whoever automates screenshot brightness checking next**:
reading a `WebGLRenderer`'s canvas via `ctx.drawImage()` /
`getImageData()` from inside `page.evaluate()` reliably returns an
all-zero buffer in this setup, regardless of what's actually on screen —
almost certainly because the default `preserveDrawingBuffer: false`
means the drawing buffer's contents aren't guaranteed to survive past
the compositor swap, and `page.evaluate()` runs on a separate round trip
from the `requestAnimationFrame` callback that rendered the frame. I lost
some time to this: an intensity-tuning script that sampled in-page pixel
data reported `mean: 0, max: 0` for *every* trial including ones that
`page.screenshot()` (the real, compositor-level browser screenshot)
showed were clearly lit. **Use `page.screenshot()` and inspect the PNG
— never an in-page canvas pixel read — to judge brightness or verify a
render.** If a real in-page luminance check is ever needed (e.g. for an
automated regression threshold), set `preserveDrawingBuffer: true` on
the renderer first, at a permanent cost to performance, and confirm the
timing relative to the render loop.

### `tools/preview-stage.html`

Standalone harness, not part of the site. Imports `stage.js`/`shell.js`
directly via an inline import map (`three` -> `/vendor/three/build/
three.module.js`), loads one room from `src/js/data/rooms.js` by id
(`?room=<id>`, default `glasshouse`), and renders it full-screen.
`?orbit=1` swaps the fixed §4.2 camera for `OrbitControls` (mouse-drag
free-look) — useful for eyeballing geometry closure from angles the
fixed camera never sees, not meant to represent any in-shop camera pose.
`?li=`/`?ai=`/`?ld=` override `buildRoomLights()`'s intensity/ambient/
decay without editing code, for future tuning sessions. The canvas
carries `id="stage-canvas"` and `dataset.frame`, and the page sets
`window.__stage`/`window.__stageError`/`window.__stageRoom` for
Playwright to read.

**Must be served by a plain static server from the repo root** —
`python3 -m http.server 8099`, not `npm start`. Express's static
serving (`server/index.js`) deliberately only mounts `/src` and
`index.html` ("not the whole repo root, which would otherwise also hand
out server/ source, tools/, node_modules/ and data/cache/"), so
`/vendor/...` and `/tools/...` both 404 under `npm start` right now.
**I did not add a `/vendor` (or `/tools`) static route to
`server/index.js`** — that felt like scope creep for a phase whose
deliverable is explicitly "a standalone preview harness," not site
integration, and `server/index.js` is phase 1's file. **Phase 4 (or
whichever phase starts wiring the new stage into the actual site) will
need to add `app.use('/vendor', express.static(path.join(ROOT,
'vendor')))` to `server/index.js`** before `npm start` can serve the real
site once `main.js`/`index.html` start importing from `vendor/three/`.

## Things phase 4 should know

- **The shell has no doors, cases, books, or props.** Phase 4's own scope
  (cases, books, spine atlas, raycast, a11y mirror) doesn't need doors
  either, so this shouldn't block it, but don't expect `buildShell()` to
  give you anything beyond the five bare surfaces.
- **`coords.js`'s `SLOT`/`placeProp()` only got exercised for the `hang`/
  `hang-l`/`hang-r` slots** (lamp placement). The other 14 entries are
  ported (per §4.1's instruction to do the whole table now) but untested
  against real prop data — phase 6 is the first phase that will actually
  call `placeProp()` for `back-l`, `floor-c`, `tall-r`, etc. Spot-check a
  few against the old CSS build's visual position before trusting them
  at scale.
- **Camera poses (§4.3) don't exist yet** — `makeCamera()` only builds the
  fixed `room` pose. Phase 7 owns `shelf:<case>`/`table:<id>` and the
  tweening rig; nothing here anticipates that beyond the fact that
  `stage.camera` is a plain `PerspectiveCamera` a poses module can drive.
- **No shadow maps** (`renderer.shadowMap.enabled = false`). Point lights
  currently pass through walls/floor without occlusion, which doesn't
  matter yet (nothing opaque stands between a lamp and a wall in an empty
  shell) but will once cases and props exist. Decide deliberately in a
  later phase whether shadow maps are worth the cost, rather than
  discovering they're off by accident.
- **`server/index.js` needs a `/vendor` static route** before the real
  site can load `vendor/three/*` — see above. Small, one line, just not
  done yet because nothing in phase 3 needed it.
- **The `k-paper` texture is the weakest translation** in `textures.js` —
  see "What I did not end up needing" / "textures.js coverage" above.
  Worth a look if a demo room ever uses it.

## Verified this session

Server: `python3 -m http.server 8099` from the repo root (killed a
leftover `node` process that was already squatting on :8099 from an
earlier session and returning 404s for everything outside `/src` —
`lsof -nP -iTCP:8099 -sTCP:LISTEN` is the fastest way to notice this if
`curl` on a known-good path 404s unexpectedly).

```sh
python3 -m http.server 8099
# http://localhost:8099/tools/preview-stage.html?room=glasshouse
```

Playwright checks run this session (scripts were scratch — written,
run, and deleted; not part of the commit):

- Loaded `?room=glasshouse`, `?room=front`, `?room=orrery`, and
  `?orbit=1` (default room). All four: `canvas.dataset.frame` reached 10
  within the wait, **zero `pageerror`/`console.error` events**.
- Read `window.__stage.scene.children` / shell mesh positions/rotations
  and light positions/intensities via `page.evaluate()` — confirmed all
  5 shell meshes present with the expected names, positions and
  rotations, and exactly one `PointLight` + one `AmbientLight` for a
  single-lamp room.
- Screenshotted (`page.screenshot()`, real browser-level capture) the
  `glasshouse` and `front` rooms at the final tuned defaults, and looked
  at both images directly — this is the basis for the checkpoint verdict
  above.
- Screenshotted the live CSS site's `glasshouse` and `front` rooms
  (`http://127.0.0.1:8099/#/<room>`, `#enter` clicked, waited for
  `.travel`'s computed transform to settle — the same technique
  `tools/qa.mjs`'s `settle()` uses) for the side-by-side comparison.
- Resized the viewport mid-session (`1400×900` -> `800×1000`) on a live
  page: canvas dimensions and `camera.aspect` both updated correctly,
  render loop kept advancing, zero new errors, and the resulting
  portrait-orientation screenshot framed sensibly (narrower FOV, no
  stretching).
- Orbited the camera (mouse drag with `?orbit=1`) to angles the fixed
  §4.2 pose never reaches, including from outside the box looking back
  in at a bottom corner where floor/back-wall/left-wall all meet: no
  gaps, no z-fighting, extrude thickness visible and correct at the
  wall edge.
- `node tools/qa.mjs` was **not** re-run this session — nothing in
  `scene.js`/DOM/CSS changed, so the phase-2 handoff's clean sweep still
  stands. Worth re-running before phase 4 lands, as a baseline.

No `.md` report files were committed beyond this handoff; the debug/
tuning scripts used to reach the numbers above were temporary
(`tools/_*.mjs`/`.html`, deleted before the commit) — the committed
`tools/preview-stage.html` is the one lasting harness, and its `?li=/
?ai=/?ld=` params are enough to redo this tuning pass without
regenerating throwaway scripts.

## Environment

Same as `HANDOFF-PHASE3.md` reported: this is the owner's real local
machine, not the sandbox `IMPLEMENTATION.md` §1 describes — no proxy,
`git push` not attempted (not asked for), Playwright resolved its own
managed Chromium build fine. One new wrinkle this session: a stray
`node` process from an earlier session was already bound to `:8099`
serving Express's restricted static set, which made `/vendor/...` and
`/tools/...` both 404 under what looked like the right server. If a
future session sees unexplained 404s on paths that definitely exist,
check `lsof -nP -iTCP:8099 -sTCP:LISTEN` before assuming the code is
wrong.
