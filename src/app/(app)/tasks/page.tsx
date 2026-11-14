import { redirect } from "next/navigation";
import { CalendarClock, CheckCircle2, ListTodo, TriangleAlert, UserRound } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope } from "@/server/access";
import { getTasksOverview, TASK_CATEGORIES } from "@/server/tasks";
import { can } from "@/lib/rbac";
import { formatNumber } from "@/lib/utils";
import type { TaskCategory } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { PermissionDenied } from "@/components/ui/states";
import { TasksBoard } from "./board";

export const metadata = { title: "Tasks" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "tasks:view")) {
    return <PermissionDenied className="mt-2" />;
  }

  const params = await searchParams;
  const categoryParam = typeof params.category === "string" ? params.category : undefined;
  const initialCategory = TASK_CATEGORIES.find((category) => category === categoryParam);

  const scope = buildScope(user);
  const overview = getTasksOverview(scope, user);
  const { kpis } = overview;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Tasks"
        description={`Operational queues for credit, collections, field, legal and agency work across ${
          scope.isGlobal ? "all branches" : user.branchName
        }. Tasks are scoped to your branch and audited on every update.`}
        breadcrumbs={[{ label: "Tasks" }]}
        actions={
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[11px] font-medium text-ink-500">
            <UserRound className="h-3.5 w-3.5" />
            {scope.isGlobal ? "All branches" : user.branchName}
          </span>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Task key indicators">
        <StatCard
          label="Open tasks"
          value={formatNumber(kpis.open)}
          hint={`${formatNumber(kpis.mine)} assigned to you`}
          icon={<ListTodo className="h-4 w-4" />}
          accent="brand"
        />
        <StatCard
          label="Due today"
          value={formatNumber(kpis.dueToday)}
          hint="Open tasks due by end of day"
          icon={<CalendarClock className="h-4 w-4" />}
          accent="amber"
        />
        <StatCard
          label="Overdue"
          value={formatNumber(kpis.overdue)}
          hint={`${formatNumber(kpis.escalated)} escalated`}
          icon={<TriangleAlert className="h-4 w-4" />}
          accent="rose"
        />
        <StatCard
          label="Completed"
          value={formatNumber(kpis.completed)}
          hint="Closed tasks in scope"
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="sky"
        />
      </section>

      <TasksBoard
        rows={overview.rows}
        assignees={overview.assignees}
        canManage={can(user, "tasks:manage")}
        currentUserId={user.id}
        initialCategory={initialCategory as TaskCategory | undefined}
      />
    </div>
  );
}
