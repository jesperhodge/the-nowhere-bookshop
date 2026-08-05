/* ============================================================
   The Open Library client. ONE implementation, a sibling to
   server/hardcover.js — not a replacement for it.

   Why there are now two upstreams at all: PLAN-ARCH.md's "ONE
   implementation" rule is about there being one client per API
   (§5's own words: "there are currently two divergent code paths
   to the same API"), not about there being one API. Hardcover
   needs a token; this box has none and never had one, and the
   shelves phase 9 fills need real ISBNs, page counts, years and
   descriptions. So Hardcover stays the primary path for the
   owner's machine and this fills in behind it. The order lives in
   exactly one place — server/lookup.js — and neither client knows
   the other exists.

   Three endpoints, all key-free and all measured on this box:

     search.json                ~0.9 s   work key, title, authors,
                                         first_publish_year,
                                         number_of_pages_median,
                                         subject[], matched edition keys
     works/<key>.json           ~0.2 s   description, subjects
     books/<edition>.json       ~0.2 s   isbn_13 for ONE edition

   ── The rule about ISBNs ──────────────────────────────────────
   search.json also returns an `isbn[]`, and it is every ISBN of
   every printing of every edition, unattributed. It is the same
   trap IMPLEMENTATION.md §8.4 documents for Hardcover, and it is
   not used here. An ISBN is only ever taken from a *specific
   edition record* that the search itself matched. A book with no
   attributable ISBN gets none and its links fall back to a
   title+author search — which is exactly what all 409 curated
   books do today. Absent beats invented: a wrong ISBN sends a
   reader to the wrong book at a real shop.
   ============================================================ */

import { cache, cacheKey } from './cache.js';

const BASE = process.env.OPENLIBRARY_ENDPOINT || 'https://openlibrary.org';
const UA = 'the-nowhere-bookshop/1.0 (a curated bookshop site; contact jesperhodge@gmail.com)';

/** Set false (OPENLIBRARY=0) to take this provider out of the chain entirely. */
export const ENABLED = !/^(0|false|off)$/i.test(process.env.OPENLIBRARY ?? '1');

const SEARCH_FIELDS = [
  'key', 'title', 'author_name', 'first_publish_year',
  'number_of_pages_median', 'subject', 'editions', 'editions.key', 'editions.title',
].join(',');

/* ── pacing ────────────────────────────────────────────────────
   Measured: 12 requests at 120 ms spacing all returned 200 and no
   rate-limit headers came back. So there is nothing to adapt to
   except a 429, same as Hardcover (§8.6) — the defence is a
   client-side pace plus backoff. The server route runs at the
   polite default; the phase-9 batch raises it with setPace() and
   is the only caller that does. */
let minInterval = 250;
let concurrency = 1;
let nextSlot = 0;
let inFlight = 0;
const waiting = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Requests per second, and how many may be in flight at once. Batch tooling
 * only — the server route leaves both at the polite default.
 *
 * Both numbers are needed, and the first version of this had only the first,
 * which is why it is worth a comment. A pace alone, applied by serialising
 * requests, caps throughput at 1/(latency + interval): Open Library's search
 * takes ~0.9 s, so a "8 per second" setting delivered 0.9 per second and put
 * a six-thousand book run at nearly two hours. The limit that matters is a
 * slot clock (requests start `minInterval` apart, whenever they finish) with
 * a separate cap on how many are open at once.
 */
export function setPace(perSecond, parallel = 1) {
  minInterval = Math.max(50, Math.round(1000 / Math.max(0.5, perSecond)));
  concurrency = Math.max(1, Math.min(8, parallel));
}

async function acquire() {
  if (inFlight >= concurrency) await new Promise((r) => waiting.push(r));
  inFlight++;
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + minInterval;
  if (at > now) await sleep(at - now);
}

function release() {
  inFlight--;
  const next = waiting.shift();
  if (next) next();
}

/** Paced, concurrency-capped GET returning parsed JSON, or null on a 404. */
async function get(url, attempt = 0) {
  await acquire();
  try {
    return await getOnce(url, attempt);
  } finally {
    release();
  }
}

async function getOnce(url, attempt) {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  } catch (err) {
    if (attempt < 2) { await sleep(1500 * (attempt + 1)); return getOnce(url, attempt + 1); }
    throw err;
  }
  if (res.status === 429 && attempt < 4) {
    /* Back off for everyone, not just this request: a 429 means the pace is
       wrong, and retrying one call while the other in-flight ones keep the
       same rhythm just earns another 429. Pushing the slot clock forward
       stalls every request that has not started yet. */
    const retry = Number(res.headers.get('retry-after')) || 0;
    const back = retry ? retry * 1000 : 2000 * 2 ** attempt;
    nextSlot = Math.max(nextSlot, Date.now() + back);
    await sleep(back);
    return getOnce(url, attempt + 1);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} from openlibrary`);
  return res.json();
}

/* ── matching ──────────────────────────────────────────────────
   Same shape of judgement as hardcover.js's scoreMatch(): an exact
   normalised title is worth far more than a substring, and an
   author surname that does not appear at all is disqualifying
   rather than merely unhelpful. Open Library's search happily
   returns study guides, abridgements and unrelated books that
   share a word, so a threshold is not optional. */
export const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const surname = (author) => norm(author).split(' ').filter(Boolean).pop() || '';
const bare = (t) => norm(t).replace(/^(the|a|an) /, '');

export function scoreDoc(book, doc) {
  const t = bare(doc.title);
  const want = bare(String(book.title).replace(/[:;–—].*$/, ''));
  if (!t || !want) return -1;
  let score = 0;
  if (t === want) score += 100;
  else if (t.startsWith(want) || want.startsWith(t)) score += 55;
  else if (t.includes(want) && want.length > 8) score += 25;
  else return -1;

  const authors = norm((doc.author_name || []).join(' '));
  const sn = surname(book.author);
  if (sn && authors.includes(sn)) score += 50;
  else if (authors) return -1;              /* right title, wrong book */

  if (book.year && doc.first_publish_year) {
    score -= Math.min(18, Math.abs(doc.first_publish_year - book.year) / 4);
  }
  if (doc.number_of_pages_median) score += 4;
  return score;
}

/** The bar a candidate has to clear before its facts are believed. */
export const MIN_SCORE = 95;

/* ── the three calls ───────────────────────────────────────────*/

export async function searchWork({ title, author, year } = {}) {
  const q = `${title} ${author}`.trim();
  if (!q) return null;
  const url = `${BASE}/search.json?q=${encodeURIComponent(q)}&fields=${SEARCH_FIELDS}&limit=5`;
  const j = await get(url);
  const docs = j?.docs || [];
  const best = docs
    .map((d) => ({ d, score: scoreDoc({ title, author, year }, d) }))
    .filter((x) => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)[0];
  return best ? { ...best.d, score: best.score } : null;
}

/** Description and subjects for a work key like `/works/OL20893680W`. */
export async function workDetail(key) {
  if (!key) return null;
  const j = await get(`${BASE}${key}.json`);
  if (!j) return null;
  const d = j.description;
  return {
    description: typeof d === 'string' ? d : d?.value || null,
    subjects: Array.isArray(j.subjects) ? j.subjects : [],
  };
}

/* An ISBN-13 carries its own check digit, and Open Library's records are
   user-edited: `0345254864195` is 13 digits, is on a real work, and is not an
   ISBN — it is an ISBN-10 with three characters stuck on the end. Thirteen
   digits is not the test; the check digit is. One got through before this
   was here, out of 2,146. */
export function validIsbn13(s) {
  const d = String(s || '').replace(/[^0-9]/g, '');
  if (!/^\d{13}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(d[12]);
}

const isbn13Of = (rec) => {
  const s = (rec?.isbn_13 || []).map((x) => String(x).replace(/-/g, '')).find(validIsbn13);
  return s || null;
};
const descOf = (rec) => {
  const d = rec?.description;
  return typeof d === 'string' ? d : d?.value || null;
};

/**
 * Pick ONE edition of a work and read its ISBN-13 — attributed to that
 * edition, which is the whole point — plus its own description if it has one.
 * (Only about half of Open Library's works carry a description and the
 * edition often does when the work does not, so taking both out of a request
 * we are already paying for is free coverage.)
 *
 * Why the whole edition list and not `search.json`'s matched edition: the
 * search join hands back one edition and takes no notice of language. That
 * put a Spanish ISBN on Anathem, a Serbian one on Austerlitz and a German one
 * on Consider the Lobster — every one of them a real ISBN for a real edition,
 * and every one of them a link that lands an English-speaking reader on a
 * book they cannot read. Not fabricated, just wrong, which is its own kind of
 * bad. Same judgement server/hardcover.js's pickEdition() makes (§8.4):
 * English first, then one that actually has an ISBN, then the fullest record.
 */
export async function editionDetail(workOrEditionKey) {
  if (!workOrEditionKey) return null;

  /* A search doc's `key` is normally a work (/works/OL…W) but is occasionally
     an edition (/books/OL…M). Only a work has an editions list. */
  if (!workOrEditionKey.startsWith('/works/')) {
    const j = await get(`${BASE}${workOrEditionKey}.json`);
    return j ? { isbn13: isbn13Of(j), description: descOf(j) } : null;
  }

  const j = await get(`${BASE}${workOrEditionKey}/editions.json?limit=30`);
  const entries = j?.entries || [];
  if (!entries.length) return null;

  const rank = (e) => {
    let s = 0;
    const langs = (e.languages || []).map((l) => String(l.key || l));
    if (langs.some((l) => /eng/i.test(l))) s += 100;
    else if (langs.length) s -= 60;
    if (isbn13Of(e)) s += 50;
    if (descOf(e)) s += 8;
    if (e.number_of_pages) s += 4;
    return s;
  };
  const best = entries.slice().sort((a, b) => rank(b) - rank(a))[0];
  const withIsbn = entries.filter((e) => isbn13Of(e)).sort((a, b) => rank(b) - rank(a))[0];
  const pick = withIsbn || best;
  /* Last guard, and it is the one that matters: if the best edition anyone
     has recorded is explicitly in another language, hand back NO ISBN rather
     than one that lands an English reader on a German paperback. This shop
     buys in English; absent beats wrong, here as everywhere else. It fires
     when the search matched a translation's own work record — Consider the
     Lobster resolves to a Kiepenheuer & Witsch edition and nothing else. */
  const langs = (pick?.languages || []).map((l) => String(l.key || l));
  const foreign = langs.length > 0 && !langs.some((l) => /eng/i.test(l));
  return {
    isbn13: foreign ? null : isbn13Of(pick),
    description: descOf(best) || descOf(withIsbn),
  };
}

/* ── descriptions ──────────────────────────────────────────────
   Open Library descriptions are user-edited wiki text: they carry
   markdown links, "([source][1])" footers, review quotes and the
   occasional table of contents. Take the opening prose and stop —
   a blurb the reader will not finish is worse than a short one. */
export function cleanDescription(raw, max = 460) {
  if (!raw) return null;
  let s = String(raw);
  s = s.replace(/\r/g, '');
  s = s.split(/\n\s*(?:-{3,}|\*{3,}|_{3,})\s*\n/)[0];            // horizontal rule
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');                  // [text](url)
  s = s.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');                 // [text][ref]
  s = s.replace(/^\s*\[\d+\]:.*$/gm, '');                         // link definitions
  s = s.replace(/https?:\/\/\S+/g, '');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/^\s*&gt;\s*|^\s*>\s*/gm, '');            // quoted-blurb markers
  s = s.replace(/\*\*|__|\*|`/g, '');
  s = s.replace(/^\s*(source|contains|includes|contributor notes?|from the publisher)\s*:.*$/gim, '');
  s = s.replace(/\(\s*\)/g, '').replace(/[ \t]+/g, ' ');
  /* first paragraph only */
  s = s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)[0] || '';
  s = s.replace(/\n+/g, ' ').trim();
  if (!s || s.length < 40) return null;
  if (s.length > max) {
    const cut = s.slice(0, max);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    s = stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '') + '…';
  }
  return s.trim();
}

/* ── the public shape, matching server/hardcover.js ──────────── */

const store = cache('openlibrary');

/**
 * { isbn13, pages, year, description, subjects, olWork, source }.
 * `source` is 'live' when Open Library answered with a confident match and
 * 'miss' otherwise. Never throws: an upstream failure is a miss, reported.
 */
export async function lookupBook({ title, author, year, withIsbn = true } = {}) {
  const empty = { isbn13: null, pages: null, year: null, description: null, subjects: [], olWork: null, source: 'miss' };
  if (!ENABLED || !title || !author) return empty;

  const key = cacheKey(title, author);
  const cached = store.get(key);
  if (cached && (!withIsbn || cached.isbn13 || cached.isbnTried)) return cached;

  let entry;
  try {
    const doc = await searchWork({ title, author, year });
    if (!doc) {
      entry = empty;
    } else {
      const detail = await workDetail(doc.key);
      const editionKey = doc.editions?.docs?.[0]?.key || null;
      const ed = withIsbn ? await editionDetail(doc.key || editionKey) : null;
      entry = {
        isbn13: ed?.isbn13 || null,
        isbnTried: !!withIsbn,
        isbnFrom: withIsbn ? 'editions' : undefined,
        /* kept so a later pass can fetch the ISBN alone, without paying for
           the search and the work record a second time */
        editionKey,
        pages: doc.number_of_pages_median || null,
        year: doc.first_publish_year || null,
        description: cleanDescription(detail?.description) || cleanDescription(ed?.description),
        /* the router's only genre signal, and a fetched one — capped
           because a popular work can carry several hundred */
        subjects: [...new Set([...(doc.subject || []), ...(detail?.subjects || [])])].slice(0, 24),
        olWork: doc.key,
        source: 'live',
        score: doc.score,
      };
    }
  } catch (err) {
    entry = { ...empty, error: err.message };
  }

  if (entry.source === 'live') store.set(key, entry);
  return entry;
}

/**
 * Fill in the ISBN for an entry already cached without one — one edition
 * request, no repeat of the search or the work record. Returns the updated
 * entry, or the entry unchanged when there is nothing to fetch.
 */
export async function fillIsbn(title, author) {
  const key = cacheKey(title, author);
  const entry = store.get(key);
  /* isbnFrom marks an entry resolved through the language-aware editions
     list. An older entry that was `isbnTried` against the search's own
     unattributed edition pick is re-resolved rather than trusted. */
  if (!entry || entry.isbnFrom === 'editions') return entry;
  const key2 = entry.olWork || entry.editionKey;
  if (!key2) return entry;
  let ed = null;
  try { ed = await editionDetail(key2); } catch { /* a miss, reported as absent */ }
  const next = {
    ...entry,
    isbn13: ed?.isbn13 || null,
    /* the work had no description; the edition may */
    description: entry.description || cleanDescription(ed?.description),
    isbnTried: true,
    isbnFrom: 'editions',
  };
  store.set(key, next);
  return next;
}

export const olCache = store;
export { cacheKey };
