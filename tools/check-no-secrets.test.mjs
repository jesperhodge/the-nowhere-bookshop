import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const checkerPath = path.join(here, 'check-no-secrets.mjs');

function runChecker() {
  try {
    const stdout = execFileSync('node', [checkerPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('exits non-zero and never echoes the value when a key-shaped string is planted in a scanned path', () => {
  const fakeKey = 'AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE0';
  const plantedPath = path.join(repoRoot, 'src', '__check-no-secrets-regression-tmp__.js');
  writeFileSync(plantedPath, `export const leaked = "${fakeKey}";\n`);
  try {
    const result = runChecker();
    assert.notEqual(result.status, 0, 'checker must fail when a Google API key shape is present');
    assert.ok(!result.stdout.includes(fakeKey), 'stdout must never contain the matched secret value');
    assert.ok(!result.stderr.includes(fakeKey), 'stderr must never contain the matched secret value');
  } finally {
    unlinkSync(plantedPath);
  }
});

test('exits zero against the real tree as it stands today', () => {
  const result = runChecker();
  assert.equal(result.status, 0, `checker should pass on a clean tree, stderr was: ${result.stderr}`);
});

const assignmentCases = [
  { name: 'GOOGLE_BOOKS_KEY with a non-empty value', content: 'GOOGLE_BOOKS_KEY=realvalue123\n', expectNonZero: true },
  { name: 'HARDCOVER_TOKEN with a non-empty value', content: 'HARDCOVER_TOKEN=Bearer abc123\n', expectNonZero: true },
  { name: 'GOOGLE_BOOKS_KEY with an empty value', content: 'GOOGLE_BOOKS_KEY=\n', expectNonZero: false },
  { name: 'HARDCOVER_TOKEN with an empty value', content: 'HARDCOVER_TOKEN=\n', expectNonZero: false },
];

for (const { name, content, expectNonZero } of assignmentCases) {
  test(`assignment pattern: ${name}`, () => {
    const plantedPath = path.join(repoRoot, 'src', '__check-no-secrets-regression-tmp__.js');
    writeFileSync(plantedPath, content);
    try {
      const result = runChecker();
      if (expectNonZero) {
        assert.notEqual(result.status, 0, `checker must fail for ${name}`);
      } else {
        assert.equal(result.status, 0, `checker must pass for ${name}, stderr was: ${result.stderr}`);
      }
    } finally {
      unlinkSync(plantedPath);
    }
  });
}
