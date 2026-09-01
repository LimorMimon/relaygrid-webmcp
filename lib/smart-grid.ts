export type RecordStatus =
  "Pending" | "Needs Review" | "Approved" | "Cancelled";
export type BatchAction = "approve" | "send_to_review" | "cancel";
export type GridRecord = {
  id: string;
  patient: string;
  age: number;
  department: "CT" | "MRI" | "X-Ray" | "Ultrasound";
  exam: string;
  status: RecordStatus;
  priority: "Routine" | "High" | "Urgent";
  createdAt: string;
  assignee: string;
  followUp: boolean;
  warning: boolean;
  location: string;
};
export type Transition = {
  recordId: string;
  from: RecordStatus;
  to: RecordStatus;
  action: BatchAction;
  allowed: boolean;
  reason: string;
};
export type Field = keyof GridRecord;
export type Condition = {
  kind: "condition";
  field: Field;
  operator: "eq" | "neq" | "gte" | "lte" | "in" | "after" | "before";
  value: string | number | boolean | string[];
};
export type QueryNode =
  | Condition
  | { kind: "group"; operator: "AND" | "OR"; children: QueryNode[] }
  | { kind: "not"; child: QueryNode };
export type QuerySpec = {
  root: QueryNode;
  sort?: { field: Field; direction: "asc" | "desc" }[];
  requestSummary?: string;
};
export const BATCH_SIZE = 50;

const first = [
    "Maya",
    "Noah",
    "Liam",
    "Ava",
    "Ella",
    "Amir",
    "Nora",
    "Leah",
    "Owen",
    "Mila",
    "Adam",
    "Zoe",
  ],
  last = [
    "Cohen",
    "Levi",
    "Shaw",
    "Grant",
    "Reed",
    "Patel",
    "Green",
    "Miller",
    "Stone",
    "Young",
  ];
const deps: GridRecord["department"][] = ["CT", "MRI", "X-Ray", "Ultrasound"];
const exams: Record<GridRecord["department"], string[]> = {
  CT: ["Chest CT", "Head CT", "Abdomen CT"],
  MRI: ["Brain MRI", "Spine MRI", "Knee MRI"],
  "X-Ray": ["Chest X-Ray", "Hand X-Ray", "Pelvis X-Ray"],
  Ultrasound: ["Abdominal US", "Vascular US", "Thyroid US"],
};
const rnd = (seed: number) => {
  const x = Math.sin(seed * 999.91) * 43758.5453;
  return x - Math.floor(x);
};
export function generateRecords(count = 7500): GridRecord[] {
  const now = new Date("2026-08-29T12:00:00Z").getTime();
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1,
      d = deps[Math.floor(rnd(n) * 4)],
      p = rnd(n + 73),
      w = rnd(n + 211) < 0.14,
      s = rnd(n + 51);
    return {
      id: `RAD-${String(n).padStart(6, "0")}`,
      patient: `${first[n % first.length]} ${last[Math.floor(rnd(n + 4) * last.length)]}`,
      age: 3 + Math.floor(rnd(n + 18) * 88),
      department: d,
      exam: exams[d][n % 3],
      status:
        s < 0.58
          ? "Pending"
          : s < 0.72
            ? "Needs Review"
            : s < 0.94
              ? "Approved"
              : "Cancelled",
      priority: p < 0.08 ? "Urgent" : p < 0.28 ? "High" : "Routine",
      createdAt: new Date(
        now - Math.floor(rnd(n + 92) * 21 * 86400000),
      ).toISOString(),
      assignee: ["Dr. Chen", "Dr. Patel", "Dr. Stone", "Unassigned"][n % 4],
      followUp: rnd(n + 137) < 0.22,
      warning: w,
      location: ["North Campus", "Central Hospital", "West Clinic"][n % 3],
    };
  });
}
export function calculateTransition(
  record: GridRecord,
  action: BatchAction,
): Transition {
  const base = { recordId: record.id, from: record.status, action };
  if (record.status === "Approved")
    return {
      ...base,
      to: record.status,
      allowed: false,
      reason: "Already approved",
    };
  if (record.status === "Cancelled")
    return {
      ...base,
      to: record.status,
      allowed: false,
      reason: "Cancelled records are protected",
    };
  if (action === "approve") {
    if (record.status === "Needs Review")
      return {
        ...base,
        to: "Approved",
        allowed: true,
        reason: "Review completed; eligible for approval",
      };
    if (record.warning)
      return {
        ...base,
        to: record.status,
        allowed: false,
        reason: "Review required before approval",
      };
    return {
      ...base,
      to: "Approved",
      allowed: true,
      reason: "Pending with no review requirement",
    };
  }
  if (action === "send_to_review")
    return record.status === "Pending"
      ? {
          ...base,
          to: "Needs Review",
          allowed: true,
          reason: "Pending record sent for review",
        }
      : {
          ...base,
          to: record.status,
          allowed: false,
          reason: "Record is already in review",
        };
  return {
    ...base,
    to: "Cancelled",
    allowed: true,
    reason: "Pending or review record is eligible for cancellation",
  };
}
export function buildActionPlan(
  records: GridRecord[],
  action: BatchAction,
): Transition[] {
  return records.map((record) => calculateTransition(record, action));
}
export function buildVisibleBatchPlan(
  records: GridRecord[],
  action: BatchAction,
  batchSize = BATCH_SIZE,
): Transition[] {
  return buildActionPlan(records.slice(0, batchSize), action);
}
export function applyActionPlan(
  records: GridRecord[],
  plan: Transition[],
): GridRecord[] {
  const changes = new Map(
    plan.filter((x) => x.allowed).map((x) => [x.recordId, x.to]),
  );
  return records.map((record) =>
    changes.has(record.id)
      ? { ...record, status: changes.get(record.id)! }
      : record,
  );
}
function compare(actual: unknown, c: Condition) {
  const e = c.value;
  switch (c.operator) {
    case "eq":
      return actual === e;
    case "neq":
      return actual !== e;
    case "gte":
      return Number(actual) >= Number(e);
    case "lte":
      return Number(actual) <= Number(e);
    case "in":
      return Array.isArray(e) && e.includes(String(actual));
    case "after":
      return (
        new Date(String(actual)).getTime() >= new Date(String(e)).getTime()
      );
    case "before":
      return (
        new Date(String(actual)).getTime() <= new Date(String(e)).getTime()
      );
  }
}
export function matches(r: GridRecord, n: QueryNode): boolean {
  if (n.kind === "condition") return compare(r[n.field], n);
  if (n.kind === "not") return !matches(r, n.child);
  return n.operator === "AND"
    ? n.children.every((c) => matches(r, c))
    : n.children.some((c) => matches(r, c));
}
export function runQuery(rs: GridRecord[], q: QuerySpec) {
  return rs
    .filter((r) => matches(r, q.root))
    .sort((a, b) => {
      for (const s of q.sort ?? []) {
        const av = a[s.field],
          bv = b[s.field],
          c = av < bv ? -1 : av > bv ? 1 : 0;
        if (c) return s.direction === "asc" ? c : -c;
      }
      return 0;
    });
}
export function describeNode(n: QueryNode): string {
  if (n.kind === "condition")
    return `${n.field} ${n.operator} ${Array.isArray(n.value) ? `[${n.value.join(", ")}]` : String(n.value)}`;
  if (n.kind === "not") return `NOT (${describeNode(n.child)})`;
  return `(${n.children.map(describeNode).join(` ${n.operator} `)})`;
}
export function explain(r: GridRecord, n: QueryNode): string[] {
  if (n.kind === "condition") return matches(r, n) ? [describeNode(n)] : [];
  if (n.kind === "not")
    return matches(r, n) ? [`NOT (${describeNode(n.child)})`] : [];
  return n.children.flatMap((c) => explain(r, c));
}
const fields = new Set<Field>([
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
  ]),
  operators = new Set(["eq", "neq", "gte", "lte", "in", "after", "before"]);
export function validateQuery(query: QuerySpec): string[] {
  const errors: string[] = [];
  function walk(node: QueryNode, path = "root") {
    if (!node || typeof node !== "object") {
      errors.push(`${path} must be a query node`);
      return;
    }
    if (node.kind === "condition") {
      if (!fields.has(node.field))
        errors.push(`${path}.field is not supported`);
      if (!operators.has(node.operator))
        errors.push(`${path}.operator is not supported`);
      if (node.operator === "in" && !Array.isArray(node.value))
        errors.push(`${path}.value must be an array for in`);
      return;
    }
    if (node.kind === "group") {
      if (node.operator !== "AND" && node.operator !== "OR")
        errors.push(`${path}.operator must be AND or OR`);
      if (!Array.isArray(node.children) || node.children.length === 0)
        errors.push(`${path}.children cannot be empty`);
      else
        node.children.forEach((child, i) =>
          walk(child, `${path}.children[${i}]`),
        );
      return;
    }
    if (node.kind === "not") {
      walk(node.child, `${path}.child`);
      return;
    }
    errors.push(`${path}.kind is invalid`);
  }
  walk(query?.root);
  for (const [s, i] of (query?.sort ?? []).map((v, i) => [v, i] as const)) {
    if (!fields.has(s.field)) errors.push(`sort[${i}].field is not supported`);
    if (s.direction !== "asc" && s.direction !== "desc")
      errors.push(`sort[${i}].direction is invalid`);
  }
  return errors;
}
export const demoQuery: QuerySpec = {
  requestSummary:
    "Show pending CT or MRI results from the last 7 days, excluding urgent cases and records with warnings. Sort oldest first.",
  root: {
    kind: "group",
    operator: "AND",
    children: [
      { kind: "condition", field: "status", operator: "eq", value: "Pending" },
      {
        kind: "condition",
        field: "department",
        operator: "in",
        value: ["CT", "MRI"],
      },
      {
        kind: "condition",
        field: "createdAt",
        operator: "after",
        value: "2026-08-22T12:00:00Z",
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
  sort: [{ field: "createdAt", direction: "asc" }],
};
