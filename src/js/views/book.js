/* ============================================================
   Taking a book off the shelf: the panel that slides in when
   you pick one up.
   ============================================================ */

import { coverSVG, spineStyle } from '../covers.js';
import { buyLink, altLinks, VENDORS } from '../links.js';
import { ROOM_BY_ID, pathTo } from '../shop.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* blurbs may carry a little <em> — allow that and nothing else */
const rich = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/&lt;(\/?)em&gt;/g, '<$1em>');

const ICON = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  cart: '<svg viewBox="0 0 24 24"><path d="M4 5h2.5l2 10h9l2-7H8"/><circle cx="10" cy="19" r="1.4"/><circle cx="17.5" cy="19" r="1.4"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  keep: '<svg viewBox="0 0 24 24"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/></svg>',
};

export function renderBook(book, ctx) {
  const s = spineStyle(book);
  const room = ROOM_BY_ID[book.room];
  const trail = pathTo(book.room).map((r) => r.name).join(' › ');
  const kept = ctx.isKept(book.id);

  const facts = [
    book.year ? `${book.year}` : '',
    book.pages ? `${book.pages} pp.` : '',
    book.translator ? `translated by ${esc(book.translator)}` : '',
  ].filter(Boolean).map((f) => `<span>${f}</span>`).join('');

  const seals = [
    ...book.won.map((w) => `<span class="seal seal--win">${esc(w)}</span>`),
    ...book.cited.map((w) => `<span class="seal">${esc(w)}</span>`),
  ].join('');

  const alts = altLinks(book).map((v) =>
    `<a class="buy__alt" href="${v.href}" target="_blank" rel="noopener noreferrer" title="${esc(v.note)}">${esc(v.name)}</a>`
  ).join('');

  const sample = book.first
    ? `<section class="bd__sec">
         <h3 class="bd__h">The first page</h3>
         <div class="firstpage">
           <p class="firstpage__t">${rich(book.first)}</p>
           <p class="firstpage__c">Opening line · <a href="${VENDORS.preview.url(book)}" target="_blank" rel="noopener noreferrer" style="color:inherit">read further</a></p>
         </div>
       </section>`
    : `<section class="bd__sec">
         <h3 class="bd__h">A few pages</h3>
         <div class="firstpage">
           <p class="firstpage__t" style="font-size:.98rem">Have a look inside before you commit — most of these have a readable preview, and a good many can be borrowed for nothing.</p>
           <p class="firstpage__c">
             <a href="${VENDORS.preview.url(book)}" target="_blank" rel="noopener noreferrer" style="color:inherit">Preview</a> ·
             <a href="${VENDORS.openlibrary.url(book)}" target="_blank" rel="noopener noreferrer" style="color:inherit">Borrow</a>
           </p>
         </div>
       </section>`;

  const el = document.createElement('div');
  el.className = 'bd';
  el.innerHTML = `
    <div class="bd__top">
      <button class="bd__close" type="button" data-close aria-label="Put it back">${ICON.close}</button>
      <div class="hold" id="hold" style="--hw:190px; --hh:288px; --ht:${Math.max(16, Math.min(52, Math.round((book.pages || 300) / 9)))}px; --sp-bg:${s.bg}; --sp-ink:${s.ink}; --cv-bg2:${s.coverFlat2};">
        <div>
          <div class="hold__obj" id="holdObj">
            <div class="hold__f hold__front">${coverSVG(book, { w: 190, h: 288, detail: 'full' })}</div>
            <div class="hold__f hold__back"></div>
            <div class="hold__f hold__spine"><span class="hold__sptitle">${esc(book.title)}</span></div>
            <div class="hold__f hold__fore"></div>
            <div class="hold__f hold__top"></div>
            <div class="hold__f hold__bot"></div>
          </div>
          <p class="hold__turn">drag to turn it over</p>
        </div>
      </div>
      <div class="bd__meta">
        <h2 class="bd__title" id="sheetTitle">${esc(book.title)}</h2>
        <p class="bd__author">${esc(book.author)}</p>
        <p class="bd__facts">${facts}</p>
        ${seals ? `<div class="seals">${seals}</div>` : ''}
      </div>
    </div>

    <div class="bd__scroll scroll">
      <section class="bd__sec">
        <h3 class="bd__h">What it is</h3>
        <p class="bd__p">${rich(book.blurb)}</p>
      </section>

      <section class="bd__sec">
        <h3 class="bd__h">Why it's on this shelf</h3>
        <p class="bd__note">${rich(book.note)}</p>
      </section>

      ${sample}

      <section class="bd__sec">
        <h3 class="bd__h">Shelved under</h3>
        <div class="taglist">
          <button class="tagchip" type="button" data-room="${book.room}">${esc(trail)}</button>
          ${book.tags.map((t) => `<button class="tagchip" type="button" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
        </div>
      </section>
    </div>

    <div class="bd__buy">
      <a class="buy__main" href="${buyLink(book)}" target="_blank" rel="noopener noreferrer">
        ${ICON.cart}<span>Buy it from Bookshop.org</span>
      </a>
      <p class="buy__why">Bookshop.org pays a share of every sale into a pool for independent bookshops. Not Amazon, on purpose.</p>
      <div class="buy__alts">${alts}</div>
    </div>

    <div class="bd__nav">
      <button class="bd__navbtn" type="button" data-step="-1" ${ctx.prev ? '' : 'disabled'}>
        ${ICON.prev}<span>${ctx.prev ? esc(ctx.prev.title) : 'Start of shelf'}</span>
      </button>
      <button class="bd__keep ${kept ? 'is-on' : ''}" type="button" data-keep>
        ${ICON.keep}<span>${kept ? 'In your parcel' : 'Put in parcel'}</span>
      </button>
      <button class="bd__navbtn" type="button" data-step="1" ${ctx.next ? '' : 'disabled'}>
        <span>${ctx.next ? esc(ctx.next.title) : 'End of shelf'}</span>${ICON.next}
      </button>
    </div>`;

  wireHold(el.querySelector('#hold'), el.querySelector('#holdObj'));
  return el;
}

/* drag the book around in your hands */
function wireHold(hold, obj) {
  let rx = -6, ry = -28, dragging = false, lx = 0, ly = 0, idle = null;

  const set = () => {
    obj.style.setProperty('--rx', `${rx.toFixed(1)}deg`);
    obj.style.setProperty('--ry', `${ry.toFixed(1)}deg`);
  };

  const down = (e) => {
    dragging = true;
    hold.classList.add('is-dragging');
    lx = (e.touches ? e.touches[0].clientX : e.clientX);
    ly = (e.touches ? e.touches[0].clientY : e.clientY);
    clearTimeout(idle);
    hold.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!dragging) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const y = (e.touches ? e.touches[0].clientY : e.clientY);
    ry += (x - lx) * 0.55;
    rx = Math.max(-70, Math.min(70, rx - (y - ly) * 0.4));
    lx = x; ly = y;
    set();
    e.preventDefault();
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    hold.classList.remove('is-dragging');
    /* settle back to a nice three-quarter view */
    idle = setTimeout(() => {
      const turns = Math.round(ry / 360);
      ry = turns * 360 - 28;
      rx = -6;
      set();
    }, 2200);
  };

  /* pointer capture keeps the drag on this element, so no window listeners
     to tidy up when the panel is thrown away */
  hold.addEventListener('pointerdown', down);
  hold.addEventListener('pointermove', move, { passive: false });
  hold.addEventListener('pointerup', up);
  hold.addEventListener('pointercancel', up);
  hold.addEventListener('dblclick', () => { ry += 180; set(); });
  set();
}
