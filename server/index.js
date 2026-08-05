#!/usr/bin/env node
/* ============================================================
   Express: serves the static site plus /api.

   This is optional. Opening index.html through any static server
   with no Node still works, on baked data only (src/js/data/enrich.js).
   This server adds two things on top: a live-or-fixture lookup
   route for books the baked snapshot missed, and a place for the
   award-list harvest (phase 9) to land.

     npm start   — live if .env has HARDCOVER_TOKEN, fixtures if not
     npm run mock — fixtures even with a token (HARDCOVER_MOCK=1)
   ============================================================ */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from './env.js';
import { MODE, lookupBook } from './lookup.js';

const PORT = Number(process.env.PORT || 8099);
const app = express();

app.disable('x-powered-by');

/* ── /api/book?title=&author=&isbn= ──────────────────────────
   Never 500s on an upstream failure: lookupBook() already
   catches and reports a miss, so there is nothing to catch here. */
app.get('/api/book', async (req, res) => {
  const { title, author, isbn } = req.query;
  const result = await lookupBook({ title: String(title || ''), author: String(author || ''), isbn: String(isbn || '') });
  res.json({
    isbn13: result.isbn13,
    pages: result.pages,
    year: result.year,
    description: result.description,
    source: result.source,
    via: result.via,
  });
});

/* ── /api/list/:slug — a harvested award list ────────────────
   Phase 9 populated these: data/lists/<slug>.json, written by
   tools/harvest.mjs and committed. server/fixtures/lists/ stays as
   a second place to look, so a hand-recorded fixture still works.
   An unknown slug still reports a clean miss rather than a 404, so
   the client's fallback chain has one shape to handle. */
const LIST_DIRS = [path.join(ROOT, 'data/lists'), path.join(ROOT, 'server/fixtures/lists')];
app.get('/api/list/:slug', (req, res) => {
  const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
  for (const dir of LIST_DIRS) {
    const file = path.join(dir, `${slug}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      /* A harvested list is a recorded response, which is what §5 means by
         `fixture` — so the contract's three source values do not grow a
         fourth. What it does carry is its provenance: the exact page and
         revision it was parsed from, so a caller can check the accolades
         rather than take them on trust. */
      const items = Array.isArray(raw) ? raw : raw.entries || [];
      const prov = Array.isArray(raw) ? {} : {
        prize: raw.prize, page: raw.page, url: raw.url,
        permalink: raw.permalink, revid: raw.revid, fetchedAt: raw.fetchedAt,
      };
      return res.json({ slug, items, source: 'fixture', ...prov });
    } catch {
      /* unreadable — try the next directory, then report a miss */
    }
  }
  res.json({ slug, items: [], source: 'miss' });
});

/* ── the static site itself ───────────────────────────────────
   Only what the browser actually loads (index.html and src/) is
   served — not the whole repo root, which would otherwise also
   hand out server/ source, tools/, node_modules/ and data/cache/
   to anyone who asked. */
app.use('/src', express.static(path.join(ROOT, 'src')));
/* three.js, vendored and committed (PLAN-ARCH.md "The one dependency")
   — not used by main.js/index.html yet (the CSS-3D scene is still
   live, see HANDOFF-PHASE5.md), but the route is additive and safe to
   land now so a later phase's `import * as THREE from '/vendor/...'`
   works under `npm start` without a server change of its own. */
app.use('/vendor', express.static(path.join(ROOT, 'vendor')));
app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/index.html', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));
/* The stage preview harness — one file, named explicitly rather than a
   static mount over tools/, which would also hand out the enrichment
   tooling and whatever a QA run has just written into tools/rooms/.

   It is here because not serving it has now cost two sessions: the
   harness needed a second static server on another port, and a leftover
   one holding :8099 while `npm start` had silently died looked exactly
   like a working site. One server, both pages, no second port to forget
   to kill. Phases 3-9 needed the harness because the live site ran a
   different renderer; since phase 10 they are the same renderer and this
   is a debugging view of it (?orbit=1, ?books=0, ?pose=…). */
app.get('/tools/preview-stage.html', (_req, res) => res.sendFile(path.join(ROOT, 'tools/preview-stage.html')));

app.listen(PORT, () => {
  console.log(`the-nowhere-bookshop on http://localhost:${PORT}  (hardcover: ${MODE})`);
});
