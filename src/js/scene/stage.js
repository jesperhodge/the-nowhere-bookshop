/* ============================================================
   The stage — renderer, camera rig, lighting, render loop, resize.

   This is the three.js substrate phase 3 exists to check: does real
   WebGL lighting beat the CSS gradients it replaces, or does the
   skeleton look like grey plastic? See IMPLEMENTATION.md §4.2/§4.5
   and PLAN-ARCH.md "Keeping the look".
   ============================================================ */

import * as THREE from 'three';
import { WORLD, lampAnchor } from './coords.js';

/* ── camera ───────────────────────────────────────────────────
   Reproduces the CSS framing: perspective: 1500px, i.e. an eye at
   z=1500 (world z=0 is the open front of the room, where you stand).
   fov = 2*atan(470/1500) is the vertical FOV a 1500px CSS perspective
   implies over a 940px-tall (2*470) box. perspective-origin: 50% 45%
   nudges the CSS vanishing point slightly above the room's vertical
   centre; three.js has no lens-shift equivalent without an asymmetric
   frustum, so this port approximates it by aiming very slightly above
   room-centre height rather than reproducing the shift exactly — a
   deliberate, noted simplification (see HANDOFF-PHASE4.md). */
export const CAMERA = {
  fovDeg: 2 * Math.atan(WORLD.hh / 1500) * (180 / Math.PI),
  eyeZ: 1500,
  lookY: WORLD.h * 0.52,
  lookZ: -WORLD.d * 0.5,
};

export function makeCamera(aspect = 1) {
  const camera = new THREE.PerspectiveCamera(CAMERA.fovDeg, aspect, 10, 6000);
  camera.position.set(0, WORLD.h / 2, CAMERA.eyeZ);
  camera.lookAt(0, CAMERA.lookY, CAMERA.lookZ);
  return camera;
}

/* ── lighting ─────────────────────────────────────────────────
   §4.5: one warm PointLight per lamp prop, positioned where the lamp
   is, plus a low ambient. This is what "cosy interior" costs for
   real, instead of the radial-gradient planes that turned out never
   to render (PLAN-ARCH.md "Finding A").

   Lamp position: coords.lampAnchor() gives the CSS-authored anchor —
   the shade's TOP-LEFT corner, already y-flipped, resolved to the
   bulb's actual position (shade horizontal centre, 14 units below the
   shade's bottom edge — see .prop-lamp .bulb in scene.css:
   bottom:-14px). Phase 6's props.js lamp fixture (shade + cord) calls
   the SAME function to place its geometry, so the light and the
   fixture it's supposedly inside of can't drift apart — see
   coords.js's lampAnchor() doc comment. */
/* Tuned empirically against screenshots, not derived — three.js r155+
   uses physically-based light units (PointLight intensity is candela,
   falloff is real inverse-square via `decay`). Our world units are CSS
   pixels, not metres, so at room-scale distances (500-1000 units) an
   intensity that "looks like one warm bulb" lands in the millions.
   That is a legitimate consequence of the unit system at this scale,
   not a mistake — see HANDOFF-PHASE4.md for the before/after
   screenshots this was tuned against. */
const AMBIENT_INTENSITY = 0.7;
const LAMP_INTENSITY = 1_800_000;
const LAMP_DISTANCE = 1400;
const LAMP_DECAY = 2;

export function buildRoomLights(room, opts = {}) {
  const group = new THREE.Group();
  group.name = 'lights';
  const pal = room.pal || {};

  const ambient = new THREE.AmbientLight(
    new THREE.Color(pal['wall-lit'] || '#5a4636'),
    opts.ambientIntensity ?? AMBIENT_INTENSITY,
  );
  group.add(ambient);

  for (const p of room.props || []) {
    if (p.t !== 'lamp') continue;
    const anchor = lampAnchor(p);
    const color = p.green ? '#8fe4bc' : (pal.glow || '#ffc978');

    const light = new THREE.PointLight(
      new THREE.Color(color),
      opts.lampIntensity ?? LAMP_INTENSITY,
      opts.lampDistance ?? LAMP_DISTANCE,
      opts.lampDecay ?? LAMP_DECAY,
    );
    light.position.set(anchor.x, anchor.y, anchor.z);
    group.add(light);

    // a faint bulb-glow sphere so the fixture itself doesn't read as
    // a dark silhouette under its own light
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(14, 12, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    bulb.position.copy(light.position);
    group.add(bulb);
  }
  return group;
}

/* ── renderer + render loop + resize ─────────────────────────── */

export function createStage(canvas, { toneMappingExposure = 1.05 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = toneMappingExposure;
  renderer.shadowMap.enabled = false; // point-light shadows are a later-phase cost/benefit call

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0706');

  const camera = makeCamera(canvas.clientWidth / Math.max(1, canvas.clientHeight) || 1);

  function resize() {
    const parent = canvas.parentElement;
    const w = Math.max(1, (parent ? parent.clientWidth : window.innerWidth));
    const h = Math.max(1, (parent ? parent.clientHeight : window.innerHeight));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let raf = null;
  let frame = 0;
  // Per-frame callbacks (phase 7: camera pose tweens) — see onFrame()
  // below for the registration API and why this beats a caller
  // running its own requestAnimationFrame loop alongside this one.
  const frameCallbacks = new Set();
  function tick() {
    // Run registered callbacks BEFORE render — this ordering is
    // load-bearing, not incidental. A camera tween has to move the
    // camera for THIS frame, and that moved camera has to be what
    // renderer.render() below actually renders THIS SAME frame. A
    // separate requestAnimationFrame loop — the pattern the harness
    // uses today for doors/props polling (tools/preview-stage.html's
    // pollSigns()/pollProps()) — runs on its own rAF callback with no
    // guaranteed ordering against this tick(), so the camera move
    // could just as easily land after this frame's render: a visible
    // one-frame lag, worse under a fast tween. Calling back into this
    // same loop, before render, is the only way to guarantee it lands
    // in time.
    const now = performance.now();
    for (const fn of frameCallbacks) fn(now);
    renderer.render(scene, camera);
    frame++;
    // a real, pollable "a frame has actually rendered" signal for
    // Playwright's settle-before-screenshot discipline — never a
    // fixed timeout (IMPLEMENTATION.md §2/§7).
    canvas.dataset.frame = String(frame);
    raf = requestAnimationFrame(tick);
  }
  function start() { if (raf === null) raf = requestAnimationFrame(tick); }
  function stop() { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } }
  function dispose() {
    stop();
    window.removeEventListener('resize', resize);
    renderer.dispose();
    frameCallbacks.clear();
  }

  /**
   * Register a per-frame callback, run with performance.now() every
   * tick BEFORE renderer.render() — see tick()'s own comment for why
   * that order is load-bearing rather than a caller-side rAF loop.
   * @param {(now: number) => void} fn
   * @returns {() => void} unsubscribe — same convention as
   *   interact.js's onActivate()/attach*Picking()'s detach.
   */
  function onFrame(fn) {
    frameCallbacks.add(fn);
    return () => frameCallbacks.delete(fn);
  }

  return {
    renderer, scene, camera,
    resize, start, stop, dispose, onFrame,
    get frame() { return frame; },
  };
}
