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
 * Wires mouse/touch raycasting against a fixed list of meshes to a
 * controller — shared implementation behind attachPointerPicking()
 * (books) and attachDoorPicking() (doors); each call targets only its
 * own entries' meshes, so a book raycast can never pick a door mesh
 * or vice versa.
 *
 * @returns {() => void} detach — removes the listeners this added.
 */
function attachRaycastPicking(stage, entries, controller) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const meshes = entries.map((e) => e.mesh);
  const canvas = stage.renderer.domElement;

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

  function onMove(event) { controller.hover(pick(event)); }
  function onLeave() { controller.hover(null); }
  function onClick(event) {
    const entry = pick(event);
    if (entry) controller.activate(entry);
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
 * `.fill { pointer-events: none }`).
 * @returns {() => void} detach
 */
export function attachPointerPicking(stage, entries, controller) {
  return attachRaycastPicking(stage, entries, controller);
}

/**
 * Mouse/touch raycasting for a room's doorway sensors. `entries` is
 * doors.js's `buildRoomDoors().entries`.
 * @returns {() => void} detach
 */
export function attachDoorPicking(stage, entries, controller) {
  return attachRaycastPicking(stage, entries, controller);
}
