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
import { ROOT } from './env.js';
import { MODE } from './lookup.js';
import { apiRouter } from './routes.js';

const PORT = Number(process.env.PORT || 8099);
const app = express();

app.disable('x-powered-by');

/* The routes themselves live in routes.js now, shared with the Vercel
   function at api/index.js (PLAN-PHASE12.md §1.1) — this file's own job
   is local static serving plus mounting that one router. */
app.use('/api', apiRouter());

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
