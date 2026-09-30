import { useCallback, useEffect, useState } from "react";
import {
  getAdminAiCosts,
  setAdminAiCreditBalance,
  type AdminAiCostsSnapshot,
  type AdminAiProviderCard,
  type AdminAiProviderId,
} from "@/lib/medimade-api";

function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 2 : 3;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function AdminAiCostsPanel() {
  const [data, setData] = useState<AdminAiCostsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<AdminAiProviderId | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { remainingUsd: string; note: string }>
  >({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getAdminAiCosts();
      setData(snap);
      const next: Record<string, { remainingUsd: string; note: string }> = {};
      for (const p of snap.providers) {
        next[p.id] = {
          remainingUsd:
            p.creditSource === "live"
              ? ""
              : p.remainingUsd != null
                ? String(p.remainingUsd)
                : "",
          note: p.manualNote || "",
        };
      }
      setDrafts(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load AI costs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveManual(p: AdminAiProviderCard) {
    const draft = drafts[p.id] ?? { remainingUsd: "", note: "" };
    const raw = draft.remainingUsd.trim();
    let remainingUsd: number | null = null;
    if (raw !== "") {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        setError(`Invalid remaining amount for ${p.label}`);
        return;
      }
      remainingUsd = n;
    }
    setBusyId(p.id);
    setError(null);
    try {
      await setAdminAiCreditBalance({
        provider: p.id,
        remainingUsd,
        note: draft.note,
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save credits");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">
            AI costs & credits
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            List prices for every AI vendor we call, spend from the usage ledger
            (recorded at call time), and remaining credits (live Fish wallet;
            manual snapshots for the rest).
          </p>
          {data ? (
            <p className="mt-1 text-xs text-muted">
              Updated {new Date(data.generatedAt).toLocaleString()} · Tracked
              spend total {formatUsd(data.trackedTotalUsd)}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={loading || busyId != null}
          onClick={() => void refresh()}
          className="cursor-pointer rounded-xl border border-border px-3 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !data ? (
        <p className="text-sm text-muted">Loading providers…</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {(data?.providers ?? []).map((p) => {
            const draft = drafts[p.id] ?? { remainingUsd: "", note: "" };
            const canEdit = p.creditSource !== "live";
            return (
              <li
                key={p.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-medium text-foreground">
                      {p.label}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted">{p.uses}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Remaining
                    </p>
                    <p className="font-display text-xl font-medium tabular-nums text-foreground">
                      {formatUsd(p.remainingUsd)}
                    </p>
                    <p className="text-[10px] text-muted">
                      {p.remainingSource === "live"
                        ? "live wallet"
                        : p.remainingSource === "manual"
                          ? "manual snapshot"
                          : "unknown"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  {p.rateLines.map((line) => (
                    <p key={line} className="text-xs text-muted">
                      {line}
                    </p>
                  ))}
                </div>

                <div className="mt-3 rounded-xl bg-surface-2/60 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Tracked spend (reconstructed)
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {formatUsd(p.trackedSpendUsd)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {p.trackedDetail || "No stored usage yet"}
                  </p>
                </div>

                <p className="mt-2 text-[11px] text-muted">{p.creditNote}</p>
                {p.fishLiveError ? (
                  <p className="mt-1 text-[11px] text-danger">{p.fishLiveError}</p>
                ) : null}

                {canEdit ? (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <label className="flex flex-col gap-1 text-xs text-muted">
                      Remaining USD
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft.remainingUsd}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [p.id]: {
                              ...draft,
                              remainingUsd: e.target.value,
                            },
                          }))
                        }
                        placeholder="e.g. 42.50"
                        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent/50"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted">
                      Note
                      <input
                        type="text"
                        value={draft.note}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [p.id]: { ...draft, note: e.target.value },
                          }))
                        }
                        placeholder="Plan / top-up date"
                        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent/50"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busyId === p.id || loading}
                      onClick={() => void saveManual(p)}
                      className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-background disabled:opacity-50"
                    >
                      {busyId === p.id ? "Saving…" : "Save snapshot"}
                    </button>
                    {p.manualUpdatedAt ? (
                      <p className="text-[10px] text-muted">
                        Last saved{" "}
                        {new Date(p.manualUpdatedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {data?.notes?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          {data.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
