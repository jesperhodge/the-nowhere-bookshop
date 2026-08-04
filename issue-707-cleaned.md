# [FE] Guard the Competency Management route by taxonomy type (redirect non-Competency taxonomies)

**Repo:** `frontend-app-authoring` (Studio MFE).

Check the taxonomy's type when the Competency Management route is entered: render the page
for a Competency taxonomy, silently redirect anything else to that taxonomy's detail page.

**Prerequisite:** #618, the backend taxonomy-type plumbing. The guard has nothing to read
until the type is a real value on the taxonomy-detail response.

## Use Case

As a user who reaches the Competency Management page's URL for a taxonomy that is not a
Competency type (a typed URL or a stale link), I want to be taken to where I can actually
view that taxonomy instead of a competency page that doesn't apply to it, so that I'm not
stranded on an irrelevant screen.

## Description

**Background**

A taxonomy in Studio is a named tree of tags, and taxonomies carry a **type**: Tag or
Competency. The Competency Management page (#680) exists only for Competency taxonomies, but
its route takes any taxonomy id.

**Current state**

#680 builds the Competency Management page at `/taxonomy/:taxonomyId/competencies`, which is
only meaningful for Competency-type taxonomies. Nothing prevents a user from reaching that
route with a non-Competency taxonomy id, whether by a hand-typed URL or a stale bookmark.

The sibling taxonomy-detail page already establishes the fetch-and-gate pattern this guard
extends; see Technical Details.

**Requested change**

On entering the `/taxonomy/:taxonomyId/competencies` route, resolve the taxonomy's type:

- If it is a **Competency** taxonomy, render #680's page as normal.
- If it is **not**, **redirect** the user to where they can view that taxonomy — the taxonomy
  detail / editing page (`/taxonomy/:taxonomyId`).
- While the type is still resolving, render the shared `Loading` spinner, the same one
  `TaxonomyDetailPage.jsx` shows for its own fetch. Do not flash the competency page before
  redirecting, and do not redirect before the type is known.

No dedicated error page — this is a silent, immediate redirect.

**How this ticket relates to its neighbors**

| Ticket | Owns | Relationship to this ticket |
| --- | --- | --- |
| #618 | The backend taxonomy type on the detail response | **Prerequisite.** Nothing to read without it |
| #616 | The taxonomy-type field on the frontend `TaxonomyData` and its Competency predicate | **Peer, not blocker.** Both consume #618; coordinate on the field and predicate names so the two land compatibly, rather than sequencing behind it |
| #680 | The Competency Management page and route this guard wraps | Must exist first |
| #663 | The "Apply Competencies" entry point, surfaced only for Competency taxonomies | Why normal navigation never reaches this case; this guard covers direct and stale URLs |
| #706 | The import button on #680's page | Unrelated surface |

**Explicitly out of scope**

- Building the Competency Management page and its competency tree (#680).
- The "Apply Competencies" entry point (#663) and the "Import Competency Framework" button
  (#706).
- The taxonomy-type field itself and its backend plumbing: the frontend field is #616, the
  backend is #618. This ticket only reads the type, it doesn't build it.
- Behavior for a taxonomy id that does not exist or the user cannot access. That is an error
  case, not a redirect case, and it reuses whatever the taxonomy-detail page already does for
  the same failure.
- Any change to the shared `Loading` component or to `useTaxonomyDetails`.

## Acceptance Criteria

Frontend/QA-testable.

    Scenario: A Competency taxonomy renders the page
      Given a Competency-type taxonomy
      When a user opens /taxonomy/:taxonomyId/competencies for it
      Then the Competency Management page renders normally

    Scenario: A non-Competency taxonomy is redirected
      Given a taxonomy that is not a Competency type
      When a user opens /taxonomy/:taxonomyId/competencies for it
      Then they are redirected to that taxonomy's detail/editing page (/taxonomy/:taxonomyId)
      And the Competency Management page is not shown

    Scenario: No flash while the type is resolving
      Given the taxonomy's type has not yet loaded
      When the route is entered
      Then the same loading spinner the taxonomy detail page uses is shown
      And neither the competency page nor the redirect fires until the type is known

    Scenario: An inaccessible or missing taxonomy is not redirected
      Given a taxonomy id that does not exist or that the user cannot access
      When a user opens /taxonomy/:taxonomyId/competencies for it
      Then the same error state the taxonomy detail page shows for that id is shown
      And no redirect to the taxonomy detail page occurs

    Scenario: Redirect does not trap the back button
      Given a user was redirected away from the competency route
      When they use the browser back button
      Then they are not bounced back into an immediate redirect loop

## Open Questions

- **[BLOCKING, owner: implementer + #680's author]** Does the guard live inside #680's page
  component, or in a wrapper element around the route? Both satisfy the Acceptance Criteria,
  but they produce different files and a different relationship to #680. Decide with #680's
  author, since the answer determines whether this ticket edits #680's component or only the
  route config.
- **[owner: implementer + #616's author]** What are the taxonomy-type field's name and the
  Competency predicate's name? See the peer relationship with #616 in the table above.

## Technical Details

Resolve the taxonomy for `:taxonomyId` via the existing taxonomy-detail query
(`useTaxonomyDetails`) and read its type using #616's predicate. Follow
`TaxonomyDetailPage.jsx`'s existing gate order, inserting the type check as a third gate:
not-yet-fetched renders `Loading`, error-or-missing renders the detail page's error state,
non-Competency redirects, Competency renders. The ordering is what satisfies both the
no-flash and the errors-are-not-redirects criteria.

One thing to know going in: #680's page loads the taxonomy's *tags*, not the taxonomy
itself, so adding this guard introduces a second query on the route. That is expected, and
the detail query is already cached for anyone arriving from the taxonomy pages.

### Example Resolution Prompt

> In `frontend-app-authoring`, add the taxonomy-type guard to the Competency Management route
> as described in this ticket's Technical Details and verified by its Acceptance Criteria.
> **Settle the Open Questions first** — where the guard lives is a real choice with #680, and
> the field and predicate names come from #616. Model the gate ordering on
> `src/taxonomy/taxonomy-detail/TaxonomyDetailPage.jsx`. The subtle requirements are that a
> missing or inaccessible taxonomy must produce an error, not a redirect, and that neither
> the page nor the redirect may fire before the type is known — cover both in the tests.

## Context

Read before starting:

- `src/taxonomy/taxonomy-detail/TaxonomyDetailPage.jsx` — the fetch-and-gate pattern this
  guard extends, and the error state to reuse for a missing or inaccessible id.
- `src/generic/Loading.tsx` — the shared spinner: a Paragon `Spinner` centered in a
  full-viewport-height flex container with a translated screen-reader label.
- `src/taxonomy/data/apiHooks.ts` — `useTaxonomyDetails`.
- `src/index.jsx` — route registration, if the guard ends up being a route wrapper.
- Related tickets: #616, #618, #663, #680, #706 (see the table in the Description).

## Files to create and modify

**Modified files**

| File | Nature of modification |
| --- | --- |
| #680's Competency Management page component, or the taxonomy route config | Whichever the Open Question settles on: add the type gate, rendering the page for a Competency taxonomy and redirecting otherwise |
| co-located RTL tests | Competency renders; non-Competency redirects to `/taxonomy/:taxonomyId`; unfetched shows `Loading`; errored or inaccessible id shows the error state rather than redirecting; no back-button loop |
