import { useEffect, useMemo, useState } from "react";
import {
  listAdminVoice,
  postAdminVoice,
  type AdminDeliveryLengthStats,
  type AdminSectionStatsRow,
} from "@/lib/medimade-api";
import {
  defaultDeliveryProfiles,
  previewDelivery,
  // speechShareFor,
  silenceShareFor,
  type DeliveryId,
  type DeliveryProfiles,
  type SectionShares,
} from "@/lib/delivery-profiles";
import {
  coerceScriptTargetCorrection,
  defaultScriptTargetCorrection,
  type ScriptTargetCorrection,
} from "@/lib/script-target-correction";
import {
  claudeModelLabel,
  coerceScriptGenerationSettings,
  defaultScriptGenerationSettings,
  modelHasFactors,
  type ScriptGenerationSettings,
} from "@/lib/script-generation-settings";

function num(raw: string, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block text-sm text-foreground">
      <span className="mb-1 block text-muted">{label}</span>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(num(e.target.value, value))}
        className="w-full rounded-xl border border-border bg-background px-2 py-1.5 text-foreground"
      />
    </label>
  );
}

const DELIVERY_LABEL = { casual: "Casual", guided: "Guided", open_sits: "Open sits" } as const;

function fmtPct(n: number | null | undefined, signed = false): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const r = Math.round(n);
  if (!signed) return `${r}%`;
  if (r === 0) return "0%";
  return r > 0 ? `+${r}%` : `−${Math.abs(r)}%`;
}

const pctOf = (share: number) => Math.round(share * 100);
const shareOf = (pct: number) => Math.min(0.95, Math.max(0, pct / 100));

export function AdminDeliveryProfiles() {
  const [profiles, setProfiles] = useState<DeliveryProfiles>(defaultDeliveryProfiles);
  const [scriptGeneration, setScriptGeneration] = useState<ScriptGenerationSettings>(
    defaultScriptGenerationSettings,
  );
  const [targetCorrection, setTargetCorrection] = useState<ScriptTargetCorrection>(
    defaultScriptTargetCorrection,
  );
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [factorsError, setFactorsError] = useState<string | null>(null);
  const [calibrateProgress, setCalibrateProgress] = useState<string | null>(null);
  const [calibrationSummary, setCalibrationSummary] = useState<
    Array<{
      delivery: string;
      minutes: number;
      scripts: number;
      wordsPct: number | null;
      pausesPct: number | null;
      wordFactor: number;
      pauseFactor: number;
      sampleCount: number;
    }>
  >([]);
  const [diversions, setDiversions] = useState<
    Array<{
      delivery: string;
      minutes: number;
      briefIndex: number;
      brief: string;
      notes: string;
      divertedSections: string[];
    }>
  >([]);
  const [checkRows, setCheckRows] = useState<
    Array<{
      delivery: string;
      minutes: number;
      voice: string;
      path: string;
      sections: number;
      firstWordsPct: number;
      finalWordsPct: number;
      pausesPct: number;
      fixed: string[];
      pauseScalePct: number;
      finalLengthPct: number;
    }>
  >([]);
  const [lastBatchAt, setLastBatchAt] = useState<string | null>(null);
  const [resumeHint, setResumeHint] = useState<string | null>(null);
  const [lengthStats, setLengthStats] = useState<
    Partial<Record<"casual" | "guided" | "open_sits", AdminDeliveryLengthStats>>
  >({});
  const [sectionStats, setSectionStats] = useState<AdminSectionStatsRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listAdminVoice();
        if (cancelled) return;
        if (data.deliveryProfiles) setProfiles(data.deliveryProfiles);
        if (data.scriptGeneration) {
          const sg = coerceScriptGenerationSettings(data.scriptGeneration);
          setScriptGeneration(sg);
          setTargetCorrection(
            coerceScriptTargetCorrection(
              sg.targetCorrectionByModel[sg.scriptModelId] ?? data.targetCorrection,
            ),
          );
        } else if (data.targetCorrection) {
          setTargetCorrection(coerceScriptTargetCorrection(data.targetCorrection));
        }
        setLengthStats(data.lengthStats ?? {});
        setSectionStats(data.sectionStats ?? []);
        try {
          const sg0 = data.scriptGeneration
            ? coerceScriptGenerationSettings(data.scriptGeneration)
            : defaultScriptGenerationSettings();
          const batchRes = await postAdminVoice<{
            batch: { ranAt?: string } | null;
            completedCount?: number;
            total?: number;
            canResume?: boolean;
          }>({
            action: "get-script-calibration-batch",
            modelId: sg0.scriptModelId,
          });
          if (!cancelled) {
            setLastBatchAt(batchRes.batch?.ranAt ?? null);
            if (batchRes.canResume) {
              setResumeHint(
                `Resume available: ${batchRes.completedCount ?? 0} of ${batchRes.total ?? 90} scripts saved`,
              );
            }
          }
        } catch {
          /* optional */
        }
        const when = data.deliveryProfileMeta?.updatedAt;
        if (when) {
          setMeta(
            `Last saved ${new Date(when).toLocaleString()}${
              data.deliveryProfileMeta?.updatedBy
                ? ` · ${data.deliveryProfileMeta.updatedBy}`
                : ""
            }`,
          );
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load profiles");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const preview = useMemo(
    () =>
      (["casual", "guided", "open_sits"] as const).map((delivery) =>
        previewDelivery(profiles, delivery, 10),
      ),
    [profiles],
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const nextSg: ScriptGenerationSettings = {
        ...scriptGeneration,
        targetCorrectionByModel: {
          ...scriptGeneration.targetCorrectionByModel,
          [scriptGeneration.scriptModelId]: targetCorrection,
        },
      };
      const saved = await postAdminVoice<{
        deliveryProfiles: DeliveryProfiles;
        targetCorrection?: ScriptTargetCorrection;
        scriptGeneration?: ScriptGenerationSettings;
        deliveryProfileMeta?: { updatedAt: string | null; updatedBy: string | null };
      }>({
        action: "save-delivery-profiles",
        profiles,
        targetCorrection,
        scriptGeneration: nextSg,
      });
      setProfiles(saved.deliveryProfiles);
      if (saved.scriptGeneration) {
        const sg = coerceScriptGenerationSettings(saved.scriptGeneration);
        setScriptGeneration(sg);
        setTargetCorrection(
          coerceScriptTargetCorrection(
            sg.targetCorrectionByModel[sg.scriptModelId] ?? saved.targetCorrection,
          ),
        );
      } else if (saved.targetCorrection) {
        setTargetCorrection(coerceScriptTargetCorrection(saved.targetCorrection));
      }
      const when = saved.deliveryProfileMeta?.updatedAt;
      setMeta(
        when
          ? `Last saved ${new Date(when).toLocaleString()}${
              saved.deliveryProfileMeta?.updatedBy
                ? ` · ${saved.deliveryProfileMeta.updatedBy}`
                : ""
            }`
          : "Saved",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-busy="true">
        {/* Loading delivery profiles… */}
        <span className="mm-placeholder block h-48 rounded-2xl" aria-hidden />
        <span className="mm-placeholder block h-48 rounded-2xl" aria-hidden />
      </div>
    );
  }

  const setSection = (id: DeliveryId, key: keyof SectionShares, n: number) =>
    setProfiles((p) => ({
      ...p,
      sections: { ...p.sections, [id]: { ...p.sections[id], [key]: n } },
    }));

  // const share = (id: "casual" | "guided" | "open_sits") =>
  //   `${Math.round(speechShareFor(profiles, id) * 100)}% speech`;
  const share = (id: "casual" | "guided" | "open_sits") =>
    `${pctOf(silenceShareFor(profiles, id))}% silence`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Delivery profiles</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            These rules size new scripts and the silences the stitcher inserts. Changes apply to
            new meditations only.
          </p>
          {meta ? <p className="mt-1 text-xs text-muted">{meta}</p> : null}
        </div>
        <button
          type="button"
          disabled={saving}
          className="rounded-full bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-40"
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error ? <p className="text-sm text-foreground">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-foreground">Casual · {share("casual")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Silence share (%)" value={pctOf(profiles.casual.silenceShare)} onChange={(n) => setProfiles((p) => ({ ...p, casual: { ...p.casual, silenceShare: shareOf(n) } }))} />
            <Field label="Default WPM" value={profiles.casual.defaultWpm} onChange={(n) => setProfiles((p) => ({ ...p, casual: { ...p.casual, defaultWpm: n } }))} />
            {/* Pause after sentence is shared now — set on Admin › Voices. */}
            <Field label="Between paragraphs (s)" value={profiles.casual.pauseBetweenParagraphs} onChange={(n) => setProfiles((p) => ({ ...p, casual: { ...p.casual, pauseBetweenParagraphs: n } }))} />
            <Field label="Longest pause (s)" value={profiles.casual.longestPause} onChange={(n) => setProfiles((p) => ({ ...p, casual: { ...p.casual, longestPause: n } }))} />
            <Field label="Opening and closing (s)" value={profiles.casual.openingClosing} onChange={(n) => setProfiles((p) => ({ ...p, casual: { ...p.casual, openingClosing: n } }))} />
          </div>
        </section>

        <section className="rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-foreground">Guided · {share("guided")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Silence share (%)" value={pctOf(profiles.guided.silenceShare)} onChange={(n) => setProfiles((p) => ({ ...p, guided: { ...p.guided, silenceShare: shareOf(n) } }))} />
            <Field label="Default WPM" value={profiles.guided.defaultWpm} onChange={(n) => setProfiles((p) => ({ ...p, guided: { ...p.guided, defaultWpm: n } }))} />
            <Field label="After a breath cue (s)" value={profiles.guided.pauseAfterBreath} onChange={(n) => setProfiles((p) => ({ ...p, guided: { ...p.guided, pauseAfterBreath: n } }))} />
            <Field label="Between sections (s)" value={profiles.guided.pauseBetweenSections} onChange={(n) => setProfiles((p) => ({ ...p, guided: { ...p.guided, pauseBetweenSections: n } }))} />
            <Field label="Reflective silences / 10 min" value={profiles.guided.reflectivePer10} onChange={(n) => setProfiles((p) => ({ ...p, guided: { ...p.guided, reflectivePer10: n } }))} />
            <Field label="Reflective length (s)" value={profiles.guided.reflectiveLength} onChange={(n) => setProfiles((p) => ({ ...p, guided: { ...p.guided, reflectiveLength: n } }))} />
            <Field label="Opening settle-in (s)" value={profiles.guided.opening} onChange={(n) => setProfiles((p) => ({ ...p, guided: { ...p.guided, opening: n } }))} />
            <Field label="Closing (s)" value={profiles.guided.closing} onChange={(n) => setProfiles((p) => ({ ...p, guided: { ...p.guided, closing: n } }))} />
          </div>
        </section>

        <section className="rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-foreground">Open sits · {share("open_sits")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Silence share (%)" value={pctOf(profiles.openSits.silenceShare)} onChange={(n) => setProfiles((p) => ({ ...p, openSits: { ...p.openSits, silenceShare: shareOf(n) } }))} />
            <Field label="Default WPM" value={profiles.openSits.defaultWpm} onChange={(n) => setProfiles((p) => ({ ...p, openSits: { ...p.openSits, defaultWpm: n } }))} />
            <Field label="Cue length (words)" value={profiles.openSits.cueWords} onChange={(n) => setProfiles((p) => ({ ...p, openSits: { ...p.openSits, cueWords: n } }))} />
            <Field label="Gap between cues (s)" value={profiles.openSits.gap} onChange={(n) => setProfiles((p) => ({ ...p, openSits: { ...p.openSits, gap: n } }))} />
            <Field label="Opening cue (s)" value={profiles.openSits.opening} onChange={(n) => setProfiles((p) => ({ ...p, openSits: { ...p.openSits, opening: n } }))} />
            <Field label="Closing cue (s)" value={profiles.openSits.closing} onChange={(n) => setProfiles((p) => ({ ...p, openSits: { ...p.openSits, closing: n } }))} />
          </div>
        </section>

        <section className="rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-foreground">Shared</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Characters per word" value={profiles.shared.charsPerWord} onChange={(n) => setProfiles((p) => ({ ...p, shared: { ...p.shared, charsPerWord: n } }))} />
            <Field label="TTS break limit (s)" value={profiles.shared.ttsBreakLimit} onChange={(n) => setProfiles((p) => ({ ...p, shared: { ...p.shared, ttsBreakLimit: n } }))} />
            <Field label="Length tolerance (±%)" value={profiles.shared.lengthTolerancePct} onChange={(n) => setProfiles((p) => ({ ...p, shared: { ...p.shared, lengthTolerancePct: n } }))} />
            <Field label="Section word cap" value={profiles.shared.sectionWordCap} onChange={(n) => setProfiles((p) => ({ ...p, shared: { ...p.shared, sectionWordCap: n } }))} />
            <Field label="Section word min" value={profiles.shared.sectionWordMin} onChange={(n) => setProfiles((p) => ({ ...p, shared: { ...p.shared, sectionWordMin: n } }))} />
            <Field label="Plan min words" value={profiles.shared.planMinWords} onChange={(n) => setProfiles((p) => ({ ...p, shared: { ...p.shared, planMinWords: n } }))} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Silences longer than the TTS break limit are stitched as audio. The silence share
            goes into the script prompt; the length tolerance sets the check before and after
            audio. Sessions under plan min words skip plan/split and write in one call.
            {/* Speech share is calculated from the pause rules. */}
          </p>
        </section>
      </div>

            <section className="rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">Script model &amp; correction factors</h2>
            <p className="mt-1 text-xs text-muted">
              One word factor and one pause factor per length × delivery (5/10/20 × Casual /
              Guided / Open sits), stored per model. Set by Run calibration (10 briefs × 9 =
              90 scripts, no audio); scripts are kept so you can re-run after a model change.
              Default model: claude-sonnet-5-5.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block text-sm text-foreground">
            <span className="mb-1 block text-muted">Script model</span>
            <select
              value={scriptGeneration.scriptModelId}
              onChange={(e) => {
                const id = e.target.value;
                setScriptGeneration((sg) => {
                  const next = { ...sg, scriptModelId: id };
                  const factors =
                    sg.targetCorrectionByModel[id] ??
                    sg.targetCorrectionByModel[sg.scriptModelId] ??
                    defaultScriptTargetCorrection();
                  setTargetCorrection(coerceScriptTargetCorrection(factors));
                  return {
                    ...next,
                    targetCorrectionByModel: {
                      ...sg.targetCorrectionByModel,
                      [id]: coerceScriptTargetCorrection(factors),
                    },
                  };
                });
                setCalibrationSummary([]);
                setCheckRows([]);
                setLastBatchAt(null);
                void (async () => {
                  try {
                    const data = await postAdminVoice<{
                      batch: { ranAt?: string } | null;
                    }>({
                      action: "get-script-calibration-batch",
                      modelId: id,
                    });
                    setLastBatchAt(data.batch?.ranAt ?? null);
                  } catch {
                    /* */
                  }
                })();
              }}
              className="rounded-xl border border-border bg-background px-2 py-1.5 text-foreground"
            >
              {scriptGeneration.scriptModelOptions.map((id) => (
                <option key={id} value={id}>
                  {claudeModelLabel(id)} ({id})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={calibrating || checking}
            className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setCalibrating(true);
                setFactorsError(null);
                setCalibrationSummary([]);
                setDiversions([]);
                const deliveries = ["casual", "guided", "open_sits"] as const;
                const minutes = [5, 10, 20] as const;
                const briefs = scriptGeneration.calibrationBriefs;
                const modelId = scriptGeneration.scriptModelId;
                const total = deliveries.length * minutes.length * briefs.length;
                const cellKey = (d: string, m: number, b: number) =>
                  `${d}|${m}|${b}`;
                try {
                  // Resume: skip cells already saved server-side.
                  const progress = await postAdminVoice<{
                    completedKeys?: string[];
                    completedCount?: number;
                    total?: number;
                  }>({
                    action: "get-script-calibration-batch",
                    modelId,
                  });
                  const done = new Set(progress.completedKeys ?? []);
                  if (done.size > 0 && done.size < total) {
                    setCalibrateProgress(
                      `Resuming · ${done.size} of ${total} already saved…`,
                    );
                  }
                  let n = 0;
                  for (const delivery of deliveries) {
                    for (const m of minutes) {
                      for (let briefIndex = 0; briefIndex < briefs.length; briefIndex++) {
                        n += 1;
                        const key = cellKey(delivery, m, briefIndex);
                        if (done.has(key)) continue;
                        setCalibrateProgress(
                          `Script ${n} of ${total} · ${DELIVERY_LABEL[delivery]} · ${m} min · brief ${briefIndex + 1} (+ fidelity)`,
                        );
                        const saved = await postAdminVoice<{
                          result: unknown;
                          completedCount?: number;
                        }>({
                          action: "calibrate-script-factors-cell",
                          modelId,
                          delivery,
                          minutes: m,
                          briefIndex,
                        });
                        done.add(key);
                        void saved;
                      }
                    }
                  }
                  setCalibrateProgress("Saving factors…");
                  // Finalize loads cells from Dynamo (no giant payload).
                  const finalized = await postAdminVoice<{
                    targetCorrection?: ScriptTargetCorrection;
                    scriptGeneration?: ScriptGenerationSettings;
                    summary: typeof calibrationSummary;
                    failures: Array<{ error: string }>;
                    diversions?: typeof diversions;
                    batchMeta?: { ranAt: string };
                  }>({
                    action: "calibrate-script-factors-finalize",
                    modelId,
                  });
                  if (finalized.scriptGeneration) {
                    const sg = coerceScriptGenerationSettings(finalized.scriptGeneration);
                    setScriptGeneration(sg);
                    setTargetCorrection(
                      coerceScriptTargetCorrection(
                        sg.targetCorrectionByModel[sg.scriptModelId] ??
                          finalized.targetCorrection,
                      ),
                    );
                  } else if (finalized.targetCorrection) {
                    setTargetCorrection(
                      coerceScriptTargetCorrection(finalized.targetCorrection),
                    );
                  }
                  setCalibrationSummary(finalized.summary ?? []);
                  setDiversions(finalized.diversions ?? []);
                  setLastBatchAt(finalized.batchMeta?.ranAt ?? new Date().toISOString());
                  setResumeHint(null);
                  const failN = finalized.failures?.length ?? 0;
                  const divN = finalized.diversions?.length ?? 0;
                  setCalibrateProgress(
                    `Done · factors saved · ${failN} failed · ${divN} brief diversion(s)`,
                  );
                } catch (e) {
                  setFactorsError(
                    e instanceof Error ? e.message : "Calibration failed",
                  );
                  setCalibrateProgress(null);
                } finally {
                  setCalibrating(false);
                }
              })();
            }}
          >
            {calibrating
              ? "Calibrating…"
              : resumeHint
                ? "Resume calibration"
                : "Run calibration"}
          </button>
          <button
            type="button"
            disabled={calibrating || checking}
            className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setChecking(true);
                setFactorsError(null);
                setCheckRows([]);
                const deliveries = ["casual", "guided", "open_sits"] as const;
                const minutes = [5, 10, 20] as const;
                const voices = ["Beatrice", "Elijah", "Oliver"] as const;
                const rows: typeof checkRows = [];
                try {
                  for (const delivery of deliveries) {
                    for (const m of minutes) {
                      for (const voice of voices) {
                        setCalibrateProgress(
                          `Check · ${DELIVERY_LABEL[delivery]} · ${m} min · ${voice}`,
                        );
                        const saved = await postAdminVoice<{
                          result: (typeof checkRows)[number];
                        }>({
                          action: "check-script-factors-cell",
                          modelId: scriptGeneration.scriptModelId,
                          delivery,
                          minutes: m,
                          voice,
                        });
                        rows.push(saved.result);
                        setCheckRows([...rows]);
                      }
                    }
                  }
                  setCalibrateProgress("Check done");
                } catch (e) {
                  setFactorsError(e instanceof Error ? e.message : "Check failed");
                  setCalibrateProgress(null);
                } finally {
                  setChecking(false);
                }
              })();
            }}
          >
            {checking ? "Checking…" : "Run check"}
          </button>
          <button
            type="button"
            disabled={calibrating || checking}
            className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setFactorsError(null);
                try {
                  const saved = await postAdminVoice<{
                    targetCorrection?: ScriptTargetCorrection;
                    scriptGeneration?: ScriptGenerationSettings;
                  }>({
                    action: "reset-target-correction",
                    modelId: scriptGeneration.scriptModelId,
                  });
                  if (saved.scriptGeneration) {
                    const sg = coerceScriptGenerationSettings(saved.scriptGeneration);
                    setScriptGeneration(sg);
                    setTargetCorrection(
                      coerceScriptTargetCorrection(
                        sg.targetCorrectionByModel[sg.scriptModelId] ??
                          defaultScriptTargetCorrection(),
                      ),
                    );
                  } else {
                    setTargetCorrection(
                      coerceScriptTargetCorrection(
                        saved.targetCorrection ?? defaultScriptTargetCorrection(),
                      ),
                    );
                  }
                  setCalibrationSummary([]);
                  setCheckRows([]);
                  setCalibrateProgress(null);
                } catch (e) {
                  setFactorsError(
                    e instanceof Error ? e.message : "Could not reset factors",
                  );
                }
              })();
            }}
          >
            Reset factors
          </button>
        </div>
        {factorsError ? (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">{factorsError}</p>
        ) : null}

        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-medium text-foreground">Calibration briefs</h3>
          <p className="text-xs text-muted">
            Ten requests used for every length × delivery — mix of settle, aspirational, and
            prescriptive. Edit and save profiles to keep them for the next model re-run.
          </p>
          {scriptGeneration.calibrationBriefs.map((brief, i) => (
            <label key={i} className="block text-sm text-foreground">
              <span className="mb-1 block text-muted">Brief {i + 1}</span>
              <textarea
                value={brief}
                rows={2}
                onChange={(e) => {
                  const v = e.target.value;
                  setScriptGeneration((sg) => {
                    const next = [...sg.calibrationBriefs];
                    next[i] = v;
                    return { ...sg, calibrationBriefs: next };
                  });
                }}
                className="w-full rounded-xl border border-border bg-background px-2 py-1.5 text-foreground"
              />
            </label>
          ))}
        </div>

        {!modelHasFactors(scriptGeneration, scriptGeneration.scriptModelId) ? (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
            This model has no calibrated factors yet — run calibration (stores scripts for
            re-run when you change model).
          </p>
        ) : null}
        {lastBatchAt ? (
          <p className="mt-2 text-xs text-muted">
            Last stored batch: {new Date(lastBatchAt).toLocaleString()}
          </p>
        ) : null}
        {resumeHint ? (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{resumeHint}</p>
        ) : null}
        {calibrateProgress ? (
          <p className="mt-2 text-xs text-muted">{calibrateProgress}</p>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Delivery</th>
                <th className="py-2 pr-3 font-medium">Length</th>
                <th className="py-2 pr-3 font-medium">Word factor</th>
                <th className="py-2 pr-3 font-medium">Pause factor</th>
                <th className="py-2 pr-3 font-medium">Scripts</th>
                <th className="py-2 pr-3 font-medium">Set</th>
              </tr>
            </thead>
            <tbody>
              {(["casual", "guided", "open_sits"] as const).flatMap((id) =>
                (["5", "10", "20"] as const).map((len) => {
                  const cell = targetCorrection[id][len];
                  return (
                    <tr
                      key={`${id}-${len}`}
                      className="border-b border-border last:border-0 text-foreground"
                    >
                      <td className="py-2 pr-3">{DELIVERY_LABEL[id]}</td>
                      <td className="py-2 pr-3">{len} min</td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          step="0.01"
                          value={cell.words}
                          onChange={(e) => {
                            const n = num(e.target.value, cell.words);
                            setTargetCorrection((c) => ({
                              ...c,
                              [id]: {
                                ...c[id],
                                [len]: { ...c[id][len], words: n },
                              },
                            }));
                          }}
                          className="w-20 rounded-lg border border-border bg-background px-1.5 py-1"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          step="0.01"
                          value={cell.pauses}
                          onChange={(e) => {
                            const n = num(e.target.value, cell.pauses);
                            setTargetCorrection((c) => ({
                              ...c,
                              [id]: {
                                ...c[id],
                                [len]: { ...c[id][len], pauses: n },
                              },
                            }));
                          }}
                          className="w-20 rounded-lg border border-border bg-background px-1.5 py-1"
                        />
                      </td>
                      <td className="py-2 pr-3">{cell.sampleCount || "—"}</td>
                      <td className="py-2 pr-3 text-xs text-muted">
                        {cell.setAt ? new Date(cell.setAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>

        {diversions.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              Brief diversions (parallel sections: continuity gaps are ignored)
            </h3>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Delivery</th>
                  <th className="py-2 pr-3 font-medium">Length</th>
                  <th className="py-2 pr-3 font-medium">Brief</th>
                  <th className="py-2 pr-3 font-medium">Notes</th>
                  <th className="py-2 pr-3 font-medium">Sections</th>
                </tr>
              </thead>
              <tbody>
                {diversions.map((row, i) => (
                  <tr
                    key={`${row.delivery}-${row.minutes}-${row.briefIndex}-${i}`}
                    className="border-b border-border last:border-0 text-foreground"
                  >
                    <td className="py-2 pr-3">
                      {DELIVERY_LABEL[row.delivery as DeliveryId] ?? row.delivery}
                    </td>
                    <td className="py-2 pr-3">{row.minutes} min</td>
                    <td className="py-2 pr-3 max-w-[240px] text-xs">
                      {row.brief.slice(0, 120)}
                      {row.brief.length > 120 ? "…" : ""}
                    </td>
                    <td className="py-2 pr-3 text-xs">{row.notes || "—"}</td>
                    <td className="py-2 pr-3 text-xs">
                      {row.divertedSections?.length
                        ? row.divertedSections.join(", ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {calibrationSummary.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              Calibration results (before factors)
            </h3>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Delivery</th>
                  <th className="py-2 pr-3 font-medium">Length</th>
                  <th className="py-2 pr-3 font-medium">Words vs target</th>
                  <th className="py-2 pr-3 font-medium">Pauses vs plan</th>
                  <th className="py-2 pr-3 font-medium">Word factor</th>
                  <th className="py-2 pr-3 font-medium">Pause factor</th>
                </tr>
              </thead>
              <tbody>
                {calibrationSummary.map((row) => (
                  <tr
                    key={`${row.delivery}-${row.minutes}`}
                    className="border-b border-border last:border-0 text-foreground"
                  >
                    <td className="py-2 pr-3">
                      {DELIVERY_LABEL[row.delivery as DeliveryId] ?? row.delivery}
                    </td>
                    <td className="py-2 pr-3">{row.minutes} min</td>
                    <td className="py-2 pr-3">{fmtPct(row.wordsPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.pausesPct, true)}</td>
                    <td className="py-2 pr-3">{row.wordFactor.toFixed(2)}</td>
                    <td className="py-2 pr-3">{row.pauseFactor.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {checkRows.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              Run check (factors on)
            </h3>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Delivery</th>
                  <th className="py-2 pr-3 font-medium">Length</th>
                  <th className="py-2 pr-3 font-medium">Voice</th>
                  <th className="py-2 pr-3 font-medium">Words</th>
                  <th className="py-2 pr-3 font-medium">Pauses</th>
                  <th className="py-2 pr-3 font-medium">Fix</th>
                  <th className="py-2 pr-3 font-medium">Pause scale</th>
                  <th className="py-2 pr-3 font-medium">Length</th>
                </tr>
              </thead>
              <tbody>
                {checkRows.map((row) => (
                  <tr
                    key={`${row.delivery}-${row.minutes}-${row.voice}`}
                    className="border-b border-border last:border-0 text-foreground"
                  >
                    <td className="py-2 pr-3">
                      {DELIVERY_LABEL[row.delivery as DeliveryId] ?? row.delivery}
                    </td>
                    <td className="py-2 pr-3">{row.minutes} min</td>
                    <td className="py-2 pr-3">{row.voice}</td>
                    <td className="py-2 pr-3">{fmtPct(row.firstWordsPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.pausesPct, true)}</td>
                    <td className="py-2 pr-3">
                      {row.fixed?.length ? row.fixed.join(", ") : "—"}
                    </td>
                    <td className="py-2 pr-3">{row.pauseScalePct}%</td>
                    <td className="py-2 pr-3">{fmtPct(row.finalLengthPct, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

<section className="rounded-2xl border border-border p-4">
        <h2 className="font-semibold text-foreground">Script sections</h2>
        <p className="mt-1 text-xs text-muted">
          Legacy opening/closing shares (v2). New scripts let the model choose sections under the
          section word cap; these shares are kept for reference only.
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          {(["casual", "guided", "open_sits"] as const).map((id) => (
            <div key={id} className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">{DELIVERY_LABEL[id]}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Opening words (%)" value={profiles.sections[id].openingWordsPct} onChange={(n) => setSection(id, "openingWordsPct", n)} />
                <Field label="Closing words (%)" value={profiles.sections[id].closingWordsPct} onChange={(n) => setSection(id, "closingWordsPct", n)} />
                <Field label="Opening silence (%)" value={profiles.sections[id].openingSilencePct} onChange={(n) => setSection(id, "openingSilencePct", n)} />
                <Field label="Closing silence (%)" value={profiles.sections[id].closingSilencePct} onChange={(n) => setSection(id, "closingSilencePct", n)} />
                <Field label="Opening words (min)" value={profiles.sections[id].openingWordsMin} onChange={(n) => setSection(id, "openingWordsMin", n)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border p-4">
        <h2 className="font-semibold text-foreground">First-draft words vs section targets</h2>
        <p className="mt-1 text-xs text-muted">
          Last 90 days, per delivery and length. Negative means the draft was short. Fix rate is
          how often total words were more than 20% off.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Delivery</th>
                <th className="py-2 pr-3 font-medium">Length</th>
                <th className="py-2 pr-3 font-medium">Meditations</th>
                <th className="py-2 pr-3 font-medium">Opening</th>
                <th className="py-2 pr-3 font-medium">Main</th>
                <th className="py-2 pr-3 font-medium">Closing</th>
                <th className="py-2 pr-3 font-medium">Whole script</th>
                <th className="py-2 pr-3 font-medium">Section fix ran</th>
                <th className="py-2 pr-3 font-medium">Script short</th>
                <th className="py-2 pr-3 font-medium">Avg plan</th>
                <th className="py-2 pr-3 font-medium">Avg write</th>
              </tr>
            </thead>
            <tbody>
              {sectionStats.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-2 text-muted">
                    No meditations written in sections yet.
                  </td>
                </tr>
              ) : (
                sectionStats.map((row) => (
                  <tr
                    key={`${row.delivery}-${row.minutes}`}
                    className="border-b border-border last:border-0 text-foreground"
                  >
                    <td className="py-2 pr-3">{DELIVERY_LABEL[row.delivery]}</td>
                    <td className="py-2 pr-3">{row.minutes} min</td>
                    <td className="py-2 pr-3">{row.count}</td>
                    <td className="py-2 pr-3">{fmtPct(row.openingPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.mainPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.closingPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.totalPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.fixRatePct)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.shortRatePct)}</td>
                    <td className="py-2 pr-3">
                      {typeof row.avgPlanMs === "number" ? `${(row.avgPlanMs / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {typeof row.avgSectionsWriteMs === "number"
                        ? `${(row.avgSectionsWriteMs / 1000).toFixed(1)}s`
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border p-4">
        <h2 className="font-semibold text-foreground">Length vs request</h2>
        <p className="mt-1 text-xs text-muted">
          Last 90 days. Fallback rates count meditations made since the length check.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Delivery</th>
                <th className="py-2 pr-3 font-medium">Meditations</th>
                <th className="py-2 pr-3 font-medium">Length vs request</th>
                <th className="py-2 pr-3 font-medium">Pauses scaled before audio</th>
                <th className="py-2 pr-3 font-medium">Revision ran</th>
                <th className="py-2 pr-3 font-medium">Pauses scaled after audio</th>
              </tr>
            </thead>
            <tbody>
              {(["casual", "guided", "open_sits"] as const).map((id) => {
                const row = lengthStats[id];
                return (
                  <tr key={id} className="border-b border-border last:border-0 text-foreground">
                    <td className="py-2 pr-3">{DELIVERY_LABEL[id]}</td>
                    <td className="py-2 pr-3">{row?.count ?? 0}</td>
                    <td className="py-2 pr-3">{fmtPct(row?.avgVsRequestPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row?.preScaledPct)}</td>
                    <td className="py-2 pr-3">{fmtPct(row?.revisedPct)}</td>
                    <td className="py-2 pr-3">{fmtPct(row?.postScaledPct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border p-4">
        <h2 className="font-semibold text-foreground">10-minute preview</h2>
        <ul className="mt-2 space-y-1 text-sm text-foreground">
          {preview.map((row) => (
            <li key={row.delivery}>
              {row.delivery === "open_sits" ? "Open sits" : row.delivery === "guided" ? "Guided" : "Casual"}
              {" · "}
              {row.words.toLocaleString()} words · {row.chars.toLocaleString()} chars ·{" "}
              {row.silenceMinutes} min silence
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
