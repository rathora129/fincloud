const DEMO_SESSION_SECRET = "fincloud-demo-session-secret-2026";
const MIN_PRODUCTION_SECRET_LENGTH = 32;

export type StoreAdapter = "memory" | "postgres";

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";
}

export function sessionSecret(): string {
  const value = process.env.FINCLOUD_SESSION_SECRET?.trim();
  if (value && value.length >= MIN_PRODUCTION_SECRET_LENGTH) return value;
  if (isProductionRuntime()) {
    throw new Error(
      "FINCLOUD_SESSION_SECRET must be set to a value of at least 32 characters in production. Refusing to start with a weak or missing signing secret.",
    );
  }
  return value || DEMO_SESSION_SECRET;
}

export function storeAdapter(): StoreAdapter {
  const raw = process.env.FINCLOUD_STORE_ADAPTER?.trim().toLowerCase();
  if (!raw) {
    if (!isProductionRuntime()) return "memory";
    throw new Error(
      "FINCLOUD_STORE_ADAPTER must be configured in production. Set FINCLOUD_STORE_ADAPTER=memory together with FINCLOUD_ALLOW_EPHEMERAL_STORE=true only for an explicitly ephemeral demo/staging environment.",
    );
  }
  if (raw === "postgres") {
    throw new Error(
      "The PostgreSQL store adapter is not implemented yet. The proposed schema is documented in docs/database-persistence.md and requires approval before migration.",
    );
  }
  if (raw !== "memory") {
    throw new Error(`Unsupported FINCLOUD_STORE_ADAPTER value: ${raw}. Expected "memory" or "postgres".`);
  }
  if (isProductionRuntime() && process.env.FINCLOUD_ALLOW_EPHEMERAL_STORE !== "true") {
    throw new Error(
      "Refusing to use in-memory storage in production. Set FINCLOUD_ALLOW_EPHEMERAL_STORE=true only if this deployment is an explicit, isolated demo/staging environment.",
    );
  }
  return "memory";
}

export function persistenceSummary() {
  const adapter = storeAdapter();
  return {
    adapter,
    ephemeral: adapter === "memory",
    environment: process.env.NODE_ENV ?? "development",
  };
}
