# Plan — philosophicaltech.com becomes a developer homepage

The repo deploys `main` to philosophicaltech.com via Vercel. Until now `/` was
the bookshop. After this change:

```
/                       developer homepage (new)
/bookshop/              The Nowhere Bookshop (moved, otherwise unchanged)
/bookshop/api/*         the bookshop's serverless function
/<next-project>/        future projects, same pattern
```

Same stack everywhere: hand-written HTML/CSS/vanilla ES modules, no bundler, no
build step, Express only for `/api`, one root `package.json`, one `vercel.json`.

---

## Part A — move the bookshop into `bookshop/` (git mv, no rewrites)

Move with `git mv` so history follows:

- `index.html src/ vendor/ api/ server/ data/ tools/ .env.example` → `bookshop/`
- every bookshop doc → `bookshop/`: `PLAN*.md` (not this file), `HANDOFF*.md`,
  `HANDOVER.md`, `IMPLEMENTATION.md`, `README.md`, `TRY-IT.md`, `REVIEW-*.md`,
  `DESCRIPTIONS-FEASIBILITY.md`
- **stays at root**: `CLAUDE.md`, `package.json`, `package-lock.json`,
  `vercel.json`, `.gitignore`, `PLAN-HOMEPAGE.md`

Why it mostly just works: `server/env.js`, `tools/*.mjs` compute ROOT from
their own `import.meta.url` (`..`), so moving `server/ data/ tools/ src/`
together keeps every relative path valid. Do not "fix" those.

### A.1 Make the bookshop page path-independent

The page must work served at `/` (local `npm start`) **and** at `/bookshop/`
(Vercel). So no absolute URLs in the page:

- `bookshop/index.html` import map: `"/vendor/three/..."` → `"./vendor/three/..."`
  (MUST be `./` — a bare `vendor/...` is treated as a bare specifier and
  the map entry is silently ignored).
- `bookshop/src/js/data/live.js`: `fetch(\`/api/book?...\`)` → `fetch(\`api/book?...\`)`.
  Grep `bookshop/src` for any other leading-`/` fetch/import/URL and do the same.
- Trailing slash: at `/bookshop` (no slash) every relative URL resolves to `/`.
  Add, as the FIRST element in `<head>` after charset, an inline script:
  `if (/\/bookshop$/.test(location.pathname)) location.replace(location.pathname + '/' + location.search + location.hash);`
  (don't rely on a Vercel redirect — `/bookshop` vs `/bookshop/` matching is a
  loop risk we can't test here). Also add the same redirect in vercel.json only
  if `vercel build` proves it doesn't loop; otherwise skip it.
- Leave `tools/preview-stage.html` and `tools/qa.mjs` absolute paths alone —
  they run against the local bookshop server, which still serves at `/`.

### A.2 The function

`bookshop/api/index.js`: mount the router on BOTH prefixes —
`app.use(['/bookshop/api', '/api'], apiRouter())`. Vercel rewrites keep the
original URL in `req.url`, so in prod Express sees `/bookshop/api/book?...`.
Update the import path if needed (`../server/routes.js` still correct after
the move). Fix the header comment's paths.

`bookshop/server/index.js` (local dev) keeps serving the bookshop at `/` and
`/api` exactly as before. No behaviour change.

### A.3 vercel.json

Keep the LEGACY `builds` array — it is an explicit allowlist of what becomes
public (see `bookshop/HANDOFF-FINAL.md` "the vercelignore trap": zero-config
published the whole repo, sources and data included). New contents:

```
builds:
  index.html                   @vercel/static   (homepage)
  home/**                      @vercel/static   (homepage assets)
  bookshop/index.html          @vercel/static
  bookshop/src/**              @vercel/static
  bookshop/vendor/**           @vercel/static
  bookshop/api/index.js        @vercel/node, includeFiles (ONE brace string, not array):
    "{bookshop/data/cache/hardcover.json,bookshop/data/cache/openlibrary.json,bookshop/server/fixtures/**,bookshop/data/lists/**}"
rewrites:
  /bookshop/api/(.*) → /bookshop/api
headers: same cache policy, paths prefixed with /bookshop/; add
  /home/(.*) → max-age=0, must-revalidate; keep "/" and "/index.html";
  add "/bookshop/" and "/bookshop/index.html".
```

Check whether `includeFiles` globs resolve from repo root or from the
function's dir — `vercel build` tells you (see A.5).

### A.4 package.json, .gitignore, dev server

- Every script path → `bookshop/...` (`node bookshop/server/index.js`,
  `node bookshop/tools/qa.mjs`, …). Name/description become repo-wide
  (`"name": "philosophicaltech"`). Dependencies unchanged.
- `.gitignore`: prefix every bookshop path (`tools/qa-report.json`,
  `tools/suggestions/`, `data/cache/wiki/`, `data/cache/isbn-wanted.json`,
  `data/cache/describe/`, `parcel.png` if bookshop-relative) with `bookshop/`.
  Preserve the comments and the LAST-MATCH-WINS ordering of `.env` lines.
- New `dev.mjs` at root + script `"dev": "node dev.mjs"`: an Express server
  that mirrors production routing — serves exactly the vercel.json static
  allowlist (`/`, `/home`, `/bookshop/` + `src`, `vendor`), mounts the
  bookshop `apiRouter()` at `/bookshop/api`, port 8080 (env `PORT`). Use
  `bookshop/server/env.js` loading the same way `bookshop/server/index.js`
  does so `.env` still works. This is how you see the whole site locally.

### A.5 Verify

- `npm start` → bookshop at http://127.0.0.1:8099/ still works; `npm run qa`
  passes (79 checks expected; report the real number).
- `npm run dev` → `/`, `/bookshop/` (renders, three.js loads, `/bookshop/api/book?...`
  answers — mock mode fine), `/bookshop` redirects to `/bookshop/`.
- `vercel build` with the fake link + token from `bookshop/HANDOFF-FINAL.md`
  (`npx vercel build --yes --token dummytoken123`), then
  `find .vercel/output/static | head` — static bucket must contain ONLY the
  allowlist: no `.md`, no `server/`, no `tools/`, no `data/`. Then delete
  `.vercel/`.

---

## Part B — the homepage

Lives at `index.html` + `home/` (`home/style.css`, `home/main.js`,
`home/projects.js`). Owner: Jesper Hodge. Studied philosophy; "deep thinking
and thoughtful tech". Brief: interesting, creative, weird, intellectual.

### The concept: one body of work, three philosophical forms

The page renders the same content in a choice of **forms**, switchable at the
top ("Read this page as: Tractatus · Ethics · Dialogue"):

1. **Tractatus** (default) — Wittgenstein's decimal propositions.
   `1` The world is everything that is the case. This site is everything that
   is the project. `1.1` who Jesper is. `2` the projects, `2.1`, `2.2`…, each
   with sub-propositions (`2.11` what it is, `2.12` how it's built). `3`
   correspondence (links). `7` Whereof one cannot speak, thereof one must be
   silent. Unwritten future projects appear as a greyed `2.n` that says
   so: "Whereof one has not yet shipped, thereof one must be silent."
2. **Ethics, demonstrated in geometrical order** — Spinoza. Definitions
   (Def. I: by *thoughtful tech* I understand…), Axioms, then each project as
   a Proposition with Demonstration and Scholium, ending in *Q.E.D.*
3. **Dialogue** — a short Socratic dialogue between SOCRATES and JESPER about
   what the projects are; Socrates asks, Jesper answers, the projects are the
   answers. Links appear inline in Jesper's lines.

All three are generated from ONE data file, `home/projects.js`, so adding a
project = adding one object. Shape:

```js
export const PROJECTS = [{
  slug: 'bookshop', title: 'The Nowhere Bookshop', href: '/bookshop/',
  year: 2026, status: 'open',        // 'open' | 'in progress' | 'archived'
  thesis: 'one sentence: what it is',
  method: 'one sentence: how it is built',
  tags: ['three.js', 'vanilla JS', 'Express', 'Vercel'],
  gloss: 'a marginal remark — the why',
  question: 'what Socrates asks about it',
}];
```

Plus `PERSON` (name, one-line about, links) in the same file.
Links: LinkedIn `https://www.linkedin.com/in/jesper-hodge`, GitHub
`https://github.com/jesperhodge`.

Bookshop copy (from its own pitch): a curated 3D bookshop — wander the
rooms, pull books off the shelf, buy from an independent seller; every shelf
hand-picked from prize lists and critics' choices, never bestsellers by
default. Built with hand-written three.js, no bundler, no build step.

### Craft details

- Typography: EB Garamond (body) + IBM Plex Mono (numbers, labels), Google
  Fonts. Paper-and-ink: warm off-white / near-black ink; dark mode via
  `prefers-color-scheme` and a manual toggle. Colours as CSS custom
  properties on `:root`.
- Proposition numbers hang in a left margin (Tractatus); on narrow screens
  they sit inline above the text. No horizontal scroll at 360px.
- **Glosses**: each project's `gloss` appears as a marginal note on the
  right on wide screens (hover/focus highlights its pair), inline italics
  on narrow ones.
- **The weird bit**: a quiet generative ink drawing in the background — a
  `<canvas>` that slowly traces a single unbroken line (a random walk with
  momentum, like someone thinking with a pen), low opacity, pauses when the
  tab is hidden, static (one frame) under `prefers-reduced-motion`.
- Form switch: buttons with `aria-pressed`, swap with a short fade, choice
  remembered in localStorage (wrapped in try/catch) and in the URL hash
  (`#tractatus`, `#ethics`, `#dialogue`) so a form can be linked.
- A tiny colophon footer: "Hand-set in HTML. No framework was harmed."
- `<noscript>`: a plain list of projects and links, so nothing depends on JS.
- Meta: title "Philosophical Tech — Jesper Hodge", description, OG tags,
  canonical `https://philosophicaltech.com/`, inline SVG favicon (a ¶ or a
  stylised "7").
- Accessible: semantic headings, `lang="en"`, visible focus, contrast ≥ 4.5:1
  in both themes.

### Old deep links

The bookshop used to live at `/`, so shared links look like
`philosophicaltech.com/#/front`. The homepage must forward any hash matching
`^#\/[\w-]+` to `/bookshop/` + the same hash, before rendering (inline script
in `<head>`). The form hashes (`#tractatus` etc.) have no slash, so no clash.

### Verify

Playwright screenshots of `/` at 1280 and 390 wide, light and dark, all
three forms; zero console errors; `/bookshop/` link works under `npm run dev`.

---

## Part C — docs

- New root `README.md`: what the repo is now, the layout, `npm run dev`,
  and **"Adding a project"**: make `<name>/`, add its static globs (and any
  function) to `vercel.json` `builds` — the allowlist is explicit, a folder
  not named there is NOT deployed — add an entry to `home/projects.js`.
- `CLAUDE.md`: paths it names (`PLAN.md`, `PLAN-ARCH.md`, `HANDOFF-PHASE*.md`)
  now live in `bookshop/`; say so in one line. Otherwise unchanged.
- `bookshop/README.md`: fix commands/paths that changed (npm scripts still run
  from repo root).
