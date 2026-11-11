# Phase 8 — the dock (`PLAN.md` point 4)

DOM and CSS only, on the **live CSS build**: `index.html`, `src/js/main.js`,
`src/styles/ui.css`. No three.js, no `src/js/scene/`, no preview harness.
Serve with `npm start` (port 8099).

Requirement, from `PLAN.md` point 4 — *the doorways are the way through; the
dock should not compete.* Two halves:

1. Delete the dock's door chips: `#dockDoors`, `showWaysOn()`, `.godoor*`,
   `.dock__doors`, and the dock click handler.
2. Keep **both** back controls: the existing one-level-up Back, plus a new
   always-home button beside it, `disabled` in the front room itself.

Decided upstream, not re-opened.

---

## 1. Deletions

| file | what |
|---|---|
| `index.html` | `<div class="dock__doors" id="dockDoors">` |
| `main.js` | `dockDoors:` in the `dom` map |
| `main.js` | the ways-on block in `paintChrome()` (comment + `innerHTML` + `showWaysOn()` call) |
| `main.js` | `showWaysOn()` and `waysTimer` |
| `main.js` | the `dom.dockDoors` click handler in `wire()` |
| `ui.css` | `.dock__doors`, `::-webkit-scrollbar`, `.is-resting` ×3 |
| `ui.css` | `.godoor`, `:hover/:focus-visible`, `__n`, `__s`, `--deep` ×2 |
| `ui.css` | the mobile `.dock__doors { order: 3 … }` rule |

Nothing else references any of these — grepped `.js`, `.mjs`, `.html`, `.css`.
`tools/qa.mjs` does not touch the dock.

After the deletion the dock's four remaining children are all `flex: 0 0 auto`,
so they cluster left and the dock keeps its full-width gradient. No layout
substitute is added — the empty right half **is** point 4.

`esc()` stays in use elsewhere (breadcrumbs, placard, search, parcel, shelf);
only the dock's one `innerHTML` sink goes.

## 2. The home button

### Markup — `index.html`, immediately after `#btnBack`

```html
<button class="dock__btn dock__btn--home" id="btnHome" type="button"
        title="Back to The Front Room (press H)" aria-label="Go to The Front Room">
  <svg viewBox="0 0 24 24" aria-hidden="true">…house…</svg>
  <span>The Front Room</span>
</button>
```

* The house glyph is the one already used for *a room* in `.res__room`
  (search results, the shelf list). Reuse, not a new symbol.
* Accessible name is `Go to The Front Room`, which **contains the visible
  label verbatim** — WCAG 2.5.3 label-in-name. Do not shorten one without the
  other.
* Visible phrasing differs from Back's (`Go to …` vs `Back to …`) so that in a
  depth-1 room, where the two buttons do the same thing, they still announce
  distinctly.
* No `disabled` in the HTML: `paintChrome()` sets it on every room paint, and
  the shop is `hidden` until then.

### Behaviour — `main.js`

* `const HOME_ID = 'front'` beside `REDUCED`. Used by the new code only;
  `fromHash()`'s default and `boot()`'s `'#/front'` check are left alone
  (entry path, no functional gain in touching them).
* `goHome()`, shared by the click handler and the shortcut:
  * no-op when `dom.home.disabled` — mirrors the button exactly rather than
    leaning on `go()`'s `state.room === id` early return;
  * `closeBook(true)` first if a book is open, because `closeBook()`'s default
    rewrites the hash to *the book's* room and the dock is keyboard-reachable
    from inside the sheet;
  * `go(HOME_ID, 'out')` — `'out'` drives the travel animation, and arriving
    home "inward" reads wrong.
* Disabled state in `paintChrome()`, in the same per-room block as
  `dom.back.disabled`, never once at startup:
  `setDisabled(dom.home, room.id === HOME_ID)`.
* `setDisabled(btn, off)` helper: if the button being disabled currently holds
  focus, hand focus to `#btnShelf` first. Disabling the control you are
  standing on drops focus to `<body>` and a keyboard reader loses their place.
  Applied to Back as well — Back has the same latent bug today and the two
  buttons must not diverge.
* Shortcut `h`/`H` in the existing `window` keydown, after the `typing` guard.
  Free per the handoff (`Escape`, `/`, `Cmd/Ctrl-K`, `m`, `p`, `s`, `b`,
  `←`/`→` are taken).

### CSS — `ui.css`

`.dock__btn--back[disabled]` → `.dock__btn[disabled]`. A disabled dock button
should look disabled whichever one it is; this leaves no rule matching nothing
and needs no second selector. `--back`/`--home` stay on the elements as
hooks. The home button needs no rules of its own — `.dock__btn` covers it.

## 3. The `fronttable` question

The handoff warns that deleting `#dockDoors` removes the last dock route into
`fronttable`, because `paintChrome()` used `room.children` **raw** while
`scene.js:417` filters `.filter(k => !k.viaTable)`.

The removal is real. The claim that it is the *only* walk-to affordance is to
be checked, not assumed — `scene.js:346 buildTablePortal()` builds a
`.door3d.table3d` carrying `data-go="fronttable"` in the front room itself, and
`renderShelf()` (`main.js:466`) and `views/map.js:23` both list `room.children`
raw as well. Verify in the browser; decide and record. **No compensating
affordance is to be invented in phase 8** — that is the main.js/three.js
swap-over's job (point 10), and nobody's phase yet.

**Outcome, checked in the browser:** the handoff overstates it. `fronttable`
keeps a real walk-to affordance — `buildTablePortal()`'s `.door3d.table3d`
sits in the front room carrying `data-go="fronttable"`, and clicking it still
travels. It is also still listed in the shelf overlay and in the plan. Only
the dock's own route to it goes. Nothing added, nothing else changed.

## 4. Verification — Playwright, live site

`npm start` on :8099. `chromium.launch({ executablePath:
'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })` — Playwright 1.62
wants build 1234 and this box has 1194.

Settle on a real condition, never a fixed timeout. Two conditions, both real:

* travelled: `window.__shop.state.room === id` (set at the end of `paint()`,
  which is behind a 300 ms outgoing animation, so this is a genuine wait);
* settled: the `#room > .travel` node's own animations are all
  `playState === 'finished'`. Scoped to that node — `{subtree:true}` would
  catch the grain/rain/`breathe` loops, which never finish.

Checks:

1. `#dockDoors`, `.godoor`, `.dock__doors` all gone from the live DOM; no rule
   in `document.styleSheets` mentions them.
2. Home returns to `front` from depth 1, 2 and 3, and from `fronttable`.
3. Travel direction: a `MutationObserver` on `#room` records the classes
   added — expect `go-out` on the outgoing node and `arrive-out` on the
   arriving one. Never `*-in`.
4. Home `disabled === true` in `front`, `false` in every other room, and it
   flips **per room paint** (walk front → deep → front and re-read it).
5. Back: label text and target parent unchanged in a sample of rooms; still
   disabled only in `front`.
6. Zero console errors / page errors across the whole run.
7. Keyboard: dock tab order is Back → Home → shelf → bell; Enter on Home
   travels; focus is not dropped to `<body>` when Home disables itself;
   accessible name resolves via `getByRole('button', { name: … })`.
8. `h` shortcut travels; does nothing in `front`; does not fire while typing
   in the search field.
9. `fronttable` still reachable: `.table3d[data-go="fronttable"]` present and
   clicking it travels.
10. Mobile viewport (390×740): dock does not overflow horizontally, both
    buttons visible.
11. `prefers-reduced-motion: reduce`: home still arrives.

Scratch scripts at `tools/_scratch-*.mjs` (Playwright only resolves inside the
repo tree), deleted before the commit.

## 5. Not in this phase

* Any compensating UI for the deleted chips.
* `fronttable` ceasing to be a room in the route/plan/breadcrumbs (point 10,
  the swap-over).
* Touching `scene.js`, `src/js/scene/`, or the preview harness.
