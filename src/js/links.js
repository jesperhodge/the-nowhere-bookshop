/* ============================================================
   Where to buy.

   Deliberately not Amazon. The default is Bookshop.org, which
   splits its profit pool between independent bookshops; the
   alternates are a UK indie-supporting wholesaler, a used-book
   seller that funds literacy programmes, and the library.

   ── To earn affiliate income ──────────────────────────────
   Put your Bookshop.org affiliate id in AFFILIATE.bookshop
   below (from bookshop.org/affiliates). Every Bookshop link on
   the site then carries it. Nothing else needs changing.
   ============================================================ */

export const AFFILIATE = {
  bookshop: '',        // e.g. 'nowherebookshop'
  bookshopUK: '',
};

const q = (s) => encodeURIComponent(s.replace(/\s+/g, ' ').trim());

function withAff(url, id, param = 'affiliate') {
  if (!id) return url;
  return url + (url.includes('?') ? '&' : '?') + param + '=' + encodeURIComponent(id);
}

/** Search terms that reliably land on the right book. */
function terms(book) {
  if (book.isbn) return book.isbn;
  const t = book.title.replace(/[:;–—].*$/, '').trim();
  return `${t} ${book.author}`;
}

export const VENDORS = {
  bookshop: {
    name: 'Bookshop.org',
    note: 'profits shared with independent bookshops',
    url: (b) => withAff(`https://bookshop.org/search?keywords=${q(terms(b))}`, AFFILIATE.bookshop),
  },
  bookshopUK: {
    name: 'Bookshop.org UK',
    note: 'UK & Ireland',
    url: (b) => withAff(`https://uk.bookshop.org/search?keywords=${q(terms(b))}`, AFFILIATE.bookshopUK),
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
    name: 'Read a sample',
    note: 'Google Books preview pages',
    url: (b) => `https://www.google.com/search?tbm=bks&q=${q(terms(b))}`,
  },
  openlibrary: {
    name: 'Borrow it',
    note: 'Open Library / Internet Archive',
    url: (b) => `https://openlibrary.org/search?q=${q(terms(b))}`,
  },
  worldcat: {
    name: 'Find a library',
    note: 'WorldCat',
    url: (b) => `https://search.worldcat.org/search?q=${q(terms(b))}`,
  },
  standardebooks: {
    name: 'Free ebook',
    note: 'Standard Ebooks — public domain, beautifully set',
    url: (b) => `https://standardebooks.org/ebooks?query=${q(terms(b))}`,
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
