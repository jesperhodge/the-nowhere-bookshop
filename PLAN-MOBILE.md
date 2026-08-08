# Plan — mobile, iteration 1

Target: **excellent on a phone**, not "works". Measured on iPhone 13
(390×664 CSS, touch, `pointer: coarse`) against the live build.

Desktop must not regress. Where a change is a clear improvement for both,
take it; otherwise scope it to coarse pointers / narrow viewports.

---

## The issue list, measured

### Navigation is broken — a phone user cannot reach another room

| # | issue | measurement |
|---|---|---|
| **M1** | **Every doorway is outside the frustum at the arrival pose.** The primary way through the shop is invisible. | 0 of 5 doors on screen; ndc.x = −1.40, −1.22, −1.08, +1.22, +1.40 (on-screen is \|x\|≤1) |
| **M2** | **One-finger drag does nothing.** The canvas binds only `wheel` and a two-pointer pinch, both of which dolly. There is no look/turn gesture at all. | camera `0,1500` → `0,1500` after a 240px drag |
| **M3** | Door signs are clipped at the screen edges — the two that partly intrude show only "…ing 1181" and "CR…". | visible in the arrival screenshot |

M1 and M2 compound: you cannot see the doors, **and** you cannot turn to
look for them. The only way onward is the plan or the shelf list, which is
why the owner said they'd never be found.

### Screen usage

| # | issue | measurement |
|---|---|---|
| **M4** | **~45% of the viewport is black bar.** Phase 10's `fovForAspect()` holds horizontal framing by widening the *vertical* fov, so a portrait screen sees a long way above the ceiling and below the floor — void, because the room ends. | room occupies roughly the middle 55% of the 390×664 viewport |

### Touch ergonomics

| # | issue | measurement |
|---|---|---|
| **M5** | 8 visible controls below the 44×44 minimum. | tools 37×37 (search, plan, parcel, sound); dock `Back` 86×38, home 160×38, `The shelf` 115×38, `Ring the bell` 140×38 |
| **M6** | Book spines are far too small to read or tap at the arrival pose. | spine titles illegible in the screenshot at 390px wide |

### Overlays — the "hard to close" complaint

| # | issue | measurement |
|---|---|---|
| **M7** | **No overlay has a visible close control.** Dismissal is scrim-tap or `Escape` only. | `index.html` 160–190: every overlay is `.overlay__scrim[data-close]` + `.overlay__body`, no close button anywhere |
| **M8** | The search overlay shows a `<kbd>esc</kbd>` hint — to a device with no Esc key. | `index.html:177` |

### Platform

| # | issue | measurement |
|---|---|---|
| **M9** | `viewport-fit=cover` is set but **no `env(safe-area-inset-*)` anywhere**, so content runs under the notch and the home indicator. | zero matches for `safe-area` / `env(` in `src/styles/` |

### Discoverability

| # | issue | measurement |
|---|---|---|
| **M10** | Tapping empty space *does* leave a close-up pose — but nothing says so. | verified: tap at (195,560) in `shelf:back` → pose returns to `room` |

---

## What to build

### 1. Drag to look — the headline change (M2, M1)

One finger dragging the canvas turns the view. This is the fix the owner
asked for by name, and it is what makes a room explorable on a phone.

- Applies in the **`room` pose**. Yaw is the important axis; a small clamped
  pitch is welcome, distance is not (pinch already owns that).
- **Clamp to the room** — the same "camera must stay inside and clear of
  geometry" rule `poses.js` already enforces for every named pose. Reuse
  `isClear()` rather than inventing a second clearance model.
- **Must not break tap-to-select.** Distinguish drag from tap by movement
  threshold (≈8 CSS px) and let anything below it fall through to the
  existing raycast. Getting this wrong makes every book untappable, so it
  needs its own test.
- Any `goTo()` cancels an in-flight drag; the drag must never fight the
  tween for ownership of the camera — `poses.js` warns about this twice.
- **Desktop too**: left-drag doing the same thing is a clear win and is what
  anyone expects of a 3D view. Keep the wheel behaviour exactly as it is.

### 2. Frame the room so the doors are in it (M1, M3, M4)

Widening the vertical fov was the phase-10 answer and it produces the
letterbox in M4 while *still* leaving every door off screen. Fix the framing
itself: on a narrow viewport the arrival pose must include the full room
width — both doorways and their signs — inside the frustum.

Pull the camera back, or raise and tilt it, or both; the constraint is the
outcome, not the method: **all 5 doors on screen with their signs fully
readable, and no black bar worth the name.** Verify by the same ndc test
used above, in several rooms, not just `front`.

### 3. Overlays a thumb can dismiss (M7, M8)

- A **visible close control** on every overlay — shelf, plan, search, parcel
  — at least 44×44, positioned where a thumb reaches, not only top-right.
- Keep scrim-tap and Escape.
- **Swipe down to dismiss** is the native gesture for a sheet on a phone;
  add it if it does not fight the overlay's own scrolling.
- Replace the `esc` hint with something true on touch, or hide it there.

### 4. Touch target floor (M5)

Everything interactive ≥44×44 under `(pointer: coarse)`. Grow the hit area,
not necessarily the paint — a 37×37 icon with a 44×44 tap area is fine and
keeps the chrome delicate.

### 5. Safe areas (M9)

`env(safe-area-inset-*)` on the dock, the tool row, the placard and the
overlays. Test with a notch — Playwright can emulate one.

### 6. Books you can hit and read (M6)

Raycast tolerance for coarse pointers, and reconsider the arrival framing so
spines are legible. **Changing shelf or room layout for mobile is explicitly
sanctioned** by the owner — take that latitude if it is what makes the shelf
readable, but keep desktop unchanged unless the change is tested as better
there too.

### 7. Tell them they can look around (M10)

A one-time, dismissible hint on touch devices — "drag to look around" — and
something that makes leaving a close-up obvious. Do not add a permanent
chrome element; the shop's restraint is part of it.

---

## Verification — this is where the work is proved

Nothing here is done because it looks done. Every item above gets a check:

- **Doors**: the ndc test, ≥5 rooms, portrait **and** landscape.
- **Drag**: camera yaw changes on a 240px drag; a <8px touch still opens the
  book under it; a drag ending over a book does **not** open it.
- **Tap targets**: zero visible controls under 44×44, excluding the
  visually-hidden a11y mirror (it is screen-reader-only and 20px by design —
  do not "fix" it).
- **Overlays**: each one opens and closes by the visible control, by scrim,
  and by swipe if implemented — on touch, with no keyboard.
- **Safe areas**: no control under the notch or home indicator.
- **No horizontal page scroll** at 320px, 390px and 430px wide.
- **Regression**: `npm run qa` passes; desktop screenshots unchanged where
  no desktop change was intended.
- Test at **320×568** (smallest realistic), **390×664**, **430×932**, and
  **landscape 844×390** — landscape is a genuinely different problem and is
  currently untested.
