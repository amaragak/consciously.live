// @ts-nocheck
// Per-voice page (rate, samples, approval) is unused. Voices is the measurement table.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  listAdminVoice,
  runAdminVoiceCalibration,
  type AdminVoiceDetail as VoiceDetail,
} from "@/lib/medimade-api";

function fmtWpm(n: number | null | undefined): string {
  return typeof n === "number" && n > 0 ? String(Math.round(n)) : "—";
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function AdminVoiceDetail() {
  const { modelId = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<VoiceDetail | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await listAdminVoice(modelId);
    const next = data.voiceDetail ?? null;
    setDetail(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listAdminVoice(modelId);
        if (!cancelled) setDetail(data.voiceDetail ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this voice");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  const measuring = Boolean(detail?.summary?.progress);
  useEffect(() => {
    if (!measuring) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void load()
        .then((next) => {
          if (!cancelled && next) setDetail(next);
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [measuring, modelId]);

  async function calibrate() {
    setBusy(true);
    setError(null);
    try {
      await runAdminVoiceCalibration(modelId, () => {
        void load();
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Calibration failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <span className="mm-placeholder block h-16 w-full rounded-2xl" aria-hidden />
        <span className="mm-placeholder block h-40 w-full rounded-2xl" aria-hidden />
      </div>
    );
  }

  const speaker = detail?.speaker;
  const summary = detail?.summary;
  const progress = summary?.progress;
  const real =
    summary && typeof summary.realWpm === "number"
      ? `${Math.round(summary.realWpm)} (${summary.realCount})`
      : "—";

  return (
    <div className="space-y-6">
      <Link to="/admin/voice" className="text-sm text-muted hover:text-foreground">
        Voices
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {speaker?.portraitImageUrl ? (
            <img src={speaker.portraitImageUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-muted">
              {(speaker?.name ?? modelId).slice(0, 1)}
            </span>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">{speaker?.name ?? modelId}</h1>
              {speaker?.brand === "fish" ? (
                <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground">
                  Pro
                </span>
              ) : (
                <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                  Standard
                </span>
              )}
              {summary ? (
                <span className="rounded-full border border-border bg-accent-soft px-2 py-0.5 text-xs text-foreground">
                  {progress || summary.statusLabel}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted">
              {speaker?.brand === "fish" ? "Fish" : "Speechify"}
              {speaker?.modelId ? ` · ${speaker.modelId}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy || measuring}
          className="rounded-full bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-40"
          onClick={() => void calibrate()}
        >
          {busy || measuring ? progress || "Calibrating…" : "Calibrate"}
        </button>
      </div>
      {error ? <p className="text-sm text-foreground">{error}</p> : null}
      {summary?.error ? <p className="text-sm text-muted">{summary.error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Figure label="Natural WPM" value={fmtWpm(summary?.naturalWpm)} />
        <Figure label="Rate" value={summary?.rateLabel || "—"} />
        <Figure label="WPM at rate" value={fmtWpm(summary?.confirmedWpm)} />
        <Figure label="Real WPM" value={real} />
        <Figure label="Target WPM" value={fmtWpm(detail?.targetWpm)} />
      </div>

      <section>
        <h2 className="text-base font-semibold text-foreground">Samples</h2>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <figure className="rounded-2xl border border-border p-3">
            <figcaption className="text-sm text-muted">Standard rate</figcaption>
            {detail?.standardSampleUrl ? (
              <audio className="mt-2 w-full" controls src={detail.standardSampleUrl} />
            ) : (
              <p className="mt-2 text-sm text-foreground">Calibrate to hear the natural pace.</p>
            )}
          </figure>
          <figure className="rounded-2xl border border-border p-3">
            <figcaption className="text-sm text-muted">Calibrated rate</figcaption>
            {detail?.calibratedSampleUrl ? (
              <audio className="mt-2 w-full" controls src={detail.calibratedSampleUrl} />
            ) : (
              <p className="mt-2 text-sm text-foreground">Calibrate to hear the target pace.</p>
            )}
          </figure>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-foreground">History</h2>
        {detail?.history?.length ? (
          <div className="mt-2 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Natural WPM</th>
                  <th className="px-3 py-2 font-medium">Rate set</th>
                  <th className="px-3 py-2 font-medium">Confirmed WPM</th>
                </tr>
              </thead>
              <tbody>
                {detail.history.map((entry) => (
                  <tr key={entry.at} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-foreground">{fmtWhen(entry.at)}</td>
                    <td className="px-3 py-2 text-foreground">{fmtWpm(entry.naturalWpm)}</td>
                    <td className="px-3 py-2 text-foreground">
                      {entry.rateLabel}
                      {entry.outOfRange ? " · out of range" : ""}
                    </td>
                    <td className="px-3 py-2 text-foreground">{fmtWpm(entry.confirmedWpm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">No calibrations yet.</p>
        )}
      </section>
    </div>
  );
}
