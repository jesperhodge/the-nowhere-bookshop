# Phase 9 — harvest and shelve the real books (`PLAN.md` point 7, `IMPLEMENTATION.md` §6)

The last row of `IMPLEMENTATION.md` §3. Replace the filler spines with real
books: **harvest → enrich → shelve**.

Written before any edit. Numbers in §0 were measured on this box this session,
not inherited — three of them contradict the older docs and one of them changes
the shape of the whole phase.

---

## 0. Measured first, because the docs are wrong in three places

Run: `node tools/_scratch-measure.mjs` (scratch, deleted before the commit —
it re-implements `fillRow()`/`packFiller()`/`planSideRows()` against the real
data).

| fact | doc says | measured |
|---|---|---|
| filler in the **live CSS build** | 2,000 (40/room) | **2,000 (40/room)** ✓ |
| filler in the **three.js build**, back cases | — | **2,000** |
| filler in the **three.js build**, side cases | "painted, not built" | **3,923 real meshes** |
| average **real** spine width | 22.1px | **31.7px** |
| books a row holds edge to edge | 43 | **30** |

Three consequences, and they are the plan:

1. **`§4.6`'s 22.1px is the *filler* average, not the real-book average.**
   `fillerStyle()` makes 9–31px spines; `shelfSize()` makes 15–58px from the
   page count. A 1152px row holds **30 real books**, not 43. Every capacity
   number downstream of 43 is 40% too optimistic.
2. **"2,000 new books ⇒ zero filler" does not follow.** `fillRow()` pads to
   *20 per row* and stops; adding real books next to a cap that never falls to
   zero just makes a fuller row with the same 20 fillers in it. Worse: the live
   build picks its row count as `min(3, max(2, ceil(n/9)))`, so a room going
   from 8 real books to ~48 grows a **third row** and gets *sparser*
   (51% occupancy) rather than fuller. **Zero filler is a code change, not a
   data threshold.** See §4.
3. **The three.js build has 5,923 filler spines, not 2,000.** Phase 4/5 built
   the side cases as real geometry (PLAN.md point 5) and filled them with
   `fillerItem()`. `PLAN.md`'s count predates that and was taken on the CSS
   build, where side cases are a painted `spineRun()` gradient. §7's "zero
   filler spines" has to mean both builds or it means nothing the day phase 10
   swaps them over.

Also measured, and it settles `PLAN.md` point 7's blocker question:

| probe (`NODE_USE_ENV_PROXY=1 node`) | result |
|---|---|
| `en.wikipedia.org/w/api.php` | **200**, 664 ms, full wikitext + `revid` |
| `openlibrary.org/search.json` | **200**, 953 ms |
| `api.hardcover.app` | **401** — no token on this box (phase 8's finding, unchanged) |

So `PLAN.md` option **(b)** is live: the fetch happens here. Option (a) — the
owner running it — stays the path for Hardcover specifically, and §3 keeps it
open without half-doing it.

---

## 1. The hard constraint: provenance

`IMPLEMENTATION.md` §6 step 1 — a book's `won`/`cited` comes from **the list it
was drawn from, not from model memory**. That is the whole point of the phase;
it retires the accolade-accuracy risk that has been top of the backlog since
iteration 1.

Operationally, three rules, and none of them bends:

* **Every harvested title/author/accolade traces to a document this session
  actually fetched.** Nothing is typed from recall. Not one shortlist.
* **The fetched source is recorded in the committed data**, by exact revision:
  each list carries `url`, `page` and `revid`, and the permanent link
  `…?oldid=<revid>` resolves to the byte-identical page that was parsed. Each
  generated book carries the list slugs its accolades came from.
* **A list that cannot be fetched or cannot be parsed confidently is skipped
  and counted**, never filled in. `tools/harvest.mjs report` prints the gaps
  and the handoff repeats them. A plausible wrong shortlist is worse than a
  missing one because after this session nobody can tell them apart.

Corollary, from §9 and unchanged: **no `first` line on a generated book**, ever
— no `firstSource`, no quotation. And no invented ISBN, page count, year or
description: absent beats invented, everywhere.

## 2. Sources

Wikipedia's per-prize winner/nominee tables, via
`action=parse&prop=wikitext|revid&redirects=1`. Structured, enumerable,
revision-addressable, and — checked on 12 pages this session — mostly three
recurring table shapes:

| shape | columns | winner marked by | pages |
|---|---|---|---|
| **SFF list** | Year ǀ Author ǀ Novel ǀ Publisher ǀ Ref | `*` after the author | Hugo, Nebula, World Fantasy, Clarke, BSFA, PKD, Locus, Aurealis, Otherwise, Mythopoeic |
| **result column** | Year ǀ Author ǀ Title ǀ **Result** | cell text (`Winner`/`Finalist`/`Shortlist`) | NBA ×4, Costa, Miles Franklin, Giller, Dublin, Edgar, Anthony, Baillie Gifford, Cundill, Walter Scott, Warwick, Kirkus, Nero, Wolfson, Royal Society, PEN/Faulkner, Goldsmiths, T. S. Eliot, Griffin |
| **award column** | Year ǀ **Award** ǀ Author ǀ Title | cell text | Booker, International Booker |
| winners-only | Year ǀ Author ǀ Title | every row is a winner | Pulitzer ×5, Duff Cooper, GG, Forward, Wainwright, Gold Dagger |

`rowspan` carries the year (and often the award) down a block of rows in all
four — a generic wikitable parser with rowspan tracking is the one piece of
machinery this needs, and it is the same piece for every list. Column roles are
**auto-detected from the header text**, with a per-list override where a page
is odd; a table whose header does not yield both a title and an author role is
skipped and counted, not guessed at.

Configuration lives in `tools/lists.js`: `{ slug, page, prize, rooms[], … }`.
Roughly 45 lists. `rooms[]` is the shelving hint, §5.

**Not used:** anything requiring a key (Google Books 429s on this shared IP),
and Hardcover (401, no token). Both stay wired for the owner's machine.

## 3. Enrichment, and the architectural call on a second upstream

`PLAN-ARCH.md` says `server/hardcover.js` is "the API client — **ONE
implementation**". Read in context (the sentence it was written to fix is
"there are currently two divergent code paths to the same API", §5), that rule
is about **one client per upstream**, not one upstream. Adding a second
*provider* does not violate it; adding a second place that decides *which
provider answers* would.

So:

```
server/hardcover.js    the Hardcover client — unchanged, still the only one
server/openlibrary.js  the Open Library client — new sibling, same shape
server/lookup.js       the chain. The ONLY place the order is decided.
```

`server/index.js`, `server/mcp.js` and `tools/*` all call `lookup.js`. Neither
provider module knows the other exists.

**The chain**, and it is reported honestly:

| condition | tried | `source` | `via` |
|---|---|---|---|
| `HARDCOVER_TOKEN` set, hit | Hardcover live | `live` | `hardcover` |
| no token (or Hardcover missed), hit | Open Library live | `live` | `openlibrary` |
| both missed, fixture has it | `server/fixtures/catalogue.json` | `fixture` | `fixture` |
| nothing | — | `miss` | — |
| `HARDCOVER_MOCK=1` | fixture only, **no network at all** | `fixture` | `fixture` |

`source` keeps exactly the three documented values (`live` · `fixture` ·
`miss`) so §5's contract and `data/live.js`'s `source !== 'miss'` test are
untouched; `via` is additive and names the upstream. **Hardcover stays first
whenever a token exists** — §6 step 2 and §8's verified queries are the owner's
path and this phase does not demote them. It never 500s: every provider
resolves to a miss on error, as `hardcover.js` already does.

`server/cache.js` grows a namespace (`data/cache/<name>.json`) and a deferred
write mode, because its current write-the-whole-file-on-every-set is right for
a rate-limited server route and quadratic for a 3,000-book batch.

**What Open Library gives**, measured: `search.json` → work key, title,
author(s), `first_publish_year`, `number_of_pages_median`, ISBNs;
`works/<key>.json` → description and subjects. Two calls per book, cached to
`data/cache/openlibrary.json` — the cache *is* the snapshot and is committed.

Guards, because this is where fabrication would creep in:

* A candidate is only accepted above a **match score** (exact/normalised title
  + author surname, the same shape as `scoreMatch()`). Below it: no facts, and
  the book is counted as an enrichment miss.
* **ISBN is only taken when it can be attributed to a specific edition** of the
  matched work. `search.json`'s `isbn[]` is every edition of every printing,
  unattributed — the same trap §8.4 documents for Hardcover — so it is *not*
  used. A book with no attributable ISBN gets none, and its links fall back to
  a title+author search exactly as all 409 do today.
* `year` is **`first_publish_year` from Open Library**, never the award year.
  A prize is awarded the year after publication about half the time; using the
  award year would be a fabricated fact in a field readers read as one.
* Description is Open Library's, trimmed to the first paragraph and capped;
  markup and "Contains:"/source footers stripped. No description is better
  than a wrong one.

**Politeness and resumability:** one in-flight request at a time by default,
adaptive throttle starting at ~4 req/s with 429 backoff honouring
`Retry-After`, a real `User-Agent` with a contact address, and the disk cache
checked before every call — so a crash at book 1,400 restarts at 1,400. The
long run goes in the background and is waited on, not polled.

**The 409 get enriched too.** `ENRICH` is empty and **0 of 409 books have an
ISBN** — every buy link in the shop today is a search box. The same pass fills
`src/js/data/enrich.js` with `{ isbn, pages, year, olWork }` per id. Curated
values still win: `shop.js` spreads `ENRICH[b.id]` *under* the book.

## 4. Shelving, and the filler

### 4.1 Filler goes, in both builds

§7 says **zero filler spines**. §0 says that cannot be reached by adding data.
So the filler generators go:

* `scene.js` — `buildFiller()` and `fillRow()`'s padding loop (live CSS build).
* `scene/books.js` — `fillerItem()`, `packFiller()`, and `planSideRows()`'s
  filler pack (three.js build, incl. the 3,923 side-case spines).
* `covers.js` — `fillerStyle()` **stays**: `buildTablePortal()` uses it for the
  table's book *stacks*, which are décor on a table, not spines on a shelf, and
  `spineRun()` stays with it (still called by the live side cases).

Nothing about the shop gets smaller — §9's rule. Every room, case, row and
shelf board survives untouched. What changes is that a slot holds a real book
or it holds nothing.

### 4.2 Row count becomes width-driven (live build only)

`rows = min(3, max(2, ceil(n/9)))` was tuned for n≈8 and gives the *worst*
occupancy at n≈48. Replace with the width the books actually need:
`rows = clamp(2, 3, ceil(neededWidth / (innerW × 0.92)))`. At 48 books → 2
rows at ~76%; at 80 → 3 rows. The three.js back case stays at **2 rows** —
`poses.js` frames a 2-row case and phase 7's `shelf:<caseId>` geometry is
derived from it; changing it is a phase-10 argument, not this one.

### 4.3 Allocation

Back case first, to ~90% of a row before spilling; side cases take the
overflow. Whatever is not filled stays empty shelf — **the shortfall gets
counted and reported, not papered over** (§9, and the orchestrator's steer:
keep the slots, fill what you honestly have, say the real number).

Room choice, in priority order and all of it from fetched data:

1. **The list's `rooms[]`** — the primary constraint. A Gold Dagger book can
   only land somewhere under The Lamp Room.
2. **Open Library `subjects[]`** — a fetched signal, used to pick between the
   sibling rooms a list allows (e.g. `poetry` → The Attic's three children).
3. **Publication year band**, where a room's own `sub` is a period claim:
   Golden Age Detection ≤1960, Poets Now Living last 30 years, The Canon
   Handled older, The Front Table ("New & Much Talked About") the last ~5
   years' lists.
4. Deterministic hash of the book id to break ties and balance counts, so
   re-running the tool produces the identical shelf.

**Stated plainly, because it is the honest limit of this method:** the accolade
is provenanced; the *sub-genre room* below the parent is an approximation from
list + subjects + year. Putting a Dagger winner in Noir rather than Rural Noir
is a mis-shelving, not a false claim, and the handoff says so.

### 4.4 What a generated book is

Exactly §6 step 3 — `title, author, year, pages, isbn, the accolade, a
description` — plus provenance, plus `translator` where and **only** where a
list gave an explicit translator column (International Booker, Dublin, Warwick,
NBA Translated, BTBA). That last one is a deliberate, recorded extension: it is
harvested rather than recalled, it is what the four translation rooms exist to
show, and it is taken only from an explicitly configured column, never from a
column guessed by the auto-detector.

**No `note`. No hand-written `tags`. No `first`. No `firstSource`.**

Accolades are stored once, as
`acc: [{ l: 'Booker Prize shortlist, 1990', k: 'c', s: 'booker' }]` — label,
kind (`w`/`c`), list slug. `shop.js` derives `won`/`cited` from `acc` when it
is present, so the UI needs no change and there is exactly one source of truth
to audit against `SOURCES`.

Files: `src/js/data/generated/<hub>.js`, one per depth-1 hub, mirroring the
existing `data/books/` convention, plus `src/js/data/generated/index.js`
exporting `GENERATED` and `SOURCES`. `shop.js` merges them after the curated
shelves. Ids are slugged from title+author surname and checked against the 409.

## 5. The shopkeeper's picks — the curated 409 as a visible tier

§6: *the existing 409 keep their curator's notes and become a visible tier
rather than being diluted.* "The curator's note is the product", so this is not
decoration:

* `shop.js` derives `pick = !!b.note`. No data edit; nothing to keep in sync.
* Picks sort **first** on their shelf, so they take the top row of the back
  case — eye level, and the row `shelf:back` frames best.
* A gilt band on the spine in both builds, so a pick is findable *in the room*
  rather than only after you open it.
* The book panel's note section is labelled as the shopkeeper's pick and only
  renders when there is a note (§6, and it is the same edit).
* Search results and the shelf overlay carry the same mark; `STATS.picks`.

## 6. `note` becomes optional — the three sites, each verified myself

* `views/book.js:108` — renders `${rich(book.note)}` unguarded. **Real.**
* `tools/qa.mjs:94` — requires `note` on every book. **Real**, and it would
  fail ~2,000 times the day this lands.
* `shop.js` — **nothing to do.** Checked: the file does not contain the string
  `note`; the search index already reads `(b.blurb || '')`. §6 is wrong about
  this and phase 8 was right to say so.

While in `qa.mjs`: `chromium.launch()` takes
`executablePath: process.env.PW_CHROMIUM || undefined`, so the tracked file can
actually run on this box instead of needing a sed'd copy every session.

## 7. Phase 7's two carried-forward items that land here

### 7.1 The table occludes the bottom shelf row (3 rooms)

`shelf:back` sits at z −58.5; the table spans z −630…−330, x −535…−65; the
back case is at z −1160. Harmless while the occluded spines were filler —
**this phase is what makes them real books that cannot be seen.**

Phase 7 judged it a design call, not a clamp, and it is. The frustum at the
table's near edge is only ~±84 units wide and ~±178 at its far edge, so the
table only needs to move **out of a narrow cone**, not out of the room:
shifting it along −x clears the sight line while leaving the `table:<id>` pose,
the doorways and the props alone. Measured and verified in the preview harness
before it is called done; if the shift fights the room's layout, the fallback
is to step the pose rather than clamp it, and either way the number that
matters is *every book in the bottom row visible from `shelf:back` in all three
table rooms*.

### 7.2 Performance

`PLAN-ARCH.md`: books stay individual meshes sharing one material; merging is
the optimisation **if profiling asks**, not before. So: profile, then decide,
then profile again with the real data in.

Baseline to beat, measured by phase 8: **median room transition 1091 ms, worst
1255 ms, heaviest room `front` at 320 nodes** (live CSS build). Node arithmetic
for the live build: today `front` is 11 real (6 nodes each) + 40 filler (3
each) = 186 book nodes; at ~48 real books it is 288. `PLAN.md`'s mitigation —
drop `bk__back`/`bk__edge`, which are never visible from inside a room, taking
a shelved book from 5 faces to 3 — brings it back to 192, at parity. **It is
not applied pre-emptively.** Measure first; apply only if the numbers ask.

For the three.js stage: atlas build time and steady-state frame rate in the
heaviest room, before and after, in `tools/preview-stage.html`.

## 8. Tooling, and what gets committed

```
tools/harvest.mjs     fetch | enrich | shelve | report     (real tooling, committed)
tools/lists.js        the ~45 list configs                 (committed)
data/lists/*.json     harvested lists + url/revid/fetchedAt (committed — the snapshot)
data/cache/*.json     openlibrary + wiki responses          (committed if sane; §8 note)
```

`server/index.js`'s `/api/list/:slug` starts serving `data/lists/` (falling
back to `server/fixtures/lists/`) with the provenance in the payload and
`source: 'fixture'` — a recorded response is exactly what §5 means by fixture,
so the contract's three values do not grow a fourth.

If the raw wikitext cache is large enough to be a nuisance in git it gets
gitignored and the *parsed* lists remain the snapshot; the decision and the
size get recorded rather than made quietly. **`.gitignore` is never sorted.**

## 9. Verification (`IMPLEMENTATION.md` §7)

Against `npm start` on :8099 — and **check what is answering first**
(`curl -sI http://127.0.0.1:8099/ | grep -i server`; a `SimpleHTTP/0.6` reply
means a stale `python3 -m http.server` is holding the port and the whole run is
worthless — phase 8 lost one that way). Playwright with
`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`. Settle
on a real condition — `state.room === id`, then the `#room > .travel` node's
**own** animations `finished` — never a fixed timeout.

1. **Zero filler spines.** `document.querySelectorAll('.bk.fill').length === 0`
   swept over all 50 rooms, and zero filler items in the three.js planner.
2. **Every generated accolade traces to a fetched source**: every `acc[].s`
   resolves in `SOURCES`, every entry there has a `url` + `revid`, and the
   count of books whose accolades do not resolve is 0.
3. No fabricated facts: every generated `isbn` is 13 digits and passes the
   ISBN-13 check digit; no generated book has `first` or `firstSource`; every
   `year`/`pages` present traces to a cached Open Library response.
4. Data checks that already exist — duplicate ids, missing fields, link hosts —
   with `note` moved from required to **optional**.
5. Shop builds and renders **every** room: 0 console errors, 0 page errors, 0
   non-2xx.
6. a11y mirror has one focusable control per book (three.js build), and the
   live build's books are still real focusable buttons with non-empty
   accessible names.
7. Picks tier is visibly a tier: marked on the shelf, marked in the panel,
   marked in search.
8. Frame rate / transition time / build time in the heaviest room, before and
   after.
9. Bottom shelf row fully visible from `shelf:back` in all three table rooms.

## 10. Not in this phase

* Wiring `src/js/scene/` into the live site — that is phase 10, and this phase
  keeps both builds working rather than choosing between them.
* Rewriting `tools/qa.mjs` per §7 (phase 10; only the `note` and
  `executablePath` changes here).
* `a11y.js`'s `role="listitem"`, the far end of deep side cases, Back's
  `closeBook()` hash bug — carried, still open, not this phase's brief.
* Hand-written notes, blurbs or tags for any generated book. Decided with the
  owner; not reopened.

---

## 11. Outcome — what the run actually produced

Appended after implementation, in the house style of `PLAN-PHASE8.md` §3: the
plan above is what was decided; this is what it turned into, measured.

| | planned | actual |
|---|---|---|
| lists fetched | ~45 | **77 configured, 73 usable** (1 parses to nothing, 3 are the same page twice) |
| unique title/author pairs harvested | — | **12,315** |
| enriched (confident Open Library match) | — | **5,128** of 7,000 attempted (73%) |
| books shelved | ~2,400 | **2,505** — 409 curated + **2,096** generated |
| filler spines | 0 | **0**, swept over all 50 rooms, both builds |
| ISBNs on the shelves | — | **2,145** (was 0), all check-digit valid |
| back-case occupancy | ~90% | 41 of 50 rooms over 60%; **9 rooms short**, §11.1 |
| surplus | — | **3,032** enriched books with no room that had space |

### 11.1 The shortfall, named

Nine rooms sit under 60% of their back case, and every one of them is a narrow
subject room that no prize list covers directly:

```
othersuns 13%   underworld 17%   fogline 40%   understory 22%   saltline 45%
snowroom 31%    smallkingdom 26% foreignwindow 14%   saltcellar 24%
```

This is a supply problem, not an allocation one — it survived widening the
list→room map, gating the parent rooms so they stop absorbing specialists, and
adding two translation prizes. There is no Wikipedia table for a food-writing
or a travel-writing prize (checked: André Simon, Fortnum & Mason, James Beard,
Edward Stanford, Boardman Tasker and Banff all have prose, not tables), and
translated crime, translated poetry and pre-1965 detection are thin in the
prize record itself. The slots stay; what is honestly available fills them.

### 11.2 Side cases: recorded, not hidden

The three.js side cases hold **no spines**. A room's whole allocation fits its
back case, so nothing overflows onto them. That is a deliberate reading of the
~2,400 target rather than a limit of the harvest — 3,032 enriched books are
sitting in the cache unused, and raising `FILL`/the per-room budget in
`tools/harvest.mjs` is the one change that would spend them. It would roughly
double the shipped JS (already 465 KB → 1.4 MB), which is why it is phase 10's
call and not this one's.

### 11.3 Performance — profiling did not ask for the optimisation

`PLAN.md` point 7 pre-authorised dropping `bk__back`/`bk__edge` to hold node
count. **Not applied**: measured before and after on the same box, same
harness.

| | before | after |
|---|---|---|
| spines shop-wide | 2,409 (409 real + 2,000 filler) | 2,505, all real |
| median room transition | 1,102 ms | 1,131 ms |
| worst | 1,349 ms | 1,347 ms |
| heaviest room | `front`, 320 nodes | `rafters`, 645 nodes |
| JS transferred | 465 KB | 1,400 KB |

Node count doubled and transition time did not move. The three.js stage got
*lighter*: `rafters` went from 953 draw calls carrying 7 real books to 629
carrying 98, because the 3,923 side-case filler meshes are gone.
