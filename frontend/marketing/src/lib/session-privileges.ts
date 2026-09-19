/**
 * Read role/plan from the Consciously access JWT (client-side UI hints only).
 * Server Lambdas must still enforce via requireAdminJson / requirePaidJson.
 */

import { getMedimadeSessionJwt } from "@/lib/auth-session";

export type ConsciouslyRole = "user" | "admin";
export type ConsciouslyPlan = "free" | "pro";

export type SessionPrivileges = {
  role: ConsciouslyRole;
  plan: ConsciouslyPlan;
};

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2 || !parts[1]) return null;
    const pad =
      parts[1].length % 4 === 0 ? "" : "=".repeat(4 - (parts[1].length % 4));
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad;
    return JSON.parse(atob(b64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getSessionPrivileges(): SessionPrivileges {
  const jwt = getMedimadeSessionJwt();
  if (!jwt) return { role: "user", plan: "free" };
  const payload = decodeJwtPayload(jwt);
  if (!payload) return { role: "user", plan: "free" };
  return {
    role: payload.role === "admin" ? "admin" : "user",
    plan: payload.plan === "pro" ? "pro" : "free",
  };
}

export function isSessionAdmin(): boolean {
  return getSessionPrivileges().role === "admin";
}

export function isSessionPaid(): boolean {
  const p = getSessionPrivileges();
  return p.role === "admin" || p.plan === "pro";
}
