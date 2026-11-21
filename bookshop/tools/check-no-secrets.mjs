#!/usr/bin/env node
// Build-time guard for owner rule 1: the Google Books API key (or any
// Hardcover token) must never reach git. Run via `npm test`; exits non-zero
// on a hit so CI/local runs fail loudly without ever echoing the match.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Paths relative to the site root (where `npm test` runs): everything Vercel
// serves, plus the bookshop's data the function bundles.
const SCAN_ROOTS = ['index.html', 'home', 'bookshop/index.html', 'bookshop/src', 'bookshop/vendor', 'bookshop/data'];

const PATTERNS = [
  { label: 'Google API key shape', re: /AIza[0-9A-Za-z_-]{20,}/ },
  { label: 'GOOGLE_BOOKS_KEY assignment', re: /GOOGLE_BOOKS_KEY\s*=\s*\S+/ },
  { label: 'HARDCOVER_TOKEN assignment', re: /HARDCOVER_TOKEN\s*=\s*\S+/ },
];

// `--cached --others --exclude-standard` lists tracked files plus untracked
// files that aren't gitignored — i.e. everything a commit could plausibly
// pick up next, while skipping node_modules/.git and anything gitignored
// (data/cache/wiki/, data/cache/describe/, etc.) for free.
export function listScannedFiles(roots = SCAN_ROOTS, cwd = process.cwd()) {
  // `-z` NUL-terminates entries and unconditionally disables path quoting —
  // unlike setting core.quotePath=false, it doesn't depend on repo config a
  // fresh clone wouldn't inherit. Without it, core.quotePath's default of
  // true (unset in this repo) C-quotes any path with a byte above 0x7F, a
  // backslash, a double-quote, or a newline, and that literal quoted string
  // then fails to resolve to a real file on disk (see SG-1).
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...roots],
    { cwd, encoding: 'utf8' }
  );
  return out.split('\0').filter(Boolean);
}

function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

export function scanFile(relativePath, cwd = process.cwd(), onSkip) {
  const hits = [];
  let buffer;
  try {
    buffer = readFileSync(`${cwd}/${relativePath}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      if (onSkip) onSkip(relativePath); // staged-for-delete, nothing on disk
      return hits;
    }
    throw err;
  }
  if (isBinary(buffer)) return hits;
  const lines = buffer.toString('utf8').split('\n');
  lines.forEach((line, index) => {
    for (const { label, re } of PATTERNS) {
      if (re.test(line)) {
        hits.push({ path: relativePath, line: index + 1, label });
      }
    }
  });
  return hits;
}

export function findSecrets(roots = SCAN_ROOTS, cwd = process.cwd()) {
  let skipped = 0;
  const hits = listScannedFiles(roots, cwd).flatMap((path) =>
    scanFile(path, cwd, () => {
      skipped += 1;
    })
  );
  return { hits, skipped };
}

function main() {
  const { hits, skipped } = findSecrets();
  if (hits.length === 0) {
    const skipNote = skipped > 0 ? ` (${skipped} listed path(s) skipped: not found on disk)` : '';
    console.log(`check-no-secrets: clean (${SCAN_ROOTS.join(', ')})${skipNote}.`);
    return 0;
  }
  console.error(`check-no-secrets: found ${hits.length} possible secret(s):`);
  for (const hit of hits) {
    console.error(`  ${hit.path}:${hit.line} — ${hit.label}`);
  }
  console.error('Matched value withheld on purpose — do not print it, rotate it.');
  return 1;
}

if (import.meta.filename === process.argv[1]) {
  process.exitCode = main();
}
