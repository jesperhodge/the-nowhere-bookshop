/* ============================================================
   Which upstream answers, and in what order. The ONLY place that
   decides — server/index.js, server/mcp.js and tools/ all come
   through here, and neither provider client knows the other
   exists (PLAN-ARCH.md's "one implementation" rule, applied per
   upstream rather than per project — see server/openlibrary.js).

   The chain:

     HARDCOVER_MOCK=1   fixtures only, no network at all. `npm run
                        mock` means deterministic and offline, so
                        a live second upstream would defeat it.
     token set          Hardcover live first. IMPLEMENTATION.md §8's
                        verified queries are the owner's path and
                        this phase does not demote them.
     then               Open Library live.
     then               the recorded fixture catalogue.
     then               a miss.

   `source` keeps exactly the three values IMPLEMENTATION.md §5
   documents — live · fixture · miss — so nothing downstream grows
   a fourth case. `via` is additive and names the upstream that
   actually answered, because "live" alone stopped being specific
   enough the moment there were two of them.

   It never 500s. Every provider resolves a failure to a miss and
   says so; there is nothing here to catch.
   ============================================================ */

import { MODE as HARDCOVER_MODE, lookupBook as hardcoverLookup } from './hardcover.js';
import { ENABLED as OL_ENABLED, lookupBook as olLookup } from './openlibrary.js';

const FORCE_MOCK = /^(1|true)$/i.test(process.env.HARDCOVER_MOCK || '');

/** What `npm start` prints, so the operator can see which way it will go. */
export const MODE = FORCE_MOCK
  ? 'fixture (forced)'
  : [HARDCOVER_MODE === 'live' ? 'hardcover' : null, OL_ENABLED ? 'openlibrary' : null, 'fixture']
    .filter(Boolean).join(' → ');

const shape = (r, via) => ({
  isbn13: r.isbn13 ?? null,
  pages: r.pages ?? null,
  year: r.year ?? null,
  description: r.description ?? null,
  source: r.source,
  via,
});

const MISS = { isbn13: null, pages: null, year: null, description: null, source: 'miss', via: null };

/**
 * { isbn13, pages, year, description, source, via }.
 * A result counts as an answer when it carries at least one fact — an
 * ISBN, a page count, a year or a description. A provider that matched
 * but knows nothing useful is a miss, and the next one gets a turn.
 */
export async function lookupBook({ title, author, isbn, year } = {}) {
  if (!title || !author) return MISS;

  const useful = (r) => r && r.source !== 'miss'
    && (r.isbn13 || r.pages || r.year || r.description);

  /* Hardcover first when it can actually answer live. In fixture mode its
     result is held back and only used if nothing live turns up, so a
     four-book smoke fixture never shadows a real answer. */
  const hc = await hardcoverLookup({ title, author, isbn });
  if (HARDCOVER_MODE === 'live' && useful(hc)) return shape(hc, 'hardcover');

  if (!FORCE_MOCK && OL_ENABLED) {
    const ol = await olLookup({ title, author, year });
    if (useful(ol)) return shape(ol, 'openlibrary');
  }

  if (useful(hc)) return shape(hc, 'fixture');
  return MISS;
}
