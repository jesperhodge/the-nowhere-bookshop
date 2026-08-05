/* ============================================================
   The shop's index: rooms joined to their shelves, plus the
   lookups everything else needs.
   ============================================================ */

import { ROOMS, ROOM_BY_ID, pathTo } from './data/rooms.js';

import front from './data/books/front.js';
import longroom from './data/books/longroom.js';
import orrery from './data/books/orrery.js';
import oak from './data/books/oak.js';
import lamproom from './data/books/lamproom.js';
import glasshouse from './data/books/glasshouse.js';
import readingroom from './data/books/readingroom.js';
import attic from './data/books/attic.js';
import cellar from './data/books/cellar.js';
import inkroom from './data/books/inkroom.js';
import windowseat from './data/books/windowseat.js';
import landing from './data/books/landing.js';
import { ENRICH } from './data/enrich.js';
import { GENERATED, SOURCES } from './data/generated/index.js';

const SHELVES = Object.assign({}, front, longroom, orrery, oak, lamproom, glasshouse,
  readingroom, attic, cellar, inkroom, windowseat, landing);

export const ALL_BOOKS = [];
export const BOOK_BY_ID = Object.create(null);

/** Where a harvested accolade came from: the list, its page, and the exact
    revision of it that was parsed. Every generated book's `acc[].s` resolves
    here — that is what makes the shelf checkable rather than merely
    plausible. See tools/harvest.mjs and IMPLEMENTATION.md §6. */
export { SOURCES };

/* A harvested book stores its accolades once, as acc:[{l,k,s}] — label, kind
   and the list slug it is traceable to. `won`/`cited` are derived from that
   here rather than written twice into the data file, so there is exactly one
   thing to audit and no way for the two to drift apart. */
function accolades(b) {
  if (!b.acc) return { won: b.won || [], cited: b.cited || [] };
  const won = [], cited = [];
  for (const a of b.acc) (a.k === 'w' ? won : cited).push(a.l);
  return { won, cited };
}

for (const room of ROOMS) {
  const curated = (SHELVES[room.id] || []).map((b) => ({
    /* Fetched facts go underneath, so anything written by hand on the
       shelf wins over anything a lookup guessed. */
    ...ENRICH[b.id],
    ...b,
    room: room.id,
    ...accolades(b),
    tags: b.tags || [],
    /* The shopkeeper's picks. A pick is a book with a curator's note — the
       one thing this shop has that a catalogue does not — so the tier is
       derived from the note rather than kept as a second flag that could
       disagree with it. */
    pick: !!b.note,
  }));

  const generated = (GENERATED[room.id] || []).map((b) => ({
    ...b,
    room: room.id,
    ...accolades(b),
    tags: [],
    pick: false,
  }));

  /* Picks first, so they take the top row of the case — eye level, and the
     row the shelf camera frames best. Every pick is a curated book today, so
     the concatenation alone would do it; the sort is here so the ordering
     follows from the rule rather than from that happening to be true. Stable,
     so within each tier the hand-written shelf order is untouched. */
  const list = [...curated, ...generated].sort((a, b) => Number(b.pick) - Number(a.pick));
  room.books = list;
  for (const b of list) {
    if (BOOK_BY_ID[b.id]) console.warn('duplicate book id:', b.id);
    BOOK_BY_ID[b.id] = b;
    ALL_BOOKS.push(b);
  }
}

export const PICKS = ALL_BOOKS.filter((b) => b.pick);

/* how many books sit at or below each room — shown on the plan */
for (const room of ROOMS) {
  room.total = (function count(r) {
    return r.books.length + r.children.reduce((a, c) => a + count(c), 0);
  })(room);
}

export { ROOMS, ROOM_BY_ID, pathTo };

export const booksIn = (id) => ROOM_BY_ID[id]?.books || [];

/* ── a table is not a room (PLAN.md point 10) ──────────────────
   `fronttable` is written in rooms.js as a full room record with
   `viaTable: true`, because rooms were the only container this app had
   when it was written — walls, props, a palette and a place in the
   tree, for fifty-eight books lying on a table six feet from the door.
   Since phase 7 the three.js build models it correctly (tables.js: a
   real table with its own selection, reached by a camera pose), and
   since phase 10 the router agrees: you never stand in a table, you
   stand in the room the table is in and look down at it.

   These three are that rule, in one place, so no consumer re-derives
   it. `standIn()` in particular is what every route, every hash write
   and every breadcrumb goes through. */
export const isTable = (id) => !!ROOM_BY_ID[id]?.viaTable;
export const standIn = (id) => (isTable(id) ? ROOM_BY_ID[id].parent : id);
export const tableOf = (id) => (ROOM_BY_ID[id]?.children || []).find((k) => k.viaTable) || null;

/* ── search ───────────────────────────────────────────────── */

const norm = (s) => s.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const HAY = new Map();
for (const b of ALL_BOOKS) {
  HAY.set(b.id, norm([
    b.title, b.author, b.translator || '', String(b.year || ''),
    b.tags.join(' '), b.won.join(' '), b.cited.join(' '),
    ROOM_BY_ID[b.room].name, ROOM_BY_ID[b.room].sub || '',
    (b.blurb || '').replace(/<[^>]+>/g, ''),
  ].join(' ')));
}

export function search(q, limit = 40) {
  const query = norm(q);
  if (!query) return { books: [], rooms: [] };
  const words = query.split(' ').filter(Boolean);

  const books = [];
  for (const b of ALL_BOOKS) {
    const hay = HAY.get(b.id);
    if (!words.every((w) => hay.includes(w))) continue;
    const t = norm(b.title), a = norm(b.author);
    let score = 0;
    if (t === query) score += 100;
    if (t.startsWith(query)) score += 50;
    if (t.includes(query)) score += 30;
    if (a.includes(query)) score += 26;
    if (norm(b.tags.join(' ')).includes(query)) score += 14;
    if (b.won.length) score += 4;
    /* The shopkeeper's picks rank above the harvested shelf on an equal
       match. They are the books someone actually wrote about, which is the
       whole reason to prefer this shop to a catalogue — the tier has to be
       visible in search too, not only on the spine. */
    if (b.pick) score += 12;
    books.push({ b, score });
  }
  books.sort((x, y) => y.score - x.score || x.b.title.localeCompare(y.b.title));

  const rooms = ROOMS.filter((r) => {
    const hay = norm(`${r.name} ${r.sub || ''} ${r.line || ''}`);
    return words.every((w) => hay.includes(w));
  }).slice(0, 6);

  return { books: books.slice(0, limit).map((x) => x.b), rooms };
}

/* ── the bell: something you would not have gone looking for ── */

export function surprise(excludeId) {
  /* weighted towards the deep rooms, which is where the fun is */
  const pool = [];
  for (const b of ALL_BOOKS) {
    if (b.id === excludeId) continue;
    const d = ROOM_BY_ID[b.room].depth;
    const weight = d >= 3 ? 5 : d === 2 ? 3 : d === 1 ? 2 : 1;
    for (let i = 0; i < weight; i++) pool.push(b);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export const STATS = {
  books: ALL_BOOKS.length,
  picks: PICKS.length,
  /* Rooms you can stand in — 49, not ROOMS.length's 50. The plan
     renders this number next to a tree that no longer lists the front
     table as a room, and "50 rooms" over 49 room cards is the kind of
     small lie that outlives the session that told it. */
  rooms: ROOMS.filter((r) => !r.viaTable).length,
  tables: ROOMS.filter((r) => r.viaTable).length,
  deepest: Math.max(...ROOMS.map((r) => r.depth)),
};
