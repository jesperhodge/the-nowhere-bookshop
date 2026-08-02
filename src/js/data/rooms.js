/* ============================================================
   The plan of the shop.

   Four doors off the front room, one of which is just a gap in
   the shelving that turns out to be a corridor. Everything is a
   tree: parent → children. Depth is the whole point.

   Props are placed by slot (see SLOT in scene.js) so nothing
   ever ends up behind a doorway.
   ============================================================ */

export const ROOMS = [

  /* ── level 0 ────────────────────────────────────────────── */
  {
    id: 'front',
    name: 'The Front Room',
    sub: 'Mind the step',
    line: 'Rain on the glass, a stove going, and whatever the shopkeeper has been pressing on people all week.',
    kind: 'k-panel',
    pal: {
      wall: '#5a4032', 'wall-lit': '#8d6647', floor: '#5b3d27', 'floor-lit': '#96683f',
      ceiling: '#33231a', wood: '#7d5539', 'wood-lit': '#ac7a52', 'wood-dark': '#452c1d',
      glow: '#ffc978', accent: '#eab263', 'door-glow': '#ffbc63', hue: 28,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang', w: 210, h: 124, cord: 130, beam: 560 },
      { t: 'window', at: 'back-l', w: 250, h: 350, sky1: '#456179', sky2: '#1b2632' },
      { t: 'hearth', at: 'back-r', w: 250, h: 300 },
      { t: 'rug', at: 'rug', w: 660, h: 460, c1: '#6d3730', c2: '#a05246' },
      { t: 'art', a: 'armchair', at: 'floor-r', w: 300, h: 255 },
      { t: 'art', a: 'cat', at: 'floor-l', w: 230, h: 138, breathe: true },
      { t: 'art', a: 'ladder', at: 'floor-mr', w: 74, h: 430 },
      { t: 'art', a: 'clock', at: 'above', w: 130, h: 130 },
    ],
  },

  /* ── halls off the front room ───────────────────────────── */
  {
    id: 'longroom', parent: 'front', name: 'The Long Room', sub: 'Literary Fiction',
    line: 'Tall windows, low light, and a shelf that takes the long view — the novels people are still arguing about.',
    kind: 'k-panel',
    pal: {
      wall: '#5a4834', 'wall-lit': '#8f7449', floor: '#5f4527', 'floor-lit': '#9a7040',
      ceiling: '#37281b', wood: '#8a6440', 'wood-lit': '#b98c5c', 'wood-dark': '#4a3018',
      glow: '#ffd68f', accent: '#e6bc72', 'door-glow': '#ffd07f', hue: 34,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang', w: 230, h: 132, cord: 110, beam: 600 },
      { t: 'window', at: 'back-l', w: 236, h: 450, sky1: '#d8ab6d', sky2: '#5a4529' },
      { t: 'window', at: 'back-r', w: 236, h: 450, sky1: '#d8ab6d', sky2: '#5a4529' },
      { t: 'art', a: 'ladder', at: 'floor-mr', w: 78, h: 520 },
      { t: 'art', a: 'globe', at: 'floor-l', w: 190, h: 250 },
      { t: 'rug', at: 'rug', w: 600, h: 430, c1: '#5c4327', c2: '#8f6a3c' },
    ],
  },
  {
    id: 'orrery', parent: 'front', name: 'The Orrery', sub: 'Science Fiction',
    line: 'The back wall gave out years ago. Nobody has fixed it, and now there is weather from other systems.',
    kind: 'k-void',
    pal: {
      wall: '#22304f', 'wall-lit': '#3d5583', floor: '#2b3450', 'floor-lit': '#4a5c8c',
      ceiling: '#141a2e', wood: '#8a6c3e', 'wood-lit': '#c09850', 'wood-dark': '#3d2f1a',
      glow: '#a8d8ff', 'glow-2': '#d4a84f', accent: '#eec46a', 'door-glow': '#8fdcff', hue: 216,
    },
    amb: 'stars',
    props: [
      { t: 'lamp', at: 'hang', w: 190, h: 112, cord: 150, beam: 500 },
      { t: 'art', a: 'telescope', at: 'floor-l', w: 300, h: 330 },
      { t: 'art', a: 'starchart', at: 'back-l-hi', w: 200, h: 250 },
      { t: 'art', a: 'globe', at: 'floor-r', w: 200, h: 260, c: '#9fc6f0', d: '#243a5f' },
      { t: 'orrery', at: 'ceil', w: 400, h: 400, dy: -130, dz: 300 },
    ],
  },
  {
    id: 'oak', parent: 'front', name: 'The Hollow Oak', sub: 'Fantasy & Myth',
    line: 'A tree grew through the floor sometime in the last century. The shelves were built around it and nobody minds.',
    kind: 'k-forest',
    pal: {
      wall: '#334a30', 'wall-lit': '#547247', floor: '#413827', 'floor-lit': '#6d5c39',
      ceiling: '#1e2a1a', wood: '#75603a', 'wood-lit': '#a2874f', 'wood-dark': '#3b301c',
      glow: '#ffdf9a', accent: '#dbc86c', 'door-glow': '#b4e894', hue: 96,
    },
    amb: 'spores',
    props: [
      { t: 'lamp', at: 'hang-l', w: 155, h: 100, cord: 190, beam: 400 },
      { t: 'lamp', at: 'hang-r', w: 155, h: 100, cord: 130, beam: 400 },
      { t: 'trunk', at: 'tall-r', w: 300, h: 940 },
      { t: 'art', a: 'mushrooms', at: 'floor-l', w: 260, h: 180 },
      { t: 'art', a: 'herbs', at: 'back-l-hi', w: 220, h: 250 },
    ],
  },
  {
    id: 'lamproom', parent: 'front', name: 'The Lamp Room', sub: 'Crime & Mystery',
    line: 'One green lamp, one bad window, and a great deal of unfinished business.',
    kind: 'k-plaster',
    pal: {
      wall: '#3a4344', 'wall-lit': '#5d6d6c', floor: '#3a322b', 'floor-lit': '#5f5142',
      ceiling: '#232a2b', wood: '#5b483a', 'wood-lit': '#82674f', 'wood-dark': '#2e231a',
      glow: '#9fe8c2', 'glow-2': '#4fae86', accent: '#8adcb4', 'door-glow': '#7fd6ac', hue: 168,
    },
    amb: 'rain',
    props: [
      { t: 'window', at: 'back-r', w: 300, h: 400, sky1: '#3a5164', sky2: '#151f28' },
      { t: 'lamp', at: 'hang', w: 175, h: 104, cord: 210, beam: 430, green: true },
      { t: 'art', a: 'typewriter', at: 'floor-l', w: 280, h: 190 },
      { t: 'art', a: 'umbrella', at: 'floor-r', w: 120, h: 300 },
      { t: 'rug', at: 'rug', w: 540, h: 410, c1: '#2c3436', c2: '#4a5658' },
    ],
  },
  {
    id: 'landing', parent: 'front', name: 'The Landing', sub: 'Further in',
    line: 'The corridor behind the till. It is longer than the shop is wide, which is a thing nobody says out loud.',
    kind: 'k-paper', low: true,
    pal: {
      wall: '#3e4844', 'wall-lit': '#63706a', floor: '#3f3527', 'floor-lit': '#69573c',
      ceiling: '#262d2a', wood: '#67523c', 'wood-lit': '#8f7154', 'wood-dark': '#352818',
      glow: '#f6d296', accent: '#d4ae68', 'door-glow': '#efca88', hue: 44,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang-l', w: 140, h: 86, cord: 60, beam: 340, dy: 290 },
      { t: 'lamp', at: 'hang-r', w: 140, h: 86, cord: 60, beam: 340, dy: 290 },
      { t: 'art', a: 'crate', at: 'floor-l', w: 220, h: 170 },
      { t: 'art', a: 'key', at: 'above', w: 240, h: 84, dy: 20 },
    ],
  },

  /* ── The Long Room ──────────────────────────────────────── */
  {
    id: 'translator', parent: 'longroom', name: "The Translator's Alcove", sub: 'Fiction in Translation',
    line: 'Every book here was written twice. The second writer is on the cover too, where they belong.',
    kind: 'k-plaster',
    pal: {
      wall: '#584a38', 'wall-lit': '#877158', floor: '#544027', 'floor-lit': '#8a6740',
      ceiling: '#35291c', wood: '#8a6c47', 'wood-lit': '#b4915f', 'wood-dark': '#463523',
      glow: '#ffdda5', accent: '#e2bc78', 'door-glow': '#ffd694', hue: 38,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang', w: 200, h: 120, cord: 120, beam: 520 },
      { t: 'art', a: 'quill', at: 'floor-l', w: 200, h: 200 },
      { t: 'art', a: 'stack', at: 'floor-r', w: 180, h: 165 },
      { t: 'art', a: 'globe', at: 'floor-ml', w: 170, h: 224 },
    ],
  },
  {
    id: 'hundredwindows', parent: 'translator', name: 'The Hundred Windows', sub: 'The far shelves',
    line: 'Books that arrive in English by luck, decades late, from languages with few translators and long memories.',
    kind: 'k-void',
    pal: {
      wall: '#242a45', 'wall-lit': '#404a75', floor: '#2d2c3e', 'floor-lit': '#4d4c6c',
      ceiling: '#161829', wood: '#7a6444', 'wood-lit': '#a88c5e', 'wood-dark': '#3a2e1e',
      glow: '#e6cf8f', accent: '#f0daa0', 'door-glow': '#d4bd77', hue: 232,
    },
    amb: 'motes',
    props: [
      { t: 'lamp', at: 'hang', w: 175, h: 108, cord: 160, beam: 460 },
      { t: 'art', a: 'globe', at: 'floor-l', w: 190, h: 250, c: '#f0daa0', d: '#2c3350' },
      { t: 'art', a: 'starchart', at: 'back-r-hi', w: 200, h: 250 },
      { t: 'art', a: 'stack', at: 'floor-r', w: 170, h: 156 },
    ],
  },
  {
    id: 'quiethouse', parent: 'longroom', name: 'The Quiet House', sub: 'Rooms, families, weather',
    line: 'Nothing happens here except everything. Marriages, kitchens, long afternoons that turn out to have been the whole story.',
    kind: 'k-paper',
    pal: {
      wall: '#5f4f51', 'wall-lit': '#8d7576', floor: '#57402f', 'floor-lit': '#8a6844',
      ceiling: '#3a2e2f', wood: '#8a6450', 'wood-lit': '#b48a6d', 'wood-dark': '#452c21',
      glow: '#ffd7a8', accent: '#e9b795', 'door-glow': '#f6c19b', hue: 18,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang', w: 210, h: 122, cord: 110, beam: 540 },
      { t: 'art', a: 'armchair', at: 'floor-l', w: 310, h: 262 },
      { t: 'art', a: 'teapot', at: 'floor-r', w: 200, h: 158 },
      { t: 'window', at: 'back-r', w: 240, h: 340, sky1: '#c99a7a', sky2: '#4a3a33' },
      { t: 'rug', at: 'rug', w: 620, h: 440, c1: '#7d4a3e', c2: '#a86556' },
    ],
  },
  {
    id: 'brokensentence', parent: 'longroom', name: 'The Broken Sentence', sub: 'Formally Daring',
    line: 'Novels that refused the shape they were handed. Footnotes, holes, second person, no punctuation, one paragraph, ten narrators.',
    kind: 'k-tile',
    pal: {
      wall: '#3d3d40', 'wall-lit': '#63636a', floor: '#333336', 'floor-lit': '#55555e',
      ceiling: '#242427', wood: '#5c5c62', 'wood-lit': '#82828a', 'wood-dark': '#2e2e32',
      glow: '#f6f6f0', 'glow-2': '#e2564a', accent: '#e2564a', 'door-glow': '#f0f0e8', hue: 0,
    },
    amb: 'ink',
    props: [
      { t: 'lamp', at: 'hang-l', w: 135, h: 86, cord: 200, beam: 340 },
      { t: 'lamp', at: 'hang-r', w: 135, h: 86, cord: 140, beam: 340 },
      { t: 'art', a: 'typewriter', at: 'floor-r', w: 280, h: 190 },
      { t: 'art', a: 'stack', at: 'floor-l', w: 180, h: 165, c1: '#e2564a', c2: '#3d3d40', c3: '#f6f6f0' },
    ],
  },
  {
    id: 'smallpress', parent: 'longroom', name: 'The Small Press Shelf', sub: 'Independent Publishing',
    line: 'Print runs of two thousand. Sewn bindings. The kind of book a person decided to make because nobody else would.',
    kind: 'k-panel',
    pal: {
      wall: '#544d3b', 'wall-lit': '#807758', floor: '#4d422c', 'floor-lit': '#7d6c46',
      ceiling: '#332e21', wood: '#7d6742', 'wood-lit': '#a68b59', 'wood-dark': '#413521',
      glow: '#ffde9a', accent: '#d8bd78', 'door-glow': '#eecb88', hue: 46,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang', w: 195, h: 116, cord: 130, beam: 500 },
      { t: 'art', a: 'crate', at: 'floor-l', w: 240, h: 185 },
      { t: 'art', a: 'stack', at: 'floor-r', w: 180, h: 165 },
      { t: 'art', a: 'quill', at: 'back-r-hi', w: 180, h: 180 },
    ],
  },

  /* ── The Orrery ─────────────────────────────────────────── */
  {
    id: 'engine', parent: 'orrery', name: 'The Silent Engine', sub: 'Hard SF & Big Ideas',
    line: 'Books that do the arithmetic. Orbital mechanics, first contact done properly, and the awful patience of physics.',
    kind: 'k-metal',
    pal: {
      wall: '#39454e', 'wall-lit': '#5a6d79', floor: '#2f3941', 'floor-lit': '#4d5d69',
      ceiling: '#232b31', wood: '#5d6d78', 'wood-lit': '#82949f', 'wood-dark': '#2f3941',
      glow: '#b4eeff', 'glow-2': '#59bcd8', accent: '#8fdff5', 'door-glow': '#9fe8ff', hue: 198,
    },
    amb: 'motes',
    props: [
      { t: 'lamp', at: 'hang', w: 200, h: 104, cord: 130, beam: 520 },
      { t: 'art', a: 'telescope', at: 'floor-r', w: 300, h: 330, c: '#a3c2d0', d: '#2f3941' },
      { t: 'art', a: 'clock', at: 'above', w: 140, h: 140, c: '#8fdff5', f: '#26313a' },
      { t: 'art', a: 'crate', at: 'floor-l', w: 230, h: 178, c: '#54646e' },
    ],
  },
  {
    id: 'longnow', parent: 'orrery', name: 'The Long Now', sub: 'Deep Time & Far Futures',
    line: 'A shelf measured in aeons. Empires that rise between chapters; species that are a footnote by page three hundred.',
    kind: 'k-stone',
    pal: {
      wall: '#443a5e', 'wall-lit': '#665a8a', floor: '#372f4a', 'floor-lit': '#564a72',
      ceiling: '#241d38', wood: '#6d6190', 'wood-lit': '#948aae', 'wood-dark': '#342c4c',
      glow: '#d6b8ff', 'glow-2': '#9f7fe2', accent: '#c2a8f5', 'door-glow': '#b89ef0', hue: 268,
    },
    amb: 'motes',
    props: [
      { t: 'lamp', at: 'hang', w: 180, h: 110, cord: 160, beam: 470 },
      { t: 'monolith', at: 'tall-r', w: 180, h: 700, dy: 240 },
      { t: 'art', a: 'skull', at: 'floor-l', w: 170, h: 170 },
      { t: 'art', a: 'starchart', at: 'back-l-hi', w: 190, h: 240, bg: '#241d38', c: '#c2a8f5' },
    ],
  },
  {
    id: 'brokenmirror', parent: 'orrery', name: 'The Broken Mirror', sub: 'New Wave & After',
    line: 'When science fiction turned the telescope round and pointed it at the inside of the skull.',
    kind: 'k-tile',
    pal: {
      wall: '#52305a', 'wall-lit': '#7c4a80', floor: '#402848', 'floor-lit': '#64406c',
      ceiling: '#2c1a30', wood: '#7d4a82', 'wood-lit': '#a06aa8', 'wood-dark': '#3c2440',
      glow: '#ff9fd8', 'glow-2': '#f5da5f', accent: '#ff8fcf', 'door-glow': '#ffabdf', hue: 312,
    },
    amb: 'motes',
    props: [
      { t: 'lamp', at: 'hang-l', w: 145, h: 90, cord: 180, beam: 370 },
      { t: 'lamp', at: 'hang-r', w: 145, h: 90, cord: 130, beam: 370 },
      { t: 'art', a: 'moth', at: 'back-l-hi', w: 250, h: 190 },
      { t: 'art', a: 'gramophone', at: 'floor-r', w: 250, h: 280 },
    ],
  },
  {
    id: 'slipstream', parent: 'brokenmirror', name: 'The Slipstream Door', sub: 'The Unclassifiable',
    line: 'Not quite science fiction, not quite not. The shelf where the labels come unstuck.',
    kind: 'k-water',
    pal: {
      wall: '#2d4c59', 'wall-lit': '#4a7a8c', floor: '#2b3f48', 'floor-lit': '#4a6a78',
      ceiling: '#1c2d35', wood: '#537480', 'wood-lit': '#7a9ba6', 'wood-dark': '#2a3e46',
      glow: '#9ff6e6', 'glow-2': '#f5b8dd', accent: '#9ff6e0', 'door-glow': '#b4f6ee', hue: 182,
    },
    amb: 'bubbles',
    props: [
      { t: 'lamp', at: 'hang', w: 175, h: 104, cord: 170, beam: 450 },
      { t: 'art', a: 'birdcage', at: 'floor-r', w: 190, h: 300 },
      { t: 'art', a: 'key', at: 'above', w: 230, h: 80, dy: 22 },
      { t: 'art', a: 'moth', at: 'floor-l', w: 230, h: 175, c: '#c8e8e2' },
    ],
  },
  {
    id: 'othersuns', parent: 'orrery', name: 'Other Suns', sub: 'SF in Translation',
    line: 'The future as imagined in Warsaw, Beijing, Buenos Aires, Belgrade. It looks very different from there.',
    kind: 'k-void',
    pal: {
      wall: '#3c2c42', 'wall-lit': '#5f4666', floor: '#372a38', 'floor-lit': '#5a4459',
      ceiling: '#241a28', wood: '#8a6450', 'wood-lit': '#b1866a', 'wood-dark': '#412a20',
      glow: '#ffbb85', 'glow-2': '#d47fdd', accent: '#ffae72', 'door-glow': '#ffb27f', hue: 24,
    },
    amb: 'stars',
    props: [
      { t: 'lamp', at: 'hang', w: 185, h: 112, cord: 140, beam: 480 },
      { t: 'art', a: 'globe', at: 'floor-r', w: 200, h: 260, c: '#ffae72', d: '#432c4a' },
      { t: 'art', a: 'starchart', at: 'back-l-hi', w: 200, h: 250, c: '#ffae72', bg: '#281a2e' },
      { t: 'art', a: 'gramophone', at: 'floor-l', w: 230, h: 260, c: '#d48a52' },
    ],
  },

  /* ── The Hollow Oak ─────────────────────────────────────── */
  {
    id: 'cartographer', parent: 'oak', name: "The Cartographer's Table", sub: 'Secondary Worlds',
    line: 'Invented countries with their own tax law. Bring a bookmark; some of these have appendices you will actually read.',
    kind: 'k-panel',
    pal: {
      wall: '#584a33', 'wall-lit': '#88724b', floor: '#4f4029', 'floor-lit': '#82683f',
      ceiling: '#362c1c', wood: '#8a6f42', 'wood-lit': '#b3945c', 'wood-dark': '#463720',
      glow: '#ffdc93', accent: '#dfba72', 'door-glow': '#f5cb84', hue: 42,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang', w: 200, h: 118, cord: 120, beam: 520 },
      { t: 'art', a: 'globe', at: 'floor-l', w: 200, h: 262 },
      { t: 'art', a: 'shipmodel', at: 'floor-r', w: 270, h: 240 },
      { t: 'art', a: 'key', at: 'above', w: 230, h: 80, dy: 22 },
    ],
  },
  {
    id: 'thorngate', parent: 'oak', name: 'The Thorn Gate', sub: 'Fairy Tales, Retold',
    line: 'The old stories with the blood put back in. Wolves, stepmothers, bargains you should not have made.',
    kind: 'k-forest',
    pal: {
      wall: '#472a32', 'wall-lit': '#6f434f', floor: '#3f2a27', 'floor-lit': '#68453b',
      ceiling: '#2a181d', wood: '#6d4737', 'wood-lit': '#956450', 'wood-dark': '#372218',
      glow: '#ffab9a', 'glow-2': '#d45a6c', accent: '#ef8e8e', 'door-glow': '#ff9c9c', hue: 348,
    },
    amb: 'spores',
    props: [
      { t: 'lamp', at: 'hang', w: 150, h: 94, cord: 190, beam: 380 },
      { t: 'art', a: 'mushrooms', at: 'floor-r', w: 260, h: 180, c: '#d45a6c' },
      { t: 'art', a: 'birdcage', at: 'floor-l', w: 190, h: 300, c: '#ef8e8e' },
      { t: 'art', a: 'herbs', at: 'back-r-hi', w: 220, h: 250, c: '#8a5a4a' },
    ],
  },
  {
    id: 'bonelibrary', parent: 'oak', name: 'The Bone Library', sub: 'Myth Retold',
    line: 'Troy, Thebes, Uruk and the Mabinogion, told again by people who noticed who was left out the first time.',
    kind: 'k-stone',
    pal: {
      wall: '#585340', 'wall-lit': '#857f60', floor: '#4c4830', 'floor-lit': '#7c7549',
      ceiling: '#363321', wood: '#8d8460', 'wood-lit': '#b2a882', 'wood-dark': '#494530',
      glow: '#ffe8b0', accent: '#e3d49a', 'door-glow': '#f2dfa8', hue: 48,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang', w: 190, h: 116, cord: 130, beam: 500 },
      { t: 'column', at: 'tall-l', w: 150, h: 940 },
      { t: 'column', at: 'tall-r', w: 150, h: 940 },
      { t: 'art', a: 'skull', at: 'floor-r', w: 170, h: 170 },
    ],
  },
  {
    id: 'underworld', parent: 'bonelibrary', name: 'The Underworld Stair', sub: 'Journeys Below',
    line: 'Everyone who goes down is told not to look back. The shelf is arranged by what they looked at anyway.',
    kind: 'k-stone', low: true,
    pal: {
      wall: '#3b2a26', 'wall-lit': '#5f4034', floor: '#302321', 'floor-lit': '#523a2d',
      ceiling: '#211715', wood: '#553b2c', 'wood-lit': '#7a5540', 'wood-dark': '#2c1e16',
      glow: '#ff8f4f', 'glow-2': '#d44a26', accent: '#f5814a', 'door-glow': '#ff7f42', hue: 12,
    },
    amb: 'embers',
    props: [
      { t: 'lamp', at: 'hang', w: 155, h: 96, cord: 70, beam: 400, dy: 290 },
      { t: 'art', a: 'candle', at: 'floor-ml', w: 72, h: 164 },
      { t: 'art', a: 'candle', at: 'floor-mr', w: 64, h: 146 },
      { t: 'art', a: 'skull', at: 'back-r-hi', w: 150, h: 150, dy: 290 },
    ],
  },
  {
    id: 'kitchendoor', parent: 'oak', name: 'The Kitchen Door', sub: 'Small & Kindly Magic',
    line: 'Fantasy with the stakes turned down and the heating turned up. Bread, tea, a manageable amount of doom.',
    kind: 'k-paper',
    pal: {
      wall: '#63502f', 'wall-lit': '#957a46', floor: '#5c422a', 'floor-lit': '#926b45',
      ceiling: '#3d301c', wood: '#9a7643', 'wood-lit': '#c29a5f', 'wood-dark': '#4d3a20',
      glow: '#ffe19a', accent: '#f7cb78', 'door-glow': '#ffd88a', hue: 40,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang', w: 210, h: 124, cord: 100, beam: 540 },
      { t: 'art', a: 'teapot', at: 'floor-l', w: 220, h: 172 },
      { t: 'art', a: 'herbs', at: 'back-l-hi', w: 230, h: 260 },
      { t: 'art', a: 'cat', at: 'floor-r', w: 220, h: 132, breathe: true },
      { t: 'rug', at: 'rug', w: 560, h: 400, c1: '#8a6534', c2: '#b58a45' },
    ],
  },

  /* ── The Lamp Room ──────────────────────────────────────── */
  {
    id: 'fogline', parent: 'lamproom', name: 'The Fog Line', sub: 'Golden Age Detection',
    line: 'Country houses, timetables, a body in the library. The puzzle is the point and the puzzle is fair.',
    kind: 'k-plaster',
    pal: {
      wall: '#5a5140', 'wall-lit': '#867a5f', floor: '#4b4230', 'floor-lit': '#79694a',
      ceiling: '#37311f', wood: '#7d6845', 'wood-lit': '#a68d61', 'wood-dark': '#413522',
      glow: '#ffe8ba', accent: '#dcc389', 'door-glow': '#f2dda8', hue: 44,
    },
    amb: 'fog',
    props: [
      { t: 'lamp', at: 'hang', w: 190, h: 116, cord: 130, beam: 490 },
      { t: 'art', a: 'clock', at: 'above', w: 145, h: 145 },
      { t: 'art', a: 'armchair', at: 'floor-r', w: 300, h: 255, c: '#6d5342' },
      { t: 'art', a: 'teapot', at: 'floor-l', w: 200, h: 158, c: '#bcae8c' },
    ],
  },
  {
    id: 'wrongman', parent: 'lamproom', name: 'The Wrong Man', sub: 'Noir & Hardboiled',
    line: 'Everybody is guilty of something. The detective is not going to make it better; he is going to make it clear.',
    kind: 'k-tile',
    pal: {
      wall: '#343841', 'wall-lit': '#555b68', floor: '#2b2d33', 'floor-lit': '#494c56',
      ceiling: '#1f2126', wood: '#4e4e57', 'wood-lit': '#6f6f7a', 'wood-dark': '#28282e',
      glow: '#f6f6ee', 'glow-2': '#ee8259', accent: '#efe9d8', 'door-glow': '#efe9d8', hue: 220,
    },
    amb: 'smoke',
    props: [
      { t: 'blinds', at: 'back-r', w: 300, h: 420 },
      { t: 'lamp', at: 'hang', w: 165, h: 100, cord: 220, beam: 400 },
      { t: 'art', a: 'typewriter', at: 'floor-l', w: 290, h: 195, c: '#33333a' },
      { t: 'art', a: 'bottles', at: 'floor-r', w: 250, h: 170 },
    ],
  },
  {
    id: 'coldcoast', parent: 'lamproom', name: 'The Cold Coast', sub: 'Crime in Translation',
    line: 'Murder in places with long winters and good social services. It turns out that does not help as much as you would think.',
    kind: 'k-ice',
    pal: {
      wall: '#37505f', 'wall-lit': '#587687', floor: '#2f3f4a', 'floor-lit': '#4e6879',
      ceiling: '#212f38', wood: '#526674', 'wood-lit': '#748a99', 'wood-dark': '#2c3941',
      glow: '#cfeaff', 'glow-2': '#6aabd8', accent: '#b4dcf5', 'door-glow': '#aad8f5', hue: 204,
    },
    amb: 'snow',
    props: [
      { t: 'window', at: 'back-l', w: 250, h: 400, sky1: '#5f8298', sky2: '#1e2b34', snow: true },
      { t: 'lamp', at: 'hang', w: 180, h: 110, cord: 150, beam: 470 },
      { t: 'art', a: 'anchor', at: 'floor-r', w: 190, h: 240 },
      { t: 'art', a: 'bottles', at: 'floor-l', w: 230, h: 155, c: '#9fc2d4' },
    ],
  },
  {
    id: 'quietvillage', parent: 'lamproom', name: 'The Quiet Village', sub: 'Rural Noir',
    line: 'Small towns, long grudges. The nearest police station is forty miles away and everyone is related.',
    kind: 'k-panel',
    pal: {
      wall: '#554a33', 'wall-lit': '#82724c', floor: '#54432a', 'floor-lit': '#856a41',
      ceiling: '#342c1d', wood: '#7d6740', 'wood-lit': '#a68a58', 'wood-dark': '#3f3320',
      glow: '#ffd88a', 'glow-2': '#d89a4a', accent: '#e3b96c', 'door-glow': '#f2c67a', hue: 38,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang', w: 180, h: 110, cord: 140, beam: 470 },
      { t: 'art', a: 'crate', at: 'floor-l', w: 230, h: 178 },
      { t: 'art', a: 'herbs', at: 'back-r-hi', w: 220, h: 250, c: '#b2a45f' },
      { t: 'art', a: 'umbrella', at: 'floor-r', w: 120, h: 290, c: '#5c5238' },
    ],
  },

  /* ── The Landing → halls ────────────────────────────────── */
  {
    id: 'glasshouse', parent: 'landing', name: 'The Glasshouse', sub: 'Nature, Place & Weather',
    line: 'Built onto the back of the shop by someone who wanted to read about outside while being emphatically inside.',
    kind: 'k-glass',
    pal: {
      wall: '#3f5442', 'wall-lit': '#617f64', floor: '#4e4535', 'floor-lit': '#7c6f4c',
      ceiling: '#2b3a2e', wood: '#5f7358', 'wood-lit': '#849a7b', 'wood-dark': '#33422f',
      glow: '#e8f6c2', 'glow-2': '#9fd47a', accent: '#b4de8a', 'door-glow': '#c2ee98',
      'sky-1': '#a8c0b6', 'sky-2': '#42574a', hue: 108,
    },
    amb: 'pollen',
    props: [
      { t: 'art', a: 'plant', at: 'floor-l', w: 260, h: 330 },
      { t: 'art', a: 'plant', at: 'floor-r', w: 220, h: 280 },
      { t: 'art', a: 'plant', at: 'floor-ml', w: 180, h: 230 },
      { t: 'lamp', at: 'hang', w: 180, h: 104, cord: 120, beam: 470 },
    ],
  },
  {
    id: 'readingroom', parent: 'landing', name: 'The Reading Room', sub: 'History & Ideas',
    line: 'Green baize, brass lamps, the smell of index cards. Non-fiction that reads like the best novel you never had.',
    kind: 'k-tile',
    pal: {
      wall: '#3e4a41', 'wall-lit': '#61705f', floor: '#3e3c2f', 'floor-lit': '#645f47',
      ceiling: '#2a332c', wood: '#63523a', 'wood-lit': '#8a7452', 'wood-dark': '#332a1d',
      glow: '#aeeec4', 'glow-2': '#d4ae5a', accent: '#dcbd78', 'door-glow': '#b4eecc', hue: 150,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang-l', w: 155, h: 96, cord: 180, beam: 380, green: true },
      { t: 'lamp', at: 'hang-r', w: 155, h: 96, cord: 130, beam: 380, green: true },
      { t: 'art', a: 'globe', at: 'floor-l', w: 200, h: 260, c: '#dcbd78', d: '#3a4a42' },
      { t: 'art', a: 'clock', at: 'above', w: 140, h: 140, c: '#dcbd78' },
      { t: 'art', a: 'armchair', at: 'floor-r', w: 290, h: 246, c: '#4f5c4a' },
    ],
  },
  {
    id: 'attic', parent: 'landing', name: 'The Attic', sub: 'Poetry',
    line: 'Up the ladder, mind your head. One skylight, one chair, and the shortest books in the shop.',
    kind: 'k-timber', low: true,
    pal: {
      wall: '#413b45', 'wall-lit': '#645c6c', floor: '#453930', 'floor-lit': '#6d594a',
      ceiling: '#2a262f', wood: '#5f4e42', 'wood-lit': '#846d5c', 'wood-dark': '#312720',
      glow: '#cfd9ff', 'glow-2': '#a897e2', accent: '#c2c8f0', 'door-glow': '#ccd4f6', hue: 246,
    },
    amb: 'motes',
    props: [
      { t: 'skylight', at: 'ceil', w: 520, h: 420 },
      { t: 'art', a: 'candle', at: 'floor-ml', w: 72, h: 164 },
      { t: 'art', a: 'moth', at: 'back-r-hi', w: 230, h: 175, dy: 240 },
      { t: 'art', a: 'armchair', at: 'floor-r', w: 290, h: 246, c: '#584a54' },
    ],
  },
  {
    id: 'cellar', parent: 'landing', name: 'The Cellar', sub: 'Horror & the Uncanny',
    line: 'Take the candle. The bulb down here has never worked and the shopkeeper has stopped pretending it will.',
    kind: 'k-brick', low: true,
    pal: {
      wall: '#3a302d', 'wall-lit': '#5c4842', floor: '#302a26', 'floor-lit': '#4f443b',
      ceiling: '#201a18', wood: '#4d3b30', 'wood-lit': '#6d5443', 'wood-dark': '#2a1f19',
      glow: '#ffc484', accent: '#d89c6c', 'door-glow': '#e39a5c', hue: 20,
    },
    amb: 'embers',
    props: [
      { t: 'art', a: 'candle', at: 'floor-ml', w: 78, h: 176 },
      { t: 'art', a: 'candle', at: 'floor-mr', w: 66, h: 150 },
      { t: 'lamp', at: 'hang', w: 145, h: 90, cord: 60, beam: 360, dy: 290 },
      { t: 'art', a: 'bottles', at: 'back-r-hi', w: 260, h: 175, dy: 250 },
    ],
  },
  {
    id: 'inkroom', parent: 'landing', name: 'The Ink Room', sub: 'Comics & Graphic Novels',
    line: 'Wide shelves, because these books do not fit anywhere else, and flat drawers for the ones that really do not.',
    kind: 'k-ink',
    pal: {
      wall: '#4a3840', 'wall-lit': '#71545f', floor: '#3f3134', 'floor-lit': '#655050',
      ceiling: '#2c2126', wood: '#66454e', 'wood-lit': '#8c626c', 'wood-dark': '#33242a',
      glow: '#ffdd63', 'glow-2': '#ef5548', accent: '#f7cf4c', 'door-glow': '#ffd44f', hue: 352,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang', w: 200, h: 114, cord: 130, beam: 500 },
      { t: 'art', a: 'stack', at: 'floor-l', w: 200, h: 180, c1: '#ef5548', c2: '#f7cf4c', c3: '#3a5fa8' },
      { t: 'art', a: 'crate', at: 'floor-r', w: 240, h: 185 },
    ],
  },
  {
    id: 'windowseat', parent: 'landing', name: 'The Window Seat', sub: 'Memoir & the Essay',
    line: 'A cushion, a draught, and books by people thinking aloud about their own lives with unusual honesty.',
    kind: 'k-paper',
    pal: {
      wall: '#5c4855', 'wall-lit': '#856a7d', floor: '#523f34', 'floor-lit': '#82644c',
      ceiling: '#392b34', wood: '#8a6058', 'wood-lit': '#b2837a', 'wood-dark': '#432c27',
      glow: '#ffcdbe', 'glow-2': '#e2a2ad', accent: '#f2b6a6', 'door-glow': '#ffc2b0', hue: 344,
    },
    amb: 'dust',
    props: [
      { t: 'window', at: 'back-r', w: 300, h: 420, sky1: '#d8a294', sky2: '#4a3540' },
      { t: 'lamp', at: 'hang', w: 200, h: 118, cord: 120, beam: 510 },
      { t: 'art', a: 'armchair', at: 'floor-l', w: 300, h: 255, c: '#a06a6a' },
      { t: 'art', a: 'teapot', at: 'floor-r', w: 190, h: 150, c: '#e0b8ae' },
    ],
  },

  /* ── The Glasshouse ─────────────────────────────────────── */
  {
    id: 'understory', parent: 'glasshouse', name: 'The Understory', sub: 'Forests, Trees & Fungi',
    line: 'Everything under the canopy: root networks, rot, the slow talk of trees, and the people who learned to listen.',
    kind: 'k-forest',
    pal: {
      wall: '#2c4029', 'wall-lit': '#4c6b45', floor: '#37331f', 'floor-lit': '#5b5434',
      ceiling: '#1c2a1a', wood: '#5f5735', 'wood-lit': '#867c4e', 'wood-dark': '#302c1c',
      glow: '#cff5a8', 'glow-2': '#7bbc57', accent: '#aede8a', 'door-glow': '#b4ee94', hue: 96,
    },
    amb: 'spores',
    props: [
      { t: 'trunk', at: 'tall-l', w: 260, h: 940 },
      { t: 'trunk', at: 'tall-r', w: 300, h: 940 },
      { t: 'art', a: 'mushrooms', at: 'floor-l', w: 280, h: 190, c: '#d4804f' },
      { t: 'lamp', at: 'hang', w: 165, h: 100, cord: 160, beam: 430 },
    ],
  },
  {
    id: 'saltline', parent: 'glasshouse', name: 'The Salt Line', sub: 'Sea & Coast',
    line: 'Tides, wrecks, fishing towns and the particular loneliness of a shipping forecast at four in the morning.',
    kind: 'k-water',
    pal: {
      wall: '#2b4a5a', 'wall-lit': '#487489', floor: '#33444f', 'floor-lit': '#527082',
      ceiling: '#1e333d', wood: '#4f6f7e', 'wood-lit': '#7295a3', 'wood-dark': '#2a3d47',
      glow: '#b8f0ff', 'glow-2': '#59aad4', accent: '#9fe6f5', 'door-glow': '#aeecff', hue: 194,
    },
    amb: 'bubbles',
    props: [
      { t: 'art', a: 'anchor', at: 'floor-l', w: 210, h: 260 },
      { t: 'art', a: 'shipmodel', at: 'floor-r', w: 280, h: 250, s: '#e2eef0' },
      { t: 'window', at: 'back-l', w: 240, h: 380, sky1: '#6fa2ba', sky2: '#1b3340' },
      { t: 'lamp', at: 'hang', w: 175, h: 104, cord: 150, beam: 450 },
    ],
  },
  {
    id: 'snowroom', parent: 'glasshouse', name: 'The Snow Room', sub: 'Ice & High Places',
    line: 'Polar expeditions, mountain disasters, and the strange calm of people at altitude. Colder than the rest of the shop, somehow.',
    kind: 'k-ice',
    pal: {
      wall: '#3f5464', 'wall-lit': '#628096', floor: '#414d5a', 'floor-lit': '#657a8c',
      ceiling: '#26333d', wood: '#5b6f7f', 'wood-lit': '#7f95a5', 'wood-dark': '#2e3a44',
      glow: '#eaf6ff', 'glow-2': '#8fc2e6', accent: '#d9ebfa', 'door-glow': '#e6f4ff', hue: 208,
    },
    amb: 'snow',
    props: [
      { t: 'window', at: 'back-r', w: 290, h: 420, sky1: '#a3c4dc', sky2: '#2e4250', snow: true },
      { t: 'lamp', at: 'hang', w: 175, h: 106, cord: 150, beam: 460 },
      { t: 'art', a: 'crate', at: 'floor-l', w: 240, h: 185, c: '#5b6f7f' },
      { t: 'art', a: 'telescope', at: 'floor-r', w: 240, h: 265, c: '#bcd4e2', d: '#2e3a44' },
    ],
  },
  {
    id: 'smallkingdom', parent: 'glasshouse', name: 'The Small Kingdom', sub: 'Insects, Birds & Little Lives',
    line: 'Everything you could stand on without noticing. Specimen drawers, moth traps, and a great deal of patient watching.',
    kind: 'k-glass',
    pal: {
      wall: '#544d2e', 'wall-lit': '#7f7546', floor: '#4e4429', 'floor-lit': '#7d6d42',
      ceiling: '#33301c', wood: '#7a6b3c', 'wood-lit': '#a29054', 'wood-dark': '#3d361d',
      glow: '#ffe89a', 'glow-2': '#d8b74a', accent: '#f0d97a', 'door-glow': '#f7de8a',
      'sky-1': '#c0ae6a', 'sky-2': '#4c4628', hue: 50,
    },
    amb: 'pollen',
    props: [
      { t: 'art', a: 'moth', at: 'back-l-hi', w: 280, h: 210 },
      { t: 'art', a: 'birdcage', at: 'floor-r', w: 200, h: 315, c: '#f0d97a' },
      { t: 'art', a: 'plant', at: 'floor-l', w: 220, h: 280, c: '#9fb85a' },
      { t: 'lamp', at: 'hang', w: 175, h: 104, cord: 140, beam: 450 },
    ],
  },

  /* ── The Reading Room ───────────────────────────────────── */
  {
    id: 'longtable', parent: 'readingroom', name: 'The Long Table', sub: 'Deep History',
    line: 'Centuries at a time. Empires, plagues, trade routes and the awkward business of how we got here.',
    kind: 'k-stone',
    pal: {
      wall: '#584739', 'wall-lit': '#846a52', floor: '#503d29', 'floor-lit': '#82633f',
      ceiling: '#372b20', wood: '#7d6243', 'wood-lit': '#a5835c', 'wood-dark': '#402f20',
      glow: '#ffd89a', accent: '#dcb072', 'door-glow': '#f2c583', hue: 32,
    },
    amb: 'dust',
    props: [
      { t: 'column', at: 'tall-l', w: 160, h: 940 },
      { t: 'column', at: 'tall-r', w: 160, h: 940 },
      { t: 'lamp', at: 'hang', w: 190, h: 116, cord: 130, beam: 490 },
      { t: 'art', a: 'globe', at: 'floor-l', w: 190, h: 250 },
    ],
  },
  {
    id: 'glasscase', parent: 'readingroom', name: 'The Glass Case', sub: 'Science & the Mind',
    line: 'How things work, including you. Written by people who can do the maths and also write a sentence.',
    kind: 'k-glass',
    pal: {
      wall: '#37504f', 'wall-lit': '#587a78', floor: '#354241', 'floor-lit': '#566a68',
      ceiling: '#233434', wood: '#527070', 'wood-lit': '#769393', 'wood-dark': '#2b3d3d',
      glow: '#b4f6e6', 'glow-2': '#5cd8c0', accent: '#9fecdc', 'door-glow': '#aef4e6',
      'sky-1': '#7aa6a0', 'sky-2': '#2c4442', hue: 172,
    },
    amb: 'motes',
    props: [
      { t: 'art', a: 'bottles', at: 'floor-l', w: 270, h: 180, c: '#9fecdc' },
      { t: 'art', a: 'clock', at: 'above', w: 140, h: 140, c: '#9fecdc', f: '#2b3d3d' },
      { t: 'lamp', at: 'hang', w: 180, h: 110, cord: 140, beam: 470 },
      { t: 'art', a: 'telescope', at: 'floor-r', w: 280, h: 310, c: '#9fecdc', d: '#2b3d3d' },
    ],
  },
  {
    id: 'argument', parent: 'readingroom', name: 'The Argument Room', sub: 'Philosophy & Essays',
    line: 'Two chairs facing each other and nobody in either of them. Books that would rather change your mind than agree with it.',
    kind: 'k-plaster',
    pal: {
      wall: '#464a50', 'wall-lit': '#6b7079', floor: '#3d3c3a', 'floor-lit': '#615e59',
      ceiling: '#2c2e32', wood: '#5f5a54', 'wood-lit': '#847d74', 'wood-dark': '#312e2b',
      glow: '#f6efdc', 'glow-2': '#d89f5c', accent: '#ded3b4', 'door-glow': '#f2e6c8', hue: 40,
    },
    amb: 'dust',
    props: [
      { t: 'art', a: 'armchair', at: 'floor-l', w: 300, h: 255, c: '#5c5852' },
      { t: 'art', a: 'armchair', at: 'floor-r', w: 300, h: 255, c: '#5c5852' },
      { t: 'lamp', at: 'hang', w: 180, h: 110, cord: 160, beam: 460 },
      { t: 'art', a: 'clock', at: 'above', w: 130, h: 130, c: '#ded3b4', f: '#33312e' },
    ],
  },
  {
    id: 'witnessbox', parent: 'readingroom', name: 'The Witness Box', sub: 'Reportage & Testimony',
    line: 'Someone went and looked and came back and wrote it down. Often at considerable cost.',
    kind: 'k-tile',
    pal: {
      wall: '#414246', 'wall-lit': '#65666d', floor: '#393735', 'floor-lit': '#5c5852',
      ceiling: '#2a2b2d', wood: '#5a544c', 'wood-lit': '#7e766b', 'wood-dark': '#2f2c27',
      glow: '#f6f2e6', 'glow-2': '#d85a48', accent: '#e2604a', 'door-glow': '#f2ece0', hue: 8,
    },
    amb: 'dust',
    props: [
      { t: 'art', a: 'typewriter', at: 'floor-l', w: 290, h: 195, c: '#42424a' },
      { t: 'lamp', at: 'hang', w: 175, h: 104, cord: 190, beam: 430 },
      { t: 'art', a: 'crate', at: 'floor-r', w: 240, h: 185, c: '#5e574d' },
    ],
  },

  /* ── The Attic ──────────────────────────────────────────── */
  {
    id: 'rafters', parent: 'attic', name: 'The Rafters', sub: 'Poets Now Living',
    line: 'Collections from the last thirty years that people actually reach for, rather than nod at.',
    kind: 'k-timber', low: true,
    pal: {
      wall: '#44424f', 'wall-lit': '#676478', floor: '#453d3b', 'floor-lit': '#6a5d58',
      ceiling: '#2c2b35', wood: '#5f545c', 'wood-lit': '#847681', 'wood-dark': '#332e35',
      glow: '#ded2ff', 'glow-2': '#ab9bee', accent: '#cec2f6', 'door-glow': '#d8ccff', hue: 260,
    },
    amb: 'motes',
    props: [
      { t: 'skylight', at: 'ceil', w: 460, h: 400 },
      { t: 'art', a: 'candle', at: 'floor-mr', w: 72, h: 164 },
      { t: 'art', a: 'quill', at: 'floor-l', w: 200, h: 200 },
    ],
  },
  {
    id: 'oldbeam', parent: 'attic', name: 'The Old Beam', sub: 'The Canon, Handled',
    line: 'Poets dead long enough to be free, in editions worth owning rather than the ones you were set at school.',
    kind: 'k-timber', low: true,
    pal: {
      wall: '#473b33', 'wall-lit': '#6d594a', floor: '#40352a', 'floor-lit': '#665140',
      ceiling: '#2c231d', wood: '#5f4b3b', 'wood-lit': '#846a53', 'wood-dark': '#332720',
      glow: '#ffd49a', accent: '#e2b07c', 'door-glow': '#f7c68e', hue: 34,
    },
    amb: 'dust',
    props: [
      { t: 'art', a: 'candle', at: 'floor-ml', w: 78, h: 176 },
      { t: 'art', a: 'candle', at: 'floor-mr', w: 66, h: 150 },
      { t: 'lamp', at: 'hang', w: 155, h: 96, cord: 60, beam: 380, dy: 290 },
      { t: 'art', a: 'quill', at: 'back-l-hi', w: 180, h: 180, dy: 250 },
    ],
  },
  {
    id: 'foreignwindow', parent: 'attic', name: 'The Foreign Window', sub: 'Poetry in Translation',
    line: 'The hardest thing in the shop to do well, and here are the people who did it.',
    kind: 'k-timber', low: true,
    pal: {
      wall: '#3d3c54', 'wall-lit': '#5e5c7e', floor: '#3c3846', 'floor-lit': '#5c566b',
      ceiling: '#282738', wood: '#585268', 'wood-lit': '#7b748e', 'wood-dark': '#2e2b3a',
      glow: '#cbdcff', 'glow-2': '#9fadee', accent: '#c2d0f6', 'door-glow': '#cfdcff', hue: 234,
    },
    amb: 'motes',
    props: [
      { t: 'skylight', at: 'ceil', w: 420, h: 380 },
      { t: 'art', a: 'moth', at: 'floor-r', w: 240, h: 180 },
      { t: 'art', a: 'quill', at: 'floor-l', w: 190, h: 190 },
    ],
  },

  /* ── The Cellar ─────────────────────────────────────────── */
  {
    id: 'candlestair', parent: 'cellar', name: 'The Candle Stair', sub: 'Gothic',
    line: 'Big houses with damp secrets, and women who are absolutely right about the attic.',
    kind: 'k-stone', low: true,
    pal: {
      wall: '#412c34', 'wall-lit': '#664450', floor: '#342629', 'floor-lit': '#563c42',
      ceiling: '#251a1e', wood: '#573c43', 'wood-lit': '#7b565f', 'wood-dark': '#2e2024',
      glow: '#ffbaad', 'glow-2': '#c04a5c', accent: '#e2828c', 'door-glow': '#f09a9a', hue: 344,
    },
    amb: 'embers',
    props: [
      { t: 'art', a: 'candle', at: 'floor-ml', w: 78, h: 176 },
      { t: 'art', a: 'clock', at: 'above', w: 140, h: 140, c: '#a86a6a', f: '#3d2a30', dy: 285 },
      { t: 'art', a: 'birdcage', at: 'floor-r', w: 190, h: 300, c: '#c08484' },
      { t: 'lamp', at: 'hang', w: 145, h: 90, cord: 60, beam: 360, dy: 290 },
    ],
  },
  {
    id: 'dampwall', parent: 'cellar', name: 'The Damp Wall', sub: 'Quiet & Weird Horror',
    line: 'No monsters, or none you can point at. Something is wrong with the geometry and nobody will say so.',
    kind: 'k-brick', low: true,
    pal: {
      wall: '#2f3b34', 'wall-lit': '#4c5c50', floor: '#2c332e', 'floor-lit': '#495247',
      ceiling: '#1e2622', wood: '#455449', 'wood-lit': '#647461', 'wood-dark': '#27302a',
      glow: '#b8eeae', 'glow-2': '#6da87c', accent: '#9fd49a', 'door-glow': '#aee2a8', hue: 130,
    },
    amb: 'spores',
    props: [
      { t: 'art', a: 'candle', at: 'floor-mr', w: 66, h: 150, h2: '#6da87c' },
      { t: 'art', a: 'mushrooms', at: 'floor-l', w: 260, h: 180, c: '#8aae76' },
      { t: 'lamp', at: 'hang', w: 145, h: 90, cord: 60, beam: 360, dy: 290 },
    ],
  },
  {
    id: 'lockedroom', parent: 'cellar', name: 'The Locked Room', sub: 'Folk Horror',
    line: 'The village has a custom. They would rather you did not ask about it, and definitely not before the harvest.',
    kind: 'k-forest', low: true,
    pal: {
      wall: '#453a24', 'wall-lit': '#6b5a33', floor: '#3e3520', 'floor-lit': '#645330',
      ceiling: '#2a2417', wood: '#68522b', 'wood-lit': '#8e7340', 'wood-dark': '#352a17',
      glow: '#ffd868', 'glow-2': '#d88a3a', accent: '#eec25c', 'door-glow': '#f7ca5c', hue: 44,
    },
    amb: 'embers',
    props: [
      { t: 'art', a: 'herbs', at: 'back-l-hi', w: 240, h: 270, c: '#a3a45c', dy: 240 },
      { t: 'art', a: 'candle', at: 'floor-mr', w: 72, h: 164 },
      { t: 'art', a: 'skull', at: 'floor-l', w: 160, h: 160, c: '#e2d3a8' },
      { t: 'lamp', at: 'hang', w: 155, h: 92, cord: 60, beam: 370, dy: 290 },
    ],
  },

  /* ── The Ink Room ───────────────────────────────────────── */
  {
    id: 'panelwall', parent: 'inkroom', name: 'The Panel Wall', sub: 'Literary Comics & Memoir',
    line: 'Comics that go on the same shelf as the novels, because that is where they belong.',
    kind: 'k-ink',
    pal: {
      wall: '#4d423b', 'wall-lit': '#736358', floor: '#413830', 'floor-lit': '#69594a',
      ceiling: '#302823', wood: '#65533f', 'wood-lit': '#8a7358', 'wood-dark': '#332a21',
      glow: '#ffe8ba', 'glow-2': '#e2604a', accent: '#f0d29a', 'door-glow': '#f7dda8', hue: 28,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang', w: 200, h: 114, cord: 130, beam: 500 },
      { t: 'art', a: 'stack', at: 'floor-l', w: 200, h: 180 },
      { t: 'art', a: 'quill', at: 'floor-r', w: 190, h: 190 },
    ],
  },
  {
    id: 'longstrip', parent: 'inkroom', name: 'The Long Strip', sub: 'Manga & Comics Abroad',
    line: 'Right to left, and worth the adjustment. Bandes dessinées, gekiga, and a few things with no category at all.',
    kind: 'k-ink',
    pal: {
      wall: '#4e3742', 'wall-lit': '#755365', floor: '#413440', 'floor-lit': '#685360',
      ceiling: '#2f2229', wood: '#664755', 'wood-lit': '#8c6474', 'wood-dark': '#33232c',
      glow: '#ffc4dd', 'glow-2': '#ef629f', accent: '#f7b0cf', 'door-glow': '#ffc8e0', hue: 328,
    },
    amb: 'pollen',
    props: [
      { t: 'lamp', at: 'hang', w: 190, h: 110, cord: 140, beam: 480 },
      { t: 'art', a: 'moth', at: 'floor-r', w: 240, h: 180, c: '#f7b0cf' },
      { t: 'art', a: 'crate', at: 'floor-l', w: 230, h: 178 },
    ],
  },

  /* ── The Window Seat ────────────────────────────────────── */
  {
    id: 'saltcellar', parent: 'windowseat', name: 'The Salt Cellar', sub: 'Food & the Table',
    line: 'Not recipe books. Books about hunger, kitchens, restaurants, and what people mean when they cook for you.',
    kind: 'k-tile',
    pal: {
      wall: '#634434', 'wall-lit': '#916448', floor: '#553b26', 'floor-lit': '#8a5e3c',
      ceiling: '#3c281c', wood: '#8a5f42', 'wood-lit': '#b2825b', 'wood-dark': '#452c1c',
      glow: '#ffce8f', 'glow-2': '#d88a3a', accent: '#f2b06c', 'door-glow': '#ffbc7a', hue: 24,
    },
    amb: 'dust',
    props: [
      { t: 'art', a: 'teapot', at: 'floor-l', w: 220, h: 172, c: '#d8ae6a' },
      { t: 'art', a: 'bottles', at: 'floor-r', w: 270, h: 180, c: '#c08a4a' },
      { t: 'art', a: 'herbs', at: 'back-l-hi', w: 230, h: 260, c: '#9fac68' },
      { t: 'lamp', at: 'hang', w: 200, h: 118, cord: 120, beam: 510 },
    ],
  },
  {
    id: 'wanderingchair', parent: 'windowseat', name: 'The Wandering Chair', sub: 'Travel & Elsewhere',
    line: 'Travel writing by people who went slowly, stayed too long, and were changed by it — not by people on assignment.',
    kind: 'k-paper',
    pal: {
      wall: '#455662', 'wall-lit': '#68808e', floor: '#464538', 'floor-lit': '#6d6a55',
      ceiling: '#2e3b43', wood: '#615b47', 'wood-lit': '#867e64', 'wood-dark': '#332f24',
      glow: '#ffe4b8', 'glow-2': '#a2c4d8', accent: '#dcc59a', 'door-glow': '#f2d9ab', hue: 200,
    },
    amb: 'dust',
    props: [
      { t: 'art', a: 'globe', at: 'floor-l', w: 200, h: 262 },
      { t: 'art', a: 'crate', at: 'floor-r', w: 240, h: 185 },
      { t: 'art', a: 'umbrella', at: 'floor-mr', w: 120, h: 290, c: '#7a6a48' },
      { t: 'lamp', at: 'hang', w: 190, h: 112, cord: 130, beam: 490 },
    ],
  },

  /* ── the front table ────────────────────────────────────── */
  {
    id: 'fronttable', parent: 'front', viaTable: true,
    name: 'The Front Table', sub: 'New & Much Talked About',
    line: 'The prize lists of the last few years, and the books everyone is currently arguing about. Nearest the door, for a reason.',
    kind: 'k-panel',
    pal: {
      wall: '#5e4232', 'wall-lit': '#8e6244', floor: '#5c3f26', 'floor-lit': '#96683e',
      ceiling: '#36241a', wood: '#82593c', 'wood-lit': '#ad7c55', 'wood-dark': '#472d1c',
      glow: '#ffcb78', accent: '#f0b45c', 'door-glow': '#ffc46a', hue: 30,
    },
    amb: 'dust',
    props: [
      { t: 'lamp', at: 'hang', w: 210, h: 124, cord: 110, beam: 550 },
      { t: 'art', a: 'stack', at: 'floor-l', w: 200, h: 180 },
      { t: 'art', a: 'stack', at: 'floor-r', w: 180, h: 165, c1: '#35525f', c2: '#d4a760', c3: '#9a5430' },
      { t: 'rug', at: 'rug', w: 600, h: 430, c1: '#6d4a2e', c2: '#9c6b3d' },
    ],
  },
];

export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

for (const r of ROOMS) {
  r.children = ROOMS.filter((c) => c.parent === r.id);
  r.depth = (function d(x) { return x.parent ? 1 + d(ROOM_BY_ID[x.parent]) : 0; })(r);
}

export function pathTo(id) {
  const out = [];
  let r = ROOM_BY_ID[id];
  while (r) { out.unshift(r); r = r.parent ? ROOM_BY_ID[r.parent] : null; }
  return out;
}
