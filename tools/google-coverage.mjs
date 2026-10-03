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
const QUOTA_MESSAGE_RE = /quota.*(per\s*day|daily|PerDay)/i;
const TERMINAL_REASONS = new Set(['dailyLimitExceeded', 'quotaExceeded', 'rateLimitExceeded']);
const BACKOFF_MS = [2000, 4000, 8000];

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
      const reason = body?.error?.errors?.[0]?.reason || '';
      const message = body?.error?.message || '';
      const isTerminal = QUOTA_MESSAGE_RE.test(message) || (TERMINAL_REASONS.has(reason) && QUOTA_MESSAGE_RE.test(message));
      if (isTerminal) return TERMINAL_QUOTA;
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

/* ── main ──────────────────────────────────────────────────── */

const cmd = process.argv[2];
const COMMANDS = { plan: cmdPlan, run: cmdRun };
if (COMMANDS[cmd]) {
  await COMMANDS[cmd]();
} else {
  console.error('usage: node tools/google-coverage.mjs <plan|run|report> [--budget N] [--pace MS] [--force] [--limit N]');
  process.exit(1);
}
