/* ============================================================
   The Vercel serverless function. Wraps the SAME router
   server/index.js uses locally (server/routes.js) — nothing else.

   PLAN-PHASE12.md §0: "A second implementation of the API for
   Vercel would be the exact divergence IMPLEMENTATION.md §5 already
   complains about once." So this file has no logic of its own: an
   Express app exists only because Vercel's Node runtime accepts one
   directly as the default export (an Express app IS a
   `(req, res) => {}` handler), and the app's only job is mounting
   apiRouter() where vercel.json's rewrite sends every /api/* request.

   No static serving here — Vercel's CDN serves index.html, src/ and
   vendor/ directly (vercel.json), and a serverless function has no
   business handing those out.

   data/cache/ and server/fixtures/ are NOT visible to this function
   by default: Vercel's build only includes what it can see via a
   static import/require graph, and both directories are read at
   runtime with fs.readFileSync() using paths built from strings —
   invisible to that analysis, so without more they would be pruned
   from the deployment entirely. vercel.json's `builds[].config.includeFiles`
   (the entry for this file) is what actually ships them; see that file's
   own comment and
   HANDOFF-FINAL.md for how far this was actually proved with a local
   `vercel build` (the config is accepted and the files are matched)
   versus what still rests on Vercel's own docs (that matched files
   are readable at this same path at request time on a live deploy —
   this sandbox has no Vercel account to run one).
   ============================================================ */

import express from 'express';
import { apiRouter } from '../server/routes.js';

const app = express();
app.disable('x-powered-by');
app.use('/api', apiRouter());

export default app;
