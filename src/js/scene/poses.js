/* ============================================================
   Camera poses — a rig with named poses, tweened.

   Per IMPLEMENTATION.md §4.3 / PLAN-ARCH.md "Camera poses — points 6,
   8 and 10": three named kinds of camera state —

   - `room`             the default §4.2 framing. MUST be identical to
                         what stage.js's makeCamera() produces — see
                         roomPose() below, which imports CAMERA from
                         stage.js rather than retyping its numbers. A
                         drifted default pose would silently invalidate
                         every screenshot comparison against phases 3-6.
   - `shelf:<caseId>`   square-on to a case (back/left/right), close
                         enough that a 22px spine reads — point 8's
                         actual complaint was never a font-size
                         problem, it was a camera-distance problem.
                         "Square-on" gives way to a small turn where
                         the room's own furniture leaves no floor to
                         stand on — see CLEARANCE below.
   - `table:<id>`       looking down at a table — point 10's bird's-eye
                         view, now a real camera pose instead of a DOM
                         overlay pretending to be a room.

   Poses are TRANSIENT UI state, not navigation: no route change, no
   `history` entry (§4.3 says so explicitly) — the room stays mounted;
   goTo()/back()/dolly() only ever move camera.position/lookAt. The
   stack goTo() pushes onto (see STACK / ESCAPE below) is deliberately
   NOT `history` — it exists purely so Escape can undo a pose change,
   capped and forgotten, never a browser-visible thing.

   CAMERA MODEL — one lerp, two drivers, not two animation systems.
   Every frame (goTo()/back(), driven by stage.onFrame()) or every
   input event (dolly(), driven by wheel/pinch) computes:

     camera.position.lerpVectors(from.position, to.position, e)
     camera.lookAt(lerp(from.target, to.target, e))

   where `e = ease(t)` for a tween (t advances with wall-clock time) or
   `e = t` directly for a dolly (t is driven straight from input, no
   time dimension at all). Both paths read the SAME from/to/t state
   through the SAME applyPose() below — giving dolly its own small
   state machine "since it isn't really a tween" was the tempting
   move and the one to avoid: a second animation path is a second
   place for from/to/t to drift out of sync with what's actually on
   screen, which is exactly the class of bug stage.js's own onFrame()
   doc comment warns about for a second requestAnimationFrame loop.

   Three.js's PerspectiveCamera does not remember what it last looked
   at (there is no `camera.target`) — this file tracks that itself
   (`liveTarget`, updated by every applyPose() call) so that a goTo()
   fired mid-dolly, or mid-tween, can read "where the camera is
   actually looking right now" as its new `from`, rather than
   re-deriving or guessing it and snapping continuity on interrupt.
   ============================================================ */

import * as THREE from 'three';
import { WORLD } from './coords.js';
import { CAMERA } from './stage.js';

const TWEEN_MS = 700;
const STACK_CAP = 8; // goTo()'s undo stack — see STACK / ESCAPE below

// table:<id>'s "looking straight down, but not quite" deviation — see
// tablePoseFor()'s own doc comment for why 14 degrees off vertical is
// deliberate, not a rounding artifact.
const TABLE_TILT_RAD = THREE.MathUtils.degToRad(14);

/* ── shelf-pose clearance ────────────────────────────────────────
   A shelf pose's distance is derived from its case's own HEIGHT
   (`(ch/2 + 30) / tan(fov/2)` ≈ 947 for the standard 530-tall case),
   which takes no notice of whether the room is big enough to stand
   that far back. It is not: the room is 1680 wide, so a side case's
   square-on camera lands at x ≈ ∓271 — past room centre — and the
   back case fills x -604…604 at z -1214…-1000. In the 9 rooms whose
   side case is pushed deep by two door bays (z-centre exactly -1019,
   `used === 2` in books.js's sideCaseSpec()), that put the camera
   INSIDE the back case: 14 poses over the 50 rooms, measured with
   Box3.containsPoint(). The screenshot was a wall of shelf boards
   seen edge-on.

   This is the same "two now-real pieces of geometry collide" fix
   phases 5 and 6 each had to make, and it is resolved the same way:
   check against the room's OWN geometry rather than against an
   idealised room box.

   WHAT IS GIVEN UP, and why it is yaw and not distance. The obvious
   clamp — shorten `dist` until the camera is clear — collapses here:
   the gap between the back case's side panel (x 604) and a side
   case's face (x 670) is 66 units, so "back off along the normal
   until clear" leaves the camera 66 units from a 342-wide case. It
   is not a distance problem, it is that there is no free floor
   square-on to a case whose centre is deeper than the back case's
   front face. So the pose keeps its distance (the thing point 8 is
   actually about — a 22-unit spine has to subtend ~35 screen px) and
   gives up being exactly square-on, turning about world +Y until the
   camera reaches free floor AND has an unobstructed centre sight line
   to the case (isClear() below — the second half is what makes this a
   picture and not just a legal camera position; see its own comment).
   PLAN.md point 6 sanctions the turn directly: "Side-wall poses turn
   ~70-80° so the run is seen face-on", i.e. off square, not at 90°.

   Measured over all 50 rooms, 139 shelf poses: 125 land at 0° (i.e.
   unchanged), 13 at 24°, 1 at 45° — exactly the 14 that were broken,
   and nothing else. Distance is unchanged in every one; DIST_SCALES
   below is a fallback that never fires against the current data.
   ============================================================ */
const YAW_AXIS = new THREE.Vector3(0, 1, 0);
/* Tried in order, smallest turn first. Coarse on purpose: a 4°
   search would find 4° instead of 8° for the affected rooms and buy
   nothing visible, at 2x the candidates per goTo(). */
const YAW_STEPS_DEG = [0, 8, 16, 24, 32, 45, 60];
/* Only reached if turning cannot find free floor at full distance —
   never, for the 50 rooms as they stand (verified). Kept because the
   alternative when it does happen is a camera inside the furniture. */
const DIST_SCALES = [1, 0.78, 0.6, 0.45];
/* How far outside an obstacle's own Box3 the camera must sit. Not
   just "outside": a camera flush against the back case's side panel
   renders its inside faces across half the frame. */
const CLEAR_PAD = 40;

/* ── the table blind spot (phase 7's carried-forward item) ───────
   In the 3 rooms with a table, the table stands between the shelf:back
   camera and the bottom row of the back case. Camera at z -58.5, table
   spanning z -630…-330 at x -535…-65, case face at z -960: the sight line
   to a bottom-left book crosses the table's near edge at y 221, which is
   under a 232-tall table top. Phase 7 left it because every occluded
   spine was filler. Phase 9 is what makes them real books that cannot be
   seen, and phase 7 was right that the answer is a design call and not a
   clamp.

   Worked through, three of the four obvious moves are dead ends:

     move the table sideways   the sight cone is ±178 wide at the table's
                               near edge and ±374 at its far edge, so the
                               table would have to sit beyond x -374 — and
                               the 470-wide table does not fit in the 296
                               units left between there and the side case.
     move the table forward    the far edge would have to reach z -176 for
                               a level sight line to clear it, which is
                               outside the room.
     stand past the table      a camera at z < -330 is 630 from the case
                               face and frames 162 of its 530 height.

   What is left is to look OVER it: raise the camera and tilt down. At
   y 610 the sight line to the base of a bottom-row book stays above the
   table top until z -694, past the table's far edge, and the case still
   fits the frame (300 units of half-height covered against the 295 the
   pose asks for). So LIFTS below, tried after the square-on position and
   before any turn, because a lifted camera is still square-on in x —
   a gentler thing to give up than the framing. Zero first, so every pose
   that already worked is untouched.

   The extra check that makes the search bother is isClear()'s third test:
   the two lower corners of the case's bottom row, tested against tables
   ONLY. Testing the bottom corners against every obstacle
   is what phase 7 rejected — it would push the camera 280 units from a
   1180-wide case for the sake of a case corner grazing an oblique view.
   Tables are the narrow case where the obstruction is real, in front, and
   hides content rather than framing. */
const LIFTS = [0, 130, 240, 345];
/* Keep the camera off the walls, floor and ceiling too — this is
   what makes PLAN-PHASE7 §4 step 4's "the camera stays inside the
   room box" a structural property of the pose rather than a lucky
   consequence of the numbers. The room's z=0 face is open (the
   viewer's side), so only its far edge needs the margin. */
const ROOM_MARGIN = 40;

/* Cubic-in-out, the brief's own formula — symmetric, ease(0)=0 and
   ease(1)=1 exactly, which is why goTo()/moveTo() can call
   applyPose(ease(t)) uniformly for both a running tween (0<t<1) and an
   instant/reduced-motion jump (t snapped straight to 0 or 1) without a
   special case for the jump: ease(0) and ease(1) already are 0 and 1. */
function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* The `room` pose — a pure function of stage.js's own CAMERA constant,
   never retyped. Matches makeCamera() exactly: position (0, WORLD.h/2,
   CAMERA.eyeZ), lookAt (0, CAMERA.lookY, CAMERA.lookZ). Returns fresh
   Vector3s every call (poseFor() promises "computed fresh" for every
   pose, room included, and a caller may safely mutate what it gets
   back). */
function roomPose() {
  return {
    position: new THREE.Vector3(0, WORLD.h / 2, CAMERA.eyeZ),
    target: new THREE.Vector3(0, CAMERA.lookY, CAMERA.lookZ),
  };
}

/**
 * @param {object} stage  createStage()'s return value (stage.js) —
 *   needs `.camera` (read live: `.fov` is constant but `.aspect`
 *   changes on resize, and shelf/table poses must pick that up at
 *   goTo() time, not at construction time).
 * @param {object} [opts]
 * @param {object[]} [opts.cases]   books.js's buildRoomBooks().cases —
 *   `{id, group, w, ch, depth}` per case actually built (may be []).
 * @param {object[]} [opts.tables]  `[{id, surface, group?}]` from
 *   tables.js's buildRoomTable() — `surface` is `{center, w, d}` (may
 *   be []). `group` is optional and used only as a clearance obstacle
 *   for shelf poses; when absent, a box is derived from `surface`
 *   instead (see tableObstacleBox()).
 * @param {boolean} [opts.reducedMotion]  overrides the
 *   `prefers-reduced-motion` media query (tests/harness); when true,
 *   every goTo() jumps instead of tweening.
 * @returns the rig — see this file's own header for the full surface
 *   (`goTo`/`back`/`dolly`/`focusEntry`/`update`/`poseNames`/`poseFor`/
 *   `current`/`tweening`/`t`).
 */
export function createPoseRig(stage, opts = {}) {
  const camera = stage.camera;
  const cases = opts.cases || [];
  const tables = opts.tables || [];
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const tableById = new Map(tables.map((tb) => [tb.id, tb]));

  const reducedMotion = opts.reducedMotion ?? (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  // ── state ── `from`/`to`/`t`/`mode` are the ENTIRE animation state,
  // per the "one lerp, two drivers" model above. `toName` is the pose
  // name `to` was built from (kept alongside `to` itself, not
  // re-derived, since a shelf/table pose object carries no name of its
  // own once computed). Construction assumes the camera is ALREADY at
  // the room pose (true for every caller: stage.js's makeCamera() sets
  // exactly that) — the rig only tracks state here, it does not move
  // the camera on construction.
  let mode = 'tween';
  let toName = 'room';
  let from = roomPose();
  let to = roomPose();
  let t = 1;
  let tweenStart = performance.now();
  let tweenDuration = 0;
  let liveTarget = to.target.clone();
  const stack = [];

  /* ── pose lookup, computed fresh every call (never cached) so a
     window resize since the last goTo() is picked up — see this
     function's own doc comment on `stage`. ── */
  function poseFor(name) {
    if (name === 'room') return roomPose();
    if (name.startsWith('shelf:')) {
      const c = caseById.get(name.slice('shelf:'.length));
      return c ? shelfPoseFor(c) : null;
    }
    if (name.startsWith('table:')) {
      const tb = tableById.get(name.slice('table:'.length));
      return tb ? tablePoseFor(tb) : null;
    }
    return null; // includes 'dolly' — a `current` mode indicator, never a real pose name
  }

  /**
   * Square-on to case `c`, ~2.9x closer than the room pose for the
   * standard 530-tall case (lands the case's face's own camera-facing
   * plane at a distance where a 22-unit spine subtends ≈35 screen px
   * at a 900px-tall viewport — PLAN.md point 8's actual requirement).
   *
   * The outward normal is derived from the case GROUP's own world
   * matrix (localToWorld of two points on its own local +z axis,
   * differenced and normalized) rather than worked out by hand from
   * the case's rotY. This repo has already re-derived the side walls'
   * rotation handedness twice — books.js's buildCaseGroup() comment
   * and passages.js's doorLocalXRange() comment both record having to
   * work it out from scratch — so letting three.js's own matrix math
   * answer "which way is out of this case" makes it structurally
   * impossible to get wrong a third time, for back OR either side
   * wall, with no per-wall special case here at all.
   *
   * The camera is then turned about world +Y — as little as possible,
   * and not at all for 125 of the 139 poses across the 50 rooms —
   * until it stands on free floor with a clear view. See the CLEARANCE
   * block at the top of this file: without it, 14 side-shelf poses
   * across 9 rooms put the camera inside the back case's own volume.
   */
  function shelfPoseFor(c) {
    // localToWorld MUTATES its argument — every call below gets its
    // own fresh Vector3, never a reused/shared one.
    c.group.updateWorldMatrix(true, false);
    const face = c.group.localToWorld(new THREE.Vector3(c.w / 2, c.ch / 2, c.depth));
    const normal = c.group
      .localToWorld(new THREE.Vector3(c.w / 2, c.ch / 2, c.depth + 1))
      .sub(face)
      .normalize();
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const want = Math.max((c.ch / 2 + 30) / Math.tan(fovRad / 2), 420);

    // The two lower corners of the case's bottom row, in world space.
    // These are the points a table hides, and the reason for LIFTS.
    const bottom = [
      c.group.localToWorld(new THREE.Vector3(30, 20, c.depth)),
      c.group.localToWorld(new THREE.Vector3(c.w - 30, 20, c.depth)),
    ];

    // Search order: keep the framing, turn as little as possible; only
    // give up framing if turning never finds free floor (see the
    // CLEARANCE block at the top of this file for why that ordering,
    // and why turning is the thing to spend first).
    //
    // Lift is the INNER loop, so every lift is tried at a given yaw
    // before the yaw widens. Measured with it the other way round: the
    // three table rooms found a clear camera at 60° of yaw, x +666,
    // almost against the right wall — legal, unblocked, and a much
    // worse picture than standing square-on and looking down. Lift 0
    // is first at every yaw, so nothing that already worked moves.
    let fallback = null;
    for (const scale of DIST_SCALES) {
      const dist = want * scale;
      for (const yawDeg of YAW_STEPS_DEG) {
        const yaw = THREE.MathUtils.degToRad(yawDeg);
        // Built once per yaw, not once per lift: dolly() calls this on every
        // wheel event, and the lift loop would otherwise rebuild the same
        // two vectors four times over. Each lift CLONES rather than adding
        // to the base — raising the shared vector in place would stack the
        // lifts on top of each other.
        const bases = (yawDeg === 0 ? [0] : [yaw, -yaw]).map((a) =>
          face.clone().addScaledVector(normal.clone().applyAxisAngle(YAW_AXIS, a), dist));
        // Prefer whichever of the two turn directions lands nearer the
        // room's OPEN front (larger z). Not a heuristic about this
        // particular room: the back case fills the far wall and both
        // side cases fill the side walls, so in this room shape the
        // free floor a blocked pose needs is always forward.
        bases.sort((a, b) => b.z - a.z);
        for (const lift of LIFTS) {
          for (const base of bases) {
            const p = lift ? base.clone().setY(base.y + lift) : base;
            // The very first candidate (scale 1, yaw 0, lift 0) is
            // exactly the pre-clearance pose — so if the search finds
            // nothing, the rig degrades to phase 7's original behaviour
            // rather than to something new and unexamined.
            if (!fallback) fallback = p;
            if (isClear(p, c, face, bottom)) return { position: p, target: face };
          }
        }
      }
    }
    return { position: fallback, target: face };
  }

  /* Obstacle boxes for the clearance search: every case, plus every
     table. Built once and cached — case and table geometry never
     moves after buildRoomBooks()/buildRoomTable() return, and
     Box3.setFromObject() on a case walks all ~40-80 of its book
     meshes, which dolly() (one wheel event = one nearestShelfPose() =
     one shelfPoseFor() per case) cannot afford to redo at 60Hz. The
     one thing in these groups that DOES move is a table book's +8
     hover lift, two orders of magnitude below CLEAR_PAD. */
  let obstacleCache = null;
  function obstacles() {
    if (obstacleCache) return obstacleCache;
    obstacleCache = [];
    for (const c of cases) {
      c.group.updateWorldMatrix(true, true);
      obstacleCache.push({ owner: c, box: new THREE.Box3().setFromObject(c.group) });
    }
    for (const tb of tables) obstacleCache.push({ owner: tb, box: tableObstacleBox(tb), isTable: true });
    return obstacleCache;
  }

  /* A table's obstacle box. Prefers the real group (tables.js's
     buildRoomTable().group) when the caller supplied one; otherwise
     derives one from `surface`, which carries the top's centre and
     footprint but not its height — hence floor-to-top plus headroom
     for the books lying on it. */
  function tableObstacleBox(tb) {
    if (tb.group) {
      tb.group.updateWorldMatrix(true, true);
      return new THREE.Box3().setFromObject(tb.group);
    }
    const { center, w, d } = tb.surface;
    return new THREE.Box3(
      new THREE.Vector3(center.x - w / 2, 0, center.z - d / 2),
      new THREE.Vector3(center.x + w / 2, center.y + 60, center.z + d / 2),
    );
  }

  /* Slab method, clipped to the segment a->b. Standard, and the same
     arithmetic THREE.Ray#intersectBox uses — done by hand here only
     because Ray has no "and stop at this length" form that also
     answers "does it hit at all" without allocating. */
  const AXES = ['x', 'y', 'z'];
  function segmentHitsBox(a, b, box) {
    let tmin = 0, tmax = 1;
    for (const ax of AXES) {
      const o = a[ax], d = b[ax] - o;
      const lo = box.min[ax], hi = box.max[ax];
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
    return true;
  }

  const padded = new THREE.Box3();
  /**
   * Can the camera actually stand at `pos` and see case `ownCase`?
   * Two separate questions, deliberately with two different margins:
   *
   * 1. `pos` is free floor — inside the room, and outside every other
   *    obstacle's box PADDED by CLEAR_PAD (not merely outside it: a
   *    camera flush against the back case's side panel renders its
   *    inside faces across half the frame).
   * 2. Nothing stands between `pos` and `target`. Checked against the
   *    UNPADDED boxes — a sight line that grazes a case's corner is
   *    fine, a sight line that goes through it is not, and padding
   *    here would reject perfectly good views for the sake of a few
   *    units of nothing.
   *
   * (2) is what the first version of this fix was missing. Getting the
   * camera out of the back case's volume is not the same as getting
   * the back case out of the way: at 8° off square-on, `front`'s
   * shelf:right camera stood clear at x -262 and then looked straight
   * along the back case's front face, which filled the left half of
   * the frame. Only the centre sight line is checked, not the whole
   * case — see this file's CLEARANCE block for what that still leaves.
   */
  function isClear(pos, ownCase, target, bottom) {
    if (pos.x < -WORLD.hw + ROOM_MARGIN || pos.x > WORLD.hw - ROOM_MARGIN) return false;
    if (pos.z < -WORLD.d + ROOM_MARGIN || pos.z > 0) return false;
    if (pos.y < ROOM_MARGIN || pos.y > WORLD.h - ROOM_MARGIN) return false;
    for (const ob of obstacles()) {
      if (ob.owner === ownCase) continue;
      padded.copy(ob.box).expandByScalar(CLEAR_PAD);
      if (padded.containsPoint(pos)) return false;
      if (segmentHitsBox(pos, target, ob.box)) return false;
      /* (3) The bottom row, against TABLES only. Deliberately narrower
         than (2) — see the table blind spot block for why every other
         obstacle is left out of this one. */
      if (bottom && ob.isTable) {
        for (const b of bottom) if (segmentHitsBox(pos, b, ob.box)) return false;
      }
    }
    return true;
  }

  /**
   * Looking down at table `tb.surface` — but 14° off vertical, ON
   * PURPOSE, not "looking straight down" as §4.3's prose literally
   * says. A camera looking straight along -y with the default
   * `up = (0,1,0)` gives THREE.Camera#lookAt a degenerate basis (the
   * look direction and `up` become parallel, so the resulting
   * orientation is undefined/unstable) — the fix would be rotating
   * `camera.up` itself, which would then ALSO need to be interpolated
   * through every tween that ends or starts at a table pose, doubling
   * what applyPose() has to lerp. 14° keeps `up` valid throughout and
   * still reads as "looking down at the table" — a deliberate, named
   * deviation from a literal reading of the brief, not an oversight.
   */
  function tablePoseFor(tb) {
    const { center, w, d } = tb.surface;
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const vt = Math.tan(fovRad / 2);
    const ht = vt * camera.aspect;
    let dist = Math.max(d / 2 / vt, w / 2 / ht) * 1.12;
    const cosA = Math.cos(TABLE_TILT_RAD), sinA = Math.sin(TABLE_TILT_RAD);
    // Clamp the camera below the true ceiling (WORLD.h), 40 units of
    // margin — shrinking `dist` (not just clamping y alone, which
    // would silently pull the camera off the 14° line and closer to
    // looking straight down again) so the pose stays on that line.
    const maxY = WORLD.h - 40;
    if (center.y + dist * cosA > maxY) dist = (maxY - center.y) / cosA;
    return {
      position: new THREE.Vector3(center.x, center.y + dist * cosA, center.z + dist * sinA),
      target: center.clone(),
    };
  }

  /* The camera's own current position (three.js tracks this for real)
     plus this rig's own tracked look target (three.js does not) — the
     `from` a fresh goTo()/dolly() needs, whatever was happening a
     moment ago (idle, mid-tween, or mid-dolly). */
  function currentState() {
    return { position: camera.position.clone(), target: liveTarget.clone() };
  }

  function applyPose(e) {
    camera.position.lerpVectors(from.position, to.position, e);
    liveTarget.lerpVectors(from.target, to.target, e);
    camera.lookAt(liveTarget);
  }

  /* `current`'s definition, shared between the public getter and
     goTo()'s own stack bookkeeping (see goTo(): it must never push the
     literal string 'dolly' onto the undo stack — see there for why). */
  function currentName() {
    if (mode === 'dolly') {
      if (t <= 0) return 'room';
      if (t >= 1) return toName;
      return 'dolly';
    }
    return toName;
  }

  /* The shared tween/jump entry point behind goTo() and back() — does
     NOT touch the undo stack (goTo() does that; back() must not, or
     every Escape would push a new entry it immediately has to pop). */
  function moveTo(name, { instant = false } = {}) {
    const pose = poseFor(name);
    if (!pose) return false;
    from = currentState();
    to = pose;
    toName = name;
    mode = 'tween';
    tweenStart = performance.now();
    // Reduced motion (or an explicit `instant` request, e.g. the
    // harness's `?pose=` startup param) jumps SYNCHRONOUSLY, right
    // here, rather than setting duration=0 and waiting for the next
    // update() tick to notice. The alternative — t=1 now, camera moved
    // only once update() next runs — would leave `tweening` reading
    // false while the camera was still visually at its OLD position
    // for up to one frame: a screenshot taken in that window would be
    // exactly the kind of lie this repo's settle-before-screenshot
    // discipline exists to catch. Applying the jump here means
    // `tweening` is false AND the camera is already at the destination
    // the instant goTo()/moveTo() returns, with no such window.
    const jump = instant || reducedMotion;
    tweenDuration = jump ? 0 : TWEEN_MS;
    t = jump ? 1 : 0;
    applyPose(ease(t));
    return true;
  }

  /**
   * 'room' | 'shelf:<caseId>' | 'table:<id>'. Unknown name: no-op,
   * returns false. Pushes the pose being LEFT onto the undo stack
   * (cap STACK_CAP, drop the oldest) before switching — see STACK /
   * ESCAPE.
   */
  function goTo(name, opts2 = {}) {
    // 'dolly' is currentName()'s own transient indicator, not a real,
    // resolvable pose (poseFor('dolly') is null) — if goTo() is called
    // while mid-dolly (e.g. the user scrolls, then clicks a case
    // before releasing the wheel), pushing the literal string 'dolly'
    // would leave back() later trying to moveTo('dolly') and failing
    // silently. Substitute 'room': a dolly is fundamentally an
    // in-between state on the room<->shelf axis, and "you hadn't
    // committed to the shelf yet" is the truest one-word summary of
    // where Escape should return to.
    const leaving = currentName();
    const prevName = leaving === 'dolly' ? 'room' : leaving;

    // Re-asking for the pose we are already settled in is a real
    // no-op, not a 700ms tween from a place to itself. This matters
    // because a11y.js's opts.onFocus fires focusEntry() -> goTo() once
    // per Tab: walking a shelf of 11 books used to restart the same
    // shelf:back tween 11 times, so `tweening` never settled while the
    // reader was tabbing (a screenshot taken then is a lie, and the
    // harness's own settle condition polls exactly that flag).
    if (name === leaving && name !== 'dolly' && !(mode === 'tween' && t < 1)) return true;

    if (!moveTo(name, opts2)) return false;
    // ...and never stack a pose on top of itself. Same Tab-through
    // case: 10 pushes of 'shelf:back' meant Escape had to be pressed
    // 10 times before the camera visibly moved, since each pop just
    // re-arrived where it already was.
    if (prevName !== name) {
      stack.push(prevName);
      if (stack.length > STACK_CAP) stack.shift();
    }
    return true;
  }

  /**
   * Pop the undo stack and go there. Empty stack -> 'room'. Already at
   * 'room' -> no-op (checked FIRST, even if the stack happens to be
   * non-empty — §4.3's "Escape steps back", not "Escape always does
   * something").
   */
  function back() {
    if (currentName() === 'room') return false;
    const name = stack.length ? stack.pop() : 'room';
    return moveTo(name); // always resolvable: goTo() never pushes an unresolvable name
  }

  /**
   * The shelf pose whose POSITION is nearest the camera's CURRENT
   * position (real distance comparison, no projection maths — from
   * the room pose that is, in every room laid out so far, the back
   * case, simply because it happens to be geometrically closest to
   * where the room camera sits; nothing here hard-codes 'back'). Null
   * if this room built no cases at all.
   */
  function nearestShelfPose() {
    if (!cases.length) return null;
    let best = null, bestDistSq = Infinity;
    for (const c of cases) {
      const pose = shelfPoseFor(c);
      const distSq = pose.position.distanceToSquared(camera.position);
      if (distSq < bestDistSq) { bestDistSq = distSq; best = { name: `shelf:${c.id}`, pose }; }
    }
    return best;
  }

  /**
   * Wheel/pinch: drive `t` directly from `delta` (units of `t`,
   * caller-scaled — see attachPoseControls()) between the room pose
   * and the nearest shelf pose, with NO easing (§4.3/PLAN.md point 6:
   * "dollies smoothly," which is the input itself being smooth, not a
   * simulated one) and no animation loop of its own. Cancels any
   * running tween and takes over. No-op if this room has no cases.
   */
  function dolly(delta) {
    const nearest = nearestShelfPose();
    if (!nearest) return;
    if (mode !== 'dolly') {
      mode = 'dolly';
      // A freshly-STARTED dolly gesture always begins at t=0 (the room
      // end) of its OWN room<->nearest-shelf axis, even if it's
      // interrupting an in-flight tween toward some OTHER pose. Full
      // continuity across two different pose pairs would need
      // projecting the interrupted tween's current position onto this
      // new axis — exactly the "projection maths" this function's own
      // doc comment rules out for finding the nearest shelf in the
      // first place; the same simplicity is kept here. In practice the
      // wheel/pinch gesture almost always starts from 'room' or from
      // the shelf it's about to leave, both of which this already
      // handles smoothly — an interrupted tween underfoot is the rare
      // case, not the common one this mechanic is for.
      t = 0;
    }
    from = roomPose();
    to = nearest.pose;
    toName = nearest.name;
    t = THREE.MathUtils.clamp(t + delta, 0, 1);
    applyPose(t); // e = t directly: no easing while actively dollying
  }

  /**
   * Fly to whatever `entry` (a book/case/table/door entry, per
   * interact.js's shapes) implies as a pose: `entry.pose` if it has
   * one (a case's own entry, or a table's own entry), else
   * `shelf:<entry.caseId>` (a book on a shelf), else
   * `table:<entry.tableId>` (a book on a table). A door entry has
   * none of these — no-op, false — doors are not pose targets in this
   * phase. Wired as a11y.js's `opts.onFocus`, so tabbing to any
   * focusable thing in the room brings the camera to it too.
   */
  function focusEntry(entry) {
    if (!entry) return false;
    const name = entry.pose
      ?? (entry.caseId ? `shelf:${entry.caseId}` : undefined)
      ?? (entry.tableId ? `table:${entry.tableId}` : undefined);
    return name ? goTo(name) : false;
  }

  /**
   * Driven by stage.onFrame() — see stage.js's own tick() comment for
   * why that ordering (before render, same loop) is load-bearing.
   * Advances a running TWEEN by wall-clock time; a DOLLY needs nothing
   * here (it is driven entirely by dolly()'s own input events, and
   * shelf poses don't depend on anything that changes frame-to-frame,
   * e.g. camera.aspect — only table poses do, and dolly never targets
   * a table).
   */
  function update(nowMs) {
    if (mode !== 'tween' || t >= 1) return;
    t = tweenDuration <= 0
      ? 1
      : THREE.MathUtils.clamp((nowMs - tweenStart) / tweenDuration, 0, 1);
    applyPose(ease(t));
  }

  /** Every pose name this rig can currently resolve — 'room' plus one
   *  'shelf:<id>' per case and one 'table:<id>' per table actually
   *  built for this room. Never includes 'dolly' (a `current` mode
   *  indicator, not a destination). */
  function poseNames() {
    const names = ['room'];
    for (const c of cases) names.push(`shelf:${c.id}`);
    for (const tb of tables) names.push(`table:${tb.id}`);
    return names;
  }

  return {
    goTo,
    back,
    dolly,
    focusEntry,
    update,
    poseNames,
    poseFor,
    get current() { return currentName(); },
    get tweening() { return mode === 'tween' && t < 1; },
    get t() { return t; },
  };
}

// Tuned by feel (the brief's own figures), not derived — same caveat
// stage.js's lamp constants and doors.js's HOVER_LIGHT_BOOST both
// carry: there is no "correct" wheel-delta-to-dolly-t ratio to derive,
// only one that feels right under a real trackpad/mouse.
const WHEEL_DOLLY_SCALE = 0.0012;
const PINCH_DOLLY_SCALE = 0.0016;

function isEditableTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Wheel/pinch dolly + Escape/Arrow keys, wired to `rig`. Everything
 * this attaches is removed by the returned `detach`.
 *
 * @param {object} stage  createStage()'s return value
 * @param {object} rig    createPoseRig()'s return value
 * @param {object} [opts]  reserved, unused today — kept for signature
 *   symmetry with attachScenePicking()/attach*Picking() (interact.js),
 *   which all take an `opts` bag even when a given call needs none of
 *   it yet.
 * @returns {() => void} detach
 */
export function attachPoseControls(stage, rig, opts = {}) {
  const canvas = stage.renderer.domElement;

  // The page must never scroll under the stage — `{ passive: false }`
  // plus an unconditional preventDefault(), even on a delta that ends
  // up dollying nothing (e.g. this room has no cases): the scroll-lock
  // promise is unconditional, dolly()'s own no-op guard is not this
  // handler's concern.
  function onWheel(e) {
    e.preventDefault();
    rig.dolly(-e.deltaY * WHEEL_DOLLY_SCALE);
  }
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // Pinch: live pointers tracked by pointerId, on the SAME canvas the
  // wheel listener uses (both are "gestures over the 3D view"). Only
  // when exactly two are down does a pair distance exist at all —
  // three-finger and other combinations simply produce no dolly until
  // the count returns to two, with no special-casing needed beyond
  // that null check.
  const pointers = new Map();
  let prevDist = null;

  function pinchDist() {
    if (pointers.size !== 2) return null;
    const [a, b] = pointers.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function onPointerDown(e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    prevDist = pinchDist();
  }
  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const dist = pinchDist();
    if (dist !== null && prevDist !== null) rig.dolly((dist - prevDist) * PINCH_DOLLY_SCALE);
    prevDist = dist;
  }
  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    prevDist = pinchDist();
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  // Escape/Arrow keys, on window (not the canvas — the canvas is not
  // normally a focus target, per §4.7's "keyboard and AT use the
  // mirror" split; these are room-level shortcuts, not mirror-button
  // ones). Tab/Enter/Space are deliberately NOT handled here: the a11y
  // mirror owns them (a11y.js), and phase 5's handoff already records
  // that a real <button> turns Enter/Space into a native `click` —
  // adding a second handler here would double-fire the same
  // activation. `←`/`→`/`↑` rely on goTo()'s own no-op-on-unknown-name
  // behaviour to satisfy "when that case exists": a room with no left
  // case simply never resolves `shelf:left`, so ArrowLeft silently does
  // nothing there, with no existence check duplicated here.
  function onKeydown(e) {
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (isEditableTarget(e.target)) return;
    switch (e.key) {
      case 'Escape': rig.back(); break;
      // preventDefault only when the pose actually resolved, using
      // goTo()'s own return value — same "the page must never scroll
      // under the stage" promise onWheel() makes, but arrow keys are
      // ALSO the page's own scroll keys, so swallowing one in a room
      // that has no left case would break scrolling for no gain.
      case 'ArrowLeft': if (rig.goTo('shelf:left')) e.preventDefault(); break;
      case 'ArrowRight': if (rig.goTo('shelf:right')) e.preventDefault(); break;
      case 'ArrowUp': if (rig.goTo('shelf:back')) e.preventDefault(); break;
      default: break;
    }
  }
  window.addEventListener('keydown', onKeydown);

  return function detach() {
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('keydown', onKeydown);
  };
}
