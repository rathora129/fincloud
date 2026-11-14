import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { hasPermission } from "@/server/permissions";
import { getAccessCenterData } from "@/server/access-control";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/states";
import { AccessControlClient } from "./access-control-client";

export const metadata = { title: "Access Control Center" };

export default async function AccessControlPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.id, "access:view")) {
    return <PermissionDenied className="mt-2" />;
  }

  const data = getAccessCenterData(user);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Access Control Center"
        description="Hybrid RBAC, individual grants, record-level access and delegation — evaluated by one central engine and enforced on every backend request."
        actions={
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Demo access data
          </span>
        }
      />

      <AccessControlClient
        initialData={data}
        currentUserId={user.id}
        canManage={hasPermission(user.id, "access:manage")}
        canDelegate={hasPermission(user.id, "access:delegate")}
        canManageRoles={hasPermission(user.id, "roles:manage")}
        isProtectedSuperAdmin={user.isSuperAdmin}
      />
    </div>
  );
}
