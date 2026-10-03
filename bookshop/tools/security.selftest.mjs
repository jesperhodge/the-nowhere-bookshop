/* ============================================================
   Regression selftest for PHI-13 S1 — untyped upstream `pages`/
   `year` reaching an innerHTML sink (CWE-79, OWASP API10).

   Two checks, both must fail against the pre-fix code:

     1. GET /api/book coerces a non-numeric upstream `pages`/`year`
        to null rather than re-emitting it verbatim (server/routes.js).
        Exercised through the real fixture path — server/fixtures/
        catalogue.json#5 carries a deliberately non-numeric pages/
        release_year, the same shape a malformed upstream response
        could produce.
     2. factLine() escapes `pages`/`year` before they reach the
        innerHTML sink (src/js/views/book.js).

   Run: node tools/security.selftest.mjs
   ============================================================ */

process.env.HARDCOVER_MOCK = '1';

const { default: express } = await import('express');
const { apiRouter } = await import('../server/routes.js');
const { factLine } = await import('../src/js/views/book.js');

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok && detail) console.log(`    ${detail}`);
  ok ? pass++ : fail++;
};

/* ── 1. /api/book: non-numeric upstream pages/year → null ───── */

const app = express();
app.use('/api', apiRouter());
const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const { port } = server.address();

try {
  const url = `http://127.0.0.1:${port}/api/book`
    + `?title=${encodeURIComponent('Security Regression Fixture')}`
    + `&author=${encodeURIComponent('Marker Testauthor')}`;
  const res = await fetch(url);
  const body = await res.json();
  check('/api/book matched the fixture (sanity check)', body.isbn13 === '9780000000099',
    `got isbn13=${JSON.stringify(body.isbn13)} — fixture lookup didn't match, rest of this check proves nothing`);
  check('/api/book coerces a non-numeric pages to null', body.pages === null,
    `got pages=${JSON.stringify(body.pages)}`);
  check('/api/book coerces a non-numeric year to null', body.year === null,
    `got year=${JSON.stringify(body.year)}`);
} catch (err) {
  check('/api/book coerces non-numeric pages/year to null', false, err.stack);
} finally {
  server.close();
}

/* ── 2. factLine(): no raw '<' reaches the innerHTML sink ───── */

try {
  const marker = '<b>x</b>';
  const html = factLine({ year: null, pages: marker, translator: '', isbn: '' });
  /* factLine always wraps each fact in its own <span>...</span> — strip
     those before checking, so the assertion is about the marker, not
     about factLine's own markup. */
  const inner = html.replace(/<\/?span>/g, '');
  check('factLine() escapes a "<" in pages', !inner.includes('<'), `got ${html}`);
} catch (err) {
  check('factLine() escapes a "<" in pages', false, err.stack);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
