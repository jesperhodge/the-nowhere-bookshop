# Plan — overlays that scroll as one thing on a phone

Reported by the owner from the deployed iteration 3: open a book on a phone
and you cannot read it. Measured at iPhone SE (320×568), book panel open:

| section | % of viewport |
|---|---|
| `.hold` — the cover | **56%** |
| `.bd__meta` — title, author, facts | 20% |
| `.bd__scroll` — blurb, note, sample links, tags | **6%** |
| `.bd__buy` | 56% |
| `.bd__nav` | 11% |

`.bd__scroll` is a **35px window holding 951px of content** — a 27:1 ratio,
which is the "one or two lines" the owner saw. The percentages sum past 100
because the fixed furniture overflows the box it is in.

## Root cause, and it is one pattern repeated four times

`.overlay__body` is `max-height: 92vh; overflow: hidden; display: flex;
flex-direction: column`, and every overlay puts a scrolling child inside it:

```
.bd__scroll     flex: 1 1 auto; overflow-y: auto     the book panel
.find__results  overflow-y: auto; max-height: 60vh   search
.plan__body     overflow: auto                       the shop plan
.parcel__body   overflow: auto                       the parcel
```

On a tall desktop window there is enough height left over that the inner
window is comfortable. On a short phone the fixed furniture — cover, title
block, buy bar, prev/next — takes it all, and the inner window collapses to a
sliver. **The content that matters is the only part that shrinks.**

## The rule

> **On a phone, an overlay is one scrolling document. No inner scroll
> regions, no fixed or absolutely-positioned sections competing for height.**

You scroll the sheet; everything moves together; nothing is pinned but the
close control.

## What to build

1. **The book panel, mobile:**
   - cover down to **~20vh** (from 56%)
   - the whole sheet scrolls as one document — retire `.bd__scroll`'s inner
     `overflow-y` on mobile and let `.sheet__body` itself scroll
   - `.bd__buy` and `.bd__nav` join the flow rather than holding fixed height.
     If the buy button is worth keeping reachable, a single sticky element is
     acceptable — but only one, and it must not be able to squeeze the text.
   - the close control stays reachable at all times
2. **The other three overlays** — shelf, plan, search, parcel: same rule.
   `.overlay__body`'s `max-height: 92vh` + `overflow: hidden` is the thing
   forcing an inner scroller; on mobile let the sheet be as tall as its
   content and scroll the whole thing.
3. **Desktop is fine and stays as it is** unless a change is clearly better
   there too. This is a mobile-shaped problem.

## Verification

Test at **320×568 and 375×667** (both iPhone SE generations), plus 390×664
and 430×932.

- Open a book: the description is readable **without pinching or fighting a
  35px window**. Report the new percentage split.
- Scrolling the sheet anywhere scrolls the whole sheet — no scroll trap where
  a child eats the gesture.
- Every overlay: open, scroll to the bottom, close by the visible control.
- The close control is reachable at every scroll position.
- No horizontal scroll at 320px.
- `npm run qa` passes (it passed clean at `c3bdb53` — a failure is new).
- Desktop screenshots unchanged.
