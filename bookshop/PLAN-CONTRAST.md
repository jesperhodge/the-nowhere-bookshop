# Plan — text contrast that is guaranteed, not hoped for

The owner reports the room descriptions are hard to read. They are right, and
it is worse and more systematic than a styling slip.

## Measured, before anything was changed

A probe that hides every text overlay, screenshots the **real** backdrop, and
computes the WCAG ratio between each text run's computed colour and the worst
background pixel inside its box. Six rooms, 62 text runs:

```
FAIL 37   PASS 25

.placard__kicker     worst 1.00:1  need 4.5  → 6/6 fail
.placard__name       worst 1.00:1  need 3    → 6/6 fail
.placard__line       worst 1.00:1  need 4.5  → 6/6 fail
.placard__count      worst 1.01:1  need 4.5  → 5/6 fail
.crumb               worst 3.29:1  need 4.5  → 6/13 fail
.dock__btn           worst 2.86:1  need 4.5  → 8/24 fail
.hint                worst 6.34:1  need 4.5  → 0/1 pass
```

`1.00:1` means part of the text sits on pixels of identical luminance — that
stroke is not low-contrast, it is *invisible*. `front`'s description crosses
the lamp at `rgb(222,160,73)`; `orrery`'s crosses a pale sky at
`rgb(212,231,244)`.

**Metric note, stated honestly:** this is the worst pixel anywhere in the text's
bounding box, including gaps between glyphs, so it is deliberately conservative
— a stricter bound than "the worst pixel actually under a stroke". That is the
right bound to design against here, and the fix below makes the distinction
moot anyway.

## Why the current approach cannot be fixed by tuning colours

`.placard__name` is `--paper` with `text-shadow: 0 2px 24px rgba(0,0,0,.9)`.
A shadow helps a human eye a little and contributes **nothing** to WCAG
contrast, which is computed between the text colour and the background behind
it. There is no colour you can pick that passes against a backdrop which is
`rgb(20,14,9)` in one room and `rgb(250,226,172)` in another.

**The root cause is structural: you cannot guarantee contrast against a
backdrop you do not control.** The scene's luminance varies by room, by camera
pose, by frame, and will vary again the next time someone changes a light.

## The rule

> **No text is drawn over the canvas without a backdrop this project controls.**

Text either sits on a surface whose colour we set, or it does not float over
the scene at all.

## The arithmetic that makes it a guarantee

Put a plate of colour `P` at alpha `α` behind the text. The composite behind a
glyph is `α·P + (1−α)·S` where `S` is whatever the scene is doing. The scene's
worst case is pure white — the lamp. So solve for the `α` at which the ratio
still passes **even if the entire scene behind the text were white.** Then it
passes in every room, forever, with no measuring.

For `P = #140E09` (a dark warm brown that suits the shop) against a
worst-case white scene:

| text token | α for 4.5:1 | α for 3:1 | on an opaque plate |
|---|---|---|---|
| `--paper` `#efe3cd` | **0.640** | 0.520 | 15.08:1 |
| `--ink` `#f2e6d2` | **0.630** | 0.510 | 15.53:1 |
| `--ink-dim` `#bda98c` | **0.795** | 0.685 | 8.41:1 |
| `--brass` `#d9a44f` | **0.790** | 0.685 | 8.55:1 |
| `--brass-soft` `#b98b3f` | 0.880 | 0.000 | 6.23:1 |

**Design parameter: `α ≥ 0.85` on `#140E09` guarantees AA for every token in
that table except `--brass-soft`.** Retire `--brass-soft` for text over the
canvas — use `--brass`, which is both prettier and cheaper to guarantee.

This is the deliverable: a number that can be checked by arithmetic rather than
by looking at a screenshot.

## What to build

1. **A bounded backdrop for the placard.** The visual treatment is yours to
   choose — a soft-edged plate, a radial scrim, `backdrop-filter:
   brightness()` — subject to one hard constraint: **wherever a glyph can
   land, the effective alpha must be ≥ the value in the table.** A feathered
   plate is fine, but the feather has to happen *outside* the text's box, not
   across it. If you use `backdrop-filter`, prove the bound holds — a filter
   that merely darkens "usually" is the same mistake in a new costume.
   Keep the shop's look; this should read as lamplight pooling behind the
   words, not as a grey box.
2. **`.crumb` and `.dock__btn`** fail too (3.29:1 and 2.86:1). Same rule, same
   treatment — they float over the canvas as well.
3. **Retire `--brass-soft` as a text colour over the scene.**
4. **Audit every other text-over-canvas surface** the probe does not yet cover:
   the door signs, the hover tag, the "no WebGL" notice, the enter overlay,
   and anything in a shelf/table pose. The probe's selector list is a starting
   point, not an inventory — go find them.

## Enforcement, so it cannot regress

`tools/_scratch-contrast.mjs` is the prototype. Productionise it into the QA
suite:

- run over **all 50 rooms**, not six
- at **more than one camera pose** — the backdrop changes when the camera moves
- assert worst-case ratio ≥ 4.5 for normal text, ≥ 3.0 for large (≥24px, or
  ≥18.66px bold)
- fail the suite on any violation, and print the offending room, selector, text
  and the background colour that beat it
- also assert the **static** guarantee: for each text token used over the
  canvas, that the plate alpha in the CSS is ≥ the table's value. That check
  runs without a browser and is the one that actually prevents regressions,
  because it fails the moment someone lightens the plate.

Both checks matter: the arithmetic one proves the design is sound, the rendered
one catches a surface nobody remembered to put on a plate.
