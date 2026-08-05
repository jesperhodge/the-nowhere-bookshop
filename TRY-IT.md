# Trying it out, and seeing what changed

Written mid-project, after phase 9. Read `HANDOFF-PHASE10.md` for where the
work stands and what is next.

## The one thing to know first

**There are two builds in this repo and they have never met.**

| build | what it is | how you reach it |
|---|---|---|
| the **live site** | the original CSS-3D shop, plus phase 8's dock and phase 9's real books | `npm start` → http://localhost:8099 |
| the **three.js stage** | phases 3–7: real geometry, lights, doorway openings, tables, camera poses | a static server → `/tools/preview-stage.html` |

The swap-over — retiring the CSS scene and wiring the three.js stage into the
live site — is **phase 10, and it has not happened yet.** So the shop you can
walk around is still the CSS one; the new renderer is only in the harness.
That is deliberate: phases 3–7 were built beside the live site on purpose, so
neither was ever broken.

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

## Run the three.js stage

`npm start` does **not** serve `/tools`, so the harness needs a plain static
server. From the repo root:

```sh
python3 -m http.server 8101
```

Then open <http://localhost:8101/tools/preview-stage.html?room=front>.

**Kill that static server before you next trust anything on :8099.** A leftover
one holding the port while `npm start` silently died has cost two sessions
already.

### Query parameters worth knowing

| param | does |
|---|---|
| `?room=<id>` | which room to build — default `glasshouse`. Try `front`, `cartographer`, `longtable` (the three table rooms), `orrery`, `oak` |
| `?pose=<name>` | jump straight to a camera pose: `room`, `shelf:back`, `shelf:left`, `shelf:right`, `table:fronttable` |
| `?reduced=1` | reduced motion — poses jump instead of tweening |
| `?orbit=1` | free orbit controls instead of the pose rig, for looking around |
| `?tables=0` `?poses=0` `?props=0` `?doors=0` `?books=0` `?signs=0` | switch a layer off to isolate what you are looking at |
| `?mirror=1` | show the normally-hidden a11y mirror |

The things phase 7 finished are best seen at
`?room=front&pose=table:fronttable` (fifteen covers face-up, legible — the
payoff for point 10) and `?room=front&pose=shelf:back` (spine titles readable).
Click a case or a table to fly to its pose; `Escape` steps back; the wheel
dollies.

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
