"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  ChevronRight,
  Clock3,
  Database,
  Info,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  applyActionPlan,
  BatchAction,
  BATCH_SIZE,
  buildVisibleBatchPlan,
  describeNode,
  explain,
  generateRecords,
  GridRecord,
  QuerySpec,
  runQuery,
  Transition,
  validateQuery,
} from "@/lib/smart-grid";
type Preview = {
  id: string;
  requestedAction: BatchAction;
  requestSummary: string;
  plan: Transition[];
};
type Audit = { id: string; label: string; time: string; before: GridRecord[] };
type Tool = {
  name: string;
  description: string;
  inputSchema?: object;
  execute: (input?: unknown) => unknown;
};
type RegisteredTool = { name: string };
declare global {
  interface Document {
    modelContext?: {
      registerTool(
        tool: Tool,
        options?: { signal?: AbortSignal },
      ): Promise<void>;
      getTools(): Promise<RegisteredTool[]>;
      executeTool(tool: RegisteredTool, input: string): Promise<unknown>;
    };
  }
}
const statusRowClasses: Record<string, string> = {
  Pending: "bg-amber-50/65 hover:bg-amber-100/80",
  "Manual Review": "bg-indigo-50/70 hover:bg-indigo-100/80",
  "Needs Review": "bg-indigo-50/70 hover:bg-indigo-100/80",
  Approved: "bg-emerald-50/65 hover:bg-emerald-100/80",
  Cancelled: "bg-rose-50/65 hover:bg-rose-100/80",
};
const statusBadgeClasses: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700",
  "Needs Review": "bg-indigo-50 text-indigo-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Cancelled: "bg-rose-50 text-rose-700",
};
const flagBadgeClasses: Record<string, string> = {
  Warning: "border-red-300 bg-red-100 font-semibold text-red-900 shadow-sm",
  "Follow-up": "border-sky-300 bg-sky-100 font-semibold text-sky-900 shadow-sm",
};
const actionLabels: Record<BatchAction, string> = {
  approve: "Approve",
  send_to_review: "Send to Review",
  cancel: "Cancel",
};
const guideEvents: Record<string, string[]> = {
  main: [
    "query",
    "explain",
    "preview:approve",
    "execute:approve",
    "preview:approve",
    "undo",
  ],
  "scenario-0": [
    "query",
    "explain",
    "preview:send_to_review",
    "execute:send_to_review",
    "query",
    "explain",
    "preview:approve",
    "execute:approve",
  ],
  "scenario-1": [
    "query",
    "explain",
    "preview:cancel",
    "execute:cancel",
    "undo",
  ],
  "scenario-2": ["reject"],
};

export default function SmartGridApp() {
  const initial = useMemo(() => generateRecords(), []),
    [records, setRecords] = useState(initial),
    [query, setQuery] = useState<QuerySpec | null>(null),
    [queryHistory, setQueryHistory] = useState<QuerySpec[]>([]),
    [preview, setPreview] = useState<Preview | null>(null),
    [audit, setAudit] = useState<Audit[]>([]),
    [selected, setSelected] = useState<GridRecord | null>(null),
    [ready, setReady] = useState(false),
    [agentNotice, setAgentNotice] = useState<{
      request: string;
      message: string;
    } | null>(null),
    [guideTab, setGuideTab] = useState("main"),
    [scenarioStateOwner, setScenarioStateOwner] = useState<string | null>(null),
    [scenarioProgress, setScenarioProgress] = useState<Record<string, number>>({
      main: 0,
      "scenario-0": 0,
      "scenario-1": 0,
      "scenario-2": 0,
    });
  const markGuideEvent = useCallback((tab: string, event: string) => {
    setScenarioProgress((current) => {
      const completed = current[tab] ?? 0;
      if (guideEvents[tab]?.[completed] !== event) return current;
      return { ...current, [tab]: completed + 1 };
    });
  }, []);
  const results = useMemo(
    () => (query ? runQuery(records, query) : records),
    [records, query],
  );
  const reject = useCallback((request: string, message: string): never => {
    setAgentNotice({ request, message });
    throw Error(message);
  }, []);
  const applyQuery = useCallback(
    (q: QuerySpec) => {
      const errors = validateQuery(q);
      if (errors.length) throw Error(`Invalid query: ${errors.join("; ")}`);
      setQuery((current) => {
        if (current) setQueryHistory((h) => [current, ...h].slice(0, 5));
        return q;
      });
      setPreview(null);
      setSelected(null);
      setAgentNotice(null);
      return {
        matched: runQuery(records, q).length,
        query: q,
        previousQueryPreservedInHistory: true,
      };
    },
    [records],
  );
  const makePreview = useCallback(
    (requestedAction: BatchAction, requestSummary: string) => {
      if (!query)
        return reject(
          requestSummary,
          "Apply a filter before previewing a batch action.",
        );
      const current = runQuery(records, query);
      if (current.length === 0)
        return reject(
          requestSummary,
          "The active filter has no matching records. Change the filter before previewing an action.",
        );
      const p = {
        id: `preview-${Date.now()}`,
        requestedAction,
        requestSummary,
        plan: buildVisibleBatchPlan(current, requestedAction),
      };
      setPreview(p);
      setAgentNotice(null);
      return p;
    },
    [query, records, reject],
  );
  const execute = useCallback(
    (id: string) => {
      if (!preview || preview.id !== id)
        return reject(
          "Execute batch action",
          "Preview is missing or stale. Create a new preview before execution.",
        );
      const before = records,
        changed = preview.plan.filter((x) => x.allowed);
      setRecords((rs) => applyActionPlan(rs, preview.plan));
      setAudit((x) => [
        {
          id: `audit-${Date.now()}`,
          label: `${actionLabels[preview.requestedAction]} · ${changed.length} changed · ${preview.plan.length - changed.length} unchanged`,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          before,
        },
        ...x,
      ]);
      setPreview(null);
      setAgentNotice(null);
      return {
        action: preview.requestedAction,
        changed: changed.length,
        unchanged: preview.plan.length - changed.length,
        remainingMatches: query
          ? runQuery(applyActionPlan(records, preview.plan), query).length
          : 0,
        nextBatchReady: true,
        auditCreated: true,
      };
    },
    [preview, records, query, reject],
  );
  const undo = useCallback(() => {
    if (!audit[0])
      return reject(
        "Undo last batch",
        "There is no executed batch action to undo yet.",
      );
    setRecords(audit[0].before);
    setAudit((x) => x.slice(1));
    setAgentNotice(null);
    return { undone: true };
  }, [audit, reject]);
  const live = useRef({
    records,
    query,
    results,
    preview,
    audit,
    applyQuery,
    makePreview,
    execute,
    undo,
    setAgentNotice,
    setSelected,
    guideTab,
    markGuideEvent,
  });
  useEffect(() => {
    live.current = {
      records,
      query,
      results,
      preview,
      audit,
      applyQuery,
      makePreview,
      execute,
      undo,
      setAgentNotice,
      setSelected,
      guideTab,
      markGuideEvent,
    };
  }, [
    records,
    query,
    results,
    preview,
    audit,
    applyQuery,
    makePreview,
    execute,
    undo,
    guideTab,
    markGuideEvent,
  ]);
  useEffect(() => {
    if (!document.modelContext) return;
    const c = new AbortController(),
      nodeSchema = {
        $defs: {
          node: {
            oneOf: [
              {
                type: "object",
                properties: {
                  kind: { const: "condition" },
                  field: {
                    enum: [
                      "id",
                      "patient",
                      "age",
                      "department",
                      "exam",
                      "status",
                      "priority",
                      "createdAt",
                      "assignee",
                      "followUp",
                      "warning",
                      "location",
                    ],
                  },
                  operator: {
                    enum: ["eq", "neq", "gte", "lte", "in", "after", "before"],
                  },
                  value: {},
                },
                required: ["kind", "field", "operator", "value"],
              },
              {
                type: "object",
                properties: {
                  kind: { const: "group" },
                  operator: { enum: ["AND", "OR"] },
                  children: {
                    type: "array",
                    items: { $ref: "#/$defs/node" },
                    minItems: 1,
                  },
                },
                required: ["kind", "operator", "children"],
              },
              {
                type: "object",
                properties: {
                  kind: { const: "not" },
                  child: { $ref: "#/$defs/node" },
                },
                required: ["kind", "child"],
              },
            ],
          },
        },
      },
      tools: Tool[] = [
        {
          name: "describe_grid",
          description:
            "Describe the worklist and safe usage. If the user's text is gibberish, ambiguous, or not a supported grid request, call this with requestStatus='unclear'; do not invent a query or action. The tool will show a no-changes notice and return example prompts.",
          inputSchema: {
            type: "object",
            properties: {
              userRequest: { type: "string" },
              requestStatus: { enum: ["clear", "unclear"] },
            },
          },
          execute: (i) => {
            const s = live.current,
              { userRequest = "", requestStatus = "clear" } = (i ?? {}) as {
                userRequest?: string;
                requestStatus?: "clear" | "unclear";
              };
            if (requestStatus === "unclear")
              s.setAgentNotice({
                request: userRequest || "Unrecognized request",
                message:
                  "I couldn't map this request to a safe filter or action. No query or data was changed.",
              });
            if (requestStatus === "unclear")
              s.markGuideEvent(s.guideTab, "reject");
            return {
              understood: requestStatus !== "unclear",
              noChangesMade: requestStatus === "unclear",
              recordCount: s.records.length,
              currentMatches: s.results.length,
              currentBatchSize: Math.min(BATCH_SIZE, s.results.length),
              batchLimit: BATCH_SIZE,
              currentQuery: s.query,
              fields: [
                "id",
                "patient",
                "age",
                "department",
                "exam",
                "status",
                "priority",
                "createdAt",
                "assignee",
                "followUp",
                "warning",
                "location",
              ],
              operators: ["eq", "neq", "gte", "lte", "in", "after", "before"],
              statuses: ["Pending", "Needs Review", "Approved", "Cancelled"],
              actions: ["approve", "send_to_review", "cancel"],
              examplePrompts: [
                "Show pending CT or MRI results from the last 7 days",
                "Preview approving the current visible batch",
                "Preview the next batch using the same action",
                "Send warning records to review",
                "Undo the last batch action",
              ],
            };
          },
        },
        {
          name: "apply_query",
          description:
            "Apply a deterministic query to the visible grid. Supports nested AND, OR, and NOT. Include requestSummary mirroring the user's intent.",
          inputSchema: {
            type: "object",
            ...nodeSchema,
            properties: {
              requestSummary: { type: "string" },
              root: { $ref: "#/$defs/node" },
              sort: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    direction: { enum: ["asc", "desc"] },
                  },
                  required: ["field", "direction"],
                },
              },
            },
            required: ["requestSummary", "root"],
          },
          execute: (i) => {
            const s = live.current;
            const result = s.applyQuery(i as QuerySpec);
            s.markGuideEvent(s.guideTab, "query");
            return result;
          },
        },
        {
          name: "explain_record",
          description:
            "Explain why one visible record matched. Requires an active query; otherwise tell the user to filter first.",
          inputSchema: {
            type: "object",
            properties: { recordId: { type: "string" } },
            required: ["recordId"],
          },
          execute: (i) => {
            const { recordId } = i as { recordId: string },
              s = live.current,
              r = s.records.find((x) => x.id === recordId);
            if (!s.query)
              return reject(
                `Explain ${recordId}`,
                "Apply a filter before asking why a record matched.",
              );
            if (!r || !s.results.some((x) => x.id === recordId))
              return reject(
                `Explain ${recordId}`,
                "That record is not in the current filtered results.",
              );
            s.setSelected(r);
            s.setAgentNotice(null);
            s.markGuideEvent(s.guideTab, "explain");
            return { recordId, matchedBecause: explain(r, s.query.root) };
          },
        },
        {
          name: "preview_batch_action",
          description:
            "After a query is active, create a non-mutating deterministic plan for one requested action across only the current visible batch (up to 50 records), never every match. Never call before filtering. 'Next batch' means preview the current visible batch after the previous batch has executed. Returns exact transition counts and small samples.",
          inputSchema: {
            type: "object",
            properties: {
              action: { enum: ["approve", "send_to_review", "cancel"] },
              requestSummary: { type: "string" },
            },
            required: ["action", "requestSummary"],
          },
          execute: (i) => {
            const { action, requestSummary } = i as {
                action: BatchAction;
                requestSummary: string;
              },
              p = live.current.makePreview(action, requestSummary),
              changed = p.plan.filter((x) => x.allowed),
              unchanged = p.plan.filter((x) => !x.allowed),
              counts = {
                Approved: changed.filter((x) => x.to === "Approved").length,
                "Needs Review": changed.filter((x) => x.to === "Needs Review")
                  .length,
                Cancelled: changed.filter((x) => x.to === "Cancelled").length,
                unchanged: unchanged.length,
              };
            live.current.markGuideEvent(
              live.current.guideTab,
              `preview:${action}`,
            );
            return {
              id: p.id,
              requestedAction: p.requestedAction,
              requestSummary: p.requestSummary,
              counts,
              scope: "current_visible_batch",
              batchSize: p.plan.length,
              totalMatches: live.current.results.length,
              remainingOutsideBatch: Math.max(
                0,
                live.current.results.length - p.plan.length,
              ),
              samples: {
                changed: changed.slice(0, 5),
                unchanged: unchanged.slice(0, 5),
              },
              truncated: changed.length > 5 || unchanged.length > 5,
            };
          },
        },
        {
          name: "execute_batch_action",
          description:
            "Execute a saved preview for the current visible batch only, after explicit human confirmation. After execution the same query remains active and the next eligible batch automatically becomes visible.",
          inputSchema: {
            type: "object",
            properties: {
              previewId: { type: "string" },
              humanConfirmed: { type: "boolean", const: true },
            },
            required: ["previewId", "humanConfirmed"],
          },
          execute: (i) => {
            const { previewId, humanConfirmed } = i as {
              previewId: string;
              humanConfirmed: boolean;
            };
            if (!humanConfirmed)
              return reject(
                "Execute batch action",
                "Explicit human confirmation is required before execution.",
              );
            const action = live.current.preview?.requestedAction;
            const result = live.current.execute(previewId);
            if (action)
              live.current.markGuideEvent(
                live.current.guideTab,
                `execute:${action}`,
              );
            return result;
          },
        },
        {
          name: "undo_last_batch",
          description:
            "Undo the most recent executed batch action. Do not call when audit history is empty.",
          execute: () => {
            const result = live.current.undo();
            live.current.markGuideEvent(live.current.guideTab, "undo");
            return result;
          },
        },
      ];
    Promise.all(
      tools.map((t) =>
        document.modelContext!.registerTool(t, { signal: c.signal }),
      ),
    )
      .then(async () => {
        setReady(true);
        if (new URLSearchParams(window.location.search).get("webmcp_test") !== "1")
          return;

        const root = document.documentElement;
        if (root.dataset.webmcpSelfTest === "running") return;
        root.dataset.webmcpSelfTest = "running";

        try {
          const modelContext = document.modelContext!,
            discovered = await modelContext.getTools(),
            byName = new Map(discovered.map((tool) => [tool.name, tool])),
            calls: Array<{ name: string; result: unknown }> = [],
            invoke = async (name: string, input: object = {}) => {
              const tool = byName.get(name);
              if (!tool) throw Error(`Native WebMCP tool not discovered: ${name}`);
              const result = await modelContext.executeTool(
                tool,
                JSON.stringify(input),
              );
              calls.push({ name, result });
              return result;
            },
            pause = () => new Promise((resolve) => setTimeout(resolve, 120));

          await invoke("describe_grid", {
            userRequest: "Run the native WebMCP QA scenario",
            requestStatus: "clear",
          });
          await invoke("apply_query", {
            requestSummary:
              "Pending CT or MRI results from the last 7 days, excluding urgent cases and warnings, oldest first",
            root: {
              kind: "group",
              operator: "AND",
              children: [
                {
                  kind: "condition",
                  field: "status",
                  operator: "eq",
                  value: "Pending",
                },
                {
                  kind: "group",
                  operator: "OR",
                  children: [
                    {
                      kind: "condition",
                      field: "department",
                      operator: "eq",
                      value: "CT",
                    },
                    {
                      kind: "condition",
                      field: "department",
                      operator: "eq",
                      value: "MRI",
                    },
                  ],
                },
                {
                  kind: "condition",
                  field: "createdAt",
                  operator: "after",
                  value: "2026-08-22",
                },
                {
                  kind: "not",
                  child: {
                    kind: "condition",
                    field: "priority",
                    operator: "eq",
                    value: "Urgent",
                  },
                },
                {
                  kind: "not",
                  child: {
                    kind: "condition",
                    field: "warning",
                    operator: "eq",
                    value: true,
                  },
                },
              ],
            },
            sort: [
              { field: "createdAt", direction: "asc" },
              { field: "id", direction: "asc" },
            ],
          });
          await pause();
          const recordId = live.current.results[0]?.id;
          if (!recordId) throw Error("Native query returned no records");
          await invoke("explain_record", { recordId });
          const firstPreview = (await invoke("preview_batch_action", {
            action: "approve",
            requestSummary: "Preview approving the current visible batch",
          })) as { id?: string };
          if (!firstPreview?.id) throw Error("Native preview returned no preview id");
          await pause();
          await invoke("execute_batch_action", {
            previewId: firstPreview.id,
            humanConfirmed: true,
          });
          await pause();
          await invoke("preview_batch_action", {
            action: "approve",
            requestSummary: "Preview the next visible batch",
          });
          await pause();
          await invoke("undo_last_batch");

          root.dataset.webmcpSelfTest = JSON.stringify({
            status: "passed",
            discovered: discovered.map((tool) => tool.name).sort(),
            calls,
          });
        } catch (error) {
          root.dataset.webmcpSelfTest = JSON.stringify({
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
      .catch(() => setReady(false));
    return () => c.abort();
  }, [reject]);
  const stats = [
    {
      label: "All records",
      value: records.length.toLocaleString(),
      icon: Database,
    },
    {
      label: "Current matches",
      value: results.length.toLocaleString(),
      icon: CheckCircle2,
    },
    {
      label: "Warnings",
      value: results.filter((r) => r.warning).length,
      icon: AlertTriangle,
    },
    {
      label: "Oldest result",
      value: results[0]
        ? `${Math.ceil((new Date("2026-08-29").getTime() - new Date(results[0].createdAt).getTime()) / 86400000)}d`
        : "—",
      icon: Clock3,
    },
  ];
  const visibleBatch = results.slice(0, BATCH_SIZE);
  const workflowState = agentNotice
    ? {
        title: "Request rejected",
        detail:
          "No records changed. Review the message below and use a supported prompt.",
        className: "border-amber-300 bg-amber-50 text-amber-950",
      }
    : !query
      ? {
          title: "Waiting for the first worklist request",
          detail:
            "Choose a guided scenario and send its first prompt to ChatGPT.",
          className: "border-slate-300 bg-slate-50 text-slate-900",
        }
      : preview
        ? {
            title: "Preview ready — waiting for confirmation",
            detail: `${actionLabels[preview.requestedAction]} will change ${preview.plan.filter((item) => item.allowed).length} of ${preview.plan.length} visible records; ${preview.plan.filter((item) => !item.allowed).length} will remain unchanged.`,
            className: "border-sky-300 bg-sky-50 text-sky-950",
          }
        : audit.length
          ? {
              title: "Batch completed",
              detail: `${audit[0].label}. The next matching batch is visible, and Undo is available.`,
              className: "border-emerald-300 bg-emerald-50 text-emerald-950",
            }
          : {
              title: "Query active",
              detail: `${results.length.toLocaleString()} records match. Ready to verify a record or preview a batch action.`,
              className: "border-[#9fc4cc] bg-[#eef6f7] text-[#173c45]",
            };
  const [copyStatus, setCopyStatus] = useState<{
    key: string;
    state: "copied" | "failed";
  } | null>(null);
  const judgeSteps = [
    {
      title: "Show recent pending CT or MRI results",
      prompt:
        "Show pending CT or MRI results from the last 7 days. Exclude urgent cases and records with warnings. Sort oldest first.",
      expected:
        "The grid shows only matching pending CT or MRI results, sorted oldest first. No record statuses change.",
    },
    {
      title: "Verify the oldest matching result",
      prompt: "Explain why the first visible record matched the active query.",
      expected:
        "The explanation shows which active query conditions the first visible record matched. No record data changes.",
    },
    {
      title: "Preview approval of the visible batch",
      prompt: "Preview approving the current visible batch. Do not execute.",
      expected:
        "Preview shows exactly how many of the current 50 visible records will be approved or remain unchanged. No statuses change until confirmation.",
    },
    {
      title: "Approve the visible batch",
      prompt: "I confirm. Execute this preview.",
      expected:
        "After confirmation, eligible records in the current visible batch become Approved, protected records remain unchanged, an audit entry is created, and the next matching batch appears.",
    },
    {
      title: "Prepare the next radiology batch",
      prompt: "Preview the next batch using the same action. Do not execute.",
      expected:
        "Preview recalculates the outcome for the newly visible batch only. No additional statuses change until confirmation.",
    },
    {
      title: "Restore the last approved batch",
      prompt: "Undo the last batch action.",
      expected:
        "Records changed by the most recently executed batch return to their previous statuses. Earlier completed batches remain unchanged.",
    },
  ];
  const optionalScenarios = [
    {
      title: "Review → Approve",
      purpose: "Demonstrates the complete warning-review lifecycle.",
      steps: [
        {
          title: "Show warning and follow-up cases",
          prompt:
            "Show pending CT or MRI records from the last 14 days that have a warning or require follow-up. Exclude urgent cases. Sort oldest first.",
          expected:
            "The grid shows only non-urgent Pending CT or MRI records from the last 14 days with a Warning or Follow-up flag, sorted oldest first. No statuses change.",
        },
        {
          title: "Verify a warning case",
          prompt:
            "Explain why the first visible record matched the active query.",
          expected:
            "The explanation confirms that the first visible record is Pending, is CT or MRI, falls within 14 days, has a Warning or Follow-up flag, and is not Urgent. No data changes.",
        },
        {
          title: "Preview sending cases to review",
          prompt:
            "Preview sending the current visible batch to review. Do not execute.",
          expected:
            "Preview shows exactly how many of the current visible records will move to Needs Review and how many will remain unchanged. No statuses change until confirmation.",
        },
        {
          title: "Send the visible cases to review",
          prompt: "I confirm. Execute this preview.",
          expected:
            "Eligible records in this visible batch move from Pending to Needs Review. Protected records remain unchanged, an audit entry is created, and the next matching batch appears.",
        },
        {
          title: "Show cases awaiting clinical review",
          prompt:
            "Show CT or MRI records that currently need review. Sort oldest first.",
          expected:
            "The grid now shows only CT or MRI records whose current status is Needs Review, sorted oldest first. The completed review action remains recorded in Audit history.",
        },
        {
          title: "Verify a reviewed case",
          prompt:
            "Explain why the first visible record matched the active query.",
          expected:
            "The explanation confirms that the first visible record is CT or MRI and currently has Needs Review status. No record data changes.",
        },
        {
          title: "Preview approval after review",
          prompt:
            "Preview approving the current visible batch after review. Do not execute.",
          expected:
            "Preview shows exactly how many visible Needs Review records will become Approved and how many will remain unchanged. No statuses change until confirmation.",
        },
        {
          title: "Approve the reviewed cases",
          prompt: "I confirm. Execute this preview.",
          expected:
            "Eligible records in the current visible batch move from Needs Review to Approved. An audit entry is created and the next matching Needs Review batch appears.",
        },
      ],
    },
    {
      title: "Cancel → Undo",
      purpose: "Demonstrates a second action and reversible recovery.",
      steps: [
        {
          title: "Show cancellable X-Ray or Ultrasound results",
          prompt:
            "Show routine pending X-Ray or Ultrasound records from the last 7 days. Exclude records with warnings or follow-up flags. Sort oldest first.",
          expected:
            "The grid shows only Routine Pending X-Ray or Ultrasound records from the last 7 days without Warning or Follow-up flags, sorted oldest first. No statuses change.",
        },
        {
          title: "Verify a cancellable result",
          prompt:
            "Explain why the first visible record matched the active query.",
          expected:
            "The explanation confirms the first visible record is Routine, Pending, X-Ray or Ultrasound, within 7 days, and has no Warning or Follow-up flag. No data changes.",
        },
        {
          title: "Preview cancellation of the visible batch",
          prompt:
            "Preview cancelling the current visible batch. Do not execute.",
          expected:
            "Preview shows exactly how many records in the current visible batch will become Cancelled and how many will remain unchanged. No statuses change until confirmation.",
        },
        {
          title: "Cancel the visible results",
          prompt: "I confirm. Execute this preview.",
          expected:
            "Eligible records in the visible batch move from Pending to Cancelled. Protected records remain unchanged, an audit entry is created, and Undo becomes available.",
        },
        {
          title: "Restore the cancelled results",
          prompt: "Undo the last batch action.",
          expected:
            "The records cancelled by the most recent action return to their previous Pending status, and that latest audit entry is removed. Earlier actions remain unchanged.",
        },
      ],
    },
    {
      title: "Negative test",
      purpose: "Demonstrates safe rejection of unsupported input.",
      steps: [
        {
          title: "Test an unsupported worklist request",
          prompt: "asdf qqq 123 ???",
          expected:
            "RelayGrid rejects the unsupported request with a clear no-changes error. The active query, record statuses, Preview, and Audit history remain exactly as they were.",
        },
      ],
    },
  ];
  const currentJudgeStep = audit.length
    ? preview
      ? 6
      : 5
    : preview
      ? 4
      : query
        ? selected
          ? 3
          : 2
        : 1;
  const completedGuideSteps =
    guideTab === "main"
      ? Math.max(scenarioProgress.main, currentJudgeStep - 1)
      : (scenarioProgress[guideTab] ?? 0);
  const selectedScenarioStepCount =
    guideTab === "main"
      ? judgeSteps.length
      : (optionalScenarios[Number(guideTab.replace("scenario-", ""))]?.steps
          .length ?? 0);
  const selectedGuideScenario =
    guideTab === "main"
      ? {
          title:
            "Main scenario — Filter → Verify → Approve → Next batch → Undo",
          purpose:
            "Demonstrates grounded filtering, verification, safe Preview, execution, batch progression, and Undo.",
          steps: judgeSteps,
        }
      : optionalScenarios[Number(guideTab.replace("scenario-", ""))];
  const selectedGuideCompleted =
    guideTab === "main"
      ? completedGuideSteps
      : (scenarioProgress[guideTab] ?? 0);
  const hasScenarioState = Boolean(
    query ||
      queryHistory.length ||
      preview ||
      audit.length ||
      selected ||
      agentNotice ||
      Object.values(scenarioProgress).some((completed) => completed > 0),
  );
  const showScenarioReset = Boolean(
    hasScenarioState && scenarioStateOwner && guideTab !== scenarioStateOwner,
  );
  const changeGuideTab = (nextTab: string) => {
    if (hasScenarioState && !scenarioStateOwner) {
      setScenarioStateOwner(guideTab);
    }
    setGuideTab(nextTab);
  };
  const resetSession = () => {
    setRecords(initial);
    setQuery(null);
    setQueryHistory([]);
    setPreview(null);
    setAudit([]);
    setSelected(null);
    setAgentNotice(null);
    setCopyStatus(null);
    setScenarioStateOwner(null);
    setScenarioProgress({
      main: 0,
      "scenario-0": 0,
      "scenario-1": 0,
      "scenario-2": 0,
    });
  };
  const copyPrompt = async (prompt: string, key: string) => {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt);
        copied = true;
      }
    } catch {
      // The embedded browser can deny Clipboard API permission; use a local fallback below.
    }
    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = prompt;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand("copy");
      textarea.remove();
    }
    setCopyStatus({ key, state: copied ? "copied" : "failed" });
    window.setTimeout(() => setCopyStatus(null), 5000);
  };
  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#f3f6f8] text-slate-950">
      <header className="flex h-16 min-w-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-[#173c45] text-white">
            <Activity className="size-5" />
          </div>
          <div>
            <h1 className="font-semibold">RelayGrid</h1>
            <p className="text-xs text-slate-500">
              Radiology operations worklist
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Info />
                How WebMCP works
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>How WebMCP grounds the query</DialogTitle>
                <DialogDescription className="text-sm font-medium leading-6 text-slate-900">
                  ChatGPT constructs the AST; WebMCP grounds it in the live
                  grid&apos;s real schema and delivers it to RelayGrid.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [
                    "1",
                    "WebMCP exposes",
                    "Fields, operators, tool schemas, and live context",
                  ],
                  [
                    "2",
                    "ChatGPT builds",
                    "A query AST that follows that published contract",
                  ],
                  [
                    "3",
                    "RelayGrid validates",
                    "Unsupported fields or operators are rejected",
                  ],
                  [
                    "4",
                    "The GUI updates",
                    "The deterministic engine filters the shared live table",
                  ],
                ].map(([number, title, detail]) => (
                  <div
                    key={number}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <span className="mb-2 grid size-6 place-items-center rounded-full bg-[#173c45] font-bold text-white">
                      {number}
                    </span>
                    <strong className="block font-bold text-slate-950">
                      {title}
                    </strong>
                    <p className="mt-1 font-medium leading-5 text-slate-900">
                      {detail}
                    </p>
                  </div>
                ))}
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                {[
                  [
                    "WebMCP",
                    "Publishes the real schema and tools; carries calls and results",
                  ],
                  [
                    "ChatGPT",
                    "Understands the request and constructs the matching AST",
                  ],
                  ["RelayGrid", "Validates, runs, and stores the active query"],
                  [
                    "Query engine",
                    "Deterministically decides which records match",
                  ],
                  [
                    "GUI",
                    "Shows the same query, results, preview, and audit state",
                  ],
                ].map(([owner, responsibility]) => (
                  <div
                    key={owner}
                    className="grid grid-cols-[110px_1fr] border-b border-slate-200 px-3 py-2 text-sm last:border-b-0"
                  >
                    <strong className="text-slate-950">{owner}</strong>
                    <span className="font-medium leading-5 text-slate-900">
                      {responsibility}
                    </span>
                  </div>
                ))}
              </div>
              <p className="rounded-lg bg-[#eaf3f5] p-3 text-sm font-semibold leading-6 text-[#173c45]">
                WebMCP does not merely transmit JSON. It tells ChatGPT what the
                live application can safely accept, then invokes that capability
                in the same interface the human is viewing.
              </p>
            </DialogContent>
          </Dialog>
          <Badge
            variant="outline"
            className={
              ready
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }
          >
            <span
              className={`size-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            {ready ? "WebMCP connected" : "Open in agent browser"}
          </Badge>
          <div className="grid size-8 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-white">
            LM
          </div>
        </div>
      </header>
      <div
        data-testid="workspace-layout"
        className="grid min-h-[calc(100vh-4rem)] w-full min-w-0 max-w-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]"
      >
        <section className="min-w-0 overflow-x-hidden p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[.16em] text-[#397786]">
                Diagnostic operations
              </p>
              <h2 className="text-2xl font-semibold">Results worklist</h2>
            </div>
            <div className="flex items-end gap-2">
              <div className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  className="cursor-pointer border-slate-400 bg-white shadow-sm hover:border-[#245661] hover:bg-[#eef6f7] hover:text-[#173c45] focus-visible:ring-2 focus-visible:ring-[#397786]"
                  title={
                    hasScenarioState
                      ? "Restores the original records and clears the entire demo session"
                      : "The session is already at its initial state; click to reset it again"
                  }
                  onClick={resetSession}
                >
                  <RotateCcw />
                  Reset session
                </Button>
                <p className="mt-1 text-[13px] font-medium text-slate-800">
                  Clears filters, previews, actions, and audit history
                </p>
              </div>
            </div>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-2 flex justify-between text-[13px] font-semibold text-slate-700">
                  <span>{label}</span>
                  <Icon className="size-4" />
                </div>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex justify-between border-b border-slate-200 px-4 py-3">
              <span className="text-sm font-medium">
                {query
                  ? `${results.length.toLocaleString()} of ${records.length.toLocaleString()} records`
                  : `${records.length.toLocaleString()} records`}
              </span>
              <span className="text-[13px] font-semibold text-slate-700">
                Current batch: {visibleBatch.length.toLocaleString()} shown ·{" "}
                {Math.max(
                  0,
                  results.length - visibleBatch.length,
                ).toLocaleString()}{" "}
                remaining
              </span>
            </div>
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  {[
                    "Record",
                    "Patient",
                    "Exam",
                    "Status",
                    "Priority",
                    "Age",
                    "Created",
                    "Flags",
                    "",
                  ].map((x, i) => (
                    <TableHead key={i}>{x}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBatch.map((r) => (
                  <TableRow
                    key={r.id}
                    className={`cursor-pointer transition-colors ${statusRowClasses[r.status] ?? "hover:bg-slate-50"}`}
                    onClick={() => setSelected(r)}
                  >
                    <TableCell className="font-mono text-xs font-medium text-[#397786]">
                      {r.id}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.patient}</div>
                      <div className="text-xs text-slate-500">{r.location}</div>
                    </TableCell>
                    <TableCell>
                      <div>{r.exam}</div>
                      <div className="text-xs text-slate-500">
                        {r.department}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusBadgeClasses[r.status]}
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={
                        r.priority === "Urgent"
                          ? "font-semibold text-red-700"
                          : ""
                      }
                    >
                      {r.priority}
                    </TableCell>
                    <TableCell>{r.age}</TableCell>
                    <TableCell>
                      {new Date(r.createdAt).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-24 flex-wrap gap-1.5">
                        {[
                          ...(r.warning ? ["Warning"] : []),
                          ...(r.followUp ? ["Follow-up"] : []),
                        ].map((flag) => (
                          <Badge
                            key={flag}
                            variant="outline"
                            className={flagBadgeClasses[flag]}
                          >
                            {flag}
                          </Badge>
                        ))}
                        {!r.warning && !r.followUp && (
                          <span className="font-medium text-slate-500">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-slate-400" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
        <aside
          data-testid="scenario-panel"
          className="w-full min-w-0 max-w-full overflow-x-hidden border-t border-slate-200 bg-white p-4 sm:p-5 lg:sticky lg:top-0 lg:max-h-[calc(100vh-4rem)] lg:self-start lg:overflow-y-auto lg:border-l lg:border-t-0"
        >
          {!query && (
            <div className="mb-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
              <ShieldCheck className="mx-auto mb-2 size-7 text-slate-400" />
              <p className="text-[15px] font-bold text-slate-950">
                No active agent query
              </p>
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3.5 text-left text-sm font-medium leading-6 text-slate-900 shadow-sm">
                <strong className="block text-[15px] font-bold text-slate-950">
                  Start with a guided scenario
                </strong>
                <p className="mt-1.5">
                  Choose a scenario below. Use
                  <strong> Copy to ChatGPT</strong> for each step, send the
                  prompt, and continue in order. The first step applies the
                  filter through WebMCP.
                </p>
              </div>
            </div>
          )}
          <section
            className="mb-5 min-w-0 max-w-full overflow-hidden rounded-xl border border-[#9fc4cc] bg-white shadow-sm"
            aria-labelledby="sidebar-judge-guide-title"
          >
            <div className="border-b border-[#d8e8eb] bg-[#eaf3f5] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3
                    id="sidebar-judge-guide-title"
                    className="text-sm font-bold text-[#173c45]"
                  >
                    Judge Demo Guide
                  </h3>
                  <p className="mt-0.5 text-xs font-medium leading-5 text-[#245661]">
                    Complete the highlighted step in ChatGPT.
                  </p>
                </div>
                <Badge className="shrink-0 bg-[#173c45] text-white">
                  {selectedGuideCompleted}/{selectedScenarioStepCount}
                </Badge>
              </div>
              <Tabs
                value={guideTab}
                onValueChange={changeGuideTab}
                className="mt-3 gap-0"
              >
                <TabsList
                  className="grid !h-auto w-full min-w-0 grid-cols-2 items-stretch gap-1.5 bg-transparent p-0"
                  style={{ height: "auto" }}
                >
                  <TabsTrigger
                    value="main"
                    title="Demonstrates grounded filtering, verification, safe Preview, execution, batch progression, and Undo."
                    className="h-auto min-h-9 w-full min-w-0 cursor-pointer overflow-hidden whitespace-normal break-words border border-slate-300 bg-white px-2 py-2 text-center text-[11px] font-semibold leading-4 text-slate-700 transition-colors hover:border-[#245661] hover:bg-[#eef6f7] hover:text-[#173c45] focus-visible:ring-2 focus-visible:ring-[#397786] data-[state=active]:border-[#245661] data-[state=active]:bg-[#245661] data-[state=active]:text-white data-[state=active]:hover:bg-[#245661] data-[state=active]:hover:text-white"
                  >
                    Main scenario
                  </TabsTrigger>
                  {optionalScenarios.map((scenario, scenarioIndex) => (
                    <TabsTrigger
                      key={scenario.title}
                      value={`scenario-${scenarioIndex}`}
                      title={scenario.purpose}
                      className="h-auto min-h-9 w-full min-w-0 cursor-pointer overflow-hidden whitespace-normal break-words border border-slate-300 bg-white px-2 py-2 text-center text-[11px] font-semibold leading-4 text-slate-700 transition-colors hover:border-[#245661] hover:bg-[#eef6f7] hover:text-[#173c45] focus-visible:ring-2 focus-visible:ring-[#397786] data-[state=active]:border-[#245661] data-[state=active]:bg-[#245661] data-[state=active]:text-white data-[state=active]:hover:bg-[#245661] data-[state=active]:hover:text-white"
                    >
                      {scenario.title}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            {showScenarioReset && (
              <div className="border-b border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-950">
                  Previous scenario still active
                </p>
                <p className="mt-1 text-xs font-medium leading-5 text-amber-900">
                  Reset before starting this independent scenario.
                </p>
                <Button
                  size="sm"
                  title="Clear the previous scenario and start the selected scenario from step 1"
                  className="mt-2 w-full cursor-pointer bg-amber-900 text-white shadow-sm hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-500"
                  onClick={resetSession}
                >
                  <RotateCcw />
                  Reset &amp; start this scenario
                </Button>
              </div>
            )}
            {selectedGuideScenario && (
              <div>
                <div className="border-b border-slate-200 px-3 py-3">
                  <strong className="block break-words text-xs font-bold leading-5 text-[#245661]">
                    {selectedGuideScenario.title}
                  </strong>
                  <p className="mt-1 break-words text-xs font-medium leading-5 text-slate-800">
                    {selectedGuideScenario.purpose}
                  </p>
                </div>
                {preview && (
                  <div className="border-b border-sky-300 bg-sky-100 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-extrabold text-sky-950">
                          LIVE PREVIEW — NO CHANGES MADE
                        </p>
                        <p className="mt-0.5 text-[11px] font-semibold text-sky-900">
                          {actionLabels[preview.requestedAction]} · current
                          visible batch only
                        </p>
                      </div>
                      <Badge className="bg-sky-800 text-white">
                        {preview.plan.length} records
                      </Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-white px-2 py-1.5 text-slate-800">
                        Will change{" "}
                        <strong className="float-right text-slate-950">
                          {preview.plan.filter((item) => item.allowed).length}
                        </strong>
                      </div>
                      <div className="rounded-md bg-white px-2 py-1.5 text-slate-800">
                        Unchanged{" "}
                        <strong className="float-right text-slate-950">
                          {preview.plan.filter((item) => !item.allowed).length}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
                <ol className="divide-y divide-slate-200">
                  {selectedGuideScenario.steps.map((step, stepIndex) => {
                    const complete = stepIndex < selectedGuideCompleted;
                    const active = stepIndex === selectedGuideCompleted;
                    const key = `${guideTab}-sidebar-${stepIndex}`;
                    return (
                      <li
                        key={key}
                        className={
                          active
                            ? "bg-sky-50 p-3 ring-2 ring-inset ring-sky-400"
                            : "bg-white px-3 py-2"
                        }
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                              complete
                                ? "bg-emerald-600 text-white"
                                : active
                                  ? "bg-sky-700 text-white"
                                  : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {complete ? "✓" : stepIndex + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <strong
                              className={`block text-xs font-bold leading-5 ${
                                active ? "text-sky-950" : "text-slate-800"
                              }`}
                            >
                              {step.title}
                            </strong>
                            {active && (
                              <div className="mt-2">
                                <Button
                                  className="mb-2 h-auto w-full whitespace-normal py-1.5 text-center leading-4"
                                  size="xs"
                                  variant="outline"
                                  onClick={() => copyPrompt(step.prompt, key)}
                                >
                                  {copyStatus?.key === key &&
                                  copyStatus.state === "copied" ? (
                                    <ClipboardCheck className="text-emerald-600" />
                                  ) : (
                                    <Clipboard />
                                  )}
                                  {copyStatus?.key === key
                                    ? copyStatus.state === "copied"
                                      ? "Copied"
                                      : "Select manually"
                                    : "Copy to chat"}
                                </Button>
                                {copyStatus?.key === key && (
                                  <p
                                    role="status"
                                    className={`mb-2 rounded-md px-2 py-1.5 text-[10px] font-semibold ${
                                      copyStatus.state === "copied"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-amber-100 text-amber-900"
                                    }`}
                                  >
                                    {copyStatus.state === "copied"
                                      ? "Copied — paste it into ChatGPT and send."
                                      : "Copy was blocked — select the prompt below manually."}
                                  </p>
                                )}
                                <p className="cursor-text select-text text-xs font-medium leading-5 text-slate-800">
                                  “{step.prompt}”
                                </p>
                                <p className="mt-2 text-xs font-medium leading-5 text-slate-800">
                                  <strong className="font-bold text-slate-950">
                                    Expected:
                                  </strong>{" "}
                                  {step.expected}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {selectedGuideCompleted === selectedScenarioStepCount && (
                  <div className="border-t border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-900">
                    ✓ Scenario completed
                  </div>
                )}
              </div>
            )}
          </section>
          {(query || agentNotice) && (
            <div className="mb-5 flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-lg bg-[#e8f1f3] text-[#245661]">
                <Sparkles className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Agent interpretation</h3>
                <p className="text-[13px] font-medium text-slate-700">
                  Shared live workspace
                </p>
              </div>
            </div>
          )}
          {(query || agentNotice) && (
            <div
              className={`mb-5 rounded-xl border p-4 ${workflowState.className}`}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <Activity className="size-4 shrink-0" />
                <p className="text-xs font-bold uppercase tracking-wider">
                  Current workflow state
                </p>
              </div>
              <strong className="block text-sm font-bold">
                {workflowState.title}
              </strong>
              <p className="mt-1 text-[13px] font-medium leading-5">
                {workflowState.detail}
              </p>
            </div>
          )}
          {agentNotice && (
            <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-amber-900">
                <AlertCircle className="size-5" />
                <strong className="text-sm">
                  Request not understood — no changes made
                </strong>
              </div>
              <p className="text-xs text-amber-800">“{agentNotice.request}”</p>
              <p className="mt-2 text-xs leading-5 text-amber-800">
                {agentNotice.message} Try: “Show pending MRI records” or
                “Preview approving the current results.”
              </p>
            </div>
          )}
          {query && !preview && (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  You said
                </p>
                <div className="rounded-xl bg-[#173c45] p-3 text-sm leading-5 text-white">
                  {query.requestSummary ?? "Apply a structured query"}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Agent interpreted
                </p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-5 text-slate-700">
                  {describeNode(query.root)}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-[#e8f1f3] px-3 py-2">
                <span className="text-sm font-medium text-[#173c45]">
                  Records matched
                </span>
                <strong className="text-lg text-[#173c45]">
                  {results.length}
                </strong>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                <strong>Safe batch scope:</strong> actions affect only the{" "}
                {visibleBatch.length} records currently shown. Filtering still
                covers all {results.length.toLocaleString()} matches.
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Preview an action
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    className="bg-[#173c45]"
                    onClick={() =>
                      makePreview("approve", "Approve current visible batch")
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      makePreview(
                        "send_to_review",
                        "Send current visible batch to review",
                      )
                    }
                  >
                    Review
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      makePreview("cancel", "Cancel current visible batch")
                    }
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
          {preview && (
            <div className="mt-5 rounded-xl border-2 border-sky-400 bg-sky-50/60 p-4 shadow-sm">
              <div className="mb-3 rounded-lg bg-sky-700 px-3 py-2 text-center text-white">
                <p className="text-sm font-bold tracking-wide">
                  PREVIEW — NO CHANGES MADE
                </p>
                <p className="mt-0.5 text-[11px] text-sky-100">
                  Current visible batch only · maximum {BATCH_SIZE} records
                </p>
              </div>
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-600" />
                <h4 className="text-sm font-semibold">Batch action preview</h4>
              </div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                User requested
              </p>
              <p className="mb-3 text-sm">{preview.requestSummary}</p>
              <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-500">Requested action</span>
                <strong className="float-right">
                  {actionLabels[preview.requestedAction]}
                </strong>
              </div>
              <div className="mb-3 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs leading-5 text-slate-700">
                Preview scope:{" "}
                <strong>{preview.plan.length} visible records</strong>.{" "}
                {Math.max(
                  0,
                  results.length - preview.plan.length,
                ).toLocaleString()}{" "}
                matching records are outside this batch and will not change.
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Will change</span>
                  <strong>
                    {preview.plan.filter((x) => x.allowed).length}
                  </strong>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Protected / no change</span>
                  <strong>
                    {preview.plan.filter((x) => !x.allowed).length}
                  </strong>
                </div>
                {(["Approved", "Needs Review", "Cancelled"] as const).map(
                  (status) => {
                    const count = preview.plan.filter(
                      (x) => x.allowed && x.to === status,
                    ).length;
                    return (
                      count > 0 && (
                        <div key={status} className="flex justify-between">
                          <span>→ {status}</span>
                          <strong>{count}</strong>
                        </div>
                      )
                    );
                  },
                )}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="mt-4 w-full">Review & confirm</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Confirm {actionLabels[preview.requestedAction]}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Apply the saved plan to{" "}
                      {preview.plan.filter((x) => x.allowed).length} records and
                      leave {preview.plan.filter((x) => !x.allowed).length}{" "}
                      protected records unchanged. No records outside this
                      visible batch will be changed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => execute(preview.id)}>
                      Confirm and execute
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          {queryHistory.length > 0 && (
            <div className="mt-5 border-t border-slate-200 pt-5">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Query history</h4>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    const previous = queryHistory[0];
                    setQuery(previous);
                    setQueryHistory((h) => h.slice(1));
                  }}
                >
                  <RotateCcw />
                  Undo refinement
                </Button>
              </div>
              <p className="line-clamp-2 text-xs leading-5 text-slate-500">
                {queryHistory[0].requestSummary}
              </p>
            </div>
          )}
          {audit.length > 0 && (
            <div className="mt-6 border-t border-slate-200 pt-5">
              <div className="mb-3 flex justify-between">
                <h4 className="text-sm font-semibold">Audit history</h4>
                <Button size="xs" variant="ghost" onClick={undo}>
                  <RotateCcw />
                  Undo latest
                </Button>
              </div>
              {audit.map((a) => (
                <div
                  key={a.id}
                  className="mb-2 rounded-lg border border-slate-200 p-3"
                >
                  <p className="text-xs font-medium">{a.label}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {a.time} · reversible
                  </p>
                </div>
              ))}
            </div>
          )}
          {selected && (
            <div className="mt-6 border-t border-slate-200 pt-5">
              <div className="mb-2 flex justify-between">
                <h4 className="text-sm font-semibold">
                  Why {selected.id} matched
                </h4>
                <button
                  className="text-xs text-slate-500"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>
              {query ? (
                <ul className="space-y-1.5">
                  {explain(selected, query.root).map((x) => (
                    <li key={x} className="flex gap-2 text-xs text-slate-600">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                      {x}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">
                  Apply a query to see reasons.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
