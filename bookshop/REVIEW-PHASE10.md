# Code review — phase 10, the swap-over (`d7b0f4c`)

The review pass phase 10 never got. Read against `PLAN-PHASE10.md`.

Overall: the diff does what the plan says, and the plan's own judgment is
sound — one assembly path through `room.js`, explicit teardown, `main.js`
owning the keyboard, the fov widening on portrait. Disposal is correct where
it matters: `disposeObject3D()` touches geometries and materials only, and
every cross-room cache (`textures.js` walls, `props.js` art/paint,
`tables.js` `coverTexCache`/`topTexCache`) holds *textures*, which it never
disposes. The two `pageMaterial()` singletons and the shared unit box carry
`userData.shared`. I checked each one; the rule holds.

Three defects.

---

## 1. A room that fails to build soft-locks the whole shop — `main.js:201`

`paint()` calls `buildRoom()` unguarded, and `state.travelling = false` is
not reached until line 224:

```js
handle = stage ? buildRoom(stage, room, { … }) : null;   // 201  can throw
…
state.travelling = false;                                 // 224  never runs
```

`paint()` is invoked from `setTimeout(paint, 300)` (line 233), so the throw
lands in a timer callback where no caller can catch it. `state.travelling`
stays `true` for the life of the page, and `go()`'s guard at line 189 then
queues **every** subsequent navigation and replays none of them. The shop
stops responding to doors, the dock, the plan, search and the shelf list at
once, with no error visible to the reader.

One bad room out of fifty, one texture that fails to decode, or a context
loss landing mid-build is enough. Wrap the build, restore `travelling`, and
fall back the way the file already knows how (`flat()`).

**Severity: medium-high.** Needs a build failure to trigger, but the failure
mode is total and silent.

## 2. Focus is dropped on every room change — `main.js` (no handler)

This is the important one, because it breaks the thing the project says is
its one real virtue.

A keyboard or screen-reader user tabs to a doorway in the a11y mirror and
presses Enter → `onDoorActivate` → `go()` → `handle.dispose()` →
`mirror.dispose()` removes the mirror's buttons, **including the focused
one** → focus falls to `<body>`. The next Tab starts from the top of the
document and a screen reader loses its place entirely. Walking through a
door — the primary action in the shop — strands the exact user the mirror
exists for.

`grep` for `focus()` in `main.js`, `room.js` and `a11y.js` finds the
overlay and sheet handlers and phase 8's `setDisabled()` rescue at
`main.js:303`, and nothing that runs after a room rebuild.

There is precedent for the fix shape: phase 8 hit this same class of bug
(disabling the control you are standing on) and solved it by handing focus
somewhere sensible before destroying the control. `PLAN-ARCH.md` is explicit
that the mirror is meant to be *better* than what came before — "the camera
follows focus, which it currently does not" — and a focus drop on every
traversal is worse, not better.

**Severity: high.** Not a crash; it is the accessibility promise failing in
normal use.

## 3. `pendingPose` can be applied to the wrong room — `main.js:178-189, 244`

`go()` resolves a table link before the travelling guard:

```js
if (isTable(id)) { pendingPose = `table:${id}`; id = standIn(id); … }  // 178
…
if (state.travelling) { queued = { id, dir, replace }; return; }        // 189
```

If a second `go()` arrives during the same 300 ms travel it **overwrites
`queued` but not `pendingPose`**, so the pose survives a navigation it was
never meant for and `applyPendingPose()` fires it in whatever room arrives
first (line 225, before the queued replay at 227).

It fails safe — `goTo()` returns `false` for an unresolvable pose rather
than throwing, which I confirmed in `poses.js` — so the visible effect is
only that a `#/fronttable` deep link silently does not look at the table.
Still wrong, and the state is dead either way.

**Severity: low.** Fix by scoping `pendingPose` to its target room, or
clearing it whenever `queued` is replaced.

---

## Not defects, recorded so they are not re-litigated

- **`go()` cancelling a queued trip when you re-enter the room you are
  leaving** (`main.js:186`): reachable, but "you asked to go back where you
  already are, so drop the pending move" is defensible. Left alone.
- **`coverTexCache` is never evicted.** Keyed by book id and only three of
  fifty rooms have a table, so it is bounded by roughly 67 textures. Not a
  leak.
- **The no-WebGL markup** (`index.html:65-71`) is present, complete, and
  says the useful thing. Whether it actually triggers is an empirical
  question, not a review one.
