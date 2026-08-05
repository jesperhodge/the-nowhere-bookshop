/* ============================================================
   A wikitext table reader.

   Every award list phase 9 harvests is a MediaWiki table, and all
   of them lean on the same two things a naive line-splitter gets
   wrong:

     - `rowspan` carries the year (and often the award category)
       down a whole block of rows, so row N's "Year" cell is
       physically written twenty rows earlier;
     - a cell's text is wiki markup, not text: `{{sortname|P. H.|
       Newby|link=P. H. Newby}}`, `{{sort|Clone|[[The Clone
       (novel)|''The Clone'']]}}`, refs, footnote templates.

   So: parse to a grid with HTML rowspan/colspan semantics, then
   flatten each cell to plain text. Nothing here knows what an
   award is — tools/lists.js decides which column means what.

   Deliberately conservative. Anything it cannot read confidently
   it drops and counts, because a mis-parsed row becomes a book
   that looks exactly like a correctly parsed one.
   ============================================================ */

/* ── splitting that respects wiki nesting ──────────────────────
   `[[A|B]]` and `{{t|x|y}}` both use `|` internally, so a plain
   String.split('|') tears them in half. Depth-aware, and it is
   the same routine for template params and for `||` cell breaks. */
function splitTop(s, sep) {
  const out = [];
  let depth = 0, buf = '', i = 0;
  while (i < s.length) {
    const two = s.slice(i, i + 2);
    if (two === '[[' || two === '{{') { depth++; buf += two; i += 2; continue; }
    if (two === ']]' || two === '}}') { depth = Math.max(0, depth - 1); buf += two; i += 2; continue; }
    if (depth === 0 && s.startsWith(sep, i)) { out.push(buf); buf = ''; i += sep.length; continue; }
    buf += s[i]; i++;
  }
  out.push(buf);
  return out;
}

/* ── templates ─────────────────────────────────────────────────
   Expanded innermost-first, so by the time a handler runs its own
   argument list contains no further `{{`. Unknown templates are
   dropped rather than guessed at: an unrendered `{{cite book|…}}`
   left in a title is worse than a title that is simply shorter. */
const TEMPLATES = {
  /* {{sortname|First|Last}}, {{sortname|First|Last|Link}},
     {{sortname|last=Faulkner|first=William}} and
     {{sortname|2=Man with the Golden Arm|1=The|link=…}} are all the
     same template and all four appear in these pages. Renders
     "first last" — getting the order from the *names* rather than
     from position is the whole reason parseParams() exists. */
  sortname: (p) => [p.named.first ?? p.pos[0], p.named.last ?? p.pos[1]]
    .filter((x) => x && String(x).trim()).join(' '),
  /* {{sort|sortkey|what is actually displayed}} */
  sort: (p) => p.pos[1] ?? '',
  dts: (p) => p.pos[0] ?? '',
  nowrap: (p) => p.pos[0] ?? '',
  nobr: (p) => p.pos[0] ?? '',
  small: (p) => p.pos[0] ?? '',
  lang: (p) => p.pos[1] ?? '',
  'lang-en': (p) => p.pos[0] ?? '',
  transliteration: (p) => p.pos[1] ?? '',
  transl: (p) => p.pos[1] ?? '',
  ill: (p) => p.pos[0] ?? '',
  interlanguage_link: (p) => p.pos[0] ?? '',
  'interlanguage link': (p) => p.pos[0] ?? '',
  okina: () => 'ʻ',
  "'": () => "'",
  "'s": () => "'s",
  ndash: () => '–',
  mdash: () => '—',
  spaced_ndash: () => ' – ',
  snd: () => ' – ',
  nbsp: () => ' ',
  '·': () => ' · ',
  abbr: (p) => p.pos[0] ?? '',
  abbreviation: (p) => p.pos[0] ?? '',
  yes: (p) => p.pos[0] || 'Yes',
  no: (p) => p.pos[0] || 'No',
  won: () => 'Won',
  win: () => 'Won',
  nom: () => 'Nominated',
};

/** Template arguments: positional, named, and `1=`/`2=` which are both. */
function parseParams(parts) {
  const pos = [];
  const named = Object.create(null);
  for (const raw of parts) {
    const m = /^\s*([A-Za-z0-9_ -]{1,24}?)\s*=\s*([\s\S]*)$/.exec(raw);
    if (m) named[m[1].trim().toLowerCase()] = m[2].trim();
    else pos.push(raw.trim());
  }
  for (const k of Object.keys(named)) {
    if (/^\d+$/.test(k)) pos[Number(k) - 1] = named[k];
  }
  return { pos, named };
}
/* dropped entirely — footnotes, citations, maintenance tags */
const DROP = /^(efn|efn-\w+|notetag|note|ref|refn|sfn|cite[\s_]|citation|r|nowiki|sronly|screen[\s_]?reader|reflist|as[\s_]of|when|who|clarify|citation[\s_]needed|cn|dead[\s_]link|update|sic|circa|c\.)/i;

function expandTemplates(s) {
  let out = s, guard = 0;
  /* innermost first: a {{…}} containing no further {{ */
  const inner = /\{\{([^{}]*)\}\}/;
  while (inner.test(out) && guard++ < 200) {
    out = out.replace(inner, (_m, body) => {
      const parts = splitTop(body, '|');
      const name = (parts[0] || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (DROP.test(name)) return '';
      const p = parseParams(parts.slice(1));
      const fn = TEMPLATES[name] ?? TEMPLATES[name.replace(/\s/g, '_')];
      if (fn) return fn(p);
      /* unknown: keep the longest positional parameter if it looks
         like prose, otherwise drop. Covers the long tail of
         one-off formatting templates without inventing anything. */
      const best = p.pos.filter(Boolean).sort((a, b) => b.length - a.length)[0] || '';
      return /^[\w'"([]/.test(best) && best.length > 2 ? best : '';
    });
  }
  return out;
}

/** Wiki markup → plain text. */
export function cellText(raw) {
  let s = String(raw ?? '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<ref[^>]*\/>/gi, '');
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  s = expandTemplates(s);
  s = s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');      // [[A|B]] → B
  s = s.replace(/\[\[([^\]]*)\]\]/g, '$1');                  // [[A]]   → A
  s = s.replace(/\[(?:https?|\/\/)\S+\s+([^\]]*)\]/g, '$1'); // [url text]
  s = s.replace(/\[(?:https?|\/\/)\S+\]/g, '');
  s = s.replace(/<br\s*\/?>/gi, ' / ');
  s = s.replace(/<\/?(?:small|span|sup|sub|b|i|em|strong|div|p|center|nowiki|abbr)[^>]*>/gi, '');
  s = s.replace(/'''''|'''|''/g, '');
  s = s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&#39;|&apos;/g, "'");
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^[·•\-–—,;:]+\s*/, '').replace(/\s*[,;:]+$/, '');
  return s;
}

/* ── the grid ──────────────────────────────────────────────── */

function cellAttrs(chunk) {
  /* MediaWiki: the first `|` in a cell separates attributes from
     content — but only when what precedes it is attribute-shaped.
     `| ''[[A|B]]''` has no attributes; `|rowspan=2 |x` does. */
  const bar = splitTop(chunk, '|');
  if (bar.length > 1) {
    const head = bar[0];
    if (!/\[\[|\{\{|''|<ref/i.test(head) && (head.trim() === '' || /=/.test(head))) {
      return { attrs: head, body: bar.slice(1).join('|') };
    }
  }
  return { attrs: '', body: chunk };
}

const num = (attrs, name) => {
  const m = new RegExp(`${name}\\s*=\\s*"?'?(\\d+)`, 'i').exec(attrs);
  return m ? Number(m[1]) : 1;
};

/** One table's wikitext body (between `{|` and `|}`) → array of rows of cells. */
function gridOf(body) {
  const lines = body.split('\n');
  /* group lines into rows at `|-` */
  const rawRows = [];
  let cur = null;
  for (const line of lines) {
    if (/^\s*\|-/.test(line)) {
      cur = [];
      /* The `|-` line's own attributes. Several of these pages mark the
         winner by highlighting the whole ROW rather than its cells
         (`|-style="background:#cddeff"`), so throwing this away loses the
         only winner signal the table has. It is appended to each cell
         *created in this row*, which is what makes it stay with the right
         row when a neighbouring cell is rowspan'd in from above. */
      cur.attrs = line.replace(/^\s*\|-/, '').trim();
      rawRows.push(cur);
      continue;
    }
    if (/^\s*\|\+/.test(line)) continue;                    // caption
    if (cur === null) { cur = []; cur.attrs = ''; rawRows.push(cur); }  // header before any |-
    cur.push(line);
  }

  const rows = [];
  const pending = [];
  for (const lines2 of rawRows) {
    /* cells: a line starting with | or ! opens one or more; anything
       else continues the cell before it (list markup inside a cell). */
    const own = [];
    for (const line of lines2) {
      if (/^\s*[|!]/.test(line)) {
        const isHead = /^\s*!/.test(line);
        const rest = line.replace(/^\s*[|!]/, '');
        const chunks = isHead
          ? splitTop(rest, '!!').flatMap((c) => splitTop(c, '||'))
          : splitTop(rest, '||');
        for (const chunk of chunks) {
          const { attrs, body: b } = cellAttrs(chunk);
          own.push({
            raw: b, head: isHead,
            rowspan: num(attrs, 'rowspan'), colspan: num(attrs, 'colspan'),
            attrs, rowAttrs: lines2.attrs || '',
          });
        }
      } else if (own.length) {
        own[own.length - 1].raw += '\n' + line;
      }
    }
    if (!own.length && !pending.some((p) => p.left > 0)) continue;

    /* HTML rowspan/colspan semantics */
    const out = [];
    let i = 0, c = 0;
    for (;;) {
      const p = pending.find((x) => x.col === c && x.left > 0);
      if (p) { out.push(p.cell); p.left--; c++; continue; }
      if (i >= own.length) break;
      const cell = own[i++];
      const span = Math.min(cell.rowspan, 400);
      if (span > 1) pending.push({ col: c, left: span - 1, cell });
      const cs = Math.min(cell.colspan, 20);
      for (let k = 0; k < cs; k++) { out.push(cell); c++; }
    }
    for (let k = pending.length - 1; k >= 0; k--) if (pending[k].left <= 0) pending.splice(k, 1);
    rows.push(out);
  }
  return rows;
}

/** Every `{| … |}` table in a page's wikitext, as grids. Nested tables are
    skipped: they are always infoboxes or navboxes inside a cell here. */
export function tablesIn(wikitext) {
  const out = [];
  const lines = wikitext.split('\n');
  let depth = 0, start = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\{\|/.test(l)) { if (depth === 0) start = i; depth++; continue; }
    if (/^\s*\|\}/.test(l)) {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start >= 0) { out.push(lines.slice(start + 1, i).join('\n')); start = -1; }
    }
  }
  return out.map(gridOf);
}

/** Section heading immediately above each table, for per-list filtering. */
export function tableHeadings(wikitext) {
  const out = [];
  const lines = wikitext.split('\n');
  let heading = '', depth = 0;
  for (const l of lines) {
    const h = /^\s*(={2,6})\s*(.+?)\s*\1\s*$/.exec(l);
    if (h && depth === 0) heading = cellText(h[2]);
    if (/^\s*\{\|/.test(l)) { if (depth === 0) out.push(heading); depth++; }
    else if (/^\s*\|\}/.test(l)) depth = Math.max(0, depth - 1);
  }
  return out;
}
