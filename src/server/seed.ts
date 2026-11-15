import { scryptSync } from "node:crypto";
import type {
  AccessGrant,
  Activity,
  ApplicationStatus,
  AuditLog,
  AuthorizationRequest,
  BlacklistEntry,
  CollectionCase,
  Customer,
  Disbursement,
  DocumentCheck,
  ESignRequest,
  FollowUp,
  Grievance,
  Lead,
  LeadStatus,
  LeadType,
  LoanAccount,
  LoanApplication,
  LoanProduct,
  Notification,
  PermissionAudit,
  Repayment,
  Sanction,
  Store,
  Task,
  TaskCategory,
  TaskPriority,
  TaskStatus,
  UserRecord,
} from "@/lib/types";
import { DEFAULT_ROLES } from "@/lib/rbac";
import { stateForCity } from "@/lib/geo";

export const DEMO_PASSWORD = "Fincloud@2026";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20261115);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function int(min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function chance(probability: number) {
  return rng() < probability;
}

function pad(n: number, width = 4) {
  return String(n).padStart(width, "0");
}

const NOW = new Date();
const DAY = 86_400_000;

function daysAgo(days: number, hourOffset = 0) {
  return new Date(NOW.getTime() - days * DAY + hourOffset * 3_600_000).toISOString();
}

function daysAhead(days: number) {
  return new Date(NOW.getTime() + days * DAY).toISOString();
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

const BRANCHES = [
  { id: "br-mumbai", code: "MUM", name: "Mumbai — Lower Parel", city: "Mumbai", region: "West" },
  { id: "br-pune", code: "PUN", name: "Pune — Baner", city: "Pune", region: "West" },
  { id: "br-bengaluru", code: "BLR", name: "Bengaluru — Indiranagar", city: "Bengaluru", region: "South" },
  { id: "br-delhi", code: "DEL", name: "Delhi NCR — Gurugram", city: "Gurugram", region: "North" },
  { id: "br-hyderabad", code: "HYD", name: "Hyderabad — HITEC City", city: "Hyderabad", region: "South" },
];

const AVATAR_COLORS = [
  "#0f766e",
  "#0e7490",
  "#4338ca",
  "#7c3aed",
  "#b45309",
  "#be123c",
  "#15803d",
  "#0369a1",
];

const USER_ROWS: Array<{
  name: string;
  email: string;
  role: UserRecord["role"];
  designation: string;
  branchId: string;
  status?: UserRecord["status"];
  lastLoginDays?: number;
}> = [
  { name: "Arjun Mehta", email: "superadmin@fincloud.demo", role: "SUPER_ADMIN", designation: "Chief Operating Officer", branchId: "br-mumbai", lastLoginDays: 0 },
  { name: "Priya Nair", email: "admin@fincloud.demo", role: "ADMIN", designation: "Head of Operations", branchId: "br-mumbai", lastLoginDays: 0 },
  { name: "Rohan Deshmukh", email: "manager.mumbai@fincloud.demo", role: "BRANCH_MANAGER", designation: "Branch Manager", branchId: "br-mumbai", lastLoginDays: 1 },
  { name: "Kavita Iyer", email: "manager.pune@fincloud.demo", role: "BRANCH_MANAGER", designation: "Branch Manager", branchId: "br-pune", lastLoginDays: 2 },
  { name: "Sandeep Rao", email: "manager.bengaluru@fincloud.demo", role: "BRANCH_MANAGER", designation: "Branch Manager", branchId: "br-bengaluru", lastLoginDays: 4 },
  { name: "Neha Kulkarni", email: "officer.mumbai@fincloud.demo", role: "LOAN_OFFICER", designation: "Senior Loan Officer", branchId: "br-mumbai", lastLoginDays: 0 },
  { name: "Vikram Singh", email: "officer.delhi@fincloud.demo", role: "LOAN_OFFICER", designation: "Loan Officer", branchId: "br-delhi", lastLoginDays: 3 },
  { name: "Ananya Bose", email: "officer.bengaluru@fincloud.demo", role: "LOAN_OFFICER", designation: "Loan Officer", branchId: "br-bengaluru", lastLoginDays: 1 },
  { name: "Farhan Qureshi", email: "officer.hyderabad@fincloud.demo", role: "LOAN_OFFICER", designation: "Loan Officer", branchId: "br-hyderabad", lastLoginDays: 5 },
  { name: "Divya Menon", email: "officer.pune@fincloud.demo", role: "LOAN_OFFICER", designation: "Loan Officer", branchId: "br-pune", lastLoginDays: 2 },
  { name: "Meera Krishnan", email: "credit.mumbai@fincloud.demo", role: "CREDIT_OFFICER", designation: "Credit Manager", branchId: "br-mumbai", lastLoginDays: 0 },
  { name: "Aditya Sharma", email: "credit.pune@fincloud.demo", role: "CREDIT_OFFICER", designation: "Credit Analyst", branchId: "br-pune", lastLoginDays: 1 },
  { name: "Ritu Jain", email: "collections.mumbai@fincloud.demo", role: "COLLECTION_OFFICER", designation: "Collection Team Lead", branchId: "br-mumbai", lastLoginDays: 0 },
  { name: "Suresh Patil", email: "collections.pune@fincloud.demo", role: "COLLECTION_OFFICER", designation: "Collection Officer", branchId: "br-pune", lastLoginDays: 2 },
  { name: "Ishaan Verma", email: "teamlead.mumbai@fincloud.demo", role: "TEAM_LEADER", designation: "Sales Team Lead", branchId: "br-mumbai", lastLoginDays: 1 },
  { name: "Pooja Sethi", email: "jro.mumbai@fincloud.demo", role: "JUNIOR_LOAN_OFFICER", designation: "Junior Loan Officer", branchId: "br-mumbai", lastLoginDays: 0 },
  {
    name: "Tanvi Shah",
    email: "officer.suspended@fincloud.demo",
    role: "LOAN_OFFICER",
    designation: "Loan Officer",
    branchId: "br-mumbai",
    status: "INACTIVE",
    lastLoginDays: 60,
  },
];

export function departmentForRole(role: string) {
  switch (role) {
    case "SUPER_ADMIN":
    case "ADMIN":
      return "Management";
    case "BRANCH_MANAGER":
      return "Branch Operations";
    case "TEAM_LEADER":
    case "SENIOR_LOAN_OFFICER":
    case "LOAN_OFFICER":
    case "JUNIOR_LOAN_OFFICER":
      return "Sales";
    case "CREDIT_MANAGER":
    case "CREDIT_OFFICER":
      return "Credit";
    case "COLLECTION_MANAGER":
    case "COLLECTION_OFFICER":
      return "Collections";
    case "ACCOUNTS_OFFICER":
      return "Finance";
    case "MIS_EXECUTIVE":
      return "MIS";
    default:
      return "Operations";
  }
}

const FIRST_NAMES = [
  "Aarav", "Ishita", "Kabir", "Sneha", "Rahul", "Pooja", "Karan", "Nisha", "Sameer", "Ayesha",
  "Nikhil", "Ritika", "Varun", "Deepa", "Yash", "Tara", "Manish", "Ayesha", "Siddharth", "Kritika",
  "Abhishek", "Shruti", "Ravi", "Maya", "Gaurav", "Anjali", "Harsh", "Neeraj", "Sonal", "Vivek",
  "Aparna", "Raghav", "Trisha", "Omkar", "Leela", "Dev", "Kiran", "Bhavna", "Pranav", "Swati",
  "Akash", "Jaya", "Rehan", "Mitali", "Rohit", "Sakshi", "Imran", "Preeti", "Naveen", "Dia",
];

const LAST_NAMES = [
  "Sharma", "Verma", "Patil", "Iyer", "Deshpande", "Khan", "Gupta", "Reddy", "Nair", "Joshi",
  "Shetty", "Bansal", "Chatterjee", "Rao", "Kulkarni", "Malhotra", "Kapoor", "Sethi", "Bhat", "Mishra",
  "Pillai", "Agarwal", "Mehra", "Sinha", "Chauhan", "Dutta", "Naidu", "Shah", "Parekh", "Yadav",
];

const CITIES = ["Mumbai", "Pune", "Bengaluru", "Gurugram", "Hyderabad", "Thane", "Noida", "Nagpur"];

const SOURCES = ["WEBSITE", "REFERRAL", "WALK_IN", "PARTNER", "CAMPAIGN", "REPEAT_CUSTOMER"] as const;

const PURPOSES = [
  "Working capital expansion",
  "Equipment purchase",
  "Home renovation",
  "Debt consolidation",
  "Wedding expenses",
  "Medical expenses",
  "Vehicle purchase",
  "Inventory funding",
  "Education expenses",
  "Business expansion",
];

const PRODUCTS: LoanProduct[] = ["PERSONAL", "BUSINESS", "HOME", "VEHICLE", "GOLD"];

const PRODUCT_AMOUNTS: Record<LoanProduct, [number, number]> = {
  PERSONAL: [75_000, 800_000],
  BUSINESS: [300_000, 2_500_000],
  HOME: [1_500_000, 6_000_000],
  VEHICLE: [300_000, 1_500_000],
  GOLD: [100_000, 1_000_000],
};

const PRODUCT_RATES: Record<LoanProduct, [number, number]> = {
  PERSONAL: [13.5, 18.5],
  BUSINESS: [14, 20],
  HOME: [8.5, 11],
  VEHICLE: [9, 13],
  GOLD: [10, 14],
};

const PRODUCT_TENURES: Record<LoanProduct, [number, number, number]> = {
  PERSONAL: [12, 48, 12],
  BUSINESS: [12, 60, 12],
  HOME: [60, 240, 60],
  VEHICLE: [24, 60, 12],
  GOLD: [6, 24, 6],
};

const DOCUMENT_SETS = [
  "PAN card",
  "Aadhaar (masked)",
  "Bank statement — 6 months",
  "Salary slips — 3 months",
  "ITR — 2 years",
  "Address proof",
  "GST returns",
];

const PROCESSORS = ["br-mumbai", "br-pune", "br-bengaluru", "br-delhi", "br-hyderabad"];

function ref(prefix: string, index: number, year = NOW.getFullYear()) {
  return `${prefix}-${year}-${pad(index)}`;
}

function round(value: number, step = 100) {
  return Math.round(value / step) * step;
}

function emiFor(principal: number, annualRate: number, tenureMonths: number) {
  const r = annualRate / 12 / 100;
  if (r === 0) return Math.round(principal / tenureMonths);
  const factor = Math.pow(1 + r, tenureMonths);
  return Math.round((principal * r * factor) / (factor - 1));
}

function scopedOfficers(users: UserRecord[], branchId: string, roles: UserRecord["role"][]) {
  return users.filter((u) => u.status === "ACTIVE" && u.branchId === branchId && roles.includes(u.role));
}

function makeActivity(index: number, actorId: string, type: string, summary: string, days: number): Activity {
  return { id: `act-${pad(index, 6)}`, at: daysAgo(days, -index % 6), actorId, type, summary };
}

function makeDocuments(index: number, complete: boolean): DocumentCheck[] {
  const count = int(3, DOCUMENT_SETS.length);
  return DOCUMENT_SETS.slice(0, count).map((name, i) => {
    const status: DocumentCheck["status"] = complete
      ? "VERIFIED"
      : chance(0.55)
        ? "VERIFIED"
        : chance(0.5)
          ? "UPLOADED"
          : "PENDING";
    return {
      id: `doc-${index}-${i}`,
      name,
      required: i < 3,
      status,
      fileName: status === "PENDING" ? null : `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${pad(index)}.pdf`,
      uploadedAt: status === "PENDING" ? null : daysAgo(int(1, 30)),
      fileId: null,
    };
  });
}

export function buildSeed(): Store {
  const passwordHash = scryptSync(DEMO_PASSWORD, "fincloud-demo-salt", 64).toString("hex");

  const users: UserRecord[] = USER_ROWS.map((row, i) => ({
    id: `usr-${pad(i + 1, 3)}`,
    name: row.name,
    email: row.email,
    phone: `+91 9${int(10, 89)}${int(1000000, 9999999)}`,
    role: row.role,
    designation: row.designation,
    branchId: row.branchId,
    branchIds: [row.branchId],
    department: departmentForRole(row.role),
    recordAccess: "BRANCH",
    status: row.status ?? "ACTIVE",
    avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
    lastLoginAt: row.lastLoginDays === undefined ? null : daysAgo(row.lastLoginDays, -i),
    createdAt: daysAgo(500 - i * 12),
    passwordHash,
  }));

  const activeUsers = users.filter((u) => u.status === "ACTIVE");
  const loanOfficers = activeUsers.filter((u) => u.role === "LOAN_OFFICER");
  const creditOfficers = activeUsers.filter((u) => u.role === "CREDIT_OFFICER");
  const collectionOfficers = activeUsers.filter((u) => u.role === "COLLECTION_OFFICER");
  const managers = activeUsers.filter((u) => u.role === "BRANCH_MANAGER");

  const customers: Customer[] = [];
  const customerNames = new Set<string>();
  let customerIndex = 1;
  while (customers.length < 58) {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    if (customerNames.has(name)) continue;
    customerNames.add(name);
    const branch = pick(BRANCHES);
    const employmentType = pick(["SALARIED", "SELF_EMPLOYED", "BUSINESS_OWNER"] as const);
    const income =
      employmentType === "SALARIED" ? int(35_000, 220_000) : employmentType === "SELF_EMPLOYED" ? int(45_000, 350_000) : int(80_000, 500_000);
    const idx = customerIndex++;
    const city = pick(CITIES);
    customers.push({
      id: `cus-${pad(idx)}`,
      ref: ref("CUS", idx),
      name,
      dob: new Date(NOW.getFullYear() - int(23, 58), int(0, 11), int(1, 27)).toISOString(),
      gender: pick(["MALE", "FEMALE", "OTHER"] as const),
      phone: `+91 9${int(10, 89)}${int(1000000, 9999999)}`,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      addressLine: `${int(1, 99)}, ${pick(["Sunrise", "Green Park", "Lake View", "Palm Grove", "Skyline", "Orchid"])} ${pick(["Residency", "Enclave", "Heights", "Complex"])}`,
      city,
      state: stateForCity(city),
      pincode: String(int(110001, 500099)),
      panMasked: `SYNPA••••${String.fromCharCode(65 + int(0, 25))}`,
      aadhaarMasked: `•••• •••• ${int(1000, 9999)}`,
      employmentType,
      employer:
        employmentType === "SALARIED"
          ? pick(["Nimbus Software", "Orion Manufacturing", "Bluepeak Services", "Zenith Retail"])
          : pick(["Self-employed", "Shree Traders", "Vertex Consulting", "Kaveri Foods"]),
      monthlyIncome: income,
      kycStatus: chance(0.78) ? "VERIFIED" : chance(0.6) ? "PENDING" : "REJECTED",
      branchId: branch.id,
      relationshipSince: daysAgo(int(30, 900)),
      createdAt: daysAgo(int(30, 900)),
    });
  }

  const leads: Lead[] = [];
  const leadStatusPool: LeadStatus[] = [
    ...Array(52).fill("NEW"),
    ...Array(34).fill("CONTACTED"),
    ...Array(28).fill("QUALIFIED"),
    ...Array(32).fill("CONVERTED"),
    ...Array(14).fill("LOST"),
  ];
  const leadTypePool: LeadType[] = [
    ...Array(96).fill("NEW"),
    ...Array(40).fill("REPEAT"),
    ...Array(24).fill("PRE_APPROVED"),
  ];

  for (let i = 1; i <= 160; i++) {
    const branch = pick(BRANCHES);
    const branchOfficers = scopedOfficers(users, branch.id, ["LOAN_OFFICER", "BRANCH_MANAGER"]);
    const owner = branchOfficers.length ? pick(branchOfficers) : pick(loanOfficers);
    const status = pick(leadStatusPool);
    const type = pick(leadTypePool);
    const name = pick(customers).name;
    const createdAt = daysAgo(int(0, 165), int(0, 22));
    const createdDays = Math.max(0, Math.floor((NOW.getTime() - new Date(createdAt).getTime()) / DAY));
    const followUps: FollowUp[] = [];
    if (status !== "NEW") {
      const sessions = int(1, 4);
      for (let f = 0; f < sessions; f++) {
        followUps.push({
          id: `fu-${pad(i)}-${f}`,
          at: daysAgo(Math.max(0, createdDays - f * 3), int(9, 17)),
          actorId: owner.id,
          channel: pick(["CALL", "VISIT", "EMAIL", "WHATSAPP_NOTE"] as const),
          outcome: pick(["CONNECTED", "NO_ANSWER", "INTERESTED", "NOT_INTERESTED", "CALLBACK"] as const),
          notes: pick([
            "Discussed loan requirement and eligibility.",
            "Shared document checklist over email.",
            "Customer requested callback next week.",
            "Income proof pending from customer.",
            "Explained processing fee and repayment schedule.",
          ]),
          nextFollowUpAt: status === "LOST" ? null : daysAhead(int(-3, 10)),
        });
      }
    }
    const qualifiedOrBetter = status === "QUALIFIED" || status === "CONVERTED";
    leads.push({
      id: `lead-${pad(i)}`,
      ref: ref("LD", i),
      customerName: name,
      phone: `+91 9${int(10, 89)}${int(1000000, 9999999)}`,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}.${i}@example.com`,
      city: branch.city,
      source: type === "REPEAT" ? "REPEAT_CUSTOMER" : pick(SOURCES),
      type,
      status,
      branchId: branch.id,
      ownerId: owner.id,
      monthlyIncome: int(30_000, 450_000),
      loanPurpose: pick(PURPOSES),
      notes: pick([
        "Customer is exploring a top-up against existing relationship.",
        "Requires faster turnaround; documents largely ready.",
        "Referred by an existing customer with good repayment history.",
        "Prefers EMI tenure under 36 months.",
        "Initial discussion completed at branch walk-in.",
      ]),
      createdAt,
      updatedAt: daysAgo(Math.max(0, createdDays - int(0, 5))),
      nextFollowUpAt:
        status === "LOST" || status === "CONVERTED"
          ? null
          : qualifiedOrBetter
            ? daysAhead(int(0, 4))
            : chance(0.65)
              ? daysAhead(int(-2, 9))
              : null,
      convertedApplicationId: null,
      activities: [
        makeActivity(i * 10 + 1, owner.id, "LEAD_CREATED", "Lead captured from " + SOURCES[0].toLowerCase(), createdDays),
        ...(status !== "NEW"
          ? [makeActivity(i * 10 + 2, owner.id, "STATUS_CHANGED", `Lead moved to ${status.replaceAll("_", " ").toLowerCase()}`, Math.max(0, createdDays - 2))]
          : []),
      ],
      followUps,
    });
  }

  const applications: LoanApplication[] = [];
  const convertedLeads = leads.filter((l) => l.status === "CONVERTED");
  const statusPlan: ApplicationStatus[] = [
    ...Array(18).fill("NEW"),
    ...Array(16).fill("IN_PROCESS"),
    ...Array(10).fill("RECOMMENDED"),
    ...Array(6).fill("SENT_BACK"),
    ...Array(8).fill("CREDIT_APPROVED"),
    ...Array(8).fill("CREDIT_REJECTED"),
    ...Array(8).fill("SANCTIONED"),
    ...Array(6).fill("DISBURSEMENT_PENDING"),
    ...Array(12).fill("DISBURSED"),
    ...Array(3).fill("CLOSED"),
  ];

  for (let i = 1; i <= statusPlan.length; i++) {
    const status = statusPlan[i - 1];
    const lead = convertedLeads[i - 1];
    const branch = lead ? BRANCHES.find((b) => b.id === lead.branchId) ?? pick(BRANCHES) : pick(BRANCHES);
    const customer = lead
      ? customers.find((c) => c.city === branch.city) ?? pick(customers)
      : pick(customers.filter((c) => c.branchId === branch.id)) ?? pick(customers);
    const product = pick(PRODUCTS);
    const [minAmount, maxAmount] = PRODUCT_AMOUNTS[product];
    const requestedAmount = round(int(minAmount / 10_000, maxAmount / 10_000) * 10_000, 10_000);
    const [minRate, maxRate] = PRODUCT_RATES[product];
    const interestRate = Number((minRate + rng() * (maxRate - minRate)).toFixed(2));
    const [minTenure, maxTenure, step] = PRODUCT_TENURES[product];
    const tenureMonths = int(minTenure / step, maxTenure / step) * step;
    const ownerPool = scopedOfficers(users, branch.id, ["LOAN_OFFICER", "BRANCH_MANAGER"]);
    const owner = ownerPool.length ? pick(ownerPool) : pick(loanOfficers);
    const creditPool = creditOfficers.length ? creditOfficers : managers;
    const creditOfficer = pick(creditPool);
    const createdDays = status === "NEW" ? int(1, 12) : int(8, 170);
    const createdAt = lead ? daysAgo(Math.min(createdDays, Math.max(0, Math.floor((NOW.getTime() - new Date(lead.createdAt).getTime()) / DAY)))) : daysAgo(createdDays);
    const approved = ["CREDIT_APPROVED", "SANCTIONED", "DISBURSEMENT_PENDING", "DISBURSED", "CLOSED"].includes(status);
    const rejected = status === "CREDIT_REJECTED";
    const sentBack = status === "SENT_BACK";
    const approvedAmount = approved ? round(requestedAmount * (0.7 + rng() * 0.3), 10_000) : null;

    const decisionDays = Math.max(0, createdDays - int(1, 6));
    applications.push({
      id: `app-${pad(i)}`,
      ref: ref("APP", i),
      customerId: customer.id,
      leadId: lead?.id ?? null,
      product,
      requestedAmount,
      tenureMonths,
      interestRate,
      purpose: pick(PURPOSES),
      status,
      branchId: branch.id,
      ownerId: owner.id,
      creditOfficerId: ["RECOMMENDED", "SENT_BACK", "CREDIT_APPROVED", "CREDIT_REJECTED", "SANCTIONED", "DISBURSEMENT_PENDING", "DISBURSED", "CLOSED"].includes(status)
        ? creditOfficer.id
        : chance(0.5)
          ? creditOfficer.id
          : null,
      isAuto: chance(0.16) && ["NEW", "IN_PROCESS"].includes(status),
      riskBand: approved || rejected ? pick(["LOW", "MEDIUM", "HIGH"] as const) : null,
      sentBackReason: sentBack ? pick(["Bank statement mismatch", "Income proof unclear", "Address verification pending"]) : null,
      createdAt,
      updatedAt: daysAgo(Math.max(0, createdDays - int(0, 4))),
      submittedAt: status === "NEW" ? (chance(0.5) ? daysAgo(createdDays) : null) : daysAgo(createdDays),
      creditDecision: approved
        ? {
            id: `cd-${pad(i)}`,
            decidedBy: creditOfficer.id,
            decidedAt: daysAgo(decisionDays),
            decision: "APPROVE",
            approvedAmount,
            remarks: pick(["Income and obligations within policy.", "Satisfactory bureau profile.", "Approved with covenant on EMI ratio."]),
          }
        : rejected
          ? {
              id: `cd-${pad(i)}`,
              decidedBy: creditOfficer.id,
              decidedAt: daysAgo(decisionDays),
              decision: "REJECT",
              approvedAmount: null,
              remarks: pick(["Obligation-to-income ratio above policy.", "Adverse repayment behaviour observed.", "Insufficient income evidence."]),
            }
          : sentBack
            ? {
                id: `cd-${pad(i)}`,
                decidedBy: creditOfficer.id,
                decidedAt: daysAgo(decisionDays),
                decision: "SEND_BACK",
                approvedAmount: null,
                remarks: "Additional documents required before re-review.",
              }
            : null,
      documents: makeDocuments(i, ["CREDIT_APPROVED", "SANCTIONED", "DISBURSED", "CLOSED", "DISBURSEMENT_PENDING"].includes(status)),
      verification: {
        identity: chance(0.85) ? "VERIFIED" : "PENDING",
        address: chance(0.7) ? "VERIFIED" : chance(0.5) ? "PENDING" : "FAILED",
        employment: ["NEW", "IN_PROCESS"].includes(status) ? "PENDING" : chance(0.8) ? "VERIFIED" : "PENDING",
        income: ["NEW", "IN_PROCESS"].includes(status) ? "PENDING" : chance(0.75) ? "VERIFIED" : "PENDING",
      },
      activities: [
        makeActivity(500 + i * 5, owner.id, "APPLICATION_CREATED", "Application submitted for " + product.toLowerCase(), createdDays),
        ...(status !== "NEW"
          ? [makeActivity(500 + i * 5 + 1, creditOfficer.id, "STATUS_CHANGED", `Application moved to ${status.replaceAll("_", " ").toLowerCase()}`, decisionDays)]
          : []),
      ],
    });

    if (lead && status !== "NEW") {
      const original = leads.find((l) => l.id === lead.id);
      if (original) original.convertedApplicationId = applications[applications.length - 1].id;
    }
  }

  const sanctions: Sanction[] = [];
  const disbursements: Disbursement[] = [];
  const loanAccounts: LoanAccount[] = [];
  const repayments: Repayment[] = [];
  const collectionCases: CollectionCase[] = [];
  const esign: ESignRequest[] = [];

  const sanctionApps = applications.filter((a) =>
    ["CREDIT_APPROVED", "SANCTIONED", "DISBURSEMENT_PENDING", "DISBURSED", "CLOSED"].includes(a.status),
  );

  sanctionApps.forEach((app, index) => {
    const isRejected = app.status === "CREDIT_APPROVED" && chance(0.2);
    const status: Sanction["status"] = isRejected
      ? "REJECTED"
      : app.status === "CREDIT_APPROVED"
        ? "PENDING_ACCEPTANCE"
        : chance(0.25) && app.status === "SANCTIONED"
          ? "PROCESSING"
          : "APPROVED";
    const approvedAmount = app.creditDecision?.approvedAmount ?? app.requestedAmount;
    const managerPool = scopedOfficers(users, app.branchId, ["BRANCH_MANAGER", "ADMIN", "SUPER_ADMIN"]);
    const approver = managerPool.length ? pick(managerPool) : pick(managers);
    const requestedAt = daysAgo(Math.max(1, int(2, 30)));
    const sanction: Sanction = {
      id: `san-${pad(index + 1)}`,
      ref: ref("SAN", index + 1),
      applicationId: app.id,
      customerId: app.customerId,
      approvedAmount,
      interestRate: app.interestRate,
      tenureMonths: app.tenureMonths,
      processingFee: round(approvedAmount * 0.015, 100),
      status,
      requestedAt,
      decidedAt: status === "PENDING_ACCEPTANCE" || status === "PROCESSING" ? null : daysAgo(Math.max(0, int(1, 10))),
      approvedBy: status === "PENDING_ACCEPTANCE" || status === "PROCESSING" ? null : approver.id,
      remarks:
        status === "REJECTED"
          ? "Offer not accepted within validity; documentation gap."
          : status === "PROCESSING"
            ? "Awaiting customer acceptance of sanction terms."
            : "Sanction issued as per approved credit terms.",
      disbursementMode: pick(["NEFT", "IMPS", "UPI"] as const),
      branchId: app.branchId,
      activities: [
        makeActivity(900 + index * 3, approver.id, "SANCTION_REQUESTED", "Sanction request raised", Math.max(1, int(3, 20))),
      ],
    };
    sanctions.push(sanction);
    if (status === "APPROVED") {
      app.status = ["SANCTIONED"].includes(app.status) ? "SANCTIONED" : app.status;
    }

    esign.push({
      id: `esig-${pad(index + 1)}`,
      applicationId: app.id,
      customerId: app.customerId,
      status: status === "APPROVED" ? (app.status === "DISBURSED" || app.status === "CLOSED" ? "SIGNED" : chance(0.7) ? "SIGNED" : "INITIATED") : "NOT_INITIATED",
      provider: "DEMO_ESIGN",
      initiatedAt: status === "APPROVED" ? daysAgo(int(1, 15)) : null,
      completedAt: status === "APPROVED" && app.status === "DISBURSED" ? daysAgo(int(0, 10)) : null,
    });

    if (status === "APPROVED" && ["SANCTIONED", "DISBURSEMENT_PENDING", "DISBURSED", "CLOSED"].includes(app.status)) {
      const dStatus: Disbursement["status"] =
        app.status === "DISBURSED" || app.status === "CLOSED"
          ? "COMPLETED"
          : app.status === "DISBURSEMENT_PENDING"
            ? pick(["NEW", "IN_PROCESS", "RECOMMENDED", "PENDING"] as const)
            : chance(0.5)
              ? "COMPLETED"
              : "PENDING";
      const disbursement: Disbursement = {
        id: `dis-${pad(disbursements.length + 1)}`,
        ref: ref("DIS", disbursements.length + 1),
        sanctionId: sanction.id,
        applicationId: app.id,
        customerId: app.customerId,
        amount: approvedAmount,
        mode: sanction.disbursementMode,
        status: dStatus,
        requestedAt: daysAgo(int(1, 20)),
        processedAt: dStatus === "COMPLETED" ? daysAgo(int(0, 8)) : null,
        processedBy: dStatus === "COMPLETED" ? approver.id : null,
        bankRef: dStatus === "COMPLETED" ? `DEMO${int(10000000, 99999999)}` : null,
        remarks: dStatus === "COMPLETED" ? "DEMO mode: no real bank transfer was executed." : "Pending authorization and bank file generation.",
        branchId: app.branchId,
        activities: [
          makeActivity(1200 + index * 3, approver.id, "DISBURSEMENT_REQUESTED", "Disbursement request created", Math.max(1, int(1, 10))),
        ],
      };
      disbursements.push(disbursement);
      if (dStatus === "COMPLETED") {
        app.status = "DISBURSED";
        const disbursedDaysAgo = int(8, 150);
        const disbursedAt = daysAgo(disbursedDaysAgo);
        const principal = approvedAmount;
        const emi = emiFor(principal, app.interestRate, app.tenureMonths);
        const loanRef = ref("LAN", loanAccounts.length + 1);
        const loanId = `loan-${pad(loanAccounts.length + 1)}`;
        const monthsElapsed = Math.min(app.tenureMonths, Math.floor(disbursedDaysAgo / 30));
        const overdue = monthsElapsed > 2 && chance(0.32);
        const closed = chance(0.06) && monthsElapsed > 4;
        const dpd = overdue ? int(8, 75) : 0;
        const paidEmis = closed ? app.tenureMonths : Math.max(0, monthsElapsed - (overdue ? int(1, 3) : 0));
        let paidAmount = 0;
        const scheduleMonths = Math.min(app.tenureMonths, Math.max(monthsElapsed + 2, 6));
        const firstDue = addMonths(new Date(disbursedAt), 1);
        for (let m = 0; m < scheduleMonths; m++) {
          const dueDate = addMonths(firstDue, m);
          const isPast = dueDate.getTime() <= NOW.getTime();
          const isPaid = closed || (isPast && m < paidEmis);
          const daysLate = isPaid && isPast ? 0 : isPast ? Math.max(1, Math.floor((NOW.getTime() - dueDate.getTime()) / DAY)) : 0;
          const status: Repayment["status"] = isPaid
            ? "PAID"
            : !isPast
              ? "PENDING"
              : daysLate <= 0
                ? "PENDING"
                : "OVERDUE";
          if (isPaid) paidAmount += emi;
          repayments.push({
            id: `rep-${pad(repayments.length + 1)}`,
            ref: ref("RCP", repayments.length + 1),
            loanAccountId: loanId,
            customerId: app.customerId,
            dueDate: dueDate.toISOString(),
            paidDate: isPaid ? new Date(dueDate.getTime() - int(0, 5) * DAY).toISOString() : null,
            amount: emi,
            principalComponent: round(emi * 0.62, 1),
            interestComponent: round(emi * 0.38, 1),
            penalty: isPaid ? 0 : status === "OVERDUE" ? round(emi * 0.02 * Math.min(3, daysLate / 15), 10) : 0,
            status,
            mode: isPaid ? pick(["NACH", "UPI", "NEFT", "CASH"] as const) : null,
            receiptNo: isPaid ? `RCPT${int(100000, 999999)}` : null,
          });
        }
        const outstanding = closed ? 0 : Math.max(0, round(principal - paidAmount * 0.62 + (overdue ? emi * 0.3 : 0), 1));
        const lastDue = addMonths(firstDue, Math.max(0, paidEmis));
        const loan: LoanAccount = {
          id: loanId,
          ref: loanRef,
          applicationId: app.id,
          disbursementId: disbursement.id,
          customerId: app.customerId,
          branchId: app.branchId,
          principal,
          outstanding,
          interestRate: app.interestRate,
          tenureMonths: app.tenureMonths,
          emiAmount: emi,
          disbursedAt,
          status: closed ? "CLOSED" : overdue ? "OVERDUE" : "ACTIVE",
          nextDueDate: (closed ? addMonths(firstDue, app.tenureMonths) : lastDue).toISOString(),
          dpd: overdue ? dpd : 0,
          paidAmount: round(paidAmount, 1),
          penaltyAccrued: overdue ? round(emi * 0.02 * 3, 10) : 0,
        };
        loanAccounts.push(loan);

        const collectionOfficerPool = scopedOfficers(users, app.branchId, ["COLLECTION_OFFICER"]);
        const collector = collectionOfficerPool.length
          ? pick(collectionOfficerPool)
          : collectionOfficers.length
            ? pick(collectionOfficers)
            : pick(managers);
        if (overdue && !closed) {
          const bucket = dpd <= 30 ? "BUCKET_1" : dpd <= 60 ? "BUCKET_2" : dpd <= 90 ? "BUCKET_3" : "NPA";
          collectionCases.push({
            id: `col-${pad(collectionCases.length + 1)}`,
            ref: ref("COL", collectionCases.length + 1),
            loanAccountId: loan.id,
            customerId: app.customerId,
            branchId: app.branchId,
            bucket,
            status: chance(0.18) ? "LEGAL" : chance(0.45) ? "RECOVERY" : "PENDING",
            assignedTo: collector.id,
            overdueAmount: round(emi * int(1, 4), 1),
            daysPastDue: dpd,
            lastContactAt: chance(0.7) ? daysAgo(int(0, 7)) : null,
            nextActionAt: daysAhead(int(0, 7)),
            ptpAmount: chance(0.4) ? emi : null,
            ptpDate: chance(0.4) ? daysAhead(int(1, 10)) : null,
            recoveryStage: pick(["Soft reminder", "Field visit planned", "PTP recorded", "Legal notice review"]),
            createdAt: daysAgo(int(5, 60)),
            activities: [
              makeActivity(1500 + collectionCases.length, collector.id, "CASE_CREATED", "Overdue account assigned to collections", Math.max(1, int(5, 40))),
            ],
          });
        } else if (!closed && loan.status === "ACTIVE" && chance(0.28)) {
          const daysToDue = Math.floor((new Date(loan.nextDueDate).getTime() - NOW.getTime()) / DAY);
          if (daysToDue <= 10) {
            collectionCases.push({
              id: `col-${pad(collectionCases.length + 1)}`,
              ref: ref("COL", collectionCases.length + 1),
              loanAccountId: loan.id,
              customerId: app.customerId,
              branchId: app.branchId,
              bucket: "PRE_DUE",
              status: "PRE_COLLECTION",
              assignedTo: collector.id,
              overdueAmount: 0,
              daysPastDue: 0,
              lastContactAt: chance(0.5) ? daysAgo(int(0, 4)) : null,
              nextActionAt: daysAhead(int(0, 5)),
              ptpAmount: null,
              ptpDate: null,
              recoveryStage: "Pre-due reminder",
              createdAt: daysAgo(int(1, 10)),
              activities: [],
            });
          }
        }
      }
    }
  });

  // A few disbursement rejections to exercise the rejected lane.
  const rejectionCandidates = applications.filter((a) => a.status === "SANCTIONED" && !disbursements.some((d) => d.applicationId === a.id));
  rejectionCandidates.slice(0, 2).forEach((app, i) => {
    const sanction = sanctions.find((s) => s.applicationId === app.id);
    if (!sanction) return;
    disbursements.push({
      id: `dis-${pad(disbursements.length + 1)}`,
      ref: ref("DIS", disbursements.length + 1),
      sanctionId: sanction.id,
      applicationId: app.id,
      customerId: app.customerId,
      amount: sanction.approvedAmount,
      mode: sanction.disbursementMode,
      status: "REJECTED",
      requestedAt: daysAgo(int(2, 12)),
      processedAt: daysAgo(int(0, 5)),
      processedBy: pick(managers).id,
      bankRef: null,
      remarks: "Rejected: customer bank account validation failed in DEMO review.",
      branchId: app.branchId,
      activities: [
        makeActivity(1750 + i, pick(managers).id, "DISBURSEMENT_REJECTED", "Disbursement rejected after validation", int(1, 4)),
      ],
    });
  });

  const tasks: Task[] = [];
  const taskCategories: TaskCategory[] = ["CREDIT", "COLLECTION", "FIELD", "LEGAL", "AGENCY", "GRE", "OTHER"];
  const taskTitles: Record<TaskCategory, string[]> = {
    CREDIT: ["Review pending application", "Validate income documents", "Complete credit assessment"],
    COLLECTION: ["Follow up on overdue EMI", "Record PTP confirmation", "Escalate chronic overdue"],
    FIELD: ["Field verification visit", "Collect physical documents", "Customer site inspection"],
    LEGAL: ["Prepare legal notice draft", "Review NPA account", "Coordinate with counsel"],
    AGENCY: ["Agency performance review", "Assign recovery case", "Reconcile agency payout"],
    GRE: ["Resolve customer grievance", "Call back aggrieved customer", "Close grievance with root cause"],
    OTHER: ["Branch coordination", "Data cleanup", "Weekly MIS review"],
  };

  for (let i = 1; i <= 68; i++) {
    const category = pick(taskCategories);
    const branch = pick(BRANCHES);
    const assigneePool = scopedOfficers(users, branch.id, ["LOAN_OFFICER", "CREDIT_OFFICER", "COLLECTION_OFFICER", "BRANCH_MANAGER"]);
    const assignee = assigneePool.length ? pick(assigneePool) : pick(activeUsers);
    const status: TaskStatus = pick([...Array(28).fill("OPEN"), ...Array(16).fill("IN_PROGRESS"), ...Array(18).fill("COMPLETED"), ...Array(4).fill("ESCALATED"), ...Array(2).fill("CANCELLED")] as TaskStatus[]);
    const dueOffset = status === "COMPLETED" ? -int(1, 20) : int(-8, 18);
    const priority: TaskPriority = pick(["LOW", "LOW", "MEDIUM", "MEDIUM", "MEDIUM", "HIGH", "HIGH", "URGENT"] as TaskPriority[]);
    tasks.push({
      id: `task-${pad(i)}`,
      ref: ref("TSK", i),
      category,
      title: pick(taskTitles[category]),
      description: "Synthetic demo task for workflow validation. Update status and notes to exercise audit trail.",
      relatedType: category === "COLLECTION" ? "COLLECTION" : category === "CREDIT" ? "APPLICATION" : category === "GRE" ? "GRIEVANCE" : "NONE",
      relatedId:
        category === "COLLECTION" && collectionCases.length
          ? pick(collectionCases).id
          : category === "CREDIT" && applications.length
            ? pick(applications).id
            : null,
      assigneeId: assignee.id,
      branchId: branch.id,
      priority,
      status,
      dueDate: daysAhead(dueOffset),
      createdAt: daysAgo(int(1, 40)),
      completedAt: status === "COMPLETED" ? daysAgo(int(0, 10)) : null,
    });
  }

  const authorizationRequests: AuthorizationRequest[] = [];
  for (let i = 1; i <= 16; i++) {
    const branch = pick(BRANCHES);
    const requester = pick(scopedOfficers(users, branch.id, ["LOAN_OFFICER", "BRANCH_MANAGER", "COLLECTION_OFFICER"])) ?? pick(activeUsers);
    const type = pick(["PAYMENT", "LMS_ACCOUNT", "AGENCY"] as const);
    const status = pick(["PENDING", "PENDING", "APPROVED", "APPROVED", "REJECTED"] as const);
    authorizationRequests.push({
      id: `auth-${pad(i)}`,
      ref: ref("AUTH", i),
      type,
      title:
        type === "PAYMENT"
          ? "Disbursement payment release"
          : type === "LMS_ACCOUNT"
            ? "LMS account mapping"
            : "Recovery agency empanelment",
      entityName:
        type === "PAYMENT"
          ? `Beneficiary — synthetic customer ${int(100, 999)}`
          : type === "LMS_ACCOUNT"
            ? `LN account batch ${int(1000, 9999)}`
            : pick(["Apex Recoveries", "Northstar Collections", "Summit Field Services"]),
      amount: type === "PAYMENT" ? round(int(100_000, 2_000_000), 10_000) : null,
      requestedBy: requester.id,
      branchId: branch.id,
      status,
      requestedAt: daysAgo(int(0, 25)),
      decidedAt: status === "PENDING" ? null : daysAgo(int(0, 10)),
      decidedBy: status === "PENDING" ? null : pick(managers).id,
      remarks: status === "PENDING" ? "Awaiting checker authorization." : status === "APPROVED" ? "Verified and authorized in DEMO mode." : "Rejected due to incomplete supporting evidence.",
      activities: [
        makeActivity(1800 + i, requester.id, "AUTH_REQUESTED", "Authorization request raised", int(1, 20)),
      ],
    });
  }

  const auditLogs: AuditLog[] = [];
  const auditActions = [
    ["LOGIN", "User session", "Signed in to the DEMO workspace"],
    ["LEAD_CREATED", "Lead", "Captured a new lead"],
    ["LEAD_ASSIGNED", "Lead", "Reassigned lead ownership"],
    ["APPLICATION_CREATED", "Application", "Submitted a loan application"],
    ["CREDIT_DECISION", "Application", "Recorded a credit decision"],
    ["SANCTION_APPROVED", "Sanction", "Approved sanction terms"],
    ["DISBURSEMENT_COMPLETED", "Disbursement", "Marked disbursement completed (DEMO)"],
    ["PAYMENT_RECORDED", "Repayment", "Recorded a synthetic repayment"],
    ["TASK_UPDATED", "Task", "Updated task status"],
    ["EXPORT_GENERATED", "Report", "Downloaded a MIS export"],
    ["USER_UPDATED", "User", "Updated user role or status"],
    ["AUTH_APPROVED", "Authorization", "Approved an authorization request"],
  ];
  for (let i = 1; i <= 64; i++) {
    const action = pick(auditActions);
    const actor = pick(activeUsers);
    const entity =
      action[1] === "Lead" ? pick(leads) : action[1] === "Application" ? pick(applications) : action[1] === "Task" ? pick(tasks) : null;
    auditLogs.push({
      id: `aud-${pad(i)}`,
      at: daysAgo(int(0, 29), int(-12, 0)),
      actorId: actor.id,
      action: action[0],
      entityType: action[1],
      entityId: entity?.id ?? `sys-${pad(i)}`,
      summary: `${action[2]}${entity ? ` — ${entity.ref}` : ""}`,
      ip: `10.24.${int(0, 12)}.${int(2, 240)}`,
    });
  }
  auditLogs.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const notifications: Notification[] = [
    { id: "ntf-001", userId: null, role: "CREDIT_OFFICER", title: "Credit queue updated", body: "New applications are awaiting credit review.", type: "INFO", at: daysAgo(0, -3), read: false, href: "/credit" },
    { id: "ntf-002", userId: "usr-003", role: null, title: "Sanction pending acceptance", body: "A sanction offer is awaiting customer acceptance.", type: "WARNING", at: daysAgo(0, -5), read: false, href: "/sanctions" },
    { id: "ntf-003", userId: null, role: "COLLECTION_OFFICER", title: "PTP due today", body: "Promise-to-pay recorded for an overdue account is due today.", type: "WARNING", at: daysAgo(1), read: false, href: "/collections" },
    { id: "ntf-004", userId: null, role: "LOAN_OFFICER", title: "Applications sent back", body: "An application was sent back for additional documents.", type: "CRITICAL", at: daysAgo(1, -2), read: false, href: "/applications?status=SENT_BACK" },
    { id: "ntf-005", userId: null, role: "BRANCH_MANAGER", title: "Disbursement awaiting approval", body: "A recommended disbursement needs branch authorization.", type: "INFO", at: daysAgo(2), read: true, href: "/disbursements" },
    { id: "ntf-006", userId: null, role: "ADMIN", title: "Weekly MIS ready", body: "Collection performance MIS is available for download.", type: "SUCCESS", at: daysAgo(2), read: false, href: "/reports" },
    { id: "ntf-007", userId: null, role: null, title: "DEMO environment", body: "All records are synthetic. No real money movement or bureau calls occur.", type: "INFO", at: daysAgo(3), read: true, href: null },
  ];

  const blacklist: BlacklistEntry[] = [
    { name: "Synthetic Entity A", panMasked: "SYNPA••••Q", phone: "••••••4412", reason: "Fraudulent document pattern flagged in DEMO checks", source: "Internal review", addedAt: daysAgo(40) },
    { name: "Synthetic Entity B", panMasked: "SYNPA••••M", phone: "••••••8891", reason: "Repeated default across synthetic accounts", source: "Collections", addedAt: daysAgo(75) },
    { name: "Synthetic Entity C", panMasked: "SYNPA••••V", phone: "••••••1204", reason: "Adverse bureau signal (synthetic)", source: "Credit", addedAt: daysAgo(18) },
    { name: "Synthetic Entity D", panMasked: "SYNPA••••K", phone: "••••••9033", reason: "Identity mismatch under review", source: "Operations", addedAt: daysAgo(9) },
  ].map((row, i) => ({
    id: `blk-${pad(i + 1)}`,
    ...row,
    status: i === 3 ? "UNDER_REVIEW" : "ACTIVE",
    addedBy: activeUsers[1].id,
  }));

  const grievanceCategories = ["SERVICE", "CHARGES", "COLLECTION", "DOCUMENT", "OTHER"] as const;
  const grievances: Grievance[] = Array.from({ length: 12 }, (_, i) => {
    const customer = pick(customers);
    const status = pick(["OPEN", "OPEN", "IN_REVIEW", "RESOLVED", "RESOLVED"] as const);
    return {
      id: `grv-${pad(i + 1)}`,
      ref: ref("GRV", i + 1),
      customerId: customer.id,
      branchId: customer.branchId,
      category: pick(grievanceCategories),
      description: pick([
        "Customer reports an unexplained processing fee on the sanction letter.",
        "Customer requests statement of account for the last six months.",
        "Customer disputes a collection call timestamp.",
        "Customer awaiting NOC after loan closure.",
      ]),
      priority: pick(["LOW", "MEDIUM", "HIGH"] as const),
      status,
      assignedTo: pick(activeUsers).id,
      createdAt: daysAgo(int(1, 30)),
      resolvedAt: status === "RESOLVED" ? daysAgo(int(0, 5)) : null,
    };
  });

  const roles = DEFAULT_ROLES.map((role) => ({
    ...role,
    permissions: [...role.permissions],
    createdAt: daysAgo(520),
    updatedAt: daysAgo(45),
  }));

  const recordGrantApp = applications[0];
  const accessGrants: AccessGrant[] = [
    {
      id: "grant-0001",
      subjectId: "usr-006",
      permission: "credit:decide",
      effect: "ALLOW",
      scopeType: "BRANCH",
      branchId: "br-mumbai",
      department: null,
      recordType: null,
      recordId: null,
      mode: "DIRECT",
      reason: "Temporary credit approval cover while the Mumbai credit manager is on leave.",
      grantedBy: "usr-001",
      grantedAt: daysAgo(2),
      expiresAt: daysAhead(9),
      revokedBy: null,
      revokedAt: null,
      revokedReason: null,
    },
    {
      id: "grant-0002",
      subjectId: "usr-016",
      permission: "applications:manage",
      effect: "ALLOW",
      scopeType: "RECORD",
      branchId: recordGrantApp?.branchId ?? null,
      department: null,
      recordType: "APPLICATION",
      recordId: recordGrantApp?.id ?? null,
      mode: "DIRECT",
      reason: "Junior officer assisting on one supervised file only.",
      grantedBy: "usr-003",
      grantedAt: daysAgo(1),
      expiresAt: daysAhead(14),
      revokedBy: null,
      revokedAt: null,
      revokedReason: null,
    },
    {
      id: "grant-0003",
      subjectId: "usr-015",
      permission: "leads:assign",
      effect: "DENY",
      scopeType: "GLOBAL",
      branchId: null,
      department: null,
      recordType: null,
      recordId: null,
      mode: "DIRECT",
      reason: "Sourcing pod policy: team leads cannot reassign leads outside their pod.",
      grantedBy: "usr-001",
      grantedAt: daysAgo(12),
      expiresAt: null,
      revokedBy: null,
      revokedAt: null,
      revokedReason: null,
    },
  ];

  const permissionAudits: PermissionAudit[] = [
    {
      id: "paud-0001",
      at: daysAgo(2),
      actorId: "usr-001",
      actorRole: "SUPER_ADMIN",
      targetType: "GRANT",
      targetId: "grant-0001",
      targetLabel: "Neha Kulkarni · credit:decide · Mumbai branch",
      action: "GRANT_CREATED",
      before: [],
      after: ["credit:decide"],
      reason: "Temporary credit approval cover while the Mumbai credit manager is on leave.",
      ip: "10.24.0.10",
      expiresAt: daysAhead(9),
    },
    {
      id: "paud-0002",
      at: daysAgo(1),
      actorId: "usr-003",
      actorRole: "BRANCH_MANAGER",
      targetType: "GRANT",
      targetId: "grant-0002",
      targetLabel: "Pooja Sethi · applications:manage · APPLICATION app-0001",
      action: "GRANT_CREATED",
      before: [],
      after: ["applications:manage"],
      reason: "Junior officer assisting on one supervised file only.",
      ip: "10.24.2.41",
      expiresAt: daysAhead(14),
    },
    {
      id: "paud-0003",
      at: daysAgo(12),
      actorId: "usr-001",
      actorRole: "SUPER_ADMIN",
      targetType: "GRANT",
      targetId: "grant-0003",
      targetLabel: "Ishaan Verma · leads:assign · global restriction",
      action: "GRANT_CREATED",
      before: [],
      after: ["leads:assign (denied)"],
      reason: "Sourcing pod policy: team leads cannot reassign leads outside their pod.",
      ip: "10.24.0.10",
      expiresAt: null,
    },
  ];

  return {
    branches: BRANCHES,
    users,
    roles,
    accessGrants,
    permissionAudits,
    sessions: [],
    documentFiles: [],
    security: { protectedSuperAdminId: "usr-001" },
    customers,
    leads,
    applications,
    sanctions,
    disbursements,
    loanAccounts,
    repayments,
    collectionCases,
    tasks,
    authorizations: authorizationRequests,
    auditLogs,
    notifications,
    blacklist,
    grievances,
    esign,
  };
}
