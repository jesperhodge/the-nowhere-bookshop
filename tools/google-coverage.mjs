#!/usr/bin/env node
/* ============================================================
   PHI-4: what fraction of this shop's ~2,500 books can be resolved to a
   Google Books volume. A measurement, not a build — see the plan doc for
   the full match rule and the architecture this file implements. Reads
   tools/google-books.mjs for scoring; owns the network, the cache and the
   quota itself.

     NODE_USE_ENV_PROXY=1 node tools/google-coverage.mjs plan
     NODE_USE_ENV_PROXY=1 node tools/google-coverage.mjs run    [--budget N] [--pace MS] [--force] [--limit N]
                          node tools/google-coverage.mjs report

   NODE_USE_ENV_PROXY=1 is not optional for `plan`/`run` — see
   IMPLEMENTATION.md §8.2. Node's built-in fetch ignores https_proxy
   without it and fails with a flat 403 that reads exactly like an auth
   problem.

   ── What each command does ────────────────────────────────────
   plan    Zero requests. Prints how many of the shop's 2444 distinct
           title+author keys are already measured, how many remain, and
           how many days that will take at the daily budget. Loud about
           it if more than one day's quota is needed — the spec's "stop
           and say so rather than burning it blind."
   run     The harvest. Walks every distinct key in a fixed shuffled
           order (see SHUFFLE_SEED below) so any prefix is a uniform
           random sample, queries Google Books once per book, scores the
           response with tools/google-books.mjs's classifyMatch(), and
           writes data/cache/gbcoverage.json. Resumable: a key already
           measured is skipped unless --force. Stops at the daily budget,
           on a terminal quota error, or after too many consecutive
           transport failures — never mid-write.
   report  Zero requests. Reads data/cache/gbcoverage.json and
           data/cache/gbcoverage-runs.json and writes
           GOOGLE-BOOKS-COVERAGE.md at the repo root.

   ── Traps (read before touching the query or the request shape) ──
   1. intitle:/inauthor:/isbn: all return totalItems: 0 for books that
      are unambiguously present. Measured 2026-10-03 with a valid key,
      HTTP 200. The repo's own data/cache/describe/google/ (phase 11,
      gitignored, not present in a fresh checkout) proves these operators
      worked when phase 11 ran — they return nothing now. This is a
      regression in Google's API, not a bug in this tool.
      NEVER reintroduce a field-restricted query operator here. The
      query is always plain unqualified text: `${title} ${author}`.
   2. maxResults=40 returns 20. The server-side cap is 20. Do not
      paginate with startIndex — one request answers the question this
      tool asks.
   3. Search results already carry accessInfo (viewability, embeddable,
      country, publicDomain) and volumeInfo.imageLinks. One request per
      book; a per-volume GET /volumes/{id} follow-up would double the
      quota for nothing this tool needs.
   4. A transport failure is not an answer and must never be cached —
      same rule as server/cache.js and tools/links.mjs. Only an HTTP 200
      with a parseable body gets written to data/cache/gbcoverage/ or
      data/cache/gbcoverage.json.
   5. The constructed URL contains the key. Never log it, never cache
      it, never put it in the run ledger or a record's `why`/`miss`
      text. Only the bare query string `q` is ever stored.

   ── Sampling: why the walk order is a seeded shuffle, not shelf order ──
   2505 books collapse to 2444 distinct title+author keys. At one
   request each and ~1,000/day free tier, a full census is multiple
   days. Rather than measure in shelf order (which correlates with
   room/hub/curated-vs-generated — all plausibly correlated with Google
   Books presence, which would make a partial run a biased one), every
   distinct key is sorted, then shuffled with a fixed seed before
   walking. Any PREFIX of that order is then a uniform random sample of
   the whole shelf, so a day-1 partial run is still a valid measurement
   with a computable confidence interval, and resuming the next day
   extends the same permutation without re-measuring or skipping
   anything.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cache, cacheKey } from '../server/cache.js';
import { loadDotEnv } from '../server/env.js';
import { ALL_BOOKS } from '../src/js/shop.js';
import { classifyMatch } from './google-books.mjs';

loadDotEnv();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'data/cache/gbcoverage');
const RUNS_PATH = path.join(ROOT, 'data/cache/gbcoverage-runs.json');

const UA = 'the-nowhere-bookshop/1.0 (a curated bookshop site; contact jesperhodge@gmail.com)';
const GOOGLE_KEY = process.env.GOOGLE_BOOKS_KEY || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(3);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i > -1 && args[i + 1] ? args[i + 1] : d; };

const DAILY_BUDGET_DEFAULT = 900;   // of the ~1000/day free tier, 100 held back
const PACE_MS_DEFAULT = 1100;
const MAX_RESULTS = 20;
const SHUFFLE_SEED = 20251003;      // fixed, never change it — it is what makes
                                     // a partial run reproducible and unbiased
const MAX_CONSECUTIVE_TRANSPORT_FAILURES = 5;

/* ── seeded shuffle: sort ascending, then Fisher–Yates with a tiny PRNG.
   No dependency — mulberry32 is 8 lines and this is the only place that
   needs deterministic randomness. ──────────────────────────────────── */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded(arr, seed) {
  const a = arr.slice();
  const rand = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── target list: one entry per distinct cacheKey; `ids` collects every
   shop book id that shares it (a few titles are shelved more than once
   under the same title+author). ─────────────────────────────────────── */
function targets() {
  const byKey = new Map();
  for (const b of ALL_BOOKS) {
    const key = cacheKey(b.title, b.author);
    let t = byKey.get(key);
    if (!t) {
      t = { key, title: b.title, author: b.author, isbn: b.isbn || null, ids: [] };
      byKey.set(key, t);
    }
    t.ids.push(b.id);
  }
  const shuffledKeys = shuffleSeeded([...byKey.keys()].sort(), SHUFFLE_SEED);
  return shuffledKeys.map((k) => byKey.get(k));
}

const queryFor = (t) => `${t.title} ${t.author}`;
const urlFor = (q) => `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${MAX_RESULTS}&key=${GOOGLE_KEY}`;

function rawCachePath(key) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  return path.join(RAW_DIR, `${key.replace(/[^\w]+/g, '_').slice(0, 150)}.json`);
}

/* ── the one request per book, with quota-awareness ───────────────────
   Two kinds of failure, told apart on purpose (PHI-4 §5):
     terminal   the daily quota is actually exhausted — stop the whole
                run, there is nothing to retry today.
     transient  anything else (a stray 429/403 that ISN'T the daily-quota
                message, a 5xx, a network error) — back off and retry a
                few times, then give up on this one book without caching
                anything, same rule as tools/links.mjs. */
const TERMINAL_QUOTA = Symbol('terminal-quota');
const TRANSPORT_FAILURE = Symbol('transport-failure');
const BACKOFF_MS = [2000, 4000, 8000];

/* ── terminal vs transient quota classification ────────────────────────
   Google's `reason` field is not trustworthy alone: a real captured
   daily-exhaustion payload (see tools/google-coverage.test.mjs) carries
   reason: 'rateLimitExceeded' even though the message is unambiguously
   about the PER-DAY limit ("Quota exceeded for quota metric 'Queries'
   and limit 'Queries per day'..."). So `reason` is checked first for the
   two reasons Google uses that ARE unambiguous on their own
   ('dailyLimitExceeded', 'quotaExceeded' — deliberately NOT
   'rateLimitExceeded', which is Google's per-MINUTE limit and must stay
   transient/retried), and the message is checked second with a regex
   that matches either word order: Google's actual "Daily Limit
   Exceeded..." message puts "Daily" BEFORE "quota", which the previous
   regex (requiring quota first) missed entirely. */
const TERMINAL_REASONS = new Set(['dailyLimitExceeded', 'quotaExceeded']);
const QUOTA_MESSAGE_RE = /\b(daily|per[\s-]?day)\b.{0,40}\b(limit|quota)\b|\bquota\b.{0,40}\b(daily|per[\s-]?day)\b/i;

/** Pure, unit-testable classification of one error response. Returns
    'terminal' (stop the whole run, nothing left to retry today),
    'transient' (back off and retry, or give up on this one book without
    caching anything), or null when httpStatus isn't an error response at
    all (not applicable). httpStatus 429/403 get the full reason+message
    check; any other error status (5xx, other 4xx, or no parseable body)
    is transient — only a 429/403 can ever mean the daily quota itself is
    exhausted. */
export function classifyQuotaResponse(httpStatus, parsedErrorBody) {
  if (httpStatus == null || httpStatus < 400) return null;

  if (httpStatus === 429 || httpStatus === 403) {
    const reason = parsedErrorBody?.error?.errors?.[0]?.reason || '';
    const message = parsedErrorBody?.error?.message || '';
    if (TERMINAL_REASONS.has(reason)) return 'terminal';
    if (QUOTA_MESSAGE_RE.test(message)) return 'terminal';
    return 'transient';
  }

  return 'transient';
}

async function fetchWithQuotaAwareness(q, requestCounter) {
  const url = urlFor(q);
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    let res;
    requestCounter.count++;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    } catch {
      if (attempt < BACKOFF_MS.length) { await sleep(BACKOFF_MS[attempt]); continue; }
      return TRANSPORT_FAILURE;
    }

    if (res.status === 429 || res.status === 403) {
      let body = null;
      try { body = await res.json(); } catch { /* unparseable error body */ }
      if (classifyQuotaResponse(res.status, body) === 'terminal') return TERMINAL_QUOTA;
      if (attempt < BACKOFF_MS.length) { await sleep(BACKOFF_MS[attempt]); continue; }
      return TRANSPORT_FAILURE;
    }

    if (res.status >= 500) {
      if (attempt < BACKOFF_MS.length) { await sleep(BACKOFF_MS[attempt]); continue; }
      return TRANSPORT_FAILURE;
    }

    if (!res.ok) return TRANSPORT_FAILURE; // some other 4xx — not retryable, not a quota signal

    try {
      return { ok: true, body: await res.json() };
    } catch {
      return TRANSPORT_FAILURE; // HTTP 200 with an unparseable body is not an answer either
    }
  }
  return TRANSPORT_FAILURE;
}

/* ── record shape: a flattened projection of the winning volume, never
   the raw item — so the report (and anyone reading gbcoverage.json) never
   needs to reopen the ~100 MB raw directory to produce a number. The raw
   body stays on disk under data/cache/gbcoverage/ for the follow-up
   covers/preview task. ──────────────────────────────────────────────── */
function flattenVolume(item) {
  const vi = item?.volumeInfo || {};
  const ai = item?.accessInfo || {};
  const ids = vi.industryIdentifiers || [];
  const isbn13 = ids.find((i) => i.type === 'ISBN_13')?.identifier || null;
  const isbn10 = ids.find((i) => i.type === 'ISBN_10')?.identifier || null;
  return {
    id: item?.id || null,
    title: vi.title || null,
    subtitle: vi.subtitle || null,
    authors: vi.authors || [],
    publishedDate: vi.publishedDate || null,
    isbn13,
    isbn10,
    viewability: ai.viewability ?? null,
    embeddable: typeof ai.embeddable === 'boolean' ? ai.embeddable : null,
    country: ai.country ?? null,
    publicDomain: typeof ai.publicDomain === 'boolean' ? ai.publicDomain : null,
    hasImageLinks: !!vi.imageLinks,
    hasThumbnail: !!(vi.imageLinks && vi.imageLinks.thumbnail),
    previewLink: vi.previewLink || null,
    infoLink: vi.infoLink || null,
    canonicalVolumeLink: vi.canonicalVolumeLink || null,
    language: vi.language || null,
  };
}

function buildRecord(t, body, verdict) {
  const totalItems = typeof body.totalItems === 'number' ? body.totalItems : (body.items || []).length;
  return {
    ids: t.ids,
    title: t.title,
    author: t.author,
    isbn: t.isbn,
    q: queryFor(t),
    totalItems,
    returned: (body.items || []).length,
    tier: verdict.tier,
    matched: verdict.matched,
    score: verdict.score,
    index: verdict.index,
    why: verdict.why,
    volume: verdict.tier !== null ? flattenVolume(verdict.volume) : null,
    miss: verdict.tier === null ? { reason: verdict.why, candidates: verdict.candidates } : null,
  };
}

function appendRunLedger(entry) {
  let doc = { runs: [] };
  if (fs.existsSync(RUNS_PATH)) {
    try { doc = JSON.parse(fs.readFileSync(RUNS_PATH, 'utf8')); } catch { doc = { runs: [] }; }
  }
  if (!Array.isArray(doc.runs)) doc.runs = [];
  doc.runs.push(entry);
  fs.mkdirSync(path.dirname(RUNS_PATH), { recursive: true });
  fs.writeFileSync(RUNS_PATH, JSON.stringify(doc, null, 1) + '\n');
}

/* ── commands ──────────────────────────────────────────────── */

function summarize(store, budget) {
  const all = targets();
  const already = all.filter((t) => store.has(t.key)).length;
  const remaining = all.length - already;
  const days = remaining > 0 ? Math.ceil(remaining / budget) : 0;
  return { all, already, remaining, days };
}

function printSummary({ all, already, remaining, days }, budget) {
  console.log(`total books: ${ALL_BOOKS.length}`);
  console.log(`distinct title+author keys: ${all.length}`);
  console.log(`already measured: ${already}`);
  console.log(`remaining: ${remaining}`);
  console.log(`requests needed: ${remaining}`);
  console.log(`days at budget (${budget}/day): ${days}`);
  if (days > 1) {
    console.log(`${remaining} books remain. At ${budget} requests/day that is ${days} more day(s) of `
      + 'quota. This run will measure at most '
      + `${budget} of them and stop; re-run tomorrow with the same command. Nothing already paid for `
      + 'is re-fetched.');
  }
}

async function cmdPlan() {
  const budget = Number(opt('budget', DAILY_BUDGET_DEFAULT));
  const store = cache('gbcoverage');
  printSummary(summarize(store, budget), budget);
}

async function cmdRun() {
  const limitOpt = opt('limit', null);
  const budget = Number(limitOpt !== null ? limitOpt : opt('budget', DAILY_BUDGET_DEFAULT));
  const paceMs = Number(opt('pace', PACE_MS_DEFAULT));
  const force = flag('force');

  const store = cache('gbcoverage');
  const summaryBudget = Number(opt('budget', DAILY_BUDGET_DEFAULT));
  const summary = summarize(store, summaryBudget);
  printSummary(summary, summaryBudget);

  if (!GOOGLE_KEY) {
    console.log('GOOGLE_BOOKS_KEY not set — nothing to measure');
    return;
  }

  store.defer();
  const startedAt = new Date().toISOString();
  const requestCounter = { count: 0 };
  let booksMeasured = 0, servedFromRawCache = 0, transportFailures = 0, consecutiveFailures = 0, matched = 0;
  let stoppedBecause = 'completed';

  const writeRunLedger = (reason) => {
    appendRunLedger({
      startedAt, finishedAt: new Date().toISOString(),
      budget, paceMs,
      requests: requestCounter.count,
      booksMeasured, servedFromRawCache, transportFailures,
      stoppedBecause: reason,
      remainingAfter: Math.max(0, summary.remaining - booksMeasured),
    });
  };

  const onInterrupt = () => {
    console.log('\ninterrupted — flushing what has been resolved so far…');
    store.flush();
    writeRunLedger('interrupted');
    process.exit(130);
  };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onInterrupt);

  for (const t of summary.all) {
    if (booksMeasured >= budget) { stoppedBecause = 'budget'; break; }
    if (store.has(t.key) && !force) continue;

    const rawPath = rawCachePath(t.key);
    let body = null;

    if (!force && fs.existsSync(rawPath)) {
      try { body = JSON.parse(fs.readFileSync(rawPath, 'utf8')); servedFromRawCache++; } catch { body = null; }
    }

    if (!body) {
      const result = await fetchWithQuotaAwareness(queryFor(t), requestCounter);
      if (result === TERMINAL_QUOTA) { stoppedBecause = 'daily-quota'; break; }
      if (result === TRANSPORT_FAILURE) {
        consecutiveFailures++;
        transportFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_TRANSPORT_FAILURES) { stoppedBecause = 'transport-failures'; break; }
        continue; // nothing written for this book — a transport failure is not an answer
      }
      consecutiveFailures = 0;
      body = result.body;
      fs.writeFileSync(rawPath, JSON.stringify(body));
      await sleep(paceMs);
    }

    const verdict = classifyMatch(t, body.items);
    store.set(t.key, buildRecord(t, body, verdict));
    booksMeasured++;
    if (verdict.matched) matched++;
    if (booksMeasured % 20 === 0) store.flush();
  }

  process.off('SIGINT', onInterrupt);
  process.off('SIGTERM', onInterrupt);

  store.flush();
  writeRunLedger(stoppedBecause);

  const remainingAfter = Math.max(0, summary.remaining - booksMeasured);
  const daysRemaining = remainingAfter > 0 ? Math.ceil(remainingAfter / budget) : 0;
  const rate = booksMeasured ? ((matched / booksMeasured) * 100).toFixed(1) : '0.0';

  console.log('');
  console.log(`requests used: ${requestCounter.count}`);
  console.log(`books newly measured: ${booksMeasured}`);
  console.log(`served from raw cache: ${servedFromRawCache}`);
  console.log(`transport failures: ${transportFailures}`);
  console.log(`stop reason: ${stoppedBecause}`);
  console.log(`books remaining: ${remainingAfter}`);
  console.log(`days remaining at this budget: ${daysRemaining}`);
  console.log(`running match rate this run: ${rate}% (${matched}/${booksMeasured})`);

  if (stoppedBecause === 'daily-quota') {
    console.log(`\ndaily quota exhausted after ${requestCounter.count} request(s). ${remainingAfter} books `
      + 'still unmeasured. Nothing is lost — re-run tomorrow with the same command.');
    process.exitCode = 75; // EX_TEMPFAIL — "come back tomorrow", not "it broke"
  }
}

/* ── report: zero requests, reads the cache, writes the document ──────
   The numbers can never drift from the cache (they ARE the cache, read
   back), and the match-rule prose can never drift from the implemented
   rule (it is a template literal in this file, not hand-copied prose). ── */

const DOC_PATH = path.join(ROOT, 'GOOGLE-BOOKS-COVERAGE.md');

const MATCH_RULE_PROSE = `**A match is:** one unqualified text query of \`"<title> <author>"\` against the Google Books Volumes API, returning up to 20 volumes, scored client-side. A volume matches when, after normalisation (lowercased, accents and punctuation stripped, leading article and subtitle removed), **either** the shop's checksum-valid ISBN-13 appears verbatim in the volume's \`industryIdentifiers\` and the title heads agree (**tier A**), **or** the bare titles are equal and the author's surname appears in the volume's author list (**tier B**), **or** one bare title is a ≥4-character prefix of the other and the author's surname appears in the volume's author list (**tier C**). A volume whose listed authors do not contain the author's surname is rejected outright. Where the shop's title carries a distinctive subtitle that the volume's title and subtitle fail to corroborate, the volume is demoted to **tier E** and is *not* counted as a match — this is the "Abarat" guard from \`REVIEW-PHASE11.md\`, which stops a later series volume matching volume one. A volume with an exact title and **no** authors listed is **tier D** and is also not counted. **The headline match rate counts tiers A + B + C only.** An upper bound including D and E is reported alongside it.`;

const VIEWABILITY_KINDS = ['ALL_PAGES', 'PARTIAL', 'NO_PAGES', 'UNKNOWN'];

function bandFor(pct) {
  if (pct >= 80) return '≥80% — good';
  if (pct >= 50) return '50–80% — report and ask';
  return '<50% — stop, fix matching first';
}

function pct(n, d) {
  return d ? ((n / d) * 100) : 0;
}

/** 95% CI half-width in percentage points, finite-population corrected.
    N = the shelf's distinct title+author keys (2444), n = measured, p =
    matched/measured. Used to say how tight a partial run's number is
    without pretending a prefix of the shuffle is a census. */
function ciHalfWidthPp(matched, measured, population) {
  if (!measured) return 0;
  const p = matched / measured;
  const se = Math.sqrt((p * (1 - p)) / measured);
  const fpc = measured < population ? Math.sqrt((population - measured) / (population - 1)) : 1;
  return 1.96 * se * fpc * 100;
}

/* ── "is this a matching bug, or a genuine catalogue gap" ───────────────
   The query is always plain unqualified text (see the header traps), so
   Google returns SOME fuzzy result for almost any string — `totalItems:
   0` is rare in every run regardless of real match quality. A miss where
   every candidate scored 0 on title AND landed outside tiers D/E (i.e.
   every rejected candidate is a genuine non-match, like "The Gardener's
   Monthly and Horticultural Advertiser" rejected for "The Guardener's
   Tale") is a real absence. A miss with a rejected candidate that has
   SOME title-level similarity (titleScore > 0 — the classifier saw
   something and still said no) or that landed in tier D/E is the
   signal worth a human's attention. */
const MIN_MISSES_FOR_BANNER = 10;

/** One miss record (the shape stored at rec.miss, i.e. { candidates }) →
    true if any of its (already top-N) candidates looks like a plausible,
    wrongly-rejected match rather than a clean non-match. Pure. */
function missLooksPlausible(missRecord) {
  const candidates = missRecord?.candidates || [];
  return candidates.some((c) => (c.titleScore ?? 0) > 0 || c.tier === 'D' || c.tier === 'E');
}

/** Reduces a list of miss records (`rec.miss` shapes) to the statistic the
    report's banner is based on. Pure, and deliberately takes the FULL miss
    population, not just the capped sample that gets printed — a banner
    computed over only the first 20 shown in a document under-samples a
    full harvest with hundreds of misses. `n < MIN_MISSES_FOR_BANNER` means
    "don't claim confidence either way", surfaced by the caller rather than
    folded into `warn` so a reader can see the sample size regardless. */
export function missBugSignal(missRecords) {
  const n = missRecords.length;
  const plausible = missRecords.filter(missLooksPlausible).length;
  const share = n ? plausible / n : 0;
  return { n, plausible, share, warn: n >= MIN_MISSES_FOR_BANNER && share >= 0.5 };
}

async function cmdReport() {
  const store = cache('gbcoverage');
  const all = targets(); // shuffle order — also the population for the CI and the misses sample
  const population = all.length;

  const records = all
    .map((t) => ({ t, rec: store.get(t.key) }))
    .filter((x) => x.rec);
  const measured = records.length;

  const tierCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, miss: 0 };
  for (const { rec } of records) {
    if (rec.tier === null) tierCounts.miss++;
    else tierCounts[rec.tier] = (tierCounts[rec.tier] || 0) + 1;
  }
  const matched = tierCounts.A + tierCounts.B + tierCounts.C;
  const upperBound = measured - tierCounts.miss; // tiers A-E, i.e. "found something"

  const confirmedRate = pct(matched, measured);
  const upperBoundRate = pct(upperBound, measured);
  const ci = ciHalfWidthPp(matched, measured, population);

  /* accessInfo.viewability / country / embeddable / imageLinks — all over
     the HEADLINE matched set (tiers A+B+C) only, per the plan. */
  const matchedRecords = records.filter((x) => x.rec.matched);
  const viewability = { ALL_PAGES: 0, PARTIAL: 0, NO_PAGES: 0, UNKNOWN: 0, absent: 0 };
  const countries = {};
  const embeddable = { true: 0, false: 0, absent: 0 };
  const imageLinks = { present: 0, absent: 0, thumbnail: 0 };
  for (const { rec } of matchedRecords) {
    const v = rec.volume || {};
    if (v.viewability && VIEWABILITY_KINDS.includes(v.viewability)) viewability[v.viewability]++;
    else viewability.absent++;
    const country = v.country || '(unknown)';
    countries[country] = (countries[country] || 0) + 1;
    if (v.embeddable === true) embeddable.true++;
    else if (v.embeddable === false) embeddable.false++;
    else embeddable.absent++;
    if (v.hasImageLinks) { imageLinks.present++; if (v.hasThumbnail) imageLinks.thumbnail++; }
    else imageLinks.absent++;
  }
  const topCountry = Object.entries(countries).sort((a, b) => b[1] - a[1])[0]?.[0] || '(none)';

  /* Twenty misses, in shuffle order (deterministic, re-derivable) — the
     first 20 MEASURED records whose tier is null. This cap is for what
     gets PRINTED only; the banner's statistic below is computed over
     every miss, not just these twenty (Finding 5). */
  const misses = [];
  for (const { t, rec } of records) {
    if (rec.tier === null) misses.push({ t, rec });
    if (misses.length >= 20) break;
  }
  const allMisses = records.filter((x) => x.rec.tier === null).map((x) => x.rec.miss);
  const missSignal = missBugSignal(allMisses);

  /* Run ledger. */
  let runsDoc = { runs: [] };
  if (fs.existsSync(RUNS_PATH)) {
    try { runsDoc = JSON.parse(fs.readFileSync(RUNS_PATH, 'utf8')); } catch { runsDoc = { runs: [] }; }
  }
  const runs = Array.isArray(runsDoc.runs) ? runsDoc.runs : [];
  const totalRequests = runs.reduce((sum, r) => sum + (r.requests || 0), 0);

  const lines = [];
  const push = (s = '') => lines.push(s);

  push('<!-- GENERATED — rewritten by `node tools/google-coverage.mjs report`. Edits made');
  push('     directly to this file will be overwritten the next time that command runs.');
  push('     The numbers below come only from data/cache/gbcoverage.json and');
  push('     data/cache/gbcoverage-runs.json; the match-rule prose is a template literal');
  push('     in tools/google-coverage.mjs itself, so neither can drift from what the tool');
  push('     actually measured. -->');
  push();
  push('# Google Books coverage — PHI-4');
  push();

  push('## Headline');
  push();
  if (measured < population) {
    push(`**This is a ${measured}-book uniform random sample, not a census.**`);
    push();
  }
  push(`**${confirmedRate.toFixed(1)}% matched** (${matched} / ${measured}), tiers A+B+C only.`);
  push();
  push(`n = ${measured} of ${population} distinct title+author keys (${ALL_BOOKS.length} books). `
    + `95% CI ±${ci.toFixed(1)} pp (finite-population corrected).`);
  push();
  push(`Upper bound including tiers D and E ("found something, not confidently"): `
    + `**${upperBoundRate.toFixed(1)}%** (${upperBound} / ${measured}).`);
  push();

  push('## How a match was defined');
  push();
  push(MATCH_RULE_PROSE);
  push();
  push('| tier | count | share of measured |');
  push('|---|---:|---:|');
  for (const tier of ['A', 'B', 'C', 'D', 'E']) {
    push(`| ${tier} | ${tierCounts[tier]} | ${pct(tierCounts[tier], measured).toFixed(1)}% |`);
  }
  push(`| miss | ${tierCounts.miss} | ${pct(tierCounts.miss, measured).toFixed(1)}% |`);
  push();

  push('## `accessInfo.viewability` across the matched set (tiers A+B+C)');
  push();
  push('| viewability | count | share |');
  push('|---|---:|---:|');
  for (const kind of VIEWABILITY_KINDS) {
    push(`| ${kind} | ${viewability[kind]} | ${pct(viewability[kind], matched).toFixed(1)}% |`);
  }
  push(`| (field absent) | ${viewability.absent} | ${pct(viewability.absent, matched).toFixed(1)}% |`);
  push();
  push('`accessInfo.country` distribution over the same set:');
  push();
  push('| country | count | share |');
  push('|---|---:|---:|');
  for (const [country, n] of Object.entries(countries).sort((a, b) => b[1] - a[1])) {
    push(`| ${country} | ${n} | ${pct(n, matched).toFixed(1)}% |`);
  }
  push();
  push(`Viewability is jurisdiction-dependent; these numbers describe **${topCountry}**.`);
  push();

  push('## `accessInfo.embeddable`');
  push();
  push('| embeddable | count | share |');
  push('|---|---:|---:|');
  push(`| true | ${embeddable.true} | ${pct(embeddable.true, matched).toFixed(1)}% |`);
  push(`| false | ${embeddable.false} | ${pct(embeddable.false, matched).toFixed(1)}% |`);
  if (embeddable.absent) push(`| (field absent) | ${embeddable.absent} | ${pct(embeddable.absent, matched).toFixed(1)}% |`);
  push();

  push('## `volumeInfo.imageLinks`');
  push();
  push('| | count | share |');
  push('|---|---:|---:|');
  push(`| present | ${imageLinks.present} | ${pct(imageLinks.present, matched).toFixed(1)}% |`);
  push(`| — of which carries a \`thumbnail\` (not merely \`smallThumbnail\`) | ${imageLinks.thumbnail} | ${pct(imageLinks.thumbnail, imageLinks.present).toFixed(1)}% of present |`);
  push(`| absent (would need the generated spine fallback) | ${imageLinks.absent} | ${pct(imageLinks.absent, matched).toFixed(1)}% |`);
  push();

  push(`## Twenty misses (first ${misses.length} tier-null records in shuffle order)`);
  push();
  push(`Signal below is computed over all **${missSignal.n}** miss(es) measured so far, not just the `
    + `${misses.length} shown below.`);
  push();
  if (missSignal.n < MIN_MISSES_FOR_BANNER) {
    push(`*Too few misses (${missSignal.n} < ${MIN_MISSES_FOR_BANNER}) to judge whether misses look like a `
      + 'matching bug — treat this as anecdotal until more of the shelf is measured.*');
  } else if (missSignal.warn) {
    push(`**⚠ ${(missSignal.share * 100).toFixed(0)}% of misses (${missSignal.plausible}/${missSignal.n}) had a `
      + 'rejected candidate with real title-level similarity (titleScore > 0) or a tier D/E candidate. That '
      + 'looks like a matching bug on our side, not an absence from Google\'s catalogue. Do not act on the '
      + 'headline number until the rejections below have been read by hand.**');
  } else {
    push(`Most misses (${((1 - missSignal.share) * 100).toFixed(0)}%, ${missSignal.n - missSignal.plausible}/`
      + `${missSignal.n}) had no plausible rejected candidate — every candidate scored 0 on title and sat `
      + 'outside tiers D/E. The gap reads as Google\'s, not a matching bug on our side.');
  }
  push();
  for (const { t, rec } of misses) {
    push(`- **${t.title}** / ${t.author}${t.isbn ? ` (isbn ${t.isbn})` : ''}`);
    push(`  query: \`${rec.q}\` — totalItems: ${rec.totalItems}`);
    const cands = rec.miss?.candidates || [];
    if (cands.length) {
      for (const c of cands) {
        push(`  - candidate[${c.index}] "${c.title}" / ${(c.authors || []).join(', ') || '(no authors listed)'} — tier ${c.tier ?? 'null'}, score ${c.score}, ${c.why}`);
      }
    } else {
      push('  - (no candidates returned)');
    }
  }
  push();

  push('## Requests used');
  push();
  push(`Total across all runs: **${totalRequests}**.`);
  push();
  push('| date | requests | books measured | stop reason |');
  push('|---|---:|---:|---|');
  for (const r of runs) {
    push(`| ${r.startedAt} | ${r.requests} | ${r.booksMeasured} | ${r.stoppedBecause} |`);
  }
  push();

  push('## Threshold band');
  push();
  push(`Confirmed rate (A+B+C): ${confirmedRate.toFixed(1)}% — **${bandFor(confirmedRate)}**.`);
  push(`Upper bound (A+B+C+D+E): ${upperBoundRate.toFixed(1)}% — **${bandFor(upperBoundRate)}**.`);
  if (bandFor(confirmedRate) !== bandFor(upperBoundRate)) {
    push();
    push('**The confirmed rate and the upper bound fall in different bands; the decision is not yet safe to make.**');
  }
  push();

  push('## Caveats');
  push();
  push('- **ISBN confirmation is conservative.** Tier A requires the shop\'s checksum-valid ISBN-13 to appear');
  push('  verbatim in a volume\'s `industryIdentifiers`. No ISBN-10↔13 arithmetic is performed, so a volume');
  push('  carrying only an ISBN-10 record never confirms — this under-counts tier A and never over-counts it.');
  push(`- **Tier E (${tierCounts.E} record(s))** is the subtitle-corroboration guard (REVIEW-PHASE11.md\'s "Abarat"`);
  push('  guard, ported from the Wikipedia path to the Google path) firing: a head-title match whose distinctive');
  push('  subtitle isn\'t corroborated by the volume\'s own title/subtitle is demoted out of the matched set.');
  push(`- **Viewability and embeddability are jurisdiction-dependent.** These numbers describe ${topCountry},`);
  push('  the country Google\'s own geolocation returned for this run — a different request origin could read');
  push('  differently.');
  push('- **The query is plain unqualified text, not a field-restricted one, by design.** `intitle:`/`inauthor:`/');
  push('  `isbn:` were measured returning `totalItems: 0` for books unambiguously present (2026-10-03, valid key,');
  push('  HTTP 200) — a regression in Google\'s API relative to phase 11\'s run, not a bug this tool introduced.');
  push('  Reusing a field-restricted operator here would silently resurrect that false-negative factory.');
  push();

  push('## What this means');
  push();
  push('_TBD after the real harvest run._');
  push();

  fs.writeFileSync(DOC_PATH, lines.join('\n'));

  console.log(`report: ${measured} of ${population} distinct keys measured`);
  console.log(`  confirmed (A+B+C): ${matched} (${confirmedRate.toFixed(1)}%), 95% CI ±${ci.toFixed(1)} pp`);
  console.log(`  upper bound (A-E): ${upperBound} (${upperBoundRate.toFixed(1)}%)`);
  console.log(`  tiers: A=${tierCounts.A} B=${tierCounts.B} C=${tierCounts.C} D=${tierCounts.D} E=${tierCounts.E} miss=${tierCounts.miss}`);
  console.log(`  wrote ${path.relative(ROOT, DOC_PATH)}`);
}

/* ── main ──────────────────────────────────────────────────────────────
   Guarded so `import` (tools/google-coverage.test.mjs, testing the pure
   classifyQuotaResponse()) never triggers the CLI dispatcher — same trap
   google-books.mjs's header comment documents for describe.mjs, whose
   unguarded dispatcher calls process.exit(1) outside a known command and
   would kill the test process stone dead if it were ever imported. */
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const cmd = process.argv[2];
  const COMMANDS = { plan: cmdPlan, run: cmdRun, report: cmdReport };
  if (COMMANDS[cmd]) {
    await COMMANDS[cmd]();
  } else {
    console.error('usage: node tools/google-coverage.mjs <plan|run|report> [--budget N] [--pace MS] [--force] [--limit N]');
    process.exit(1);
  }
}
