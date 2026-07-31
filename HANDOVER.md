# Handover — The Nowhere Bookshop

You are picking up a project that is **built, working and shipped to the owner's
machine**. It is not a prototype to be rewritten; it is a v1 to be iterated on.
Read this file before touching anything — several of the notes below are things
that cost real debugging time and are invisible from the code.

---

## 1. The brief (from the owner, verbatim in substance)

> It's very hard to find a good selection of books online — either an
> overwhelming amount of choice you need to search through (Google, Amazon), or
> a small list of a few bestsellers. I want a better book-finding experience
> that's really enjoyable.
>
> Build a website that is a curated 3D very cozy (slightly magic) bookstore with
> the best books in the world. Curate selections by looking at awards and
> critical selections. I want that feeling of going into a physical bookstore,
> looking through what books are on the shelf and getting heavily curated picks,
> taking a book in my hand and reading the blurb (and if possible some sample
> pages). I'm not interested in bestsellers or most current books, though there
> should be a section for them; instead I want the most awarded and critically
> acclaimed books per genre, akin to a hand-selection of the finest literature.
>
> A book should have an affiliate link or a normal link to a shop where you can
> buy it — avoid Amazon if possible, go to independent book shop sites or a
> vendor that is more ethical than Amazon.
>
> Give every section for a genre a unique feel, and allow the visitor to dive
> deeper into a genre by moving deeper into the bookstore. The bookstore should
> be small, cozy, intimate on the surface, but allow you to go a lot deeper, as
> you can enter passages to other areas and such — into more and more niche
> subgenres. The deeper sections should still be carefully curated. Each section
> should be visually creatively designed according to its theme. The books should
> also have compelling interesting designs.
>
> Success looks like: great UX; browsing is really enjoyable; features all work
> (navigate, pick books, read blurbs, click through to an external shop);
> intimate, cozy atmosphere; curation is thoughtful enough to produce the
> "wow, this seems like such a cool book, I had no idea it existed!" moment.

The owner's verdict on v1: *"I love this. It needs some iteration but overall we
are on the right track."*

## 2. Where things stand

- Code lives at **https://github.com/jesperhodge/the-nowhere-bookshop**. Clone it.
- **50 rooms, 409 books**, three doorways deep at the furthest point.
- No build step, no dependencies, no bundler. HTML + CSS + ES modules.
- Every cover, spine, prop and room is generated in the browser. Zero image assets.
- Verified working: all 50 book panels open, no console errors, keyboard and
  reduced-motion paths, search, plan, parcel, mobile.

### Running it

```sh
python3 -m http.server 8000     # then http://localhost:8000
```

`file://` will not work in Chrome — ES modules are blocked on that scheme.

## 3. How the owner wants work delivered

**Do not push to the repository.** The session credential is read-only for this
repo (`git-receive-pack`, `POST /git/refs` and `POST /pulls` all return 403 —
this was diagnosed thoroughly and is not worth re-litigating). Instead:

```sh
git archive --format=zip -o /tmp/nowhere-bookshop.zip HEAD
```

…and hand the zip back with `SendUserFile`. Commit locally as you go so the
history is clean if they ever want it; a `git bundle create <file> --all` is a
good companion deliverable.

---

## 4. Architecture in ten minutes

```
index.html
src/styles/
  base.css      foundations, the entrance door
  scene.css     the 3D rooms — walls, cases, books, doorways, props
  themes.css    wall treatments ("kinds") each room picks from
  ui.css        chrome, panels, overlays
src/js/
  main.js       routing, state, keyboard, parallax, pan, bell, parcel
  scene.js      builds a room from its data (slot-based placement)
  covers.js     procedural jackets, spines, shelf sizes
  ambience.js   dust / rain / snow / embers / spores — one canvas
  audio.js      room tone, generated with Web Audio
  links.js      where to buy — the ONLY file with vendor URLs
  shop.js       joins rooms to shelves; search; the bell's random pick
  views/book.js the take-a-book-off-the-shelf panel
  views/map.js  the shop plan
  data/rooms.js the plan of the shop: palettes, wall kinds, props
  data/props.js SVG set dressing (ladders, globes, moths, candles…)
  data/books/   the shelves, one file per hall
tools/
  qa.mjs        the QA sweep — RUN THIS (see §6)
  shot.mjs      screenshot one room
```

### The world box

Rooms are ordinary DOM with CSS 3D transforms inside a fixed world:

```
x  −840 …  840      (left wall … right wall)
y  −470 …  470      (ceiling … floor)      ← y is DOWN-positive
z −1200 …    0      (back wall … where you stand)
```

`.world` is a zero-size point at the centre of the front opening. Every face is
placed with one `translate3d()` from there and uses `transform-origin: 0 0`, which
keeps the maths trivial. `.stage` supplies `perspective: 1500px`.

### Slot placement

Doorways and props are placed by **slot name**, never by raw coordinates, so a
room can't put a fireplace behind a door. See `SLOT` and `BAY` in `scene.js`.

- Doorways: `l1 r1 l2 r2 l3 r3` — three bays per side wall, near to far. A room
  with one child uses `r1`; two use `l1 r1`; and so on.
- Props: `hang`, `hang-l`, `hang-r`, `above`, `back-l`, `back-r`, `back-l-hi`,
  `back-r-hi`, `floor-l`, `floor-r`, `floor-ml`, `floor-mr`, `floor-c`,
  `tall-l`, `tall-r`, `ceil`, `rug`. Nudge with `dx` / `dy` / `dz`.
- Whatever side wall a doorway isn't using gets filler shelves automatically
  (`addSideCase`), unless a `trunk` / `column` / `monolith` occupies that wall.

### Data shapes

A room (`data/rooms.js`):

```js
{
  id: 'lamproom', parent: 'front',
  name: 'The Lamp Room', sub: 'Crime & Mystery',
  line: 'One green lamp, one bad window, and a great deal of unfinished business.',
  kind: 'k-plaster',        // wall treatment class, see themes.css
  low: false,               // lower ceiling (attic, cellar)
  viaTable: false,          // reached by a display table, not a doorway
  pal: { wall, 'wall-lit', floor, 'floor-lit', ceiling,
         wood, 'wood-lit', 'wood-dark', glow, accent, 'door-glow',
         hue /* filler-book hue */ },
  amb: 'rain',              // ambience kind, see ambience.js KINDS
  props: [ { t: 'lamp', at: 'hang', w: 175, h: 104, green: true }, … ],
}
```

A book (`data/books/*.js`, keyed by room id):

```js
{
  id: 'beloved',                       // unique across the whole shop
  title, author, year, pages,          // pages drives spine thickness
  translator: 'Anthea Bell',           // optional — shown, and it should be
  won:   ['Pulitzer Prize for Fiction, 1988'],   // ★ seal
  cited: ['Booker Prize shortlist, 2022'],       // ❦ seal
  blurb: 'What it is — 1–2 sentences.',
  note:  "Why it's on this shelf — the curator's case. <em>allowed</em>.",
  first: 'Opening line.',              // optional, only where you are sure
  tags:  ['slavery', 'ghosts'],        // feed search; clickable in the panel
  publicDomain: true,                  // adds a Standard Ebooks link
  art: { p: 'oxblood', m: 'door', l: 'band', f: 'display' },   // optional
}
```

`art` is optional — omit it and a palette/motif/layout/font is chosen from a hash
of the id, so a book always looks the same and neighbours never match. Keys:
`p` palette (30 in `PALETTES`), `m` motif (~40 in `MOTIFS`), `l` layout
(`top bottom band frame centre corner`), `f` font (`display grotesk humanist mono`).

### The voice

The curator's notes have a specific register: dry, opinionated, specific, never
marketing copy. Match it. Examples:

> Rejected for nine years before a tiny Norwich press took it. It reads like
> thought before thought becomes sentences — hard for twenty pages, then
> unstoppable.

> The KGB arrested the manuscript rather than the author and said it could not
> be published for two hundred years. It took twenty.

> Yes, one sentence. It is also funny, warm and completely readable after twenty
> pages, and the mountain lion sections will wreck you.

---

## 5. Traps that cost real time — read these

**1. `pointer-events` in a `preserve-3d` stack.** Every full-size wrapper
(`.room`, `.travel`, `.pivot`, `.world`, `.stage__fit`, `.face`, `.case`, …) is a
plane sitting at z = 0, *in front of* the geometry receding behind it. They
silently swallow every click aimed at a shelf. The shop looked perfect and was
completely inert for hours before this was found.

`scene.css` sets `pointer-events: none` on all of them and `auto` on only
`.bk__spine` and `.door3d`. **If you add any new wrapper inside the stage, add it
to that list or clicking books breaks — with no error of any kind.** Only the
spine is clickable so a neighbouring book's rear faces can't steal the hit;
`backface-visibility: hidden` on `.bk__f` matters for the same reason.

**2. Oversized grid items fall back to start alignment.** `.stage__fit` is 1680px
wide inside a narrower viewport. `place-items: center` on `.stage` centred it at
layout time but Chromium aligned the overflowing item to *start*, so the phone
crop showed a corner of the room instead of the shelf. It is now centred by hand
(`left/top: 50%` + negative margins + `transform-origin: 50% 50%`). Don't
"simplify" that back.

**3. Canvas particle cost.** The ambience canvas originally called
`createRadialGradient` and set `shadowBlur` per particle per frame. Room changes
took **2–5 seconds**. Now every particle draws a cached sprite from `SPRITES`
and `dpr` is capped at 1.25 — room changes are ~0.5s. Never reintroduce
`shadowBlur` or per-frame gradients in that loop.

**4. Navigation during a transition.** `go()` used to drop a request if one was
already in flight, leaving the URL pointing at a room you weren't in. Requests
now queue (`queued` in `main.js`). Keep that if you touch routing.

**5. Blend modes and filters on full-wall surfaces are expensive** but were *not*
the bottleneck — measure before optimising. `tools/qa.mjs` and a small perf probe
are how the real cause was found.

---

## 6. QA — run this before you hand anything back

```sh
python3 -m http.server 8099 &          # the harness expects port 8099
node tools/qa.mjs                      # add --shots to save a PNG per room
```

Needs Playwright (`npm i playwright`) and Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` — adjust `EXE` at the top if
your path differs. Do **not** edit source files while it runs; it walks all 50
rooms and a mid-run reload produces confusing failures.

It checks: duplicate/missing book fields, dead rooms, every room's doorway labels
get placed, a book panel opens in every room with a shelf, buy links point at
bookshop.org, no Amazon anywhere, keyboard focus + Enter opens a book, search,
and a parcel round-trip. A clean run looks like:

```
books: 409 rooms: 50
book panels opened OK: 50
outbound hosts: google.com, openlibrary.org, bookshop.org, uk.bookshop.org,
                hive.co.uk, betterworldbooks.com, biblio.com
no console or page errors
```

`node tools/shot.mjs <roomId> out.png [width] [height]` screenshots one room.
Look at your changes — several bugs above were only visible in a screenshot.

---

## 7. Suggested iteration backlog

Ordered by how much they'd improve the thing the owner actually asked for.
Confirm priorities with them before a big push.

**Curation quality (highest value — this is the heart of the brief)**
1. **Accolade audit.** All 409 entries were written from model knowledge. Expect
   a handful of slips in prize *years* and shortlist-vs-win. Verify in batches
   with web search and correct `won` / `cited`. This is the one thing that would
   embarrass the project publicly.
2. More `first` lines — only ~60 of 409 have one; the rest fall back to a generic
   "have a look inside" card. Only add where certain of the wording.
3. Deepen the sparse rooms. Leaf rooms have 6–9 books; the brief's "wow, I had no
   idea this existed" moment lives there, not on the front table.

**Discovery UX**
4. The bell (`surprise()`) weights deep rooms 5× but always opens a single book.
   Consider a "shopkeeper's three" or a reason-why line.
5. No way to browse *across* rooms by mood — tags exist and are searchable but
   there's no tag index page.
6. Search ranks by title/author match; it could weight the curator's note too.

**Feel and polish**
7. Mobile has drag-to-pan but no affordance saying so. Add a hint on first touch.
8. Cover generator has no contrast check — a few palette/motif combinations put
   dark type on a dark ground. Add a luminance guard in `coverSVG`.
9. Books thinner than 19px show no spine title and are a small target.
10. The front room's window and hearth are easy to miss; the room could be
    warmer and more legible as "the cosy entrance".
11. Room tone is one filtered-noise bed per ambience kind. It could be much nicer.

**Housekeeping**
12. No CI, no unit tests — `tools/qa.mjs` is the whole safety net.
13. Screen readers get ~400 buttons in DOM order with no list/landmark structure
    around the shelves.
14. `links.js` has an `AFFILIATE.bookshop` hook that is currently empty.

---

## 8. Things not to change without asking

- **No Amazon links, ever.** That was an explicit requirement.
- The shop is deliberately **small on the surface, deep inside**. Don't flatten
  the tree to make navigation "easier" — the depth is the product.
- Nothing is on a shelf because it sold well, except the Front Table, which is
  labelled as exactly that.
- No build step and no runtime dependencies. It is a folder you can open.
- Translators are named on the book panel. Keep them.
