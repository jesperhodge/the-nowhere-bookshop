/* ============================================================
   The accessibility mirror.

   Per IMPLEMENTATION.md §4.7 (not optional) / PLAN-ARCH.md
   "Accessibility": a canvas has no default accessibility, so this
   module maintains a visually-hidden but focusable DOM list
   mirroring the room — one real <button> per book, in shelf order,
   carrying the exact aria-label scene.js's buildBook() already
   generates. Pointer input rays into the scene (interact.js);
   keyboard and assistive tech use this mirror instead. Both funnel
   through the SAME controller.hover()/controller.activate() calls
   (see interact.js) so a book can't behave differently depending on
   which input found it.

   Phase 4 covered only books. Phase 5 (doors) appends to the SAME
   mirror list via addEntry() rather than building a parallel one, per
   this module's original design — but books and doors want DIFFERENT
   activate() behaviour (book:open vs. door:go), and mountA11yMirror()
   only takes one `controller` at mount time. Rather than teach ONE
   controller to branch on entry shape, each entry may carry its OWN
   `.controller` (see interact.js: createBookController() /
   createDoorController() are separate instances) — addEntry() prefers
   `entry.controller` and falls back to the mirror's default `controller`
   when absent, so book entries (no `.controller` field) are completely
   unaffected and doors just supply their own. `entries`/`addEntry()`
   still take a plain `ariaLabel`/`setHighlight` shape otherwise,
   nothing book- or door-specific.
   ============================================================ */

/* visually hidden, not display:none — screen readers and Tab order
   must still reach it. Standard "clip" pattern, not opacity/visibility
   (which several ATs also skip). No `filter`/`backdrop-filter` here on
   purpose: IMPLEMENTATION.md's inherited trap list calls those out as
   grouping properties that break transform-style elsewhere in this
   codebase — this element has no 3D transform to break, but the habit
   of never reaching for them near the scene is worth keeping. */
const HIDDEN_CSS = [
  'position:absolute',
  'width:1px', 'height:1px',
  'margin:-1px', 'padding:0', 'border:0',
  'overflow:hidden',
  'clip:rect(0 0 0 0)', 'clip-path:inset(50%)',
  'white-space:nowrap',
].join(';');

/**
 * @param {HTMLElement} container  where the mirror's root is appended
 *   (a plain div; the harness/eventual main.js decides layout)
 * @param {object[]} entries  books.js's `buildRoomBooks().entries`
 *   and/or doors.js's `buildRoomDoors().entries` — each needs
 *   `.ariaLabel` and `.setHighlight(bool)`; `.book.id`/`.room.id` are
 *   used as `data-book-id`/`data-room-id` for test/debug hooks; an
 *   optional `.controller` overrides which controller this entry's
 *   button routes hover/activate through (see the file's doc comment).
 * @param {{hover(entry), activate(entry)}} controller  from
 *   interact.js's createBookController()/createDoorController() — the
 *   DEFAULT controller, used by any entry that doesn't supply its own.
 * @param {object} [opts]
 * @param {(entry) => void} [opts.onFocus]  called right after
 *   `ctl.hover(entry)` whenever a mirror button gains focus (Tab, or
 *   an AT's virtual cursor) — the caller's hook for "fly the camera to
 *   this thing" (phase 7; see the focus listener below for why that
 *   logic doesn't live in this file). Honoured identically by
 *   addEntry() for entries added later, since doors/cases/tables are
 *   all added after mount, not passed into the initial `entries`.
 */
export function mountA11yMirror(container, entries, controller, opts = {}) {
  const root = document.createElement('div');
  root.className = 'scene-a11y-mirror';
  root.setAttribute('role', 'list');
  // "Books" in phase 4; phase 5 appends doorways to this same list
  // (see the file's doc comment) so the label now covers both.
  root.setAttribute('aria-label', 'Books and doorways in this room');

  const buttons = new Map(); // entry -> button

  function addEntry(entry) {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.cssText = HIDDEN_CSS;
    b.textContent = entry.ariaLabel;
    b.setAttribute('aria-label', entry.ariaLabel);
    if (entry.book) b.dataset.bookId = entry.book.id;
    if (entry.room) b.dataset.roomId = entry.room.id;
    b.setAttribute('role', 'listitem');

    // Route through this entry's OWN controller if it has one (doors
    // do — see the file's doc comment), else the mirror's default
    // (what every book entry uses, unchanged from phase 4).
    const ctl = entry.controller || controller;

    // Focus highlights the entry in the scene (unchanged since phase
    // 4) and, if the caller supplied one, flies the camera to it via
    // opts.onFocus(entry) — wired by whoever mounts the mirror
    // (main.js / tools/preview-stage.html) through interact.js's
    // createPoseController() and entry.pose (`shelf:<caseId>` for a
    // case, `table:<id>` for a table). This module still knows
    // nothing about cameras or poses — per IMPLEMENTATION.md §4.7,
    // a11y.js is the keyboard/AT input path, not a camera controller
    // — it only ever calls a callback the caller handed it.
    b.addEventListener('focus', () => {
      ctl.hover(entry);
      opts.onFocus?.(entry);
    });
    b.addEventListener('blur', () => {
      if (ctl.hovered === entry) ctl.hover(null);
    });

    // A real <button> already turns Enter/Space into a `click` event
    // natively — that's the whole reason this is a <button> and not
    // a <div role="button">. One listener here covers mouse, Enter
    // and Space identically, through the same ctl.activate() a
    // raycast pointer-click also calls (interact.js).
    b.addEventListener('click', () => ctl.activate(entry));

    root.appendChild(b);
    buttons.set(entry, b);
    return b;
  }

  for (const entry of entries) addEntry(entry);
  container.appendChild(root);

  return {
    root,
    buttons,
    addEntry,
    dispose() { root.remove(); },
  };
}
