#!/usr/bin/env node
/* ============================================================
   Phase 9: harvest → enrich → shelve.  IMPLEMENTATION.md §6.

     NODE_USE_ENV_PROXY=1 node tools/harvest.mjs fetch    [--force] [slug…]
     NODE_USE_ENV_PROXY=1 node tools/harvest.mjs enrich   [--limit N]
                                node tools/harvest.mjs shelve
                                node tools/harvest.mjs report

   NODE_USE_ENV_PROXY=1 is not optional on some boxes and is
   harmless everywhere: Node's built-in fetch ignores https_proxy
   without it and fails with a flat 403 that reads exactly like an
   auth error. IMPLEMENTATION.md §8.2 calls it the single most
   expensive trap in this repo. Do not remove it from the npm
   scripts.

   ── The rule this file exists to enforce ──────────────────────
   A title, an author and an accolade may only come from a
   document that was actually fetched, and the fetched document's
   URL and revision are written into the committed data beside
   them. Nothing is reconstructed from memory. A list that will
   not fetch or will not parse is skipped and counted — see
   `report` — because a plausible wrong shortlist is worse than a
   missing one: after this session nobody can tell them apart.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LISTS, LIST_BY_SLUG } from './lists.js';
import { tablesIn, tableHeadings, cellText } from './wikitable.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LISTS_DIR = path.join(ROOT, 'data/lists');
const WIKI_CACHE = path.join(ROOT, 'data/cache/wiki');

const UA = 'the-nowhere-bookshop/1.0 (a curated bookshop site; contact jesperhodge@gmail.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(3);
const flag = (name) => args.includes(name);
const opt = (name, d) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : d; };
const rest = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));

/* ── text helpers ──────────────────────────────────────────── */

export const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Comparison key for "is this the same book": title without a leading
    article or a subtitle, plus the first author's surname. */
export const bookKey = (title, author) => {
  const t = norm(title).replace(/^(the|a|an) /, '').replace(/ (a novel|a memoir|stories|poems)$/, '');
  const a = norm(author).split(' ').filter(Boolean);
  return `${t}|${a[a.length - 1] || ''}`;
};

const YEAR_RE = /\b(1[89]\d{2}|20[0-4]\d)\b/;
const yearOf = (s) => { const m = YEAR_RE.exec(String(s || '')); return m ? Number(m[1]) : null; };

/** Junk that a table cell can legitimately hold and a book cannot. */
const DEAD = /^(not awarded|no award|no prize|none|n\/?a|tba|tbd|unknown|withheld|not presented|—|–|-{1,3}|\?)$/i;

/** Winner marks that survive into the rendered text and must not survive
    into a title: `Girl Genius, Volume 8*`, `Colin Dexter ‡`. */
const MARKS = /[\s]*[*‡†]+\s*$/;

function usableCell(cell, max = 190) {
  if (!cell || cell.colspan > 1) return null;
  const t = cellText(cell.raw).replace(MARKS, '').trim();
  if (!t || t.length < 2 || t.length > max) return null;
  if (DEAD.test(t)) return null;
  if (!/[A-Za-zÀ-ʯ]/.test(t)) return null;
  return t;
}

/* ── column roles, detected from the header row ─────────────── */

const ROLE_RULES = [
  ['year', /^year/i],
  ['result', /^(results?|outcomes?|status|award|prize)$/i],
  ['category', /^categor/i],
  ['translator', /^translators?\b/i],
  ['title', /\b(titles?|novels?|works?|books?|novellas?|albums?|collections?|publications?|stor(y|ies))\b/i],
  ['author', /\b(authors?|writers?|poets?|nominees?|recipients?|creators?|winners?|artists?|editors?)\b/i],
];

function detectRoles(headerRow, overrides = {}) {
  const roles = {};
  const texts = headerRow.map((c) => cellText(c.raw));
  /* explicit overrides win, matched on the header's own words */
  for (const [role, want] of Object.entries(overrides)) {
    const i = texts.findIndex((t) => t.toLowerCase() === String(want).toLowerCase());
    if (i > -1) roles[role] = i;
  }
  for (let i = 0; i < texts.length; i++) {
    if (Object.values(roles).includes(i)) continue;
    for (const [role, re] of ROLE_RULES) {
      if (roles[role] !== undefined) continue;
      if (re.test(texts[i])) { roles[role] = i; break; }
    }
  }
  return { roles, texts };
}

/** The header row of a grid: the first row that is mostly header cells and
    holds no year. A `!scope="row"` year cell is a header cell too, which is
    exactly why "mostly" is not "any". */
function headerRowOf(grid) {
  for (let i = 0; i < Math.min(3, grid.length); i++) {
    const row = grid[i];
    if (!row.length) continue;
    const heads = row.filter((c) => c.head).length;
    const anyYear = row.some((c) => YEAR_RE.test(cellText(c.raw)));
    if (heads >= Math.max(2, row.length - 1) && !anyYear) return i;
  }
  return -1;
}

/* ── result → accolade kind ─────────────────────────────────── */

const CITE_RE = /(shortlist|short.?list|finalist|nominee|nominated|longlist|long.?list|runner|honou?r|commend|special|citation|silver|bronze|second|third|selected)/i;
const WIN_RE = /(winner|won\b|^win$|^gold$|recipient|awarded|laureate)/i;

/** Shortlist beats winner: "Category winner" is a win, "Shortlisted" is not,
    and a cell that says both is the safer of the two. */
function kindFromResult(t) {
  const s = String(t || '').trim();
  if (!s) return null;
  if (CITE_RE.test(s)) return 'c';
  if (WIN_RE.test(s)) return 'w';
  return null;
}

/* ── which row is the winner, when no column says so ───────────
   Five conventions are in use across these pages and no single one
   is reliable:  `*` after the name (Hugo, Nebula, Clarke),
   `{{double dagger}}` (CWA), `{{blue ribbon}}` (Goldsmiths),
   `'''bold'''` (Pulitzer, Philip K. Dick) and a highlighted cell
   background (most of them, in several colours).

   So the signal is chosen *per table*, by whether it discriminates:
   a mark that appears on every row of a winners-only list says
   nothing, and a mark that appears on none of them says nothing
   either. Only a mark carried by a minority of rows is a winner
   mark. Getting this wrong is not cosmetic — before this was in,
   `allWinners` alone made 240 CWA shortlistings into 240 Gold
   Dagger wins, which is precisely the fabricated accolade §6 exists
   to retire. */
const SIGNALS = [
  ['star', (r) => MARKS.test(cellText(r.titleCell.raw)) || MARKS.test(cellText(r.authorCell.raw))],
  ['dagger', (r) => /\{\{\s*(double[ _]?)?dagger|‡/i.test(r.titleCell.raw + r.authorCell.raw)],
  ['ribbon', (r) => /\{\{\s*blue[ _]?ribbon/i.test(r.titleCell.raw + r.authorCell.raw)],
  ['bold', (r) => /'''/.test(r.titleCell.raw) || /'''/.test(r.authorCell.raw)],
  ['bg', (r) => /background\s*:/i.test(
    r.titleCell.attrs + r.authorCell.attrs + r.titleCell.rowAttrs + r.authorCell.rowAttrs)],
];

/* `bg` gets a tighter band than the explicit marks: a highlight is also how
   some pages do zebra striping, and a stripe covers about half the rows. */
const BAND = { bg: [0.02, 0.6], default: [0, 0.9] };

function pickSignal(rows) {
  for (const [name, test] of SIGNALS) {
    const n = rows.filter(test).length;
    const [lo, hi] = BAND[name] || BAND.default;
    if (n > rows.length * lo && n > 0 && n < rows.length * hi) return { name, test };
  }
  return null;
}

/** How a shortlisting reads on the shelf, matching the existing 409's style. */
export function accoladeLabel(prize, kind, year) {
  const y = year ? `, ${year}` : '';
  return kind === 'w' ? `${prize}${y}` : `${prize} shortlist${y}`;
}

/* ── authors ───────────────────────────────────────────────── */

function tidyAuthor(t) {
  let s = t.replace(MARKS, '').replace(/\s*\((chair|editor|ed\.|translator|trans\.|tie|joint)\)\s*$/i, '');
  s = s.replace(/\s*\((novelist|author|writer|poet|.*?born \d{4})\)\s*$/i, '');
  s = s.replace(/\s+&\s+|\s+and\s+|\s*\/\s*|\s*,\s+and\s+/g, ' & ');
  const parts = s.split(' & ').map((p) => p.trim()).filter(Boolean);
  if (parts.length > 3) return `${parts[0]} and others`;
  return parts.join(' & ');
}

function tidyTitle(t) {
  return t
    .replace(MARKS, '')
    .replace(/\s*\((novel|novella|book|comics|series|memoir|poetry collection|graphic novel)\)\s*$/i, '')
    /* the comics lists put the publisher in the title cell, in brackets:
       "Love and Rockets (Fantagraphics)" */
    .replace(/\s*\([^()]*\b(comics?|press|books?|publishing|entertainment|studios?|imprint|manga|media)\b[^()]*\)\s*$/i, '')
    .replace(/\s*\[\d+\]\s*$/, '').replace(/\s*\(also known as[^)]*\)\s*/i, ' ')
    .replace(/\s+/g, ' ').trim();
}

/* ── wikipedia ─────────────────────────────────────────────── */

async function wikitextOf(page, force) {
  fs.mkdirSync(WIKI_CACHE, { recursive: true });
  const file = path.join(WIKI_CACHE, page.replace(/[^\w]+/g, '_').slice(0, 120) + '.json');
  if (!force && fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* refetch */ }
  }
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}`
    + '&prop=wikitext|revid&format=json&formatversion=2&redirects=1';
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`${j.error.code}: ${j.error.info}`);
  const rec = {
    page: j.parse.title,
    revid: j.parse.revid,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(j.parse.title.replace(/ /g, '_'))}`,
    permalink: `https://en.wikipedia.org/w/index.php?oldid=${j.parse.revid}`,
    fetchedAt: new Date().toISOString(),
    wikitext: j.parse.wikitext,
  };
  fs.writeFileSync(file, JSON.stringify(rec));
  await sleep(300);
  return rec;
}

/* ── parse one list ────────────────────────────────────────── */

function parseList(cfg, rec) {
  const grids = tablesIn(rec.wikitext);
  const headings = tableHeadings(rec.wikitext);
  const entries = [];
  const audit = [];

  grids.forEach((grid, gi) => {
    const heading = headings[gi] || '';
    if (cfg.heading && !cfg.heading.test(heading)) {
      audit.push({ t: gi, heading, skipped: 'heading filter' });
      return;
    }
    const hi = headerRowOf(grid);
    if (hi < 0) { audit.push({ t: gi, heading, skipped: 'no header row' }); return; }
    const { roles, texts } = detectRoles(grid[hi], cfg.cols);
    if (roles.title === undefined || roles.author === undefined) {
      audit.push({ t: gi, heading, skipped: 'no title/author column', headers: texts.join(' | ') });
      return;
    }

    const headingYear = cfg.yearIn === 'heading' ? yearOf(heading) : null;
    let dropped = 0;

    /* pass 1 — usable rows only, keeping the cells so the winner
       signal can be calibrated across the whole table */
    const cand = [];
    for (let ri = hi + 1; ri < grid.length; ri++) {
      const row = grid[ri];
      if (!row.length) continue;
      if (row.every((c) => c.head)) continue;             /* a repeated header */

      const titleCell = row[roles.title];
      const authorCell = row[roles.author];
      if (!titleCell || !authorCell || titleCell === authorCell) { dropped++; continue; }

      const title = usableCell(titleCell);
      const authorRaw = usableCell(authorCell, 140);
      if (!title || !authorRaw) { dropped++; continue; }
      if (norm(title) === norm(authorRaw)) { dropped++; continue; }
      if (roles.category !== undefined && cfg.category
          && !cfg.category.test(cellText(row[roles.category]?.raw))) { dropped++; continue; }

      cand.push({
        titleCell, authorCell, title, authorRaw,
        year: roles.year !== undefined ? yearOf(cellText(row[roles.year]?.raw)) : headingYear,
        result: roles.result !== undefined ? cellText(row[roles.result]?.raw) : '',
        translatorCell: roles.translator !== undefined ? row[roles.translator] : null,
      });
    }

    /* pass 2 — decide won vs shortlisted, then emit */
    const hasResult = cand.some((r) => kindFromResult(r.result));
    const sig = hasResult ? null : pickSignal(cand);
    let took = 0, prevTitleCell = null;

    for (const r of cand) {
      const kind = kindFromResult(r.result)
        ?? (sig ? (sig.test(r) ? 'w' : 'c') : (cfg.allWinners ? 'w' : 'c'));
      const author = tidyAuthor(r.authorRaw);

      /* Joint authors of one book are written as consecutive rows sharing a
         single rowspan'd title cell — the SAME cell object, so this is exact
         rather than a guess about identical strings. */
      if (r.titleCell === prevTitleCell && entries.length) {
        const prev = entries[entries.length - 1];
        if (!prev.author.includes(author)) prev.author = tidyAuthor(`${prev.author} & ${author}`);
        if (kind === 'w') prev.kind = 'w';
        continue;
      }
      prevTitleCell = r.titleCell;

      const e = { title: tidyTitle(r.title), author, year: r.year, kind };
      if (cfg.translator && r.translatorCell) {
        const tr = usableCell(r.translatorCell, 140);
        if (tr && !/^n\/a$/i.test(tr)) e.translator = tidyAuthor(tr);
      }
      entries.push(e);
      took++;
    }
    audit.push({ t: gi, heading, headers: texts.join(' | '), roles, took, dropped, winnerMark: sig?.name || (hasResult ? 'result column' : cfg.allWinners ? 'all winners' : 'none — all cited') });
  });

  return { entries, audit };
}

/* ── commands ──────────────────────────────────────────────── */

async function cmdFetch() {
  fs.mkdirSync(LISTS_DIR, { recursive: true });
  const only = rest.length ? new Set(rest) : null;
  const force = flag('--force');
  const gaps = [];
  let totalEntries = 0;

  for (const cfg of LISTS) {
    if (only && !only.has(cfg.slug)) continue;
    let rec;
    try {
      rec = await wikitextOf(cfg.page, force);
    } catch (err) {
      gaps.push({ slug: cfg.slug, page: cfg.page, reason: `fetch failed — ${err.message}` });
      console.log(`GAP  ${cfg.slug.padEnd(24)} fetch failed: ${err.message}`);
      continue;
    }
    const { entries, audit } = parseList(cfg, rec);
    if (!entries.length) {
      gaps.push({ slug: cfg.slug, page: cfg.page, reason: 'parsed to zero entries' });
      console.log(`GAP  ${cfg.slug.padEnd(24)} 0 entries  (${audit.map((a) => a.skipped || `T${a.t}:${a.took}`).join(', ')})`);
      continue;
    }
    const wins = entries.filter((e) => e.kind === 'w').length;
    /* A prize gives out roughly one award a year. Winners running far ahead
       of the years covered means shortlistings are being recorded as wins —
       the one failure mode of this whole pipeline that produces a false
       claim rather than a missing one, so it is checked every run and not
       left to a reviewer's eye. */
    const years = new Set(entries.map((e) => e.year).filter(Boolean));
    const perYear = years.size ? wins / years.size : 0;
    if (perYear > 2.5) {
      gaps.push({ slug: cfg.slug, page: cfg.page, reason: `SUSPECT winner ratio ${perYear.toFixed(1)}/yr — shortlistings may be recorded as wins` });
      console.log(`WARN ${cfg.slug.padEnd(24)} ${wins} winners over ${years.size} years (${perYear.toFixed(1)}/yr) — check the winner mark`);
    }
    const out = {
      slug: cfg.slug, prize: cfg.prize, rooms: cfg.rooms,
      page: rec.page, url: rec.url, permalink: rec.permalink, revid: rec.revid,
      fetchedAt: rec.fetchedAt,
      counts: { entries: entries.length, winners: wins, cited: entries.length - wins },
      audit, entries,
    };
    fs.writeFileSync(path.join(LISTS_DIR, `${cfg.slug}.json`), JSON.stringify(out, null, 1) + '\n');
    totalEntries += entries.length;
    console.log(`ok   ${cfg.slug.padEnd(24)} ${String(entries.length).padStart(4)} entries  (${wins} won / ${entries.length - wins} cited)  rev ${rec.revid}`);
  }

  const ran = only ? only.size : LISTS.length;
  console.log(`\n${totalEntries} entries from ${ran - gaps.length}/${ran} lists`);
  if (gaps.length) {
    console.log('\nGAPS — recorded, never filled in from memory:');
    for (const g of gaps) console.log(`  ${g.slug}: ${g.reason}`);
  }
  /* Only a full run may rewrite the gap record. Re-fetching two slugs is not
     evidence that the other seventy-five are fine, and letting a partial run
     clear the file turns "no gaps recorded" into a lie the next reader has no
     way to spot. */
  const gapFile = path.join(LISTS_DIR, '_gaps.json');
  if (!only) {
    if (gaps.length) fs.writeFileSync(gapFile, JSON.stringify(gaps, null, 1) + '\n');
    else fs.rmSync(gapFile, { force: true });
  } else if (gaps.length) {
    console.log('  (partial run — data/lists/_gaps.json left alone; re-run in full to update it)');
  }
}

/** Everything harvested, deduped, accolades merged. */
export function loadHarvest() {
  if (!fs.existsSync(LISTS_DIR)) return { books: [], sources: {} };
  const files = fs.readdirSync(LISTS_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  const byKey = new Map();
  const sources = {};
  for (const f of files) {
    const list = JSON.parse(fs.readFileSync(path.join(LISTS_DIR, f), 'utf8'));
    sources[list.slug] = {
      prize: list.prize, page: list.page, url: list.url,
      permalink: list.permalink, revid: list.revid, fetchedAt: list.fetchedAt,
    };
    for (const e of list.entries) {
      const key = bookKey(e.title, e.author);
      const [kt, ka] = key.split('|');
      if (!kt || !ka) continue;                 /* no title or no surname to key on */
      let b = byKey.get(key);
      if (!b) {
        b = { key, title: e.title, author: e.author, acc: [], rooms: new Set(), years: [] };
        byKey.set(key, b);
      }
      /* the longest spelling of a title tends to be the un-truncated one */
      if (e.title.length > b.title.length && norm(e.title).includes(norm(b.title).slice(0, 12))) b.title = e.title;
      if (e.translator && !b.translator) b.translator = e.translator;
      const label = accoladeLabel(list.prize, e.kind, e.year);
      if (!b.acc.some((a) => a.l === label)) b.acc.push({ l: label, k: e.kind, s: list.slug });
      /* Rooms come from the LIVE config, not from the copy stored in the
         list file at fetch time. Retuning which rooms a prize may shelve
         into is a shelving decision and must not require re-fetching 72
         pages — and, more to the point, silently reading the stale copy is
         a bug that hides itself: the tool reports a full run and the new
         mapping simply never happens. It cost a full shelve cycle here. */
      for (const r of (LIST_BY_SLUG[list.slug]?.rooms || list.rooms)) b.rooms.add(r);
      if (e.year) b.years.push(e.year);
    }
  }
  const books = [...byKey.values()].map((b) => ({
    ...b,
    rooms: [...b.rooms],
    awardYear: b.years.length ? Math.min(...b.years) : null,
    lastAwardYear: b.years.length ? Math.max(...b.years) : null,
  }));
  return { books, sources };
}

/* ── enrich ────────────────────────────────────────────────────
   Open Library, through server/openlibrary.js — the one client, so
   the scoring, the pacing, the 429 backoff and the ISBN rule are
   the same here as on the /api/book route.

   Resumable by construction. server/cache.js deliberately does not
   record misses (a miss today should not be permanent), which is
   right for the server and wrong for a twelve-thousand book batch
   that would otherwise re-pay for every miss on every restart. So
   the tool keeps its own ledger of what it has already attempted,
   beside the cache and clearly not part of it. */
const LEDGER = path.join(ROOT, 'data/cache/harvest-attempts.json');
const loadLedger = () => {
  try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch { return {}; }
};
const saveLedger = (l) => {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  const ordered = {};
  for (const k of Object.keys(l).sort()) ordered[k] = l[k];
  fs.writeFileSync(LEDGER, JSON.stringify(ordered, null, 0) + '\n');
};

/** Enrichment order: breadth first, so a narrow list is not starved by a
    wide one. Round-robin across lists; inside a list, wins before
    shortlistings and more accolades before fewer. Deterministic. */
export function enrichOrder(books) {
  const byList = new Map();
  for (const b of books) {
    const primary = b.acc[0]?.s || 'zz';
    if (!byList.has(primary)) byList.set(primary, []);
    byList.get(primary).push(b);
  }
  const rank = (b) => {
    const wins = b.acc.filter((a) => a.k === 'w').length;
    return -(wins * 3 + b.acc.length);
  };
  for (const arr of byList.values()) {
    arr.sort((x, y) => rank(x) - rank(y) || (y.lastAwardYear || 0) - (x.lastAwardYear || 0)
      || x.key.localeCompare(y.key));
  }
  const lanes = [...byList.keys()].sort().map((k) => byList.get(k));
  const out = [];
  for (let i = 0; out.length < books.length; i++) {
    let moved = false;
    for (const lane of lanes) if (i < lane.length) { out.push(lane[i]); moved = true; }
    if (!moved) break;
  }
  return out;
}

async function cmdEnrich() {
  const { lookupBook, setPace, olCache } = await import('../server/openlibrary.js');
  const budget = Number(opt('--limit', '6000'));
  const workers = Number(opt('--workers', '5'));
  setPace(Number(opt('--pace', '8')), workers);
  olCache.defer();

  const { books } = loadHarvest();
  const order = enrichOrder(books).slice(0, budget);
  const ledger = loadLedger();

  let hit = 0, miss = 0, skipped = 0, n = 0, cursor = 0;
  const t0 = Date.now();

  /* A pool rather than a loop: two thirds of each book's wall time is Open
     Library thinking, and the pace limiter in the client is what keeps this
     polite, not the fact that we asked one at a time. */
  async function worker() {
    for (;;) {
      const b = order[cursor++];
      if (!b) return;
      const key = `${norm(b.title)} ${norm(b.author)}`;
      if (ledger[key]) { skipped++; if (ledger[key] === 'h') hit++; else miss++; continue; }
      const r = await lookupBook({ title: b.title, author: b.author, year: b.awardYear, withIsbn: false });
      const ok = r.source === 'live';
      ledger[key] = ok ? 'h' : 'm';
      ok ? hit++ : miss++;
      if (++n % 50 === 0) {
        olCache.flush(); saveLedger(ledger);
        const rate = n / ((Date.now() - t0) / 1000);
        process.stdout.write(`\r  ${hit + miss}/${order.length}  hit ${hit}  miss ${miss}  ${rate.toFixed(1)}/s  eta ${Math.round((order.length - skipped - n) / rate / 60)}m   `);
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));

  olCache.flush(); saveLedger(ledger);
  console.log(`\nenriched: ${hit} hit, ${miss} miss, ${skipped} already attempted, of ${order.length} candidates`);
  console.log(`cache: ${olCache.size()} entries`);
}

/** Second pass: an attributed ISBN for books that are actually being shelved,
    one edition request each. Kept separate because it is the only part of the
    enrichment worth paying for twice. */
async function cmdIsbns() {
  const { fillIsbn, setPace, olCache } = await import('../server/openlibrary.js');
  setPace(Number(opt('--pace', '8')), Number(opt('--workers', '5')));
  olCache.defer();
  const wanted = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cache/isbn-wanted.json'), 'utf8'));
  let got = 0, n = 0;
  for (const [title, author] of wanted) {
    const e = await fillIsbn(title, author);
    if (e?.isbn13) got++;
    if (++n % 50 === 0) { olCache.flush(); process.stdout.write(`\r  ${n}/${wanted.length}  isbn ${got}   `); }
  }
  olCache.flush();
  console.log(`\nisbns: ${got} of ${wanted.length} requested`);
}

/* ── shelve ────────────────────────────────────────────────────
   Harvested + enriched candidates → src/js/data/generated/.

   Shelf capacity is real, not a round number. The back case is two
   rows of 1152 usable px (IMPLEMENTATION.md §4.6) and a book's
   spine width comes from its page count via covers.js's own
   shelfSize(), so the tool measures the shelf in exactly the units
   the renderer lays it out in. A room is filled to FILL of that and
   no further; what does not fit is surplus and is counted. */
const CASE_ROWS = 2;
const ROW_W = 1180 - 40;
const FILL = 0.92;

const slug = (s) => norm(s).replace(/\s+/g, '-').slice(0, 46).replace(/^-|-$/g, '');

async function cmdShelve() {
  const { shelfSize } = await import('../src/js/covers.js');
  const { ROOMS, ROOM_BY_ID } = await import('../src/js/data/rooms.js');
  const { roomScore, ROOM_RULES } = await import('./rooms-rules.js');
  /* Descriptions are cleaned again on the way out, not only on the way in:
     the cache holds what Open Library said, so an improvement to
     cleanDescription() reaches every book already fetched without re-paying
     for four thousand requests. Idempotent by construction. */
  const { cleanDescription, validIsbn13 } = await import('../server/openlibrary.js');
  const olStore = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cache/openlibrary.json'), 'utf8'));

  /* ids already spoken for by the 409 curated books */
  const curated = await loadCuratedShelves();
  const takenIds = new Set();
  const curatedWidth = {};
  for (const [roomId, list] of Object.entries(curated)) {
    curatedWidth[roomId] = 0;
    for (const b of list) {
      takenIds.add(b.id);
      curatedWidth[roomId] += Math.min(shelfSize(b).t, 58) + 5;
    }
  }

  /* ── candidates: harvested, matched, and with something to show ── */
  const { books, sources } = loadHarvest();
  const cands = [];
  for (const b of books) {
    const e = olStore[`${norm(b.title)} ${norm(b.author)}`];
    if (!e || e.source !== 'live') continue;
    if (!e.year && !e.pages && !e.description) continue;   /* nothing but a name */
    let id = `${slug(b.title)}-${slug(b.author.split(' & ')[0].split(' ').pop())}`;
    if (!id || id.length < 3) continue;
    let n = 2;
    while (takenIds.has(id)) id = `${id.replace(/-\d+$/, '')}-${n++}`;
    takenIds.add(id);
    cands.push({
      id, title: b.title, author: b.author,
      year: e.year || null, pages: e.pages || null,
      blurb: cleanDescription(e.description) || null,
      /* re-checked on the way out as well as on the way in, so a cache
         entry written before validIsbn13() existed cannot reach a shelf */
      isbn: validIsbn13(e.isbn13) ? e.isbn13 : null,
      translator: b.translator || null,
      acc: b.acc, subjects: e.subjects || [],
      rooms: b.rooms,
      wins: b.acc.filter((a) => a.k === 'w').length,
      lastAwardYear: b.lastAwardYear,
      width: Math.min(shelfSize({ id, pages: e.pages }).t, 58) + 5,
    });
  }

  /* ── capacity ── */
  const budget = {};
  for (const room of ROOMS) {
    budget[room.id] = CASE_ROWS * ROW_W * FILL - (curatedWidth[room.id] || 0);
  }

  /* Two rooms no prize list names: the front room ("whatever the shopkeeper
     has been pressing on people all week") and the landing ("further in").
     They take the most-decorated books of any list — an editorial rule, and
     one that reads off the harvest rather than off anybody's memory. */
  const OPEN_ROOMS = ['front', 'landing'];

  /* Books with the fewest possible homes are placed first, or a wide list
     fills the narrow rooms' only shelf before the specialists arrive. */
  const rank = (b) => -(b.wins * 3 + b.acc.length);
  cands.sort((x, y) => x.rooms.length - y.rooms.length || rank(x) - rank(y)
    || (y.lastAwardYear || 0) - (x.lastAwardYear || 0) || x.id.localeCompare(y.id));

  const shelves = {};
  const used = {};
  for (const room of ROOMS) { shelves[room.id] = []; used[room.id] = 0; }

  /* Two passes, and the order is the whole difference between a shelf that
     fills evenly and one that does not.

     A gated room (The Snow Room, The Salt Cellar, Crime in Translation…)
     accepts only books whose fetched subjects match it. Its parent takes
     anything. Run one pass and the parent — reached first by a wider list —
     absorbs the candidates before the specialist rooms ever see them: the
     first version of this shelved 1,928 books and left eleven rooms under
     a quarter full while 2,438 enriched books sat surplus. So gated rooms
     choose first, from the whole candidate set, and the general rooms take
     what is left. */
  const placedIds = new Set();
  const gated = new Set(Object.entries(ROOM_RULES).filter(([, r]) => r.gate).map(([id]) => id));

  const place = (only) => {
    for (const b of cands) {
      if (placedIds.has(b.id)) continue;
      const options = b.rooms
        .filter((r) => ROOM_BY_ID[r] && (only ? only.has(r) : true))
        .map((r) => ({ r, s: roomScore(r, b) }))
        .filter((x) => x.s !== null && used[x.r] + b.width <= budget[x.r]);
      if (!options.length) continue;
      /* best fit, then the emptiest room, so a list's rooms fill evenly */
      options.sort((x, y) => y.s - x.s || (used[x.r] / budget[x.r]) - (used[y.r] / budget[y.r]));
      const to = options[0].r;
      shelves[to].push(b);
      used[to] += b.width;
      placedIds.add(b.id);
    }
  };
  place(gated);
  place(null);

  /* The two rooms no list names, filled from what is left over, best books
     first and in OPEN_ROOMS order — so the front room gets the most-decorated
     of everything the specialist rooms could not take ("whatever the
     shopkeeper has been pressing on people all week"), and the landing gets
     the next tier. Not alternated: the front room is the first thing anyone
     sees and should have the best of it. */
  const leftovers = cands.filter((b) => !placedIds.has(b.id))
    .sort((x, y) => rank(x) - rank(y) || (y.lastAwardYear || 0) - (x.lastAwardYear || 0));
  const openFull = new Set();
  for (const b of leftovers) {
    if (openFull.size === OPEN_ROOMS.length) break;
    for (const room of OPEN_ROOMS) {
      if (openFull.has(room)) continue;
      if (used[room] + b.width > budget[room]) { openFull.add(room); continue; }
      shelves[room].push(b);
      used[room] += b.width;
      placedIds.add(b.id);
      break;
    }
  }
  const placed = placedIds.size;
  const surplus = cands.length - placed;

  /* ── emit ── */
  const GEN_DIR = path.join(ROOT, 'src/js/data/generated');
  fs.rmSync(GEN_DIR, { recursive: true, force: true });
  fs.mkdirSync(GEN_DIR, { recursive: true });

  const hubOf = (id) => {
    /* the front table shares a file with the front room, exactly as the
       hand-curated data/books/front.js does */
    if (id === 'fronttable') return 'front';
    let r = ROOM_BY_ID[id];
    while (r && r.parent && r.parent !== 'front') r = ROOM_BY_ID[r.parent];
    return r?.id === 'front' ? 'front' : (r?.id || 'front');
  };
  const byHub = {};
  for (const room of ROOMS) {
    const list = shelves[room.id];
    if (!list.length) continue;
    const hub = room.parent ? hubOf(room.id) : 'front';
    (byHub[hub] ||= {})[room.id] = list;
  }

  const usedSlugs = new Set();
  for (const list of Object.values(shelves)) for (const b of list) for (const a of b.acc) usedSlugs.add(a.s);

  const jstr = (s) => JSON.stringify(s);
  for (const [hub, rooms] of Object.entries(byHub)) {
    let out = `/* ============================================================\n`
      + `   GENERATED — do not hand-edit. Rewritten by\n`
      + `     NODE_USE_ENV_PROXY=1 node tools/harvest.mjs fetch enrich shelve\n\n`
      + `   Harvested from prize lists (titles, authors, accolades — every\n`
      + `   one traceable through acc[].s to a page and revision id in\n`
      + `   ./sources.js) and enriched from Open Library (year, pages,\n`
      + `   isbn, description). No curator's note, no hand-written tags and\n`
      + `   no opening line: IMPLEMENTATION.md §6 decided that with the\n`
      + `   owner, and §9 keeps 'first' held back without a 'firstSource'.\n`
      + `   ============================================================ */\n\nexport default {\n`;
    for (const [roomId, list] of Object.entries(rooms)) {
      out += `\n  ${roomId}: [\n`;
      for (const b of list) {
        const f = [`id: ${jstr(b.id)}`, `title: ${jstr(b.title)}`, `author: ${jstr(b.author)}`];
        if (b.translator) f.push(`translator: ${jstr(b.translator)}`);
        if (b.year) f.push(`year: ${b.year}`);
        if (b.pages) f.push(`pages: ${b.pages}`);
        if (b.isbn) f.push(`isbn: ${jstr(b.isbn)}`);
        out += `    { ${f.join(', ')},\n`;
        out += `      acc: [${b.acc.map((a) => `{ l: ${jstr(a.l)}, k: ${jstr(a.k)}, s: ${jstr(a.s)} }`).join(', ')}]`;
        if (b.blurb) out += `,\n      blurb: ${jstr(b.blurb)}`;
        out += ' },\n';
      }
      out += '  ],\n';
    }
    out += '};\n';
    fs.writeFileSync(path.join(GEN_DIR, `${hub}.js`), out);
  }

  const srcOut = `/* ============================================================\n`
    + `   GENERATED — where every harvested accolade came from.\n\n`
    + `   Each generated book's acc[].s is a key in here, and each entry\n`
    + `   names the exact revision of the page that was parsed. The\n`
    + `   permalink resolves to the byte-identical wikitext, so any\n`
    + `   accolade on any shelf in this shop can be checked against its\n`
    + `   source rather than taken on trust. That is the whole point of\n`
    + `   IMPLEMENTATION.md §6 step 1.\n`
    + `   ============================================================ */\n\n`
    + `export const SOURCES = ${JSON.stringify(
      Object.fromEntries(Object.entries(sources).filter(([k]) => usedSlugs.has(k))), null, 2)};\n\n`
    + `export default SOURCES;\n`;
  fs.writeFileSync(path.join(GEN_DIR, 'sources.js'), srcOut);

  const hubs = Object.keys(byHub).sort();
  const idxOut = `/* ============================================================\n`
    + `   GENERATED — the harvested shelves, one file per hub, mirroring\n`
    + `   the hand-curated data/books/ layout next door.\n`
    + `   ============================================================ */\n\n`
    + hubs.map((h) => `import ${h} from './${h}.js';`).join('\n')
    + `\n\nexport { SOURCES } from './sources.js';\n\n`
    + `export const GENERATED = Object.assign({}, ${hubs.join(', ')});\n\n`
    + `export default GENERATED;\n`;
  fs.writeFileSync(path.join(GEN_DIR, 'index.js'), idxOut);

  /* which books to spend an edition request on, for an attributed ISBN */
  const wanted = [];
  for (const list of Object.values(shelves)) for (const b of list) if (!b.isbn) wanted.push([b.title, b.author]);
  fs.writeFileSync(path.join(ROOT, 'data/cache/isbn-wanted.json'), JSON.stringify(wanted));

  /* ── report ── */
  const rows = ROOMS.map((r) => ({
    room: r.id, curated: (curated[r.id] || []).length, generated: shelves[r.id].length,
    fill: `${Math.round(((used[r.id] + (curatedWidth[r.id] || 0)) / (CASE_ROWS * ROW_W)) * 100)}%`,
  }));
  const thin = rows.filter((r) => parseInt(r.fill, 10) < 60);
  console.log(`candidates: ${cands.length} enriched of ${books.length} harvested`);
  console.log(`shelved:    ${placed} generated + ${Object.values(curated).flat().length} curated`);
  console.log(`surplus:    ${surplus} enriched books with no room that had space`);
  console.log(`sources:    ${usedSlugs.size} lists referenced by shelved books`);
  console.log(`isbn pass:  ${wanted.length} books want one`);
  if (thin.length) {
    console.log(`\nrooms under 60% of their back case (the honest shortfall):`);
    for (const r of thin) console.log(`  ${r.room.padEnd(16)} ${r.fill.padStart(4)}  ${r.curated} curated + ${r.generated} generated`);
  }
}

/* ── curated ───────────────────────────────────────────────────
   The other half of §6 step 2, and the one that was never run: ENRICH
   is empty and **0 of the 409 curated books have an ISBN**, so every
   buy link in the shop today lands on a search box.

   Writes src/js/data/enrich.js — plain checkable facts only (ISBN-13,
   pages, first-publication year, the Open Library work key that
   proves where they came from). No description: shop.js merges this
   UNDER each book, and a curated book's blurb is hand-written and
   must keep winning. */
async function cmdCurated() {
  const { lookupBook, setPace, olCache, validIsbn13 } = await import('../server/openlibrary.js');
  setPace(Number(opt('--pace', '8')), Number(opt('--workers', '4')));
  olCache.defer();

  const curated = await loadCuratedShelves();
  const books = Object.values(curated).flat();
  const out = {};
  let hit = 0, isbns = 0, rejected = 0, n = 0;

  const queue = books.slice();
  async function worker() {
    for (;;) {
      const b = queue.shift();
      if (!b) return;
      const r = await lookupBook({ title: b.title, author: b.author, year: b.year, withIsbn: true });
      if (r.source === 'live') {
        hit++;
        /* A wrong ISBN sends a reader to the wrong book at a real shop, so
           one last sanity check on top of the match score: if Open Library's
           first-publication year is a quarter-century away from the shelf's,
           this is not the same book. Loose on purpose — release_year is the
           ORIGINAL-language year (IMPLEMENTATION.md §8.5) and several of
           these shelves carry the English one. */
        const wildYear = b.year && r.year && Math.abs(r.year - b.year) > 25;
        if (wildYear) { rejected++; }
        else {
          const e = {};
          if (validIsbn13(r.isbn13)) { e.isbn = r.isbn13; isbns++; }
          if (r.pages) e.pages = r.pages;
          if (r.year) e.year = r.year;
          if (r.olWork) e.olWork = r.olWork;
          if (Object.keys(e).length) out[b.id] = e;
        }
      }
      if (++n % 40 === 0) { olCache.flush(); process.stdout.write(`\r  ${n}/${books.length}  matched ${hit}  isbn ${isbns}   `); }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  olCache.flush();

  const ids = Object.keys(out).sort();
  const body = ids.map((id) => `  ${/^[a-z][\w$]*$/i.test(id) ? id : JSON.stringify(id)}: `
    + `{ ${Object.entries(out[id]).map(([k, v]) => `${k}: ${typeof v === 'number' ? v : JSON.stringify(v)}`).join(', ')} },`).join('\n');

  const header = fs.readFileSync(path.join(ROOT, 'src/js/data/enrich.js'), 'utf8')
    .split('export const ENRICH')[0]
    .replace(/pulled from Hardcover, so the buy links land/, 'pulled from Open Library (Hardcover when a token is\n   present — see server/lookup.js), so the buy links land')
    .replace(/HARDCOVER_TOKEN=… node tools\/hardcover\.mjs enrich/, 'npm run harvest:curated');

  fs.writeFileSync(path.join(ROOT, 'src/js/data/enrich.js'),
    `${header}export const ENRICH = {\n${body}\n};\n\nexport default ENRICH;\n`);

  console.log(`\ncurated: ${books.length} books, ${hit} matched, ${isbns} with an attributable ISBN, ${rejected} rejected on a wild year`);
}

/** The 409 hand-curated shelves, read straight from data/books/. */
async function loadCuratedShelves() {
  const dir = path.join(ROOT, 'src/js/data/books');
  const out = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const mod = await import(path.join(dir, f));
    for (const [roomId, list] of Object.entries(mod.default)) out[roomId] = list;
  }
  return out;
}

async function cmdReport() {
  const { books, sources } = loadHarvest();
  const wins = books.filter((b) => b.acc.some((a) => a.k === 'w')).length;
  console.log(`lists: ${Object.keys(sources).length}`);
  console.log(`unique books: ${books.length}  (${wins} with at least one win)`);
  const perList = {};
  for (const b of books) for (const a of b.acc) perList[a.s] = (perList[a.s] || 0) + 1;
  const rows = Object.entries(perList).sort((a, b2) => b2[1] - a[1]);
  for (const [slug, n] of rows) console.log(`  ${slug.padEnd(24)} ${String(n).padStart(4)}  ${sources[slug]?.permalink || ''}`);
  const gapFile = path.join(LISTS_DIR, '_gaps.json');
  if (fs.existsSync(gapFile)) {
    console.log('\ngaps:');
    for (const g of JSON.parse(fs.readFileSync(gapFile, 'utf8'))) console.log(`  ${g.slug}: ${g.reason}`);
  }
}

/* ── main ──────────────────────────────────────────────────── */

const cmd = process.argv[2];
const COMMANDS = { fetch: cmdFetch, enrich: cmdEnrich, isbns: cmdIsbns, curated: cmdCurated, shelve: cmdShelve, report: cmdReport };
if (COMMANDS[cmd]) {
  await COMMANDS[cmd]();
} else if (cmd) {
  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}

export { opt, flag, LISTS_DIR, ROOT, UA, sleep };
