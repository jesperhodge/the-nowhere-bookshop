# The Nowhere Bookshop

A small, cosy, slightly magic bookshop that you walk around in three dimensions —
built because finding a good book online is either an ocean of everything or a
table of the same twelve bestsellers.

Four doors off the front room, one of which turns out to be a corridor. Fifty
rooms, four hundred and nine books, three doorways deep at the furthest point.
Nothing is on a shelf because it sold well; everything came off a prize list, a
critics' poll, or a long argument. Every book links out to an independent
bookseller — deliberately never Amazon.

**Open `index.html`** in a browser, or serve the folder:

```sh
python3 -m http.server 8000     # then visit http://localhost:8000
```

No build step, no dependencies, no bundler. It is HTML, CSS and ES modules.

---

## What is in it

| | |
|---|---|
| Rooms | 50, arranged as a tree three levels deep |
| Books | 409, each with a blurb, a curator's note and accolades |
| Assets | none — every cover, spine, prop and room is generated in the browser |
| Dependencies | none |

The shop is a tree. The **Front Room** has four halls off it (Literary Fiction,
Science Fiction, Fantasy & Myth, Crime & Mystery), a display table of new and
much-talked-about books, and a corridor — **The Landing** — with six more halls
behind it (Nature, History & Ideas, Poetry, Horror, Comics, Memoir). Each hall
opens onto three or four sub-rooms, and a few of those open onto something
narrower still: *The Hundred Windows*, *The Slipstream Door*, *The Underworld
Stair*.

## Getting around

| | |
|---|---|
| Point at a spine | read the title and the prize it won |
| Click a book | take it off the shelf — blurb, curator's note, opening line, where to buy |
| Click a lit doorway | walk through into the next room — the sign over it says where it goes |
| `←` `→` | the next book along the shelf |
| `/` or `⌘K` | search titles, authors, prizes and moods — try *islands*, *grief*, *Booker* |
| `M` | the shop plan |
| `P` | your parcel |
| `S` | everything on this shelf, as a list |
| `B` | ring the bell — the shopkeeper hands you something from anywhere in the shop, weighted towards the deep rooms |
| `H` | back to The Front Room, from however deep in you are |
| `Esc` | put the book back, or step back a room |

The doorways are how you get about — the dock at the bottom holds only the two
ways back, one room at a time and all the way to the front. Everything is also
on the plan and in search, so nothing is reachable only by finding it in the 3D
view.

## How it is built

```
index.html
src/styles/
  base.css      foundations, the entrance door
  scene.css     the 3D rooms — walls, cases, books, doorways, props
  themes.css    wall treatments each room picks from
  ui.css        chrome, panels, overlays
src/js/
  main.js       routing, state, keyboard, the bell, the parcel
  scene.js      builds a room from its data (slot-based placement)
  covers.js     procedural jackets and spines
  ambience.js   dust, rain, snow, embers, spores — one canvas
  audio.js      room tone, generated with the Web Audio API
  links.js      where to buy — the only file with vendor URLs in it
  views/        book panel, shop plan
  data/
    rooms.js    the plan of the shop: palettes, wall kinds, props
    props.js    SVG set dressing (ladders, globes, moths, candles…)
    books/*.js  the shelves, one file per hall
    enrich.js   ISBNs and page counts, fetched (see tools/hardcover.mjs)
```

**The rooms are DOM, not canvas.** Walls, shelves and books are ordinary
elements placed with CSS 3D transforms inside a fixed 1680 × 940 × 1200 world
box. That keeps every book a real `<button>`, so the whole shop works with a
keyboard and a screen reader, and the text stays selectable and crisp.

**Nothing is downloaded.** Covers, spines, thicknesses and page-block textures
are generated from a hash of each book's id, so a given book always looks the
same and no two neighbours look alike. Thirty-odd cover motifs, thirty palettes,
six layouts. Set dressing is inline SVG. Ambient sound is filtered noise from an
oscillator, off unless you ask for it.

**Doorways and props are placed by slot**, not by hand, so a room can never end
up with a fireplace behind a door. Doorway names are drawn in a flat overlay that
tracks where each doorway currently is on screen, because text inside the
geometry gets sliced by whatever is standing in front of it.

## Where the buy links go

`src/js/links.js` is the only file that knows about shops. The primary link is
**Bookshop.org**, which pays a share of every sale into a pool for independent
bookshops. Underneath it are Bookshop.org UK, Hive (which pays a share to a
high-street shop of your choice), Better World Books and Biblio for secondhand,
and Open Library so you can borrow it for nothing instead.

Every link prefers an ISBN-13 where the book has one, so it lands on the book
rather than on a search page you then have to pick through. ISBNs are fetched
by `tools/hardcover.mjs` into `src/js/data/enrich.js`; a book without one still
works, it just searches by title and author.

To earn affiliate income, put your id in `AFFILIATE.bookshop` at the top of that
file; every Bookshop link then carries it. Nothing else needs changing, and
there is no tracking of any kind in the page.

## Curation

Accolades shown on each book are the shopkeeper's notes: prizes won, prizes
shortlisted for, and the critical judgements that put the book on the shelf.
Where a book is here on reputation rather than a specific prize, the note says
so. Translators are named on the cover panel, because they wrote the book you
are actually going to read.

The shop will not quote a book's opening lines unless it can say where the
quotation came from. Instead each book points at somewhere you can read the
real pages: a publisher preview, a library loan, or — for anything out of
copyright — the whole text, free.

## Accessibility

- Every book and doorway is a focusable button with a descriptive label.
- `prefers-reduced-motion` turns off the parallax, the room transitions, the
  weather and the particle ambience.
- The room's contents are also reachable entirely through search and the plan.
- Ambient sound is off by default and never autoplays.

## Licence

Code is free to reuse. The shelves are opinions.
