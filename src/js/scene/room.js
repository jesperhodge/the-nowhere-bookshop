/* ============================================================
   One room, assembled — and, for the first time in this project,
   taken down again.

   PLAN-ARCH.md's "Shape" has named this file since iteration 2
   ("room.js  builds one room: shell, cases, books, doors, props") and
   nobody ever wrote it: the assembly lived inline in
   tools/preview-stage.html, because through phases 3-9 the harness was
   the only thing that built a room. Phase 10 makes the stage the live
   shop, which would have meant a second copy of that assembly in
   main.js — the exact defect this repo already carries once
   (tools/hardcover.mjs vs server/hardcover.js, IMPLEMENTATION.md §5),
   and worse here, because the harness is the *reference* for mounting
   order. So the assembly moves here and both call it.

   ORDER IS LOAD-BEARING, and each step says who established it:

     1. planRoomTable()          which books leave the shelf for the
                                 table — computed before any geometry,
                                 so buildRoomBooks() is handed
                                 `shelfBooks` and never the raw list
                                 (PLAN.md point 10: no book twice).
     2. computeRoomDoorHoles()   BEFORE buildShell(): the wall geometry
                                 has to be extruded with its holes
                                 already known (doors.js's own comment).
     3. buildShell()
     4. buildRoomLights()
     5. buildRoomBooks()         cases + spines + the room's atlas
     6. buildRoomDoors()         sensors, light spill, DOM signs
     7. buildRoomProps()
     8. buildRoomTable()
     9. the a11y mirror, in the mandated order: shelf books -> doors ->
        cases -> table -> table books (PLAN-PHASE7 §3).
    10. the pose rig, then ONE attachScenePicking() over every kind at
        once (interact.js's own comment on why two raycasters over this
        scene are actively wrong, not merely redundant).

   ONE FRAME CALLBACK. The harness ran three separate
   requestAnimationFrame loops beside stage.js's own — one for door
   signs, one for props, one for the pose tween. stage.js's tick()
   already documents why that is wrong for the camera (no ordering
   guarantee against the render, so the move can land after the frame it
   was meant for); it is the same bug three times over for signs that
   trail the camera by a frame. Everything per-frame now runs from
   stage.onFrame(), before the render, in a fixed order.

   TEARDOWN. New this phase, and it has never been exercised: through
   phase 9 exactly one room was ever built per page. Walking fifty rooms
   without a dispose() leaks fifty spine atlases (2048 x ~700 RGBA,
   about 5 MB each) plus their geometry. See disposeObject3D() for the
   one rule that keeps that from also disposing the caches every OTHER
   room shares.
   ============================================================ */

import * as THREE from 'three';
import { buildRoomLights } from './stage.js';
import { buildShell } from './shell.js';
import { buildRoomBooks } from './books.js';
import { computeRoomDoorHoles, buildRoomDoors } from './doors.js';
import { buildRoomProps } from './props.js';
import { planRoomTable, buildRoomTable } from './tables.js';
import { createBookController, createDoorController, createPoseController, attachScenePicking } from './interact.js';
import { mountA11yMirror } from './a11y.js';
import { createPoseRig, attachPoseControls } from './poses.js';

/* Dispose one subtree's GPU resources.

   Geometries are always per-room and always ours. Materials are ours
   too — every builder in src/js/scene/ constructs its materials fresh
   per call — EXCEPT the two module-level page-block singletons
   (books.js's and tables.js's pageMaterial()) and the shared unit book
   box, which are shared by every room for the life of the page and
   carry `userData.shared` to say so.

   Textures are the opposite: almost every one belongs to a cache keyed
   by content and shared across rooms — textures.js's wall cache,
   props.js's artCache/paintCache, tables.js's cover cache. Disposing
   one here would silently break the next room that asks for it, and the
   symptom (a black wall, three rooms later) would be nowhere near the
   cause. So material.map is deliberately left alone; the room's own
   atlas is disposed separately by its owner, below, because it is the
   one texture that is genuinely per-room. */
function disposeObject3D(root) {
  root.traverse((obj) => {
    if (obj.geometry && !obj.geometry.userData?.shared) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    for (const m of mats) if (!m.userData?.shared) m.dispose();
  });
}

/**
 * @param {object} stage  createStage()'s return value
 * @param {object} room   a src/js/data/rooms.js entry
 * @param {object} [opts]
 * @param {(id:string)=>object[]} opts.booksFor  shop.js's booksIn — passed
 *   in rather than imported so this module stays free of the data layer
 *   (the harness and main.js both already hold it).
 * @param {boolean} [opts.books=true] [opts.doors=true] [opts.signs=true]
 * @param {boolean} [opts.props=true] [opts.tables=true] [opts.poses=true]
 *   the harness's ?books=0/?doors=0/... levers, one per layer.
 * @param {HTMLElement} [opts.signContainer]  where door signs are appended
 * @param {HTMLElement} [opts.mirrorContainer]  where the a11y mirror is
 *   mounted. Omit and no mirror is built at all — which is only ever
 *   right for a headless geometry test, never for a page a person uses.
 * @param {boolean} [opts.reducedMotion]
 * @param {boolean} [opts.poseKeys=false]  let poses.js bind its own
 *   window-level Escape/Arrow keys. The live site says no and wires them
 *   itself — see attachPoseControls()'s doc comment.
 * @param {(entry)=>void} [opts.onBookActivate] [opts.onDoorActivate]
 * @param {(entry|null)=>void} [opts.onBookHover]
 * @param {()=>void} [opts.onMiss]  a click that hit nothing; defaults to
 *   rig.back() (PLAN.md point 6, "a click on empty floor steps out").
 */
export function buildRoom(stage, room, opts = {}) {
  const booksFor = opts.booksFor || (() => []);
  const wantBooks = opts.books !== false;
  const wantDoors = opts.doors !== false;
  const wantSigns = wantDoors && opts.signs !== false;
  const wantProps = opts.props !== false;
  const wantTables = opts.tables !== false;
  const wantPoses = opts.poses !== false;

  const group = new THREE.Group();
  group.name = `room:${room.id}`;

  /* 1. the shelf/table split — data only, no THREE, and computed even
     when ?tables=0 so the two levers stay independent. */
  const { shelfBooks, table } = planRoomTable(room, booksFor(room.id), booksFor);

  /* 2-3. holes, then the shell they are cut into. */
  const doorHoles = wantDoors ? computeRoomDoorHoles(room) : undefined;
  group.add(buildShell(room, doorHoles ? { holes: doorHoles } : {}));

  /* 4. */
  group.add(buildRoomLights(room));

  /* Created unconditionally even when their content is switched off:
     a table's books route through bookController in a room whose SHELF
     was skipped, and attachScenePicking()'s onMove() calls
     `grp.controller.hover(null)` on every non-owning group on every
     pointer move — a null controller there throws rather than no-ops. */
  const bookController = createBookController();
  const doorController = createDoorController();
  const poseController = createPoseController();

  let entries = [];
  let cases = [];
  let atlas = null;
  if (wantBooks) {
    const built = buildRoomBooks(room, shelfBooks);
    group.add(built.group);
    entries = built.entries;
    cases = built.cases;
    atlas = built.atlas;
  }

  /* 6. doors. Signs are DOM, so they are the one thing here that has to
     be cleaned out of the page and not just out of the scene graph. */
  let doorRig = null;
  let doorEntries = [];
  let signWrap = null;
  if (wantDoors) {
    const doorOpts = {};
    if (wantSigns && opts.signContainer) {
      signWrap = document.createElement('div');
      signWrap.className = 'scene-door-signs';
      opts.signContainer.appendChild(signWrap);
      doorOpts.signContainer = signWrap;
    }
    doorRig = buildRoomDoors(room, doorOpts);
    group.add(doorRig.group);
    doorEntries = doorRig.entries;
  }

  /* 7. */
  let propsRig = null;
  if (wantProps) {
    propsRig = buildRoomProps(room);
    group.add(propsRig.group);
  }

  /* 8. */
  let tableRig = null;
  let tableEntries = [];
  if (wantTables && table) {
    tableRig = buildRoomTable(room, table, { reducedMotion: opts.reducedMotion });
    group.add(tableRig.group);
    tableEntries = tableRig.bookEntries;
  }

  stage.scene.add(group);

  /* 9. the mirror — one list, in the mandated order. `rig` below is
     still null while this closure is built; the `rig?.` reads whatever
     it CURRENTLY is at focus time, so mounting before the rig exists is
     safe (and unavoidable, since the rig needs the cases the mirror is
     already listing). */
  let rig = null;

  /* An entry that answers to a controller other than its group's default
     carries it on itself — the convention a11y.js's addEntry() and
     interact.js's ownerOf() BOTH honour, so this tagging is not the
     mirror's business and happens whether or not one is mounted. */
  for (const e of doorEntries) e.controller = doorController;
  for (const c of cases) c.entry.controller = poseController;
  if (tableRig) tableRig.tableEntry.controller = poseController;

  let mirror = null;
  if (opts.mirrorContainer) {
    mirror = mountA11yMirror(opts.mirrorContainer, [], bookController, {
      onFocus: (entry) => rig?.focusEntry(entry),
    });
    for (const e of entries) mirror.addEntry(e);
    for (const e of doorEntries) mirror.addEntry(e);
    for (const c of cases) mirror.addEntry(c.entry);
    if (tableRig) {
      mirror.addEntry(tableRig.tableEntry);
      for (const e of tableEntries) mirror.addEntry(e);
    }
  }

  /* 10. the rig. `tables` gets tables.js's own analytic `bounds`, never
     the group — see poses.js's tableObstacleBox(). */
  let detachPoseControls = null;
  if (wantPoses) {
    const rigOpts = {
      cases,
      tables: tableRig ? [{ id: table.id, surface: tableRig.surface, box: tableRig.bounds }] : [],
    };
    if (opts.reducedMotion !== undefined) rigOpts.reducedMotion = opts.reducedMotion;
    rig = createPoseRig(stage, rigOpts);
    detachPoseControls = attachPoseControls(stage, rig, { keys: opts.poseKeys === true });
  }

  const offBookActivate = opts.onBookActivate ? bookController.onActivate(opts.onBookActivate) : null;
  const offDoorActivate = opts.onDoorActivate ? doorController.onActivate(opts.onDoorActivate) : null;
  const offBookHover = opts.onBookHover ? bookController.onHover(opts.onBookHover) : null;
  poseController.onActivate((entry) => rig?.goTo(entry.pose));

  const detachPicking = attachScenePicking(
    stage,
    [
      { entries: [...entries, ...tableEntries], controller: bookController },
      { entries: doorEntries, controller: doorController },
      {
        entries: [...cases.map((c) => c.entry), ...(tableRig ? [tableRig.tableEntry] : [])],
        controller: poseController,
      },
    ],
    { onMiss: opts.onMiss || (() => rig?.back()) },
  );

  /* ── the one per-frame callback ── */
  const offFrame = stage.onFrame((now) => {
    rig?.update(now);
    if (tableRig) {
      // The table stands its display copies up for the room pose and
      // lays them all out flat for every other one — see tables.js's
      // own block on why it is "every other pose" and not just the
      // table pose (short version: propped books stand in the
      // shelf:back sight line, and phase 9 spent a session clearing
      // it). Driven from the rig's CURRENT pose name rather than from
      // goTo()'s call site, so a dolly, an Escape, a mirror focus and a
      // click all get the same behaviour with no wiring each.
      // setSpread() is a real no-op on a repeat, so calling it sixty
      // times a second costs one comparison.
      tableRig.setSpread(rig && rig.current === 'room' ? 0 : 1);
      tableRig.tick(now);
    }
    doorRig?.updateSigns(stage);
    propsRig?.update(now / 1000);
  });

  const pending = [];
  if (propsRig) pending.push(propsRig.ready);
  if (tableRig) pending.push(tableRig.ready);
  let isReady = pending.length === 0;
  const ready = Promise.all(pending).then(() => { isReady = true; });

  /* Both shelf and table books, by book id — main.js uses it to bring
     the camera to a book opened from search, the parcel or the bell. */
  const byBook = new Map();
  for (const e of entries) byBook.set(e.book.id, e);
  for (const e of tableEntries) byBook.set(e.book.id, e);

  let disposed = false;

  return {
    room, group, rig, mirror, atlas, table, tableRig,
    entries, tableEntries, doorEntries, cases,
    bookController, doorController, poseController,
    ready,
    get isReady() { return isReady; },
    entryFor: (bookId) => byBook.get(bookId) || null,

    dispose() {
      if (disposed) return;
      disposed = true;
      offFrame();
      detachPicking();
      detachPoseControls?.();
      offBookActivate?.();
      offDoorActivate?.();
      offBookHover?.();
      mirror?.dispose();
      signWrap?.remove();
      stage.scene.remove(group);
      disposeObject3D(group);
      atlas?.dispose();
    },
  };
}
