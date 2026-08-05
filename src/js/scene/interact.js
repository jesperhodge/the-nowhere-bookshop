/* ============================================================
   Pointer raycasting + the one shared "select a thing" path.

   Per IMPLEMENTATION.md §4.7: "Pointer input uses raycasting;
   keyboard and AT use the mirror" — but activating an entry must do
   the SAME thing regardless of which input found it, or behaviour
   drifts between mouse and keyboard over time. makeController() below
   is that one path, parameterised only by which CustomEvent it
   dispatches and how it builds that event's detail: createBookController()
   (phase 4) and createDoorController() (phase 5) are both thin calls
   into it, and both attachPointerPicking()/attachDoorPicking() and
   a11y.js's mirror buttons call controller.hover()/controller.activate()
   — no input source, and no entry kind, implements its own version of
   "what happens when a thing is selected."

   Books and doors get SEPARATE controller instances (one hover state
   each), not one shared instance — a book being hovered and a door
   being hovered are independent facts about the room, and raycasting
   already queries separate mesh lists (books.js's entries vs.
   doors.js's entries) so there's nothing to reconcile between them.
   What IS shared is the a11y mirror: a11y.js's addEntry() honours an
   optional `entry.controller` override precisely so book entries and
   door entries can live in the same mirror list while still routing
   hover/activate to their own controller — see a11y.js's comment.

   Phase 7 (PLAN.md point 6 / IMPLEMENTATION.md §4.3) adds two more
   activatable kinds — cases (books.js's per-case entries) and tables
   (poses.js/tables.js) — but they do NOT get their own separate
   controller each the way books and doors did. createPoseController()
   is ONE instance meant to be shared by both, because "move the
   camera to this pose" means exactly the same thing for a case and a
   table, and (unlike books vs. doors) a case and a table are never
   both under the pointer at once — see that function's own comment.

   Phase 7 also retires the one-raycaster-per-kind picking design
   below in favour of attachScenePicking(): ONE raycaster over every
   kind's meshes at once, with nearest-hit arbitration. A case's own
   click/hover sensor sits directly behind that same case's books on
   purpose (books.js), so two independent raycasters would both fire
   for one click — see attachScenePicking()'s own comment for the full
   reasoning. attachPointerPicking()/attachDoorPicking() are now
   one-line callers of it, unchanged in signature and behaviour.
   ============================================================ */

import * as THREE from 'three';

/**
 * @param {string} eventName  the CustomEvent dispatched on activate()
 * @param {(entry) => object} detailOf  builds that event's `detail`
 */
function makeController(eventName, detailOf) {
  let hovered = null;
  const activateListeners = new Set();

  function hover(entry) {
    if (hovered === entry) return;
    if (hovered) hovered.setHighlight(false);
    hovered = entry;
    if (hovered) hovered.setHighlight(true);
  }

  function activate(entry) {
    if (!entry) return;
    for (const fn of activateListeners) fn(entry);
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(eventName, { detail: detailOf(entry) }));
    }
  }

  /** Subscribe to activation (click, or Enter/Space on the a11y mirror).
   *  Actual "open the book panel" / "go to the room" UI wiring happens
   *  at main.js integration time (not this phase) — for now this is a
   *  console.log-able callback/event, per the brief. */
  function onActivate(fn) {
    activateListeners.add(fn);
    return () => activateListeners.delete(fn);
  }

  return {
    hover,
    activate,
    onActivate,
    get hovered() { return hovered; },
  };
}

/**
 * The shared hover/activate state machine for books. One instance per
 * room. `entry.setHighlight(bool)` (see books.js) does the actual
 * visual work (lift + tilt + emissive); this module only ever decides
 * WHEN to call it, from either input source, through the same two
 * methods. Dispatches `book:open` on activate, detail
 * `{id, title, author, entry}` — unchanged from phase 4.
 */
export function createBookController() {
  return makeController('book:open', (entry) => ({
    id: entry.book.id, title: entry.book.title, author: entry.book.author, entry,
  }));
}

/**
 * The hover/activate state machine for doors (phase 5). Same shape as
 * createBookController(); `entry` is one of doors.js's
 * buildRoomDoors().entries (`.room`, `.slot`, `.setHighlight`).
 * Dispatches `door:go` on activate, detail `{roomId, slot, entry}` —
 * real navigation wiring is main.js integration's job, not this phase.
 */
export function createDoorController() {
  return makeController('door:go', (entry) => ({
    roomId: entry.room.id, slot: entry.slot, entry,
  }));
}

/**
 * The hover/activate state machine for "move the camera to a pose"
 * targets (phase 7): a case (books.js's per-case entries — `.pose` is
 * `shelf:<caseId>`) or a table (tables.js/poses.js — `.pose` is
 * `table:<id>`). Unlike createBookController()/createDoorController(),
 * this is meant to be used as ONE shared instance across both kinds,
 * not one per kind: a case entry and a table entry both mean the same
 * thing on activate — "tween the camera to entry.pose" — and the room
 * layout means a case and a table are never both under the pointer at
 * once, so there's no independent-hover-state fact to preserve by
 * splitting them (contrast books vs. doors, which genuinely ARE
 * independent facts about the room — see this file's own comment).
 * Table BOOKS are a different kind, not covered here: clicking a book
 * that happens to sit on a table still opens the panel exactly as on
 * a shelf, via the ordinary createBookController() — this controller
 * only ever fields a table's OWN click target (its top/apron/rails/
 * legs), never the books resting on it. Dispatches `pose:go` on
 * activate, detail `{pose, entry}`.
 */
export function createPoseController() {
  return makeController('pose:go', (entry) => ({ pose: entry.pose, entry }));
}

/**
 * ONE raycaster/pointer-listener set over every kind of clickable
 * thing in the room at once, with nearest-hit arbitration — the
 * shared implementation behind attachPointerPicking() (books) and
 * attachDoorPicking() (doors), and the only implementation phase 7's
 * cases and tables get.
 *
 * Through phase 6, picking was one raycaster PER KIND (attached once
 * for books, once for doors, each over only its own mesh list) —
 * harmless while books and doors never overlapped in screen space, so
 * whichever raycaster's list actually got hit was, in practice, the
 * only one that mattered for a given pointer event. Phase 7 breaks
 * that assumption: a case's own click/hover sensor (books.js's
 * buildCaseGroup()) sits directly BEHIND that same case's books, on
 * purpose, so the shelf is clickable through the gaps between spines.
 * Two independent raycasters over that scene would both fire for one
 * click — the book raycaster hits the book, the case raycaster hits
 * the sensor behind it — opening a book AND flying the camera to the
 * shelf pose from a single click. Querying ONE raycaster against the
 * union of every kind's meshes and taking only the nearest hit fixes
 * that: whichever surface is actually closest to the camera along
 * that ray wins, and every other kind's mesh at that pixel is simply
 * never chosen.
 *
 * @param {object} stage  createStage()'s return value
 * @param {{entries: object[], controller: object}[]} groups  one
 *   entry per kind — e.g. books.js's `.entries` + createBookController(),
 *   doors.js's `.entries` + createDoorController(), books.js's
 *   `.cases[].entry`s + createPoseController(). An entry may own
 *   several meshes (`entry.meshes` — a case is its carcass plus a
 *   sensor, a table is its top/apron/rails/legs) or just one
 *   (`entry.mesh` — a book, a door sensor); both are read.
 * @param {object} [opts]
 * @param {() => void} [opts.onMiss]  called on a click that hits
 *   nothing at all (PLAN.md point 6: "a click on empty floor ... steps
 *   out again") — never called for a click that hits something, even
 *   a mesh whose entry has no resolvable controller.
 * @returns {() => void} detach — removes the listeners this added.
 */
export function attachScenePicking(stage, groups, opts = {}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const canvas = stage.renderer.domElement;

  const meshes = [];
  for (const grp of groups) {
    for (const entry of grp.entries) meshes.push(...(entry.meshes || [entry.mesh]));
  }

  // Which controller a hit entry routes through: its OWN `.controller`
  // if it has one, else the controller of whichever group it came
  // from — the same caller-side `.controller` override convention
  // a11y.js's addEntry() honours (see that file's doc comment), so an
  // entry can live in one group's mesh list yet still answer to a
  // controller that isn't that group's default.
  function ownerOf(entry) {
    if (entry.controller) return entry.controller;
    for (const grp of groups) {
      if (grp.entries.includes(entry)) return grp.controller;
    }
    return null;
  }

  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, stage.camera);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    return hits[0].object.userData.entry || null;
  }

  function onMove(event) {
    const entry = pick(event);
    const owner = entry ? ownerOf(entry) : null;
    // Clear every OTHER controller's hover so a stale highlight can't
    // survive on another kind once the pointer has moved on — the
    // whole reason this is one function instead of N independent
    // ones, each blind to what the others were just hovering.
    for (const grp of groups) {
      if (grp.controller !== owner) grp.controller.hover(null);
    }
    if (owner) owner.hover(entry);
    // The affordance for "this is clickable" — cases and tables are
    // new click targets this phase, on top of books and doors.
    canvas.style.cursor = entry ? 'pointer' : '';
  }
  function onLeave() {
    for (const grp of groups) grp.controller.hover(null);
    canvas.style.cursor = '';
  }
  function onClick(event) {
    const entry = pick(event);
    const owner = entry ? ownerOf(entry) : null;
    if (owner) owner.activate(entry);
    else if (!entry) opts.onMiss?.();
  }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);

  return function detach() {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('click', onClick);
  };
}

/**
 * Mouse/touch raycasting for a room's real book meshes. `entries` is
 * books.js's `buildRoomBooks().entries` (real books only — filler is
 * intentionally excluded, matching the CSS build's
 * `.fill { pointer-events: none }`). A one-group call into
 * attachScenePicking() — see its doc comment for why picking is now a
 * single shared raycaster rather than one per kind.
 * @returns {() => void} detach
 */
export function attachPointerPicking(stage, entries, controller) {
  return attachScenePicking(stage, [{ entries, controller }]);
}

/**
 * Mouse/touch raycasting for a room's doorway sensors. `entries` is
 * doors.js's `buildRoomDoors().entries`. A one-group call into
 * attachScenePicking() — see its doc comment.
 * @returns {() => void} detach
 */
export function attachDoorPicking(stage, entries, controller) {
  return attachScenePicking(stage, [{ entries, controller }]);
}
