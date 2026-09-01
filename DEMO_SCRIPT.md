# Demo storyboard — target 2:40

Core message: **RelayGrid turns complex enterprise worklists into a shared human-agent control surface: ChatGPT builds a schema-grounded query, while the application deterministically filters, previews, executes, audits, and reverses actions in the same live interface.**

## 0:00–0:18 — Problem and guide

Enterprise worklists contain thousands of records and dozens of fields. Building the right nested filter is slow; acting on the wrong result can be costly. Show the unfiltered 7,500-record grid beside the sticky **Judge Demo Guide**, titled **Main scenario — Filter → Verify → Approve → Next batch → Undo**, with only Step 1 expanded.

## 0:18–0:58 — Filter

Briefly open **How WebMCP works**: RelayGrid publishes its real schema, ChatGPT constructs an AST grounded in that contract, WebMCP invokes `apply_query`, and RelayGrid validates and evaluates it. Then copy the Step 1 prompt into ChatGPT: “Show pending CT or MRI results from the last seven days. Exclude urgent cases and records with warnings. Sort oldest first.” Show the structured interpretation, reduced result count, status colors, and the guide advancing to Step 2. Use **Verify one result** to explain why the first visible record satisfies the active Query AST. Emphasize that this is a non-mutating spot-check before Preview.

## 0:58–1:32 — Preview

Copy Step 3: “Preview approving the current visible batch. Do not execute.” Show the compact live Preview summary at the top of the guide beside the grid, then the detailed **PREVIEW — NO CHANGES MADE** confirmation card with destination counts. Point out that filtering covers every match but the safe action plan is capped at the 50 visible records.

## 1:32–2:05 — Confirm, execute, and audit

Copy Step 4: “I confirm. Execute this preview.” Show the eligible rows changing to green `Approved`, the audit entry, and the next eligible batch automatically filling the table under the same filter. Mention that execution without this explicit confirmation is rejected.

## 2:05–2:22 — Continue or Undo

Point to Step 5, “Preview the next batch using the same action,” to show that processing can continue safely without navigating to an arbitrary page. Then use Step 6, “Undo the last batch action,” and show only the latest batch returning to its previous state.

## 2:22–2:40 — Safety and why WebMCP

Briefly switch between the **Review → Approve**, **Cancel → Undo**, and **Negative test** tabs. Point out that the sticky guide expands only the current step, collapses completed steps into checks, and keeps future titles visible without pushing the worklist down. Review and Cancel repeat the Filter → Verify → Preview safety pattern, while the negative guardrail check rejects unsupported input. RelayGrid exposes safe, stage-aware capabilities through WebMCP while the human keeps visibility and control. Healthcare is the demo; the pattern applies to any enterprise grid.

Close on the core message: ChatGPT builds a schema-grounded query, while RelayGrid deterministically filters, previews, executes, audits, and reverses actions in the same live interface.

Closing title: **Give any enterprise data grid an agent interface.**
