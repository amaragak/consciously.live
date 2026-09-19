/**
 * App privileges (admin / plan) — stored on Users, stamped onto Consciously JWTs.
 * Cognito only proves identity; these claims gate Lambdas.
 */

export type ConsciouslyRole = "user" | "admin";
export type ConsciouslyPlan = "free" | "pro";

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
  return raw === "pro" ? "pro" : "free";
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
  return plan === "pro";
}
