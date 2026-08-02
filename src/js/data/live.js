/* ============================================================
   Client-side fallback for facts the baked snapshot missed.

   Fallback chain: baked src/js/data/enrich.js (already merged
   into each book in shop.js) → this fetch, only reachable when
   the shop is served by server/index.js → nothing.

   A plain static server (no Node) has no /api route, and a
   network hiccup is just as silent — either way this resolves
   to null and the book is shown exactly as baked. This is an
   enhancement, never a requirement: "opening the site through
   any static server with no Node still works" stays true.
   ============================================================ */

const cache = new Map();

/** Facts for a book missing an ISBN, or null if none are available right now. */
export function fetchBookFacts(book) {
  if (cache.has(book.id)) return cache.get(book.id);

  const p = (async () => {
    try {
      const qs = new URLSearchParams({ title: book.title, author: book.author });
      const res = await fetch(`/api/book?${qs}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.source !== 'miss' ? data : null;
    } catch {
      return null;              /* no server, offline, CORS — all the same to a reader */
    }
  })();

  cache.set(book.id, p);
  return p;
}
