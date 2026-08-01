/* ============================================================
   Facts fetched from an outside source, kept apart from the
   shelves themselves.

   The shelves in data/books/*.js are the shop's opinions: what
   is on them, and why. This file is the opposite — plain,
   checkable facts (ISBN-13, page count, year of first
   publication) pulled from Hardcover, so the buy links land on
   the actual book rather than on a search box.

   Regenerate it with:

     HARDCOVER_TOKEN=… node tools/hardcover.mjs enrich

   Keyed by book id. Anything in here is merged over the book
   in shop.js, so a book with no entry still works — its links
   just fall back to searching by title and author.

   Do not hand-edit: the tool overwrites the file. If a match is
   wrong, add the id to SKIP in tools/hardcover.mjs and put the
   correct isbn straight on the book in data/books/*.js, which
   always wins.
   ============================================================ */

export const ENRICH = {
  /* generated — empty until tools/hardcover.mjs has been run against the
     real API. It is deliberately not pre-filled: an ISBN nobody fetched is
     exactly the kind of plausible-looking wrong fact this file exists to
     get rid of. */
};

export default ENRICH;
