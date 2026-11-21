# server

Optional. The site is still a folder you can open with no Node at all —
`python3 -m http.server 8099` (or any static server) works exactly as before,
on the baked snapshot in `src/js/data/enrich.js` only.

This adds two things on top of that:

```
node server/index.js     # or: npm start
```

- `GET /api/book?title=&author=` → `{ isbn13, pages, year, description, source }`,
  looked up live via Hardcover, then Open Library, then the fixture
  catalogue (`server/lookup.js` is the one place that order lives) — what
  `src/js/data/live.js` calls when a book the browser is showing has no
  baked ISBN. See "Client fallback" below.
- `GET /api/list/:slug` → `{ slug, items, source }`, a harvested award list.
  `data/lists/*.json` (phase 9's harvest, committed) is checked first,
  `server/fixtures/lists/<slug>.json` second; an unknown slug reports a
  clean `source: 'miss'`.

Both routes live in `server/routes.js` now, not here — this file mounts that
one router and adds local static serving on top. `api/index.js` (the Vercel
serverless function, PLAN-PHASE12.md §1.1) mounts the exact same router with
no static serving at all; a Vercel deploy is never a second implementation
of what these two routes do.

It never 500s on an upstream failure: `source` is always one of
`'live' | 'fixture' | 'miss'`, and a miss just means "nothing to add," not an
error.

## Modes

| | token in `.env` | `HARDCOVER_MOCK=1` | result |
|---|---|---|---|
| `npm start` | yes | — | live |
| `npm start` | no | — | fixture |
| `npm run mock` | yes or no | forced on | fixture |

Fixture mode reads `server/fixtures/catalogue.json` — four books chosen to
exercise the matcher's hard cases (a right-title/wrong-author decoy, an
edition list where only some entries carry an ISBN-13, a book with no usable
edition at all). It used to be a second process, `tools/mock-hardcover.mjs`;
that's folded in here now, so there's nothing separate to start.

## Files

```
server/index.js        express: static + /api
server/hardcover.js     the Hardcover client — ONE implementation, used by
                        this server, tools/hardcover.mjs and server/mcp.js
server/cache.js         disk cache under data/cache/, committable
server/env.js           the tiny .env reader
server/fixtures/catalogue.json   the fixture data source
server/fixtures/lists/*.json     harvested award lists (phase 9; none yet)
server/mcp.js           the same client, exposed as an MCP tool over stdio
```

`server/hardcover.js` is the only file that talks to `api.hardcover.app`. Its
`SEARCH_Q` and `BOOK_Q` queries, the scoring heuristic (`scoreMatch`) and the
edition-picking logic (`pickEdition`, preferring Hardcover's own
`default_physical_edition`) are the ones verified against the live API and
documented in `IMPLEMENTATION.md` §8 — do not re-derive them.

## The cache

`data/cache/hardcover.json` is a flat, sorted JSON object keyed by normalised
`"title author"`, written after every lookup that resolves to an ISBN. Misses
are never cached, so a book that fails today (rate limit, no confident match,
no token) gets a fresh attempt next time rather than being stuck. It's meant
to be committed — it's a growing, checkable snapshot of real answers, shared
between the live `/api/book` route and `tools/hardcover.mjs enrich`, so
neither has to pay for the same lookup twice.

## Client fallback

`src/js/data/live.js` is the only front-end file that knows this server
exists. When a book panel opens for a book with no baked ISBN, it fires
`fetch('/api/book?...')` once, caches the in-flight promise by book id, and —
if the server answers with real data — patches the already-rendered panel's
facts line, buy link and sample links in place. On a plain static server (no
`/api` route) or offline, the fetch just fails silently and the book renders
exactly as it does today. Nothing about the golden path changes; this only
improves the books the baked snapshot hasn't reached yet.

## MCP

```
node server/mcp.js
```

Exposes one tool, `hardcover_search(title, author)`, returning the same
`{ isbn13, pages, year, description, source }` shape as `/api/book`, over
stdio. `@modelcontextprotocol/sdk` is under `optionalDependencies` — nothing
else in the server needs it.
