# RelayGrid — Judge Testing Instructions

> **RelayGrid turns complex enterprise worklists into a shared human-agent control surface: ChatGPT builds a schema-grounded query, while the application deterministically filters, previews, executes, audits, and reverses actions in the same live interface.**

RelayGrid is designed to be controlled from the ChatGPT conversation while the live site is open in ChatGPT's in-app browser. The website does not contain a separate chatbot.

**Public demo video:** https://youtu.be/N6PoXEHrVbA

## Setup

1. Open the live RelayGrid URL in ChatGPT's in-app browser.
2. Confirm the page shows **WebMCP connected**.
3. Enter the prompts below in the ChatGPT conversation, one at a time.
4. Keep RelayGrid visible while testing so each tool call can be compared with the table, interpretation panel, preview, and audit history.

If **WebMCP connected** does not appear, the current ChatGPT account or environment has not exposed Site tools to the page. A text-only ChatGPT response is not a valid WebMCP test; use a supported Site tools environment before continuing.

The live site and source repository are public. Judges do not need a GitHub account, deploy key, access token, or any other project credential.

## Verified WebMCP status

Before submission, all four guided scenarios were run from clean synthetic sessions against the published site using native Chrome WebMCP. `document.modelContext.getTools()` discovered all six published tools, and the scenarios invoked them through `document.modelContext.executeTool()` rather than a mocked browser API. Main completed Filter → Verify → Preview → Execute → Next batch → Undo; Review completed Send to Review → Approve; Cancel completed Cancel → Undo; and the Negative test rejected unsupported input with no changes. The exact calls and deterministic counts are recorded in [QA_RESULTS.md](QA_RESULTS.md).

All records are synthetic. **Reset session** is optional when running a single scenario, and it should not be used during that scenario. When switching to another independent scenario, click **Reset & start this scenario** if it appears before sending the new scenario's first prompt. This is especially important after executing a batch action, because Reset restores the original synthetic dataset and deterministic starting state. If the previous scenario created only a filter or Preview, the next scenario's first query can replace it without changing records, but using the contextual Reset keeps the scenarios isolated. No reset prompt appears in a clean session.

The four scenario tabs, the primary **Reset session** control, and the contextual **Reset & start this scenario** control use a hand cursor, visible hover and keyboard-focus feedback, and a descriptive hover hint. The primary Reset remains clickable even in a clean session; its hint then explains that the session is already at its initial state. The contextual Reset appears only after query, Preview, selection, audit, notice, or guide-progress state exists and the judge switches scenario tabs.

## What WebMCP contributes

Use the on-page **How WebMCP works** button for the same explanation during judging.

1. RelayGrid publishes its real fields, operators, tool schemas, and live context through WebMCP.
2. ChatGPT uses that contract to translate the user's request into a grounded Query AST.
3. WebMCP invokes `apply_query` with that AST inside the active page.
4. RelayGrid validates the AST and its deterministic engine calculates the matches.
5. The shared GUI updates, and the tool result returns the active query and counts to ChatGPT.

ChatGPT could generate generic JSON without WebMCP, but it would not automatically know RelayGrid's exact contract or invoke the live application. WebMCP does not write the AST itself; it grounds its construction and connects it to the shared interface.

## Main scenario — Filter → Verify → Approve → Next batch → Undo

Recommended test time: about two minutes.

The same six prompts are displayed in the site's sticky right-side **Judge Demo Guide**, beside the visible grid. Only the current step expands; completed steps collapse into green checks and future steps remain visible as compact titles. After filtering, Step 2 transparently spot-checks one visible record against the active Query AST before any batch action. Steps 3–4 demonstrate one complete safe batch. Step 5 continues with the next batch; Step 6 can reverse the latest execution.

The guide advances only after the expected WebMCP tool call succeeds. Every scenario uses the same visual state: a green check for completed steps, blue emphasis for the next valid step, gray for future steps, and a completed-step counter in the scenario header. Copying a prompt alone does not mark it complete; Reset clears the progress.

### 1. Inspect and filter

Enter:

> Show pending CT or MRI results from the last 7 days. Exclude urgent cases and records with warnings. Sort oldest first.

Expected result:

- ChatGPT first reads the current worklist with `describe_grid` when needed.
- ChatGPT calls `apply_query` with a structured query.
- The visible table and **Agent interpretation** panel update to the same filter.
- No record status changes.

### 2. Verify one result

Enter:

> Explain why the first visible record matched the active query.

This checks one visible record against the active Query AST and explains which conditions it satisfied. It is a transparent spot-check of the filter before any batch action. It does not change data and does not claim to validate every matching record.

Expected result:

- ChatGPT calls `explain_record` for the first visible record.
- ChatGPT and the site's **Why this record matched** panel show the conditions it satisfied.
- No record status changes.

### 3. Preview an action

Enter:

> Preview approving the current visible batch. Do not execute.

Expected result:

- ChatGPT calls `preview_batch_action` for the single **Approve** action.
- The site shows a prominent **PREVIEW — NO CHANGES MADE** card.
- The preview covers only the 50 records currently shown, even when the filter has thousands of matches.
- It shows exact counts for records moving to **Approved** and records protected from change.
- Nothing is changed yet.

### 4. Execute after confirmation

After checking the preview, enter:

> I confirm. Execute this preview.

Expected result:

- ChatGPT calls `execute_batch_action` with the current preview ID and explicit confirmation.
- Eligible `Pending` records become `Approved`.
- Records that are not eligible remain unchanged.
- An audit entry is created.
- Records outside the visible batch remain unchanged.
- The same filter stays active and the next eligible records automatically fill the visible batch.

### 5. Continue with the next batch

Enter:

> Preview the next batch using the same action. Do not execute.

Expected result:

- ChatGPT creates a new Approve preview for the records now visible.
- The previously executed records are not included.
- The judge may repeat confirmation or continue directly to Undo.

### 6. Undo

Enter:

> Undo the last batch action.

Expected result:

- ChatGPT calls `undo_last_batch`.
- Only the most recently executed batch returns to its previous statuses.
- The table and audit panel update together.

## Optional action tests

Choose the relevant scenario tab in the on-page guide for its ordered, copy-ready prompts. **Main scenario** is selected by default; **Review → Approve**, **Cancel → Undo**, and **Negative test** each replace it without expanding the page. Follow the chosen tab from its first step.

Each step has a numbered position plus a meaningful operation title. The expanded current step places the full-width **Copy to chat** button above its prompt. Every step has its own precise **Expected** result covering visible output, status transitions, Preview safety, Audit creation, or unchanged state as applicable; there is no generic scenario-level outcome. When Preview is active, a compact live summary remains visible at the top of the guide.

| Tab              | Operation titles                                                                                                                                                                                                                                   |https://youtu.be/bKLP4Xd55Ws
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main scenario    | Filter; Verify one result; Preview; Confirm; Next batch; Undo                                                                                                                                                                                      |
| Review → Approve | Show warning and follow-up cases; Verify a warning case; Preview sending cases to review; Send the visible cases to review; Show cases awaiting clinical review; Verify a reviewed case; Preview approval after review; Approve the reviewed cases |
| Cancel → Undo    | Show cancellable X-Ray or Ultrasound results; Verify a cancellable result; Preview cancellation of the visible batch; Cancel the visible results; Restore the cancelled results                                                                    |
| Negative test    | Send invalid input                                                                                                                                                                                                                                 |

Before the first request, the right panel shows only **No active agent query** and the guided-start instructions. After the first tool call, the start card disappears and **Agent interpretation** plus **Current workflow state** appear. **Audit history** appears only after an action executes. Unsupported input shows **Request rejected** and confirms that no records changed. Each scenario has a separate **Demonstrates…** line that explains the capability being tested.

### Verification behavior

Every action scenario includes this immediately after applying or replacing a filter:

> Explain why the first visible record matched.

ChatGPT should call `explain_record`, and the explanation should refer to the active query conditions. Before filtering, the same request must be rejected with a message instructing the user to filter first.

### Refine

After applying the main filter, enter:

> Keep the current filters, but only include patients aged 18 or older.

The existing conditions should be preserved, the age condition added, and the prior query saved in query history.

### Cancel

Enter these prompts in order:

> Show routine pending X-Ray or Ultrasound records from the last 7 days. Exclude records with warnings or follow-up flags. Sort oldest first.

> Explain why the first visible record matched the active query.

> Preview cancelling the current visible batch. Do not execute.

After reviewing the result:

> I confirm. Execute this cancellation preview.

Eligible records should move from `Pending` to `Cancelled`. Already `Approved` or `Cancelled` records must remain unchanged.

### Review, then approve

Enter these prompts in order. The first query replaces the previous active filter:

> Show pending CT or MRI records from the last 14 days that have a warning or require follow-up. Exclude urgent cases. Sort oldest first.

> Explain why the first visible record matched the active query.

> Preview sending the current visible batch to review. Do not execute.

> I confirm. Execute this preview.

> Show CT or MRI records that currently need review. Sort oldest first.

> Explain why the first visible record matched the active query.

> Preview approving the current visible batch after review. Do not execute.

> I confirm. Execute this preview.

The first execution moves eligible warning or follow-up records from `Pending` to `Needs Review`. The second preview includes eligible `Needs Review` records, and the confirmed execution moves them to `Approved`.

## Supported statuses and actions

Statuses:

- `Pending`
- `Needs Review`
- `Approved`
- `Cancelled`

Actions:

- `Approve`
- `Send to Review`
- `Cancel`

Allowed transitions:

| Current status | Action           | Result                                |
| -------------- | ---------------- | ------------------------------------- |
| `Pending`      | Approve          | `Approved` when no review is required |
| `Pending`      | Send to Review   | `Needs Review`                        |
| `Pending`      | Cancel           | `Cancelled`                           |
| `Needs Review` | Approve          | `Approved`                            |
| `Needs Review` | Send to Review   | No change; already in review          |
| `Needs Review` | Cancel           | `Cancelled`                           |
| `Approved`     | Any batch action | No change                             |
| `Cancelled`    | Any batch action | No change                             |

`Undo` is available through the audit history and reverses the latest executed batch.

## Valid commands by workflow stage

| Current stage   | Valid requests                                                                     | Rejected examples                                                        |
| --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| No active query | Describe the worklist; apply a filter                                              | Preview, Explain, Execute, Undo                                          |
| Query active    | Refine/replace the filter; Explain a visible record; Preview Approve/Review/Cancel | Execute without Preview; explain a non-visible record                    |
| Preview active  | Confirm and execute; replace the Preview; refine/replace the filter                | Execute with a missing/stale Preview ID or without explicit confirmation |
| Batch executed  | All query-stage requests; Undo latest batch                                        | Undo when audit history is empty                                         |

Whenever a request is invalid for the current stage, RelayGrid displays the request, a specific error, and the currently available commands. Query state and record data remain unchanged.

## Safety checks

- Filtering and Preview never modify records.
- Execute must be rejected without a current preview and explicit human confirmation.
- Execute must use the exact action plan stored by the preview; it cannot silently reinterpret the request.
- Already approved or cancelled records are protected from additional batch changes.
- Every execution creates an audit entry and can be undone.
- Preview requires an active query with at least one match.
- Preview and Execute are capped at the current visible batch of 50 records; matches outside it are never mutated by that plan.
- After execution, the query is rerun and the next eligible batch becomes visible without page-number navigation.
- Explain requires an active query and a record visible in the current results.
- Undo requires a previously executed batch action.

## Negative test — invalid input

This guardrail test verifies that unclear or gibberish input is rejected without changing the active query, Preview, records, or audit history.

Enter:

> asdf qqq 123 ???

Expected result:

- ChatGPT does not invent a filter or batch action.
- It calls `describe_grid` with the request marked as unclear, asks the user to rephrase, and offers supported examples.
- RelayGrid shows **Request not understood — no changes made**.
- The active query, statuses, preview, and audit history remain unchanged.

## What judges should notice

- RelayGrid is a shared human-agent control surface, not a separate chatbot or a DOM-clicking automation layer.

- The ChatGPT conversation contains the human's natural-language commands; RelayGrid intentionally has no duplicate chatbot.
- The **How WebMCP works** explanation distinguishes model reasoning from schema grounding, tool invocation, deterministic evaluation, and GUI state.
- The grid, interpretation, Preview, status colors, audit history, and on-page guide all reflect the same live state.
- Preview and Execute use the same saved visible-batch transition plan. Preview calculates outcomes without mutation; Execute applies that exact plan only after confirmation.
- The demo exposes a reusable enterprise-grid pattern rather than a radiology-specific assistant.
