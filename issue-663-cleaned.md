# [FE] Add "Apply Competencies" entry point to the taxonomy card menu and footer

**Repo:** `frontend-app-authoring` (Studio MFE).

Add an "Apply Competencies" action to each Competency-type taxonomy card on the Taxonomies
page, as a menu item and as a footer button, both navigating to that taxonomy's Competency
Management page.

**Blocked by #616**, which adds the taxonomy-type field every conditional in this ticket
keys off. `TaxonomyData` has no type field today, so this ticket is ready to develop but
cannot be implemented, demoed, or tested until #616 lands.

## Use Case

As a Studio Admin or Staff user managing a Competency-type taxonomy, I want an "Apply
Competencies" action available directly from the Taxonomies page — as an item in the
taxonomy card's actions menu, and as a standalone card-footer button — so that I can
navigate straight to that taxonomy's Competency Management page in one click, without
confusing this action with the taxonomy tag-editing flow that the unchanged card click
already opens.

## Description

**Background** (if you are new to this area, start here)

- A **taxonomy** in Studio is a named tree of tags, shown as a card on the Taxonomies page.
  Clicking the card opens the Taxonomy Editing page, where its tags are browsed and edited.
- Taxonomies carry a **type**, Tag or Competency. A **competency taxonomy** is one whose
  tags represent competencies rather than free-form tags.
- Competency taxonomies get a second destination of their own, the **Competency Management
  page**, separate from the tag editor. This ticket adds the two ways in.

**Current state**

1. Log in to Studio as an Admin or Staff user and navigate to the Taxonomies page.
2. Each imported taxonomy card shows a three-dot (⋮) actions button.
3. Clicking the three-dot button opens a dropdown with four items, in this order: Re-import,
   Export, Delete, Manage Organizations.
4. Clicking the card body anywhere outside the three-dot button navigates to the Taxonomy
   Editing page (tag browsing/editing) — identical behavior for every taxonomy type.
5. The taxonomy type is not available on the frontend yet. `TaxonomyData` has no type field;
   #616 adds it, along with the visual badge.
6. There is no entry point from a taxonomy card into competency management. Neither the menu
   nor the card click leads to competency criteria authoring today.

**Requested change**

- Card click behavior is **unchanged** for all taxonomy types: it continues to route to the
  Taxonomy Editing page.
- Exactly one new item, **"Apply Competencies,"** is appended to the three-dot menu (final
  order: Re-import, Export, Delete, Manage Organizations, Apply Competencies), rendered only
  when the taxonomy's type is Competency. Tag-type taxonomies keep exactly the original four
  items.
- For Competency-type taxonomies only, the card footer additionally gains a standalone
  "Apply Competencies" button. Both surfaces navigate to the same destination for the same
  taxonomy — no additional taxonomy-selection step.
- Visibility reuses the existing `canChangeTaxonomy` permission already used for "Manage
  Organizations" — no new permission tier.

The label "Apply Competencies" was chosen over "Manage Competencies" during #622's design
review, to distinguish this action from the tag-editing the existing Taxonomy Editor already
does.

**How this ticket relates to its neighbors**

| Ticket | Owns | Relationship to this ticket |
| --- | --- | --- |
| #616 | The taxonomy-type field on `TaxonomyData` and its badge | **Hard blocker.** This ticket is #616's first real consumer |
| #622 | The UX design for this menu and its labels | Design source; read it for the label and click-pattern rationale |
| #680 | The Competency Management page and its route `/taxonomy/:taxonomyId/competencies` | This ticket's navigation destination. Built first |
| #706, #707 | The import button on that page, and its taxonomy-type route guard | Downstream of #680, not touched here |

**Explicitly out of scope**

- The Competency Management page, its content, and its route. #680 owns all of it; this
  ticket only navigates there.
- An "Edit Taxonomy" menu item. Considered during #622's design and explicitly rejected in
  favor of leaving the card click alone.
- Any entry point on the Taxonomy Editing page's own header. Floated during #622's
  discussion but absent from the signed-off mocks; only the Taxonomies list card changes.
- The taxonomy-type field and badge (#616) and its backend plumbing (#618). This ticket
  consumes that data; it does not build it.
- Defensive handling for a Tag-type taxonomy id typed directly into the competency URL. No
  operator-facing path produces that URL for a Tag taxonomy, and #707 owns the guard.

## UX Designs

[Figma link](https://www.figma.com/design/VhAdaucNQS49x0Afp9xPZw/Competency-Application?node-id=1076-12821&t=y4640jJ9EpAXIi0O-4)

<img width="1880" height="718" alt="Image" src="https://github.com/user-attachments/assets/e18e5ea0-ac02-4684-9104-7612eba81918" />

## Acceptance Criteria

    Scenario: Competency-type taxonomy card shows the new menu item
      Given I am logged in to Studio as an Admin or Staff user
      And a taxonomy of type Competency exists on the Taxonomies page
      When I open the taxonomy card's three-dot actions menu
      Then I see five items in order: Re-import, Export, Delete, Manage Organizations, Apply Competencies

    Scenario: Tag-type taxonomy card menu is unaffected
      Given a taxonomy of type Tag exists on the Taxonomies page
      When I open that taxonomy card's three-dot actions menu
      Then I see exactly the original four items
      And "Apply Competencies" does not appear

    Scenario: Card click still opens the Taxonomy Editing page, regardless of type
      Given a taxonomy card of either type exists on the Taxonomies page
      When I click the card body outside the three-dot button
      Then I am taken to the Taxonomy Editing page for that taxonomy, unchanged from before this ticket

    Scenario: Competency-type card shows a footer "Apply Competencies" button
      Given a taxonomy of type Competency exists
      Then its card footer displays an "Apply Competencies" button
      And a Tag-type taxonomy's card footer displays no such button

    Scenario: Menu item navigates to the Competency Management page
      Given a taxonomy of type Competency exists
      When I select "Apply Competencies" from its three-dot menu
      Then I am navigated to /taxonomy/:taxonomyId/competencies for that specific taxonomy, with no extra taxonomy-selection step
      And the page renders a breadcrumb and title; page content beyond that is out of scope for this ticket

    Scenario: Footer button reaches the same destination as the menu item
      Given a taxonomy of type Competency exists
      When I click the card-footer "Apply Competencies" button
      Then I land on the same route and taxonomy scope that the menu item would produce

    Scenario: User without the required permission
      Given I am logged in as a user without `canChangeTaxonomy` permission on a Competency-type taxonomy
      When I view that taxonomy's card
      Then "Apply Competencies" does not appear in the menu or as a footer button, consistent with how "Manage Organizations" is already gated

    Scenario: Small-screen rendering
      Given I view the Taxonomies page on a small screen
      When a Competency-type card renders
      Then the footer button and five-item menu remain usable, consistent with the existing Paragon Card.Footer pattern used elsewhere in this repo (e.g. GalleryCard)

## Open Questions

- **[BLOCKING, owner: implementer + #616's author]** What exact field and predicate will
  #616 add for taxonomy type — the field's name and shape on `TaxonomyData`, and the name of
  the shared `isCompetencyTaxonomy`-style predicate this ticket imports? Both are the literal
  basis of every conditional here, so getting them wrong means revising every file in the
  Files to modify table. Per team decision, coordinate with #616's author now rather than
  waiting for #616 to merge, since this ticket is its first real consumer. Document the
  answers as a comment here before implementation starts.

## Technical Details

**Data Structures**

Nothing new is defined here. This ticket consumes two things #616 introduces: the taxonomy
type on `TaxonomyData`, and a shared predicate for "is this a Competency taxonomy" (names
pending, see Open Questions).

**Logic**

`TaxonomyMenu` builds its dropdown from a `{title, action, show}` map that is filtered down
to the visible entries. Add a fifth entry after `manageOrgs` whose `show` is the competency
predicate and whose `action` navigates to the taxonomy's competency route. `useNavigate` is
already wired up in this file, though every existing menu action opens a modal rather than
navigating, so this is the first navigating item. Extend the component's `taxonomy` prop type
to include the new type field.

`TaxonomyCard` renders a `Card.Header` and `Card.Body` and has no footer today. Add a
`Card.Footer` after the body, rendered only for a Competency taxonomy, holding a button
linking to the same route. `GalleryCard` in `files-and-videos` is the existing in-repo
precedent for Paragon's `Card.Footer`.

Two decisions to respect:

- **One shared predicate, not two comparisons.** Both the menu and the card need the same
  check, and so does #616 for its badge. Import #616's predicate rather than inventing a
  second one; if #616 has not exposed one, agree on it as part of the Open Question above.
- **Do not add the type field yourself.** `src/taxonomy/data/types.ts` is #616's contract.
  This ticket only consumes it.

New strings go through `defineMessages` following the existing
`course-authoring.taxonomy-menu.<action>.label` convention. This is MFE-only: no backend or
`openedx-core` change, no `.importlinter` concern, no cross-feature import. No ADR is
warranted; this is UI wiring, not a new contract.

### Example Resolution Prompt

> In `frontend-app-authoring`, add the "Apply Competencies" entry points to the Taxonomies
> page's taxonomy cards, as described in this ticket's Technical Details and verified by its
> Acceptance Criteria. **First confirm the taxonomy-type field name and the competency
> predicate #616 introduces** (see Open Questions) — every conditional here depends on them,
> and they may not exist in the repo yet. The Context section lists the menu, card, and
> `Card.Footer` precedent to model on. Both entry points must lead to the same route with no
> extra selection step, and Tag-type taxonomies must be provably unchanged, so extend the
> existing menu and card tests with fixtures of both types. Do not touch
> `src/taxonomy/data/types.ts`, the route config, the Competency Management page, or any
> backend code.

## Context

Read before starting:

- **#622** ([UXD] taxonomy actions menu design) — the label rationale ("Apply Competencies"
  over "Manage Competencies") and the decision to leave the card click unchanged.
- **#616** (frontend taxonomy type badge) — confirmed against `frontend-app-authoring`
  master: `TaxonomyData` in `src/taxonomy/data/types.ts` has no type field today.
- **#615** (Taxonomy Type dropdown in the import flow, closed) — likely origin of the
  settable type field #616 surfaces.
- `src/taxonomy/taxonomy-menu/TaxonomyMenu.jsx` and `messages.ts` — the existing four-item
  menu and the i18n id convention.
- `src/taxonomy/taxonomy-card/index.jsx` — the card. `Card.Header` carries `TaxonomyMenu` as
  its actions; `Card.Body` holds the description; there is no footer yet.
- `src/files-and-videos/generic/table-components/GalleryCard.jsx` — existing in-repo
  precedent for Paragon `Card.Footer`.
- `src/taxonomy/TaxonomyLayout.tsx` — the chrome host the taxonomy routes render inside.
- Related tickets: #680, #706, #707 (see the table in the Description).

## Files to create and modify

**Modified files**

| File | Nature of modification |
| --- | --- |
| `src/taxonomy/taxonomy-menu/TaxonomyMenu.jsx` | Add the fifth `menuItems` entry after `manageOrgs`; extend the `taxonomy` prop type with the new field |
| `src/taxonomy/taxonomy-menu/messages.ts` | Add the menu-item label message |
| `src/taxonomy/taxonomy-menu/TaxonomyMenu.test.tsx` | Competency and Tag fixtures; assert conditional render and that selecting the item navigates |
| `src/taxonomy/taxonomy-card/index.jsx` | Add the Competency-only `Card.Footer` with the button |
| `src/taxonomy/taxonomy-card/messages.ts` | Add the footer button label message |
| `src/taxonomy/taxonomy-card/TaxonomyCard.test.jsx` | Competency and Tag fixtures; assert footer button visibility and link target |

Not modified here: `src/taxonomy/data/types.ts` (#616's contract) and the route config
(#680's).
