# Handoff — phase 2 done, phase 3 next

Read `IMPLEMENTATION.md` first (the brief, in phase order), then `PLAN.md`
(the diagnosis, including Finding C which this phase closed) and
`PLAN-ARCH.md` (the three.js decision — required reading before phase 3,
since that's the stage skeleton). `HANDOVER.md` (iteration 1) and
`HANDOFF-PHASE2.md` (phase 1) are still accurate about the data, the tools,
and the server.

This session did **only phase 2** — the five `props.js` viewBox fixes from
Finding C — by design, so phase 3 (the three.js checkpoint) isn't attempted
half-supervised in the same sitting. Phases 3–9 are untouched and exactly as
`IMPLEMENTATION.md` describes them.

## What changed

`src/js/data/props.js` — five one-number geometry nudges, per the Finding C
table in `PLAN.md`. All five were verified by rendering the actual shape
(bezier/ellipse math for `plant`; direct arithmetic for the rest) rather than
eyeballed, and each now lands within ~0.5px of its declared viewBox instead
of touching or crossing it:

| art | change | why |
|---|---|---|
| `plant` | leaf amplitude constant `96 → 62` (both the path endpoint and the ellipse-center term) | at 96 the outermost leaf's rotated ellipse reached to `x ≈ −33 … 173` against a `0…140` box; 62 is the largest value that keeps every leaf's full rotated extent inside |
| `gramophone` | viewBox `0 0 160 180 → 0 0 180 180` | the horn bell's fill path reaches `x ≈ 179.3`; widening (rather than shrinking the horn) was the explicit call in `PLAN.md` |
| `starchart` | border rect `x=0 y=0 w=160 h=200` → `x=2.5 y=2.5 w=155 h=195` | the 5px stroke was centred on a rect sized to the box, so its outer edge sat 2.5px outside on all four sides; inset by half the stroke width instead |
| `herbs` | leftmost bunch's x position `18 → 20` | its mirrored leaf paths reached to `x = −2`; verified by sampling the actual chained-quadratic path, which gave exactly −2, matching the audit |
| `candle` | glow circle `cy=18 → cy=26` (radius unchanged) | at `cy=18, r=26` the top edge sat at `y = −8`; moving the circle down (not shrinking it) keeps the glow's size, which is what reads as warmth |

Confirmed visually: the Glasshouse's two plants (the room `PLAN.md` calls out
as "the visible one") now show every leaf on both plants, no hard vertical
cut. The Broken Mirror's gramophone renders complete and proportional at the
new aspect ratio.

`tools/qa.mjs` — two changes:

1. **New check**: every `ART` entry is rendered into a canvas padded 50%
   past its declared viewBox (using an enlarged viewBox so nothing clips at
   render time), then checked for any painted pixel outside where the real
   viewBox would sit. This is a direct test of what the browser actually
   clips, not a re-derivation of each shape's math. Ran it against the
   pre-fix `props.js` (via `git stash`) to confirm it isn't a tautology — it
   reproduced the audit's numbers almost exactly (`plant +33.5`,
   `gramophone +19.3`, `candle +8`, `starchart +2.5`, `herbs +2` vs. the
   `PLAN.md` table's `33.4 / 19.3 / 2.5 / 2.0 / 8.0`). Now reports
   `all 26 ART entries draw inside their viewBox`. This satisfies one of the
   bullets in `IMPLEMENTATION.md` §7's future QA list early, since it didn't
   need the three.js rewrite to be worth having.
2. **Removed the hardcoded Chromium path** (`EXE =
   '/opt/pw-browsers/chromium-1194/...'`). That path is specific to the
   sandbox `IMPLEMENTATION.md` §1 describes; it does not exist in this
   environment. `chromium.launch()` now resolves Playwright's own managed
   browser. See "environment" below — if a future session runs in yet
   another sandbox with its own fixed browser path, this line is where to
   put it back, ideally behind an env var rather than hardcoded again.

Nothing else touched. `server/`, `src/js/data/live.js`, the data files, and
the DOM/CSS scene are all exactly as phase 1 left them.

## Environment — this session was not the sandbox `IMPLEMENTATION.md` §1 describes

Worth flagging explicitly since §1 is written for a specific sandboxed box
(fixed working dir `/home/user/the-nowhere-bookshop`, a proxy that breaks
Node's `fetch`, `git push` returning 403, Chromium at a fixed path, "never
run `playwright install`"). This session ran locally on the owner's own
machine instead:

- Working dir is wherever this checkout lives; there's a real `origin`
  remote and the branch is `main`, not a `claude/...` branch. `git push`
  was not attempted — nothing in phase 2 needed it and pushing wasn't asked
  for.
- Playwright's cached Chromium build (`chromium-1228`) didn't match what
  `playwright@1.62.1` (the version pinned in `package.json`) expects
  (`chromium-1234`), so `npx playwright install chromium` was run to fetch
  the matching build. That is a normal devDependency setup step here, not
  the trap §1 warns about — there is no proxy in this environment and no
  reason to avoid it. Don't assume the inverse warning applies if a future
  session turns out to be back in a locked-down sandbox; check first.
- Node's built-in `fetch` was not tested against Hardcover this session
  (QA ran in `--mock` mode deliberately, to avoid spending API calls on a
  viewBox fix). If phase 9's harvest work picks up in a different
  environment than this one, re-verify §8.2's proxy workaround applies
  before trusting it either way — it's environment-specific, not a
  property of the codebase.

## Verified this session

```sh
HARDCOVER_MOCK=1 node server/index.js   # fixture mode, no token spent
node tools/qa.mjs
```

Full sweep, clean:

```
all 26 ART entries draw inside their viewBox
books: 409 rooms: 50
room transition: median 998ms, worst 1126ms
heaviest room: front, 320 nodes
book panels opened OK: 50
ok   preview deep-links by ISBN
ok   preview still works without one
ok   borrow deep-links by ISBN
ok   buy link is bookshop.org
ok   every book offers somewhere to read a sample
keyboard focus+enter opens a book: true
search "booker" results: 40
parcel items after keeping one: 1

no console or page errors
```

No duplicate ids, no missing fields, no empty/dead rooms, no sign/door
mismatches, no slow room transitions — none of those printed, which is the
pass condition for each.

## Things phase 3 should know

- Finding C is closed. `PLAN.md` line 5–6 already says Finding C "survives
  the change unaltered" when the three.js rewrite happens — the viewBox
  fixes are geometry inside each `ART` entry's SVG, which phase 6 (props as
  textured planes) will rasterize as-is. Nothing about this phase needs to
  be redone or re-derived once the stage exists.
- The new `tools/qa.mjs` ART-containment check is DOM/CSS-era QA, run
  against the current build. `IMPLEMENTATION.md` §7 says `tools/qa.mjs`
  "will not survive the move" to canvas — when phase 3+ rewrites QA, keep
  the same technique (render into a padded canvas, check for pixels outside
  the real box) since it works equally well as a texture-atlas sanity check
  after phase 6 ports these into `canvas2d` atlases, not just as DOM
  background-images.
- Phase 3 is the checkpoint `IMPLEMENTATION.md` calls out: renderer, camera,
  one room shell, real lights. If it looks like grey plastic, stop and say
  so before phases 4–7 build on top of it — phases 1, 2, 8, 9 all stand on
  their own if the substrate move is abandoned partway.
- Re-read `PLAN-ARCH.md` before writing any geometry, specifically the
  coordinate-flip note (`threeY = 470 - cssY`) and the `dy` sign flip on
  ~15 prop entries in `rooms.js` — both called out in `IMPLEMENTATION.md`
  §4.1 as the traps most likely to bite silently.

## Running it yourself

```sh
cp .env.example .env && $EDITOR .env    # paste HARDCOVER_TOKEN in, or skip for mock mode
npm install
npx playwright install chromium         # only if QA's browser launch fails
npm start                                # http://localhost:8099, live mode
# or: npm run mock                       # fixture mode, no token needed
node tools/qa.mjs                        # full sweep, ~1-2 minutes
```
