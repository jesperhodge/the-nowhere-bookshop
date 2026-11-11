# Handoff — the whole project, for a session with no context

You are picking this up cold. Read this file first and completely; it is the
only document that is current everywhere. Twenty-seven other `.md` files are
in the repo and most of them are **history, not status** — §7 says which is
which.

---

## 1. What this is

A curated 3D bookshop. **50 room records — 49 you can stand in, plus one
table — and 2,505 books**, every one drawn from a prize list or hand-picked,
never a bestseller list. You walk through lit doorways, take a book off a
shelf, read a blurb and (for 409 of them) a curator's note, and buy from an
independent seller.

The brief that matters, and it has survived every phase: *"I had no idea this
existed"* is the feeling. **The curator's note is the product.**

It is a static folder plus ES modules with **no build step**, and that is a
deliberate value, not an accident. Do not add a bundler.

## 2. Run it

```sh
npm install      # once; the site itself needs no install to view
npm start        # Express on :8099 — serves the site and /api
```

Then <http://localhost:8099>. Without a `HARDCOVER_TOKEN` in `.env` the API
runs on baked data and fixtures — that is the intended offline mode, not a
degraded one.

The isolation harness — one room, layers switchable — is at
<http://localhost:8099/tools/preview-stage.html?room=front>. `TRY-IT.md` lists
its query parameters. **Every scene bug since phase 3 was found there.**

```sh
npm run qa       # 79 checks. Takes minutes. Run it in the FOREGROUND.
```

## 3. Where it is deployed

**<https://www.philosophicaltech.com>**, on Vercel, from GitHub `main`. The
owner deploys; do not attempt it.

`vercel.json` uses the **legacy `builds` array on purpose**. It is an explicit
allowlist of `index.html`, `src/**`, `vendor/**`. The modern
`functions.includeFiles` config published *the entire repository* as static
output — planning docs, server source, caches — and `.vercelignore` had **no
effect** on it. Do not "modernise" this. Verify after any change:
`curl -sL -o /dev/null -w '%{http_code}' https://www.philosophicaltech.com/CLAUDE.md`
must be **404**.

## 4. The state, honestly

Everything below was measured, not assumed.

**Verified working.** `npm run qa` passes 79 checks with zero console errors,
page errors or failed requests: 50 rooms render, routing and browser
back/forward, the parcel surviving a reload, the no-WebGL fallback, the a11y
mirror, data integrity (ISBN check digits, accolade provenance), outbound
links, and the contrast sweep. The site works as pure static files with no
Node at all, and with `/api` returning 500.

**Text contrast is a guarantee, not a hope.** Every text run over the canvas
sits on a plate whose alpha was solved so the ratio holds *even if the whole
scene behind it were white*. 1,440 rendered runs across 50 rooms × 2 poses,
0 failures, plus 15 static plate/token pairs. `PLAN-CONTRAST.md` has the
arithmetic. **Never lower a plate alpha** — `tools/contrast.mjs`'s static
check will fail you, and it is right to.

**Mobile works.** Drag one finger (or left-drag on desktop) to turn the view;
pinch dollies; tapping empty floor leaves a close-up. All controls are ≥44×44
on coarse pointers, safe-area insets are respected, and overlays scroll as
one document rather than a sliver inside fixed furniture. Checked at 320×568,
375×667, 390×664, 430×932 and landscape 844×390.

**Still open, in rough priority:**

1. **No real screen reader has ever been used.** Carried since phase 4. Every
   a11y check is programmatic — names, roles, focus order. `IMPLEMENTATION.md`
   §4.7's own warning is that an audit tool passes on a page that is unusable.
   This is the largest untested claim in the project.
2. **No real iOS/Safari testing.** All mobile work was verified in Chromium,
   including device emulation. Safari has its own touch behaviour
   (rubber-banding, gesture interception) that emulation does not reproduce.
3. **805 of 2,096 harvested books have no description.** A coverage gap, not
   a bug. `DESCRIPTIONS-FEASIBILITY.md` measured every source. Google Books is
   the way to close most of it: `GOOGLE_BOOKS_KEY=... npm run describe`. The
   code path is built and skips cleanly without a key.
4. **The far end of a deep side case is unreachable** from any camera pose.
   Measured three times, recorded as accepted; a real fix needs a change to
   the pose model, which is an architecture call.
5. At ~24vh the book cover is small enough that its "drag to turn it over"
   flip is more keepsake than usable gesture on the smallest phones.

## 5. Traps that have already cost sessions

Each of these cost someone real time. They are not hypothetical.

- **A metric goes green long before the picture does.** This is the project's
  signature failure and it has recurred in three separate phases. A camera
  clearance fix measured 0/50 while rendering a wall of shelf boards; a
  framing fix put 21/21 doors on screen and made the room worse; a scroll fix
  passed `scrollIntoView()` while being **completely unscrollable by a user**.
  **Screenshot it. Use a real gesture.** `scrollIntoView()` and `scrollTop`
  both scroll `overflow: hidden` containers; users cannot.
- **Do not background `npm run qa` and wait for a notification.** Six agents
  in a row stalled that way, each losing a whole session. Run it in the
  foreground with a long timeout and read the output.
- **Node's built-in `fetch` ignores the proxy** and fails with a flat
  `403 Host not in allowlist` that reads exactly like an auth error. Use
  `NODE_USE_ENV_PROXY=1 node …`.
- **Never run `playwright install`.** Chromium is at `/opt/pw-browsers`; pass
  `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- **Kill stray servers and confirm which one you are talking to.** A leftover
  `python3 -m http.server` holding :8099 while `npm start` had silently died
  cost two sessions of assertions run against the wrong build.
- **Never sort `.gitignore`.** It is last-match-wins; sorting puts
  `!.env.example` above `.env.*` and silently ignores the template.
- **Wait for a real settle condition, never a fixed timeout.** A screenshot
  taken before the room settles is a lie. Use
  `__shop && !state.travelling && __stage.frame > 5 && __room.isReady &&
  !__room.rig?.tweening`.
- **`git push` returns 403 from the sandbox.** Commit locally — commits are
  the record — and hand the work over as a zip. Do not burn retries.

## 6. How the work is done here

`CLAUDE.md` sets it: **Opus plans and reviews, Sonnet implements.** Do not
collapse the steps. Write the plan down *before* the code, and run the review
as a **separate, deliberate, adversarial pass** over the finished diff.

That pass is not ceremony — it is where essentially every real defect in this
project was found. Phase 9's review found eleven, none of which were in its
plan. The pattern is consistent enough to trust: the implementation looks
right, reviews clean on a read, and fails on a screenshot.

## 7. Which documents to trust

**Current status:** this file, then `TRY-IT.md`'s "What is not done".

**Still-true reference:** `IMPLEMENTATION.md` (§4.1 coordinates, §4.7
accessibility, §9 things not to do), `PLAN-ARCH.md` (architecture and why),
`PLAN.md` (the original measured diagnosis — do not re-derive it),
`DESCRIPTIONS-FEASIBILITY.md`, `PLAN-CONTRAST.md`, `PLAN-MOBILE.md`,
`PLAN-SHEETS.md`.

**History — read for reasoning, not for status:** every `HANDOFF-PHASE*.md`,
`PLAN-PHASE*.md`, `REVIEW-PHASE*.md`, `HANDOFF-FINAL.md` (which stops at
phase 12), and `HANDOVER.md` (iteration 1). They are the project's memory and
every trap in them was paid for, but several describe a shop that has since
changed.

## 8. The shape of the code

```
index.html            the whole DOM UI — dock, book panel, overlays
src/js/main.js        routing, state, the stage, keyboard
src/js/scene/         the three.js shop: room.js assembles, poses.js owns
                      the camera, books/tables/doors/props/shell build it
src/js/data/          books/ (409 curated) + generated/ (2,096 harvested)
src/styles/           base.css, ui.css   (scene.css and themes.css are gone)
server/               routes.js is shared by index.js (local) and api/ (Vercel)
tools/                qa.mjs, contrast.mjs, harvest.mjs, describe.mjs,
                      preview-stage.html
```

Two rules the code enforces on itself: **`poses.js` owns the camera** — a
second thing moving it is a bug class this project has hit repeatedly — and
**one implementation, several front ends** (`server/routes.js` serves both
the local server and the Vercel function).
