/* ============================================================
   The Nowhere Bookshop
   ============================================================ */

import {
  ROOMS, ROOM_BY_ID, pathTo, booksIn, search, surprise, STATS,
  BOOK_BY_ID, ALL_BOOKS, PICKS, SOURCES, isTable, standIn, tableOf,
} from './shop.js';
import { createStage } from './scene/stage.js';
import { buildRoom } from './scene/room.js';
import { Ambience } from './ambience.js';
import { RoomTone } from './audio.js';
import { renderBook } from './views/book.js';
import { renderMap } from './views/map.js';
import { coverSVG } from './covers.js';
import { buyLink } from './links.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* The shopkeeper's picks — the books with a curator's note. Since phase 9
   they are a minority of a shelf rather than all of it, so the tier has to
   be visible wherever a book is listed, not only in the room. Same ribbon
   as the gilt band on the spine (scene.css) and the book panel's heading
   (views/book.js), so it reads as one thing in three places.

   The title attribute, not just the glyph: an icon nobody can name is
   decoration. `aria-hidden` on the mark and a visually-hidden word beside
   it, because a screen reader gets no colour and no shape. */
const PICKMARK = '<span class="pickmark" title="The shopkeeper\'s pick">'
  + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v13l-4-3-4 3V3z"/></svg>'
  + '<span class="vh"> — the shopkeeper\'s pick</span></span>';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Where "home" is. fromHash() falls back to the same room and boot() tests
   for the same hash; those two are left spelled out on the entry path. */
const HOME_ID = 'front';

const dom = {
  door: $('#door'), enter: $('#enter'), doorCount: $('#doorCount'),
  shop: $('#shop'), stage: $('#stage'),
  scene: $('#scene'), mirror: $('#mirror'), signs: $('#signs'),
  flat: $('#flat'), flatWhy: $('#flatWhy'),
  crumbs: $('#crumbs'), placard: $('#placard'),
  back: $('#btnBack'), backLabel: $('#backLabel'),
  home: $('#btnHome'), shelf: $('#btnShelf'), bell: $('#btnBell'),
  sheet: $('#sheet'), sheetBody: $('#sheetBody'),
  mapOverlay: $('#mapOverlay'), mapBody: $('#mapBody'),
  searchOverlay: $('#searchOverlay'), findInput: $('#findInput'), findResults: $('#findResults'),
  parcelOverlay: $('#parcelOverlay'), parcelBody: $('#parcelBody'), parcelCount: $('#parcelCount'),
  shelfOverlay: $('#shelfOverlay'), shelfBody: $('#shelfBody'),
  toast: $('#toast'), hint: $('#hint'), ambience: $('#ambience'),
};

const state = {
  room: null,
  book: null,
  parcel: loadParcel(),
  seen: loadSeen(),
  entered: false,
  /* `travelling` used to be a module-local. It is on `state` because
     tools/qa.mjs has to settle on a real condition rather than a fixed
     timeout, and "the room hand-over is still running" is one of the
     two conditions that means "not yet". */
  travelling: false,
  /* false when WebGL would not start — see flat() */
  webgl: true,
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

/* ── the stage ─────────────────────────────────────────────────
   One WebGL stage for the life of the page; one room in it at a time,
   built and disposed by go() below. `fit()`, the parallax pivot and the
   drag-along-the-shelf gesture all went with the CSS-3D scene: the room
   is not a scaled 1680x940 box any more, it is a camera in a real one,
   and "get closer to the shelf" is a pose rather than a transform.
   stage.js widens the fov on a portrait viewport, which is what the
   crop-and-drag was standing in for. */

let stage = null;
let handle = null;   // the live room (scene/room.js), or null
let closeUp = false; // camera is in a shelf/table pose, not the room pose

function startStage() {
  try {
    stage = createStage(dom.scene, { onContextLost: () => flat('The graphics context was lost.') });
    /* One frame callback for the whole page's chrome. room.js owns the
       room's own per-frame work and unsubscribes it on dispose; this one
       outlives every room, so it lives here. */
    stage.onFrame(() => {
      if (tagFor) placeTag();
      /* The placard names the room, and the moment you step up to a
         shelf or over the table it is a caption printed across the
         books. Fade it while the camera is anywhere but the room pose —
         one class, guarded, and the dock and breadcrumbs stay put
         because those are how you get out again. */
      const close = !!handle?.rig && handle.rig.current !== 'room';
      if (close !== closeUp) {
        closeUp = close;
        document.body.classList.toggle('is-close', close);
      }
    });
    /* Deliberately NOT started here. The front room is built at boot so
       it is warm the instant the door opens, but nothing is rendered
       while the door is still shut and the shop is `hidden` — there is
       no picture behind an opaque overlay, only a hot main thread. It
       measured as five seconds of unresponsiveness before the "push the
       door open" button could even be clicked (headless, software
       rasteriser; a real GPU is far quicker, but the work is just as
       pointless there). enter() starts it. */
    return true;
  } catch (err) {
    console.warn('WebGL would not start:', err && err.message);
    flat('WebGL wouldn’t start, so there is nothing to walk around in.');
    return false;
  }
}

/* No WebGL — open the shop's own text UI and say why (§4.7). Search, the
   plan and the shelf list already describe every room, every book and
   every doorway; the only thing missing is the picture. */
function flat(why) {
  if (!state.webgl) return;
  state.webgl = false;
  if (handle) { handle.dispose(); handle = null; }
  stage = null;
  document.body.classList.add('is-flat');
  dom.flat.hidden = false;
  if (why) dom.flatWhy.textContent = why;
  offerShelf();
}

/* Re-open the shelf after a room change when nothing else is open. This
   is what makes the fallback a way round the shop rather than a notice:
   click a doorway in the shelf list and you arrive in the next room with
   its shelf already in front of you. Guarded on every overlay AND the
   book panel, because picking a book from the list opens the panel on a
   340ms timer and re-opening the shelf over it would be hostile. */
function offerShelf() {
  if (state.webgl) return;
  setTimeout(() => {
    if (state.webgl || state.book || !dom.sheet.hidden) return;
    if (![dom.searchOverlay, dom.mapOverlay, dom.parcelOverlay, dom.shelfOverlay].every((n) => n.hidden)) return;
    openOverlay(dom.shelfOverlay, renderShelf);
  }, 420);
}

/* ── travelling ───────────────────────────────────────────── */

let queued = null;
let pendingPose = null;   // a table deep link asked for a camera pose on arrival

function go(id, dir = 'in', replace = false) {
  /* A table is not a room: #/fronttable means "stand in the front room
     and look down at the table" (PLAN.md point 10). Resolved here, once,
     for every caller — the plan, search, a stale bookmark, the router. */
  if (isTable(id)) {
    pendingPose = `table:${id}`;
    id = standIn(id);
    if (state.room === id) { applyPendingPose(); return; }
  }

  const room = ROOM_BY_ID[id];
  if (!room) return;
  if (state.room === id) { queued = null; return; }
  /* Walking through two doors in quick succession used to drop the second
     request and leave the address bar pointing at a room you were not in. */
  if (state.travelling) { queued = { id, dir, replace }; return; }

  const hash = `#/${id}`;
  if (replace) history.replaceState(null, '', hash);
  else if (location.hash !== hash) history.pushState(null, '', hash);

  const had = !!handle;
  state.travelling = true;

  const paint = () => {
    hideTag();          /* it points at a mesh that is about to be disposed */
    handle?.dispose();
    handle = stage ? buildRoom(stage, room, {
      booksFor: booksIn,
      mirrorContainer: dom.mirror,
      signContainer: dom.signs,
      reducedMotion: REDUCED,
      onBookActivate: (entry) => openBook(entry.book.id),
      onDoorActivate: (entry) => go(entry.room.id, 'in'),
      onBookHover: (entry) => (entry ? showTag(entry) : hideTag()),
    }) : null;

    if (handle) {
      for (const e of handle.entries) if (state.seen.has(e.book.id)) e.setSeen?.();
      if (!REDUCED) {
        dom.scene.classList.remove('go-in', 'go-out', 'arrive-in', 'arrive-out');
        void dom.scene.offsetWidth;               /* restart the animation */
        dom.scene.classList.add(dir === 'in' ? 'arrive-in' : 'arrive-out');
      }
    }

    state.room = id;
    paintChrome(room);
    amb.set(room.amb || 'dust');
    tone.apply(room.amb || 'dust');
    state.travelling = false;
    applyPendingPose();
    offerShelf();
    if (queued) { const q = queued; queued = null; go(q.id, q.dir, q.replace); }
  };

  if (had && !REDUCED) {
    dom.scene.classList.remove('arrive-in', 'arrive-out');
    dom.scene.classList.add(dir === 'in' ? 'go-in' : 'go-out');
    setTimeout(paint, 300);
  } else {
    paint();
  }
}

/* A pose asked for before the room existed — the `table:<id>` a
   #/fronttable link resolves to. Poses are transient UI state and never
   touch `history` (§4.3), so this is deliberately not part of the route:
   the hash says which room you are in, and this says where you are
   looking when you get there. */
function applyPendingPose() {
  if (!pendingPose) return;
  const name = pendingPose;
  pendingPose = null;
  handle?.rig?.goTo(name);
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

  /* placard. A table's books used to be counted as "further in", because
     the table was a room you walked to. They are on a table six feet
     away, so they get said as that. */
  const n = room.books.length;
  const table = tableOf(room.id);
  const onTable = table ? table.books.length : 0;
  const deeper = room.total - n - onTable;
  const bits = [n ? `${n} on the shelf` : 'no shelves in here'];
  if (onTable) bits.push(`${onTable} on the table`);
  if (deeper) bits.push(`${deeper} further in`);
  dom.placard.innerHTML = `
    ${room.sub ? `<div class="placard__kicker">${esc(room.sub)}</div>` : ''}
    <div class="placard__name">${esc(room.name)}</div>
    ${room.line ? `<div class="placard__line">${esc(room.line)}</div>` : ''}
    <div class="placard__count">${bits.join(' · ')}</div>`;
  dom.placard.style.animation = 'none';
  void dom.placard.offsetWidth;
  dom.placard.style.animation = '';

  /* The two ways back. The dock used to list every way *on* out of this room
     too, which made the doorways decorative — why walk when there is a
     button? The doorways are the way through now; the plan (M), search (/)
     and the shelf list (S) are still the reliable route to anywhere.

     Both states are set on every room paint, never once at startup. */
  const parent = room.parent ? ROOM_BY_ID[room.parent] : null;
  setDisabled(dom.back, !parent);
  dom.backLabel.textContent = parent ? `Back to ${parent.name}` : 'Back';
  setDisabled(dom.home, room.id === HOME_ID);

  /* Books you have already taken down are marked on the spine itself,
     inside the room's own atlas — see books.js's markSeen(). Applied at
     build time in go()'s paint(), not here, because there is nothing to
     query the DOM for any more. */

  document.title = `${room.name} — The Nowhere Bookshop`;
}

/* Disabling the control you are standing on hands focus back to <body>, and
   a keyboard reader loses their place mid-shop. Pass it along the dock
   instead. Both back controls go through here for that reason. */
function setDisabled(btn, off) {
  if (off && !btn.disabled && btn === document.activeElement) dom.shelf.focus();
  btn.disabled = off;
}

/* The way home from any depth, from the button and from H alike.
   'out' matters: it drives the travel animation, and arriving home
   "inward" reads wrong. */
function goHome() {
  if (dom.home.disabled) return;
  /* The dock is reachable with a keyboard from inside the open book sheet,
     and closeBook()'s default rewrites the hash to *the book's* room — which
     would leave the address bar pointing at a room you had just left. */
  if (state.book) closeBook(true);
  go(HOME_ID, 'out');
}

/* ── hovering a book shows its name ───────────────────────── */

const tag = document.createElement('div');
tag.className = 'tag';
tag.innerHTML = '<div class="tag__t"></div><div class="tag__a"></div><div class="tag__x"></div>';
dom.stage.appendChild(tag);

/* The tag used to be placed once, from the hovered <button>'s own
   getBoundingClientRect(). A mesh has no such thing, and — the reason
   this is a per-frame job rather than a one-shot projection — the camera
   MOVES under it: focusing a book in the a11y mirror flies the camera to
   its shelf, and a tag pinned to where the book was 700ms ago is the
   same class of lie as a screenshot taken before the room settles. */
let tagFor = null;

function showTag(entry) {
  const book = entry?.book;
  if (!book || !stage) return;
  tag.querySelector('.tag__t').textContent = book.title;
  tag.querySelector('.tag__a').textContent = book.author;
  tag.querySelector('.tag__x').textContent = book.won[0] || book.cited[0] || `${book.year || ''}`;
  tagFor = entry;
  placeTag();
  tag.classList.add('is-on');
}

function placeTag() {
  if (!tagFor || !stage || !tagFor.mesh) return;
  const ndc = stage.project(tagFor.mesh);
  const s = dom.stage.getBoundingClientRect();
  const x = (ndc.x * 0.5 + 0.5) * s.width;
  const y = (1 - (ndc.y * 0.5 + 0.5)) * s.height;
  tag.style.left = `${Math.max(120, Math.min(s.width - 120, x))}px`;
  tag.style.top = `${Math.max(90, y)}px`;
}

function hideTag() {
  tagFor = null;
  tag.classList.remove('is-on');
}

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

  /* The brass "you have had this one down before" dot, and — when the
     book is somewhere in the room you are actually standing in — the
     camera. Opening a book from search, the parcel or the bell now
     brings you to its shelf (or its table) behind the panel, so closing
     it leaves you where the book was rather than where you were. */
  const entry = handle?.entryFor(id);
  if (entry) {
    entry.setSeen?.();
    if (!fromShelf) handle.rig?.focusEntry(entry);
  }
  hideTag();
  /* standIn(): a table book's URL is the room you stand in to reach it.
     #/fronttable/<id> still resolves inbound (fromHash), it is just not
     what we write. */
  history.replaceState(null, '', `#/${standIn(book.room)}/${id}`);
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
  if (!keepHash && room) history.replaceState(null, '', `#/${standIn(room)}`);
  offerShelf();
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
      /* A table still matches, and picking it still takes you to it —
         it is just not a room, and says so rather than claiming a door
         and a book count like everything else in this list. */
      const t = isTable(r.id);
      html += `<button class="res" type="button" data-room="${r.id}" role="option">
        <span class="res__room">${t
          ? `<svg viewBox="0 0 24 24"><path d="M3 9h18M5 9v10M19 9v10M4 6h16v3H4z"/></svg>`
          : `<svg viewBox="0 0 24 24"><path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/></svg>`}</span>
        <span class="res__txt"><span class="res__t">${esc(r.name)}</span><span class="res__s">${esc(r.sub || '')}</span></span>
        <span class="res__where">${r.total} ${t ? 'on the table' : 'books'}</span>
      </button>`;
    });
  }
  if (books.length) {
    html += `<div class="find__hd">Books</div>`;
    books.forEach((b) => {
      findItems.push({ kind: 'book', id: b.id });
      const where = pathTo(b.room).slice(1).map((r) => r.name).join(' › ') || ROOM_BY_ID[b.room].name;
      html += `<button class="res${b.pick ? ' res--pick' : ''}" type="button" data-book="${esc(b.id)}" role="option">
        <span class="res__mini">${coverSVG(b, { w: 30, h: 44, detail: 'mini' })}</span>
        <span class="res__txt"><span class="res__t">${esc(b.title)}${b.pick ? PICKMARK : ''}</span><span class="res__s">${esc(b.author)}${b.year ? ` · ${b.year}` : ''}</span></span>
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

/* One book, as a row in a list. Three places drew this markup;
   the shelf overlay now needs it twice (the shelf, and the table). */
function bookRow(b) {
  return `
    <button class="res${b.pick ? ' res--pick' : ''}" type="button" data-book="${esc(b.id)}">
      <span class="res__mini">${coverSVG(b, { w: 34, h: 50, detail: 'mini' })}</span>
      <span class="res__txt">
        <span class="res__t">${esc(b.title)}${b.pick ? PICKMARK : ''}</span>
        <span class="res__s">${esc(b.author)}${b.year ? ` · ${b.year}` : ''}${b.translator ? ` · tr. ${esc(b.translator)}` : ''}</span>
      </span>
      <span class="res__where">${esc(b.won[0] || b.cited[0] || '')}</span>
    </button>`;
}

function renderShelf() {
  const room = ROOM_BY_ID[state.room];
  const list = booksIn(state.room);
  /* The table is part of this room, not a door out of it — so its books
     belong in this list. Without them the front table's 58 would be
     reachable only through search, which matters most in exactly the
     case this overlay exists for: no WebGL, and this IS the shop. */
  const table = tableOf(state.room);
  const doors = room.children.filter((k) => !k.viaTable);
  dom.shelfBody.innerHTML = `
    <div class="parcel__hd">
      <h2 class="plan__title">${esc(room.name)}</h2>
      <span class="plan__sub">${list.length
        ? `${list.length} book${list.length === 1 ? '' : 's'} on this shelf${
            list.filter((b) => b.pick).length ? `, ${list.filter((b) => b.pick).length} of them the shopkeeper's own` : ''}`
        : 'no shelves in this room'}</span>
    </div>
    <div class="parcel__body scroll">
      ${list.length ? list.map(bookRow).join('')
      : `<div class="parcel__empty">Nothing shelved in here — it is a way through.<br>Try one of the doorways.</div>`}
      ${table && table.books.length
        ? `<div class="find__hd">On the table — ${esc(table.name)}${table.sub ? `, ${esc(table.sub)}` : ''}</div>`
          + table.books.map(bookRow).join('')
        : ''}
      ${doors.length ? `<div class="find__hd">Doors out of this room</div>` + doors.map((k) => `
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
  const asked = m && ROOM_BY_ID[m[1]] ? m[1] : HOME_ID;
  const bookId = m && m[2] && BOOK_BY_ID[m[2]] ? m[2] : null;

  /* `#/fronttable` is a real inbound link — it is in this repo's own
     docs and in anything anyone bookmarked before phase 10 — so it
     still resolves. It resolves to the room you stand in to reach the
     table, plus the camera pose that looks down at it, and the address
     bar is rewritten to say so. Poses are transient state and never
     enter `history` (§4.3); the hash names a room, and only ever a
     room. */
  const roomId = standIn(asked);
  const wantPose = isTable(asked) ? `table:${asked}` : null;
  if (roomId !== asked) {
    history.replaceState(null, '', bookId ? `#/${roomId}/${bookId}` : `#/${roomId}`);
  }

  if (roomId !== state.room) {
    const goingDeeper = !state.room || (ROOM_BY_ID[roomId].depth >= ROOM_BY_ID[state.room].depth);
    if (wantPose) pendingPose = wantPose;
    go(roomId, goingDeeper ? 'in' : 'out', replace);
  } else if (wantPose) {
    pendingPose = wantPose;
    applyPendingPose();
  }
  if (bookId) setTimeout(() => openBook(bookId, false), state.room === roomId ? 0 : 340);
  else if (state.book) closeBook(true);
}

/* ── wiring ───────────────────────────────────────────────── */

const ARROW_POSE = {
  ArrowLeft: 'shelf:left',
  ArrowRight: 'shelf:right',
  ArrowUp: 'shelf:back',
};

function wire() {
  /* The stage sizes itself off its own box (stage.js's resize listener);
     the ambience canvas does the same. Nothing here re-fits a scaled
     world any more — there isn't one. */
  window.addEventListener('orientationchange', () => setTimeout(() => stage?.resize(), 120));
  /* A backgrounded tab has no reason to render a room. Ambience already
     does this for its own canvas; the stage is the expensive one. */
  document.addEventListener('visibilitychange', () => {
    if (!stage || !state.entered) return;
    if (document.hidden) stage.stop(); else stage.start();
  });

  /* Books, doorways, shelves and the table are meshes now: interact.js
     raycasts for the pointer and a11y.js's mirror carries the keyboard,
     and both funnel through the same controllers — wired per room in
     go()'s buildRoom() call, not delegated from a DOM subtree here. */

  /* dock */
  dom.back.addEventListener('click', () => {
    const r = ROOM_BY_ID[state.room];
    if (r?.parent) go(r.parent, 'out');
  });
  dom.home.addEventListener('click', goHome);
  dom.bell.addEventListener('click', ringBell);
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
  dom.shelf.addEventListener('click', () => openOverlay(dom.shelfOverlay, renderShelf));
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
      /* Standing at a shelf or over the table: step back out of the pose
         before you step back out of the room. This is why main.js passes
         `keys: false` to attachPoseControls() — poses.js's own Escape
         binding is on `window` too and knows nothing about the book
         panel, so with both attached one Escape would close the panel
         AND pop the pose stack. */
      if (handle?.rig && handle.rig.current !== 'room') { handle.rig.back(); return; }
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
    } else if ((e.key === 'h' || e.key === 'H') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      /* Ctrl-H is the browser's own history in more than one browser. The
         four shortcuts above this one do not check modifiers and so double
         up with ⌘S/⌘P — inherited, not copied. */
      goHome();
    } else if (state.book && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const shelf = booksIn(BOOK_BY_ID[state.book].room);
      const i = shelf.findIndex((b) => b.id === state.book) + (e.key === 'ArrowRight' ? 1 : -1);
      if (shelf[i]) openBook(shelf[i].id, false);
    } else if (!state.book && handle?.rig && ARROW_POSE[e.key]) {
      /* Walk to a wall. Only when nothing is open — with a book in your
         hands the arrows step along the shelf, above. preventDefault only
         if the pose actually resolved (a room with no left case simply
         has no `shelf:left`), because these are also the page's own
         scroll keys and swallowing one for nothing is a regression. */
      if (handle.rig.goTo(ARROW_POSE[e.key])) e.preventDefault();
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
  /* The stage was sized against a hidden #shop (display:none via
     [hidden]), so its canvas measured 0x0. Re-measure now that it is on
     screen — this is the same class of bug the old fit() call here was
     guarding against — and only now start rendering it. */
  stage?.resize();
  stage?.start();
}

function showHint() {
  dom.hint.hidden = false;
  dom.hint.textContent = state.webgl
    ? 'Point at a spine to read it · click a shelf to step up to it · scroll to come closer · Esc to step back'
    : 'The rooms cannot be drawn here — press S for this shelf, / to search, M for the plan';
  setTimeout(() => { dom.hint.hidden = true; }, 6200);
}

function boot() {
  dom.doorCount.textContent = String(STATS.books);
  saveParcel();
  startStage();
  wire();
  fromHash(true);
  dom.enter.addEventListener('click', enter);
  /* if you arrive on a deep link, don't make you knock */
  if (location.hash && location.hash !== `#/${HOME_ID}`) enter();
}

boot();

/* handy in the console, and used by the tests */
window.__shop = { state, go, openBook, closeBook, ringBell, ROOMS, ALL_BOOKS, PICKS, SOURCES, search, STATS };
/* the live stage and the live room — tools/qa.mjs settles on these
   (`__stage.frame` advancing, `__room.isReady`, `!__room.rig.tweening`),
   which is what "wait for a real condition, never a fixed timeout"
   means on this substrate. */
Object.defineProperties(window, {
  __stage: { get: () => stage },
  __room: { get: () => handle },
});
