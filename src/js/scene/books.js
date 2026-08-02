/* ============================================================
   Cases, books and the per-room spine atlas.

   Per IMPLEMENTATION.md §4.6 / PLAN-ARCH.md "Books at scale":

   - one canvas2d texture atlas per room, holding every spine (real
     books AND filler) as one composited image each: ground gradient,
     head/tail bands, title — exactly what covers.js's spineStyle()
     already produces together for a real book, and fillerStyle() for
     decor.
   - books are individual THREE.Mesh boxes sharing that one atlas
     material via per-book UV sub-rects, not merged into one geometry
     — keeps per-book hover trivial (the brief's explicit reasoning).
   - the back-wall case (2 rows, CASE_W wide) and both side-wall
     cases (2 rows each) are real 3D geometry now, including the side
     cases: PLAN-ARCH point 5 replaces spineRun()'s painted gradient
     with real meshes once the side shelves become real. spineRun()
     itself is NOT deleted from covers.js — scene.js (the still-live
     CSS scene) still calls it. See HANDOFF-PHASE5.md.

   Geometry constants (CASE_W, CASE_D, ROW_H, BOARD, the side-case
   BAY/near/far/width-cap numbers) are measured facts from
   IMPLEMENTATION.md §4.6, carried over from scene.js — not
   re-derived. The row-packing algorithm (real books flanked by
   filler, filler capped at 20/row) is ported from scene.js's
   fillRow()/buildFiller(), not reinvented.

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
import { spineStyle, shelfSize, fillerStyle, hash } from '../covers.js';
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
    isFiller: false,
    book,
    index,
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

let fillerSerial = 0;
function fillerItem(seed, hue) {
  const f = fillerStyle(seed, hue);
  return {
    isFiller: true,
    // a stable-enough key for the atlas Map even though two filler
    // items can otherwise be structurally identical
    key: `fill:${seed}:${hue}:${fillerSerial++}`,
    w: f.t,
    h: f.h,
    d: f.d,
    tilt: f.tilt,
    bgGrad: f.bg,
    band: f.band,
    ink: '#000000',
    font: 'sans-serif',
    title: '',
    fontSizeWorld: 0,
    coverColor: f.base,
    coverColor2: f.base,
  };
}

/* Back-wall case: exactly 2 rows (measured fact), row usable width
   CASE_W-40 (~1152px measured). Real books split evenly across the
   two rows in shelf order, then each row is flanked by filler up to
   a 20-per-row cap — ported directly from scene.js's fillRow():
   `while (used < innerW - 30 && pad.length < 20)`, which is exactly
   why the whole shop nets out at 40 filler/room (2 rows * 20). */
function packFiller(realItems, hue, seed, innerW) {
  let used = realItems.reduce((a, it) => a + Math.min(it.w, 58) + 5, 0);
  const pad = [];
  let s = seed;
  while (used < innerW - 30 && pad.length < 20) {
    const f = fillerItem(s, hue);
    const t = f.w + 5;
    if (used + t > innerW - 6) break;
    used += t;
    pad.push(f);
    s++;
  }
  const half = Math.ceil(pad.length / 2);
  return { before: pad.slice(0, half), after: pad.slice(half) };
}

function planBackRows(books, hue, seedBase) {
  const rows = 2;
  const per = Math.ceil(books.length / rows) || 0;
  const innerW = CASE_W - 40;
  const out = [];
  for (let i = 0; i < rows; i++) {
    const slice = books.slice(i * per, (i + 1) * per);
    const startIndex = i * per;
    const realItems = slice.map((b, j) => realItem(b, startIndex + j));
    const { before, after } = packFiller(realItems, hue, seedBase + i * 977, innerW);
    out.push({ items: [...before, ...realItems, ...after] });
  }
  return out;
}

/* Side cases: no real books left once the back wall has them all —
   this is exactly the situation spineRun() painted over on the CSS
   build (see covers.js's spineRun() doc comment). Pack filler
   edge-to-edge (spineRun()'s own `x += w + 1` gutter), same
   generation function, real geometry instead of a painted gradient. */
function planSideRows(w, hue, seedBase) {
  const rows = 2;
  const innerW = w - 68; // measured fact: usable width is cw-68
  const out = [];
  for (let i = 0; i < rows; i++) {
    const items = [];
    let used = 0;
    let s = seedBase + i * 313;
    while (used < innerW - 6) {
      const f = fillerItem(s, hue);
      const t = f.w + 1;
      if (used + t > innerW) break;
      items.push(f);
      used += t;
      s++;
    }
    out.push({ items });
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

  if (!item.isFiller && item.title && w >= 19 * ATLAS_SCALE) {
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
  return g;
}

/**
 * One case (back wall or one side wall) as a THREE.Group: carcass +
 * every row's books, in local case space (x:0..w left-to-right,
 * y:0..ch floor-to-top, z:0..depth wall-to-room). `origin`/`rotY`
 * place and orient that local space in the room; every book inherits
 * the case's rotation for free, so a side-case book's spine correctly
 * faces into the room without this function knowing which wall it's
 * on.
 */
function buildCaseGroup({ origin, rotY, w, depth, rows, wood, woodDark, atlas, entries }) {
  const g = new THREE.Group();
  g.position.copy(origin);
  g.rotation.y = rotY;

  const ch = rows.length * (ROW_H + BOARD) + 26;
  const rowFloors = rows.map((_, i) => ch - 26 - i * (ROW_H + BOARD) - ROW_H);

  g.add(buildCarcass(w, ch, depth, rowFloors, wood, woodDark));

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

      if (!item.isFiller) {
        const spineMat = mesh.material[4];
        const entry = {
          book: item.book,
          index: item.index,
          mesh,
          ariaLabel: `${item.book.title} by ${item.book.author}. Take it off the shelf.`,
          setHighlight(on) {
            mesh.position.z = on ? baseZ + HOVER_LIFT : baseZ;
            mesh.rotation.x = on ? -HOVER_TILT : 0;
            spineMat.emissive.setHex(on ? HOVER_EMISSIVE : 0x000000);
            spineMat.emissiveIntensity = on ? 0.55 : 0;
          },
        };
        mesh.userData.entry = entry;
        entries.push(entry);
      }
      x += item.w + 5;
    }
  });

  return g;
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
 * @returns {{ group: THREE.Group, entries: object[], atlas: object }}
 *   `entries` is real books only, in shelf order, one per book —
 *   exactly what the a11y mirror (src/js/scene/a11y.js) and the
 *   pointer raycaster (src/js/scene/interact.js) both need. Filler
 *   spines are real meshes too (so the shelf looks full) but are
 *   deliberately not in `entries`: they are decor, not focusable or
 *   clickable, matching scene.css's `.fill { pointer-events: none }`
 *   / `aria-hidden` treatment of the CSS build's filler `<span>`s.
 */
export function buildRoomBooks(room, books) {
  const group = new THREE.Group();
  group.name = `books:${room.id || 'room'}`;

  const hue = room.pal?.hue ?? 30;
  const seedBase = hash(room.id || '');
  const wood = room.pal?.wood || '#7d5539';
  const woodDark = room.pal?.['wood-dark'] || '#452c1d';

  const backRows = planBackRows(books, hue, seedBase);
  const sideLeft = sideCaseSpec(room, 'l');
  const sideRight = sideCaseSpec(room, 'r');
  const leftRows = sideLeft ? planSideRows(sideLeft.w, hue, seedBase + 5101) : null;
  const rightRows = sideRight ? planSideRows(sideRight.w, hue, seedBase + 7307) : null;

  const allItems = [];
  for (const row of backRows) allItems.push(...row.items);
  if (leftRows) for (const row of leftRows) allItems.push(...row.items);
  if (rightRows) for (const row of rightRows) allItems.push(...row.items);

  const atlas = buildAtlas(allItems);
  const entries = [];

  const back = buildCaseGroup({
    origin: new THREE.Vector3(-CASE_W / 2, 0, -WORLD.d),
    rotY: 0,
    w: CASE_W,
    depth: CASE_D,
    rows: backRows,
    wood, woodDark, atlas, entries,
  });
  back.name = 'case:back';
  group.add(back);

  if (sideLeft) {
    const left = buildCaseGroup({
      origin: new THREE.Vector3(-WORLD.hw, 0, sideLeft.z0),
      rotY: Math.PI / 2,
      w: sideLeft.w,
      depth: SIDE_CD,
      rows: leftRows,
      wood, woodDark, atlas, entries,
    });
    left.name = 'case:left';
    group.add(left);
  }

  if (sideRight) {
    const right = buildCaseGroup({
      origin: new THREE.Vector3(WORLD.hw, 0, sideRight.z0 - sideRight.w),
      rotY: -Math.PI / 2,
      w: sideRight.w,
      depth: SIDE_CD,
      rows: rightRows,
      wood, woodDark, atlas, entries,
    });
    right.name = 'case:right';
    group.add(right);
  }

  // shelf order: back wall (row 0 then row 1) already comes first, in
  // the order books were passed in; side cases only ever hold filler
  // (no entries pushed for them), so `entries` is already exactly
  // `books` in the same order the caller passed them.
  return { group, entries, atlas };
}
