/* ============================================================
   PHI-4's match rule, exercised offline against fixtures — no network,
   no API key. Two fixtures:

     tools/fixtures/gbcoverage-match-sample.json   classifyMatch()/
       classifyVolume() — the tiered coverage rule (cases 1-11 below).
     tools/fixtures/googlebooks-sample.json        pickGoogleMatch(),
       re-exported unchanged from describe.mjs (case 12) — proves the
       move into this module did not change describe.mjs's behaviour.

   Cases 8 and 9 are a matched pair and are permanent regression tests
   for the Abarat guard (REVIEW-PHASE11.md), ported from the Wikipedia
   path to the Google path: 8 proves the guard fires (a later series
   volume must not match volume one), 9 proves it does not over-reject
   (a genuinely different edition subtitle must still match).
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyMatch, classifyVolume, pickGoogleMatch } from './google-books.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const fixture = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tools/fixtures/gbcoverage-match-sample.json'), 'utf8'),
);

function findCase(name) {
  const c = fixture.cases.find((x) => x.name === name);
  if (!c) throw new Error(`fixture case not found: ${name}`);
  return c;
}

for (const c of fixture.cases) {
  test(`classifyMatch — ${c.name}`, () => {
    const result = classifyMatch(c.book, c.items);
    assert.equal(result.tier, c.expectTier);
    assert.equal(result.matched, c.expectMatched);
    assert.equal(result.index, c.expectIndex);
    if (c.expectWhyContains) assert.ok(result.why.includes(c.expectWhyContains), `why "${result.why}" does not contain "${c.expectWhyContains}"`);
    if (c.expectWhyEquals) assert.equal(result.why, c.expectWhyEquals);
    if (c.expectCandidatesLength !== undefined) assert.equal(result.candidates.length, c.expectCandidatesLength);
    if (c.expectWinnerIsbnConfirmed !== undefined) {
      const winnerItem = c.items[result.index];
      const v = classifyVolume(c.book, winnerItem);
      assert.equal(v.isbnConfirmed, c.expectWinnerIsbnConfirmed);
    }
  });
}

test('classifyMatch — series volume does not match volume one (Abarat) — permanent regression', () => {
  const c = findCase('series volume does not match volume one (Abarat)');
  const result = classifyMatch(c.book, c.items);
  assert.equal(result.tier, 'E');
  assert.equal(result.matched, false);
});

test('classifyMatch — genuinely different edition subtitle still matches (Moneyland) — permanent regression', () => {
  const c = findCase('genuinely different edition subtitle still matches (Moneyland)');
  const result = classifyMatch(c.book, c.items);
  assert.equal(result.tier, 'B');
  assert.equal(result.matched, true);
});

test('classifyVolume — titleScore 0 with a mismatched author must not claim "title matched" (review finding 3)', () => {
  const book = { title: 'Completely Unrelated Title Words', author: 'Fixture Author' };
  const item = { volumeInfo: { title: 'Totally Different Book', authors: ['Someone Else'] } };
  const v = classifyVolume(book, item);
  assert.equal(v.titleScore, 0);
  assert.equal(v.authorState, 'mismatch');
  assert.equal(v.tier, null);
  assert.ok(!v.why.includes('title matched'), `why "${v.why}" wrongly claims the title matched`);
  assert.equal(v.why, 'neither title nor author matched');
});

test('classifyVolume — titleScore 0 with a confirmed author describes it accurately too', () => {
  const book = { title: 'Completely Unrelated Title Words', author: 'Fixture Author' };
  const item = { volumeInfo: { title: 'Totally Different Book', authors: ['Fixture Author'] } };
  const v = classifyVolume(book, item);
  assert.equal(v.titleScore, 0);
  assert.equal(v.authorState, 'confirmed');
  assert.equal(v.tier, null);
  assert.ok(!v.why.includes('title matched'), `why "${v.why}" wrongly claims the title matched`);
  assert.equal(v.why, 'author surname matched but the title did not');
});

test('pickGoogleMatch is unchanged by the move into google-books.mjs', () => {
  const gbFixture = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'tools/fixtures/googlebooks-sample.json'), 'utf8'),
  );
  const nonIsbnCases = gbFixture.cases.filter((t) => t.isbn === false);
  assert.equal(nonIsbnCases.length, 3, 'expected three isbn:false cases in the existing describe.mjs fixture');
  for (const t of nonIsbnCases) {
    const items = t.response.items || [];
    const match = pickGoogleMatch(items, t.book);
    const accepted = !!match;
    assert.equal(accepted, t.expectAccepted, t.name);
  }
});
