/* ============================================================
   Coordinates — the one place the CSS world becomes the three.js
   world.

   The CSS world (all of src/js/data/rooms.js, and scene.js's SLOT
   table) is y-DOWN: y=-470 is the ceiling, y=+470 is the floor.
   three.js is y-UP. Everything else (x, z, and their extents)
   carries over unchanged — only y flips, and it flips through
   exactly this one function. See IMPLEMENTATION.md §4.1.

   threeY = 470 - cssY        // ceiling -470 -> 940, floor 470 -> 0
   ============================================================ */

export function toThreeY(cssY) {
  return 470 - cssY;
}

/* World box, already in three.js (y-up) units. Same x/z extents as the
   CSS WORLD in scene.js; y re-derived through toThreeY (floor 0, ceiling
   940, matching WORLD.h there). */
export const WORLD = { w: 1680, h: 940, d: 1200, hw: 840, hh: 470 };

/* ── SLOT — rewritten directly in the new convention, not wrapped ──

   Each entry in the old (scene.js) SLOT table returned a CSS-world
   anchor {x, y, z} for a prop, where y was the anchor's TOP edge and
   the prop's own height (h) grew downward (toward the floor, +y) from
   there.

   Rewritten here: y is still the anchor edge nearest the ceiling, and
   the prop still grows *toward the floor* from it — but "toward the
   floor" is now -y, since floor = 0 and ceiling = 940. Concretely,
   threeY(oldY) is affine (threeY = 470 - y), so threeY(oldTop) and
   threeY(oldTop + h) differ by exactly h in the other direction:

     threeY(oldTop + h) = 470 - oldTop - h = threeY(oldTop) - h

   which is exactly the "subtract h to reach the floor-ward edge" rule
   used below. Each constant was substituted by hand from scene.js's
   SLOT table (old value -> 470 - old value), not computed at runtime,
   per IMPLEMENTATION.md §4.1 ("do not adapt it").

   Only 'hang' / 'hang-l' / 'hang-r' are consumed this phase (lamp
   point-light placement in stage.js). The rest is here now, ported
   once and correctly, so phase 6 (props as textures) doesn't have to
   re-derive it. */
export const SLOT = {
  hang:      (w, h) => ({ x: -w / 2 - 30, y: 940, z: -640 }),
  'hang-l':  (w) => ({ x: -420 - w / 2, y: 940, z: -520 }),
  'hang-r':  (w) => ({ x: 380 - w / 2, y: 940, z: -800 }),
  above:     (w) => ({ x: -w / 2, y: 926, z: -1186 }),
  'back-l':  (w, h) => ({ x: -836, y: 40 + h, z: -1186 }),
  'back-r':  (w, h) => ({ x: 836 - w, y: 40 + h, z: -1186 }),
  'back-l-hi': (w) => ({ x: -826, y: 906, z: -1186 }),
  'back-r-hi': (w) => ({ x: 826 - w, y: 906, z: -1186 }),
  'floor-l':  (w, h) => ({ x: -790, y: h, z: -430 }),
  'floor-r':  (w, h) => ({ x: 790 - w, y: h, z: -430 }),
  'floor-ml': (w, h) => ({ x: -716, y: h, z: -720 }),
  'floor-mr': (w, h) => ({ x: 716 - w, y: h, z: -720 }),
  'floor-c':  (w, h) => ({ x: -w / 2 + 190, y: h, z: -260 }),
  'floor-cl': (w, h) => ({ x: -w / 2 - 210, y: h, z: -260 }),
  'tall-l':   () => ({ x: -846, y: 940, z: -860 }),
  'tall-r':   (w) => ({ x: 846 - w, y: 940, z: -860 }),
  ceil:       (w) => ({ x: -w / 2, y: 660, z: -830 }),
  rug:        (w) => ({ x: -w / 2, y: 0, z: -560 }),
};

/* Resolve a room.props entry to a three.js-world anchor point, honouring
   its dx/dy/dz offset. IMPORTANT: dy in rooms.js is still authored in the
   OLD (css, positive-is-downward) convention -- about fifteen entries use
   it (grep `dy:` in rooms.js). Negate it here, once, rather than at each
   call site. */
export function placeProp(p) {
  const f = SLOT[p.at] || SLOT['floor-ml'];
  const c = f(p.w || 200, p.h || 200);
  return {
    x: c.x + (p.dx || 0),
    y: c.y - (p.dy || 0),   // negated: old dy grew downward, new -y does
    z: c.z + (p.dz || 0),
  };
}

/* Every SLOT anchor (except 'rug', which is laid flat and handled on its
   own) is the prop's box TOP-LEFT-of-front corner: x grows right by w,
   y shrinks toward the floor by h from there (see the SLOT comment
   above). That box-center formula is shared by two independent callers
   this phase — stage.js's buildRoomLights() (the point light + glow
   bulb) and props.js's lamp fixture geometry (shade + cord) — and per
   HANDOFF-PHASE6's explicit warning ("make sure your lamp prop geometry
   lines up with that light position exactly ... don't recompute it
   independently and risk drift"), both now call this ONE function
   rather than each inlining the same arithmetic. Bulb position matches
   scene.css's `.prop-lamp .bulb { bottom:-14px }` (14 units below the
   shade's bottom edge, centered horizontally). */
export function lampAnchor(p) {
  const anchor = placeProp(p);
  const w = p.w || 200, h = p.h || 200;
  return {
    x: anchor.x + w / 2,
    y: anchor.y - h - 14,
    z: anchor.z,
    shadeTop: anchor.y,
    shadeBottom: anchor.y - h,
    w, h,
  };
}

/* Where a skylight's pane actually ends up, and therefore where the
   light coming through it is. Same one-source-of-truth rule as
   lampAnchor(): props.js's buildSkylight() places the pane from this,
   and stage.js's buildRoomLights() hangs the light from it, so the
   opening and the light coming through it cannot drift apart.

   Phase 10 found out why that matters. Three rooms — attic, rafters,
   foreignwindow — have a skylight and NO lamp, and through phases 3-9
   only lamps made light. Those three therefore rendered essentially
   black (measured: rafters mean luminance 1.3/255, foreignwindow 0.7)
   and nobody saw it, because the preview harness was only ever eyeballed
   in rooms that have a lamp. A hole in the ceiling is a light source.

   `p.h` is the pane's depth in z (it lies flat), not a height, so the
   pane's own placement uses anchor.x + w/2 and anchor.z unchanged —
   matching buildSkylight() exactly. */
export function skylightAnchor(p) {
  const anchor = placeProp(p);
  const w = p.w || 200, h = p.h || 200;
  return {
    x: anchor.x + w / 2,
    y: Math.min(anchor.y, WORLD.h - 4),
    z: anchor.z,
    w, h,
  };
}

/* Box-center helper for the generic "vertical billboard" prop case
   (everything props.js draws except 'rug', which lies flat on the
   floor and is positioned directly from placeProp() + w/h instead). */
export function propBoxCenter(p) {
  const anchor = placeProp(p);
  const w = p.w || 200, h = p.h || 200;
  return {
    x: anchor.x + w / 2,
    y: anchor.y - h / 2,
    z: anchor.z,
    bottomY: anchor.y - h,
    topY: anchor.y,
    w, h,
  };
}
