/* ============================================================
   Pointer raycasting + the one shared "select a book" path.

   Per IMPLEMENTATION.md §4.7: "Pointer input uses raycasting;
   keyboard and AT use the mirror" — but activating a book must do
   the SAME thing regardless of which input found it, or behaviour
   drifts between mouse and keyboard over time. `createBookController()`
   is that one path: both attachPointerPicking() (below) and
   a11y.js's mirror buttons call controller.hover()/controller.activate()
   — neither one implements its own version of "what happens when a
   book is selected."
   ============================================================ */

import * as THREE from 'three';

/**
 * The shared hover/activate state machine. One instance per room.
 * `entry.setHighlight(bool)` (see books.js) does the actual visual
 * work (lift + tilt + emissive); this module only ever decides WHEN
 * to call it, from either input source, through the same two
 * methods.
 */
export function createBookController() {
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
      window.dispatchEvent(new CustomEvent('book:open', {
        detail: { id: entry.book.id, title: entry.book.title, author: entry.book.author, entry },
      }));
    }
  }

  /** Subscribe to activation (click, or Enter/Space on the a11y mirror).
   *  Actual "open the book panel" UI wiring happens at main.js
   *  integration time (not this phase) — for now this is a
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
 * Wires mouse/touch raycasting against a room's real book meshes to
 * a controller. `entries` is books.js's `buildRoomBooks().entries`
 * (real books only — filler is intentionally excluded, matching the
 * CSS build's `.fill { pointer-events: none }`).
 *
 * @returns {() => void} detach — removes the listeners this added.
 */
export function attachPointerPicking(stage, entries, controller) {
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
