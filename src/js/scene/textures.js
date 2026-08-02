/* ============================================================
   Wall-treatment textures.

   themes.css draws each room's `kind` (k-panel, k-glass, k-void, ...)
   as CSS gradients and small SVG data-URIs on the five .face divs.
   Per IMPLEMENTATION.md §4.4 those port as textures, not re-invented
   geometry: each kind's recipe is translated to canvas2d drawing
   calls, once, and the canvas is cached and reused as a material map.

   Faithful note: three of five faces (both side walls, the ceiling)
   never actually rendered in the CSS build — see PLAN-ARCH.md
   "Finding A" — so there is no screenshot to match for e.g. k-panel
   on a side wall. What follows is a direct translation of each kind's
   CSS recipe (same colours, same repeat periods, same layer order),
   applied uniformly to whichever face asks for it. Intent, not a
   pixel-match.
   ============================================================ */

import * as THREE from 'three';

const cache = new Map();

function hex(c) {
  if (!c) return [0, 0, 0];
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (c, a = 1) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };
/* color-mix(in srgb, A p%, B) */
function mix(a, b, p) {
  const [ar, ag, ab] = hex(a), [br, bg, bb] = hex(b);
  const t = p / 100;
  const r = Math.round(ar * t + br * (1 - t));
  const g = Math.round(ag * t + bg * (1 - t));
  const bl = Math.round(ab * t + bb * (1 - t));
  return `rgb(${r},${g},${bl})`;
}
const BLACK = '#000000', WHITE = '#ffffff';

/* ── small generic pattern drawers, each period given in CSS px and
   scaled to canvas px by `s` ──────────────────────────────────── */

function pinstripe(ctx, w, h, s, period, lineW, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const p = period * s, lw = Math.max(1, lineW * s);
  for (let x = 0; x < w + p; x += p) ctx.fillRect(x, 0, lw, h);
  ctx.restore();
}

function grid(ctx, w, h, s, tileW, tileH, color, alpha, lineW = 2) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, lineW * s);
  const tw = tileW * s, th = tileH * s;
  for (let y = 0; y <= h + th; y += th) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  for (let x = 0; x <= w + tw; x += tw) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  ctx.restore();
}

/* running-bond block grid (stone / brick): each row offset by half a tile */
function brickGrid(ctx, w, h, s, tileW, tileH, color, alpha, lineW) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, lineW * s);
  const tw = tileW * s, th = tileH * s;
  for (let y = -th; y <= h + th; y += th) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  let row = 0;
  for (let y = -th; y <= h + th; y += th, row++) {
    const off = (row % 2) ? tw / 2 : 0;
    for (let x = -tw + off; x <= w + tw; x += tw) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + th); ctx.stroke();
    }
  }
  ctx.restore();
}

function dots(ctx, w, h, s, tileW, tileH, positions, color, alpha, r) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const tw = tileW * s, th = tileH * s, rr = r * s;
  for (let y = -th; y < h + th; y += th) {
    for (let x = -tw; x < w + tw; x += tw) {
      for (const [px, py] of positions) {
        ctx.beginPath();
        ctx.arc(x + px * tw, y + py * th, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function rivetPlates(ctx, w, h, s, color, alpha) {
  ctx.save();
  const tile = 120 * s;
  for (let y = 0; y < h + tile; y += tile) {
    for (let x = 0; x < w + tile; x += tile) {
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = 2 * s;
      ctx.strokeRect(x + 2 * s, y + 2 * s, tile - 4 * s, tile - 4 * s);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      for (const [cx, cy] of [[12, 12], [108, 12], [12, 108], [108, 108]]) {
        ctx.beginPath(); ctx.arc(x + cx * s, y + cy * s, 3.4 * s, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}

function diagHatch(ctx, w, h, s, period, color, alpha, lineW) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, lineW * s);
  const p = period * s;
  const diag = w + h;
  for (let o = -diag; o < diag; o += p) {
    ctx.beginPath(); ctx.moveTo(o, 0); ctx.lineTo(o + h, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(o, h); ctx.lineTo(o + h, 0); ctx.stroke();
  }
  ctx.restore();
}

function ripples(ctx, w, h, s, period, band, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const p = period * s, b = band * s;
  for (let y = 0; y < h + p; y += p) ctx.fillRect(0, y, w, b);
  ctx.restore();
}

function leafMotif(ctx, w, h, s, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4 * s;
  const tw = 120 * s, th = 150 * s;
  for (let y = -th; y < h + th; y += th) {
    for (let x = -tw; x < w + tw; x += tw) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5 * tw, y + 0.05 * th);
      ctx.quadraticCurveTo(x + 0.63 * tw, y + 0.24 * th, x + 0.63 * tw, y + 0.34 * th);
      ctx.quadraticCurveTo(x + 0.63 * tw, y + 0.5 * th, x + 0.5 * tw, y + 0.5 * th);
      ctx.quadraticCurveTo(x + 0.37 * tw, y + 0.5 * th, x + 0.37 * tw, y + 0.34 * th);
      ctx.quadraticCurveTo(x + 0.37 * tw, y + 0.24 * th, x + 0.5 * tw, y + 0.05 * th);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 0.5 * tw, y + 0.5 * th); ctx.lineTo(x + 0.5 * tw, y + 0.81 * th); ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y + 0.5 * th, 6 * s, 0, Math.PI * 2);
      ctx.arc(x + tw, y + 0.5 * th, 6 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function trunkBands(ctx, w, h, s) {
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.34);
  grad.addColorStop(0, rgba(BLACK, .55));
  grad.addColorStop(1, rgba(BLACK, 0));
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h * 0.34);
  ctx.restore();
  pinstripe(ctx, w, h, s, 236, 30, BLACK, .46);
  pinstripe(ctx, w, h, s, 410, 46, BLACK, .28);
}

/* ── the wall-art pattern layer, per kind (used on back/left/right) ── */
function paintPattern(ctx, kind, w, h, s, pal) {
  switch (kind) {
    case 'k-panel':
      pinstripe(ctx, w, h, s, 246, 6, BLACK, .30);
      pinstripe(ctx, w, h, s, 246, 4, WHITE, .045);
      break;
    case 'k-plaster':
      // handled mostly by the picture rail below; a faint corner wash
      { const g = ctx.createRadialGradient(w * .2, h * .1, 0, w * .2, h * .1, w * .9);
        g.addColorStop(0, rgba(WHITE, .05)); g.addColorStop(1, rgba(WHITE, 0));
        ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore(); }
      break;
    case 'k-paper':
      leafMotif(ctx, w, h, s, WHITE, .16);
      break;
    case 'k-stone':
      brickGrid(ctx, w, h, s, 120, 60, BLACK, .42, 3);
      break;
    case 'k-brick':
      brickGrid(ctx, w, h, s, 80, 40, BLACK, .5, 3);
      break;
    case 'k-timber':
      pinstripe(ctx, w, h, s, 400, 32, BLACK, .42);
      break;
    case 'k-metal':
      rivetPlates(ctx, w, h, s, rgba(WHITE, .10), .10);
      break;
    case 'k-void':
      dots(ctx, w, h, s, 420, 420, [
        [.20, .30], [.68, .18], [.44, .62], [.82, .74],
        [.12, .82], [.92, .38], [.33, .08], [.57, .90],
      ], WHITE, .9, 1.4);
      break;
    case 'k-forest':
      trunkBands(ctx, w, h, s);
      break;
    case 'k-tile':
      grid(ctx, w, h, s, 96, 96, WHITE, .09, 2);
      break;
    case 'k-ink':
      dots(ctx, w, h, s, 24, 24, [[.25, .25], [.75, .75]], BLACK, .34, 3);
      break;
    case 'k-ice':
      diagHatch(ctx, w, h, s, 110, WHITE, .14, 2);
      break;
    case 'k-water':
      ripples(ctx, w, h, s, 62, 4, rgba('#b4e1ff', .10), 1);
      break;
    default:
      break;
  }
}

/* ── the generic wash under the pattern (back/left/right, most kinds) ──
   Mirrors themes.css's base .f-back/.f-left/.f-right layer stack:
   linear wash (dark top/bottom, `wall` at centre) + wall-lit corner glow
   + a glow-colour highlight, painted bottom layer first. */
function paintGenericWall(ctx, w, h, pal, biasX) {
  const wall = pal.wall || '#402c20';
  const wallLit = pal['wall-lit'] || wall;
  const glow = pal.glow || '#ffc978';

  const lin = ctx.createLinearGradient(0, 0, 0, h);
  lin.addColorStop(0, mix(wall, BLACK, 84));
  lin.addColorStop(0.46, wall);
  lin.addColorStop(1, mix(wall, BLACK, 90));
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, w, h);

  const litCx = w * biasX, litCy = h * 0.64;
  const lit = ctx.createRadialGradient(litCx, litCy, 0, litCx, litCy, Math.max(w, h) * 0.72);
  lit.addColorStop(0, rgba(wallLit, .55));
  lit.addColorStop(1, rgba(wallLit, 0));
  ctx.fillStyle = lit;
  ctx.fillRect(0, 0, w, h);

  const gl = ctx.createRadialGradient(w * 0.5, h * 0.72, 0, w * 0.5, h * 0.72, Math.max(w, h) * 0.6);
  gl.addColorStop(0, rgba(glow, .22));
  gl.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, w, h);
}

/* wainscot band (k-panel) — bottom 200px, above the 46px skirting */
function paintWainscot(ctx, w, h, s, pal) {
  const bandH = 200 * s, y0 = h - (246 * s);
  const wood = pal.wood || '#7d5539', woodDark = pal['wood-dark'] || '#452c1d', woodLit = pal['wood-lit'] || wood;
  const g = ctx.createLinearGradient(0, y0, 0, y0 + bandH);
  g.addColorStop(0, wood);
  g.addColorStop(1, woodDark);
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, w, bandH);
  ctx.save();
  ctx.translate(0, y0);
  pinstripe(ctx, w, bandH, s, 150, 12, BLACK, .22);
  ctx.restore();
  ctx.fillStyle = woodLit;
  ctx.fillRect(0, y0, w, 5 * s);
}

/* picture rail (k-plaster) — a thin lit/dark line ~120px from the top */
function paintPictureRail(ctx, w, h, s, pal) {
  const y = 120 * s, th = 12 * s;
  const g = ctx.createLinearGradient(0, y, 0, y + th);
  g.addColorStop(0, pal['wood-lit'] || '#ac7a52');
  g.addColorStop(1, pal['wood-dark'] || '#452c1d');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, w, th);
}

/* skirting board — bottom 46px, every back/left/right face */
function paintSkirting(ctx, w, h, s, pal) {
  const bandH = 46 * s, y0 = h - bandH;
  const g = ctx.createLinearGradient(0, y0, 0, h);
  g.addColorStop(0, pal['wood-lit'] || '#ac7a52');
  g.addColorStop(0.4, pal.wood || '#7d5539');
  g.addColorStop(1, pal['wood-dark'] || '#452c1d');
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, w, bandH);
}

/* k-glass: the wall gives onto weather. Sky gradient + iron mullions. */
function paintGlassWall(ctx, w, h, s, pal) {
  const sky1 = pal['sky-1'] || '#7d9aa8', sky2 = pal['sky-2'] || '#2f4038', wall = pal.wall || '#3f5442';
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, sky1);
  g.addColorStop(0.62, sky2);
  g.addColorStop(1, wall);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // iron mullions: a cross plus a border, tiled 150x190 like the SVG
  ctx.save();
  ctx.strokeStyle = rgba(BLACK, .55);
  ctx.lineWidth = 7 * s;
  const tw = 150 * s, th = 190 * s;
  for (let y = 0; y < h + th; y += th) {
    for (let x = 0; x < w + tw; x += tw) {
      ctx.strokeRect(x, y, tw, th);
      ctx.beginPath(); ctx.moveTo(x, y + th / 2); ctx.lineTo(x + tw, y + th / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + tw / 2, y); ctx.lineTo(x + tw / 2, y + th); ctx.stroke();
    }
  }
  ctx.restore();
}

/* k-void back wall: the wall gives out onto space entirely. */
function paintVoidBack(ctx, w, h, s, pal) {
  const wall = pal.wall || '#0d1020', accent = pal.accent || '#eec46a';
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#070a14');
  base.addColorStop(0.6, '#0d1020');
  base.addColorStop(1, wall);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const neb = ctx.createRadialGradient(w * .5, h * .4, 0, w * .5, h * .4, Math.max(w, h) * 0.6);
  neb.addColorStop(0, rgba(accent, .26));
  neb.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, w, h);
  paintPattern(ctx, 'k-void', w, h, s, pal);
}

/* ── ceiling: default treatment, plus k-timber / k-glass overrides ── */
function paintCeiling(ctx, w, h, s, kind, pal) {
  const ceiling = pal.ceiling || '#2a2018', wallLit = pal['wall-lit'] || ceiling, glow = pal.glow || '#ffc978';

  if (kind === 'k-glass') {
    const sky1 = pal['sky-1'] || '#7d9aa8';
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.78);
    g.addColorStop(0, rgba(sky1, .7));
    g.addColorStop(1, rgba(sky1, 0));
    ctx.fillStyle = ceiling; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h * 0.78);
    pinstripe(ctx, w, h, s, 140, 12, BLACK, .5);
    return;
  }

  const lin = ctx.createLinearGradient(0, h, 0, 0);
  lin.addColorStop(0, mix(ceiling, wallLit, 52));
  lin.addColorStop(0.62, ceiling);
  lin.addColorStop(1, ceiling);
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, w, h);

  const gl = ctx.createRadialGradient(w * .5, h * .22, 0, w * .5, h * .22, Math.max(w, h) * .6);
  gl.addColorStop(0, rgba(glow, .46));
  gl.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, w, h);

  if (kind === 'k-timber') {
    pinstripe(ctx, w, h, s, 186, 36, mix(ceiling, WHITE, 92), 1);
  } else {
    pinstripe(ctx, w, h, s, 214, 14, mix(ceiling, WHITE, 92), .5);
  }
}

/* ── floor: one generic treatment, every kind (matches themes.css —
   .f-floor is never overridden by a .k-* rule) ── */
function paintFloor(ctx, w, h, s, pal) {
  const floor = pal.floor || '#4a3020', floorLit = pal['floor-lit'] || floor, glow = pal.glow || '#ffc978';
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, w, h);
  pinstripe(ctx, w, h, s, 82, 4, mix(floor, BLACK, 86), 1);

  const lit = ctx.createRadialGradient(w * .5, h * .3, 0, w * .5, h * .3, Math.max(w, h) * .8);
  lit.addColorStop(0, rgba(floorLit, .55));
  lit.addColorStop(1, rgba(floorLit, 0));
  ctx.fillStyle = lit;
  ctx.fillRect(0, 0, w, h);

  const gl = ctx.createRadialGradient(w * .5, h * .34, 0, w * .5, h * .34, Math.max(w, h) * .74);
  gl.addColorStop(0, rgba(glow, .3));
  gl.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, w, h);
}

/* ── entry point ──────────────────────────────────────────────── */

function keyFor(kind, face, pal, wPx, hPx) {
  return [kind, face, wPx, hPx, pal.wall, pal['wall-lit'], pal.floor, pal['floor-lit'],
    pal.ceiling, pal.wood, pal['wood-lit'], pal['wood-dark'], pal.glow, pal.accent,
    pal['sky-1'], pal['sky-2']].join('|');
}

/**
 * Bake (or fetch cached) a THREE.CanvasTexture for one face of one room.
 * @param {string} kind      room.kind, e.g. 'k-panel'
 * @param {object} pal       room.pal
 * @param {'back'|'left'|'right'|'ceiling'|'floor'} face
 * @param {{w:number,h:number}} sizeWorld  face size in world units
 * @param {number} scale     canvas px per world unit
 */
export function wallTexture(kind, pal, face, sizeWorld, scale = 0.75) {
  const wPx = Math.max(2, Math.round(sizeWorld.w * scale));
  const hPx = Math.max(2, Math.round(sizeWorld.h * scale));
  const k = keyFor(kind, face, pal, wPx, hPx);
  if (cache.has(k)) return cache.get(k);

  const canvas = document.createElement('canvas');
  canvas.width = wPx; canvas.height = hPx;
  const ctx = canvas.getContext('2d');

  if (face === 'floor') {
    paintFloor(ctx, wPx, hPx, scale, pal);
  } else if (face === 'ceiling') {
    paintCeiling(ctx, wPx, hPx, scale, kind, pal);
  } else if (kind === 'k-glass') {
    paintGlassWall(ctx, wPx, hPx, scale, pal);
  } else if (kind === 'k-void' && face === 'back') {
    paintVoidBack(ctx, wPx, hPx, scale, pal);
    paintSkirting(ctx, wPx, hPx, scale, pal);
  } else {
    const biasX = face === 'left' ? 0.7 : face === 'right' ? 0.3 : 0.5;
    paintGenericWall(ctx, wPx, hPx, pal, biasX);
    if (kind === 'k-panel') paintWainscot(ctx, wPx, hPx, scale, pal);
    if (kind === 'k-plaster') paintPictureRail(ctx, wPx, hPx, scale, pal);
    paintPattern(ctx, kind, wPx, hPx, scale, pal);
    paintSkirting(ctx, wPx, hPx, scale, pal);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  cache.set(k, tex);
  return tex;
}

export function clearTextureCache() {
  for (const tex of cache.values()) tex.dispose();
  cache.clear();
}
