/* ============================================================
   Review-finding regression tests for tools/google-coverage.mjs's pure,
   exported helpers — no network, no API key, no cache on disk touched.

   google-coverage.mjs is a CLI dispatcher (like describe.mjs — see
   google-books.mjs's header comment for the trap this is avoiding): its
   top-level code is guarded with an `isMainModule` check specifically so
   this file can `import` it without triggering `plan`/`run`/`report` or
   the dispatcher's `process.exit(1)` on an unrecognised command.

     classifyQuotaResponse()  review finding 1 — terminal vs transient
                              quota classification. Cases below.
     missBugSignal()          review finding 2 — the "misses look like a
                              matching bug" banner's underlying statistic,
                              computed over an array of miss records
                              (finding 5: must be the FULL miss population,
                              not just the capped display sample — wired
                              up in cmdReport in tools/google-coverage.mjs;
                              this file only tests the pure reducer).
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyQuotaResponse, missBugSignal } from './google-coverage.mjs';

test('classifyQuotaResponse — real "Daily Limit Exceeded" payload (Daily precedes quota) is terminal', () => {
  const body = {
    error: {
      code: 429,
      message: 'Daily Limit Exceeded. The quota will be reset at midnight Pacific Time (PT). You may monitor '
        + 'your quota usage and adjust limits in the API Console: '
        + 'https://console.developers.google.com/apis/api/books.googleapis.com/quotas?project=...',
      errors: [{
        message: 'Daily Limit Exceeded. The quota will be reset at midnight Pacific Time (PT).',
        domain: 'usageLimits',
        reason: 'dailyLimitExceeded',
      }],
      status: 'RESOURCE_EXHAUSTED',
    },
  };
  assert.equal(classifyQuotaResponse(429, body), 'terminal');
});

test('classifyQuotaResponse — real captured payload: reason says rateLimitExceeded but message says per-day quota (terminal)', () => {
  // Real Google Books API payload: the `reason` field is misleading on its
  // own here — this is a daily-quota exhaustion, but Google labels the
  // reason the same as its per-minute limit. Only the message disambiguates.
  const body = {
    error: {
      code: 429,
      message: "Quota exceeded for quota metric 'Queries' and limit 'Queries per day' of service "
        + "'books.googleapis.com' for consumer 'project_number:...'.",
      errors: [{
        message: "Quota exceeded for quota metric 'Queries' and limit 'Queries per day' of service "
          + "'books.googleapis.com' for consumer 'project_number:...'.",
        domain: 'usageLimits',
        reason: 'rateLimitExceeded',
      }],
      status: 'RESOURCE_EXHAUSTED',
    },
  };
  assert.equal(classifyQuotaResponse(429, body), 'terminal');
});

test('classifyQuotaResponse — genuine per-minute rate limit (reason and message both say so, no daily wording) is transient', () => {
  const body = {
    error: {
      code: 429,
      message: 'Rate Limit Exceeded',
      errors: [{ message: 'Rate Limit Exceeded', domain: 'usageLimits', reason: 'rateLimitExceeded' }],
      status: 'RESOURCE_EXHAUSTED',
    },
  };
  assert.equal(classifyQuotaResponse(429, body), 'transient');
});

test('classifyQuotaResponse — a plain 503 with no parseable error body is transient', () => {
  assert.equal(classifyQuotaResponse(503, null), 'transient');
});

test('classifyQuotaResponse — a 2xx is not applicable (null)', () => {
  assert.equal(classifyQuotaResponse(200, null), null);
});

/* ── missBugSignal — review findings 2 and 5 ──────────────────────────── */

function missOf(candidates) {
  return { reason: candidates.length ? 'rejected' : 'no results', candidates };
}

test('missBugSignal — every candidate scored 0 on title and sits outside tiers D/E: does NOT warn (genuine absences)', () => {
  const misses = [
    missOf([{ index: 0, title: 'Unrelated Book One', tier: null, score: 0, titleScore: 0, why: 'title mismatch' }]),
    missOf([{ index: 0, title: 'Unrelated Book Two', tier: null, score: 0, titleScore: 0, why: 'title mismatch' }]),
    missOf([]), // "no results" — zero candidates at all
    missOf([{ index: 0, title: 'Unrelated Book Three', tier: null, score: 0, titleScore: 0, why: 'title mismatch' }]),
    missOf([{ index: 0, title: 'Unrelated Book Four', tier: null, score: 0, titleScore: 0, why: 'title mismatch' }]),
    missOf([{ index: 0, title: 'Unrelated Book Five', tier: null, score: 0, titleScore: 0, why: 'title mismatch' }]),
    missOf([{ index: 0, title: 'Unrelated Book Six', tier: null, score: 0, titleScore: 0, why: 'title mismatch' }]),
    missOf([{ index: 0, title: 'Unrelated Book Seven', tier: null, score: 0, titleScore: 0, why: 'title mismatch' }]),
    missOf([{ index: 0, title: 'Unrelated Book Eight', tier: null, score: 0, titleScore: 0, why: 'title mismatch' }]),
    missOf([{ index: 0, title: 'Unrelated Book Nine', tier: null, score: 0, titleScore: 0, why: 'title mismatch' }]),
  ];
  const signal = missBugSignal(misses);
  assert.equal(signal.n, 10);
  assert.equal(signal.plausible, 0);
  assert.equal(signal.warn, false);
});

test('missBugSignal — most misses have a titleScore>0 or tier D/E candidate: DOES warn', () => {
  const plausibleMiss = () => missOf([
    { index: 0, title: 'Right Title Wrong Author', tier: null, score: 100, titleScore: 100, why: 'title matched but the listed author(s) do not include the shop\'s author surname' },
  ]);
  const genuineMiss = () => missOf([
    { index: 0, title: 'Unrelated', tier: null, score: 0, titleScore: 0, why: 'title mismatch' },
  ]);
  const misses = [
    plausibleMiss(), plausibleMiss(), plausibleMiss(), plausibleMiss(), plausibleMiss(),
    plausibleMiss(), plausibleMiss(),
    genuineMiss(), genuineMiss(), genuineMiss(),
  ];
  const signal = missBugSignal(misses);
  assert.equal(signal.n, 10);
  assert.equal(signal.plausible, 7);
  assert.equal(signal.warn, true);
});

test('missBugSignal — below the minimum-n guard, never warns even at 100% plausible (small samples don\'t swing it)', () => {
  const misses = [
    missOf([{ index: 0, title: 'x', tier: null, score: 100, titleScore: 100, why: 'title matched but ...' }]),
  ];
  const signal = missBugSignal(misses);
  assert.equal(signal.n, 1);
  assert.equal(signal.plausible, 1);
  assert.equal(signal.warn, false, 'a single bad miss must not swing the banner to firing');
});

test('missBugSignal — a tier D/E rejected candidate counts as plausible even with titleScore 0', () => {
  const misses = [];
  for (let i = 0; i < 9; i++) {
    misses.push(missOf([{ index: 0, title: 'x', tier: null, score: 0, titleScore: 0, why: 'title mismatch' }]));
  }
  misses.push(missOf([{ index: 0, title: 'x', tier: 'D', score: 100, titleScore: 100, why: 'exact bare title but no authors listed' }]));
  const signal = missBugSignal(misses);
  assert.equal(signal.n, 10);
  assert.equal(signal.plausible, 1);
  assert.equal(signal.warn, false, '1/10 is below the 50% share threshold even though the guard is satisfied');
});
