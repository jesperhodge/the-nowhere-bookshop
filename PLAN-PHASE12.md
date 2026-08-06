# Phase 12 — final polish and Vercel

The last phase. `IMPLEMENTATION.md` §3's table ended at row 9; phase 10 was
the swap-over and phase 11 the descriptions. This one ships it.

Read `TRY-IT.md`'s "What is not done" for the standing worklist, and
`REVIEW-PHASE10.md` / `REVIEW-PHASE11.md` for what the review passes found.

---

## 0. The deployment decision, taken up front

Vercel serves static files from its CDN and Node from serverless functions.
The shop is a static folder — that is a stated project value
(`IMPLEMENTATION.md` §9: "do not add a bundler. No build step is a project
value") — and `server/` is *optional*, because the client's fallback chain is
baked `enrich.js` → `/api/book` → nothing. So:

| question | decision | why |
|---|---|---|
| How does the site deploy? | **Static, no build step.** `index.html`, `src/`, `vendor/` served straight off the CDN. No bundler, no framework preset. | The repo already runs by opening a folder. Vercel should not be the thing that introduces a build. |
| How does `/api` deploy? | **One serverless function** under `api/`, wrapping the *same* Express router `server/` already uses. | `PLAN-ARCH.md`'s "one client, three front ends" rule. A second implementation of the API for Vercel would be the exact divergence `IMPLEMENTATION.md` §5 already complains about once. |
| What has to change in `server/`? | Split the **routes** out of `server/index.js` into a module both entry points import. `server/index.js` keeps static-serving for local dev; the Vercel function imports only the routes. | Static-serving belongs to the CDN in production and to Express locally. The routes are the shared part. |
| What if the function is broken or cold? | **The shop must not care.** | The client already degrades: baked snapshot first, `/api/book` only for what the snapshot missed, nothing if that fails. This must be verified, not assumed — deploy-time proof that the site is fully usable with `/api` returning 500. |
| Secrets | `HARDCOVER_TOKEN` stays **server-side only**, as a Vercel env var, never in the client bundle. `GOOGLE_BOOKS_KEY` is **build/tooling only** and must not be referenced by anything the browser loads. | `IMPLEMENTATION.md` §9 and Hardcover's own terms. |
| Caching | `vendor/three/**` is immutable and versioned by path — long `max-age`, `immutable`. `index.html` must **not** be cached hard. `src/**` is unhashed ES modules, so it needs revalidation, not a year. | An unhashed module cached for a year is how you ship a shop nobody can update. |

---

## 1. Work

### 1.1 Vercel

```
NEW  vercel.json          static + /api rewrite, headers
NEW  api/index.js         the serverless function: the shared router, nothing else
EDIT server/routes.js     (new) the /api routes, extracted from index.js
EDIT server/index.js      imports the routes; keeps static for local dev
EDIT .env.example         document the deploy-time env vars
EDIT README.md            a real "deploy this" section
```

`data/cache/` and `server/fixtures/` must be reachable from the function —
they are what fixture mode reads. Vercel prunes files it cannot statically
see, so this needs `includeFiles` or equivalent, and it needs **proving**,
not assuming.

### 1.2 The standing bug list

Small, real, and all previously deferred with a reason that has now expired:

1. **Keyboard shortcuts do not guard modifiers.** `m`/`p`/`s`/`b` fire on
   ⌘/Ctrl combinations, so **⌘P opens the parcel *and* the print dialog**.
   Phase 8 guarded its own new `h` and recorded the inherited gap rather than
   silently changing four behaviours. Fix all four now.
2. **`Back` rewrites the hash to the room you just left** when a book panel
   is open — `closeBook()` does it. Phase 8 documented the reproduction and
   left it as out of scope. It is in scope now.
3. **The far end of a deep side case is unreachable** from any camera pose
   (phases 7–10). Either give it a pose or record it as accepted, with the
   measurement. Do not leave it as a fourth unexplained carry-forward.

### 1.3 Polish

- **`README.md`** is from iteration 1 and describes a shop that no longer
  exists. Rewrite it: what this is, how to run it, how to deploy it, and a
  map of which document answers which question. It is the front door.
- **Docs are now 20+ files.** Do not delete the history — the handoffs are
  the project's memory and every one earned its traps. But the README must
  say plainly which are current and which are archive.
- `<title>`, description meta, favicon, and Open Graph tags — the shop is
  going to be linked to. Check `index.html` actually has them.
- A **production smoke test**: the built site, served as static files with no
  Node at all, must be fully walkable. That is the deployment's real contract.

---

## 2. Verification

- `npm run qa` passes (it passed fully at `860f8bb` — a failure is yours).
- The site works as **pure static files, no server**: serve the repo with any
  static file server, walk rooms, open books, use search and the parcel.
- The site works with **`/api` returning 500** — degrade, do not break.
- `vercel build` (or `vercel dev`) runs clean locally if the CLI is
  available; if it is not, say so rather than claiming it was tested.
- No secret reachable from the browser: grep the served `src/` for
  `HARDCOVER_TOKEN` and `GOOGLE_BOOKS_KEY` and prove zero hits.
- The three bugs in §1.2 each have a reproduction that now fails to reproduce.
