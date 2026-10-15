import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconChevronDown, IconEye, IconLoader2, IconPencil, IconRefresh, IconSparkles, IconWind } from "@tabler/icons-react";
import { BookOpen, ChevronRight, Plus } from "lucide-react";
import { LifeAreaCard } from "@/components/plan/life-area-card";
import {
  BAND_REVEAL_CLASS,
  LIGHT_ACCENT_BORDER,
  LIGHT_ACCENT_TEXT,
  MANIFESTO_EYEBROW_CLASS,
  ManifestoAddItem,
  ManifestoEditPill,
  ManifestoHeaderAction,
  ManifestoHeaderLink,
  ManifestoSectionHeader,
} from "@/components/plan/manifesto-section";
import { MeditateGuidesGrid } from "@/components/meditate-guide-cards";
import { useGuides } from "@/content/guides";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createPlanDream,
  dreamExcerpt,
  loadPlanDreamsStore,
  savePlanDreamsStore,
  upsertPlanDream,
  type PlanDream,
} from "@/lib/plan-dreams";
import { PlanResistanceThreadBanner } from "@/components/plan/plan-resistance-thread-banner";
import { PrimaryCreateButton } from "@/components/primary-create-button";
import { IdeateCollapsibleSection } from "@/components/plan/ideate-collapsible-section";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { globalResistanceThreads } from "@/lib/plan-resistance-threads";
import {
  loadIdeateVisionBoardStore,
  visionItemHasImage,
  type VisionBoardItem,
} from "@/lib/ideate-vision-board";
import {
  getVisionMedia,
  visionMediaToObjectUrl,
} from "@/lib/ideate-vision-media";
import {
  addCustomQuestion,
  addPresetQuestion,
  availablePresets,
  loadIdeateReflectionQuestionsStore,
  patchQuestionAnswer,
  removeIdeateReflectionQuestion,
  saveIdeateReflectionQuestionsStore,
  type IdeateReflectionQuestion,
} from "@/lib/ideate-reflection-questions";
import {
  addIdeateValue,
  loadIdeateValuesStore,
  patchIdeateValue,
  removeIdeateValue,
  saveIdeateValuesStore,
  type IdeateValue,
} from "@/lib/ideate-values";
import {
  addIdeateRegret,
  loadIdeateRegretsStore,
  removeIdeateRegret,
  saveIdeateRegretsStore,
  type IdeateRegret,
} from "@/lib/ideate-regrets";
import {
  addIdeateQuote,
  addIdeateQuotes,
  loadIdeateQuotesStore,
  patchIdeateQuote,
  removeIdeateQuote,
  saveIdeateQuotesStore,
  type IdeateQuote,
} from "@/lib/ideate-quotes";
import {
  fetchFamousQuotes,
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
import { writeManifestoMeditationHandoff } from "@/lib/manifesto-meditation-handoff";
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
import {
  VisionBoardMosaic,
  VISION_BOARD_EMPTY_COLORS,
  VISION_BOARD_GRID_SLOT_COUNT,
} from "@/components/plan/vision-board-mosaic";
import { useIdeateCloud } from "@/components/plan/ideate-cloud-provider";
import {
  ensureIdeateManifesto,
  loadStoredManifesto,
  saveIdeateManifestoManual,
} from "@/lib/ideate-manifesto";
import {
  loadIdeateHeroBg,
  saveIdeateHeroBg,
  getIdeateHeroBgOption,
  IDEATE_HERO_BG_OPTIONS,
  type IdeateHeroBgId,
} from "@/lib/ideate-hero-bg";

function lifeAreaSnippet(d: PlanDream): string | null {
  const raw = (d.dreamText || d.firstThought || d.visionText || "").trim();
  if (!raw) return null;
  return dreamExcerpt(d) === "—" ? null : dreamExcerpt(d);
}

function mosaicColors(items: VisionBoardItem[]): readonly string[] {
  if (items.length === 0) return VISION_BOARD_EMPTY_COLORS;
  return items.map((i) => i.color);
}

function mosaicImages(
  items: VisionBoardItem[],
  resolved: Record<string, string>,
): string[] {
  const urls: string[] = [];
  for (const item of items) {
    if (urls.length >= VISION_BOARD_GRID_SLOT_COUNT) break;
    const src =
      (typeof item.imageUrl === "string" && item.imageUrl.trim()
        ? item.imageUrl
        : null) ||
      resolved[item.id] ||
      null;
    if (src) urls.push(src);
  }
  return urls;
}

const VISION_GUIDE_SLUG = "writing-a-vision";

/** Full-bleed Manifesto band: 1px top rule, hairline bottom; `group/band` drives hover reveal. */
const BAND_CLASS =
  "group/band w-full border-t border-b-[0.5px] border-marketing-ink/15";

function formatIndex(n: number): string {
  return String(n).padStart(2, "0");
}

function BandRowsSkeleton({
  rows = 3,
  large = false,
}: {
  rows?: number;
  large?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-start gap-4">
          <Skeleton className="mt-1.5 h-3 w-6 shrink-0" />
          <Skeleton
            className={`max-w-lg flex-1 ${large ? "h-7 sm:h-8" : "h-5"}`}
            style={{ width: `${72 - i * 10}%` }}
          />
        </li>
      ))}
    </ul>
  );
}

/** Same layout chrome as the loaded page; slots use shared `loading` components. */
function ManifestOverviewSkeleton({
  heroBgClassName,
}: {
  heroBgClassName: string;
}) {
  return (
    <div
      className="min-h-[calc(100vh-3.5rem)] pb-20"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading Manifest overview</span>

      <div className="sm:hidden">
        <section
          className={`home-hero group/hero relative w-full ${heroBgClassName}`}
          aria-label="Vision board"
        >
          <div className="w-full overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <div className="w-max min-w-full">
              <VisionBoardMosaic
                layout="strip"
                loading
                colors={VISION_BOARD_EMPTY_COLORS}
                sizeClassName="w-max min-w-full"
                gapClassName="gap-1"
                radiusClassName="rounded-none"
                cellRadiusClassName="rounded-none"
              />
            </div>
          </div>
        </section>
        <div className="bg-black px-4 pb-5 pt-4">
          <div className="h-5 w-[92%] animate-pulse rounded-md bg-white/15" />
          <div className="mt-2.5 h-5 w-[70%] animate-pulse rounded-md bg-white/10" />
          <div className="mx-auto mt-4 h-10 w-44 animate-pulse rounded-full bg-white/15" />
        </div>
      </div>

      <section
        className={`home-hero home-hero--ideate-depth group/hero relative hidden w-full sm:block ${heroBgClassName}`}
        aria-label="Vision board"
      >
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-5">
          <div className="relative w-full">
            <VisionBoardMosaic
              layout="grid"
              loading
              colors={VISION_BOARD_EMPTY_COLORS}
              sizeClassName="w-full"
              gapClassName="gap-2.5 sm:gap-3"
              radiusClassName="rounded-none"
              cellRadiusClassName="rounded-md"
            />
            <div className="absolute left-1/2 top-1/2 z-[2] w-[min(100%,34rem)] -translate-x-1/2 -translate-y-1/2 px-6 text-center sm:w-[min(100%,38rem)]">
              <div className="mx-auto h-6 w-[88%] animate-pulse rounded-md bg-white/20" />
              <div className="mx-auto mt-3 h-6 w-[64%] animate-pulse rounded-md bg-white/15" />
              <div className="mx-auto mt-6 h-10 w-44 animate-pulse rounded-full bg-white/20" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <section
          className="scroll-mt-20 pb-11 pt-10"
          aria-labelledby="ideate-life-areas-heading-skel"
        >
          <div className="mb-5">
            <ManifestoSectionHeader
              id="ideate-life-areas-heading-skel"
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

      <div className="w-full">
        <div className="w-full border-b-[0.5px] border-marketing-ink/15 bg-marketing-band-ideate">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <IdeateCollapsibleSection
              variant="band"
              loading
              eyebrow="Values"
              summary=""
              collapsed={false}
              onToggle={() => {}}
            >
              <BandRowsSkeleton rows={3} large />
            </IdeateCollapsibleSection>
          </div>
        </div>

        <div className="w-full border-b-[0.5px] border-marketing-ink/15 bg-marketing-band-d">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <IdeateCollapsibleSection
              variant="band"
              loading
              eyebrow="Meaningful quotes"
              summary=""
              collapsed={false}
              onToggle={() => {}}
            >
              <BandRowsSkeleton rows={2} large />
            </IdeateCollapsibleSection>
          </div>
        </div>

        <div className="w-full border-b-[0.5px] border-marketing-ink/15 bg-marketing-band-ideate">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <IdeateCollapsibleSection
              variant="band"
              loading
              eyebrow="Questions to yourself"
              summary=""
              collapsed={false}
              onToggle={() => {}}
            >
              <BandRowsSkeleton rows={3} />
            </IdeateCollapsibleSection>
          </div>
        </div>
      </div>
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
  const [regrets, setRegrets] = useState<IdeateRegret[]>([]);
  const [quotes, setQuotes] = useState<IdeateQuote[]>([]);
  const [manageValues, setManageValues] = useState(false);
  const [manageQuotes, setManageQuotes] = useState(false);
  const [manageQuestions, setManageQuestions] = useState(false);
  const [addImageBusy, setAddImageBusy] = useState(false);
  const [addImageError, setAddImageError] = useState<string | null>(null);
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const { guides: manifestGuides } = useGuides("manifest");
  const [manifesto, setManifesto] = useState<string>("");
  const [manifestoLoading, setManifestoLoading] = useState(false);
  const [editingManifesto, setEditingManifesto] = useState(false);
  const [manifestoDraft, setManifestoDraft] = useState("");
  const [manifestoRefreshing, setManifestoRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDream, setNewDream] = useState("");
  const [newObstacle, setNewObstacle] = useState("");
  const [newVision, setNewVision] = useState("");
  const [addQuestionOpen, setAddQuestionOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [writingCustom, setWritingCustom] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [addingValue, setAddingValue] = useState(false);
  const [valueDraft, setValueDraft] = useState("");
  const [editingValueId, setEditingValueId] = useState<string | null>(null);
  const [editValueDraft, setEditValueDraft] = useState("");
  const [addingRegret, setAddingRegret] = useState(false);
  const [regretDraft, setRegretDraft] = useState("");
  const [regretCategoryDraft, setRegretCategoryDraft] = useState("");
  const [addingQuote, setAddingQuote] = useState(false);
  const [quoteAddMode, setQuoteAddMode] = useState<
    "choose" | "author" | "work" | "original"
  >("choose");
  const [quoteDraft, setQuoteDraft] = useState("");
  const [quoteAttributionDraft, setQuoteAttributionDraft] = useState("");
  const [authorQueryDraft, setAuthorQueryDraft] = useState("");
  const [authorFetchLoading, setAuthorFetchLoading] = useState(false);
  const [authorFetchError, setAuthorFetchError] = useState<string | null>(null);
  const [authorResolvedName, setAuthorResolvedName] = useState<string | null>(
    null,
  );
  const [authorFetchedQuotes, setAuthorFetchedQuotes] = useState<string[]>([]);
  const [authorSelectedQuotes, setAuthorSelectedQuotes] = useState<Set<string>>(
    () => new Set(),
  );
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [editQuoteDraft, setEditQuoteDraft] = useState("");
  const [editQuoteAttributionDraft, setEditQuoteAttributionDraft] =
    useState("");
  const [scrollHintVisible, setScrollHintVisible] = useState(true);
  const [heroBg, setHeroBg] = useState<IdeateHeroBgId>("black");
  const [heroBgPickerOpen, setHeroBgPickerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [libraryItems, setLibraryItems] = useState<LibraryMeditationItem[]>([]);
  const addPickerRef = useRef<HTMLDivElement>(null);
  const heroBgPickerRef = useRef<HTMLDivElement>(null);
  const mobileHeroBgPickerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const manifestoReqRef = useRef(0);

  const refresh = useCallback(() => {
    setDreams(loadPlanDreamsStore().dreams);
    setVisionItems(loadIdeateVisionBoardStore().items);
    setQuestions(loadIdeateReflectionQuestionsStore().questions);
    setValues(loadIdeateValuesStore().values);
    setRegrets(loadIdeateRegretsStore().regrets);
    setQuotes(loadIdeateQuotesStore().quotes);
  }, []);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    setHeroBg(loadIdeateHeroBg());
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

  useEffect(() => {
    if (!heroBgPickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (heroBgPickerRef.current?.contains(t)) return;
      if (mobileHeroBgPickerRef.current?.contains(t)) return;
      setHeroBgPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHeroBgPickerOpen(false);
    };
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [heroBgPickerOpen]);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    let scrollRoot: HTMLElement | Window = window;
    let node: HTMLElement | null = hero.parentElement;
    while (node) {
      const { overflowY } = getComputedStyle(node);
      if (overflowY === "auto" || overflowY === "scroll") {
        scrollRoot = node;
        break;
      }
      node = node.parentElement;
    }

    const onScroll = () => {
      const scrollTop =
        scrollRoot === window
          ? window.scrollY
          : (scrollRoot as HTMLElement).scrollTop;
      if (scrollTop >= hero.offsetHeight) {
        setScrollHintVisible(false);
      }
    };

    scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollRoot.removeEventListener("scroll", onScroll);
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

  useEffect(() => {
    if (!addQuestionOpen) return;
    function onDoc(e: MouseEvent) {
      if (!addPickerRef.current?.contains(e.target as Node)) {
        setAddQuestionOpen(false);
        setWritingCustom(false);
        setCustomDraft("");
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAddQuestionOpen(false);
        setWritingCustom(false);
        setCustomDraft("");
      }
    }
    // Defer so the opening click doesn't immediately close the picker.
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [addQuestionOpen]);

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

  /** Same add-order for list sections (createdAt; ignores later edits). */
  const orderedValues = useMemo(
    () =>
      [...values].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [values],
  );
  const orderedQuotes = useMemo(
    () =>
      [...quotes].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [quotes],
  );
  const orderedRegrets = useMemo(
    () =>
      [...regrets].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [regrets],
  );
  const orderedQuestions = useMemo(
    () =>
      [...questions].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [questions],
  );

  const unusedPresets = useMemo(
    () => availablePresets({ v: 1, questions }),
    [questions],
  );

  const activeQuestion = useMemo(
    () => questions.find((q) => q.id === activeQuestionId) ?? null,
    [questions, activeQuestionId],
  );

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
    if (!manifesto || manifestoRefreshing) return;
    setManifestoDraft(manifesto);
    setEditingManifesto(true);
  }

  function cancelEditManifesto() {
    setEditingManifesto(false);
    setManifestoDraft("");
  }

  /** Empty manifesto: write a statement from scratch (same editor as Edit). */
  function beginWriteManifesto() {
    if (manifestoRefreshing) return;
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

  /** "✦ Meditate on this": Create with the statement as brief + manifesto as context. */
  function meditateOnManifesto() {
    const statement = manifesto.trim();
    if (!statement) return;
    navigate(
      writeManifestoMeditationHandoff({
        statement,
        values: valueTexts,
        lifeAreaTitles,
      }),
    );
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

  function refreshManifesto() {
    if (valueTexts.length === 0 || manifestoRefreshing || editingManifesto) return;
    const req = ++manifestoReqRef.current;
    setManifestoRefreshing(true);
    void ensureIdeateManifesto({
      values: valueTexts,
      lifeAreaTitles,
      force: true,
    })
      .then((text) => {
        if (manifestoReqRef.current !== req) return;
        setManifesto(text);
      })
      .finally(() => {
        if (manifestoReqRef.current !== req) return;
        setManifestoRefreshing(false);
      });
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

  function persistRegrets(next: IdeateRegret[]) {
    saveIdeateRegretsStore({ v: 1, regrets: next });
    setRegrets(next);
  }

  function persistQuotes(next: IdeateQuote[]) {
    saveIdeateQuotesStore({ v: 1, quotes: next });
    setQuotes(next);
  }

  function handleAddValue() {
    const next = addIdeateValue({ v: 1, values }, valueDraft);
    if (next.values.length === values.length) return;
    persistValues(next.values);
    setValueDraft("");
    setAddingValue(false);
  }

  function handleAddRegret() {
    const next = addIdeateRegret(
      { v: 1, regrets },
      { statement: regretDraft, category: regretCategoryDraft },
    );
    if (next.regrets.length === regrets.length) return;
    persistRegrets(next.regrets);
    setRegretDraft("");
    setRegretCategoryDraft("");
    setAddingRegret(false);
  }

  function handleRemoveRegret(id: string) {
    persistRegrets(removeIdeateRegret({ v: 1, regrets }, id).regrets);
  }

  function handleAddQuote() {
    // Write-your-own → personal Ideate store only (never the public quote library).
    const next = addIdeateQuote(
      { v: 1, quotes },
      { text: quoteDraft, attribution: quoteAttributionDraft },
    );
    if (next.quotes.length === quotes.length) return;
    persistQuotes(next.quotes);
    resetQuoteComposer();
  }

  function resetQuoteComposer() {
    setAddingQuote(false);
    setQuoteAddMode("choose");
    setQuoteDraft("");
    setQuoteAttributionDraft("");
    setAuthorQueryDraft("");
    setAuthorFetchLoading(false);
    setAuthorFetchError(null);
    setAuthorResolvedName(null);
    setAuthorFetchedQuotes([]);
    setAuthorSelectedQuotes(new Set());
  }

  async function handleFetchSourceQuotes(kind: "author" | "work") {
    const q = authorQueryDraft.trim();
    if (q.length < 2 || authorFetchLoading) return;
    setAuthorFetchLoading(true);
    setAuthorFetchError(null);
    setAuthorFetchedQuotes([]);
    setAuthorSelectedQuotes(new Set());
    setAuthorResolvedName(null);
    try {
      const result = await fetchFamousQuotes({ kind, query: q });
      setAuthorResolvedName(result.attribution);
      setAuthorFetchedQuotes(result.quotes);
      setAuthorSelectedQuotes(new Set());
    } catch (e) {
      setAuthorFetchError(
        e instanceof Error
          ? e.message
          : kind === "work"
            ? "Could not find quotes for that work"
            : "Could not find quotes for that person",
      );
    } finally {
      setAuthorFetchLoading(false);
    }
  }

  function toggleAuthorQuote(text: string) {
    setAuthorSelectedQuotes((prev) => {
      const next = new Set(prev);
      if (next.has(text)) next.delete(text);
      else next.add(text);
      return next;
    });
  }

  function handleAddSelectedAuthorQuotes() {
    // Library text was already cached by Haiku on Find quotes; adding here only
    // copies into the user's personal Ideate list (no write-back to public DB).
    if (!authorResolvedName || authorSelectedQuotes.size === 0) return;
    const existingTexts = new Set(
      quotes.map((q) => q.text.trim().toLowerCase()),
    );
    const inputs = authorFetchedQuotes
      .filter((t) => authorSelectedQuotes.has(t))
      .filter((t) => !existingTexts.has(t.trim().toLowerCase()))
      .map((text) => ({ text, attribution: authorResolvedName }));
    if (inputs.length === 0) {
      resetQuoteComposer();
      return;
    }
    const next = addIdeateQuotes({ v: 1, quotes }, inputs);
    persistQuotes(next.quotes);
    resetQuoteComposer();
  }

  function handleRemoveQuote(id: string) {
    persistQuotes(removeIdeateQuote({ v: 1, quotes }, id).quotes);
    if (editingQuoteId === id) {
      setEditingQuoteId(null);
      setEditQuoteDraft("");
      setEditQuoteAttributionDraft("");
    }
  }

  function openEditQuote(q: IdeateQuote) {
    setEditingQuoteId(q.id);
    setEditQuoteDraft(q.text);
    setEditQuoteAttributionDraft(q.attribution ?? "");
    setAddingQuote(false);
  }

  function saveEditQuote() {
    if (!editingQuoteId) return;
    const next = patchIdeateQuote(
      { v: 1, quotes },
      editingQuoteId,
      {
        text: editQuoteDraft,
        attribution: editQuoteAttributionDraft.trim()
          ? editQuoteAttributionDraft
          : null,
      },
    );
    persistQuotes(next.quotes);
    setEditingQuoteId(null);
    setEditQuoteDraft("");
    setEditQuoteAttributionDraft("");
  }

  function exploreRegretInIdeate(regret: IdeateRegret) {
    const store = loadPlanDreamsStore();
    const match =
      store.dreams.find(
        (d) =>
          regret.category &&
          d.title.toLowerCase().includes(regret.category.toLowerCase()),
      ) ?? store.dreams[0];
    if (match) {
      navigate(
        `/manifest/goal/${encodeURIComponent(match.id)}?focus=regret&note=${encodeURIComponent(regret.statement.slice(0, 120))}`,
      );
      return;
    }
    setModalOpen(true);
    setNewTitle(regret.category?.trim() || "Regret to minimise");
    setNewDream(regret.statement);
  }

  function openEditValue(v: IdeateValue) {
    setEditingValueId(v.id);
    setEditValueDraft(v.text);
    setAddingValue(false);
    setValueDraft("");
  }

  function saveEditValue() {
    if (!editingValueId) return;
    const next = patchIdeateValue(
      { v: 1, values },
      editingValueId,
      editValueDraft,
    );
    persistValues(next.values);
    setEditingValueId(null);
    setEditValueDraft("");
  }

  function handleRemoveValue(id: string) {
    const next = removeIdeateValue({ v: 1, values }, id);
    persistValues(next.values);
    if (editingValueId === id) {
      setEditingValueId(null);
      setEditValueDraft("");
    }
  }

  function handleAddPreset(presetId: string, openAfter = false) {
    const next = addPresetQuestion({ v: 1, questions }, presetId);
    persistQuestions(next.questions);
    setAddQuestionOpen(false);
    setWritingCustom(false);
    setCustomDraft("");
    if (openAfter) {
      const added = next.questions.find((q) => q.presetId === presetId);
      if (added) openQuestion(added);
    }
  }

  function handleAddCustom() {
    const next = addCustomQuestion({ v: 1, questions }, customDraft);
    if (next.questions.length === questions.length) return;
    persistQuestions(next.questions);
    setCustomDraft("");
    setWritingCustom(false);
    setAddQuestionOpen(false);
  }

  function openQuestion(q: IdeateReflectionQuestion) {
    setActiveQuestionId(q.id);
    setDraftAnswer(q.answer);
  }

  function saveActiveAnswer() {
    if (!activeQuestionId) return;
    const next = patchQuestionAnswer(
      { v: 1, questions },
      activeQuestionId,
      draftAnswer,
    );
    persistQuestions(next.questions);
    setActiveQuestionId(null);
    setDraftAnswer("");
  }

  function handleRemoveQuestion(id: string) {
    const next = removeIdeateReflectionQuestion({ v: 1, questions }, id);
    persistQuestions(next.questions);
    if (activeQuestionId === id) {
      setActiveQuestionId(null);
      setDraftAnswer("");
    }
  }

  const ideateStore = loadIdeateStore();
  const resistanceThreads = globalResistanceThreads(ideateStore);
  const questionCells =
    orderedQuestions.length > 0
      ? orderedQuestions
      : unusedPresets.slice(0, 4).map((p) => ({
          id: `preset-preview-${p.id}`,
          text: p.text,
          description: p.description,
          answer: "",
          presetId: p.id,
          isPreview: true as const,
        }));

  if (!hydrated || !cloudReady) {
    return (
      <ManifestOverviewSkeleton
        heroBgClassName={getIdeateHeroBgOption(heroBg).className}
      />
    );
  }

  const regretsSummary =
    orderedRegrets.length === 0
      ? "No entries yet"
      : orderedRegrets[0]!.statement.trim() || "Untitled";

  const heroBgOption = getIdeateHeroBgOption(heroBg);

  const renderHeroBgPickerMenu = () =>
    heroBgPickerOpen ? (
      <div
        role="listbox"
        aria-label="Hero background"
        className="absolute right-0 top-full z-20 mt-2 grid w-[14.5rem] grid-cols-3 gap-3 rounded-xl border border-white/20 bg-black/80 p-3 shadow-lg backdrop-blur-md"
      >
        {IDEATE_HERO_BG_OPTIONS.map((opt) => {
          const selected = opt.id === heroBg;
          return (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={opt.label}
              title={opt.label}
              onClick={() => {
                setHeroBg(opt.id);
                saveIdeateHeroBg(opt.id);
                setHeroBgPickerOpen(false);
              }}
              className={`mx-auto h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-full border bg-cover bg-center transition-[box-shadow] ${
                selected
                  ? "border-transparent ring-2 ring-white ring-offset-2 ring-offset-black"
                  : "border-white/30 hover:border-white/70"
              }`}
              style={{
                backgroundColor: opt.swatch,
                backgroundImage: opt.swatchImage
                  ? `url(${opt.swatchImage})`
                  : undefined,
              }}
            />
          );
        })}
      </div>
    ) : null;

  const statement = manifesto.trim();
  const hasImages = visionItems.some(visionItemHasImage);
  /** No statement and no images: the hero becomes the empty-manifesto prompt. */
  const emptyManifesto = !statement && !hasImages && !manifestoLoading;
  const storyPlacement = useMemo(
    () => resolveNarratedStoryPlacement(libraryItems),
    [libraryItems],
  );
  const storyFirstName =
    firstNameFromAccount(
      getMedimadeSessionDisplayName(),
      getMedimadeSessionEmail(),
    ) || "Your";

  const heroImageCount = mosaicImages(visionItems, visionTileUrls).length;
  /** First empty grid slot becomes the "Add image" tile. */
  const addImageSlot =
    heroImageCount < VISION_BOARD_GRID_SLOT_COUNT ? heroImageCount : null;
  const monthStats = manifestMonthStats(ideateStore);
  const publishedManifestGuides = manifestGuides.filter(
    (g) => !g.status || g.status === "published",
  );
  const guidesForSection = publishedManifestGuides.slice(0, 4);
  const visionGuide = publishedManifestGuides.find(
    (g) => g.slug === VISION_GUIDE_SLUG,
  );

  const heroVisionBoardLink = (
    <Link
      to="/manifest/my/vision-board"
      className="inline-flex h-11 items-center justify-center gap-0.5 rounded-full border border-white/70 bg-[rgb(30_37_48/0.25)] pl-[18px] pr-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
    >
      Open vision board
      <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
    </Link>
  );
  const heroMeditateButton = statement ? (
    <button
      type="button"
      onClick={meditateOnManifesto}
      className="accent-fill-gradient inline-flex h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-[18px] text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
    >
      ✦ Meditate on this
    </button>
  ) : null;

  const renderEmptyManifestoCard = (idSuffix: string) => (
    <div className="flex w-full max-w-[440px] flex-col items-center gap-3 rounded-2xl border border-border bg-card px-7 py-6 text-center shadow-[0_8px_24px_rgb(15_27_45_/_0.08)]">
      <span className={`${MANIFESTO_EYEBROW_CLASS} text-accent-link`}>
        My manifesto
      </span>
      <p className="font-display text-2xl font-normal leading-[1.3] text-foreground">
        Write the sentence you want to grow into.
      </p>
      {editingManifesto ? (
        <form
          className="flex w-full flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            saveEditManifesto();
          }}
        >
          <label className="sr-only" htmlFor={`ideate-manifesto-edit-${idSuffix}`}>
            Edit manifesto
          </label>
          <textarea
            id={`ideate-manifesto-edit-${idSuffix}`}
            autoFocus
            rows={3}
            value={manifestoDraft}
            onChange={(e) => setManifestoDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEditManifesto();
              }
            }}
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-left font-display text-lg font-normal italic leading-[1.4] text-foreground outline-none ring-accent/30 focus:ring-2"
          />
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={cancelEditManifesto}
              className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!manifestoDraft.trim()}
              className="accent-fill-gradient cursor-pointer rounded-full px-4 py-2 text-xs font-semibold text-on-accent disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={beginWriteManifesto}
            className="accent-fill-gradient inline-flex h-[42px] cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-[18px] text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
          >
            Write my statement
          </button>
          <Link
            to="/manifest/my/vision-board"
            className="inline-flex h-[42px] items-center justify-center whitespace-nowrap rounded-full border border-border bg-card px-[18px] text-sm font-semibold text-foreground transition-colors hover:border-accent/40"
          >
            Add images
          </Link>
        </div>
      )}
      {visionGuide ? (
        <Link
          to={`/manifest/guides/${encodeURIComponent(visionGuide.slug)}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent-link transition-opacity hover:opacity-80"
        >
          <BookOpen aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
          <span>How to write a vision that pulls you forward</span>
          <ChevronRight aria-hidden className="size-4 shrink-0" strokeWidth={1.8} />
        </Link>
      ) : null}
    </div>
  );
  const emptyManifestoCardMobile = renderEmptyManifestoCard("empty-mobile");
  const emptyManifestoCard = renderEmptyManifestoCard("empty");

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

      {/* Mobile: photo strip + quote on plain page bg (no text overlay on photos) */}
      <div className="sm:hidden">
        <section
          className={`group/hero relative w-full ${
            emptyManifesto
              ? "bg-accent-soft py-3"
              : `home-hero ${heroBgOption.className}`
          }`}
          aria-label="Vision board"
        >
          <div className="w-full overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <div
              className={emptyManifesto ? "w-max min-w-full px-4" : "w-max min-w-full"}
              style={
                emptyManifesto
                  ? undefined
                  : {
                      filter:
                        "grayscale(32%) sepia(22%) contrast(0.88) brightness(0.82) saturate(0.7)",
                    }
              }
            >
              <VisionBoardMosaic
                layout="strip"
                colors={mosaicColors(visionItems)}
                images={mosaicImages(visionItems, visionTileUrls)}
                sizeClassName="w-max min-w-full"
                gapClassName="gap-1"
                radiusClassName="rounded-none"
                cellRadiusClassName={emptyManifesto ? "rounded-xl" : "rounded-none"}
                dashedSlots={emptyManifesto}
              />
            </div>
          </div>
          {!emptyManifesto ? (
            <div
              ref={mobileHeroBgPickerRef}
              className="home-hero-chrome absolute right-3 top-2.5 z-[5]"
            >
              <button
                type="button"
                onClick={() => setHeroBgPickerOpen((o) => !o)}
                aria-label="Change hero background"
                aria-expanded={heroBgPickerOpen}
                title="Background"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/50 bg-black/60 text-white opacity-90 shadow-[0_2px_10px_rgb(0_0_0_/_0.35)] backdrop-blur-sm transition-[opacity,colors] hover:border-white hover:bg-black/80 hover:text-white"
              >
                <IconPencil size={15} stroke={1.75} aria-hidden />
              </button>
              {renderHeroBgPickerMenu()}
            </div>
          ) : null}
        </section>

        {emptyManifesto ? (
          <div className="flex justify-center px-4 py-5">{emptyManifestoCardMobile}</div>
        ) : (
        <div className="bg-black px-4 pb-5 pt-4">
          <span
            className={`mb-2 block text-center ${MANIFESTO_EYEBROW_CLASS} ${LIGHT_ACCENT_TEXT}`}
          >
            My manifesto
          </span>
          {!statement && !manifestoLoading ? (
            <p className="font-display text-[18px] font-normal italic leading-[1.4] text-white/80">
              Add a few values below — we&apos;ll distil what you stand for into
              one sentence.
            </p>
          ) : manifestoLoading && !manifesto ? (
            <p className="font-display text-[18px] font-normal italic leading-[1.4] text-white/80">
              Distilling…
            </p>
          ) : editingManifesto ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveEditManifesto();
              }}
            >
              <label className="sr-only" htmlFor="ideate-manifesto-edit-mobile">
                Edit manifesto
              </label>
              <textarea
                id="ideate-manifesto-edit-mobile"
                autoFocus
                rows={4}
                value={manifestoDraft}
                onChange={(e) => setManifestoDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEditManifesto();
                  }
                }}
                className="w-full resize-none rounded-xl border border-white/35 bg-black/35 px-3 py-2.5 text-left font-display text-[18px] font-normal italic leading-[1.4] text-white outline-none ring-white/25 focus:ring-2"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelEditManifesto}
                  className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!manifestoDraft.trim()}
                  className="cursor-pointer rounded-full border border-white bg-black px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </form>
          ) : (
            <div className="group/manifesto relative">
              <p
                className={`font-display text-[18px] font-normal italic leading-[1.4] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.25)] transition-opacity ${
                  manifestoRefreshing ? "opacity-60" : ""
                }`}
              >
                &ldquo;{manifesto}&rdquo;
              </p>
              <div className="absolute -right-3 -top-[22px] z-[1] flex items-center gap-1">
                <button
                  type="button"
                  onClick={beginEditManifesto}
                  aria-label="Edit manifesto"
                  title="Edit"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/40 bg-black/55 text-white/90 backdrop-blur-sm transition-colors hover:border-white hover:bg-black/75 hover:text-white"
                >
                  <IconPencil size={14} stroke={1.75} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={refreshManifesto}
                  disabled={manifestoRefreshing}
                  aria-label="Regenerate manifesto"
                  title="Regenerate"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/40 bg-black/55 text-white/90 backdrop-blur-sm transition-colors hover:border-white hover:bg-black/75 hover:text-white disabled:cursor-wait disabled:opacity-70"
                >
                  {manifestoRefreshing ? (
                    <IconLoader2
                      size={14}
                      stroke={1.75}
                      className="animate-spin"
                      aria-hidden
                    />
                  ) : (
                    <IconRefresh size={14} stroke={1.75} aria-hidden />
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            {heroVisionBoardLink}
            {heroMeditateButton}
          </div>
        </div>
        )}
      </div>

      {/* Desktop / tablet: image grid with the manifesto laid over it */}
      <section
        ref={heroRef}
        className={`group/hero relative hidden w-full sm:block ${
          emptyManifesto
            ? "bg-accent-soft"
            : `home-hero home-hero--ideate-depth ${heroBgOption.className}`
        }`}
        aria-label="Vision board"
      >
        {!emptyManifesto ? (
          <div
            ref={heroBgPickerRef}
            className="home-hero-chrome absolute right-3 top-3 z-[5] sm:right-5 sm:top-4"
          >
            <button
              type="button"
              onClick={() => setHeroBgPickerOpen((o) => !o)}
              aria-label="Change hero background"
              aria-expanded={heroBgPickerOpen}
              title="Background"
              className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/50 bg-black/60 text-white shadow-[0_2px_10px_rgb(0_0_0_/_0.35)] backdrop-blur-sm transition-[opacity,colors] hover:border-white hover:bg-black/80 hover:text-white ${
                heroBgPickerOpen
                  ? "opacity-100"
                  : "opacity-0 group-hover/hero:opacity-100 group-focus-within/hero:opacity-100 max-md:opacity-70"
              }`}
            >
              <IconPencil size={15} stroke={1.75} aria-hidden />
            </button>
            {renderHeroBgPickerMenu()}
          </div>
        ) : null}
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-5">
          <div className="relative w-full">
            <div
              className="w-full"
              style={
                emptyManifesto
                  ? undefined
                  : {
                      filter:
                        "grayscale(32%) sepia(22%) contrast(0.88) brightness(0.82) saturate(0.7)",
                    }
              }
            >
              <VisionBoardMosaic
                layout="grid"
                colors={mosaicColors(visionItems)}
                images={mosaicImages(visionItems, visionTileUrls)}
                sizeClassName="w-full"
                gapClassName="gap-2.5 sm:gap-3"
                radiusClassName="rounded-none"
                cellRadiusClassName={
                  emptyManifesto
                    ? "rounded-xl"
                    : "rounded-md shadow-[0_12px_32px_rgb(30_37_48_/_0.42),0_4px_12px_rgb(30_37_48_/_0.28)]"
                }
                dashedSlots={emptyManifesto}
              />
            </div>

            {emptyManifesto ? (
              <div className="absolute inset-0 z-[2] flex items-center justify-center px-6">
                {emptyManifestoCard}
              </div>
            ) : (
              <>
                {/* Navy tint over the whole grid + a radial shade behind the text */}
                <div
                  className="pointer-events-none absolute inset-0 z-[1] rounded-md"
                  style={{
                    background:
                      "linear-gradient(rgb(30 37 48 / 0.3), rgb(30 37 48 / 0.3)), radial-gradient(ellipse 60% 65% at 50% 50%, rgb(30 37 48 / 0.62), rgb(30 37 48 / 0) 75%)",
                  }}
                  aria-hidden
                />

                {/* First empty slot: "Add image" tile, above the overlay */}
                {addImageSlot !== null ? (
                  <div className="pointer-events-none absolute inset-0 z-[2] grid grid-cols-4 gap-2.5 sm:gap-3">
                    {Array.from({ length: VISION_BOARD_GRID_SLOT_COUNT }, (_, i) =>
                      i === addImageSlot ? (
                        <button
                          key={i}
                          type="button"
                          onClick={() => addImageInputRef.current?.click()}
                          disabled={addImageBusy}
                          className={`pointer-events-auto flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed bg-background text-[13px] font-semibold text-accent-link transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70 ${LIGHT_ACCENT_BORDER}`}
                        >
                          {addImageBusy ? (
                            <IconLoader2
                              size={18}
                              stroke={1.75}
                              className="animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <Plus aria-hidden className="size-[18px]" strokeWidth={1.75} />
                          )}
                          {addImageBusy ? "Adding…" : "Add image"}
                        </button>
                      ) : (
                        <div key={i} className="aspect-square w-full" aria-hidden />
                      ),
                    )}
                  </div>
                ) : null}
                {addImageError ? (
                  <p
                    role="alert"
                    className="absolute bottom-2 left-3 z-[3] rounded-md bg-black/60 px-2 py-1 text-xs text-white"
                  >
                    {addImageError}
                  </p>
                ) : null}

                <div className="pointer-events-none absolute left-1/2 top-1/2 z-[3] flex w-[min(100%,44rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[22px] px-6 text-center">
                  <span className={`${MANIFESTO_EYEBROW_CLASS} ${LIGHT_ACCENT_TEXT}`}>
                    My manifesto
                  </span>
                  {!statement && !manifestoLoading ? (
                    <p className="font-display text-[23px] font-normal italic leading-[1.45] text-white/80">
                      Add a few values below — we&apos;ll distil what you stand
                      for into one sentence.
                    </p>
                  ) : manifestoLoading && !manifesto ? (
                    <p className="font-display text-[23px] font-normal italic leading-[1.45] text-white/80">
                      Distilling…
                    </p>
                  ) : editingManifesto ? (
                    <div className="pointer-events-auto w-full">
                <form
                  className="flex flex-col items-center gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEditManifesto();
                  }}
                >
                  <label className="sr-only" htmlFor="ideate-manifesto-edit">
                    Edit manifesto
                  </label>
                  <textarea
                    id="ideate-manifesto-edit"
                    autoFocus
                    rows={3}
                    value={manifestoDraft}
                    onChange={(e) => setManifestoDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEditManifesto();
                      }
                    }}
                    className="w-full resize-none rounded-xl border border-white/35 bg-black/35 px-3 py-2.5 text-center font-display text-[23px] font-normal italic leading-[1.45] text-white outline-none ring-white/25 focus:ring-2"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelEditManifesto}
                      className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!manifestoDraft.trim()}
                      className="cursor-pointer rounded-full border border-white bg-black px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </form>
                    </div>
                  ) : (
                    <div className="group/manifesto pointer-events-auto relative">
                      <p
                        className={`font-display text-[23px] font-normal italic leading-[1.45] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.25)] transition-opacity ${
                          manifestoRefreshing ? "opacity-60" : ""
                        }`}
                      >
                        &ldquo;{manifesto}&rdquo;
                      </p>
                      <div className="pointer-events-none absolute -right-1 -top-1 flex items-center gap-1 opacity-0 transition-opacity group-hover/manifesto:pointer-events-auto group-hover/manifesto:opacity-100 group-focus-within/manifesto:pointer-events-auto group-focus-within/manifesto:opacity-100 sm:-right-2 sm:-top-2">
                        <button
                          type="button"
                          onClick={beginEditManifesto}
                          aria-label="Edit manifesto"
                          title="Edit"
                          className="pointer-events-auto inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/40 bg-black/55 text-white/90 backdrop-blur-sm transition-colors hover:border-white hover:bg-black/75 hover:text-white"
                        >
                          <IconPencil size={14} stroke={1.75} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={refreshManifesto}
                          disabled={manifestoRefreshing}
                          aria-label="Regenerate manifesto"
                          title="Regenerate"
                          className="pointer-events-auto inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/40 bg-black/55 text-white/90 backdrop-blur-sm transition-colors hover:border-white hover:bg-black/75 hover:text-white disabled:cursor-wait disabled:opacity-70"
                        >
                          {manifestoRefreshing ? (
                            <IconLoader2
                              size={14}
                              stroke={1.75}
                              className="animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <IconRefresh size={14} stroke={1.75} aria-hidden />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2.5">
                    {heroVisionBoardLink}
                    {heroMeditateButton}
                  </div>
                </div>

                <div
                  className="absolute bottom-3 left-1/2 z-[1] -translate-x-1/2 transition-opacity duration-300"
                  style={{ opacity: scrollHintVisible ? 1 : 0 }}
                  aria-hidden={!scrollHintVisible}
                >
                  <IconChevronDown
                    size={18}
                    stroke={1.75}
                    className="ideate-scroll-hint text-white/70"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </section>

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

      {/* Values → onwards: alternating full-bleed marketing bands */}
      <div className="w-full">
        <div className={`${BAND_CLASS} bg-marketing-band-ideate`}>
          <section
            className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-[52px] pt-12 sm:px-6"
            aria-labelledby="manifesto-values-heading"
          >
            {/* —— Values —— */}
            <ManifestoSectionHeader
              id="manifesto-values-heading"
              title="Values"
              subline="What you want your choices to come from."
              right={
                values.length > 0 ? (
                  <ManifestoEditPill
                    label="values"
                    active={manageValues}
                    onClick={() => setManageValues((v) => !v)}
                  />
                ) : null
              }
            />
            {values.length === 0 ? (
              <p className="-mt-3 max-w-2xl font-sans text-[13px] font-normal italic leading-relaxed text-muted">
                Principles you want to live by — name a few that feel true.
              </p>
            ) : null}
            <ul className="grid grid-cols-1 gap-x-12 gap-y-3.5 md:grid-cols-2">
              {orderedValues.map((v, i) => (
                <li key={v.id} className="min-w-0">
                  {editingValueId === v.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveEditValue();
                      }}
                      className="flex flex-col gap-2"
                    >
                      <label
                        className="sr-only"
                        htmlFor={`ideate-value-edit-${v.id}`}
                      >
                        Edit value
                      </label>
                      <input
                        id={`ideate-value-edit-${v.id}`}
                        autoFocus
                        value={editValueDraft}
                        onChange={(e) => setEditValueDraft(e.target.value)}
                        maxLength={120}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-display text-xl outline-none ring-accent/30 focus:ring-2 sm:text-2xl"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingValueId(null);
                            setEditValueDraft("");
                          }}
                          className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!editValueDraft.trim()}
                          className="rounded-full accent-fill-gradient px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-40"
                        >
                          Save
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-baseline gap-4">
                      <span className="w-[22px] shrink-0 text-[13px] font-semibold tabular-nums text-accent">
                        {formatIndex(i + 1)}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEditValue(v)}
                        className="min-w-0 cursor-pointer text-left font-display text-[28px] font-normal leading-[1.2] text-foreground transition-opacity hover:opacity-80 md:text-[34px]"
                      >
                        {v.text}
                      </button>
                      {manageValues ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveValue(v.id)}
                          className="shrink-0 cursor-pointer font-sans text-xs text-muted transition-colors hover:text-foreground"
                          aria-label={`Remove ${v.text}`}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
              <li className="min-w-0">
                {addingValue ? (
                  <div className="pl-[38px]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddValue();
              }}
              className="flex flex-col gap-2"
            >
              <label className="sr-only" htmlFor="ideate-value-new">
                New value
              </label>
              <input
                id="ideate-value-new"
                autoFocus
                value={valueDraft}
                onChange={(e) => setValueDraft(e.target.value)}
                placeholder="e.g. Honesty, Presence, Craft"
                maxLength={120}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-display text-xl outline-none ring-accent/30 focus:ring-2"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddingValue(false);
                    setValueDraft("");
                  }}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!valueDraft.trim()}
                  className="rounded-full accent-fill-gradient px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </form>
                  </div>
                ) : (
                  <ManifestoAddItem
                    empty={values.length === 0}
                    indentClassName="pl-[38px]"
                    onClick={() => {
                      setAddingValue(true);
                      setEditingValueId(null);
                      setEditValueDraft("");
                    }}
                  >
                    Add a value
                  </ManifestoAddItem>
                )}
              </li>
            </ul>
          </section>
        </div>

        <div className={`${BAND_CLASS} bg-marketing-band-d`}>
          <section
            className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-[52px] pt-12 sm:px-6"
            aria-labelledby="manifesto-quotes-heading"
          >
            {/* —— Quotes —— */}
            <ManifestoSectionHeader
              id="manifesto-quotes-heading"
              title="Quotes"
              subline="Words you want to keep close."
              right={
                quotes.length > 0 ? (
                  <ManifestoEditPill
                    label="quotes"
                    active={manageQuotes}
                    onClick={() => setManageQuotes((v) => !v)}
                  />
                ) : null
              }
            />
            {quotes.length === 0 && !addingQuote ? (
              <p className="-mt-3 max-w-2xl font-sans text-[13px] font-normal italic leading-relaxed text-muted">
                Lines that keep you oriented — from thinkers you admire, or your
                own.
              </p>
            ) : null}
            <ul className="grid grid-cols-1 gap-x-14 gap-y-9 md:grid-cols-2">
              {orderedQuotes.map((q) => (
                <li key={q.id} className="min-w-0">
                  {editingQuoteId === q.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveEditQuote();
                      }}
                      className="flex flex-col gap-2"
                    >
                      <label
                        className="sr-only"
                        htmlFor={`ideate-quote-edit-${q.id}`}
                      >
                        Edit quote
                      </label>
                      <textarea
                        id={`ideate-quote-edit-${q.id}`}
                        autoFocus
                        value={editQuoteDraft}
                        onChange={(e) => setEditQuoteDraft(e.target.value)}
                        rows={3}
                        maxLength={400}
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-left font-display text-lg outline-none ring-accent/30 focus:ring-2 sm:text-xl"
                      />
                      <label
                        className="sr-only"
                        htmlFor={`ideate-quote-attr-edit-${q.id}`}
                      >
                        Attribution
                      </label>
                      <input
                        id={`ideate-quote-attr-edit-${q.id}`}
                        value={editQuoteAttributionDraft}
                        onChange={(e) =>
                          setEditQuoteAttributionDraft(e.target.value)
                        }
                        placeholder="Attribution (optional)"
                        maxLength={80}
                        className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-left font-sans text-sm outline-none ring-accent/30 focus:ring-2"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingQuoteId(null);
                            setEditQuoteDraft("");
                            setEditQuoteAttributionDraft("");
                          }}
                          className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!editQuoteDraft.trim()}
                          className="rounded-full accent-fill-gradient px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-40"
                        >
                          Save
                        </button>
                      </div>
                    </form>
                  ) : (
                    <figure className="m-0 flex flex-col gap-2.5">
                      <button
                        type="button"
                        onClick={() => openEditQuote(q)}
                        className="w-full cursor-pointer text-left transition-opacity hover:opacity-80"
                      >
                        <span className="block font-display text-[21px] font-normal italic leading-[1.4] text-foreground md:text-[26px]">
                          &ldquo;{q.text}&rdquo;
                        </span>
                      </button>
                      {q.attribution?.trim() ? (
                        <figcaption className="text-sm font-semibold text-accent-link">
                          — {q.attribution.trim()}
                        </figcaption>
                      ) : null}
                      {manageQuotes ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveQuote(q.id)}
                          className="w-fit cursor-pointer font-sans text-xs text-muted transition-colors hover:text-foreground"
                          aria-label="Remove quote"
                        >
                          Remove
                        </button>
                      ) : null}
                    </figure>
                  )}
                </li>
              ))}
              <li className={`min-w-0 ${addingQuote ? "md:col-span-2" : ""}`}>
                {addingQuote ? (
            <div className="flex flex-col gap-3">
              {quoteAddMode === "choose" ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => setQuoteAddMode("author")}
                    className="cursor-pointer rounded-full border border-border px-4 py-2 font-sans text-sm font-medium text-foreground transition-colors hover:border-gold/60 hover:bg-accent-soft/30"
                  >
                    From a thinker
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuoteAddMode("work")}
                    className="cursor-pointer rounded-full border border-border px-4 py-2 font-sans text-sm font-medium text-foreground transition-colors hover:border-gold/60 hover:bg-accent-soft/30"
                  >
                    From a work
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuoteAddMode("original")}
                    className="cursor-pointer rounded-full border border-border px-4 py-2 font-sans text-sm font-medium text-foreground transition-colors hover:border-gold/60 hover:bg-accent-soft/30"
                  >
                    Write your own
                  </button>
                  <button
                    type="button"
                    onClick={resetQuoteComposer}
                    className="cursor-pointer rounded-full px-3 py-2 font-sans text-xs font-medium text-muted hover:text-foreground sm:ml-1"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              {quoteAddMode === "author" || quoteAddMode === "work" ? (
                <div className="flex flex-col gap-3">
                  <p className="max-w-xl font-sans text-[13px] text-muted">
                    {quoteAddMode === "work"
                      ? "Type a book, scripture, poem, play, or film — we'll find ten well-known lines."
                      : "Type a famous person — we'll find ten well-known lines."}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleFetchSourceQuotes(quoteAddMode);
                    }}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center"
                  >
                    <label className="sr-only" htmlFor="ideate-quote-source">
                      {quoteAddMode === "work" ? "Work title" : "Famous person"}
                    </label>
                    <input
                      id="ideate-quote-source"
                      autoFocus
                      value={authorQueryDraft}
                      onChange={(e) => setAuthorQueryDraft(e.target.value)}
                      placeholder={
                        quoteAddMode === "work"
                          ? "e.g. On the Road, the Bible, Meditations…"
                          : "e.g. Alan Watts, Maya Angelou…"
                      }
                      maxLength={80}
                      disabled={authorFetchLoading}
                      className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm outline-none ring-accent/30 focus:ring-2 disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={
                        authorQueryDraft.trim().length < 2 || authorFetchLoading
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-full accent-fill-gradient px-4 py-2 text-xs font-medium text-on-accent disabled:opacity-40"
                    >
                      {authorFetchLoading ? (
                        <>
                          <IconLoader2
                            size={14}
                            stroke={1.75}
                            className="animate-spin"
                            aria-hidden
                          />
                          Finding…
                        </>
                      ) : (
                        "Find quotes"
                      )}
                    </button>
                  </form>
                  {authorFetchError ? (
                    <p className="font-sans text-sm text-red-700/80 dark:text-red-300/90">
                      {authorFetchError}
                    </p>
                  ) : null}
                  {authorResolvedName && authorFetchedQuotes.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      <p className="font-sans text-[13px] text-muted">
                        Quotes from{" "}
                        <span className="font-medium text-foreground">
                          {authorResolvedName}
                        </span>
                        . Pick the ones to keep.
                      </p>
                      <ul className="flex flex-col gap-2">
                        {authorFetchedQuotes.map((text) => {
                          const selected = authorSelectedQuotes.has(text);
                          return (
                            <li key={text}>
                              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 px-3 py-2.5 transition-colors hover:border-gold/45">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleAuthorQuote(text)}
                                  className="mt-1.5 shrink-0"
                                />
                                <span className="min-w-0 font-display text-[17px] font-normal italic leading-[1.4] text-foreground">
                                  &ldquo;{text}&rdquo;
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setQuoteAddMode("choose");
                            setAuthorFetchedQuotes([]);
                            setAuthorSelectedQuotes(new Set());
                            setAuthorResolvedName(null);
                            setAuthorFetchError(null);
                            setAuthorQueryDraft("");
                          }}
                          className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={handleAddSelectedAuthorQuotes}
                          disabled={authorSelectedQuotes.size === 0}
                          className="rounded-full accent-fill-gradient px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-40"
                        >
                          Add selected ({authorSelectedQuotes.size})
                        </button>
                      </div>
                    </div>
                  ) : !authorFetchLoading ? (
                    <button
                      type="button"
                      onClick={() => setQuoteAddMode("choose")}
                      className="self-start rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
                    >
                      Back
                    </button>
                  ) : null}
                </div>
              ) : null}

              {quoteAddMode === "original" ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddQuote();
                  }}
                  className="flex flex-col gap-2"
                >
                  <label className="sr-only" htmlFor="ideate-quote-new">
                    Quote
                  </label>
                  <textarea
                    id="ideate-quote-new"
                    autoFocus
                    value={quoteDraft}
                    onChange={(e) => setQuoteDraft(e.target.value)}
                    placeholder="A line that keeps you oriented…"
                    rows={3}
                    maxLength={400}
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 font-display text-xl outline-none ring-accent/30 focus:ring-2"
                  />
                  <label className="sr-only" htmlFor="ideate-quote-attr">
                    Attribution
                  </label>
                  <input
                    id="ideate-quote-attr"
                    value={quoteAttributionDraft}
                    onChange={(e) => setQuoteAttributionDraft(e.target.value)}
                    placeholder="Attribution (optional)"
                    maxLength={80}
                    className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm outline-none ring-accent/30 focus:ring-2"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setQuoteAddMode("choose")}
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={!quoteDraft.trim()}
                      className="rounded-full accent-fill-gradient px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
                ) : (
                  <ManifestoAddItem
                    empty={quotes.length === 0}
                    onClick={() => {
                      setAddingQuote(true);
                      setQuoteAddMode("choose");
                      setEditingQuoteId(null);
                    }}
                  >
                    Add a quote
                  </ManifestoAddItem>
                )}
              </li>
            </ul>
          </section>
        </div>

        <div className={`${BAND_CLASS} bg-marketing-band-ideate`}>
          <section
            className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-[52px] pt-12 sm:px-6"
            aria-labelledby="manifesto-questions-heading"
          >
            {/* —— Questions —— */}
            <ManifestoSectionHeader
              id="manifesto-questions-heading"
              title="Questions to yourself"
              subline="Come back to these when things feel noisy."
              right={
                questions.length > 0 ? (
                  <ManifestoEditPill
                    label="questions"
                    active={manageQuestions}
                    onClick={() => setManageQuestions((v) => !v)}
                  />
                ) : null
              }
            />
            {questions.length === 0 ? (
              <p className="-mt-3 max-w-2xl font-sans text-[13px] font-normal italic leading-relaxed text-muted">
                Questions worth sitting with — add a few and answer when
                you&apos;re ready.
              </p>
            ) : null}
            <ul className="grid grid-cols-1 gap-x-14 gap-y-7 md:grid-cols-2">
              {questionCells.map((q) => {
                const isPreview = "isPreview" in q && q.isPreview;
                const answer = !isPreview ? q.answer.trim() : "";
                const openOrAdd = () => {
                  if (isPreview && "presetId" in q && q.presetId) {
                    handleAddPreset(q.presetId, true);
                    return;
                  }
                  openQuestion(q as IdeateReflectionQuestion);
                };
                return (
                  <li
                    key={q.id}
                    className={`flex min-w-0 flex-col gap-2 border-l-[3px] py-1 pl-5 ${
                      answer ? "border-accent" : LIGHT_ACCENT_BORDER
                    }`}
                  >
                    <p className="font-display text-xl font-normal leading-[1.3] text-foreground md:text-2xl">
                      {q.text}
                    </p>
                    {answer ? (
                      <button
                        type="button"
                        onClick={openOrAdd}
                        className="w-full cursor-pointer text-left"
                      >
                        <span className="block whitespace-pre-wrap font-sans text-base font-normal leading-[1.6] text-foreground/75 transition-opacity hover:opacity-80">
                          {answer}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={openOrAdd}
                        className="inline-flex w-fit cursor-pointer items-center gap-0.5 text-sm font-semibold text-accent-link transition-opacity hover:opacity-80"
                      >
                        {isPreview ? "Add this question" : "Add your answer"}
                        <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
                      </button>
                    )}
                    {!isPreview && manageQuestions ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleRemoveQuestion((q as IdeateReflectionQuestion).id)
                        }
                        className="w-fit cursor-pointer font-sans text-xs text-muted transition-colors hover:text-foreground"
                        aria-label="Remove question"
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                );
              })}
              <li className="min-w-0">
                <div className="relative w-fit" ref={addPickerRef}>
                  <ManifestoAddItem
                    empty={questions.length === 0}
                    onClick={() => {
                      setAddQuestionOpen((o) => !o);
                      setWritingCustom(false);
                      setCustomDraft("");
                    }}
                  >
                    Add a question
                  </ManifestoAddItem>
              {addQuestionOpen ? (
                <div
                  role="dialog"
                  aria-label="Add a reflection question"
                  className="absolute left-0 top-full z-30 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-border bg-card shadow-lg"
                >
                <ul className="max-h-56 overflow-y-auto py-1">
                  {unusedPresets.length === 0 ? (
                    <li className="px-3 py-2.5 text-sm text-muted">
                      All suggested questions are already added.
                    </li>
                  ) : (
                    unusedPresets.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => handleAddPreset(p.id)}
                          className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent-soft/25"
                        >
                          <span className="min-w-0 flex-1 leading-snug">
                            {p.text}
                          </span>
                          <span
                            className="shrink-0 text-base font-medium text-accent-link"
                            aria-hidden
                          >
                            +
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
                <div className="border-t border-border bg-accent-soft/15 px-3 py-2.5">
                  {writingCustom ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddCustom();
                      }}
                      className="flex flex-col gap-2"
                    >
                      <label className="sr-only" htmlFor="ideate-custom-q">
                        Write your own question
                      </label>
                      <input
                        id="ideate-custom-q"
                        autoFocus
                        value={customDraft}
                        onChange={(e) => setCustomDraft(e.target.value)}
                        placeholder="Your question…"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-accent/30 focus:ring-2"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setWritingCustom(false);
                            setCustomDraft("");
                          }}
                          className="rounded-full px-3 py-1 text-xs font-medium text-muted hover:text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!customDraft.trim()}
                          className="rounded-full accent-fill-gradient px-3 py-1 text-xs font-medium text-on-accent disabled:opacity-40"
                        >
                          Add
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setWritingCustom(true)}
                      className="flex w-full cursor-pointer items-center gap-2 text-left text-sm text-foreground transition-opacity hover:opacity-80"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 text-accent-link"
                        aria-hidden
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                      Write your own question…
                    </button>
                  )}
                </div>
                </div>
              ) : null}
                </div>
              </li>
            </ul>
          </section>
        </div>

        {/* —— Regrets — temporarily hidden —— */}
        {false && (
          <div className="w-full border-b-[0.5px] border-marketing-ink/15 bg-marketing-band-d">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <IdeateCollapsibleSection
                variant="band"
                eyebrow="Regret minimisation"
                summary={regretsSummary}
                collapsed={false}
                onToggle={() => {}}
              >
          {regrets.length === 0 ? (
            <p className="mb-5 max-w-2xl font-sans text-[13px] font-normal italic leading-relaxed text-muted">
              Imagine yourself at 80, looking back. What would you regret not
              having tried?
            </p>
          ) : null}

          {regrets.length === 0 && !addingRegret ? null : (
            <ul className="flex flex-col gap-6">
              {orderedRegrets.map((r) => (
                <li key={r.id} className="group relative">
                  <p className="mb-1.5 font-sans text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                    {r.category?.trim() || "—"}
                  </p>
                  <p className="font-display text-[20px] font-normal leading-[1.35] text-foreground">
                    {r.statement}
                  </p>
                  <button
                    type="button"
                    onClick={() => exploreRegretInIdeate(r)}
                    className="mt-2 cursor-pointer font-sans text-[13px] font-medium text-accent-link opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    Explore in Manifest →
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveRegret(r.id)}
                    className="absolute right-0 top-0 cursor-pointer font-sans text-xs text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                    aria-label="Remove regret"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {addingRegret ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddRegret();
              }}
              className="mt-4 flex flex-col gap-2"
            >
              <label className="sr-only" htmlFor="ideate-regret-cat">
                Category
              </label>
              <input
                id="ideate-regret-cat"
                value={regretCategoryDraft}
                onChange={(e) => setRegretCategoryDraft(e.target.value)}
                placeholder="Category (optional) — Work, Creative…"
                maxLength={40}
                className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm outline-none ring-accent/30 focus:ring-2"
              />
              <label className="sr-only" htmlFor="ideate-regret-new">
                Regret statement
              </label>
              <textarea
                id="ideate-regret-new"
                autoFocus
                value={regretDraft}
                onChange={(e) => setRegretDraft(e.target.value)}
                placeholder="What would you regret not having tried?"
                rows={3}
                maxLength={280}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 font-display text-xl outline-none ring-accent/30 focus:ring-2"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddingRegret(false);
                    setRegretDraft("");
                    setRegretCategoryDraft("");
                  }}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!regretDraft.trim()}
                  className="rounded-full accent-fill-gradient px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-5 flex justify-center">
              <PrimaryCreateButton onClick={() => setAddingRegret(true)}>
                Add an entry
              </PrimaryCreateButton>
            </div>
          )}
              </IdeateCollapsibleSection>
            </div>
          </div>
        )}
      </div>

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

      {activeQuestion ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/45 p-4 backdrop-blur-[2px] sm:items-center"
          role="presentation"
          onClick={() => {
            setActiveQuestionId(null);
            setDraftAnswer("");
          }}
        >
          <div
            role="dialog"
            aria-labelledby="ideate-reflect-q-title"
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="ideate-reflect-q-title"
              className="font-display text-xl font-medium text-foreground"
            >
              {activeQuestion.text}
            </h2>
            {activeQuestion.description ? (
              <p className="mt-1 text-sm text-muted">
                {activeQuestion.description}
              </p>
            ) : null}
            <textarea
              value={draftAnswer}
              onChange={(e) => setDraftAnswer(e.target.value)}
              placeholder="Write freely — no need to polish."
              rows={8}
              autoFocus
              className="mt-5 w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-relaxed outline-none ring-accent/25 focus:ring-2"
            />
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleRemoveQuestion(activeQuestion.id)}
                className="cursor-pointer text-sm font-medium text-muted transition-colors hover:text-foreground"
              >
                Remove question
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveQuestionId(null);
                    setDraftAnswer("");
                  }}
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-accent-soft/30 hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveActiveAnswer()}
                  className="rounded-full accent-fill-gradient px-4 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
