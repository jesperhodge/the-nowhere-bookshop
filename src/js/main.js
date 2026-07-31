/* ============================================================
   The Nowhere Bookshop
   ============================================================ */

import { ROOMS, ROOM_BY_ID, pathTo, booksIn, search, surprise, STATS, BOOK_BY_ID, ALL_BOOKS } from './shop.js';
import { buildRoom } from './scene.js';
import { Ambience } from './ambience.js';
import { RoomTone } from './audio.js';
import { renderBook } from './views/book.js';
import { renderMap } from './views/map.js';
import { coverSVG } from './covers.js';
import { buyLink } from './links.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const dom = {
  door: $('#door'), enter: $('#enter'), doorCount: $('#doorCount'),
  shop: $('#shop'), stage: $('#stage'), fit: $('#fit'), room: $('#room'),
  crumbs: $('#crumbs'), placard: $('#placard'), dockDoors: $('#dockDoors'),
  back: $('#btnBack'), backLabel: $('#backLabel'), bell: $('#btnBell'),
  sheet: $('#sheet'), sheetBody: $('#sheetBody'),
  mapOverlay: $('#mapOverlay'), mapBody: $('#mapBody'),
  searchOverlay: $('#searchOverlay'), findInput: $('#findInput'), findResults: $('#findResults'),
  parcelOverlay: $('#parcelOverlay'), parcelBody: $('#parcelBody'), parcelCount: $('#parcelCount'),
  shelfOverlay: $('#shelfOverlay'), shelfBody: $('#shelfBody'),
  toast: $('#toast'), hint: $('#hint'), ambience: $('#ambience'), dlabels: $('#dlabels'),
};

const state = {
  room: null,
  book: null,
  parcel: loadParcel(),
  seen: loadSeen(),
  entered: false,
  tag: null,
};

const amb = new Ambience(dom.ambience);
const tone = new RoomTone();

/* ── persistence ──────────────────────────────────────────── */

function loadParcel() {
  try { return JSON.parse(localStorage.getItem('nowhere.parcel') || '[]'); } catch { return []; }
}
function saveParcel() {
  try { localStorage.setItem('nowhere.parcel', JSON.stringify(state.parcel)); } catch { /* private mode */ }
  dom.parcelCount.textContent = String(state.parcel.length);
  dom.parcelCount.hidden = state.parcel.length === 0;
}
function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem('nowhere.seen') || '[]')); } catch { return new Set(); }
}
function saveSeen() {
  try { localStorage.setItem('nowhere.seen', JSON.stringify([...state.seen].slice(-600))); } catch { /* ignore */ }
}

/* ── fit the world to the window ──────────────────────────── */

let fitK = 1;
let panMax = 0;

function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const whole = Math.min(vw / 1680, vh / 940);
  /* A phone cannot show the whole room and keep the spines big enough to
     read, so we crop in and let you drag along the shelf instead. */
  fitK = whole < 0.66 ? Math.max(whole, Math.min(0.78, (vh * 0.94) / 940)) : whole * 0.985;
  document.documentElement.style.setProperty('--fit', fitK.toFixed(4));
  panMax = Math.max(0, (1680 - vw / fitK) / 2 - 20);
  if (Math.abs(pan) > panMax) pan = Math.sign(pan) * panMax;
  applyPivot();
  amb.resize();
  placeLabels();
}

/* ── parallax ─────────────────────────────────────────────── */

let pivot = null;
let rafPending = false;
let target = { x: 0, y: 0 };
let pan = 0;

function applyPivot() {
  if (!pivot) return;
  const t = REDUCED ? { x: 0, y: 0 } : target;
  pivot.style.setProperty('--prx', `${(t.x * -4.6).toFixed(2)}deg`);
  pivot.style.setProperty('--pry', `${(t.y * 2.6).toFixed(2)}deg`);
  pivot.style.setProperty('--ptx', `${(t.x * -34 + pan).toFixed(1)}px`);
  pivot.style.setProperty('--pty', `${(t.y * -16).toFixed(1)}px`);
}

function onMove(e) {
  if (!pivot || REDUCED || e.pointerType === 'touch') return;
  target = {
    x: (e.clientX / window.innerWidth) * 2 - 1,
    y: (e.clientY / window.innerHeight) * 2 - 1,
  };
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    applyPivot();
    placeLabels();
  });
}

/* ── dragging along the shelf, when the room is wider than the screen ── */

let drag = null;

function onDragStart(e) {
  if (panMax <= 0 || e.button > 0) return;
  drag = { x: e.clientX, y: e.clientY, from: pan, moved: false, id: e.pointerId };
}
function onDragMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < 9 && Math.abs(e.clientY - drag.y) < 9) return;
  if (!drag.moved) {
    drag.moved = true;
    dom.stage.setPointerCapture?.(drag.id);
    dom.stage.classList.add('is-panning');
    pivot?.classList.add('is-tracking');
  }
  pan = Math.max(-panMax, Math.min(panMax, drag.from + dx / fitK));
  applyPivot();
  placeLabels();
  e.preventDefault();
}
function onDragEnd() {
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  dom.stage.classList.remove('is-panning');
  pivot?.classList.remove('is-tracking');
  if (moved) {
    /* swallow the click that follows a drag */
    dom.stage.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); },
      { capture: true, once: true });
  }
}

/* ── door names ───────────────────────────────────────────────
   Text inside the geometry gets sliced by whatever is standing in
   front of it, so the names live in a flat layer and are pushed
   to wherever their doorway currently is on screen. */

let labels = [];

function buildLabels() {
  dom.dlabels.textContent = '';
  labels = [];
  const stage = dom.stage.getBoundingClientRect();
  for (const node of $$('[data-go]', dom.room)) {
    const r = ROOM_BY_ID[node.dataset.go];
    if (!r) continue;
    const l = document.createElement('div');
    l.className = 'dlabel';
    l.style.setProperty('--dl', r.pal?.['door-glow'] || '#ffb45e');
    l.innerHTML =
      `<div class="dlabel__n">${esc(r.name)}</div>` +
      `<div class="dlabel__s">${esc(r.sub || '')} · ${r.total}</div>`;
    if (node.classList.contains('table3d')) l.dataset.lift = '1';
    dom.dlabels.appendChild(l);
    labels.push({ node, l });
  }
  placeLabels(stage);
}

function placeLabels(stageRect) {
  if (!labels.length || dom.shop.hidden) return;
  const stage = stageRect || dom.stage.getBoundingClientRect();
  const seats = [];
  /* nearest doorway first, so the ones in front get the good spots */
  const measured = labels
    .map(({ node, l }) => ({ l, r: node.getBoundingClientRect() }))
    .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);

  for (const { l, r } of measured) {
    if (r.width < 18 || r.height < 18) { l.style.opacity = '0'; continue; }
    l.style.opacity = '';
    let x = Math.max(96, Math.min(stage.width - 96, r.left - stage.left + r.width / 2));
    let y = r.top - stage.top - (l.dataset.lift === '1' ? 66 : 10);
    for (let guard = 0; guard < 10; guard++) {
      const hit = seats.find((s) => Math.abs(s.x - x) < 150 && Math.abs(s.y - y) < 46);
      if (!hit) break;
      y = hit.y - 50;
    }
    y = Math.max(64, Math.min(stage.height - 92, y));
    seats.push({ x, y });
    l.style.left = `${x.toFixed(1)}px`;
    l.style.top = `${y.toFixed(1)}px`;
    l.style.setProperty('--dl-op', (0.5 + Math.min(0.5, (r.width / 170) * 0.5)).toFixed(2));
  }
}

/* the room animates in, so keep re-measuring until it settles */
let syncUntil = 0, syncing = false;
function syncLabels(ms = 760) {
  syncUntil = performance.now() + ms;
  if (syncing) return;
  syncing = true;
  let frame = 0;
  const tick = () => {
    if (frame++ % 2 === 0) placeLabels();
    if (performance.now() < syncUntil) requestAnimationFrame(tick);
    else { syncing = false; placeLabels(); }
  };
  requestAnimationFrame(tick);
}

function hotLabel(node) {
  for (const { node: n, l } of labels) l.classList.toggle('is-hot', n === node);
}

/* ── travelling ───────────────────────────────────────────── */

let travelling = false;
let queued = null;

function go(id, dir = 'in', replace = false) {
  const room = ROOM_BY_ID[id];
  if (!room) return;
  if (state.room === id) { queued = null; return; }
  /* Walking through two doors in quick succession used to drop the second
     request and leave the address bar pointing at a room you were not in. */
  if (travelling) { queued = { id, dir, replace }; return; }

  const hash = `#/${id}`;
  if (replace) history.replaceState(null, '', hash);
  else if (location.hash !== hash) history.pushState(null, '', hash);

  const old = dom.room.firstElementChild;
  travelling = true;

  const paint = () => {
    dom.room.textContent = '';
    const built = buildRoom(room, booksIn(id));
    pivot = built.pivot;
    pan = 0;
    if (!REDUCED) built.travel.classList.add(dir === 'in' ? 'arrive-in' : 'arrive-out');
    dom.room.appendChild(built.travel);
    state.room = id;
    paintChrome(room);
    buildLabels();
    syncLabels();
    amb.set(room.amb || 'dust');
    tone.apply(room.amb || 'dust');
    travelling = false;
    /* keep the parallax from snapping */
    pivot.classList.add('is-tracking');
    setTimeout(() => pivot && pivot.classList.remove('is-tracking'), 60);
    if (queued) { const q = queued; queued = null; go(q.id, q.dir, q.replace); }
  };

  if (old && !REDUCED) {
    old.classList.add(dir === 'in' ? 'go-in' : 'go-out');
    setTimeout(paint, 300);
  } else {
    paint();
  }
}

function paintChrome(room) {
  /* breadcrumbs */
  const trail = pathTo(room.id);
  dom.crumbs.innerHTML = trail.map((r, i) => {
    const last = i === trail.length - 1;
    const tag = last ? 'span' : 'a';
    const href = last ? '' : ` href="#/${r.id}"`;
    return `${i ? '<span class="crumb__sep">▸</span>' : ''}<${tag} class="crumb${last ? ' crumb--now' : ''}"${href}>${esc(r.name)}</${tag}>`;
  }).join('');

  /* placard */
  const n = room.books.length;
  const deeper = room.total - n;
  dom.placard.innerHTML = `
    ${room.sub ? `<div class="placard__kicker">${esc(room.sub)}</div>` : ''}
    <div class="placard__name">${esc(room.name)}</div>
    ${room.line ? `<div class="placard__line">${esc(room.line)}</div>` : ''}
    <div class="placard__count">${n ? `${n} on the shelf` : 'no shelves in here'}${deeper ? ` · ${deeper} further in` : ''}</div>`;
  dom.placard.style.animation = 'none';
  void dom.placard.offsetWidth;
  dom.placard.style.animation = '';

  /* doors in the dock */
  const kids = room.children || [];
  dom.dockDoors.innerHTML = kids.map((k) =>
    `<a class="godoor${k.depth > 2 ? ' godoor--deep' : ''}" href="#/${k.id}">
       <span class="godoor__n">${esc(k.name)}</span>
       <span class="godoor__s">${esc(k.sub || '')} · ${k.total}</span>
     </a>`).join('');

  /* back */
  const parent = room.parent ? ROOM_BY_ID[room.parent] : null;
  dom.back.disabled = !parent;
  dom.backLabel.textContent = parent ? `Back to ${parent.name}` : 'Back';

  /* mark books you have already picked up */
  requestAnimationFrame(() => {
    $$('.bk[data-book]').forEach((b) => {
      if (state.seen.has(b.dataset.book)) b.classList.add('is-read');
    });
  });

  document.title = `${room.name} — The Nowhere Bookshop`;
}

/* ── hovering a book shows its name ───────────────────────── */

const tag = document.createElement('div');
tag.className = 'tag';
tag.innerHTML = '<div class="tag__t"></div><div class="tag__a"></div><div class="tag__x"></div>';
dom.stage.appendChild(tag);

function placeTag(node, title, sub, badge) {
  tag.querySelector('.tag__t').textContent = title;
  tag.querySelector('.tag__a').textContent = sub;
  tag.querySelector('.tag__x').textContent = badge;
  const r = node.getBoundingClientRect();
  const s = dom.stage.getBoundingClientRect();
  tag.style.left = `${Math.max(120, Math.min(s.width - 120, r.left - s.left + r.width / 2))}px`;
  tag.style.top = `${Math.max(90, r.top - s.top)}px`;
  tag.classList.add('is-on');
}

function showTag(bk) {
  const book = BOOK_BY_ID[bk.dataset.book];
  if (!book) return;
  placeTag(bk, book.title, book.author, book.won[0] || book.cited[0] || `${book.year || ''}`);
}

const hideTag = () => tag.classList.remove('is-on');

/* ── the book panel ───────────────────────────────────────── */

function openBook(id, fromShelf = true) {
  const book = BOOK_BY_ID[id];
  if (!book) return;
  state.book = id;
  state.seen.add(id);
  saveSeen();

  const shelf = booksIn(book.room);
  const i = shelf.findIndex((b) => b.id === id);
  const ctx = {
    prev: i > 0 ? shelf[i - 1] : null,
    next: i >= 0 && i < shelf.length - 1 ? shelf[i + 1] : null,
    isKept: (bid) => state.parcel.includes(bid),
  };

  dom.sheetBody.textContent = '';
  dom.sheetBody.appendChild(renderBook(book, ctx));
  dom.sheet.hidden = false;
  dom.sheet.setAttribute('aria-hidden', 'false');
  dom.sheet.classList.remove('is-closing');
  document.body.classList.add('is-reading');
  dom.sheetBody.focus({ preventScroll: true });

  if (fromShelf) {
    const bk = $(`.bk[data-book="${CSS.escape(id)}"]`);
    if (bk) bk.classList.add('is-read');
  }
  hideTag();
  history.replaceState(null, '', `#/${book.room}/${id}`);
}

function closeBook(keepHash = false) {
  if (!state.book) return;
  const room = BOOK_BY_ID[state.book]?.room;
  state.book = null;
  dom.sheet.classList.add('is-closing');
  document.body.classList.remove('is-reading');
  setTimeout(() => {
    dom.sheet.hidden = true;
    dom.sheet.setAttribute('aria-hidden', 'true');
    dom.sheet.classList.remove('is-closing');
    dom.sheetBody.textContent = '';
  }, 300);
  if (!keepHash && room) history.replaceState(null, '', `#/${room}`);
}

/* ── overlays ─────────────────────────────────────────────── */

function openOverlay(node, build) {
  build?.();
  node.hidden = false;
  node.setAttribute('aria-hidden', 'false');
  node.classList.remove('is-closing');
  node.querySelector('.overlay__body')?.focus({ preventScroll: true });
}
function closeOverlay(node) {
  if (node.hidden) return;
  node.classList.add('is-closing');
  setTimeout(() => {
    node.hidden = true;
    node.setAttribute('aria-hidden', 'true');
    node.classList.remove('is-closing');
  }, 200);
}

/* ── search ───────────────────────────────────────────────── */

let findCursor = 0;
let findItems = [];

function runSearch(q) {
  const { books, rooms } = search(q);
  findItems = [];

  if (!q.trim()) {
    dom.findResults.innerHTML = `<div class="find__empty">
      ${STATS.books} books in ${STATS.rooms} rooms.<br>Try a mood — <em>islands</em>, <em>grief</em>, <em>bureaucracy</em> — or a prize, like <em>Booker</em>.
    </div>`;
    return;
  }
  if (!books.length && !rooms.length) {
    dom.findResults.innerHTML = `<div class="find__empty">Nothing on the shelves under that. The shopkeeper suggests ringing the bell.</div>`;
    return;
  }

  let html = '';
  if (rooms.length) {
    html += `<div class="find__hd">Rooms</div>`;
    rooms.forEach((r) => {
      findItems.push({ kind: 'room', id: r.id });
      html += `<button class="res" type="button" data-room="${r.id}" role="option">
        <span class="res__room"><svg viewBox="0 0 24 24"><path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/></svg></span>
        <span class="res__txt"><span class="res__t">${esc(r.name)}</span><span class="res__s">${esc(r.sub || '')}</span></span>
        <span class="res__where">${r.total} books</span>
      </button>`;
    });
  }
  if (books.length) {
    html += `<div class="find__hd">Books</div>`;
    books.forEach((b) => {
      findItems.push({ kind: 'book', id: b.id });
      const where = pathTo(b.room).slice(1).map((r) => r.name).join(' › ') || ROOM_BY_ID[b.room].name;
      html += `<button class="res" type="button" data-book="${esc(b.id)}" role="option">
        <span class="res__mini">${coverSVG(b, { w: 30, h: 44, detail: 'mini' })}</span>
        <span class="res__txt"><span class="res__t">${esc(b.title)}</span><span class="res__s">${esc(b.author)}${b.year ? ` · ${b.year}` : ''}</span></span>
        <span class="res__where">${esc(where)}</span>
      </button>`;
    });
  }
  dom.findResults.innerHTML = html;
  findCursor = 0;
  markCursor();
}

function markCursor() {
  const nodes = $$('.res', dom.findResults);
  nodes.forEach((n, i) => n.classList.toggle('is-cursor', i === findCursor));
  nodes[findCursor]?.scrollIntoView({ block: 'nearest' });
}

function pickResult(i) {
  const item = findItems[i];
  if (!item) return;
  closeOverlay(dom.searchOverlay);
  if (item.kind === 'room') go(item.id, 'in');
  else {
    const b = BOOK_BY_ID[item.id];
    if (b.room !== state.room) go(b.room, 'in');
    setTimeout(() => openBook(item.id, false), 340);
  }
}

/* ── parcel ───────────────────────────────────────────────── */

function renderParcel() {
  const items = state.parcel.map((id) => BOOK_BY_ID[id]).filter(Boolean);
  dom.parcelBody.innerHTML = `
    <div class="parcel__hd">
      <h2 class="plan__title">Your parcel</h2>
      <span class="plan__sub">${items.length} book${items.length === 1 ? '' : 's'} · kept in this browser</span>
    </div>
    <div class="parcel__body scroll">
      ${items.length ? items.map((b) => `
        <div class="pitem" data-id="${esc(b.id)}">
          <span class="pitem__mini" data-open>${coverSVG(b, { w: 34, h: 50, detail: 'mini' })}</span>
          <span class="pitem__txt" data-open>
            <span class="pitem__t">${esc(b.title)}</span>
            <span class="pitem__a">${esc(b.author)} · ${esc(ROOM_BY_ID[b.room].name)}</span>
          </span>
          <a class="pitem__buy" href="${buyLink(b)}" target="_blank" rel="noopener noreferrer">Buy</a>
          <button class="pitem__x" type="button" data-drop aria-label="Take ${esc(b.title)} out of the parcel">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>`).join('')
      : `<div class="parcel__empty">Nothing wrapped up yet.<br>Pick a book off a shelf and press <em>Put in parcel</em>.</div>`}
    </div>`;
}

/* ── the whole shelf, as a list ────────────────────────────────
   The room is the nice way to browse; this is the reliable one,
   and on a phone it is the main way in. */

function renderShelf() {
  const room = ROOM_BY_ID[state.room];
  const list = booksIn(state.room);
  dom.shelfBody.innerHTML = `
    <div class="parcel__hd">
      <h2 class="plan__title">${esc(room.name)}</h2>
      <span class="plan__sub">${list.length ? `${list.length} book${list.length === 1 ? '' : 's'} on this shelf` : 'no shelves in this room'}</span>
    </div>
    <div class="parcel__body scroll">
      ${list.length ? list.map((b) => `
        <button class="res" type="button" data-book="${esc(b.id)}">
          <span class="res__mini">${coverSVG(b, { w: 34, h: 50, detail: 'mini' })}</span>
          <span class="res__txt">
            <span class="res__t">${esc(b.title)}</span>
            <span class="res__s">${esc(b.author)}${b.year ? ` · ${b.year}` : ''}${b.translator ? ` · tr. ${esc(b.translator)}` : ''}</span>
          </span>
          <span class="res__where">${esc(b.won[0] || b.cited[0] || '')}</span>
        </button>`).join('')
      : `<div class="parcel__empty">Nothing shelved in here — it is a way through.<br>Try one of the doorways.</div>`}
      ${room.children.length ? `<div class="find__hd">Doors out of this room</div>` + room.children.map((k) => `
        <button class="res" type="button" data-room="${k.id}">
          <span class="res__room"><svg viewBox="0 0 24 24"><path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/></svg></span>
          <span class="res__txt"><span class="res__t">${esc(k.name)}</span><span class="res__s">${esc(k.sub || '')}</span></span>
          <span class="res__where">${k.total} books</span>
        </button>`).join('') : ''}
    </div>`;
}

function toggleKeep(id) {
  const i = state.parcel.indexOf(id);
  if (i >= 0) { state.parcel.splice(i, 1); toast('Taken out of your parcel'); }
  else { state.parcel.push(id); toast('Wrapped and set aside'); }
  saveParcel();
}

/* ── toast ────────────────────────────────────────────────── */

let toastTimer;
function toast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('is-on'), 2400);
}

/* ── the bell ─────────────────────────────────────────────── */

function ringBell() {
  const b = surprise(state.book);
  if (!b) return;
  tone.ding();
  const room = ROOM_BY_ID[b.room];
  toast(`From ${room.name} — ${b.title}`);
  if (b.room !== state.room) go(b.room, 'in');
  setTimeout(() => openBook(b.id, false), b.room !== state.room ? 380 : 40);
}

/* ── routing ──────────────────────────────────────────────── */

function fromHash(replace) {
  const m = location.hash.match(/^#\/([\w-]+)(?:\/([\w-]+))?/);
  const roomId = m && ROOM_BY_ID[m[1]] ? m[1] : 'front';
  const bookId = m && m[2] && BOOK_BY_ID[m[2]] ? m[2] : null;

  if (roomId !== state.room) {
    const goingDeeper = !state.room || (ROOM_BY_ID[roomId].depth >= ROOM_BY_ID[state.room].depth);
    go(roomId, goingDeeper ? 'in' : 'out', replace);
  }
  if (bookId) setTimeout(() => openBook(bookId, false), state.room === roomId ? 0 : 340);
  else if (state.book) closeBook(true);
}

/* ── wiring ───────────────────────────────────────────────── */

function wire() {
  window.addEventListener('resize', () => { fit(); placeLabels(); }, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(fit, 120));
  dom.stage.addEventListener('pointermove', onMove, { passive: true });
  dom.stage.addEventListener('pointerdown', onDragStart);
  dom.stage.addEventListener('pointermove', onDragMove, { passive: false });
  dom.stage.addEventListener('pointerup', onDragEnd);
  dom.stage.addEventListener('pointercancel', onDragEnd);
  dom.stage.addEventListener('pointerleave', () => {
    target = { x: 0, y: 0 };
    applyPivot();
    placeLabels();
  });

  /* shelf + doors */
  dom.room.addEventListener('click', (e) => {
    const bk = e.target.closest('.bk[data-book]');
    if (bk) { openBook(bk.dataset.book); return; }
    const door = e.target.closest('.door3d[data-go]');
    if (door) { go(door.dataset.go, 'in'); return; }
  });
  dom.room.addEventListener('pointerover', (e) => {
    const bk = e.target.closest('.bk[data-book]');
    if (bk) return showTag(bk);
    const door = e.target.closest('[data-go]');
    if (door) { hotLabel(door); return hideTag(); }
    hotLabel(null);
    hideTag();
  });
  dom.room.addEventListener('focusin', (e) => {
    const bk = e.target.closest('.bk[data-book]');
    if (bk) return showTag(bk);
    const door = e.target.closest('[data-go]');
    if (door) hotLabel(door);
  });
  dom.room.addEventListener('focusout', () => { hideTag(); hotLabel(null); });
  dom.room.addEventListener('pointerleave', () => { hideTag(); hotLabel(null); });

  /* dock */
  dom.back.addEventListener('click', () => {
    const r = ROOM_BY_ID[state.room];
    if (r?.parent) go(r.parent, 'out');
  });
  dom.bell.addEventListener('click', ringBell);
  dom.dockDoors.addEventListener('click', (e) => {
    const a = e.target.closest('.godoor');
    if (!a) return;
    e.preventDefault();
    go(a.getAttribute('href').slice(2), 'in');
  });
  dom.crumbs.addEventListener('click', (e) => {
    const a = e.target.closest('a.crumb');
    if (!a) return;
    e.preventDefault();
    go(a.getAttribute('href').slice(2), 'out');
  });

  /* tools */
  $('#btnSearch').addEventListener('click', () => {
    openOverlay(dom.searchOverlay, () => { dom.findInput.value = ''; runSearch(''); });
    setTimeout(() => dom.findInput.focus(), 60);
  });
  $('#btnMap').addEventListener('click', () => {
    openOverlay(dom.mapOverlay, () => {
      dom.mapBody.textContent = '';
      dom.mapBody.appendChild(renderMap(state.room));
    });
  });
  $('#btnParcel').addEventListener('click', () => openOverlay(dom.parcelOverlay, renderParcel));
  $('#btnShelf').addEventListener('click', () => openOverlay(dom.shelfOverlay, renderShelf));
  $('#btnSound').addEventListener('click', (e) => {
    const on = tone.toggle();
    e.currentTarget.setAttribute('aria-pressed', String(on));
    toast(on ? 'Room tone on' : 'Room tone off');
  });

  /* sheet */
  dom.sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { closeBook(); return; }
    const step = e.target.closest('[data-step]');
    if (step) {
      const shelf = booksIn(BOOK_BY_ID[state.book].room);
      const i = shelf.findIndex((b) => b.id === state.book) + Number(step.dataset.step);
      if (shelf[i]) openBook(shelf[i].id, false);
      return;
    }
    if (e.target.closest('[data-keep]')) {
      toggleKeep(state.book);
      openBook(state.book, false);
      return;
    }
    const roomChip = e.target.closest('[data-room]');
    if (roomChip) { closeBook(true); go(roomChip.dataset.room, 'in'); return; }
    const tagChip = e.target.closest('[data-tag]');
    if (tagChip) {
      closeBook(true);
      openOverlay(dom.searchOverlay, () => {
        dom.findInput.value = tagChip.dataset.tag;
        runSearch(tagChip.dataset.tag);
      });
      setTimeout(() => dom.findInput.focus(), 60);
    }
  });

  /* overlays */
  for (const [node, name] of [[dom.mapOverlay, 'map'], [dom.searchOverlay, 'search'],
                              [dom.parcelOverlay, 'parcel'], [dom.shelfOverlay, 'shelf']]) {
    node.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) { closeOverlay(node); return; }
      const roomBtn = e.target.closest('[data-room]');
      if (roomBtn) { closeOverlay(node); go(roomBtn.dataset.room, 'in'); return; }
      const bookBtn = e.target.closest('.res[data-book]');
      if (bookBtn) {
        closeOverlay(node);
        const b = BOOK_BY_ID[bookBtn.dataset.book];
        if (b.room !== state.room) go(b.room, 'in');
        setTimeout(() => openBook(b.id, false), b.room === state.room ? 40 : 360);
        return;
      }
      if (name === 'parcel') {
        const item = e.target.closest('.pitem');
        if (!item) return;
        if (e.target.closest('[data-drop]')) { toggleKeep(item.dataset.id); renderParcel(); return; }
        if (e.target.closest('[data-open]')) {
          closeOverlay(node);
          const b = BOOK_BY_ID[item.dataset.id];
          if (b.room !== state.room) go(b.room, 'in');
          setTimeout(() => openBook(b.id, false), 340);
        }
      }
    });
  }

  dom.findInput.addEventListener('input', (e) => runSearch(e.target.value));
  dom.findInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); findCursor = Math.min(findCursor + 1, findItems.length - 1); markCursor(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); findCursor = Math.max(findCursor - 1, 0); markCursor(); }
    else if (e.key === 'Enter') { e.preventDefault(); pickResult(findCursor); }
  });

  /* keyboard */
  window.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);

    if (e.key === 'Escape') {
      if (!dom.searchOverlay.hidden) return closeOverlay(dom.searchOverlay);
      if (!dom.mapOverlay.hidden) return closeOverlay(dom.mapOverlay);
      if (!dom.parcelOverlay.hidden) return closeOverlay(dom.parcelOverlay);
      if (!dom.shelfOverlay.hidden) return closeOverlay(dom.shelfOverlay);
      if (state.book) return closeBook();
      const r = ROOM_BY_ID[state.room];
      if (r?.parent) go(r.parent, 'out');
      return;
    }
    if (typing) return;

    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
      e.preventDefault();
      openOverlay(dom.searchOverlay, () => { dom.findInput.value = ''; runSearch(''); });
      setTimeout(() => dom.findInput.focus(), 60);
    } else if (e.key === 'm' || e.key === 'M') {
      openOverlay(dom.mapOverlay, () => {
        dom.mapBody.textContent = '';
        dom.mapBody.appendChild(renderMap(state.room));
      });
    } else if (e.key === 'p' || e.key === 'P') {
      openOverlay(dom.parcelOverlay, renderParcel);
    } else if (e.key === 's' || e.key === 'S') {
      openOverlay(dom.shelfOverlay, renderShelf);
    } else if (e.key === 'b' || e.key === 'B') {
      ringBell();
    } else if (state.book && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const shelf = booksIn(BOOK_BY_ID[state.book].room);
      const i = shelf.findIndex((b) => b.id === state.book) + (e.key === 'ArrowRight' ? 1 : -1);
      if (shelf[i]) openBook(shelf[i].id, false);
    }
  });

  window.addEventListener('hashchange', () => fromHash(true));
}

/* ── open up ──────────────────────────────────────────────── */

function enter() {
  if (state.entered) return;
  state.entered = true;
  dom.door.classList.add('is-open');
  dom.shop.hidden = false;
  requestAnimationFrame(() => dom.shop.classList.add('is-in'));
  setTimeout(() => { dom.door.hidden = true; }, 1200);
  amb.start();
  showHint();
  fit();
  syncLabels(1600);
}

function showHint() {
  dom.hint.hidden = false;
  dom.hint.textContent = 'Point at a spine to read it · click to take it down · walk through the lit doorways';
  setTimeout(() => { dom.hint.hidden = true; }, 6200);
}

function boot() {
  dom.doorCount.textContent = String(STATS.books);
  saveParcel();
  fit();
  wire();
  fromHash(true);
  dom.enter.addEventListener('click', enter);
  /* if you arrive on a deep link, don't make you knock */
  if (location.hash && location.hash !== '#/front') enter();
}

boot();

/* handy in the console, and used by the tests */
window.__shop = { state, go, openBook, ringBell, ROOMS, ALL_BOOKS, search, STATS };
