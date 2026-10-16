import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconEye, IconSparkles, IconWind } from "@tabler/icons-react";
import { ChevronRight, Plus } from "lucide-react";
import { LifeAreaCard } from "@/components/plan/life-area-card";
import { ManifestoFoundations } from "@/components/plan/manifesto-foundations";
import { ManifestoHeroBento } from "@/components/plan/manifesto-hero-bento";
import {
  LIGHT_ACCENT_BORDER,
  MANIFESTO_EYEBROW_CLASS,
  ManifestoHeaderAction,
  ManifestoHeaderLink,
  ManifestoSectionHeader,
} from "@/components/plan/manifesto-section";
import { MeditateGuidesGrid } from "@/components/meditate-guide-cards";
import { useGuides } from "@/content/guides";
import {
  createPlanDream,
  dreamExcerpt,
  loadPlanDreamsStore,
  savePlanDreamsStore,
  upsertPlanDream,
  type PlanDream,
} from "@/lib/plan-dreams";
import { PlanResistanceThreadBanner } from "@/components/plan/plan-resistance-thread-banner";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { globalResistanceThreads } from "@/lib/plan-resistance-threads";
import {
  loadIdeateVisionBoardStore,
  saveIdeateVisionBoardStore,
  setVisionItemFavourite,
  type VisionBoardItem,
} from "@/lib/ideate-vision-board";
import {
  getVisionMedia,
  visionMediaToObjectUrl,
} from "@/lib/ideate-vision-media";
import {
  loadIdeateReflectionQuestionsStore,
  saveIdeateReflectionQuestionsStore,
  type IdeateReflectionQuestion,
} from "@/lib/ideate-reflection-questions";
import {
  loadIdeateValuesStore,
  saveIdeateValuesStore,
  type IdeateValue,
} from "@/lib/ideate-values";
import {
  loadIdeateQuotesStore,
  saveIdeateQuotesStore,
  type IdeateQuote,
} from "@/lib/ideate-quotes";
import {
  listLibraryMeditations,
  type LibraryMeditationItem,
} from "@/lib/medimade-api";
import {
  ensureMedimadeSession,
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import { firstNameFromAccount } from "@/lib/manifesto-print";
import { resolveNarratedStoryPlacement } from "@/lib/manifesto-story-placement";
import { StoryPlacementCard } from "@/components/plan/story-placement-card";
import {
  goalSummaryForLifeArea,
  lastActivityMs,
  lifeAreaActivityMeta,
  lifeAreaHref,
  lifeAreaStepHref,
  newGoalHref,
} from "@/lib/life-area-summary";
import {
  startLifeAreaFocus,
  startLifeAreaMeditation,
} from "@/lib/life-area-card-actions";
import { hasMonthStats, manifestMonthStats } from "@/lib/manifest-month-stats";
import { addVisionBoardImageFromFile } from "@/lib/ideate-vision-upload";
import { useIdeateCloud } from "@/components/plan/ideate-cloud-provider";
import {
  ensureIdeateManifesto,
  loadStoredManifesto,
  saveIdeateManifestoManual,
} from "@/lib/ideate-manifesto";
function lifeAreaSnippet(d: PlanDream): string | null {
  const raw = (d.dreamText || d.firstThought || d.visionText || "").trim();
  if (!raw) return null;
  return dreamExcerpt(d) === "—" ? null : dreamExcerpt(d);
}

function ManifestOverviewSkeleton() {
  return (
    <div
      className="min-h-[calc(100vh-3.5rem)] pb-20"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading Manifest overview</span>
      <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8" aria-label="Vision board">
        <div className="grid gap-1.5 xl:h-[300px] xl:grid-cols-[5fr_7fr]">
          <div className="h-40 animate-pulse rounded-2xl bg-[var(--deep)] xl:h-full" />
          <div className="hidden h-[220px] animate-pulse rounded-2xl bg-accent-soft md:block xl:h-full" />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="scroll-mt-20 pb-11 pt-10">
          <div className="mb-5">
            <ManifestoSectionHeader
              title="Your life areas"
              subline="The areas of your life you want to grow."
            />
          </div>
          <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="min-w-0">
                <LifeAreaCard loading creationIndex={i} />
              </li>
            ))}
          </ul>
        </section>
      </section>
    </div>
  );
}

export function PlanHomeClient() {
  const navigate = useNavigate();
  const [dreams, setDreams] = useState<PlanDream[]>([]);
  const [visionItems, setVisionItems] = useState<VisionBoardItem[]>([]);
  const [visionTileUrls, setVisionTileUrls] = useState<Record<string, string>>(
    {},
  );
  const visionBlobUrlsRef = useRef<Record<string, string>>({});
  const [questions, setQuestions] = useState<IdeateReflectionQuestion[]>([]);
  const [values, setValues] = useState<IdeateValue[]>([]);
  const [quotes, setQuotes] = useState<IdeateQuote[]>([]);
  const [addImageBusy, setAddImageBusy] = useState(false);
  const [addImageError, setAddImageError] = useState<string | null>(null);
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const { guides: manifestGuides } = useGuides("manifest");
  const [manifesto, setManifesto] = useState<string>("");
  const [manifestoLoading, setManifestoLoading] = useState(false);
  const [editingManifesto, setEditingManifesto] = useState(false);
  const [manifestoDraft, setManifestoDraft] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDream, setNewDream] = useState("");
  const [newObstacle, setNewObstacle] = useState("");
  const [newVision, setNewVision] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [libraryItems, setLibraryItems] = useState<LibraryMeditationItem[]>([]);
  const manifestoReqRef = useRef(0);

  const refresh = useCallback(() => {
    setDreams(loadPlanDreamsStore().dreams);
    setVisionItems(loadIdeateVisionBoardStore().items);
    setQuestions(loadIdeateReflectionQuestionsStore().questions);
    setValues(loadIdeateValuesStore().values);
    setQuotes(loadIdeateQuotesStore().quotes);
  }, []);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isMedimadeSessionActive()) {
        if (!cancelled) setLibraryItems([]);
        return;
      }
      try {
        await ensureMedimadeSession();
        if (cancelled || !getMedimadeSessionJwt()) return;
        const items = await listLibraryMeditations();
        if (!cancelled) setLibraryItems(items);
      } catch {
        if (!cancelled) setLibraryItems([]);
      }
    };
    void load();
    const onSession = () => {
      void load();
    };
    window.addEventListener("medimade-session-changed", onSession);
    return () => {
      cancelled = true;
      window.removeEventListener("medimade-session-changed", onSession);
    };
  }, []);

  const resolveVisionTiles = useCallback(async (items: VisionBoardItem[]) => {
    const next: Record<string, string> = {};
    for (const item of items) {
      if (typeof item.imageUrl === "string" && item.imageUrl.trim()) {
        next[item.id] = item.imageUrl;
        continue;
      }
      if (!item.mediaId) continue;
      try {
        const rec = await getVisionMedia(item.mediaId);
        if (!rec) continue;
        next[item.id] = visionMediaToObjectUrl(rec);
      } catch {
        /* ignore */
      }
    }
    for (const u of Object.values(visionBlobUrlsRef.current)) {
      if (u.startsWith("blob:")) URL.revokeObjectURL(u);
    }
    visionBlobUrlsRef.current = next;
    setVisionTileUrls(next);
  }, []);

  const { ready: cloudReady, revision, signedIn } = useIdeateCloud();
  const sessionActive = signedIn;

  // Sidebar "Add a life area" deep-link (`/manifest/my?new=1`).
  const newLifeAreaHandledRef = useRef(false);
  /** Set when "New life area" came from a guide: open a drafted goal after create. */
  const pendingGoalDraftRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") {
      newLifeAreaHandledRef.current = false;
      return;
    }
    if (!hydrated || !cloudReady || newLifeAreaHandledRef.current) return;
    newLifeAreaHandledRef.current = true;
    setModalOpen(true);
    // Guide practice card → "New life area": continue to a drafted goal after create.
    if (params.get("then") === "goal") {
      pendingGoalDraftRef.current = params.get("goalTitle") ?? "";
    }
    params.delete("new");
    params.delete("then");
    params.delete("goalTitle");
    const qs = params.toString();
    navigate(`/manifest/my${qs ? `?${qs}` : ""}${window.location.hash}`, { replace: true });
  }, [hydrated, cloudReady, navigate]);

  // Guests never wait on the cloud provider — missing provider used to brick /manifest/my
  // on eternal "Loading…". Seed + paint from local demos immediately.
  useEffect(() => {
    if (sessionActive) return;
    refresh();
  }, [refresh, sessionActive]);

  useEffect(() => {
    if (!cloudReady) return;
    const id = requestAnimationFrame(() => refresh());
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onFocus);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onFocus);
    };
  }, [refresh, cloudReady, revision, signedIn]);

  useEffect(() => {
    void resolveVisionTiles(visionItems);
  }, [visionItems, resolveVisionTiles]);

  useEffect(() => {
    return () => {
      for (const u of Object.values(visionBlobUrlsRef.current)) {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      }
      visionBlobUrlsRef.current = {};
    };
  }, []);


  /** Add order: first created stays first (createdAt, not updatedAt). */
  const orderedDreams = useMemo(
    () =>
      [...dreams].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [dreams],
  );

  /** Palette index follows add order. */
  const lifeAreaCreationIndex = useMemo(() => {
    const map = new Map<string, number>();
    orderedDreams.forEach((d, i) => map.set(d.id, i));
    return map;
  }, [orderedDreams]);


  const valueTexts = useMemo(
    () => values.map((v) => v.text.trim()).filter(Boolean),
    [values],
  );

  const lifeAreaTitles = useMemo(
    () => orderedDreams.map((d) => d.title.trim()).filter(Boolean),
    [orderedDreams],
  );

  useEffect(() => {
    if (valueTexts.length === 0) {
      // No values to distil from — keep a statement the user wrote by hand.
      setManifesto(loadStoredManifesto() ?? "");
      setManifestoLoading(false);
      return;
    }
    const stored = loadStoredManifesto();
    if (stored) {
      setManifesto(stored);
      setManifestoLoading(false);
      return;
    }
    // Signed-in: wait for cloud pull so we don't regenerate over a stored sentence.
    if (sessionActive && !cloudReady) {
      setManifestoLoading(true);
      return;
    }
    // First-time only — never regenerate on refresh / input churn.
    const req = ++manifestoReqRef.current;
    setManifestoLoading(true);
    void ensureIdeateManifesto({
      values: valueTexts,
      lifeAreaTitles,
    }).then((text) => {
      if (manifestoReqRef.current !== req) return;
      setManifesto(text);
      setManifestoLoading(false);
    });
  }, [valueTexts, lifeAreaTitles, cloudReady, revision, sessionActive]);

  function beginEditManifesto() {
    if (!manifesto) return;
    setManifestoDraft(manifesto);
    setEditingManifesto(true);
  }

  function cancelEditManifesto() {
    setEditingManifesto(false);
    setManifestoDraft("");
  }

  /** Empty manifesto: write a statement from scratch (same editor as Edit). */
  function beginWriteManifesto() {
    setManifestoDraft(manifesto);
    setEditingManifesto(true);
  }

  function saveEditManifesto() {
    const text = saveIdeateManifestoManual({
      values: valueTexts,
      lifeAreaTitles,
      text: manifestoDraft,
    });
    if (text) setManifesto(text);
    setEditingManifesto(false);
    setManifestoDraft("");
  }

  async function onAddImageFile(file: File | null) {
    if (!file || addImageBusy) return;
    setAddImageBusy(true);
    setAddImageError(null);
    try {
      await addVisionBoardImageFromFile(file, signedIn);
      refresh();
    } catch (e) {
      setAddImageError(
        e instanceof Error ? e.message : "Could not add that image",
      );
    } finally {
      setAddImageBusy(false);
      if (addImageInputRef.current) addImageInputRef.current.value = "";
    }
  }

  function addDream(opts?: { skipReflections?: boolean }) {
    const title = newTitle.trim();
    if (!title) return;
    const store = loadPlanDreamsStore();
    const dream = createPlanDream({
      title,
      dreamText: opts?.skipReflections ? "" : newDream,
      obstacleText: opts?.skipReflections ? "" : newObstacle,
      visionText: opts?.skipReflections ? "" : newVision,
    });
    savePlanDreamsStore(upsertPlanDream(store, dream));
    setNewTitle("");
    setNewDream("");
    setNewObstacle("");
    setNewVision("");
    setModalOpen(false);
    refresh();
    const pendingGoal = pendingGoalDraftRef.current;
    if (pendingGoal !== null) {
      pendingGoalDraftRef.current = null;
      navigate(newGoalHref(dream.id, pendingGoal));
    }
  }

  function persistQuestions(next: IdeateReflectionQuestion[]) {
    saveIdeateReflectionQuestionsStore({ v: 1, questions: next });
    setQuestions(next);
  }

  function persistValues(next: IdeateValue[]) {
    saveIdeateValuesStore({ v: 1, values: next });
    setValues(next);
  }


  function persistQuotes(next: IdeateQuote[]) {
    saveIdeateQuotesStore({ v: 1, quotes: next });
    setQuotes(next);
  }


  const ideateStore = loadIdeateStore();
  const resistanceThreads = globalResistanceThreads(ideateStore);

  const storyPlacement = useMemo(
    () => resolveNarratedStoryPlacement(libraryItems),
    [libraryItems],
  );

  if (!hydrated || !cloudReady) {
    return (
      <ManifestOverviewSkeleton />
    );
  }


  const statement = manifesto.trim();
  const storyFirstName =
    firstNameFromAccount(
      getMedimadeSessionDisplayName(),
      getMedimadeSessionEmail(),
    ) || "Your";

  const monthStats = manifestMonthStats(ideateStore);
  const publishedManifestGuides = manifestGuides.filter(
    (g) => !g.status || g.status === "published",
  );
  const guidesForSection = publishedManifestGuides.slice(0, 4);
  return (
    <div className="min-h-[calc(100vh-3.5rem)] pb-20">
      <input
        ref={addImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void onAddImageFile(e.target.files?.[0] ?? null)}
      />

      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8">
      <ManifestoHeroBento
        items={visionItems}
        urls={visionTileUrls}
        statement={statement}
        loading={manifestoLoading && !statement}
        editing={editingManifesto}
        draft={manifestoDraft}
        onDraft={setManifestoDraft}
        onBeginEdit={beginEditManifesto}
        onBeginWrite={beginWriteManifesto}
        onCancelEdit={cancelEditManifesto}
        onSaveEdit={saveEditManifesto}
        onAddImage={() => addImageInputRef.current?.click()}
        addBusy={addImageBusy}
        addError={addImageError}
        onToggleFavourite={(id) => {
          const item = visionItems.find((entry) => entry.id === id);
          if (!item) return;
          const next = setVisionItemFavourite(
            loadIdeateVisionBoardStore(),
            id,
            !item.favourite,
          );
          saveIdeateVisionBoardStore(next);
          setVisionItems(next.items);
        }}
      />
      </div>

      {storyPlacement ? (
        <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          <div className="md:hidden">
            <StoryPlacementCard
              placement={storyPlacement}
              firstName={storyFirstName}
              variant="manifest"
              compact
            />
          </div>
          <div className="hidden md:block">
            <StoryPlacementCard
              placement={storyPlacement}
              firstName={storyFirstName}
              variant="manifest"
            />
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        {resistanceThreads[0] ? (
          <div className="pt-10">
            <PlanResistanceThreadBanner theme={resistanceThreads[0]} />
          </div>
        ) : null}

        {/* —— Life areas —— */}
        <section
          id="life-areas"
          className="flex scroll-mt-20 flex-col gap-5 pb-11 pt-10"
          aria-labelledby="ideate-life-areas-heading"
        >
          <ManifestoSectionHeader
            id="ideate-life-areas-heading"
            title="Your life areas"
            subline="The areas of your life you want to grow."
            right={
              <ManifestoHeaderAction onClick={() => setModalOpen(true)}>
                Add life area
              </ManifestoHeaderAction>
            }
          />
          <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-4">
            {orderedDreams.map((d) => {
              const goal = goalSummaryForLifeArea(ideateStore, d.id);
              return (
                <li key={d.id} className="flex min-w-0 flex-col [&>*]:flex-1">
                  <LifeAreaCard
                    href={lifeAreaHref(d.id)}
                    title={d.title}
                    snippet={lifeAreaSnippet(d)}
                    activity={lifeAreaActivityMeta(lastActivityMs(ideateStore, d))}
                    goal={
                      goal
                        ? {
                            title: goal.subtask.title,
                            done: goal.done,
                            total: goal.total,
                            next: goal.nextStep
                              ? {
                                  title: goal.nextStep.title,
                                  href: lifeAreaStepHref(d.id, goal.subtask.id),
                                }
                              : null,
                          }
                        : null
                    }
                    setGoalHref={newGoalHref(d.id)}
                    onFocus={
                      goal
                        ? () => navigate(startLifeAreaFocus(goal.subtask.id))
                        : undefined
                    }
                    onMeditate={
                      goal
                        ? () => {
                            const href = startLifeAreaMeditation(
                              d.id,
                              goal.subtask.title,
                            );
                            if (href) navigate(href);
                          }
                        : undefined
                    }
                    creationIndex={lifeAreaCreationIndex.get(d.id) ?? 0}
                  />
                </li>
              );
            })}

            {orderedDreams.length === 0 ? (
              <li className="min-w-0">
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  aria-label="Add new life area"
                  className={`group flex min-h-[56px] w-full cursor-pointer flex-row items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed bg-transparent text-accent-link transition-opacity hover:opacity-80 sm:aspect-square sm:min-h-0 sm:flex-col ${LIGHT_ACCENT_BORDER}`}
                >
                  <Plus aria-hidden className="size-6" strokeWidth={1.5} />
                  <span className="px-2 text-center text-[13px] font-semibold">
                    Add life area
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
        </section>
      </section>

      {/* —— This month —— */}
      {hasMonthStats(monthStats) ? (
        <section
          aria-label="This month"
          className="mx-auto mt-10 max-w-6xl px-4 sm:px-6"
        >
          <div
            className={`flex flex-col rounded-2xl border bg-accent-soft px-6 py-5 md:flex-row md:items-center ${LIGHT_ACCENT_BORDER}`}
          >
            <div className="flex flex-col gap-1 pb-4 md:min-w-[200px] md:pb-0 md:pr-5">
              <span className="text-xs font-semibold uppercase tracking-[1.6px] text-accent-link">
                This month
              </span>
              <Link
                to="/manifest/my/insights"
                className="inline-flex items-center gap-0.5 text-sm font-semibold text-accent-link underline-offset-2 hover:underline"
              >
                See insights
                <ChevronRight
                  aria-hidden
                  className="size-4"
                  strokeWidth={1.8}
                />
              </Link>
            </div>
            {(
              [
                ["Pace", monthStats.pace],
                ["Done", monthStats.done],
                ["Sentiment", monthStats.sentiment],
              ] as const
            ).flatMap(([label, stat]) =>
              stat
                ? [
                    <div
                      key={label}
                      className="flex min-w-0 flex-1 flex-col gap-1 border-t border-border py-3 md:border-l md:border-t-0 md:px-5 md:py-0"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-[1.4px] text-muted">
                        {label}
                      </span>
                      <span className="font-display text-2xl text-foreground">
                        {stat.value}
                      </span>
                      {stat.note ? (
                        <span className="text-xs text-foreground/75">
                          {stat.note}
                        </span>
                      ) : null}
                    </div>,
                  ]
                : [],
            )}
          </div>
        </section>
      ) : null}

      <ManifestoFoundations
        values={values}
        quotes={quotes}
        questions={questions}
        onValues={persistValues}
        onQuotes={persistQuotes}
        onQuestions={persistQuestions}
      />

      {/* —— Guides —— */}
      {guidesForSection.length > 0 ? (
        <section
          className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pb-12 pt-10 sm:px-6"
          aria-labelledby="manifesto-guides-heading"
        >
          <ManifestoSectionHeader
            id="manifesto-guides-heading"
            title="Guides"
            subline="Short reads on vision, goals and following through."
            right={
              <ManifestoHeaderLink to="/manifest/guides">
                All guides
              </ManifestoHeaderLink>
            }
          />
          <MeditateGuidesGrid guides={guidesForSection} area="manifest" />
        </section>
      ) : null}

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/45 p-4 backdrop-blur-[2px] sm:items-center"
          role="presentation"
          onClick={() => {
            setModalOpen(false);
            pendingGoalDraftRef.current = null;
          }}
        >
          <div
            role="dialog"
            aria-labelledby="ideate-add-dream-title"
            className="max-h-[min(92vh,40rem)] w-full max-w-lg overflow-y-auto rounded-[16px] border border-[#E5DFD0] bg-[#FBFAF6] p-6 shadow-xl dark:border-border dark:bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="ideate-add-dream-title"
              className="font-display text-xl font-medium text-[#1E2530] dark:text-foreground"
            >
              New life area
            </h2>
            <p className="mt-1 text-sm text-muted">
              Name it, and optionally seed the dream, resistance, and a lived
              moment.
            </p>

            <label className="mt-5 block text-sm font-medium text-foreground">
              Title
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Music, Health, This app"
                autoFocus
                className="mt-1.5 w-full rounded-xl border border-[#E5DFD0] bg-card px-3 py-2.5 text-sm outline-none ring-accent/30 focus:ring-2 dark:border-border"
              />
            </label>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#B8703A]/15 text-[#B8703A]">
                    <IconSparkles size={15} stroke={1.75} aria-hidden />
                  </span>
                  The dream
                </span>
                <textarea
                  value={newDream}
                  onChange={(e) => setNewDream(e.target.value)}
                  placeholder="Say it messy. No one is grading this."
                  rows={2}
                  className="mt-2 w-full resize-none rounded-xl border border-[#E5DFD0] bg-card px-3 py-2.5 text-sm leading-relaxed outline-none ring-accent/30 focus:ring-2 dark:border-border"
                />
              </label>

              <label className="block">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#A65252]/15 text-[#A65252]">
                    <IconWind size={15} stroke={1.75} aria-hidden />
                  </span>
                  What&apos;s in the way?
                  <span className="font-normal text-muted">(optional)</span>
                </span>
                <textarea
                  value={newObstacle}
                  onChange={(e) => setNewObstacle(e.target.value)}
                  placeholder="Name it without fixing it yet."
                  rows={2}
                  className="mt-2 w-full resize-none rounded-xl border border-[#E5DFD0] bg-card px-3 py-2.5 text-sm leading-relaxed outline-none ring-accent/30 focus:ring-2 dark:border-border"
                />
              </label>

              <label className="block">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#5A7A5E]/15 text-[#5A7A5E]">
                    <IconEye size={15} stroke={1.75} aria-hidden />
                  </span>
                  Describe the moment
                  <span className="font-normal text-muted">(optional)</span>
                </span>
                <textarea
                  value={newVision}
                  onChange={(e) => setNewVision(e.target.value)}
                  placeholder="A concrete scene where this has already happened — where you are, what you notice, how it feels."
                  rows={2}
                  className="mt-2 w-full resize-none rounded-xl border border-[#E5DFD0] bg-card px-3 py-2.5 text-sm leading-relaxed outline-none ring-accent/30 focus:ring-2 dark:border-border"
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={!newTitle.trim()}
                onClick={() => addDream({ skipReflections: true })}
                className="cursor-pointer text-sm font-medium text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Skip for now
              </button>
              <button
                type="button"
                disabled={!newTitle.trim()}
                onClick={() => addDream()}
                className="cursor-pointer rounded-full bg-accent-button px-5 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
