/* ============================================================
   Loads and validates shop/config.js.

   shop/config.js is edited by hand, by a trusted person — but the
   *values* in it (a shop's name, logo path, buy-link templates,
   brand colours) are realistically "pasted from a website by a
   hurried stranger," not typed with an attacker's mindset. This
   file is the one place that distrust is paid off: every field is
   treated as untrusted input and validated before anything in the
   browser ever reads it. Two controls matter enough to name:

     F1 — path/URL injection. `logo`, `contact.url` and the two
          `store.*Search` templates are the fields that become a
          <script src>, an <a href>, or get interpolated into a
          URL. A bad value here is a way to point the page at
          `javascript:`, a scheme-relative host (`//evil.example/..`),
          or a path outside shop/assets/. See `safeUrl()` and
          `validateLogo()`.
     F2 — markup/attribute injection. Anything that lands in
          rendered HTML (colours used in inline styles, any free
          text string) must not be able to break out of its
          attribute/text context. The generic string rule (length
          cap + type check) doesn't *sanitise* — the renderer is
          still responsible for escaping on output — but it does
          mean nothing arbitrarily long or wrongly-typed reaches
          that renderer.

   The rule throughout: fail closed to a documented default, never
   throw, never pass a rejected value through "cleaned up." A
   rejected value is logged (so a shop owner can find out their
   logo didn't take) and replaced with something inert.

   validateConfig() is pure and takes no dependency on shop/config.js
   itself, so it's trivial to unit-test with made-up fixtures (see
   tests/shopconfig.test.mjs). Only the default export at the
   bottom of this file wires it to the real file.
   ============================================================ */

import { LIST_BY_SLUG } from '../../tools/lists.js';

// tools/lists.js has zero imports of its own (pure data), so pulling it in
// here doesn't drag any Node built-ins into a browser-loaded module. BUT:
// tools/ is not in vercel.json's static `builds` allowlist (only index.html,
// src/**, vendor/** and api/index.js are). Once a later step wires this file
// into the actual deployed page, this import will 404 in production. That's
// a known gap for whoever does that wiring — not fixed here, since adding
// tools/** to vercel.json's builds wasn't in scope for this slice.

const ID_RE = /^[a-z0-9-]{1,32}$/;
const LOGO_RE = /^[A-Za-z0-9._/-]{1,128}$/;
const COLOUR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const TEMPLATE_TOKEN_RE = /\{([^}]*)\}/g;
const VALID_TEMPLATE_TOKENS = new Set(['isbn', 'title', 'author']);
const MAX_STRING_LEN = 120;
const MAX_CATEGORIES = 11;

// Today's repo bundles exactly two font families (see index.html / vendor
// fonts). This allowlist is intentionally narrow for now — it widens only
// when new font files are actually added to the build, not before.
const BUNDLED_FONTS = ['Fraunces', 'Inter'];
const DEFAULT_FONT = { display: 'Fraunces', body: 'Inter' };

// The loader's own fallback palette — distinct from any shop's branding,
// used only when a colour field fails validation.
const DEFAULT_COLOURS = { primary: '#333333', accent: '#999999', neutral: '#f4efe6' };

function defaultOnReject(path, reason) {
  console.warn('[shopconfig] rejected ' + path + ': ' + reason);
}

/**
 * Returns `raw` unchanged if it parses as a URL AND its protocol is exactly
 * `https:`; otherwise null. `new URL` alone would accept `http:`, `ftp:`,
 * `javascript:` and so on (it only errors on things it can't parse at all),
 * so the explicit protocol check is the control, not the parse itself.
 */
export function safeUrl(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return url.protocol === 'https:' ? raw : null;
}

function isValidId(value) {
  return typeof value === 'string' && ID_RE.test(value);
}

function validateTopLevelId(value, onReject) {
  if (isValidId(value)) return value;
  onReject('id', 'invalid shop id, defaulted');
  return 'shop';
}

function validateLogo(value, onReject) {
  // absent/null means "no logo configured" — an expected, non-error state,
  // not a rejection, so it is not logged.
  if (value === undefined || value === null) return null;
  if (
    typeof value === 'string' &&
    LOGO_RE.test(value) &&
    !value.includes('..') &&
    !value.startsWith('/') && // catches both `/etc/passwd`-shaped paths AND
    // scheme-relative URLs like `//evil.example/x.svg` — the char class
    // alone would wrongly accept the latter (`/`, `.` and alnum are all it
    // checks), so this leading-slash check is the fix for that bypass, not
    // a redundant belt-and-braces check.
    value.startsWith('assets/')
  ) {
    return value;
  }
  onReject('logo', 'invalid logo path, defaulted to no-logo');
  return null;
}

function validateColours(raw, onReject) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const result = {};
  for (const key of /** @type {const} */ (['primary', 'accent', 'neutral'])) {
    const value = src[key];
    if (typeof value === 'string' && COLOUR_RE.test(value)) {
      result[key] = value;
    } else {
      onReject(`colours.${key}`, 'invalid colour, defaulted');
      result[key] = DEFAULT_COLOURS[key];
    }
  }
  return result;
}

function validateFont(raw, onReject) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const result = {};
  for (const key of /** @type {const} */ (['display', 'body'])) {
    const value = src[key];
    if (typeof value === 'string' && BUNDLED_FONTS.includes(value)) {
      result[key] = value;
    } else {
      onReject(`font.${key}`, 'not a bundled font, defaulted');
      result[key] = DEFAULT_FONT[key];
    }
  }
  return result;
}

function validateContactUrl(value, onReject) {
  // '' (and absent) is a valid "not provided" state — silent, not logged.
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    onReject('contact.url', 'not a string, defaulted');
    return null;
  }
  const safe = safeUrl(value);
  if (safe === null) {
    onReject('contact.url', 'unsafe or non-https url, defaulted');
    return null;
  }
  return safe;
}

/**
 * A store search template is required — every shop needs at least a
 * non-functional buy-link template, and a missing one is a real rejection
 * (logged), not a quiet omission. Validates the placeholder tokens are all
 * one of isbn/title/author, then builds a probe by substituting each valid
 * placeholder with the literal "x" and runs safeUrl() on the probe — this
 * is a shape check on the template, not a check of what any real ISBN/title
 * will encode to at render time.
 */
function validateTemplate(value, path, onReject) {
  if (typeof value !== 'string' || value === '') {
    onReject(path, 'missing or empty template, defaulted');
    return null;
  }

  let tokensOk = true;
  TEMPLATE_TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = TEMPLATE_TOKEN_RE.exec(value))) {
    if (!VALID_TEMPLATE_TOKENS.has(match[1])) {
      tokensOk = false;
      break;
    }
  }

  const probe = value.replace(TEMPLATE_TOKEN_RE, 'x');
  // if a brace is malformed (unclosed, stray, nested) it won't have been
  // consumed by the substitution above, so it still shows up in the probe.
  if (tokensOk && /[{}]/.test(probe)) tokensOk = false;

  if (!tokensOk || safeUrl(probe) === null) {
    onReject(path, 'invalid template, defaulted');
    return null;
  }
  return value;
}

function isValidIsbn13(value) {
  if (typeof value !== 'string' || !/^\d{13}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(value[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(value[12]);
}

function validateIsbns(raw, onReject) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  raw.forEach((entry, i) => {
    if (isValidIsbn13(entry)) {
      result.push(entry);
    } else {
      onReject(`frontTable.isbns.${i}`, 'invalid ISBN-13, dropped');
    }
  });
  return result;
}

/**
 * Categories are dropped (not defaulted) when their id is bad or a dupe.
 * `name`/`line` are left untouched here — they go through the generic
 * string rule in the config-wide walk below, same as every other
 * never-specifically-named string. `prizes` are validated against
 * tools/lists.js's real slugs; unknown slugs are dropped individually,
 * the category survives even if that leaves it with zero prizes.
 *
 * Returns the validated array plus the set of output paths (exact,
 * post-drop indices) that the walk should NOT re-touch, because this
 * function already gave them their final value (id, prizes).
 */
function validateCategories(raw, onReject, exclude) {
  if (!Array.isArray(raw)) return [];

  let entries = raw;
  if (entries.length > MAX_CATEGORIES) {
    onReject('categories', `more than ${MAX_CATEGORIES} entries, extras dropped`);
    entries = entries.slice(0, MAX_CATEGORIES);
  }

  const seenIds = new Set();
  const result = [];

  for (const cat of entries) {
    if (!cat || typeof cat !== 'object') continue;

    const id = cat.id;
    if (!isValidId(id)) {
      onReject('categories[].id', 'invalid category id, category dropped');
      continue;
    }
    if (seenIds.has(id)) {
      onReject('categories[].id', 'duplicate category id, category dropped');
      continue;
    }
    seenIds.add(id);

    let prizesRaw;
    if (cat.prizes === undefined) {
      prizesRaw = [];
    } else if (Array.isArray(cat.prizes)) {
      prizesRaw = cat.prizes;
    } else {
      onReject(`categories.${id}.prizes`, 'not an array, defaulted to empty');
      prizesRaw = [];
    }

    const outIndex = result.length;
    const prizes = [];
    prizesRaw.forEach((slug, slugIdx) => {
      if (typeof slug === 'string' && Object.prototype.hasOwnProperty.call(LIST_BY_SLUG, slug)) {
        prizes.push(slug);
      } else {
        onReject(`categories.${outIndex}.prizes.${slugIdx}`, 'unknown prize slug, dropped');
      }
    });

    result.push({ id, name: cat.name, line: cat.line, prizes });
    exclude.add(`categories.${outIndex}.id`);
    exclude.add(`categories.${outIndex}.prizes`);
  }

  return result;
}

/**
 * The generic string rule, applied structurally: any string leaf not
 * already excluded (because a stricter, field-specific rule upstream
 * already validated it) must be a string — non-strings are replaced with
 * '' and logged — and no longer than MAX_STRING_LEN — longer ones are
 * truncated (not defaulted) and logged. This is deliberately a walk over
 * whatever shape the object actually has, not an enumeration of known key
 * names, so a field added to the schema later without its own rule still
 * gets this one automatically.
 */
function walk(value, path, exclude, onReject) {
  if (Array.isArray(value)) {
    return value.map((item, i) => walk(item, path ? `${path}.${i}` : String(i), exclude, onReject));
  }
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      const childPath = path ? `${path}.${key}` : key;
      result[key] = exclude.has(childPath) ? value[key] : walk(value[key], childPath, exclude, onReject);
    }
    return result;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LEN) {
      onReject(path, `string exceeds ${MAX_STRING_LEN} characters, truncated`);
      return value.slice(0, MAX_STRING_LEN);
    }
    return value;
  }
  if (value === undefined || value === null) return value;
  onReject(path, 'expected a string, defaulted');
  return '';
}

/**
 * Validates a raw shop config object against every rule above. Pure: does
 * not mutate `raw`, does not import shop/config.js, never throws. Returns a
 * new plain object. `opts.onReject(path, reason)` fires exactly once per
 * rejected/corrected field; defaults to a console.warn.
 */
export function validateConfig(raw, opts = {}) {
  const onReject = opts.onReject || defaultOnReject;
  const input = raw && typeof raw === 'object' ? raw : {};
  const out = structuredClone(input);
  const exclude = new Set();

  out.id = validateTopLevelId(input.id, onReject);
  exclude.add('id');

  out.logo = validateLogo(input.logo, onReject);
  exclude.add('logo');

  out.colours = validateColours(input.colours, onReject);
  exclude.add('colours.primary');
  exclude.add('colours.accent');
  exclude.add('colours.neutral');

  out.font = validateFont(input.font, onReject);
  exclude.add('font.display');
  exclude.add('font.body');

  if (!out.contact || typeof out.contact !== 'object') out.contact = {};
  out.contact.url = validateContactUrl(input.contact && input.contact.url, onReject);
  exclude.add('contact.url');

  if (!out.store || typeof out.store !== 'object') out.store = {};
  out.store.isbnSearch = validateTemplate(input.store && input.store.isbnSearch, 'store.isbnSearch', onReject);
  out.store.titleSearch = validateTemplate(input.store && input.store.titleSearch, 'store.titleSearch', onReject);
  exclude.add('store.isbnSearch');
  exclude.add('store.titleSearch');

  if (!out.frontTable || typeof out.frontTable !== 'object') out.frontTable = {};
  out.frontTable.isbns = validateIsbns(input.frontTable && input.frontTable.isbns, onReject);
  exclude.add('frontTable.isbns');

  out.categories = validateCategories(input.categories, onReject, exclude);

  return walk(out, '', exclude, onReject);
}

import RAW_CONFIG from '../../shop/config.js';
const CONFIG = Object.freeze(validateConfig(RAW_CONFIG));
export default CONFIG;
