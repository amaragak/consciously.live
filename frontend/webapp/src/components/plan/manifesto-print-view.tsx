import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Download, Eye } from "lucide-react";
import { useIdeateCloud } from "@/components/plan/ideate-cloud-provider";
import {
  ManifestoSheet,
  MobilePoster,
  type PrintArea,
  type PrintCompose,
  type PrintData,
} from "@/components/plan/manifesto-print-poster";
import {
  ManifestoPageViewer,
  PageSetupCard,
  PageSetupControls,
  PageZoomButton,
} from "@/components/plan/manifesto-page-setup";
import {
  AddAreaPopover,
  AddImageSheet,
  ImageMenuPopover,
  NoteMenuPopover,
  NotePopover,
  TextEditPopover,
  type NoteEditTarget,
} from "@/components/plan/manifesto-print-popovers";
import { Skeleton } from "@/components/ui/skeleton";
import { useMinWidth } from "@/hooks/use-min-width";
import {
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
} from "@/lib/auth-session";
import {
  flushIdeateCloudNow,
} from "@/lib/ideate-cloud";
import {
  ensureIdeateManifesto,
  loadStoredManifesto,
  saveIdeateManifestoManual,
} from "@/lib/ideate-manifesto";
import {
  addIdeateQuote,
  loadIdeateQuotesStore,
  patchIdeateQuote,
  saveIdeateQuotesStore,
  setIdeateQuoteHiddenOnPrint,
  type IdeateQuote,
} from "@/lib/ideate-quotes";
import {
  loadIdeateReflectionQuestionsStore,
  patchQuestionAnswer,
  saveIdeateReflectionQuestionsStore,
  setQuestionHiddenOnPrint,
  type IdeateReflectionQuestion,
} from "@/lib/ideate-reflection-questions";
import {
  addIdeateValue,
  loadIdeateValuesStore,
  patchIdeateValue,
  saveIdeateValuesStore,
  type IdeateValue,
} from "@/lib/ideate-values";
import {
  loadIdeateVisionBoardStore,
  promoteVisionItemForLifeArea,
  saveIdeateVisionBoardStore,
  setVisionItemLifeAreaIds,
  visionItemHasImage,
  type VisionBoardItem,
} from "@/lib/ideate-vision-board";
import {
  getVisionMedia,
  visionMediaToObjectUrl,
} from "@/lib/ideate-vision-media";
import { addVisionBoardImageFromFile } from "@/lib/ideate-vision-upload";
import { lifeAreaHref } from "@/lib/life-area-summary";
import {
  PRINT_DESIGN_WIDTH,
  MANIFESTO_PAGE_SPEC,
  firstNameFromAccount,
  manifestoViewHref,
  pickPrintNotes,
  resolveManifestoPageSize,
  visionItemsForLifeArea,
  type ManifestoPageMode,
  type ManifestoPageSettings,
  type PrintNote,
} from "@/lib/manifesto-print";
import {
  loadManifestoStoryStore,
  patchStoryOnPrint,
  patchVersionSummaries,
  saveManifestoStoryStore,
  storySectionKey,
  versionSections,
  type ManifestoStoryStoreV1,
  type StoryOnPrintSettings,
} from "@/lib/manifesto-story";
import { summarizeStoryForPrint } from "@/lib/manifesto-story-llm";
import { fetchUserSettings, patchUserSettings } from "@/lib/settings-api";
import {
  mergeAccountPronouns,
  readAccountPronounsLocal,
} from "@/lib/settings-local-defaults";
import {
  printStoryFromStore,
  storyNeedsSummaries,
  type PrintStoryCompose,
} from "@/components/plan/manifesto-print-story";
import {
  PRINT_ROOT_ID,
  exportSheetPng,
  printPoster,
  waitForPosterReady,
} from "@/lib/manifesto-print-export";
import {
  createPlanDream,
  loadPlanDreamsStore,
  savePlanDreamsStore,
  upsertPlanDream,
  type PlanDream,
} from "@/lib/plan-dreams";

/* ------------------------------------------------------------------ types */

type PopoverState =
  | { kind: "statement"; el: HTMLElement }
  | { kind: "addValue"; el: HTMLElement }
  | { kind: "value"; el: HTMLElement; id: string }
  | { kind: "areaName" | "dream" | "looks"; el: HTMLElement; id: string }
  | { kind: "addArea"; el: HTMLElement }
  | { kind: "imageMenu"; el: HTMLElement; areaId: string; imageId: string }
  | { kind: "note"; el: HTMLElement; editing: NoteEditTarget | null }
  | { kind: "noteMenu"; el: HTMLElement; note: PrintNote };

type ExportJob = { kind: "png" } | { kind: "print" } | { kind: "mobile-png" };

const MOBILE_EXPORT_WIDTH = 360;
const ACTIONS_COLUMN_PX = 232;
const ROW_GAP_PX = 20;

const BTN_PRIMARY =
  "accent-fill-gradient inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-[0.45]";
const BTN_OUTLINE =
  "inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-[0.45]";
const BTN_OUTLINE_IDLE = "border-border bg-card hover:border-accent/50";
const BTN_OUTLINE_ACTIVE = "border-accent bg-accent-soft";

const EMPTY_HINT = "Add a statement or a life area to start your print.";

/* ------------------------------------------------------------------- hooks */

function useSessionFirstName(): string {
  const read = () =>
    firstNameFromAccount(
      getMedimadeSessionDisplayName(),
      getMedimadeSessionEmail(),
    );
  const [name, setName] = useState(read);
  useEffect(() => {
    const sync = () => setName(read());
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);
  return name;
}

/** Resolve vision tile URLs (CloudFront URLs, or guest IndexedDB blobs). */
function useVisionTileUrls(items: VisionBoardItem[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const blobsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      const blobs: string[] = [];
      for (const item of items) {
        if (!visionItemHasImage(item)) continue;
        if (typeof item.imageUrl === "string" && item.imageUrl.trim()) {
          next[item.id] = item.imageUrl;
          continue;
        }
        if (!item.mediaId) continue;
        try {
          const rec = await getVisionMedia(item.mediaId);
          if (!rec) continue;
          const u = visionMediaToObjectUrl(rec);
          next[item.id] = u;
          if (u.startsWith("blob:")) blobs.push(u);
        } catch {
          /* ignore */
        }
      }
      if (cancelled) {
        for (const u of blobs) URL.revokeObjectURL(u);
        return;
      }
      for (const u of blobsRef.current) URL.revokeObjectURL(u);
      blobsRef.current = blobs;
      setUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(
    () => () => {
      for (const u of blobsRef.current) URL.revokeObjectURL(u);
      blobsRef.current = [];
    },
    [],
  );

  return urls;
}

/* -------------------------------------------------------------------- view */

function byCreatedAt<T extends { createdAt: string }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function ManifestoPrintView() {
  const navigate = useNavigate();
  const wide = useMinWidth(768);
  const { ready: cloudReady, revision, signedIn } = useIdeateCloud();
  const firstName = useSessionFirstName();

  const [hydrated, setHydrated] = useState(false);
  const [dreams, setDreams] = useState<PlanDream[]>([]);
  const [visionItems, setVisionItems] = useState<VisionBoardItem[]>([]);
  const [values, setValues] = useState<IdeateValue[]>([]);
  const [quotes, setQuotes] = useState<IdeateQuote[]>([]);
  const [questions, setQuestions] = useState<IdeateReflectionQuestion[]>([]);
  const [statement, setStatement] = useState("");
  const [storyStore, setStoryStore] = useState<ManifestoStoryStoreV1>(() =>
    loadManifestoStoryStore(),
  );
  const [storyRegenBusy, setStoryRegenBusy] = useState(false);

  const [preview, setPreview] = useState(false);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [imageAreaId, setImageAreaId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pageSettings, setPageSettings] = useState<ManifestoPageSettings>({
    modeWide: "paged",
    modeNarrow: "pageless",
    size: null,
  });
  const [doesntFit, setDoesntFit] = useState(false);
  const [stackHeight, setStackHeight] = useState(0);
  const onStackHeight = useCallback((height: number) => {
    setStackHeight((prev) => (prev === height ? prev : height));
  }, []);
  const [pageSheetOpen, setPageSheetOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const onOverflow = useCallback((overflows: boolean) => {
    setDoesntFit(overflows);
  }, []);

  const pageTouched = useRef(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void fetchUserSettings()
      .then(({ settings }) => {
        if (!cancelled && !pageTouched.current) setPageSettings(settings.manifestoPage);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const pageLocale = typeof navigator === "undefined" ? "en" : navigator.language;
  const pageSize = resolveManifestoPageSize(pageSettings.size, pageLocale);
  const pageMode: ManifestoPageMode = wide
    ? pageSettings.modeWide
    : pageSettings.modeNarrow;
  const pageSpec = MANIFESTO_PAGE_SPEC[pageSize];
  const pageLogicalW =
    pageMode === "pageless" ? (wide ? PRINT_DESIGN_WIDTH : MOBILE_EXPORT_WIDTH) : pageSpec.logicalW;
  const pageLogicalH = pageMode === "paged" ? pageSpec.logicalH : 0;

  function savePage(next: ManifestoPageSettings) {
    pageTouched.current = true;
    setPageSettings(next);
    setDoesntFit(false);
    if (!signedIn) return;
    void patchUserSettings({ manifestoPage: next }).catch(() => {});
  }

  const tileUrls = useVisionTileUrls(visionItems);

  const refresh = useCallback(() => {
    setDreams(loadPlanDreamsStore().dreams);
    setVisionItems(loadIdeateVisionBoardStore().items);
    setValues(loadIdeateValuesStore().values);
    setQuotes(loadIdeateQuotesStore().quotes);
    setQuestions(loadIdeateReflectionQuestionsStore().questions);
    setStatement(loadStoredManifesto() ?? "");
    setStoryStore(loadManifestoStoryStore());
  }, []);

  useEffect(() => setHydrated(true), []);

  // Guests never wait on the cloud provider.
  useEffect(() => {
    if (signedIn) return;
    refresh();
  }, [refresh, signedIn]);

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

  /* ---- derived print data (same ordering as the Edit view) --------------- */

  const orderedDreams = useMemo(() => byCreatedAt(dreams), [dreams]);
  const orderedValues = useMemo(() => byCreatedAt(values), [values]);
  const valueTexts = useMemo(
    () => orderedValues.map((v) => v.text.trim()).filter(Boolean),
    [orderedValues],
  );
  const lifeAreaTitles = useMemo(
    () => orderedDreams.map((d) => d.title.trim()).filter(Boolean),
    [orderedDreams],
  );

  // First visit with values but no stored sentence: same one-time generation
  // the Edit view does (never regenerates over a stored sentence).
  const generatingRef = useRef(false);
  useEffect(() => {
    if (!hydrated || !cloudReady) return;
    if (valueTexts.length === 0 || loadStoredManifesto()) return;
    if (generatingRef.current) return;
    generatingRef.current = true;
    void ensureIdeateManifesto({ values: valueTexts, lifeAreaTitles })
      .then((text) => setStatement(text))
      .finally(() => {
        generatingRef.current = false;
      });
  }, [hydrated, cloudReady, valueTexts, lifeAreaTitles, revision]);

  const data: PrintData = useMemo(() => {
    const areas: PrintArea[] = orderedDreams.map((d) => ({
      id: d.id,
      title: d.title,
      dream: (d.dreamText || d.firstThought || "").trim(),
      looks: (d.visionText || "").trim(),
      images: visionItemsForLifeArea(visionItems, d.id)
        .map((item) => ({ id: item.id, src: tileUrls[item.id] ?? "" }))
        .filter((img) => img.src),
    }));
    return {
      firstName,
      statement,
      values: orderedValues
        .filter((v) => v.text.trim())
        .map((v) => ({ id: v.id, text: v.text.trim() })),
      areas,
      notes: pickPrintNotes(quotes, questions),
      story: printStoryFromStore(storyStore, firstName),
    };
  }, [
    firstName,
    statement,
    orderedValues,
    orderedDreams,
    visionItems,
    tileUrls,
    quotes,
    questions,
    storyStore,
  ]);

  const hasContent =
    Boolean(statement.trim()) ||
    data.areas.length > 0 ||
    Boolean(data.story?.version);

  const persistStory = useCallback((next: ManifestoStoryStoreV1) => {
    saveManifestoStoryStore(next);
    setStoryStore(next);
  }, []);

  const ensureStorySummaries = useCallback(
    async (kind: "whole" | "sections") => {
      const version = storyStore.versions[0];
      if (!version || storyRegenBusy) return;
      setStoryRegenBusy(true);
      try {
        const sections = versionSections(version).map((s) => ({
          id: storySectionKey(s),
          heading: s.heading,
          text: s.text,
        }));
        let pronouns: "she_her" | "he_him" | "they_them" = "they_them";
        const local = readAccountPronounsLocal();
        try {
          const { settings } = await fetchUserSettings();
          pronouns = mergeAccountPronouns(settings, local).account.pronouns;
        } catch {
          pronouns = local ?? "they_them";
        }
        const result = await summarizeStoryForPrint({
          firstName,
          pronouns,
          sections,
        });
        persistStory(
          patchVersionSummaries(storyStore, version.id, {
            summary:
              kind === "sections" && version.summary
                ? version.summary
                : result.summary,
            sectionSummaries:
              kind === "whole" && version.sectionSummaries
                ? version.sectionSummaries
                : result.sectionSummaries,
          }),
        );
      } catch {
        /* keep prior text */
      } finally {
        setStoryRegenBusy(false);
      }
    },
    [firstName, persistStory, storyRegenBusy, storyStore],
  );

  // Auto-generate summaries when Summary / Choose·Summarised needs them.
  useEffect(() => {
    if (!hydrated || !cloudReady) return;
    const need = storyNeedsSummaries(
      storyStore.versions[0] ?? null,
      data.story?.settings ?? storyStore.storyOnPrint,
    );
    if (!need || storyRegenBusy) return;
    void ensureStorySummaries(need === "whole" ? "whole" : "sections");
  }, [
    hydrated,
    cloudReady,
    storyStore,
    storyRegenBusy,
    ensureStorySummaries,
  ]);

  useEffect(() => {
    if (!hasContent) setPreview(false);
  }, [hasContent]);

  /* ---- persistence (same stores the Edit view uses) ----------------------- */

  const patchDream = useCallback(
    (id: string, partial: Partial<PlanDream>) => {
      const store = loadPlanDreamsStore();
      const dream = store.dreams.find((d) => d.id === id);
      if (!dream) return;
      savePlanDreamsStore(
        upsertPlanDream(store, {
          ...dream,
          ...partial,
          updatedAt: new Date().toISOString(),
        }),
      );
      refresh();
    },
    [refresh],
  );

  const createArea = useCallback(
    (input: { title: string; dream: string }): PlanDream | null => {
      const title = input.title.trim();
      if (!title) return null;
      const dream = createPlanDream({
        title,
        dreamText: input.dream,
      });
      savePlanDreamsStore(upsertPlanDream(loadPlanDreamsStore(), dream));
      refresh();
      return dream;
    },
    [refresh],
  );

  const tagImagesToArea = useCallback(
    (itemIds: string[], areaId: string) => {
      let board = loadIdeateVisionBoardStore();
      for (const itemId of itemIds) {
        const item = board.items.find((x) => x.id === itemId);
        if (!item) continue;
        board = setVisionItemLifeAreaIds(board, itemId, [
          ...(item.lifeAreaIds ?? []),
          areaId,
        ]);
      }
      saveIdeateVisionBoardStore(board);
      refresh();
    },
    [refresh],
  );

  const onUploadImage = useCallback(
    async (file: File, areaId: string) => {
      if (uploading) return;
      setUploading(true);
      setUploadError(null);
      try {
        const newId = await addVisionBoardImageFromFile(file, signedIn);
        tagImagesToArea([newId], areaId);
        if (signedIn) await flushIdeateCloudNow();
        setImageAreaId(null);
      } catch (e) {
        setUploadError(
          e instanceof Error ? e.message : "Could not add that image",
        );
      } finally {
        setUploading(false);
      }
    },
    [signedIn, tagImagesToArea, uploading],
  );

  const persistQuotes = useCallback((next: IdeateQuote[]) => {
    saveIdeateQuotesStore({ v: 1, quotes: next });
    setQuotes(next);
  }, []);

  const persistQuestions = useCallback((next: IdeateReflectionQuestion[]) => {
    saveIdeateReflectionQuestionsStore({ v: 1, questions: next });
    setQuestions(next);
  }, []);

  /* ---- compose handlers --------------------------------------------------- */

  const closePopover = useCallback(() => setPopover(null), []);

  const storyCompose: PrintStoryCompose | null = useMemo(() => {
    if (preview) return null;
    return {
      settings: storyStore.storyOnPrint,
      onPatchSettings: (patch: Partial<StoryOnPrintSettings>) => {
        persistStory(patchStoryOnPrint(storyStore, patch));
      },
      onEditSummary: (text) => {
        const version = storyStore.versions[0];
        if (!version) return;
        persistStory(
          patchVersionSummaries(storyStore, version.id, { summary: text }),
        );
      },
      onEditSectionSummary: (key, text) => {
        const version = storyStore.versions[0];
        if (!version) return;
        persistStory(
          patchVersionSummaries(storyStore, version.id, {
            sectionSummaries: { [key]: text },
          }),
        );
      },
      onRegenerateSummary: () => void ensureStorySummaries("whole"),
      onRegenerateSectionSummaries: () =>
        void ensureStorySummaries("sections"),
      regenerating: storyRegenBusy,
      storyHref: manifestoViewHref("story"),
    };
  }, [
    preview,
    storyStore,
    persistStory,
    ensureStorySummaries,
    storyRegenBusy,
  ]);

  const compose: PrintCompose | null = useMemo(() => {
    if (preview) return null;
    return {
      onEditStatement: (el) => setPopover({ kind: "statement", el }),
      onAddValue: (el) => setPopover({ kind: "addValue", el }),
      onEditValue: (el, id) => setPopover({ kind: "value", el, id }),
      onEditAreaName: (el, id) => setPopover({ kind: "areaName", el, id }),
      onEditDream: (el, id) => setPopover({ kind: "dream", el, id }),
      onEditLooks: (el, id) => setPopover({ kind: "looks", el, id }),
      onAddImage: (_el, id) => {
        setUploadError(null);
        setImageAreaId(id);
      },
      onImageMenu: (el, areaId, imageId) =>
        setPopover({ kind: "imageMenu", el, areaId, imageId }),
      onAddArea: (el) => setPopover({ kind: "addArea", el }),
      onAddNote: (el) => setPopover({ kind: "note", el, editing: null }),
      onNoteMenu: (el, note) => setPopover({ kind: "noteMenu", el, note }),
      storyCompose,
    };
  }, [preview, storyCompose]);

  /* ---- export ------------------------------------------------------------- */

  const stageRef = useRef<HTMLDivElement>(null);
  const jobRunningRef = useRef(false);

  useEffect(() => {
    if (!job || jobRunningRef.current) return;
    jobRunningRef.current = true;
    void (async () => {
      try {
        const node = stageRef.current;
        if (!node) throw new Error("Nothing to export yet.");
        await waitForPosterReady(node);
        const stamp = (firstName || "My").replace(/\s+/g, "-");
        const suffix =
          pageMode === "pageless"
            ? "pageless"
            : pageSize === "phone"
              ? "wallpaper"
              : pageSize;
        const filename = `${stamp}-manifesto-${suffix}.png`;
        if (job.kind === "print") {
          await printPoster();
        } else {
          const width = pageLogicalW;
          const pixelRatio =
            pageMode === "pageless" ? 2 : pageSpec.exportW / pageSpec.logicalW;
          await exportSheetPng(node, {
            filename,
            width,
            height:
              pageMode === "paged" && pageSize === "phone"
                ? pageSpec.logicalH
                : undefined,
            pixelRatio,
            share: pageSize === "phone" && pageMode === "paged",
          });
        }
      } catch (e) {
        setExportError(
          e instanceof Error ? e.message : "Could not export your manifesto.",
        );
      } finally {
        jobRunningRef.current = false;
        setJob(null);
      }
    })();
  }, [job, firstName, pageMode, pageSize, pageLogicalW, pageSpec]);

  function startExport(next: ExportJob) {
    if (!hasContent || job) return;
    setExportError(null);
    setExportMenuOpen(false);
    setJob(next);
  }

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-export-menu-root]")) return;
      setExportMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExportMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportMenuOpen]);

  /* ---- desktop scale ------------------------------------------------------ */

  const rowRef = useRef<HTMLDivElement>(null);
  const posterMeasureRef = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState(0);
  const [posterHeight, setPosterHeight] = useState(0);
  const [mobileBox, setMobileBox] = useState(360);
  const mobileBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = () =>
      setRowWidth((prev) => (prev === el.clientWidth ? prev : el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wide, hydrated, cloudReady]);
  useEffect(() => {
    const el = posterMeasureRef.current;
    if (!el) return;
    const measure = () =>
      setPosterHeight((prev) =>
        prev === el.offsetHeight ? prev : el.offsetHeight,
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wide, hydrated, cloudReady, data, preview, pageMode, pageSize]);
  useEffect(() => {
    const el = mobileBoxRef.current;
    if (!el) return;
    const measure = () => {
      const next = el.clientWidth || 360;
      setMobileBox((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wide, hydrated, cloudReady, pageMode]);
  const scale = Math.max(
    0.3,
    Math.min(
      1,
      (rowWidth - ROW_GAP_PX - ACTIONS_COLUMN_PX) / pageLogicalW,
    ),
  );

  /* ---- render ------------------------------------------------------------- */

  if (!hydrated || !cloudReady) {
    return (
      <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-10 pt-4 sm:px-6">
        <h1 className="sr-only">Manifesto</h1>
        <Skeleton className="mx-auto h-[640px] w-full max-w-[1000px] rounded-md" />
      </div>
    );
  }

  const activeArea =
    popover &&
    (popover.kind === "areaName" ||
      popover.kind === "dream" ||
      popover.kind === "looks")
      ? (orderedDreams.find((d) => d.id === popover.id) ?? null)
      : null;
  const imageArea = imageAreaId
    ? (orderedDreams.find((d) => d.id === imageAreaId) ?? null)
    : null;

  const popovers: ReactNode = (
    <>
      {popover?.kind === "statement" ? (
        <TextEditPopover
          anchor={popover.el}
          title="Your manifesto"
          value={statement}
          multiline
          placeholder="Write the sentence you want to grow into."
          onClose={closePopover}
          onSave={(text) => {
            const saved = saveIdeateManifestoManual({
              values: valueTexts,
              lifeAreaTitles,
              text,
            });
            if (saved) setStatement(saved);
            closePopover();
          }}
        />
      ) : null}
      {popover?.kind === "addValue" ? (
        <TextEditPopover
          anchor={popover.el}
          title="Add a value"
          value=""
          placeholder="e.g. Creativity"
          submitLabel="Add"
          onClose={closePopover}
          onSave={(text) => {
            const next = addIdeateValue({ v: 1, values }, text);
            if (next.values.length !== values.length) {
              saveIdeateValuesStore({ v: 1, values: next.values });
              setValues(next.values);
            }
            closePopover();
          }}
        />
      ) : null}
      {popover?.kind === "value" ? (
        <TextEditPopover
          anchor={popover.el}
          title="Value"
          value={values.find((v) => v.id === popover.id)?.text ?? ""}
          onClose={closePopover}
          onSave={(text) => {
            const next = patchIdeateValue({ v: 1, values }, popover.id, text);
            saveIdeateValuesStore({ v: 1, values: next.values });
            setValues(next.values);
            closePopover();
          }}
        />
      ) : null}
      {popover?.kind === "areaName" && activeArea ? (
        <TextEditPopover
          anchor={popover.el}
          title="Life area name"
          value={activeArea.title}
          onClose={closePopover}
          onSave={(text) => {
            patchDream(activeArea.id, { title: text.trim() });
            closePopover();
          }}
        />
      ) : null}
      {popover?.kind === "dream" && activeArea ? (
        <TextEditPopover
          anchor={popover.el}
          title="The dream"
          value={(activeArea.dreamText || activeArea.firstThought || "").trim()}
          multiline
          placeholder="Say it messy. No one is grading this."
          onClose={closePopover}
          onSave={(text) => {
            patchDream(activeArea.id, { dreamText: text.trim() });
            closePopover();
          }}
        />
      ) : null}
      {popover?.kind === "looks" && activeArea ? (
        <TextEditPopover
          anchor={popover.el}
          title="What it looks like"
          value={activeArea.visionText.trim()}
          multiline
          allowEmpty
          placeholder="A concrete scene — where you are, what you’re doing, how it feels."
          onClose={closePopover}
          onSave={(text) => {
            patchDream(activeArea.id, { visionText: text.trim() });
            closePopover();
          }}
        />
      ) : null}
      {popover?.kind === "imageMenu" ? (
        <ImageMenuPopover
          anchor={popover.el}
          isMain={
            (data.areas.find((a) => a.id === popover.areaId)?.images[0]?.id ??
              null) === popover.imageId
          }
          onClose={closePopover}
          onUseAsMain={() => {
            const next = promoteVisionItemForLifeArea(
              loadIdeateVisionBoardStore(),
              popover.imageId,
              popover.areaId,
            );
            saveIdeateVisionBoardStore(next);
            refresh();
            closePopover();
          }}
        />
      ) : null}
      {popover?.kind === "addArea" ? (
        <AddAreaPopover
          anchor={popover.el}
          onClose={closePopover}
          onCreate={(input) => {
            createArea(input);
            closePopover();
          }}
          onFullSetup={(input) => {
            const dream = createArea(input);
            closePopover();
            if (dream) navigate(lifeAreaHref(dream.id));
          }}
        />
      ) : null}
      {popover?.kind === "noteMenu" ? (
        <NoteMenuPopover
          anchor={popover.el}
          onClose={closePopover}
          onEdit={() => {
            const note = popover.note;
            if (note.kind === "quote") {
              setPopover({
                kind: "note",
                el: popover.el,
                editing: {
                  kind: "quote",
                  id: note.id,
                  text: note.text,
                  source: note.source ?? "",
                },
              });
            } else {
              setPopover({
                kind: "note",
                el: popover.el,
                editing: { kind: "answer", id: note.id },
              });
            }
          }}
          onRemoveFromPrint={() => {
            const note = popover.note;
            if (note.kind === "quote") {
              persistQuotes(
                setIdeateQuoteHiddenOnPrint({ v: 1, quotes }, note.id, true)
                  .quotes,
              );
            } else {
              persistQuestions(
                setQuestionHiddenOnPrint({ v: 1, questions }, note.id, true)
                  .questions,
              );
            }
            closePopover();
          }}
        />
      ) : null}
      {popover?.kind === "note" ? (
        <NotePopover
          anchor={popover.el}
          questions={questions}
          editing={popover.editing}
          onClose={closePopover}
          onSaveQuote={({ id, text, source }) => {
            if (id) {
              persistQuotes(
                patchIdeateQuote({ v: 1, quotes }, id, {
                  text,
                  attribution: source.trim() ? source : null,
                }).quotes,
              );
            } else {
              persistQuotes(
                addIdeateQuote(
                  { v: 1, quotes },
                  { text, attribution: source },
                ).quotes,
              );
            }
            closePopover();
          }}
          onSaveAnswer={({ id, answer }) => {
            let next = patchQuestionAnswer({ v: 1, questions }, id, answer);
            next = setQuestionHiddenOnPrint(next, id, false);
            persistQuestions(next.questions);
            closePopover();
          }}
        />
      ) : null}
      {imageArea ? (
        <AddImageSheet
          areaTitle={imageArea.title.trim() || "this area"}
          areaId={imageArea.id}
          items={visionItems.filter(visionItemHasImage)}
          urls={tileUrls}
          uploading={uploading}
          uploadError={uploadError}
          onClose={() => setImageAreaId(null)}
          onUpload={(file) => void onUploadImage(file, imageArea.id)}
          onConfirm={(ids) => {
            tagImagesToArea(ids, imageArea.id);
            setImageAreaId(null);
          }}
        />
      ) : null}
    </>
  );

  /** Offscreen stage that always renders the Preview state (export source). */
  const stage =
    job && typeof document !== "undefined"
      ? createPortal(
          <div
            id={PRINT_ROOT_ID}
            aria-hidden
            style={{
              position: "fixed",
              left: -10000,
              top: 0,
              pointerEvents: "none",
            }}
          >
            {job ? (
              <ManifestoSheet
                ref={stageRef}
                data={data}
                compose={null}
                mode={pageMode}
                size={pageSize}
                narrow={!wide}
                sheetWidth={
                  !wide && pageMode === "pageless" ? MOBILE_EXPORT_WIDTH : undefined
                }
              />
            ) : null}
          </div>,
          document.body,
        )
      : null;

  const exporting = job !== null;

  /* ---- mobile ------------------------------------------------------------- */

  if (!wide) {
    return (
      <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-[96px] pt-3">
        <h1 className="sr-only">Manifesto</h1>
        <div ref={mobileBoxRef} className="relative mx-auto w-full max-w-[520px]">
          {pageMode === "pageless" ? (
            <MobilePoster data={data} compose={compose} />
          ) : (
            <div
              className="relative mx-auto overflow-visible"
              style={{
                width: pageLogicalW * Math.min(1, mobileBox / pageLogicalW),
                height:
                  Math.max(pageLogicalH, stackHeight || pageLogicalH) *
                  Math.min(1, mobileBox / pageLogicalW),
              }}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest("button, a, input, textarea")) return;
                setViewerOpen(true);
              }}
            >
              <div
                style={{
                  width: pageLogicalW,
                  transform: `scale(${Math.min(1, mobileBox / pageLogicalW)})`,
                  transformOrigin: "top left",
                }}
              >
                <ManifestoSheet
                  data={data}
                  compose={compose}
                  mode={pageMode}
                  size={pageSize}
                  narrow={false}
                  onOverflow={onOverflow}
                  onContentHeight={onStackHeight}
                />
              </div>
              <PageZoomButton onClick={() => setViewerOpen(true)} />
            </div>
          )}
        </div>

        {exportError ? (
          <p className="mx-auto mt-3 max-w-[520px] text-xs text-danger" role="alert">
            {exportError}
          </p>
        ) : null}

        <div className="sticky bottom-[14px] z-30 mx-auto mt-4 flex w-full max-w-[520px] flex-col gap-1.5">
          {!hasContent ? (
            <p className="mx-auto rounded-full border border-border bg-card px-3 py-1 text-center text-xs text-muted">
              {EMPTY_HINT}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!hasContent || exporting}
              onClick={() => startExport({ kind: "mobile-png" })}
              className="accent-fill-gradient inline-flex h-[46px] min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-sm font-semibold shadow-[0_8px_20px_rgba(15,27,45,0.18)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-[0.45]"
            >
              <Download aria-hidden className="size-[15px]" strokeWidth={1.8} />
              {exporting ? "Saving…" : "Save as image"}
            </button>
            <button
              type="button"
              aria-label="Page"
              aria-expanded={pageSheetOpen}
              onClick={() => setPageSheetOpen((v) => !v)}
              className={`inline-flex h-[46px] shrink-0 cursor-pointer items-center justify-center rounded-full border px-3.5 text-[13px] font-semibold text-foreground shadow-[0_8px_20px_rgba(15,27,45,0.12)] ${
                pageSheetOpen ? BTN_OUTLINE_ACTIVE : BTN_OUTLINE_IDLE
              }`}
            >
              Page
            </button>
            <button
              type="button"
              aria-label="Preview"
              aria-pressed={preview}
              disabled={!hasContent}
              onClick={() => setPreview((v) => !v)}
              className={`inline-flex size-[46px] shrink-0 cursor-pointer items-center justify-center rounded-full border text-foreground shadow-[0_8px_20px_rgba(15,27,45,0.12)] transition-colors disabled:cursor-not-allowed disabled:opacity-[0.45] ${
                preview ? BTN_OUTLINE_ACTIVE : BTN_OUTLINE_IDLE
              }`}
            >
              <Eye aria-hidden className="size-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {pageSheetOpen ? (
          <div className="fixed inset-0 z-40 flex items-end bg-marketing-ink/40" onClick={() => setPageSheetOpen(false)}>
            <div
              className="max-h-[80vh] w-full overflow-auto rounded-t-2xl bg-card p-4 pb-8"
              onClick={(e) => e.stopPropagation()}
            >
              <PageSetupControls
                mode={pageMode}
                size={pageSize}
                locale={pageLocale}
                doesntFit={pageMode === "paged" && doesntFit}
                onMode={(mode) =>
                  savePage({ ...pageSettings, modeNarrow: mode })
                }
                onSize={(size) => savePage({ ...pageSettings, size })}
              />
            </div>
          </div>
        ) : null}
        {viewerOpen && pageMode === "paged" ? (
          <ManifestoPageViewer
            logicalW={pageLogicalW}
            logicalH={Math.max(pageLogicalH, stackHeight || pageLogicalH)}
            onClose={() => setViewerOpen(false)}
          >
            <ManifestoSheet
              data={data}
              compose={null}
              mode={pageMode}
              size={pageSize}
              narrow={false}
            />
          </ManifestoPageViewer>
        ) : null}

        {popovers}
        {stage}
      </div>
    );
  }

  /* ---- desktop ------------------------------------------------------------ */

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-10 pt-4 sm:px-6">
      <h1 className="sr-only">Manifesto</h1>
      <div ref={rowRef} className="flex min-w-0 items-start" style={{ gap: ROW_GAP_PX }}>
        <div
          className="min-w-0 shrink-0 overflow-visible"
          style={{
            width: pageLogicalW * scale,
            height:
              (pageMode === "paged"
                ? Math.max(pageLogicalH, stackHeight || pageLogicalH)
                : Math.max(1, posterHeight)) * scale,
          }}
        >
          <div
            style={{
              width: pageLogicalW,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              overflow: "visible",
            }}
          >
            <ManifestoSheet
              ref={posterMeasureRef}
              data={data}
              compose={compose}
              mode={pageMode}
              size={pageSize}
              narrow={false}
              onOverflow={onOverflow}
              onContentHeight={onStackHeight}
            />
          </div>
        </div>

        <div
          className="sticky top-6 z-30 flex shrink-0 flex-col gap-[10px]"
          style={{ width: ACTIONS_COLUMN_PX }}
        >
          <div className="relative" data-export-menu-root>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              disabled={!hasContent || exporting}
              onClick={() => setExportMenuOpen((v) => !v)}
              className={`${BTN_PRIMARY} text-on-accent`}
            >
              <Download aria-hidden className="size-[15px]" strokeWidth={1.8} />
              {exporting ? "Exporting…" : "Export"}
              {exporting ? null : (
                <ChevronDown aria-hidden className="-ml-1 size-3.5" strokeWidth={1.8} />
              )}
            </button>
            {exportMenuOpen ? (
              <div
                role="menu"
                aria-label="Export"
                className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-[0_12px_40px_rgba(30,37,48,0.18)]"
              >
                {(
                  [
                    ["Image (PNG)", { kind: "png" as const }],
                    ["Print…", { kind: "print" as const }],
                  ] as const
                ).map(([label, next]) => (
                  <button
                    key={label}
                    type="button"
                    role="menuitem"
                    onClick={() => startExport(next)}
                    className="block w-full cursor-pointer px-4 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent-soft/40"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-pressed={preview}
            disabled={!hasContent}
            onClick={() => setPreview((v) => !v)}
            className={`${BTN_OUTLINE} ${preview ? BTN_OUTLINE_ACTIVE : BTN_OUTLINE_IDLE}`}
          >
            <Eye aria-hidden className="size-[15px]" strokeWidth={1.8} />
            Preview
          </button>
          <PageSetupCard
            mode={pageMode}
            size={pageSize}
            locale={pageLocale}
            doesntFit={pageMode === "paged" && doesntFit}
            onMode={(mode) => savePage({ ...pageSettings, modeWide: mode })}
            onSize={(size) => savePage({ ...pageSettings, size })}
          />
          {!hasContent ? (
            <p className="text-xs leading-[1.45] text-muted">{EMPTY_HINT}</p>
          ) : null}
          {exportError ? (
            <p className="text-xs leading-[1.45] text-danger" role="alert">
              {exportError}
            </p>
          ) : null}
        </div>
      </div>

      {popovers}
      {stage}
    </div>
  );
}
