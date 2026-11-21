/* ============================================================
   The Hardcover API client. ONE implementation, used by:
     - server/index.js's  GET /api/book  route
     - tools/hardcover.mjs (the enrich / suggest CLI)
     - server/mcp.js (the same client, as an MCP tool)

   Two data sources behind the same shape:
     - live    — the real API, queries verified in IMPLEMENTATION.md §8.
     - fixture — server/fixtures/catalogue.json, the same fixture
                 tools/mock-hardcover.mjs used to serve over HTTP.
                 Folded in here instead of run as a second process.

   Mode is auto-detected: live if HARDCOVER_TOKEN is set (and
   HARDCOVER_MOCK is not forced on), fixture otherwise. Callers
   never need to know which — lookupBook() always returns the
   same shape and reports which source answered in `source`.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDotEnv } from './env.js';
import { cacheKey, getCached, setCached } from './cache.js';

loadDotEnv();

export const ENDPOINT = process.env.HARDCOVER_ENDPOINT || 'https://api.hardcover.app/v1/graphql';
const TOKEN = (process.env.HARDCOVER_TOKEN || '').replace(/^Bearer\s+/i, '').trim();
const FORCE_MOCK = /^(1|true)$/i.test(process.env.HARDCOVER_MOCK || '');

/** 'live' if a token is available and fixture mode was not forced, else 'fixture'. */
export const MODE = TOKEN && !FORCE_MOCK ? 'live' : 'fixture';

/* Rate limit is 60/min with no rate-limit headers at all (verified — see
   IMPLEMENTATION.md §8.6). Pace at 40, comfortably under it. */
const MIN_INTERVAL_MS = 60000 / 40;

/* ── the two verified queries (IMPLEMENTATION.md §8.3, §8.4) ── */

export const SEARCH_Q = `
  query Find($q: String!) {
    search(query: $q, query_type: "Book", per_page: 5, page: 1) {
      results
    }
  }`;

export const BOOK_Q = `
  query Book($id: Int!) {
    books(where: { id: { _eq: $id } }, limit: 1) {
      id
      title
      slug
      pages
      release_year
      description
      default_physical_edition_id
      default_physical_edition {
        id isbn_13 isbn_10 pages publisher { name } language { language }
      }
      contributions { author { name } }
      editions(limit: 25) {
        isbn_13
        pages
        release_year
        reading_format_id
        language { language }
      }
    }
  }`;

let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Raw GraphQL call against the live endpoint. Never call this in fixture mode. */
export async function gql(query, variables = {}, attempt = 0) {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    throw new Error(`could not reach ${ENDPOINT}: ${err.message}`);
  }

  if (res.status === 429 && attempt < 4) {
    const back = 2000 * 2 ** attempt;
    await sleep(back);
    return gql(query, variables, attempt + 1);
  }
  if (res.status === 401) throw new Error('Hardcover rejected the token (HTTP 401)');
  if (res.status === 403) {
    throw new Error('HTTP 403 from Hardcover — either the token is invalid for this ' +
      'query, or something between here and api.hardcover.app is blocking the host ' +
      '(a proxy or sandbox egress policy answers 403 to the connection itself).');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${ENDPOINT}`);

  const json = await res.json();
  if (json.errors?.length) throw new Error('GraphQL: ' + json.errors.map((e) => e.message).join('; '));
  return json.data;
}

/* ── matching (verified — do not simplify to search.ids[0], see §8.3) ── */

export const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const surname = (author) => norm(author).split(' ').pop();

/** Hardcover's search returns a Typesense-shaped blob; dig for the hits. */
export function hits(results) {
  if (!results) return [];
  if (Array.isArray(results)) return results;
  const r = results.hits || results.results?.hits || results.data?.hits;
  if (Array.isArray(r)) return r.map((h) => h.document || h);
  return [];
}

export function scoreMatch(book, hit) {
  const t = norm(hit.title || hit.name);
  const want = norm(book.title.replace(/[:;–—].*$/, ''));
  if (!t) return -1;
  let score = 0;
  if (t === want) score += 100;
  else if (t.startsWith(want) || want.startsWith(t)) score += 60;
  else if (t.includes(want)) score += 30;
  else return -1;

  const authors = []
    .concat(hit.author_names || [], hit.contributions?.map((c) => c.author?.name) || [])
    .map(norm).join(' ');
  if (authors.includes(surname(book.author))) score += 50;
  else if (authors) score -= 40;

  /* release_year is the original-language year (§8.5) — weighted lightly */
  if (book.year && hit.release_year) score -= Math.min(20, Math.abs(hit.release_year - book.year) / 4);
  return score;
}

/** Prefer Hardcover's own canonical edition when it carries an ISBN-13 (§8.4),
    falling back to the language/pages heuristic otherwise. */
export function pickEdition(full, book = {}) {
  const dpe = full?.default_physical_edition;
  if (dpe?.isbn_13 && /^\d{13}$/.test(String(dpe.isbn_13))) return dpe;

  const usable = (full?.editions || []).filter((e) => /^\d{13}$/.test(String(e.isbn_13 || '')));
  if (!usable.length) return null;
  const rank = (e) => {
    let s = 0;
    const lang = e.language?.language || '';
    if (/eng/i.test(lang)) s += 30;
    else if (lang) s -= 10;
    if (e.pages) s += 10;
    if (book.pages && e.pages) s -= Math.min(15, Math.abs(e.pages - book.pages) / 20);
    return s;
  };
  return usable.sort((a, b) => rank(b) - rank(a))[0];
}

/* ── fixture data source: same shapes, no network ────────────── */

/* ROOT-relative rather than this file's own import.meta.url — one fewer
   thing to keep in sync with env.js's own path logic, now that both
   ultimately answer the same question ("where's the repo root") the same
   way. See env.js's comment for what that answer rests on under Vercel. */
const FIXTURES = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/fixtures/catalogue.json'), 'utf8'));

function fixtureSearch(q) {
  const words = norm(q).split(' ');
  return FIXTURES
    .filter((b) => {
      const hay = norm(b.title + ' ' + b.contributions.map((c) => c.author.name).join(' '));
      return words.some((w) => w.length > 3 && hay.includes(w));
    })
    .map((b) => ({
      id: String(b.id),
      title: b.title,
      slug: b.slug,
      release_year: b.release_year,
      author_names: b.contributions.map((c) => c.author.name),
    }));
}

function fixtureBook(id) {
  return FIXTURES.find((b) => b.id === id) || null;
}

/* ── the one match+fetch path, live or fixture ───────────────── */

/**
 * Searches for a book by title/author, scores the candidates, and fetches
 * full detail for the best match. Returns { full, score } or null.
 */
export async function matchBook({ title, author, year } = {}) {
  const book = { title, author, year };
  const rawHits = MODE === 'live'
    ? hits((await gql(SEARCH_Q, { q: `${title} ${author}` })).search?.results)
    : fixtureSearch(`${title} ${author}`);

  const best = rawHits
    .map((h) => ({ h, score: scoreMatch(book, h) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)[0];
  if (!best) return null;

  const id = Number(best.h.id);
  if (!id) return null;
  const full = MODE === 'live' ? (await gql(BOOK_Q, { id })).books?.[0] : fixtureBook(id);
  if (!full) return null;
  return { full, score: best.score };
}

/**
 * The public shape: { isbn13, pages, year, description, hardcover, source }.
 * `source` is 'live' | 'fixture' when that path actually produced an ISBN,
 * 'miss' when nothing did (no match, no ISBN on any edition, or an upstream
 * error) — the server never 500s, it reports the miss and moves on.
 */
export async function lookupBook({ title, author, isbn } = {}) {
  /* `isbn` is accepted (matching the /api/book?title=&author=&isbn= shape in
     IMPLEMENTATION.md §5) but not yet used for the lookup itself: neither
     verified query (§8.3, §8.4) takes an ISBN, and this file's rule is to
     not guess new ones. Title+author is always the path in. A future
     isbn-keyed query, once verified against the live API, plugs in here. */
  void isbn;
  const empty = { isbn13: null, pages: null, year: null, description: null, hardcover: null, source: 'miss' };
  if (!title || !author) return empty;

  const key = cacheKey(title, author);
  const cached = getCached(key);
  if (cached) return cached;

  let entry;
  try {
    const match = await matchBook({ title, author });
    if (!match) {
      entry = empty;
    } else {
      const { full, score } = match;
      const edition = pickEdition(full, { pages: full.pages });
      entry = edition?.isbn_13
        ? {
            isbn13: String(edition.isbn_13),
            pages: full.pages || edition.pages || null,
            year: full.release_year || null,
            description: full.description || null,
            hardcover: full.slug || null,
            source: MODE,
            score,
          }
        : { ...empty, score };
    }
  } catch (err) {
    entry = { ...empty, error: err.message };
  }

  /* Only a real live answer is worth writing into the committable snapshot.
     A fixture answer is instant and in-memory already — caching it would
     buy nothing, and would risk a stale fixture entry silently shadowing
     a real one for anyone who ran --mock once against a shared cache file. */
  if (entry.isbn13 && MODE === 'live') setCached(key, entry);
  return entry;
}
