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

   ── To earn affiliate income ──────────────────────────────
   Put your Bookshop.org affiliate id in AFFILIATE.bookshop
   below (from bookshop.org/affiliates). Every Bookshop link on
   the site then carries it. Nothing else needs changing.
   ============================================================ */

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

export const VENDORS = {
  bookshop: {
    name: 'Bookshop.org',
    note: 'profits shared with independent bookshops',
    url: (b) => {
      const i = isbn13(b);
      /* The documented per-book affiliate deep link is /a/<id>/<isbn13>.
         Without an affiliate id there is no equally documented direct
         path, so we search by ISBN instead — one result, the right book. */
      if (i && AFFILIATE.bookshop) return `https://bookshop.org/a/${encodeURIComponent(AFFILIATE.bookshop)}/${i}`;
      return withAff(`https://bookshop.org/search?keywords=${q(terms(b))}`, AFFILIATE.bookshop);
    },
  },
  bookshopUK: {
    name: 'Bookshop.org UK',
    note: 'UK & Ireland',
    url: (b) => {
      const i = isbn13(b);
      if (i && AFFILIATE.bookshopUK) return `https://uk.bookshop.org/a/${encodeURIComponent(AFFILIATE.bookshopUK)}/${i}`;
      return withAff(`https://uk.bookshop.org/search?keywords=${q(terms(b))}`, AFFILIATE.bookshopUK);
    },
  },
  hive: {
    name: 'Hive',
    note: 'pays a share to a UK high-street shop of your choice',
    url: (b) => `https://www.hive.co.uk/Search/Keyword?keyword=${q(terms(b))}`,
  },
  betterworld: {
    name: 'Better World Books',
    note: 'secondhand; funds literacy charities',
    url: (b) => `https://www.betterworldbooks.com/search/results?q=${q(terms(b))}`,
  },
  biblio: {
    name: 'Biblio',
    note: 'independent & antiquarian sellers',
    url: (b) => `https://www.biblio.com/bookstore/search?keyisbn=${q(terms(b))}`,
  },
  preview: {
    name: 'Read a few pages',
    note: 'Google Books — preview pages where the publisher allows them',
    /* vid=ISBN<n> goes straight to the edition; without one, a books search */
    url: (b) => {
      const i = isbn13(b);
      return i
        ? `https://books.google.com/books?vid=ISBN${i}`
        : `https://www.google.com/search?tbm=bks&q=${q(terms(b))}`;
    },
  },
  openlibrary: {
    name: 'Borrow it',
    note: 'Open Library / Internet Archive — free, with a library card or without',
    url: (b) => {
      const i = isbn13(b);
      return i ? `https://openlibrary.org/isbn/${i}` : `https://openlibrary.org/search?q=${q(terms(b))}`;
    },
  },
  worldcat: {
    name: 'Find a library',
    note: 'WorldCat',
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
  const keys = ['bookshopUK', 'hive', 'betterworld', 'biblio', 'openlibrary'];
  if (book.publicDomain) keys.unshift('standardebooks');
  return keys.map((k) => ({ key: k, ...VENDORS[k], href: VENDORS[k].url(book) }));
}

/** Where to read some of it before committing. */
export function sampleLinks(book) {
  const keys = book.publicDomain
    ? ['standardebooks', 'gutenberg', 'preview', 'openlibrary']
    : ['preview', 'openlibrary', 'worldcat'];
  return keys.map((k) => ({ key: k, ...VENDORS[k], href: VENDORS[k].url(book) }));
}
