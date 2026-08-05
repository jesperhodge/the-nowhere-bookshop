# Trying it out, and seeing what changed

Written mid-project, after phase 9. Read `HANDOFF-PHASE10.md` for where the
work stands and what is next.

## The one thing to know first

**There is one build now.** Phase 10 retired the CSS-3D scene and made the
three.js stage the actual shop, so `npm start` gives you real geometry, real
lights, doorway openings, tables and camera poses — everything phases 3–7
built beside the live site is now *in* it.

`src/js/scene.js`, `src/styles/scene.css` and `src/styles/themes.css` are
gone. The whole DOM UI stayed exactly as it was: dock, book panel, search,
plan, parcel, and the grain and vignette overlays that sit on top of the
canvas and carry a lot of the mood.

**Status:** phase 10 is committed as a reviewed-pending draft (`d7b0f4c`). It
has been smoke-verified — the front room and a second room both build with
zero console errors, the a11y mirror is intact with no `role="listitem"` on a
button, and the table reads correctly at both poses — but it has **not** had
the full adversarial review pass every earlier phase got. See "What is not
done" at the bottom.

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

Each phase also left a document, and they are the honest record — every one
carries a "left undone, with reasons" section:

- `PLAN-PHASE7.md`, `PLAN-PHASE8.md`, `PLAN-PHASE9.md` — the plan written
  *before* the implementation
- `HANDOFF-PHASE8.md`, `HANDOFF-PHASE9.md`, `HANDOFF-PHASE10.md` — what the
  next session needs to know, including the traps that already cost someone a
  session

`HANDOFF-PHASE10.md` is the one to read if you want to know where the project
stands right now.

## Check it yourself

```sh
npm run qa               # the data and DOM checks
npm run harvest:report   # the harvest's coverage counts
```

Note that `tools/qa.mjs` still asserts the **old** CSS build's DOM
(`.bk[data-book]`, `.travel` settling). Rewriting it is part of phase 10 —
`IMPLEMENTATION.md` §7 lists what it should check instead.

---

## What is not done

Being straight about the state, because a doc that overstates it costs the
next person a session.

**Phase 10 (the swap-over) is a reviewed-pending draft.** It was implemented
and visually checked, and it has been smoke-verified since — two rooms build
with zero console errors, the a11y mirror carries no `role="listitem"` on a
button, room teardown survives walking between rooms, and the table reads
correctly at both poses. But the **separate adversarial review pass** that
every earlier phase got was interrupted and never ran. In phases 7, 8 and 9
that pass is where essentially every real defect was found — phase 9 found
eleven, none of which were in its plan. So assume defects remain, and run
that pass before trusting this in production.

Specifically **not** verified since the swap: the full 50-room sweep, the
rewritten `tools/qa.mjs`, the no-WebGL fallback, deep links and browser
back/forward, the parcel surviving a reload, `fronttable`'s removal as a room
being consistent across the plan/breadcrumbs/shelf overlay, and performance
in the heaviest room.

**Phase 11 — book descriptions.** 1,105 of 2,096 harvested books still have
no blurb. `DESCRIPTIONS-FEASIBILITY.md` records every source measured against
books that are actually missing one, and the design for a single programmatic
backfill tool. Nothing has been built yet. The short version: Open Library is
exhausted, Google Books is the right primary source but needs an API key,
Wikipedia works only behind a strict verification gate, and Goodreads is
declined on robots.txt grounds.

**Phase 12 — final polish and Vercel.** Not started. There is no
`vercel.json`, and the `/api` routes would need to become serverless
functions. The static site itself deploys as-is.

**Carried forward, still unfixed:** the far end of a deep side case is not
reachable from any camera pose; no real screen reader has ever been used on
the a11y mirror; `Back` rewrites the URL hash to the room you just left when
a book panel is open (phase 8 documented it, deliberately out of scope); and
four keyboard shortcuts don't guard modifiers, so ⌘P opens the parcel *and*
the print dialog.
