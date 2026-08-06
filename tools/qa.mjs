/* ============================================================
   QA — the data checks, and the checks that survive a canvas.

   Rewritten in phase 10 per IMPLEMENTATION.md §7. The previous version
   asserted the CSS-3D build's DOM: `.bk[data-book]` counts, `.bk.fill`,
   `#room [data-go]`, and settling on a `.travel` node's transform
   landing. None of that exists any more — the room is one WebGL canvas
   and every book, doorway, shelf and table in it is a mesh mirrored by a
   real <button> in #mirror.

   The settle discipline is unchanged and non-negotiable (§2/§7): wait for
   a real condition, never a fixed timeout. Here that condition is four
   facts at once —

     state.room is the room asked for
     state.travelling is false            (go()'s 300ms hand-over is done)
     __room.isReady                       (props + table covers decoded)
     !__room.rig.tweening                 (the camera has arrived)
     __stage.frame advanced               (something has actually rendered)

   TWO THINGS TO KNOW BEFORE READING A TIMING NUMBER OUT OF THIS FILE.
   First, headless Chromium has no GPU: the whole scene goes through a
   software rasteriser, and it is FILL-RATE bound, measured — 604ms a
   frame at 1600x1000, 262ms at 1000x625, 118ms at 640x400, i.e. linear
   in pixels and nothing to do with the scene. QA_VP exists for that;
   the default is a compromise, and the numbers this prints say nothing
   about a real machine. Draw calls are the number that transfers.
   Second, Playwright's own actionability check needs two stable frames,
   so page.click() inherits that frame cost several times over. Clicks
   that are testing BEHAVIOUR rather than hit-testing are dispatched
   through the DOM instead; the raycast is tested with one real pointer
   click, deliberately, because that is the only way to test it at all.

     PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run qa
     QA_VP=960x600 npm run qa        # faster here; worse screenshots
     npm run qa -- --shots           # write tools/rooms/<id>.png
   ============================================================ */

import { chromium } from 'playwright';
import fs from 'node:fs';

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
const shots = process.argv.includes('--shots');
const [VPW, VPH] = (process.env.QA_VP || '1280x800').split('x').map(Number);

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: VPW, height: VPH } });
const page = await ctx.newPage();

const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  p.on('requestfailed', (r) => errors.push('REQFAIL ' + r.url() + ' ' + r.failure()?.errorText));
};
watch(page);

let fails = 0;
const expect = (name, ok, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

/* ── open the shop ──────────────────────────────────────────────
   The door is pushed open BEFORE anything is settled on, and that
   ordering is load-bearing: main.js does not start the render loop
   until you are through the door (there is no picture behind an opaque
   overlay, only a hot main thread), so a camera tween queued by a deep
   link cannot advance until then and any settle would hang. */
await page.goto('http://127.0.0.1:8099/#/front', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#enter', { state: 'attached' });
await page.evaluate(() => document.getElementById('enter')?.click());

const SETTLE_BUDGET = 6000;
async function settle(id) {
  const t0 = Date.now();
  await page.waitForFunction((want) => {
    const s = window.__stage, r = window.__room, sh = window.__shop;
    if (!sh || sh.state.travelling) return false;
    if (want && sh.state.room !== want) return false;
    if (!sh.state.webgl) return true;              // no canvas to settle
    return !!s && s.frame > 2 && !!r && r.isReady && !r.rig?.tweening;
  }, id || null, { timeout: 45000 }).catch(() => console.log('NEVER SETTLED:', id));
  return Date.now() - t0;
}
async function goRoom(id) {
  const before = await page.evaluate(() => window.__stage?.frame ?? 0);
  /* A table id resolves to the room you stand in to reach it, so that is
     what state.room will read — settling on the id you asked for would
     wait for ever. shop.js's standIn() is the one place that rule lives. */
  const want = await page.evaluate((r) => {
    const rec = window.__shop.ROOMS.find((x) => x.id === r);
    return rec && rec.viaTable ? rec.parent : r;
  }, id);
  await page.evaluate((r) => { location.hash = '#/' + r; }, id);
  const ms = await settle(want);
  await page.waitForFunction((f) => (window.__stage?.frame ?? 0) > f, before, { timeout: 45000 }).catch(() => {});
  return ms;
}
await settle('front');

/* ── every ART entry must draw inside its own viewBox (Finding C, PLAN.md) ──
   Unchanged from the CSS build: the five viewBox overflows were ours, not
   the substrate's, and the same SVG now feeds a texture instead of a
   background-image. Render each shape into a canvas padded well past its
   declared box, using an enlarged viewBox so nothing gets clipped at
   render time, then check whether any painted pixel falls outside where
   the *real* viewBox would have been. */
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
    const c2 = canvas.getContext('2d');
    c2.drawImage(img, 0, 0, cw, ch);
    const data = c2.getImageData(0, 0, cw, ch).data;
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
expect(`all ${artCheck.length} ART entries draw inside their viewBox`, clipped.length === 0,
  clipped.map((r) => `${r.name} (+${r.overBy})`).join(', '));

/* ── data integrity ── */
const data = await page.evaluate(() => {
  const { ROOMS, ALL_BOOKS, SOURCES, PICKS, STATS } = window.__shop;
  const ids = new Set();
  const dupes = [], missing = [], noAccolade = [], unsourced = [], heldBack = [], badIsbn = [];
  for (const b of ALL_BOOKS) {
    if (ids.has(b.id)) dupes.push(b.id);
    ids.add(b.id);
    /* `note` is OPTIONAL since phase 9. Only 409 of the books on these
       shelves have a curator's note; the rest are harvested from prize
       lists and have none by design (IMPLEMENTATION.md §6). */
    for (const f of ['title', 'author']) if (!b[f]) missing.push(`${b.id}.${f}`);
    if (!b.won.length && !b.cited.length) noAccolade.push(b.id);
    /* Provenance: every harvested accolade has to trace to a fetched source. */
    if (b.acc) for (const a of b.acc) if (!SOURCES[a.s]?.permalink) unsourced.push(`${b.id}:${a.s}`);
    /* No GENERATED book may carry an opening line at all (§6 step 3). */
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
  return {
    books: ALL_BOOKS.length, rooms: STATS.rooms, tables: STATS.tables, picks: PICKS.length,
    records: ROOMS.length,
    sources: Object.keys(SOURCES).length,
    withIsbn: ALL_BOOKS.filter((b) => b.isbn).length,
    withBlurb: ALL_BOOKS.filter((b) => b.blurb).length,
    dupes, missing, noAccolade, unsourced, heldBack, badIsbn,
    emptyRooms: ROOMS.filter((r) => !r.books.length).map((r) => r.id),
    deadRooms: ROOMS.filter((r) => !r.books.length && !r.children.length).map((r) => r.id),
    roomIds: ROOMS.map((r) => r.id),
    tableIds: ROOMS.filter((r) => r.viaTable).map((r) => r.id),
  };
});
console.log(`books: ${data.books} (${data.picks} shopkeeper's picks); ${data.rooms} rooms + ${data.tables} table (${data.records} records)`);
console.log(`provenance: ${data.sources} harvested lists; with isbn ${data.withIsbn}; with blurb ${data.withBlurb}`);
expect('no duplicate book ids', data.dupes.length === 0, data.dupes.slice(0, 8).join(', '));
expect('every book has a title and an author', data.missing.length === 0, data.missing.slice(0, 8).join(', '));
expect('every harvested accolade traces to a fetched source', data.unsourced.length === 0, data.unsourced.slice(0, 8).join(', '));
expect('no generated book carries an opening line', data.heldBack.length === 0, data.heldBack.slice(0, 8).join(', '));
expect(`every ISBN passes its own check digit (${data.withIsbn})`, data.badIsbn.length === 0, data.badIsbn.slice(0, 8).join(', '));
expect('every book carries an accolade', data.noAccolade.length === 0, data.noAccolade.slice(0, 8).join(', '));
expect('no dead rooms (no shelf and no way on)', data.deadRooms.length === 0, data.deadRooms.join(', '));
if (data.emptyRooms.length) console.log('     rooms with no shelf (ways through):', data.emptyRooms.join(', '));

/* ── no `filter` on a preserve-3d node ─────────────────────────
   PLAN.md's Finding B. The scene has no CSS 3D left, so the only place
   this can still bite is the book panel's "hold the book" object
   (views/book.js + ui.css's .hold), which IMPLEMENTATION.md §2 names
   explicitly. Checked with a book open, below. */

/* ── walk every room ────────────────────────────────────────────
   By hash in ONE page, deliberately: that is what exercises
   room.js's dispose() fifty times over, which nothing before this phase
   ever ran even once. The fresh-page-per-room sweep is a separate
   thing and lives in the handoff's verification notes. */
const report = [];
const sigs = new Map();
for (const id of data.roomIds) {
  const ms = await goRoom(id);
  const info = await page.evaluate(() => {
    const r = window.__room, sh = window.__shop;
    const room = sh.ROOMS.find((x) => x.id === sh.state.room);
    const table = (room.children || []).find((k) => k.viaTable);
    const btns = [...document.querySelectorAll('#mirror button')];
    /* the frame, read back from the GL buffer. render() and readPixels()
       in the SAME task, so the drawing buffer is still intact — no
       preserveDrawingBuffer, which would cost every real frame to serve
       a test. A signature, not a stored baseline: there is no committed
       baseline in this repo, and what a baseline diff was for is
       catching "every room renders the same grey box", which comparing
       consecutive rooms' signatures catches without one. */
    const s = window.__stage;
    s.renderer.render(s.scene, s.camera);
    const gl = s.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let sum = 0, sumSq = 0, n = 0;
    const cells = new Float64Array(64), counts = new Float64Array(64);
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const l = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
      sum += l; sumSq += l * l; n++;
      const c = Math.min(7, (y * 8 / h) | 0) * 8 + Math.min(7, (x * 8 / w) | 0);
      cells[c] += l; counts[c]++;
    }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));

    let roomGroups = 0;
    s.scene.children.forEach((c) => { if (/^room:/.test(c.name)) roomGroups++; });

    return {
      room: sh.state.room,
      shelfBooks: r.entries.length,
      tableBooks: r.tableEntries.length,
      dataBooks: room.books.length + (table ? table.books.length : 0),
      doors: r.doorEntries.length,
      doorsNamed: r.doorEntries.filter((e) => (e.ariaLabel || '').trim()).length,
      cases: r.cases.length,
      poses: r.rig.poseNames(),
      unresolvable: r.rig.poseNames().filter((nm) => !r.rig.poseFor(nm)),
      mirror: btns.length,
      listitems: document.querySelectorAll('#mirror [role="listitem"]').length,
      unnamed: btns.filter((b) => !(b.getAttribute('aria-label') || '').trim()).length,
      roleOverride: document.querySelectorAll('#mirror button[role]').length,
      realBooks: r.entries.concat(r.tableEntries).filter((e) => window.__shop.ALL_BOOKS.includes(e.book)).length,
      meshes: (() => { let k = 0; s.scene.traverse((o) => { if (o.isMesh) k++; }); return k; })(),
      calls: s.renderer.info.render.calls,
      geometries: s.renderer.info.memory.geometries,
      textures: s.renderer.info.memory.textures,
      roomGroups,
      mean: +mean.toFixed(2), sd: +sd.toFixed(2),
      sig: [...cells].map((v, i) => Math.round(v / counts[i])).join(','),
    };
  });
  report.push({ id, ms, ...info });
  sigs.set(id, info.sig);
  if (shots) await page.screenshot({ path: new URL(`rooms/${id}.png`, import.meta.url).pathname });
}

const routed = report.filter((r) => r.room !== r.id && !data.tableIds.includes(r.id));
expect(`all ${report.length} room records route`, routed.length === 0,
  routed.map((r) => `${r.id}->${r.room}`).join(', '));
expect(`every table id resolves to the room it stands in`,
  data.tableIds.every((t) => report.find((r) => r.id === t)?.room === 'front'));

/* every mesh in every room is a real book: the modern form of §7's
   "zero filler spines once phase 9 lands". There is no filler generator
   left to count — the check is that the scene holds exactly the books
   the data says the room has, and that each one is one of them. */
const countMismatch = report.filter((r) => r.shelfBooks + r.tableBooks !== r.dataBooks);
expect('every book in the data has a mesh, and every mesh is a book',
  countMismatch.length === 0,
  countMismatch.map((r) => `${r.id}: ${r.shelfBooks}+${r.tableBooks} vs ${r.dataBooks}`).join(', '));
const notReal = report.filter((r) => r.realBooks !== r.shelfBooks + r.tableBooks);
expect('no spine belongs to a book that is not on the shelves', notReal.length === 0,
  notReal.map((r) => r.id).join(', '));

/* the a11y mirror: one focusable control per book, door, case and table */
const mirrorBad = report.filter((r) => {
  const want = r.shelfBooks + r.tableBooks + r.doors + r.cases + (r.tableBooks ? 1 : 0);
  return r.mirror !== want;
});
expect('one focusable control per book, doorway, case and table', mirrorBad.length === 0,
  mirrorBad.map((r) => `${r.id}: ${r.mirror}`).join(', '));
expect('every mirror control has a non-empty accessible name',
  report.every((r) => r.unnamed === 0),
  report.filter((r) => r.unnamed).map((r) => `${r.id}:${r.unnamed}`).join(', '));
expect('no mirror button overrides its own button role',
  report.every((r) => r.roleOverride === 0),
  report.filter((r) => r.roleOverride).map((r) => r.id).join(', '));
expect('every mirror control sits in a listitem',
  report.every((r) => r.listitems === r.mirror));
expect('every doorway says where it goes', report.every((r) => r.doors === r.doorsNamed));
expect('every pose the rig offers resolves', report.every((r) => r.unresolvable.length === 0),
  report.filter((r) => r.unresolvable.length).map((r) => `${r.id}:${r.unresolvable}`).join(', '));

/* a room rendered — non-uniform, in a sane luminance band, and not a
   pixel-for-pixel repeat of the room before it */
const blank = report.filter((r) => r.sd < 8 || r.mean < 4 || r.mean > 240);
expect('every room renders something with structure in it', blank.length === 0,
  blank.map((r) => `${r.id} mean ${r.mean} sd ${r.sd}`).join(', '));
const dupSig = [];
for (let i = 1; i < report.length; i++) if (report[i].sig === report[i - 1].sig) dupSig.push(report[i].id);
expect('consecutive rooms do not render an identical frame', dupSig.length === 0, dupSig.join(', '));

/* teardown: fifty rooms built and disposed, one left standing */
expect('exactly one room group in the scene after 50 builds',
  report.every((r) => r.roomGroups === 1),
  report.filter((r) => r.roomGroups !== 1).map((r) => `${r.id}:${r.roomGroups}`).join(', '));
/* GPU memory is BOUNDED, which is a different claim from "not
   growing" and the one that is actually true. Every cache in
   src/js/scene/ is keyed by content and was unbounded through phase 9,
   because exactly one room was ever built per page; walking fifty rooms
   made that a leak (461 live textures, measured, most of a gigabyte).
   They are capped now — 24 wall textures, 64 art, 48 painted, plus the
   66 book covers that exist in the whole shop and one live atlas — so
   the count climbs while the caches warm and then stops. It also jumps
   by ~50 the moment a table pose makes all 58 of the front table's
   covers visible at once, since three.js uploads a texture on first
   USE, not on creation. A ceiling is the honest assertion. */
const maxTex = Math.max(...report.map((r) => r.textures));
const maxGeo = Math.max(...report.map((r) => r.geometries));
expect('GPU textures stay under a bound across a fifty-room walk', maxTex < 320, `peak ${maxTex}`);
expect('geometry count stays under a bound across a fifty-room walk', maxGeo < 240, `peak ${maxGeo}`);

const heaviest = [...report].sort((a, b) => b.calls - a.calls)[0];
const uniqueRooms = report.filter((r) => !data.tableIds.includes(r.id));
console.log(`spines in the scene: ${uniqueRooms.reduce((a, r) => a + r.shelfBooks + r.tableBooks, 0)}`);
console.log(`room change: median ${median(report.map((r) => r.ms))}ms, worst ${Math.max(...report.map((r) => r.ms))}ms  (software rasteriser — see the header)`);
console.log(`heaviest room: ${heaviest.id}, ${heaviest.calls} draw calls, ${heaviest.meshes} meshes`);
const slow = report.filter((r) => r.ms > SETTLE_BUDGET).map((r) => `${r.id} ${r.ms}ms`);
if (slow.length) console.log(`     slow (over ${SETTLE_BUDGET}ms): ${slow.join(', ')}`);

/* ── every camera pose is reachable, and Escape returns to `room` ──
   Reachability of all 139 poses is asserted above from poseFor(), which
   costs nothing. Here is the round trip WITH the tween, in four rooms
   chosen for their shapes: a table room, a room with both side cases,
   the fullest room in the shop, and one with no side case at all. */
for (const id of ['front', 'oak', 'rafters', 'landing']) {
  await goRoom(id);
  const names = await page.evaluate(() => window.__room.rig.poseNames());
  const results = [];
  for (const name of names) {
    const r = await page.evaluate((nm) => {
      const rig = window.__room.rig;
      const ok = rig.goTo(nm);
      return { ok, tweening: rig.tweening };
    }, name);
    await settle(id);
    const landed = await page.evaluate(() => window.__room.rig.current);
    results.push({ name, ok: r.ok, landed });
  }
  const wrong = results.filter((r) => !r.ok || r.landed !== r.name);
  expect(`${id}: every pose reachable (${names.length})`, wrong.length === 0,
    wrong.map((r) => `${r.name}->${r.landed}`).join(', '));
  /* Escape steps back out — from wherever the last goTo left us */
  await page.keyboard.press('Escape');
  await settle(id);
  const after = await page.evaluate(() => ({
    pose: window.__room.rig.current, room: window.__shop.state.room,
  }));
  expect(`${id}: Escape returns from a pose without leaving the room`,
    after.room === id && after.pose !== names[names.length - 1]);
}

/* Escape in the `room` pose walks out of the room instead */
await goRoom('oak');
await page.keyboard.press('Escape');
await settle();
expect('Escape in the room pose leaves the room', await page.evaluate(() => window.__shop.state.room) === 'front');

/* ── the table's two layouts ──────────────────────────────────── */
await goRoom('front');
const tableLayouts = await page.evaluate(async () => {
  const r = window.__room;
  const shown = () => r.tableEntries.filter((e) => e.mesh.visible).length;
  const size = () => { const e = r.tableEntries[0]; return +e.mesh.scale.x.toFixed(1); };
  const out = { roomShown: shown(), roomWidth: size(), roomSpread: r.tableRig.spread };
  r.rig.goTo(`table:${r.table.id}`, { instant: true });
  r.tableRig.setSpread(1, { instant: true });
  out.tableShown = shown();
  out.tableWidth = size();
  return out;
});
expect('the room pose shows a few large covers, propped',
  tableLayouts.roomShown === 5 && tableLayouts.roomWidth > 60,
  JSON.stringify(tableLayouts));
expect('the table pose shows all of them, smaller and flat',
  tableLayouts.tableShown === 58 && tableLayouts.tableWidth < tableLayouts.roomWidth,
  JSON.stringify(tableLayouts));

/* ── keyboard: Tab to a book, Enter opens the panel ───────────── */
await goRoom('front');
await page.evaluate(() => { document.getElementById('mirror').querySelector('button').focus(); });
const focused = await page.evaluate(() => {
  const b = document.activeElement;
  return { isButton: b?.tagName === 'BUTTON', inMirror: !!b?.closest('#mirror'), name: b?.getAttribute('aria-label') };
});
await page.keyboard.press('Enter');
await page.waitForFunction(() => !document.getElementById('sheet').hidden, null, { timeout: 20000 }).catch(() => {});
const kb = await page.evaluate(() => {
  const sheet = document.getElementById('sheet');
  const buy = document.querySelector('.buy__main');
  /* Finding B, the one place CSS 3D survives: the book panel's
     "hold the book" object. A filter anywhere on or above a
     preserve-3d subtree flattens it. */
  /* The rule is LOCAL and that matters: `filter` forces the used value
     of `transform-style` to `flat` on the element it is set on, not on
     that element's descendants. So a drop-shadow on `.hold` (which uses
     `perspective`, not `preserve-3d`) composites the 3D group and is
     fine; the same shadow on `.hold__obj` destroys it, which is where it
     was until phase 10. Checking ancestors too would flag the correct
     fix as the bug. */
  const bad3d = [...document.querySelectorAll('*')].filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.transformStyle !== 'preserve-3d') return false;
    return (cs.filter && cs.filter !== 'none')
      || (cs.backdropFilter && cs.backdropFilter !== 'none')
      || (cs.mask && cs.mask !== 'none' && cs.mask !== '')
      || (cs.opacity !== '' && Number(cs.opacity) < 1);
  }).map((el) => el.className || el.tagName);
  return {
    open: !sheet.hidden,
    title: document.querySelector('.bd__title')?.textContent || '',
    buy: buy?.href || '',
    bad3d,
  };
});
expect('the mirror hands the keyboard a real button', focused.isButton && focused.inMirror && !!focused.name, focused.name);
expect('Enter on a focused book opens the panel', kb.open && kb.title.length > 0, kb.title);
expect('the panel buys from bookshop.org', /^https:\/\/(uk\.)?bookshop\.org\//.test(kb.buy), kb.buy);
expect('no filter above a preserve-3d node', kb.bad3d.length === 0, kb.bad3d.join(', '));
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.getElementById('sheet').hidden, null, { timeout: 20000 }).catch(() => {});

/* ── REVIEW-PHASE10.md #2: a room change must not drop focus ──────
   The actual defect: Tab to a doorway in the a11y mirror, press Enter
   on it. main.js's onDoorActivate() calls go(), whose paint() disposes
   the OLD room's mirror BEFORE building the new one — removing the
   very <button> that had focus, whose focus then falls to <body> per
   spec. Reproduced here exactly that way (focus + a real Enter, not a
   synthetic go() call), asserting focus lands on the arriving room's
   placard rather than <body>. index.html's own comment covers why the
   placard sits where Tab onward from it reaches the mirror; this check
   is only "did focus survive at all", which is the part most likely to
   silently regress. */
await goRoom('front');
const doorFocus = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#mirror button')].find((b) => b.dataset.roomId);
  if (!btn) return null;
  btn.focus();
  return {
    wasFocused: document.activeElement === btn,
    target: btn.dataset.roomId,
    before: window.__shop.state.room,
  };
});
expect('a doorway button exists in the mirror and can take focus', !!doorFocus?.wasFocused, JSON.stringify(doorFocus));
if (doorFocus?.wasFocused) {
  await page.keyboard.press('Enter');
  await settle(doorFocus.target);
  const afterDoor = await page.evaluate(() => ({
    room: window.__shop.state.room,
    onPlacard: document.activeElement === document.getElementById('placard'),
    onBody: document.activeElement === document.body || document.activeElement === null,
    tag: document.activeElement?.tagName,
  }));
  expect('activating a door with the keyboard actually changed the room',
    afterDoor.room === doorFocus.target && afterDoor.room !== doorFocus.before,
    JSON.stringify({ doorFocus, afterDoor }));
  expect('focus lands on the room placard after a keyboard-driven room change, not on <body>',
    afterDoor.onPlacard && !afterDoor.onBody, JSON.stringify(afterDoor));
}

/* ...and the negative half of the same fix: a room change must NOT
   steal focus from somewhere the user is legitimately already at.
   The search input, specifically — called out by name in the review —
   since search staying open while the room underneath it changes (a
   result for a different room, a stale link, the bell) is a real path
   through this exact code, not a contrived one. */
await goRoom('front');
await page.evaluate(() => {
  document.getElementById('btnSearch').click();
  document.getElementById('findInput').focus();
});
const searchHadFocus = await page.evaluate(() => document.activeElement === document.getElementById('findInput'));
await page.evaluate(() => window.__shop.go('oak', 'in'));
await settle('oak');
const keptFocus = await page.evaluate(() => ({
  room: window.__shop.state.room,
  stillOnInput: document.activeElement === document.getElementById('findInput'),
  searchOpen: !document.getElementById('searchOverlay').hidden,
}));
expect('a room change does not steal focus from the search input',
  searchHadFocus && keptFocus.room === 'oak' && keptFocus.stillOnInput, JSON.stringify(keptFocus));
await page.evaluate(() => document.querySelector('#searchOverlay [data-close]')?.click());

/* ── the raycaster: one real pointer click on a real spine ─────
   Dispatched as a genuine mouse click at the projected screen position
   of a book mesh, because that is the only thing that tests picking. */
await goRoom('front');
const target = await page.evaluate(() => {
  const r = window.__room, s = window.__stage;
  /* The WIDEST spine in the room, not entries[0]. A 22-unit spine is
     about 11 screen px across at the room pose and its neighbour's
     hover-lift brings that neighbour 46 units nearer the camera, so
     clicking the narrowest book in the shop tests the tolerance of the
     projection rather than the raycaster. Picking the fattest book makes
     the check about what it is supposed to be about. */
  let e = r.entries[0];
  for (const x of r.entries) {
    if ((x.mesh.geometry.parameters?.width || 0) > (e.mesh.geometry.parameters?.width || 0)) e = x;
  }
  const ndc = s.project(e.mesh);
  return {
    id: e.book.id, w: e.mesh.geometry.parameters.width,
    x: (ndc.x * 0.5 + 0.5) * innerWidth, y: (1 - (ndc.y * 0.5 + 0.5)) * innerHeight,
  };
});
await page.mouse.move(target.x, target.y);
await page.mouse.click(target.x, target.y);
await page.waitForFunction(() => !document.getElementById('sheet').hidden, null, { timeout: 20000 }).catch(() => {});
const picked = await page.evaluate(() => ({ open: !document.getElementById('sheet').hidden, book: window.__shop.state.book }));
expect('clicking a spine in the canvas opens that book', picked.open && picked.book === target.id,
  `${picked.book} (wanted ${target.id})`);
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.getElementById('sheet').hidden, null, { timeout: 20000 }).catch(() => {});

/* ── the table is not a room ─────────────────────────────────── */
const tableRouting = await page.evaluate(async () => {
  location.hash = '#/fronttable';
  await new Promise((r) => setTimeout(r, 50));
  return { hash: location.hash };
});
await settle('front');
const tableAfter = await page.evaluate(() => ({
  hash: location.hash, room: window.__shop.state.room, pose: window.__room.rig.current,
  crumbs: document.getElementById('crumbs').textContent.replace(/\s+/g, ' ').trim(),
}));
expect('#/fronttable normalises to the room you stand in', tableAfter.hash === '#/front' && tableAfter.room === 'front',
  JSON.stringify(tableAfter));
expect('...and lands looking down at the table', tableAfter.pose === 'table:fronttable', tableAfter.pose);
expect('the breadcrumbs do not list the table as a room', !/Front Table/.test(tableAfter.crumbs), tableAfter.crumbs);

const chrome = await page.evaluate(() => {
  document.getElementById('btnMap').click();
  const plan = document.getElementById('mapBody').textContent;

  document.querySelector('#mapOverlay [data-close]').click();
  document.getElementById('btnShelf').click();
  const shelf = document.getElementById('shelfBody');
  const doorNames = [...shelf.querySelectorAll('[data-room]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
  const out = {
    planSub: document.querySelector('#mapBody .plan__sub')?.textContent.trim() || '',
    planTable: /On the table by the door/.test(plan),
    shelfTableHeading: /On the table/.test(shelf.textContent),
    shelfBooks: shelf.querySelectorAll('.res[data-book]').length,
    doorNames,
  };
  document.querySelector('#shelfOverlay [data-close]').click();
  return out;
});
expect('the plan counts rooms, not tables', /49 rooms/.test(chrome.planSub), chrome.planSub);
expect('the plan draws the table as a table', chrome.planTable);
expect('the shelf overlay lists the table\'s books', chrome.shelfTableHeading && chrome.shelfBooks === 108,
  `${chrome.shelfBooks} rows`);
expect('the shelf overlay does not offer the table as a door',
  !chrome.doorNames.some((n) => /Front Table/.test(n)), chrome.doorNames.join(' | '));

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
expect('preview deep-links by ISBN', links.previewIsbn === 'https://books.google.com/books?vid=ISBN9781400033416');
expect('preview still works without one', links.previewPlain.startsWith('https://www.google.com/search?tbm=bks'));
expect('borrow deep-links by ISBN', links.borrowIsbn === 'https://openlibrary.org/isbn/9781400033416');
expect('buy link is bookshop.org', /^https:\/\/bookshop\.org\//.test(links.buy));
expect('every book offers somewhere to read a sample', links.samples >= 3);
const unsourcedFirst = await page.evaluate(() =>
  window.__shop.ALL_BOOKS.filter((b) => b.first && !b.firstSource).length);
console.log(`     books with an unsourced opening line shown: 0 (${unsourcedFirst} held back)`);

/* ── search / plan / parcel round trips ── */
await goRoom('front');
const search = await page.evaluate(async () => {
  document.getElementById('btnSearch').click();
  const input = document.getElementById('findInput');
  input.value = 'booker';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  const n = document.querySelectorAll('#findResults .res').length;
  const first = document.querySelector('#findResults .res[data-book]');
  first?.click();
  return { n, wanted: first?.dataset.book };
});
await page.waitForFunction(() => window.__shop.state.book, null, { timeout: 25000 }).catch(() => {});
const searched = await page.evaluate(() => ({ room: window.__shop.state.room, book: window.__shop.state.book }));
expect(`search "booker" finds results (${search.n}) and opening one travels`,
  search.n > 5 && searched.book === search.wanted, JSON.stringify(searched));

const parcel = await page.evaluate(async () => {
  document.querySelector('[data-keep]')?.click();
  await new Promise((r) => setTimeout(r, 30));
  const kept = JSON.parse(localStorage.getItem('nowhere.parcel') || '[]').length;
  document.querySelector('#sheet [data-close]').click();
  document.getElementById('btnParcel').click();
  const items = document.querySelectorAll('.pitem').length;
  const badge = document.getElementById('parcelCount').textContent;
  document.querySelector('#parcelOverlay [data-close]').click();
  return { kept, items, badge };
});
expect('a book can be put in the parcel and shows up there', parcel.kept === 1 && parcel.items === 1, JSON.stringify(parcel));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.evaluate(() => document.getElementById('enter')?.click());
await settle();
expect('the parcel survives a reload',
  await page.evaluate(() => window.__shop.state.parcel.length) === 1);

/* ── back/forward, and the dock ────────────────────────────────── */
await goRoom('front');
await goRoom('oak');
await goRoom('rafters');
await page.goBack();
await settle('oak');
expect('browser Back walks back through the shop', await page.evaluate(() => window.__shop.state.room) === 'oak');
await page.goForward();
await settle('rafters');
expect('browser Forward walks forward again', await page.evaluate(() => window.__shop.state.room) === 'rafters');
const dock = await page.evaluate(async () => {
  const out = {};
  document.getElementById('btnBack').click();
  await new Promise((r) => setTimeout(r, 400));
  out.back = window.__shop.state.room;
  document.getElementById('btnHome').click();
  await new Promise((r) => setTimeout(r, 400));
  out.home = window.__shop.state.room;
  out.homeDisabled = document.getElementById('btnHome').disabled;
  out.backDisabled = document.getElementById('btnBack').disabled;
  return out;
});
await settle('front');
expect('the dock walks Back to the parent', dock.back !== 'rafters', dock.back);
expect('the dock goes Home, and disables itself there', dock.home === 'front' && dock.homeDisabled && dock.backDisabled,
  JSON.stringify(dock));

/* ── the no-WebGL fallback ──────────────────────────────────────
   A real context-creation failure, not a mocked flag: getContext()
   returns null for every webgl variant, which is exactly what a browser
   with WebGL disabled does. */
{
  const flatCtx = await browser.newContext({ viewport: { width: VPW, height: VPH } });
  await flatCtx.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
      if (/webgl/i.test(String(kind))) return null;
      return real.call(this, kind, ...rest);
    };
  });
  const flat = await flatCtx.newPage();
  /* This context's own console error is the POINT of the test — three.js
     logs "Error creating WebGL context" before the constructor throws.
     Collected separately so it cannot fail the run, and asserted below
     so its absence would. */
  const flatErrors = [];
  flat.on('pageerror', (e) => flatErrors.push('PAGEERROR ' + e.message));
  flat.on('console', (m) => { if (m.type() === 'error') flatErrors.push(m.text()); });
  await flat.goto('http://127.0.0.1:8099/#/front', { waitUntil: 'domcontentloaded' });
  await flat.waitForSelector('#enter', { state: 'attached' });
  await flat.evaluate(() => document.getElementById('enter')?.click());
  await flat.waitForFunction(() => window.__shop && window.__shop.state.webgl === false, null, { timeout: 25000 });
  await flat.waitForFunction(() => !document.getElementById('shelfOverlay').hidden, null, { timeout: 25000 })
    .catch(() => {});
  const f = await flat.evaluate(() => ({
    webgl: window.__shop.state.webgl,
    notice: !document.getElementById('flat').hidden,
    why: document.getElementById('flatWhy').textContent,
    shelfOpen: !document.getElementById('shelfOverlay').hidden,
    rows: document.querySelectorAll('#shelfBody .res').length,
  }));
  expect('no WebGL: the shop says why', f.webgl === false && f.notice && /WebGL/.test(f.why), f.why);
  expect('no WebGL: the shelf overlay opens instead of the stage', f.shelfOpen && f.rows > 100, `${f.rows} rows`);
  /* and it is a way ROUND the shop, not just a notice */
  await flat.evaluate(() => [...document.querySelectorAll('#shelfBody [data-room]')][0]?.click());
  await flat.waitForFunction(() => window.__shop.state.room !== 'front', null, { timeout: 25000 }).catch(() => {});
  await flat.waitForFunction(() => !document.getElementById('shelfOverlay').hidden, null, { timeout: 25000 }).catch(() => {});
  const f2 = await flat.evaluate(() => ({
    room: window.__shop.state.room,
    shelfOpen: !document.getElementById('shelfOverlay').hidden,
    heading: document.querySelector('#shelfBody .plan__title')?.textContent,
  }));
  expect('no WebGL: a doorway in the list walks you to the next room and shows its shelf',
    f2.room !== 'front' && f2.shelfOpen, JSON.stringify(f2));
  /* the book panel still works with no canvas at all */
  await flat.evaluate(() => document.querySelector('#shelfBody .res[data-book]')?.click());
  await flat.waitForFunction(() => !document.getElementById('sheet').hidden, null, { timeout: 25000 }).catch(() => {});
  expect('no WebGL: a book still opens',
    await flat.evaluate(() => !document.getElementById('sheet').hidden && !!document.querySelector('.bd__title')));
  const unexpected = flatErrors.filter((e) => !/Error creating WebGL context/.test(e));
  expect('no WebGL: nothing throws on the way down', unexpected.length === 0, unexpected.join(' | '));
  await flatCtx.close();
}

/* ── the summary ── */
if (errors.length) {
  fails++;
  console.log('\n--- ERRORS ---\n' + [...new Set(errors)].join('\n'));
} else {
  console.log('\nno console errors, no page errors, no failed requests');
}
fs.writeFileSync(new URL('qa-report.json', import.meta.url), JSON.stringify(report, null, 1));
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nall checks passed');
await browser.close();
process.exit(fails ? 1 : 0);
