import { useState } from "react";
import {
  getMedimadeApiBase,
  medimadeApiAuthHeaders,
  medimadeFetch,
} from "@/lib/medimade-api";

type Result = {
  ok?: boolean;
  provider?: string;
  sender?: string;
  messageId?: string | null;
  error?: string;
  detail?: string;
};

/** Send a test email (e.g. to an Apple private relay address) through the live provider. */
export function AdminEmailPanel() {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const base = getMedimadeApiBase();
    if (!base) {
      setResult({ error: "API URL is not set." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await medimadeFetch(`${base.replace(/\/$/, "")}/admin/email-test`, {
        method: "POST",
        headers: { ...medimadeApiAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as Result;
      setResult(res.ok ? data : { ...data, error: data.error || `HTTP ${res.status}` });
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Email</h1>
      <p className="text-sm text-muted">
        Sends a short test email through the live provider (Brevo or SES, set by
        CONSCIOUSLY_EMAIL_PROVIDER). Use an @privaterelay.appleid.com address to check Sign in with
        Apple relay delivery. Requires signing in as an admin.
      </p>
      <form onSubmit={(e) => void send(e)} className="flex flex-wrap gap-2">
        <input
          type="email"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="someone@privaterelay.appleid.com"
          className="min-w-[260px] flex-1 rounded-full border border-border bg-transparent px-4 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !to.trim()}
          className="rounded-full bg-selected px-4 py-2 text-sm font-medium text-on-selected disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send test email"}
        </button>
      </form>
      {result ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            result.error ? "border-red-300 text-red-700" : "border-border"
          }`}
        >
          {result.error ? <p className="font-medium">{result.error}</p> : <p className="font-medium">Sent.</p>}
          {result.provider ? <p>Provider: {result.provider}</p> : null}
          {result.sender ? <p>From: {result.sender}</p> : null}
          {result.messageId ? <p>Message ID: {result.messageId}</p> : null}
          {result.detail ? <p className="mt-1 break-words text-muted">{result.detail}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
