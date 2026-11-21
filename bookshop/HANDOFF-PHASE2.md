# Handoff — phase 1 done, phase 2 next

Read `IMPLEMENTATION.md` first (the brief, in phase order), then `PLAN.md`
(diagnosis) and `PLAN-ARCH.md` (the three.js decision) if phase 2 touches the
scene. `HANDOVER.md` is iteration 1 and is still accurate about the data and
`tools/qa.mjs`. This file is only about what phase 1 built and what's true
now that it exists.

This session did **only phase 1** — "Express server, fixtures, client
fallback" — by explicit instruction, specifically so the three.js rewrite
(phases 3–8) wouldn't be attempted half-supervised in one sitting. Phases 2
(viewBox fixes) and 3–9 are still exactly as described in `IMPLEMENTATION.md`
and untouched.

## What exists now that didn't before

```
package.json, package-lock.json   tracked (were gitignored). node_modules/
                                   still ignored. "type": "module" as a side
                                   effect also silences the
                                   MODULE_TYPELESS_PACKAGE_JSON warning
                                   tools/hardcover.mjs used to print.
server/
  index.js       express: static (index.html + src/ only — not the repo
                 root, see "narrowed static scope" below) + /api
  hardcover.js   the ONE Hardcover client — live queries (verified against
                 the real API this session, see below) + fixture data,
                 behind one shape. tools/hardcover.mjs and server/mcp.js
                 both import this; nothing else talks to the network.
  cache.js       synchronous disk cache at data/cache/hardcover.json,
                 committable, live-mode writes only (see "cache" below)
  env.js         the .env reader, shared by hardcover.js and the CLI
  fixtures/catalogue.json   the fixture data (was tools/mock-hardcover.mjs)
  fixtures/lists/           empty — this is where phase 9's harvested award
                            lists land, one JSON file per slug
  mcp.js         the same client as an MCP tool (stdio), optional dep
  README.md      more detail than this file on the server specifically
src/js/data/live.js   client fallback: baked enrich.js → fetch /api/book →
                      nothing. Wired into views/book.js (see below).
data/cache/           see cache.js above. .gitignore does NOT exclude this —
                      it's meant to be committed.
```

`tools/mock-hardcover.mjs` is deleted — folded into `server/hardcover.js`'s
fixture mode (`--mock` flag on `tools/hardcover.mjs`, or `HARDCOVER_MOCK=1`).
`tools/hardcover.mjs` no longer talks to the network itself; it's a thin CLI
over `server/hardcover.js`'s `matchBook`/`pickEdition`/`gql`.

## Verified against the live API, this session

Confirmed working end to end with the token in `.env` (curl and Node's
`fetch` both work directly in this environment — no proxy workaround was
needed here, unlike what `IMPLEMENTATION.md` §1 warns about for a different
sandbox):

- `SEARCH_Q` + `scoreMatch` correctly picked *Stoner* (John Williams) over a
  same-title decoy, and the real *Beloved* over the wrong-author one — the
  exact cases `IMPLEMENTATION.md` §8.3 calls out.
- `BOOK_Q` now also asks for `default_physical_edition` (§8.4) and
  `pickEdition()` prefers it when it carries an ISBN-13, falling back to the
  old language/pages heuristic otherwise.
- The Employees / Olga Ravn round-tripped fine (the translated-year gotcha
  in §8.5 is a scoring weight, not a query problem).
- `data/cache/hardcover.json` has real entries from this session's testing —
  proof the whole path works, not a bulk run.

**Not done, on purpose:** the actual `tools/hardcover.mjs enrich` run across
all 409 books (would populate `src/js/data/enrich.js`) and the phase 9
harvest of ~2,000 new books. Both are one command away now
(`npm run enrich`, or `node tools/hardcover.mjs enrich` — takes a few minutes
at the 40/min pace) but are separate, larger decisions from phase 1's scope.
`src/js/data/enrich.js` is still deliberately empty.

## Two bugs found and fixed while testing this session's own work

Neither is in `IMPLEMENTATION.md` — both surfaced from actually running the
server, not from re-reading the plan:

1. **`express.static(ROOT)` would have served the whole repo root**,
   including `server/*.js` source, `tools/`, `node_modules/`, `package.json`
   and `data/cache/hardcover.json`, to anyone hitting the server. (`.env`
   itself was never at risk — Express's static middleware ignores dotfiles
   by default, verified with a direct request — but everything else was
   reachable by exact path.) Fixed: only `/` , `/index.html` and `/src/**`
   are served now. If you add another top-level asset the front-end needs,
   add it to `server/index.js` explicitly rather than widening the static
   root back out.
2. **A fixture-mode lookup could silently poison the live cache.** The
   cache is keyed by title+author regardless of which mode produced the
   answer, so running `--mock` once against the same `data/cache/` a live
   run also uses would overwrite a real ISBN with the fixture catalogue's
   placeholder one — reproduced it by hand while testing `server/mcp.js`.
   Fixed in `server/hardcover.js`'s `lookupBook()`: only a `MODE === 'live'`
   result is ever written to disk. A fixture answer is instant and
   in-memory already, so caching it bought nothing and only added risk.
   Reads still check the cache regardless of current mode, which is correct
   the other way — a previously-cached live answer should still be served
   even if the server is temporarily running in fixture mode.

If phase 2+ adds more cached data sources, keep that live-only-write rule;
it's easy to reintroduce this exact bug by copy-pasting a fixture path that
also calls `setCached`.

## Things phase 2+ should know

- **`npm start` / `npm run mock`** both work; QA (`node tools/qa.mjs`) passes
  clean against the Express server on :8099 exactly as it did against a
  plain static server — 409 books, 50 rooms, all 50 book panels open OK, no
  console errors, all link-builder checks pass. The client fallback (point
  below) adds background `/api/book` calls when a book panel opens for a
  book with no baked ISBN — none currently have one, so *every* book panel
  open now fires one in the background. That's fine for QA (it doesn't
  block anything) but worth knowing if you're watching network traffic or
  reasoning about the 40/min pacing during a QA run.
- **The client fallback (`src/js/data/live.js`) mutates the shared book
  object in place** (`book.isbn = live.isbn13`, etc.) once a fetch resolves,
  the same way `shop.js` already merges baked `enrich.js` data onto each
  book at load time. This means a book fetched once stays enriched for the
  rest of that page session, and reopening its panel won't re-fetch
  (`live.js` also caches the in-flight promise by book id). It does **not**
  persist to `localStorage` or write back to `enrich.js` — that's exactly
  the boundary `IMPLEMENTATION.md` §6 draws for point 7(c)'s "runtime
  enrichment as a top-up," so this phase-1 piece is deliberately that top-up
  and nothing more.
- **`/api/list/:slug`** always responds (never 404s), reporting
  `source: 'miss'` until phase 9 harvests something into
  `server/fixtures/lists/<slug>.json`. Whoever builds the harvest pipeline
  should write JSON files there — an array of `{ title, author, ... }`
  under a sensible key — matching the shape `/api/list/:slug` already
  expects to find and pass through as `items`.
- **`server/mcp.js` needs `@modelcontextprotocol/sdk`**, which is under
  `optionalDependencies` — `npm install` gets it by default, but nothing
  else in `server/` imports it, so it's fine if a future minimal deploy
  skips it.
- Phase 2 (the five `props.js` viewBox fixes, Finding C in `PLAN.md`) is
  independent of all of this and untouched.

## Running it yourself

```sh
cp .env.example .env && $EDITOR .env    # paste HARDCOVER_TOKEN in
npm install
npm start                                # http://localhost:8099, live mode
# or: npm run mock                       # fixture mode, no token needed
node tools/qa.mjs                        # full sweep, ~2 minutes
```
