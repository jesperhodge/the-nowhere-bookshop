/* ============================================================
   Where to buy, and where to read a few pages first.

   Deliberately not Amazon. The default is Bookshop.org, which
   splits its profit pool between independent bookshops; the
   alternates are a UK indie-supporting wholesaler, a used-book
   seller that funds literacy programmes, and the library.

   Everything here prefers an ISBN-13 when the book has one, so
   the link lands on the book rather than on a search results
   page the reader then has to pick through. ISBNs come from the
   Hardcover enrichment pass — see tools/hardcover.mjs — so a
   book without one still works, just less precisely.

   Hive and Biblio used to be alternates here too. Both are
   retired: every request to hive.co.uk or biblio.com gets a
   Cloudflare 403 from this codebase's own probes, so neither link
   could ever be verified — and an unverifiable link is exactly the
   bug this file was rewritten to fix (PLAN-LINKS.md §1). A link we
   can never check is not a link we should ship.

   The preview link below is the other half of that fix. It only
   ever points at a Google Books volume id verified in advance to
   actually show pages (src/js/data/linkfacts.js, baked by
   tools/links.mjs) — no id, no link. There is deliberately no
   ISBN-guess or search-box fallback, because that guess is what
   produced a "No preview available" page on ~78% of the old links.

   ── To earn affiliate income ──────────────────────────────
   Put your Bookshop.org affiliate id in AFFILIATE.bookshop
   below (from bookshop.org/affiliates). Every Bookshop link on
   the site then carries it. Nothing else needs changing.
   ============================================================ */

import { LINKFACTS } from './data/linkfacts.js';

export const AFFILIATE = {
  bookshop: '',        // e.g. '12345'
  bookshopUK: '',
};

const q = (s) => encodeURIComponent(String(s).replace(/\s+/g, ' ').trim());

function withAff(url, id, param = 'affiliate') {
  if (!id) return url;
  return url + (url.includes('?') ? '&' : '?') + param + '=' + encodeURIComponent(id);
}

/** ISBN-13, digits only, or null. */
export function isbn13(book) {
  const raw = String(book.isbn || '').replace(/[^0-9Xx]/g, '');
  return raw.length === 13 ? raw : null;
}

/** Search terms that reliably land on the right book. */
function terms(book) {
  const i = isbn13(book);
  if (i) return i;
  const t = book.title.replace(/[:;–—].*$/, '').trim();
  return `${t} ${book.author}`;
}

/** A vendor is hidden only when its own `hide` predicate says so.
    Absent `hide` ⇒ always shown (fail open). */
function visible(key, book) {
  const v = VENDORS[key];
  return !v.hide || !v.hide(book);
}

export const VENDORS = {
  bookshop: {
    name: 'Bookshop.org',
    note: 'profits shared with independent bookshops',
    url: (b) => {
      const i = isbn13(b);
      const aff = AFFILIATE.bookshop;
      /* The documented per-book affiliate deep link is /a/<id>/<isbn13>. */
      if (i && aff) return `https://bookshop.org/a/${encodeURIComponent(aff)}/${i}`;
      /* Without an affiliate id, /book/<isbn13> is the documented direct
         path: it 302s straight to the real product page (verified —
         PLAN-LINKS.md §1) rather than the search box, which does not
         reliably find the book at all. */
      if (i) return `https://bookshop.org/book/${i}`;
      return withAff(`https://bookshop.org/search?keywords=${q(terms(b))}`, aff);
    },
  },
  bookshopUK: {
    name: 'Bookshop.org UK',
    note: 'UK & Ireland',
    url: (b) => {
      const i = isbn13(b);
      if (i && AFFILIATE.bookshopUK) return `https://uk.bookshop.org/a/${encodeURIComponent(AFFILIATE.bookshopUK)}/${i}`;
      /* Mirrors the bookshop.org (US) fix above: /book/<isbn13> is the
         documented direct path there, and uk.bookshop.org shares the same
         Bookshop platform, so the same shape should hold. Unlike the US
         path, this could not be probed directly — uk.bookshop.org returns
         a Cloudflare 403 to automated requests (PLAN-LINKS.md §1) — so
         this is the same documented route shape, not an independently
         verified one. */
      if (i) return `https://uk.bookshop.org/book/${i}`;
      return withAff(`https://uk.bookshop.org/search?keywords=${q(terms(b))}`, AFFILIATE.bookshopUK);
    },
  },
  betterworld: {
    name: 'Better World Books',
    note: 'secondhand; funds literacy charities',
    /* Fails open: shown unless tools/links.mjs verified the book is not
       in stock there. Unverified (the common case) still shows it. */
    hide: (b) => LINKFACTS[b.id]?.bwb === 0,
    url: (b) => {
      const i = isbn13(b);
      /* tools/links.mjs verifies stock by checking /product/detail/-<isbn13>
         (it 302s to the real product page for a book confirmed in stock),
         so link to the same URL it verified rather than a search page —
         otherwise "verified in stock" and "what we link to" would be two
         different pages. Unverified books keep the search URL: an
         unstocked product path 404s, while a search page always renders. */
      if (i && LINKFACTS[b.id]?.bwb === 1) return `https://www.betterworldbooks.com/product/detail/-${i}`;
      return `https://www.betterworldbooks.com/search/results?q=${q(terms(b))}`;
    },
  },
  preview: {
    name: 'Read a few pages',
    note: 'Google Books — preview pages where the publisher allows them',
    /* Fails closed. Only emitted when tools/links.mjs has baked a volume
       id known to have a partial or full preview. No search fallback —
       see the file header for why that fallback was the actual bug. */
    hide: (b) => !LINKFACTS[b.id]?.gb,
    url: (b) => {
      const gb = LINKFACTS[b.id]?.gb;
      return gb ? `https://www.google.com/books/edition/_/${gb}?gbpv=1` : null;
    },
  },
  openlibrary: {
    name: 'Borrow it',
    note: 'Open Library / Internet Archive — free, with a library card or without',
    /* Always shown regardless of flags — it resolves for effectively
       every book and is the deliberate fallback when no shop has stock. */
    url: (b) => {
      const i = isbn13(b);
      return i ? `https://openlibrary.org/isbn/${i}` : `https://openlibrary.org/search?q=${q(terms(b))}`;
    },
  },
  worldcat: {
    name: 'Find a library',
    note: 'WorldCat',
    /* Always shown, same reasoning as openlibrary above. */
    url: (b) => `https://search.worldcat.org/search?q=${q(terms(b))}`,
  },
  standardebooks: {
    name: 'Free ebook',
    note: 'Standard Ebooks — public domain, beautifully set',
    /* Standard Ebooks reset their own editions, so an ISBN is no use here */
    url: (b) => `https://standardebooks.org/ebooks?query=${q(`${b.title} ${b.author}`)}`,
  },
  gutenberg: {
    name: 'Read it free',
    note: 'Project Gutenberg — the full text, in the public domain',
    url: (b) => `https://www.gutenberg.org/ebooks/search/?query=${q(`${b.title} ${b.author}`)}`,
  },
};

/** Primary shop link for a book. */
export function buyLink(book) {
  return VENDORS.bookshop.url(book);
}

/** The alternates offered underneath. */
export function altLinks(book) {
  const keys = ['bookshopUK', 'betterworld', 'openlibrary'];
  if (book.publicDomain) keys.unshift('standardebooks');
  return keys.filter((k) => visible(k, book)).map((k) => ({ key: k, ...VENDORS[k], href: VENDORS[k].url(book) }));
}

/** Where to read some of it before committing. */
export function sampleLinks(book) {
  const keys = book.publicDomain
    ? ['standardebooks', 'gutenberg', 'preview', 'openlibrary']
    : ['preview', 'openlibrary', 'worldcat'];
  return keys.filter((k) => visible(k, book)).map((k) => ({ key: k, ...VENDORS[k], href: VENDORS[k].url(book) }));
}
