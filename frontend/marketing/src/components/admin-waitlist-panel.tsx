"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getMedimadeApiBase,
  medimadeApiAuthHeaders,
  medimadeFetch,
} from "@/lib/medimade-api";

type Signup = {
  email: string;
  brief: string | null;
  source: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  userId: string | null;
  referrer: string | null;
};

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function AdminWaitlistPanel() {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const base = getMedimadeApiBase();
    if (!base) {
      setError("API URL is not set.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await medimadeFetch(`${base.replace(/\/$/, "")}/admin/waitlist`, {
        headers: medimadeApiAuthHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        signups?: Signup[];
      };
      if (!res.ok) throw new Error(data.error || "Could not load the waitlist.");
      setSignups(data.signups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the waitlist.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadCsv() {
    const base = getMedimadeApiBase();
    if (!base) return;
    const res = await medimadeFetch(
      `${base.replace(/\/$/, "")}/admin/waitlist?format=csv`,
      { headers: medimadeApiAuthHeaders() },
    );
    if (!res.ok) {
      setError("Could not export the waitlist.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "waitlist.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Waitlist</h1>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-full border border-border px-4 py-2 text-sm"
            onClick={() => void load()}
            disabled={busy}
          >
            {busy ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            className="rounded-full bg-selected px-4 py-2 text-sm font-medium text-on-selected"
            onClick={() => void downloadCsv()}
          >
            Export CSV
          </button>
        </div>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-card text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Brief</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {signups.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted" colSpan={4}>
                  {busy ? "Loading…" : "No sign-ups yet."}
                </td>
              </tr>
            ) : (
              signups.map((row) => (
                <tr key={row.email} className="border-t border-border align-top">
                  <td className="px-3 py-2">{row.email}</td>
                  <td className="px-3 py-2 whitespace-pre-wrap">{row.brief || "—"}</td>
                  <td className="px-3 py-2">{row.source || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatWhen(row.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
