# philosophicaltech.com

A developer homepage, and the projects that live under it. Deployed from
`main` to Vercel.

```
/                 the homepage — one body of work, three philosophical forms
/bookshop/        The Nowhere Bookshop (a 3D bookshop; see bookshop/README.md)
/bookshop/api/*   the bookshop's one serverless function
/<next>/          future projects, same pattern
```

Same stack everywhere: hand-written HTML, CSS and vanilla ES modules. No
bundler, no build step, no framework. Node is only used to serve `/bookshop/api`
and to run tooling. One root `package.json`, one `vercel.json`.

## Layout

```
index.html        the homepage (head: old-deep-link forwarder, meta, noscript list)
home/
  style.css       paper and ink; light/dark; the three forms' layouts
  main.js         renders the forms, theme + form switch, the ink line
  projects.js     THE data file: PERSON and PROJECTS — add a project here
bookshop/         the bookshop, self-contained (its own README, plans, tools)
vercel.json       the deploy allowlist, headers, the /bookshop/api rewrite
dev.mjs           local server that mirrors vercel.json's routing
CLAUDE.md         how work is routed between models in this repo
PLAN-HOMEPAGE.md  the plan this layout came from
```

## Run it

```sh
npm install
npm run dev       # the whole site as Vercel serves it — http://localhost:8080
npm start         # the bookshop alone, at /, on :8099
```

`npm run dev` serves exactly what `vercel.json` makes public — `/`, `/home/`,
`/bookshop/` (with its `src/` and `vendor/`) — and mounts the bookshop's API at
`/bookshop/api`. `HARDCOVER_MOCK=1 npm run dev` forces the bookshop onto
fixtures. Set `PORT` to move off 8080. Other scripts (`npm run qa`,
`npm run harvest`, …) are the bookshop's tooling; they run from here and are
described in `bookshop/README.md`.

The homepage only ever lives at `/`, so it uses root-absolute URLs
(`/home/style.css`). Projects must not: a project is served under its own
folder, so everything it references is **relative** (`./vendor/…`, `api/…`).

## Adding a project

1. **Make the folder**: `<name>/`, with its own `index.html`. Keep every URL in
   it relative, so it works at `/<name>/` and when served alone. If it needs a
   trailing-slash guard, copy the first `<script>` in `bookshop/index.html`.
2. **Allow it in `vercel.json`.** The `builds` array is an explicit allowlist —
   a folder not named there is **not deployed**. Add a `@vercel/static` entry
   per glob (`<name>/index.html`, `<name>/src/**`, …) and, for a function, a
   `@vercel/node` entry with its `includeFiles` (one brace string, not an
   array) plus a `rewrites` entry for `/<name>/api/(.*)`. Add `headers` for
   `/<name>/` and its assets (copy the bookshop's block; HTML and your own
   code revalidate, vendored libraries are immutable).
3. **Teach `dev.mjs` the same routes**, so `npm run dev` matches production.
   If it is not served there, it is not in `vercel.json` either — keep the two
   in step.
4. **Add it to `home/projects.js`**: one object in `PROJECTS` (`slug`, `title`,
   `href`, `year`, `status`, `thesis`, `method`, `tags`, `gloss`, `question`).
   All three forms pick it up. Write `thesis` and `method` as full sentences
   beginning "It is…", so they read in the Tractatus, the Ethics and the
   dialogue alike. The Tractatus numbering is good for nine projects; past that
   it steps to 2.91, 2.92, …
5. **Add it to the `<noscript>` list in `index.html`**, the one place the
   homepage names projects outside the data file.
6. **Check**: `npm run dev`, open `/` in each form (`#tractatus`, `#ethics`,
   `#dialogue`) and follow the link. Before pushing, `npx vercel build --yes
   --token dummytoken123` and look in `.vercel/output/static`: only the
   allowlist, no `.md`, no `server/`, no `data/` (see
   `bookshop/HANDOFF-FINAL.md`, "the vercelignore trap"). Delete `.vercel/`
   after.

## The homepage

`home/projects.js` holds the person and the projects; `home/main.js` turns that
one list into three forms — Wittgenstein's numbered propositions (default),
Spinoza's *Ethics* in geometrical order, and a short Socratic dialogue. The
choice is remembered in `localStorage` and in the URL hash. A slow generative
line wanders behind the text (a random walk with momentum; still under
`prefers-reduced-motion`). `index.html` also forwards old `/#/front`-style
bookshop deep links to `/bookshop/#/front`.
