"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  fetchAdminConformance,
  fetchAdminHarvesterDataset,
  fetchAdminPrepromptEntries,
  fetchAdminPrepromptEntry,
  importAdminHarvesterBundle,
  previewAdminPreprompt,
  restoreAdminPrepromptVersion,
  saveAdminPrepromptVersion,
  setAdminPrepromptPreferred,
  type ConformanceGeneration,
  type ConformanceStyleAverage,
  type HarvesterDatasetView,
  type HarvesterFingerprint,
  type HarvesterPhraseFamily,
  type HarvesterImportSummary,
  type HarvesterSkeletonSegment,
  type PrepromptEntryDetail,
  type PrepromptEntrySummary,
  type PrepromptPreview,
  type PrepromptSource,
  type PrepromptVersion,
} from "@/lib/medimade-api";

// Was: read-only list of Claude preprompts as shipped in code (single <pre> viewer).
// Now: versioned script-generation pre-prompts + style guides (repo files = defaults,
// Dynamo = append-only versions, latest = live). No model calls anywhere here.

const btn =
  "rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent-soft/50 disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary =
  "rounded-lg bg-selected px-3 py-1.5 text-xs font-medium text-on-selected transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function sourceLabel(
  source: PrepromptSource,
  who?: string,
  deployId?: string,
  bundleId?: string,
): string {
  if (source === "manual") return who ? `Manual · ${who}` : "Manual";
  if (source === "harvester") {
    return bundleId ? `Harvester · ${bundleId}` : "Harvester";
  }
  return deployId ? `Deploy · ${deployId}` : "Deploy";
}

function fmtClock(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ─── Harvester datasets (read-only) ────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  settle: "#7aa6c2",
  breath: "#5fb3a1",
  body: "#c99a6b",
  imagery: "#9b86c9",
  affirmation: "#d4a24c",
  "reflection prompt": "#c97a8e",
  instruction: "#6f8fbf",
  story: "#b0739e",
  "self-practice handover": "#4f9d69",
  return: "#8aa36b",
  close: "#a0805e",
  other: "#9a9a9a",
};

function SkeletonTimeline({
  runtime,
  segments,
}: {
  runtime: number;
  segments: HarvesterSkeletonSegment[];
}) {
  const total = Math.max(
    1,
    runtime || segments.reduce((s, g) => s + g.length, 0),
  );
  const roles = [
    ...new Set(
      segments.flatMap((g) => (g.type === "passage" ? [g.role] : [])),
    ),
  ];
  return (
    <div className="space-y-2">
      <div className="flex h-8 w-full overflow-hidden rounded-md border border-border/70 bg-background">
        {segments.map((g, i) => {
          const w = `${(g.length / total) * 100}%`;
          const title =
            g.type === "passage"
              ? `${g.role} · ${g.phase} · ${g.words} words · ${g.length.toFixed(1)}s at ${fmtClock(g.start)}`
              : `pause ${g.length.toFixed(1)}s at ${fmtClock(g.start)}`;
          return (
            <div
              key={i}
              title={title}
              style={{
                width: w,
                background:
                  g.type === "passage"
                    ? (ROLE_COLORS[g.role] ?? ROLE_COLORS.other)
                    : "transparent",
              }}
              className={g.type === "pause" ? "bg-card" : ""}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        {roles.map((r) => (
          <span key={r} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: ROLE_COLORS[r] ?? ROLE_COLORS.other }}
            />
            {r}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-border bg-card" />
          pause
        </span>
      </div>
    </div>
  );
}

const DATASET_LABELS: Record<string, string> = {
  "dataset-pacing-profiles": "Pacing profiles",
  "dataset-skeleton-library": "Skeleton library",
  "dataset-delivery-fingerprints": "Delivery fingerprints",
};

type DatasetKind = "skeletons" | "pacing" | "fingerprints";

function datasetKind(id: string): DatasetKind {
  if (id === "dataset-skeleton-library") return "skeletons";
  if (id === "dataset-delivery-fingerprints") return "fingerprints";
  return "pacing";
}

function pct(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : `${Math.round(n * 100)}%`;
}

function moveName(move: string): string {
  return move.replace(/_/g, " ");
}

function topShares(rec: Record<string, number> | undefined): string {
  const e = Object.entries(rec ?? {})
    .filter(([, v]) => typeof v === "number" && v > 0)
    .sort((a, b) => b[1] - a[1]);
  return e.length ? e.map(([k, v]) => `${moveName(k)} ${pct(v)}`).join(" · ") : "—";
}

function FamilyList({
  title,
  families,
  showOwner,
}: {
  title: string;
  families: HarvesterPhraseFamily[] | undefined;
  showOwner?: boolean;
}) {
  const list = families ?? [];
  return (
    <div className="space-y-1">
      <h5 className="text-xs font-medium">
        {title} ({list.length})
      </h5>
      {list.length ? (
        <ul className="space-y-1 text-xs">
          {list.map((f) => (
            <li key={f.id} className="rounded-md border border-border/60 px-2 py-1.5">
              <span className="font-medium">{f.name}</span>
              {showOwner && f.belongs_to?.length ? (
                <span className="text-muted"> · belongs to {f.belongs_to.join(", ")}</span>
              ) : null}
              <div className="text-muted">
                {f.examples?.length ? `“${f.examples.join("”, “")}” · ` : ""}
                {f.rate_per_1k != null ? `${f.rate_per_1k}/1k words here` : ""}
                {f.other_rate_per_1k != null ? ` vs ${f.other_rate_per_1k} elsewhere` : ""}
                {f.prevalence != null ? ` · in ${pct(f.prevalence)} of sessions` : ""}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">None.</p>
      )}
    </div>
  );
}

function FingerprintView({ fp }: { fp: HarvesterFingerprint }) {
  const ratings = ["directiveness", "energy", "certainty", "warmth", "formality"] as const;
  const moveRow = (
    label: string,
    side: HarvesterFingerprint["opening"] | undefined,
  ) => (
    <div className="space-y-1">
      <h5 className="text-xs font-medium">{label}</h5>
      <p className="text-xs">
        Usual order:{" "}
        {side?.usual_order?.length ? side.usual_order.map(moveName).join(" → ") : "—"}
      </p>
      <p className="text-xs text-muted">
        {(side?.moves ?? []).map((m) => `${moveName(m.move)} ${pct(m.share)}`).join(" · ") ||
          "—"}
      </p>
    </div>
  );
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        {fp.videos?.annotated ?? 0} sessions annotated ({fp.videos?.primary ?? 0} primary,{" "}
        {fp.videos?.secondary ?? 0} secondary)
      </p>
      <section className="space-y-2">
        <h4 className="text-xs font-medium text-muted">Moves</h4>
        {moveRow("Opening", fp.opening)}
        {moveRow("Closing", fp.closing)}
      </section>
      <section className="space-y-2">
        <h4 className="text-xs font-medium text-muted">Delivery ratings (1–5)</h4>
        <table className="text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-4 font-medium">Rating</th>
              <th className="py-1 pr-4 font-medium">Median</th>
              <th className="py-1 pr-4 font-medium">p25–p75</th>
              <th className="py-1 pr-4 font-medium">Range</th>
            </tr>
          </thead>
          <tbody>
            {ratings.map((k) => {
              const r = fp.delivery?.[k];
              return (
                <tr key={k} className="border-t border-border/60">
                  <td className="py-1 pr-4">{k}</td>
                  <td className="py-1 pr-4">{r?.median ?? "—"}</td>
                  <td className="py-1 pr-4">
                    {r?.p25 ?? "—"}–{r?.p75 ?? "—"}
                  </td>
                  <td className="py-1 pr-4">
                    {r?.min ?? "—"}–{r?.max ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs">Person: {topShares(fp.voice?.person)}</p>
        <p className="text-xs">Tense: {topShares(fp.voice?.tense)}</p>
        <p className="text-xs">Questions: {topShares(fp.voice?.question_rate)}</p>
        <p className="text-xs">
          Repetition: {topShares(fp.repetition?.level)}
          {fp.repetition?.listener_repeats != null
            ? ` · listener repeats ${pct(fp.repetition.listener_repeats)}`
            : ""}
          {fp.voice?.listener_i_statements != null
            ? ` · “I” statements ${pct(fp.voice.listener_i_statements)}`
            : ""}
        </p>
      </section>
      <section className="space-y-3">
        <h4 className="text-xs font-medium text-muted">Phrase families</h4>
        <FamilyList title="Marker (use)" families={fp.families?.marker} />
        <FamilyList title="Generic (keep rare)" families={fp.families?.generic} />
        <FamilyList title="Foreign (avoid)" families={fp.families?.foreign} showOwner />
      </section>
    </div>
  );
}

function DatasetBrowser({
  id,
  version,
}: {
  id: string;
  version: number;
}) {
  const kind = datasetKind(id);
  const isSkeletons = kind === "skeletons";
  const [view, setView] = useState<HarvesterDatasetView | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [skeletonId, setSkeletonId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAdminHarvesterDataset(id, {
      version,
      ...(style ? { style } : {}),
      ...(skeletonId ? { skeleton: skeletonId } : {}),
    })
      .then((v) => {
        if (!cancelled) setView(v);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load dataset");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, version, style, skeletonId]);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          v{version} · read-only{loading ? " · loading…" : ""}
        </h3>
        {view?.version.bundleId ? (
          <span className="text-xs text-muted">
            Bundle {view.version.bundleId}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {view ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Style</th>
                {kind === "fingerprints" ? (
                  <>
                    <th className="py-1.5 pr-3 font-medium">Sessions</th>
                    <th className="py-1.5 pr-3 font-medium">Directiveness</th>
                    <th className="py-1.5 pr-3 font-medium">Certainty</th>
                    <th className="py-1.5 pr-3 font-medium">
                      Families (marker / generic / foreign)
                    </th>
                  </>
                ) : isSkeletons ? (
                  <>
                    <th className="py-1.5 pr-3 font-medium">Skeletons</th>
                    <th className="py-1.5 pr-3 font-medium">Primary</th>
                  </>
                ) : (
                  <>
                    <th className="py-1.5 pr-3 font-medium">Videos</th>
                    <th className="py-1.5 pr-3 font-medium">Speech share</th>
                  </>
                )}
                {kind === "fingerprints" ? null : (
                  <th className="py-1.5 pr-3 font-medium">Median runtime</th>
                )}
              </tr>
            </thead>
            <tbody>
              {view.summary.map((s) => (
                <tr
                  key={s.style}
                  className={`cursor-pointer border-t border-border/60 hover:bg-accent-soft/40 ${style === s.style ? "bg-accent-soft/40" : ""}`}
                  onClick={() => {
                    setSkeletonId(null);
                    setStyle(style === s.style ? null : s.style);
                  }}
                >
                  <td className="py-1.5 pr-3">{s.meditationType}</td>
                  {kind === "fingerprints" ? (
                    <>
                      <td className="py-1.5 pr-3">{s.videos ?? 0}</td>
                      <td className="py-1.5 pr-3">{s.directivenessMedian ?? "—"}</td>
                      <td className="py-1.5 pr-3">{s.certaintyMedian ?? "—"}</td>
                      <td className="py-1.5 pr-3">
                        {s.families
                          ? `${s.families.marker} / ${s.families.generic} / ${s.families.foreign}`
                          : "—"}
                      </td>
                    </>
                  ) : isSkeletons ? (
                    <>
                      <td className="py-1.5 pr-3">{s.skeletons ?? 0}</td>
                      <td className="py-1.5 pr-3">{s.primary ?? 0}</td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 pr-3">{s.videos ?? 0}</td>
                      <td className="py-1.5 pr-3">
                        {s.speechShareMedian != null
                          ? `${Math.round(s.speechShareMedian * 100)}%`
                          : "—"}
                      </td>
                    </>
                  )}
                  {kind === "fingerprints" ? null : (
                    <td className="py-1.5 pr-3">{fmtClock(s.medianRuntimeS)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {view && style && isSkeletons && view.skeletons ? (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted">
            {view.skeletons.length} skeletons · click one for its timeline
          </h4>
          <ul className="max-h-[40vh] divide-y divide-border/60 overflow-auto rounded-lg border border-border/70">
            {[...view.skeletons]
              .sort((a, b) => a.runtime_s - b.runtime_s)
              .map((s) => (
                <li
                  key={s.id}
                  className={`cursor-pointer px-3 py-2 text-xs hover:bg-accent-soft/40 ${skeletonId === s.id ? "bg-accent-soft/40" : ""}`}
                  onClick={() => setSkeletonId(s.id)}
                >
                  <span className="font-medium">{s.title || s.id}</span>
                  <span className="text-muted">
                    {" "}
                    · {s.channel || "—"} · {fmtClock(s.runtime_s)} · {s.fit}
                    {s.views != null ? ` · ${s.views.toLocaleString()} views` : ""}
                    {s.counts?.passages != null
                      ? ` · ${s.counts.passages} passages`
                      : ""}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {view?.skeleton ? (
        <div className="space-y-1">
          <h4 className="text-xs font-medium">
            {view.skeleton.title || view.skeleton.id} ·{" "}
            {fmtClock(view.skeleton.runtime_s)}
          </h4>
          <SkeletonTimeline
            runtime={view.skeleton.runtime_s}
            segments={view.skeleton.segments}
          />
        </div>
      ) : null}

      {view && style && kind === "fingerprints" && view.fingerprint ? (
        <FingerprintView fp={view.fingerprint} />
      ) : null}

      {view && style && kind === "pacing" && view.profile ? (
        <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-background p-3 font-mono text-[12px] leading-relaxed">
          {JSON.stringify(view.profile, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

function ConformanceSection() {
  const [generations, setGenerations] = useState<ConformanceGeneration[]>([]);
  const [byStyle, setByStyle] = useState<ConformanceStyleAverage[]>([]);
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAdminConformance()
      .then((r) => {
        if (cancelled) return;
        setGenerations(r.generations);
        setByStyle(r.byStyle);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load conformance");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-xl border border-border bg-card">
      <h2 className="border-b border-border/70 px-4 py-3 font-display text-lg font-medium">
        Create conformance
      </h2>
      <div className="space-y-4 p-4">
        <p className="max-w-3xl text-xs text-muted">
          Code-only score of each Create script against its style's delivery
          fingerprint and skeleton (foreign / over-used generic phrase families,
          expected opening and closing moves, passages and roles, word counts).
          Recorded with the generation; it never blocks or rewrites a script.
          Last 60 days.
        </p>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? (
          <span className="mm-placeholder block h-4 w-48 rounded-md" aria-hidden />
        ) : !generations.length ? (
          <p className="text-sm text-muted">No scored generations yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Style</th>
                    <th className="py-1.5 pr-3 font-medium">Generations</th>
                    <th className="py-1.5 pr-3 font-medium">Average score</th>
                    <th className="py-1.5 pr-3 font-medium">No foreign families</th>
                    <th className="py-1.5 pr-3 font-medium">Expected moves present</th>
                  </tr>
                </thead>
                <tbody>
                  {byStyle.map((s) => (
                    <tr key={s.style} className="border-t border-border/60">
                      <td className="py-1.5 pr-3">{s.meditationType}</td>
                      <td className="py-1.5 pr-3">{s.count}</td>
                      <td className="py-1.5 pr-3">{s.averageScore}</td>
                      <td className="py-1.5 pr-3">{pct(s.noForeignShare)}</td>
                      <td className="py-1.5 pr-3">{pct(s.movesPresentShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">When</th>
                    <th className="py-1.5 pr-3 font-medium">Style</th>
                    <th className="py-1.5 pr-3 font-medium">Score</th>
                    <th className="py-1.5 pr-3 font-medium">Foreign</th>
                    <th className="py-1.5 pr-3 font-medium">Generic over-used</th>
                    <th className="py-1.5 pr-3 font-medium">Missing moves</th>
                    <th className="py-1.5 pr-3 font-medium">Words</th>
                    <th className="py-1.5 pr-3 font-medium">Skeleton · versions</th>
                  </tr>
                </thead>
                <tbody>
                  {generations.map((g) => {
                    const c = g.conformance;
                    const missing = c.moves
                      ? [...c.moves.opening.missing, ...c.moves.closing.missing]
                      : null;
                    const open = openJob === g.jobId;
                    return (
                      <tr
                        key={g.jobId}
                        className={`cursor-pointer border-t border-border/60 align-top hover:bg-accent-soft/40 ${open ? "bg-accent-soft/40" : ""}`}
                        onClick={() => setOpenJob(open ? null : g.jobId)}
                      >
                        <td className="py-1.5 pr-3">{fmtDate(g.at)}</td>
                        <td className="py-1.5 pr-3">
                          {g.meditationType}
                          {g.requestedMinutes != null ? ` · ${g.requestedMinutes} min` : ""}
                        </td>
                        <td className="py-1.5 pr-3 font-medium">{c.score}</td>
                        <td className="py-1.5 pr-3">
                          {c.foreign.families
                            ? c.foreign.list.map((f) => f.name).join(", ")
                            : "none"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {c.generic.overused
                            ? c.generic.list
                                .filter((f) => f.overused)
                                .map((f) => f.name)
                                .join(", ")
                            : "none"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {missing == null
                            ? "— (no fingerprint)"
                            : missing.length
                              ? missing.map(moveName).join(", ")
                              : "none"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {c.words.written} / {c.words.target}
                        </td>
                        <td className="py-1.5 pr-3 text-muted">
                          {g.skeletonSourceId ?? "profile"}
                          {g.datasetVersions?.["dataset-delivery-fingerprints"]
                            ? ` · fp v${g.datasetVersions["dataset-delivery-fingerprints"]}`
                            : ""}
                          {open ? (
                            <pre className="mt-2 max-h-[40vh] max-w-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-background p-2 font-mono text-[11px]">
                              {JSON.stringify(
                                {
                                  components: c.components,
                                  foreign: c.foreign.list,
                                  generic: c.generic.list,
                                  marker: c.marker,
                                  moves: c.moves,
                                  structure: c.structure,
                                  words: c.words,
                                  prepromptVersions: g.prepromptVersions,
                                  datasetVersions: g.datasetVersions,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ImportSummaryView({ summary }: { summary: HarvesterImportSummary }) {
  const changedGuides = summary.styleGuides.filter(
    (g) => g.action === "appended" || g.action === "created",
  );
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
      <h3 className="font-medium">
        Imported bundle {summary.bundle.id}
      </h3>
      <ul className="space-y-1 text-xs">
        <li>
          Style guides: {changedGuides.length} new version
          {changedGuides.length === 1 ? "" : "s"}
          {changedGuides.length
            ? ` (${changedGuides.map((g) => `${g.meditationType} v${g.version}`).join(", ")})`
            : " (text unchanged)"}
        </li>
        {summary.styleGuides
          .filter((g) => g.action === "skipped")
          .map((g) => (
            <li key={g.style} className="text-amber-600">
              {g.meditationType ?? g.style}: skipped — {g.error}
            </li>
          ))}
        {summary.datasets.map((d) => (
          <li key={d.id}>
            {DATASET_LABELS[d.id] ?? d.id}:{" "}
            {d.action === "unchanged" ? `unchanged (v${d.version})` : `${d.action} v${d.version}`}{" "}
            · {d.styles} styles
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Skeletons per style:{" "}
        {summary.skeletonsPerStyle
          .map((s) => `${s.meditationType} ${s.skeletons ?? 0}`)
          .join(" · ")}
      </p>
      {summary.rejected.length ? (
        <ul className="space-y-0.5 text-xs text-danger">
          {summary.rejected.map((r, i) => (
            <li key={i}>
              Rejected {r.section}/{r.key}: {r.reason}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">Nothing rejected.</p>
      )}
    </section>
  );
}

// ─── Line diff (LCS) ───────────────────────────────────────────────────────

type DiffLine = { kind: "same" | "add" | "del"; text: string };

function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split("\n");
  const B = b.split("\n");
  const n = A.length;
  const m = B.length;
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] =
        A[i] === B[j]
          ? dp[(i + 1) * w + j + 1]! + 1
          : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ kind: "same", text: A[i]! });
      i++;
      j++;
    } else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) {
      out.push({ kind: "del", text: A[i++]! });
    } else {
      out.push({ kind: "add", text: B[j++]! });
    }
  }
  while (i < n) out.push({ kind: "del", text: A[i++]! });
  while (j < m) out.push({ kind: "add", text: B[j++]! });
  return out;
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  const changed = lines.filter((l) => l.kind !== "same").length;
  return (
    <div>
      <p className="mb-2 text-[11px] text-muted">
        {changed === 0
          ? "No differences."
          : `${changed} changed line${changed === 1 ? "" : "s"} (red = left only, green = right only)`}
      </p>
      <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border/70 bg-background p-0 font-mono text-[12px] leading-relaxed">
        {lines.map((l, idx) => (
          <div
            key={idx}
            className={
              l.kind === "add"
                ? "bg-green-500/15 px-3 text-foreground"
                : l.kind === "del"
                  ? "bg-red-500/15 px-3 text-foreground"
                  : "px-3 text-muted"
            }
          >
            <span className="inline-block w-4 select-none opacity-60">
              {l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}
            </span>
            {l.text || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}

// ─── Editor with line numbers ──────────────────────────────────────────────

function LineNumberEditor({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lineCount = value.split("\n").length;
  const numbers = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1).join("\n"),
    [lineCount],
  );
  return (
    <div className="flex h-[70vh] min-h-[24rem] overflow-hidden rounded-lg border border-border bg-background">
      <div
        ref={gutterRef}
        aria-hidden
        className="select-none overflow-hidden border-r border-border/70 bg-card px-2 py-3 text-right font-mono text-[12px] leading-[1.6] text-muted"
      >
        <pre className="m-0 font-mono">{numbers}</pre>
      </div>
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (gutterRef.current) {
            gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }
        }}
        wrap="soft"
        spellCheck={false}
        className="min-w-0 flex-1 resize-none overflow-auto whitespace-pre-wrap break-words bg-transparent px-3 py-3 font-mono text-[12px] leading-[1.6] text-foreground outline-none"
      />
    </div>
  );
}

// ─── Entry page ────────────────────────────────────────────────────────────

type Viewer =
  | { mode: "view"; title: string; text: string }
  | { mode: "diff"; title: string; lines: DiffLine[] };

function EntryPage({
  id,
  onBack,
  onChanged,
  setDirty,
}: {
  id: string;
  onBack: () => void;
  onChanged: () => void;
  setDirty: (dirty: boolean) => void;
}) {
  const [detail, setDetail] = useState<PrepromptEntryDetail | null>(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [preview, setPreview] = useState<PrepromptPreview | null>(null);
  const [preferredOnly, setPreferredOnly] = useState(false);
  const [preferTarget, setPreferTarget] = useState<{
    version: number;
    label: string;
  } | null>(null);

  const load = useCallback(
    async (resetEditor: boolean) => {
      setError(null);
      const d = await fetchAdminPrepromptEntry(id);
      setDetail(d);
      if (resetEditor) setText(d.latest?.text ?? d.defaultText);
    },
    [id],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setViewer(null);
    setPreview(null);
    setNote("");
    load(true)
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load entry");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const latest = detail?.latest ?? null;
  const entry = detail?.entry ?? null;
  const seeded = Boolean(entry?.seeded && latest);
  const isDataset = entry?.group === "dataset";
  const [browseVersion, setBrowseVersion] = useState<number | null>(null);
  const dirty = seeded && !isDataset && text !== (latest?.text ?? "");
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);

  const missing = useMemo(
    () => (entry?.requiredPlaceholders ?? []).filter((p) => !text.includes(p)),
    [entry, text],
  );

  const versions = detail?.versions ?? [];
  const preferredVersions = versions.filter((v) => v.preferred);
  // Versions are newest first, so the first preferred one is the most recent.
  const latestPreferred = preferredVersions[0] ?? null;
  const shownVersions = preferredOnly ? preferredVersions : versions;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmDiscard = () =>
    !dirty || window.confirm("Discard your unsaved edits in the editor?");

  const onSave = () =>
    run(async () => {
      const saved = await saveAdminPrepromptVersion(id, {
        text,
        note: note.trim() || undefined,
      });
      setNote("");
      await load(true);
      onChanged();
      setStatus(`Saved as v${saved.version}. It is live now.`);
    });

  const onRestore = (v: PrepromptVersion) => {
    if (!confirmDiscard()) return;
    if (
      !window.confirm(
        `Restore v${v.version}? This adds a copy as the new latest version (history is kept).`,
      )
    ) {
      return;
    }
    void run(async () => {
      const restored = await restoreAdminPrepromptVersion(id, v.version);
      await load(true);
      onChanged();
      setStatus(`Restored v${v.version} as v${restored.version}. It is live now.`);
    });
  };

  const onPrefer = (v: PrepromptVersion, preferred: boolean, label?: string) =>
    run(async () => {
      await setAdminPrepromptPreferred(id, v.version, {
        preferred,
        label: label?.trim() || undefined,
      });
      setPreferTarget(null);
      await load(false);
      onChanged();
    });

  const onPreview = () =>
    run(async () => {
      setPreview(await previewAdminPreprompt(id, { text }));
    });

  const viewVersion = (v: PrepromptVersion) =>
    setViewer({ mode: "view", title: `v${v.version}`, text: v.text });

  const diffVs = (
    v: PrepromptVersion,
    other: { title: string; text: string },
  ) =>
    setViewer({
      mode: "diff",
      title: `${other.title} → v${v.version}`,
      lines: diffLines(other.text, v.text),
    });

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied. Paste into the repo file and commit it.");
    } catch {
      setError("Could not copy to the clipboard.");
    }
  };

  const downloadText = () => {
    const blob = new Blob([text.endsWith("\n") ? text : `${text}\n`], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = detail?.repoFileName ?? `${id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <span className="mm-placeholder block h-4 w-48 rounded-md" aria-hidden />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          className={btn}
          onClick={() => {
            if (confirmDiscard()) onBack();
          }}
        >
          ← All pre-prompts
        </button>
      </div>

      {entry ? (
        <header>
          <h2 className="font-display text-xl font-medium tracking-tight">
            {entry.name}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            {entry.description}
          </p>
          <p className="mt-1 text-xs text-muted">
            {isDataset ? "Imported from" : "Repo file"}:{" "}
            <code>
              {isDataset
                ? "tools/meditation-harvester/output/consciously-import.json"
                : entry.repoPath}
            </code>
            {latest ? (
              <>
                {" "}
                · Live: v{latest.version} (
                {sourceLabel(
                  latest.source,
                  latest.authorEmail,
                  latest.deployId,
                  latest.bundleId,
                )}
                , {fmtDate(latest.createdAt)})
              </>
            ) : null}
          </p>
          {latest?.replacedManualEdit ? (
            <p className="mt-2 inline-block rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs">
              Replaced a manual edit from {fmtDate(latest.replacedManualFrom)}
            </p>
          ) : null}
        </header>
      ) : null}

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {status ? <p className="text-sm text-muted">{status}</p> : null}

      {!seeded ? (
        <p className="rounded-lg border border-border bg-card p-3 text-sm">
          {isDataset
            ? "No versions yet. Use Import from harvester on the list page (or deploy the backend with the bundle in the repo)."
            : "This entry has not been synced to the database yet. Deploy the backend to create version 1 from the repo file. Showing the repo default read-only."}
        </p>
      ) : null}

      {isDataset && seeded && latest ? (
        <DatasetBrowser
          key={browseVersion ?? latest.version}
          id={id}
          version={browseVersion ?? latest.version}
        />
      ) : null}

      {isDataset ? null : (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 space-y-3">
          <LineNumberEditor
            value={text}
            onChange={setText}
            readOnly={!seeded}
          />
          {seeded ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                maxLength={500}
                className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                className={btnPrimary}
                disabled={busy || !dirty || missing.length > 0 || !text.trim()}
                onClick={() => void onSave()}
              >
                Save as new version
              </button>
              <button
                type="button"
                className={btn}
                disabled={busy || !dirty}
                onClick={() => setText(latest?.text ?? "")}
              >
                Revert edits
              </button>
              {dirty ? (
                <span className="text-xs text-amber-600">Unsaved changes</span>
              ) : null}
            </div>
          ) : null}
          {missing.length > 0 ? (
            <p className="text-sm text-danger" role="alert">
              Can’t save: required placeholder
              {missing.length > 1 ? "s" : ""} missing: {missing.join(", ")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              disabled={busy}
              onClick={() => void onPreview()}
            >
              Preview assembled prompt
            </button>
            <button type="button" className={btn} onClick={() => void copyText()}>
              Copy for repo
            </button>
            <button type="button" className={btn} onClick={downloadText}>
              Download {detail?.repoFileName ?? "file"}
            </button>
          </div>
        </section>

        <aside className="min-w-0 space-y-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <h3 className="text-sm font-medium">Placeholders</h3>
            {entry && entry.requiredPlaceholders.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs">
                {entry.requiredPlaceholders.map((p) => {
                  const present = text.includes(p);
                  const sample =
                    detail?.sampleValues?.[p.replace(/[{}]/g, "")] ?? "";
                  return (
                    <li key={p}>
                      <code className={present ? "" : "text-danger"}>{p}</code>
                      <span className="text-muted">
                        {" "}
                        required · sample “{sample}”
                        {present ? "" : " · MISSING"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">
                This entry has no placeholders; it is sent as written.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <h3 className="text-sm font-medium">Most recent preferred</h3>
            {latestPreferred ? (
              <div className="mt-2 space-y-2 text-xs">
                <p>
                  <strong>v{latestPreferred.version}</strong>
                  {latestPreferred.preferredLabel
                    ? ` · ${latestPreferred.preferredLabel}`
                    : ""}
                  <span className="text-muted">
                    {" "}
                    · {fmtDate(latestPreferred.createdAt)}
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={btn}
                    onClick={() => viewVersion(latestPreferred)}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className={btn}
                    onClick={() =>
                      diffVs(latestPreferred, {
                        title: "Editor",
                        text,
                      })
                    }
                  >
                    Diff vs editor
                  </button>
                  <button
                    type="button"
                    className={btn}
                    disabled={busy || latestPreferred.version === latest?.version}
                    onClick={() => onRestore(latestPreferred)}
                  >
                    Restore
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted">
                None yet. Mark a version preferred in History to bookmark it.
              </p>
            )}
          </div>
        </aside>
      </div>
      )}

      {preview ? (
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              Preview (sample values, no model call)
            </h3>
            <button type="button" className={btn} onClick={() => setPreview(null)}>
              Close
            </button>
          </div>
          {preview.missingPlaceholders.length > 0 ? (
            <p className="text-sm text-danger">
              Missing required placeholder
              {preview.missingPlaceholders.length > 1 ? "s" : ""}:{" "}
              {preview.missingPlaceholders.join(", ")}
            </p>
          ) : null}
          <p className="text-xs text-muted">
            Sample: 10 minute open sit, Visualization style (or this guide’s
            style), ~520 spoken words. This entry uses your editor text; other
            parts use the repo defaults.
          </p>
          {(
            [
              ["System prompt", preview.assembled.systemStable],
              ["Meditation context", preview.assembled.meditationContext],
              ["Task", preview.assembled.taskContent],
            ] as const
          ).map(([label, body]) => (
            <div key={label}>
              <h4 className="text-xs font-medium text-muted">{label}</h4>
              <pre className="mt-1 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-background p-3 font-mono text-[12px] leading-relaxed">
                {body}
              </pre>
            </div>
          ))}
        </section>
      ) : null}

      {viewer ? (
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              {viewer.mode === "view" ? "Viewing" : "Diff"} {viewer.title}
            </h3>
            <button type="button" className={btn} onClick={() => setViewer(null)}>
              Close
            </button>
          </div>
          {viewer.mode === "view" ? (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-background p-3 font-mono text-[12px] leading-relaxed">
              {viewer.text}
            </pre>
          ) : (
            <DiffView lines={viewer.lines} />
          )}
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">
            History ({versions.length} version{versions.length === 1 ? "" : "s"})
          </h3>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={preferredOnly}
              onChange={(e) => setPreferredOnly(e.target.checked)}
            />
            Preferred only
          </label>
        </div>
        <ul className="mt-3 divide-y divide-border/60">
          {shownVersions.map((v) => {
            const prev = versions.find((x) => x.version === v.version - 1);
            const isLatest = v.version === latest?.version;
            return (
              <li key={v.version} className="py-3 text-xs">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm font-medium">v{v.version}</span>
                  {isLatest ? (
                    <span className="rounded bg-selected px-1.5 py-0.5 text-[10px] text-on-selected">
                      LIVE
                    </span>
                  ) : null}
                  {v.preferred ? (
                    <span className="rounded border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px]">
                      ★ Preferred
                      {v.preferredLabel ? `: ${v.preferredLabel}` : ""}
                    </span>
                  ) : null}
                  <span>
                    {sourceLabel(
                      v.source,
                      v.authorEmail,
                      v.deployId,
                      v.bundleId,
                    )}
                  </span>
                  <span className="text-muted">{fmtDate(v.createdAt)}</span>
                  {v.restoredFromVersion != null ? (
                    <span className="text-muted">
                      restored from v{v.restoredFromVersion}
                    </span>
                  ) : null}
                  {v.replacedManualEdit ? (
                    <span className="text-amber-600">
                      Replaced a manual edit from{" "}
                      {fmtDate(v.replacedManualFrom)}
                    </span>
                  ) : null}
                </div>
                {v.note ? (
                  <p className="mt-1 text-muted">Note: {v.note}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" className={btn} onClick={() => viewVersion(v)}>
                    {isDataset ? "View summary" : "View"}
                  </button>
                  {isDataset ? (
                    <button
                      type="button"
                      className={btn}
                      disabled={(browseVersion ?? latest?.version) === v.version}
                      onClick={() => setBrowseVersion(v.version)}
                    >
                      Browse
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={btn}
                    disabled={!prev}
                    onClick={() =>
                      prev &&
                      diffVs(v, { title: `v${prev.version}`, text: prev.text })
                    }
                  >
                    Diff vs previous
                  </button>
                  <button
                    type="button"
                    className={btn}
                    disabled={
                      !latestPreferred || latestPreferred.version === v.version
                    }
                    onClick={() =>
                      latestPreferred &&
                      diffVs(v, {
                        title: `preferred v${latestPreferred.version}`,
                        text: latestPreferred.text,
                      })
                    }
                  >
                    Diff vs preferred
                  </button>
                  <button
                    type="button"
                    className={btn}
                    disabled={busy || isLatest}
                    onClick={() => onRestore(v)}
                  >
                    Restore
                  </button>
                  {v.preferred ? (
                    <button
                      type="button"
                      className={btn}
                      disabled={busy}
                      onClick={() => void onPrefer(v, false)}
                    >
                      Unmark preferred
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={btn}
                      disabled={busy}
                      onClick={() =>
                        setPreferTarget({ version: v.version, label: "" })
                      }
                    >
                      Mark preferred
                    </button>
                  )}
                </div>
                {preferTarget?.version === v.version ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      value={preferTarget.label}
                      onChange={(e) =>
                        setPreferTarget({
                          version: v.version,
                          label: e.target.value,
                        })
                      }
                      placeholder="Label (optional), e.g. calm, good pacing"
                      maxLength={120}
                      className="min-w-[14rem] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={busy}
                      onClick={() => void onPrefer(v, true, preferTarget.label)}
                    >
                      Mark preferred
                    </button>
                    <button
                      type="button"
                      className={btn}
                      onClick={() => setPreferTarget(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
          {shownVersions.length === 0 ? (
            <li className="py-3 text-sm text-muted">
              {preferredOnly ? "No preferred versions." : "No versions yet."}
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

// ─── List ──────────────────────────────────────────────────────────────────

function preferredCell(e: PrepromptEntrySummary): string {
  if (!e.seeded) return "—";
  if (e.latestPreferredVersion == null) return "No preferred version";
  if (e.latestPreferred) return `Live is preferred (v${e.latestVersion})`;
  const n = e.editsPastPreferred ?? 0;
  return `${n} edit${n === 1 ? "" : "s"} past preferred v${e.latestPreferredVersion}`;
}

function EntryTable({
  title,
  entries,
  onOpen,
}: {
  title: string;
  entries: PrepromptEntrySummary[];
  onOpen: (id: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card">
      <h2 className="border-b border-border/70 px-4 py-3 font-display text-lg font-medium">
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium">Latest</th>
              <th className="px-2 py-2 font-medium">Last changed</th>
              <th className="px-2 py-2 font-medium">Live vs preferred</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className="cursor-pointer border-t border-border/60 hover:bg-accent-soft/40"
                onClick={() => onOpen(e.id)}
              >
                <td className="px-4 py-3 align-top">
                  <button
                    type="button"
                    className="text-left font-medium underline-offset-2 hover:underline"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpen(e.id);
                    }}
                  >
                    {e.name}
                  </button>
                  <div className="mt-0.5 max-w-xl text-xs text-muted">
                    {e.description}
                  </div>
                </td>
                <td className="px-2 py-3 align-top">
                  {e.seeded ? `v${e.latestVersion}` : "—"}
                </td>
                <td className="px-2 py-3 align-top text-xs">
                  {e.seeded ? (
                    <>
                      <div>
                        {sourceLabel(
                          e.latestSource,
                          e.latestAuthorEmail,
                          e.latestDeployId,
                          e.latestBundleId,
                        )}
                      </div>
                      <div className="text-muted">
                        {fmtDate(e.latestCreatedAt)}
                      </div>
                      {e.replacedManualAt ? (
                        <div className="mt-1 text-amber-600">
                          Replaced a manual edit from{" "}
                          {fmtDate(e.replacedManualAt)}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted">
                      {e.group === "dataset" ? "Not imported yet" : "Not synced yet"}
                    </span>
                  )}
                </td>
                <td className="px-2 py-3 align-top text-xs">
                  {preferredCell(e)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AdminPrepromptsPanel() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const selectedId =
    typeof params?.id === "string" && params.id.trim() ? params.id.trim() : null;
  const [entries, setEntries] = useState<PrepromptEntrySummary[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] =
    useState<HarvesterImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirtyRef = useRef(false);

  const loadList = useCallback(async () => {
    const res = await fetchAdminPrepromptEntries();
    setEntries(res.entries);
    setSyncedAt(res.meta?.syncedAt ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadList()
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Could not load pre-prompts",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadList]);

  // Warn about unsaved editor changes when closing / reloading the tab.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const setDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);

  const openEntry = useCallback(
    (id: string) => {
      router.push(`/admin/preprompts/${encodeURIComponent(id)}`);
    },
    [router],
  );

  const backToList = useCallback(() => {
    router.push("/admin/preprompts");
    void loadList().catch(() => undefined);
  }, [router, loadList]);

  const onImportFile = async (file: File) => {
    setImporting(true);
    setError(null);
    setImportSummary(null);
    try {
      let bundle: unknown;
      try {
        bundle = JSON.parse(await file.text());
      } catch {
        throw new Error("That file is not valid JSON.");
      }
      setImportSummary(await importAdminHarvesterBundle(bundle));
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q),
    );
  }, [entries, query]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          Pre-prompts
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          The prompts and style guides that write Create scripts. Repo files
          are the defaults; every save adds a new version and the latest
          version is live. A deploy only adds a version when its repo file
          changed. Harvester imports add style-guide and dataset versions only
          when their content changed. No model calls happen on this page.
        </p>
        {syncedAt ? (
          <p className="mt-1 text-xs text-muted">
            Last deploy sync {fmtDate(syncedAt)}
          </p>
        ) : null}
      </header>

      {error && !selectedId ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {selectedId ? (
        <EntryPage
          key={selectedId}
          id={selectedId}
          setDirty={setDirty}
          onBack={backToList}
          onChanged={() => void loadList().catch(() => undefined)}
        />
      ) : loading ? (
        <span className="mm-placeholder block h-4 w-48 rounded-md" aria-hidden />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-base"
            />
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
              }}
            />
            <button
              type="button"
              className={btn}
              disabled={importing}
              onClick={() => fileRef.current?.click()}
              title="Upload tools/meditation-harvester/output/consciously-import.json"
            >
              {importing ? "Importing…" : "Import from harvester"}
            </button>
          </div>
          {importSummary ? <ImportSummaryView summary={importSummary} /> : null}
          <EntryTable
            title="Pre-prompts"
            entries={filtered.filter((e) => e.group === "preprompt")}
            onOpen={openEntry}
          />
          <EntryTable
            title="Style guides"
            entries={filtered.filter((e) => e.group === "style_guide")}
            onOpen={openEntry}
          />
          <EntryTable
            title="Harvester datasets"
            entries={filtered.filter((e) => e.group === "dataset")}
            onOpen={openEntry}
          />
          <ConformanceSection />
          {filtered.length === 0 ? (
            <p className="text-sm text-muted">No matches.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
