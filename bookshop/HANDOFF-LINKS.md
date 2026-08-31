# HANDOFF — outbound links

Phase: every outbound link either lands on the book or is not shown.
Plan: `PLAN-LINKS.md`. Tool: `tools/links.mjs`. Baked data:
`src/js/data/linkfacts.js`. QA: 71/72 (the one failure is the pre-existing
spine-click raycast mismatch, untouched here).

## What changed

- `VENDORS.preview` no longer derives a URL from an ISBN. It emits
  `https://www.google.com/books/edition/_/<volumeId>?gbpv=1`, and only for
  the 504 books with a volume id verified to actually show pages. No id, no
  link.
- Hive and Biblio are gone. Both sit behind Cloudflare, so neither could ever
  be verified.
- `bookshop` and `bookshopUK` deep-link `/book/<isbn13>` instead of a keyword
  search that returned *No results* even for stocked books.
- `betterworld` links `/product/detail/-<isbn13>` when stock was verified,
  search otherwise.
- New pipeline: `npm run links` → `data/cache/links.json` → `npm run
  links:apply` → `src/js/data/linkfacts.js`. `npm run links:report` prints
  coverage and the no-shop-anywhere list.

## Traps — each one already cost a session

**`googleapis.com/books/v1` and `books.google.com/books?jscmd=viewapi` are
different services.** The first needs a key and returns 503 from many IPs
(including this repo's usual sandbox — `.env.example` already warned about
it). The second needs no key, is not blocked, and is what the whole phase
runs on. Do not "modernise" the tool onto the v1 API; you will get a working
run on your laptop and an empty one in CI.

**`viewapi` takes bare volume ids as bibkeys**, not just `ISBN:`/`OCLC:`. That
is undocumented and is the only reason checking a candidate id is cheap. It
also batches — 20 per request at ~700ms is polite and swept 2,505 books in
about three minutes.

**An ISBN is the wrong key for a preview.** `vid=ISBN<n>` resolves to the
edition record for that exact ISBN, which is a metadata stub ~74% of the
time. This is the actual bug; the deprecated URL shape was the smaller half.
Measured on the full shelf: 504 previewable, 1,525 present-but-not-
previewable, 438 absent from Google Books, 353 with nothing to check.

**A 403 is not a "no".** `tools/links.mjs` aborts the bookshop/bwb pass on the
first Cloudflare 403 and records nothing further, on purpose. Caching a block
as "not stocked" would hide links for books that are in stock — the original
bug, inverted.

**ISBN-keyed stock checks produce false negatives across editions.** The one
bookshop answer we got said *Piranesi* was not stocked; its baked ISBN is the
UK Bloomsbury edition and Bookshop.org US is keyed to the US ISBN, which
resolves fine. That record was purged. Nothing hides a shop link on `bs`
today. If you ever wire one up, key it per storefront, not per book.

**Open Library is a circular check.** 2,097 of 2,097 ISBNs "found". Of course
they were — the ISBNs were harvested from Open Library. `ol: 1` proves the
ISBN is a real record, never that it is the right book.

**Do not regex the JSONP.** The `viewapi` payload has `}` inside string
values. Slice between the first `{` and the last `}`.

## Known-bad data this phase found but did not fix

29 ISBNs point at a foreign edition or a different book, which breaks every
ISBN-keyed vendor at once — Spanish *Anathem*, Serbian *Austerlitz*, German
*Consider the Lobster*, Chinese *The Old Man and the Sea*, and 18 more; plus
`9781400830336` on *Different*, which is really *Primates and Philosophers*,
and `9780582435674` on *The Beach*, which is an abridged Penguin Readers ESL
edition. `README.md` claims ISBNs are only taken from English editions;
`server/openlibrary.js:250-268` does try, but accepts editions whose language
is simply unrecorded, which is how these got through. The detector is a title
comparison against the Open Library record — cheap, and worth folding into
`tools/links.mjs` as a fifth pass.

360 books have no ISBN at all, so every shop link for them is a title+author
search.

## If you re-run the sweep

`npm run links` is resumable and skips fresh records. The google and
openlibrary passes are safe and fast. The bookshop and bwb passes will stop
on their second request; that is expected, not a bug to fix. Never run two
passes concurrently — they write the same cache file and a lost update bakes
a wrong answer.

`GOOGLE_BOOKS_KEY` in `.env` widens coverage beyond the ISBN path by
searching for previewable editions of books whose own ISBN has no preview.
It is gated on the API actually answering and disables itself after one
failure, so a blocked IP costs one request, not the run.
