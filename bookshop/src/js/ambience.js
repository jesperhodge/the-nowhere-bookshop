/* ============================================================
   The air in each room: dust in a sunbeam, rain on the glass,
   spores under the oak, embers off the cellar candles.

   One canvas, one loop, swapped when you change rooms. Every
   particle is drawn from a small pre-rendered sprite — building
   a gradient (or asking for a shadow blur) per particle per frame
   costs several hundred milliseconds a room, which you feel.
   ============================================================ */

const KINDS = {
  dust:    { n: 80,  size: [0.8, 2.4], speed: [-0.06, 0.06], fall: [-0.05, 0.09], colors: ['255,224,170'], alpha: [0.10, 0.42], drift: 0.5, soft: 2.4 },
  motes:   { n: 62,  size: [1.0, 3.0], speed: [-0.05, 0.05], fall: [-0.10, 0.02], colors: ['210,225,255', '255,235,190'], alpha: [0.14, 0.5], drift: 0.7, soft: 3 },
  stars:   { n: 100, size: [0.7, 2.0], speed: [-0.015, 0.015], fall: [-0.01, 0.01], colors: ['255,255,255', '190,215,255', '255,224,180'], alpha: [0.18, 0.85], drift: 0.1, soft: 2.6, twinkle: true },
  rain:    { n: 120, size: [0.7, 1.6], speed: [-0.8, -0.35], fall: [7, 13], colors: ['180,210,235'], alpha: [0.10, 0.34], drift: 0, streak: 16 },
  snow:    { n: 90,  size: [1.2, 3.4], speed: [-0.35, 0.35], fall: [0.5, 1.7], colors: ['255,255,255', '220,235,250'], alpha: [0.22, 0.75], drift: 1.5, soft: 2 },
  spores:  { n: 66,  size: [1.1, 3.0], speed: [-0.14, 0.14], fall: [-0.24, -0.03], colors: ['190,235,150', '235,240,180'], alpha: [0.12, 0.5], drift: 1.1, soft: 3 },
  pollen:  { n: 70,  size: [1.2, 3.2], speed: [-0.16, 0.16], fall: [-0.16, 0.06], colors: ['255,232,140', '215,235,150'], alpha: [0.14, 0.55], drift: 1.3, soft: 3 },
  embers:  { n: 46,  size: [1.1, 2.8], speed: [-0.20, 0.20], fall: [-0.75, -0.18], colors: ['255,150,60', '255,205,110', '255,90,40'], alpha: [0.20, 0.8], drift: 1.0, soft: 3.6, twinkle: true },
  fog:     { n: 16,  size: [80, 210],  speed: [-0.16, 0.16], fall: [-0.03, 0.03], colors: ['200,205,195'], alpha: [0.030, 0.075], drift: 0.2, soft: 1 },
  smoke:   { n: 13,  size: [70, 190],  speed: [0.05, 0.28],  fall: [-0.20, -0.05], colors: ['215,215,205'], alpha: [0.028, 0.07], drift: 0.3, soft: 1 },
  bubbles: { n: 38,  size: [1.4, 4.4], speed: [-0.10, 0.10], fall: [-0.55, -0.14], colors: ['170,235,255', '230,255,250'], alpha: [0.10, 0.4], drift: 0.9, ring: true },
  ink:     { n: 34,  size: [1.0, 2.4], speed: [-0.05, 0.05], fall: [0.04, 0.22], colors: ['255,255,255', '216,74,58'], alpha: [0.08, 0.34], drift: 0.4, soft: 2 },
  none:    { n: 0 },
};

const rand = (a, b) => a + Math.random() * (b - a);

/* one 64px sprite per colour, reused for every particle of that colour */
const SPRITES = new Map();
function sprite(color, softness) {
  const key = color + '|' + softness;
  let s = SPRITES.get(key);
  if (s) return s;
  const R = 32;
  s = document.createElement('canvas');
  s.width = s.height = R * 2;
  const c = s.getContext('2d');
  const g = c.createRadialGradient(R, R, 0, R, R, R);
  const core = Math.max(0, Math.min(0.6, 1 / softness));
  g.addColorStop(0, `rgba(${color},1)`);
  g.addColorStop(core, `rgba(${color},0.75)`);
  g.addColorStop(1, `rgba(${color},0)`);
  c.fillStyle = g;
  c.fillRect(0, 0, R * 2, R * 2);
  SPRITES.set(key, s);
  return s;
}

export class Ambience {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.parts = [];
    this.kind = 'dust';
    this.raf = 0;
    this.t = 0;
    /* a soft particle layer gains nothing from a retina buffer and costs
       four times the fill rate */
    this.dpr = Math.min(1.25, window.devicePixelRatio || 1);
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop(); else if (this.wanted) this.start();
    });
  }

  resize() {
    const w = this.c.clientWidth || window.innerWidth;
    const h = this.c.clientHeight || window.innerHeight;
    this.w = w; this.h = h;
    this.c.width = Math.round(w * this.dpr);
    this.c.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  set(kind) {
    this.kind = KINDS[kind] ? kind : 'dust';
    this.seed();
  }

  seed() {
    const k = KINDS[this.kind];
    this.parts = [];
    if (!k.n) return;
    const density = Math.min(1.25, (this.w * this.h) / (1440 * 900));
    const n = Math.round(k.n * density * (this.reduced ? 0.3 : 1));
    for (let i = 0; i < n; i++) this.parts.push(this.spawn(k, true));
  }

  spawn(k, anywhere) {
    const color = k.colors[(Math.random() * k.colors.length) | 0];
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : (k.fall[0] < 0 ? this.h + 20 : -20),
      r: rand(k.size[0], k.size[1]),
      vx: rand(k.speed[0], k.speed[1]),
      vy: rand(k.fall[0], k.fall[1]),
      a: rand(k.alpha[0], k.alpha[1]),
      c: color,
      img: k.soft ? sprite(color, k.soft) : null,
      p: Math.random() * Math.PI * 2,
    };
  }

  start() {
    this.wanted = true;
    if (this.raf) return;
    const loop = () => { this.raf = requestAnimationFrame(loop); this.frame(); };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  frame() {
    const { ctx } = this;
    const k = KINDS[this.kind];
    ctx.clearRect(0, 0, this.w, this.h);
    if (!k || !k.n) return;
    this.t += 0.016;

    ctx.globalCompositeOperation = 'lighter';

    for (const p of this.parts) {
      p.p += 0.012;
      p.x += p.vx + Math.sin(p.p) * (k.drift || 0) * 0.35;
      p.y += p.vy;

      if (p.y > this.h + 60 || p.y < -60 || p.x < -260 || p.x > this.w + 260) {
        Object.assign(p, this.spawn(k, false));
        continue;
      }

      const a = k.twinkle ? p.a * (0.55 + 0.45 * Math.sin(this.t * 2 + p.p * 4)) : p.a;

      if (k.streak) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(${p.c},${a})`;
        ctx.lineWidth = p.r;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 3, p.y - k.streak);
        ctx.stroke();
        continue;
      }

      if (k.ring) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(${p.c},${a})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.stroke();
        continue;
      }

      const d = p.r * 3;
      ctx.globalAlpha = a;
      ctx.drawImage(p.img, p.x - d, p.y - d, d * 2, d * 2);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
