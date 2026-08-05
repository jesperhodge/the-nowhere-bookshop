/* ============================================================
   Props — set dressing, as textured planes (+ real geometry for the
   lamp fixture). Per IMPLEMENTATION.md §3 row 6 / PLAN-ARCH.md's
   `src/js/scene/` layout ("props.js  SVG art -> alpha-mapped billboard
   planes"), this ports scene.js's buildProp()/propArgs()/place()/
   groundStyle() switch — the DOM/CSS mechanism changes, the visual
   intent and the per-type recipes do not. See scene.js (still live,
   read-only reference this phase) for the source being ported.

   Two families of prop, matching scene.js's switch exactly:

   - 'art': the majority (globe, plant, armchair, clock, telescope,
     candle, mushrooms, stack, starchart, shipmodel, umbrella, herbs,
     typewriter, ladder, cat, and any future ART entry) — src/js/data/
     props.js's artURI()/ART registry, rendered to a canvas via an
     Image decode of the SVG data URI (see textures.js's svgTexture()
     doc comment for why that was chosen over THREE.TextureLoader — the
     rasterise step now lives there, hoisted for tables.js's book
     covers, a second real consumer), alpha-mapped
     onto a PlaneGeometry sized by CONTAIN-fit (matches CSS
     `.prop-art { background: var(--art) center/contain no-repeat }` —
     the art keeps its own aspect ratio inside the prop's w/h box
     rather than being stretched to fill it).

   - the ten specially-coded types (lamp, window, hearth, blinds, rug,
     skylight, trunk, column, monolith, orrery) — hand-built canvas2d
     gradients, same technique textures.js already uses for wall
     kinds (its hex/rgba/mix/pinstripe helpers are re-exported and
     reused here rather than duplicated). Each type's plane fills its
     w/h box exactly (no contain-fit — matches the CSS recipes, which
     are `background: <gradient>` at 100% size, not `contain`-fit
     art). 'lamp' is the exception: real 3D geometry (shade + cord),
     not a flat plane, positioned via coords.js's lampAnchor() — the
     SAME function stage.js's buildRoomLights() uses for the point
     light + glow bulb, so the fixture and the light it houses can
     never drift apart (see coords.js's lampAnchor() doc comment and
     HANDOFF-PHASE6.md).

   Grounded contact shadow + depth dimming (scene.js's groundStyle()):
   ported for the contact-shadow half (a soft radial-gradient decal
   plane lying on the floor at a prop's feet) — but NOT for the
   brightness-dimming half. scene.js dims a grounded prop's own
   opacity/filter by hand as a proxy for "further from the camera,
   darker" (`--art-filter: brightness(...)`, `depth = -c.z / 1200`).
   Real point lights + decay already do exactly this job in this
   substrate (PLAN-ARCH.md "Keeping the look": "real falloff fixes it
   at the source") — props further from a room's lamp(s) already read
   darker because they receive less light, without a second hand-coded
   dimming term fighting the first. Verified by screenshot this
   session (see HANDOFF-PHASE7.md), not assumed. Only 'art' props ever
   call groundStyle() in scene.js's switch (trunk/column/monolith sit
   at 'tall-l'/'tall-r', which the GROUNDED regex would match, but
   their own switch cases never call groundStyle() or add the
   `prop--ground` class) — ported faithfully: only the 'art' case
   below checks GROUNDED.
   ============================================================ */

import * as THREE from 'three';
import { ART } from '../data/props.js';
import { WORLD, placeProp, propBoxCenter, lampAnchor } from './coords.js';
import { rgba, mix, pinstripe, svgTexture } from './textures.js';
import { sideCaseExists, SIDE_CD } from './books.js';
import { roomHasTable, tableFootprint } from './tables.js';

const GROUNDED = /^(floor|tall)/;
const PROP_TEX_SCALE = 1.25; // canvas px per world unit for hand-painted prop textures

/* ── side-case clearance ──────────────────────────────────────────
   floor-l/floor-ml/back-l (and their -r mirrors) all place a prop's
   box well within SIDE_CD's 170-unit case depth from the wall (see
   coords.js's SLOT table) -- harmless in the CSS build, where the
   side "shelf" was a flat painted card with no real depth, but a
   genuine 3D collision now that books.js's side cases are real
   carcass geometry. Found this session via a Box3.intersectsBox()
   sweep (same technique phase 5 used for the case/door overlap it
   found) across all 50 rooms -- 40/50 had at least one prop
   overlapping a same-side case. Rather than move the case (books.js's
   sizing is phase-4/5 territory, already verified against doors), the
   PROP is nudged toward room-centre just enough to clear the case's
   depth, when a same-side case actually exists in this room. See
   HANDOFF-PHASE7.md for the sweep numbers and the screenshot this was
   verified against. */
const SIDE_CLEAR_MARGIN = 24;

function sideOfSlot(at) {
  // back-l-hi/back-r-hi normally sit well above a case's height (906
  // before any dy), but a large enough `dy` (e.g. attic's/cellar's
  // moth/bottles, dy:240/250) pulls them back down into it -- found
  // via the same Box3 sweep, not assumed safe just because the slot's
  // un-adjusted anchor clears the case.
  if (at === 'floor-l' || at === 'floor-ml' || at === 'back-l' || at === 'back-l-hi') return 'l';
  if (at === 'floor-r' || at === 'floor-mr' || at === 'back-r' || at === 'back-r-hi') return 'r';
  return null;
}

function clearSideCase(room, at, box) {
  const side = sideOfSlot(at);
  if (!side || !room || !sideCaseExists(room, side)) return box;
  if (side === 'l') {
    const innerEdge = -WORLD.hw + SIDE_CD + SIDE_CLEAR_MARGIN;
    const leftEdge = box.x - box.w / 2;
    if (leftEdge < innerEdge) return { ...box, x: box.x + (innerEdge - leftEdge) };
  } else {
    const innerEdge = WORLD.hw - SIDE_CD - SIDE_CLEAR_MARGIN;
    const rightEdge = box.x + box.w / 2;
    if (rightEdge > innerEdge) return { ...box, x: box.x - (rightEdge - innerEdge) };
  }
  return box;
}

/* Phase 7's version of the same problem, one phase later and one
   piece of furniture along: a table is now real geometry too, and in
   `cartographer` a `globe` at floor-l — already nudged inward off the
   left case by clearSideCase() above — landed with its billboard
   plane passing straight through the table's slab (found by the same
   Box3.intersectsBox() sweep, table frame vs. every prop mesh; 2 of
   the 4 overlaps it reported, the other 2 being `front`'s table legs
   standing on its rug, which is correct and left alone).

   Nudged in Z, not x: the corridor between the left case's inner face
   (x -670) and the table's left edge (x -535) is 135 units and the
   globe is 196 wide, so there is no x that clears both. Nudged
   FORWARD (toward the room's open front) rather than deeper, because
   deeper is where the side cases and the back case are.

   Only floor-l/floor-r can ever trigger this — they are the only
   SLOT entries whose z (-430) falls inside the table's -630..-330
   depth run — but the test below is a real box test rather than a
   slot allow-list, so a future `dz:` in the data can't sneak past it.
   Flat decorative planes (rug at SLOT.rug, skylight at SLOT.ceil) are
   excluded by GROUNDED, which is what keeps a table standing ON a rug
   from being "fixed". */
const TABLE_CLEAR_MARGIN = 24;

function clearTable(room, at, box) {
  if (!GROUNDED.test(at || '') || !roomHasTable(room)) return box;
  const t = tableFootprint();
  const overlapsX = box.x + box.w / 2 > t.x0 && box.x - box.w / 2 < t.x1;
  const overlapsY = box.y + box.h / 2 > t.y0 && box.y - box.h / 2 < t.y1;
  const overlapsZ = box.z > t.z0 && box.z < t.z1; // a billboard is one z plane
  if (!overlapsX || !overlapsY || !overlapsZ) return box;
  return { ...box, z: t.z1 + TABLE_CLEAR_MARGIN };
}

/** Where a prop's billboard box actually ends up: its authored anchor,
 *  moved clear of a same-side case (phase 6) and then of the room's
 *  table (phase 7). One helper, so the four build* functions below
 *  cannot each remember a different subset of the constraints. */
function propBox(room, p) {
  return clearTable(room, p.at, clearSideCase(room, p.at, propBoxCenter(p)));
}

/* ── 'art' props: SVG -> canvas texture ──────────────────────────
   The rasterise step itself (Image -> canvas -> Texture, and the full
   reasoning for why that's not THREE.TextureLoader on the data URI
   directly) now lives in textures.js's svgTexture() — hoisted there
   this phase once tables.js became a second real consumer (book
   covers, via covers.js's coverSVG()). See that function's doc
   comment for the complete explanation. This file keeps only what's
   specific to 'art' props: the cache (keyed by name+args, not by book
   id, so it can't share tables.js's cache even if the two were merged)
   and the ART registry lookup.
   ============================================================ */

const artCache = new Map();

/** ART registry name + positional args -> { texture, aspect, ready }.
 *  See textures.js's svgTexture() for what each field means and when
 *  `ready` resolves. */
function artTexture(name, args) {
  const key = `${name}::${args.join(',')}`;
  const hit = artCache.get(key);
  if (hit) return hit;

  const fn = ART[name];
  const svg = fn ? fn(...args) : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';
  const entry = svgTexture(svg);
  artCache.set(key, entry);
  return entry;
}

/* Direct port of scene.js's propArgs() -- maps a prop's own color
   fields to the positional args each ART entry's generator expects. */
function artArgs(p) {
  switch (p.a) {
    case 'globe': return [p.c || '#d4a760', p.d || '#35525f'];
    case 'plant': return [p.c || '#6a9a52', p.pot || '#9a5430'];
    case 'armchair': return [p.c || '#7d4239', p.w2 || '#42291b'];
    case 'clock': return [p.c || '#d4a760', p.f || '#efe4ca'];
    case 'telescope': return [p.c || '#c2954f', p.d || '#31221a'];
    case 'candle': return [p.c || '#f2e5c4', p.h2 || '#d4a760'];
    case 'mushrooms': return [p.c || '#c05f52', p.s || '#efe4ca'];
    case 'stack': return [p.c1 || '#9a5430', p.c2 || '#35525f', p.c3 || '#d4a760'];
    case 'starchart': return [p.c || '#d4a760', p.bg || '#141c30'];
    case 'shipmodel': return [p.c || '#98643f', p.s || '#efe4ca'];
    case 'umbrella': return [p.c || '#35525f', p.h2 || '#7a5540'];
    case 'herbs': return [p.c || '#8a9c62', p.s || '#9a7742'];
    case 'typewriter': return [p.c || '#42424a', p.k || '#ece2cc'];
    case 'ladder': return [p.c || '#7a5540'];
    case 'cat': return [p.c || '#463b32', p.e || '#e2c95f'];
    default: return p.c ? [p.c] : [];
  }
}

/* ── shared canvas-painted-texture cache (specially-coded types) ── */

const paintCache = new Map();
function paintedTexture(key, wWorld, hWorld, painter) {
  const hit = paintCache.get(key);
  if (hit) return hit;
  const wPx = Math.max(2, Math.round(wWorld * PROP_TEX_SCALE));
  const hPx = Math.max(2, Math.round(hWorld * PROP_TEX_SCALE));
  const canvas = document.createElement('canvas');
  canvas.width = wPx; canvas.height = hPx;
  const ctx = canvas.getContext('2d');
  painter(ctx, wPx, hPx, PROP_TEX_SCALE);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  paintCache.set(key, tex);
  return tex;
}

/* ── contact shadow (grounded 'art' props only — see doc comment) ── */

let sharedShadowTexture = null;
function shadowTexture() {
  if (sharedShadowTexture) return sharedShadowTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  sharedShadowTexture = new THREE.CanvasTexture(canvas);
  sharedShadowTexture.needsUpdate = true;
  return sharedShadowTexture;
}

/* box.w * .92 / box.w * .46 -- same ellipse proportions as scene.css's
   `.prop--ground::after { width: calc(var(--pw) * .92); height:
   calc(var(--pw) * .46) }`. lift = `0.72 - depth * 0.3`, the exact
   `--lift` formula from scene.js's groundStyle(). */
function buildContactShadow(box) {
  const depth = Math.min(1, Math.max(0, -box.z / 1200));
  const lift = 0.72 - depth * 0.3;
  const geo = new THREE.PlaneGeometry(box.w * 0.92, box.w * 0.46);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTexture(), color: 0x000000, transparent: true,
    depthWrite: false, opacity: lift,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(box.x, box.bottomY + 0.4, box.z);
  mesh.renderOrder = -1;
  mesh.name = 'prop-shadow';
  return mesh;
}

function billboard(x, y, z, w, h, material) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/* ── 'art' ────────────────────────────────────────────────────── */

function buildArt(p, pal, room) {
  const { texture, aspect, ready } = artTexture(p.a, artArgs(p));
  const box = propBox(room, p);
  const boxAspect = box.w / box.h;
  const dispW = aspect > boxAspect ? box.w : box.h * aspect;
  const dispH = aspect > boxAspect ? box.w / aspect : box.h;

  const material = new THREE.MeshStandardMaterial({
    map: texture, transparent: true, alphaTest: 0.02,
    roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide,
    opacity: p.op ?? 1,
  });
  const mesh = billboard(box.x, box.y, box.z, dispW, dispH, material);
  mesh.name = `prop-art:${p.a || ''}`;

  const objects = [mesh];
  if (GROUNDED.test(p.at || '')) objects.push(buildContactShadow(box));

  let breathe;
  if (p.breathe) {
    // scene.css's `@keyframes catbreathe { 0%,100% scale(1,1); 50%
    // scale(1.01,1.03) }`, transform-origin 50% 100% (bottom-anchored).
    // Ported as a plain centre-pivot scale pulse instead of a
    // bottom-anchored one -- see HANDOFF-PHASE7.md's "known
    // simplifications": only one room's cat uses `breathe`, so a
    // second geometry-pivot code path for a single prop instance
    // wasn't worth it. Still reads as breathing.
    breathe = (t) => {
      const s = 1 + Math.sin(t * 1.4) * 0.02;
      mesh.scale.set(s, 1 + Math.sin(t * 1.4) * 0.035, 1);
    };
  }

  return { objects, pending: ready, breathe };
}

/* ── lamp: real geometry (shade + cord), not a flat plane ────────
   Positioned via coords.js's lampAnchor() -- the SAME function
   stage.js's buildRoomLights() calls for the PointLight + glow bulb,
   so this fixture and the light it's supposedly housing can't drift
   apart. Only the shade + cord are built here; the bulb itself is
   stage.js's job (a small glow sphere already sits at lampAnchor()'s
   position) -- building a second bulb mesh here would duplicate it.
   ============================================================ */

let sharedShadeTexture = null;
function lampShadeTexture() {
  if (sharedShadeTexture) return sharedShadeTexture;
  const w = 128, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  // matches scene.css's `.shade { background: linear-gradient(180deg,
  // #3c2b21, #23180f) }` -- fixed fabric tones, not palette-driven.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3c2b21');
  g.addColorStop(1, '#23180f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  pinstripe(ctx, w, h, 1, 18, 1.4, '#000000', 0.18);
  sharedShadeTexture = new THREE.CanvasTexture(canvas);
  sharedShadeTexture.needsUpdate = true;
  return sharedShadeTexture;
}

const beamCache = new Map();
function beamTexture(color) {
  const hit = beamCache.get(color);
  if (hit) return hit;
  const w = 128, h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(color, 0.5));
  g.addColorStop(0.78, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  const rg = ctx.createRadialGradient(w / 2, 0, 4, w / 2, 0, w * 0.7);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  beamCache.set(color, tex);
  return tex;
}

function buildLamp(p, pal) {
  const anchor = lampAnchor(p);
  const color = p.green ? '#8fe4bc' : (pal.glow || '#ffc978');
  const objects = [];

  // cord: from the true ceiling down to the shade's top edge -- its
  // length is therefore always exactly however far `dy`/the slot
  // dropped the shade, with no separate need to trust p.cord's
  // authored px value for the geometry itself.
  const cordTop = WORLD.h;
  const cordLen = Math.max(1, cordTop - anchor.shadeTop);
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, cordLen, 6),
    new THREE.MeshStandardMaterial({ color: '#1c1310', roughness: 0.9 }),
  );
  cord.position.set(anchor.x, cordTop - cordLen / 2, anchor.z);
  cord.name = 'prop-lamp-cord';
  objects.push(cord);

  // shade: an open frustum -- CSS's `clip-path: polygon(22% 0, 78% 0,
  // 100% 100%, 0 100%)` is a top width of 56% tapering to a full-width
  // bottom, i.e. radiusTop ~= w*0.28, radiusBottom = w/2.
  const rTop = anchor.w * 0.28;
  const rBottom = anchor.w / 2;
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBottom, anchor.h, 20, 1, true),
    new THREE.MeshStandardMaterial({
      map: lampShadeTexture(), roughness: 0.78, metalness: 0.04,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(color), emissiveIntensity: 0.16,
    }),
  );
  shade.position.set(anchor.x, anchor.shadeTop - anchor.h / 2, anchor.z);
  shade.name = 'prop-lamp-shade';
  objects.push(shade);

  // beam: a soft additive glow cone below the bulb -- cosmetic
  // complement to the real PointLight (stage.js), standing in for
  // CSS's `.prop-lamp .beam`.
  const beamW = p.beam || 420;
  const beamH = Math.min(560, beamW * 1.3);
  const beamGeo = new THREE.PlaneGeometry(beamW, beamH);
  beamGeo.translate(0, -beamH / 2, 0); // pivot at the top edge
  const beam = new THREE.Mesh(
    beamGeo,
    new THREE.MeshBasicMaterial({
      map: beamTexture(color), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.5,
    }),
  );
  beam.position.set(anchor.x, anchor.shadeBottom, anchor.z);
  beam.name = 'prop-lamp-beam';
  objects.push(beam);

  return { objects };
}

/* ── window ───────────────────────────────────────────────────── */

function paintWindow(ctx, w, h, s, p) {
  const sky1 = p.sky1 || '#456179', sky2 = p.sky2 || '#1b2632';
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, sky1);
  g.addColorStop(1, sky2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (p.snow) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    const seed = (p.sky1 || '').length + (p.sky2 || '').length;
    for (let i = 0; i < 26; i++) {
      const x = ((i * 53 + seed * 17) % 100) / 100 * w;
      const y = ((i * 89 + seed * 31) % 100) / 100 * h;
      ctx.beginPath(); ctx.arc(x, y, 1.6 * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  } else if (p.weather !== false) {
    ctx.save();
    ctx.strokeStyle = 'rgba(200,220,240,.22)';
    ctx.lineWidth = 1.2 * s;
    for (let x = -h; x < w + h; x += 17 * s) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h * 0.22, h); ctx.stroke();
    }
    ctx.restore();
  }

  // bars: a cross, matching scene.css's `.prop-window .bars`
  ctx.save();
  ctx.fillStyle = 'rgba(20,14,10,.85)';
  const bw = 6 * s;
  ctx.fillRect(w / 2 - bw / 2, 0, bw, h);
  ctx.fillRect(0, h / 2 - bw / 2, w, bw);
  ctx.restore();

  // frame
  ctx.save();
  ctx.strokeStyle = mix(sky1, '#3a2818', 20);
  ctx.lineWidth = 14 * s;
  ctx.strokeRect(7 * s, 7 * s, w - 14 * s, h - 14 * s);
  ctx.restore();
}

function buildWindow(p, pal, room) {
  const box = propBox(room, p);
  const key = `window|${p.sky1}|${p.sky2}|${p.snow ? 1 : 0}|${p.weather}|${box.w}x${box.h}`;
  const tex = paintedTexture(key, box.w, box.h, (ctx, w, h, s) => paintWindow(ctx, w, h, s, p));
  const material = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.4, metalness: 0.05,
    emissive: new THREE.Color(p.sky1 || '#456179'), emissiveIntensity: 0.14,
  });
  return { objects: [billboard(box.x, box.y, box.z, box.w, box.h, material)] };
}

/* ── hearth ───────────────────────────────────────────────────── */

function paintHearth(ctx, w, h, s) {
  ctx.clearRect(0, 0, w, h);
  const mouth = ctx.createRadialGradient(w / 2, h, 4, w / 2, h, Math.max(w, h) * 0.66);
  mouth.addColorStop(0, '#ffb347');
  mouth.addColorStop(0.4, '#7a2e10');
  mouth.addColorStop(1, '#100907');
  ctx.fillStyle = mouth;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.arcTo(0, 0, w / 2, 0, h * 0.5);
  ctx.arcTo(w, 0, w, h, h * 0.5);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  const fire = ctx.createRadialGradient(w / 2, h, 2, w / 2, h * 0.42, w * 0.34);
  fire.addColorStop(0, '#fff0b8');
  fire.addColorStop(0.4, '#ffa32e');
  fire.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = fire;
  ctx.fillRect(w * 0.2, h * 0.35, w * 0.6, h * 0.65);

  // mantel
  const mantelH = 22 * s;
  const mg = ctx.createLinearGradient(0, 0, 0, mantelH);
  mg.addColorStop(0, '#ac7a52');
  mg.addColorStop(1, '#452c1d');
  ctx.fillStyle = mg;
  ctx.fillRect(-8 * s, 0, w + 16 * s, mantelH);
}

function buildHearth(p, pal, room) {
  const box = propBox(room, p);
  const key = `hearth|${box.w}x${box.h}`;
  const tex = paintedTexture(key, box.w, box.h, paintHearth);
  const material = new THREE.MeshStandardMaterial({
    map: tex, transparent: true,
    emissive: new THREE.Color('#ff8c32'), emissiveIntensity: 0.35,
    roughness: 0.7,
  });
  return { objects: [billboard(box.x, box.y, box.z, box.w, box.h, material)] };
}

/* ── blinds ───────────────────────────────────────────────────── */

function paintBlinds(ctx, w, h, s, pal) {
  ctx.fillStyle = '#0d1013';
  ctx.fillRect(0, 0, w, h);
  const stripe = 20 * s, lit = 7 * s;
  ctx.save();
  for (let y = 0; y < h; y += stripe) {
    ctx.fillStyle = 'rgba(255,250,235,.80)';
    ctx.fillRect(0, y, w, lit);
    ctx.fillStyle = 'rgba(10,12,14,.92)';
    ctx.fillRect(0, y + lit, w, stripe - lit);
  }
  ctx.restore();
  const wood = pal.wood || '#7d5539';
  ctx.strokeStyle = wood;
  ctx.lineWidth = 12 * s;
  ctx.strokeRect(6 * s, 6 * s, w - 12 * s, h - 12 * s);
}

function buildBlinds(p, pal, room) {
  const box = propBox(room, p);
  const key = `blinds|${pal.wood}|${box.w}x${box.h}`;
  const tex = paintedTexture(key, box.w, box.h, (ctx, w, h, s) => paintBlinds(ctx, w, h, s, pal));
  const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  return { objects: [billboard(box.x, box.y, box.z, box.w, box.h, material)] };
}

/* ── rug: lies flat on the floor, not a vertical billboard ────────
   scene.js's SLOT.rug already bakes `x: -w/2` (so with dx=0 the
   footprint is centred on the room's x=0), and z is authored as a
   single centre value (not an edge) -- see coords.js's SLOT comment.
   Ported as: footprint centred at (anchor.x + w/2, anchor.z), lying
   at y~0 (the floor). This is the same "match the intent, not the
   exact CSS transform-origin arithmetic" simplification doors.js/
   props.js both lean on for decorative, non-interactive geometry —
   see HANDOFF-PHASE7.md. ─────────────────────────────────────── */

function paintRug(ctx, w, h, s, p) {
  const c1 = p.c1 || '#4a2724', c2 = p.c2 || '#6d3b34';
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
  g.addColorStop(0, c2);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5 * s;
  const p1 = 22 * s;
  for (let o = -h; o < w + h; o += p1 * 2) {
    ctx.beginPath(); ctx.moveTo(o, 0); ctx.lineTo(o + h, h); ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = mix(c1, '#000000', 60);
  ctx.lineWidth = 6 * s;
  ctx.strokeRect(3 * s, 3 * s, w - 6 * s, h - 6 * s);
  ctx.restore();
}

function buildRug(p) {
  const anchor = placeProp(p);
  const w = p.w || 200, h = p.h || 200;
  const key = `rug|${p.c1}|${p.c2}|${w}x${h}`;
  const tex = paintedTexture(key, w, h, (ctx, cw, ch, s) => paintRug(ctx, cw, ch, s, p));
  const material = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, opacity: 0.95, roughness: 0.95,
  });
  const geo = new THREE.PlaneGeometry(w, h);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(anchor.x + w / 2, 0.3, anchor.z);
  mesh.name = 'prop-rug';
  return { objects: [mesh] };
}

/* ── skylight: lies flat, facing down, near the ceiling ──────────
   Same "box-centre" approximation as every vertical billboard for
   x/z; y uses the box's TOP edge (placeProp()'s raw anchor.y before
   subtracting h) -- for the 'ceil' slot that's already a sensible
   distance below the true ceiling plane (SLOT.ceil's y:660 vs the
   real ceiling at WORLD.h:940), which is exactly why scene.js's SLOT
   table hangs 'ceil' props down from the true ceiling in the first
   place (so they're not clipped into the ceiling mesh). ──────── */

function paintSkylight(ctx, w, h, s) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#cdd8f6');
  g.addColorStop(0.58, '#5a659a');
  g.addColorStop(1, '#262b46');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.strokeStyle = '#262b46';
  ctx.lineWidth = 8 * s;
  ctx.beginPath(); ctx.moveTo(w / 3, 0); ctx.lineTo(w / 3, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w * 2 / 3, 0); ctx.lineTo(w * 2 / 3, h); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = mix('#262b46', '#000000', 70);
  ctx.lineWidth = 14 * s;
  ctx.strokeRect(7 * s, 7 * s, w - 14 * s, h - 14 * s);
}

function buildSkylight(p) {
  const anchor = placeProp(p);
  const w = p.w || 200, h = p.h || 200;
  const key = `skylight|${w}x${h}`;
  const tex = paintedTexture(key, w, h, paintSkylight);
  const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(w, h);
  geo.rotateX(Math.PI / 2); // normal faces -Y (down into the room)
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(anchor.x + w / 2, Math.min(anchor.y, WORLD.h - 4), anchor.z);
  mesh.name = 'prop-skylight';
  return { objects: [mesh] };
}

/* ── trunk / column / monolith: vertical billboards, box-fill ──── */

function paintTrunk(ctx, w, h, s) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#1d1409');
  g.addColorStop(0.24, '#533b24');
  g.addColorStop(0.46, '#7a5836');
  g.addColorStop(0.78, '#3a2812');
  g.addColorStop(1, '#191007');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.34);
  top.addColorStop(0, 'rgba(0,0,0,.55)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.34);
  pinstripe(ctx, w, h, s, 236, 30, '#000000', 0.46);
  pinstripe(ctx, w, h, s, 410, 46, '#000000', 0.28);
}

function buildTrunk(p) {
  const box = propBoxCenter(p);
  const key = `trunk|${box.w}x${box.h}`;
  const tex = paintedTexture(key, box.w, box.h, paintTrunk);
  const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
  return { objects: [billboard(box.x, box.y, box.z, box.w, box.h, material)] };
}

function paintColumn(ctx, w, h, s) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#221e16');
  g.addColorStop(0.26, '#7a7160');
  g.addColorStop(0.48, '#9c9278');
  g.addColorStop(0.76, '#4f4a37');
  g.addColorStop(1, '#1d1a13');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const capH = 56 * s, baseH = 44 * s;
  const cap = ctx.createLinearGradient(0, 0, 0, capH);
  cap.addColorStop(0, '#9c9278'); cap.addColorStop(1, '#544d3c');
  ctx.fillStyle = cap;
  ctx.fillRect(-0.12 * w, 0, 1.24 * w, capH);
  const base = ctx.createLinearGradient(0, h - baseH, 0, h);
  base.addColorStop(0, '#7a7160'); base.addColorStop(1, '#443f2f');
  ctx.fillStyle = base;
  ctx.fillRect(-0.12 * w, h - baseH, 1.24 * w, baseH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, capH, w, h - capH - baseH);
  ctx.clip();
  pinstripe(ctx, w, h, s, 42, 6, '#000000', 0.42);
  ctx.restore();
}

function buildColumn(p) {
  const box = propBoxCenter(p);
  const key = `column|${box.w}x${box.h}`;
  const tex = paintedTexture(key, box.w, box.h, paintColumn);
  const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  return { objects: [billboard(box.x, box.y, box.z, box.w, box.h, material)] };
}

function paintMonolith(ctx, w, h, s, pal) {
  const g = ctx.createLinearGradient(0, 0, w, h * 0.4);
  g.addColorStop(0, '#0d0a16');
  g.addColorStop(0.4, '#2c2447');
  g.addColorStop(1, '#0f0c1a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const accent = pal.accent || '#eec46a';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(accent, 0.14);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  ctx.strokeStyle = rgba(accent, 0.5);
  ctx.lineWidth = 3 * s;
  ctx.strokeRect(1.5 * s, 1.5 * s, w - 3 * s, h - 3 * s);
}

function buildMonolith(p, pal) {
  const box = propBoxCenter(p);
  const key = `monolith|${pal.accent}|${box.w}x${box.h}`;
  const tex = paintedTexture(key, box.w, box.h, (ctx, w, h, s) => paintMonolith(ctx, w, h, s, pal));
  const material = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.4, metalness: 0.1,
    emissive: new THREE.Color(pal.accent || '#eec46a'), emissiveIntensity: 0.12,
  });
  return { objects: [billboard(box.x, box.y, box.z, box.w, box.h, material)] };
}

/* ── orrery: concentric rings + a glowing core, box-fill billboard ── */

function paintOrrery(ctx, w, h, s, pal) {
  ctx.clearRect(0, 0, w, h);
  const accent = pal.accent || '#eec46a', glow = pal.glow || '#ffc978';
  const cx = w / 2, cy = h / 2;
  ctx.save();
  ctx.strokeStyle = rgba(accent, 0.55);
  ctx.lineWidth = 2.4 * s;
  ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.48, h * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = rgba(glow, 0.5);
  ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.36, h * 0.30, Math.PI / 10, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = rgba(accent, 0.45);
  ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.24, h * 0.40, -Math.PI / 8, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.14);
  core.addColorStop(0, '#fff6dd');
  core.addColorStop(0.5, glow);
  core.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, w, h);
}

function buildOrrery(p, pal) {
  const box = propBoxCenter(p);
  const key = `orrery|${pal.accent}|${pal.glow}|${box.w}x${box.h}`;
  const tex = paintedTexture(key, box.w, box.h, (ctx, w, h, s) => paintOrrery(ctx, w, h, s, pal));
  const material = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, roughness: 0.5,
    emissive: new THREE.Color(pal.glow || '#ffc978'), emissiveIntensity: 0.2,
    side: THREE.DoubleSide,
  });
  return { objects: [billboard(box.x, box.y, box.z, box.w, box.h, material)] };
}

/* ── dispatch (mirrors scene.js's buildProp() switch exactly) ──── */

function buildOneProp(p, pal, room) {
  switch (p.t) {
    case 'lamp': return buildLamp(p, pal);
    case 'window': return buildWindow(p, pal, room);
    case 'hearth': return buildHearth(p, pal, room);
    case 'blinds': return buildBlinds(p, pal, room);
    case 'rug': return buildRug(p, pal);
    case 'skylight': return buildSkylight(p, pal);
    case 'trunk': return buildTrunk(p, pal);
    case 'column': return buildColumn(p, pal);
    case 'monolith': return buildMonolith(p, pal);
    case 'orrery': return buildOrrery(p, pal);
    case 'art': return buildArt(p, pal, room);
    default: return null; // matches scene.js's `default: return null`
  }
}

/**
 * Build every prop in one room.
 * @param {object} room  a src/js/data/rooms.js entry (needs `.props`, `.pal`)
 * @returns {{ group: THREE.Group, ready: Promise<void>, update: (elapsedSec:number) => void }}
 *   `ready` resolves once every 'art' prop's SVG texture has decoded
 *   (or failed) -- the settle condition Playwright should poll for,
 *   the same spirit as stage.js's `canvas.dataset.frame`. `update()`
 *   drives the cat's `breathe` pulse (and nothing else yet); call it
 *   from the render loop with a running elapsed-seconds clock.
 */
export function buildRoomProps(room) {
  const group = new THREE.Group();
  group.name = `props:${room.id || 'room'}`;
  const pal = room.pal || {};
  const pending = [];
  const breathing = [];

  for (const p of room.props || []) {
    const built = buildOneProp(p, pal, room);
    if (!built) continue;
    for (const obj of built.objects) group.add(obj);
    if (built.pending) pending.push(built.pending);
    if (built.breathe) breathing.push(built.breathe);
  }

  const ready = Promise.all(pending).then(() => {});

  function update(elapsedSec) {
    for (const fn of breathing) fn(elapsedSec);
  }

  return { group, ready, update };
}

export function clearPropTextureCache() {
  artCache.clear();
  paintCache.clear();
  sharedShadowTexture = null;
  sharedShadeTexture = null;
  beamCache.clear();
}
