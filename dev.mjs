#!/usr/bin/env node
/* ============================================================
   Local dev server for the WHOLE site — mirrors vercel.json.

     npm run dev   →  http://localhost:8080/

   Serves exactly the static allowlist in vercel.json (/, /home/,
   /bookshop/ with its src/ and vendor/) and mounts the bookshop's
   apiRouter() at /bookshop/api, the same router the Vercel function
   (bookshop/api/index.js) wraps. A folder not served here is not in
   vercel.json either — keep the two in step.

   The bookshop on its own, at /, is still `npm start` (port 8099).
   ============================================================ */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './bookshop/server/routes.js';

/* routes.js pulls in bookshop/server/env.js, which loads bookshop/.env
   the same way `npm start` does — nothing to call here. */

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BOOK = path.join(ROOT, 'bookshop');
const PORT = Number(process.env.PORT || 8080);
const app = express();

app.disable('x-powered-by');

app.use('/bookshop/api', apiRouter());

/* /bookshop without the slash: let the page's own inline script add it
   (production does the same, no server redirect) — serve the HTML as-is. */
app.get('/bookshop', (_req, res) => res.sendFile(path.join(BOOK, 'index.html')));
app.use('/bookshop/src', express.static(path.join(BOOK, 'src')));
app.use('/bookshop/vendor', express.static(path.join(BOOK, 'vendor')));
app.get(['/bookshop/', '/bookshop/index.html'], (_req, res) => res.sendFile(path.join(BOOK, 'index.html')));

app.use('/home', express.static(path.join(ROOT, 'home')));
app.get(['/', '/index.html'], (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));

app.listen(PORT, () => {
  console.log(`philosophicaltech on http://localhost:${PORT}  (/ , /bookshop/)`);
});
