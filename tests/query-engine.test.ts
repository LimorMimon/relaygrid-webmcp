import test from "node:test";
import assert from "node:assert/strict";
import {
  applyActionPlan,
  BATCH_SIZE,
  buildActionPlan,
  buildVisibleBatchPlan,
  calculateTransition,
  generateRecords,
  matches,
  runQuery,
  validateQuery,
  type BatchAction,
  type GridRecord,
  type QuerySpec,
  type RecordStatus,
} from "../lib/smart-grid.ts";

const records = generateRecords(1000);
test("nested AND OR NOT is deterministic", () => {
  const query: QuerySpec = {
    root: {
      kind: "group",
      operator: "AND",
      children: [
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
  };
  const a = runQuery(records, query),
    b = runQuery(records, query);
  assert.deepEqual(
    a.map((r) => r.id),
    b.map((r) => r.id),
  );
  assert.ok(
    a.every(
      (r) => (r.department === "CT" || r.department === "MRI") && !r.warning,
    ),
  );
});
test("contradictory filters return an empty result", () => {
  const q: QuerySpec = {
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
          kind: "condition",
          field: "status",
          operator: "eq",
          value: "Approved",
        },
      ],
    },
  };
  assert.equal(runQuery(records, q).length, 0);
});
test("nested minor follow-up rule behaves correctly", () => {
  const q: QuerySpec = {
    root: {
      kind: "group",
      operator: "OR",
      children: [
        { kind: "condition", field: "age", operator: "gte", value: 18 },
        {
          kind: "group",
          operator: "AND",
          children: [
            { kind: "condition", field: "age", operator: "lte", value: 17 },
            {
              kind: "condition",
              field: "followUp",
              operator: "eq",
              value: true,
            },
          ],
        },
      ],
    },
  };
  assert.ok(
    records.every(
      (r) => matches(r, q.root) === (r.age >= 18 || (r.age < 18 && r.followUp)),
    ),
  );
});
test("invalid AST values are rejected before execution", () => {
  const q = {
    root: {
      kind: "condition",
      field: "notAColumn",
      operator: "eq",
      value: true,
    },
  } as unknown as QuerySpec;
  assert.match(validateQuery(q).join(" "), /field is not supported/);
});
test("empty groups are rejected", () => {
  const q = {
    root: { kind: "group", operator: "AND", children: [] },
  } as QuerySpec;
  assert.match(validateQuery(q).join(" "), /cannot be empty/);
});
const base = (status: RecordStatus, warning = false): GridRecord => ({
  ...records[0],
  id: `${status}-${warning}`,
  status,
  warning,
});
const cases: [RecordStatus, BatchAction, RecordStatus, boolean][] = [
  ["Pending", "approve", "Approved", true],
  ["Pending", "send_to_review", "Needs Review", true],
  ["Pending", "cancel", "Cancelled", true],
  ["Needs Review", "approve", "Approved", true],
  ["Needs Review", "send_to_review", "Needs Review", false],
  ["Needs Review", "cancel", "Cancelled", true],
  ["Approved", "approve", "Approved", false],
  ["Approved", "send_to_review", "Approved", false],
  ["Approved", "cancel", "Approved", false],
  ["Cancelled", "approve", "Cancelled", false],
  ["Cancelled", "send_to_review", "Cancelled", false],
  ["Cancelled", "cancel", "Cancelled", false],
];
test("all status/action transitions are deterministic", () => {
  for (const [status, action, to, allowed] of cases) {
    const transition = calculateTransition(base(status), action);
    assert.equal(transition.to, to, `${status} + ${action}`);
    assert.equal(transition.allowed, allowed, `${status} + ${action}`);
  }
});
test("pending warnings require review before approval", () => {
  const transition = calculateTransition(base("Pending", true), "approve");
  assert.equal(transition.allowed, false);
  assert.equal(transition.to, "Pending");
  assert.match(transition.reason, /Review required/);
});
test("preview planning does not mutate records and execution applies the saved plan", () => {
  const source = [base("Pending"), base("Approved")],
    snapshot = structuredClone(source),
    plan = buildActionPlan(source, "cancel");
  assert.deepEqual(source, snapshot);
  const applied = applyActionPlan(source, plan);
  assert.equal(applied[0].status, "Cancelled");
  assert.equal(applied[1].status, "Approved");
  assert.deepEqual(source, snapshot);
});
test("visible batch preview is capped and preserves records outside the batch", () => {
  const source = Array.from({ length: 75 }, (_, i) => ({
      ...base("Pending"),
      id: `batch-${i}`,
    })),
    plan = buildVisibleBatchPlan(source, "cancel");
  assert.equal(plan.length, BATCH_SIZE);
  const applied = applyActionPlan(source, plan);
  assert.ok(
    applied.slice(0, BATCH_SIZE).every((r) => r.status === "Cancelled"),
  );
  assert.ok(applied.slice(BATCH_SIZE).every((r) => r.status === "Pending"));
});
test("the next batch fills from remaining query matches after execution", () => {
  const source = Array.from({ length: 75 }, (_, i) => ({
      ...base("Pending"),
      id: `next-${i}`,
    })),
    query: QuerySpec = {
      root: {
        kind: "condition",
        field: "status",
        operator: "eq",
        value: "Pending",
      },
    },
    first = runQuery(source, query),
    plan = buildVisibleBatchPlan(first, "approve"),
    applied = applyActionPlan(source, plan),
    remaining = runQuery(applied, query),
    nextPlan = buildVisibleBatchPlan(remaining, "approve");
  assert.equal(remaining.length, 25);
  assert.equal(nextPlan.length, 25);
  assert.equal(nextPlan[0].recordId, "next-50");
});
