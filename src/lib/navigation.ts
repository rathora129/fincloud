import {
  BadgeCheck,
  Banknote,
  BarChart3,
  FileText,
  HandCoins,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ListTodo,
  LockKeyhole,
  ScrollText,
  ShieldCheck,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "./types";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  badgeKey?: "credit" | "tasks" | "sanctions" | "collections" | "authorizations";
  description: string;
};

export type NavSection = { title: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        permission: "dashboard:view",
        description: "Portfolio, pipeline and team performance",
      },
    ],
  },
  {
    title: "Origination",
    items: [
      {
        label: "Leads",
        href: "/leads",
        icon: UsersRound,
        permission: "leads:view",
        description: "Capture, qualify and convert leads",
      },
      {
        label: "Applications",
        href: "/applications",
        icon: FileText,
        permission: "applications:view",
        badgeKey: "credit",
        description: "Loan applications and verification",
      },
      {
        label: "Customers",
        href: "/customers",
        icon: Users,
        permission: "customers:view",
        description: "Relationship view across the lifecycle",
      },
    ],
  },
  {
    title: "Risk & Fulfilment",
    items: [
      {
        label: "Credit Review",
        href: "/credit",
        icon: ShieldCheck,
        permission: "credit:view",
        badgeKey: "credit",
        description: "Credit assessment and decisions",
      },
      {
        label: "Sanctions",
        href: "/sanctions",
        icon: BadgeCheck,
        permission: "sanctions:view",
        badgeKey: "sanctions",
        description: "Sanction offers and approvals",
      },
      {
        label: "Disbursements",
        href: "/disbursements",
        icon: Banknote,
        permission: "disbursements:view",
        description: "Payout processing (DEMO, no real transfers)",
      },
    ],
  },
  {
    title: "Servicing",
    items: [
      {
        label: "Collections",
        href: "/collections",
        icon: HandCoins,
        permission: "collections:view",
        badgeKey: "collections",
        description: "Repayment, overdue and recovery",
      },
      {
        label: "Tasks",
        href: "/tasks",
        icon: ListTodo,
        permission: "tasks:view",
        badgeKey: "tasks",
        description: "Operational task queues",
      },
      {
        label: "Authorizations",
        href: "/authorizations",
        icon: KeyRound,
        permission: "authorizations:view",
        badgeKey: "authorizations",
        description: "Payment, LMS and agency approvals",
      },
    ],
  },
  {
    title: "Intelligence",
    items: [
      {
        label: "Reports & MIS",
        href: "/reports",
        icon: BarChart3,
        permission: "reports:view",
        description: "Operational and performance reporting",
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        label: "Users & Roles",
        href: "/users",
        icon: UserCog,
        permission: "users:view",
        description: "Team access and permissions",
      },
      {
        label: "Access Control",
        href: "/access-control",
        icon: LockKeyhole,
        permission: "access:view",
        description: "Roles, grants, delegation and record-level access",
      },
      {
        label: "Audit Logs",
        href: "/audit-logs",
        icon: ScrollText,
        permission: "audit:view",
        description: "Immutable activity trail",
      },
      {
        label: "Support Operations",
        href: "/operations",
        icon: LifeBuoy,
        permission: "operations:view",
        description: "eSign, blacklist and grievances",
      },
    ],
  },
];

export const ROUTE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  applications: "Applications",
  credit: "Credit Review",
  sanctions: "Sanctions",
  disbursements: "Disbursements",
  collections: "Collections",
  tasks: "Tasks",
  authorizations: "Authorizations",
  reports: "Reports & MIS",
  users: "Users & Roles",
  "access-control": "Access Control Center",
  "audit-logs": "Audit Logs",
  operations: "Support Operations",
  customers: "Customer 360",
  profile: "My Profile",
  new: "New",
};

export function navItemForPath(pathname: string) {
  return NAV_SECTIONS.flatMap((s) => s.items).find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
