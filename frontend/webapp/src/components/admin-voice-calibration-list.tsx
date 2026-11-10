import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchDevUiSettings,
  listAdminVoice,
  postAdminVoice,
  runAdminVoiceCalibration,
  type AdminCalibrationConfig,
  type AdminCalibrationSummary,
  type AdminVoiceSpeaker,
} from "@/lib/medimade-api";
import { DEFAULT_MEASUREMENT_TEXTS } from "@/lib/measurement-text";
import { defaultDeliveryProfiles, type DeliveryProfiles } from "@/lib/delivery-profiles";

const stepping = new Set<string>();

function fmtWpm(n: number | null | undefined): string {
  return typeof n === "number" && n > 0 ? String(Math.round(n)) : "—";
}

function fmtSignedPct(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || Math.round(n) === 0) return "—";
  const r = Math.round(n);
  return r > 0 ? `+${r}%` : `−${Math.abs(r)}%`;
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function measureLabel(
  summary: AdminCalibrationSummary | null,
  active: boolean,
): string {
  if (summary?.measuring || active) return summary?.progress || "Measuring…";
  if (summary?.error) return "Retry";
  return "Measure";
}

function Spread({ texts }: { texts: number[] | null | undefined }) {
  const [open, setOpen] = useState(false);
  const values = (texts ?? []).filter((n) => n > 0);
  if (values.length < 2) return <>—</>;
  const low = Math.round(Math.min(...values));
  const high = Math.round(Math.max(...values));
  return (
    <div onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="underline decoration-border underline-offset-2"
        onClick={() => setOpen((openNow) => !openNow)}
      >
        {low}–{high}
      </button>
      {open ? (
        <p className="mt-1 text-xs text-muted">
          {values.map((n, index) => `Text ${index + 1} ${Math.round(n)}`).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

export function AdminVoiceCalibrationList() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [speakers, setSpeakers] = useState<AdminVoiceSpeaker[]>([]);
  const [summaries, setSummaries] = useState<AdminCalibrationSummary[]>([]);
  const [config, setConfig] = useState<AdminCalibrationConfig>({
    targetWpm: 100,
    text: DEFAULT_MEASUREMENT_TEXTS[0],
    texts: [...DEFAULT_MEASUREMENT_TEXTS],
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const resumed = useRef(false);
  const playing = useRef<HTMLAudioElement | null>(null);
  const stopRequested = useRef(false);
  const activeModelId = useRef<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [fishHidden, setFishHidden] = useState(false);
  const [profiles, setProfiles] = useState<DeliveryProfiles>(defaultDeliveryProfiles);
  const [sentencePause, setSentencePause] = useState(
    String(defaultDeliveryProfiles().shared.pauseAfterSentence),
  );

  function measureOff(speaker: AdminVoiceSpeaker): boolean {
    return fishHidden && speaker.brand !== "speechify";
  }

  function patchSummary(summary: AdminCalibrationSummary) {
    setSummaries((prev) => {
      const old = prev.find((row) => row.modelId === summary.modelId);
      const rest = prev.filter((row) => row.modelId !== summary.modelId);
      return [
        ...rest,
        {
          paceAdjustPct: old?.paceAdjustPct ?? null,
          lengthVsRequestPct: old?.lengthVsRequestPct ?? null,
          ...summary,
        },
      ];
    });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [data, appSettings] = await Promise.all([
          listAdminVoice(),
          fetchDevUiSettings(),
        ]);
        if (cancelled) return;
        setFishHidden(appSettings.hideFishVoices);
        if (data.deliveryProfiles) {
          setProfiles(data.deliveryProfiles);
          setSentencePause(String(data.deliveryProfiles.shared.pauseAfterSentence));
        }
        setSpeakers(data.speakers);
        setSummaries(data.calibration ?? []);
        const saved = (data.calibrationConfig?.texts ?? []).map((text) => text.trim());
        const first = saved[0] || data.calibrationConfig?.text?.trim();
        if (first) {
          setConfig({
            targetWpm: data.calibrationConfig?.targetWpm ?? 100,
            text: first,
            texts: [
              first,
              saved[1] || DEFAULT_MEASUREMENT_TEXTS[1],
              saved[2] || DEFAULT_MEASUREMENT_TEXTS[2],
            ],
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load voices");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const byId = new Map(summaries.map((s) => [s.modelId, s]));
    return speakers
      .filter((speaker) => !speaker.hidden)
      .map((speaker) => ({ speaker, summary: byId.get(speaker.modelId) ?? null }))
      .sort(
        (a, b) =>
          a.speaker.sort - b.speaker.sort || a.speaker.name.localeCompare(b.speaker.name),
      );
  }, [speakers, summaries]);

  const measuring = summaries.some((summary) => summary.measuring);

  useEffect(() => {
    if (!measuring) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void listAdminVoice()
        .then((data) => {
          if (!cancelled) setSummaries(data.calibration ?? []);
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [measuring]);

  async function measureOne(modelId: string) {
    if (stepping.has(modelId) || stopRequested.current) return;
    const speaker = rows.find((row) => row.speaker.modelId === modelId)?.speaker;
    if (speaker && measureOff(speaker)) return;
    stepping.add(modelId);
    activeModelId.current = modelId;
    const existing = summaries.find((row) => row.modelId === modelId);
    const fish = rows.find((row) => row.speaker.modelId === modelId)?.speaker.brand === "fish";
    patchSummary({
      modelId,
      wpm: existing?.wpm ?? null,
      measuredAt: existing?.measuredAt ?? null,
      measuring: true,
      progress: fish ? "Measuring… 1/6" : "Measuring… 1/3",
      error: null,
      audioUrl: existing?.audioUrl ?? null,
      texts: existing?.texts,
      plainWpm: existing?.plainWpm ?? null,
      plainTexts: existing?.plainTexts,
      shortPauseSec: existing?.shortPauseSec ?? null,
      sentencePauseSec: existing?.sentencePauseSec ?? null,
    });
    try {
      await runAdminVoiceCalibration(modelId, patchSummary, () => stopRequested.current);
    } finally {
      if (activeModelId.current === modelId) activeModelId.current = null;
      stepping.delete(modelId);
      try {
        const data = await listAdminVoice();
        setSummaries(data.calibration ?? []);
      } catch {
        // The row already shows the last step.
      }
    }
  }

  useEffect(() => {
    if (loading || resumed.current) return;
    resumed.current = true;
    const running = rows
      .filter((row) => row.summary?.measuring && !measureOff(row.speaker))
      .map((row) => row.speaker.modelId);
    if (!running.length) return;
    stopRequested.current = false;
    setBusy("all");
    void (async () => {
      for (const modelId of running) {
        if (stopRequested.current) break;
        await measureOne(modelId);
      }
      setBusy(null);
      setStopping(false);
    })();
  }, [loading, rows]);

  async function saveText() {
    setSaving(true);
    setError(null);
    try {
      const pause = Number(sentencePause);
      if (
        Number.isFinite(pause) &&
        pause >= 0 &&
        pause !== profiles.shared.pauseAfterSentence
      ) {
        const next = await postAdminVoice<{ deliveryProfiles: DeliveryProfiles }>({
          action: "save-delivery-profiles",
          profiles: { ...profiles, shared: { ...profiles.shared, pauseAfterSentence: pause } },
        });
        setProfiles(next.deliveryProfiles);
        setSentencePause(String(next.deliveryProfiles.shared.pauseAfterSentence));
      }
      const saved = await postAdminVoice<{ calibrationConfig: AdminCalibrationConfig }>({
        action: "save-calibration-config",
        texts: config.texts ?? [config.text, "", ""],
      });
      setConfig({
        ...saved.calibrationConfig,
        texts: saved.calibrationConfig.texts ?? [saved.calibrationConfig.text, "", ""],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the measurement text");
    } finally {
      setSaving(false);
    }
  }

  type MeasureBatch =
    | "all"
    | "unmeasured"
    | "fish"
    | "fish-unmeasured"
    | "speechify"
    | "speechify-unmeasured";

  function batchRows(brand?: "fish" | "speechify", onlyUnmeasured = false) {
    return rows.filter((row) => {
      if (row.summary?.measuring) return false;
      if (measureOff(row.speaker)) return false;
      if (brand && row.speaker.brand !== brand) return false;
      if (onlyUnmeasured && typeof row.summary?.wpm === "number" && row.summary.wpm > 0) return false;
      return true;
    });
  }

  function requestStop() {
    stopRequested.current = true;
    setStopping(true);
    const modelId = activeModelId.current;
    if (!modelId) return;
    void postAdminVoice<{ summary?: AdminCalibrationSummary }>({
      action: "calibration-cancel",
      modelId,
    })
      .then((res) => {
        if (res.summary) patchSummary(res.summary);
      })
      .catch(() => undefined);
  }

  async function measureRows(which: MeasureBatch, waiting: typeof rows) {
    if (!waiting.length) return;
    stopRequested.current = false;
    setStopping(false);
    setBusy(which);
    setError(null);
    try {
      for (const row of waiting) {
        if (stopRequested.current) break;
        await measureOne(row.speaker.modelId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Measurement failed");
    } finally {
      setBusy(null);
      setStopping(false);
    }
  }

  function play(url: string) {
    if (playing.current) {
      playing.current.pause();
      playing.current = null;
    }
    const audio = new Audio(url);
    playing.current = audio;
    void audio.play();
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <span className="mm-placeholder block h-16 w-full rounded-2xl" aria-hidden />
        <span className="mm-placeholder block h-40 w-full rounded-2xl" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Voices</h1>
          <p className="mt-1 text-sm text-muted">
            How fast each voice speaks at its standard settings.{" "}
            <Link to="/admin/voice/catalogue" className="text-foreground underline">
              Catalogue
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {busy != null ? (
            <button
              type="button"
              disabled={stopping}
              className="rounded-full bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-40"
              onClick={requestStop}
            >
              {stopping ? "Stopping…" : "Stop"}
            </button>
          ) : null}
          {(
            [
              ["unmeasured", "Measure unmeasured", batchRows(undefined, true), true],
              ["all", "Measure all", batchRows(), false],
              ["fish-unmeasured", "Measure all Fish unmeasured", batchRows("fish", true), false],
              ["fish", "Measure all Fish", batchRows("fish"), false],
              [
                "speechify-unmeasured",
                "Measure all Speechify unmeasured",
                batchRows("speechify", true),
                false,
              ],
              ["speechify", "Measure all Speechify", batchRows("speechify"), false],
            ] as const
          ).map(([id, label, waiting, filled]) => (
            <button
              key={id}
              type="button"
              disabled={busy != null || waiting.length === 0}
              className={
                filled
                  ? "rounded-full bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-40"
                  : "rounded-full border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-40"
              }
              onClick={() => void measureRows(id, waiting)}
            >
              {busy === id ? "Measuring…" : label}
            </button>
          ))}
        </div>
      </div>

      <section className="space-y-3 rounded-2xl border border-border p-4">
        <label className="block text-sm font-medium text-foreground">
          Pause after sentence (s)
          <input
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={sentencePause}
            onChange={(e) => setSentencePause(e.target.value)}
            className="mt-2 block w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
          />
          <span className="mt-1 block text-xs font-normal text-muted">
            Silence after every . ? and ! in measurements, script pause rules and Speechify
            meditation audio.
          </span>
        </label>
        {(config.texts ?? [config.text, "", ""]).map((text, index) => (
          <label key={index} className="block text-sm font-medium text-foreground">
            Text {index + 1}
            <textarea
              value={text}
              onChange={(e) =>
                setConfig((prev) => {
                  const texts = [...(prev.texts ?? [prev.text, "", ""])];
                  texts[index] = e.target.value;
                  return { ...prev, text: texts[0] ?? "", texts };
                })
              }
              rows={6}
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
            />
          </label>
        ))}
        <button
          type="button"
          disabled={saving}
          className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-40"
          onClick={() => void saveText()}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </section>

      {error ? <p className="text-sm text-foreground">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-medium">Voice</th>
              <th className="px-3 py-2 font-medium">With pause</th>
              <th className="px-3 py-2 font-medium">Spread</th>
              <th className="px-3 py-2 font-medium">Without pause</th>
              <th className="px-3 py-2 font-medium">Spread</th>
              <th className="px-3 py-2 font-medium">Measured</th>
              <th
                className="px-3 py-2 font-medium"
                title="Applied with atempo so the voice sits within ±5% of the median With pause WPM"
              >
                Pace adjustment
              </th>
              <th
                className="px-3 py-2 font-medium"
                title="Average over the voice's last 20 meditations (needs 3)"
              >
                Length vs request
              </th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ speaker, summary }) => {
              const running = Boolean(summary?.measuring);
              const failed = Boolean(summary?.error);
              const off = measureOff(speaker);
              return (
                <tr
                  key={speaker.modelId}
                  className={`border-b border-border last:border-0${off ? " opacity-40" : ""}`}
                  title={off ? "Fish voices are hidden from customers" : undefined}
                >
                  <td className="px-3 py-3">
                    <span className="font-medium text-foreground">{speaker.name}</span>
                    {speaker.brand === "fish" ? (
                      <span className="ml-2 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground">
                        Pro
                      </span>
                    ) : null}
                    {speaker.brand === "fish" &&
                    typeof summary?.shortPauseSec === "number" &&
                    summary.shortPauseSec > 0 ? (
                      <p className="mt-1 text-xs text-muted">
                        break {summary.shortPauseSec.toFixed(2)}s
                      </p>
                    ) : null}
                    {speaker.brand === "speechify" &&
                    typeof summary?.sentencePauseSec === "number" ? (
                      <p className="mt-1 text-xs text-muted">
                        pause {summary.sentencePauseSec.toFixed(2)}s
                      </p>
                    ) : null}
                    {failed ? (
                      <p className="mt-1 max-w-sm text-xs text-muted">{summary?.error}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-foreground">
                    {summary?.audioUrl && summary.wpm ? (
                      <button
                        type="button"
                        className="underline decoration-border underline-offset-2"
                        onClick={() => play(summary.audioUrl as string)}
                      >
                        {fmtWpm(summary.wpm)}
                      </button>
                    ) : (
                      fmtWpm(summary?.wpm)
                    )}
                  </td>
                  <td className="px-3 py-3 text-foreground">
                    <Spread texts={summary?.texts} />
                  </td>
                  <td className="px-3 py-3 text-foreground">{fmtWpm(summary?.plainWpm)}</td>
                  <td className="px-3 py-3 text-foreground">
                    <Spread texts={summary?.plainTexts} />
                  </td>
                  <td className="px-3 py-3 text-foreground">{fmtWhen(summary?.measuredAt)}</td>
                  <td className="px-3 py-3 text-foreground">{fmtSignedPct(summary?.paceAdjustPct)}</td>
                  <td className="px-3 py-3 text-foreground">
                    {fmtSignedPct(summary?.lengthVsRequestPct)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy != null || running || off}
                      className="rounded-full border border-border px-3 py-1 text-sm text-foreground disabled:opacity-40"
                      onClick={() => {
                        stopRequested.current = false;
                        setStopping(false);
                        setBusy(speaker.modelId);
                        void measureOne(speaker.modelId).finally(() => {
                          setBusy(null);
                          setStopping(false);
                        });
                      }}
                    >
                      {measureLabel(summary, running || busy === speaker.modelId)}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
