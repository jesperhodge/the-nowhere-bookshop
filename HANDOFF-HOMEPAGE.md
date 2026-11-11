# Handoff — philosophicaltech.com is a developer homepage now

Plan: `PLAN-HOMEPAGE.md`. Done: planned, implemented, reviewed, verified.
Not yet merged to `main`, so prod still serves the old bookshop-at-`/`.

## Shape

```
/index.html, /home/*     homepage — one data file (home/projects.js), three
                         rendered "forms": Tractatus / Ethics / Dialogue
/bookshop/               the whole bookshop, moved with git mv, docs included
/bookshop/api/*          its function (bookshop/api/index.js)
/dev.mjs                 `npm run dev` — whole site on :8080, mirrors vercel.json
package.json, vercel.json, .gitignore   stay at root, shared by every project
```

`npm start` / `npm run qa` still run the bookshop alone at `/` on :8099 —
unchanged, which is why tools/qa.mjs and preview-stage.html keep absolute paths.

## Verified (really run, not assumed)

- `vercel build` (fake link + token, recipe in bookshop/HANDOFF-FINAL.md):
  ok; static bucket = 57 files, exactly the allowlist; function file map has
  the same 80 data files as before, at `bookshop/...` paths; rewrite present.
- Static bucket served plainly + Playwright: `/` and `/bookshop/` render, zero
  errors.
- `npm run qa`: 0 failures, 69 `ok` lines. Earlier docs say 79 — never
  baselined pre-move, so the gap is unexplained, not proven harmless.
- Homepage: 12 viewport/theme/form combos, zero errors, no overflow at 390.
- Not verified: a real Vercel deploy. The Vercel connector shows zero projects
  for this account, so no preview could be checked. Check the branch preview
  before merging.

## Traps

- **Import-map values must start with `/`, `./` or `../`.** `vendor/three/…`
  is a bare specifier; Chromium drops the entry with only a warning. Use
  `./vendor/…`.
- **`/bookshop` without the slash** resolves every relative URL against `/`.
  An inline script at the top of bookshop/index.html adds the slash. No
  vercel.json redirect on purpose: an untestable loop risk. The browser still
  prefetches `/src/styles/base.css` once before the redirect: one harmless
  console error. Test at `/bookshop/`, not `/bookshop`.
- **Old shared links** (`philosophicaltech.com/#/front`) are forwarded to
  `/bookshop/#/front` by an inline script in the homepage `<head>`. Form hashes
  (`#ethics`) have no slash, so they don't collide. Keep it that way.
- **The function sees the ORIGINAL URL** (`/bookshop/api/book`), not the
  rewrite target, so Express mounts on `['/bookshop/api', '/api']`.
- **`includeFiles` globs resolve from the repo root**, not the function's dir.
  One brace string, never an array (bookshop/HANDOFF-FINAL.md).
- **`builds` is an allowlist.** A new project folder not named there is
  silently NOT deployed, and dev.mjs must be told about it too. Do not
  "modernise" to zero-config: that publishes the whole repo.
- **Adding a project touches 4 places:** the folder, `vercel.json` builds,
  `dev.mjs`, `home/projects.js` + the `<noscript>` list in index.html.
  README.md has the checklist.
- Tractatus numbering is clean up to 9 projects (2.1–2.9), then 2.91, 2.92…
- No `og:image` on the homepage — crawlers won't rasterise SVG. Drop a
  1200×630 PNG at `home/og.png` and add the tags if the link card matters.
- The copy refers to the author as "the author", not "he": that pronoun was
  never stated. The "let him…" lines are about a generic reader, as pastiche.
