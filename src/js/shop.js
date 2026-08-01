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

const SHELVES = Object.assign({}, front, longroom, orrery, oak, lamproom, glasshouse,
  readingroom, attic, cellar, inkroom, windowseat, landing);

export const ALL_BOOKS = [];
export const BOOK_BY_ID = Object.create(null);

for (const room of ROOMS) {
  const list = (SHELVES[room.id] || []).map((b) => ({
    /* Fetched facts go underneath, so anything written by hand on the
       shelf wins over anything a lookup guessed. */
    ...ENRICH[b.id],
    ...b,
    room: room.id,
    won: b.won || [],
    cited: b.cited || [],
    tags: b.tags || [],
  }));
  room.books = list;
  for (const b of list) {
    if (BOOK_BY_ID[b.id]) console.warn('duplicate book id:', b.id);
    BOOK_BY_ID[b.id] = b;
    ALL_BOOKS.push(b);
  }
}

/* how many books sit at or below each room — shown on the plan */
for (const room of ROOMS) {
  room.total = (function count(r) {
    return r.books.length + r.children.reduce((a, c) => a + count(c), 0);
  })(room);
}

export { ROOMS, ROOM_BY_ID, pathTo };

export const booksIn = (id) => ROOM_BY_ID[id]?.books || [];

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
  rooms: ROOMS.length,
  deepest: Math.max(...ROOMS.map((r) => r.depth)),
};
