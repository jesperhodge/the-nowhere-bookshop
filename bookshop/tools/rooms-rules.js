/* ============================================================
   Which of a list's rooms a harvested book actually lands in.

   A list's `rooms` in tools/lists.js is a hard constraint — a CWA
   Dagger book can only ever be somewhere under The Lamp Room. This
   file is what chooses *between* those rooms, and it does it from
   two fetched signals and nothing else:

     subj   Open Library's subjects[] for the matched work, plus
            the book's own title. Fetched, not remembered. The patterns
            anchor at a word START and not at both ends, on purpose:
            Open Library writes "Birds", "Forests", "Cooking", and a
            \b…\b pattern for `bird` matches none of them.
     years  the book's first-publication year, where the room's own
            `sub` in rooms.js makes a claim about period — "Golden
            Age Detection", "Poets Now Living", "The Canon,
            Handled", "New & Much Talked About".

   `gate: true` means the room takes ONLY books that match. That is
   what stops The Salt Cellar (food) filling up with history, and
   what lets a room exist that no prize list maps to directly.

   Be clear about what this is and is not. The accolade on a book is
   provenanced to a fetched page and a revision id. The *sub-genre
   room* underneath the parent is an approximation from subjects and
   year — good enough to shelve by, and a mis-shelving is not a
   false claim. Rooms with no rule here take anything their lists
   allow.
   ============================================================ */

export const ROOM_RULES = {
  /* ── literary fiction ── */
  quiethouse: { subj: /\b(domestic fiction|family|marriage|mothers|fathers|daughters|sons|home|married people|social life and customs|village)/i },
  brokensentence: { subj: /\b(experimental|postmodern|metafiction|unclassifi)/i },

  /* ── in translation ── */
  translator: { xlat: true },
  hundredwindows: { xlat: true, years: [0, 2000] },
  othersuns: { xlat: true, subj: /\b(science fiction|speculative|fantasy|dystopia)/i, gate: true },
  /* "Crime in Translation" and "SF in Translation" need BOTH signals, or
     every translated novel lands in the first one that will take it. */
  coldcoast: { xlat: true, subj: /\b(crime|detective|mystery|murder|police|thriller|noir)/i, gate: true },
  foreignwindow: { xlat: true, subj: /\b(poetry|poems|verse)/i, gate: true },

  /* ── science fiction ── */
  engine: { subj: /\b(space|interstellar|spacecraft|physics|hard science fiction|first contact|artificial intelligence|robots|mars|orbit)/i },
  longnow: { subj: /\b(future|far future|evolution|deep time|generation ship|galactic|empire|millenni)/i },
  brokenmirror: { subj: /\b(dystopia|new wave|psycholog|society|satire|surreal)/i },
  slipstream: { subj: /\b(magic realism|fabul|weird|slipstream|unclassifi|absurd)/i },

  /* ── fantasy & myth ── */
  cartographer: { subj: /\b(imaginary places|epic fantasy|quests|kings and rulers|wizards|dragons|secondary world)/i },
  thorngate: { subj: /\b(fairy tales|folklore|retell|legends|witches|wolves|stepmother)/i },
  bonelibrary: { subj: /\b(mythology|myth|greek|roman|trojan|troy|gods|goddess|epic poetry|arthurian)/i },
  underworld: { subj: /\b(underworld|hades|hell|orpheus|descent|dead|ghosts|afterlife|purgator)/i, gate: true },
  kitchendoor: { subj: /\b(cook|bakers|tea|inns|cottage|gentle|comfort|cats|gardens|magic)/i },

  /* ── crime ── */
  fogline: { years: [0, 1965], gate: true },
  wrongman: { subj: /\b(noir|hard-boiled|private investigators|criminals|gangsters|corruption|los angeles)/i },
  quietvillage: { subj: /\b(village|rural|small town|country life|farm|island|moor|highlands)/i },

  /* ── horror ── */
  candlestair: { subj: /\b(gothic|haunted houses|ghost stories|mansions|victoria|vampire|madness)/i },
  dampwall: { subj: /\b(weird|supernatural|psychological|uncanny|dread|cosmic)/i },
  lockedroom: { subj: /\b(folklore|rural|occult|cults|pagan|ritual|village|witchcraft)/i },

  /* ── nature, place & weather ──
     The Glasshouse is gated too, unlike most parent rooms: it is a subject
     room ("Nature, Place & Weather"), not a catch-all, and the general
     non-fiction prizes now reach this whole branch. Without a gate here the
     Reformation ends up in the greenhouse — measured, before this was added:
     496 of 496 reachable candidates "matched" a room with no rule at all. */
  glasshouse: { subj: /\b(nature|natural histor|landscape|weather|countrysid|wildlife|ecolog|environment|climate|rural|season|garden|farming|river|walking|coast|moor|marsh|wild)/i, gate: true },
  understory: { subj: /\b(forests|trees|woods|fung|mushroom|moss|plants|botan|woodland|rewilding)/i, gate: true },
  saltline: { subj: /\b(sea|ocean|coast|maritime|fish|islands|shipwreck|tides|rivers|sailing|shore)/i, gate: true },
  snowroom: { subj: /\b(polar|antarctic|arctic|mountain|everest|glacier|ice|climbing|snow|expedition)/i, gate: true },
  smallkingdom: { subj: /\b(birds|insects|butterfl|bees|entomol|ornitho|moths|beetles|spiders|ants|wildlife)/i, gate: true },

  /* ── history, science, ideas, reportage ── */
  longtable: { subj: /\b(history|empire|civilization|medieval|ancient|century|dynasty|revolution|war)/i },
  glasscase: { subj: /\b(science|physics|biology|brain|psycholog|medicine|mathemat|neuro|genetic|astronom|chemistry|evolution)/i },
  argument: { subj: /\b(philosoph|essays|ethics|political science|logic|metaphysic|religion|theolog)/i },
  witnessbox: { subj: /\b(journalis|reportage|refugee|testimony|social conditions|human rights|prison|migration|poverty)/i },

  /* ── poetry ── */
  rafters: { years: [1995, 9999] },
  oldbeam: { years: [0, 1975] },

  /* ── comics ── */
  panelwall: { subj: /\b(biograph|memoir|autobiograph|nonfiction|history|documentary)/i },
  longstrip: { subj: /\b(manga|japan|french|bande|translat|korea|belgi)/i },

  /* ── a life lived ── */
  windowseat: { subj: /\b(memoir|autobiograph|biograph|essays|personal narrative|diaries|letters)/i },
  saltcellar: { subj: /\b(cook|food|gastronom|restaurant|cuisine|eating|hunger|wine|kitchen|chefs|recipes|farming|agricultur)/i, gate: true },
  wanderingchair: { subj: /\b(travel|description and travel|voyages|journeys|walking|pilgrim|expedition|geograph)/i, gate: true },

  /* ── the front of the shop ──
     "The prize lists of the last few years, and the books everyone is
     currently arguing about" — so it is a claim about recency, and gated
     on it. */
  fronttable: { years: [2019, 9999], gate: true },
};

/**
 * How well a book suits a room. `null` means the room refuses it.
 * Everything this reads was fetched: subjects and year from Open Library,
 * the translator from the award list's own translator column.
 */
export function roomScore(room, book) {
  const rule = ROOM_RULES[room];
  if (!rule) return 10;                       /* no rule: takes anything its lists allow */
  let score = 10;
  let matched = false;

  if (rule.subj) {
    const hay = `${book.title} ${(book.subjects || []).join(' ')}`;
    if (rule.subj.test(hay)) { score += 40; matched = true; }
    else if (rule.gate) return null;
  }
  if (rule.xlat) {
    if (book.translator) { score += 30; matched = true; }
    else if (rule.gate) return null;
  }
  if (rule.years) {
    const y = book.year;
    if (y && y >= rule.years[0] && y <= rule.years[1]) { score += 25; matched = true; }
    else if (rule.gate) return null;
    else score -= 15;
  }
  return rule.gate && !matched ? null : score;
}
