# Trying it out, and seeing what changed

Written mid-project, during phase 10, and updated at the close of phase 12 —
the last phase. Read `HANDOFF-FINAL.md` for that phase's own account of what
shipped and what is still open; the "What is not done" section at the bottom
of this file is the standing, itemised worklist it closes most of out.

## The one thing to know first

**There is one build.** Phase 10 retired the CSS-3D scene and made the
three.js stage the actual shop, so `npm start` gives you real geometry, real
lights, doorway openings, tables and camera poses — everything phases 3–7
built beside the live site is *in* it. Phase 12 added a Vercel deployment
(`vercel.json`, `api/index.js`) on top, without touching how any of this
runs locally.

`src/js/scene.js`, `src/styles/scene.css` and `src/styles/themes.css` are
gone. The whole DOM UI stayed exactly as it was: dock, book panel, search,
plan, parcel, and the grain and vignette overlays that sit on top of the
canvas and carry a lot of the mood.

**Status:** phases 10 and 11 both got their adversarial review pass
(`REVIEW-PHASE10.md`, `REVIEW-PHASE11.md`) and their findings were fixed.
Phase 12 (this one) ran `npm run qa` clean end to end — see "Check it
yourself" below — and closed three previously-carried bugs. See "What is not
done" at the bottom for what is still genuinely open.

## Run the live site

```sh
npm install          # only needed once; the site itself needs no build step
npm start            # Express on :8099
```

Then open <http://localhost:8099>.

This is where **phase 8 (the dock)** and **phase 9 (the books)** are visible:

- the dock's door chips are gone; there is a **home button** beside Back,
  disabled in the front room and enabled everywhere else (keyboard: `H`)
- the shelves are full of **real books** rather than filler spines — open one
  and it carries a real year, page count, ISBN and publisher description
- the original 409 hand-curated books are now a **visible tier**, the
  shopkeeper's picks, distinct from the harvested ones

Without a `.env` holding `HARDCOVER_TOKEN` the server runs on baked data and
fixtures, which is the intended offline mode — nothing is broken. `npm run mock`
forces fixture mode even when a token is present.

## The isolation harness

The shop is the shop now, but the preview harness survives as the place to
look at **one room with layers switched off** — which is how every scene bug
since phase 3 was actually found. Phase 10 taught the Express server to serve
it, so there is no second server any more (a leftover `python3 -m http.server`
holding :8099 while `npm start` silently died cost this project two sessions;
that trap is now closed):

<http://localhost:8099/tools/preview-stage.html?room=front>

### Query parameters worth knowing

| param | does |
|---|---|
| `?room=<id>` | which room to build — default `glasshouse`. Try `front`, `cartographer`, `longtable` (the three table rooms), `orrery`, `oak` |
| `?pose=<name>` | jump straight to a camera pose: `room`, `shelf:back`, `shelf:left`, `shelf:right`, `table:fronttable` |
| `?reduced=1` | reduced motion — poses jump instead of tweening |
| `?orbit=1` | free orbit controls instead of the pose rig, for looking around |
| `?tables=0` `?poses=0` `?props=0` `?doors=0` `?books=0` `?signs=0` | switch a layer off to isolate what you are looking at |
| `?mirror=1` | show the normally-hidden a11y mirror |

In the shop itself: click a case or the table to fly to its pose, `Escape`
steps back, and the wheel dollies. The front table stands **five** covers
upright in the room pose and lays out all **58** when you walk up to it —
the five that stand up are the shopkeeper's own picks.

## See all the changes

```sh
git log --oneline               # every phase is one or two commits
git show <sha>                  # one phase's full diff
git diff c31bd75..HEAD --stat   # everything since phase 1, by file
```

The phases in this session's run:

| commit | phase |
|---|---|
| `a7ae125` | 7 — tables and camera poses: review, clearance fix, verification |
| `324a38f` | 8 — the dock: chips out, the way home in |
| `4172cb2`, `5b909ad` | 9 — harvest, enrich and shelve the real books |
| `3020e54`, `d7b0f4c` | 10 — the swap-over: the shop becomes the three.js stage (draft) |

Each phase also left a document, and they are the honest record — every one
carries a "left undone, with reasons" section:

- `PLAN-PHASE7.md` … `PLAN-PHASE10.md` — the plan written *before* the
  implementation it governs
- `HANDOFF-PHASE8.md`, `HANDOFF-PHASE9.md`, `HANDOFF-PHASE10.md` — what the
  next session needs to know, including the traps that already cost someone a
  session

`DESCRIPTIONS-FEASIBILITY.md` records the measured sources for the missing
book descriptions, so phase 11 does not re-probe any of them.

## Check it yourself

```sh
npm run qa               # the data and DOM checks
npm run harvest:report   # the harvest's coverage counts
```

`tools/qa.mjs` was rewritten in phase 10 against `IMPLEMENTATION.md` §7 — it
checks the canvas, the a11y mirror and the camera poses rather than the
retired CSS build's `.bk[data-book]` nodes. It ran clean at the end of phase
12 — 67 checks, zero failures, zero console/page errors, zero failed
requests, across a full 50-room sweep. A failure now is a real regression.

---

## What is not done

Being straight about the state, because a doc that overstates it costs the
next person a session. This is phase 12's closing account — see
`HANDOFF-FINAL.md` for the full detail behind every line here.

**Closed this phase, previously carried forward:**

- **Four keyboard shortcuts didn't guard modifiers** — ⌘P opened the parcel
  *and* the print dialog. `m`/`p`/`s`/`b` now check the same
  no-modifiers guard `h` already had. Fixed in `src/js/main.js`.
- **`Back` rewrote the address bar to the room you'd just left**, when a
  book panel was still open. `dom.back`'s click handler now closes the book
  first, the same way `goHome()` already did. Fixed in `src/js/main.js`.
- **The far end of a `used===2` side case can't be seen from any camera
  pose.** Re-measured fresh against the current three.js geometry (not
  re-quoted from the pre-swap CSS build): still true, same shape as phases
  7-10 found it — the case's own run is 342 units wide and its far ~40% sits
  behind the back case's right edge from every position the room's own
  floor allows a camera to stand. **Recorded as accepted**, not fixed — see
  `HANDOFF-FINAL.md` for the measurement, the screenshot, and why a real fix
  needs a change to the pose model (more than one named pose per case, or a
  moved case) rather than a search-tuning patch.
- **Vercel deployment.** `vercel.json` + `api/index.js` now exist —
  static CDN for `index.html`/`src/`/`vendor/`, one serverless function
  wrapping the same router `server/index.js` uses locally
  (`server/routes.js`). Proved with a local `vercel build` (no Vercel
  account in this sandbox — see `HANDOFF-FINAL.md` for exactly what that
  does and does not prove) and a direct simulated invocation of the built
  function.
- **`March: Book Three`'s description never mentioned the third book** —
  a truncation artifact in `cleanDescription()`, not a gate failure. Fixed;
  151 previously-generated blurbs across the whole catalogue improved by the
  same fix (107 re-cleaned from cached raw Wikipedia text, no network; 44
  more repaired by a live Open Library re-fetch). 11 remain ending in the
  old mid-word "…" fallback — genuinely hard cases with no reachable
  sentence boundary in budget, or where a live re-fetch came back with
  nothing better. See `HANDOFF-FINAL.md` for the count broken down by
  source.

**Still open:**

- **No real screen reader has ever been used on the a11y mirror.** Every
  phase since 4 has asserted names/roles/focus order programmatically; none
  has had an actual AT session. `IMPLEMENTATION.md` §4.7 says an axe pass is
  green on a page that is unusable — that risk is still live.
- **Vercel's own deploy step was never exercised end to end.** This
  sandbox has no Vercel account, so nothing here confirms that a real
  `vercel deploy` places `includeFiles`-matched data where the function
  expects it at request time — only that the config is valid, the glob
  matches the intended files, and a *simulated* copy of the built function
  answers correctly. Confirm with one real deploy before treating the
  Vercel path as load-bearing.
- Everything phase 11 already flagged about description coverage:
  `DESCRIPTIONS-FEASIBILITY.md`'s numbers on Open Library/Google
  Books/Wikipedia stand; 805 of 2,096 harvested books still have no blurb
  at all (not a truncation issue — nothing verifiable was ever found for
  them).
