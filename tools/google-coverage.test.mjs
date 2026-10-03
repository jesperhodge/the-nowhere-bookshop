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
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyQuotaResponse } from './google-coverage.mjs';

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
