# Handoff — phase 9 done, phase 10 next

Phase 9 (`IMPLEMENTATION.md` §6, `PLAN.md` point 7 — harvest and shelve the
real books) is **complete: planned, implemented, self-reviewed, adjusted,
verified and committed** as `4172cb2` + `5b909ad` on
`claude/nowhere-bookshop-phases-7-9-p4j8th`. Tree clean, scratch deleted. The
plan of record is `PLAN-PHASE9.md`, and its §11 is the outcome table.

**That was the last row of `IMPLEMENTATION.md` §3.** Phase 10 is not on that
table at all: it is `PLAN.md` point 10 and `PLAN-ARCH.md`'s substrate move —
**the swap-over**, and the phase that makes the app real.

---

## What phase 10 has to do, and why nothing else has

`index.html` and `src/js/main.js` still run the **old CSS-3D `scene.js`**. The
entire three.js stage from phases 3–7 is reachable only through
`tools/preview-stage.html`. Both builds work; they have never met. Phase 9 kept
both alive on purpose rather than choosing — choosing is point 10.

1. Retire `src/js/scene.js`, `src/styles/scene.css`, `src/styles/themes.css`
   (`IMPLEMENTATION.md` §9: *only* those three go — do not delete the DOM UI).
2. Wire `src/js/scene/` into the live site. `tools/preview-stage.html` is the
   working reference for the mounting order; read it before writing anything.
3. Land the no-WebGL fallback: on context-creation failure open the existing
   **"The shelf" overlay** and say why (`IMPLEMENTATION.md` §4.7). Search, plan
   and shelf are already a complete text UI for the whole shop.
4. Rewrite `tools/qa.mjs` per §7. It asserts `.bk[data-book]` and `.travel`
   transform settling and will not survive the move.
5. `fronttable` stops being a room (`PLAN.md` point 10). It is still a full
   room record, still in the route, the plan, the breadcrumbs and the shelf
   overlay. `tables.js` already models it correctly as a table with its own
   books — the *data* is ready; the routing is not.

### `npm start` does not serve `/tools`

`server/index.js` serves `/src`, `/vendor` and `index.html` only. The preview
harness therefore still needs a plain static server, and phase 9 used
`python3 -m http.server 8101`. **Kill it before you trust anything on 8099** —
see the environment note at the bottom, it has cost two sessions now.

---

## The shelves, counted

| | before phase 9 | now |
|---|---|---|
| books | 409 | **2,505** |
| filler spines, live CSS build | 2,000 | **0** |
| filler spines, three.js build | **5,923** (2,000 back + 3,923 side) | **0** |
| books with an ISBN | **0** | **2,145** |
| books with a blurb | 409 | **1,809** |
| harvested lists behind the accolades | 0 | **73**, each with a revision id |

* **12,315** unique title/author pairs harvested from 77 configured lists.
* **5,102** of 7,000 attempted cleared Open Library's match threshold (73%).
* **2,096** shelved. **3,032 enriched books are sitting unused in
  `data/cache/openlibrary.json`** — see "the side cases" below.
* Curated: 409 books, 351 matched, **230 ISBNs**, 21 rejected because Open
  Library's year was 25+ years off the shelf's (that guard is in
  `cmdCurated`; a wrong ISBN sends a reader to the wrong book at a real shop).

### Provenance — how to check any claim on any shelf

This is the thing phase 9 existed to make true, so know how to verify it:

* A generated book carries `acc: [{ l, k, s }]` — label, kind (`w`/`c`), and
  **the list slug**. `shop.js` derives `won`/`cited` from it; the data file
  holds it once, so the two cannot drift.
* `s` is a key in `src/js/data/generated/sources.js`, which holds the page
  title, the URL, and `permalink: …?oldid=<revid>`. That link resolves to the
  byte-identical wikitext that was parsed, for good.
* `tools/qa.mjs` asserts every `acc[].s` resolves. It printed *every harvested
  accolade traces to a fetched source* on the verification run.
* `data/lists/<slug>.json` also keeps a per-table **parse audit**: the headers
  it saw, the column roles it assigned, which winner mark it chose, and how
  many rows it took and dropped. That is how you check a list without
  re-reading 100 KB of wikitext.
* `data/lists/_gaps.json` is the list of things **not** done, and it is
  deliberately noisy. Four of its five entries are the winner-ratio warning
  firing on multi-category prizes where several winners a year is correct
  (Kirkus 3 categories, Nero 4, Ned Kelly 3, Somerset Maugham 2–4 recipients);
  those four were checked by hand and are fine. The fifth, `sunburst`, genuinely
  parses to nothing.

**The rule, if you touch the harvest: never reconstruct a list from memory.**
A plausible wrong shortlist is worse than a missing one, because once this
session is over the two are indistinguishable.

---

## The two things phase 10 will see first

### 1. The three.js side cases are empty

Every room's whole allocation fits its back case, so `planSideRows()` gets
nothing and the side cases stand as bare shelves. In the live CSS build this
is invisible (side cases there are a painted `spineRun()` gradient, not
spines). **In the three.js build it is the most visible thing in the room**,
and the day you swap over it becomes the shop's front page.

It is a *decision*, not a shortage — `PLAN.md` and `IMPLEMENTATION.md` §6 both
say ~2,400 books, and 2,505 is that. Filling the sides too would need ~5,700
and is one number away:

```
tools/harvest.mjs   const CASE_ROWS = 2;   →  the per-room budget
                    const FILL = 0.92;
```

3,032 already-enriched books are waiting in the cache, so it costs **no network
at all** — `npm run harvest:shelve`, then `npm run harvest:isbns` and shelve
again for the new books' ISBNs. What it does cost is page weight: the shipped
JS went 465 KB → 1.4 MB for 2,096 books, and filling the sides roughly doubles
that again. That trade is phase 10's to make, with the swap-over in view.

### 2. Nine rooms are honestly short

```
othersuns 13%   underworld 17%   fogline 40%   understory 22%   saltline 45%
snowroom 31%    smallkingdom 26% foreignwindow 14%   saltcellar 24%
```

(percentage of the back case's two rows, curated + generated.) Every one is a
narrow subject room no prize list covers: translated SF, translated poetry,
translated crime, food writing, travel writing, pre-1965 detection. This
survived widening the list→room map, gating the parent rooms so they stop
absorbing specialists, and adding two translation prizes. **There is no
Wikipedia table to harvest for most of them** — checked and rejected: André
Simon, Fortnum & Mason, James Beard, Edward Stanford, Boardman Tasker, Banff,
Petrona, Ignatz, Angoulême, Harvey (all prose, no tables). Raising the budget
per "side cases" above will not fix these nine; only new sources would.

---

## Phase 7's carried-forward item, closed

**The table no longer occludes the bottom shelf row.** `poses.js`'s
`shelfPoseFor()` gained a `LIFTS` ladder, tried at each yaw before the yaw
widens, plus a third clearance test in `isClear()`: the two lower corners of
the case's bottom row, checked **against tables only**. Measured in the preview
harness, ray-vs-Box3 per book:

| room | camera | bottom-row books blocked |
|---|---|---|
| `front` | x 0, **y 610**, z −59 (square-on, looking down) | **0** |
| `cartographer` | x 383, y 610, z −140 | **0** |
| `longtable` | x 383, y 610, z −140 | **0** |
| `oak`, `saltline` (no table) | x 0, y 265, z −59 — **unchanged** | **0** |

Two things worth knowing before you touch it:

* **Loop order is load-bearing.** With lift as the *outer* loop the search
  found a legal, unblocked camera at 60° of yaw, x +666, almost against the
  right wall — a much worse picture than standing square-on and looking down.
  Lift is the inner loop and lift 0 is first at every yaw, so every pose that
  already worked is bit-identical.
* **The table still stands in front of the bottom row from the `room` pose**,
  and that is correct — it is a table in a room. Walking to the shelf is what
  clears it.

### Not fixed, and it is not a table problem

**2 of 27 bottom-row books sit outside the frustum in a room with no table at
all.** The shelf pose's distance is derived from the case's *height*
(`(ch/2+30)/tan(fov/2)` ≈ 947); the case is 1,180 wide and at that distance the
frame is ±460. Framing the full width needs 1,215 units of standoff, which puts
the camera at z +255 — outside the room. **No in-room camera can frame a whole
back case.** Structural, pre-existing, and phase 9 only measured it. If point 8
("reading the spines") ever wants it, the answer is a pan along the case, not a
distance.

---

## Traps phase 9 paid for

Every one of these cost real time. The first four are about the harvest and are
the ones that produce a *false fact* rather than a missing one.

* **`allWinners` turned 240 CWA shortlistings into 240 Gold Dagger wins.** Five
  different winner-marking conventions are in use across these pages (`*` after
  the author, `{{double dagger}}`, `{{blue ribbon}}`, `'''bold'''`, a
  highlighted row or cell) and no page says which it uses. `pickSignal()` now
  chooses per table by *whether the mark discriminates* — a mark on every row of
  a winners-only list says nothing. `fetch` also warns whenever a list's winners
  run over **2.5 a year**, which is what "every shortlisting recorded as a win"
  looks like from a distance. Keep that check.
* **Row-level `|-style="background:…"` is a winner mark**, and a table parser
  that only keeps *cell* attributes throws it away. Desmond Elliott marks
  winners that way and nothing else; without it, all 45 rows read as wins.
  `wikitable.js` attaches the `|-` attributes to each cell **created in that
  row**, which is what keeps them with the right row when a neighbour is
  rowspan'd in from above.
* **`{{sortname|last=Faulkner|first=William}}` and `{{sortname|2=…|1=The}}`.**
  Named and numbered parameters, in the same template, on the same page. A
  positional-only reader gives you "Algren Nelson" and "Man with the Golden Arm
  The". Every author on the National Book Award pages is written this way.
* **`search.json`'s matched edition is not language-filtered.** It put a Spanish
  ISBN on *Anathem*, a Serbian one on *Austerlitz* and a German one on
  *Consider the Lobster* — all real ISBNs, all sending an English reader to a
  book they cannot read. `editionDetail()` now reads the work's whole editions
  list and prefers English, and **returns no ISBN at all** when the best edition
  anyone has recorded is explicitly another language.
* **Thirteen digits is not an ISBN-13.** `0345254864195` is an ISBN-10 with
  three characters stuck on the end; it is on a real Open Library record and it
  passed `/^\d{13}$/`. The check digit is the test. One got through out of
  2,146. `validIsbn13()` is now the gate in the client, at shelve time *and* in
  `qa.mjs`.
* **A pace setting is not a throughput setting.** `setPace(8)` applied by
  serialising requests delivered **0.9 books/s**, because throughput is
  `1/(latency + interval)` and Open Library's search takes ~0.9 s. It needs a
  slot clock *plus* a separate concurrency cap. With both, 3.3 books/s — a
  6,000-book run went from 105 minutes to 30.
* **`loadHarvest()` read each list's `rooms` from the stored JSON, not from
  `tools/lists.js`.** So retuning the room map silently did nothing: the tool
  reported a full successful run and the new mapping never happened. Cost a
  whole shelve cycle and looked exactly like "the gates are too strict". It now
  reads the live config; the stored copy is provenance, not configuration.
* **Splitting rows by count overflows the case.** Safe while every row was
  padded to a fixed 20 fillers; not safe with real books, where a 640-page book
  is a 58px spine and a 170-page one is 15px. An even count split can hand one
  row 1,575px to fit in 1,152. Both builds now split by width and drop what will
  not fit rather than letting it spill (`scene.js` `planRows()`,
  `books.js` `planBackRows()`), and both say so on the console if it happens.
* **`tools/hardcover.mjs <anything>` runs `enrich`** — `cmd = argv.find(a =>
  !a.startsWith('-')) || 'enrich'`, so even `--help` starts a run that rewrites
  `src/js/data/enrich.js`. It *merges* rather than replaces, so it cannot
  clobber the 330 real entries now in there, but it is a live foot-gun that did
  not matter while the file was empty.

## Smaller things, recorded so they are choices and not oversights

* **`server/cache.js` had a stray NUL byte** at `9c88423` — git treated it as a
  binary file and would not diff it. Rewritten this phase; it is plain UTF-8
  now and `norm()` behaves identically (verified on accented input).
* **`.fill` CSS is gone**, not left dangling: phase 8's own rule, *no rule
  matches nothing, which is the thing that actually rots*. `qa.mjs` asserts
  `.bk.fill` is zero in all 50 rooms.
* **`note` optional — the three sites, checked individually.**
  `views/book.js:108` was real (unguarded `rich(book.note)`). `tools/qa.mjs:94`
  was real. **`shop.js` needed nothing** — it does not contain the string
  `note` and its search index already read `(b.blurb || '')`. §6 is wrong about
  `shop.js` and phase 8 was right to say so; this is the second session to
  check, so please stop checking.
* **`tools/qa.mjs` runs as committed now.** `chromium.launch()` takes
  `executablePath: process.env.PW_CHROMIUM || undefined`:
  `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run qa`.
  No more sed'd copies.
* **`data/cache/wiki/` (4.1 MB of raw wikitext) is gitignored**; the parsed
  lists are the snapshot. Provenance does not depend on the local copy — every
  list carries a permalink to the exact revision. `npm run harvest -- --force`
  rebuilds it in under a minute.
* **`won`/`cited` are derived, `acc` is stored.** Do not write `won:` onto a
  generated book; `shop.js` will ignore it the moment `acc` is present.
* **Room placement below the parent is an approximation.** The accolade is
  provenanced to a revision id. Which *sub-genre* room a book lands in comes
  from Open Library subjects + publication year (`tools/rooms-rules.js`). A
  Dagger winner in Noir rather than Rural Noir is a mis-shelving, not a false
  claim, and that distinction is the whole design.

## Performance — measured before and after, same box, same harness

**Live CSS build** (`tools/qa.mjs`'s settle condition, 50 rooms):

| | before | after |
|---|---|---|
| spines shop-wide | 2,409 (409 real + 2,000 filler) | **2,505, all real** |
| median room transition | 1,102 ms | **1,131 ms** |
| worst | 1,349 ms | **1,347 ms** |
| heaviest room | `front`, 320 nodes | `rafters`, **645 nodes** |
| JS transferred | 465 KB | **1,400 KB** |

**Node count doubled and transition time did not move.** `PLAN.md` point 7
pre-authorised dropping `bk__back`/`bk__edge` to hold it; **not applied**,
because `PLAN-ARCH.md` says profile first and profiling did not ask. It stays
available if phase 10's swap changes the picture.

**three.js stage** (preview harness; frame times are software-rasteriser bound
in headless Chromium and say nothing — draw calls are the real number):

| room | before | after |
|---|---|---|
| `rafters` | 186 meshes, **953** draw calls, 7 real books | 132 meshes, **629** calls, **98** real books |
| `longroom` | 153 meshes, 685 calls, 10 real books | 114 meshes, **451** calls, **66** real books |
| `front` | 145 meshes, 619 calls, 11 real books | 161 meshes, 715 calls, **50** real books |

The stage got **lighter** while gaining an order of magnitude more real books,
because 3,923 side-case filler meshes went. `front` is the exception — it has
no side cases, so it only gained.

## Verified this session

`npm start` on :8099 (checked it was Express answering, not a leftover static
server). Playwright with `PW_CHROMIUM`. Settle on a real condition, never a
fixed timeout.

* `tools/qa.mjs`, full sweep: **2,505 books, 409 picks, 50 rooms, zero filler
  spines across all 50, no console or page errors, 50/50 book panels open.**
* Every harvested accolade resolves to a fetched source. **0** generated books
  carry an opening line; 44 curated ones still hold theirs back correctly.
* Every ISBN on the shelves passes its own check digit (2,145).
* All 26 `ART` entries still draw inside their viewBox.
* Buy/borrow/preview links deep-link by ISBN where there is one and fall back
  to a search where there is not; no Amazon.
* **The no-Node path still works**: served from `python3 -m http.server`, no
  `/api` at all — 2,505 books, 0 filler, the panel opens, the buy link carries
  the real ISBN.
* `/api/book?title=Piranesi&author=Susanna+Clarke` →
  `{"isbn13":"9781526622419",…,"source":"live","via":"openlibrary"}`.
  `/api/list/booker` serves the harvested list with its permalink and revid.
  `/api/list/nosuchlist` → a clean miss.
* Preview harness screenshots judged by eye in `front`, `longroom`, `orrery`:
  both rows near-full of legible spines, gilt pick bands visible on the top
  row, no filler, the front table carrying its 58 books.

## Carried forward — still open, still nobody's phase

* **`a11y.js:85` puts `role="listitem"` on its `<button>`s**, overriding the
  implicit `button` role: a screen reader announces list items, not buttons.
  Real defect, three.js build, untouched since phase 4. The fix is a wrapper
  element carrying `listitem`, not the button. **Phase 10 is the right phase
  for this** — it is the phase that makes the mirror live.
* **No real screen reader has ever been run on this project.** Phases 4–9 all
  asserted names and roles programmatically. `IMPLEMENTATION.md` §4.7 says an
  axe pass is green on a page that is unusable, and that is still the situation.
* **The far end of a `used === 2` side case cannot be seen from any usable
  pose.** Phase 7's finding, unchanged — and it now matters more, because side
  cases are where phase 10's extra books would go.
* **Back's `closeBook()` hash bug.** Open a book, Tab to Back, Enter, Escape:
  the address bar points at the room you are not in. `goHome()` handles it;
  Back does not. Documented by phase 8, deliberately left, still there.
* `h`/`H` checks modifier keys; `m`, `p`, `s`, `b` do not. Normalise all five
  at once or none.
* `fronttable` is still a room — point 10, above.

## Environment — this sandbox

* Node v22.22.2, `node_modules/` present. **`NODE_USE_ENV_PROXY=1` for anything
  that fetches** (every `npm run harvest:*` script sets it).
* Network measured this session: `en.wikipedia.org` **200**, `openlibrary.org`
  **200** (~0.9 s a search, tolerates ~8 req/s), `api.hardcover.app` **401** —
  no token, and there never was one. Google Books still 429s on this IP.
* **Playwright 1.62 wants Chromium 1234; `/opt/pw-browsers` has 1194.** Never
  run `playwright install`. Use `PW_CHROMIUM=…/chromium-1194/chrome-linux/chrome`.
* **Check what is answering on 8099 before you trust a run.** Phase 8 lost a
  62-assertion pass to a leftover `python3 -m http.server`. One command:
  `curl -sI --noproxy '*' http://127.0.0.1:8099/ | grep -i server` — a
  `SimpleHTTP/0.6` reply is the wrong answer, and *no* `Server:` header is the
  right one. Phase 9 needed a static server on **8101** for the preview
  harness; kill it when done.
* **`nohup npm start &` does not always survive** the shell that launched it.
  `nohup node server/index.js > log 2>&1 & disown` did. Read the log for the
  banner, then curl the port; the banner alone is not proof it is still up.
* `git push` returns **403 — read-only.** The local commit is the record. No PR.
* **Never sort `.gitignore`** — last-match-wins, and sorting hides
  `.env.example`. Phase 9 appended a block at the end for exactly this reason.

## Workflow deviation, recorded honestly

`CLAUDE.md` splits Opus (plans, reviews, handoffs) from Sonnet sub-agents
(diffs). **No Agent/Task tool was available in this harness**, so the same agent
that planned it implemented it — the third session in a row to record this
deviation (phases 7 and 8 both did).

The discipline held: `PLAN-PHASE9.md` was written before any edit, and the
review was a separate deliberate pass over the whole diff at the end. It earned
its keep again — **eleven** of the things above were found in that pass and none
of them was in the plan: the count-split row overflow, the `poses.js` lift/yaw
loop order, the side-case rows ignoring case width, books vanishing silently in
a room with no side case, the missing search bonus for picks, the orphaned
`.fill` CSS, two stale comments still describing filler, a stale route comment,
the mangled em dash in `package.json`, the partial-run gap-record bug, and the
`isbnFrom` re-resolution that caught the wrong-language ISBNs. A session with
the Agent tool should go back to the split.
