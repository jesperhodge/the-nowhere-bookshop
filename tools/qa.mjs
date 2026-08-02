import { chromium } from 'playwright';
import fs from 'node:fs';

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const shots = process.argv.includes('--shots');
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
page.on('requestfailed', (r) => errors.push('REQFAIL ' + r.url() + ' ' + r.failure()?.errorText));

await page.goto('http://127.0.0.1:8099/#/front', { waitUntil: 'networkidle' });
await page.click('#enter');

/* A room arrives with an animation that is not composited — it runs on the
   main thread behind several hundred nodes of preserve-3d, so it takes
   noticeably longer than its own duration. Waiting a fixed 800ms used to
   photograph and measure every room mid-flight, which is how a whole set of
   --shots came out at the wrong scale and hid what they were meant to show.
   Wait for the transform to actually land. */
const SETTLE_BUDGET = 2500;
async function settle(label) {
  const t0 = Date.now();
  await page.waitForTimeout(420);          /* past go()'s 300ms hand-over */
  await page.waitForFunction(() => {
    const t = document.querySelector('.travel');
    return t && getComputedStyle(t).transform === 'none' && t.getAnimations().length === 0;
  }, null, { timeout: 20000 }).catch(() => console.log('NEVER SETTLED:', label));
  return Date.now() - t0;
}
await settle('front');

/* ── data integrity ── */
const data = await page.evaluate(() => {
  const { ROOMS, ALL_BOOKS } = window.__shop;
  const ids = new Set();
  const dupes = [];
  const missing = [];
  const longBlurb = [];
  for (const b of ALL_BOOKS) {
    if (ids.has(b.id)) dupes.push(b.id);
    ids.add(b.id);
    for (const f of ['title', 'author', 'blurb', 'note']) if (!b[f]) missing.push(`${b.id}.${f}`);
    if (!b.won.length && !b.cited.length) longBlurb.push(b.id);
  }
  const emptyRooms = ROOMS.filter((r) => !r.books.length).map((r) => r.id);
  const noChildNoBooks = ROOMS.filter((r) => !r.books.length && !r.children.length).map((r) => r.id);
  const orphanArt = ALL_BOOKS.filter((b) => b.art && b.art.p && !window.__pal?.[b.art.p]).length;
  return {
    books: ALL_BOOKS.length, rooms: ROOMS.length,
    dupes, missing, noAccolade: longBlurb, emptyRooms, noChildNoBooks, orphanArt,
    roomIds: ROOMS.map((r) => r.id),
  };
});
console.log('books:', data.books, 'rooms:', data.rooms);
if (data.dupes.length) console.log('DUPLICATE IDS:', data.dupes);
if (data.missing.length) console.log('MISSING FIELDS:', data.missing);
if (data.noAccolade.length) console.log('NO ACCOLADE:', data.noAccolade.join(', '));
if (data.emptyRooms.length) console.log('rooms with no shelf:', data.emptyRooms.join(', '));
if (data.noChildNoBooks.length) console.log('DEAD ROOMS:', data.noChildNoBooks.join(', '));

/* ── walk every room ── */
const report = [];
const slow = [];
for (const id of data.roomIds) {
  await page.evaluate((r) => { location.hash = '#/' + r; }, id);
  const ms = await settle(id);
  const info = await page.evaluate(() => ({
    room: window.__shop.state.room,
    shelf: document.querySelectorAll('.bk[data-book]').length,
    doors: document.querySelectorAll('#room [data-go]').length,
    signs: document.querySelectorAll('#room .dsign__n').length,
    nodes: document.querySelectorAll('#room *').length,
    props: document.querySelectorAll('.prop').length,
    cases: document.querySelectorAll('.case').length,
  }));
  report.push({ id, ms, ...info });
  if (info.room !== id) console.log('ROUTE MISMATCH', id, '->', info.room);
  /* every way out of a room must say where it goes */
  if (info.doors !== info.signs) console.log(`SIGNS ${id}: ${info.doors} doors, ${info.signs} named`);
  if (ms > SETTLE_BUDGET) slow.push(`${id} ${ms}ms`);
  if (shots) await page.screenshot({ path: new URL(`rooms/${id}.png`, import.meta.url).pathname });
}

const heaviest = [...report].sort((a, b) => b.nodes - a.nodes)[0];
console.log(`room transition: median ${median(report.map((r) => r.ms))}ms, worst ${Math.max(...report.map((r) => r.ms))}ms`);
console.log(`heaviest room: ${heaviest.id}, ${heaviest.nodes} nodes`);
if (slow.length) console.log(`SLOW (over ${SETTLE_BUDGET}ms): ${slow.join(', ')}`);

/* ── open one book in every room that has a shelf ── */
let opened = 0;
for (const r of report) {
  if (!r.shelf) continue;
  await page.evaluate((id) => { location.hash = '#/' + id; }, r.id);
  await settle(r.id);
  await page.click('.bk[data-book]');
  await page.waitForTimeout(350);
  const ok = await page.evaluate(() => {
    const s = document.getElementById('sheet');
    const buy = document.querySelector('.buy__main');
    return !s.hidden && !!buy && /^https:\/\/(uk\.)?bookshop\.org\//.test(buy.href) &&
      !!document.querySelector('.bd__title')?.textContent;
  });
  if (!ok) console.log('BOOK PANEL FAILED in', r.id);
  else opened++;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(220);
}
console.log('book panels opened OK:', opened);

/* ── external links must never point at Amazon ── */
const linkCheck = await page.evaluate(() => {
  const { ALL_BOOKS } = window.__shop;
  const hosts = new Set();
  for (const b of ALL_BOOKS.slice(0, 40)) {
    document.querySelectorAll('a[href^="http"]').forEach((a) => hosts.add(new URL(a.href).host));
  }
  return [...hosts];
});
console.log('outbound hosts on a book panel:', linkCheck.join(', ') || '(none open)');

/* ── outbound links land on the book, not on a search box ── */
const links = await page.evaluate(async () => {
  const m = await import('/src/js/links.js');
  const withIsbn = { id: 'x', title: 'Beloved', author: 'Toni Morrison', isbn: '9781400033416' };
  const without = { id: 'y', title: 'Beloved', author: 'Toni Morrison' };
  return {
    previewIsbn: m.VENDORS.preview.url(withIsbn),
    previewPlain: m.VENDORS.preview.url(without),
    borrowIsbn: m.VENDORS.openlibrary.url(withIsbn),
    buy: m.buyLink(withIsbn),
    samples: m.sampleLinks(withIsbn).length,
  };
});
const expect = (name, ok) => console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
expect('preview deep-links by ISBN', links.previewIsbn === 'https://books.google.com/books?vid=ISBN9781400033416');
expect('preview still works without one', links.previewPlain.startsWith('https://www.google.com/search?tbm=bks'));
expect('borrow deep-links by ISBN', links.borrowIsbn === 'https://openlibrary.org/isbn/9781400033416');
expect('buy link is bookshop.org', /^https:\/\/bookshop\.org\//.test(links.buy));
expect('every book offers somewhere to read a sample', links.samples >= 3);

/* no book claims an opening line it cannot source */
const unsourced = await page.evaluate(() =>
  window.__shop.ALL_BOOKS.filter((b) => b.first && !b.firstSource).length);
console.log(`books with an unsourced opening line shown: 0 (${unsourced} held back)`);

/* ── keyboard: tab to a book and press enter ── */
await page.evaluate(() => { location.hash = '#/front'; });
await settle('front');
const kb = await page.evaluate(() => {
  const bk = document.querySelector('.bk[data-book]');
  bk.focus();
  return document.activeElement === bk;
});
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const kbOpened = await page.evaluate(() => !document.getElementById('sheet').hidden);
console.log('keyboard focus+enter opens a book:', kb && kbOpened);
await page.keyboard.press('Escape');

/* ── search / map / parcel ── */
await page.waitForTimeout(300);
await page.keyboard.press('/');
await page.waitForTimeout(300);
await page.fill('#findInput', 'booker');
await page.waitForTimeout(400);
const results = await page.evaluate(() => document.querySelectorAll('.res').length);
console.log('search "booker" results:', results);
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
console.log('after picking a result:', await page.evaluate(() => window.__shop.state.room + ' / ' + window.__shop.state.book));
await page.keyboard.press('Escape');

/* ── parcel round trip ── */
await page.waitForTimeout(300);
await page.evaluate(() => window.__shop.openBook('piranesi', false));
await page.waitForTimeout(400);
await page.click('[data-keep]');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.click('#btnParcel');
await page.waitForTimeout(400);
const parcel = await page.evaluate(() => document.querySelectorAll('.pitem').length);
console.log('parcel items after keeping one:', parcel);
if (shots) await page.screenshot({ path: 'parcel.png' });

if (errors.length) {
  console.log('\n--- ERRORS ---\n' + [...new Set(errors)].join('\n'));
} else {
  console.log('\nno console or page errors');
}
fs.writeFileSync(new URL('qa-report.json', import.meta.url), JSON.stringify(report, null, 1));
await browser.close();
