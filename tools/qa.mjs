import { chromium } from 'playwright';
import fs from 'node:fs';

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
await page.waitForTimeout(800);

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
for (const id of data.roomIds) {
  await page.evaluate((r) => { location.hash = '#/' + r; }, id);
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({
    room: window.__shop.state.room,
    shelf: document.querySelectorAll('.bk[data-book]').length,
    doors: document.querySelectorAll('#room [data-go]').length,
    labels: document.querySelectorAll('.dlabel').length,
    placedLabels: [...document.querySelectorAll('.dlabel')].filter((l) => l.style.left && l.style.opacity !== '0').length,
    props: document.querySelectorAll('.prop').length,
    cases: document.querySelectorAll('.case').length,
  }));
  report.push({ id, ...info });
  if (info.room !== id) console.log('ROUTE MISMATCH', id, '->', info.room);
  if (info.doors !== info.placedLabels) console.log(`LABELS ${id}: ${info.doors} doors, ${info.placedLabels} placed`);
  if (shots) await page.screenshot({ path: new URL(`rooms/${id}.png`, import.meta.url).pathname });
}

/* ── open one book in every room that has a shelf ── */
let opened = 0;
for (const r of report) {
  if (!r.shelf) continue;
  await page.evaluate((id) => { location.hash = '#/' + id; }, r.id);
  await page.waitForTimeout(500);
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

/* ── keyboard: tab to a book and press enter ── */
await page.evaluate(() => { location.hash = '#/front'; });
await page.waitForTimeout(600);
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
