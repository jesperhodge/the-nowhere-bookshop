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
let sharedPageMaterial = null;
function pageMaterial() {
  if (!sharedPageMaterial) {
    sharedPageMaterial = new THREE.MeshStandardMaterial({ color: PAGE_COLOR, roughness: 0.92, metalness: 0 });
  }
  return sharedPageMaterial;
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

/* Try every column count from 1 to 6, compute the cover size that
   fits inside a `usable/cols x usable/rows` cell (both dimensions —
   a book that overflowed its row's depth band would visibly overlap
   its neighbours), and keep whichever column count yields the
   biggest cover by area. For n=15 (fronttable's count) this lands on
   cols=5/rows=3 — matches PLAN.md point 10's own worked example.
   `>` (not `>=`) below keeps the FIRST cols to reach the max on a
   tie, i.e. prefers fewer, wider columns over more, narrower ones
   when they'd produce an identical cover size. */
function fitCoverGrid(n, w, d) {
  const usableW = w - 88, usableD = d - 72;
  let best = null;
  for (let cols = 1; cols <= 6; cols++) {
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

function buildTableBooks(table, frame) {
  const books = table.books || [];
  const bookEntries = [];
  const pending = [];
  if (!books.length) return { meshes: [], bookEntries, pending };

  const fit = fitCoverGrid(books.length, TABLE.w, TABLE.d);
  const usableW = TABLE.w - 88, usableD = TABLE.d - 72;
  const meshes = [];

  books.forEach((book, index) => {
    const col = index % fit.cols;
    const row = Math.floor(index / fit.cols);
    const cellCx = frame.cx - usableW / 2 + (col + 0.5) * fit.cellW;
    const cellCz = frame.cz - usableD / 2 + (row + 0.5) * fit.cellD;

    const { texture, ready } = coverTexture(book);
    pending.push(ready);

    const coverW = fit.coverW, coverH = fit.coverH;
    // spine thickness scaled by the same factor the cover itself was
    // scaled by: coverSVG's viewBox is 100 world-units wide, so
    // coverW/100 is that factor. Without this a thick book would lie
    // on the table looking exactly as thin as a pamphlet.
    const thickness = Math.min(30, Math.max(6, shelfSize(book).t * (coverW / 100)));

    const geo = new THREE.BoxGeometry(coverW, thickness, coverH);
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
    const mesh = new THREE.Mesh(geo, [page, page, coverMat, backMat, page, page]);

    // deterministic per-book jitter/rotation from covers.js's
    // hash(book.id) — "a loose grid with slight per-book rotation"
    // (PLAN.md point 10) — via covers.js's own rngFrom(), the same
    // seeded-PRNG utility spineStyle()/fillerStyle() use for their own
    // independent random streams (the `^ 0x...` there is the same
    // "decorrelate this stream from that one" move made here).
    const rnd = rngFrom(hash(book.id) ^ 0x7a13);
    const rotY = (rnd() * 2 - 1) * COVER_ROT_MAX;
    const jx = (rnd() * 2 - 1) * COVER_JITTER_MAX;
    const jz = (rnd() * 2 - 1) * COVER_JITTER_MAX;

    const baseY = TABLE.h + thickness / 2; // resting ON the top
    mesh.position.set(cellCx + jx, baseY, cellCz + jz);
    mesh.rotation.y = rotY;
    mesh.name = `table-book:${book.id}`;
    meshes.push(mesh);

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
      setHighlight(on) {
        mesh.position.y = on ? baseY + BOOK_HOVER_LIFT : baseY;
        coverMat.emissive.setHex(on ? HOVER_EMISSIVE : 0x000000);
        coverMat.emissiveIntensity = on ? HOVER_EMISSIVE_INTENSITY : 0;
      },
    };
    mesh.userData.entry = entry;
    bookEntries.push(entry);
  });

  return { meshes, bookEntries, pending };
}

/* ── the room's table, whole ─────────────────────────────────────── */

/**
 * @param {object} room   a src/js/data/rooms.js entry (needs `.pal`)
 * @param {object} table  planRoomTable()'s non-null `table` result
 * @returns {{ group: THREE.Group, tableEntry: object, bookEntries: object[],
 *   ready: Promise<void>, surface: {center: THREE.Vector3, w: number, d: number} }}
 *   `tableEntry.meshes` (plural, not `.mesh`) — a pose target is
 *   several meshes at once (top/apron/rails/legs); interact.js's
 *   picker reads `entry.meshes || [entry.mesh]` for exactly this case.
 *   `surface` is poses.js's one source of truth for where the
 *   `table:<id>` camera pose should look — it must never re-derive
 *   this file's TABLE placement arithmetic independently, the same
 *   discipline coords.js's lampAnchor() enforces between stage.js and
 *   props.js. `ready` resolves once every book cover's texture has
 *   decoded (or failed) — the settle condition to poll before a
 *   screenshot, same contract as props.js's `ready`.
 */
export function buildRoomTable(room, table) {
  const group = new THREE.Group();
  group.name = `table:${table.id}`;
  const pal = room.pal || {};

  const frame = buildTableFrame(pal);
  for (const m of frame.meshes) group.add(m);

  const { meshes: bookMeshes, bookEntries, pending } = buildTableBooks(table, frame);
  for (const m of bookMeshes) group.add(m);

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
  const ready = Promise.all(pending).then(() => {});

  return { group, tableEntry, bookEntries, ready, surface };
}

export function clearTableTextureCache() {
  coverTexCache.clear();
  topTexCache.clear();
}
