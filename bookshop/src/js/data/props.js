/* ============================================================
   Things in the rooms. Each returns an SVG string sized to its
   own viewBox; the scene stretches it into the box it's given.
   Silhouette matters more than detail — most of these are seen
   at the far end of a lamplit room.
   ============================================================ */

const S = (vb, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;

export const ART = {

  ladder: (c = '#6b4a37') => S('0 0 60 300', `
    <g fill="${c}">
      <rect x="4" y="0" width="9" height="300" rx="3"/>
      <rect x="47" y="0" width="9" height="300" rx="3"/>
      ${Array.from({ length: 7 }, (_, i) => `<rect x="4" y="${26 + i * 40}" width="52" height="7" rx="3"/>`).join('')}
    </g>
    <rect x="0" y="0" width="60" height="10" rx="4" fill="${c}" opacity=".7"/>`),

  globe: (c = '#c99a5a', d = '#2f4a56') => S('0 0 120 160', `
    <ellipse cx="60" cy="150" rx="34" ry="8" fill="#000" opacity=".35"/>
    <path d="M30 146 L60 120 L90 146 Z" fill="${c}" opacity=".8"/>
    <circle cx="60" cy="70" r="52" fill="${d}"/>
    <circle cx="60" cy="70" r="52" fill="none" stroke="${c}" stroke-width="3"/>
    <path d="M60 18 A34 52 0 0 0 60 122 A34 52 0 0 0 60 18" fill="none" stroke="${c}" stroke-width="1.6" opacity=".7"/>
    <path d="M8 70 H112 M16 44 H104 M16 96 H104" stroke="${c}" stroke-width="1.4" opacity=".55" fill="none"/>
    <path d="M34 52 q14 -10 26 2 t22 -4 l6 20 q-18 12 -30 2 t-24 6 z" fill="${c}" opacity=".55"/>
    <path d="M46 92 q16 -6 26 6 l-8 16 q-14 4 -22 -8 z" fill="${c}" opacity=".5"/>
    <path d="M18 70 A44 44 0 0 1 102 70" fill="none" stroke="${c}" stroke-width="4"/>`),

  plant: (c = '#5f8a4a', pot = '#8a4a2c') => S('0 0 140 180', `
    <g fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round">
      ${Array.from({ length: 9 }, (_, i) => {
        const a = -80 + i * 20;
        return `<path d="M70 140 q${Math.sin(a / 57) * 60} -50 ${Math.sin(a / 57) * 62} -${60 + (i % 3) * 22}"/>`;
      }).join('')}
    </g>
    <g fill="${c}">
      ${Array.from({ length: 9 }, (_, i) => {
        const a = -80 + i * 20;
        const x = 70 + Math.sin(a / 57) * 62, y = 140 - (60 + (i % 3) * 22);
        return `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="16" ry="8" transform="rotate(${a} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
      }).join('')}
    </g>
    <path d="M44 138 h52 l-7 40 h-38 z" fill="${pot}"/>
    <rect x="40" y="130" width="60" height="12" rx="3" fill="${pot}" opacity=".85"/>`),

  armchair: (c = '#6d3b34', w = '#3a2418') => S('0 0 200 170', `
    <rect x="20" y="46" width="30" height="96" rx="14" fill="${c}"/>
    <rect x="150" y="46" width="30" height="96" rx="14" fill="${c}"/>
    <path d="M36 60 q0 -46 64 -46 t64 46 v40 H36 Z" fill="${c}"/>
    <rect x="34" y="96" width="132" height="34" rx="12" fill="${c}" opacity=".85"/>
    <rect x="30" y="126" width="140" height="16" rx="6" fill="${w}"/>
    <rect x="42" y="142" width="12" height="24" rx="4" fill="${w}"/>
    <rect x="146" y="142" width="12" height="24" rx="4" fill="${w}"/>
    <path d="M52 60 q48 -30 96 0" fill="none" stroke="#000" stroke-opacity=".2" stroke-width="3"/>`),

  clock: (c = '#c99a5a', f = '#e7dcc2') => S('0 0 100 100', `
    <circle cx="50" cy="50" r="46" fill="${c}"/>
    <circle cx="50" cy="50" r="38" fill="${f}"/>
    <g stroke="#3a2a18" stroke-width="2.6" stroke-linecap="round">
      <path d="M50 50 V26"/><path d="M50 50 L66 58"/>
    </g>
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<circle cx="${(50 + Math.sin(a) * 31).toFixed(1)}" cy="${(50 - Math.cos(a) * 31).toFixed(1)}" r="1.8" fill="#3a2a18"/>`;
    }).join('')}
    <circle cx="50" cy="50" r="3" fill="#3a2a18"/>`),

  telescope: (c = '#b58a4a', d = '#2a1d16') => S('0 0 180 200', `
    <g transform="rotate(-28 90 100)">
      <rect x="30" y="78" width="120" height="30" rx="14" fill="${c}"/>
      <rect x="130" y="70" width="34" height="46" rx="8" fill="${d}"/>
      <rect x="18" y="82" width="20" height="22" rx="6" fill="${d}"/>
      <circle cx="150" cy="93" r="15" fill="#1a2436"/>
    </g>
    <path d="M90 108 L58 190 M90 108 L122 190 M90 108 L90 190" stroke="${d}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="90" cy="108" r="9" fill="${c}"/>`),

  candle: (c = '#efe0bc', h = '#c99a5a') => S('0 0 60 140', `
    <rect x="20" y="34" width="20" height="82" rx="4" fill="${c}"/>
    <ellipse cx="30" cy="34" rx="10" ry="4" fill="#fff8e2"/>
    <path d="M30 8 q10 12 0 24 q-10 -12 0 -24z" fill="#ffca63"/>
    <path d="M30 14 q5 7 0 14 q-5 -7 0 -14z" fill="#fff6d0"/>
    <ellipse cx="30" cy="120" rx="26" ry="8" fill="${h}"/>
    <path d="M6 120 q24 14 48 0 v6 q-24 12 -48 0z" fill="${h}" opacity=".8"/>
    <circle cx="30" cy="26" r="26" fill="#ffb347" opacity=".18"/>`),

  teapot: (c = '#8fa9a1') => S('0 0 140 110', `
    <path d="M28 54 h74 a34 34 0 0 1 -12 46 h-50 a34 34 0 0 1 -12 -46z" fill="${c}"/>
    <path d="M102 62 q28 6 22 24 q-4 12 -18 8" fill="none" stroke="${c}" stroke-width="8"/>
    <path d="M28 62 q-22 2 -22 -14" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round"/>
    <ellipse cx="65" cy="52" rx="40" ry="9" fill="${c}"/>
    <circle cx="65" cy="42" r="7" fill="${c}"/>
    <path d="M40 76 q26 8 52 0" stroke="#000" stroke-opacity=".18" stroke-width="3" fill="none"/>`),

  typewriter: (c = '#3a3a3e', k = '#e5dcc6') => S('0 0 160 110', `
    <path d="M18 62 h124 l10 34 H8z" fill="${c}"/>
    <rect x="34" y="20" width="92" height="44" rx="5" fill="${c}"/>
    <rect x="44" y="8" width="72" height="20" rx="3" fill="${k}"/>
    <circle cx="30" cy="30" r="10" fill="${c}"/><circle cx="130" cy="30" r="10" fill="${c}"/>
    ${Array.from({ length: 3 }, (_, r) => Array.from({ length: 11 }, (_, i) =>
      `<circle cx="${26 + i * 11}" cy="${70 + r * 9}" r="3.2" fill="${k}"/>`).join('')).join('')}`),

  gramophone: (c = '#c07a3a', d = '#3a2418') => S('0 0 180 180', `
    <path d="M84 96 L150 18 a54 54 0 0 1 0 96 z" fill="${c}"/>
    <path d="M96 96 L142 40 a34 34 0 0 1 0 60 z" fill="#000" opacity=".28"/>
    <rect x="26" y="112" width="66" height="10" rx="4" fill="${d}"/>
    <path d="M84 100 L46 116" stroke="${d}" stroke-width="7" stroke-linecap="round"/>
    <rect x="14" y="120" width="96" height="30" rx="6" fill="${d}"/>
    <ellipse cx="62" cy="118" rx="34" ry="7" fill="${c}" opacity=".7"/>`),

  moth: (c = '#d8cbb0') => S('0 0 120 90', `
    <ellipse cx="60" cy="46" rx="6" ry="22" fill="#4a3a2a"/>
    <path d="M58 30 q-46 -30 -52 6 q-4 30 50 20z" fill="${c}" opacity=".92"/>
    <path d="M62 30 q46 -30 52 6 q4 30 -50 20z" fill="${c}" opacity=".92"/>
    <path d="M58 50 q-34 -6 -38 20 q-2 18 38 4z" fill="${c}" opacity=".75"/>
    <path d="M62 50 q34 -6 38 20 q2 18 -38 4z" fill="${c}" opacity=".75"/>
    <circle cx="30" cy="34" r="7" fill="#3a2a1a" opacity=".5"/><circle cx="90" cy="34" r="7" fill="#3a2a1a" opacity=".5"/>
    <path d="M58 26 q-10 -18 -22 -20 M62 26 q10 -18 22 -20" stroke="#4a3a2a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`),

  mushrooms: (c = '#b4574b', s = '#e7dcc2') => S('0 0 160 110', `
    ${[[36, 70, 1], [86, 58, 1.3], [124, 78, .8]].map(([x, y, k]) => `
      <g transform="translate(${x} ${y}) scale(${k})">
        <rect x="-7" y="0" width="14" height="38" rx="6" fill="${s}"/>
        <path d="M-32 2 a32 26 0 0 1 64 0 z" fill="${c}"/>
        <circle cx="-14" cy="-8" r="4" fill="${s}" opacity=".85"/>
        <circle cx="8" cy="-13" r="3" fill="${s}" opacity=".85"/>
        <circle cx="18" cy="-3" r="3.4" fill="${s}" opacity=".85"/>
      </g>`).join('')}`),

  skull: (c = '#e0d6bd') => S('0 0 120 120', `
    <path d="M60 8 a44 42 0 0 1 44 44 v14 a20 20 0 0 1 -12 18 l-2 16 a10 10 0 0 1 -10 9 H40 a10 10 0 0 1 -10 -9 l-2 -16 a20 20 0 0 1 -12 -18 V52 A44 42 0 0 1 60 8z" fill="${c}"/>
    <ellipse cx="40" cy="52" rx="14" ry="16" fill="#1a120e"/>
    <ellipse cx="80" cy="52" rx="14" ry="16" fill="#1a120e"/>
    <path d="M60 66 l-9 16 h18z" fill="#1a120e"/>
    <path d="M44 100 v9 M60 100 v9 M76 100 v9" stroke="#1a120e" stroke-width="3"/>`),

  birdcage: (c = '#c99a5a') => S('0 0 120 190', `
    <path d="M60 4 v18" stroke="${c}" stroke-width="4"/>
    <circle cx="60" cy="26" r="10" fill="none" stroke="${c}" stroke-width="4"/>
    <path d="M18 78 a42 52 0 0 1 84 0 v72 H18z" fill="none" stroke="${c}" stroke-width="4"/>
    ${Array.from({ length: 7 }, (_, i) => `<path d="M${25 + i * 12} ${78 - Math.abs(3 - i) * 3} V150" stroke="${c}" stroke-width="2.4"/>`).join('')}
    <rect x="10" y="148" width="100" height="12" rx="5" fill="${c}"/>
    <path d="M42 120 q10 -12 22 -2 q12 10 4 20 q-14 12 -26 -2z" fill="${c}" opacity=".55"/>`),

  bottles: (c = '#7fa89a') => S('0 0 180 120', `
    ${[[16, 34, .9, c], [56, 22, 1.1, '#c07a3a'], [100, 40, .8, '#8f7ab8'], [136, 28, 1, '#b4574b']].map(([x, y, k, col]) => `
      <g transform="translate(${x} ${y}) scale(${k})">
        <path d="M10 0 h12 v16 l8 12 v52 a6 6 0 0 1 -6 6 H8 a6 6 0 0 1 -6 -6 V28 l8 -12z" fill="${col}" opacity=".85"/>
        <rect x="8" y="-6" width="16" height="8" rx="2" fill="#4a3a2a"/>
        <rect x="4" y="44" width="24" height="18" rx="2" fill="#efe4cd" opacity=".8"/>
      </g>`).join('')}`),

  quill: (c = '#e7dcc2', ink = '#2a2438') => S('0 0 120 120', `
    <path d="M92 6 q-58 26 -66 84 q34 -6 52 -32 q16 -24 14 -52z" fill="${c}"/>
    <path d="M88 14 q-40 24 -54 70" stroke="#a89a7a" stroke-width="2" fill="none"/>
    <path d="M26 92 L10 112" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
    <path d="M40 96 a24 18 0 0 0 48 0 v-8 h-48z" fill="${ink}"/>
    <ellipse cx="64" cy="88" rx="24" ry="8" fill="${ink}" opacity=".7"/>`),

  cat: (c = '#3d332c', e = '#d9c05a') => S('0 0 200 120', `
    <ellipse cx="100" cy="112" rx="76" ry="8" fill="#000" opacity=".3"/>
    <path d="M40 108 q-6 -46 34 -52 q30 -5 56 4 q34 6 32 48z" fill="${c}"/>
    <circle cx="146" cy="62" r="26" fill="${c}"/>
    <path d="M126 44 l-4 -22 l20 12z" fill="${c}"/>
    <path d="M166 44 l6 -22 l-22 12z" fill="${c}"/>
    <path d="M36 106 q-24 -6 -18 -22 q6 -14 22 -6" fill="${c}"/>
    <ellipse cx="138" cy="60" rx="4" ry="6" fill="${e}"/>
    <ellipse cx="156" cy="60" rx="4" ry="6" fill="${e}"/>
    <path d="M141 72 q5 5 10 0" stroke="#000" stroke-opacity=".5" stroke-width="2" fill="none"/>`),

  stack: (c1 = '#8a4a2c', c2 = '#2f4a56', c3 = '#c99a5a') => S('0 0 120 110', `
    <rect x="8" y="78" width="104" height="20" rx="3" fill="${c1}"/>
    <rect x="14" y="56" width="92" height="20" rx="3" fill="${c2}"/>
    <rect x="20" y="34" width="80" height="20" rx="3" fill="${c3}"/>
    <rect x="26" y="14" width="66" height="18" rx="3" fill="${c1}" opacity=".8"/>
    <g fill="#efe4cd" opacity=".5">
      <rect x="12" y="82" width="96" height="3"/><rect x="18" y="60" width="84" height="3"/>
      <rect x="24" y="38" width="72" height="3"/><rect x="30" y="18" width="58" height="3"/>
    </g>`),

  starchart: (c = '#c99a5a', bg = '#101828') => S('0 0 160 200', `
    <rect x="0" y="0" width="160" height="200" rx="4" fill="${bg}"/>
    <rect x="2.5" y="2.5" width="155" height="195" rx="4" fill="none" stroke="${c}" stroke-width="5"/>
    <circle cx="80" cy="96" r="62" fill="none" stroke="${c}" stroke-width="1.4" opacity=".6"/>
    <circle cx="80" cy="96" r="40" fill="none" stroke="${c}" stroke-width="1.2" opacity=".45"/>
    <path d="M18 96 h124 M80 34 v124 M36 52 L124 140 M124 52 L36 140" stroke="${c}" stroke-width=".8" opacity=".35"/>
    ${Array.from({ length: 22 }, (_, i) => {
      const a = i * 2.4, r = 12 + (i % 5) * 12;
      return `<circle cx="${(80 + Math.cos(a) * r).toFixed(1)}" cy="${(96 + Math.sin(a) * r).toFixed(1)}" r="${(1 + (i % 3)).toFixed(1)}" fill="#fff" opacity=".85"/>`;
    }).join('')}
    <path d="M52 68 L74 88 L68 118 L96 106 L118 124" fill="none" stroke="${c}" stroke-width="1.4" opacity=".9"/>`),

  umbrella: (c = '#2f4a56', h = '#6b4a37') => S('0 0 120 200', `
    <path d="M60 22 a52 42 0 0 1 52 42 h-104 a52 42 0 0 1 52 -42z" fill="${c}"/>
    <path d="M8 64 q26 -14 26 0 q26 -14 26 0 q26 -14 26 0 q26 -14 26 0" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="2.4"/>
    <rect x="56" y="12" width="8" height="160" rx="4" fill="${h}"/>
    <path d="M60 172 q0 20 -18 20 q-12 0 -12 -12" fill="none" stroke="${h}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="60" cy="10" r="6" fill="${h}"/>`),

  herbs: (c = '#7d8f5a', s = '#8a6a3a') => S('0 0 140 160', `
    <path d="M6 8 h128" stroke="${s}" stroke-width="4"/>
    ${[20, 52, 88, 120].map((x, i) => `
      <g transform="translate(${x} 10)">
        <path d="M0 0 v${70 + (i % 2) * 30}" stroke="${s}" stroke-width="3"/>
        ${Array.from({ length: 8 }, (_, j) => `<path d="M0 ${16 + j * 11} q-16 4 -20 14 q14 2 20 -6 M0 ${16 + j * 11} q16 4 20 14 q-14 2 -20 -6" fill="${c}" opacity=".9"/>`).join('')}
      </g>`).join('')}`),

  shipmodel: (c = '#8a5a3a', s = '#e7dcc2') => S('0 0 180 160', `
    <path d="M20 118 h140 l-22 26 H42z" fill="${c}"/>
    <rect x="86" y="20" width="6" height="98" fill="${c}"/>
    <path d="M92 30 q40 20 34 44 l-34 8z" fill="${s}" opacity=".92"/>
    <path d="M86 26 q-38 24 -32 50 l32 6z" fill="${s}" opacity=".85"/>
    <path d="M92 84 q30 14 26 30 l-26 4z" fill="${s}" opacity=".9"/>
    <circle cx="89" cy="16" r="5" fill="${c}"/>
    <path d="M14 122 q76 22 152 0" stroke="#000" stroke-opacity=".2" stroke-width="3" fill="none"/>`),

  key: (c = '#c99a5a') => S('0 0 200 70', `
    <circle cx="34" cy="35" r="26" fill="none" stroke="${c}" stroke-width="10"/>
    <rect x="56" y="29" width="130" height="12" rx="5" fill="${c}"/>
    <rect x="150" y="41" width="12" height="22" rx="4" fill="${c}"/>
    <rect x="172" y="41" width="12" height="16" rx="4" fill="${c}"/>`),

  anchor: (c = '#8fa9a1') => S('0 0 140 170', `
    <circle cx="70" cy="20" r="13" fill="none" stroke="${c}" stroke-width="8"/>
    <rect x="63" y="30" width="14" height="118" rx="6" fill="${c}"/>
    <rect x="30" y="48" width="80" height="12" rx="6" fill="${c}"/>
    <path d="M14 100 q0 56 56 58 q56 -2 56 -58" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"/>
    <path d="M6 92 l16 16 l-18 8z" fill="${c}"/><path d="M134 92 l-16 16 l18 8z" fill="${c}"/>`),

  crate: (c = '#6b4a37') => S('0 0 140 110', `
    <rect x="6" y="18" width="128" height="86" rx="4" fill="${c}"/>
    <path d="M6 40 h128 M6 82 h128 M40 18 v86 M100 18 v86" stroke="#000" stroke-opacity=".28" stroke-width="4"/>
    <rect x="6" y="18" width="128" height="10" rx="3" fill="#000" opacity=".2"/>`),

  bell: (c = '#c99a5a') => S('0 0 120 110', `
    <ellipse cx="60" cy="96" rx="48" ry="10" fill="${c}" opacity=".9"/>
    <path d="M16 92 a44 44 0 0 1 88 0z" fill="${c}"/>
    <circle cx="60" cy="34" r="8" fill="${c}"/>
    <path d="M28 86 a34 34 0 0 1 64 0z" fill="#fff" opacity=".12"/>`),
};

export function artURI(name, ...args) {
  const fn = ART[name];
  if (!fn) return '';
  return `url("data:image/svg+xml,${encodeURIComponent(fn(...args))}")`;
}
