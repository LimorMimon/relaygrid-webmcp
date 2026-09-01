# RelayGrid — Verified QA Results

The verified experience supports the submission's central claim: ChatGPT builds a schema-grounded query, while RelayGrid deterministically filters, previews, executes, audits, and reverses actions in the same live interface.

## Automated checks

- Production build succeeds.
- Lint succeeds with no errors or warnings.
- Nested AND/OR/NOT queries are deterministic.
- Contradictory filters safely return zero matches.
- Invalid fields, operators, and empty groups are rejected.
- All 12 combinations of four statuses and three actions follow the transition table.
- Pending records with warnings cannot be approved before review.
- Preview planning does not mutate records.
- Execute applies the exact saved Preview plan.
- Visible-batch plans are capped at 50 records and preserve every record outside the batch.
- After executing a batch, the next eligible records are selected from the remaining query matches without skipping.

## Browser and WebMCP checks

- In a controlled browser harness that provides `document.modelContext`, all six WebMCP tools register successfully and can be invoked through the page's published schemas. Native discovery in ChatGPT Site tools requires a supported ChatGPT account and environment and was not available in this test session.
- The six-step Judge Demo Guide identifies the primary flow as **Main scenario — Filter → Verify → Approve → Next batch → Undo** and starts at Step 1.
- All four guide tabs track successful WebMCP calls: completed steps show green checks, the next step is blue, future steps are gray, and Reset clears the counters.
- The guide is a sticky right-side progressive stepper: only the current prompt expands, the grid remains near the top of the work surface, and a compact live Preview summary appears beside it.
- The **How WebMCP works** control exposes the schema → grounded AST → tool call → validation → shared GUI flow and responsibility breakdown without leaving the worklist.
- The guide uses compact tabs with **Main scenario** selected by default. Review, Cancel, and Negative test each replace the visible progressive stepper. Only the current card expands with its full-width **Copy to chat** button, prompt, and expected result. The Review scenario starts with a replacement query that selects warning or follow-up records before Preview, then demonstrates `Pending → Needs Review → Approved`.
- All four scenario tabs provide a hand cursor, visible hover and keyboard-focus feedback, and descriptive hints, including the Main scenario's complete **Demonstrates grounded filtering...** explanation.
- Review and Cancel start with distinct multi-column filters containing nested OR choices, date ranges, exclusions, flags, priority, and sorting rather than generic Pending-only queries.
- Applying the demo query advances the guide to Step 2, **Verify one result**.
- Explaining the first visible record displays its matched conditions without changing data and advances the guide to Step 3.
- Creating an Approve Preview advances the guide to Step 4 and displays **PREVIEW — NO CHANGES MADE** with exact counts.
- Preview before filtering is rejected with: `Apply a filter before previewing a batch action.`
- The **Negative test — invalid input** marks gibberish as unclear and returns `understood: false`, `noChangesMade: true`, example prompts, and the visible **Request not understood — no changes made** notice.
- Execute without a current Preview, Execute without explicit confirmation, Explain before filtering, Explain for a non-visible record, and Undo with no audit entry are rejected.
- Confirmed execution changes only allowed records in the current visible batch, creates an audit entry, and exposes the next eligible batch plus Undo.
- Undo restores the previous record state.
- Flag badges use high-contrast text, backgrounds, and borders for Warning and Follow-up; records without flags show a visible dash.
- **Reset session** restores the original records and clears query, Preview, audit, query history, selection, notices, and guide progress so the guide returns to Step 1. It is optional within one scenario; when switching to another independent scenario, the contextual **Reset & start this scenario** control isolates the new run and restores deterministic starting data.
- The primary **Reset session** control is visibly button-shaped and remains clickable in both active and clean sessions, with a state-specific hint. The contextual **Reset & start this scenario** control appears after query, Preview, selection, audit, notice, or guide-progress state when the scenario changes. Both controls provide a hand cursor, hover feedback, keyboard-focus feedback, and descriptive hints.

## Verified deterministic examples

- A Pending record without a warning can move to Approved.
- A Pending record with a warning remains Pending when Approve is previewed and reports that review is required.
- The same warning record can move to Needs Review with Send to Review.
- Pending or Needs Review records can move to Cancelled.
- Approved and Cancelled records remain protected from all batch actions.

All records are synthetic, and refreshing the page resets the demo session.
