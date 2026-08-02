/* ============================================================
   The room shell — walls, floor and ceiling.

   Per IMPLEMENTATION.md §4.4: each surface is a THREE.Shape run
   through ExtrudeGeometry (bevelEnabled: false), not a flat plane.
   Extruding gives the surface real thickness and, once phase 5 cuts
   doorway holes into shape.holes, the inner reveal faces of those
   openings come for free from the same geometry.

   Phase 3 built a closed box: five surfaces, no holes. `buildFace()`
   already accepted a `holes` array, unexercised until phase 5, which
   threads `opts.holes = { left, right }` (arrays of THREE.Path, one
   per doorway, built by doors.js) onto the left/right walls' shapes —
   back wall, floor and ceiling never get holes (doors only ever sit
   in side walls, per IMPLEMENTATION.md/scene.js).

   Coordinates are three.js world units, y already flipped via
   coords.js (toThreeY / WORLD) — nothing in this file touches CSS
   y-down values directly.
   ============================================================ */

import * as THREE from 'three';
import { WORLD } from './coords.js';
import { wallTexture } from './textures.js';

const DEFAULT_THICKNESS = 28;
const TEX_SCALE = 0.75; // canvas px per world unit

/**
 * One wall/floor/ceiling surface as an extruded box, `thickness` deep,
 * with its ROOM-FACING surface centred exactly at `position` and facing
 * along whichever axis `rotation` points its local +Z.
 *
 * @param {number} width  shape width (local x)
 * @param {number} height shape height (local y)
 * @param {number} thickness
 * @param {THREE.Vector3} position centre of the room-facing surface
 * @param {THREE.Euler} rotation
 * @param {THREE.Material|THREE.Material[]} material  a 2-element array
 *        [cap, reveal] gives the extrude's front/back caps and its
 *        side-wall strips (including a hole's reveal faces) distinct
 *        materials — see revealMaterial()'s comment below.
 * @param {THREE.Path[]} [holes] doorway cut-outs, wound opposite the
 *        outer contour — built by doors.js's computeRoomDoorHoles().
 */
/* ExtrudeGeometry's default UVGenerator (WorldUVGenerator, three.core.js)
   hands back the shape's raw local coordinates as UVs, not 0-1 — fine for
   a shape already authored in 0-1 space, but ours are authored in world
   units (hundreds of px). Left alone, a wall's texture only ever shows
   the single texel at its ClampToEdgeWrapping edge: the whole face reads
   as one smeared colour and every wainscot band / pinstripe / mullion
   textures.js paints is invisible. Normalize top/bottom-cap UVs to 0-1
   over the shape's own width/height so the texture actually tiles across
   the face once, and side-wall UVs to 0-1 over thickness so the (mostly
   hidden) extrude strip doesn't inherit the same bug. */
function uvGenerator(width, height, thickness) {
  const cap = (i, vertices) => new THREE.Vector2(
    vertices[i * 3] / width + 0.5,
    vertices[i * 3 + 1] / height + 0.5,
  );
  return {
    generateTopUV(geometry, vertices, a, b, c) {
      return [cap(a, vertices), cap(b, vertices), cap(c, vertices)];
    },
    generateSideWallUV(geometry, vertices, a, b, c, d) {
      const ax = vertices[a * 3], ay = vertices[a * 3 + 1];
      const bx = vertices[b * 3], by = vertices[b * 3 + 1];
      const useX = Math.abs(ay - by) < Math.abs(ax - bx);
      const span = useX ? width : height;
      const uv = (i) => new THREE.Vector2(
        (useX ? vertices[i * 3] : vertices[i * 3 + 1]) / span + 0.5,
        1 - vertices[i * 3 + 2] / thickness,
      );
      return [uv(a), uv(b), uv(c), uv(d)];
    },
  };
}

function buildFace({ width, height, thickness, position, rotation, material, holes = [] }) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.closePath();
  for (const h of holes) shape.holes.push(h);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 12,
    UVGenerator: uvGenerator(width, height, thickness),
  });
  // ExtrudeGeometry extrudes local z in [0, thickness]; shift so z=0 is
  // the room-facing surface and the solid recedes into z<0, i.e. away
  // from the room once `position`+`rotation` place it in the world.
  geometry.translate(0, 0, -thickness);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.rotation.copy(rotation);
  mesh.receiveShadow = true;
  return mesh;
}

function faceMaterial(kind, pal, face, sizeWorld) {
  const map = wallTexture(kind, pal, face, sizeWorld, TEX_SCALE);
  return new THREE.MeshStandardMaterial({
    map,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide, // avoids hand-deriving ExtrudeGeometry winding; three.js
                             // flips the shading normal per-fragment for double-sided
                             // materials, so lighting is correct on the visible face
                             // regardless of shape winding.
  });
}

/* ExtrudeGeometry always calls addGroup() twice regardless of whether
   the shape has holes: group materialIndex 0 is the front/back caps
   (the decorative, textured room-facing + outer-back surfaces),
   materialIndex 1 is every "side wall" strip the extrusion produces —
   both the thin perimeter around the whole slab AND, once a doorway
   hole exists, its inner reveal faces. Passing a 2-material array to
   the Mesh is therefore all that's needed to give holed geometry (or,
   for that matter, every wall's previously-hidden thin perimeter
   edge) a plain, undecorated material instead of the cap's stretched
   texture — phase 3's handoff flagged exactly this ("the inner reveal
   faces of a doorway are exactly these strips, and a stretched wall
   texture will look wrong there"). One reveal material per room
   (shared across all 5 faces, not per-face) is plenty since it's a
   flat tone with no map. */
function revealMaterial(pal) {
  const tone = pal.wood || pal.wall || '#6b5642';
  return new THREE.MeshStandardMaterial({
    color: tone,
    roughness: 0.95,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
}

/**
 * Build one room's shell: back wall, left wall, right wall, floor,
 * ceiling. Returns a THREE.Group. `room` needs `.kind` and `.pal`
 * (see src/js/data/rooms.js); geometry is otherwise fixed to WORLD.
 *
 * @param {object} [opts]
 * @param {number} [opts.thickness]
 * @param {{left?: THREE.Path[], right?: THREE.Path[]}} [opts.holes]
 *   doorway cut-outs for the two side walls, in the wall SHAPE's own
 *   local coordinates — see passages.js's doorLocalXRange()/
 *   doorLocalYRange() and doors.js's computeRoomDoorHoles(), which
 *   builds exactly this shape. Back wall/floor/ceiling never take
 *   holes (doors only ever sit in side walls).
 */
export function buildShell(room, opts = {}) {
  const thickness = opts.thickness ?? DEFAULT_THICKNESS;
  const kind = room.kind || 'k-panel';
  const pal = room.pal || {};
  const holes = opts.holes || {};
  const group = new THREE.Group();
  group.name = `shell:${room.id || 'room'}`;

  // one reveal material per room, shared across all 5 faces (see
  // revealMaterial()'s comment) — cheap, and keeps the doorway
  // reveal's tone consistent with the rest of the shell's woodwork.
  const reveal = revealMaterial(pal);

  const back = buildFace({
    width: WORLD.w, height: WORLD.h, thickness,
    position: new THREE.Vector3(0, WORLD.h / 2, -WORLD.d),
    rotation: new THREE.Euler(0, 0, 0),
    material: [faceMaterial(kind, pal, 'back', { w: WORLD.w, h: WORLD.h }), reveal],
  });
  back.name = 'wall-back';

  const floor = buildFace({
    width: WORLD.w, height: WORLD.d, thickness,
    position: new THREE.Vector3(0, 0, -WORLD.d / 2),
    rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
    material: [faceMaterial(kind, pal, 'floor', { w: WORLD.w, h: WORLD.d }), reveal],
  });
  floor.name = 'floor';

  const ceiling = buildFace({
    width: WORLD.w, height: WORLD.d, thickness,
    position: new THREE.Vector3(0, WORLD.h, -WORLD.d / 2),
    rotation: new THREE.Euler(Math.PI / 2, 0, 0),
    material: [faceMaterial(kind, pal, 'ceiling', { w: WORLD.w, h: WORLD.d }), reveal],
  });
  ceiling.name = 'ceiling';

  const left = buildFace({
    width: WORLD.d, height: WORLD.h, thickness,
    position: new THREE.Vector3(-WORLD.hw, WORLD.h / 2, -WORLD.d / 2),
    rotation: new THREE.Euler(0, Math.PI / 2, 0),
    material: [faceMaterial(kind, pal, 'left', { w: WORLD.d, h: WORLD.h }), reveal],
    holes: holes.left || [],
  });
  left.name = 'wall-left';

  const right = buildFace({
    width: WORLD.d, height: WORLD.h, thickness,
    position: new THREE.Vector3(WORLD.hw, WORLD.h / 2, -WORLD.d / 2),
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
    material: [faceMaterial(kind, pal, 'right', { w: WORLD.d, h: WORLD.h }), reveal],
    holes: holes.right || [],
  });
  right.name = 'wall-right';

  group.add(back, floor, ceiling, left, right);
  return group;
}
