/* ============================================================
   Building a room.

   Everything is plain DOM with CSS 3D transforms — no canvas for
   the geometry, so books stay real focusable buttons and the
   whole shop works with a keyboard and a screen reader.

   World box: x −840…840, y −470 (ceiling)…470 (floor),
   z −1200 (back wall)…0 (where you are standing).

   Passages and set dressing are placed by slot rather than by
   hand, so a room can never put a fireplace behind a door.
   ============================================================ */

import { spineStyle, shelfSize, fillerStyle, spineRun, hash } from './covers.js';
import { artURI } from './data/props.js';

const WORLD = { w: 1680, h: 940, d: 1200, hw: 840, hh: 470 };

const el = (tag, cls, css) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (css) n.style.cssText = css;
  return n;
};
const px = (n) => `${Math.round(n)}px`;
const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── geometry constants ───────────────────────────────────── */

const CASE_W = 1180;
const CASE_D = 200;
const ROW_H = 236;
const BOARD = 16;

const DOOR_W = 240;
const DOOR_H = 470;

/* side walls: door bays, near to far */
const BAY = [
  { l: -300, r: -540 },
  { l: -580, r: -820 },
  { l: -860, r: -1100 },
];

/* ── props ────────────────────────────────────────────────── */

const SLOT = {
  hang:      (w, h) => ({ x: -w / 2 - 30, y: -470, z: -640 }),
  'hang-l':  (w) => ({ x: -420 - w / 2, y: -470, z: -520 }),
  'hang-r':  (w) => ({ x: 380 - w / 2, y: -470, z: -800 }),
  above:     (w) => ({ x: -w / 2, y: -456, z: -1186 }),
  'back-l':  (w, h) => ({ x: -836, y: WORLD.hh - h - 40, z: -1186 }),
  'back-r':  (w, h) => ({ x: 836 - w, y: WORLD.hh - h - 40, z: -1186 }),
  'back-l-hi': (w) => ({ x: -826, y: -436, z: -1186 }),
  'back-r-hi': (w) => ({ x: 826 - w, y: -436, z: -1186 }),
  'floor-l':  (w, h) => ({ x: -790, y: WORLD.hh - h, z: -430 }),
  'floor-r':  (w, h) => ({ x: 790 - w, y: WORLD.hh - h, z: -430 }),
  'floor-ml': (w, h) => ({ x: -716, y: WORLD.hh - h, z: -720 }),
  'floor-mr': (w, h) => ({ x: 716 - w, y: WORLD.hh - h, z: -720 }),
  'floor-c':  (w, h) => ({ x: -w / 2 + 190, y: WORLD.hh - h, z: -260 }),
  'floor-cl': (w, h) => ({ x: -w / 2 - 210, y: WORLD.hh - h, z: -260 }),
  'tall-l':   () => ({ x: -846, y: -470, z: -860 }),
  'tall-r':   (w) => ({ x: 846 - w, y: -470, z: -860 }),
  ceil:       (w) => ({ x: -w / 2, y: -190, z: -830 }),
  rug:        (w) => ({ x: -w / 2, y: WORLD.hh, z: -560 }),
};

function place(p) {
  const f = SLOT[p.at] || SLOT['floor-ml'];
  const c = f(p.w || 200, p.h || 200);
  return { x: c.x + (p.dx || 0), y: c.y + (p.dy || 0), z: c.z + (p.dz || 0) };
}

/* Anything standing on the floor gets a contact shadow and is dimmed with
   depth — without those two cues a flat SVG reads as a sticker on the glass
   rather than a thing in the room. */
const GROUNDED = /^(floor|tall)/;

function groundStyle(p, c) {
  if (!GROUNDED.test(p.at || '')) return '';
  /* -1200 is the back wall, 0 is where you are standing */
  const depth = Math.min(1, Math.max(0, -c.z / 1200));
  const dim = (1 - depth * 0.34).toFixed(2);
  return `--lift:${(0.72 - depth * 0.3).toFixed(2)}; --art-filter: brightness(${dim});`;
}

function buildProp(p) {
  const c = place(p);
  const base = `transform: translate3d(${px(c.x)}, ${px(c.y)}, ${px(c.z)});`;

  switch (p.t) {
    case 'lamp': {
      const n = el('div', 'prop prop-lamp', `${base} --pw:${px(p.w)}; --ph:${px(p.h)}; --cord:${px(p.cord || 150)}; --beam:${px(p.beam || 460)}; width:${px(p.w)}; height:${px(p.h)};`);
      if (p.green) n.style.setProperty('--glow', '#8fe4bc');
      n.innerHTML = `<div class="flex-cord"></div><div class="shade"></div><div class="bulb"></div><div class="beam"></div>`;
      return n;
    }
    case 'window': {
      const n = el('div', 'prop prop-window', `${base} width:${px(p.w)}; height:${px(p.h)}; --sky-1:${p.sky1}; --sky-2:${p.sky2};`);
      const weather = p.weather === false ? ''
        : p.snow
          ? `<div class="weather" style="animation-duration:7s;background-image:radial-gradient(2.4px 2.4px at 20% 30%,#fff,transparent),radial-gradient(2px 2px at 68% 62%,#fff,transparent),radial-gradient(1.6px 1.6px at 42% 82%,#fff,transparent),radial-gradient(2.2px 2.2px at 84% 18%,#fff,transparent);background-size:120px 120px"></div>`
          : `<div class="weather"></div>`;
      n.innerHTML = `<div class="glass">${weather}</div><div class="bars"></div><div class="frame"></div>`;
      return n;
    }
    case 'hearth': {
      const n = el('div', 'prop prop-hearth', `${base} width:${px(p.w)}; height:${px(p.h)};`);
      n.innerHTML = `<div class="mouth"></div><div class="fire"></div><div class="mantel"></div>`;
      return n;
    }
    case 'blinds':
      return el('div', 'prop', `${base} width:${px(p.w)}; height:${px(p.h)};
        background: repeating-linear-gradient(180deg, rgba(255,250,235,.80) 0 7px, rgba(10,12,14,.92) 7px 20px), #0d1013;
        box-shadow: 0 0 120px 34px rgba(255,250,230,.20); border:12px solid var(--wood);`);

    case 'rug':
      return el('div', 'prop prop-rug', `--px:${px(c.x)}; --pz:${px(c.z)}; --pw:${px(p.w)}; --ph:${px(p.h)}; --rug-1:${p.c1}; --rug-2:${p.c2};`);

    case 'skylight': {
      const n = el('div', 'prop', `transform: translate3d(${px(c.x)}, ${px(c.y)}, ${px(c.z)}) rotateX(90deg); width:${px(p.w)}; height:${px(p.h)};
        background: linear-gradient(160deg, #cdd8f6, #5a659a 58%, #262b46);
        box-shadow: 0 0 180px 70px color-mix(in srgb, var(--glow) 46%, transparent);
        border: 14px solid var(--wood-dark);`);
      n.innerHTML = `<div style="position:absolute;inset:0;background:
        linear-gradient(90deg,transparent calc(33% - 4px),var(--wood-dark) calc(33% - 4px) calc(33% + 4px),transparent calc(33% + 4px)),
        linear-gradient(90deg,transparent calc(66% - 4px),var(--wood-dark) calc(66% - 4px) calc(66% + 4px),transparent calc(66% + 4px))"></div>`;
      return n;
    }
    case 'trunk': {
      const n = el('div', 'prop', `${base} width:${px(p.w)}; height:${px(p.h)};
        background: linear-gradient(90deg, #1d1409 0%, #533b24 24%, #7a5836 46%, #3a2812 78%, #191007 100%);
        box-shadow: 0 0 90px rgba(0,0,0,.55);`);
      n.innerHTML = `<div style="position:absolute;inset:0;opacity:.5;background:
        repeating-linear-gradient(92deg, transparent 0 12px, rgba(0,0,0,.5) 12px 17px, transparent 17px 34px)"></div>`;
      return n;
    }
    case 'column': {
      const n = el('div', 'prop', `${base} width:${px(p.w)}; height:${px(p.h)};
        background: linear-gradient(90deg, #221e16 0%, #7a7160 26%, #9c9278 48%, #4f4a37 76%, #1d1a13 100%);`);
      n.innerHTML =
        `<div style="position:absolute;left:-12%;top:0;width:124%;height:56px;background:linear-gradient(180deg,#9c9278,#544d3c)"></div>
         <div style="position:absolute;left:-12%;bottom:0;width:124%;height:44px;background:linear-gradient(180deg,#7a7160,#443f2f)"></div>
         <div style="position:absolute;inset:56px 0 44px;opacity:.45;background:repeating-linear-gradient(90deg,transparent 0 18px,rgba(0,0,0,.42) 18px 24px,transparent 24px 42px)"></div>`;
      return n;
    }
    case 'monolith':
      return el('div', 'prop', `${base} width:${px(p.w)}; height:${px(p.h)};
        background: linear-gradient(100deg,#0d0a16,#2c2447 40%,#0f0c1a);
        box-shadow: 0 0 110px 14px color-mix(in srgb, var(--accent) 34%, transparent), inset 0 0 70px rgba(190,168,255,.24);`);

    case 'orrery': {
      const n = el('div', 'prop', `${base} width:${px(p.w)}; height:${px(p.h)};`);
      n.innerHTML =
        `<div style="position:absolute;inset:0;border-radius:50%;border:3px solid var(--accent);opacity:.55;transform:rotateX(72deg)"></div>
         <div style="position:absolute;inset:16%;border-radius:50%;border:2px solid var(--glow);opacity:.5;transform:rotateX(64deg) rotateY(14deg)"></div>
         <div style="position:absolute;inset:32%;border-radius:50%;border:2px solid var(--accent);opacity:.45;transform:rotateX(78deg) rotateY(-20deg)"></div>
         <div style="position:absolute;left:50%;top:50%;width:52px;height:52px;translate:-50% -50%;border-radius:50%;
           background:radial-gradient(circle,#fff6dd,var(--glow) 48%,transparent 72%);box-shadow:0 0 110px 34px color-mix(in srgb,var(--glow) 50%,transparent)"></div>`;
      return n;
    }
    case 'art': {
      const n = el('div', 'prop prop-art', `${base} --pw:${px(p.w)}; --ph:${px(p.h)}; width:${px(p.w)}; height:${px(p.h)};
        --art:${artURI(p.a, ...propArgs(p))}; --art-op:${p.op ?? 1}; ${groundStyle(p, c)}`);
      if (p.breathe) n.classList.add('prop-cat');
      if (GROUNDED.test(p.at || '')) n.classList.add('prop--ground');
      return n;
    }
    default:
      return null;
  }
}

function propArgs(p) {
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

/* ── books ────────────────────────────────────────────────── */

const MAX_BOOK_H = 205;

export function buildBook(book, index) {
  const s = spineStyle(book);
  const g = shelfSize(book);
  const h = Math.min(g.h, MAX_BOOK_H);

  const b = el('button', 'bk');
  if (book.pick) b.classList.add('bk--pick');
  b.type = 'button';
  b.dataset.book = book.id;
  b.dataset.index = String(index);
  b.style.cssText =
    `--bt:${px(g.t)}; --bh:${px(h)}; --bd:${px(g.d)}; --btilt:${g.tilt}deg;` +
    `--sp-bg:${s.bg}; --sp-ink:${s.ink}; --sp-band:${s.band}; --sp-font:${s.font};` +
    `--cv-bg:${s.coverFlat}; --cv-bg2:${s.coverFlat2};` +
    `--sp-size:${g.t >= 34 ? 14 : g.t >= 26 ? 12 : 11}px;`;
  b.setAttribute('aria-label', `${book.title} by ${book.author}.${book.pick ? " The shopkeeper's pick." : ''} Take it off the shelf.`);

  b.innerHTML =
    `<span class="bk__f bk__spine">${g.t >= 19 ? `<span class="bk__title">${escapeHtml(shortTitle(book.title))}</span>` : ''}</span>` +
    `<span class="bk__f bk__front"></span>` +
    `<span class="bk__f bk__back"></span>` +
    `<span class="bk__f bk__edge"></span>` +
    `<span class="bk__f bk__top"></span>`;
  return b;
}

function shortTitle(t) {
  const clean = t.replace(/\s*[:;]\s.*$/, '');
  return clean.length > 34 ? clean.slice(0, 32).trim() + '…' : clean;
}

/* buildFiller() lived here until phase 9.

   Every room carried exactly 40 anonymous spines — 2,000 across the shop —
   because there were only 409 real books and a half-empty case looks broken.
   IMPLEMENTATION.md §7 asks for zero filler spines once the shelves are
   filled with harvested books, and that could never be reached by adding
   data alone: fillRow() padded to a fixed 20 per row and stopped, so more
   real books just meant a fuller row with the same 20 fillers still in it.

   So the generator is gone rather than tuned. A slot now holds a real book
   or it holds nothing. fillerStyle() itself stays in covers.js — the front
   table's stacks are still made of it, and those are décor on a table
   rather than spines on a shelf.  */

/* ── bookcases ────────────────────────────────────────────── */

function buildCase({ x, y, z, ry = 0, w, rows, cd = CASE_D }) {
  const ch = rows * (ROW_H + BOARD) + 26;
  const c = el('div', 'case', `--cw:${px(w)}; --ch:${px(ch)}; --cd:${px(cd)};
    transform: translate3d(${px(x)}, ${px(y - ch)}, ${px(z)})${ry ? ` rotateY(${ry}deg)` : ''};`);
  c.innerHTML =
    `<div class="case__panel case__back"></div>
     <div class="case__panel case__side case__side--l"></div>
     <div class="case__panel case__side case__side--r"></div>
     <div class="case__panel case__cap case__cap--top"></div>
     <div class="case__panel case__cap case__cap--bottom"></div>`;
  const shelves = [];
  for (let i = 0; i < rows; i++) {
    const row = el('div', 'case__row', `--rh:${px(ROW_H)}; --ry:${px(14 + i * (ROW_H + BOARD))};`);
    row.innerHTML = `<div class="case__board"></div>`;
    const shelf = el('div', 'shelf shelf--center');
    row.appendChild(shelf);
    c.appendChild(row);
    shelves.push(shelf);
  }
  return { node: c, shelves, height: ch };
}

function fillRow(shelf, books, startIndex) {
  books.forEach((b, i) => shelf.appendChild(buildBook(b, startIndex + i)));
}

/* A spine's own width in the units the row is laid out in: shelfSize()'s
   thickness, capped at its own 58 maximum, plus the 5px gutter. */
const bookWidth = (b) => Math.min(shelfSize(b).t, 58) + 5;
const runWidth = (books) => books.reduce((a, b) => a + bookWidth(b), 0);

/* Split a shelf across `rows` by the WIDTH each book takes, not by how many
   there are. Splitting by count was safe while every row was padded to a
   fixed 20 fillers and could never overflow; with real books it is not —
   a page count of 640 gives a 58px spine and one of 170 gives 15px, so an
   even count split can hand one row 1,575px of books to fit in 1,152 and
   spill them out of the case. Anything that still will not fit is left off
   rather than allowed to overflow, and buildRoom() reports it. */
function planRows(books, rows, innerW) {
  const target = runWidth(books) / rows;
  const out = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const slice = [];
    let used = 0;
    const last = r === rows - 1;
    while (i < books.length) {
      const w = bookWidth(books[i]);
      if (!last && slice.length && used + w > target) break;
      if (used + w > innerW) break;
      slice.push(books[i]);
      used += w;
      i++;
    }
    out.push(slice);
  }
  return { rows: out, left: books.length - i };
}

/* ── passages ─────────────────────────────────────────────── */

function doorSlots(n) {
  if (n <= 0) return [];
  if (n === 1) return ['r1'];
  const order = ['l1', 'r1', 'l2', 'r2', 'l3', 'r3'];
  return order.slice(0, Math.min(n, 6));
}

function doorTransform(slot) {
  const side = slot[0];
  const bay = BAY[Number(slot[1]) - 1];
  const y = WORLD.hh - DOOR_H;
  return side === 'l'
    ? `translate3d(-832px, ${px(y)}, ${px(bay.l)}) rotateY(90deg)`
    : `translate3d(832px, ${px(y)}, ${px(bay.r)}) rotateY(-90deg)`;
}

/* The name of the room beyond, on a bracket sign over the doorway.

   The doorway lies in the side wall, so anything drawn in that plane is seen
   at about 20° and is unreadable. A real shop hangs its sign out into the
   room on a bracket; rotating the sign back out of the wall does the same
   thing here, and the name ends up facing you, above its own door, in
   perspective. It takes no pointer events — it is signage, not a button. */
function doorSign(room, side) {
  return (
    `<span class="dsign dsign--${side}" aria-hidden="true">` +
      `<span class="dsign__arm"></span>` +
      `<span class="dsign__board">` +
        `<span class="dsign__n">${escapeHtml(room.name)}</span>` +
        `<span class="dsign__s">${escapeHtml(room.sub || 'further in')} · ${room.total}</span>` +
      `</span>` +
    `</span>`
  );
}

function buildDoor(room, slot) {
  const side = slot[0];
  const a = el('button', `door3d door3d--${side}`);
  a.type = 'button';
  a.dataset.go = room.id;
  a.dataset.bay = slot[1];
  a.style.cssText = `--dw:${px(DOOR_W)}; --dh:${px(DOOR_H)}; transform: ${doorTransform(slot)}; width:${px(DOOR_W)}; height:${px(DOOR_H)};`;
  if (room.pal && room.pal['door-glow']) a.style.setProperty('--door-glow', room.pal['door-glow']);
  a.setAttribute('aria-label', `Go through to ${room.name}${room.sub ? ' — ' + room.sub : ''}`);
  a.innerHTML =
    `<span class="door3d__frame"><span class="door3d__void"><span class="door3d__step"></span></span></span>` +
    `<span class="door3d__spill"></span>` +
    doorSign(room, side);
  return a;
}

/* A display table that is also a way through — the front table.

   The button box is the table's front apron: it stands at the near edge,
   from the floor up to the underside of the top. Everything else is built
   backwards from there, so the top recedes away from you (rotateX(-90deg))
   instead of jutting out past the front of the room, and the stacks stand
   on the surface rather than floating behind it. */
const TABLE = { w: 470, h: 232, d: 300, z: -330 };

function buildTablePortal(room) {
  const { w, h, d, z } = TABLE;
  const g = el('button', 'door3d table3d',
    `transform: translate3d(${px(-w / 2 - 300)}, ${px(WORLD.hh - h)}, ${px(z)});
     width:${px(w)}; height:${px(h)}; --tw:${px(w)}; --th:${px(h)}; --td:${px(d)};`);
  g.type = 'button';
  g.dataset.go = room.id;
  g.setAttribute('aria-label', `Go to ${room.name}${room.sub ? ' — ' + room.sub : ''}`);

  const seed = hash(room.id);
  const hue = room.pal?.hue ?? 30;
  let stacks = '';
  for (let i = 0; i < 4; i++) {
    const f = fillerStyle(seed + i * 131, hue);
    const n = 2 + (i % 3);
    /* across the top and back from the front edge, so they sit on the wood */
    const sx = 26 + i * 108 + (i % 2) * 14;
    const sz = 70 + (i % 3) * 62;
    const sw = 96 + (i % 3) * 22;
    stacks +=
      `<span class="tstack" style="--sx:${px(sx)}; --sz:${px(sz)}; --sw:${px(sw)}; --sh:${px(n * 17)}; --sd:${px(sw * 0.68)}; --bg:${f.base}">` +
        `<span class="tstack__top"></span><span class="tstack__side"></span>` +
      `</span>`;
  }

  g.innerHTML =
    `<span class="table3d__top"></span>` +
    `<span class="table3d__apron"></span>` +
    `<span class="table3d__leg" style="--lx:14px; --lz:0"></span>` +
    `<span class="table3d__leg" style="--lx:${px(w - 34)}; --lz:0"></span>` +
    `<span class="table3d__leg" style="--lx:14px; --lz:${px(-d + 34)}"></span>` +
    `<span class="table3d__leg" style="--lx:${px(w - 34)}; --lz:${px(-d + 34)}"></span>` +
    `<span class="table3d__books">${stacks}</span>` +
    doorSign(room, 't');
  return g;
}

/* ── the room ─────────────────────────────────────────────── */

export function buildRoom(room, books) {
  const travel = el('div', 'travel');
  const pivot = el('div', 'pivot');
  const world = el('div', 'world');

  travel.classList.add(room.kind || 'k-panel');
  if (room.low) travel.classList.add('low');
  if (room.pal) {
    for (const [k, v] of Object.entries(room.pal)) {
      if (k === 'hue' || k === 'sat') continue;
      travel.style.setProperty(`--${k}`, v);
    }
  }

  for (const f of ['f-back', 'f-floor', 'f-ceiling', 'f-left', 'f-right']) {
    world.appendChild(el('div', `face ${f}`));
  }

  const hue = room.pal?.hue ?? 30;
  const seedBase = hash(room.id);

  /* ── main case on the back wall ──
     Row count is driven by how much shelf the books actually need, not by
     their number. The old rule (`ceil(n/9)`, clamped 2..3) was tuned when a
     room held eight real books and forty fillers; with ~50 harvested books
     it grew a third row and made the case LOOK emptier — 3 rows at 51%
     against 2 rows at 76%. Still clamped to 2..3: two rows is the measured
     shape of every case in the shop (IMPLEMENTATION.md §4.6) and three is
     as tall as the wall allows. */
  const innerW = CASE_W - 40;
  const rows = Math.min(3, Math.max(2, Math.ceil(runWidth(books) / (innerW * 0.92))));
  const main = buildCase({ x: -CASE_W / 2, y: WORLD.hh, z: -1160, w: CASE_W, rows });
  const plan = planRows(books, rows, innerW);
  let index = 0;
  for (let i = 0; i < rows; i++) {
    fillRow(main.shelves[i], plan.rows[i], index);
    index += plan.rows[i].length;
  }
  if (plan.left) console.warn(`${room.id}: ${plan.left} books do not fit the case`);
  world.appendChild(main.node);

  /* ── passages, and side cases in whatever wall is left over ── */
  const kids = (room.children || []).filter((k) => !k.viaTable);
  const tableKid = (room.children || []).find((k) => k.viaTable);
  const slots = doorSlots(kids.length);
  kids.forEach((k, i) => { if (slots[i]) world.appendChild(buildDoor(k, slots[i])); });
  if (tableKid) world.appendChild(buildTablePortal(tableKid));

  /* a trunk, column or monolith already occupies that wall */
  const tall = new Set((room.props || [])
    .filter((p) => p.t === 'trunk' || p.t === 'column' || p.t === 'monolith')
    .map((p) => (p.at === 'tall-l' ? 'l' : p.at === 'tall-r' ? 'r' : '')));

  const usedL = slots.filter((s) => s[0] === 'l').length;
  const usedR = slots.filter((s) => s[0] === 'r').length;
  if (!tall.has('l')) addSideCase(world, 'l', usedL, hue, seedBase + 5101);
  if (!tall.has('r')) addSideCase(world, 'r', usedR, hue, seedBase + 7307);

  /* ── set dressing ── */
  for (const p of room.props || []) {
    const node = buildProp(p);
    if (node) world.appendChild(node);
  }

  pivot.appendChild(world);
  travel.appendChild(pivot);
  return { travel, pivot, world };
}

/* the wall a door isn't using gets shelves, so no room looks bare */
function addSideCase(world, side, doorsUsed, hue, seed) {
  const near = -420;              /* nothing sits closer than this */
  const far = -1190;
  let z0, w;
  if (doorsUsed === 0) { z0 = near; w = Math.abs(far - near); }
  else if (doorsUsed === 1) { z0 = BAY[0].r; w = Math.abs(far - BAY[0].r); }
  else if (doorsUsed === 2) { z0 = BAY[1].r; w = Math.abs(far - BAY[1].r); }
  else return;
  w = Math.min(w, 640);           /* long runs cost a lot of nodes for little effect */
  if (w < 260) return;

  const c = side === 'l'
    ? buildCase({ x: -832, y: WORLD.hh, z: z0, ry: 90, w, rows: 2, cd: 170 })
    : buildCase({ x: 832, y: WORLD.hh, z: z0 - w, ry: -90, w, rows: 2, cd: 170 });
  c.node.classList.add('case--side');
  /* painted, not built: see spineRun() — edge-on 3D books collapse to
     1–3px slivers here and read as scratches on the wall */
  c.shelves.forEach((sh, i) => {
    sh.classList.add('shelf--painted');
    sh.style.background = spineRun(seed + i * 313, hue, w - 40);
  });
  world.appendChild(c.node);
}

export { WORLD };
