/* ============================================================
   The room shell — walls, floor and ceiling.

   Per IMPLEMENTATION.md §4.4: each surface is a THREE.Shape run
   through ExtrudeGeometry (bevelEnabled: false), not a flat plane.
   Extruding gives the surface real thickness and, once phase 5 cuts
   doorway holes into shape.holes, the inner reveal faces of those
   openings come for free from the same geometry.

   Phase 3 builds a closed box: five surfaces, no holes. `buildFace()`
   already accepts a `holes` array so phase 5 can cut doorways without
   restructuring this file — it isn't exercised yet.

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
 * @param {THREE.Material} material
 * @param {THREE.Path[]} [holes] doorway cut-outs, wound opposite the
 *        outer contour — phase 5's extension point, unused this phase.
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

/**
 * Build one room's shell: back wall, left wall, right wall, floor,
 * ceiling. Returns a THREE.Group. `room` needs `.kind` and `.pal`
 * (see src/js/data/rooms.js); geometry is otherwise fixed to WORLD.
 */
export function buildShell(room, opts = {}) {
  const thickness = opts.thickness ?? DEFAULT_THICKNESS;
  const kind = room.kind || 'k-panel';
  const pal = room.pal || {};
  const group = new THREE.Group();
  group.name = `shell:${room.id || 'room'}`;

  const back = buildFace({
    width: WORLD.w, height: WORLD.h, thickness,
    position: new THREE.Vector3(0, WORLD.h / 2, -WORLD.d),
    rotation: new THREE.Euler(0, 0, 0),
    material: faceMaterial(kind, pal, 'back', { w: WORLD.w, h: WORLD.h }),
  });
  back.name = 'wall-back';

  const floor = buildFace({
    width: WORLD.w, height: WORLD.d, thickness,
    position: new THREE.Vector3(0, 0, -WORLD.d / 2),
    rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
    material: faceMaterial(kind, pal, 'floor', { w: WORLD.w, h: WORLD.d }),
  });
  floor.name = 'floor';

  const ceiling = buildFace({
    width: WORLD.w, height: WORLD.d, thickness,
    position: new THREE.Vector3(0, WORLD.h, -WORLD.d / 2),
    rotation: new THREE.Euler(Math.PI / 2, 0, 0),
    material: faceMaterial(kind, pal, 'ceiling', { w: WORLD.w, h: WORLD.d }),
  });
  ceiling.name = 'ceiling';

  const left = buildFace({
    width: WORLD.d, height: WORLD.h, thickness,
    position: new THREE.Vector3(-WORLD.hw, WORLD.h / 2, -WORLD.d / 2),
    rotation: new THREE.Euler(0, Math.PI / 2, 0),
    material: faceMaterial(kind, pal, 'left', { w: WORLD.d, h: WORLD.h }),
  });
  left.name = 'wall-left';

  const right = buildFace({
    width: WORLD.d, height: WORLD.h, thickness,
    position: new THREE.Vector3(WORLD.hw, WORLD.h / 2, -WORLD.d / 2),
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
    material: faceMaterial(kind, pal, 'right', { w: WORLD.d, h: WORLD.h }),
  });
  right.name = 'wall-right';

  group.add(back, floor, ceiling, left, right);
  return group;
}
