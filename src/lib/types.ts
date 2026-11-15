export type ID = string;

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type Page<T> = PageMeta & { items: T[] };

export type RoleCode = string;

export type Permission =
  | "dashboard:view"
  | "leads:view"
  | "leads:manage"
  | "leads:assign"
  | "applications:view"
  | "applications:manage"
  | "credit:view"
  | "credit:decide"
  | "sanctions:view"
  | "sanctions:decide"
  | "disbursements:view"
  | "disbursements:process"
  | "disbursements:approve"
  | "collections:view"
  | "collections:manage"
  | "tasks:view"
  | "tasks:manage"
  | "authorizations:view"
  | "authorizations:approve"
  | "customers:view"
  | "users:view"
  | "users:manage"
  | "reports:view"
  | "reports:export"
  | "audit:view"
  | "operations:view"
  | "operations:manage"
  | "access:view"
  | "access:manage"
  | "access:delegate"
  | "roles:manage";

export type RoleDefinition = {
  code: RoleCode;
  name: string;
  shortLabel: string;
  description: string;
  permissions: Permission[];
  rank: number;
  isSystem: boolean;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RecordType =
  | "CUSTOMER"
  | "LEAD"
  | "APPLICATION"
  | "SANCTION"
  | "LOAN"
  | "DISBURSEMENT"
  | "COLLECTION"
  | "TASK"
  | "BRANCH"
  | "DEPARTMENT"
  | "ORGANIZATION";

export type AccessScopeType = "GLOBAL" | "BRANCH" | "DEPARTMENT" | "RECORD";

export type AccessGrant = {
  id: ID;
  subjectId: ID;
  permission: Permission;
  effect: "ALLOW" | "DENY";
  scopeType: AccessScopeType;
  branchId: ID | null;
  department: string | null;
  recordType: RecordType | null;
  recordId: ID | null;
  mode: "DIRECT" | "DELEGATED";
  reason: string;
  grantedBy: ID;
  grantedAt: string;
  expiresAt: string | null;
  revokedBy: ID | null;
  revokedAt: string | null;
  revokedReason: string | null;
};

export type PermissionAudit = {
  id: ID;
  at: string;
  actorId: ID;
  actorRole: RoleCode;
  targetType: "USER" | "ROLE" | "GRANT";
  targetId: ID;
  targetLabel: string;
  action: string;
  before: string[];
  after: string[];
  reason: string;
  ip: string;
  expiresAt: string | null;
};

export type GrantSource = {
  kind: "ROLE" | "USER" | "BRANCH" | "DEPARTMENT" | "RECORD" | "SUPER_ADMIN";
  label: string;
  grantId?: ID;
  expiresAt?: string | null;
  recordType?: RecordType;
  recordId?: ID;
};

export type EffectivePermission = {
  permission: Permission;
  allowed: boolean;
  sources: GrantSource[];
  deniedBy: GrantSource[];
};

export type AccessContext = {
  branchId?: ID;
  department?: string;
  recordType?: RecordType;
  recordId?: ID;
};

export type Branch = {
  id: ID;
  code: string;
  name: string;
  city: string;
  region: string;
};

export type User = {
  id: ID;
  name: string;
  email: string;
  phone: string;
  role: RoleCode;
  designation: string;
  branchId: ID;
  branchIds: ID[];
  department: string;
  recordAccess: "BRANCH" | "ASSIGNED";
  status: "ACTIVE" | "INACTIVE";
  avatarColor: string;
  lastLoginAt: string | null;
  createdAt: string;
};

export type UserRecord = User & { passwordHash: string };

export type SessionRecord = {
  id: ID;
  userId: ID;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  ip: string;
  userAgent: string;
};

export type StoredDocumentFile = {
  id: ID;
  applicationId: ID;
  documentId: ID;
  branchId: ID;
  originalName: string;
  storedName: string;
  mime: string;
  size: number;
  sha256: string;
  uploadedBy: ID;
  uploadedAt: string;
};

export type SessionUser = {
  id: ID;
  name: string;
  email: string;
  role: RoleCode;
  roleName: string;
  designation: string;
  department: string;
  branchId: ID;
  branchIds: ID[];
  branchName: string;
  recordAccess: "BRANCH" | "ASSIGNED";
  permissions: Permission[];
  isSuperAdmin: boolean;
  avatarColor: string;
};

export type LeadType = "NEW" | "REPEAT" | "PRE_APPROVED";
export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "CONVERTED"
  | "LOST";
export type LeadSource =
  | "WEBSITE"
  | "REFERRAL"
  | "WALK_IN"
  | "PARTNER"
  | "CAMPAIGN"
  | "REPEAT_CUSTOMER";

export type Activity = {
  id: ID;
  at: string;
  actorId: ID;
  type: string;
  summary: string;
};

export type FollowUp = {
  id: ID;
  at: string;
  actorId: ID;
  channel: "CALL" | "VISIT" | "EMAIL" | "WHATSAPP_NOTE";
  outcome: "CONNECTED" | "NO_ANSWER" | "INTERESTED" | "NOT_INTERESTED" | "CALLBACK";
  notes: string;
  nextFollowUpAt: string | null;
};

export type Lead = {
  id: ID;
  ref: string;
  customerName: string;
  phone: string;
  email: string;
  city: string;
  source: LeadSource;
  type: LeadType;
  status: LeadStatus;
  branchId: ID;
  ownerId: ID;
  monthlyIncome: number;
  loanPurpose: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  nextFollowUpAt: string | null;
  convertedApplicationId: ID | null;
  activities: Activity[];
  followUps: FollowUp[];
};

export type KycStatus = "VERIFIED" | "PENDING" | "REJECTED";

export type Customer = {
  id: ID;
  ref: string;
  name: string;
  dob: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  phone: string;
  email: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  panMasked: string;
  aadhaarMasked: string;
  employmentType: "SALARIED" | "SELF_EMPLOYED" | "BUSINESS_OWNER";
  employer: string;
  monthlyIncome: number;
  kycStatus: KycStatus;
  branchId: ID;
  relationshipSince: string;
  createdAt: string;
};

export type LoanProduct = "PERSONAL" | "BUSINESS" | "HOME" | "VEHICLE" | "GOLD";

export type ApplicationStatus =
  | "NEW"
  | "IN_PROCESS"
  | "RECOMMENDED"
  | "SENT_BACK"
  | "CREDIT_APPROVED"
  | "CREDIT_REJECTED"
  | "SANCTIONED"
  | "DISBURSEMENT_PENDING"
  | "DISBURSED"
  | "CLOSED";

export type DocumentCheck = {
  id: ID;
  name: string;
  required: boolean;
  status: "PENDING" | "UPLOADED" | "VERIFIED" | "REJECTED";
  fileName: string | null;
  uploadedAt: string | null;
  fileId: ID | null;
};

export type VerificationStatus = "PENDING" | "VERIFIED" | "FAILED";

export type CreditDecision = {
  id: ID;
  decidedBy: ID;
  decidedAt: string;
  decision: "APPROVE" | "REJECT" | "SEND_BACK";
  approvedAmount: number | null;
  remarks: string;
} | null;

export type LoanApplication = {
  id: ID;
  ref: string;
  customerId: ID;
  leadId: ID | null;
  product: LoanProduct;
  requestedAmount: number;
  tenureMonths: number;
  interestRate: number;
  purpose: string;
  status: ApplicationStatus;
  branchId: ID;
  ownerId: ID;
  creditOfficerId: ID | null;
  isAuto: boolean;
  riskBand: "LOW" | "MEDIUM" | "HIGH" | null;
  sentBackReason: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  creditDecision: CreditDecision;
  documents: DocumentCheck[];
  verification: {
    identity: VerificationStatus;
    address: VerificationStatus;
    employment: VerificationStatus;
    income: VerificationStatus;
  };
  activities: Activity[];
};

export type SanctionStatus =
  | "PENDING_ACCEPTANCE"
  | "PROCESSING"
  | "APPROVED"
  | "REJECTED";

export type Sanction = {
  id: ID;
  ref: string;
  applicationId: ID;
  customerId: ID;
  approvedAmount: number;
  interestRate: number;
  tenureMonths: number;
  processingFee: number;
  status: SanctionStatus;
  requestedAt: string;
  decidedAt: string | null;
  approvedBy: ID | null;
  remarks: string;
  disbursementMode: "NEFT" | "IMPS" | "UPI";
  branchId: ID;
  activities: Activity[];
};

export type DisbursementStatus =
  | "NEW"
  | "IN_PROCESS"
  | "RECOMMENDED"
  | "PENDING"
  | "REJECTED"
  | "COMPLETED";

export type Disbursement = {
  id: ID;
  ref: string;
  sanctionId: ID;
  applicationId: ID;
  customerId: ID;
  amount: number;
  mode: "NEFT" | "IMPS" | "UPI";
  status: DisbursementStatus;
  requestedAt: string;
  processedAt: string | null;
  processedBy: ID | null;
  bankRef: string | null;
  remarks: string;
  branchId: ID;
  activities: Activity[];
};

export type LoanStatus = "ACTIVE" | "OVERDUE" | "CLOSED" | "WRITTEN_OFF";

export type LoanAccount = {
  id: ID;
  ref: string;
  applicationId: ID;
  disbursementId: ID;
  customerId: ID;
  branchId: ID;
  principal: number;
  outstanding: number;
  interestRate: number;
  tenureMonths: number;
  emiAmount: number;
  disbursedAt: string;
  status: LoanStatus;
  nextDueDate: string;
  dpd: number;
  paidAmount: number;
  penaltyAccrued: number;
};

export type RepaymentStatus = "PAID" | "PENDING" | "OVERDUE" | "PARTIAL";

export type Repayment = {
  id: ID;
  ref: string;
  loanAccountId: ID;
  customerId: ID;
  dueDate: string;
  paidDate: string | null;
  amount: number;
  principalComponent: number;
  interestComponent: number;
  penalty: number;
  status: RepaymentStatus;
  mode: "NACH" | "UPI" | "NEFT" | "CASH" | null;
  receiptNo: string | null;
};

export type CollectionBucket = "PRE_DUE" | "BUCKET_1" | "BUCKET_2" | "BUCKET_3" | "NPA";

export type CollectionStatus =
  | "PRE_COLLECTION"
  | "PENDING"
  | "RECOVERY"
  | "LEGAL"
  | "RESOLVED";

export type CollectionCase = {
  id: ID;
  ref: string;
  loanAccountId: ID;
  customerId: ID;
  branchId: ID;
  bucket: CollectionBucket;
  status: CollectionStatus;
  assignedTo: ID;
  overdueAmount: number;
  daysPastDue: number;
  lastContactAt: string | null;
  nextActionAt: string | null;
  ptpAmount: number | null;
  ptpDate: string | null;
  recoveryStage: string;
  createdAt: string;
  activities: Activity[];
};

export type TaskCategory =
  | "CREDIT"
  | "COLLECTION"
  | "FIELD"
  | "LEGAL"
  | "AGENCY"
  | "GRE"
  | "OTHER";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "ESCALATED" | "CANCELLED";

export type Task = {
  id: ID;
  ref: string;
  category: TaskCategory;
  title: string;
  description: string;
  relatedType: "LEAD" | "APPLICATION" | "LOAN" | "COLLECTION" | "GRIEVANCE" | "NONE";
  relatedId: ID | null;
  assigneeId: ID;
  branchId: ID;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  createdAt: string;
  completedAt: string | null;
};

export type AuthorizationType = "PAYMENT" | "LMS_ACCOUNT" | "AGENCY";

export type AuthorizationRequest = {
  id: ID;
  ref: string;
  type: AuthorizationType;
  title: string;
  entityName: string;
  amount: number | null;
  requestedBy: ID;
  branchId: ID;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: ID | null;
  remarks: string;
  activities: Activity[];
};

export type AuditLog = {
  id: ID;
  at: string;
  actorId: ID;
  action: string;
  entityType: string;
  entityId: ID;
  summary: string;
  ip: string;
};

export type Notification = {
  id: ID;
  userId: ID | null;
  role: RoleCode | null;
  title: string;
  body: string;
  type: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  at: string;
  read: boolean;
  href: string | null;
};

export type BlacklistEntry = {
  id: ID;
  name: string;
  panMasked: string;
  phone: string;
  reason: string;
  source: string;
  status: "ACTIVE" | "UNDER_REVIEW" | "REMOVED";
  addedAt: string;
  addedBy: ID;
};

export type Grievance = {
  id: ID;
  ref: string;
  customerId: ID;
  branchId: ID;
  category: "SERVICE" | "CHARGES" | "COLLECTION" | "DOCUMENT" | "OTHER";
  description: string;
  priority: TaskPriority;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED";
  assignedTo: ID;
  createdAt: string;
  resolvedAt: string | null;
};

export type ESignRequest = {
  id: ID;
  applicationId: ID;
  customerId: ID;
  status: "NOT_INITIATED" | "INITIATED" | "SIGNED" | "FAILED";
  provider: "DEMO_ESIGN";
  initiatedAt: string | null;
  completedAt: string | null;
};

export type Store = {
  branches: Branch[];
  users: UserRecord[];
  roles: RoleDefinition[];
  accessGrants: AccessGrant[];
  permissionAudits: PermissionAudit[];
  sessions: SessionRecord[];
  documentFiles: StoredDocumentFile[];
  security: { protectedSuperAdminId: ID };
  customers: Customer[];
  leads: Lead[];
  applications: LoanApplication[];
  sanctions: Sanction[];
  disbursements: Disbursement[];
  loanAccounts: LoanAccount[];
  repayments: Repayment[];
  collectionCases: CollectionCase[];
  tasks: Task[];
  authorizations: AuthorizationRequest[];
  auditLogs: AuditLog[];
  notifications: Notification[];
  blacklist: BlacklistEntry[];
  grievances: Grievance[];
  esign: ESignRequest[];
};

export type Scope = {
  user: SessionUser;
  branchIds: ID[] | null;
  isGlobal: boolean;
};

export type ShellCounts = {
  credit: number;
  sanctions: number;
  tasks: number;
  collections: number;
  authorizations: number;
};

export type DateRangeFilter = { from?: string; to?: string };

export type SearchGroup = {
  label: string;
  type: "lead" | "application" | "customer" | "loan" | "task";
  items: { id: ID; title: string; subtitle: string; href: string }[];
};

export type DashboardKpis = {
  totalLeads: number;
  newLeads: number;
  newApplications: number;
  inProcessApplications: number;
  pendingCredit: number;
  approvedLoans: number;
  rejectedLoans: number;
  totalDisbursed: number;
  collectionRate: number;
  overdueAmount: number;
  activeLoans: number;
  tasksDue: number;
};

export type SeriesPoint = { label: string; value: number };

export type DashboardData = {
  kpis: DashboardKpis;
  applicationTrend: SeriesPoint[];
  disbursementTrend: SeriesPoint[];
  collectionTrend: SeriesPoint[];
  leadFunnel: { stage: string; value: number }[];
  productMix: { label: string; value: number }[];
  decisionTrend: { labels: string[]; approved: number[]; rejected: number[] };
  pendingTasks: Task[];
  recentActivities: AuditLog[];
  teamPerformance: {
    userId: ID;
    name: string;
    role: RoleCode;
    leads: number;
    applications: number;
    disbursed: number;
    collections: number;
    tasksCompleted: number;
  }[];
  branchPerformance: { branch: string; disbursed: number; collected: number; overdue: number }[];
};
