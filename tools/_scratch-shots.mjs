/* Scratch screenshot helper for the polish-sweep before/after check.
   Not committed. Usage: node tools/_scratch-shots.mjs <outdir> */
import { chromium } from 'playwright';
import fs from 'node:fs';

const outdir = process.argv[2] || '/tmp/shots';
fs.mkdirSync(outdir, { recursive: true });

const sizes = [
  { name: 'desktop-1400x880', w: 1400, h: 880 },
  { name: 'mobile-320x568', w: 320, h: 568 },
  { name: 'mobile-390x664', w: 390, h: 664 },
];

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function settle(page, id) {
  await page.waitForFunction((want) => {
    const s = window.__stage, r = window.__room, sh = window.__shop;
    if (!sh || sh.state.travelling) return false;
    if (want && sh.state.room !== want) return false;
    if (!sh.state.webgl) return true;
    return !!s && s.frame > 2 && !!r && r.isReady && !r.rig?.tweening;
  }, id || null, { timeout: 45000 }).catch(() => console.log('NEVER SETTLED:', id));
}

for (const { name, w, h } of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8099/#/front', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#enter', { state: 'attached' });
  await page.evaluate(() => document.getElementById('enter')?.click());
  await settle(page, 'front');
  await page.screenshot({ path: `${outdir}/${name}-front.png` });

  if (w <= 430) {
    const opened = await page.evaluate(() => {
      const btn = document.querySelector('#mirror button[data-book-id]');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (opened) {
      await page.waitForFunction(() => !document.getElementById('sheet').hidden, null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${outdir}/${name}-book.png` });
    }
  }
  await ctx.close();
}

await browser.close();
console.log('done:', outdir);
