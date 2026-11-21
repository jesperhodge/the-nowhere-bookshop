/* ============================================================
   Tests for src/js/shopconfig.js — the untrusted-input loader
   for shop/config.js.

   Every field in shop/config.js is treated as "pasted from a
   website by a hurried stranger" (see shopconfig.js's own header
   for the full threat model). These tests exist to pin down two
   security controls (F1: path/URL injection via logo, contact.url,
   store templates; F2: markup/attribute injection via colours and
   any other string) so a later refactor can't quietly loosen them.
   ============================================================ */

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, safeUrl } from '../src/js/shopconfig.js';
import RAW_NOWHERE_CONFIG from '../shop/config.js';
import NOWHERE_CONFIG from '../src/js/shopconfig.js';

function validFixture() {
  return {
    id: 'nowhere',
    name: 'The Nowhere Bookshop',
    type: 'A small shop that goes on forever',
    tagline: 'Nothing here is on the shelf because it sold well.',
    logo: 'assets/placeholder-logo.svg',
    colours: { primary: '#1d1512', accent: '#c98a4b', neutral: '#f4efe6' },
    font: { display: 'Fraunces', body: 'Inter' },
    address: ['Est. nowhere in particular'],
    hours: [['Always', 'Open']],
    contact: { phone: '', email: '', url: '' },
    store: {
      label: 'Find at The Nowhere Bookshop',
      isbnSearch: 'https://example.com/search?q={isbn}',
      titleSearch: 'https://example.com/search?q={title}+{author}',
    },
    frontTable: { name: 'Fresh off the press', isbns: [] },
    categories: [
      { id: 'fiction', name: 'Fiction', line: '', prizes: ['booker', 'pulitzer-fiction', 'womens'] },
    ],
  };
}

function collect() {
  const rejects = [];
  const onReject = (path, reason) => rejects.push([path, reason]);
  return { rejects, onReject };
}

// --- id ------------------------------------------------------

test('id: valid passes through, no rejects', () => {
  const { rejects, onReject } = collect();
  const out = validateConfig(validFixture(), { onReject });
  assert.equal(out.id, 'nowhere');
  assert.equal(rejects.length, 0);
});

test('id: invalid falls back to "shop" and logs', () => {
  for (const bad of ['Has Spaces', 'UPPER', 'x'.repeat(40)]) {
    const fixture = validFixture();
    fixture.id = bad;
    const { rejects, onReject } = collect();
    const out = validateConfig(fixture, { onReject });
    assert.equal(out.id, 'shop', `expected default for ${JSON.stringify(bad)}`);
    assert.ok(rejects.some(([p]) => p === 'id'), `expected a reject naming "id" for ${JSON.stringify(bad)}`);
  }
});

// --- logo ------------------------------------------------------

test('logo: valid relative asset path passes through unchanged', () => {
  const fixture = validFixture();
  fixture.logo = 'assets/logo.svg';
  const out = validateConfig(fixture);
  assert.equal(out.logo, 'assets/logo.svg');
});

test('logo: scheme-relative, traversal, missing-prefix and injection attempts all rejected to null', () => {
  const bad = [
    '//evil.example/x.svg',
    '/etc/passwd',
    '../../x.svg',
    'logo.svg',
    'assets/x.svg" onerror="alert(1)',
  ];
  for (const b of bad) {
    const fixture = validFixture();
    fixture.logo = b;
    const { rejects, onReject } = collect();
    const out = validateConfig(fixture, { onReject });
    assert.equal(out.logo, null, `expected null for ${JSON.stringify(b)}`);
    assert.ok(rejects.some(([p]) => p === 'logo'), `expected a reject naming "logo" for ${JSON.stringify(b)}`);
    assert.ok(!JSON.stringify(out).includes('evil.example'));
    assert.ok(!JSON.stringify(out).includes('onerror'));
  }
});

// --- colours ------------------------------------------------------

test('colours: valid 3- and 6-digit hex pass through', () => {
  const fixture = validFixture();
  fixture.colours = { primary: '#fff', accent: '#112233', neutral: '#abc' };
  const out = validateConfig(fixture);
  assert.equal(out.colours.primary, '#fff');
  assert.equal(out.colours.accent, '#112233');
  assert.equal(out.colours.neutral, '#abc');
});

test('colours: injection attempt rejected, defaulted, never leaks into output', () => {
  const fixture = validFixture();
  fixture.colours.primary = '#fff" onload="x';
  const { rejects, onReject } = collect();
  const out = validateConfig(fixture, { onReject });
  assert.notEqual(out.colours.primary, fixture.colours.primary);
  assert.ok(!JSON.stringify(out).includes('onload'));
  assert.ok(rejects.some(([p]) => p === 'colours.primary'));
});

// --- font ------------------------------------------------------

test('font: allowlisted names pass through', () => {
  const out = validateConfig(validFixture());
  assert.equal(out.font.display, 'Fraunces');
  assert.equal(out.font.body, 'Inter');
});

test('font: non-allowlisted name rejected to default and logged', () => {
  const fixture = validFixture();
  fixture.font.display = 'Comic Sans MS';
  const { rejects, onReject } = collect();
  const out = validateConfig(fixture, { onReject });
  assert.equal(out.font.display, 'Fraunces');
  assert.ok(rejects.some(([p]) => p === 'font.display'));
});

// --- safeUrl / contact.url ------------------------------------------------------

test('safeUrl: accepts https, rejects javascript: and http:', () => {
  assert.equal(safeUrl('https://example.com'), 'https://example.com');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('http://example.com'), null);
});

test('contact.url: empty string is a silent "not provided" state, no reject fired', () => {
  const fixture = validFixture();
  fixture.contact.url = '';
  const { rejects, onReject } = collect();
  const out = validateConfig(fixture, { onReject });
  assert.equal(out.contact.url, null);
  assert.ok(!rejects.some(([p]) => p === 'contact.url'));
});

test('contact.url: valid https url passes through', () => {
  const fixture = validFixture();
  fixture.contact.url = 'https://example.com';
  const out = validateConfig(fixture);
  assert.equal(out.contact.url, 'https://example.com');
});

test('contact.url: javascript: scheme rejected to null and logged', () => {
  const fixture = validFixture();
  fixture.contact.url = 'javascript:alert(1)';
  const { rejects, onReject } = collect();
  const out = validateConfig(fixture, { onReject });
  assert.equal(out.contact.url, null);
  assert.ok(rejects.some(([p]) => p === 'contact.url'));
});

test('contact.url: wrong scheme (http) rejected to null and logged', () => {
  const fixture = validFixture();
  fixture.contact.url = 'http://example.com';
  const { rejects, onReject } = collect();
  const out = validateConfig(fixture, { onReject });
  assert.equal(out.contact.url, null);
  assert.ok(rejects.some(([p]) => p === 'contact.url'));
});

// --- store.isbnSearch / store.titleSearch ------------------------------------------------------

test('store.isbnSearch/titleSearch: valid templates pass through unchanged', () => {
  const fixture = validFixture();
  const out = validateConfig(fixture);
  assert.equal(out.store.isbnSearch, fixture.store.isbnSearch);
  assert.equal(out.store.titleSearch, fixture.store.titleSearch);
});

test('store.isbnSearch: unknown placeholder rejected to null and logged', () => {
  const fixture = validFixture();
  fixture.store.isbnSearch = 'https://example.com/search?q={evil}';
  const { rejects, onReject } = collect();
  const out = validateConfig(fixture, { onReject });
  assert.equal(out.store.isbnSearch, null);
  assert.ok(rejects.some(([p]) => p === 'store.isbnSearch'));
});

test('store.titleSearch: javascript: scheme in the non-placeholder part rejected to null', () => {
  const fixture = validFixture();
  fixture.store.titleSearch = 'javascript:alert(1)?q={isbn}';
  const { rejects, onReject } = collect();
  const out = validateConfig(fixture, { onReject });
  assert.equal(out.store.titleSearch, null);
  assert.ok(rejects.some(([p]) => p === 'store.titleSearch'));
});

test('store template: the internal probe (placeholders replaced with "x") is itself https-safe', () => {
  const template = 'https://example.com/search?q={isbn}&a={author}&t={title}';
  const probe = template.replace(/\{[^}]+\}/g, 'x');
  assert.equal(probe, 'https://example.com/search?q=x&a=x&t=x');
  assert.equal(safeUrl(probe), probe);
  const fixture = validFixture();
  fixture.store.isbnSearch = template;
  const out = validateConfig(fixture);
  assert.equal(out.store.isbnSearch, template);
});

test('store.isbnSearch: missing/blank template is a real rejection, logged, defaulted to null', () => {
  const fixture = validFixture();
  fixture.store.isbnSearch = '';
  const { rejects, onReject } = collect();
  const out = validateConfig(fixture, { onReject });
  assert.equal(out.store.isbnSearch, null);
  assert.ok(rejects.some(([p]) => p === 'store.isbnSearch'));
});

// --- frontTable.isbns ------------------------------------------------------

test('frontTable.isbns: valid ISBN-13 passes, bad check digit and wrong length dropped individually', () => {
  const fixture = validFixture();
  fixture.frontTable.isbns = ['9780593321201', '9780593321209', '978059332120'];
  const { rejects, onReject } = collect();
  const out = validateConfig(fixture, { onReject });
  assert.deepEqual(out.frontTable.isbns, ['9780593321201']);
  assert.ok(rejects.some(([p]) => p.startsWith('frontTable.isbns')));
});

// --- categories ------------------------------------------------------

test('categories: entries beyond the 11-entry cap are dropped, with exactly one cap-related log', () => {
  const fixture = validFixture();
  fixture.categories = Array.from({ length: 12 }, (_, i) => ({
    id: `cat-${i}`,
    name: `Cat ${i}`,
    line: '',
    prizes: [],
  }));
  const { rejects, onReject } = collect();
  const out = validateConfig(fixture, { onReject });
  assert.equal(out.categories.length, 11);
  assert.equal(out.categories[10].id, 'cat-10');
  const capRejects = rejects.filter(([p]) => p === 'categories');
  assert.equal(capRejects.length, 1);
});

test('categories: a duplicate id is dropped, first occurrence kept', () => {
  const fixture = validFixture();
  fixture.categories = [
    { id: 'fiction', name: 'Fiction', line: '', prizes: [] },
    { id: 'fiction', name: 'Fiction Again', line: '', prizes: [] },
  ];
  const out = validateConfig(fixture);
  assert.equal(out.categories.length, 1);
  assert.equal(out.categories[0].name, 'Fiction');
});

test('categories: unknown prize slug is dropped, category itself is kept', () => {
  const fixture = validFixture();
  fixture.categories = [{ id: 'fiction', name: 'Fiction', line: '', prizes: ['booker', 'not-a-real-slug'] }];
  const { rejects, onReject } = collect();
  const out = validateConfig(fixture, { onReject });
  assert.equal(out.categories.length, 1);
  assert.deepEqual(out.categories[0].prizes, ['booker']);
  assert.ok(rejects.some(([p]) => p.includes('prizes')));
});

test('categories: zero valid categories in produces [] out, no throw', () => {
  const fixture = validFixture();
  fixture.categories = [{ id: 'Bad Id!', name: 'x', line: '', prizes: [] }];
  assert.doesNotThrow(() => {
    const out = validateConfig(fixture);
    assert.deepEqual(out.categories, []);
  });
});

// --- generic string rule (config-walk coverage) ------------------------------------------------------

test('generic string rule applies structurally to a field nobody wrote a specific rule for', () => {
  const fixture = validFixture();
  fixture.someNewField = 'x'.repeat(200);
  const { rejects, onReject } = collect();
  const out = validateConfig(fixture, { onReject });
  assert.equal(out.someNewField.length, 120);
  assert.equal(out.someNewField, 'x'.repeat(120));
  assert.ok(rejects.some(([p]) => p === 'someNewField'));
});

test('generic string rule reaches into nested objects it was never told about', () => {
  const fixture = validFixture();
  fixture.contact.newNestedField = 'y'.repeat(150);
  const { rejects, onReject } = collect();
  const out = validateConfig(fixture, { onReject });
  assert.equal(out.contact.newNestedField.length, 120);
  assert.ok(rejects.some(([p]) => p === 'contact.newNestedField'));
});

// --- sanity / regression ------------------------------------------------------

test('sanity: the real shop/config.js is 100% valid by its own loader — no rejects', () => {
  const { rejects, onReject } = collect();
  validateConfig(RAW_NOWHERE_CONFIG, { onReject });
  assert.deepEqual(rejects, []);
});

test('sanity: the default export is frozen and carries the Nowhere identity', () => {
  assert.ok(Object.isFrozen(NOWHERE_CONFIG));
  assert.equal(NOWHERE_CONFIG.id, 'nowhere');
  assert.equal(NOWHERE_CONFIG.name, 'The Nowhere Bookshop');
});
