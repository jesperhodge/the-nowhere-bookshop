# Edits for #641 and #642, and the ADR-drift list

Companion to `issue-640-rewritten.md`. #641 and #642 keep their scope; these are surgical fixes.

## #641 — Competency criteria models (keep scope, three fixes)

#641's body is correct for ticket 2 and needs no rewrite. Once #640 carries ticket 1's body, the
duplication is gone. Three fixes:

1. **Fix the scope claim in the Description.** It currently says it "implements the
   'Authoring/Definition Models' section of #613". That section lists four models;
   `CompetencyTaxonomy` is #640's. Replace with: *"implements three of the four models in #613's
   'Authoring/Definition Models' section: `CompetencyCriteriaGroup`, `CompetencyRuleProfile`, and
   `CompetencyCriteria`. `CompetencyTaxonomy` is #640."*

2. **Add the missing FK acceptance criterion.** The dependency on #640 is asserted in "Depends
   on" but never appears as an AC. Add:
   - [ ] `CompetencyRuleProfile.competency_taxonomy_id` is a **nullable** FK to
         `CompetencyTaxonomy.taxonomy_ptr_id` (null when the profile is not scoped to a specific
         taxonomy), per ADR-0002 Decision 3.

3. **Pick one AC style across the three tickets.** #640 (as rewritten) and #642 both use a
   two-section layout: verbatim-from-#613 ACs, then "Additional acceptance criteria (from
   splitting this out of #613)". #641 merges and rewords them into one list. Recommend
   restructuring #641 to match its two siblings: verbatim traceability back to #613 is what makes
   the reviewer's job checkable. #641's condensed wording is more readable but drifts from #613's
   text, which is how a split silently loses an AC.

## #642 — Mastery status + learner progress (three factual fixes)

1. **The Decision 7 gap list is incomplete.** #642's closing note says the gap covers
   "`CompetencyTaxonomy`, `CompetencyRuleProfile`, and `oel_tagging_objecttag`". ADR-0002
   Decision 7 lists six protected tables: `oel_tagging_taxonomy`, `CompetencyTaxonomy`,
   `oel_tagging_tag`, `oel_tagging_objecttag`, `CompetencyCriteriaGroup`, and
   `CompetencyCriteria`. `oel_tagging_taxonomy` and `oel_tagging_tag` are missing from the note.

2. **Wrong source attribution.** "Known open question, flagged in #613's comments" — it is not in
   the comments. It is in #613's Technical Notes: *"Consider whether this should also apply to
   `oel_tagging_objecttag` rows per Decision 7."* Fix the pointer so the reviewer can find it.

3. **Restate the dependency to match the intended shape.** "Depends on Ticket 2 ... and ticket 1.
   This is the last of the three to merge" → *"Can start as soon as #640 is merged, in parallel
   with #641. Must merge after #641, since its `on_delete=PROTECT` FKs point at #641's tables."*
   Worth stating plainly that #642 cannot run its own migrations or tests until #641 lands, so
   the developer should expect a rebase before merge.

## Separate issue: all four tickets are stale against the current ADRs

The tickets were authored 2026-07-06 against ADR-0002/ADR-0003 as of commit `abf6e26`
(2026-05-04). At that revision every number in them checks out — including the "10 indexes" and
the per-ticket index assignments, which were correct as written. ADR-0002/0003 then changed
materially in `b130e49` (2026-07-27, "docs: address PR comments"), which pulled in the
ACTIVE/HISTORY design from the new ADR-0005.

**This drift is independent of the #640/#641 mix-up.** Fix the split first. ADR-0004 and ADR-0005
do not exist on `main` yet, so decide whether to re-sync the tickets now or when that ADR PR
merges. What changed:

| Item | As of 2026-05-04 (what the tickets say) | Current branch ADR |
|---|---|---|
| Decision 5 index count | 10 | 13 |
| Index 9 | `CompetencyRuleProfile(competency_taxonomy_id, course_id, organization_id)` — a criteria-model index, correctly assigned to ticket 2 | renumbered to 12, and now `CompetencyRuleProfile(scope_code)` unique. Index 9 is now `StudentCompetencyCriteriaGroupStatusHistory(...)`, a #642 index |
| Learner status storage | three `Student*Status` tables, append-only, only `created`, no `updated` | paired ACTIVE (updated in place) + HISTORY (append-only) tables, i.e. six tables |
| `CompetencyTaxonomy` columns | `taxonomy_ptr_id` only | adds `taxonomy_overrides_org` boolean, default false |
| `CompetencyRuleProfile` columns | no `scope_code`, no `archived` | adds generated unique `scope_code`, and `archived` boolean |
| Decision 7 | seven protected tables, `CompetencyRuleProfile` among them | six protected tables; `CompetencyRuleProfile` moved to a standing never-hard-delete, archive-only exception |

Knock-on effects if the tickets are re-synced:

- **#613 and #642** are wrong on the biggest item: "Learner status tables use append-only rows
  (only a `created` timestamp, no `updated`); no history package applied" no longer matches the
  ADR. #642's "this ticket creates four new tables" becomes seven, plus three more indexes.
- **New index split** under the 13-entry numbering: criteria models (#641) get 1, 2, 4, 5, 12;
  status and lookup models (#642) get 6, 7, 8, 9, 10, 11, 13; index 3 stays pre-existing
  (`ObjectTag.object_id` already has `db_index=True` in `src/openedx_tagging/models/base.py`);
  `CompetencyTaxonomy` (#640) still gets none.
- **#640** gains `taxonomy_overrides_org`; **#641** gains `scope_code` and `archived`.
- Every "all 10 indexes" phrase in #613 and #642 needs the count corrected. Better: reference the
  ADR revision rather than a count, since Decision 5 states no count of its own.

Also worth a quick fix on the parent: **#613's Technical Notes say to add `django-simple-history`
to `requirements/*.txt` "if not already present"**. It is already present at 3.12.0 in
`requirements/base.txt`, so that line invites busywork in whichever ticket picks it up.
