# PLAN — Outbound links that actually resolve

Phase goal: every outbound link on a book panel either lands on the book, or
is not shown. Today none of that is true for the Google Books preview, and it
is unverified for the shops.

## 1. Diagnosis (measured, not assumed)

**The preview link is broken twice over.**

`VENDORS.preview` emits `https://books.google.com/books?vid=ISBN<i>`. Two
independent defects:

1. `books.google.com/books?…` is the retired classic UI. The live shape is
   `https://www.google.com/books/edition/<slug>/<volumeId>?gbpv=1`. The slug
   is cosmetic — `_` works as a placeholder and is what we emit.
2. Worse, and the reason a corrected URL shape alone fixes nothing:
   `vid=ISBN<i>` resolves to the Google *edition record for that exact ISBN*,
   which is almost always a metadata stub with no scanned pages.

   Measured over a 240-ISBN spread across the whole shelf, via
   `books.google.com/books?jscmd=viewapi`:

   | preview status | count | share |
   |---|---|---|
   | `noview` | 177 | 73.8% |
   | `partial` | 53 | 22.1% |
   | not in Google Books at all | 10 | 4.2% |

   So ~78% of today's "Read a few pages" links go to a page that says *No
   preview available*. The user's own example is one: ISBN 9781529411980
   resolves to volume `PErdzQEACAAJ` (`noview`), while a previewable edition
   of the same book, `gGpMEAAAQBAJ`, exists and is what a human finds.

   **A preview link therefore cannot be derived from an ISBN. It needs a
   per-book volume id, resolved and cached at build time.**

**Other defects found:**

- `bookshop.org/search?keywords=` 302s to `/beta-search`, and an ISBN search
  returns *No results* even for books Bookshop stocks. The correct deep link
  is `bookshop.org/book/<isbn13>`, which 302s to the real product page
  (verified: 9781635575637 → `/p/books/piranesi-susanna-clarke/…?ean=…`) and
  404s when not stocked. Use it, and use the 404 as the stock signal.
- `VENDORS.biblio` passes `terms(book)` to `keyisbn=`. For any book without an
  ISBN that sends a *title-and-author string* into a parameter that means
  ISBN. Always zero results.
- ~5.7% of curated baked ISBNs (13 books) and 1.8% of generated (34) are
  foreign-language editions — Spanish *Anathem*, Serbian *Austerlitz*, French
  *Babel*, Chinese *The Old Man and the Sea*. Every ISBN-keyed vendor lands on
  the wrong book or none. Open Library confirms: 9788466641135 → *Anatema*.

**What can and cannot be verified.** Probed from this machine, headless
Chromium included:

| source | signal | usable |
|---|---|---|
| Google `jscmd=viewapi` | `preview: noview\|partial\|full` + volume id, batched, no key | **yes — fast, unblocked** |
| Open Library `/api/books` | record + `ebooks`, batched | **yes — fast, unblocked** |
| `bookshop.org/book/<isbn>` | 200 vs 404 | yes, but Cloudflare throttles hard |
| Better World Books `/product/detail/-<isbn>` | canonical redirect | yes, Playwright, slow |
| WorldCat | JS-only app | no — keep unverified |
| **hive.co.uk, biblio.com, uk.bookshop.org** | Cloudflare 403 on every request | **no** |

Decision taken with the user: **retire Hive and Biblio.** A link we can never
verify is exactly the link that was caught failing. Bookshop.org UK stays as
an alternate — it just cannot be stock-verified from here (same Cloudflare
403 as Hive and Biblio), so it fails open like the other unverifiable
vendors rather than being dropped.

## 2. Architecture

Same shape as the existing enrichment passes: a tool writes a cache under
`data/cache/`, an `apply` step bakes a small module into `src/js/data/`, and
the runtime reads only the baked module. The site must keep working with no
Node and no network, so nothing here is a runtime fetch.

```
tools/links.mjs verify → data/cache/links.json → apply → src/js/data/linkfacts.js
                                                            ↓
                                                     src/js/links.js
```

### 2.1 Cache — `data/cache/links.json`

Keyed by `cacheKey(title, author)` from `server/cache.js` (reuse it; do not
invent a second key scheme). One record per book:

```json
"widowland c j carey": {
  "isbn": "9781529411980",
  "gb":   { "id": "PErdzQEACAAJ", "preview": "noview" },
  "ol":   { "found": true, "ebook": false },
  "bs":   { "found": false },
  "bwb":  { "found": true },
  "checkedAt": "2026-08-30T…"
}
```

Misses from a *transport* failure (timeout, 403, 503) must **not** be cached —
same rule as `server/cache.js`. Only record an answer the upstream actually
gave. A `found: false` is an answer; a Cloudflare 403 is not.

### 2.2 Baked module — `src/js/data/linkfacts.js`

Keyed by **book id**, like `enrich.js`, so the runtime lookup is one hash hit.
Compact — this covers 2,505 books.

```js
export const LINKFACTS = {
  piranesi: { gb: 'K5IyEAAAQBAJ', ol: 1, bs: 1 },
};
```

| field | meaning |
|---|---|
| `gb` | volume id **known to have `partial` or `full` preview**. Absent ⇒ no preview link. |
| `gbf` | `1` when `full` (whole text readable) |
| `ol` | `1` Open Library has the record, `0` verified absent, absent ⇒ unverified |
| `olb` | `1` borrowable/readable at Internet Archive |
| `bs` | `1`/`0`/absent — bookshop.org stock |
| `bwb` | `1`/`0`/absent — Better World Books stock |

Tri-state matters: `0` means *we asked and it is not there* (hide the link);
absent means *we never got an answer* (show it — fail open, except `gb`).

### 2.3 Runtime rule — `src/js/links.js`

- **`gb` fails closed.** A preview link is emitted only when `LINKFACTS[id].gb`
  is present, as `https://www.google.com/books/edition/_/<gb>?gbpv=1`. No id,
  no link. This is the whole point of the phase — do not add a search-URL
  fallback, it is what produced the broken links.
- **Everything else fails open.** Show unless the flag is explicitly `0`.
- Library links (`openlibrary`, `worldcat`) are always shown, per the user's
  decision, because they resolve for effectively everything and are the
  fallback when no shop has stock.
- `bookshop` primary link becomes `bookshop.org/book/<isbn13>` when there is an
  ISBN, search otherwise. Keep the documented affiliate path `/a/<id>/<isbn>`
  ahead of both when `AFFILIATE.bookshop` is set.
- Delete `hive` and `biblio` from `VENDORS` and from the `altLinks` key list.

`altLinks()` and `sampleLinks()` already return arrays the view maps over, so
filtering there needs no view change beyond handling an empty array.

## 3. Steps

**Step 1 — `tools/links.mjs` (sub-agent, high effort).**
Three commands, mirroring `tools/describe.mjs`: `verify`, `apply`, `report`.

`verify` runs four passes, cheapest and most reliable first:

1. **Google preview.** Collect candidate volume ids per book: any id already on
   the book via `blurbUrl` (73 books) or in `describe.json` (79), plus the
   book's ISBN. Query `books.google.com/books?jscmd=viewapi&bibkeys=…` in
   batches of 20, ~700ms apart. Response is JSONP — strip the `cb(` … `);`
   wrapper by slicing between the first `{` and last `}`; do not regex it.
   Accept the first candidate whose `preview` is `partial` or `full`.
   *Optional widening:* when `GOOGLE_BOOKS_KEY` is set **and** the API answers
   (it returns 503 from some IPs — see `.env.example`), search
   `volumes?q=intitle:…+inauthor:…` for books still unresolved and feed the
   returned ids back through `viewapi`. Skip cleanly when the API errors;
   never let it fail the run.
2. **Open Library.** `/api/books?bibkeys=ISBN:…&format=json&jscmd=data`,
   batched, for every book with an ISBN.
3. **Bookshop.** `bookshop.org/book/<isbn>` via Playwright, 200 vs 404.
   Cloudflare throttles this hard, so: only run it for books the earlier
   passes leave doubtful, pace it at several seconds, and **stop the pass and
   record nothing further the moment a 403 appears** rather than poisoning the
   cache with false negatives.
4. **Better World Books.** Same treatment, same guard.

`report` prints per-vendor coverage and, most importantly, **the list of books
with no shopping link that resolves anywhere** — the thing the user asked to
have surfaced.

Resumable: re-reading `links.json` on start and skipping fresh records, so an
interrupted sweep is not a lost sweep.

**Step 2 — runtime (sub-agent, high effort).** `src/js/links.js` per §2.3,
plus `src/js/views/book.js` handling an empty alternates array without leaving
an empty `.buy__alts` div or a stray "Before you buy it" section.

**Step 3 — tests (sub-agent, high effort).** `tools/qa.mjs:685` asserts the
*old broken URL* and must be rewritten, not deleted:
- preview link, when a `gb` id is baked, is
  `https://www.google.com/books/edition/_/<id>?gbpv=1`
- a book with no `gb` id offers **no** preview link
- no emitted URL matches `/books\.google\.com\/books\?vid=/`
- `hive.co.uk` and `biblio.com` appear nowhere in the emitted links
- every book still offers at least one place to read or borrow

**Step 4 — docs.** `README.md`, `HANDOFF-PHASE3.md` and `HANDOVER.md` name
Hive and Biblio as vendors. Correct them so the docs stay true; note in
`links.js`'s header comment why the two were retired.

## 4. Traps

- **The API and the endpoint are different services.** `googleapis.com/books/v1`
  needs a key and 503s from some IPs. `books.google.com/books?jscmd=viewapi`
  needs no key and answers fine. The phase depends on the second; the first is
  an optional widening only.
- **`viewapi` accepts bare volume ids as bibkeys**, not just `ISBN:`/`OCLC:`
  ones. That is what makes checking a candidate id cheap, and it is not
  documented anywhere obvious.
- **A 403 is not a "no".** Caching Cloudflare blocks as absent stock would hide
  links for books that are in stock — the exact failure this phase exists to
  fix, inverted.
- **Do not regex JSONP.** The payload contains `}` inside string values.
- `describe.json` and `src/js/data/generated/*.js` are **already modified in the
  working tree** by the user's own earlier `describe` run. Leave those changes
  alone; do not revert or re-run `describe:apply`.
