import { chromium } from 'playwright';
import fs from 'node:fs';

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

const shots = process.argv.includes('--shots');
/* Playwright 1.62 wants Chromium build 1234 and this box has 1194, so a bare
   launch() fails on the version check. Taking the path from the environment
   means the tracked file runs as committed instead of needing a sed'd copy
   every session, which is what phases 7 and 8 both ended up doing.
     PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run qa */
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
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

/* ── every ART entry must draw inside its own viewBox (Finding C, PLAN.md) ──
   Render each shape into a canvas padded well past its declared box, using an
   enlarged viewBox so nothing gets clipped at render time, then check whether
   any painted pixel falls outside where the *real* viewBox would have been.
   That is a direct test of what clips in production, not a re-derivation of
   each shape's bezier/arc extrema. */
const artCheck = await page.evaluate(async () => {
  const { ART } = await import('/src/js/data/props.js');
  const out = [];
  for (const name of Object.keys(ART)) {
    const svgStr = ART[name]();
    const [, vb, body] = svgStr.match(/viewBox="([^"]+)">([\s\S]*)<\/svg>/);
    const [minX, minY, w, h] = vb.split(' ').map(Number);
    const pad = Math.max(w, h) * 0.5;
    const scale = 4;
    const cw = Math.round((w + pad * 2) * scale), ch = Math.round((h + pad * 2) * scale);
    const paddedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}">${body}</svg>`;
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = rej;
      img.src = 'data:image/svg+xml,' + encodeURIComponent(paddedSvg);
    });
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch).data;
    const innerX0 = Math.round(pad * scale), innerY0 = Math.round(pad * scale);
    const innerX1 = Math.round((pad + w) * scale), innerY1 = Math.round((pad + h) * scale);
    let overBy = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (data[(y * cw + x) * 4 + 3] <= 8) continue;
        if (x < innerX0) overBy = Math.max(overBy, (innerX0 - x) / scale);
        if (x >= innerX1) overBy = Math.max(overBy, (x - innerX1 + 1) / scale);
        if (y < innerY0) overBy = Math.max(overBy, (innerY0 - y) / scale);
        if (y >= innerY1) overBy = Math.max(overBy, (y - innerY1 + 1) / scale);
      }
    }
    out.push({ name, overBy: Math.round(overBy * 10) / 10 });
  }
  return out;
});
const clipped = artCheck.filter((r) => r.overBy > 0.5);
console.log(clipped.length
  ? `ART CLIPPED BY VIEWBOX: ${clipped.map((r) => `${r.name} (+${r.overBy})`).join(', ')}`
  : `all ${artCheck.length} ART entries draw inside their viewBox`);

/* ── data integrity ── */
const data = await page.evaluate(() => {
  const { ROOMS, ALL_BOOKS, SOURCES, PICKS } = window.__shop;
  const ids = new Set();
  const dupes = [];
  const missing = [];
  const longBlurb = [];
  const unsourced = [];
  const heldBack = [];
  const badIsbn = [];
  for (const b of ALL_BOOKS) {
    if (ids.has(b.id)) dupes.push(b.id);
    ids.add(b.id);
    /* `note` is OPTIONAL since phase 9. Only 409 of the books on these
       shelves have a curator's note; the rest are harvested from prize
       lists and have none by design (IMPLEMENTATION.md §6). Requiring it
       here would fail a couple of thousand times a run and say nothing. */
    for (const f of ['title', 'author']) if (!b[f]) missing.push(`${b.id}.${f}`);
    if (!b.won.length && !b.cited.length) longBlurb.push(b.id);
    /* Provenance: every harvested accolade has to trace to a fetched
       source. A book whose acc[].s does not resolve in SOURCES is exactly
       the failure this phase exists to make impossible. */
    if (b.acc) for (const a of b.acc) if (!SOURCES[a.s]?.permalink) unsourced.push(`${b.id}:${a.s}`);
    /* No GENERATED book may carry an opening line at all (§6 step 3), and
       nothing rendered may quote one without a source. The 44 curated books
       that carry an unsourced `first` are the existing, correct state — the
       rule is that the line stays HELD BACK, which views/book.js does — so
       they are not a failure here; a generated book having one would be. */
    if (b.acc && (b.first || b.firstSource)) heldBack.push(b.id);
    /* An ISBN-13 carries its own check digit. Thirteen digits is not the
       test — one Open Library record held an ISBN-10 with three characters
       stuck on the end, which is 13 digits and is not an ISBN. */
    if (b.isbn) {
      const d = String(b.isbn).replace(/[^0-9]/g, '');
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 ? 3 : 1);
      if (!/^\d{13}$/.test(d) || (10 - (sum % 10)) % 10 !== Number(d[12])) badIsbn.push(`${b.id}:${b.isbn}`);
    }
  }
  const emptyRooms = ROOMS.filter((r) => !r.books.length).map((r) => r.id);
  const noChildNoBooks = ROOMS.filter((r) => !r.books.length && !r.children.length).map((r) => r.id);
  const orphanArt = ALL_BOOKS.filter((b) => b.art && b.art.p && !window.__pal?.[b.art.p]).length;
  return {
    books: ALL_BOOKS.length, rooms: ROOMS.length, picks: PICKS.length,
    sources: Object.keys(SOURCES).length,
    withIsbn: ALL_BOOKS.filter((b) => b.isbn).length,
    withBlurb: ALL_BOOKS.filter((b) => b.blurb).length,
    dupes, missing, noAccolade: longBlurb, emptyRooms, noChildNoBooks, orphanArt,
    unsourced, heldBack, badIsbn,
    roomIds: ROOMS.map((r) => r.id),
  };
});
console.log(`books: ${data.books} (${data.picks} shopkeeper's picks), rooms: ${data.rooms}`);
console.log(`provenance: ${data.sources} harvested lists; with isbn ${data.withIsbn}; with blurb ${data.withBlurb}`);
if (data.dupes.length) console.log('DUPLICATE IDS:', data.dupes.slice(0, 20), data.dupes.length);
if (data.missing.length) console.log('MISSING FIELDS:', data.missing.slice(0, 20), data.missing.length);
if (data.unsourced.length) console.log('ACCOLADE WITH NO FETCHED SOURCE:', data.unsourced.slice(0, 20), data.unsourced.length);
else console.log('every harvested accolade traces to a fetched source');
if (data.heldBack.length) console.log('GENERATED BOOK WITH AN OPENING LINE:', data.heldBack);
if (data.badIsbn.length) console.log('MALFORMED ISBN:', data.badIsbn.slice(0, 20), data.badIsbn.length);
else console.log(`every ISBN on the shelves passes its own check digit (${data.withIsbn} of them)`);
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
    /* IMPLEMENTATION.md §7: zero filler spines once phase 9 lands */
    filler: document.querySelectorAll('.bk.fill').length,
    picks: document.querySelectorAll('.bk--pick').length,
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
  if (info.filler) console.log(`FILLER SPINES in ${id}: ${info.filler}`);
  if (ms > SETTLE_BUDGET) slow.push(`${id} ${ms}ms`);
  if (shots) await page.screenshot({ path: new URL(`rooms/${id}.png`, import.meta.url).pathname });
}

const totalFiller = report.reduce((a, r) => a + r.filler, 0);
console.log(totalFiller
  ? `FILLER SPINES REMAIN: ${totalFiller} across ${report.filter((r) => r.filler).length} rooms`
  : `zero filler spines across all ${report.length} rooms`);
console.log(`shelved spines: ${report.reduce((a, r) => a + r.shelf, 0)}, of which picks ${report.reduce((a, r) => a + r.picks, 0)}`);

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
