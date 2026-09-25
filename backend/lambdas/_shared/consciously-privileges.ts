/**
 * App privileges (admin / plan) — stored on Users, stamped onto Consciously JWTs.
 * Cognito only proves identity; these claims gate Lambdas.
 */

export type ConsciouslyRole = "user" | "admin";
/** Essentials = free; Create / Pro are paid Stripe products. */
export type ConsciouslyPlan = "free" | "create" | "pro";

export type ConsciouslyPrivileges = {
  role: ConsciouslyRole;
  plan: ConsciouslyPlan;
};

export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeRole(raw: unknown): ConsciouslyRole {
  return raw === "admin" ? "admin" : "user";
}

export function normalizePlan(raw: unknown): ConsciouslyPlan {
  if (raw === "pro") return "pro";
  if (raw === "create") return "create";
  return "free";
}

/**
 * Merge DB privileges with deploy-time ADMIN_EMAILS allowlist.
 * Env admin wins for role (ops convenience); plan always comes from the user row.
 */
export function resolvePrivileges(params: {
  email: string;
  role?: unknown;
  plan?: unknown;
}): ConsciouslyPrivileges {
  const email = params.email.trim().toLowerCase();
  let role = normalizeRole(params.role);
  const plan = normalizePlan(params.plan);
  const allowed = parseAdminEmails(process.env.ADMIN_EMAILS);
  if (allowed.includes("*") || (email && allowed.includes(email))) {
    role = "admin";
  }
  return { role, plan };
}

export function isPaidPlan(plan: ConsciouslyPlan | undefined): boolean {
  return plan === "create" || plan === "pro";
}

/** Paid checkout products (Stripe price keys). */
export const BILLING_PRICE_KEYS = ["create", "pro"] as const;
export type BillingPriceKey = (typeof BILLING_PRICE_KEYS)[number];

export function coerceBillingPriceKey(raw: unknown): BillingPriceKey | null {
  return raw === "create" || raw === "pro" ? raw : null;
}

/** Map a Stripe product key onto the Users.plan claim. */
export function planForBillingPriceKey(key: BillingPriceKey): ConsciouslyPlan {
  return key;
}
