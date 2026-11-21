/* ============================================================
   The award lists phase 9 harvests, and the rooms each one is
   allowed to shelve into.

   Provenance is the point (IMPLEMENTATION.md §6 step 1). Every
   entry in this file names a page that was fetched and parsed;
   nothing here is a remembered shortlist, and nothing downstream
   invents one. If a page moves or its tables change shape, the
   list drops out of the harvest and is *counted as a gap* rather
   than quietly filled from memory.

   Fields:
     slug        stable id — the key in data/lists/ and in a book's acc[].s
     page        the exact en.wikipedia.org article title
     prize       how the accolade reads on the shelf
     rooms       the rooms this list may shelve into, best first.
                 A book never lands outside its list's rooms;
                 which of them it lands in is decided by Open
                 Library subjects and publication year — see
                 tools/harvest.mjs shelve().
     heading     only parse tables under a section heading matching this
     category    only rows whose Category column matches this
     cols        header-name overrides when auto-detection is wrong
     allWinners  the page lists winners only, with no result column
     translator  take the translator column (only where explicit)
     yearIn      'heading' when the year is the section title, not a column

   Room ids come from src/js/data/rooms.js. A list's `rooms` are a
   constraint, not a guess: a Gold Dagger book can only ever land
   somewhere under The Lamp Room.
   ============================================================ */

/* room shorthand, so the table below stays readable */
const LIT = ['longroom', 'quiethouse', 'brokensentence'];
const LIT_NEW = ['longroom', 'quiethouse', 'brokensentence', 'fronttable'];
const XLAT = ['translator', 'hundredwindows'];
const SF = ['orrery', 'engine', 'longnow', 'brokenmirror', 'slipstream'];
const FANTASY = ['oak', 'cartographer', 'thorngate', 'kitchendoor', 'bonelibrary'];
const CRIME = ['lamproom', 'fogline', 'wrongman', 'quietvillage'];
const HORROR = ['cellar', 'candlestair', 'dampwall', 'lockedroom'];
const NONFIC = ['readingroom', 'longtable', 'glasscase', 'argument', 'witnessbox'];
const NATURE = ['glasshouse', 'understory', 'saltline', 'snowroom', 'smallkingdom'];
const POETRY = ['attic', 'rafters', 'oldbeam'];
const COMICS = ['inkroom', 'panelwall', 'longstrip'];
const LIFE = ['windowseat', 'saltcellar', 'wanderingchair'];
/* The general non-fiction prizes reach further than the Reading Room: a
   Baillie Gifford list holds food writing and travel as readily as history.
   The Salt Cellar and The Wandering Chair are subject-GATED in
   tools/rooms-rules.js, so widening the constraint here cannot put a book
   about the Reformation on the food shelf — it only lets one about hunger
   get there. Without this, two rooms no prize list names directly would
   stand empty. */
const NONFIC_ALL = [...NONFIC, ...LIFE, ...NATURE];
/* The translation prizes are the only lists that carry a translator column,
   so they are the only ones that can reach the four translation rooms. Two of
   those rooms — Crime in Translation, SF in Translation — additionally gate on
   subject in tools/rooms-rules.js, so widening the constraint here cannot put
   a Hungarian novel on the crime shelf unless it is a crime novel. */
const XLAT_ALL = [...XLAT, 'coldcoast', 'othersuns', 'foreignwindow'];

export const LISTS = [
  /* ── literary fiction ──────────────────────────────────── */
  { slug: 'booker', page: 'List of winners and nominated authors of the Booker Prize', prize: 'Booker Prize', rooms: LIT_NEW },
  { slug: 'intbooker', page: 'International Booker Prize', prize: 'International Booker Prize', rooms: [...XLAT_ALL, 'fronttable'], yearIn: 'heading', translator: true },
  { slug: 'womens', page: "List of Women's Prize for Fiction winners", prize: "Women's Prize for Fiction", rooms: LIT_NEW },
  { slug: 'pulitzer-fiction', page: 'Pulitzer Prize for Fiction', prize: 'Pulitzer Prize for Fiction', rooms: LIT, allWinners: true },
  { slug: 'nba-fiction', page: 'National Book Award for Fiction', prize: 'National Book Award for Fiction', rooms: LIT },
  { slug: 'nba-translated', page: 'National Book Award for Translated Literature', prize: 'National Book Award for Translated Literature', rooms: XLAT_ALL, translator: true, yearIn: 'heading' },
  { slug: 'goldsmiths', page: 'Goldsmiths Prize', prize: 'Goldsmiths Prize', rooms: ['brokensentence', 'smallpress', 'longroom'] },
  { slug: 'dublin', page: 'Dublin Literary Award', prize: 'Dublin Literary Award', rooms: ['longroom', 'quiethouse', ...XLAT_ALL], translator: true },
  { slug: 'miles-franklin', page: 'Miles Franklin Award', prize: 'Miles Franklin Award', rooms: LIT },
  { slug: 'giller', page: 'Giller Prize', prize: 'Scotiabank Giller Prize', rooms: LIT },
  { slug: 'gg-fiction', page: "Governor General's Award for English-language fiction", prize: "Governor General's Award for Fiction", rooms: LIT, allWinners: true },
  { slug: 'pen-faulkner', page: 'PEN/Faulkner Award for Fiction', prize: 'PEN/Faulkner Award', rooms: LIT },
  { slug: 'costa-novel', page: 'Costa Book Award for Novel', prize: 'Costa Book Award for Novel', rooms: LIT },
  { slug: 'walter-scott', page: 'Walter Scott Prize', prize: 'Walter Scott Prize for Historical Fiction', rooms: ['longroom', 'quiethouse', 'longtable'] },
  { slug: 'warwick-women-xlat', page: 'Warwick Prize for Women in Translation', prize: 'Warwick Prize for Women in Translation', rooms: XLAT_ALL, translator: true },
  { slug: 'btba-winners', page: 'Best Translated Book Award', prize: 'Best Translated Book Award', rooms: XLAT_ALL, translator: true, heading: /^(fiction|poetry)$/i, allWinners: true },
  { slug: 'btba', page: 'Best Translated Book Award', prize: 'Best Translated Book Award', rooms: XLAT_ALL, translator: true, heading: /^\d{4}$/ },
  { slug: 'goncourt', page: 'Prix Goncourt', prize: 'Prix Goncourt', rooms: XLAT_ALL, allWinners: true, cols: { title: 'English title' } },
  { slug: 'kirkus', page: 'Kirkus Prize', prize: 'Kirkus Prize', rooms: [...LIT, 'fronttable', ...NONFIC_ALL] },
  { slug: 'nero', page: 'Nero Book Awards', prize: 'Nero Book Award', rooms: ['longroom', 'fronttable'] },
  { slug: 'writers-prize', page: "The Writers' Prize", prize: "The Writers' Prize", rooms: ['longroom', 'fronttable', ...NONFIC_ALL] },
  { slug: 'encore', page: 'Encore Award', prize: 'Encore Award', rooms: ['longroom', 'quiethouse'], allWinners: true },
  { slug: 'desmond-elliott', page: 'Desmond Elliott Prize', prize: 'Desmond Elliott Prize', rooms: ['longroom', 'smallpress'], allWinners: true },
  { slug: 'somerset-maugham', page: 'Somerset Maugham Award', prize: 'Somerset Maugham Award', rooms: ['longroom', 'brokensentence'], allWinners: true },
  { slug: 'betty-trask', page: 'Betty Trask Prize and Awards', prize: 'Betty Trask Award', rooms: ['longroom', 'quiethouse'], allWinners: true },
  { slug: 'wodehouse', page: 'Bollinger Everyman Wodehouse Prize', prize: 'Bollinger Everyman Wodehouse Prize', rooms: ['longroom', 'quiethouse'] },
  { slug: 'ondaatje', page: 'Ondaatje Prize', prize: 'RSL Ondaatje Prize', rooms: ['wanderingchair', 'saltline', 'longroom'], allWinners: true },
  { slug: 'latimes-fiction', page: 'Los Angeles Times Book Prize', prize: 'Los Angeles Times Book Prize for Fiction', rooms: LIT, heading: /^fiction$/i, allWinners: true },
  { slug: 'latimes-first', page: 'Los Angeles Times Book Prize', prize: 'Los Angeles Times Book Prize, Art Seidenbaum Award for First Fiction', rooms: ['longroom', 'smallpress'], heading: /first fiction/i, allWinners: true },

  { slug: 'cwa-international', page: 'CWA International Dagger', prize: 'CWA International Dagger', rooms: ['coldcoast', ...XLAT], translator: true, yearIn: 'heading' },
  { slug: 'pen-translation', page: 'PEN Translation Prize', prize: 'PEN Translation Prize', rooms: XLAT_ALL, translator: true, allWinners: true },

  /* ── science fiction ───────────────────────────────────── */
  { slug: 'hugo-novel', page: 'Hugo Award for Best Novel', prize: 'Hugo Award for Best Novel', rooms: SF, heading: /winners and (finalists|nominees)/i },
  { slug: 'hugo-novella', page: 'Hugo Award for Best Novella', prize: 'Hugo Award for Best Novella', rooms: SF, heading: /winners and (finalists|nominees)/i },
  { slug: 'nebula-novel', page: 'Nebula Award for Best Novel', prize: 'Nebula Award for Best Novel', rooms: SF },
  { slug: 'nebula-novella', page: 'Nebula Award for Best Novella', prize: 'Nebula Award for Best Novella', rooms: SF },
  { slug: 'clarke', page: 'Arthur C. Clarke Award', prize: 'Arthur C. Clarke Award', rooms: SF },
  { slug: 'bsfa-novel', page: 'BSFA Award for Best Novel', prize: 'BSFA Award for Best Novel', rooms: SF },
  { slug: 'pkd', page: 'Philip K. Dick Award', prize: 'Philip K. Dick Award', rooms: ['orrery', 'brokenmirror', 'slipstream'] },
  { slug: 'locus-sf', page: 'Locus Award for Best Science Fiction Novel', prize: 'Locus Award for Best Science Fiction Novel', rooms: ['orrery', 'engine', 'longnow'], allWinners: true },
  { slug: 'locus-first', page: 'Locus Award for Best First Novel', prize: 'Locus Award for Best First Novel', rooms: ['orrery', 'oak', 'slipstream'], allWinners: true },
  { slug: 'aurealis-sf', page: 'Aurealis Award for Best Science Fiction Novel', prize: 'Aurealis Award for Best Science Fiction Novel', rooms: ['orrery', 'engine'] },
  { slug: 'otherwise', page: 'Otherwise Award', prize: 'Otherwise (James Tiptree Jr.) Award', rooms: ['brokenmirror', 'slipstream', 'orrery'], allWinners: true },
  { slug: 'sunburst', page: 'Sunburst Award', prize: 'Sunburst Award', rooms: ['slipstream', 'oak', 'orrery'] },

  /* ── fantasy & myth ────────────────────────────────────── */
  { slug: 'wfa-novel', page: 'World Fantasy Award—Novel', prize: 'World Fantasy Award for Best Novel', rooms: [...FANTASY, 'dampwall'] },
  { slug: 'locus-fantasy', page: 'Locus Award for Best Fantasy Novel', prize: 'Locus Award for Best Fantasy Novel', rooms: FANTASY, allWinners: true },
  { slug: 'british-fantasy', page: 'British Fantasy Award for Best Novel', prize: 'British Fantasy Award for Best Novel', rooms: [...FANTASY, 'cellar'], allWinners: true },
  { slug: 'mythopoeic', page: 'Mythopoeic Awards', prize: 'Mythopoeic Award', rooms: ['bonelibrary', 'thorngate', 'cartographer', 'underworld', 'oak'] },

  /* ── crime ─────────────────────────────────────────────── */
  { slug: 'gold-dagger', page: 'Gold Dagger', prize: 'CWA Gold Dagger', rooms: CRIME },
  { slug: 'edgar-novel', page: 'Edgar Allan Poe Award for Best Novel', prize: 'Edgar Award for Best Novel', rooms: CRIME },
  { slug: 'anthony-novel', page: 'Anthony Award for Best Novel', prize: 'Anthony Award for Best Novel', rooms: CRIME },
  { slug: 'ned-kelly', page: 'Ned Kelly Awards', prize: 'Ned Kelly Award', rooms: ['lamproom', 'quietvillage', 'wrongman'] },
  { slug: 'theakston', page: 'Theakston Old Peculier Crime Novel of the Year Award', prize: 'Theakston Old Peculier Crime Novel of the Year', rooms: [...CRIME, 'coldcoast'] },

  /* ── horror ────────────────────────────────────────────── */
  { slug: 'stoker-novel', page: 'Bram Stoker Award for Best Novel', prize: 'Bram Stoker Award for Superior Achievement in a Novel', rooms: HORROR },

  /* ── history, science, ideas, reportage ────────────────── */
  { slug: 'baillie-gifford', page: 'Baillie Gifford Prize', prize: 'Baillie Gifford Prize for Non-Fiction', rooms: NONFIC_ALL },
  { slug: 'royal-society-science', page: 'Royal Society Science Book Prize', prize: 'Royal Society Science Book Prize', rooms: ['glasscase', 'smallkingdom', 'readingroom'] },
  { slug: 'wolfson-history', page: 'Wolfson History Prize', prize: 'Wolfson History Prize', rooms: ['longtable', 'readingroom'], allWinners: true },
  { slug: 'cundill', page: 'Cundill History Prize', prize: 'Cundill History Prize', rooms: ['longtable', 'readingroom'] },
  { slug: 'duff-cooper', page: 'Duff Cooper Prize', prize: 'Duff Cooper Prize', rooms: NONFIC_ALL, allWinners: true },
  { slug: 'pulitzer-history', page: 'Pulitzer Prize for History', prize: 'Pulitzer Prize for History', rooms: ['longtable', 'readingroom'], allWinners: true },
  { slug: 'pulitzer-nonfiction', page: 'Pulitzer Prize for General Nonfiction', prize: 'Pulitzer Prize for General Nonfiction', rooms: NONFIC_ALL, allWinners: true },
  { slug: 'pulitzer-biography', page: 'Pulitzer Prize for Biography', prize: 'Pulitzer Prize for Biography', rooms: ['windowseat', 'readingroom'], allWinners: true },
  { slug: 'nba-nonfiction', page: 'National Book Award for Nonfiction', prize: 'National Book Award for Nonfiction', rooms: NONFIC_ALL },
  { slug: 'orwell', page: 'Orwell Prize', prize: 'Orwell Prize', rooms: ['witnessbox', 'argument', 'readingroom'], heading: /(political fiction|political writing|combined book)/i },
  { slug: 'wellcome', page: 'Wellcome Book Prize', prize: 'Wellcome Book Prize', rooms: ['glasscase', 'windowseat'], allWinners: true },

  /* ── nature, place & weather ───────────────────────────── */
  { slug: 'wainwright', page: 'Wainwright Prize', prize: 'Wainwright Prize', rooms: [...NATURE, 'wanderingchair', 'saltcellar'], allWinners: true },

  /* ── poetry ────────────────────────────────────────────── */
  { slug: 'griffin', page: 'Griffin Poetry Prize', prize: 'Griffin Poetry Prize', rooms: [...POETRY, 'foreignwindow'] },
  { slug: 'ts-eliot', page: 'T. S. Eliot Prize', prize: 'T. S. Eliot Prize', rooms: ['attic', 'rafters'] },
  { slug: 'forward', page: 'Forward Prizes for Poetry', prize: 'Forward Prize for Best Collection', rooms: ['attic', 'rafters'], heading: /^best collection$/i, allWinners: true },
  { slug: 'forward-first', page: 'Forward Prizes for Poetry', prize: 'Forward Prize for Best First Collection', rooms: ['attic', 'rafters'], heading: /^best first collection$/i, allWinners: true },
  { slug: 'pulitzer-poetry', page: 'Pulitzer Prize for Poetry', prize: 'Pulitzer Prize for Poetry', rooms: ['attic', 'oldbeam', 'rafters'], allWinners: true },
  { slug: 'nba-poetry', page: 'National Book Award for Poetry', prize: 'National Book Award for Poetry', rooms: POETRY },
  { slug: 'costa-poetry', page: 'Costa Book Award for Poetry', prize: 'Costa Book Award for Poetry', rooms: ['attic', 'rafters'] },

  /* ── comics ────────────────────────────────────────────── */
  { slug: 'hugo-graphic', page: 'Hugo Award for Best Graphic Story or Comic', prize: 'Hugo Award for Best Graphic Story', rooms: COMICS },
  { slug: 'eisner-reality', page: 'Eisner Award for Best Reality-Based Work', prize: 'Eisner Award for Best Reality-Based Work', rooms: ['panelwall', 'inkroom'] },
  { slug: 'eisner-international', page: 'Eisner Award for Best U.S. Edition of International Material', prize: 'Eisner Award for Best U.S. Edition of International Material', rooms: ['longstrip', 'inkroom'], translator: true },
  { slug: 'eisner-newseries', page: 'Eisner Award for Best New Series', prize: 'Eisner Award for Best New Series', rooms: ['inkroom', 'panelwall'] },
  { slug: 'eisner-continuing', page: 'Eisner Award for Best Continuing Series', prize: 'Eisner Award for Best Continuing Series', rooms: ['inkroom', 'longstrip'] },
];

export const LIST_BY_SLUG = Object.fromEntries(LISTS.map((l) => [l.slug, l]));

/** Every room any list may shelve into — used by the shortfall report. */
export const TARGET_ROOMS = [...new Set(LISTS.flatMap((l) => l.rooms))];

export default LISTS;
