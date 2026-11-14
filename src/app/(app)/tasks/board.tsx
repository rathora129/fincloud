"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarDays, CheckCircle2, ExternalLink, Play, Plus, TriangleAlert } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { Drawer, Modal } from "@/components/ui/modal";
import { Avatar, StatusBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { TASK_CATEGORY_LABELS, humanize } from "@/lib/labels";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import type { TaskCategory, TaskPriority, TaskStatus } from "@/lib/types";
import { tasksService } from "@/services/tasks";
import type { TaskAssigneeOption, TaskRow } from "@/server/tasks";

type BoardTab = "ALL" | "MINE" | "OPEN" | "DUE" | "COMPLETED";

const TABS: { key: BoardTab; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "MINE", label: "My tasks" },
  { key: "OPEN", label: "Open" },
  { key: "DUE", label: "Due today / overdue" },
  { key: "COMPLETED", label: "Completed" },
];

const CATEGORY_KEYS: TaskCategory[] = ["CREDIT", "COLLECTION", "FIELD", "LEGAL", "AGENCY", "GRE", "OTHER"];
const PRIORITY_KEYS: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUS_KEYS: TaskStatus[] = ["OPEN", "IN_PROGRESS", "COMPLETED", "ESCALATED", "CANCELLED"];

const STATUS_ACTION_LABELS: Record<TaskStatus, string> = {
    OPEN: "Move to open",
  IN_PROGRESS: "Start / resume progress",
  COMPLETED: "Mark complete",
  ESCALATED: "Escalate task",
  CANCELLED: "Cancel task",
};

function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function isFinal(task: TaskRow) {
  return task.status === "COMPLETED" || task.status === "CANCELLED";
}

function isOverdue(task: TaskRow) {
  return !isFinal(task) && new Date(task.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
}

function quickActionFor(task: TaskRow): { status: TaskStatus; label: string } | null {
  if (isFinal(task)) return null;
  if (isOverdue(task) && task.allowedNext.includes("ESCALATED")) {
    return { status: "ESCALATED", label: "Escalate" };
  }
  if (task.status === "OPEN" && task.allowedNext.includes("IN_PROGRESS")) {
    return { status: "IN_PROGRESS", label: "Start" };
  }
  if (task.status === "IN_PROGRESS" && task.allowedNext.includes("COMPLETED")) {
    return { status: "COMPLETED", label: "Complete" };
  }
  if (task.status === "ESCALATED" && task.allowedNext.includes("IN_PROGRESS")) {
    return { status: "IN_PROGRESS", label: "Resume" };
  }
  return null;
}

const createSchema = z.object({
  title: z.string().trim().min(5, "Title needs at least 5 characters.").max(140),
  category: z.enum(["CREDIT", "COLLECTION", "FIELD", "LEGAL", "AGENCY", "GRE", "OTHER"]),
  description: z.string().trim().min(10, "Add a short description (10+ characters).").max(2000),
  assigneeId: z.string().min(1, "Select an assignee."),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  dueDate: z.string().min(1, "Pick a due date."),
});

type CreateFormValues = z.infer<typeof createSchema>;

export function TasksBoard({
  rows,
  assignees,
  canManage,
  currentUserId,
  initialCategory,
}: {
  rows: TaskRow[];
  assignees: TaskAssigneeOption[];
  canManage: boolean;
  currentUserId: string;
  initialCategory?: TaskCategory;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<BoardTab>("ALL");
  const [category, setCategory] = useState<TaskCategory | "">(initialCategory ?? "");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [assignee, setAssignee] = useState("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<TaskRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const defaults = useMemo(
    () => ({
      title: "",
      category: (category || "OTHER") as TaskCategory,
      description: "",
      assigneeId: currentUserId,
      priority: "MEDIUM" as TaskPriority,
      dueDate: todayInput(),
    }),
    [category, currentUserId],
  );

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: defaults,
  });

  const counts = useMemo(() => {
    const open = rows.filter((task) => !isFinal(task));
    const end = endOfToday();
    return {
      ALL: rows.length,
      MINE: open.filter((task) => task.assigneeId === currentUserId).length,
      OPEN: rows.filter((task) => task.status === "OPEN").length,
      DUE: open.filter((task) => new Date(task.dueDate).getTime() <= end).length,
      COMPLETED: rows.filter((task) => task.status === "COMPLETED").length,
    } as Record<BoardTab, number>;
  }, [rows, currentUserId]);

  const visibleRows = useMemo(() => {
    const end = endOfToday();
    return rows.filter((task) => {
      if (tab === "MINE" && task.assigneeId !== currentUserId) return false;
      if (tab === "OPEN" && task.status !== "OPEN") return false;
      if (tab === "DUE" && (isFinal(task) || new Date(task.dueDate).getTime() > end)) return false;
      if (tab === "COMPLETED" && task.status !== "COMPLETED") return false;
      if (category && task.category !== category) return false;
      if (priority && task.priority !== priority) return false;
      if (assignee && task.assigneeId !== assignee) return false;
      if (status && task.status !== status) return false;
      return true;
    });
  }, [rows, tab, category, priority, assignee, status, currentUserId]);

  const activeFilterCount = [category, priority, assignee, status].filter(Boolean).length;

  const openCreate = () => {
    setFormError(null);
    form.reset(defaults);
    setCreateOpen(true);
  };

  const changeStatus = async (task: TaskRow, next: TaskStatus) => {
    setBusyId(task.id);
    try {
      const result = await tasksService.update(task.id, { status: next });
      toast.success("Task updated", result.message);
      if (selected?.id === task.id) setSelected(null);
      router.refresh();
    } catch (caught) {
      toast.error("Update failed", errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  };

  const onCreate = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await tasksService.create(values);
      toast.success("Task created", result.message);
      setCreateOpen(false);
      form.reset(defaults);
      router.refresh();
    } catch (caught) {
      const message = errorMessage(caught);
      setFormError(message);
      toast.error("Could not create task", message);
    }
  });

  const columns: ColumnDef<TaskRow, unknown>[] = [
    {
      accessorKey: "ref",
      header: "Task",
      cell: ({ row }) => <span className="font-mono text-[11px] text-ink-500">{row.original.ref}</span>,
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <div className="max-w-[17rem]">
          <p className="truncate text-[12.5px] font-medium text-ink-900">{row.original.title}</p>
          <p className="mt-0.5 truncate text-[10.5px] text-ink-400">{row.original.description}</p>
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <span className="inline-flex whitespace-nowrap rounded-md bg-ink-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-600">
          {TASK_CATEGORY_LABELS[row.original.category]}
        </span>
      ),
    },
    {
      id: "related",
      accessorFn: (row) => row.relatedRef ?? "",
      header: "Related to",
      cell: ({ row }) =>
        row.original.relatedHref && row.original.relatedRef !== "—" ? (
          <Link
            href={row.original.relatedHref}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10.5px] text-brand-700 hover:underline"
          >
            {row.original.relatedRef} <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <span className="text-[11px] text-ink-400">
            {row.original.relatedRef && row.original.relatedRef !== "—" ? row.original.relatedRef : "—"}
          </span>
        ),
    },
    {
      id: "assignee",
      accessorFn: (row) => row.assigneeName,
      header: "Assignee",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Avatar name={row.original.assigneeName} color={row.original.assigneeColor} size="xs" />
          <span className="text-[11.5px] text-ink-700">{row.original.assigneeName}</span>
        </div>
      ),
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => <StatusBadge status={row.original.priority} dot={false} />,
    },
    {
      id: "dueDate",
      accessorFn: (row) => row.dueDate,
      header: "Due",
      cell: ({ row }) => {
        const overdue = isOverdue(row.original);
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap text-[11px]",
              overdue ? "font-semibold text-rose-600" : "text-ink-600",
            )}
          >
            <CalendarDays className="h-3 w-3" />
            {formatDate(row.original.dueDate)}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "quick",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        if (!canManage) return null;
        const action = quickActionFor(row.original);
        if (!action) return null;
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10.5px]"
            disabled={busyId === row.original.id}
            loading={busyId === row.original.id}
            onClick={(event) => {
              event.stopPropagation();
              void changeStatus(row.original, action.status);
            }}
          >
            {action.status === "COMPLETED" ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : action.status === "ESCALATED" ? (
              <TriangleAlert className="h-3 w-3" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {action.label}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="surface flex flex-col gap-2 rounded-2xl px-3 pt-1 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors",
                tab === item.key
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-800",
              )}
            >
              {item.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold tabular",
                  tab === item.key ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-500",
                )}
              >
                {counts[item.key]}
              </span>
            </button>
          ))}
        </div>
        {canManage ? (
          <Button size="sm" className="mb-2 shrink-0 self-start sm:self-auto" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> New task
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCategory("")}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
            category === ""
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-ink-200 bg-white text-ink-500 hover:border-ink-300 hover:text-ink-800",
          )}
        >
          All categories
        </button>
        {CATEGORY_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(category === key ? "" : key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
              category === key
                ? "border-brand-300 bg-brand-50 text-brand-700"
                : "border-ink-200 bg-white text-ink-500 hover:border-ink-300 hover:text-ink-800",
            )}
          >
            {TASK_CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>

      <FilterBar
        activeCount={activeFilterCount}
        onReset={() => {
          setCategory("");
          setPriority("");
          setAssignee("");
          setStatus("");
          setTab("ALL");
        }}
      >
        <FilterField label="Category">
          <Select
            value={category}
            onChange={(event) => setCategory((event.target.value as TaskCategory) || "")}
            className="h-9 min-w-[8.5rem] text-[11.5px]"
          >
            <option value="">All categories</option>
            {CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>
                {TASK_CATEGORY_LABELS[key]}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Priority">
          <Select
            value={priority}
            onChange={(event) => setPriority((event.target.value as TaskPriority) || "")}
            className="h-9 min-w-[7.5rem] text-[11.5px]"
          >
            <option value="">Any priority</option>
            {PRIORITY_KEYS.map((key) => (
              <option key={key} value={key}>
                {humanize(key)}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Assignee">
          <Select
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            className="h-9 min-w-[10.5rem] text-[11.5px]"
          >
            <option value="">All assignees</option>
            {assignees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.designation}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Status">
          <Select
            value={status}
            onChange={(event) => setStatus((event.target.value as TaskStatus) || "")}
            className="h-9 min-w-[9rem] text-[11.5px]"
          >
            <option value="">All statuses</option>
            {STATUS_KEYS.map((key) => (
              <option key={key} value={key}>
                {humanize(key)}
              </option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>

      <DataTable
        data={visibleRows}
        columns={columns}
        searchPlaceholder="Search task, ref, assignee or description…"
        getSearchText={(row) =>
          [row.ref, row.title, row.description, row.assigneeName, TASK_CATEGORY_LABELS[row.category], row.status].join(
            " ",
          )
        }
        onRowClick={(row) => setSelected(row)}
        rowClassName={(row) => (row.status === "CANCELLED" ? "opacity-60" : undefined)}
        emptyTitle="No tasks match this view"
        emptyDescription="Try a different tab, category chip or clear the filters."
        footer={<span>DEMO task queue · scoped to your branch</span>}
      />

      <Modal
        open={createOpen}
        onClose={() => {
          if (!form.formState.isSubmitting) setCreateOpen(false);
        }}
        title="Create task"
        description="Assign operational work with a due date. Tasks are audited on creation."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={form.formState.isSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void onCreate()} loading={form.formState.isSubmitting}>
              Create task
            </Button>
          </>
        }
      >
        <form className="space-y-3.5" onSubmit={onCreate} noValidate>
          <Field label="Title" htmlFor="task-title" required error={form.formState.errors.title?.message}>
            <Input id="task-title" placeholder="e.g. Follow up on overdue EMI" {...form.register("title")} />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Category" htmlFor="task-category" required error={form.formState.errors.category?.message}>
              <Select id="task-category" {...form.register("category")}>
                {CATEGORY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {TASK_CATEGORY_LABELS[key]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="task-priority" required error={form.formState.errors.priority?.message}>
              <Select id="task-priority" {...form.register("priority")}>
                {PRIORITY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {humanize(key)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Description" htmlFor="task-description" required error={form.formState.errors.description?.message}>
            <Textarea
              id="task-description"
              placeholder="Context, expected outcome and any dependencies…"
              {...form.register("description")}
            />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Assignee" htmlFor="task-assignee" required error={form.formState.errors.assigneeId?.message}>
              <Select id="task-assignee" {...form.register("assigneeId")}>
                <option value="">Select assignee</option>
                {assignees.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.branchName.split("—")[0].trim()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date" htmlFor="task-due" required error={form.formState.errors.dueDate?.message}>
              <Input id="task-due" type="date" min={todayInput()} {...form.register("dueDate")} />
            </Field>
          </div>

          {formError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">{formError}</p>
          ) : null}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
            Create task
          </button>
        </form>
      </Modal>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? "Task"}
        description={selected ? `${selected.ref} · ${TASK_CATEGORY_LABELS[selected.category]}` : undefined}
        width="max-w-md"
        footer={
          <Button variant="outline" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              <StatusBadge status={selected.priority} dot={false} />
              <span className="rounded-md bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-600">
                {TASK_CATEGORY_LABELS[selected.category]}
              </span>
            </div>

            <p className="rounded-xl border border-ink-100 bg-ink-50/50 p-3.5 text-[12px] leading-relaxed text-ink-700">
              {selected.description}
            </p>

            <dl className="space-y-2 text-[12px]">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-ink-500">Assignee</dt>
                <dd className="flex items-center gap-2 font-medium text-ink-800">
                  <Avatar name={selected.assigneeName} color={selected.assigneeColor} size="xs" />
                  {selected.assigneeName}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-ink-500">Branch</dt>
                <dd className="text-right font-medium text-ink-800">{selected.branchName}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-ink-500">Due date</dt>
                <dd className={cn("text-right font-medium", isOverdue(selected) ? "text-rose-600" : "text-ink-800")}>
                  {formatDate(selected.dueDate)}
                  {isOverdue(selected) ? " · overdue" : ""}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-ink-500">Created</dt>
                <dd className="text-right font-medium text-ink-800">{formatDateTime(selected.createdAt)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-ink-500">Completed</dt>
                <dd className="text-right font-medium text-ink-800">
                  {selected.completedAt ? formatDateTime(selected.completedAt) : "—"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-ink-500">Related record</dt>
                <dd className="text-right font-medium">
                  {selected.relatedHref ? (
                    <Link
                      href={selected.relatedHref}
                      className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                    >
                      {selected.relatedRef} <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="text-ink-800">{selected.relatedRef ?? "—"}</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="border-t border-ink-100 pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Update status</p>
              {canManage ? (
                selected.allowedNext.length === 0 ? (
                  <p className="text-[11px] text-ink-500">This task is closed. No further transitions are available.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {selected.allowedNext.map((next) => (
                        <Button
                          key={next}
                          size="sm"
                          variant={next === "COMPLETED" ? "primary" : next === "CANCELLED" ? "outline" : "soft"}
                          className="w-full text-[11px]"
                          disabled={busyId === selected.id}
                          loading={busyId === selected.id}
                          onClick={() => void changeStatus(selected, next)}
                        >
                          {STATUS_ACTION_LABELS[next]}
                        </Button>
                      ))}
                  </div>
                )
              ) : (
                <p className="text-[11px] text-ink-500">You need tasks:manage to update this task.</p>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
