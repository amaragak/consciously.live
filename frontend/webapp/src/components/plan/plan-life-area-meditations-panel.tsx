/**
 * Meditations created for this life area.
 */

import { Play, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLibraryPlayer } from "@/components/library-player-provider";
import {
  isPendingRow,
  pendingGenerationToRow,
  type LibraryMeditationRow,
} from "@/components/library-meditation-card";
import { MIST, activeOverviewGoal } from "@/components/plan/life-area/kit";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import { startLifeAreaMeditation } from "@/lib/life-area-card-actions";
import {
  LIFE_AREA_SOURCE_CHIP,
  LIFE_AREA_SOURCE_ORDER,
  LIFE_AREA_SOURCE_TAG,
  lifeAreaMeditationSourceFor,
  rememberLifeAreaMeditationSource,
  type LifeAreaMeditationSource,
} from "@/lib/life-area-meditation-source";
import {
  listLibraryMeditations,
  type LibraryMeditationItem,
} from "@/lib/medimade-api";
import {
  loadPendingGenerations,
  savePendingGenerations,
  PENDING_LIBRARY_GENERATIONS_CHANGED_EVENT,
} from "@/lib/pending-library-generations";
import { loadIdeateStore } from "@/lib/plan-ideate-store";

type Props = {
  lifeAreaId: string;
  lifeAreaTitle: string;
};

type SourceFilter = "all" | LifeAreaMeditationSource;

function rowKey(m: LibraryMeditationRow): string {
  return isPendingRow(m) ? m.pendingKey : m.sk || m.s3Key;
}

function sourceOf(row: LibraryMeditationRow): LifeAreaMeditationSource | null {
  if (isPendingRow(row)) return lifeAreaMeditationSourceFor(row.jobId);
  return lifeAreaMeditationSourceFor(row.jobId, row.sk, row.id);
}

export function PlanLifeAreaMeditationsPanel({
  lifeAreaId,
  lifeAreaTitle,
}: Props) {
  const navigate = useNavigate();
  const { playingS3Key, playItem, toggleCurrent } = useLibraryPlayer();
  const [rows, setRows] = useState<LibraryMeditationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<SourceFilter>("all");

  const refresh = useCallback(async () => {
    setErr(null);
    const pending = loadPendingGenerations().filter(
      (p) => p.lifeAreaId === lifeAreaId && p.status !== "failed",
    );

    let library: LibraryMeditationItem[] = [];
    if (isMedimadeSessionActive()) {
      try {
        library = await listLibraryMeditations();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn’t load meditations.");
      }
    }

    const linked = library
      .filter(
        (m) =>
          !m.archived &&
          !m.isDraft &&
          typeof m.lifeAreaId === "string" &&
          m.lifeAreaId === lifeAreaId,
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime(),
      );

    const linkedJobIds = new Set(
      linked
        .map((m) => m.jobId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );

    const pendingRows = pending.map(pendingGenerationToRow);
    const libraryTitles = new Set(
      linked.map((m) => m.title.trim().toLowerCase()),
    );
    const pendingOnly = pendingRows.filter((p) => {
      if (linkedJobIds.has(p.jobId)) return false;
      return !libraryTitles.has(p.title.trim().toLowerCase());
    });

    for (const item of linked) {
      const source = lifeAreaMeditationSourceFor(item.jobId);
      if (!source) continue;
      if (item.sk) rememberLifeAreaMeditationSource(item.sk, source);
      if (item.id) rememberLifeAreaMeditationSource(item.id, source);
    }

    setRows([...pendingOnly, ...linked]);
    setLoading(false);
  }, [lifeAreaId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    const onPending = () => void refresh();
    window.addEventListener(PENDING_LIBRARY_GENERATIONS_CHANGED_EVENT, onPending);
    window.addEventListener("focus", onPending);
    return () => {
      window.removeEventListener(
        PENDING_LIBRARY_GENERATIONS_CHANGED_EVENT,
        onPending,
      );
      window.removeEventListener("focus", onPending);
    };
  }, [refresh]);

  function removePendingJob(jobId: string) {
    const id = jobId.trim();
    if (!id) return;
    savePendingGenerations(
      loadPendingGenerations().filter((p) => p.jobId !== id),
    );
    setRows((prev) =>
      prev.filter((row) => !isPendingRow(row) || row.jobId !== id),
    );
  }

  const counts = useMemo(() => {
    const tally: Record<LifeAreaMeditationSource, number> = {
      goal: 0,
      dream: 0,
      plan: 0,
      thought: 0,
    };
    for (const row of rows) {
      const source = sourceOf(row);
      if (source) tally[source] += 1;
    }
    return tally;
  }, [rows]);

  const visible =
    filter === "all" ? rows : rows.filter((row) => sourceOf(row) === filter);

  const areaName = lifeAreaTitle.trim() || "this";

  function openNew() {
    const store = loadIdeateStore();
    const dream = store.dreams.find((d) => d.id === lifeAreaId);
    const active = dream ? activeOverviewGoal(store, dream) : null;
    const href = startLifeAreaMeditation(lifeAreaId, undefined, {
      source: "dream",
      goalId: active?.goal.id,
      goalTitle: active?.goal.title,
    });
    if (href) navigate(href);
  }

  return (
    <section className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <FilterChip
          label={`All · ${rows.length}`}
          selected={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {LIFE_AREA_SOURCE_ORDER.filter((source) => counts[source] > 0).map(
          (source) => (
            <FilterChip
              key={source}
              label={`${LIFE_AREA_SOURCE_CHIP[source]} · ${counts[source]}`}
              selected={filter === source}
              onClick={() => setFilter(source)}
            />
          ),
        )}
      </div>
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {loading ? (
        <ul
          className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4"
          aria-busy="true"
          aria-label="Loading meditations"
        >
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <div className="mm-skeleton h-[236px] w-full rounded-2xl" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <li>
            <button
              type="button"
              onClick={openNew}
              className="flex h-[236px] w-full flex-col items-center justify-center gap-3 rounded-2xl border-[1.5px] border-dashed border-accent/40 bg-accent-soft px-4 text-center"
            >
              <span
                className={`${MIST} size-14`}
                aria-hidden
              >
                <Plus className="size-5" strokeWidth={2} />
              </span>
              <span className="font-display text-xl text-foreground">
                New meditation
              </span>
              <span className="text-[13px] text-muted">
                Starts from your {areaName} dream and goals
              </span>
            </button>
          </li>
          {visible.map((row) => (
            <li key={rowKey(row)}>
              {isPendingRow(row) ? (
                <article className="flex h-[236px] flex-col overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="flex h-[130px] items-center justify-center bg-accent-soft text-sm text-muted">
                    {row.status === "failed" ? "Didn’t finish" : "Creating…"}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 px-3.5 py-3">
                    <p className="font-display text-base leading-snug text-foreground">
                      {row.title.trim() || "New meditation"}
                    </p>
                    <button
                      type="button"
                      className="mt-auto self-start text-xs font-semibold text-muted"
                      onClick={() => removePendingJob(row.jobId)}
                    >
                      Dismiss
                    </button>
                  </div>
                </article>
              ) : (
                <MeditationTile
                  item={row}
                  source={sourceOf(row)}
                  playing={playingS3Key === row.s3Key}
                  onPlay={() => {
                    if (playingS3Key === row.s3Key) toggleCurrent();
                    else playItem(row);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FilterChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-[34px] items-center rounded-full px-3.5 text-[13px] font-semibold ${
        selected
          ? "bg-foreground text-white"
          : "border border-border bg-card text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function MeditationTile({
  item,
  source,
  playing,
  onPlay,
}: {
  item: LibraryMeditationItem;
  source: LifeAreaMeditationSource | null;
  playing: boolean;
  onPlay: () => void;
}) {
  const minutes =
    item.durationSeconds && item.durationSeconds > 0
      ? Math.max(1, Math.round(item.durationSeconds / 60))
      : null;
  const kind = item.meditationStyle || item.meditationType || "Meditation";
  const meta = minutes ? `${minutes} min · ${kind}` : kind;
  return (
    <article className="flex h-[236px] flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative h-[130px] bg-accent-soft">
        {item.coverImageUrl ? (
          <img
            src={item.coverImageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : null}
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={onPlay}
          className={`${MIST} absolute bottom-2.5 left-2.5 size-9`}
        >
          <Play className="size-3.5 fill-current" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3.5 py-3">
        <p className="line-clamp-2 font-display text-base leading-snug text-foreground">
          {item.title || "Meditation"}
        </p>
        <p className="mt-auto flex items-center justify-between gap-2 text-xs text-muted">
          <span className="min-w-0 truncate">{meta}</span>
          {source ? (
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-link">
              {LIFE_AREA_SOURCE_TAG[source]}
            </span>
          ) : null}
        </p>
      </div>
    </article>
  );
}
