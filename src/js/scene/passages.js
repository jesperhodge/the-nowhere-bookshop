/* ============================================================
   Doorway geometry, shared between books.js (which needs it to
   know how wide a side case can be without overlapping a future
   doorway) and doors.js (which cuts the actual holes).

   DOOR_W/DOOR_H/BAY/doorSlots() are measured facts ported unchanged
   from scene.js -- not re-derived. This module used to be duplicated
   between scene.js and books.js; per HANDOFF-PHASE5's explicit
   request, phase 5's doors are the second consumer, so it is hoisted
   here now and both books.js and doors.js import the ONE copy.

   The coordinate-mapping helpers below (doorLocalXRange,
   doorLocalYRange, doorWorldAnchor) are new this phase -- they turn
   the old CSS-transform-based doorTransform() into the three.js
   equivalent shell.js/doors.js need: a rectangle in the wall SHAPE's
   own local (pre-rotation) coordinates, for cutting a hole, and a
   world-space anchor point, for placing a light/sensor/sign.
   ============================================================ */

import { WORLD } from './coords.js';

export const DOOR_W = 240;
export const DOOR_H = 470;
export const DOOR_ARCH_R = DOOR_W / 2;

/* Side walls: door bays, near (l) to far (r), in world z (unaffected
   by coords.js's y-flip -- x and z carry over unchanged from the CSS
   world). l is always the bay's near edge (closer to z=0, where you
   stand), r the far edge (closer to the back wall, z=-1200).
   |l - r| === DOOR_W for every bay, by construction -- this is what
   makes a single DOOR_ARCH_R work for every bay uniformly. */
export const BAY = [
  { l: -300, r: -540 },
  { l: -580, r: -820 },
  { l: -860, r: -1100 },
];

/** Which door slots a room with `n` non-table children gets, in
 *  shelf/wall order. A single child always gets 'r1' (matches
 *  scene.js's buildRoom() exactly -- not "the first available slot",
 *  a hardcoded choice for the single-door case). */
export function doorSlots(n) {
  if (n <= 0) return [];
  if (n === 1) return ['r1'];
  const order = ['l1', 'r1', 'l2', 'r2', 'l3', 'r3'];
  return order.slice(0, Math.min(n, 6));
}

/** World z-interval for a bay index (0-based). zNear > zFar (both
 *  negative; zNear is closer to the front of the room). */
export function bayZRange(bayIndex) {
  const bay = BAY[bayIndex];
  return { zNear: bay.l, zFar: bay.r };
}

/**
 * The doorway's rectangle in the WALL SHAPE's own local (pre-rotation,
 * pre-translation) coordinates -- see shell.js's buildFace(): the
 * shape is authored with local x as its "width" axis (WORLD.d wide,
 * i.e. the wall-to-wall room depth) and local y as its "height" axis
 * (WORLD.h tall, floor to ceiling), both centred on local (0,0).
 *
 * Derived by hand by composing shell.js's wall placement (translation
 * + rotation.y = ±90°) with scene.js's old doorTransform() /
 * translate3d(∓832, y, bay.l|r) rotateY(±90deg)/, then cross-checked
 * numerically against BAY's own numbers: for every bay this yields a
 * 240-wide local-x span on BOTH walls, exactly matching DOOR_W. Left
 * wall: localX = -WORLD.d/2 - worldZ. Right wall: localX = WORLD.d/2 +
 * worldZ. (Left wall sits at mesh.rotation.y = +90°, which sends
 * local +x to world +z; right wall sits at -90°, which sends local +x
 * to world -z -- see shell.js's buildShell() for the placements this
 * was derived from. If a doorway ever seems to land on the wrong
 * side/bay, or a third wall orientation is added later, re-derive
 * from there rather than trusting this comment -- same caution
 * books.js's buildCaseGroup() gives for its own rotation handedness.)
 */
export function doorLocalXRange(side, bayIndex) {
  const { zNear, zFar } = bayZRange(bayIndex);
  const hw = WORLD.d / 2;
  const a = side === 'l' ? -hw - zNear : hw + zNear;
  const b = side === 'l' ? -hw - zFar : hw + zFar;
  return [Math.min(a, b), Math.max(a, b)];
}

/** Local y-range (shape coords) for the doorway: floor to the apex of
 *  the arch. DOOR_H is the OLD CSS div's total height, top corners
 *  already rounded -- so yTop here is the apex, and doors.js's
 *  doorHolePath() draws straight jambs up to a springline DOOR_ARCH_R
 *  below yTop, then absarc()s the rest of the way to the apex. */
export function doorLocalYRange() {
  const yFloor = -WORLD.h / 2;
  const yTop = yFloor + DOOR_H;
  return [yFloor, yTop];
}

/** World-space anchor for one doorway: the wall's inner (room-facing)
 *  surface x, the bay's z-centre. Floor is y=0 in three.js world
 *  units (coords.js's convention) -- doors.js builds sensor meshes,
 *  the light spill and the hover sign from this. */
export function doorWorldAnchor(side, bayIndex) {
  const { zNear, zFar } = bayZRange(bayIndex);
  return {
    x: side === 'l' ? -WORLD.hw : WORLD.hw,
    z: (zNear + zFar) / 2,
  };
}
