#!/usr/bin/env node
/* ============================================================
   Hardcover → the shop.

   A thin CLI over server/hardcover.js — the one client
   implementation, shared with the /api/book route and the MCP
   tool (server/mcp.js). Nothing in this file talks to the
   network directly any more.

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
     --mock          use the built-in fixture catalogue instead of the
                      live API (same as HARDCOVER_MOCK=1) — no separate
                      process to start; server/hardcover.js folds in
                      what tools/mock-hardcover.mjs used to serve
     --endpoint URL  point at a different live GraphQL endpoint
     --verbose

   Rate limit: Hardcover allows 60 requests a minute. server/hardcover.js
   paces itself at 40 and backs off on 429.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const ENRICH_FILE = path.join(ROOT, 'src/js/data/enrich.js');
const BOOKS_DIR = path.join(ROOT, 'src/js/data/books');

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
  tag: opt('tag'),
};

/* server/hardcover.js decides live-vs-fixture from these env vars as soon
   as it is imported, so they must be set before that import happens. */
const mockRequested = flag('mock') || /^(1|true)$/i.test(process.env.HARDCOVER_MOCK || '');
if (mockRequested) process.env.HARDCOVER_MOCK = '1';
if (opt('endpoint')) process.env.HARDCOVER_ENDPOINT = opt('endpoint');

const { MODE, gql, matchBook, pickEdition, norm } = await import('../server/hardcover.js');

if (MODE === 'fixture' && !mockRequested) {
  console.error('No HARDCOVER_TOKEN found.\n\n' +
    'Get one from hardcover.app → account settings → Hardcover API, then either\n' +
    'copy .env.example to .env and put it there (.env is gitignored), or export\n' +
    'it in your shell. Avoid putting it on the command line — that lands in your\n' +
    'shell history and is visible in the process list.\n\n' +
    '  cp .env.example .env && $EDITOR .env\n' +
    '  node tools/hardcover.mjs enrich\n\n' +
    'Or pass --mock to run against the built-in fixture catalogue instead.');
  process.exit(2);
}
console.log(`mode: ${MODE}`);

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
      const match = await matchBook({ title: book.title, author: book.author, year: book.year });
      if (!match) {
        missed++; unmatched.push(book.id);
        console.log(`  ✗ ${label} — no confident match`);
        continue;
      }

      const { full, score } = match;
      const edition = pickEdition(full, book);

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
      console.log(`  ✓ ${label} — ${entry.isbn}${OPTS.verbose ? ` (score ${score.toFixed(0)})` : ''}`);
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
  if (MODE !== 'live') {
    console.error('suggest needs a live token — the fixture catalogue has no ratings data.');
    process.exit(2);
  }

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
