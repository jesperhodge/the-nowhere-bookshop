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
import { MODE, lookupBook } from './hardcover.js';

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
  });
});

/* ── /api/list/:slug — a harvested award list ────────────────
   Phase 9 (harvest ~2,000 books) is what populates these. Until
   then every slug reports a clean miss rather than a 404, so the
   client's fallback chain has one shape to handle. */
const LISTS_DIR = path.join(ROOT, 'server/fixtures/lists');
app.get('/api/list/:slug', (req, res) => {
  const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
  const file = path.join(LISTS_DIR, `${slug}.json`);
  if (fs.existsSync(file)) {
    try {
      const items = JSON.parse(fs.readFileSync(file, 'utf8'));
      return res.json({ slug, items, source: 'fixture' });
    } catch {
      /* fall through to miss */
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
app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/index.html', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));

app.listen(PORT, () => {
  console.log(`the-nowhere-bookshop on http://localhost:${PORT}  (hardcover: ${MODE})`);
});
