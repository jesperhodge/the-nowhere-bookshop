/* ============================================================
   Room tone, generated rather than downloaded — filtered noise
   for rain and wind, a low hum for the room itself, and the
   occasional pop from a fire or creak from a floorboard.
   Off unless the visitor asks for it.
   ============================================================ */

const TONES = {
  dust:    { hiss: 220,  q: 0.7, gain: 0.030, hum: 62,  pop: 0 },
  rain:    { hiss: 1500, q: 0.5, gain: 0.075, hum: 48,  pop: 0 },
  embers:  { hiss: 340,  q: 0.9, gain: 0.038, hum: 44,  pop: 0.55 },
  stars:   { hiss: 130,  q: 1.4, gain: 0.026, hum: 38,  pop: 0 },
  snow:    { hiss: 800,  q: 0.4, gain: 0.030, hum: 40,  pop: 0 },
  spores:  { hiss: 300,  q: 1.1, gain: 0.028, hum: 56,  pop: 0.12 },
  pollen:  { hiss: 420,  q: 1.0, gain: 0.026, hum: 60,  pop: 0.08 },
  motes:   { hiss: 200,  q: 1.2, gain: 0.026, hum: 52,  pop: 0 },
  fog:     { hiss: 260,  q: 0.8, gain: 0.030, hum: 46,  pop: 0 },
  smoke:   { hiss: 240,  q: 0.9, gain: 0.028, hum: 50,  pop: 0.2 },
  bubbles: { hiss: 600,  q: 1.6, gain: 0.026, hum: 42,  pop: 0.3 },
  ink:     { hiss: 180,  q: 1.0, gain: 0.024, hum: 58,  pop: 0 },
  none:    { hiss: 200,  q: 1.0, gain: 0.018, hum: 55,  pop: 0 },
};

export class RoomTone {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.kind = 'dust';
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    /* pink-ish noise */
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
    }
    this.noiseBuf = buf;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.src = ctx.createBufferSource();
    this.src.buffer = buf;
    this.src.loop = true;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = 300;
    this.filter.Q.value = 1;

    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0.03;

    this.src.connect(this.filter);
    this.filter.connect(this.hissGain);
    this.hissGain.connect(this.master);
    this.src.start();

    /* the room's own low note */
    this.osc = ctx.createOscillator();
    this.osc.type = 'sine';
    this.osc.frequency.value = 55;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.028;
    this.osc.connect(this.humGain);
    this.humGain.connect(this.master);
    this.osc.start();

    this.apply(this.kind, 0);
  }

  apply(kind, ramp = 1.2) {
    this.kind = TONES[kind] ? kind : 'dust';
    if (!this.ctx) return;
    const t = TONES[this.kind];
    const now = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(t.hiss, now, ramp / 3);
    this.filter.Q.setTargetAtTime(t.q, now, ramp / 3);
    this.hissGain.gain.setTargetAtTime(t.gain, now, ramp / 3);
    this.osc.frequency.setTargetAtTime(t.hum, now, ramp / 3);
    clearTimeout(this._popTimer);
    if (t.pop > 0 && this.on) this.schedulePop(t.pop);
  }

  schedulePop(rate) {
    const delay = (400 + Math.random() * 2600) / rate;
    this._popTimer = setTimeout(() => {
      if (this.on) { this.pop(); this.schedulePop(rate); }
    }, delay);
  }

  pop() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.5 + Math.random();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700 + Math.random() * 2200;
    f.Q.value = 6;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.10 + Math.random() * 0.12, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09 + Math.random() * 0.14);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(now, Math.random() * 3, 0.35);
  }

  /* a small brass bell on the counter */
  ding() {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, now = ctx.currentTime;
    [1, 2.76, 5.4].forEach((mult, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 660 * mult;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.16 / (i + 1), now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.9 / (i + 0.7));
      o.connect(g); g.connect(this.master);
      o.start(now); o.stop(now + 2.2);
    });
  }

  toggle(force) {
    const want = force ?? !this.on;
    if (want) {
      this.init();
      if (!this.ctx) return false;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.on = true;
      this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.6);
      this.apply(this.kind, 0.4);
    } else if (this.ctx) {
      this.on = false;
      clearTimeout(this._popTimer);
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.35);
    }
    return this.on;
  }
}
