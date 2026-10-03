/* ============================================================
   The Google Books match rule — one copy, shared by tools/describe.mjs
   (phase 11's blurb backfill) and tools/google-coverage.mjs (PHI-4's
   coverage measurement). Pure, side-effect-free, no I/O: every function
   here takes data in and returns a verdict out. No top-level code runs
   on import, specifically so this module is safe to `import` from a
   `node --test` file — tools/describe.mjs is NOT (its CLI dispatcher
   runs at module top level and calls process.exit(1) outside a known
   command, which would kill the test process stone dead).

   Two match rules live here, deliberately kept apart:

     pickGoogleMatch()   describe.mjs's rule, moved verbatim. Powers the
                          blurb backfill. Do not alter its body — it is
                          describe.mjs's behaviour-preserving dependency
                          and `npm run describe:selftest` is the gate
                          that catches a regression (8 passed, 0 failed).

     classifyMatch()/     PHI-4's rule. Stricter and tiered (A/B/C/D/E —
     classifyVolume()     see GOOGLE-BOOKS-COVERAGE.md once generated, or
                          the plan doc, for the tier table). Does not call
                          pickGoogleMatch() and is not called by it. Two
                          divergent copies of "does this volume match the
                          book" is the exact failure mode PHI-4 exists to
                          rule out, which is why both rules are text
                          helpers over ONE normalisation (norm/bareTitle/
                          etc.) rather than two — but the decision logic
                          itself is intentionally not unified: describe.mjs
                          only ever needs a yes/no to fill in a blurb, while
                          the coverage tool needs to say WHY, at what
                          confidence, with an upper bound — a different
                          job even though both start from the same four
                          signals (title, author, isbn, subtitle).
   ============================================================ */

export const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export const lastWord = (s) => { const p = norm(s).split(' ').filter(Boolean); return p[p.length - 1] || ''; };

/** Title for comparison: subtitle and a trailing "(novel)"-style disambiguator
    dropped, leading article dropped, then normalised. Applied identically to
    the book's own title and to every candidate, so "Book Title: A Novel"
    matches a Wikipedia page titled "Book Title (novel)". */
export const bareTitle = (t) => norm(
  String(t || '').replace(/[:;–—].*$/, '').replace(/\s*\([^)]*\)\s*$/, ''),
).replace(/^(the|a|an) /, '');

/* ── the Abarat guard ─────────────────────────────────────────
   REVIEW-PHASE11.md: a book whose title extends a *series* title
   (e.g. "Abarat: Days of Magic, Nights of War") can pass the plain
   title test above by matching the first volume's page ("Abarat"),
   because bareTitle() strips the subtitle off both sides before
   comparing. That is correct for editions that only differ by
   subtitle (Moneyland's UK/US covers) and wrong for a later volume
   whose subtitle IS the book. The fix: a book title with a subtitle
   must have that subtitle corroborated somewhere on the page — not
   merely left unmentioned-and-forgiven — before the match counts. */

/** Everything after the first subtitle separator in a title, same split
    bareTitle() uses to discard it — kept here instead, minus a trailing
    "(Top Shelf Productions)"-style parenthetical, the same disambiguator
    bareTitle() strips (there, only from the already-subtitle-free head; a
    subtitle can carry one too — an imprint credit, not book content, and it
    fooled the first cut of this check into "corroborating" March: Book
    Three's mismatch against the March (comics) series page on the word
    "Productions"). '' when there is no subtitle. */
export const subtitleOf = (t) => {
  const m = String(t || '').match(/[:;–—](.*)$/);
  return m ? m[1].replace(/\s*\([^)]*\)\s*$/, '') : '';
};

/** Common function words a subtitle is mostly made of and that would match
    almost any page by accident — filtered out so what is left is actually
    distinctive. Deliberately conservative (errs toward dropping a word, not
    toward keeping one); a subtitle contributing no word at all just can't be
    checked and is skipped rather than forced to fail. */
const SUBTITLE_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'but', 'to', 'in', 'on', 'at', 'for', 'from', 'by', 'with',
  'now', 'how', 'why', 'who', 'what', 'when', 'where', 'it', 'its', 'that', 'this', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'as', 'so', 'if', 'than', 'then', 'no', 'not', 'yet',
  'all', 'more', 'most', 'some', 'any', 'into', 'over', 'under', 'up', 'down', 'out', 'off', 'again',
  'once', 'here', 'there', 'own', 'same', 'too', 'very', 'can', 'will', 'just', 'should', 'could',
  'would', 'may', 'might', 'must', 'shall', 'you', 'your', 'we', 'our', 'i', 'he', 'she', 'they', 'them',
]);

/** Genre-label words ("Stories", "A Novel", "Poems") are a subtitle in form
    only — they say what kind of book it is, not anything specific to this
    book. A page that is correctly about a story collection will not
    necessarily use the literal word "stories" (it may say "short story
    collection" instead) — so these cannot be asked to corroborate
    themselves and are excluded from "distinctive" rather than left in to
    manufacture a false rejection. */
const GENRE_LABEL_WORDS = new Set([
  'novel', 'novels', 'novella', 'novellas', 'story', 'stories', 'memoir', 'memoirs',
  'poem', 'poems', 'poetry', 'essay', 'essays', 'anthology', 'anthologies',
  'collection', 'collections', 'tale', 'tales', 'saga', 'fiction', 'nonfiction',
  'biography', 'autobiography', 'book', 'books',
]);

/** Words from a title's subtitle distinctive enough to corroborate a match:
    not a stopword, not a bare genre label, and long enough (>=4 chars) that
    a coincidental hit on an unrelated page is unlikely. */
export function distinctiveSubtitleWords(t) {
  return norm(subtitleOf(t)).split(' ')
    .filter((w) => w.length >= 4 && !SUBTITLE_STOPWORDS.has(w) && !GENRE_LABEL_WORDS.has(w));
}

/* ── describe.mjs's rule, moved verbatim ─────────────────────── */

/** Never simplify to items[0] — same trap as Hardcover's search.ids[]
    (IMPLEMENTATION.md §8.3): Google Books happily ranks a study guide or an
    abridgement above the real book. Exact bare-title match always qualifies;
    a superset/subset title only qualifies together with a confirmed author. */
export function pickGoogleMatch(items, book) {
  const want = bareTitle(book.title);
  const sn = lastWord(book.author);
  let best = null, bestScore = -1;
  for (const it of items || []) {
    const vi = it.volumeInfo || {};
    const t = bareTitle(vi.title || '');
    if (!t || !want) continue;
    let score = 0;
    if (t === want) score += 100;
    else if (t.startsWith(want) || want.startsWith(t)) score += 40;
    else continue;
    const authors = norm((vi.authors || []).join(' '));
    if (sn && authors.includes(sn)) score += 50;
    else if (authors) continue; /* right title, wrong book */
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore >= 90 ? best : null;
}

/* ── PHI-4's rule: tiered, client-side, no field-restricted query ──
   §0 of the plan: intitle:/inauthor:/isbn: all measured dead (totalItems:0)
   from this sandbox with a valid key on 2026-10-03, even for books
   unambiguously present. The query this rule scores is plain unqualified
   text (`${title} ${author}`, maxResults=20) — see tools/google-coverage.mjs
   for where that request is made. This module only scores what comes back. */

export const MATCHED_TIERS = ['A', 'B', 'C'];

function digitsOf(s) {
  return String(s || '').replace(/[^0-9]/g, '');
}

/** ISBN-13 checksum validity without importing server/openlibrary.js (this
    module must stay a pure, dependency-free leaf — see the header comment).
    Deliberately duplicated rather than shared: a tiny, well-understood
    arithmetic check, the "trivial helper in an unrelated subsystem" case the
    repo's duplication convention still allows (see describe.mjs's amended
    comment) — unlike the match rule itself, which is exactly the thing this
    module exists to stop duplicating. */
function isValidIsbn13(s) {
  const d = digitsOf(s);
  if (!/^\d{13}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(d[12]);
}

/** One candidate volume, scored against one book. Pure. */
export function classifyVolume(book, item) {
  const vi = item?.volumeInfo || {};
  const want = bareTitle(book.title);
  const t = bareTitle(vi.title || '');

  let titleScore = 0;
  if (t && want) {
    if (t === want) titleScore = 100;
    else if ((t.startsWith(want) || want.startsWith(t)) && Math.min(t.length, want.length) >= 4) titleScore = 40;
  }

  const sn = lastWord(book.author);
  const authorsNorm = norm((vi.authors || []).join(' '));
  let authorState = 'absent';
  if (authorsNorm) authorState = (sn && authorsNorm.includes(sn)) ? 'confirmed' : 'mismatch';

  const bookIsbn13 = isValidIsbn13(book.isbn) ? digitsOf(book.isbn) : null;
  const isbnConfirmed = !!bookIsbn13 && (vi.industryIdentifiers || [])
    .some((ii) => digitsOf(ii.identifier) === bookIsbn13);

  const subtitleWords = distinctiveSubtitleWords(book.title);
  let subtitleState = 'n/a';
  if (subtitleWords.length) {
    const haystack = norm(`${vi.title || ''} ${vi.subtitle || ''}`);
    subtitleState = subtitleWords.some((w) => haystack.includes(w)) ? 'corroborated' : 'uncorroborated';
  }

  let score = 0;
  if (titleScore === 100) score += 100;
  else if (titleScore === 40) score += 40;
  if (authorState === 'confirmed') score += 50;
  if (isbnConfirmed) score += 100;

  let tier = null;
  let why;
  if (titleScore === 0) {
    /* Checked FIRST, regardless of authorState: the author-mismatch
       message below ("title matched but...") is only accurate when the
       title actually matched. Author state is still worth distinguishing
       even when the title didn't, so a reader doing the report's
       hand-check sees what actually happened rather than a misleading
       "title matched" on a candidate where it didn't. */
    why = authorState === 'confirmed'
      ? 'author surname matched but the title did not'
      : 'neither title nor author matched';
  } else if (authorState === 'mismatch') {
    why = 'title matched but the listed author(s) do not include the shop\'s author surname';
  } else if (isbnConfirmed && titleScore >= 40) {
    tier = 'A';
    why = 'ISBN-13 confirmed verbatim in industryIdentifiers; title heads agree';
  } else if (subtitleState === 'uncorroborated') {
    tier = 'E';
    why = 'head title matches but the shop\'s distinctive subtitle is not corroborated by the volume\'s title/subtitle (the Abarat guard)';
  } else if (titleScore === 100 && authorState === 'confirmed') {
    tier = 'B';
    why = 'exact bare title; author surname confirmed';
  } else if (titleScore === 40 && authorState === 'confirmed') {
    tier = 'C';
    why = 'prefix-matched bare title (>=4 chars); author surname confirmed';
  } else if (titleScore === 100 && authorState === 'absent') {
    tier = 'D';
    why = 'exact bare title but the volume lists no authors to confirm';
  } else {
    why = 'no rule matched (title prefix without a confirmed author)';
  }

  return { titleScore, authorState, isbnConfirmed, subtitleState, score, tier, why };
}

const TIER_RANK = { A: 5, B: 4, C: 3, D: 2, E: 1 };

/** The whole response, reduced to one verdict. Pure. `items` may be
    undefined/empty. */
export function classifyMatch(book, items) {
  const list = items || [];
  if (!list.length) {
    return { tier: null, matched: false, index: -1, score: 0, volume: null, why: 'no results', candidates: [] };
  }

  const scored = list.map((item, index) => ({ index, item, ...classifyVolume(book, item) }));

  /* Best candidate: rank by tier (A>B>C>D>E, untiered last), then score
     descending, then Google's own index ascending. */
  let best = null;
  for (const c of scored) {
    if (!c.tier) continue;
    if (!best) { best = c; continue; }
    const cRank = TIER_RANK[c.tier], bRank = TIER_RANK[best.tier];
    if (cRank > bRank) best = c;
    else if (cRank === bRank && c.score > best.score) best = c;
    else if (cRank === bRank && c.score === best.score && c.index < best.index) best = c;
  }

  const candidates = scored.slice(0, 3).map((c) => ({
    index: c.index,
    title: c.item.volumeInfo?.title || '',
    authors: c.item.volumeInfo?.authors || [],
    tier: c.tier,
    score: c.score,
    why: c.why,
  }));

  if (!best) {
    return {
      tier: null, matched: false, index: -1, score: 0, volume: null,
      why: scored[0]?.why || 'no candidate cleared the bar',
      candidates,
    };
  }

  return {
    tier: best.tier,
    matched: MATCHED_TIERS.includes(best.tier),
    index: best.index,
    score: best.score,
    volume: best.item,
    why: best.why,
    candidates,
  };
}
