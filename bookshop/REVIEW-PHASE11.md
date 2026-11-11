# Review — phase 11, the description backfill

Hand-check of the Wikipedia gate, done on the committed run of 301 accepted
descriptions. Sample of 20, drawn evenly across the set.

**19 of 20 correct.** The gate is doing its job: it accepted 301 of 1,105
candidates (27%) and rejected the rest, against an ungated search that was
measured at 1-correct-in-10. Rejecting two thirds is the tool working.

## The one failure mode, and it is specific

**#18 — `Abarat: Days of Magic, Nights of War` (Clive Barker) got the
description for `Abarat` (2002), the *first* book in the series.** The shelf
book is the second.

The gate passed it because both of its tests passed honestly:

- main title matches — the page is titled `Abarat`, the book's title *starts*
  with `Abarat`
- author matches — both are Clive Barker

So a series where later volumes extend the first volume's title defeats a
prefix-based title test. Extrapolating the sample rate, roughly **15 of the
301** are likely wrong in this way.

## What makes it hard, and the constraint on any fix

The obvious fix — reject when the book title has a subtitle the page title
lacks — **breaks a case the gate currently gets right**:

**#8 — `Moneyland: Why Thieves and Crooks Now Rule the World and How to Take
It Back` (Oliver Bullough)** matched the page `Moneyland: The Inside Story of
the Crooks and Kleptocrats Who Rule the World`. Completely different
subtitle, genuinely the same book — the UK and US editions are subtitled
differently. Accepting it is correct.

So the rule cannot be "subtitles must agree" and it cannot be "page title
must equal book title".

## The rule that separates them

Require the book title's **subtitle** to be corroborated somewhere in the
fetched page, not merely absent-and-forgiven:

- if the book's title has no subtitle, behave exactly as now
- if it has one, require that a distinctive word from that subtitle appears
  in either the page title or the extract

Check it against the two cases:

- `Abarat: Days of Magic, Nights of War` — "Days", "Magic", "Nights", "War"
  appear nowhere in the `Abarat` page title or its extract → **rejected**,
  correctly
- `Moneyland: Why Thieves and Crooks…` — "Crooks" appears in the page's own
  title → **accepted**, correctly

Add a second, cheap guard while you are there: if the extract describes the
work as "the first in", "the first novel in", "the first volume of" a series
**and** the book's title carries a subtitle the page lacks, reject. That is
the Abarat signature stated directly.

## What to do

1. Tighten the gate as above in `tools/describe.mjs`.
2. **Re-run only the already-accepted Wikipedia set** (301 books) through the
   new gate — not the whole 1,105. The cache holds every fetched response, so
   this is a re-evaluation, not a re-fetch, and should take seconds.
3. Drop the descriptions that now fail, and report how many were dropped.
4. Hand-check a fresh sample of 20 from whatever survives, and report the
   count correct out of 20. If it is not 20/20, say so and say why.

Do not widen the gate to recover the dropped ones. A book with no description
is fine; a book confidently wearing another book's description is the thing
this whole file exists to prevent.
