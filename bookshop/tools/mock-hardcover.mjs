#!/usr/bin/env node
/* ============================================================
   A stand-in for api.hardcover.app, so tools/hardcover.mjs can
   be exercised without a token and without the network.

     node tools/mock-hardcover.mjs &
     node tools/hardcover.mjs enrich --endpoint http://127.0.0.1:8123 --limit 8

   It answers the same three queries with the same response
   shapes, from a small fixture. It deliberately includes the
   awkward cases the matcher has to survive: a title that
   matches with the wrong author, an edition list where only
   some entries carry an ISBN-13, and a book that is not in the
   catalogue at all.
   ============================================================ */

import http from 'node:http';

const PORT = Number(process.argv[2] || 8123);

const CATALOGUE = [
  {
    id: 1, title: 'Piranesi', slug: 'piranesi', pages: 245, release_year: 2020,
    description: 'A man lives alone in an infinite house.',
    contributions: [{ author: { name: 'Susanna Clarke' } }],
    editions: [
      { isbn_13: null, pages: 245, release_year: 2020, language: { language: 'English' } },
      { isbn_13: '9781635575637', pages: 245, release_year: 2020, language: { language: 'English' } },
      { isbn_13: '9782264078988', pages: 256, release_year: 2021, language: { language: 'French' } },
    ],
  },
  {
    /* same title, different writer — the matcher must not take this one */
    id: 2, title: 'Beloved', slug: 'beloved-other', pages: 180, release_year: 2011,
    description: 'Unrelated.',
    contributions: [{ author: { name: 'Corinne Michaels' } }],
    editions: [{ isbn_13: '9780000000001', pages: 180, language: { language: 'English' } }],
  },
  {
    id: 3, title: 'Beloved', slug: 'beloved', pages: 324, release_year: 1987,
    description: 'Sethe was born a slave and escaped to Ohio.',
    contributions: [{ author: { name: 'Toni Morrison' } }],
    editions: [
      { isbn_13: '9781400033416', pages: 324, release_year: 2004, language: { language: 'English' } },
      { isbn_13: '9780099760115', pages: 336, release_year: 1997, language: { language: 'English' } },
    ],
  },
  {
    /* matched, but nothing in the catalogue carries an ISBN-13 */
    id: 4, title: 'The Rings of Saturn', slug: 'the-rings-of-saturn', pages: 296, release_year: 1995,
    description: 'A walking tour of Suffolk.',
    contributions: [{ author: { name: 'W. G. Sebald' } }],
    editions: [{ isbn_13: null, pages: 296, language: { language: 'English' } }],
  },
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function search(q) {
  const words = norm(q).split(' ');
  return CATALOGUE
    .filter((b) => {
      const hay = norm(b.title + ' ' + b.contributions.map((c) => c.author.name).join(' '));
      return words.some((w) => w.length > 3 && hay.includes(w));
    })
    .map((b) => ({
      document: {
        id: String(b.id),
        title: b.title,
        slug: b.slug,
        release_year: b.release_year,
        author_names: b.contributions.map((c) => c.author.name),
      },
    }));
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let out;
    try {
      const { query, variables } = JSON.parse(body);
      if (/search\(/.test(query)) {
        out = { data: { search: { results: { hits: search(variables.q) } } } };
      } else if (/books\(where/.test(query)) {
        const b = CATALOGUE.find((x) => x.id === Number(variables.id));
        out = { data: { books: b ? [b] : [] } };
      } else if (/books\(/.test(query)) {
        out = { data: { books: CATALOGUE.slice(0, variables.limit || 10) } };
      } else {
        out = { errors: [{ message: 'unrecognised query' }] };
      }
    } catch (err) {
      out = { errors: [{ message: err.message }] };
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`mock hardcover on http://127.0.0.1:${PORT}`));
