#!/usr/bin/env node
/* ============================================================
   Hardcover → the shop.

   Two jobs, both run by hand and both writing files you then
   commit. Nothing here runs in the browser: Hardcover's own
   docs say queries must not run there, and the token would be
   public if they did. The site stays a folder you can open.

     HARDCOVER_TOKEN=… node tools/hardcover.mjs enrich
        Looks up every book on the shelves and writes ISBN-13,
        page count and first-publication year into
        src/js/data/enrich.js. Resumable: books already in that
        file are skipped unless you pass --force.

     HARDCOVER_TOKEN=… node tools/hardcover.mjs suggest --tag "translated" --limit 40
        Finds candidates for a shelf and writes a report to
        tools/suggestions/. It does NOT add them. Curation is
        the product — a machine can find books, it cannot say
        why one belongs on a shelf, and the curator's note is
        the thing a reader is actually here for.

   Options
     --limit N       stop after N lookups (default: all)
     --only id,id    just these book ids
     --force         re-fetch books that already have an entry
     --dry-run       fetch and report, write nothing
     --endpoint URL  point at something other than the live API
                     (tools/mock-hardcover.mjs serves a fixture)
     --verbose

   Rate limit: Hardcover allows 60 requests a minute. This paces
   itself at 50 and backs off on 429.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const ENRICH_FILE = path.join(ROOT, 'src/js/data/enrich.js');
const BOOKS_DIR = path.join(ROOT, 'src/js/data/books');

const DEFAULT_ENDPOINT = 'https://api.hardcover.app/v1/graphql';
const MIN_INTERVAL_MS = 60000 / 50;      /* 50 req/min against a 60 limit */

/* Books whose automatic match is wrong and has been corrected by hand.
   Add an id here and put the right isbn on the book itself. */
const SKIP = new Set([]);

/* ── arguments ────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('-')) || 'enrich';
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const OPTS = {
  limit: Number(opt('limit', 0)) || Infinity,
  only: opt('only') ? opt('only').split(',').map((s) => s.trim()) : null,
  force: flag('force'),
  dryRun: flag('dry-run'),
  verbose: flag('verbose'),
  endpoint: opt('endpoint', process.env.HARDCOVER_ENDPOINT || DEFAULT_ENDPOINT),
  tag: opt('tag'),
};

/* The token is a credential: it is read from the environment or from an
   untracked .env, never from anything in the repository. Keeping it out of
   argv matters too — a command line ends up in your shell history and in
   the process list, where other users on the machine can read it. */
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;      /* the shell wins */
    process.env[key] = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
}
loadDotEnv();

const TOKEN = (process.env.HARDCOVER_TOKEN || '').replace(/^Bearer\s+/i, '').trim();
const isMock = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(OPTS.endpoint);
if (!TOKEN && !isMock) {
  console.error('No HARDCOVER_TOKEN found.\n\n' +
    'Get one from hardcover.app → account settings → Hardcover API, then either\n' +
    'copy .env.example to .env and put it there (.env is gitignored), or export\n' +
    'it in your shell. Avoid putting it on the command line — that lands in your\n' +
    'shell history and is visible in the process list.\n\n' +
    '  cp .env.example .env && $EDITOR .env\n' +
    '  node tools/hardcover.mjs enrich');
  process.exit(2);
}

/* ── the shelves, read straight out of the source ─────────── */

async function loadShelves() {
  const books = [];
  for (const file of fs.readdirSync(BOOKS_DIR).sort()) {
    if (!file.endsWith('.js')) continue;
    const mod = await import(new URL(`../src/js/data/books/${file}`, import.meta.url));
    for (const [room, list] of Object.entries(mod.default || {})) {
      for (const b of list) books.push({ ...b, room, file });
    }
  }
  return books;
}

function loadEnrich() {
  if (!fs.existsSync(ENRICH_FILE)) return {};
  const src = fs.readFileSync(ENRICH_FILE, 'utf8');
  const m = src.match(/export const ENRICH = (\{[\s\S]*?\n\});/);
  if (!m) return {};
  try { return (0, eval)('(' + m[1] + ')'); } catch { return {}; }
}

function writeEnrich(data) {
  const head = fs.existsSync(ENRICH_FILE)
    ? fs.readFileSync(ENRICH_FILE, 'utf8').split('export const ENRICH')[0]
    : '';
  const ids = Object.keys(data).sort();
  const body = ids.map((id) => {
    const e = data[id];
    const fields = Object.entries(e)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(', ');
    return `  ${JSON.stringify(id)}: { ${fields} },`;
  }).join('\n');
  fs.writeFileSync(ENRICH_FILE,
    `${head}export const ENRICH = {\n${body}\n};\n\nexport default ENRICH;\n`);
}

/* ── the API ──────────────────────────────────────────────── */

let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables = {}, attempt = 0) {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();

  let res;
  try {
    res = await fetch(OPTS.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    throw new Error(`could not reach ${OPTS.endpoint}: ${err.message}`);
  }

  if (res.status === 429 && attempt < 4) {
    const back = 2000 * 2 ** attempt;
    console.warn(`  rate limited, waiting ${back / 1000}s`);
    await sleep(back);
    return gql(query, variables, attempt + 1);
  }
  if (res.status === 401) {
    throw new Error('Hardcover rejected the token (HTTP 401). Tokens expire after ' +
      'a year and reset on 1 January — generate a fresh one in account settings.');
  }
  if (res.status === 403) {
    /* Do not blame the token here. A 403 arriving at this point is just as
       often an egress proxy refusing the host outright, which looks nothing
       like an auth problem once you go looking in the wrong place. */
    throw new Error('HTTP 403. Either the token is not valid for this query, or ' +
      'something between you and the API is blocking api.hardcover.app — a ' +
      'corporate proxy or sandbox egress policy will answer 403 to the ' +
      'connection itself. Check with:\n' +
      '  curl -sS -o /dev/null -w "%{http_code}\\n" https://api.hardcover.app/v1/graphql');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${OPTS.endpoint}`);

  const json = await res.json();
  if (json.errors?.length) throw new Error('GraphQL: ' + json.errors.map((e) => e.message).join('; '));
  return json.data;
}

/* Hardcover's query depth limit is 3, so editions are fetched flat and
   the best one is chosen here rather than in the query. */
const SEARCH_Q = `
  query Find($q: String!) {
    search(query: $q, query_type: "Book", per_page: 5, page: 1) {
      results
    }
  }`;

const BOOK_Q = `
  query Book($id: Int!) {
    books(where: { id: { _eq: $id } }, limit: 1) {
      id
      title
      slug
      pages
      release_year
      description
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

/* ── matching ─────────────────────────────────────────────── */

const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const surname = (author) => norm(author).split(' ').pop();

/* Hardcover's search returns a raw blob whose shape has moved around
   during the beta; dig for the hits rather than assuming one path. */
function hits(results) {
  if (!results) return [];
  if (Array.isArray(results)) return results;
  const r = results.hits || results.results?.hits || results.data?.hits;
  if (Array.isArray(r)) return r.map((h) => h.document || h);
  return [];
}

function scoreMatch(book, hit) {
  const t = norm(hit.title || hit.name);
  const want = norm(book.title.replace(/[:;–—].*$/, ''));
  if (!t) return -1;
  let score = 0;
  if (t === want) score += 100;
  else if (t.startsWith(want) || want.startsWith(t)) score += 60;
  else if (t.includes(want)) score += 30;
  else return -1;                                  /* wrong book */

  const authors = []
    .concat(hit.author_names || [], hit.contributions?.map((c) => c.author?.name) || [])
    .map(norm).join(' ');
  if (authors.includes(surname(book.author))) score += 50;
  else if (authors) score -= 40;                   /* right title, wrong writer */

  if (book.year && hit.release_year) score -= Math.min(20, Math.abs(hit.release_year - book.year) / 4);
  return score;
}

/* Prefer a physical English edition that actually carries an ISBN-13. */
function pickEdition(editions = [], book) {
  const usable = editions.filter((e) => /^\d{13}$/.test(String(e.isbn_13 || '')));
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

/* ── enrich ───────────────────────────────────────────────── */

async function enrich() {
  const shelves = await loadShelves();
  const have = OPTS.force ? {} : loadEnrich();
  const out = { ...loadEnrich() };

  let todo = shelves.filter((b) => !SKIP.has(b.id) && !b.isbn);
  if (OPTS.only) todo = todo.filter((b) => OPTS.only.includes(b.id));
  if (!OPTS.force) todo = todo.filter((b) => !have[b.id]);
  todo = todo.slice(0, OPTS.limit === Infinity ? undefined : OPTS.limit);

  console.log(`${shelves.length} books on the shelves, ${todo.length} to look up`);
  if (!todo.length) return;

  let found = 0, missed = 0;
  const unmatched = [];

  for (const [i, book] of todo.entries()) {
    const label = `${i + 1}/${todo.length} ${book.title}`;
    try {
      const data = await gql(SEARCH_Q, { q: `${book.title} ${book.author}` });
      const candidates = hits(data.search?.results);
      const best = candidates
        .map((h) => ({ h, score: scoreMatch(book, h) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)[0];

      if (!best) {
        missed++; unmatched.push(book.id);
        console.log(`  ✗ ${label} — no confident match`);
        continue;
      }

      const id = Number(best.h.id);
      const full = id ? (await gql(BOOK_Q, { id })).books?.[0] : null;
      const edition = pickEdition(full?.editions, book);

      const entry = {};
      if (edition?.isbn_13) entry.isbn = String(edition.isbn_13);
      if (full?.pages || edition?.pages) entry.pages = full?.pages || edition.pages;
      if (full?.release_year) entry.firstPublished = full.release_year;
      if (full?.slug) entry.hardcover = full.slug;

      if (!entry.isbn) {
        missed++; unmatched.push(book.id);
        console.log(`  ~ ${label} — matched, but no edition carries an ISBN-13`);
        continue;
      }

      out[book.id] = entry;
      found++;
      console.log(`  ✓ ${label} — ${entry.isbn}${OPTS.verbose ? ` (score ${best.score.toFixed(0)})` : ''}`);
    } catch (err) {
      console.error(`  ! ${label} — ${err.message}`);
      if (/token/i.test(err.message) || /could not reach/.test(err.message)) break;
      missed++;
    }
  }

  console.log(`\nmatched ${found}, missed ${missed}`);
  if (unmatched.length) console.log('no ISBN for:', unmatched.join(', '));

  if (OPTS.dryRun) { console.log('(dry run — nothing written)'); return; }
  writeEnrich(out);
  console.log(`wrote ${Object.keys(out).length} entries to src/js/data/enrich.js`);
}

/* ── suggest ──────────────────────────────────────────────── */

const TAGGED_Q = `
  query Tagged($limit: Int!) {
    books(
      where: { users_read_count: { _gt: 400 } }
      order_by: { rating: desc }
      limit: $limit
    ) {
      id title slug rating release_year users_read_count description
      contributions { author { name } }
    }
  }`;

async function suggest() {
  const shelves = await loadShelves();
  const known = new Set(shelves.map((b) => norm(b.title)));
  const limit = OPTS.limit === Infinity ? 60 : OPTS.limit;

  const data = await gql(TAGGED_Q, { limit: limit * 3 });
  const rows = (data.books || [])
    .filter((b) => !known.has(norm(b.title)))
    .slice(0, limit);

  const dir = path.join(HERE, 'suggestions');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${OPTS.tag ? OPTS.tag.replace(/\W+/g, '-') : 'all'}-${new Date().toISOString().slice(0, 10)}.md`;
  const body =
    `# Candidates${OPTS.tag ? ` — ${OPTS.tag}` : ''}\n\n` +
    `Found by tools/hardcover.mjs. **Nothing here is on a shelf yet.**\n` +
    `A book earns its place with a curator's note saying why; that is the\n` +
    `part of this shop a lookup cannot write.\n\n` +
    rows.map((b) => {
      const author = b.contributions?.[0]?.author?.name || 'unknown';
      return `## ${b.title}\n` +
        `- ${author}${b.release_year ? `, ${b.release_year}` : ''}\n` +
        `- hardcover.app/books/${b.slug}\n` +
        `- rating ${b.rating?.toFixed?.(2) ?? '—'}, ${b.users_read_count ?? '—'} readers\n` +
        `- ${(b.description || '').replace(/\s+/g, ' ').slice(0, 300)}\n`;
    }).join('\n');

  if (OPTS.dryRun) { console.log(body); return; }
  fs.writeFileSync(path.join(dir, name), body);
  console.log(`${rows.length} candidates → tools/suggestions/${name}`);
}

/* ── go ───────────────────────────────────────────────────── */

try {
  if (cmd === 'enrich') await enrich();
  else if (cmd === 'suggest') await suggest();
  else {
    console.error(`unknown command "${cmd}" — expected "enrich" or "suggest"`);
    process.exit(2);
  }
} catch (err) {
  console.error('\n' + err.message);
  process.exit(1);
}
