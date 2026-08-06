/* ============================================================
   The tiniest possible .env reader. No dependency, because this
   is the only place in the server that needs one.

   Never sort or "clean up" a caller's .gitignore around this —
   see the comment there. This module only reads .env; it never
   writes it and never prints a value.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* "One directory up from wherever this file physically is" — true locally
   (<repo>/server/env.js) and, checked rather than assumed, true under
   Vercel's Node runtime too: `vercel build`'s output keeps every module
   at its real repo-relative path (server/env.js sits at
   .vercel/output/functions/api/index.js.func/server/env.js, unbundled,
   comments intact — no esbuild single-file bundling happens for this
   runtime/config), so `import.meta.url` still resolves one real
   directory up to the function's own root. That root is exactly where
   `includeFiles` (vercel.json, and see api/index.js's own comment) has
   to land data/cache/** and server/fixtures/** for cache.js's and
   hardcover.js's plain `fs.readFileSync(path.join(ROOT, …))` calls to
   find them.

   What THIS could confirm by building locally: the module layout, and
   that includeFiles' glob matches the intended files (visible in
   .vc-config.json's filePathMap). What it could NOT confirm without a
   real `vercel deploy` (no Vercel account in this sandbox): that those
   matched files are physically present at this same path at RUNTIME —
   local `vercel build` records them as a logical filePathMap, not as
   copies inside index.js.func/, so the last mile from "matched" to
   "readable by fs.readFileSync at request time" is asserted by Vercel's
   own docs, not eyes-on in this repo. Flagged plainly in
   HANDOFF-FINAL.md rather than claimed as proven. */
export const ROOT = path.join(HERE, '..');

export function loadDotEnv() {
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
