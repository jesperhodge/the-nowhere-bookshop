import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFile } from './check-no-secrets.mjs';

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

test('scanFile returns no hits (and does not throw) for a path that does not exist on disk', () => {
  assert.deepEqual(scanFile('path/that/does/not/exist.js'), []);
});

test('runs correctly (does not silently no-op) when the checker script lives under a path containing a space', () => {
  // Regression for S1: import.meta.url is percent-encoded, process.argv[1] is
  // not, so a naive string-equality entrypoint check silently skips main()
  // whenever the repo path contains a space (or other char that gets
  // percent-encoded). Build a throwaway repo under a space-containing
  // directory name, copy the checker into it, plant a fake key, and confirm
  // the checker actually runs (non-zero exit) instead of silently passing.
  const tmpRoot = path.join(repoRoot, `__s1-regression-tmp-${process.pid} probe space__`);
  try {
    mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
    copyFileSync(checkerPath, path.join(tmpRoot, 'check-no-secrets.mjs'));
    writeFileSync(
      path.join(tmpRoot, 'src', 'leak.js'),
      'export const leaked = "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE0";\n'
    );
    execFileSync('git', ['init', '--quiet'], { cwd: tmpRoot });

    let status = 0;
    try {
      execFileSync('node', [path.join(tmpRoot, 'check-no-secrets.mjs')], {
        cwd: tmpRoot,
        encoding: 'utf8',
      });
    } catch (err) {
      status = err.status;
    }
    assert.notEqual(
      status,
      0,
      'checker must actually run (and fail on the planted key) even when its own path contains a space'
    );
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
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
