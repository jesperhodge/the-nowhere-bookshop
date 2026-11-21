/* ============================================================
   The contrast guarantee, productionised (PLAN-CONTRAST.md).

   Two independent checks share this module, and they check two
   different things:

   1. STATIC — pure arithmetic, no browser. For every plate this project
      draws behind on-canvas text, read its *declared* alpha straight out
      of the CSS source and solve for the alpha a worst-case-white scene
      would need to still clear the WCAG bar for the text token it backs.
      Assert declared ≥ required. This is the check that actually
      prevents regressions: it fails the moment someone lightens a plate,
      with no browser, no screenshot, no camera pose to get lucky on.

   2. DYNAMIC — a real browser, a real render. Hides every text overlay,
      screenshots the true backdrop, and measures the worst pixel any
      glyph could land on. This is what catches the surface nobody
      remembered to put on a plate at all — the static check only ever
      knows about the plates listed in STATIC_PLATES below.

   Both matter for the reason PLAN-CONTRAST.md gives: the arithmetic one
   proves the design is sound, the rendered one catches what the design
   forgot.
   ============================================================ */

import fs from 'node:fs';
import { PNG } from 'pngjs';

/* ── shared colour maths (WCAG 2.x relative luminance / contrast) ── */
export const srgbToLin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const luminance = (r, g, b) => 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
export const contrastRatio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

export function hexToRgb(hex) {
  const h = hex.trim().replace('#', '');
  if (h.length === 3) {
    const [r, g, b] = h.split('');
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/* α at which a plate P, alpha-blended under a worst-case PURE WHITE scene
   (the scene's own supremum — see PLAN-CONTRAST.md "the arithmetic that
   makes it a guarantee"), still clears `need` against text colour T. */
export function worstCaseRatio(textRgb, plateRgb, alpha, sceneRgb = [255, 255, 255]) {
  const bg = plateRgb.map((p, i) => alpha * p + (1 - alpha) * sceneRgb[i]);
  return contrastRatio(luminance(...textRgb), luminance(...bg));
}
export function minAlphaFor(textRgb, plateRgb, need, sceneRgb = [255, 255, 255]) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (worstCaseRatio(textRgb, plateRgb, mid, sceneRgb) >= need) hi = mid; else lo = mid;
  }
  return hi;
}

/* WCAG's "large text" carve-out: ≥24px, or ≥18.66px (14pt) at bold (≥700). */
export function isLargeText(px, weight) {
  const w = Number(weight) || 400;
  return px >= 24 || (px >= 18.66 && w >= 700);
}
export function neededRatio(px, weight) { return isLargeText(px, weight) ? 3.0 : 4.5; }

/* ── static check ──────────────────────────────────────────────────
   One entry per (plate, text token, size class) actually in play over
   the canvas. Add to this list whenever a new plate goes up behind
   on-canvas text — that's the whole point of the check being a list
   rather than a scan: an entry you forgot to add is the one gap this
   check cannot see, same as the dynamic probe's selector list. */
export const STATIC_PLATES = [
  { file: 'src/styles/ui.css', selector: '.placard::after', token: 'brass', need: 4.5, of: 'placard kicker' },
  { file: 'src/styles/ui.css', selector: '.placard::after', token: 'paper', need: 3.0, of: 'placard name (large text)' },
  { file: 'src/styles/ui.css', selector: '.placard::after', token: 'ink-dim', need: 4.5, of: 'placard line' },
  { file: 'src/styles/ui.css', selector: '.placard::after', token: 'ink-dim', need: 4.5, of: 'placard count' },
  { file: 'src/styles/ui.css', selector: '.crumbs::after', token: 'ink-dim', need: 4.5, of: 'crumb (default)' },
  { file: 'src/styles/ui.css', selector: '.crumbs::after', token: 'brass', need: 4.5, of: 'crumb--now' },
  { file: 'src/styles/ui.css', selector: '.crumbs::after', token: 'ink-dim', need: 4.5, of: 'crumb separator' },
  { file: 'src/styles/ui.css', selector: '.dock__btn', token: 'ink-dim', need: 4.5, of: 'dock button label' },
  { file: 'src/styles/ui.css', selector: '.dock__btn', token: 'brass', need: 4.5, of: 'dock bell button' },
  { file: 'src/styles/ui.css', selector: '.tool', token: 'ink-dim', need: 4.5, of: 'tool label (idle)' },
  { file: 'src/styles/ui.css', selector: '.tool:hover', token: 'paper', need: 4.5, of: 'tool label (hover)' },
  { file: 'src/styles/ui.css', selector: '.hint', token: 'ink-dim', need: 4.5, of: 'shelf/paging hint' },
  { file: 'src/styles/ui.css', selector: '.tag', token: 'paper', need: 4.5, of: 'hover tag title' },
  { file: 'src/styles/ui.css', selector: '.tag', token: 'brass', need: 4.5, of: 'hover tag accolade' },
  { file: 'src/styles/ui.css', selector: '.tag', token: 'ink-dim', need: 4.5, of: 'hover tag extra' },
];

/* Tokens NEVER allowed as text colour over the canvas, no matter what
   plate backs them — --brass-soft needs .88 to clear 4.5:1 even on the
   .90 plate every rule above uses, and every other rule in the shop
   uses --ink-faint (needs ~.986, i.e. "just make the plate opaque",
   which stops reading as a plate at all). Retired per PLAN-CONTRAST.md;
   this list is what stops either from creeping back onto a canvas rule. */
export const RETIRED_ON_CANVAS_TOKENS = ['brass-soft', 'ink-faint'];

function parseTokens(rootCss) {
  const tokens = {};
  for (const m of rootCss.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) tokens[m[1]] = hexToRgb(m[2]);
  return tokens;
}

function findRuleBackground(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
  const re = new RegExp(escaped + '\\s*\\{([^}]*)\\}', 'g');
  for (const m of css.matchAll(re)) {
    const bg = m[1].match(/background:\s*rgba?\(([^)]+)\)/);
    if (bg) {
      const parts = bg[1].split(',').map((s) => parseFloat(s.trim()));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
  }
  return null;
}

/**
 * @param {string} rootDir repo root (STATIC_PLATES' file paths are relative to it)
 * @returns {{rows: object[], fails: object[]}}
 */
export function runStaticPlateChecks(rootDir) {
  const baseCss = fs.readFileSync(new URL('../src/styles/base.css', `file://${rootDir}/`), 'utf8');
  const tokens = parseTokens(baseCss);
  const cssCache = {};
  const rows = [];
  for (const check of STATIC_PLATES) {
    const css = cssCache[check.file] ||= fs.readFileSync(`${rootDir}/${check.file}`, 'utf8');
    const plate = findRuleBackground(css, check.selector);
    const textRgb = tokens[check.token];
    if (!plate || !textRgb) {
      rows.push({ ...check, ok: false, reason: !plate ? 'no rgba() background found for selector' : `unknown token --${check.token}` });
      continue;
    }
    const required = minAlphaFor(textRgb, [plate.r, plate.g, plate.b], check.need);
    const ratio = worstCaseRatio(textRgb, [plate.r, plate.g, plate.b], plate.a);
    rows.push({ ...check, ok: plate.a >= required - 1e-6, declaredAlpha: plate.a, requiredAlpha: required, ratio });
  }
  /* the retirement list: fail if a retired token is used as `color` in any
     rule this module knows is on-canvas (STATIC_PLATES' own selectors —
     it can only check what it's told about, same caveat as the list
     above). Belt-and-suspenders against the exact regression the plan
     calls out: brass-soft or ink-faint quietly coming back. */
  for (const check of STATIC_PLATES) {
    const css = cssCache[check.file];
    const re = new RegExp(check.selector.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
    for (const m of css.matchAll(re)) {
      for (const bad of RETIRED_ON_CANVAS_TOKENS) {
        if (new RegExp(`color:\\s*var\\(--${bad}\\)`).test(m[1])) {
          rows.push({ ...check, ok: false, reason: `uses retired on-canvas token --${bad}` });
        }
      }
    }
  }
  return { rows, fails: rows.filter((r) => !r.ok) };
}

/* ── dynamic probe ─────────────────────────────────────────────────
   Room- and pose-dependent: the backdrop these sit on is the live scene,
   which is exactly what the static check above cannot see. Ported from
   tools/_scratch-contrast.mjs (the phase's working prototype) with two
   changes: it runs over every selector this pass added or fixed, and it
   is a function the caller drives per room/pose rather than a
   fixed room list, so qa.mjs can walk all 50 rooms at more than one
   camera pose without a second copy of this logic. */
/* .dock__btn / .tool themselves are NOT probed directly: they are
   border-radius:999px pills with an icon, so their own axis-aligned
   getBoundingClientRect() rectangle includes the four corners the pill
   shape doesn't actually cover — real pixels, but pixels no plate ever
   claimed to paint and no glyph can ever land on. Scanning THAT box
   samples bare canvas in the corners and fails on a shape artifact, not
   a contrast defect (measured, before this fix: "3.02:1" on a button
   whose static plate check proves ≥6.5:1 wherever text can actually be).
   `> span` is the plain, unrounded label the button actually renders
   its text into — see index.html's dock/tool buttons, each a
   `<svg>` + `<span>` — so its bbox tightly wraps the glyphs the way
   .placard__kicker's already does with no shape to correct for. */
export const PROBE_SELECTORS = [
  '.placard__kicker', '.placard__name', '.placard__line', '.placard__count',
  '.crumb', '.crumb__sep', '.dock__btn > span', '.tool > span', '.hint',
];

/**
 * Measure every visible, enabled text run matching PROBE_SELECTORS against
 * its true backdrop, in the page's CURRENT state (room + camera pose).
 * Caller is responsible for having settled the page first.
 * @param {import('playwright').Page} page
 * @param {{room?: string, pose?: string}} [tag] recorded on every row, purely for reporting
 * @returns {Promise<object[]>}
 */
export async function measureContrast(page, tag = {}) {
  const targets = await page.evaluate((SEL) => {
    const out = [];
    for (const sel of SEL) for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[disabled]')) continue; // WCAG 1.4.3: disabled controls are exempt
      const t = (el.textContent || '').trim();
      if (!t) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      /* checkVisibility(), not a manual getComputedStyle(el) read: CSS
         `opacity` isn't inherited, so an ANCESTOR at opacity:0 (e.g. the
         placard's own body.is-close fade) leaves a leaf like
         .placard__kicker reporting its OWN computed opacity as "1" even
         though nothing is actually painted — checkVisibility's
         opacityProperty option walks the ancestor chain the way the
         renderer actually does. Missing this is exactly how the placard's
         intentional shelf/table-pose fade-out first showed up as a
         contrast "failure": measured mid-fade AND leaf-only-checked, so
         neither the timing fix nor a leaf opacity check alone catches it. */
      if (typeof el.checkVisibility === 'function'
        ? !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })
        : getComputedStyle(el).visibility === 'hidden') continue;
      const cs = getComputedStyle(el);
      out.push({
        sel, text: t.slice(0, 42), x: r.x, y: r.y, w: r.width, h: r.height,
        color: cs.color, size: parseFloat(cs.fontSize), weight: cs.fontWeight,
      });
    }
    return out;
  }, PROBE_SELECTORS);
  if (!targets.length) return [];

  await page.evaluate((SEL) => {
    window.__contrastHidden = [];
    for (const sel of SEL) for (const el of document.querySelectorAll(sel)) {
      window.__contrastHidden.push([el, el.style.visibility]);
      el.style.visibility = 'hidden';
    }
  }, PROBE_SELECTORS);
  await page.waitForTimeout(80);
  const shot = await page.screenshot({ type: 'png' });
  await page.evaluate(() => { for (const [el, v] of window.__contrastHidden) el.style.visibility = v; });

  const png = PNG.sync.read(shot);
  const rows = [];
  for (const t of targets) {
    const m = t.color.match(/[\d.]+/g);
    if (!m) continue;
    const tl = luminance(+m[0], +m[1], +m[2]);
    let worst = Infinity, worstBg = null;
    const x0 = Math.max(0, Math.floor(t.x)), x1 = Math.min(png.width, Math.ceil(t.x + t.w));
    const y0 = Math.max(0, Math.floor(t.y)), y1 = Math.min(png.height, Math.ceil(t.y + t.h));
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (png.width * y + x) << 2;
      const bl = luminance(png.data[i], png.data[i + 1], png.data[i + 2]);
      const r = contrastRatio(tl, bl);
      if (r < worst) { worst = r; worstBg = [png.data[i], png.data[i + 1], png.data[i + 2]]; }
    }
    if (worstBg === null) continue; // zero-area box after clamping to the viewport
    const need = neededRatio(t.size, t.weight);
    rows.push({ ...tag, sel: t.sel, text: t.text, size: Math.round(t.size), worst, need, pass: worst >= need, bg: worstBg });
  }
  return rows;
}
