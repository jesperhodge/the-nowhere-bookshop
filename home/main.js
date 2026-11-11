/* ============================================================
   philosophicaltech.com — the homepage.

   One body of work (home/projects.js), three forms to read it in.
   Sections:  1 DOM helpers   2 Tractatus   3 Ethics   4 Dialogue
              5 controls + state   6 the ink line
   Vanilla ES module; no build step, no dependencies.
   ============================================================ */

import { PERSON, PROJECTS } from '/home/projects.js';

/* ---------- 1. DOM helpers ---------- */

/* Text arrives as strings (*asterisks* = italics), DOM nodes, or arrays of them. */
function rich(s) {
  const f = document.createDocumentFragment();
  String(s).split('*').forEach((chunk, i) => {
    if (!chunk) return;
    if (i % 2) { const em = document.createElement('em'); em.textContent = chunk; f.append(em); }
    else f.append(chunk);
  });
  return f;
}

function add(node, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    node.append(typeof k === 'string' ? rich(k) : k);
  }
  return node;
}

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  return add(n, kids);
}

const link = (href, text, cls) => el('a', { href, class: cls }, text);
const projectLink = (p) => link(p.href, p.title, 'go');

function list(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n) => WORDS[n] ?? String(n);
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
const roman = (n) => ROMAN[n] ?? String(n);

/* A row = a number in the margin + a body. A block = rows that share one
   marginal gloss (which sits to the right on wide screens, below on narrow). */
function block(rows, { gloss, label = 'Note', mod = '', heading } = {}) {
  const sec = el('section', { class: 'block ' + mod });
  if (heading) sec.append(el('h3', { class: 'sr-only' }, heading));
  rows.forEach((r, i) => {
    sec.append(
      el('div', { class: 'row ' + (r.cls || ''), style: `--r:${i + 1}` },
        el('span', { class: 'num' }, r.n || ''),
        el(r.tag || 'p', { class: 'body ' + (r.bodyCls || '') }, r.body),
      ),
    );
  });
  if (gloss) {
    sec.append(el('aside', { class: 'gloss', style: `--span:${rows.length}` },
      el('span', { class: 'gloss-label' }, label), gloss));
  }
  return sec;
}

function leaf(eyebrow, title, sub) {
  return el('header', { class: 'leaf' },
    el('p', { class: 'eyebrow' }, eyebrow),
    el('h2', {}, title),
    sub && el('p', { class: 'sub' }, sub),
  );
}

/* ---------- 2. Tractatus ---------- */

/* Decimal convention: project k is 2.k, its sub-propositions 2.k1, 2.k2, 2.k3.
   The original runs out of digits at nine, so after that we step to 2.91, 2.92…
   (still unique, still ascending). */
const projNum = (k) => (k <= 9 ? `2.${k}` : `2.9${k - 9}`);

const TLP_STATUS = { open: 'is the case', 'in progress': 'is becoming the case', archived: 'was the case' };

function tractatus() {
  const n = PROJECTS.length;
  const out = [leaf(
    'After Wittgenstein',
    'Tractatus Technico-Philosophicus',
    'Propositions on the work of ' + PERSON.name + ', in the order of their importance.',
  )];

  out.push(block([
    { n: '1', cls: 'top', tag: 'h3', body: 'The world is everything that is the case. This site is everything that is the project.' },
  ], {
    label: 'cf. 1',
    gloss: '“Die Welt ist alles, was der Fall ist.” The decimals, as in the original, show logical importance: “the emphasis laid on them in my exposition.”',
  }));

  out.push(block([
    { n: '1.1', body: 'The site is the totality of projects, not of pages.' },
    {
      n: '1.11',
      cls: 'd3',
      body: 'The site is determined by the projects, and by their being all the projects. ' +
        (n === 1
          ? 'There is at present one; the claim to totality has never been easier to defend.'
          : `There are at present ${word(n)}; the claim to totality grows correspondingly harder to defend.`),
    },
  ]));

  out.push(block([
    { n: '1.12', body: 'Each project may be deployed or not deployed, while everything else remains the same.' },
  ], {
    label: 'cf. 2.061',
    gloss: 'States of affairs are independent of one another. So, as it happens, are folders.',
  }));

  out.push(block([
    { n: '1.2', body: `The author does not belong to the site; he is a limit of it. His name is ${PERSON.name}.` },
  ], {
    label: 'cf. 5.632',
    gloss: 'The subject does not belong to the world: rather, it is a limit of the world. Wittgenstein’s claim, borrowed for a footer.',
  }));

  out.push(block([
    { n: '1.21', cls: 'd3', body: 'He studied philosophy, and he builds things. These are not two facts but one, described in two vocabularies.' },
    { n: '1.22', cls: 'd3', body: 'He does deep thinking and thoughtful tech. Whether the adjectives are earned is a question for the projects.' },
  ]));

  out.push(block([
    { n: '2', cls: 'top', tag: 'h3', body: 'What is the case is the existence of projects.' },
  ], {
    label: 'cf. 2',
    gloss: 'In the original, facts are the existence of states of affairs. A project is a state of affairs that you can visit.',
  }));

  PROJECTS.forEach((p, i) => {
    const k = i + 1;
    const base = projNum(k);
    const rows = [
      {
        n: base,
        tag: 'h3',
        body: [projectLink(p), ` (${p.year}) ${TLP_STATUS[p.status] || TLP_STATUS.open}.`],
      },
      { n: base + '1', body: p.thesis },
      { n: base + '2', body: p.method },
    ];
    if (p.tags?.length) rows.push({ n: base + '3', cls: 'd3', body: `Its constituents are ${list(p.tags)}.` });
    out.push(block(rows, { gloss: p.gloss, label: 'Note' }));
  });

  out.push(block([
    { n: projNum(n + 1), cls: 'ghost', body: 'Whereof one has not yet shipped, thereof one must be silent.' },
  ]));

  out.push(block([
    { n: '3', cls: 'top', tag: 'h3', body: 'A logical picture of the facts is a thought; and the author’s thoughts have two projections into the world of correspondence.' },
    ...PERSON.links.map((l, i) => ({
      n: '3.' + (i + 1),
      body: [
        l.kind === 'said' ? 'What must be said is on ' : l.kind === 'shown' ? 'What can be shown is on ' : 'He may also be found on ',
        link(l.href, l.label),
        '.',
      ],
    })),
  ], {
    label: 'cf. 4.1212',
    gloss: 'What can be shown cannot be said. The author has hedged, and keeps an account in each.',
  }));

  out.push(block([
    {
      n: '6.54',
      cls: 'ladder',
      body: 'These propositions serve as elucidations in the following way: whoever understands them finally recognizes them as signposts, when he has used them — as steps — to climb out of this page. (He must, so to speak, close the tab after he has climbed up it.)',
    },
  ], {
    label: 'Editorial',
    gloss: 'Propositions 4 through 6.53 are omitted. The original has rather more to say in them.',
  }));

  out.push(block([
    { n: '7', cls: 'top', tag: 'h3', body: 'Whereof one cannot speak, thereof one must be silent.' },
  ]));

  return out;
}

/* ---------- 3. Ethics, demonstrated in geometrical order ---------- */

const ETH_EXISTS = {
  open: 'exists.',
  'in progress': 'is not yet, but may be.',
  archived: 'once existed.',
};

function ethDemonstrationEnd(p) {
  const go = link(p.href, 'follow the link');
  if (p.status === 'in progress') {
    return ['If anyone deny it, let him ', go, '. It will not yet be all there, but it is not nothing, and what is not nothing may be demonstrated further.'];
  }
  if (p.status === 'archived') {
    return ['If anyone deny it, let him consider that what has once been cannot not have been; the link, if dead, is merely a mode of its having been. Let him ', go, ' and see.'];
  }
  return ['If anyone deny it, let him ', go, '. If it loads, the denial is refuted; if it does not, there is a fault, which proves the author (Def. III), and the Proposition stands.'];
}

function ethics() {
  const out = [leaf(
    'Ethica, ordine geometrico demonstrata',
    'Ethics, Demonstrated in Geometrical Order',
    'Part I. Of the Work, and of Its Author.',
  )];

  const label = (t) => el('span', { class: 'label' }, t);
  const def = (n, body, extra) => ({ n: 'Def. ' + roman(n), body: extra ? [body, ' ', label('Explanation.'), ' ', extra] : body });

  out.push(block([{ n: '', cls: 'wide', tag: 'h3', bodyCls: 'rubric', body: 'Definitions' }], { mod: 'tight' }));

  out.push(block([
    def(1, 'By *thoughtful tech* I understand that whose making involves, in its essence, the question why it should be made.'),
  ], {
    mod: 'tight',
    label: 'cf. I, Def. 1',
    gloss: 'There, the self-caused is that whose essence involves existence. Here, essence involves a reason.',
  }));

  out.push(block([
    def(2, 'A thing is called *unfinished in its kind* when it can be bettered by another thing of the same nature. Thus a website is unfinished, because we can always conceive another commit.'),
  ], { mod: 'tight' }));

  out.push(block([
    def(
      3,
      `By *the author* I understand that which is in itself and is conceived through itself: namely, ${PERSON.name}, who studied philosophy, and does deep thinking and thoughtful tech.`,
      'I say *in itself* rather than *in a curriculum vitae*; the latter is a mode, and an abbreviated one.',
    ),
  ], {
    mod: 'tight',
    label: 'cf. I, Def. 3',
    gloss: 'In the original this defines Substance, which Spinoza goes on to identify with God. The author has not asked for the promotion.',
  }));

  out.push(block([
    def(4, 'By *a project* I understand that which the intellect perceives of the author as constituting his essence; or, at least, the part of it that has a URL.'),
  ], { mod: 'tight' }));

  out.push(block([{ n: '', cls: 'wide', tag: 'h3', bodyCls: 'rubric', body: 'Axioms' }], { mod: 'tight gap' }));

  out.push(block([
    { n: 'Ax. I', body: 'Everything which is, is either a project or a page about a project.' },
  ], { mod: 'tight' }));
  out.push(block([
    { n: 'Ax. II', body: 'That which cannot be reached through a link must be reached through itself; that is, by typing the address.' },
  ], { mod: 'tight' }));
  out.push(block([
    { n: 'Ax. III', body: 'From a given definite cause an effect necessarily follows; and if no effect follows, there was no given definite cause.' },
  ], { mod: 'tight', label: 'Remark', gloss: 'This is also a fair summary of debugging.' }));

  PROJECTS.forEach((p, i) => {
    const k = i + 1;
    const rows = [
      { n: 'Prop. ' + roman(k), tag: 'h3', bodyCls: 'prop', body: [projectLink(p), ' ' + (ETH_EXISTS[p.status] || ETH_EXISTS.open)] },
      {
        n: '',
        body: [
          label('Demonstration.'), ' ',
          p.thesis, ' (Def. IV.) ', p.method, ' (Ax. I.) ',
          ethDemonstrationEnd(p),
          el('span', { class: 'qed' }, 'Q.E.D.'),
        ],
      },
    ];
    if (p.tags?.length) {
      rows.push({
        n: '',
        body: [label('Corollary.'), ` Hence it follows that it is composed of ${list(p.tags)}, and of nothing hidden.`],
      });
    }
    out.push(block(rows, { mod: i === 0 ? 'loose' : '', label: 'Scholium', gloss: p.gloss }));
  });

  out.push(block([
    { n: 'Prop. ' + roman(PROJECTS.length + 1), cls: 'ghost', tag: 'h3', bodyCls: 'prop', body: '*Unwritten.*' },
    { n: '', cls: 'ghost', body: [label('Demonstration.'), ' Wanting. What has not been demonstrated may not be asserted, and what has not been shipped may not be linked.'] },
  ]));

  const shown = PERSON.links.find((l) => l.kind === 'shown');
  const said = PERSON.links.find((l) => l.kind === 'said');
  out.push(block([
    { n: '', cls: 'wide', tag: 'h3', bodyCls: 'rubric', body: 'Appendix' },
    {
      n: '',
      body: [
        'In the foregoing I have explained the nature of the work and of its author. If any reader finds an error, I ask him to correct it, rather than merely to deplore it: for what is shown, ',
        shown ? link(shown.href, shown.label) : 'the work itself',
        '; for what is said, ',
        said ? link(said.href, said.label) : 'the author',
        '.',
        el('span', { class: 'qed' }, 'Q.E.D.'),
      ],
    },
    { n: '', cls: 'ghost', body: 'Part II, Of the Nature and Origin of the Next Project, follows when it does.' },
  ], { mod: 'loose' }));

  return out;
}

/* ---------- 4. Dialogue ---------- */

function stephanus(start = 2) {
  let num = start, i = 0;
  return () => {
    const s = num + 'abcde'[i];
    if (++i === 5) { i = 0; num++; }
    return s;
  };
}

const DLG_MADE = { open: 'I made', 'in progress': 'I am making', archived: 'I made, and have put down,' };

function dialogue() {
  const next = stephanus();
  const S = el('span', { class: 'who socrates' }, 'Socrates.');
  const J = el('span', { class: 'who' }, 'Jesper.');
  const say = (who, ...body) => ({ n: next(), cls: 'speech', body: [who.cloneNode(true), ...body] });
  const s = (...b) => say(S, ...b);
  const j = (...b) => say(J, ...b);

  const out = [leaf(
    'A dialogue, after Plato',
    'Jesper, or On Thoughtful Tech',
    'Persons of the dialogue: Socrates, Jesper. Scene: a web page. The agora is, regrettably, a URL.',
  )];

  out.push(block([
    s('Jesper, I hear you studied philosophy and now build things. Is that a change of occupation, or the same one by other means?'),
    j('The same, I hope. I do deep thinking and thoughtful tech, and I am still working out which of the two I am doing at any moment.'),
    s('Then tell me what *thoughtful tech* is, since you have used the word.'),
    j('Technology made by someone who has thought about why it should exist.'),
    s('Then a machine built, with great deliberation, to keep people scrolling past midnight would be thoughtful tech?'),
    j('No. The thinking has to include the person who will use it.'),
    s('So thoughtfulness is a matter not of how much thought, but of whom it was about. And can you tell, from the code, whom its author had in mind?'),
    j('Not from the code alone.'),
    s('Then I am afraid your definition cannot tell thoughtful tech from the other kind, which was rather the point of having one.'),
    j('Then let me stop defining it and show you what I have made. You may judge it by what it does.'),
    s('Euthyphro said much the same, and then remembered an appointment. You are, I notice, staying. Show me.'),
  ], {
    mod: 'loose',
    label: 'Scholion',
    gloss: 'Euthyphro 15e: the one who was to define piety is suddenly in a hurry. Socrates, as ever, is left with the aporia.',
  }));

  PROJECTS.forEach((p) => {
    out.push(block([
      s(p.question),
      j((DLG_MADE[p.status] || DLG_MADE.open) + ' ', projectLink(p), '. ', p.thesis),
      s('And by what means is it made?'),
      j(p.method),
    ], { heading: p.title, label: 'Scholion', gloss: p.gloss }));
  });

  out.push(block([
    s('And the next?'),
    j('Not yet shipped.'),
    s('Then you know that you do not know what it is. We are alike, you and I; I am told it is the beginning of wisdom.'),
    j('I was told it is the beginning of a backlog.'),
    s('Let us try the definition again, now that we have seen something. Thoughtful tech is whatever survives the question, “Why this, and for whom?”'),
    j('Say it, and I will try to break it.'),
    s('Excellent. It is the only kind of agreement I trust. Where might a person find you, if they had a counterexample?'),
    j(...dialogueLinks()),
    s('What is shown, and what is said. Very well. I shall go and see whether the thing is as you describe it; and if it is not, I shall come back and be tiresome.'),
    j('That is what the issue tracker is for.'),
  ], {
    mod: 'loose',
    label: 'Scholion',
    gloss: 'Socrates calls himself a gadfly in the Apology: a pest, set on the city by the god, to keep it awake. Here, a pest set on the code.',
  }));

  return out;
}

function dialogueLinks() {
  const [shown, said] = ['shown', 'said'].map((k) => PERSON.links.find((l) => l.kind === k));
  const rest = PERSON.links.filter((l) => l !== shown && l !== said);
  const parts = [];
  if (shown) parts.push('On ', link(shown.href, shown.label), ', where the work is');
  if (said) parts.push(shown ? ', and on ' : 'On ', link(said.href, said.label), ', where the account of the work is');
  rest.forEach((l, i) => parts.push(i || shown || said ? ', and on ' : 'On ', link(l.href, l.label)));
  parts.push('.');
  return parts;
}

/* ---------- 5. controls + state ---------- */

const FORMS = {
  tractatus: { label: 'Tractatus', manner: 'In the manner of Wittgenstein', cls: 'tlp', render: tractatus },
  ethics: { label: 'Ethics', manner: 'In the manner of Spinoza', cls: 'eth', render: ethics },
  dialogue: { label: 'Dialogue', manner: 'In the manner of Plato', cls: 'dlg', render: dialogue },
};
const DEFAULT_FORM = 'tractatus';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function remembered() {
  try { return localStorage.getItem('pt-form'); } catch { return null; }
}
function remember(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private window, blocked storage: fine */ }
}
function hashForm() {
  const k = location.hash.replace(/^#/, '');
  return Object.hasOwn(FORMS, k) ? k : null;
}

const textEl = document.getElementById('text');
const formsEl = document.getElementById('forms');
const themeEl = document.getElementById('theme');
let current = null;

function mount(key) {
  const f = FORMS[key];
  textEl.replaceChildren(...f.render());
  textEl.className = 'text ' + f.cls;
  document.documentElement.dataset.form = key;
  for (const b of formsEl.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.form === key));
  formsEl.querySelector('.manner').textContent = f.manner;
}

function setForm(key, { writeHash = true } = {}) {
  if (!Object.hasOwn(FORMS, key) || key === current) return;
  const first = current === null;
  current = key;
  remember('pt-form', key);
  if (writeHash && !first) {
    try { history.replaceState(null, '', '#' + key); } catch { /* sandboxed frames */ }
  }
  if (first || reduceMotion.matches) { mount(key); return; }
  textEl.classList.add('is-out');
  setTimeout(() => { mount(key); textEl.classList.remove('is-out'); }, 180);
}

function buildForms() {
  formsEl.append(el('p', { class: 'forms-label', id: 'forms-label' }, 'Read this page as'));
  for (const [key, f] of Object.entries(FORMS)) {
    const b = el('button', { type: 'button', 'data-form': key, 'aria-pressed': 'false' }, f.label);
    b.addEventListener('click', () => setForm(key));
    formsEl.append(b);
  }
  formsEl.append(el('p', { class: 'manner', 'aria-live': 'polite' }));
  formsEl.setAttribute('role', 'group');
  formsEl.setAttribute('aria-labelledby', 'forms-label');
}

function effectiveTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function buildTheme() {
  const b = el('button', { type: 'button' });
  const paint = () => {
    const to = effectiveTheme() === 'dark' ? 'light' : 'dark';
    b.textContent = to === 'dark' ? 'Dark' : 'Light';
    b.setAttribute('aria-label', `Switch to the ${to} theme`);
  };
  b.addEventListener('click', () => {
    const to = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = to;
    remember('pt-theme', to);
    paint();
    ink.recolor();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { paint(); ink.recolor(); });
  themeEl.append(b);
  paint();
}

/* ---------- 6. the ink line ----------
   One unbroken line, wandering: a random walk with momentum (its heading has
   inertia, so it curves like a pen being thought with), a speed that dips into
   the occasional pause, a tail that fades. Redrawn from a ring of points each
   frame — no accumulating residue. Stands still under prefers-reduced-motion. */

const ink = (() => {
  const canvas = document.getElementById('ink');
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return { recolor() {}, start() {} };

  const TAIL = 620;            // points kept when animating
  const TAIL_STATIC = 1500;    // points in the single still frame
  let W = 0, H = 0, dpr = 1, color = '#000';
  let pts = [];
  let s = { x: 0, y: 0, a: Math.random() * 6.283, om: 0, v: 0, t: 0, pause: 0 };
  let raf = 0, last = 0;

  const alphaMax = () => (effectiveTheme() === 'dark' ? 0.3 : 0.26);

  function recolor() {
    color = getComputedStyle(document.documentElement).getPropertyValue('--ink-line').trim() || '#000';
    if (reduceMotion.matches) draw();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    s.x = Math.min(Math.max(s.x, 20), W - 20);
    s.y = Math.min(Math.max(s.y, 20), H - 20);
    if (reduceMotion.matches) { pts = []; prewalk(TAIL_STATIC); draw(); }
  }

  function step(dt) {
    s.t += dt;
    // heading: noise in, damping out — that is the momentum
    s.om += (Math.random() - 0.5) * 4 * dt;
    s.om *= Math.exp(-1.2 * dt);
    // keep to the page: lean toward the middle near an edge
    const edge = Math.min(s.x, s.y, W - s.x, H - s.y);
    const R = 150;
    if (edge < R) {
      let da = Math.atan2(H / 2 - s.y, W / 2 - s.x) - s.a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      s.om += da * 2.4 * (1 - Math.max(edge, 0) / R) * dt;
    }
    s.a += s.om * dt;
    // speed: a slow swell, and now and then a stop to think
    if (s.pause > 0) s.pause -= dt;
    else if (Math.random() < dt / 16) s.pause = 1.5 + Math.random() * 2.5;
    const target = s.pause > 0 ? 2 : 52 * (0.75 + 0.25 * Math.sin(s.t * 0.37));
    s.v += (target - s.v) * Math.min(1, dt * 2.5);
    s.x += Math.cos(s.a) * s.v * dt;
    s.y += Math.sin(s.a) * s.v * dt;
    const p = pts[pts.length - 1];
    if (!p || Math.hypot(s.x - p.x, s.y - p.y) > 3.5) pts.push({ x: s.x, y: s.y });
  }

  function prewalk(n) {
    // Used for the first frame and the reduced-motion still: walk from the middle.
    s.x = W / 2; s.y = H / 2; s.v = 40; s.pause = 0;
    let guard = 0;
    while (pts.length < n && guard++ < n * 40) step(0.05);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const n = pts.length;
    if (n < 3) return;
    const bands = 10;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.15;
    const amax = alphaMax();
    for (let b = 0; b < bands; b++) {
      const from = Math.floor((b * n) / bands);
      const to = Math.min(n - 1, Math.floor(((b + 1) * n) / bands) + 1);
      if (to - from < 2) continue;
      ctx.globalAlpha = amax * Math.pow((b + 1) / bands, 1.6);
      ctx.beginPath();
      ctx.moveTo(pts[from].x, pts[from].y);
      for (let i = from + 1; i < to; i++) {
        const mx = (pts[i].x + pts[i + 1 > n - 1 ? i : i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1 > n - 1 ? i : i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    step(dt);
    while (pts.length > TAIL) pts.shift();
    draw();
  }

  function run() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (reduceMotion.matches || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    resize();
    recolor();
    pts = [];
    if (reduceMotion.matches) { prewalk(TAIL_STATIC); draw(); }
    else { prewalk(TAIL); draw(); run(); }
    window.addEventListener('resize', () => { resize(); if (!reduceMotion.matches) draw(); });
    document.addEventListener('visibilitychange', run);
    reduceMotion.addEventListener('change', () => {
      pts = [];
      if (reduceMotion.matches) { cancelAnimationFrame(raf); prewalk(TAIL_STATIC); draw(); }
      else { prewalk(TAIL); draw(); run(); }
    });
  }

  return { recolor, start };
})();

/* ---------- boot ---------- */

document.querySelector('.about').textContent = PERSON.about;
buildTheme();
buildForms();
setForm(hashForm() || (Object.hasOwn(FORMS, remembered()) ? remembered() : DEFAULT_FORM), { writeHash: false });
window.addEventListener('hashchange', () => {
  const k = hashForm();
  if (k) setForm(k, { writeHash: false });
});
ink.start();
