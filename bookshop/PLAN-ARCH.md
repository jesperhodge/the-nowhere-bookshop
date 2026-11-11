# Iteration 2 — architecture

Companion to `PLAN.md`. That document is the evidence: what is broken in each of
the ten points and why, measured in the browser. This one is the decision: what
we build instead. Read that one first if you want the diagnosis, this one if you
want the design.

## The decision

Move the room from hand-written CSS 3D + hand-written SVG to **three.js
(WebGL)** for the geometry, keeping the SVG art pipeline as a *texture source*
and keeping the entire UI layer in DOM.

## Why — the ten points are one substrate leaking in nine places

| point | symptom | substrate cause |
|---|---|---|
| 1 | table jumps on hover | `filter` is a grouping property: it forces `transform-style: flat` on the whole subtree |
| 1 | legs not under the top | DOM static positioning leaking into scene layout (`position:absolute`, no `left`, inside a centring `<button>`) |
| 2 | doors don't pass through a wall | CSS cannot cut a hole in a plane |
| 2 | sign vanishes on hover | same flattening as point 1 |
| 3 | door light cut off | no depth buffer; the spill is a painted rectangle with nothing to land on |
| 5 | side books are stripes | edge-on boxes collapse to 1–3px, so they were replaced with a painted gradient |
| 6, 8 | can't get close enough to read | no camera — "closer" means re-deriving a pile of transforms by hand |
| 7 | 2,400 books | ~7,000 transformed DOM nodes per room |
| 9 | props clipped | *(this one is genuinely ours — SVG viewBox overflow, survives the move)* |
| 10 | a table had to be a room | no camera, so "look down at it" wasn't available as a view |

Only point 4 (dock chips) and point 9 (viewBox) are independent of the
substrate. Everything else is downstream of it.

Also worth stating plainly: the CSS approach hid three of five room faces for
the whole life of the project without anyone noticing (see `PLAN.md`, Finding
A). A z-buffered renderer cannot have that bug.

## Alternatives considered

* **Stay on CSS 3D and fix the nine.** Lowest immediate effort. Rejected: every
  fix is a workaround for a missing depth buffer, and point 7's node count walks
  into a wall regardless.
* **`CSS3DRenderer` (three.js driving DOM elements).** Keeps DOM
  accessibility and gives a real camera and scene graph — but it still paints
  through CSS, so it inherits the per-element sorting and the flattening
  pathology. Rejected: it fixes the ergonomics and none of the defects.
* **Babylon.js.** Comparable capability, heavier API surface, weaker
  no-build-step story. Rejected on fit, not on quality.
* **2.5D (Pixi + layered parallax).** Simpler and prettier per unit effort, but
  "walk toward the shelf" is exactly the thing points 6 and 8 ask for, and it is
  the thing 2.5D cannot do.

## What survives, what goes

**Survives untouched** — this is why the effort is bounded:

* all of `src/js/data/**` (rooms, the 409 books, prop art, enrich)
* `covers.js` — the procedural jacket generator, the best thing in the repo. Its
  SVG output becomes a texture instead of a DOM background.
* `shop.js`, `links.js`, `views/book.js`, `views/map.js`
* `base.css`, `ui.css`, and the whole DOM UI: dock, book panel, search, plan,
  parcel, toast, grain and vignette overlays
* `main.js` routing, state, persistence and overlay wiring

**Replaced:** `scene.js` (469), `scene.css` (763), `themes.css` (158) —
about 1,390 lines of ~6,700, roughly a fifth of the codebase, swapped for an
estimated ~900 lines of scene code. Smaller than the rewrite budget offered.

## The one dependency

**three.js 0.185.1 (r185)**, vendored into the repo and loaded through an import
map. No bundler, no build step, no npm needed to view the shop — which is the
project value `package.json` being gitignored was protecting.

```html
<script type="importmap">
{ "imports": {
    "three": "/vendor/three/build/three.module.js",
    "three/addons/": "/vendor/three/examples/jsm/"
} }
</script>
```

One caveat that will waste an afternoon if it is not written down: `three.module.js`
imports `./three.core.js` by a **relative** path, so the import map never sees it.
`three.core.js` has to be physically deployed next to `three.module.js` or the
module 404s. The import map itself only needs the two entries above.

Cost: ~734 KB minified, **~183 KB gzipped**, for both files. That is the entire
dependency budget — nothing else is added.

**`WebGLRenderer`, not `WebGPURenderer`.** WebGPU sits around 82–85% browser
coverage in 2026 with Firefox still the gap, and it only wins on high draw-call
and compute-heavy work, which this is not. `WebGPURenderer` does degrade to
WebGL2 automatically, so it stays available as a later switch if it ever pays.

## Shape

```
src/js/scene/
  stage.js       renderer, camera rig, render loop, resize
  room.js        builds one room: shell, cases, books, doors, props
  shell.js       walls/floor/ceiling as extruded shapes with door holes
  books.js       shelf packing, per-room spine atlas, hit mapping
  props.js       SVG art -> alpha-mapped billboard planes
  poses.js       named camera poses + tweening (room / shelf / table)
  a11y.js        the focusable DOM mirror of the room
vendor/three/    three.js r185, committed
server/          optional Express app (see below)
```

## Accessibility — the thing a naive WebGL port destroys

The current design's one real virtue is stated at the top of `scene.js`: books
are real focusable buttons, so the shop works with a keyboard and a screen
reader. A canvas has none of that, and it must be rebuilt deliberately rather
than regretted later.

`a11y.js` maintains a visually-hidden but focusable list mirroring the room —
every book, doorway and table as a real `<button>` with the aria-label it has
today, in shelf order. Focusing one flies the camera to it and lights it in the
scene; activating one does what clicking does. Pointer input uses raycasting
against the scene; keyboard and AT use the mirror.

This is not a downgrade dressed up. Today a screen reader meets 86 buttons whose
DOM order is shelf order but whose geometry is meaningless to it; the mirror is
the same list without the 3D-transformed noise, and the camera follows focus,
which it currently does not.

No-WebGL fallback: the existing "The shelf" overlay, search and plan already
constitute a complete text UI for the whole shop. On a context-creation failure
the app opens that instead of the stage, and says so.

## Keeping the look

The warmth of the current shop comes from gradients, and naive WebGL looks
plasticky. Guards:

* keep the SVG/canvas texture pipeline — the art does not change, only where it
  is painted
* unlit or Lambert materials with baked gradient textures for the shell, so the
  wall treatments in `themes.css` port as textures rather than being re-invented
* **real lights**: one warm point light per lamp prop, plus low ambient. This is
  the payoff — the "cosy interior with the walls falling away into a void" is
  currently faked with radial gradients on planes that turned out not to render
  at all. Real falloff fixes it at the source.
* the DOM grain and vignette overlays stay exactly as they are, on top of the
  canvas

## Books at scale

* one canvas2d texture atlas per room holding every spine (art + title), built
  on room entry, sized so titles stay sharp at the closest camera pose
* books as individual meshes sharing that one material — simple, and it makes
  the per-book hover animation trivial; merging into one geometry is the
  optimisation if profiling asks for it, not before
* raycast for hit-testing, so no per-frame DOM measurement (the layout thrash
  the previous iteration removed does not come back)

### Why a canvas atlas and not an SDF text library

The obvious answer for crisp 3D text is `troika-three-text` (v0.52.5, actively
maintained, resolution-independent SDF glyphs). It is the right tool for
free-floating 3D labels. It is not the right tool here, for two reasons.

A spine is one image: gradient ground, head and tail bands, and the title, all
of which `spineStyle()` already produces together. Splitting the title out into a
separate SDF text object to composite back over the same rectangle is more
machinery for a worse result. And troika is not one file — it pulls
`troika-three-utils`, `troika-worker-utils`, `bidi-js` and `webgl-sdf-generator`,
so a no-bundler setup means either five vendored packages or a runtime CDN
dependency. A CDN request is exactly what "a folder you can open" rules out.

So: canvas2d atlas, re-rendered at higher resolution when the camera enters a
shelf pose, which is the only time the extra resolution is visible. If that
proves not crisp enough in practice, troika vendored (not CDN'd) is the upgrade
path, and it is a drop-in for the title layer alone.

## Doorways

`THREE.Shape` with `.holes` fed to `ExtrudeGeometry` gives the wall face *and*
the inner reveal faces of the opening in one geometry — confirmed behaviour, and
long-stable API. The hole is a `Path` wound opposite to the outer contour, with
`absarc()` for the arch top. A point light inside the reveal spills into the room
properly, which retires points 2 and 3 together rather than faking either.

## Camera poses — points 6, 8 and 10

Named poses on a rig: `room` (default), `shelf:<case>` (square-on and close, on
any of the three walls), `table:<id>` (looking straight down). Wheel and pinch
dolly between room and shelf; click a case or a table to go to its pose; Escape
steps back. Reduced motion jumps instead of tweening.

Point 10 gets simpler as a result: the bird's-eye table view is a camera pose
looking down at a table that actually exists in the room. No overlay, no view
that pretends to be a room.

## The server

`server/` — a small Express app, optional. The static site still opens without
it and runs on baked data alone.

```
server/index.js        express: static + /api
server/hardcover.js    the API client — ONE implementation
server/cache.js        disk cache under data/cache/ (committable = the snapshot)
server/fixtures/*.json recorded responses, used when there is no token
server/mcp.js          the same client exposed as an MCP tool (see below)
```

* the token is read from `.env` **server-side only** and never reaches the
  browser — which is also what Hardcover's own terms require
* `GET /api/book?title=&author=&isbn=` → normalised `{isbn13, pages, year,
  description, source}`
* `GET /api/list/:slug` → a harvested award list
* three modes, auto-detected and always reported in `source`: `live` (token
  present, upstream reachable) · `fixture` (no token or upstream refused) ·
  `miss` (no data — the client degrades rather than showing a hole)
* it never 500s on an upstream failure; it falls back and says so

One client, three front ends: the Express route, `tools/hardcover.mjs enrich`,
and the MCP server. Today there are two divergent code paths to the same API.

Client fallback chain: baked `enrich.js` → `/api/book` → nothing.

### Running it

* `npm start` — Express on :8099, serves the site, live API if `.env` has a
  token, fixtures if not.
* `npm run mock` — forces fixture mode even with a token, for offline work.
* Opening `index.html` through any static server with no Node at all still
  works. You get the baked data and no live lookups.

## Giving me access to the API

The container refuses `api.hardcover.app` with a 403 at the proxy's CONNECT.
That is this environment's egress policy, not your token — the token is fine and
has never been used against the live API. Two ways to change it.

### Route 1 — allowlist the host on the environment (simplest)

Environments have a **Network access** setting with four levels: **None**
(nothing outbound), **Trusted** (package registries, GitHub, cloud SDKs),
**Full** (any domain), **Custom** (your own allowlist).

1. Go to **claude.ai/code**.
2. Click the cloud icon showing the current environment's name, in the row above
   the message box. That opens the environment selector — there is no settings
   page or direct URL for it.
3. Hover this environment and click the **settings gear**, or choose
   **Add cloud environment** for a new one.
4. Set **Network access** to **Custom**.
5. In **Allowed domains**, add on its own line:
   ```
   api.hardcover.app
   ```
   A leading `*.` matches every subdomain, if you ever need it.
6. Tick **"Also include default list of common package managers"** — otherwise
   *only* what you listed is reachable, and npm and the GitHub tooling stop
   working.
7. Save. Changing the list rebuilds the environment cache and reruns the setup
   script, so the next session starts slightly slower.

Note: each environment carries its own list; there is no org-level allowlist an
admin can push to everyone. Traffic still goes through Anthropic's proxy either
way.

### Route 2 — hand me the API as a tool

`server/mcp.js` exposes the same `hardcover.js` client as an MCP server with one
tool, `hardcover_search`. Point this workspace at it and I can call the API
directly with the token staying on your side, never in a prompt and never in the
repo. Slower to set up than route 1; better if you would rather not widen the
egress policy at all.

Either route is optional. Without both, the pipeline runs on fixtures here and
live on your machine, which is what the fallbacks are for.

## The ten points on the new substrate

| # | what changes |
|---|---|
| 1 | table is a mesh group, not a `<button>` with rotated children. Hover is an emissive change on a material — there is no `transform-style` left to flatten, and no static positioning to leak. Both root causes cease to exist. |
| 2 | wall is an extruded shape with an arched hole; the opening has real reveal faces. The room beyond is genuinely only visible through it, because there is a depth buffer. Sign moves to the DOM layer, shown on hover/focus. |
| 3 | a point light inside the reveal, not a painted rectangle. Nothing to cut off. |
| 4 | unchanged from `PLAN.md` — DOM only. Chips deleted, home button added beside Back. |
| 5 | side shelves become real book meshes at every angle. The painted-gradient workaround is deleted along with `spineRun()`. |
| 6 | `shelf:<case>` camera pose on any of the three walls. |
| 7 | node count stops being the constraint; ~86 books a room is a few hundred triangles. Data pipeline as below. |
| 8 | camera dolly plus an atlas re-rendered at higher resolution in the close pose. |
| 9 | **unchanged** — the five viewBox overflows in `props.js` are ours, not the substrate's, and the SVG art carries over as textures. Same five one-line fixes. |
| 10 | a camera pose looking straight down at a table that actually exists in the room. No overlay, no view pretending to be a room. |

## Order of work

1. **Server + fixtures + client fallback.** Independent of the rewrite, unblocks
   the point 7 data question, and lets you verify the API path on your machine
   while I work on the scene.
2. **`props.js` viewBox fixes** (point 9). Five one-line changes, valid on either
   substrate, worth banking before anything moves.
3. **Stage skeleton** — renderer, camera rig, one room shell with real lights.
   The moment of truth for whether the look survives; stop and reassess here if
   it does not.
4. **Cases, books, atlas, raycast, a11y mirror** (points 5, 8).
5. **Doorways with real openings, signs on hover** (points 2, 3).
6. **Props as textured planes.**
7. **Tables and camera poses** (points 1, 6, 10).
8. **Dock** (point 4).
9. **Harvest and shelve ~2,000 books** (point 7).

Points 1–6 and 8–10 are all reachable without any API access. Only step 9 needs
it.

## Risks, stated plainly

* **The look.** The warmth is currently made of gradients. Real lighting should
  be better, but "should be" is doing work in that sentence. Step 3 exists to
  find out early, before anything depends on it.
* **Accessibility.** A canvas has none by default. The mirror layer is designed
  for it rather than bolted on, but it is new code carrying an existing promise,
  and it needs testing with an actual screen reader, not just an audit tool.
* **WebGL requirement.** A hard dependency where there was none. Mitigated by
  the existing text UI as a fallback, which is already complete.
* **Scope.** This is a bigger change than the ten points asked for. It is
  justified because nine of them share one cause — but if the substrate move
  stalls, points 4 and 9 should be landed on the current code regardless, since
  neither depends on it.
