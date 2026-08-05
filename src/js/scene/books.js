/* ============================================================
   Cases, books and the per-room spine atlas.

   Per IMPLEMENTATION.md §4.6 / PLAN-ARCH.md "Books at scale":

   - one canvas2d texture atlas per room, holding every spine (real
     books; phase 9 removed the filler) as one composited image each:
     ground gradient, head/tail bands, title — exactly what covers.js's
     spineStyle() already produces together for a real book.
   - books are individual THREE.Mesh boxes sharing that one atlas
     material via per-book UV sub-rects, not merged into one geometry
     — keeps per-book hover trivial (the brief's explicit reasoning).
   - the back-wall case (2 rows, CASE_W wide) and both side-wall
     cases (2 rows each) are real 3D geometry now, including the side
     cases: PLAN-ARCH point 5 replaces spineRun()'s painted gradient
     with real meshes once the side shelves become real. spineRun()
     itself is NOT deleted from covers.js — scene.js (the still-live
     CSS scene) still calls it. See HANDOFF-PHASE5.md.
   - phase 7 (PLAN.md point 6): every case is ALSO a focusable pose
     target, not just a books container. buildRoomBooks() returns a
     `cases` array (one descriptor per case, keyed 'back'/'left'/
     'right') alongside `entries`: the geometry (`w`/`ch`/`depth`/
     `group`) poses.js needs to frame a `shelf:<caseId>` pose, and a
     pickable `entry` (`.meshes`/`.pose`/`.ariaLabel`/`.setHighlight`)
     shaped so interact.js's attachScenePicking() and a11y.js's mirror
     both work on it unmodified. See buildCaseGroup()'s own comments
     for the sensor-placement and mesh-tagging mechanics.

   Geometry constants (CASE_W, CASE_D, ROW_H, BOARD, the side-case
   BAY/near/far/width-cap numbers) are measured facts from
   IMPLEMENTATION.md §4.6, carried over from scene.js — not
   re-derived.

   Book box convention (matches the CSS .bk model exactly, so the
   port is a coordinate change, not a redesign): a book's local +z
   face is its spine (CSS: .bk__spine { transform: translateZ(bd/2) }
   sits at local +z). Front/back covers sit on local ±x, top/edge
   (page block) on ±y/-z. A case's local frame has x:0..w (left to
   right along the shelf), y:0..ch (floor to top), z:0..depth (wall
   to room) — so books stand with their spine at local z≈depth
   (facing into the room) and their local x/y/z axes need NO
   rotation of their own; only the case GROUP is rotated per wall,
   and every book inherits that for free.
   ============================================================ */

import * as THREE from 'three';
import { spineStyle, shelfSize, hash } from '../covers.js';
import { WORLD } from './coords.js';
import { BAY, doorSlots } from './passages.js';

/* ── measured geometry constants (IMPLEMENTATION.md §4.6, ported
   from scene.js's CASE_W/CASE_D/ROW_H/BOARD/BAY/MAX_BOOK_H) ── */

const CASE_W = 1180;
const CASE_D = 200;
const ROW_H = 236;
const BOARD = 16;
const MAX_BOOK_H = 205;
const PANEL_T = 14; // carcass panel thickness, ours (scene.js has no direct equivalent)

const SIDE_NEAR = -420;
const SIDE_FAR = -1190;
export const SIDE_CD = 170;
const SIDE_MAX_W = 640;
const SIDE_MIN_W = 260;

/* BAY (door bays, near to far) and doorSlots() now live in
   passages.js, imported above — phase 5's doors.js is the second
   consumer, per HANDOFF-PHASE5's explicit request to hoist them
   rather than keep two copies. Needed here only to reproduce which
   width a side case ends up with (a case can't overlap a doorway). */

/* the "lift toward camera + tilt forward" hover/focus gesture —
   world-unit / radian equivalents of scene.css's
   `.bk:hover { transform: translateZ(calc(var(--bz,0px) + 46px))
   rotateX(-11deg) ... }` */
const HOVER_LIFT = 46;
const HOVER_TILT = THREE.MathUtils.degToRad(11);
const HOVER_EMISSIVE = 0x3a2f1c;

/* ── small helpers ────────────────────────────────────────── */

function shortTitle(t) {
  const clean = t.replace(/\s*[:;]\s.*$/, '');
  return clean.length > 34 ? clean.slice(0, 32).trim() + '…' : clean;
}

function darken(hex, factor) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return hex || '#222222';
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r},${g},${b})`;
}

/* spineStyle()/fillerStyle() hand back CSS `linear-gradient(90deg, ...)`
   strings (covers.js has no canvas-facing API — it was built for CSS
   custom properties). Canvas can't consume that syntax directly, so
   parse the `#rrggbb NN%` stops out of it and rebuild the same
   gradient with ctx.createLinearGradient(). The 90deg direction is a
   spineStyle()/fillerStyle() invariant, not something read from the
   string, so a plain left-to-right canvas gradient matches it. */
function parseStops(gradientCss) {
  const stops = [];
  const re = /(#[0-9a-fA-F]{6})\s+([\d.]+)%/g;
  let m;
  while ((m = re.exec(gradientCss))) stops.push({ color: m[1], offset: parseFloat(m[2]) / 100 });
  return stops;
}

/* ── row planning: which spines (real + filler) go in which row,
   in shelf order ─────────────────────────────────────────────
   Each "item" fully describes one spine: its box dimensions, the
   atlas painter needs (bgGrad/band/ink/font/title) and, for real
   books, the book record + shelf index the a11y mirror needs. */

function realItem(book, index) {
  const s = spineStyle(book);
  const g = shelfSize(book);
  return {
    book,
    index,
    pick: !!book.pick,
    w: g.t,
    h: g.h,
    d: g.d,
    tilt: g.tilt,
    bgGrad: s.bg,
    band: s.band,
    ink: s.ink,
    font: s.font,
    title: shortTitle(book.title),
    fontSizeWorld: g.t >= 34 ? 14 : g.t >= 26 ? 12 : 11,
    coverColor: s.pal.bg,
    coverColor2: darken(s.pal.bg, 0.72),
  };
}

/* fillerItem(), packFiller() and planSideRows()'s filler pack lived here
   until phase 9.

   Measured before they went: the back cases held 2,000 filler spines (40 a
   room, the same figure PLAN.md counted on the CSS build) and the side
   cases — real meshes here, a painted spineRun() gradient over there —
   held a further 3,923. Nearly six thousand anonymous books.

   IMPLEMENTATION.md §7 wants zero filler spines once the shelves are
   filled, and no amount of harvested data gets there while a generator
   pads every row to a fixed count. So a slot now holds a real book or it
   holds nothing, and an empty stretch of shelf is left empty — which is
   what a second-hand bookshop actually looks like, and is honest about how
   much of the shop is real.

   fillerStyle() stays in covers.js — scene.js's front-table stacks are
   still made of it, and those are décor on a table rather than spines on a
   shelf — but nothing in this file imports it any more. */

/* Back-wall case: exactly 2 rows (measured fact, IMPLEMENTATION.md §4.6),
   row usable width CASE_W-40 (~1152px measured). Books are split across
   the two rows by the width they take up rather than by their number, so
   both rows end up equally full — a 22px spine and a 58px spine are the
   same one book and very different amounts of shelf. Shelf order is
   preserved, which is what the a11y mirror walks. */
function planBackRows(books) {
  const rows = 2;
  const innerW = CASE_W - 40;
  const items = books.map((b, i) => realItem(b, i));
  const total = items.reduce((a, it) => a + Math.min(it.w, 58) + 5, 0);
  const perRow = total / rows;

  const out = [];
  let cursor = 0;
  for (let i = 0; i < rows; i++) {
    const slice = [];
    let used = 0;
    const last = i === rows - 1;
    while (cursor < items.length) {
      const it = items[cursor];
      const t = Math.min(it.w, 58) + 5;
      if (!last && slice.length && used + t > perRow) break;
      if (used + t > innerW) break;
      slice.push(it);
      used += t;
      cursor++;
    }
    out.push({ items: slice });
  }
  return out;
}

/* Side cases hold whatever a room's shelf does not fit on the back wall.
   With the current harvest that is nothing — tools/harvest.mjs sizes each
   room's allocation to its back case — so these stand as empty shelves
   rather than as a wall of filler. The shortfall is real and is counted,
   not hidden; see HANDOFF-PHASE10.md.

   Width-capped all the same. `w - 68` is the measured usable width of a
   side case, and a row that is filled by count rather than by width spills
   its books out through the end panel the first time the allocation grows. */
function planSideRows(overflow, w) {
  const items = overflow || [];
  const innerW = w - 68;
  const half = Math.ceil(items.length / 2);
  const out = [];
  let cursor = 0;
  for (let i = 0; i < 2; i++) {
    const slice = [];
    let used = 0;
    const stop = i === 0 ? half : items.length;
    while (cursor < stop) {
      const t = Math.min(items[cursor].w, 58) + 5;
      if (used + t > innerW) break;
      slice.push(items[cursor]);
      used += t;
      cursor++;
    }
    out.push({ items: slice });
  }
  return out;
}

/* Does this room even have a usable side case on this side? Ported
   from scene.js's addSideCase()/the 'tall' prop check in buildRoom().
   Four rooms (landing, bonelibrary, understory, longtable) end up
   with none — two because a trunk/column/monolith prop already
   occupies that wall, 'landing' because its door layout leaves no
   run wider than SIDE_MIN_W. That is derived here, not hard-coded,
   so it stays correct if room data changes. */
function sideCaseSpec(room, side) {
  const tallSlot = side === 'l' ? 'tall-l' : 'tall-r';
  const tall = (room.props || []).some((p) => (p.t === 'trunk' || p.t === 'column' || p.t === 'monolith') && p.at === tallSlot);
  if (tall) return null;

  const kids = (room.children || []).filter((k) => !k.viaTable);
  const slots = doorSlots(kids.length);
  const used = slots.filter((sl) => sl[0] === side).length;

  /* When `used` > 0, z0 is the z of the last used door bay's far edge
     — i.e. the case's nominal near boundary sits right where a real
     doorway ends. buildCarcass() below then gives the case a physical
     housing (left/right panels) that extends a further PANEL_T PAST
     that nominal edge — so pulling z0 back by exactly PANEL_T only
     cancels the overhang back to touching the door bay, not clear of
     it. Pull back by 2*PANEL_T: one PANEL_T to absorb the carcass's
     own overhang, one more as an actual clearance gap. (The far edge,
     SIDE_FAR, is a fixed room-corner constant no door ever sits at,
     so it needs no margin.) Caught, and the arithmetic double-checked
     against a Box3 overlap test, by phase 5's door/case cross-check —
     see HANDOFF-PHASE6.md for the numbers this was verified against. */
  const DOOR_MARGIN = PANEL_T * 2;
  let z0, w;
  if (used === 0) { z0 = SIDE_NEAR; w = Math.abs(SIDE_FAR - SIDE_NEAR); }
  else if (used === 1) { z0 = BAY[0].r - DOOR_MARGIN; w = Math.abs(SIDE_FAR - BAY[0].r) - DOOR_MARGIN; }
  else if (used === 2) { z0 = BAY[1].r - DOOR_MARGIN; w = Math.abs(SIDE_FAR - BAY[1].r) - DOOR_MARGIN; }
  else return null;
  w = Math.min(w, SIDE_MAX_W);
  if (w < SIDE_MIN_W) return null;
  return { z0, w };
}

/* Exported per phase 6's props.js: a floor-l/floor-r/floor-ml/floor-mr/
   back-l/back-r prop and a same-side case can genuinely occupy the same
   3D volume now that both are real geometry (SLOT's floor-l/r,
   floor-ml/mr, back-l/r x-anchors sit well within SIDE_CD's 170-unit
   case depth — this was
   never a problem in the CSS build, where the side "shelf" was a flat
   painted card with no real depth to collide with). props.js uses this
   existence check (not sideCaseSpec()'s full {z0,w} — it only needs
   the boolean) to decide whether to nudge an affected prop clear of the
   case, the same "resolve a real conflict between two now-real pieces
   of geometry" move phase 5 made for the case/door overlap it found —
   see HANDOFF-PHASE7.md for the numbers this was verified against. */
export function sideCaseExists(room, side) {
  return !!sideCaseSpec(room, side);
}

/* ── the atlas ────────────────────────────────────────────── */

const ATLAS_SCALE = 3; // canvas px per world px
const ATLAS_MAX_W = 2048;

function paintSpineCell(ctx, x, y, w, h, item) {
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  const stops = parseStops(item.bgGrad);
  if (stops.length) {
    for (const st of stops) grad.addColorStop(st.offset, st.color);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = '#333';
  }
  ctx.fillRect(x, y, w, h);

  if (item.band && item.band !== 'transparent') {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = item.band;
    const bandH = Math.max(1, h * 0.035);
    ctx.fillRect(x, y, w, bandH);
    ctx.fillRect(x, y + h - bandH, w, bandH);
    ctx.restore();
  }

  /* the shopkeeper's pick: a gilt band low on the spine, the same mark
     scene.css draws on the CSS build and the book panel repeats, so the
     book you spotted across the room is the one you end up holding */
  if (item.pick) {
    ctx.save();
    const bandY = y + h * 0.79;
    const bandH = Math.max(2, h * 0.08);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x, bandY - 1, w, bandH + 2);
    ctx.fillStyle = '#d9a44f';
    ctx.fillRect(x, bandY, w, bandH);
    ctx.restore();
  }

  if (item.title && w >= 19 * ATLAS_SCALE) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = item.ink;
    const fontPx = Math.max(9, item.fontSizeWorld * ATLAS_SCALE);
    ctx.font = `${fontPx}px ${item.font}`;
    let title = item.title;
    const maxW = h - 20 * ATLAS_SCALE;
    while (title.length > 3 && ctx.measureText(title).width > maxW) {
      title = title.slice(0, -2).trim() + '…';
    }
    if (ctx.measureText(title).width <= maxW) ctx.fillText(title, 0, 0);
    ctx.restore();
  }
}

function pxRectToUV(px, py, pw, ph, canvasW, canvasH) {
  return {
    u0: px / canvasW,
    u1: (px + pw) / canvasW,
    v0: 1 - (py + ph) / canvasH,
    v1: 1 - py / canvasH,
  };
}

/**
 * Pack every spine (real + filler) in a room into one canvas, paint
 * each, and return a shared MeshStandardMaterial plus a lookup from
 * item -> its UV sub-rect. One atlas per room, built once on entry
 * per PLAN-ARCH.md; re-rendering it at higher resolution on a
 * `shelf` camera pose is future work (poses don't exist until phase
 * 7 — see HANDOFF-PHASE5.md).
 */
function buildAtlas(items) {
  const specs = items.map((it) => ({
    it,
    wPx: Math.max(2, Math.round(it.w * ATLAS_SCALE)),
    hPx: Math.max(2, Math.round(Math.min(it.h, MAX_BOOK_H) * ATLAS_SCALE)),
  }));
  const sorted = specs.slice().sort((a, b) => b.hPx - a.hPx);

  const PAD = 2;
  let x = 0, y = 0, rowH = 0;
  for (const s of sorted) {
    if (x + s.wPx + PAD > ATLAS_MAX_W) { x = 0; y += rowH + PAD; rowH = 0; }
    s.px = x; s.py = y;
    x += s.wPx + PAD;
    rowH = Math.max(rowH, s.hPx);
  }
  const canvasW = ATLAS_MAX_W;
  const canvasH = Math.max(2, y + rowH + PAD);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#161310';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const rectMap = new Map();
  for (const s of sorted) {
    paintSpineCell(ctx, s.px, s.py, s.wPx, s.hPx, s.it);
    rectMap.set(s.it, pxRectToUV(s.px, s.py, s.wPx, s.hPx, canvasW, canvasH));
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.82, metalness: 0.02 });

  return {
    texture,
    material,
    canvas,
    width: canvasW,
    height: canvasH,
    rectFor: (item) => rectMap.get(item),
    dispose() { texture.dispose(); material.dispose(); },
  };
}

/* Remap one face's 4 UVs from BoxGeometry's default [0,1]x[0,1] into
   a sub-rect, by affine transform of whatever values are already
   there — this works regardless of which of the 4 corners BoxGeometry
   assigns which (0,0)/(1,0)/(0,1)/(1,1) UV to, because the transform
   is linear in each existing coordinate. BoxGeometry's face/material
   groups are documented (and long-stable) in the order
   [+x, -x, +y, -y, +z, -z], 4 unshared vertices per face, so face
   index 4 is +z — the book's spine, by this file's convention. */
function remapFaceUV(geometry, faceIndex, rect) {
  const uv = geometry.attributes.uv;
  const start = faceIndex * 4;
  for (let i = start; i < start + 4; i++) {
    const ou = uv.getX(i);
    const ov = uv.getY(i);
    uv.setXY(i, rect.u0 + ou * (rect.u1 - rect.u0), rect.v0 + ov * (rect.v1 - rect.v0));
  }
  uv.needsUpdate = true;
}

/* ── meshes ───────────────────────────────────────────────── */

let sharedPageMaterial = null;
function pageMaterial() {
  if (!sharedPageMaterial) {
    sharedPageMaterial = new THREE.MeshStandardMaterial({ color: '#e9dec5', roughness: 0.92, metalness: 0 });
  }
  return sharedPageMaterial;
}

/**
 * One book (or filler spine) as a THREE.Mesh box. Materials: front/
 * back cover (solid colour from the jacket palette), top/bottom/edge
 * (shared page-block material), spine (a clone of the room's atlas
 * material, UV-remapped to this book's sub-rect — cloned, not
 * shared, so hover/focus can set emissive on ONE book without
 * lighting up every book that shares the atlas texture).
 */
function makeBookMesh(item, atlas) {
  const h = Math.min(item.h, MAX_BOOK_H);
  const geo = new THREE.BoxGeometry(Math.max(1, item.w), Math.max(1, h), Math.max(1, item.d));
  const rect = atlas.rectFor(item);
  if (rect) remapFaceUV(geo, 4, rect);

  const coverMat = new THREE.MeshStandardMaterial({ color: item.coverColor, roughness: 0.85, metalness: 0.03 });
  const coverMat2 = new THREE.MeshStandardMaterial({ color: item.coverColor2, roughness: 0.85, metalness: 0.03 });
  const spineMat = atlas.material.clone();
  spineMat.emissive = new THREE.Color(0x000000);
  spineMat.emissiveIntensity = 0;

  const page = pageMaterial();
  const mesh = new THREE.Mesh(geo, [coverMat, coverMat2, page, page, spineMat, page]);
  mesh.userData.bookHeight = h;
  return mesh;
}

/* ── carcass ──────────────────────────────────────────────── */

/**
 * The wood housing around one case's books: back panel, two side
 * panels, top/bottom, and one shelf board per row. `matWood`/
 * `matDark` are created fresh PER CALL — deliberately not shared
 * across cases — which is exactly what lets buildCaseGroup()'s
 * setHighlight() light up ONE case's emissive without also lighting
 * up every other case in the room (they'd share a material instance
 * otherwise, the same reasoning makeBookMesh() already documents for
 * why the spine material is cloned per book). Returns the materials
 * (not just the group) so that highlight can reach them, and returns
 * every mesh so buildCaseGroup() can tag each one with the case's
 * pickable entry.
 */
function buildCarcass(w, ch, depth, rowFloors, wood, woodDark) {
  const g = new THREE.Group();
  const matWood = new THREE.MeshStandardMaterial({ color: wood, roughness: 0.88 });
  const matDark = new THREE.MeshStandardMaterial({ color: woodDark, roughness: 0.9 });

  const back = new THREE.Mesh(new THREE.BoxGeometry(w, ch, PANEL_T), matDark);
  back.position.set(w / 2, ch / 2, -PANEL_T / 2);
  g.add(back);

  const left = new THREE.Mesh(new THREE.BoxGeometry(PANEL_T, ch, depth), matWood);
  left.position.set(-PANEL_T / 2, ch / 2, depth / 2);
  g.add(left);

  const right = new THREE.Mesh(new THREE.BoxGeometry(PANEL_T, ch, depth), matWood);
  right.position.set(w + PANEL_T / 2, ch / 2, depth / 2);
  g.add(right);

  const top = new THREE.Mesh(new THREE.BoxGeometry(w + PANEL_T * 2, PANEL_T, depth), matWood);
  top.position.set(w / 2, ch + PANEL_T / 2, depth / 2);
  g.add(top);

  const bottom = new THREE.Mesh(new THREE.BoxGeometry(w + PANEL_T * 2, PANEL_T, depth), matWood);
  bottom.position.set(w / 2, -PANEL_T / 2, depth / 2);
  g.add(bottom);

  for (const floorY of rowFloors) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, BOARD, depth), matWood);
    board.position.set(w / 2, floorY - BOARD / 2, depth / 2);
    g.add(board);
  }
  return { group: g, matWood, matDark };
}

/* Every case ariaLabel, per PLAN.md point 6 ("Every case ... becomes
   a focusable target"). Keyed by caseId, the same string that names
   its `shelf:<caseId>` pose. */
const CASE_ARIA = {
  back: 'Step up to the shelves on the back wall',
  left: 'Step up to the shelves on the left wall',
  right: 'Step up to the shelves on the right wall',
};

/* How far BEHIND the books' own spine plane (baseZ = depth -
   item.d/2 - 6, so at most depth - 6 — see the rows loop below) the
   case's click/hover sensor sits. Rays through the gaps BETWEEN
   spines still need to land on the case, so "step up to this shelf"
   works from anywhere on it, not only exactly on a book — but the
   sensor must never be the NEARER hit when a ray also crosses a book,
   or one click would both open the book and fire the shelf pose. 12
   clears the deepest possible spine position (6) with margin. */
const CASE_SENSOR_SETBACK = 12;

/**
 * One case (back wall or one side wall) as a THREE.Group: carcass +
 * every row's books, in local case space (x:0..w left-to-right,
 * y:0..ch floor-to-top, z:0..depth wall-to-room). `origin`/`rotY`
 * place and orient that local space in the room; every book inherits
 * the case's rotation for free, so a side-case book's spine correctly
 * faces into the room without this function knowing which wall it's
 * on.
 *
 * @param {string} caseId  'back'|'left'|'right' — threaded through to
 *   every real book pushed onto `entries` (so a11y focus can fly to
 *   the right shelf) and to this case's own pose entry's `.pose`
 *   (`shelf:<caseId>`).
 * @returns {{group: THREE.Group, w: number, ch: number, depth: number,
 *   entry: object}} `entry` is this case's own pickable target — see
 *   buildRoomBooks()'s doc comment for its exact shape.
 */
function buildCaseGroup({ origin, rotY, w, depth, rows, wood, woodDark, atlas, entries, caseId }) {
  const g = new THREE.Group();
  g.position.copy(origin);
  g.rotation.y = rotY;

  const ch = rows.length * (ROW_H + BOARD) + 26;
  const rowFloors = rows.map((_, i) => ch - 26 - i * (ROW_H + BOARD) - ROW_H);

  const carcass = buildCarcass(w, ch, depth, rowFloors, wood, woodDark);
  g.add(carcass.group);

  // Invisible sensor behind the spine plane (see CASE_SENSOR_SETBACK
  // above) so the case is clickable/hoverable through the gaps
  // between spines too, not only on a book. A plane, not a box like
  // doors.js's sensor recipe — the carcass already gives this case a
  // silhouette on every other side, this only needs to cover the open
  // face.
  const sensor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, ch),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  sensor.position.set(w / 2, ch / 2, depth - CASE_SENSOR_SETBACK);
  g.add(sensor);

  // The case's own pickable entry — "move the camera to this shelf",
  // per PLAN.md point 6. Tagged onto every carcass mesh AS WELL AS
  // the sensor: the carcass is the visible wood, which sits at local
  // z up to `depth`, IN FRONT of the sensor, so without tagging it
  // too, hovering the case's own frame (as opposed to a gap between
  // spines) would hover nothing.
  const caseEntry = {
    caseId,
    meshes: [...carcass.group.children, sensor],
    pose: `shelf:${caseId}`,
    ariaLabel: CASE_ARIA[caseId],
    setHighlight(on) {
      // Deliberately replaces CSS's hover `filter` — a grouping
      // property, and the direct cause of PLAN.md's Finding B — with
      // a real material property on the carcass's own materials (see
      // buildCarcass()'s doc comment for why mutating them here is
      // safe: they're per-case, not shared).
      const emissive = on ? 0x2a2114 : 0x000000;
      const intensity = on ? 0.35 : 0;
      carcass.matWood.emissive.setHex(emissive);
      carcass.matWood.emissiveIntensity = intensity;
      carcass.matDark.emissive.setHex(emissive);
      carcass.matDark.emissiveIntensity = intensity;
    },
  };
  for (const mesh of caseEntry.meshes) mesh.userData.entry = caseEntry;

  rows.forEach((row, i) => {
    const floorY = rowFloors[i];
    let x = 20;
    for (const item of row.items) {
      const mesh = makeBookMesh(item, atlas);
      const h = mesh.userData.bookHeight;
      const baseZ = depth - item.d / 2 - 6;
      mesh.position.set(x + item.w / 2, floorY + h / 2, baseZ);
      if (item.tilt) mesh.rotation.z = THREE.MathUtils.degToRad(item.tilt);
      g.add(mesh);

      const spineMat = mesh.material[4];
      const entry = {
        book: item.book,
        index: item.index,
        // Which case this book lives on — set from the case
        // currently being built, not hard-coded: side cases now take
        // a room's overflow, and a11y focus uses this to fly to the
        // right shelf (see mountA11yMirror()'s opts.onFocus).
        caseId,
        mesh,
        /* The picks tier has to exist for a screen reader too — the gilt
           band on the spine is worth nothing without colour or shape.
           Same wording as scene.js's CSS build, deliberately. */
        ariaLabel: `${item.book.title} by ${item.book.author}.${item.pick ? " The shopkeeper's pick." : ''} Take it off the shelf.`,
        setHighlight(on) {
          mesh.position.z = on ? baseZ + HOVER_LIFT : baseZ;
          mesh.rotation.x = on ? -HOVER_TILT : 0;
          spineMat.emissive.setHex(on ? HOVER_EMISSIVE : 0x000000);
          spineMat.emissiveIntensity = on ? 0.55 : 0;
        },
      };
      mesh.userData.entry = entry;
      entries.push(entry);
      x += item.w + 5;
    }
  });

  return { group: g, w, ch, depth, entry: caseEntry };
}

/* ── the room's books ─────────────────────────────────────── */

/**
 * Build every case (back wall + up to two side walls) for one room,
 * with real books as individually-highlightable meshes sharing one
 * per-room atlas.
 *
 * @param {object} room  a src/js/data/rooms.js entry (needs id, pal,
 *   props, children)
 * @param {object[]} books  room's real books in shelf order, e.g.
 *   `shop.js`'s `booksIn(room.id)`
 * @returns {{ group: THREE.Group, entries: object[], atlas: object,
 *   cases: object[] }}
 *   `entries` is every book on every case, in shelf order, one per
 *   book — exactly what the a11y mirror (src/js/scene/a11y.js) and the
 *   pointer raycaster (src/js/scene/interact.js) both need. Phase 9
 *   removed the filler spines that used to stand in the rows without
 *   appearing here, so `entries.length` is now simply the number of
 *   spines on the shelves: every mesh is a book and every book is
 *   focusable and clickable.
 *
 *   `cases` is one descriptor per case actually built (back wall
 *   always; each side wall only if sideCaseSpec() allows one), shaped
 *   `{ id: 'back'|'left'|'right', group, w, ch, depth, entry }` —
 *   `w`/`ch`/`depth`/`group` are the geometry poses.js needs to frame
 *   a `shelf:<caseId>` pose (phase 7, PLAN.md point 6); `entry` is the
 *   case's own pickable target, `{ caseId, meshes, pose, ariaLabel,
 *   setHighlight }`, shaped so interact.js's attachScenePicking() and
 *   a11y.js's mirror both work on it exactly as they do on a book or
 *   door entry.
 */
export function buildRoomBooks(room, books) {
  const group = new THREE.Group();
  group.name = `books:${room.id || 'room'}`;

  const hue = room.pal?.hue ?? 30;
  const seedBase = hash(room.id || '');
  const wood = room.pal?.wood || '#7d5539';
  const woodDark = room.pal?.['wood-dark'] || '#452c1d';

  const backRows = planBackRows(books);
  const shelved = backRows.reduce((a, r) => a + r.items.length, 0);
  /* anything the back case could not take, in shelf order, split between
     whichever side cases the room has */
  const overflow = books.slice(shelved).map((b, i) => realItem(b, shelved + i));
  const sideLeft = sideCaseSpec(room, 'l');
  const sideRight = sideCaseSpec(room, 'r');
  const sides = [sideLeft, sideRight].filter(Boolean).length;
  const perSide = sides ? Math.ceil(overflow.length / sides) : 0;
  const leftRows = sideLeft ? planSideRows(overflow.slice(0, perSide), sideLeft.w) : null;
  const rightRows = sideRight
    ? planSideRows(overflow.slice(sideLeft ? perSide : 0, sideLeft ? perSide * 2 : perSide), sideRight.w)
    : null;
  /* A room with more books than its cases can hold would lose them silently:
     no mesh, no entry, and therefore no button in the a11y mirror either —
     the one failure here that a screenshot cannot show. The allocator sizes
     each room to its back case so this does not fire, which is exactly why
     it is worth saying out loud if it ever does. */
  const seated = (leftRows || []).concat(rightRows || []).reduce((a, r) => a + r.items.length, shelved);
  if (seated < books.length) {
    console.warn(`books.js: ${room.id} has ${books.length - seated} books with nowhere to stand`);
  }

  const allItems = [];
  for (const row of backRows) allItems.push(...row.items);
  if (leftRows) for (const row of leftRows) allItems.push(...row.items);
  if (rightRows) for (const row of rightRows) allItems.push(...row.items);

  const atlas = buildAtlas(allItems);
  const entries = [];
  const cases = [];

  const back = buildCaseGroup({
    origin: new THREE.Vector3(-CASE_W / 2, 0, -WORLD.d),
    rotY: 0,
    w: CASE_W,
    depth: CASE_D,
    rows: backRows,
    wood, woodDark, atlas, entries,
    caseId: 'back',
  });
  back.group.name = 'case:back';
  group.add(back.group);
  cases.push({ id: 'back', group: back.group, w: back.w, ch: back.ch, depth: back.depth, entry: back.entry });

  if (sideLeft) {
    const left = buildCaseGroup({
      origin: new THREE.Vector3(-WORLD.hw, 0, sideLeft.z0),
      rotY: Math.PI / 2,
      w: sideLeft.w,
      depth: SIDE_CD,
      rows: leftRows,
      wood, woodDark, atlas, entries,
      caseId: 'left',
    });
    left.group.name = 'case:left';
    group.add(left.group);
    cases.push({ id: 'left', group: left.group, w: left.w, ch: left.ch, depth: left.depth, entry: left.entry });
  }

  if (sideRight) {
    const right = buildCaseGroup({
      origin: new THREE.Vector3(WORLD.hw, 0, sideRight.z0 - sideRight.w),
      rotY: -Math.PI / 2,
      w: sideRight.w,
      depth: SIDE_CD,
      rows: rightRows,
      wood, woodDark, atlas, entries,
      caseId: 'right',
    });
    right.group.name = 'case:right';
    group.add(right.group);
    cases.push({ id: 'right', group: right.group, w: right.w, ch: right.ch, depth: right.depth, entry: right.entry });
  }

  // shelf order: back wall (row 0 then row 1) first, then any overflow on
  // the side cases — all in the order books were passed in, because
  // planBackRows()/planSideRows() only ever slice, never reorder. So
  // `entries` is `books` in the caller's order, which is what a11y.js's
  // mirror walks and what interact.js's prev/next steps through.
  return { group, entries, atlas, cases };
}
