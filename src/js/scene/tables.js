/* ============================================================
   Tables — a display surface that is a real table, with real books
   lying flat on it, covers up.

   Per PLAN.md point 1 ("A table you believe is a table: top recedes,
   four legs UNDER the corners, stacks resting on the surface, no
   movement on hover") and point 10 ("a table carries its own
   selection, separate from the room's shelf — the way a real shop's
   display table is not just its shelves lying down"): this ports the
   INTENT of scene.js's buildTablePortal() (still live, read-only
   reference this phase) and its `TABLE` constant, but on this
   substrate "the table view" is a camera pose that looks down at a
   table which genuinely exists as 3D geometry (PLAN-ARCH.md), not a
   DOM overlay standing in for one, and not a room reached through a
   door (point 10's whole complaint about `fronttable` today). poses.js
   (a parallel phase-7 file, not this one) is the thing that actually
   builds and drives that camera pose; this file only builds the table
   and hands back the `surface` poses.js needs, per coords.js's
   lampAnchor()-style "one source of truth" discipline — nobody
   downstream re-derives this file's placement arithmetic independently.

   Two exports carry the whole file:

   - planRoomTable() — data only, no THREE. Given a room and its shelf
     books, decides whether this room has a table and, if so, which
     books move onto it. No book may ever be listed on both the shelf
     AND the table (PLAN.md point 10's explicit "not just the shelf
     lying down") — every rule below either takes books that were
     never on this room's shelf to begin with, or removes them from
     `shelfBooks` in the same call that adds them to the table.
   - buildRoomTable() — geometry. The table itself (top, apron, two
     side rails, four legs; real MeshStandardMaterial; never `filter`/
     `opacity`/`mask` — Finding B's whole point, and exactly the class
     of bug that made the CSS table "jump" on hover) plus its books,
     lying flat in a loose, per-book-jittered grid, covers toward the
     camera — which finally puts covers.js's coverSVG(), "the best art
     in the project" per PLAN.md point 10, in front of the reader.
   ============================================================ */

import * as THREE from 'three';
import { coverSVG, shelfSize, spineStyle, hash, rngFrom } from '../covers.js';
import { svgTexture, pinstripe } from './textures.js';

/* ── the table's own geometry constants ──────────────────────────

   Derived by hand from scene.js's authored `TABLE = {w:470, h:232,
   d:300, z:-330}` and buildTablePortal()'s own x offset
   (`translate3d(-w/2-300px, ...)`) and CSS y (`WORLD.hh - h`), carried
   through coords.js's convention (threeY = 470 - cssY, floor y = 0;
   x and z carry over unchanged — see coords.js's header comment):

     x0    = -w/2 - 300 = -235 - 300 = -535         (x unchanged)
     zNear = scene.js's TABLE.z = -330              (z unchanged)
     h     = threeY(WORLD.hh - w_h) = threeY(470-232) = threeY(238) = 232

   So: the top's box spans x -535..-65, z -630..-330 — the top RECEDES
   away from the viewer starting at its NEAR edge (zNear = -330,
   closest to the camera at z=+1500) back to its far edge
   (zNear - d = -630, deeper into the room). Getting that sign backwards
   is exactly the bug scene.css's own `.table3d` comment warns about:
   "Getting the sign of that rotation wrong is what made the table jut
   out of the front of the room." Top surface sits at y = h = 232;
   legs stand on the real floor at y = 0.

   NOT coords.js's unused SLOT.floor-c/floor-cl (HANDOFF-PHASE7.md
   flagged them as a candidate worth checking before inventing a new
   convention): those anchor a PROP BOX — a single z plane, with height
   (h) growing floor-ward from one top edge, per every other SLOT
   entry's convention. A table needs a depth RUN in z (a near edge and
   a far edge, not one z value) plus its own top SURFACE — floor-c/cl's
   convention has no field for either. They are unused, reserved slots;
   TABLE below is authored, shipped geometry, the same status scene.js's
   own TABLE constant already had — not a new invention, a port. */
export const TABLE = { w: 470, h: 232, d: 300, x0: -535, zNear: -330 };

/* ── small helpers, deliberately not imported from books.js/props.js ──
   Both values below are duplicated from an existing constant/helper
   elsewhere in the codebase rather than imported, on purpose — same
   "don't import across files for one shared constant" call this
   codebase already made once (covers.js's `hash`/`rngFrom` ARE
   exported and shared; a page colour and a one-line hex-darken
   helper are not worth a cross-file dependency for). */

const PAGE_COLOR = '#e9dec5'; // deliberately the same colour books.js's pageMaterial() uses
/* One instance for every table book on every table, for the life of the
   page — room.js's dispose() reads `userData.shared` and leaves it
   alone. Same flag, same reason, as books.js's own pageMaterial(). */
let sharedPageMaterial = null;
function pageMaterial() {
  if (!sharedPageMaterial) {
    sharedPageMaterial = new THREE.MeshStandardMaterial({ color: PAGE_COLOR, roughness: 0.92, metalness: 0 });
    sharedPageMaterial.userData.shared = true;
  }
  return sharedPageMaterial;
}

/* Cubic-in-out — the same curve poses.js tweens the camera with, so the
   table spreads on exactly the arc the camera arrives on. Copied rather
   than imported for the reason this file's header already gives about
   darken()/PAGE_COLOR: poses.js does not export it and it is two lines. */
function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* books.js's own `darken()`, copied rather than imported (it isn't
   exported there, and it's one line). */
function darken(hex, factor) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return hex || '#222222';
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r},${g},${b})`;
}

/* the "lift toward camera + tilt forward" hover gesture books.js uses
   doesn't make sense for a book lying flat on its back — there's no
   "toward the camera" for a horizontal surface the camera looks
   straight down at, so "up" is this file's equivalent gesture. Same
   hex books.js's HOVER_EMISSIVE uses, duplicated rather than imported
   for the reason given above. */
const HOVER_EMISSIVE = 0x3a2f1c;
const HOVER_EMISSIVE_INTENSITY = 0.55;
const BOOK_HOVER_LIFT = 8;

/* ── planning: which books (if any) leave the shelf for the table ── */

/**
 * Does this room get a table at all? Data only, and deliberately
 * separate from planRoomTable() (which needs the room's books to
 * answer the harder question of WHICH books go on it) — props.js
 * needs the cheap boolean, at prop-placement time, before any book
 * data is in hand, to keep a floor prop from standing inside the
 * table. Same split, and the same reason, as books.js exporting
 * sideCaseExists() rather than sideCaseSpec() for props.js's
 * equivalent check in phase 6.
 * @returns {boolean}
 */
export function roomHasTable(room) {
  if (!room) return false;
  if ((room.children || []).some((k) => k.viaTable)) return true;
  return /table/i.test(room.name || '') && !room.viaTable;
}

/**
 * @param room       a src/js/data/rooms.js entry
 * @param roomBooks  the room's own books (shop.js's booksIn(room.id))
 * @param booksFor   (roomId) => book[] — used ONLY to read a viaTable child's shelf
 * @returns {{ shelfBooks: object[], table: null | {id, name, sub, books} }}
 */
export function planRoomTable(room, roomBooks, booksFor) {
  // Rule 3 first, so the "does this room have a table" rule lives in
  // exactly ONE place (roomHasTable(), which props.js also reads) and
  // cannot drift between the two files.
  if (!roomHasTable(room)) return { shelfBooks: roomBooks, table: null };

  // Rule 1: a viaTable child room (today only `front`, whose child is
  // `fronttable`, 15 books) supplies the table's books from ITS OWN
  // shelf — a shelf that was never part of THIS room's shelf to begin
  // with, so `roomBooks` passes through completely unchanged. This is
  // the direct replacement for point 10's complaint: `fronttable` used
  // to be a whole separate room reached through a door; here it's
  // just where this room's table's books happen to live in the data.
  const viaTableChild = (room.children || []).find((k) => k.viaTable);
  if (viaTableChild) {
    return {
      shelfBooks: roomBooks,
      table: {
        id: viaTableChild.id,
        name: viaTableChild.name,
        sub: viaTableChild.sub,
        books: booksFor(viaTableChild.id) || [],
      },
    };
  }

  // Rule 2: a room whose own NAME says "table" (today: The
  // Cartographer's Table, The Long Table) has no viaTable child to
  // borrow from — its own shelf must give some books up, because
  // PLAN.md point 10 is explicit that a table is NOT its shelf lying
  // down and no book may appear twice. `!room.viaTable` matters here:
  // `fronttable`'s own name also matches /table/i, and it IS the
  // table (rule 1's child, reached only by clicking the front room's
  // table) — if the harness ever builds room=fronttable directly, this
  // guard stops it from growing a second table of its own (it is in
  // roomHasTable() above, checked before we ever get here).

  // `onTable` is phase 9's field — it does not exist in the data
  // yet, which is exactly why the fallback below exists. Once it
  // lands, this fallback is one block away from deletion.
  let chosen = roomBooks.filter((b) => b.onTable);
  if (!chosen.length) {
    // Deterministic fallback: most-awarded first, then most recent,
    // then id ascending as a TOTAL order — never rely on Array#sort
    // stability for this, since neither `won.length` nor `year` is
    // guaranteed unique and JS's sort stability guarantee is a
    // red herring here (it only protects EQUAL keys that were
    // already adjacent going in; it says nothing about reproducing
    // the same order across two different runs' input orderings,
    // which is the actual property needed).
    const bySelection = roomBooks.slice().sort((a, b) => {
      const wonDiff = (b.won?.length || 0) - (a.won?.length || 0);
      if (wonDiff) return wonDiff;
      const yearDiff = (b.year || 0) - (a.year || 0);
      if (yearDiff) return yearDiff;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const n = Math.min(4, Math.floor(roomBooks.length / 2));
    chosen = bySelection.slice(0, n);
  }

  const chosenIds = new Set(chosen.map((b) => b.id));
  // Filter the ORIGINAL array, not the sorted copy — shelf order is
  // a stated design goal (IMPLEMENTATION.md §4.6), so the fallback
  // sort above must never leak into it.
  const shelfBooks = roomBooks.filter((b) => !chosenIds.has(b.id));

  return {
    shelfBooks,
    table: { id: `${room.id}:table`, name: room.name, sub: room.sub, books: chosen },
  };
}

/* The table's own footprint as a world-space AABB, floor to top plus
   headroom for the books lying on it. props.js reads this to keep a
   floor prop from standing inside the table; poses.js gets the real
   group instead (it has one). Exported so neither of them re-derives
   TABLE's placement arithmetic — the same one-source-of-truth rule
   this file's header states for `surface`. */
export function tableFootprint() {
  const { w, h, d, x0, zNear } = TABLE;
  return { x0, x1: x0 + w, z0: zNear - d, z1: zNear, y0: 0, y1: h + 30 };
}

/* ── the table top's plank texture ───────────────────────────────
   Reuses textures.js's pinstripe() helper for the seam pattern
   (props.js's own precedent for canvas-painted surfaces) rather than
   re-deriving that gradient maths; the wood-dark/wood/wood-lit blend
   itself is a plain 3-stop ctx.createLinearGradient() (no color-mix
   arithmetic to share — mix()/rgba() aren't needed here). */

const TOP_TEX_SCALE = 2; // canvas px per world unit -- higher than
// props.js's flat-billboard PROP_TEX_SCALE (1.25): this is the one
// surface a `table:<id>` camera pose looks straight down at and close
// to, so its resolution is actually visible, unlike a prop billboard
// glimpsed from across a room.

function paintTableTop(ctx, wPx, dPx, s, pal) {
  const wood = pal.wood || '#7d5539';
  const woodDark = pal['wood-dark'] || '#452c1d';
  const woodLit = pal['wood-lit'] || wood;

  /* BoxGeometry's +y face UV (verified against vendor/three's
     BoxGeometry source, the same kind of check books.js's
     remapFaceUV() comment relies on for its own face, there face 4):
     v=1 at local z=-depth/2 (this box's FAR edge once placed — deeper
     into the room, more negative world z), v=0 at local z=+depth/2
     (the NEAR edge, at the apron). A canvas texture's default
     `flipY=true` then puts the canvas's OWN top row (y=0) at v=1 — so
     canvas y=0 is the table's FAR edge and canvas y=dPx is its NEAR
     edge. scene.css's `.table3d__top` gradient
     (`linear-gradient(180deg, wood-dark, wood 46%, wood-lit)`) runs
     near(0%) -> far(100%), so the canvas gradient below runs
     bottom(dPx, near) -> top(0, far) to land the same colours on the
     same edges. */
  const g = ctx.createLinearGradient(0, dPx, 0, 0);
  g.addColorStop(0, woodDark);
  g.addColorStop(0.46, wood);
  g.addColorStop(1, woodLit);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wPx, dPx);

  /* plank seams: CSS's `repeating-linear-gradient(96deg, transparent
     0 34px, rgba(0,0,0,.10) 34px 38px)` — a seam every 38px, tilted 6
     degrees off true vertical. textures.js's pinstripe() only draws
     seams at exactly 0deg (pure vertical); per this codebase's own
     precedent for decorative, non-interactive geometry (props.js's
     rug/skylight box-centre approximation — "match the intent, not
     the exact CSS transform-origin arithmetic", HANDOFF-PHASE7.md),
     the 6-degree tilt is dropped rather than teaching a shared helper
     a second angle for one caller — reads as plank seams either way. */
  pinstripe(ctx, wPx, dPx, s, 38, 4, '#000000', 0.10);
}

const topTexCache = new Map();
function tableTopTexture(pal, w, d) {
  const key = `${pal.wood}|${pal['wood-lit']}|${pal['wood-dark']}|${w}x${d}`;
  const hit = topTexCache.get(key);
  if (hit) return hit;
  const wPx = Math.max(2, Math.round(w * TOP_TEX_SCALE));
  const dPx = Math.max(2, Math.round(d * TOP_TEX_SCALE));
  const canvas = document.createElement('canvas');
  canvas.width = wPx; canvas.height = dPx;
  const ctx = canvas.getContext('2d');
  paintTableTop(ctx, wPx, dPx, TOP_TEX_SCALE, pal);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  topTexCache.set(key, tex);
  return tex;
}

/* ── the table frame: top, apron, rails, legs ────────────────────── */

function buildTableFrame(pal) {
  const { w, h, d, x0, zNear } = TABLE;
  const cx = x0 + w / 2;
  const cz = zNear - d / 2;

  const wood = pal.wood || '#7d5539';
  const woodLit = pal['wood-lit'] || wood;
  const woodDark = pal['wood-dark'] || '#452c1d';

  const woodMat = new THREE.MeshStandardMaterial({ color: wood, roughness: 0.85 });
  const woodDarkMat = new THREE.MeshStandardMaterial({ color: woodDark, roughness: 0.85 });
  // apron and the top's +y face get their OWN material instances
  // (not shared with anything else below) because setHighlight() only
  // ever touches these two — see buildRoomTable()'s tableEntry.
  const apronMat = new THREE.MeshStandardMaterial({ color: woodLit, roughness: 0.85 });
  const topTexMat = new THREE.MeshStandardMaterial({ map: tableTopTexture(pal, w, d), roughness: 0.85 });

  const meshes = [];

  // top: BoxGeometry face/material-group order is documented (and
  // reused here, not re-derived) by books.js's remapFaceUV() comment
  // — [+x, -x, +y, -y, +z, -z]. Only the +y face (index 2) — the one
  // a `table:<id>` pose looks straight down at — gets the plank
  // texture; the other five faces are mostly hidden under the apron/
  // rails/books, so a flat wood colour is all they need.
  const topGeo = new THREE.BoxGeometry(w, 18, d);
  const top = new THREE.Mesh(topGeo, [woodMat, woodMat, topTexMat, woodDarkMat, woodMat, woodMat]);
  top.position.set(cx, h - 9, cz);
  top.name = 'table-top';
  meshes.push(top);

  // apron: "the front edge board you actually see" — scene.css's own
  // words for `.table3d__apron`. Flush under the slab (the top's
  // underside sits at y = h-18 = 214) and flush with the table's near
  // edge (its front face at z = zNear, extending back into the table
  // by its own 12-unit thickness).
  const apron = new THREE.Mesh(new THREE.BoxGeometry(w, 30, 12), apronMat);
  apron.position.set(cx, h - 33, zNear - 6);
  apron.name = 'table-apron';
  meshes.push(apron);

  // two side rails: same y band as the apron, flush with the top's
  // left/right edges, inset 12 units from both the near and far ends
  // (matching the apron's own 12-unit depth at the near end, so the
  // whole skirt reads as one consistent margin rather than the rail
  // running edge-to-edge past where the apron stops).
  const railD = d - 24;
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(12, 30, railD), woodMat);
    rail.position.set(cx + side * (w / 2 - 6), h - 33, cz);
    rail.name = 'table-rail';
    meshes.push(rail);
  }

  // four legs, standing on the real floor: y 0..214 (214 = h-18, the
  // top's own underside — no separate literal for "how tall", so a
  // future TABLE.h edit can't desync the legs from the slab). x/z are
  // DERIVED from the top's own extents (x0..x0+w, zNear-d..zNear)
  // rather than authored as independent literals: PLAN.md point 1's
  // root cause was legs that were not under the top ("every leg lands
  // ~235px right of where the CSS intends" — a `<button>`'s default
  // content centring, with no `left` set on the leg at all). Deriving
  // each leg's position from the SAME box the top itself uses makes
  // that entire class of bug structurally impossible here — there is
  // no second set of numbers that could drift out of sync with the
  // top's.
  const LEG_INSET = 14, LEG_HALF = 10; // half of the 20-unit leg footprint
  const legXs = [x0 + LEG_INSET + LEG_HALF, x0 + w - LEG_INSET - LEG_HALF];
  const legZs = [zNear - LEG_INSET - LEG_HALF, zNear - d + LEG_INSET + LEG_HALF];
  for (const lx of legXs) {
    for (const lz of legZs) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(20, h - 18, 20), woodDarkMat);
      leg.position.set(lx, (h - 18) / 2, lz);
      leg.name = 'table-leg';
      meshes.push(leg);
    }
  }

  return { meshes, topTexMat, apronMat, cx, cz };
}

/* ── books on the table: laid flat, covers up ────────────────────
   This is what finally puts covers.js's coverSVG() — "the best art in
   the project" per PLAN.md point 10 — in front of the reader, instead
   of edge-on as a shelf spine. */

const COVER_ASPECT = 150 / 100; // coverSVG()'s own viewBox: 100 wide, 150 tall
const COVER_GUTTER = 0.08; // inset from each side of a grid cell, per side
const COVER_MAX_W = 130;
const COVER_ROT_MAX = THREE.MathUtils.degToRad(4);
const COVER_JITTER_MAX = 6;

/* ── the two layouts ─────────────────────────────────────────────
   Phase 7 sized this table for `fronttable`'s 15 books and measured the
   covers at 43x64 world units. Phase 9 shelved 43 more onto the same
   470x300 table, and fitCoverGrid() answered honestly: 6 columns, 10
   rows, covers 12.8 x 19.2. The owner's words: "a bit small in relation
   to the table."

   MEASURED FIRST, because the obvious fix does not work. From the room
   pose the camera sits 238 units above the table top and 1,980 away, so
   it looks down at it at **6.9 degrees**. Projected to a 1280x800
   viewport, the whole set of ten covers occupies 213 x **12 px** — a
   smear of edges. Doubling the covers doubles twelve pixels. A book
   lying flat is not small from across the room, it is edge-on, and no
   amount of grid tuning changes the angle.

   What a real shop does is stand its display copies up. So:

     ROOM pose   a few books PROPPED, leaning back PROP_TILT from
                 vertical with the cover to the room — 114 units of
                 height instead of 12, and the jacket art actually
                 facing the reader, which is the whole point of
                 covers.js being in this file at all.
     EVERY OTHER a flat grid of all of them. Walking up to the table
     pose        (`table:<id>`) lays them down and spreads them out.

   Flat-everywhere-but-`room` rather than flat-only-in-the-table-pose,
   and that is load-bearing: propped books stand 114 units above the
   table, and the shelf:back camera in the three table rooms sights the
   back case's bottom row across exactly that space. Phase 9 spent a
   session on that clearance (poses.js's LIFTS ladder, measured at zero
   blocked books) and the propped height would need the camera at y>839
   to clear — a picture far worse than the one it saved. Flat in every
   pose that has a clearance search means `bounds` below stays the flat
   box, phase 9's numbers stand unchanged, and the books lie down over
   the same 700ms the camera takes to get there.

   HOW MANY, propped: ONE rank. Two was tried and measured: at 6.9
   degrees of depression the second rank's top clears the first rank's
   by **4.7 screen px** — four books' worth of geometry, entirely
   hidden behind four other books. So rank count is 1 and the book
   count sets the width. Five gives 64 x 96 units each — 13.6% of the
   table's width per book, which is about a real hardback on a real
   display table — and stands 81 units tall, some 58 screen px of
   upright, lit cover. Four would be 80 wide and read as furniture;
   eight would be 40 and be back where we started.

   PROP_TILT is 58 degrees off the table, not the 72 that first looked
   right, and the reason is light, not composition. The front room's one
   lamp hangs above and BEHIND the table; a cover at 72 degrees has a
   normal of (0, .31, .95), which is within a degree of perpendicular to
   the direction of that lamp — the books came out near-black. At 58 the
   normal is (0, .53, .85), the lamp lands on them properly, and the
   loss is 12% of their height.

   WHICH five: the first five of the table's own list, which shop.js
   already sorts picks-first — so the front table stands up the
   shopkeeper's own, and the harvested prize lists appear when you get
   close enough to read them. */
const ROOM_POSE_COVERS = 5;
const PROP_TILT = THREE.MathUtils.degToRad(58); // from the table top; 0 = lying flat
const PROP_MAX_ROWS = 1;
const SPREAD_MS = 700; // poses.js's TWEEN_MS — they lie down as the camera arrives
/* Fraction of the spread the last hidden book waits before it starts.
   Without it all fifty appear on the same frame, which is a pop however
   smoothly they scale. */
const SPREAD_STAGGER = 0.3;

/* Try every column count, compute the cover size that fits inside a
   `usable/cols x usable/rows` cell (both dimensions — a book that
   overflowed its row's depth band would visibly overlap its
   neighbours), and keep whichever column count yields the biggest
   cover by area. For n=15 (fronttable's count in phase 7) this lands
   on cols=5/rows=3 — matches PLAN.md point 10's own worked example.
   `>` (not `>=`) below keeps the FIRST cols to reach the max on a
   tie, i.e. prefers fewer, wider columns over more, narrower ones
   when they'd produce an identical cover size.

   MAX_COLS was 6, which was right for the fifteen books this table
   held when it was written and wrong for the fifty-eight it holds
   now. At 6 columns, 58 books need 10 rows, and 10 rows over a
   228-unit depth leaves 22.8 per row for a cover that wants to be 1.5x
   as deep as it is wide: the depth binds so hard that the cover comes
   out 12.8 wide inside a 53.5-wide slot, i.e. a lattice of stamps with
   bare wood between the columns. The cells want the cover's OWN
   aspect, and for n books on a wxd area that means cols ~
   sqrt(n * w / (d * aspect)) — about 12 here, not 6. Raising the cap
   changes nothing for n <= 15 (checked: 4, 10 and 15 all still pick
   the same column count, because at those counts it is the width that
   binds, not the depth) and roughly doubles the cover for 58. */
const MAX_COLS = 16;
function fitCoverGrid(n, w, d) {
  const usableW = w - 88, usableD = d - 72;
  let best = null;
  for (let cols = 1; cols <= MAX_COLS; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = usableW / cols;
    const cellD = usableD / rows;
    const availW = cellW * (1 - 2 * COVER_GUTTER);
    const availD = cellD * (1 - 2 * COVER_GUTTER);
    const coverW = Math.max(1, Math.min(availW, availD / COVER_ASPECT, COVER_MAX_W));
    const coverH = coverW * COVER_ASPECT;
    const area = coverW * coverH;
    if (!best || area > best.area) best = { cols, rows, cellW, cellD, coverW, coverH, area };
  }
  return best;
}

const coverTexCache = new Map(); // book.id -> { texture, aspect, ready }
function coverTexture(book) {
  const hit = coverTexCache.get(book.id);
  if (hit) return hit;
  const entry = svgTexture(coverSVG(book, { w: 200, h: 300 }));
  coverTexCache.set(book.id, entry);
  return entry;
}

/* The propped (room-pose) grid. Same idea as fitCoverGrid() but the
   depth a book needs is `coverH * cos(PROP_TILT)` — a propped cover
   takes up almost no table depth, so what binds is width, and rows are
   capped at PROP_MAX_ROWS because a third rank of upright books is just
   a wall in front of the second. */
function fitPropGrid(n, w, d) {
  const usableW = w - 88, usableD = d - 72;
  const perDepth = COVER_ASPECT * Math.cos(PROP_TILT);
  let best = null;
  for (let rows = 1; rows <= PROP_MAX_ROWS; rows++) {
    const cols = Math.ceil(n / rows);
    if (cols * rows - cols > n) continue; // an empty whole row
    const cellW = usableW / cols;
    const cellD = usableD / rows;
    const availW = cellW * (1 - 2 * COVER_GUTTER);
    const availD = cellD * (1 - 2 * COVER_GUTTER);
    const coverW = Math.max(1, Math.min(availW, availD / perDepth, COVER_MAX_W));
    const area = coverW * coverW * COVER_ASPECT;
    if (!best || area > best.area) {
      best = { cols, rows, cellW, cellD, coverW, coverH: coverW * COVER_ASPECT, area };
    }
  }
  return best;
}

/* One book's place in one layout: where it lies, how big it is, and how
   far back it leans. Both layouts produce this same shape, so applying
   either is one lerp and nothing branches on which is which. */
function slotFor(book, index, fit, frame, tilt = 0) {
  const usableW = TABLE.w - 88, usableD = TABLE.d - 72;
  const col = index % fit.cols;
  const row = Math.floor(index / fit.cols);
  const cellCx = frame.cx - usableW / 2 + (col + 0.5) * fit.cellW;
  const cellCz = frame.cz - usableD / 2 + (row + 0.5) * fit.cellD;

  // spine thickness scaled by the same factor the cover itself was
  // scaled by: coverSVG's viewBox is 100 world-units wide, so
  // coverW/100 is that factor. Without this a thick book would lie
  // on the table looking exactly as thin as a pamphlet.
  const thickness = Math.min(30, Math.max(6, shelfSize(book).t * (fit.coverW / 100)));

  // deterministic per-book jitter/rotation from covers.js's
  // hash(book.id) — "a loose grid with slight per-book rotation"
  // (PLAN.md point 10) — via covers.js's own rngFrom(), the same
  // seeded-PRNG utility spineStyle()/fillerStyle() use for their own
  // independent random streams (the `^ 0x...` there is the same
  // "decorrelate this stream from that one" move made here). The SAME
  // seed is drawn for both layouts, so a book keeps its own tilt as the
  // table spreads rather than re-rolling it mid-animation.
  const rnd = rngFrom(hash(book.id) ^ 0x7a13);
  const rotY = (rnd() * 2 - 1) * COVER_ROT_MAX;
  /* Jitter is capped by the free space in its own cell, not by a flat
     6 units: the 58-book layout's cells are 63.7 x 22.8 with a 19.2-tall
     cover in them, so a fixed 6 would slide neighbours into each other
     in depth. Half the slack, or 6, whichever is less. */
  const slackX = Math.max(0, (fit.cellW - fit.coverW) / 2);
  const depthUsed = fit.coverH * Math.cos(tilt);
  const slackZ = Math.max(0, (fit.cellD - depthUsed) / 2);
  const jx = (rnd() * 2 - 1) * Math.min(COVER_JITTER_MAX, slackX);
  const jz = (rnd() * 2 - 1) * Math.min(COVER_JITTER_MAX, slackZ);

  return {
    x: cellCx + jx,
    z: cellCz + jz,
    w: fit.coverW,
    h: fit.coverH,
    t: thickness,
    tilt,
    rotY,
  };
}

/* Where a book's CENTRE has to be for its lowest corner to rest exactly
   on the table top, at any lean. A box of half-extents (t/2 in y, h/2 in
   z) rotated by `a` about x reaches `t/2*|cos a| + h/2*|sin a|` below its
   own centre. Derived rather than lerped between the two layouts' y
   values, because a lerp would let the book sink through the wood
   halfway through the animation — the one frame of this that anybody
   would notice. At a = 0 it reduces to TABLE.h + t/2, which is where a
   flat book has always sat. */
function restingY(thickness, coverH, tilt) {
  return TABLE.h + (thickness / 2) * Math.abs(Math.cos(tilt)) + (coverH / 2) * Math.abs(Math.sin(tilt));
}

/* Every table book is the SAME unit box, scaled — so switching layouts
   is a lerp of position and scale and nothing else, and 58 books cost
   one geometry rather than 58. BoxGeometry's UVs are per-face 0-1, so
   scaling never distorts a cover. */
let unitBoxGeometry = null;
function bookGeometry() {
  if (!unitBoxGeometry) {
    unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
    unitBoxGeometry.userData.shared = true;
  }
  return unitBoxGeometry;
}

/**
 * @param table  planRoomTable()'s `table`
 * @param frame  buildTableFrame()'s return (needs `.cx`/`.cz`)
 * @param spreadNow  () => number in 0..1 — where the spread currently
 *   is. A getter rather than a value because setHighlight() has to
 *   re-place a book at whatever the spread is when the pointer arrives,
 *   and that is not known at build time.
 */
function buildTableBooks(table, frame, spreadNow) {
  const books = table.books || [];
  const bookEntries = [];
  const pending = [];
  const apply = [];
  if (!books.length) return { meshes: [], bookEntries, pending, apply };

  /* Two layouts (see the block on ROOM_POSE_COVERS): a few propped
     covers for the room pose, every cover flat for everything else.
     `featured` is a prefix of the table's own list, so it is already in
     shelf order and already picks-first. */
  const featuredCount = Math.min(ROOM_POSE_COVERS, books.length);
  const roomFit = fitPropGrid(featuredCount, TABLE.w, TABLE.d);
  const flatFit = fitCoverGrid(books.length, TABLE.w, TABLE.d);
  const hiddenCount = books.length - featuredCount;
  const meshes = [];

  books.forEach((book, index) => {
    const { texture, ready } = coverTexture(book);
    pending.push(ready);

    const tableSlot = slotFor(book, index, flatFit, frame, 0);
    const roomSlot = index < featuredCount ? slotFor(book, index, roomFit, frame, PROP_TILT) : null;

    const coverMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0.02 });
    // backMat: a solid darkened cover colour, from the SAME palette
    // lookup coverSVG() itself used (spineStyle()/coverSVG() both
    // derive from covers.js's artFor(book), seeded from the book's own
    // id — same book, same jacket colour, two call sites).
    const backMat = new THREE.MeshStandardMaterial({ color: darken(spineStyle(book).pal.bg, 0.6), roughness: 0.85 });
    const page = pageMaterial();
    // face order [+x, -x, +y, -y, +z, -z] (books.js's remapFaceUV()
    // comment) -- cover faces up (+y, toward the camera looking down),
    // back cover faces down (-y, against the table) where no one will
    // ever see it.
    const mesh = new THREE.Mesh(bookGeometry(), [page, page, coverMat, backMat, page, page]);
    mesh.rotation.y = tableSlot.rotY;
    mesh.name = `table-book:${book.id}`;
    meshes.push(mesh);

    /* A book with no room-pose slot fades in on its own small delay,
       so the table fills rather than pops. `k / hiddenCount` (not
       `/(hiddenCount-1)`) keeps the last one finishing before the
       camera does. */
    const delay = roomSlot ? 0 : SPREAD_STAGGER * ((index - featuredCount) / Math.max(1, hiddenCount));

    let hovered = false;
    function place(u) {
      const lift = hovered ? BOOK_HOVER_LIFT : 0;
      if (!roomSlot) {
        // no room-pose place at all: grow from nothing, in its flat slot
        const local = delay >= 1 ? 0 : THREE.MathUtils.clamp((u - delay) / (1 - delay), 0, 1);
        const k = ease(local);
        mesh.visible = k > 0.002;
        mesh.rotation.x = 0;
        mesh.scale.set(tableSlot.w * k, tableSlot.t * k, tableSlot.h * k);
        mesh.position.set(tableSlot.x, restingY(tableSlot.t * k, 0, 0) + lift, tableSlot.z);
        return;
      }
      mesh.visible = true;
      const k = ease(u);
      const lerp = (a, b) => a + (b - a) * k;
      const w = lerp(roomSlot.w, tableSlot.w);
      const t = lerp(roomSlot.t, tableSlot.t);
      const h = lerp(roomSlot.h, tableSlot.h);
      const tilt = lerp(roomSlot.tilt, tableSlot.tilt);
      mesh.scale.set(w, t, h);
      mesh.rotation.x = tilt;
      mesh.position.set(lerp(roomSlot.x, tableSlot.x), restingY(t, h, tilt) + lift, lerp(roomSlot.z, tableSlot.z));
    }
    apply.push(place);

    const entry = {
      book,
      index,
      mesh,
      tableId: table.id,
      ariaLabel: `${book.title} by ${book.author}. Take it off the table.`,
      // Lift toward the camera (books.js's hover gesture) is
      // meaningless for a book lying flat under a top-down camera —
      // there is no "toward the camera" direction distinct from "up"
      // — so up (+8, HOVER_LIFT) is this file's equivalent gesture.
      // Applied through place() rather than written straight onto
      // mesh.position.y, because y is now a function of the spread and
      // a raw write would be overwritten on the next frame of it.
      setHighlight(on) {
        hovered = on;
        place(spreadNow());
        coverMat.emissive.setHex(on ? HOVER_EMISSIVE : 0x000000);
        coverMat.emissiveIntensity = on ? HOVER_EMISSIVE_INTENSITY : 0;
      },
    };
    mesh.userData.entry = entry;
    bookEntries.push(entry);
  });

  return { meshes, bookEntries, pending, apply };
}

/* ── the room's table, whole ─────────────────────────────────────── */

/**
 * @param {object} room   a src/js/data/rooms.js entry (needs `.pal`)
 * @param {object} table  planRoomTable()'s non-null `table` result
 * @param {object} [opts]
 * @param {boolean} [opts.reducedMotion]  spread jumps instead of easing
 * @returns {{ group: THREE.Group, tableEntry: object, bookEntries: object[],
 *   ready: Promise<void>, surface: {center: THREE.Vector3, w: number, d: number},
 *   bounds: THREE.Box3, setSpread: (u:number, opts?) => void,
 *   tick: (nowMs:number) => void, spread: number }}
 *   `tableEntry.meshes` (plural, not `.mesh`) — a pose target is
 *   several meshes at once (top/apron/rails/legs); interact.js's
 *   picker reads `entry.meshes || [entry.mesh]` for exactly this case.
 *   `surface` is poses.js's one source of truth for where the
 *   `table:<id>` camera pose should look — it must never re-derive
 *   this file's TABLE placement arithmetic independently, the same
 *   discipline coords.js's lampAnchor() enforces between stage.js and
 *   props.js. `bounds` is the same discipline for the CLEARANCE search:
 *   an analytic obstacle box, so poses.js never has to measure a group
 *   whose extents now depend on where an animation happens to be.
 *   `ready` resolves once every book cover's texture has decoded (or
 *   failed) — the settle condition to poll before a screenshot, same
 *   contract as props.js's `ready`. `setSpread(0|1)` picks the layout
 *   (0 = the room pose's few large covers, 1 = every cover) and `tick()`
 *   eases between them; room.js drives both from the pose rig.
 */
export function buildRoomTable(room, table, opts = {}) {
  const group = new THREE.Group();
  group.name = `table:${table.id}`;
  const pal = room.pal || {};

  const frame = buildTableFrame(pal);
  for (const m of frame.meshes) group.add(m);

  /* ── the spread: 0 = room layout, 1 = table layout ──
     Declared before the books so their setHighlight() can read it. */
  let u = 0, spreadFrom = 0, spreadTo = 0, spreadStart = 0, spreadDur = 0;
  const reducedMotion = opts.reducedMotion ?? (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  const { meshes: bookMeshes, bookEntries, pending, apply } = buildTableBooks(table, frame, () => u);
  for (const m of bookMeshes) group.add(m);

  const applyAll = () => { for (const fn of apply) fn(u); };
  applyAll(); // land in the room layout before the first render

  /** 0 or 1 (anything between is legal but nothing asks for it). A
   *  repeat request is a real no-op, not a fresh 700 ms tween from a
   *  place to itself — room.js calls this every frame. */
  function setSpread(target, o = {}) {
    const v = THREE.MathUtils.clamp(target, 0, 1);
    if (v === spreadTo) return;
    spreadTo = v;
    spreadFrom = u;
    spreadStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    spreadDur = (o.instant || reducedMotion) ? 0 : SPREAD_MS;
    if (spreadDur === 0) { u = v; applyAll(); }
  }

  function tick(nowMs) {
    if (u === spreadTo) return;
    const p = spreadDur <= 0 ? 1 : THREE.MathUtils.clamp((nowMs - spreadStart) / spreadDur, 0, 1);
    u = p >= 1 ? spreadTo : spreadFrom + (spreadTo - spreadFrom) * p;
    applyAll();
  }

  const tableEntry = {
    tableId: table.id,
    meshes: frame.meshes,
    pose: `table:${table.id}`,
    ariaLabel: `Look at the display table: ${table.name}${table.sub ? ' — ' + table.sub : ''}`,
    // Replaces CSS's `.table3d:hover .table3d__top, .table3d:hover
    // .table3d__apron { filter: brightness(1.24) }` — precisely the
    // grouping-property hover PLAN.md's Finding B blames for the whole
    // table jumping on hover (a `filter` other than `none` forces the
    // used value of `transform-style` to `flat` on everything inside
    // it). Setting emissive on two leaf materials has no such effect.
    setHighlight(on) {
      frame.topTexMat.emissive.setHex(on ? HOVER_EMISSIVE : 0x000000);
      frame.topTexMat.emissiveIntensity = on ? HOVER_EMISSIVE_INTENSITY : 0;
      frame.apronMat.emissive.setHex(on ? HOVER_EMISSIVE : 0x000000);
      frame.apronMat.emissiveIntensity = on ? HOVER_EMISSIVE_INTENSITY : 0;
    },
  };
  for (const m of frame.meshes) m.userData.entry = tableEntry;

  const surface = { center: new THREE.Vector3(frame.cx, TABLE.h, frame.cz), w: TABLE.w, d: TABLE.d };
  /* The clearance obstacle poses.js uses, stated rather than measured:
     the table's own footprint, floor to the top of the tallest book that
     can lie on it (the 30-unit thickness cap) plus the 8-unit hover lift,
     rounded up to 40. Measuring the group instead would hand poses.js a
     box whose height depends on where the spread animation was when
     obstacles() first ran and cached — and a camera pose that depends on
     animation timing is not a camera pose, it is a race. */
  const bounds = new THREE.Box3(
    new THREE.Vector3(TABLE.x0, 0, TABLE.zNear - TABLE.d),
    new THREE.Vector3(TABLE.x0 + TABLE.w, TABLE.h + 40, TABLE.zNear),
  );
  const ready = Promise.all(pending).then(() => {});

  return {
    group, tableEntry, bookEntries, ready, surface, bounds,
    setSpread, tick,
    get spread() { return u; },
  };
}

export function clearTableTextureCache() {
  coverTexCache.clear();
  topTexCache.clear();
}
