# [FE] Import Competency Framework button on the Competency Management page

**Repo:** `frontend-app-authoring` (Studio MFE), `src/taxonomy/`.

Add an "Import Competency Framework" action to the Competency Management page's toolbar. It
opens Studio's existing import wizard on its create-new path with the taxonomy type
pre-selected to Competency and locked.

**Blocked by #614** (backend accepts and persists a taxonomy type on import), **#615**
(the Taxonomy Type control this ticket presets and locks), and **#680** (the page this
button sits on). All three are load-bearing: presetting the type in the frontend does
nothing unless the backend persists it.

## Use Case

As a curriculum author managing a competency taxonomy on the Competency Management page, I
want to import a competency framework from that page with the taxonomy type already set to
Competency, so that I don't have to leave for the general Taxonomies list "Import" action.

## Description

**Background** (if you are new to this area, start here)

- A **taxonomy** is a named tree of tags. A **competency taxonomy** is one whose tags
  represent competencies. Taxonomies carry a type (Tag or Competency), which #614/#615 are
  adding to the import path.
- Studio already has one import wizard, `ImportTagsWizard`, serving two different jobs
  depending on a `reimport` flag the caller passes:
  - **create-new** (from the Taxonomies list "Import" button): `upload` → `populate` steps,
    then `POST .../taxonomies/import/`. Creates a brand-new taxonomy. This is the path this
    ticket reuses.
  - **re-import** (from a taxonomy's Actions menu): `export` → `upload` → `plan` → `confirm`,
    then `PUT .../taxonomies/{id}/tags/import/`. Replaces tags in an existing taxonomy. Not
    touched here.
- The **Competency Management page** (#680) is where this button lives.

**Current state**

The create-new import wizard collects only a taxonomy name and description. There is no
taxonomy type anywhere in the code today: `TaxonomyData` has no type field, the populate step
renders no type control, and the create-new payload carries none. #615 adds that control and
#614 makes the backend accept it.

That create-new path also has known rough edges: an unsupported file is rejected silently
with no message, the Import action requires both name *and* description, and on failure the
wizard closes and unmounts, surfacing a page-level "Import error" alert carrying the raw Axios
string rather than the backend's message, with no way to fix and retry. All of that is shared
with the Taxonomies list "Import" button. This ticket inherits it unchanged.

**Requested change**

Add an "Import Competency Framework" action to the Competency Management page's header
toolbar. It opens `ImportTagsWizard` on its **create-new** path with the type control
(#615's) pre-selected to Competency and disabled. On success it creates a brand-new
Competency taxonomy and navigates the user to *that new taxonomy's* Competency Management
page.

Note the shape of this deliberately: the button sits on taxonomy A's page and produces
taxonomy B, then moves the user to B. That is intended — it is the "import a framework"
action, not "add to this taxonomy," which is what the re-import path is for.

**Failure handling is parity, not improvement.** Because this entry point reuses
`ImportTagsWizard` and the create-new mutation unchanged, every failure case behaves exactly
as it does from the Taxonomies list, including the rough edges above. The one difference is
where the user lands: the Competency Management page they started on, not the Taxonomies
list. Do not "fix" the shared failure behavior here.

**How this ticket relates to its neighbors**

| Ticket | Owns | Relationship to this ticket |
| --- | --- | --- |
| #614 (BE) | Making the import endpoint accept and persist a taxonomy type | **Hard blocker.** Without it, presetting the type is inert |
| #615 (FE) | The Taxonomy Type control in the wizard's populate step | **Hard blocker.** This ticket presets and locks that control |
| #680 | The Competency Management page and its toolbar | **Hard blocker.** This button sits on it |
| #663 | The entry point that reaches #680's page | Unrelated surface |
| #707 | The taxonomy-type guard on #680's route | Unrelated surface |

**Explicitly out of scope**

- Building #680's page, route, or competency tree, and #663's entry point into it.
- #614's and #615's own work: the type field's shape, adding it to `TaxonomyData`, rendering
  the control, and persisting it. This ticket only presets and locks that control.
- Any change to the wizard's re-import path, its file parsing, or the import backend.
- Letting the user pick a type other than Competency from this entry point.
- Improving the shared import failure UX: surfacing the backend's real error message,
  keeping the wizard open on error, or adding a rejected-file message. All shared with the
  Taxonomies list "Import" button and belonging in its own ticket.

## Acceptance Criteria

Frontend/QA-testable.

    Scenario: Button is visible on the Competency Management page
      Given I am on the Competency Management page for a taxonomy
      And I have permission to create taxonomies
      Then I see an "Import Competency Framework" action in the page's action toolbar

    Scenario: Button is hidden without create-taxonomy permission
      Given I am on the Competency Management page for a taxonomy
      And I do not have permission to create taxonomies
      Then I do not see the "Import Competency Framework" action

    Scenario: Clicking the button opens the import wizard with type locked to Competency
      Given I am on the Competency Management page for a taxonomy
      When I select "Import Competency Framework"
      Then the import wizard opens on the upload step
      And no export/plan/confirm steps are shown
      When I proceed to the populate step
      Then the taxonomy-type field shows "Competency" and is disabled

    Scenario: Successful import creates a new taxonomy and navigates to it
      Given I have opened the import wizard from "Import Competency Framework"
      And I have uploaded a valid framework file
      And I have entered both a taxonomy name and a description
      When I confirm the import
      Then a new taxonomy of type Competency is created
      And I am navigated to that new taxonomy's Competency Management page

    Scenario: Cancelling the wizard makes no changes
      Given I have opened the import wizard from "Import Competency Framework"
      When I close the wizard without completing it
      Then no taxonomy is created
      And I remain on the original taxonomy's Competency Management page

Failure cases.

    Scenario: Import button stays disabled until name and description are both entered
      Given I have opened the import wizard from "Import Competency Framework"
      And I have uploaded a valid framework file
      When I fill in only the taxonomy name
      Then the Import action remains disabled
      And it becomes enabled only once the description is also filled in

    Scenario: Unsupported file type is silently rejected
      Given I have opened the import wizard from "Import Competency Framework"
      When I select a file that is not .csv or .json
      Then the upload step's continue action remains disabled
      And no import request is sent
      And no explanatory message is shown, matching the Taxonomies list behavior

    Scenario: Import cannot be double-submitted
      Given I have uploaded a valid file and entered a name and description
      When I confirm the import
      Then the Import button shows its pending state
      And the dialog cannot be interacted with until the request settles
      And exactly one POST to the import endpoint is made

    Scenario: Backend rejects the import
      Given I have opened the import wizard from "Import Competency Framework"
      And the import endpoint will return an error
      When I confirm the import
      Then the wizard closes
      And a dismissible page-level alert titled "Import error" appears
      And no new taxonomy is created
      And I remain on the original taxonomy's Competency Management page
      And I am not navigated anywhere

    Scenario: Retrying after a failed import starts over
      Given an import from "Import Competency Framework" has just failed
      When I select "Import Competency Framework" again
      Then the wizard opens on the upload step with no file selected
      And the name and description fields are empty
      And the taxonomy-type field is again pre-set to "Competency" and disabled

    Scenario: Import fails because the file itself is invalid
      Given I have uploaded a .csv or .json file the backend cannot parse
      When I confirm the import
      Then the same failure handling applies as for any other backend error
      And no partially populated taxonomy is left behind

## Open Questions

- **[BLOCKING, owner: implementer + #615's author]** What is the taxonomy-type field's name
  and value shape, and what prop shape should `ImportTagsWizard` expose so a caller can
  pre-fill and lock it (e.g. `initialTaxonomyType` + `lockTaxonomyType`, or one combined
  prop)? Agree this with #615 before implementing; the prop is a small shared contract and
  both tickets touch the same component.
- **[BLOCKING, owner: implementer]** Where does this page get the create-taxonomy
  permission from? The Taxonomies list reads `canAddTaxonomy` off the taxonomy **list**
  response, but this page fetches a single taxonomy, so that flag is not obviously available
  here. Confirm the source before writing the visibility check; if it is not available, this
  needs a decision (extra query, or a backend field on the detail response).
- **[owner: implementer]** What is #680's actual page component path, and does its toolbar
  already exist? Confirm against #680 rather than assuming the placeholder names in the
  Files table below.

## Technical Details

**Data Structures**

Nothing new beyond the optional prop added to `ImportTagsWizard` for the locked type (shape
pending, see Open Questions). The type field itself is #615's contract.

**Logic**

Render `ImportTagsWizard` from the Competency Management page with **no `taxonomy` and no
`reimport` prop** — that is what selects the create-new path, exactly as the Taxonomies list
does — plus the new locked-type prop. Existing callers that omit the prop are unaffected.

Four decisions to respect:

- **Navigate on success only.** Do the navigation after the create mutation resolves, using
  the new taxonomy's id from the response. Never navigate from the wizard's `onClose`, which
  also fires on failure.
- **Hide the action without permission**, per the Acceptance Criteria. Note this differs from
  the Taxonomies list, which *disables* its Import button rather than hiding it.
- **Leave the create-new failure path untouched.** Its existing catch-and-close behavior,
  page-level alert, and generic error message are the required parity baseline. Do not add a
  local error handler, do not keep the modal open on error, and in particular do not wrap the
  create-new mutation's errors the way the re-import hooks do — that would change the
  Taxonomies list flow too and break an existing test that pins the generic message.

New copy goes through `defineMessages`. Follow the `import-tags` components' existing
`data-testid` convention, and model tests on `ImportTagsWizard.test.jsx`'s existing
success/error parameterized pattern, with the error case asserting the alert fired and that
no navigation happened.

### Example Resolution Prompt

> In `frontend-app-authoring`, add the "Import Competency Framework" action to the Competency
> Management page as described in this ticket's Technical Details and verified by its
> Acceptance Criteria. **Resolve the Open Questions first** — the type field and prop shape
> come from #615, and the permission source for this page is genuinely unsettled. The Context
> section lists the wizard, the two import hooks, and the Taxonomies list caller to model on;
> the central constraint is that you reuse the create-new path *unchanged*, including its
> failure behavior, and add only an optional prop that existing callers can ignore. Read the
> "parity, not improvement" paragraph in the Description before changing anything in
> `import-tags`.

## Context

Read before starting:

- `src/taxonomy/import-tags/ImportTagsWizard.jsx` — the shared wizard. The `reimport` prop
  is what branches create-new from re-import; the populate step is where #615's type control
  lands and where this ticket locks it.
- `src/taxonomy/TaxonomyListPage.tsx` — the existing create-new caller. Model the wizard
  props on it, and note it *disables* rather than hides its Import button.
- `src/taxonomy/data/apiHooks.ts` — `useImportNewTaxonomy` (create-new) versus
  `useImportTags`/`useImportPlan` (re-import). They differ in error wrapping, deliberately;
  see Technical Details.
- `src/taxonomy/TaxonomyLayout.tsx` — renders the page-level "Import error" alert above the
  page, which is where import failures surface.
- `src/taxonomy/taxonomy-detail/TaxonomyDetailPage.jsx` — the `SubHeader`/`ActionRow` toolbar
  convention to fall back on if #680 has not defined its own.
- `src/taxonomy/import-tags/ImportTagsWizard.test.jsx` — the test pattern to follow, and the
  test that pins the current generic error message in place.
- Related tickets: #614, #615, #663, #680, #707 (see the table in the Description).

## Files to create and modify

**Modified files**

| File | Nature of modification |
| --- | --- |
| #680's Competency Management page component *(confirm path)* | Add the toolbar action; render the wizard on its create-new path with the locked type |
| #680's `messages.ts` *(confirm path)* | Label for the action |
| `src/taxonomy/import-tags/ImportTagsWizard.jsx` | Add the optional pre-fill-and-lock prop for the type control |
| `src/taxonomy/import-tags/messages.ts` | Copy for the locked-type state, if any is needed |
| `src/taxonomy/data/apiHooks.ts` | Only if #615 has not already wired the type through the create-new payload |
