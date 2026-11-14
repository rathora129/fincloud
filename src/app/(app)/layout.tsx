import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/server/session";
import { getShellData } from "@/server/shell";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { notifications, counts } = getShellData(user);

  return (
    <Providers user={user} notifications={notifications}>
      <AppShell user={user} counts={counts}>
        {children}
      </AppShell>
    </Providers>
  );
}
