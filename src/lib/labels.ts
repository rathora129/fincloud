export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "purple";

type Meta = { label: string; tone: Tone };

export const STATUS_META: Record<string, Meta> = {
  NEW: { label: "New", tone: "info" },
  CONTACTED: { label: "Contacted", tone: "info" },
  QUALIFIED: { label: "Qualified", tone: "success" },
  CONVERTED: { label: "Converted", tone: "success" },
  LOST: { label: "Lost", tone: "neutral" },
  IN_PROCESS: { label: "In Process", tone: "warning" },
  RECOMMENDED: { label: "Recommended", tone: "info" },
  SENT_BACK: { label: "Sent Back", tone: "warning" },
  CREDIT_APPROVED: { label: "Credit Approved", tone: "success" },
  CREDIT_REJECTED: { label: "Credit Rejected", tone: "danger" },
  SANCTIONED: { label: "Sanctioned", tone: "success" },
  DISBURSEMENT_PENDING: { label: "Disbursement Pending", tone: "warning" },
  DISBURSED: { label: "Disbursed", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
  PENDING_ACCEPTANCE: { label: "Acceptance Pending", tone: "warning" },
  PROCESSING: { label: "Processing", tone: "info" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  PENDING: { label: "Pending", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  ACTIVE: { label: "Active", tone: "success" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  WRITTEN_OFF: { label: "Written Off", tone: "neutral" },
  PARTIAL: { label: "Partial", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  PRE_COLLECTION: { label: "Pre-collection", tone: "info" },
  RECOVERY: { label: "Recovery", tone: "danger" },
  LEGAL: { label: "Legal", tone: "purple" },
  RESOLVED: { label: "Resolved", tone: "success" },
  OPEN: { label: "Open", tone: "info" },
  ESCALATED: { label: "Escalated", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  PENDING_APPROVAL: { label: "Pending Approval", tone: "warning" },
  VERIFIED: { label: "Verified", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  UPLOADED: { label: "Uploaded", tone: "info" },
  UNDER_REVIEW: { label: "Under Review", tone: "warning" },
  REMOVED: { label: "Removed", tone: "neutral" },
  INITIATED: { label: "Initiated", tone: "info" },
  SIGNED: { label: "Signed", tone: "success" },
  NOT_INITIATED: { label: "Not Initiated", tone: "neutral" },
  IN_REVIEW: { label: "In Review", tone: "info" },
  LOW: { label: "Low", tone: "neutral" },
  MEDIUM: { label: "Medium", tone: "info" },
  HIGH: { label: "High", tone: "warning" },
  URGENT: { label: "Urgent", tone: "danger" },
};

export const SOURCE_LABELS: Record<string, string> = {
  WEBSITE: "Website",
  REFERRAL: "Referral",
  WALK_IN: "Walk-in",
  PARTNER: "Partner",
  CAMPAIGN: "Campaign",
  REPEAT_CUSTOMER: "Repeat Customer",
};

export const LEAD_TYPE_LABELS: Record<string, string> = {
  NEW: "New Lead",
  REPEAT: "Repeat Lead",
  PRE_APPROVED: "Pre-approved",
};

export const PRODUCT_LABELS: Record<string, string> = {
  PERSONAL: "Personal Loan",
  BUSINESS: "Business Loan",
  HOME: "Home Loan",
  VEHICLE: "Vehicle Loan",
  GOLD: "Gold Loan",
};

export const PRODUCT_CODES: Record<string, string> = {
  PERSONAL: "PL",
  BUSINESS: "BL",
  HOME: "HL",
  VEHICLE: "VL",
  GOLD: "GL",
};

export const EMPLOYMENT_LABELS: Record<string, string> = {
  SALARIED: "Salaried",
  SELF_EMPLOYED: "Self-employed",
  BUSINESS_OWNER: "Business owner",
};

export const BUCKET_LABELS: Record<string, string> = {
  PRE_DUE: "Pre-due",
  BUCKET_1: "1–30 DPD",
  BUCKET_2: "31–60 DPD",
  BUCKET_3: "61–90 DPD",
  NPA: "90+ DPD / NPA",
};

export const TASK_CATEGORY_LABELS: Record<string, string> = {
  CREDIT: "Credit",
  COLLECTION: "Collection",
  FIELD: "Field",
  LEGAL: "Legal",
  AGENCY: "Agency",
  GRE: "GRE",
  OTHER: "Operational",
};

export const AUTH_TYPE_LABELS: Record<string, string> = {
  PAYMENT: "Payment Authorization",
  LMS_ACCOUNT: "LMS Account Authorization",
  AGENCY: "Agency Authorization",
};

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  BRANCH_MANAGER: "Branch Manager",
  TEAM_LEADER: "Team Leader",
  SENIOR_LOAN_OFFICER: "Senior Loan Officer",
  LOAN_OFFICER: "Loan Officer",
  JUNIOR_LOAN_OFFICER: "Junior Loan Officer",
  CREDIT_MANAGER: "Credit Manager",
  CREDIT_OFFICER: "Credit Officer",
  COLLECTION_MANAGER: "Collection Manager",
  COLLECTION_OFFICER: "Collection Officer",
  ACCOUNTS_OFFICER: "Accounts Officer",
  MIS_EXECUTIVE: "MIS Executive",
};

export const GENDER_LABELS: Record<string, string> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
};

export function statusMeta(status: string | null | undefined): Meta {
  if (!status) return { label: "—", tone: "neutral" };
  return STATUS_META[status] ?? { label: status.replaceAll("_", " "), tone: "neutral" };
}

export function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
