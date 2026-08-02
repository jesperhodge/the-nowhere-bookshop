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
