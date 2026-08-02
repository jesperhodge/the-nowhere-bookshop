/* ============================================================
   The shop plan — pinned up by the till, drawn by somebody who
   was not entirely sure how many rooms there are.
   ============================================================ */

import { ROOMS, ROOM_BY_ID, STATS } from '../shop.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function counts(room) {
  const own = room.books.length;
  const deeper = room.total - own;
  const bits = [];
  if (own) bits.push(`${own} on the shelf`);
  if (deeper) bits.push(`${deeper} deeper in`);
  return bits.join(' · ');
}

function node(room, here, level, withKids = true) {
  const cls = `pnode pnode--l${level}${room.id === here ? ' is-here' : ''}`;
  const c = counts(room);
  const kids = withKids && room.children.length
    ? `<div class="pkids">${room.children.map((k) => node(k, here, level + 1)).join('')}</div>`
    : '';
  return `
    <div class="pbranch">
      <button class="${cls}" type="button" data-room="${room.id}">
        <span class="pnode__n">${esc(room.name)}</span>
        ${room.sub ? `<span class="pnode__s">${esc(room.sub)}</span>` : ''}
        ${c ? `<span class="pnode__c">${c}</span>` : ''}
      </button>
      ${kids}
    </div>`;
}

export function renderMap(hereId) {
  const front = ROOM_BY_ID.front;
  const landing = ROOM_BY_ID.landing;
  const offFront = front.children.filter((r) => r.id !== 'landing');

  const el = document.createElement('div');
  el.className = 'plan';
  el.innerHTML = `
    <div class="plan__hd">
      <h2 class="plan__title">The plan of the shop</h2>
      <span class="plan__sub">${STATS.rooms} rooms · ${STATS.books} books · ${STATS.deepest} doors deep</span>
    </div>
    <div class="plan__body scroll">
      <div class="plan__lead">${node(front, hereId, 1, false)}</div>

      <p class="plan__sect">Off the front room</p>
      <div class="plan__grid">
        ${offFront.map((r) => `<div class="plan__col">${node(r, hereId, 1)}</div>`).join('')}
      </div>

      <p class="plan__sect">Through the corridor behind the till</p>
      <div class="plan__lead">${node(landing, hereId, 1, false)}</div>
      <div class="plan__grid">
        ${landing.children.map((r) => `<div class="plan__col">${node(r, hereId, 1)}</div>`).join('')}
      </div>

      <p class="plan__foot">Everything on these shelves was chosen from prize lists, critics' polls
      and long arguments. Nothing is here because it sold well — except on the front table, which is
      what a front table is for.</p>
    </div>`;
  return el;
}

export { ROOMS };
