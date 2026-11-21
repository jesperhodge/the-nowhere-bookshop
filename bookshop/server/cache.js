/* ============================================================
   Disk cache for resolved book lookups, under data/cache/.

   Committable on purpose: it is a growing, checkable snapshot of
   real answers the server has already paid a rate-limited request
   for, keyed by normalised title+author so both the /api/book
   route and the tooling share one record of what has already been
   resolved. Misses are not cached — a miss today (no token,
   upstream hiccup, no confident match) should not become a
   permanent one once the reason for it goes away.

   One file per upstream (`hardcover.json`, `openlibrary.json`), so
   a bad answer from one is never mistaken for the other's and a
   file can be deleted to force a single provider to re-resolve.

   Two write modes:
     - immediate (default) for the server route, which resolves one
       book at a time behind a rate limiter and must survive a
       SIGTERM between requests;
     - deferred, for the phase-9 batch, because rewriting a
       megabyte of JSON after every one of several thousand
       lookups is quadratic and buys nothing when the whole run is
       a single process. defer() → … → flush().
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.js';

const DIR = path.join(ROOT, 'data/cache');

const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function cacheKey(title, author) {
  return `${norm(title)} ${norm(author)}`;
}

const stores = new Map();

function store(name) {
  let s = stores.get(name);
  if (!s) {
    const file = path.join(DIR, `${name}.json`);
    let mem = {};
    if (fs.existsSync(file)) {
      try { mem = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { mem = {}; }
    }
    s = { file, mem, dirty: false, deferred: false };
    stores.set(name, s);
  }
  return s;
}

/* On a read-only filesystem — Vercel's function root, unlike the box
   `npm start` runs on — this throws (EROFS). Locally that would be a real
   bug worth surfacing; deployed, it is an every-live-request occurrence
   (server/openlibrary.js's and hardcover.js's `.set()` on every fresh
   live answer) that must never turn into the 500 IMPLEMENTATION.md §5
   promises the API never gives on an upstream failure. The in-memory
   entry this call was trying to persist is already in `s.mem` — set()
   put it there before calling this — so a request that hits this catch
   still gets a correct answer, it just won't out-live the invocation
   that answered it. Vercel functions are not guaranteed to reuse the
   same container between requests anyway, so this cache was already
   never durable there; committing data/cache/*.json ahead of time (via
   vercel.json's includeFiles) is what actually carries answers forward
   on that platform, not a write from inside the function. */
function write(s) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const ordered = {};
    for (const id of Object.keys(s.mem).sort()) ordered[id] = s.mem[id];
    fs.writeFileSync(s.file, JSON.stringify(ordered, null, 1) + '\n');
  } catch (err) {
    if (err?.code !== 'EROFS' && err?.code !== 'EACCES') throw err;
  }
  s.dirty = false;
}

/** A namespaced cache: `cache('openlibrary').get(key)` / `.set(key, entry)`. */
export function cache(name) {
  const s = store(name);
  return {
    get: (key) => s.mem[key] || null,
    has: (key) => Object.prototype.hasOwnProperty.call(s.mem, key),
    set: (key, entry) => {
      s.mem[key] = { ...entry, cachedAt: new Date().toISOString() };
      s.dirty = true;
      if (!s.deferred) write(s);
    },
    defer: () => { s.deferred = true; },
    flush: () => { if (s.dirty) write(s); },
    size: () => Object.keys(s.mem).length,
    all: () => s.mem,
  };
}

/* ── the Hardcover cache, unchanged in behaviour ───────────────
   server/hardcover.js has used these three since phase 1; they now
   read and write through the namespaced store rather than a second
   copy of the same loader. */
const hardcover = cache('hardcover');
export const getCached = (key) => hardcover.get(key);
export const setCached = (key, entry) => hardcover.set(key, entry);
