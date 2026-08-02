/* ============================================================
   Doorways: real holes cut into the side walls, a light spill in
   the opening, and a DOM-layer sign shown on hover/focus.

   Per IMPLEMENTATION.md §3 (row 5, points 2 & 3) / PLAN-ARCH.md
   "Doorways": THREE.Shape.holes fed to ExtrudeGeometry gives the wall
   face AND the inner reveal faces of the opening in one geometry —
   shell.js's buildFace() already threads a `holes` array onto the
   shape (see its own comment); this module is what actually builds
   that array, plus everything else a doorway needs: an invisible
   raycast/hover target sized to the opening, a point light standing
   in for the old CSS `.door3d__spill` painted rectangle, and (when
   buildRoomDoors() is given a signContainer) the DOM sign that used
   to be an always-visible CSS bracket and is now shown only on
   hover/focus.

   Two entry points, used in this order by the room-assembly code
   (tools/preview-stage.html today; main.js once phase 5's swap-over
   lands):

     1. computeRoomDoorHoles(room) — BEFORE buildShell(), so the wall
        geometry can be cut with the holes already known.
     2. buildRoomDoors(room, opts) — AFTER the shell exists, to dress
        the openings with sensors/lights/signs.

   Both derive from the SAME doorwaySpecs(room) — one source of truth
   for "which kid goes in which bay", so the hole shell.js cuts and
   the sensor/light doors.js places can never drift apart.

   Door-vs-book overlap: doorwaySpecs() reads room.children/doorSlots()
   exactly the way books.js's sideCaseSpec() does (same BAY table, same
   import from passages.js) — a side case is only ever sized to start
   past the last bay a door slot actually uses, so by construction a
   real 3D doorway and a real 3D case never occupy the same z-range.
   See HANDOFF-PHASE6.md for the Playwright check that cross-verified
   this on a room with both.
   ============================================================ */

import * as THREE from 'three';
import {
  DOOR_W, DOOR_H,
  doorSlots, doorLocalXRange, doorLocalYRange, doorWorldAnchor,
} from './passages.js';

/* Tuned by screenshot against the stage, not derived — same caveat
   stage.js's own lamp constants carry: our world units are CSS
   pixels, not metres, so at room scale (a few hundred units from the
   opening to the far wall) a PointLight's candela-scale intensity
   lands far below lamp scale. A doorway has nothing large to light
   beyond it (there's no room built there yet — the point of phase 5
   is a real hole, not a real room on the other side), so it reads as
   a lit passage at a much lower intensity than stage.js's
   LAMP_INTENSITY. See HANDOFF-PHASE6.md for the before/after this was
   checked against. */
const DOOR_LIGHT_INTENSITY = 220_000;
const DOOR_LIGHT_DISTANCE = 900;
const DOOR_LIGHT_DECAY = 2;
const HOVER_LIGHT_BOOST = 1.35; // ~= CSS .door3d:hover { filter: brightness(1.22) }, felt right brighter in WebGL

/* ── the one source of truth for "which kid goes in which bay" ──
   Ported from scene.js's buildRoom(): `kids` excludes the viaTable
   child (the front table is phase 7's job, not a door), doorSlots(n)
   assigns slot names in the same fixed order books.js's sideCaseSpec()
   already assumes. */
function doorwaySpecs(room) {
  const kids = (room.children || []).filter((k) => !k.viaTable);
  const slots = doorSlots(kids.length);
  const specs = [];
  kids.forEach((kid, i) => {
    const slot = slots[i];
    if (!slot) return; // >6 non-table children: scene.js silently dropped the rest too
    specs.push({ room: kid, slot, side: slot[0], bayIndex: Number(slot[1]) - 1 });
  });
  return specs;
}

/* A Norman-arch hole in the wall SHAPE's own local coordinates: two
   straight jambs up to a springline, then absarc() the rest of the
   way to the apex, radius DOOR_ARCH_R (= DOOR_W/2, so the arch is a
   true semicircle spanning the full opening width). Wound opposite
   the outer contour's winding (see shell.js's buildFace(): the wall
   shape is authored moveTo(bottom-left)->bottom-right->top-right->
   top-left->close, which is CCW / positive signed area) — this path
   goes bottom-left -> up -> across the top -> down -> close, which is
   CW / negative signed area, i.e. opposite. (three.js's ExtrudeGeometry
   also self-corrects hole winding when the outer contour needs
   reversing, so this isn't load-bearing for correctness, only for
   matching IMPLEMENTATION.md §4.4's own description of the pattern.)

   The arc's direction (aClockwise=true in absarc's terms) was derived
   from EllipseCurve.getPoint()'s handling of the clockwise flag —
   worked out by hand once (see HANDOFF-PHASE6.md for the full
   angle-by-angle derivation) and confirmed by screenshot rather than
   trusted blind: with aClockwise=true, the sweep from Math.PI to 0
   passes through Math.PI/2 (the apex), which is the arch, not the
   floor. */
function doorHolePath(x0, x1) {
  const [yFloor] = doorLocalYRange();
  const r = (x1 - x0) / 2;
  const cx = (x0 + x1) / 2;
  const ySpring = yFloor + DOOR_H - r;
  const path = new THREE.Path();
  path.moveTo(x0, yFloor);
  path.lineTo(x0, ySpring);
  path.absarc(cx, ySpring, r, Math.PI, 0, true);
  path.lineTo(x1, yFloor);
  path.closePath();
  return path;
}

/**
 * Doorway cut-outs for one room's left/right walls, ready for
 * shell.js's buildShell(room, { holes }). Call BEFORE buildShell() —
 * the wall geometry has to be built with the holes already known.
 * @returns {{left: THREE.Path[], right: THREE.Path[]}}
 */
export function computeRoomDoorHoles(room) {
  const holes = { left: [], right: [] };
  for (const spec of doorwaySpecs(room)) {
    const [x0, x1] = doorLocalXRange(spec.side, spec.bayIndex);
    holes[spec.side === 'l' ? 'left' : 'right'].push(doorHolePath(x0, x1));
  }
  return holes;
}

/* The name of the room beyond, as a DOM element instead of the old
   always-visible CSS bracket — per PLAN-ARCH.md's "sign moves to the
   DOM layer, shown on hover/focus." Content format matches scene.js's
   doorSign() exactly: name, then `sub || 'further in'` + ' · ' +
   total. Decorative, not a control (the a11y mirror button already
   carries the real aria-label) — aria-hidden, like the old .dsign. */
function buildSignEl(room) {
  const el = document.createElement('div');
  el.className = 'scene-door-sign';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'position:fixed', 'left:0', 'top:0', 'transform:translate(-50%,-100%)',
    'opacity:0', 'transition:opacity .18s ease',
    'pointer-events:none', 'z-index:5', 'will-change:transform,left,top',
    'background:linear-gradient(180deg,#2a1d16,#16100c)',
    'border:1px solid rgba(255,180,94,.4)',
    'border-radius:4px', 'padding:5px 10px 6px',
    'text-align:center', 'white-space:nowrap',
    'box-shadow:0 10px 22px -12px #000',
  ].join(';');

  const n = document.createElement('div');
  n.textContent = room.name;
  n.style.cssText = 'font:15px/1.15 Georgia,"Iowan Old Style",serif;color:#f4ead9;';

  const s = document.createElement('div');
  s.textContent = `${room.sub || 'further in'} · ${room.total}`;
  s.style.cssText = 'font:9px/1.4 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#ffcf94;margin-top:2px;';

  el.appendChild(n);
  el.appendChild(s);
  return el;
}

/**
 * Sensors, light spill and (optionally) hover/focus signs for one
 * room's doorways. Call AFTER buildShell() — this dresses openings
 * that are assumed to already exist, it doesn't cut them (see
 * computeRoomDoorHoles(), which must run first and feed the same
 * room into buildShell()).
 *
 * @param {object} room
 * @param {object} [opts]
 * @param {HTMLElement} [opts.signContainer] if given, one hidden sign
 *   element per doorway is appended here and shown on hover/focus.
 *   Omit to skip DOM signs entirely (e.g. a headless test room).
 * @param {number} [opts.lightIntensity]
 * @param {number} [opts.lightDistance]
 * @param {number} [opts.lightDecay]
 * @returns {{group: THREE.Group, entries: object[], updateSigns: (stage) => void}}
 *   `entries` is one per doorway, shaped like books.js's book entries
 *   (`.mesh`, `.ariaLabel`, `.setHighlight(bool)`) so interact.js's
 *   raycast-picking pattern and a11y.js's addEntry() both work
 *   unmodified — plus `.room`/`.slot` for door-specific consumers
 *   (interact.js's createDoorController(), and main.js eventually).
 *   `updateSigns(stage)` re-projects sign positions from the current
 *   camera; call it once a frame (cheap — at most 6 doors/room).
 */
export function buildRoomDoors(room, opts = {}) {
  const group = new THREE.Group();
  group.name = `doors:${room.id || 'room'}`;
  const entries = [];
  const pal = room.pal || {};
  const glowColor = pal['door-glow'] || pal.glow || '#ffb45e';
  const container = opts.signContainer || null;

  for (const spec of doorwaySpecs(room)) {
    const anchor = doorWorldAnchor(spec.side, spec.bayIndex);
    const intoRoom = spec.side === 'l' ? 1 : -1; // which way is "away from the wall, toward room-centre"

    // Invisible raycast/hover target spanning the doorway's
    // rectangular envelope. It doesn't need to trace the arch exactly
    // — it only needs to be clickable/hoverable roughly where the
    // opening visually is, the same way a book's box mesh stands in
    // for its (mostly hidden) true silhouette.
    const sensor = new THREE.Mesh(
      new THREE.BoxGeometry(8, DOOR_H, DOOR_W),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    sensor.position.set(anchor.x, DOOR_H / 2, anchor.z);
    group.add(sensor);

    // Light spill — replaces the CSS .door3d__spill painted rectangle
    // with an actual PointLight standing in the opening, pulled
    // slightly toward the room so it has a floor/wall to fall off
    // against (shadow maps are off project-wide, so exact position
    // relative to the wall's thin reveal doesn't matter for occlusion
    // — see stage.js — only for where the falloff's hot spot sits).
    const light = new THREE.PointLight(
      new THREE.Color(glowColor),
      opts.lightIntensity ?? DOOR_LIGHT_INTENSITY,
      opts.lightDistance ?? DOOR_LIGHT_DISTANCE,
      opts.lightDecay ?? DOOR_LIGHT_DECAY,
    );
    const baseIntensity = light.intensity;
    light.position.set(anchor.x + intoRoom * 30, DOOR_H * 0.62, anchor.z);
    group.add(light);

    // a faint glow sphere so the opening itself doesn't read as a
    // dark silhouette under its own light — same trick as stage.js's
    // lamp bulbs.
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(9, 10, 8),
      new THREE.MeshBasicMaterial({ color: glowColor }),
    );
    bulb.position.copy(light.position);
    group.add(bulb);

    let signEl = null;
    let signAnchor = null;
    if (container) {
      signEl = buildSignEl(spec.room);
      container.appendChild(signEl);
      signAnchor = new THREE.Vector3(anchor.x + intoRoom * 10, DOOR_H + 12, anchor.z);
    }

    const entry = {
      room: spec.room,
      slot: spec.slot,
      mesh: sensor,
      ariaLabel: `Go through to ${spec.room.name}${spec.room.sub ? ' — ' + spec.room.sub : ''}`,
      setHighlight(on) {
        light.intensity = on ? baseIntensity * HOVER_LIGHT_BOOST : baseIntensity;
        if (signEl) signEl.style.opacity = on ? '1' : '0';
      },
      signEl,
      signAnchor,
    };
    sensor.userData.entry = entry;
    entries.push(entry);
  }

  function updateSigns(stage) {
    if (!container) return;
    const rect = stage.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    for (const entry of entries) {
      if (!entry.signAnchor) continue;
      const p = entry.signAnchor.clone().project(stage.camera);
      entry.signEl.style.left = `${Math.round((p.x * 0.5 + 0.5) * rect.width + rect.left)}px`;
      entry.signEl.style.top = `${Math.round((1 - (p.y * 0.5 + 0.5)) * rect.height + rect.top)}px`;
    }
  }

  return { group, entries, updateSigns };
}
