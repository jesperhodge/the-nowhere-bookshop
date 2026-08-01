# Iteration 2 — plan

Ten points from the owner. For each: what the feature should actually be, the
root cause underneath the symptom, whether a different approach beats patching,
and what changes.

Three findings sit underneath most of the list, so they come first.

---

## Finding A — three of the five room faces are never drawn

`.face` sets `backface-visibility: hidden`. The transforms on `.f-left`,
`.f-right` and `.f-ceiling` put their **front** faces pointing away from the
camera, so all three are culled. Every room has been a back wall, a floor, and
black space where the rest of the room should be.

| face | transform today | normal | seen? |
|---|---|---|---|
| `.f-back` | `translate3d(-840,-470,-1200)` | +z | yes |
| `.f-floor` | `…(-840,470,-1200) rotateX(90deg)` | −y (up) | yes |
| `.f-ceiling` | `…(-840,-470,-1200) rotateX(90deg)` | −y (up) | **no** |
| `.f-left` | `…(-840,-470,-1200) rotateY(-90deg)` | −x (outward) | **no** |
| `.f-right` | `…(840,-470,0) rotateY(90deg)` | +x (outward) | **no** |

Verified by injecting `backface-visibility: visible` — the room immediately
reads as an interior instead of a lit diorama in a void (`scratchpad/shots/exp-backface.png`).

Consequences that were being blamed on other things:

* The near-field ambient `box-shadow` added last session to `.f-left`/`.f-right`
  has never rendered. Neither has `.k-panel`'s wainscot on the side walls, nor
  `.k-glass`'s glazing, nor `.k-timber`'s ceiling.
* Doorways have no wall around them → they read as free-floating arches (point 2).
* Door light spills into blackness with a hard edge (point 3).

**Fix:** re-derive the three transforms so the front face points into the room,
and keep backface culling as protection while panning:

```
.f-left    translate3d(-840px, -470px, 0)      rotateY(90deg)
.f-right   translate3d( 840px, -470px, -1200px) rotateY(-90deg)
.f-ceiling translate3d(-840px, -470px, 0)      rotateX(-90deg)
```

This flips which local edge of each wall is the near one, so the near-field
gradients, the `.low` ceiling override in `themes.css` and the `::after`
skirting all need re-deriving against the new orientation. That is the whole
reason to do it as a transform fix rather than just deleting the culling line:
we want to keep culling, and we want the near/far ends to be knowable.

## Finding B — `filter` on hover collapses the 3D subtree

`.door3d:hover { filter: brightness(1.22) saturate(1.1) }` and
`.table3d:hover .table3d__top { filter: … }`.

Per CSS Transforms 2, an element with `filter` other than `none` is a *grouping
property*: the **used** value of `transform-style` on it becomes `flat`,
regardless of what the computed style says. So on hover the entire preserve-3d
subtree renders flat.

* On the table: the top, the four legs and the book stacks all lose their
  z placement and snap into the apron's plane → the table visibly jumps
  (point 1's "flickers / moves").
* On a door: `.dsign` is a child of `.door3d` and is turned out of the wall with
  `rotateY(±90deg)`. Flattened, that rotation renders it edge-on — zero width.
  That is why the sign vanishes exactly when you hover the door (point 2).

Measured in Chromium, room `front`, before → after hover:

| element | before (w × h) | after |
|---|---|---|
| `.table3d__top` | 368.4 × 31.6 | 364.9 × **1.1** |
| `.table3d__leg` #3 (back left) | x 608.0, 13.4 × 141.0 | x **579.7**, 16.1 × 163.6 — identical to leg #1 |
| `.table3d__leg` #4 (back right) | x 891.3, 13.4 × 141.0 | x **906.3**, 15.7 × 162.8 — identical to leg #2 |
| `.dsign__board` (left door) | 119.7 × 31.8 | **0.09** × 31.2 |

Front and back legs collapse onto each other — the depth information is simply
gone. With `.door3d:hover { filter: none }` forced, the sign board holds
117.7 × 31.3, i.e. its full size. Confirmed.

(Note: it is not only the two leaves named in `.table3d:hover`. `.table3d`
carries the class `door3d`, so it also matches `.door3d:hover`, and the filter
lands on the 3D root itself.)

Also worth knowing: `.door3d` has `transition: filter .35s`, and the computed
value only reaches exactly `none` about 600ms after the pointer leaves. A value
of `brightness(1.0016)` is still not `none`, and still flattens. So the table
stays collapsed for most of a second after you stop pointing at it — which is
the "flicker" rather than a single jump.

**Fix:** never put `filter` (or `opacity`, `mask`, `backdrop-filter`) on a node
that owns 3D children. Drive hover through a custom property that the *leaf*
faces read (`--lit: 1`), or apply the filter on leaves only.

## Finding C — the flat props are clipped by their own SVG viewBox

*(This replaces an earlier theory of mine that the doorway planes were occluding
the props. I tested it and it is wrong: hiding every `.door3d` in the Glasshouse
changes the background behind the plant and nothing else — exactly 1 pixel of
plant is revealed. The doors are not eating the props.)*

The real cause is in `props.js`. Each artwork is `S(viewBox, body)`, rendered as
`background: var(--art) center/contain`, so anything drawn outside the declared
viewBox is clipped by the SVG viewport. `plant` declares `viewBox="0 0 140 180"`
and then places its leaves at `x = 70 + Math.sin(a / 57) * 96` for
`a = −80 … 80`, i.e. **x from −24.6 to 164.6** — the outermost leaf on each side
is cut off at the box edge. That is the hard vertical edge in the Glasshouse.

**Fix:** widen the viewBox (or clamp the geometry) per artwork. A full audit of
every `ART` entry is running; the fix is per-entry and mechanical.

---

## 1. The front table

**Requirement.** A table you believe is a table: top recedes, four legs under
the corners, stacks resting on the surface, no movement on hover.

**Root cause.** Two bugs on top of Finding B.
`.table3d__leg` sets `position:absolute; top:22px` and **no `left`**, so each
leg is laid out from its static position. `.table3d` is a `<button>`, and a
button centres its content, so the static position is the middle of the box —
every leg lands ~235px right of where the CSS intends. The legs are not under
the top.

**Better approach.** Yes — stop building a table as a `<button>`. A button
brings UA centring, padding, a focus ring drawn on a rotated box, and it is the
node the hover `filter` lands on. Rebuild the table as a plain `<div>` group of
explicit faces (top, apron, two side rails, four legs, stacks), with a separate
flat `<button>` overlay as the hit target. Same pattern the doors should use.

**Changes.** `buildTablePortal()` → `buildTable()` in `scene.js`; explicit
`left`/`top` on every face; hover via `--lit` on leaf faces; hit target as a
sibling button.

## 2. Doorways with depth, in a wall

**Requirement.** An opening you could walk through: wall thickness visible on
the reveal, the room beyond only visible *through* the opening, the sign
readable and legible on hover rather than vanishing.

**Root cause.** Two things. Finding A (no wall). And the door is a single plane
pasted on the wall with a painted radial gradient standing in for "beyond" —
there is no recess, so there is nothing to give it depth, and nothing occludes
what is behind it.

**Better approach.** Yes. Build the doorway as a real recess: the side wall is
split into segments around each bay (above / below / fore / aft), and the
opening gets a four-sided reveal box — two jambs, a soffit, a threshold —
sunk ~90px into the wall, with the glow plane at the back of that box. Then the
wall genuinely surrounds the opening, the reveal catches the light, and the
spill has a surface to land on.

**Sign behaviour.** Owner wants it hidden until hover. Move `.dsign` out of the
door's 3D subtree so no hover filter can flatten it, default `opacity: 0`, show
on `:hover`/`:focus-visible` of the door. Keep it always rendered for screen
readers via the existing `aria-label`.

## 3. Door light cut off

Same root cause as 2. `.door3d__spill` is a rectangle rotated onto the floor,
sitting in blackness with nothing to blend into, so its edge is visible. Once
the wall exists and the reveal is a box, the spill becomes light on a floor
inside a room and gets a radial falloff plus a soft mask. No separate work item
beyond point 2.

## 4. Dock shortcuts

**Requirement.** The doorways are the way through; the dock should not compete.

**Change.** Delete `#dockDoors`, `showWaysOn()`, the `.godoor`/`.dock__doors`
CSS and the dock click handler.

**Decided:** keep *both* back controls — the existing Back ("Back to The Hollow
Oak", one level up) plus a new always-home button beside it that returns to The
Front Room from any depth. The home button is disabled in the front room itself.

## 5. Side-wall books look like skewed rectangles

**Requirement.** Books, with a top edge, a page block and a shadow — not stripes.

**Root cause.** They *are* stripes. `spineRun()` in `covers.js` paints a whole
shelf run as one CSS gradient. That was a deliberate trade last session: real
`.bk` nodes on a wall-mounted case are seen almost edge-on and collapse to
1–3px slivers, so they were replaced with paint to save ~480 nodes per room.

**Better approach.** The trade was made under a wrong constraint. The slivers
were unreadable because there was no way to *turn and look at that wall* — which
points 6 and 8 now add. With an approach mechanic, real geometry is worth its
cost. Rebuild side shelves from real `.bk` nodes; keep them cheap by omitting
the two faces you can never see from inside the room (`bk__back`, `bk__edge`).

Measured capacity: a side case is `--cw` 370px (7 rooms) or 640px (39 rooms),
2 rows each, usable width `cw − 68`. At the observed 22.1px average spine plus a
4px gap that is **11 books per row** at 370px and **22 per row** at 640px — so up
to 88 real books per room on the side walls, on top of the back wall. Four rooms
(landing, bonelibrary, understory, longtable) have no side case at all.

## 6. Looking at the side shelves — and 8. Reading the spines

These are one mechanic, so they get one design.

**Requirement.** Get closer to any shelf and read it, without leaving the room.

**Root cause of 8.** The room is fitted whole to the viewport, so a 30px spine
at z = −1160 carries an 11–14px vertical title. It is not a font-size problem;
it is a camera distance problem.

**Design — "step up to the shelf".**
* Every case (back wall and both side walls) becomes a focusable target.
  Clicking one, or pressing `←`/`→`/`↑`, moves the camera to a *shelf pose*:
  `.pivot` translates and rotates to sit square in front of that case, ~2.5×
  closer. Side-wall poses turn ~70–80° so the run is seen face-on.
* The wheel (and pinch) dollies smoothly between "whole room" and "at the
  shelf". This is the intuitive magnify the owner asked for.
* `Escape`, a click on empty floor, or the existing Back steps out again.
* At shelf distance the spine title threshold drops so nearly every book shows
  its title, and the hover tag stays as-is.
* Not a new room: no route change, no `buildRoom`, the room stays mounted.
  A shallow `#/room?at=left` query is *not* added — the pose is transient state.
* Reduced-motion: pose changes jump rather than animate.

## 7. Filling the shelves with real books

**Requirement.** No placeholder spines. Every book on a shelf is a real book the
reader can click, curated to the standard of the existing 409.

**The numbers, measured.** Every room's back-wall case is exactly 2 rows. Each
row is 1152px of usable width; every room carries exactly **40 filler spines**,
whatever its real-book count (5–15). Across the shop: **409 real, 2,000 filler.**
Average spine is 22.1px wide, so a row packed edge to edge holds **43 books**.
Today's rows sit at ~55% occupancy, which is why the shelves look sparse and
centred even with the fillers in.

**Decided: replace every placeholder — target ≈ 2,000 new books, ~2,400 total.**

**Approach — harvested, not hand-written.** Per your steer: no hand-written
blurbs, notes or tags for the new books. Instead a pipeline:

1. **Harvest.** Build lists of title/author pairs from prize lists and critics'
   polls — Booker, International Booker, Women's Prize, Pulitzer, National Book
   Award, Hugo, Nebula, World Fantasy, Costa, Goldsmiths, Republic of
   Consciousness, CWA Daggers, Wainwright, Baillie Gifford, Griffin, T. S. Eliot,
   Eisner, and so on — each mapped to the rooms it belongs in. Provenance is the
   point: a book's `won`/`cited` then comes from the list it was drawn from
   rather than from model memory, which removes the accolade-accuracy risk that
   has been top of the backlog since iteration 1.
2. **Enrich.** ISBN-13, page count, first-publication year and the publisher
   description, keyed by title+author.
3. **Shelve.** Generated entries get title, author, year, pages, ISBN, the
   accolade that put them on the list, and a publisher blurb. No `note`, no
   hand-written `tags`, no `first` line.

The existing 409 keep their curator's notes and become a visible tier — the
shopkeeper's picks — rather than being diluted. `note` becomes optional
throughout: the book panel, the search index and `tools/qa.mjs` all currently
assume it is present.

**Blocker — I need something from you here.** This container's egress policy
refuses `api.hardcover.app`, `openlibrary.org`, `gutenberg.org` and
`standardebooks.org` with a 403 at the proxy's CONNECT, and `WebFetch` is
refused for the same hosts. Your token is valid; it just cannot leave this box.
`WebSearch` *does* work.

So, three ways to get steps 1 and 2 done — pick one:

* **(a) You run the fetch.** I write `tools/harvest.mjs` (award lists → shelf
  lists) and finish `tools/hardcover.mjs enrich`; you run both on your machine
  with the token and commit the generated data. Fits how you are already pushing
  the code. Most reliable, and the site stays a static folder.
* **(b) Open the egress allowlist** for `api.hardcover.app` (plus
  `openlibrary.org` and `www.googleapis.com` as fallbacks) and I run it here.
* **(c) Runtime enrichment.** Ship the shelf as title/author/ISBN only and fetch
  descriptions in the browser from a CORS-friendly, key-free endpoint — Google
  Books `volumes` or Open Library — cached in `localStorage`. Note Hardcover
  itself is not an option for this: their docs forbid browser use and the token
  would be public. Workable as a *fallback*, but it makes a shelf depend on the
  network and puts a blank where a description is missing.

My recommendation is **(a) with (c) as a top-up**: a baked snapshot you generate
once, and a runtime fetch only for books the snapshot missed.

Either way I can start the harvest now — `WebSearch` reaches prize lists fine,
so step 1 is not blocked, only step 2 is.

**Performance.** 2,400 real books means ~86 book nodes per room instead of ~45.
Real books render 5 faces to a filler's 2, so this would roughly triple face
count. Mitigation: drop `bk__back` and `bk__edge` from shelved books — neither is
ever visible from inside the room — taking a book from 5 faces to 3. Net node
growth then lands near +40%, against a current median room transition of 1266ms
that already needs watching.

## 9. Props cut off

Covered by Finding C: each offending `ART` entry in `props.js` gets its viewBox
widened to the geometry it actually draws (or the geometry clamped, where the
shape reads better clipped to a tidy box). Mechanical, per-entry. The audit
listing every overflowing artwork and by how much is in flight.

## 10. The front table as a view, not a room

**Requirement.** Clicking a table should look *down at the table*, not walk you
into a room called "The Front Table".

**Root cause.** A table was modelled as a room because rooms were the only
container the app had — `fronttable` is a full room record with walls, props and
a shelf, reached by a route.

**Better approach.** Make "table" a first-class view. A bird's-eye tabletop with
books lying flat, covers up — which finally puts `coverSVG()`, the best art in
the project, in front of the reader. It reuses the existing overlay shell
(`.overlay__scrim` + `.overlay__body` + header + `.scroll` body), so it is a new
renderer, not new plumbing.

**Changes.**
* `src/js/views/table.js` → `renderTable(room)`: a tabletop surface, books laid
  flat in a loose grid with slight per-book rotation, covers rendered at
  ~150×225, click opens the existing book panel.
* `fronttable` stops being a room: its 15 books become the front room's table,
  and `#/fronttable` opens the table view over the front room.
* Rooms whose name contains "Table" (The Cartographer's Table, The Long Table)
  get a real table prop; clicking it opens the same view.
* `buildTable()` from point 1 becomes the shared prop, placed by slot.
* The plan (`map.js`) and breadcrumbs stop listing the table as a room.

**Decided: a table carries its own selection, separate from the room's shelf** —
the way a real shop's display table is not just its shelves lying down. Books get
an `onTable` flag; a table shows only those. Under point 7's pipeline that
selection comes free: it is the most recent prize winners among the titles
harvested for that room, so it needs no separate hand-curation and it stays
current with the lists.

---

## Order of work

1. Finding A (walls + ceiling) — unblocks 2 and 3 and most of the room's look.
2. Finding B (hover flatten) — one class of bug, fixes 1 and half of 2.
3. Point 1 rebuild (table geometry) + point 10's shared table prop.
4. Finding C / point 9 (viewBox audit fixes).
5. Points 2 + 3 (recessed doorways, sign on hover).
6. Point 4 (dock: chips out, home button in).
7. Points 6 + 8 (approach mechanic), then point 5 (real side-wall books).
8. Point 10 (table view).
9. Point 7 (harvest → enrich → shelve) — largest, and gated on the access
   question above. Step 1 can start immediately; step 2 cannot.

QA (`tools/qa.mjs`) gains checks for: every face rendering non-zero area, no
`filter` on a `preserve-3d` node, every `ART` entry drawing inside its viewBox,
and zero filler spines once point 7 lands. `note` moves from required to
optional.
