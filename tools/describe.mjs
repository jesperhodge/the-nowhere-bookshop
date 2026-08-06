#!/usr/bin/env node
/* ============================================================
   Phase 11: backfilling the 1,105 generated books that have no
   blurb. DESCRIPTIONS-FEASIBILITY.md is the spec — read that
   before touching this file, and do not re-probe the APIs it
   measured; the numbers cost an afternoon.

     NODE_USE_ENV_PROXY=1 node tools/describe.mjs run    [--limit N] [--force]
                          node tools/describe.mjs apply
                          node tools/describe.mjs report
                          node tools/describe.mjs selftest

   NODE_USE_ENV_PROXY=1 is not optional — see IMPLEMENTATION.md
   §8.2. Node's built-in fetch ignores https_proxy without it and
   fails with a flat 403 that reads exactly like an auth problem.

   ── What each command does ────────────────────────────────────
   run     Walks every generated book with no `blurb`, tries
           Google Books, then Wikipedia, then Wikidata (in that
           order, each recording what it did — see below), and
           writes results to data/cache/describe.json. Resumable:
           a source already attempted for a book is not attempted
           again unless --force. Calls `apply` itself when done.
   apply   Reads data/cache/describe.json and src/js/data/generated/
           and merges accepted results onto the book objects that
           still lack them, then rewrites the generated files. No
           network. This is the command to re-run if
           `harvest.mjs shelve` is run again later and wipes
           src/js/data/generated/ — shelve does not know about this
           tool, but the store does, and applying it back costs
           nothing.
   report  Counts, by source, from the generated files as they
           stand right now.
   selftest
           Runs pickGoogleMatch()/cleanDescription() against the
           committed fixture in tools/fixtures/ — the only way to
           exercise the Google Books path here, since the live
           endpoint 429s from this sandbox at any pacing.

   ── The rule this file exists to enforce ──────────────────────
   Never fabricate or paraphrase a description from memory. Every
   stored blurb came out of a response this tool actually fetched;
   every stored fact the same. A missing blurb is fine — 1,105 of
   them were already missing before this ran — and a fabricated
   one is a lie that outlives the session. If nothing verifiable
   was found, the book keeps no blurb and the UI's job (book.js)
   is to stop apologising about that, not to paper over it.

   ── Source order ───────────────────────────────────────────────
   1. Google Books — primary. Gated on GOOGLE_BOOKS_KEY; skipped
      cleanly (and cheaply — no request at all) when absent, so it
      costs nothing on this box and does most of the work on the
      owner's, who has 1,000 free requests/day and no IP block.
   2. Wikipedia — behind a strict verification gate, because its
      search is measured at ~1 correct in 10 (see the doc: it
      offered "List of Father Ted characters" for a novel and the
      author's own page for another). verifyWikipediaCandidate()
      rejects disambiguation pages, pages titled like the author,
      pages titled like an award, pages that read as a screen
      adaptation, and anything whose extract does not independently
      confirm the title, the author's surname AND a work-shaped
      phrase ("novel", "memoir", "stories"…). Expect it to reject
      most candidates — that is the gate working.
   3. Wikidata — a one-line fact ("1982 novel by Gene Wolfe"),
      stored in its own `fact` field, never as `blurb`. It is a
      fact, not a description, and must never be rendered as if a
      publisher wrote it.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cache, cacheKey } from '../server/cache.js';
import { cleanDescription, validIsbn13 } from '../server/openlibrary.js';
import { loadDotEnv } from '../server/env.js';

loadDotEnv();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN_DIR = path.join(ROOT, 'src/js/data/generated');
const RAW_DIR = path.join(ROOT, 'data/cache/describe');

const UA = 'the-nowhere-bookshop/1.0 (a curated bookshop site; contact jesperhodge@gmail.com)';
const GOOGLE_KEY = process.env.GOOGLE_BOOKS_KEY || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(3);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i > -1 && args[i + 1] ? args[i + 1] : d; };

/* ── text helpers, same normalisation as the rest of the pipeline
   (tools/harvest.mjs, server/openlibrary.js, server/cache.js each
   keep their own copy rather than share one — a small, deliberate
   duplication already established in this repo). ─────────────── */

const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const lastWord = (s) => { const p = norm(s).split(' ').filter(Boolean); return p[p.length - 1] || ''; };

/** Title for comparison: subtitle and a trailing "(novel)"-style disambiguator
    dropped, leading article dropped, then normalised. Applied identically to
    the book's own title and to every candidate, so "Book Title: A Novel"
    matches a Wikipedia page titled "Book Title (novel)". */
const bareTitle = (t) => norm(
  String(t || '').replace(/[:;–—].*$/, '').replace(/\s*\([^)]*\)\s*$/, ''),
).replace(/^(the|a|an) /, '');

/* ── raw response cache: one file per fetch, under data/cache/describe/,
   gitignored (regenerable from the same URL) — mirrors WIKI_CACHE in
   tools/harvest.mjs. The derived, committed record lives separately in
   data/cache/describe.json (via server/cache.js's cache()), same footing
   as openlibrary.json and harvest-attempts.json. ────────────────────── */

function rawCachePath(source, key) {
  const dir = path.join(RAW_DIR, source);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${key.replace(/[^\w]+/g, '_').slice(0, 150)}.json`);
}

const netCalls = { google: 0, wikipedia: 0, wikidata: 0 };

/** Paced, disk-cached, 429-retrying GET → parsed JSON. Sleeps only after a
    real fetch, never on a cache hit, so a re-run that has already resolved
    everything finishes in the time it takes to read JSON off disk. */
async function fetchJSONCached(source, url, cacheFile, { paceMs = 1200, retries = 2 } = {}) {
  if (fs.existsSync(cacheFile)) {
    try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* refetch */ }
  }
  for (let attempt = 0; ; attempt++) {
    netCalls[source]++;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.status === 429) {
      if (attempt >= retries) throw new Error('429 after retries');
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    fs.writeFileSync(cacheFile, JSON.stringify(j));
    await sleep(paceMs);
    return j;
  }
}

/* ── Google Books ──────────────────────────────────────────────
   Primary source, gated on a key. When there is no key this never
   makes a request — the feasibility doc measured 429 from this
   sandbox's IP at *any* pacing, keyed or not, so the honest move
   is to skip cleanly rather than pretend a retry loop will help. */

/** Never simplify to items[0] — same trap as Hardcover's search.ids[]
    (IMPLEMENTATION.md §8.3): Google Books happily ranks a study guide or an
    abridgement above the real book. Exact bare-title match always qualifies;
    a superset/subset title only qualifies together with a confirmed author. */
function pickGoogleMatch(items, book) {
  const want = bareTitle(book.title);
  const sn = lastWord(book.author);
  let best = null, bestScore = -1;
  for (const it of items || []) {
    const vi = it.volumeInfo || {};
    const t = bareTitle(vi.title || '');
    if (!t || !want) continue;
    let score = 0;
    if (t === want) score += 100;
    else if (t.startsWith(want) || want.startsWith(t)) score += 40;
    else continue;
    const authors = norm((vi.authors || []).join(' '));
    if (sn && authors.includes(sn)) score += 50;
    else if (authors) continue; /* right title, wrong book */
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore >= 90 ? best : null;
}

async function tryGoogleBooks(book, key) {
  if (!GOOGLE_KEY) return { tried: false, reason: 'no GOOGLE_BOOKS_KEY — skipped cleanly' };

  const isbn = validIsbn13(book.isbn) ? book.isbn : null;
  const q = isbn
    ? `isbn:${isbn}`
    : `intitle:"${book.title}" inauthor:"${book.author}"`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&key=${GOOGLE_KEY}`;

  let j;
  try {
    j = await fetchJSONCached('google', url, rawCachePath('google', key));
  } catch (err) {
    return { tried: true, accepted: false, reason: `fetch failed — ${err.message}` };
  }

  const items = j?.items || [];
  /* An ISBN query is an exact-identifier lookup, not a text search — Google's
     own match, trusted directly, the same judgement server/openlibrary.js
     makes for an edition fetched by key rather than by search. */
  const match = isbn ? (items[0] || null) : pickGoogleMatch(items, book);
  if (!match) return { tried: true, accepted: false, reason: items.length ? 'no candidate cleared the match bar' : 'no results' };

  const blurb = cleanDescription(match.volumeInfo?.description);
  if (!blurb) return { tried: true, accepted: false, reason: 'matched volume has no usable description', matchedTitle: match.volumeInfo?.title };

  return {
    tried: true, accepted: true, blurb,
    matchedTitle: match.volumeInfo?.title,
    url: match.volumeInfo?.canonicalVolumeLink || match.volumeInfo?.infoLink || `https://books.google.com/books?id=${match.id}`,
  };
}

/* ── Wikipedia ─────────────────────────────────────────────────
   One request per book: `generator=search` bundles up to 5 ranked
   candidates with their extract, pageprops and canonical URL in a
   single round trip, so the throttle below (≥1.2s) covers the
   whole lookup rather than one request in a chain of them. */

const AWARD_RE = /\b(award|prize|medal|trophy|shortlist|longlist|ribbon|honou?rs?)\b/i;
const ANTI_RE = /\b(television|tv)\s+(mini-?)?series\b|\bfilm\b|\bmovie\b|\bvideo\s*game\b|\bopera\b|\bmusical\b|\bepisode\b|\bplay\b/i;
const WORK_RE = /\bnovels?\b|\bnovellas?\b|\bcollections?\b|\bmemoirs?\b|\bshort\s+stories\b|\bstories\b|\bpoems?\b|\bpoetry\b|\bgraphic\s+novels?\b|\banthology\b|\bnon-?fiction\b|\bbooks?\b/i;
const LIST_RE = /^list of /i;

/* ── the Abarat guard ─────────────────────────────────────────
   REVIEW-PHASE11.md: a book whose title extends a *series* title
   (e.g. "Abarat: Days of Magic, Nights of War") can pass the plain
   title test above by matching the first volume's page ("Abarat"),
   because bareTitle() strips the subtitle off both sides before
   comparing. That is correct for editions that only differ by
   subtitle (Moneyland's UK/US covers) and wrong for a later volume
   whose subtitle IS the book. The fix: a book title with a subtitle
   must have that subtitle corroborated somewhere on the page — not
   merely left unmentioned-and-forgiven — before the match counts. */

/** Everything after the first subtitle separator in a title, same split
    bareTitle() uses to discard it — kept here instead, minus a trailing
    "(Top Shelf Productions)"-style parenthetical, the same disambiguator
    bareTitle() strips (there, only from the already-subtitle-free head; a
    subtitle can carry one too — an imprint credit, not book content, and it
    fooled the first cut of this check into "corroborating" March: Book
    Three's mismatch against the March (comics) series page on the word
    "Productions"). '' when there is no subtitle. */
const subtitleOf = (t) => {
  const m = String(t || '').match(/[:;–—](.*)$/);
  return m ? m[1].replace(/\s*\([^)]*\)\s*$/, '') : '';
};

/** Common function words a subtitle is mostly made of and that would match
    almost any page by accident — filtered out so what is left is actually
    distinctive. Deliberately conservative (errs toward dropping a word, not
    toward keeping one); a subtitle contributing no word at all just can't be
    checked and is skipped rather than forced to fail. */
const SUBTITLE_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'but', 'to', 'in', 'on', 'at', 'for', 'from', 'by', 'with',
  'now', 'how', 'why', 'who', 'what', 'when', 'where', 'it', 'its', 'that', 'this', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'as', 'so', 'if', 'than', 'then', 'no', 'not', 'yet',
  'all', 'more', 'most', 'some', 'any', 'into', 'over', 'under', 'up', 'down', 'out', 'off', 'again',
  'once', 'here', 'there', 'own', 'same', 'too', 'very', 'can', 'will', 'just', 'should', 'could',
  'would', 'may', 'might', 'must', 'shall', 'you', 'your', 'we', 'our', 'i', 'he', 'she', 'they', 'them',
]);

/** Genre-label words ("Stories", "A Novel", "Poems") are a subtitle in form
    only — they say what kind of book it is, the same handful of words
    WORK_RE already checks for, not anything specific to this book. A page
    that is correctly about a story collection will not necessarily use the
    literal word "stories" (it may say "short story collection" instead, as
    the real Your Utopia page does) — so these cannot be asked to corroborate
    themselves and are excluded from "distinctive" rather than left in to
    manufacture a false rejection. */
const GENRE_LABEL_WORDS = new Set([
  'novel', 'novels', 'novella', 'novellas', 'story', 'stories', 'memoir', 'memoirs',
  'poem', 'poems', 'poetry', 'essay', 'essays', 'anthology', 'anthologies',
  'collection', 'collections', 'tale', 'tales', 'saga', 'fiction', 'nonfiction',
  'biography', 'autobiography', 'book', 'books',
]);

/** Words from a title's subtitle distinctive enough to corroborate a match:
    not a stopword, not a bare genre label, and long enough (>=4 chars) that
    a coincidental hit on an unrelated page is unlikely. */
function distinctiveSubtitleWords(t) {
  return norm(subtitleOf(t)).split(' ')
    .filter((w) => w.length >= 4 && !SUBTITLE_STOPWORDS.has(w) && !GENRE_LABEL_WORDS.has(w));
}

/** The extract naming the matched work as an early volume of a series — the
    Abarat page's own words ("the first in Barker's ... series"). Stated
    directly in REVIEW-PHASE11.md as the signature of the failure mode. */
const SERIES_FIRST_RE = /\bthe first (?:novel |book |entry |title |volume |instal{1,2}ment )?(?:in|of)\b/i;

/** The strict gate DESCRIPTIONS-FEASIBILITY.md calls for. Reject first,
    verify second — a rejection is the expected outcome for most candidates. */
export function verifyWikipediaCandidate(p, book) {
  const title = p?.title || '';
  if (!title || p.missing) return { ok: false, reason: 'missing page' };
  if (p.pageprops && Object.prototype.hasOwnProperty.call(p.pageprops, 'disambiguation')) {
    return { ok: false, reason: 'disambiguation page' };
  }
  if (LIST_RE.test(title)) return { ok: false, reason: 'list page' };
  if (AWARD_RE.test(title)) return { ok: false, reason: 'title looks like an award' };

  const authorNorm = norm(book.author);
  const authorSurname = lastWord(book.author);
  const titleNormFull = norm(title);
  if (authorSurname && (titleNormFull === authorNorm || titleNormFull === authorSurname)) {
    return { ok: false, reason: 'page is the author' };
  }

  const want = bareTitle(book.title);
  const got = bareTitle(title);
  if (!want || got !== want) return { ok: false, reason: `title mismatch (${title})` };

  const extract = p.extract || '';
  if (!extract) return { ok: false, reason: 'empty extract' };
  const shortdesc = p.pageprops?.['wikibase-shortdesc'] || '';
  const firstSentence = extract.split(/(?<=[.!?])\s+/)[0] || extract;

  if (ANTI_RE.test(firstSentence) || ANTI_RE.test(shortdesc)) {
    return { ok: false, reason: 'reads as an adaptation, not the book itself' };
  }

  const extractNorm = norm(extract);
  if (!extractNorm.includes(want)) return { ok: false, reason: 'extract does not mention the title' };
  if (!authorSurname || !extractNorm.includes(authorSurname)) return { ok: false, reason: 'extract does not mention the author' };
  if (!WORK_RE.test(shortdesc) && !WORK_RE.test(extract)) return { ok: false, reason: 'does not read as a work' };

  /* The Abarat guard (REVIEW-PHASE11.md). A subtitle on the book's title has
     to be corroborated by the page, not just absent-and-forgiven — otherwise
     "Abarat: Days of Magic, Nights of War" passes on "Abarat" alone. */
  const bookHasSubtitle = !!subtitleOf(book.title);
  const pageHasSubtitle = !!subtitleOf(title);

  /* Cheap guard: the page frames itself as an early series entry while the
     book carries a subtitle the page's own title doesn't — the Abarat
     signature stated directly, independent of word overlap below. */
  if (bookHasSubtitle && !pageHasSubtitle && SERIES_FIRST_RE.test(extract)) {
    return { ok: false, reason: 'reads as an early volume in a series and the book title carries a subtitle the page does not' };
  }

  const subtitleWords = distinctiveSubtitleWords(book.title);
  if (subtitleWords.length) {
    const haystack = norm(`${title} ${extract}`);
    if (!subtitleWords.some((w) => haystack.includes(w))) {
      return { ok: false, reason: 'subtitle not corroborated by page title or extract' };
    }
  }

  return { ok: true };
}

async function tryWikipedia(book, key) {
  const q = `${book.title} ${book.author}`;
  const url = 'https://en.wikipedia.org/w/api.php?action=query&generator=search'
    + `&gsrsearch=${encodeURIComponent(q)}&gsrlimit=5&gsrnamespace=0`
    + '&prop=extracts%7Cpageprops%7Cinfo&inprop=url&explaintext=1&exintro=1&exsentences=6'
    + '&redirects=1&format=json&formatversion=2';

  let j;
  try {
    j = await fetchJSONCached('wikipedia', url, rawCachePath('wikipedia', key), { paceMs: 1300 });
  } catch (err) {
    return { tried: false, reason: `fetch failed — ${err.message}` };
  }

  const pages = j?.query?.pages || [];
  const rejections = [];
  for (const p of pages) {
    const v = verifyWikipediaCandidate(p, book);
    if (v.ok) {
      return {
        tried: true, accepted: true, candidate: p.title,
        url: p.fullurl, revid: p.lastrevid,
        blurb: cleanDescription(p.extract),
      };
    }
    rejections.push(`${p.title} — ${v.reason}`);
  }
  return { tried: true, accepted: false, reason: pages.length ? `rejected: ${rejections.join('; ')}` : 'no search results' };
}

/* ── Wikidata ──────────────────────────────────────────────────
   `wbsearchentities` returns a `description` right in the search
   hit — the one-line fact itself — so this is one request, not
   search-then-fetch. Still gated: the same "reads as a work,
   mentions the author, not an award or an adaptation" checks as
   Wikipedia, just against a shorter string. */

export function verifyWikidataHit(h, book) {
  const label = h?.label || h?.display?.label?.value || '';
  const desc = h?.description || h?.display?.description?.value || '';
  if (!label || !desc) return { ok: false, reason: 'no label/description' };
  if (bareTitle(label) !== bareTitle(book.title)) return { ok: false, reason: `title mismatch (${label})` };
  if (AWARD_RE.test(label) || AWARD_RE.test(desc)) return { ok: false, reason: 'reads as an award' };
  if (ANTI_RE.test(desc)) return { ok: false, reason: 'reads as an adaptation, not the book itself' };
  if (!WORK_RE.test(desc)) return { ok: false, reason: 'does not read as a work' };
  const sn = lastWord(book.author);
  if (sn && !norm(desc).includes(sn)) return { ok: false, reason: 'author surname not in description' };
  return { ok: true };
}

async function tryWikidata(book, key) {
  const url = 'https://www.wikidata.org/w/api.php?action=wbsearchentities'
    + `&search=${encodeURIComponent(book.title)}&language=en&type=item&limit=5&format=json`;

  let j;
  try {
    j = await fetchJSONCached('wikidata', url, rawCachePath('wikidata', key), { paceMs: 1000 });
  } catch (err) {
    return { tried: false, reason: `fetch failed — ${err.message}` };
  }

  const hits = j?.search || [];
  for (const h of hits) {
    const v = verifyWikidataHit(h, book);
    if (v.ok) {
      const desc = h.description || h.display?.description?.value;
      return { tried: true, accepted: true, qid: h.id, label: h.label, fact: desc, url: `https://www.wikidata.org/wiki/${h.id}` };
    }
  }
  return { tried: true, accepted: false, reason: hits.length ? 'no candidate cleared the gate' : 'no results' };
}

/* ── generated books: load, mutate, re-serialise ─────────────────
   Each file in src/js/data/generated/ (other than index.js and
   sources.js) is one hub, keyed by its own filename — reusing that
   mapping instead of recomputing hubOf() means this file never has
   to know how harvest.mjs decides which room belongs to which hub. */

async function loadGeneratedHubs() {
  const files = fs.readdirSync(GEN_DIR).filter((f) => f.endsWith('.js') && f !== 'index.js' && f !== 'sources.js');
  const hubs = {};
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(GEN_DIR, f)).href);
    hubs[f] = mod.default;
  }
  return hubs;
}

function* everyBook(hubs) {
  for (const rooms of Object.values(hubs)) {
    for (const list of Object.values(rooms)) {
      for (const b of list) yield b;
    }
  }
}

const jstr = (s) => JSON.stringify(s);

const BANNER = `/* ============================================================
   GENERATED — do not hand-edit. Rewritten by
     NODE_USE_ENV_PROXY=1 node tools/harvest.mjs fetch enrich shelve
   and backfilled by
     NODE_USE_ENV_PROXY=1 node tools/describe.mjs run
                          node tools/describe.mjs apply

   Harvested from prize lists (titles, authors, accolades — every
   one traceable through acc[].s to a page and revision id in
   ./sources.js) and enriched from Open Library (year, pages, isbn,
   description). Where Open Library had nothing, phase 11 filled
   \`blurb\` from Google Books or Wikipedia (recorded in \`blurbSrc\`/
   \`blurbUrl\`) and, separately, a one-line Wikidata fact in \`fact\`/
   \`factUrl\` — a fact, not a description, never rendered as one.
   No curator's note, no hand-written tags and no opening line:
   IMPLEMENTATION.md §6 decided that with the owner, and §9 keeps
   'first' held back without a 'firstSource'.

   Running \`harvest.mjs shelve\` again wipes this directory and does
   not know about describe.mjs's fills. Bring them back with:
     node tools/describe.mjs apply
   which replays data/cache/describe.json — no network, no refetch.
   ============================================================ */`;

function serializeHub(rooms) {
  let out = `${BANNER}\n\nexport default {\n`;
  for (const [roomId, list] of Object.entries(rooms)) {
    out += `\n  ${roomId}: [\n`;
    for (const b of list) {
      const f = [`id: ${jstr(b.id)}`, `title: ${jstr(b.title)}`, `author: ${jstr(b.author)}`];
      if (b.translator) f.push(`translator: ${jstr(b.translator)}`);
      if (b.year) f.push(`year: ${b.year}`);
      if (b.pages) f.push(`pages: ${b.pages}`);
      if (b.isbn) f.push(`isbn: ${jstr(b.isbn)}`);
      out += `    { ${f.join(', ')},\n`;
      out += `      acc: [${b.acc.map((a) => `{ l: ${jstr(a.l)}, k: ${jstr(a.k)}, s: ${jstr(a.s)} }`).join(', ')}]`;
      if (b.blurb) out += `,\n      blurb: ${jstr(b.blurb)}`;
      if (b.blurbSrc) out += `,\n      blurbSrc: ${jstr(b.blurbSrc)}`;
      if (b.blurbUrl) out += `,\n      blurbUrl: ${jstr(b.blurbUrl)}`;
      if (b.fact) out += `,\n      fact: ${jstr(b.fact)}`;
      if (b.factUrl) out += `,\n      factUrl: ${jstr(b.factUrl)}`;
      out += ' },\n';
    }
    out += '  ],\n';
  }
  out += '};\n';
  return out;
}

/* ── commands ──────────────────────────────────────────────── */

async function cmdRun() {
  const limit = Number(opt('limit', Infinity));
  const force = flag('force');
  const store = cache('describe');
  store.defer();

  const hubs = await loadGeneratedHubs();
  const targets = [...everyBook(hubs)].filter((b) => !b.blurb);
  const batch = targets.slice(0, limit);

  console.log(`generated books with no blurb: ${targets.length}${Number.isFinite(limit) ? ` (running ${batch.length})` : ''}`);
  console.log(GOOGLE_KEY ? 'GOOGLE_BOOKS_KEY set — Google Books is live for this run' : 'GOOGLE_BOOKS_KEY not set — Google Books skipped cleanly, Wikipedia + Wikidata only');

  let gBlurb = 0, wBlurb = 0, wdFact = 0, processed = 0, sinceFlush = 0;
  const flushNow = () => { store.flush(); sinceFlush = 0; };
  const onInterrupt = () => { console.log('\ninterrupted — flushing what has been resolved so far…'); flushNow(); process.exit(130); };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onInterrupt);

  for (const b of batch) {
    const key = cacheKey(b.title, b.author);
    const rec = store.get(key) || {
      title: b.title, author: b.author,
      google: { tried: false }, wikipedia: { tried: false }, wikidata: { tried: false },
      blurb: null, blurbSrc: null, blurbUrl: null, fact: null, factUrl: null,
    };
    let touched = false;

    if (!rec.blurb && (force || !rec.google.tried)) {
      rec.google = await tryGoogleBooks(b, key);
      if (rec.google.accepted) { rec.blurb = rec.google.blurb; rec.blurbSrc = 'google-books'; rec.blurbUrl = rec.google.url; gBlurb++; }
      touched = true;
    }
    if (!rec.blurb && (force || !rec.wikipedia.tried)) {
      rec.wikipedia = await tryWikipedia(b, key);
      if (rec.wikipedia.accepted) { rec.blurb = rec.wikipedia.blurb; rec.blurbSrc = 'wikipedia'; rec.blurbUrl = rec.wikipedia.url; wBlurb++; }
      touched = true;
    }
    if (!rec.fact && (force || !rec.wikidata.tried)) {
      rec.wikidata = await tryWikidata(b, key);
      if (rec.wikidata.accepted) { rec.fact = rec.wikidata.fact; rec.factUrl = rec.wikidata.url; wdFact++; }
      touched = true;
    }

    if (touched) { store.set(key, rec); sinceFlush++; }
    processed++;
    if (sinceFlush >= 8) flushNow();
    if (processed % 20 === 0 || processed === batch.length) {
      process.stdout.write(`\r  ${processed}/${batch.length}  blurb +${gBlurb} google +${wBlurb} wikipedia  fact +${wdFact} wikidata  (net: g${netCalls.google} w${netCalls.wikipedia} d${netCalls.wikidata})   `);
    }
  }

  flushNow();
  process.off('SIGINT', onInterrupt);
  process.off('SIGTERM', onInterrupt);
  console.log(`\n\nrun: ${processed} books processed`);
  console.log(`blurb filled: ${gBlurb} from google books, ${wBlurb} from wikipedia`);
  console.log(`fact filled:  ${wdFact} from wikidata`);
  console.log(`network calls this run: google ${netCalls.google}, wikipedia ${netCalls.wikipedia}, wikidata ${netCalls.wikidata}`);

  await cmdApply();
}

async function cmdApply() {
  const store = cache('describe');
  const all = store.all();
  const hubs = await loadGeneratedHubs();

  let filledBlurb = 0, filledFact = 0, filesTouched = 0;
  for (const [file, rooms] of Object.entries(hubs)) {
    let changed = false;
    for (const list of Object.values(rooms)) {
      for (const b of list) {
        const rec = all[cacheKey(b.title, b.author)];
        if (!rec) continue;
        if (!b.blurb && rec.blurb) {
          b.blurb = rec.blurb; b.blurbSrc = rec.blurbSrc; if (rec.blurbUrl) b.blurbUrl = rec.blurbUrl;
          filledBlurb++; changed = true;
        }
        if (!b.fact && rec.fact) {
          b.fact = rec.fact; if (rec.factUrl) b.factUrl = rec.factUrl;
          filledFact++; changed = true;
        }
      }
    }
    if (changed) {
      fs.writeFileSync(path.join(GEN_DIR, file), serializeHub(rooms));
      filesTouched++;
    }
  }
  console.log(`apply: ${filledBlurb} book(s) gained a blurb, ${filledFact} gained a wikidata fact, across ${filesTouched} file(s) rewritten`);
}

async function cmdReport() {
  const hubs = await loadGeneratedHubs();
  let total = 0, withBlurb = 0, byOL = 0, byGoogle = 0, byWikipedia = 0, withFact = 0, noBlurb = 0;
  for (const b of everyBook(hubs)) {
    total++;
    if (b.blurb) {
      withBlurb++;
      if (b.blurbSrc === 'google-books') byGoogle++;
      else if (b.blurbSrc === 'wikipedia') byWikipedia++;
      else byOL++; /* no blurbSrc field — came from harvest.mjs shelve's Open Library pass */
    } else noBlurb++;
    if (b.fact) withFact++;
  }
  console.log(`generated books: ${total}`);
  console.log(`  with blurb: ${withBlurb}  (open library ${byOL}, google books ${byGoogle}, wikipedia ${byWikipedia})`);
  console.log(`  no blurb:   ${noBlurb}`);
  console.log(`  with a wikidata fact: ${withFact}`);
}

async function cmdSelftest() {
  let pass = 0, fail = 0;

  const gbFixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/googlebooks-sample.json'), 'utf8'));
  for (const t of gbFixture.cases) {
    const items = t.response.items || [];
    const match = t.isbn ? (items[0] || null) : pickGoogleMatch(items, t.book);
    const blurb = match ? cleanDescription(match.volumeInfo?.description) : null;
    const accepted = !!blurb;
    const ok = accepted === t.expectAccepted
      && (!t.expectBlurbContains || (blurb && blurb.includes(t.expectBlurbContains)));
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${t.name}`);
    if (!ok) console.log(`    expected accepted=${t.expectAccepted}${t.expectBlurbContains ? ` containing "${t.expectBlurbContains}"` : ''}; got accepted=${accepted} blurb=${JSON.stringify(blurb)}`);
    ok ? pass++ : fail++;
  }

  /* REVIEW-PHASE11.md — the subtitle-corroboration gate on Wikipedia matches.
     Both cases are permanent regression tests: a book title extending a
     series' first-volume title must be rejected, and a book whose UK/US
     editions carry genuinely different subtitles must still be accepted. */
  const wpFixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/wikipedia-subtitle-sample.json'), 'utf8'));
  for (const t of wpFixture.cases) {
    const v = verifyWikipediaCandidate(t.page, t.book);
    const ok = v.ok === t.expectOk
      && (!t.expectReasonContains || (v.reason && v.reason.includes(t.expectReasonContains)));
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${t.name}`);
    if (!ok) console.log(`    expected ok=${t.expectOk}${t.expectReasonContains ? ` reason containing "${t.expectReasonContains}"` : ''}; got ${JSON.stringify(v)}`);
    ok ? pass++ : fail++;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

/* ── main ──────────────────────────────────────────────────── */

const cmd = process.argv[2];
const COMMANDS = { run: cmdRun, apply: cmdApply, report: cmdReport, selftest: cmdSelftest };
if (COMMANDS[cmd]) {
  await COMMANDS[cmd]();
} else {
  console.error(`usage: node tools/describe.mjs <run|apply|report|selftest>`);
  process.exit(1);
}

export { pickGoogleMatch, bareTitle, norm };
