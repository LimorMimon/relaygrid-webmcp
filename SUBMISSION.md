# Devpost submission draft

## One-line summary

**RelayGrid turns complex enterprise worklists into a shared human-agent control surface: ChatGPT builds a schema-grounded query, while the application deterministically filters, previews, executes, audits, and reverses actions in the same live interface.**

## Inspiration

Enterprise users spend too much time constructing nested filters, checking why records were selected, and applying repetitive actions across dense tables. Natural-language filtering alone does not solve the risky part: understanding the interpretation and safely acting on the result.

## What it does

RelayGrid turns a natural-language goal into a visible, deterministic query tree, displays the matching records, and explains why each matched. Filtering covers the entire worklist, while stage-aware actions are safely processed in visible batches of at most 50 records. Each batch is previewed, separated into permitted and protected records, confirmed by a human, audited, and reversible. Unsupported or out-of-order requests are rejected without mutation.

## Why WebMCP is essential

The agent does not guess which controls to click or scrape the DOM. RelayGrid exposes six high-level tools directly from the active page. WebMCP is important even while the query is being constructed: it publishes the grid's real fields, supported operators, tool input schema, and live context. ChatGPT constructs a Query AST grounded in that contract; WebMCP invokes `apply_query`; RelayGrid validates and evaluates it deterministically. The tools share state with the human interface, including the active query, Preview plan, workflow stage, status colors, and audit history, so agent actions are immediately visible, reviewable, and reversible.

## How we built it

The page registers imperative tools using `document.modelContext.registerTool()`. A canonical JSON AST supports nested AND, OR, NOT, comparisons, dates, Boolean values, enums, and sorting. The app validates and evaluates it deterministically against 7,500 synthetic records. A single transition engine powers both non-mutating Preview and confirmed Execute. A simple workflow state machine permits only context-valid tools and returns precise errors for out-of-order or unclear requests.

## Accomplishments

- Non-trivial nested filtering over a realistic enterprise dataset.
- Shared state between WebMCP tools and the visible grid.
- Record-level explainability.
- Stale-preview protection, policy exceptions, audit, and undo.
- Safe 50-record batch processing with the next eligible batch loaded automatically under the same query.
- Stage-aware command gating and a visible **Negative test — invalid input** guardrail check.
- An in-product judge guide with copy-ready prompts, expected outcomes, and automatic step highlighting.
- Tool-driven progress tracking across every scenario: completed steps turn into green checks, the next valid step is highlighted, and Reset clears progress.
- Compact scenario tabs with meaningful operation titles and consistent full-width **Copy to chat** controls above every prompt.
- An in-product **How WebMCP works** explanation with the complete schema-to-AST-to-GUI responsibility flow.
- Domain-neutral architecture demonstrated through healthcare.

## How to test

Open the live site in ChatGPT's in-app browser. The sticky right-side **Judge Demo Guide** opens on the **Main scenario** tab with six prompts: Filter, verify why one result matched, Preview current batch, Confirm, Preview next batch, and Undo latest batch. Separate tabs provide ordered flows for Review → Approve, Cancel → Undo, and invalid input while the worklist remains visible. The current step expands with its **Copy to chat** control, prompt, and expected result; completed and future steps stay compact. A live Preview summary appears at the top of the guide. `JUDGE_TESTING.md` contains the complete transition, batch-scope, and safety matrix.

## What's next

The same schema and action engine can power insurance claims, inventory exceptions, CRM worklists, and ERP approvals without building a proprietary Copilot for every application.
