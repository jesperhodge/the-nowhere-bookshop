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

   This phase only covers books (doors and tables don't exist as
   real 3D objects yet — phases 5 and 7). The module is shaped so a
   later phase can append door/table entries to the SAME mirror list
   rather than building a parallel one: mountA11yMirror() takes a
   plain `entries` array and an `ariaLabel`/`activate`/`setHighlight`
   shape per entry (see books.js's `entries`), not anything
   book-specific, and exposes `addEntry()` to append more of them
   in place after doors/tables exist.
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
 * @param {object[]} entries  books.js's `buildRoomBooks().entries` —
 *   each needs `.ariaLabel` and `.setHighlight(bool)`; `.book.id` is
 *   used as the button's `data-book-id` for test/debug hooks.
 * @param {{hover(entry), activate(entry)}} controller  from
 *   interact.js's createBookController() — the one shared path.
 */
export function mountA11yMirror(container, entries, controller) {
  const root = document.createElement('div');
  root.className = 'scene-a11y-mirror';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Books on the shelves in this room');

  const buttons = new Map(); // entry -> button

  function addEntry(entry) {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.cssText = HIDDEN_CSS;
    b.textContent = entry.ariaLabel;
    b.setAttribute('aria-label', entry.ariaLabel);
    if (entry.book) b.dataset.bookId = entry.book.id;
    b.setAttribute('role', 'listitem');

    // Focus moves the camera to it in a later phase (poses don't
    // exist until phase 7 — TODO(phase 7): fly to `shelf:<caseId>`
    // and centre this book here) and highlights it in the scene now.
    b.addEventListener('focus', () => controller.hover(entry));
    b.addEventListener('blur', () => {
      if (controller.hovered === entry) controller.hover(null);
    });

    // A real <button> already turns Enter/Space into a `click` event
    // natively — that's the whole reason this is a <button> and not
    // a <div role="button">. One listener here covers mouse, Enter
    // and Space identically, through the same controller.activate()
    // a raycast pointer-click also calls (interact.js).
    b.addEventListener('click', () => controller.activate(entry));

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
