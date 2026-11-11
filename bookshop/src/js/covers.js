/* ============================================================
   Procedural book covers.

   Every book is given a jacket built from a palette, a motif and
   a layout. If a book doesn't name its own art, one is chosen
   deterministically from its id — so a given book always looks
   the same, and no two neighbours look alike.
   ============================================================ */

/* ── deterministic randomness ─────────────────────────────── */

function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFrom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

/* ── palettes ─────────────────────────────────────────────── */
/* bg: jacket ground · ink: type · a/b/c: art · sp: spine ground */

export const PALETTES = {
  ochre:      { bg: '#d8873c', ink: '#241408', a: '#f3d9a8', b: '#8f3d1c', c: '#f7efdc', sp: '#c2762f' },
  oxblood:    { bg: '#7c2b2a', ink: '#f6e7cf', a: '#e5b45c', b: '#3a1010', c: '#c9705a', sp: '#6a2323' },
  midnight:   { bg: '#131c33', ink: '#e9e2cf', a: '#e0b45c', b: '#2f4a7a', c: '#8fb9e8', sp: '#0f1728' },
  moss:       { bg: '#2e4034', ink: '#efe4c8', a: '#a8bf7a', b: '#16241c', c: '#d9b45c', sp: '#26362c' },
  bone:       { bg: '#eae2ce', ink: '#241f19', a: '#b6553c', b: '#8b8368', c: '#2f3b46', sp: '#ded4bc' },
  ink:        { bg: '#14161a', ink: '#f2efe6', a: '#d8433a', b: '#3d444f', c: '#c8bda4', sp: '#0f1114' },
  tide:       { bg: '#1e4a56', ink: '#eef3ec', a: '#7fd2c8', b: '#0f2b33', c: '#e8c06a', sp: '#183c46' },
  plum:       { bg: '#3c2246', ink: '#f0e4f2', a: '#d986a8', b: '#1d1024', c: '#f0c25e', sp: '#331d3c' },
  saffron:    { bg: '#e3a326', ink: '#2a1c06', a: '#7a3510', b: '#fdf3d8', c: '#2f5d52', sp: '#c98d1e' },
  slate:      { bg: '#3b444c', ink: '#eceff1', a: '#9fb3bd', b: '#20272c', c: '#e0975a', sp: '#333b42' },
  rose:       { bg: '#c96a68', ink: '#2a1113', a: '#f6ddd0', b: '#7a2a30', c: '#3d5a4e', sp: '#b45c5b' },
  forest:     { bg: '#17301f', ink: '#e6e9cf', a: '#5f8a4a', b: '#0a1610', c: '#d5a13f', sp: '#122718' },
  ecru:       { bg: '#f0e7d5', ink: '#2b2418', a: '#2f6f6a', b: '#c9532f', c: '#9a917a', sp: '#e3d8c2' },
  cobalt:     { bg: '#1d3a8f', ink: '#f2f4ff', a: '#f5c542', b: '#0e1f4f', c: '#8fa8ee', sp: '#18317a' },
  rust:       { bg: '#a4442a', ink: '#f7e5cf', a: '#e8b96a', b: '#4d1a10', c: '#2c4a4c', sp: '#8e3a24' },
  fog:        { bg: '#b9bdb6', ink: '#22261f', a: '#4a5a54', b: '#f2f1e9', c: '#8c4a3c', sp: '#a7aba4' },
  amethyst:   { bg: '#5b4a8f', ink: '#f1ecff', a: '#b6a4f0', b: '#2a2148', c: '#efc45c', sp: '#4e3f7c' },
  clay:       { bg: '#c1866a', ink: '#2c1a12', a: '#f4e2cc', b: '#6d3a26', c: '#3a5350', sp: '#ad775d' },
  seagrass:   { bg: '#4f7a63', ink: '#f2f5e9', a: '#c9dfa8', b: '#22402f', c: '#e9b54f', sp: '#446a56' },
  charcoal:   { bg: '#242426', ink: '#eceae4', a: '#c9a24a', b: '#4a4a4e', c: '#8fa3a8', sp: '#1c1c1e' },
  coral:      { bg: '#e0693f', ink: '#2b1208', a: '#ffd9a3', b: '#7a2410', c: '#1f4a52', sp: '#c95a34' },
  lichen:     { bg: '#8f9c6c', ink: '#1d200f', a: '#e8e6cc', b: '#4b5432', c: '#a8492f', sp: '#7f8b5f' },
  night:      { bg: '#0e1220', ink: '#dfe4ef', a: '#6f7fd4', b: '#232c46', c: '#e8c877', sp: '#0a0d18' },
  parchment:  { bg: '#e2d3ae', ink: '#37291a', a: '#8a5a2b', b: '#b8a179', c: '#5a6b4a', sp: '#d4c39c' },
  teal:       { bg: '#136064', ink: '#eafaf6', a: '#8fe0d0', b: '#07373c', c: '#f0b44c', sp: '#0f5155' },
  wine:       { bg: '#4a1c30', ink: '#f4dfe4', a: '#d9738c', b: '#240d18', c: '#e8c26a', sp: '#3f1729' },
  butter:     { bg: '#efc964', ink: '#33260a', a: '#7a5a1c', b: '#fdf6e0', c: '#2f5f4a', sp: '#dcb551' },
  storm:      { bg: '#2c3b46', ink: '#e8eef2', a: '#7ea3b8', b: '#16222a', c: '#e0a05a', sp: '#243239' },
  paper:      { bg: '#f5f1e6', ink: '#1c1a16', a: '#c23b2e', b: '#6b6558', c: '#26466b', sp: '#eae5d7' },
  copper:     { bg: '#8a4a2c', ink: '#f7e3c8', a: '#e0a45c', b: '#3d1d10', c: '#5a7a6a', sp: '#77401f' },
};

const PAL_KEYS = Object.keys(PALETTES);

/* ── motifs ───────────────────────────────────────────────── */
/* Each draws inside a 100 × 150 space. */

const MOTIFS = {
  moon: (r, p) => `
    <circle cx="50" cy="${52 + r() * 8}" r="${24 + r() * 8}" fill="${p.a}"/>
    <circle cx="${40 + r() * 16}" cy="${44 + r() * 10}" r="${20 + r() * 8}" fill="${p.bg}" opacity=".95"/>`,

  orbit: (r, p) => {
    let s = `<circle cx="50" cy="62" r="7" fill="${p.a}"/>`;
    for (let i = 0; i < 3 + Math.floor(r() * 2); i++) {
      const rx = 16 + i * 12, ry = (6 + i * 4) * (0.5 + r() * 0.6);
      s += `<ellipse cx="50" cy="62" rx="${rx}" ry="${ry}" fill="none" stroke="${i % 2 ? p.c : p.a}" stroke-width="1.1" opacity=".82" transform="rotate(${-30 + r() * 60} 50 62)"/>`;
    }
    return s;
  },

  sunburst: (r, p) => {
    let s = '';
    const n = 16 + Math.floor(r() * 10);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      s += `<line x1="50" y1="60" x2="${50 + Math.cos(a) * 70}" y2="${60 + Math.sin(a) * 70}" stroke="${p.a}" stroke-width="${i % 2 ? 1 : 2.6}" opacity=".6"/>`;
    }
    return s + `<circle cx="50" cy="60" r="${13 + r() * 6}" fill="${p.b}"/>`;
  },

  waves: (r, p) => {
    let s = '';
    for (let i = 0; i < 8; i++) {
      const y = 34 + i * 9;
      const amp = 4 + r() * 5;
      s += `<path d="M-5 ${y} Q 20 ${y - amp} 45 ${y} T 105 ${y}" fill="none" stroke="${i % 3 === 0 ? p.c : p.a}" stroke-width="${1 + r() * 1.4}" opacity=".8"/>`;
    }
    return s;
  },

  ridge: (r, p) => {
    const layer = (base, col, op) => {
      let d = `M-5 150 L-5 ${base}`;
      for (let x = 0; x <= 110; x += 11) d += ` L${x} ${base - (8 + r() * 26)}`;
      return `<path d="${d} L105 150 Z" fill="${col}" opacity="${op}"/>`;
    };
    return layer(112, p.b, '.85') + layer(96, p.a, '.9') + layer(80, p.c, '.75');
  },

  spiral: (r, p) => {
    let d = 'M50 62';
    for (let i = 0; i < 190; i++) {
      const t = i / 12, rad = t * 2.1;
      d += ` L${(50 + Math.cos(t) * rad).toFixed(2)} ${(62 + Math.sin(t) * rad).toFixed(2)}`;
    }
    return `<path d="${d}" fill="none" stroke="${p.a}" stroke-width="1.5" opacity=".9"/>`;
  },

  grid: (r, p) => {
    let s = '';
    const cols = 3 + Math.floor(r() * 2), rows = 4 + Math.floor(r() * 3);
    const w = 82 / cols, h = 92 / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (r() < 0.24) continue;
      s += `<rect x="${9 + i * w}" y="${20 + j * h}" width="${w - 3}" height="${h - 3}" fill="${r() < .3 ? p.c : p.a}" opacity="${(.4 + r() * .6).toFixed(2)}"/>`;
    }
    return s;
  },

  bars: (r, p) => {
    let s = '', y = 22;
    while (y < 128) {
      const h = 3 + r() * 12;
      s += `<rect x="${r() < .5 ? 6 : 26}" y="${y}" width="${40 + r() * 48}" height="${h}" fill="${r() < .35 ? p.c : p.a}" opacity="${(.5 + r() * .5).toFixed(2)}"/>`;
      y += h + 3 + r() * 7;
    }
    return s;
  },

  arch: (r, p) => `
    <path d="M22 132 L22 70 A28 28 0 0 1 78 70 L78 132 Z" fill="${p.a}"/>
    <path d="M32 132 L32 72 A18 18 0 0 1 68 72 L68 132 Z" fill="${p.b}"/>
    <circle cx="50" cy="${86 + r() * 14}" r="4" fill="${p.c}"/>`,

  eye: (r, p) => `
    <path d="M8 62 Q50 24 92 62 Q50 100 8 62 Z" fill="${p.a}"/>
    <circle cx="50" cy="62" r="17" fill="${p.b}"/>
    <circle cx="50" cy="62" r="7" fill="${p.c}"/>
    <circle cx="45" cy="56" r="3" fill="${p.bg}" opacity=".8"/>`,

  keyhole: (r, p) => `
    <circle cx="50" cy="56" r="17" fill="${p.a}"/>
    <path d="M42 66 L38 104 L62 104 L58 66 Z" fill="${p.a}"/>
    <circle cx="50" cy="56" r="7" fill="${p.bg}"/>`,

  tree: (r, p) => {
    let s = `<rect x="47" y="78" width="6" height="52" fill="${p.b}"/>`;
    const branch = (x, y, ang, len, d) => {
      if (d > 4 || len < 3) return '';
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      let o = `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${d < 2 ? p.b : p.a}" stroke-width="${(5 - d).toFixed(1)}" stroke-linecap="round"/>`;
      o += branch(x2, y2, ang - 0.42 - r() * 0.3, len * 0.72, d + 1);
      o += branch(x2, y2, ang + 0.42 + r() * 0.3, len * 0.72, d + 1);
      return o;
    };
    return s + branch(50, 80, -Math.PI / 2, 26, 0);
  },

  leaf: (r, p) => {
    let s = '';
    for (let i = 0; i < 5; i++) {
      const y = 26 + i * 22, dir = i % 2 ? 1 : -1;
      s += `<path d="M50 ${y + 12} Q${50 + dir * 34} ${y} 50 ${y - 12} Q${50 - dir * 8} ${y} 50 ${y + 12} Z" fill="${i % 2 ? p.a : p.c}" opacity=".9"/>`;
    }
    return s + `<line x1="50" y1="10" x2="50" y2="140" stroke="${p.b}" stroke-width="1.4"/>`;
  },

  flame: (r, p) => `
    <path d="M50 128 C22 112 26 84 44 66 C42 82 52 84 54 74 C64 86 78 98 68 118 C64 126 58 130 50 128 Z" fill="${p.a}"/>
    <path d="M50 124 C36 114 38 96 48 84 C48 96 56 98 57 90 C64 100 68 110 62 118 C58 124 54 126 50 124 Z" fill="${p.c}"/>`,

  rain: (r, p) => {
    let s = '';
    for (let i = 0; i < 46; i++) {
      const x = r() * 100, y = 12 + r() * 126, l = 5 + r() * 13;
      s += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - 4).toFixed(1)}" y2="${(y + l).toFixed(1)}" stroke="${p.a}" stroke-width="${(0.6 + r()).toFixed(1)}" opacity="${(.35 + r() * .6).toFixed(2)}"/>`;
    }
    return s;
  },

  stars: (r, p) => {
    let s = '';
    for (let i = 0; i < 34; i++) {
      const x = r() * 100, y = 10 + r() * 130, rr = 0.6 + r() * 2.1;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="${r() < .2 ? p.c : p.a}" opacity="${(.4 + r() * .6).toFixed(2)}"/>`;
    }
    const cx = 20 + r() * 60, cy = 40 + r() * 60;
    return s + `<path d="M${cx} ${cy - 13} L${cx + 3} ${cy - 3} L${cx + 13} ${cy} L${cx + 3} ${cy + 3} L${cx} ${cy + 13} L${cx - 3} ${cy + 3} L${cx - 13} ${cy} L${cx - 3} ${cy - 3} Z" fill="${p.c}"/>`;
  },

  wheat: (r, p) => {
    let s = '';
    for (let k = 0; k < 5; k++) {
      const x = 18 + k * 16 + r() * 5, lean = -3 + r() * 6;
      s += `<path d="M${x} 138 Q${x + lean} 90 ${x + lean * 2} 44" fill="none" stroke="${p.b}" stroke-width="1.4"/>`;
      for (let i = 0; i < 7; i++) {
        const y = 48 + i * 7, xx = x + lean * 2 * (1 - i / 9);
        s += `<ellipse cx="${(xx - 4).toFixed(1)}" cy="${y}" rx="4" ry="2.6" fill="${p.a}" transform="rotate(-30 ${(xx - 4).toFixed(1)} ${y})"/>`;
        s += `<ellipse cx="${(xx + 4).toFixed(1)}" cy="${y}" rx="4" ry="2.6" fill="${p.a}" transform="rotate(30 ${(xx + 4).toFixed(1)} ${y})"/>`;
      }
    }
    return s;
  },

  panes: (r, p) => {
    let s = `<rect x="16" y="26" width="68" height="96" fill="${p.a}"/>`;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++)
      s += `<rect x="${20 + i * 34}" y="${30 + j * 32}" width="30" height="28" fill="${r() < .35 ? p.c : p.b}" opacity=".9"/>`;
    return s;
  },

  bird: (r, p) => {
    let s = '';
    for (let i = 0; i < 6; i++) {
      const x = 12 + r() * 76, y = 24 + r() * 96, sc = 0.5 + r();
      s += `<path d="M${x} ${y} q${6 * sc} ${-6 * sc} ${12 * sc} 0 q${6 * sc} ${-6 * sc} ${12 * sc} 0" fill="none" stroke="${p.a}" stroke-width="${1.4 * sc}" stroke-linecap="round"/>`;
    }
    return s;
  },

  contour: (r, p) => {
    let s = '';
    for (let i = 0; i < 11; i++) {
      const k = 1 - i / 12;
      let d = '';
      for (let a = 0; a <= 360; a += 12) {
        const rad = (a * Math.PI) / 180;
        const rr = (30 + Math.sin(rad * 3 + i) * 9 + Math.cos(rad * 2 - i) * 6) * k;
        d += (a ? ' L' : 'M') + (50 + Math.cos(rad) * rr).toFixed(1) + ' ' + (66 + Math.sin(rad) * rr * 1.3).toFixed(1);
      }
      s += `<path d="${d} Z" fill="none" stroke="${i % 4 === 0 ? p.c : p.a}" stroke-width=".9" opacity=".85"/>`;
    }
    return s;
  },

  serpent: (r, p) => {
    let d = 'M8 132';
    for (let i = 0; i < 6; i++) d += ` Q${i % 2 ? 96 : 4} ${126 - i * 20} 50 ${116 - i * 20}`;
    return `<path d="${d}" fill="none" stroke="${p.a}" stroke-width="6" stroke-linecap="round"/>
            <path d="${d}" fill="none" stroke="${p.c}" stroke-width="1.6" stroke-dasharray="3 6"/>`;
  },

  hand: (r, p) => `
    <path d="M34 130 L34 82 Q34 74 40 74 Q46 74 46 82 L46 44 Q46 36 52 36 Q58 36 58 44 L58 82 L58 50 Q58 42 64 42 Q70 42 70 50 L70 90 Q70 130 52 130 Z" fill="${p.a}"/>
    <circle cx="52" cy="96" r="9" fill="${p.b}" opacity=".85"/>`,

  pulse: (r, p) => {
    let d = 'M-4 74';
    let x = 0;
    while (x < 104) {
      const h = r() < 0.25 ? 34 + r() * 22 : 4 + r() * 12;
      d += ` L${x} 74 L${(x + 3).toFixed(1)} ${(74 - h).toFixed(1)} L${(x + 6).toFixed(1)} ${(74 + h * 0.5).toFixed(1)} L${(x + 9).toFixed(1)} 74`;
      x += 9 + r() * 12;
    }
    return `<path d="${d} L104 74" fill="none" stroke="${p.a}" stroke-width="1.8"/>`;
  },

  maze: (r, p) => {
    let s = '';
    for (let i = 0; i < 9; i++) {
      const k = 6 + i * 4.6;
      s += `<rect x="${50 - k}" y="${66 - k}" width="${k * 2}" height="${k * 2}" fill="none" stroke="${i % 3 === 0 ? p.c : p.a}" stroke-width="1.5"/>`;
      s += `<rect x="${50 - k}" y="${66 - k}" width="${(k * 2 * (0.2 + r() * 0.5)).toFixed(1)}" height="2" fill="${p.bg}"/>`;
    }
    return s;
  },

  fish: (r, p) => {
    let s = '';
    for (let i = 0; i < 7; i++) {
      const x = 12 + r() * 70, y = 24 + r() * 100, sc = 0.6 + r() * 0.9;
      s += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sc.toFixed(2)})">
        <path d="M0 0 Q10 -7 22 0 Q10 7 0 0 Z" fill="${i % 3 ? p.a : p.c}"/>
        <path d="M22 0 l7 -5 v10 z" fill="${i % 3 ? p.a : p.c}"/></g>`;
    }
    return s;
  },

  bones: (r, p) => `
    <g stroke="${p.a}" stroke-width="5" stroke-linecap="round" fill="none">
      <path d="M30 34 L70 122"/><path d="M70 34 L30 122"/>
    </g>
    <circle cx="30" cy="32" r="7" fill="${p.a}"/><circle cx="70" cy="32" r="7" fill="${p.a}"/>
    <circle cx="30" cy="124" r="7" fill="${p.a}"/><circle cx="70" cy="124" r="7" fill="${p.a}"/>
    <circle cx="50" cy="78" r="${9 + r() * 5}" fill="${p.c}"/>`,

  lantern: (r, p) => `
    <line x1="50" y1="6" x2="50" y2="30" stroke="${p.b}" stroke-width="1.6"/>
    <path d="M34 40 L66 40 L72 106 L28 106 Z" fill="${p.a}"/>
    <path d="M40 48 L60 48 L64 98 L36 98 Z" fill="${p.c}"/>
    <rect x="30" y="30" width="40" height="10" rx="3" fill="${p.b}"/>
    <rect x="26" y="106" width="48" height="10" rx="3" fill="${p.b}"/>
    <ellipse cx="50" cy="130" rx="34" ry="10" fill="${p.c}" opacity=".26"/>`,

  city: (r, p) => {
    let s = '';
    let x = -4;
    while (x < 104) {
      const w = 8 + r() * 16, h = 26 + r() * 66;
      s += `<rect x="${x.toFixed(1)}" y="${(132 - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${r() < .4 ? p.b : p.a}"/>`;
      for (let wy = 136 - h; wy < 126; wy += 8)
        for (let wx = x + 3; wx < x + w - 3; wx += 6)
          if (r() < 0.4) s += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="2.4" height="3.4" fill="${p.c}" opacity=".9"/>`;
      x += w + 1 + r() * 3;
    }
    return s;
  },

  door: (r, p) => `
    <rect x="26" y="34" width="48" height="98" rx="2" fill="${p.b}"/>
    <rect x="31" y="39" width="38" height="88" fill="${p.a}"/>
    <rect x="36" y="46" width="28" height="34" fill="${p.bg}" opacity=".55"/>
    <circle cx="64" cy="88" r="3" fill="${p.c}"/>
    <path d="M31 127 L69 127 L74 140 L26 140 Z" fill="${p.c}" opacity=".35"/>`,

  hourglass: (r, p) => `
    <path d="M28 26 L72 26 L54 74 L72 122 L28 122 L46 74 Z" fill="${p.a}"/>
    <rect x="22" y="20" width="56" height="7" rx="3" fill="${p.b}"/>
    <rect x="22" y="121" width="56" height="7" rx="3" fill="${p.b}"/>
    <path d="M34 112 L66 112 L58 92 L42 92 Z" fill="${p.c}"/>`,

  knot: (r, p) => {
    let s = '';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      s += `<ellipse cx="50" cy="70" rx="34" ry="13" fill="none" stroke="${i % 2 ? p.a : p.c}" stroke-width="2.6" transform="rotate(${((a * 180) / Math.PI).toFixed(0)} 50 70)"/>`;
    }
    return s;
  },

  shell: (r, p) => {
    let s = '';
    for (let i = 0; i < 9; i++)
      s += `<path d="M50 128 Q${20 + i * 7.5} ${100 - i * 4} 50 ${34 + i * 2}" fill="none" stroke="${i % 3 === 0 ? p.c : p.a}" stroke-width="1.5"/>`;
    return s + `<path d="M50 128 Q10 96 50 30 Q90 96 50 128 Z" fill="none" stroke="${p.a}" stroke-width="2"/>`;
  },

  feather: (r, p) => {
    let s = `<path d="M50 134 Q46 80 58 24" fill="none" stroke="${p.b}" stroke-width="2"/>`;
    for (let i = 0; i < 20; i++) {
      const t = i / 20, y = 130 - t * 100, x = 50 - 4 * (1 - t) + 8 * t;
      const l = 22 * Math.sin(t * Math.PI) + 3;
      s += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - l).toFixed(1)}" y2="${(y - l * .5).toFixed(1)}" stroke="${p.a}" stroke-width="1.3" opacity=".9"/>`;
      s += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + l).toFixed(1)}" y2="${(y - l * .5).toFixed(1)}" stroke="${p.c}" stroke-width="1.3" opacity=".9"/>`;
    }
    return s;
  },

  comet: (r, p) => `
    <path d="M4 130 Q40 96 88 30" fill="none" stroke="${p.a}" stroke-width="7" stroke-linecap="round" opacity=".55"/>
    <path d="M14 124 Q46 94 84 36" fill="none" stroke="${p.c}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="86" cy="32" r="9" fill="${p.c}"/>
    <circle cx="86" cy="32" r="17" fill="${p.c}" opacity=".22"/>`,

  prism: (r, p) => `
    <path d="M50 22 L86 118 L14 118 Z" fill="none" stroke="${p.a}" stroke-width="2"/>
    <path d="M2 74 L38 74" stroke="${p.c}" stroke-width="2"/>
    <path d="M62 66 L100 52" stroke="${p.c}" stroke-width="1.6"/>
    <path d="M62 72 L100 68" stroke="${p.a}" stroke-width="1.6"/>
    <path d="M62 78 L100 84" stroke="${p.b}" stroke-width="1.6"/>
    <path d="M62 84 L100 100" stroke="${p.c}" stroke-width="1.6"/>`,

  root: (r, p) => {
    const branch = (x, y, ang, len, d) => {
      if (d > 4 || len < 3) return '';
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${p.a}" stroke-width="${(4.5 - d).toFixed(1)}" stroke-linecap="round" opacity=".9"/>`
        + branch(x2, y2, ang - 0.5 - r() * 0.35, len * 0.74, d + 1)
        + branch(x2, y2, ang + 0.5 + r() * 0.35, len * 0.74, d + 1);
    };
    return `<line x1="50" y1="0" x2="50" y2="40" stroke="${p.a}" stroke-width="5"/>` + branch(50, 40, Math.PI / 2, 26, 0);
  },

  thread: (r, p) => {
    let d = 'M18 4';
    for (let i = 0; i < 16; i++) d += ` Q${(10 + r() * 80).toFixed(0)} ${(i * 9 + 6).toFixed(0)} ${(20 + r() * 60).toFixed(0)} ${(i * 9 + 12).toFixed(0)}`;
    return `<path d="${d}" fill="none" stroke="${p.a}" stroke-width="1.5"/><circle cx="18" cy="4" r="3" fill="${p.c}"/>`;
  },

  lens: (r, p) => `
    <circle cx="50" cy="60" r="30" fill="none" stroke="${p.a}" stroke-width="3.5"/>
    <circle cx="50" cy="60" r="24" fill="${p.c}" opacity=".28"/>
    <path d="M72 82 L92 122" stroke="${p.a}" stroke-width="7" stroke-linecap="round"/>
    <path d="M38 48 A16 16 0 0 1 56 42" stroke="${p.bg}" stroke-width="3" fill="none" opacity=".8"/>`,

  gate: (r, p) => {
    let s = `<rect x="10" y="30" width="6" height="102" fill="${p.b}"/><rect x="84" y="30" width="6" height="102" fill="${p.b}"/>`;
    for (let i = 0; i < 7; i++) s += `<rect x="${20 + i * 9.5}" y="40" width="3.2" height="92" fill="${p.a}"/>`;
    return s + `<path d="M10 40 Q50 6 90 40" fill="none" stroke="${p.a}" stroke-width="4"/><circle cx="50" cy="20" r="5" fill="${p.c}"/>`;
  },

  tide: (r, p) => {
    let s = '';
    for (let i = 0; i < 22; i++) {
      const y = 16 + i * 6;
      const off = Math.sin(i * 0.7) * 16;
      s += `<line x1="${(8 + off).toFixed(1)}" y1="${y}" x2="${(92 + off * .5).toFixed(1)}" y2="${y}" stroke="${i % 5 === 0 ? p.c : p.a}" stroke-width="${(0.8 + r()).toFixed(1)}" opacity="${(.35 + r() * .5).toFixed(2)}"/>`;
    }
    return s;
  },

  window: (r, p) => `
    <rect x="18" y="20" width="64" height="104" rx="32" fill="${p.a}"/>
    <rect x="24" y="26" width="52" height="92" rx="26" fill="${p.c}" opacity=".55"/>
    <line x1="50" y1="20" x2="50" y2="124" stroke="${p.b}" stroke-width="3"/>
    <line x1="18" y1="72" x2="82" y2="72" stroke="${p.b}" stroke-width="3"/>`,

  crown: (r, p) => `
    <path d="M18 106 L12 46 L34 68 L50 32 L66 68 L88 46 L82 106 Z" fill="${p.a}"/>
    <rect x="18" y="106" width="64" height="10" fill="${p.b}"/>
    <circle cx="50" cy="86" r="6" fill="${p.c}"/>`,

  smoke: (r, p) => {
    let s = '';
    for (let i = 0; i < 5; i++) {
      let d = `M${(30 + i * 10).toFixed(0)} 136`;
      for (let j = 0; j < 8; j++) d += ` q${(-14 + r() * 28).toFixed(0)} -12 0 -18`;
      s += `<path d="${d}" fill="none" stroke="${i % 2 ? p.a : p.c}" stroke-width="${(1 + r() * 1.6).toFixed(1)}" opacity="${(.3 + r() * .5).toFixed(2)}" stroke-linecap="round"/>`;
    }
    return s;
  },
};

const MOTIF_KEYS = Object.keys(MOTIFS);

/* ── layouts ──────────────────────────────────────────────── */

const LAYOUTS = ['top', 'bottom', 'band', 'frame', 'centre', 'corner'];

const FONTS = {
  display: `Iowan Old Style,Palatino Linotype,Palatino,Georgia,serif`,
  grotesk: `Helvetica Neue,Helvetica,Inter,Arial,sans-serif`,
  humanist: `Optima,Candara,Gill Sans,Segoe UI,sans-serif`,
  mono: `SF Mono,Menlo,Consolas,monospace`,
};
const FONT_KEYS = Object.keys(FONTS);

/* ── art resolution ───────────────────────────────────────── */

export function artFor(book) {
  const seed = hash(book.id || book.title);
  const r = rngFrom(seed);
  const a = book.art || {};
  return {
    pal: PALETTES[a.p] ? a.p : pick(r, PAL_KEYS),
    motif: MOTIFS[a.m] ? a.m : pick(r, MOTIF_KEYS),
    layout: LAYOUTS.includes(a.l) ? a.l : pick(r, LAYOUTS),
    font: FONTS[a.f] ? a.f : pick(r, FONT_KEYS),
    caps: r() < 0.55,
    seed,
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* rough width of a string at font-size 1, for fitting type */
function widthOf(s, font, caps) {
  const k = font === 'mono' ? 0.60 : font === 'grotesk' ? 0.53 : font === 'humanist' ? 0.50 : 0.48;
  return s.length * k * (caps ? 1.06 : 1);
}

function wrap(text, maxW, font, caps, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (widthOf(t, font, caps) > maxW && cur) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\W+$/, '') + '…';
    return kept;
  }
  return lines;
}

/* ── the jacket ───────────────────────────────────────────── */

export function coverSVG(book, opts = {}) {
  const { w = 200, h = 300, detail = 'full' } = opts;
  const art = artFor(book);
  const p = PALETTES[art.pal];
  const r = rngFrom(art.seed ^ 0x9e3779b9);
  const id = 'c' + art.seed.toString(36);

  const motif = MOTIFS[art.motif](r, p);
  const title = art.caps ? book.title.toUpperCase() : book.title;
  const author = (book.author || '').toUpperCase();

  let art_g = `<g>${motif}</g>`;
  let type = '';

  if (detail === 'mini') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150" width="${w}" height="${h}" role="img" aria-label="${esc(book.title)}">
      <rect width="100" height="150" fill="${p.bg}"/>
      <g opacity=".92">${motif}</g>
      <rect x="0" y="0" width="3.5" height="150" fill="#000" opacity=".22"/>
    </svg>`;
  }

  /* type sizing */
  const tFont = art.font;
  const maxTitleW = art.layout === 'frame' ? 66 : 80;
  let size = 11;
  let lines = wrap(title, maxTitleW / size, tFont, art.caps, 4);
  /* shrink until the title sits in three lines or fewer */
  while (lines.length > 3 && size > 6) {
    size -= 1;
    lines = wrap(title, maxTitleW / size, tFont, art.caps, 4);
  }
  /* a short title may as well be set large */
  while (lines.length === 1 && widthOf(lines[0], tFont, art.caps) * (size + 1) < maxTitleW * 0.94 && size < 16) {
    size += 1;
  }

  const lh = size * 1.16;
  const ff = FONTS[tFont];
  const ls = art.caps ? (tFont === 'grotesk' ? 0.9 : 0.5) : 0;

  const drawTitle = (x, y, anchor) =>
    `<text x="${x}" y="${y}" font-family="${ff}" font-size="${size}" letter-spacing="${ls}" fill="${p.ink}" text-anchor="${anchor}" font-weight="${tFont === 'grotesk' ? 700 : 400}">` +
    lines.map((l, i) => `<tspan x="${x}" dy="${i ? lh : 0}">${esc(l)}</tspan>`).join('') +
    `</text>`;

  const drawAuthor = (x, y, anchor) =>
    `<text x="${x}" y="${y}" font-family="${FONTS.humanist}" font-size="${(size * 0.46).toFixed(1)}" letter-spacing="1.1" fill="${p.ink}" text-anchor="${anchor}" opacity=".82">${esc(author)}</text>`;

  const th = lines.length * lh;

  switch (art.layout) {
    case 'top':
      type = drawTitle(10, 22, 'start') + drawAuthor(10, 22 + th + 6, 'start');
      art_g = `<g transform="translate(0 ${18 + th}) scale(1 ${((150 - th - 24) / 150).toFixed(3)})">${motif}</g>`;
      break;
    case 'bottom':
      type = drawTitle(10, 150 - 26 - th + size, 'start') + drawAuthor(10, 150 - 12, 'start');
      art_g = `<g transform="scale(1 ${((150 - th - 40) / 150).toFixed(3)})">${motif}</g>`;
      break;
    case 'band':
      type =
        `<rect x="0" y="${(72 - th / 2 - 8).toFixed(1)}" width="100" height="${(th + 18).toFixed(1)}" fill="${p.bg}" opacity=".93"/>` +
        `<rect x="0" y="${(72 - th / 2 - 8).toFixed(1)}" width="100" height=".7" fill="${p.ink}" opacity=".4"/>` +
        `<rect x="0" y="${(72 + th / 2 + 9.3).toFixed(1)}" width="100" height=".7" fill="${p.ink}" opacity=".4"/>` +
        drawTitle(50, 72 - th / 2 + size * 0.9, 'middle') + drawAuthor(50, 140, 'middle');
      break;
    case 'frame':
      type =
        `<rect x="7" y="7" width="86" height="136" fill="none" stroke="${p.ink}" stroke-width=".8" opacity=".55"/>` +
        `<rect x="10" y="10" width="80" height="130" fill="none" stroke="${p.ink}" stroke-width=".4" opacity=".35"/>` +
        drawTitle(50, 34, 'middle') + drawAuthor(50, 132, 'middle');
      art_g = `<g transform="translate(50 ${44 + th}) scale(.66) translate(-50 -60)">${motif}</g>`;
      break;
    case 'corner':
      type = drawTitle(90, 26, 'end') + drawAuthor(90, 26 + th + 6, 'end');
      art_g = `<g transform="translate(-14 22) scale(1.1)">${motif}</g>`;
      break;
    default: /* centre */
      type = drawTitle(50, 30, 'middle') + drawAuthor(50, 138, 'middle');
      art_g = `<g transform="translate(50 ${34 + th / 2}) scale(.78) translate(-50 -66)">${motif}</g>`;
  }

  const grain = detail === 'full'
    ? `<filter id="g${id}"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3"/><feColorMatrix type="saturate" values="0"/></filter>
       <rect width="100" height="150" filter="url(#g${id})" opacity=".085" style="mix-blend-mode:overlay"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150" width="${w}" height="${h}" role="img" aria-label="Cover of ${esc(book.title)} by ${esc(book.author || '')}">
  <rect width="100" height="150" fill="${p.bg}"/>
  ${art_g}
  ${type}
  ${grain}
  <linearGradient id="s${id}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".30"/><stop offset=".06" stop-color="#000" stop-opacity=".06"/><stop offset=".5" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
  <rect width="100" height="150" fill="url(#s${id})"/>
</svg>`;
}

/* ── the spine, as seen on the shelf ──────────────────────── */

const SPINE_FONTS = {
  display: `Iowan Old Style,Palatino Linotype,Georgia,serif`,
  grotesk: `Helvetica Neue,Inter,Arial,sans-serif`,
  humanist: `Optima,Candara,Gill Sans,sans-serif`,
  mono: `SF Mono,Menlo,Consolas,monospace`,
};

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + amt)));
  g = Math.max(0, Math.min(255, Math.round(g + amt)));
  b = Math.max(0, Math.min(255, Math.round(b + amt)));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

export function spineStyle(book) {
  const art = artFor(book);
  const p = PALETTES[art.pal];
  const r = rngFrom(art.seed ^ 0x51ed270b);
  const base = p.sp;
  const light = luminance(base) > 0.55;
  const ink = light ? shade(p.ink, 0) : (luminance(p.ink) > 0.5 ? p.ink : '#f0e6d2');
  return {
    bg: `linear-gradient(90deg, ${shade(base, -26)} 0%, ${shade(base, 12)} 18%, ${shade(base, 6)} 62%, ${shade(base, -34)} 100%)`,
    ink,
    band: r() < 0.55 ? (light ? 'rgba(0,0,0,.28)' : p.a) : 'transparent',
    font: SPINE_FONTS[art.font],
    coverFlat: `linear-gradient(150deg, ${shade(p.bg, 14)}, ${p.bg} 55%, ${shade(p.bg, -22)})`,
    coverFlat2: `linear-gradient(150deg, ${shade(p.bg, -8)}, ${shade(p.bg, -30)})`,
    accent: p.a,
    pal: p,
  };
}

/* thickness & height on the shelf, from page count if we have it */
export function shelfSize(book) {
  const r = rngFrom(hash(book.id) ^ 0x2545f491);
  const pages = book.pages || 260 + Math.floor(r() * 220);
  const t = Math.max(15, Math.min(58, Math.round(pages / 11)));
  const h = Math.round(150 + r() * 52 + (book.tall ? 34 : 0));
  const d = Math.round(104 + r() * 22 + (book.tall ? 26 : 0));
  return { t, h, d, tilt: r() < 0.09 ? (r() < 0.5 ? -3.5 : 3.5) : 0 };
}

/* HSL -> #rrggbb. fillerStyle() below used to hand back CSS Color-4
   space-separated `hsl(H S% L%)` strings directly. That's valid CSS the
   live scene.css/scene.js build renders fine — but it silently breaks
   two DOWNSTREAM consumers that were both added in the three.js port
   without either side knowing about the mismatch:
   src/js/scene/books.js's `new THREE.Color(item.coverColor)` (a filler
   book's cover material) and its `parseStops()` atlas-gradient parser
   (regex is hex-only, `#[0-9a-fA-F]{6}`). three.js's own
   `Color.setStyle()` (vendor/three/build/three.core.js) only matches
   COMMA-separated `hsl(H, S%, L%)` -- space-separated silently matches
   nothing and leaves the color at its default white, which is exactly
   why every filler book's cover rendered as a blank white box and
   every filler spine fell back to parseStops()'s flat-gray default.
   Emitting hex here fixes both consumers at once and is a no-op for
   the CSS site (same colour, different encoding). Found and fixed
   during phase 6's props.js testing -- see HANDOFF-PHASE7.md. */
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r1, g1, b1;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

/* a filler book — décor only, never interactive */
export function fillerStyle(seed, hue) {
  const r = rngFrom(seed);
  const l = 12 + r() * 26;
  const s = 8 + r() * 30;
  const hh = (hue + (-24 + r() * 48) + 360) % 360;
  const base = hslToHex(hh, s, l);
  return {
    // explicit 0%/22%/100% stops (matching spineStyle()'s real-book
    // gradient format) so books.js's parseStops() -- which requires a
    // percentage on every stop -- captures all three, not just the
    // one that already had one.
    bg: `linear-gradient(90deg, ${hslToHex(hh, s, l * 0.5)} 0%, ${hslToHex(hh, s, l * 1.35)} 22%, ${hslToHex(hh, s, l * 0.55)} 100%)`,
    t: 9 + Math.round(r() * 22),
    h: 132 + Math.round(r() * 66),
    d: 96 + Math.round(r() * 24),
    tilt: r() < 0.06 ? (r() < 0.5 ? -5 : 5) : 0,
    band: r() < 0.4 ? hslToHex((hh + 40) % 360, 40, 60) : 'transparent',
    base,
  };
}

/* spineRun() lived here until phase 10.

   It painted a whole run of shelved books as one CSS gradient, because a
   book standing on a side-wall case in the CSS build was seen almost
   edge-on: its geometry collapsed to a 1-3px sliver and read as a scratch
   on the wall. IMPLEMENTATION.md §4.6 and PLAN-ARCH.md point 5 both say
   to delete it once the side shelves become real meshes, which they did
   in phase 4 and which the live site finally runs as of phase 10.

   fillerStyle() above is kept even though its last caller (scene.js's
   front-table stacks) went at the same time: it is the jacket
   generator's own colour logic for a book with no data, and a future
   description-backfill phase is the one most likely to want it back.
   Decided in phase 10's own review (REVIEW-PHASE10.md), recorded here
   rather than left for someone to find: it is genuinely dead right now
   (nothing in src/ calls it) and kept anyway, on purpose, as the one
   named exception to "delete what nothing calls." */

export { hash, rngFrom };
