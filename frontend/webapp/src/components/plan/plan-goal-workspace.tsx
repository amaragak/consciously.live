import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { LifeAreaShell } from "@/components/plan/life-area/shell";
import { activeResistanceThemesForProject } from "@/lib/plan-resistance-threads";
import {
  writePlanCreateHandoff,
  type PlanCreateHandoffV2,
} from "@/lib/plan-create-handoff";
import { type PlanDream } from "@/lib/plan-dreams";
import {
  loadIdeateStore,
  saveIdeateStore,
  upsertDream,
} from "@/lib/plan-ideate-store";
import { useIdeateCloud } from "@/components/plan/ideate-cloud-provider";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import { subscribeIdeateCloud } from "@/lib/ideate-cloud";
import { Skeleton } from "@/components/ui/skeleton";

function PlanGoalWorkspaceSkeleton() {
  return (
    <div
      className="min-h-[calc(100vh-3.5rem)]"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading life area</span>
      <div className="mx-auto max-w-6xl px-4 pt-2 sm:px-6 sm:pt-3">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="flex gap-5">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-8 w-36 rounded-full" />
        </div>
        <div className="py-8">
          <Skeleton className="h-8 w-[min(100%,18rem)]" />
          <Skeleton className="mt-3 h-4 w-[min(100%,28rem)]" />
          <Skeleton className="mt-8 h-40 w-full rounded-xl" />
          <Skeleton className="mt-4 h-24 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function persistDream(next: PlanDream) {
  let store = loadIdeateStore();
  store = upsertDream(store, next);
  saveIdeateStore(store);
}

type Props = { dreamId: string };

export function PlanGoalWorkspace({ dreamId }: Props) {
  const navigate = useNavigate();
  const [dream, setDream] = useState<PlanDream | null>(null);
  const [missing, setMissing] = useState(false);
  const [storeTick, setStoreTick] = useState(0);
  const { ready: cloudReady, revision } = useIdeateCloud();

  const load = useCallback(() => {
    const d = loadIdeateStore().dreams.find((x) => x.id === dreamId);
    if (!d) {
      setMissing(true);
      setDream(null);
      return;
    }
    setMissing(false);
    setDream(d);
    setStoreTick((t) => t + 1);
  }, [dreamId]);

  useEffect(() => {
    // Guests can load from local demos immediately; signed-in waits for cloud ready
    // so we don't flash empty before pull.
    if (isMedimadeSessionActive() && !cloudReady) return;
    load();
  }, [load, cloudReady, revision]);

  useEffect(() => {
    return subscribeIdeateCloud(() => load());
  }, [load]);

  useEffect(() => {
    const onStorage = () => load();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [load]);

  const patch = useCallback((partial: Partial<PlanDream>) => {
    const current = loadIdeateStore().dreams.find((d) => d.id === dreamId);
    if (!current) return;
    const next = {
      ...current,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    persistDream(next);
    setDream(next);
  }, [dreamId]);

  function generateMeditation() {
    if (!dream) return;
    const vision = dream.visionText.trim();
    if (!vision) return;
    const store = loadIdeateStore();
    const themes = activeResistanceThemesForProject(store, dream.id);
    const handoff: PlanCreateHandoffV2 = {
      v: 2,
      goalTitle: dream.title.trim() || "My project",
      visionText: vision,
      dreamText: dream.dreamText.trim() || undefined,
      obstacleText: dream.obstacleText.trim() || undefined,
      lifeAreaId: dream.id,
      project: {
        dreamText: dream.dreamText.trim(),
        resistanceText: dream.obstacleText.trim(),
        visionText: vision,
      },
      activeResistanceThemes: themes.map((t) => ({
        category: t.category,
        sampleText: t.sampleText,
        level: t.level,
        occurrences: t.occurrences,
      })),
    };
    writePlanCreateHandoff(handoff);
    patch({ meditationsGenerated: dream.meditationsGenerated + 1 });
    navigate("/meditate/create?step=shape&fromDream=1&seed=goal");
  }

  if ((isMedimadeSessionActive() && !cloudReady) || missing || !dream) {
    if (missing) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
          <p className="text-muted">
            This project isn’t here anymore—or the link is old.
          </p>
          <Link
            to="/manifest/my"
            className="mt-6 inline-block text-sm font-semibold text-accent-link underline-offset-2 hover:underline"
          >
            Back to Manifest
          </Link>
        </div>
      );
    }
    return <PlanGoalWorkspaceSkeleton />;
  }

  void storeTick;
  const canGenerate = Boolean(dream.visionText.trim());

  return (
    <LifeAreaShell
      dream={dream}
      onPatch={patch}
      onRefresh={load}
      onGenerate={generateMeditation}
      canGenerate={canGenerate}
    />
  );
}
