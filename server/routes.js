/* ============================================================
   The /api routes — the part `server/index.js` (local Express,
   static + api) and `api/index.js` (the Vercel serverless
   function, api only) BOTH mount. One router, two entry points:
   PLAN-ARCH.md's "one client, three front ends" rule applied one
   level up, to the routes themselves, so a Vercel deploy is never
   a second implementation of what `/api/book` and `/api/list/:slug`
   do (IMPLEMENTATION.md §5 already complained about that once, for
   the Hardcover client itself).

   Contains ONLY the two routes. Static file serving is deliberately
   NOT here — on Vercel that is the CDN's job (vercel.json's own
   routing), and locally it stays in server/index.js. A serverless
   function has no business handing out index.html.
   ============================================================ */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from './env.js';
import { MODE, lookupBook } from './lookup.js';

export { MODE };

export function apiRouter() {
  const router = express.Router();

  /* ── /api/book?title=&author=&isbn= ────────────────────────
     Never 500s on an upstream failure: lookupBook() already
     catches and reports a miss, so there is nothing to catch here. */
  router.get('/book', async (req, res) => {
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

  /* ── /api/list/:slug — a harvested award list ──────────────
     Phase 9 populated these: data/lists/<slug>.json, written by
     tools/harvest.mjs and committed. server/fixtures/lists/ stays as
     a second place to look, so a hand-recorded fixture still works.
     An unknown slug still reports a clean miss rather than a 404, so
     the client's fallback chain has one shape to handle. */
  const LIST_DIRS = [path.join(ROOT, 'data/lists'), path.join(ROOT, 'server/fixtures/lists')];
  router.get('/list/:slug', (req, res) => {
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

  return router;
}
