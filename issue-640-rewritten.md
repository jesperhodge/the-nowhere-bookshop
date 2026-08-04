# #640 CBE app foundation + CompetencyTaxonomy model

> Paste-ready replacement body for https://github.com/openedx/openedx-core/issues/640.
> The current body on #640 is a duplicate of #641 (criteria models). The title was always
> correct; only the body was wrong. Ticket 1's scope below was never written into any issue.

## Description

**Parent:** #613. This ticket is the foundation of the three-way split: it creates the Django
app the CBE models live in and the single model that both follow-up tickets depend on,
`CompetencyTaxonomy`. See #613 for full background, [ADR-0001](https://github.com/openedx/openedx-core/blob/main/docs/openedx_learning/decisions/0001-competency-criteria-location.rst)
for app placement, and ADR-0002/ADR-0003 for the model.

Nothing else can start until this merges: #641 needs the app to exist and needs
`CompetencyTaxonomy` for `CompetencyRuleProfile.competency_taxonomy_id`; #642 needs the app to
exist. Once this is in, #641 and #642 can be developed in parallel.

## What to build

**1. The `openedx_learning` umbrella app and the `cbe` applet**

ADR-0001 places CBE at `src/openedx_learning/applets/cbe/`, inside a new top-level
`openedx_learning` app that aggregates its applets into one Django app and Python API, the same
way `src/openedx_content` does today. That umbrella package **does not exist in this repo yet** —
ADR-0001 assumed the Learning Pathways workstream would have created it, and it hasn't. So this
ticket creates it:

- `src/openedx_learning/__init__.py`, `src/openedx_learning/apps.py` — one `AppConfig` for the
  whole app (`name`/`label` = `openedx_learning`), mirroring `ContentConfig` in
  `src/openedx_content/apps.py`. Individual applets do not get their own `apps.py`.
- `src/openedx_learning/applets/__init__.py`
- `src/openedx_learning/applets/cbe/__init__.py`, `models.py` (or `models/`), `admin.py`
- `src/openedx_learning/applets/cbe/migrations/0001_initial.py`

**2. Wire it up**

- Add `"openedx_learning"` to `INSTALLED_APPS` in `test_settings.py`.
- Add `openedx_learning` to `root_packages` in `.importlinter`, and place it in the
  `src_layering` contract **above** `openedx_tagging`. The constraint that matters (agreed in
  #613's comments and consistent with #614): the CBE applet may depend on `openedx_tagging`;
  `openedx_tagging` must never depend on or know about CBE.

`django-simple-history` needs no requirements work: `django-simple-history==3.12.0` is already in
`requirements/base.txt`. #613's Technical Notes say "add if not already present" — it is present.

**3. `CompetencyTaxonomy`**

Per ADR-0002 Decision 1, a Django multi-table-inheritance subclass of `openedx_tagging`'s
`Taxonomy`, marking a taxonomy as CBE-enabled:

```python
class CompetencyTaxonomy(Taxonomy):
    ...
```

- `taxonomy_ptr_id` is both the PK and the one-to-one FK to `oel_tagging_taxonomy.id`. It is
  created implicitly by MTI — **do not declare it manually**.
- Not a `taxonomy_type` column on `oel_tagging_taxonomy`. The ADR rejected that.
- No `HistoricalRecords()`. ADR-0003 Decision 2 explicitly excludes `CompetencyTaxonomy`,
  `oel_tagging_taxonomy`, and `oel_tagging_tag` from `django-simple-history`.

## Acceptance criteria (from #613)

Copied verbatim from #613; only the ones this ticket is responsible for.

- [ ] `CompetencyTaxonomy` uses Django MTI (not a `taxonomy_type` column); `taxonomy_ptr_id` is both the PK and FK to `oel_tagging_taxonomy.id`
- [ ] `django-simple-history` is **not** applied to `oel_tagging_tag`, `oel_tagging_taxonomy`, or `CompetencyTaxonomy`
- [ ] No columns exist on any model that are not defined in the ADRs
- [ ] All FK relationships match the ADR definitions exactly

## Additional acceptance criteria (from splitting this out of #613)

Not in #613 verbatim; needed because #613 was split into three tickets.

- [ ] The app exists at `src/openedx_learning/applets/cbe/` per ADR-0001, with a single
      `AppConfig` for `openedx_learning`, and is registered in `test_settings.py`
      `INSTALLED_APPS`.
- [ ] `.importlinter` is updated: `openedx_learning` added to `root_packages` and placed in
      `src_layering` above `openedx_tagging`. `lint-imports` passes. The rules are not loosened
      to make it pass.
- [ ] `migrations/0001_initial.py` creates the `CompetencyTaxonomy` table and applies cleanly
      against an empty database. (#613's "apply cleanly from scratch" is verified end-to-end
      across the three merged tickets.)
- [ ] `CompetencyTaxonomy` is annotated `.. no_pii:`. This is this ticket's slice of #613's
      PII-annotation AC; the full `make pii_check` 100%-coverage gate is verified in #642.
- [ ] **No** index from ADR-0002 Decision 5 lands in this ticket: none of them target
      `CompetencyTaxonomy`. Called out so the whole-feature "all indexes present" gate (verified
      in #642) isn't read as a miss here.

## Open questions to confirm before starting

1. **Does this ticket really create the `openedx_learning` umbrella app?** ADR-0001 defers that
   to the Learning Pathways workstream, which has not started and has no date. The alternative,
   putting CBE under `openedx_content/applets/`, was explicitly rejected by ADR-0001 (Alt 3)
   because it would couple the authoring-only `openedx_content` app to `AUTH_USER_MODEL` and
   runtime learner-status concerns. Creating the umbrella here is the ADR-compliant reading, but
   it is more work than "add an applet" and should be confirmed.
2. **`taxonomy_overrides_org`.** The current ADR-0002 on branch `jesperhodge/competency-adr-4`
   adds a `taxonomy_overrides_org` boolean (default `false`) to `CompetencyTaxonomy`, used only
   as the org-vs-taxonomy tiebreak in Decision 4, and read by no code path in this phase. It did
   not exist in the ADR revision this ticket family was written against, and ADR-0004/ADR-0005
   are not yet on `main`. Confirm whether this column is in scope now or lands when that ADR PR
   merges.

## Out of scope

The three criteria models `CompetencyCriteriaGroup`, `CompetencyCriteria`,
`CompetencyRuleProfile` (#641); the mastery-status lookup and learner progress models (#642);
delete protection and `on_delete=PROTECT` (#642); any history tracking; any REST API or UI work.

## Depends on

Nothing. This is the first of the three to merge and unblocks both #641 and #642.
