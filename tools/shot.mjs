import { chromium } from 'playwright';

const [, , target = 'front', out = 'shot.png', w = '1600', h = '1000'] = process.argv;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`http://127.0.0.1:8099/#/${target}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
try { await page.click('#enter', { timeout: 1200 }); } catch {}
await page.waitForTimeout(1400);
await page.screenshot({ path: out });

const info = await page.evaluate(() => {
  const s = window.__shop;
  return s ? { room: s.state.room, books: s.STATS.books, rooms: s.STATS.rooms,
               shelfBooks: document.querySelectorAll('.bk[data-book]').length,
               fillers: document.querySelectorAll('.bk.fill').length,
               doors: document.querySelectorAll('.door3d').length } : { error: 'no __shop' };
});
console.log(JSON.stringify(info));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
