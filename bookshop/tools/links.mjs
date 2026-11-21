#!/usr/bin/env node
/* ============================================================
   PLAN-LINKS.md, step 1. Read that file before touching this one —
   it documents the measurements (78% of old preview links landed on
   "No preview available") that this tool exists to stop repeating.

     node tools/links.mjs verify [--limit N] [--only <pass>]
     node tools/links.mjs apply
     node tools/links.mjs report

   ── What each command does ────────────────────────────────────
   verify  Runs four passes, cheapest and most reliable first —
           google, openlibrary, bookshop, bwb — writing answers to
           data/cache/links.json. Resumable: a book already fresh
           for a given pass (has that field as its own property,
           object or `null`, from a prior run) is skipped, so an
           interrupted sweep picks up where it left off. --limit N
           caps how many NEW books each pass resolves this run;
           --only <pass> runs a single pass instead of all four.
   apply   Reads data/cache/links.json and ALL_BOOKS (src/js/shop.js)
           and writes src/js/data/linkfacts.js, keyed by book id. No
           network.
   report  Coverage counts from the applied linkfacts.js, plus the
           list of books where neither bookshop.org nor Better World
           Books is confirmed in stock — the thing PLAN-LINKS.md asks
           to have surfaced by name.

   ── The rule this file exists to enforce ──────────────────────
   A transport failure — a timeout, a 403, a 503, a JSONP payload
   that doesn't parse — is not an answer and must never be cached.
   Only a real upstream response gets written: `found: false` is an
   answer; Cloudflare turning you away is not. Same rule documented
   at the top of server/cache.js, just applied to a case that bites
   harder here because two of these four passes (bookshop, bwb) are
   behind Cloudflare and WILL 403 under load — caching that as "not
   in stock" would hide a real link, which is the exact bug this
   phase exists to fix, inverted.

   ── Traps (PLAN-LINKS.md §4) ───────────────────────────────────
   - books.google.com/books?jscmd=viewapi needs no key and accepts a
     BARE Google volume id as a bibkey, not just ISBN:/OCLC: ones —
     that's what makes checking a candidate id cheap, and it's not
     documented anywhere obvious. googleapis.com/books/v1 is a
     different service: it needs a key and 503s from many IPs
     (reproduced from this very box while building this file) — it
     is only ever an optional widening, gated on its own first
     response being OK, never load-bearing.
   - The viewapi response is JSONP. Parse it by slicing between the
     first `{` and the last `}` and JSON.parse-ing that slice — never
     regex it, the payload contains `}` inside string values (URLs
     with query strings, mostly).
   - A 403 from bookshop.org or Better World Books is not a "no". The
     moment either pass sees one, it stops and records nothing
     further for that pass this run, rather than writing false
     negatives for every book behind it in the queue.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { cache, cacheKey } from '../server/cache.js';
import { validIsbn13 } from '../server/openlibrary.js';
import { loadDotEnv } from '../server/env.js';
import { ALL_BOOKS } from '../src/js/shop.js';

loadDotEnv();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINKFACTS_PATH = path.join(ROOT, 'src/js/data/linkfacts.js');
const DESCRIBE_PATH = path.join(ROOT, 'data/cache/describe.json');

const UA = 'the-nowhere-bookshop/1.0 (a curated bookshop site; contact jesperhodge@gmail.com)';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const GOOGLE_KEY = process.env.GOOGLE_BOOKS_KEY || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(3);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i > -1 && args[i + 1] ? args[i + 1] : d; };

const store = cache('links');

/* describe.json — read-only here, same file tools/describe.mjs owns.
   Its google.url (only ever present when describe.mjs's own Google
   Books lookup accepted a match) is one more source of a candidate
   volume id, alongside a book's own blurbUrl. */
let DESCRIBE = {};
if (fs.existsSync(DESCRIBE_PATH)) {
  try { DESCRIBE = JSON.parse(fs.readFileSync(DESCRIBE_PATH, 'utf8')); } catch { DESCRIBE = {}; }
}

/** ISBN-13, checksum-validated (reused from server/openlibrary.js rather
    than re-implementing the check-digit arithmetic a second time), or null. */
function isbnOf(b) {
  const digits = String(b.isbn || '').replace(/[^0-9]/g, '');
  return digits.length === 13 && validIsbn13(digits) ? digits : null;
}

const hasField = (rec, field) => !!rec && Object.prototype.hasOwnProperty.call(rec, field);

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/* ── Google Books ──────────────────────────────────────────────
   Candidate volume ids per book, priority order: an id already
   parsed out of the book's own blurbUrl, then one out of
   describe.json's google.url, then the book's ISBN — last, because
   an ISBN-keyed lookup resolves to the specific edition record for
   that ISBN, almost always a noview metadata stub (PLAN-LINKS.md
   §1's whole diagnosis), while the other two came from a source that
   already found a *readable* Google Books page for this exact book. */

function gbIdFromUrl(url) {
  if (!url || typeof url !== 'string' || !url.includes('books.google.com')) return null;
  const m = url.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

function gbCandidateIds(book, describeRec) {
  const ids = [];
  const fromBlurb = gbIdFromUrl(book.blurbUrl);
  if (fromBlurb) ids.push(fromBlurb);
  const fromDescribe = gbIdFromUrl(describeRec?.google?.url);
  if (fromDescribe && !ids.includes(fromDescribe)) ids.push(fromDescribe);
  return ids;
}

/** JSONP → object. Slice between the first `{` and the last `}`, then
    JSON.parse that slice. Do NOT regex this payload: preview_url and
    info_url are full URLs with query strings, so `}` shows up inside
    string values and a regex extraction would truncate on the first
    one it meets, not the real close. */
function parseJsonp(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('unexpected JSONP response shape');
  return JSON.parse(text.slice(start, end + 1));
}

async function fetchViewapiBatch(bibkeys) {
  const url = `https://books.google.com/books?jscmd=viewapi&bibkeys=${bibkeys.join(',')}&callback=cb`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseJsonp(await res.text());
}

/** Batches of 20, ~700ms apart (PLAN-LINKS.md §3). A batch that fails
    (timeout, non-200, bad JSONP) taints every bibkey inside it rather
    than the whole run — those bibkeys are reported as unresolved
    below and left uncached, not treated as "not found". */
async function queryViewapiBatched(flatKeys) {
  const responses = {};
  const failedKeys = new Set();
  for (const part of chunk([...flatKeys], 20)) {
    if (!part.length) continue;
    try {
      Object.assign(responses, await fetchViewapiBatch(part));
    } catch (err) {
      console.log(`  google viewapi batch failed (${err.message}) — ${part.length} bibkey(s) left unresolved this run`);
      for (const k of part) failedKeys.add(k);
    }
    await sleep(700);
  }
  return { responses, failedKeys };
}

/** The volume id a viewapi entry actually resolved to. A bare-id bibkey
    already IS the volume id; an ISBN:/OCLC: bibkey only tells you which
    edition was asked about, so the matched volume id has to be pulled
    out of the entry's own info_url/preview_url instead. */
function idFromViewapiEntry(entry, bibkey) {
  if (!/^(ISBN|OCLC|LCCN):/.test(bibkey)) return bibkey;
  return gbIdFromUrl(entry.info_url || entry.preview_url || '');
}

/** First candidate whose preview is partial/full wins. If none do, the
    first candidate that got ANY answer (even noview, even "not in
    Google Books at all" — i.e. no entry) still counts as this book
    having been checked, and is recorded as the fallback — see the
    widowland example in PLAN-LINKS.md §2.1: gb.preview can legitimately
    be "noview". `tainted` means at least one candidate's batch failed;
    a book left with no winner/fallback AND tainted must not be cached
    at all — we don't know what the failed candidate would have said. */
function pickGoogleWinner(bibkeys, responses, failedKeys) {
  let fallback = null, tainted = false;
  for (const bk of bibkeys) {
    if (failedKeys.has(bk)) { tainted = true; continue; }
    const entry = responses[bk];
    if (!entry) continue; // queried fine; Google simply has nothing for this key
    const id = idFromViewapiEntry(entry, bk);
    if (!id) continue;
    const rec = { id, preview: entry.preview || 'noview' };
    if (!fallback) fallback = rec;
    if (rec.preview === 'partial' || rec.preview === 'full') return { winner: rec, tainted };
  }
  return { winner: null, fallback, tainted };
}

/** Optional widening (PLAN-LINKS.md §3.1): googleapis.com/books/v1 needs
    GOOGLE_BOOKS_KEY and 503s from many IPs — measured straight from this
    box while writing this file. Gated on the key being present AND the
    very first real widen request succeeding; the moment one fails, no
    more are attempted this run. Never throws past this function. */
async function googleWiden(book) {
  const q = `intitle:"${book.title}" inauthor:"${book.author}"`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&key=${GOOGLE_KEY}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return (j.items || []).map((it) => it.id).filter(Boolean);
}

async function passGoogle(limit) {
  const todo = [];
  for (const b of ALL_BOOKS) {
    const key = cacheKey(b.title, b.author);
    if (hasField(store.get(key), 'gb')) continue;
    todo.push({ book: b, key, isbn: isbnOf(b) });
  }
  const batch = todo.slice(0, limit);
  console.log(`google: ${todo.length} book(s) unresolved${Number.isFinite(limit) ? `, running ${batch.length}` : ''}`);
  console.log(GOOGLE_KEY ? 'GOOGLE_BOOKS_KEY set — widening may run for books viewapi alone can\'t resolve' : 'GOOGLE_BOOKS_KEY not set — viewapi only, no widening');
  if (!batch.length) return;

  const perBook = new Map(); // book.id -> bibkeys[]
  const flatKeys = new Set();
  let zeroCandidate = 0;
  for (const t of batch) {
    const ids = gbCandidateIds(t.book, DESCRIBE[t.key]);
    const bibkeys = t.isbn ? [...ids, `ISBN:${t.isbn}`] : ids;
    perBook.set(t.book.id, bibkeys);
    if (!bibkeys.length) zeroCandidate++;
    for (const k of bibkeys) flatKeys.add(k);
  }

  const { responses, failedKeys } = await queryViewapiBatched(flatKeys);

  /* Widening: only for books viewapi alone left without a partial/full
     winner, and only while the widen endpoint keeps answering. */
  const widenIds = new Map(); // book.id -> extra bibkeys[]
  let widenDisabled = !GOOGLE_KEY, widenAttempted = 0;
  for (const t of batch) {
    if (widenDisabled) break;
    const { winner } = pickGoogleWinner(perBook.get(t.book.id), responses, failedKeys);
    if (winner) continue;
    widenAttempted++;
    try {
      const ids = await googleWiden(t.book);
      if (ids.length) widenIds.set(t.book.id, ids);
    } catch (err) {
      console.log(`  google books v1 widen failed (${err.message}) — widening disabled for the rest of this run`);
      widenDisabled = true;
      break;
    }
    await sleep(500);
  }

  let widenResponses = {}, widenFailedKeys = new Set();
  if (widenIds.size) {
    const flatWiden = new Set();
    for (const ids of widenIds.values()) for (const id of ids) flatWiden.add(id);
    ({ responses: widenResponses, failedKeys: widenFailedKeys } = await queryViewapiBatched(flatWiden));
  }

  let full = 0, partial = 0, noview = 0, notInGoogle = 0, skippedTransport = 0, sinceFlush = 0;
  for (const t of batch) {
    const bibkeys = [...perBook.get(t.book.id), ...(widenIds.get(t.book.id) || [])];
    const combinedResponses = { ...responses, ...widenResponses };
    const combinedFailed = new Set([...failedKeys, ...widenFailedKeys]);
    const { winner, fallback, tainted } = pickGoogleWinner(bibkeys, combinedResponses, combinedFailed);
    if (!winner && !fallback && tainted) { skippedTransport++; continue; }

    const rec = store.get(t.key) || {};
    if (t.isbn) rec.isbn = t.isbn;
    rec.gb = winner || fallback || null;
    store.set(t.key, rec);
    sinceFlush++;

    if (winner?.preview === 'full') full++;
    else if (winner?.preview === 'partial') partial++;
    else if (rec.gb) noview++;
    else notInGoogle++;

    if (sinceFlush >= 20) { store.flush(); sinceFlush = 0; }
  }
  store.flush();
  console.log(`google: +${partial} partial, +${full} full, ${noview} in Google Books but not previewable, `
    + `${notInGoogle} not in Google Books at all, ${zeroCandidate} with no candidate to check, `
    + `${skippedTransport} left unresolved after a transport failure, widen attempted for ${widenAttempted} book(s)`);
}

/* ── Open Library ─────────────────────────────────────────────
   openlibrary.org/api/books, plain JSON (unlike Google's JSONP),
   batched by ISBN. Only books with a valid ISBN-13 are targets —
   there is no other bibkey to ask this API about, so a book with
   none simply never gets an `ol` field, forever, which is exactly
   the "absent = unverified" state src/js/data/linkfacts.js wants. */
async function passOpenLibrary(limit) {
  const todo = [];
  for (const b of ALL_BOOKS) {
    const isbn = isbnOf(b);
    if (!isbn) continue;
    const key = cacheKey(b.title, b.author);
    if (hasField(store.get(key), 'ol')) continue;
    todo.push({ book: b, key, isbn });
  }
  const batch = todo.slice(0, limit);
  console.log(`openlibrary: ${todo.length} book(s) with an isbn unresolved${Number.isFinite(limit) ? `, running ${batch.length}` : ''}`);
  if (!batch.length) return;

  let found = 0, notFound = 0, ebook = 0, sinceFlush = 0;
  for (const part of chunk(batch, 20)) {
    const bibkeys = part.map((t) => `ISBN:${t.isbn}`);
    let j;
    try {
      const url = `https://openlibrary.org/api/books?bibkeys=${bibkeys.join(',')}&format=json&jscmd=data`;
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      j = await res.json();
    } catch (err) {
      console.log(`  openlibrary batch failed (${err.message}) — ${part.length} book(s) left unresolved this run`);
      await sleep(500);
      continue;
    }
    for (const t of part) {
      const entry = j[`ISBN:${t.isbn}`];
      const rec = store.get(t.key) || {};
      rec.isbn = t.isbn;
      const hasEbook = !!(entry && Array.isArray(entry.ebooks) && entry.ebooks.length);
      rec.ol = { found: !!entry, ebook: hasEbook };
      store.set(t.key, rec);
      entry ? found++ : notFound++;
      if (hasEbook) ebook++;
      sinceFlush++;
    }
    if (sinceFlush >= 20) { store.flush(); sinceFlush = 0; }
    await sleep(500);
  }
  store.flush();
  console.log(`openlibrary: ${found} found (${ebook} with a lendable ebook), ${notFound} not found`);
}

/* ── Bookshop / Better World Books ────────────────────────────
   Both behind Cloudflare — a plain fetch gets a 403 challenge page
   even with a browser User-Agent (verified from this box), so these
   two need real Playwright Chromium. 200 vs 404 is the stock signal
   for both (PLAN-LINKS.md §1/§3); the moment either sees a 403, the
   pass stops dead and records nothing further, rather than writing
   false "not stocked" answers for every book still in its queue. */

async function launchBrowser() {
  return chromium.launch(process.env.PW_CHROMIUM
    ? { executablePath: process.env.PW_CHROMIUM, headless: true }
    : { headless: true });
}

async function runScrapePass({ field, name, urlFor, limit, paceMs = 3000 }) {
  const todo = [];
  for (const b of ALL_BOOKS) {
    const isbn = isbnOf(b);
    if (!isbn) continue;
    const key = cacheKey(b.title, b.author);
    if (hasField(store.get(key), field)) continue;
    todo.push({ book: b, key, isbn });
  }
  const batch = todo.slice(0, limit);
  console.log(`${name}: ${todo.length} book(s) with an isbn unresolved${Number.isFinite(limit) ? `, running ${batch.length}` : ''}`);
  if (!batch.length) return;

  const browser = await launchBrowser();
  const ctx = await browser.newContext({ userAgent: DESKTOP_UA });
  const page = await ctx.newPage();

  let inStock = 0, notStocked = 0, processed = 0, sinceFlush = 0, aborted = false;
  for (const t of batch) {
    let status = null;
    try {
      const res = await page.goto(urlFor(t.isbn), { waitUntil: 'domcontentloaded', timeout: 20000 });
      status = res ? res.status() : null;
    } catch (err) {
      console.log(`  ${name}: ${t.book.id} — navigation failed (${err.message}), skipping without caching`);
      await sleep(paceMs);
      continue;
    }

    if (status === 403) {
      console.log(`  ${name}: got a 403 (Cloudflare) at ${t.book.id} — stopping this pass, recording nothing further`);
      aborted = true;
      break;
    }
    if (status !== 200 && status !== 404) {
      console.log(`  ${name}: ${t.book.id} — unexpected HTTP ${status}, skipping without caching`);
      await sleep(paceMs);
      continue;
    }

    const rec = store.get(t.key) || {};
    rec.isbn = t.isbn;
    rec[field] = { found: status === 200 };
    store.set(t.key, rec);
    status === 200 ? inStock++ : notStocked++;
    processed++;
    sinceFlush++;
    if (sinceFlush >= 10) { store.flush(); sinceFlush = 0; }
    await sleep(paceMs);
  }
  store.flush();
  await browser.close();
  console.log(`${name}: ${inStock} in stock, ${notStocked} not stocked, ${processed} checked${aborted ? ' — stopped early on a 403' : ''}`);
}

const passBookshop = (limit) => runScrapePass({
  field: 'bs', name: 'bookshop',
  urlFor: (isbn) => `https://bookshop.org/book/${isbn}`,
  limit,
});

const passBWB = (limit) => runScrapePass({
  field: 'bwb', name: 'bwb',
  urlFor: (isbn) => `https://www.betterworldbooks.com/product/detail/-${isbn}`,
  limit,
});

/* ── commands ──────────────────────────────────────────────── */

const PASS_ORDER = ['google', 'openlibrary', 'bookshop', 'bwb'];

async function cmdVerify() {
  const limit = Number(opt('limit', Infinity));
  const only = opt('only', null);
  const PASSES = { google: passGoogle, openlibrary: passOpenLibrary, bookshop: passBookshop, bwb: passBWB };

  if (only && !PASSES[only]) {
    console.error(`unknown pass "${only}" — expected one of ${PASS_ORDER.join(', ')}`);
    process.exit(1);
  }
  const order = only ? [only] : PASS_ORDER;

  store.defer();
  const onInterrupt = () => { console.log('\ninterrupted — flushing what has been resolved so far…'); store.flush(); process.exit(130); };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onInterrupt);

  for (const p of order) await PASSES[p](limit);

  store.flush();
  process.off('SIGINT', onInterrupt);
  process.off('SIGTERM', onInterrupt);
}

const FIELD_ORDER = ['gb', 'gbf', 'ol', 'olb', 'bs', 'bwb'];
const keyFor = (id) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(id) ? id : JSON.stringify(id));

const BANNER = `/* ============================================================
   GENERATED — do not hand-edit. Rewritten by
     node tools/links.mjs apply
   from data/cache/links.json, itself built by
     node tools/links.mjs verify [--limit N] [--only <pass>]

   Per-book facts about where a book can actually be read or bought,
   each one verified against the real upstream at build time — never
   guessed from an ISBN (see PLAN-LINKS.md §1 for why that guess was
   the bug). Keyed by book id, like enrich.js.

     gb   Google Books volume id, present only when its preview is
          verified partial or full. Absent ⇒ no preview link — this
          field fails CLOSED (src/js/links.js), the one exception to
          the rule below, because an unverified preview link is the
          whole reason this file exists.
     gbf  1 when that preview is the full text, not just partial.
     ol   1 Open Library has the record, 0 confirmed absent.
     olb  1 when it's additionally borrowable/readable at Internet
          Archive.
     bs   1/0 — bookshop.org stock.
     bwb  1/0 — Better World Books stock.

   Every field but gb fails OPEN: 0 means "we asked and it isn't
   there" (hide the link); absent means "we never got an answer"
   (show it anyway). PLAN-LINKS.md §2.2 is the source of truth for
   this table if the two ever disagree.
   ============================================================ */`;

async function cmdApply() {
  const out = {};
  let n = 0;
  for (const b of ALL_BOOKS) {
    const rec = store.get(cacheKey(b.title, b.author));
    if (!rec) continue;

    const f = {};
    if (rec.gb && (rec.gb.preview === 'partial' || rec.gb.preview === 'full')) {
      f.gb = rec.gb.id;
      if (rec.gb.preview === 'full') f.gbf = 1;
    }
    if (rec.ol) {
      f.ol = rec.ol.found ? 1 : 0;
      if (rec.ol.found && rec.ol.ebook) f.olb = 1;
    }
    if (rec.bs) f.bs = rec.bs.found ? 1 : 0;
    if (rec.bwb) f.bwb = rec.bwb.found ? 1 : 0;

    if (Object.keys(f).length) { out[b.id] = f; n++; }
  }

  let body = `${BANNER}\n\nexport const LINKFACTS = {\n`;
  for (const id of Object.keys(out).sort()) {
    const f = out[id];
    const parts = FIELD_ORDER
      .filter((k) => f[k] !== undefined)
      .map((k) => `${k}: ${typeof f[k] === 'string' ? JSON.stringify(f[k]) : f[k]}`);
    body += `  ${keyFor(id)}: { ${parts.join(', ')} },\n`;
  }
  body += '};\n';

  fs.writeFileSync(LINKFACTS_PATH, body);
  console.log(`apply: ${n} book(s) written to src/js/data/linkfacts.js (of ${ALL_BOOKS.length} total)`);
}

async function cmdReport() {
  if (!fs.existsSync(LINKFACTS_PATH)) {
    console.error('src/js/data/linkfacts.js does not exist yet — run `node tools/links.mjs apply` first.');
    process.exit(1);
  }
  const { LINKFACTS } = await import(pathToFileURL(LINKFACTS_PATH).href);

  let gb = 0, gbf = 0, ol1 = 0, ol0 = 0, olb = 0, bs1 = 0, bs0 = 0, bwb1 = 0, bwb0 = 0;
  const noShop = [];
  for (const b of ALL_BOOKS) {
    const f = LINKFACTS[b.id];
    if (!f) continue;
    if (f.gb) { gb++; if (f.gbf) gbf++; }
    if (f.ol === 1) ol1++; else if (f.ol === 0) ol0++;
    if (f.olb) olb++;
    if (f.bs === 1) bs1++; else if (f.bs === 0) bs0++;
    if (f.bwb === 1) bwb1++; else if (f.bwb === 0) bwb0++;
    if (f.bs === 0 && f.bwb === 0) noShop.push(b);
  }

  const total = ALL_BOOKS.length;
  console.log(`books: ${total}`);
  console.log(`  google preview:      ${gb} verified (${gbf} full text), ${total - gb} unverified/no preview`);
  console.log(`  open library record: ${ol1} found, ${ol0} confirmed absent, ${olb} with a lendable ebook, ${total - ol1 - ol0} unverified`);
  console.log(`  bookshop.org stock:  ${bs1} in stock, ${bs0} confirmed not stocked, ${total - bs1 - bs0} unverified`);
  console.log(`  better world books:  ${bwb1} in stock, ${bwb0} confirmed not stocked, ${total - bwb1 - bwb0} unverified`);
  console.log('');
  if (noShop.length) {
    console.log(`no shopping link resolves anywhere for ${noShop.length} book(s) — `
      + 'bookshop.org and Better World Books both confirmed not stocked:');
    for (const b of noShop) console.log(`  ${b.id}  —  ${b.title} / ${b.author}`);
  } else {
    console.log('no book is confirmed unavailable at both bookshop.org and Better World Books.');
  }
}

/* ── main ──────────────────────────────────────────────────── */

const cmd = process.argv[2];
const COMMANDS = { verify: cmdVerify, apply: cmdApply, report: cmdReport };
if (COMMANDS[cmd]) {
  await COMMANDS[cmd]();
} else {
  console.error('usage: node tools/links.mjs <verify|apply|report> [--limit N] [--only google|openlibrary|bookshop|bwb]');
  process.exit(1);
}
