import type {
  Scope,
  SessionUser,
  Task,
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";
import { ApiError, assertBranchScope, buildScope, inScope } from "./access";
import { appendAudit, getStore, makeId, nextSequence } from "./store";

export const TASK_CATEGORIES: TaskCategory[] = ["CREDIT", "COLLECTION", "FIELD", "LEGAL", "AGENCY", "GRE", "OTHER"];
export const TASK_PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
export const TASK_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS", "COMPLETED", "ESCALATED", "CANCELLED"];

const FINAL_STATUSES: TaskStatus[] = ["COMPLETED", "CANCELLED"];

export type TaskRow = Task & {
  assigneeName: string;
  assigneeColor: string;
  assigneeDesignation: string;
  branchName: string;
  relatedRef: string | null;
  relatedHref: string | null;
  allowedNext: TaskStatus[];
};

export type TaskAssigneeOption = {
  id: string;
  name: string;
  role: string;
  designation: string;
  color: string;
  branchName: string;
};

export type TasksOverview = {
  rows: TaskRow[];
  assignees: TaskAssigneeOption[];
  kpis: {
    open: number;
    mine: number;
    dueToday: number;
    overdue: number;
    completed: number;
    escalated: number;
  };
};

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function parseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

export function allowedTaskTransitions(task: Pick<Task, "status" | "dueDate">): TaskStatus[] {
  const status = task.status;
  if (status === "CANCELLED") return [];
  if (status === "COMPLETED") return ["OPEN"];

  const overdue = new Date(task.dueDate).getTime() < startOfToday().getTime();
  const next: TaskStatus[] = [];
  if (status === "OPEN") {
    next.push("IN_PROGRESS");
    if (overdue) next.push("ESCALATED");
  }
  if (status === "IN_PROGRESS") {
    next.push("OPEN");
    if (overdue) next.push("ESCALATED");
  }
  if (status === "ESCALATED") {
    next.push("IN_PROGRESS");
  }
  next.push("COMPLETED", "CANCELLED");
  return next;
}

type RelatedReference = { ref: string; href: string | null };

function relatedReferenceFor(task: Task): RelatedReference {
  if (!task.relatedId) return { ref: "—", href: null };
  const store = getStore();
  switch (task.relatedType) {
    case "COLLECTION": {
      const collectionCase = store.collectionCases.find((item) => item.id === task.relatedId);
      return collectionCase
        ? { ref: collectionCase.ref, href: `/collections/${collectionCase.id}` }
        : { ref: "—", href: null };
    }
    case "APPLICATION": {
      const application = store.applications.find((item) => item.id === task.relatedId);
      return application ? { ref: application.ref, href: `/applications/${application.id}` } : { ref: "—", href: null };
    }
    case "LEAD": {
      const lead = store.leads.find((item) => item.id === task.relatedId);
      return lead ? { ref: lead.ref, href: `/leads/${lead.id}` } : { ref: "—", href: null };
    }
    case "LOAN": {
      const loan = store.loanAccounts.find((item) => item.id === task.relatedId);
      return loan ? { ref: loan.ref, href: null } : { ref: "—", href: null };
    }
    case "GRIEVANCE": {
      const grievance = store.grievances.find((item) => item.id === task.relatedId);
      return grievance ? { ref: grievance.ref, href: "/operations" } : { ref: "—", href: null };
    }
    default:
      return { ref: "—", href: null };
  }
}

export function getTasksOverview(scope: Scope, user: SessionUser): TasksOverview {
  const store = getStore();
  const userById = new Map(store.users.map((item) => [item.id, item]));
  const branchById = new Map(store.branches.map((branch) => [branch.id, branch]));

  const scoped = store.tasks.filter((task) => inScope(scope, task.branchId));

  const rows: TaskRow[] = scoped
    .map((task) => {
      const assignee = userById.get(task.assigneeId);
      const related = relatedReferenceFor(task);
      return {
        ...task,
        assigneeName: assignee?.name ?? "Unassigned",
        assigneeColor: assignee?.avatarColor ?? "#8099a5",
        assigneeDesignation: assignee?.designation ?? "—",
        branchName: branchById.get(task.branchId)?.name ?? "—",
        relatedRef: related.ref,
        relatedHref: related.href,
        allowedNext: allowedTaskTransitions(task),
      };
    })
    .sort((a, b) => {
      const aFinal = FINAL_STATUSES.includes(a.status);
      const bFinal = FINAL_STATUSES.includes(b.status);
      if (aFinal !== bFinal) return aFinal ? 1 : -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

  const openRows = rows.filter((task) => !FINAL_STATUSES.includes(task.status));
  const todayEnd = endOfToday().getTime();
  const todayStart = startOfToday().getTime();

  const assignees: TaskAssigneeOption[] = store.users
    .filter((item) => item.status === "ACTIVE" && inScope(scope, item.branchId))
    .map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      designation: item.designation,
      color: item.avatarColor,
      branchName: branchById.get(item.branchId)?.name ?? "—",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    rows,
    assignees,
    kpis: {
      open: openRows.length,
      mine: openRows.filter((task) => task.assigneeId === user.id).length,
      dueToday: openRows.filter((task) => {
        const due = new Date(task.dueDate).getTime();
        return due >= todayStart && due <= todayEnd;
      }).length,
      overdue: openRows.filter((task) => new Date(task.dueDate).getTime() < todayStart).length,
      completed: rows.filter((task) => task.status === "COMPLETED").length,
      escalated: openRows.filter((task) => task.status === "ESCALATED").length,
    },
  };
}

export type CreateTaskInput = {
  title: string;
  category: TaskCategory;
  description: string;
  assigneeId: string;
  priority: TaskPriority;
  dueDate: string;
};

export type UpdateTaskInput = {
  status?: TaskStatus;
  assigneeId?: string;
  priority?: TaskPriority;
  dueDate?: string;
};

function requireTask(taskId: string) {
  const store = getStore();
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new ApiError(404, "NOT_FOUND", "Task not found.");
  }
  return { store, task };
}

function resolveAssignee(assigneeId: string, scope: Scope, store: ReturnType<typeof getStore>) {
  const assignee = store.users.find((item) => item.id === assigneeId && item.status === "ACTIVE");
  if (!assignee) {
    throw new ApiError(422, "INVALID_ASSIGNEE", "Select an active assignee.");
  }
  assertBranchScope(scope, assignee.branchId);
  return assignee;
}

function normalizeDueDate(value: string) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(422, "INVALID_DATE", "Enter a valid due date.");
  }
  if (date.getTime() < startOfToday().getTime()) {
    throw new ApiError(422, "INVALID_DATE", "Due date cannot be in the past.");
  }
  return date;
}

export function createTask(user: SessionUser, input: CreateTaskInput): Task {
  const store = getStore();
  const scope = buildScope(user);
  const assignee = resolveAssignee(input.assigneeId, scope, store);
  const dueDate = normalizeDueDate(input.dueDate);
  const title = input.title.trim();
  const description = input.description.trim();
  if (title.length < 5) {
    throw new ApiError(422, "INVALID_TITLE", "Task title needs at least 5 characters.");
  }
  if (description.length < 10) {
    throw new ApiError(422, "INVALID_DESCRIPTION", "Add a short description (10+ characters).");
  }

  const task: Task = {
    id: makeId("task"),
    ref: nextSequence("TSK", store.tasks.map((item) => item.ref)),
    category: input.category,
    title,
    description,
    relatedType: "NONE",
    relatedId: null,
    assigneeId: assignee.id,
    branchId: assignee.branchId,
    priority: input.priority,
    status: "OPEN",
    dueDate: dueDate.toISOString(),
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  store.tasks.unshift(task);
  appendAudit(store, user.id, "TASK_CREATED", "Task", task.id, `Created ${task.ref} — ${task.title}`);
  return task;
}

export function updateTask(user: SessionUser, taskId: string, input: UpdateTaskInput): Task {
  const { store, task } = requireTask(taskId);
  const scope = buildScope(user);
  assertBranchScope(scope, task.branchId);

  const changes: string[] = [];

  if (input.assigneeId && input.assigneeId !== task.assigneeId) {
    const assignee = resolveAssignee(input.assigneeId, scope, store);
    changes.push(`assignee → ${assignee.name}`);
    task.assigneeId = assignee.id;
    task.branchId = assignee.branchId;
  }

  if (input.priority && input.priority !== task.priority) {
    changes.push(`priority → ${input.priority}`);
    task.priority = input.priority;
  }

  if (input.dueDate) {
    const dueDate = normalizeDueDate(input.dueDate);
    if (dueDate.toISOString() !== task.dueDate) {
      changes.push(`due ${dueDate.toISOString().slice(0, 10)}`);
      task.dueDate = dueDate.toISOString();
    }
  }

  if (input.status && input.status !== task.status) {
    const allowed = allowedTaskTransitions(task);
    if (!allowed.includes(input.status)) {
      throw new ApiError(
        409,
        "INVALID_TRANSITION",
        `This task cannot move from ${task.status.replaceAll("_", " ").toLowerCase()} to ${input.status
          .replaceAll("_", " ")
          .toLowerCase()}.`,
      );
    }
    const previous = task.status;
    task.status = input.status;
    if (input.status === "COMPLETED") {
      task.completedAt = new Date().toISOString();
    } else if (previous === "COMPLETED" || input.status === "CANCELLED") {
      task.completedAt = null;
    }
    changes.push(`status ${previous.replaceAll("_", " ").toLowerCase()} → ${input.status.replaceAll("_", " ").toLowerCase()}`);
  }

  if (changes.length === 0) {
    throw new ApiError(422, "NO_CHANGES", "No changes were provided for this task.");
  }

  appendAudit(store, user.id, "TASK_UPDATED", "Task", task.id, `${task.ref}: ${changes.join(", ")}`);
  return task;
}
