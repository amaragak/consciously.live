import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { estimateGuideReadMinutes } from "@/components/guide-body";
import {
  ReadRichEditor,
  bodyToEditorHtml,
} from "@/components/read-rich-editor";
import {
  STATIC_GUIDE_SEED,
  guidesBasePath,
  invalidateGuidesCache,
} from "@/content/guides";
import {
  deleteAdminGuide,
  fetchAdminGuides,
  reorderAdminGuides,
  saveAdminGuide,
  seedAdminGuides,
  generateAdminGuideCover,
  uploadAdminGuideCover,
  type AdminGuide,
  type GuideArea,
  type GuidePracticeAction,
  type GuideStatus,
} from "@/lib/medimade-api";
import {
  composeGuideBodyFromPaste,
  composePracticeBriefFromPaste,
  parseGuidePaste,
  type GuidePasteGuide,
  type GuidePasteIssue,
} from "@/lib/parse-guide-paste";

type AreaFilter = "all" | GuideArea;

const FILTERS: { id: AreaFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "meditate", label: "Meditate" },
  { id: "journal", label: "Journal" },
  { id: "manifest", label: "Manifest" },
];

const AREA_LABEL: Record<GuideArea, string> = {
  meditate: "Meditate",
  journal: "Journal",
  manifest: "Manifest",
};

const PRACTICE_ACTION_LABEL: Record<GuidePracticeAction, string> = {
  lifeArea: "Add to a life area",
  create: "Create meditation",
};

function guideAreaFromValue(v: string): GuideArea {
  return v === "journal" || v === "manifest" ? v : "meditate";
}

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
const OUTLINE_BTN_CLASS =
  "rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50";

async function fileToCompressedJpegDataUrl(file: File): Promise<{
  dataUrl: string;
  mimeType: string;
}> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.85),
    mimeType: "image/jpeg",
  };
}

function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || ""
  );
}

function formatWhen(iso: string | null | undefined): string {
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

type GuideDraft = {
  id?: string;
  area: GuideArea;
  title: string;
  slug: string;
  summary: string;
  category: string;
  coverImageUrl: string | null;
  body: string;
  practiceBrief: string;
  /** Manifest only (ignored for other areas). */
  practiceAction: GuidePracticeAction;
  status: GuideStatus;
};

function blankDraft(area: GuideArea = "meditate"): GuideDraft {
  return {
    area,
    title: "",
    slug: "",
    summary: "",
    category: "",
    coverImageUrl: null,
    body: "",
    practiceBrief: "",
    practiceAction: "lifeArea",
    status: "draft",
  };
}

function draftFromGuide(g: AdminGuide): GuideDraft {
  return {
    id: g.id,
    area: g.area,
    title: g.title,
    slug: g.slug,
    summary: g.summary,
    category: g.category,
    coverImageUrl: g.coverImageUrl,
    body: g.body,
    practiceBrief: g.practiceBrief,
    practiceAction: g.practiceAction ?? "lifeArea",
    status: g.status,
  };
}

function sortGuides(list: AdminGuide[]): AdminGuide[] {
  return [...list].sort(
    (a, b) =>
      a.area.localeCompare(b.area) ||
      a.order - b.order ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

function draftHasContent(d: GuideDraft, liveBody: string): boolean {
  const body = (liveBody || d.body)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return Boolean(
    d.title.trim() ||
      d.slug.trim() ||
      d.summary.trim() ||
      d.category.trim() ||
      d.practiceBrief.trim() ||
      d.coverImageUrl ||
      body,
  );
}

function fillSummaryForPaste(g: GuidePasteGuide): string {
  const fields = [
    "slug",
    "title",
    "category",
    "status",
    "body",
    "practice brief",
  ];
  if (g.image) fields.push("cover image");
  return `Filled ${fields.join(", ")}. Try this: ${g.tryThisSteps.length} steps. Body: ${g.body.length} characters.`;
}

function pasteGuideToSaveInput(
  g: GuidePasteGuide,
  area: GuideArea,
  existingId?: string,
): Parameters<typeof saveAdminGuide>[0] {
  return {
    ...(existingId ? { id: existingId } : {}),
    area,
    title: g.title,
    slug: g.slug,
    category: g.category,
    body: composeGuideBodyFromPaste(g),
    practiceBrief: composePracticeBriefFromPaste(g),
    ...(area === "manifest" ? { practiceAction: "lifeArea" as const } : {}),
    status: g.draft ? "draft" : "published",
    order: g.order,
    ...(g.image !== null ? { coverImageUrl: g.image } : {}),
  };
}

export function AdminGuidesPanel() {
  const [guides, setGuides] = useState<AdminGuide[]>([]);
  const [filter, setFilter] = useState<AreaFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<GuideDraft>(blankDraft());
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverKind, setCoverKind] = useState<"upload" | "generate" | null>(
    null,
  );
  const [coverDirection, setCoverDirection] = useState("");
  const [coverBulkBusy, setCoverBulkBusy] = useState(false);
  const coverBulkAbortRef = useRef(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [seedBusy, setSeedBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [editorNonce, setEditorNonce] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteErrors, setPasteErrors] = useState<GuidePasteIssue[] | null>(
    null,
  );
  const [pasteWarnings, setPasteWarnings] = useState<GuidePasteIssue[]>([]);
  const [pasteChoices, setPasteChoices] = useState<GuidePasteGuide[] | null>(
    null,
  );
  const [pasteFillNote, setPasteFillNote] = useState<string | null>(null);
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState("");
  const [bulkPasteArea, setBulkPasteArea] = useState<GuideArea>("meditate");
  const [bulkPasteErrors, setBulkPasteErrors] = useState<
    GuidePasteIssue[] | null
  >(null);
  const [bulkPasteWarnings, setBulkPasteWarnings] = useState<
    GuidePasteIssue[]
  >([]);
  const [bulkPasteBusy, setBulkPasteBusy] = useState(false);
  const [bulkPasteStatus, setBulkPasteStatus] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const liveBodyRef = useRef(draft.body);
  const liveEditorDocRef = useRef("new");
  const editorDocId =
    selectedId === "new"
      ? `new-${editorNonce}`
      : (selectedId ?? `empty-${editorNonce}`);
  liveEditorDocRef.current = editorDocId;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGuides(sortGuides(await fetchAdminGuides()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load guides");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (filter === "meditate" || filter === "journal" || filter === "manifest") {
      setBulkPasteArea(filter);
    }
  }, [filter]);

  const selected = useMemo(
    () =>
      selectedId && selectedId !== "new"
        ? (guides.find((g) => g.id === selectedId) ?? null)
        : null,
    [guides, selectedId],
  );

  const visible = useMemo(
    () => (filter === "all" ? guides : guides.filter((g) => g.area === filter)),
    [guides, filter],
  );

  const categorySuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const g of guides) if (g.category.trim()) set.add(g.category.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [guides]);

  function startNew() {
    const next = blankDraft(
      filter === "journal" || filter === "manifest" ? filter : "meditate",
    );
    setSelectedId("new");
    setDraft(next);
    liveBodyRef.current = next.body;
    setEditorNonce((n) => n + 1);
    setSlugTouched(false);
    setStatus(null);
  }

  function selectGuide(id: string) {
    if (id === selectedId) return;
    const g = guides.find((x) => x.id === id);
    const next = g ? draftFromGuide(g) : blankDraft();
    setSelectedId(id);
    setDraft(next);
    liveBodyRef.current = next.body;
    setEditorNonce((n) => n + 1);
    setSlugTouched(Boolean(g));
    setStatus(null);
  }

  function onTitleChange(title: string) {
    setDraft((d) => ({
      ...d,
      title,
      slug: slugTouched ? d.slug : slugify(title),
    }));
  }

  function applyPasteGuide(g: GuidePasteGuide, extraWarnings: GuidePasteIssue[]) {
    const body = composeGuideBodyFromPaste(g);
    const practiceBrief = composePracticeBriefFromPaste(g);
    setDraft((d) => ({
      ...d,
      title: g.title,
      slug: g.slug,
      category: g.category,
      body,
      practiceBrief,
      status: g.draft ? "draft" : "published",
      coverImageUrl: g.image === null ? d.coverImageUrl : g.image,
    }));
    liveBodyRef.current = body;
    setEditorNonce((n) => n + 1);
    setSlugTouched(true);
    setPasteChoices(null);
    setPasteErrors(null);
    setPasteWarnings(extraWarnings);
    setPasteFillNote(fillSummaryForPaste(g));
    setStatus(null);
  }

  function onFillFromPaste() {
    setPasteFillNote(null);
    setPasteChoices(null);
    const parsed = parseGuidePaste(pasteText);
    if ("errors" in parsed) {
      setPasteErrors(parsed.errors);
      setPasteWarnings([]);
      return;
    }
    setPasteErrors(null);

    const withSlugWarnings = (g: GuidePasteGuide): GuidePasteIssue[] => {
      const clash = guides.find(
        (x) =>
          x.slug === g.slug &&
          x.area === draftRef.current.area &&
          x.id !== draftRef.current.id,
      );
      if (!clash) return [];
      return [
        {
          line: g.startLine,
          message: `Slug “${g.slug}” already exists for “${clash.title}”`,
        },
      ];
    };

    if (parsed.guides.length > 1) {
      setPasteChoices(parsed.guides);
      setPasteWarnings(parsed.warnings);
      return;
    }

    const g = parsed.guides[0];
    if (!g) {
      setPasteErrors([{ line: 1, message: "No guide found in paste" }]);
      return;
    }
    const warnings = [...parsed.warnings, ...withSlugWarnings(g)];
    if (
      draftHasContent(draftRef.current, liveBodyRef.current) &&
      !window.confirm(
        "This guide already has content. Overwrite the editor fields with the paste?",
      )
    ) {
      setPasteWarnings(warnings);
      return;
    }
    applyPasteGuide(g, warnings);
  }

  function onChoosePasteGuide(g: GuidePasteGuide) {
    const clash = guides.find(
      (x) =>
        x.slug === g.slug &&
        x.area === draftRef.current.area &&
        x.id !== draftRef.current.id,
    );
    const warnings: GuidePasteIssue[] = [...pasteWarnings];
    if (clash) {
      warnings.push({
        line: g.startLine,
        message: `Slug “${g.slug}” already exists for “${clash.title}”`,
      });
    }
    if (
      draftHasContent(draftRef.current, liveBodyRef.current) &&
      !window.confirm(
        "This guide already has content. Overwrite the editor fields with the paste?",
      )
    ) {
      return;
    }
    applyPasteGuide(g, warnings);
  }

  async function onSave() {
    const d = draftRef.current;
    if (!d.title.trim()) {
      setStatus("Title is required.");
      return;
    }
    const bodyHasText = (b: string) =>
      b.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").trim().length > 0;
    const bodyToSave =
      [liveBodyRef.current, d.body].find(bodyHasText) || d.body;
    setBusy(true);
    setStatus(null);
    try {
      const saved = await saveAdminGuide({
        ...(d.id ? { id: d.id } : {}),
        area: d.area,
        title: d.title,
        slug: d.slug || slugify(d.title),
        summary: d.summary,
        category: d.category,
        coverImageUrl: d.coverImageUrl,
        body: bodyToSave,
        practiceBrief: d.practiceBrief,
        ...(d.area === "manifest" ? { practiceAction: d.practiceAction } : {}),
        status: d.status,
      });
      setGuides((prev) =>
        sortGuides([...prev.filter((g) => g.id !== saved.id), saved]),
      );
      setSelectedId(saved.id);
      const next = draftFromGuide({
        ...saved,
        body: bodyHasText(saved.body) ? saved.body : bodyToSave,
      });
      setDraft(next);
      liveBodyRef.current = next.body;
      setEditorNonce((n) => n + 1);
      setSlugTouched(true);
      invalidateGuidesCache();
      setStatus(
        saved.status === "published" ? "Saved & published." : "Saved as draft.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!draft.id) return;
    if (!window.confirm(`Delete “${draft.title || "this guide"}”?`)) return;
    setBusy(true);
    setStatus(null);
    try {
      await deleteAdminGuide(draft.id);
      setSelectedId(null);
      setDraft(blankDraft());
      invalidateGuidesCache();
      await refresh();
      setStatus("Deleted.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCoverSelected(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Choose an image file (JPEG, PNG, or WebP).");
      return;
    }
    setCoverBusy(true);
    setCoverKind("upload");
    setStatus(null);
    try {
      const { dataUrl, mimeType } = await fileToCompressedJpegDataUrl(file);
      const { url } = await uploadAdminGuideCover({
        imageBase64: dataUrl,
        mimeType,
      });
      setDraft((d) => ({ ...d, coverImageUrl: url }));
      setStatus("Cover uploaded — Save to keep it.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setCoverBusy(false);
      setCoverKind(null);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  async function onGenerateCover() {
    const d = draftRef.current;
    if (!d.title.trim()) {
      setStatus("Add a title before generating a cover.");
      return;
    }
    setCoverBusy(true);
    setCoverKind("generate");
    setStatus(null);
    try {
      const { url } = await generateAdminGuideCover({
        title: d.title.trim(),
        summary: d.summary,
        category: d.category,
        direction: coverDirection,
      });
      setDraft((prev) => ({ ...prev, coverImageUrl: url }));
      setStatus("Cover generated — Save to keep it.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Cover generation failed");
    } finally {
      setCoverBusy(false);
      setCoverKind(null);
    }
  }

  async function generateMissingCovers() {
    const queue = guides.filter((g) => !g.coverImageUrl);
    if (queue.length === 0 || coverBulkBusy || coverBusy) return;
    if (
      !window.confirm(
        `Generate a cover for ${queue.length} guide${queue.length === 1 ? "" : "s"} that do not have one? Each cover is saved on that guide.`,
      )
    ) {
      return;
    }
    coverBulkAbortRef.current = false;
    setCoverBulkBusy(true);
    setStatus(null);
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < queue.length; i += 1) {
      if (coverBulkAbortRef.current) break;
      const guide = queue[i]!;
      setStatus(`Cover ${i + 1} of ${queue.length}: ${guide.title}`);
      try {
        const { url } = await generateAdminGuideCover({
          title: guide.title,
          summary: guide.summary,
          category: guide.category,
        });
        const saved = await saveAdminGuide({ id: guide.id, coverImageUrl: url });
        setGuides((prev) =>
          sortGuides(prev.map((g) => (g.id === saved.id ? saved : g))),
        );
        if (draftRef.current.id === saved.id) {
          setDraft((prev) => ({ ...prev, coverImageUrl: saved.coverImageUrl }));
        }
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    invalidateGuidesCache();
    setStatus(
      coverBulkAbortRef.current
        ? `Stopped — ${ok} covers saved, ${fail} failed.`
        : `Done — ${ok} covers saved, ${fail} failed.`,
    );
    setCoverBulkBusy(false);
  }

  async function onMove(id: string, dir: -1 | 1) {
    const target = guides.find((g) => g.id === id);
    if (!target) return;
    const inArea = guides.filter((g) => g.area === target.area);
    const idx = inArea.findIndex((g) => g.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= inArea.length) return;
    const ids = inArea.map((g) => g.id);
    [ids[idx], ids[swapIdx]] = [ids[swapIdx]!, ids[idx]!];
    setReorderBusy(true);
    setStatus(null);
    // Optimistic: re-number this area in the new order.
    setGuides((prev) =>
      sortGuides(
        prev.map((g) =>
          g.area === target.area ? { ...g, order: ids.indexOf(g.id) } : g,
        ),
      ),
    );
    try {
      const next = await reorderAdminGuides(ids);
      setGuides(sortGuides(next));
      invalidateGuidesCache();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Reorder failed");
      await refresh();
    } finally {
      setReorderBusy(false);
    }
  }

  async function onSeed() {
    if (
      !window.confirm(
        `Seed ${STATIC_GUIDE_SEED.length} guides from the original static copy?\n\n` +
          "Guides with the same area + slug are overwritten (title, body, cover, order). " +
          "New guides are created as drafts; existing publish status is kept.",
      )
    ) {
      return;
    }
    setSeedBusy(true);
    setStatus(null);
    try {
      const { seeded, guides: next } = await seedAdminGuides(
        STATIC_GUIDE_SEED,
        { upsert: true },
      );
      setGuides(sortGuides(next));
      invalidateGuidesCache();
      setStatus(`Seeded ${seeded} guide${seeded === 1 ? "" : "s"}.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setSeedBusy(false);
    }
  }

  async function onBulkCreateFromPaste() {
    setBulkPasteStatus(null);
    const parsed = parseGuidePaste(bulkPasteText);
    if ("errors" in parsed) {
      setBulkPasteErrors(parsed.errors);
      setBulkPasteWarnings([]);
      return;
    }
    setBulkPasteErrors(null);
    setBulkPasteWarnings(parsed.warnings);

    setBulkPasteBusy(true);
    let latest: AdminGuide[];
    try {
      // Fresh list so slug matches update the right rows.
      latest = sortGuides(await fetchAdminGuides());
      setGuides(latest);
    } catch (e) {
      setBulkPasteBusy(false);
      setBulkPasteStatus(
        e instanceof Error ? e.message : "Could not load guides",
      );
      return;
    }
    setBulkPasteBusy(false);

    const area = bulkPasteArea;
    const plans = parsed.guides.map((g) => {
      const slug = g.slug.trim().toLowerCase();
      const existing = latest.find(
        (x) => x.area === area && x.slug.trim().toLowerCase() === slug,
      );
      return { g, existing };
    });
    const updates = plans.filter((p) => p.existing);
    const creates = plans.filter((p) => !p.existing);
    const lines = plans.map(
      (p) =>
        `• ${p.g.title} (${p.g.slug})${
          p.existing ? ` — update “${p.existing.title}”` : " — create new"
        }`,
    );
    const ok = window.confirm(
      `${AREA_LABEL[area]}: ${creates.length} new, ${updates.length} update${
        updates.length === 1 ? "" : "s"
      }.\n\n` + lines.join("\n"),
    );
    if (!ok) return;

    setBulkPasteBusy(true);
    try {
      const savedList: AdminGuide[] = [];
      for (const { g, existing } of plans) {
        // Pass id so save patches the existing guide instead of creating another.
        const saved = await saveAdminGuide(
          pasteGuideToSaveInput(g, area, existing?.id),
        );
        savedList.push(saved);
      }
      setGuides((prev) => {
        const byId = new Map(prev.map((x) => [x.id, x]));
        for (const s of savedList) byId.set(s.id, s);
        return sortGuides([...byId.values()]);
      });
      invalidateGuidesCache();
      const last = savedList[savedList.length - 1];
      if (last) {
        setSelectedId(last.id);
        const next = draftFromGuide(last);
        setDraft(next);
        liveBodyRef.current = next.body;
        setEditorNonce((n) => n + 1);
        setSlugTouched(true);
      }
      const parts: string[] = [];
      if (creates.length) parts.push(`created ${creates.length}`);
      if (updates.length) parts.push(`updated ${updates.length}`);
      setBulkPasteStatus(parts.length ? `${parts.join(", ")}.` : "No guides saved.");
      setBulkPasteText("");
    } catch (e) {
      setBulkPasteStatus(
        e instanceof Error ? e.message : "Could not create guides from paste",
      );
      await refresh();
    } finally {
      setBulkPasteBusy(false);
    }
  }

  const editing = selectedId === "new" || Boolean(selected);
  const liveMinutes = estimateGuideReadMinutes(draft.body);
  const publicPath = `${guidesBasePath(draft.area)}/${draft.slug || "…"}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card">
        <button
          type="button"
          aria-expanded={bulkPasteOpen}
          onClick={() => setBulkPasteOpen((o) => !o)}
          className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left sm:px-5"
        >
          <span className="text-sm font-medium text-foreground">
            Paste guides
          </span>
          <ChevronDown
            aria-hidden
            className={`size-4 shrink-0 text-muted transition-transform ${
              bulkPasteOpen ? "rotate-180" : ""
            }`}
            strokeWidth={2}
          />
        </button>
        {bulkPasteOpen ? (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:px-5">
            <p className="text-xs text-muted">
              Paste one or more{" "}
              <span className="font-mono">=== GUIDE ===</span> blocks. Matching
              slugs in the chosen area update that guide; new slugs create
              pages.
            </p>
            <div>
              <label className="block text-xs font-medium text-muted">
                Area
              </label>
              <select
                value={bulkPasteArea}
                disabled={bulkPasteBusy}
                onChange={(e) =>
                  setBulkPasteArea(guideAreaFromValue(e.target.value))
                }
                className={INPUT_CLASS}
              >
                {(Object.keys(AREA_LABEL) as GuideArea[]).map((a) => (
                  <option key={a} value={a}>
                    {AREA_LABEL[a]}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={bulkPasteText}
              disabled={bulkPasteBusy}
              onChange={(e) => {
                setBulkPasteText(e.target.value);
                setBulkPasteErrors(null);
                setBulkPasteStatus(null);
              }}
              rows={12}
              className={`${INPUT_CLASS} resize-y font-mono text-[12px] leading-relaxed`}
              placeholder={"=== GUIDE ===\n…\n=== END ===\n\n=== GUIDE ===\n…\n=== END ==="}
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={bulkPasteBusy || !bulkPasteText.trim()}
                onClick={() => void onBulkCreateFromPaste()}
                className="rounded-lg accent-fill-gradient px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
              >
                {bulkPasteBusy ? "Creating…" : "Create guides"}
              </button>
            </div>
            {bulkPasteErrors?.length ? (
              <ul
                className="rounded-lg border border-danger/40 bg-background px-3 py-2 text-xs text-danger"
                role="alert"
              >
                {bulkPasteErrors.map((err, i) => (
                  <li key={`${err.line}-${i}`}>
                    Line {err.line}: {err.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {bulkPasteWarnings.length ? (
              <ul className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted">
                {bulkPasteWarnings.map((w, i) => (
                  <li key={`${w.line}-${i}`}>
                    Line {w.line}: {w.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {bulkPasteStatus ? (
              <p className="text-xs text-muted" role="status">
                {bulkPasteStatus}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 lg:w-72">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-medium text-foreground">
            Guides
          </h2>
          <button
            type="button"
            onClick={startNew}
            className="rounded-lg accent-fill-gradient px-3 py-1.5 text-sm font-semibold text-on-accent"
          >
            New
          </button>
        </div>
        <button
          type="button"
          disabled={
            coverBulkBusy ||
            coverBusy ||
            loading ||
            guides.every((g) => Boolean(g.coverImageUrl))
          }
          onClick={() => void generateMissingCovers()}
          className="mt-3 w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-card disabled:opacity-50"
        >
          {coverBulkBusy
            ? "Generating covers…"
            : `Generate missing covers (${guides.filter((g) => !g.coverImageUrl).length})`}
        </button>
        {coverBulkBusy ? (
          <button
            type="button"
            onClick={() => {
              coverBulkAbortRef.current = true;
            }}
            className="mt-2 text-xs font-medium text-muted underline"
          >
            Stop
          </button>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by area">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`cursor-pointer rounded-full px-3 py-1 text-xs ${
                filter === f.id
                  ? "bg-selected font-medium text-on-selected"
                  : "border border-border text-muted hover:bg-card"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted">Loading…</p>
        ) : error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : visible.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No guides yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-1">
            {visible.map((g) => {
              const active = selectedId === g.id;
              const inArea = guides.filter((x) => x.area === g.area);
              const idx = inArea.findIndex((x) => x.id === g.id);
              return (
                <li key={g.id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => selectGuide(g.id)}
                    className={`min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      active
                        ? "bg-selected text-on-selected"
                        : "hover:bg-accent-soft/40"
                    }`}
                  >
                    <span className="block truncate text-sm font-medium">
                      {g.title}
                    </span>
                    <span
                      className={`mt-0.5 block truncate text-[11px] ${
                        active ? "text-on-selected/70" : "text-muted"
                      }`}
                    >
                      {g.area} · {g.category || "—"} · {g.status}
                    </span>
                  </button>
                  <span className="flex shrink-0 flex-col justify-center">
                    <button
                      type="button"
                      aria-label={`Move ${g.title} up`}
                      disabled={reorderBusy || idx <= 0}
                      onClick={() => void onMove(g.id, -1)}
                      className="cursor-pointer px-1.5 text-xs leading-none text-muted hover:text-foreground disabled:cursor-default disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${g.title} down`}
                      disabled={reorderBusy || idx < 0 || idx >= inArea.length - 1}
                      onClick={() => void onMove(g.id, 1)}
                      className="cursor-pointer px-1.5 text-xs leading-none text-muted hover:text-foreground disabled:cursor-default disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 border-t border-border pt-4">
          <button
            type="button"
            disabled={seedBusy || loading}
            onClick={() => void onSeed()}
            className={OUTLINE_BTN_CLASS}
          >
            {seedBusy ? "Seeding…" : "Seed from static"}
          </button>
          <p className="mt-1.5 text-[11px] text-muted">
            Imports the original placeholder guides (upsert by area + slug).
          </p>
        </div>
      </aside>

      <section className="min-w-0 flex-1 rounded-xl border border-border bg-card p-4 sm:p-6">
        {!editing ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">
              Select a guide or create a new one. Published guides appear on the
              Meditate and Journal overviews and guide indexes.
            </p>
            {status ? (
              <p className="text-sm text-muted" role="status">
                {status}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-medium text-foreground">
                {draft.id ? "Edit guide" : "New guide"}
              </h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSave()}
                className="rounded-lg accent-fill-gradient px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>

            <div className="rounded-lg border border-border bg-background">
              <button
                type="button"
                aria-expanded={pasteOpen}
                onClick={() => setPasteOpen((o) => !o)}
                className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <span className="text-xs font-medium text-foreground">
                  Paste guide
                </span>
                <ChevronDown
                  aria-hidden
                  className={`size-4 shrink-0 text-muted transition-transform ${
                    pasteOpen ? "rotate-180" : ""
                  }`}
                  strokeWidth={2}
                />
              </button>
              {pasteOpen ? (
                <div className="flex flex-col gap-2 border-t border-border px-3 py-3">
                  <label className="block text-xs font-medium text-muted">
                    Paste one or more guides, then fill the fields below.
                    Nothing is saved until you press Save.
                  </label>
                  <textarea
                    value={pasteText}
                    onChange={(e) => {
                      setPasteText(e.target.value);
                      setPasteErrors(null);
                      setPasteFillNote(null);
                    }}
                    rows={10}
                    className={`${INPUT_CLASS} mt-0 resize-y font-mono text-[12px] leading-relaxed`}
                    placeholder="=== GUIDE === … === END ==="
                    spellCheck={false}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!pasteText.trim()}
                      onClick={onFillFromPaste}
                      className={OUTLINE_BTN_CLASS}
                    >
                      Fill fields
                    </button>
                  </div>
                  {pasteChoices && pasteChoices.length > 1 ? (
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-xs font-medium text-foreground">
                        This paste has {pasteChoices.length} guides. Choose one
                        to load into this editor:
                      </p>
                      <ul className="mt-2 flex flex-col gap-1">
                        {pasteChoices.map((g) => (
                          <li key={`${g.startLine}-${g.slug}`}>
                            <button
                              type="button"
                              onClick={() => onChoosePasteGuide(g)}
                              className="w-full cursor-pointer rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-surface"
                            >
                              <span className="font-medium text-foreground">
                                {g.title}
                              </span>
                              <span className="mt-0.5 block font-mono text-[11px] text-muted">
                                {g.slug}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {pasteErrors?.length ? (
                    <ul
                      className="rounded-lg border border-danger/40 bg-card px-3 py-2 text-xs text-danger"
                      role="alert"
                    >
                      {pasteErrors.map((e, i) => (
                        <li key={`${e.line}-${i}`}>
                          Line {e.line}: {e.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {pasteWarnings.length ? (
                    <ul className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted">
                      {pasteWarnings.map((w, i) => (
                        <li key={`${w.line}-${i}`}>
                          Line {w.line}: {w.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {pasteFillNote ? (
                    <p className="text-xs text-muted" role="status">
                      {pasteFillNote}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                Title
              </label>
              <input
                value={draft.title}
                onChange={(e) => onTitleChange(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Guide title"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                Slug
              </label>
              <input
                value={draft.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setDraft((d) => ({
                    ...d,
                    slug: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]+/g, "-"),
                  }));
                }}
                className={`${INPUT_CLASS} font-mono`}
                placeholder="url-slug"
              />
              <p className="mt-1 text-[11px] text-muted">
                Public URL: {publicPath}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-muted">
                  Area
                </label>
                <select
                  value={draft.area}
                  disabled={busy}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      area: guideAreaFromValue(e.target.value),
                    }))
                  }
                  className={INPUT_CLASS}
                >
                  {(Object.keys(AREA_LABEL) as GuideArea[]).map((a) => (
                    <option key={a} value={a}>
                      {AREA_LABEL[a]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted">
                  Category
                </label>
                <input
                  list="admin-guide-categories"
                  value={draft.category}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, category: e.target.value }))
                  }
                  className={INPUT_CLASS}
                  placeholder="Basics, Practice…"
                />
                <datalist id="admin-guide-categories">
                  {categorySuggestions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                Summary{" "}
                <span className="font-normal text-muted/80">
                  (shown on guide cards)
                </span>
              </label>
              <textarea
                value={draft.summary}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, summary: e.target.value }))
                }
                rows={2}
                maxLength={600}
                className={`${INPUT_CLASS} resize-y`}
                placeholder="One or two lines"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                Cover image
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {draft.coverImageUrl ? (
                  <img
                    key={draft.coverImageUrl}
                    src={draft.coverImageUrl}
                    alt="Cover preview"
                    className="h-20 w-32 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-32 items-center justify-center rounded-lg border border-dashed border-border bg-background text-[11px] text-muted">
                    No cover
                  </div>
                )}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) =>
                    void onCoverSelected(e.target.files?.[0] ?? null)
                  }
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={coverBusy || busy || coverBulkBusy}
                    onClick={() => coverInputRef.current?.click()}
                    className={OUTLINE_BTN_CLASS}
                  >
                    {coverKind === "upload"
                      ? "Uploading…"
                      : draft.coverImageUrl
                        ? "Replace"
                        : "Upload"}
                  </button>
                  <button
                    type="button"
                    disabled={coverBusy || busy || coverBulkBusy}
                    onClick={() => void onGenerateCover()}
                    className={OUTLINE_BTN_CLASS}
                    title="Draw a cover from the title and summary"
                  >
                    {coverKind === "generate" ? "Generating…" : "Generate"}
                  </button>
                  <input
                    type="text"
                    value={coverDirection}
                    disabled={coverBusy || busy || coverBulkBusy}
                    onChange={(e) => setCoverDirection(e.target.value)}
                    placeholder="Optional direction"
                    className="h-8 min-w-[10rem] flex-1 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
                  />
                  {draft.coverImageUrl ? (
                    <button
                      type="button"
                      disabled={coverBusy || busy || coverBulkBusy}
                      onClick={() =>
                        setDraft((d) => ({ ...d, coverImageUrl: null }))
                      }
                      className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                Body
              </label>
              <div className="mt-1">
                <ReadRichEditor
                  key={editorDocId}
                  docId={editorDocId}
                  initialHtml={bodyToEditorHtml(draft.body)}
                  placeholder="Write the guide…"
                  onHtmlChange={(html, fromDoc) => {
                    if (fromDoc !== liveEditorDocRef.current) return;
                    liveBodyRef.current = html;
                    setDraft((d) => ({ ...d, body: html }));
                  }}
                  linkPosts={guides
                    .filter((g) => g.id !== draft.id)
                    .map((g) => ({
                      id: g.id,
                      title: g.title,
                      slug: `${guidesBasePath(g.area)}/${g.slug}`,
                      published: g.status === "published",
                    }))}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                Heading 2 entries feed the “In this guide” contents list. Use
                blockquote for pull quotes.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                Practice brief{" "}
                <span className="font-normal text-muted/80">(optional)</span>
              </label>
              <textarea
                value={draft.practiceBrief}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, practiceBrief: e.target.value }))
                }
                rows={3}
                maxLength={2000}
                className={`${INPUT_CLASS} resize-y`}
                placeholder="A 5-minute sit for a busy mind"
              />
              <p className="mt-1 text-[11px] text-muted">
                Optional. Meditate: pre-fills Create’s brief. Journal: becomes
                the entry prompt. Manifest: see Practice action. First line is
                the card title.
              </p>
            </div>

            {draft.area === "manifest" ? (
              <div>
                <label className="block text-xs font-medium text-muted">
                  Practice action
                </label>
                <select
                  value={draft.practiceAction}
                  disabled={busy}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      practiceAction:
                        e.target.value === "create" ? "create" : "lifeArea",
                    }))
                  }
                  className={INPUT_CLASS}
                >
                  {(Object.keys(PRACTICE_ACTION_LABEL) as GuidePracticeAction[]).map(
                    (a) => (
                      <option key={a} value={a}>
                        {PRACTICE_ACTION_LABEL[a]}
                      </option>
                    ),
                  )}
                </select>
                <p className="mt-1 text-[11px] text-muted">
                  What the “Put it into practice” button does for this guide.
                </p>
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-medium text-muted">
                Status
              </label>
              <select
                value={draft.status}
                disabled={busy}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    status: e.target.value === "published" ? "published" : "draft",
                  }))
                }
                className={`${INPUT_CLASS} max-w-xs`}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted sm:grid-cols-4">
              <div>
                <dt className="font-medium">Read time</dt>
                <dd>{liveMinutes} min</dd>
              </div>
              <div>
                <dt className="font-medium">Last updated</dt>
                <dd>{formatWhen(selected?.updatedAt)}</dd>
              </div>
              <div>
                <dt className="font-medium">Helpful · yes</dt>
                <dd>{selected?.helpfulYes ?? 0}</dd>
              </div>
              <div>
                <dt className="font-medium">Helpful · no</dt>
                <dd>{selected?.helpfulNo ?? 0}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSave()}
                className="rounded-lg accent-fill-gradient px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
              {draft.id ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDelete()}
                  className="rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-danger disabled:opacity-50"
                >
                  Delete
                </button>
              ) : null}
              {selected?.status === "published" && selected.slug ? (
                <a
                  href={`${guidesBasePath(selected.area)}/${encodeURIComponent(selected.slug)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
                >
                  View
                </a>
              ) : null}
            </div>
            {status ? (
              <p className="text-sm text-muted" role="status">
                {status}
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
    </div>
  );
}
