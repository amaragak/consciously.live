import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackFromBlogNarration } from "@consciously/common";
import {
  clearAdminBlogAuthorPhoto,
  deleteAdminBlogPost,
  fetchAdminBlog,
  generateAdminBlogAudio,
  generateAdminBlogCoverOptions,
  generateAdminBlogCoverPrompt,
  resolveAdminBlogListenSlug,
  saveAdminBlogPost,
  saveAdminBlogSettings,
  uploadAdminBlogAuthorPhoto,
  uploadAdminBlogCoverImage,
  type AdminBlogCoverOption,
  type AdminBlogListenPreview,
  type AdminBlogPost,
} from "@/lib/medimade-api";
import { useLibraryPlayer } from "@/components/library-player-provider";
import {
  ReadRichEditor,
  bodyToEditorHtml,
} from "@/components/read-rich-editor";
import {
  MEDITATION_TYPE_PILL_CLASS,
  meditationTypePillColors,
} from "@/lib/meditation-type-pill";
import {
  BLOG_PUBLIC_CATEGORIES,
  DEFAULT_BLOG_CATEGORY,
  normalizeBlogCategory,
} from "@/lib/blog-categories";

function blogReadMinutes(body: string): number {
  const text = body
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return 1;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/** Plain essay text for cover-prompt generation (whole piece, not just the lede). */
function essayPlainTextFromBody(body: string): string {
  return body
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

const DEFAULT_INDEX_SUMMARY = "Essays and updates from Consciously.";

/** Models write an em dash; Read posts store a normal hyphen. */
function replaceAiLongHyphen(text: string): string {
  return text.replace(/\u2014|&mdash;|&#8212;|&#x2014;/gi, "-");
}

async function fileToCompressedJpegDataUrl(file: File): Promise<{
  dataUrl: string;
  mimeType: string;
}> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1200;
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
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { dataUrl, mimeType: "image/jpeg" };
}

function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "post"
  );
}

type BlogDraft = Omit<AdminBlogPost, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

function blankDraft(): BlogDraft {
  return {
    slug: "",
    title: "",
    subheader: "",
    excerpt: "",
    tags: [],
    category: DEFAULT_BLOG_CATEGORY,
    series: "",
    part: null,
    notes: "",
    body: "",
    published: false,
    pinned: false,
    topPicks: false,
    startHere: false,
    coverImageUrl: null,
    coverImageKey: null,
    listenSlug: null,
    listenCardLabel: "From Listen",
    publishedAt: null,
    audioUrl: null,
    audioStatus: "none",
    audioError: null,
    audioGeneratedAt: null,
    audioProgress: null,
    audioStartedAt: null,
    audioTtsProvider: "speechify",
  };
}

function draftFromPost(post: AdminBlogPost): BlogDraft {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    subheader: post.subheader,
    excerpt: post.excerpt,
    tags: post.tags,
    category: post.category ?? DEFAULT_BLOG_CATEGORY,
    series: post.series,
    part: post.part,
    notes: post.notes ?? "",
    body: post.body,
    published: post.published,
    pinned: post.pinned,
    topPicks: post.topPicks,
    startHere: post.startHere,
    coverImageUrl: post.coverImageUrl,
    coverImageKey: post.coverImageKey,
    listenSlug: post.listenSlug,
    listenCardLabel: post.listenCardLabel || "From Listen",
    publishedAt: post.publishedAt,
    audioUrl: post.audioUrl,
    audioStatus: post.audioStatus,
    audioError: post.audioError,
    audioGeneratedAt: post.audioGeneratedAt,
    audioProgress: post.audioProgress,
    audioStartedAt: post.audioStartedAt,
    audioTtsProvider: post.audioTtsProvider ?? "speechify",
  };
}

function formatElapsedSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function editorDocKey(id: string | "new" | null, nonce: number): string {
  return id && id !== "new" ? `${id}:${nonce}` : `new:${nonce}`;
}

function BlogTagsInput({
  tags,
  onChange,
  disabled,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function addTag() {
    const t = draft.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!t) return;
    const key = t.toLowerCase();
    if (tags.some((x) => x.toLowerCase() === key)) {
      setDraft("");
      return;
    }
    onChange([...tags, t].slice(0, 12));
    setDraft("");
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => {
        const colors = meditationTypePillColors(tag);
        return (
          <span
            key={tag.toLowerCase()}
            className={`inline-flex items-center gap-0.5 ${MEDITATION_TYPE_PILL_CLASS} pr-1`}
            style={{ backgroundColor: colors.bg, color: colors.fg }}
          >
            {tag}
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remove ${tag}`}
              onClick={() =>
                onChange(
                  tags.filter((x) => x.toLowerCase() !== tag.toLowerCase()),
                )
              }
              className="cursor-pointer rounded px-1 opacity-70 hover:opacity-100 disabled:opacity-50"
              style={{ color: colors.fg }}
            >
              ×
            </button>
          </span>
        );
      })}
      <input
        type="text"
        value={draft}
        disabled={disabled || tags.length >= 12}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag();
          }
          if (e.key === "Backspace" && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        aria-label="Add a tag"
        placeholder={tags.length ? "Add another" : "Add a tag"}
        className="min-w-[8rem] flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-accent/50 disabled:opacity-50"
      />
    </div>
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

export function AdminReadPanel() {
  const { playTrack, toggleCurrent, nowPlaying, playingS3Key } =
    useLibraryPlayer();
  const [posts, setPosts] = useState<AdminBlogPost[]>([]);
  const [indexSummary, setIndexSummary] = useState(DEFAULT_INDEX_SUMMARY);
  const [authorPhotoUrl, setAuthorPhotoUrl] = useState<string | null>(null);
  const [authorPhotoEnabled, setAuthorPhotoEnabled] = useState(false);
  const [indexSummaryBusy, setIndexSummaryBusy] = useState(false);
  const [indexSummaryStatus, setIndexSummaryStatus] = useState<string | null>(
    null,
  );
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState(blankDraft());
  const [editorNonce, setEditorNonce] = useState(0);
  const liveEditorDocRef = useRef(editorDocKey(null, 0));
  /** TipTap updates draft via setState — keep a sync ref so Save never races empty body. */
  const liveBodyRef = useRef("");
  /** Always-current draft for Save (checkbox/select then Save before re-render). */
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioTick, setAudioTick] = useState(Date.now());
  const [status, setStatus] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState<"prompt" | "image" | null>(null);
  const [coverProgress, setCoverProgress] = useState<string | null>(null);
  const [coverPrompt, setCoverPrompt] = useState("");
  const [coverPromptNotes, setCoverPromptNotes] = useState("");
  const [coverOptions, setCoverOptions] = useState<AdminBlogCoverOption[]>([]);
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [listenBusy, setListenBusy] = useState(false);
  const [listenInput, setListenInput] = useState("");
  const [listenPreview, setListenPreview] =
    useState<AdminBlogListenPreview | null>(null);
  const [listenWarning, setListenWarning] = useState<string | null>(null);
  const [listenError, setListenError] = useState<string | null>(null);

  const startHereCount = useMemo(
    () => posts.filter((p) => p.startHere && p.id !== draft.id).length,
    [posts, draft.id],
  );
  const startHereTitles = useMemo(
    () =>
      posts
        .filter((p) => p.startHere && p.id !== draft.id)
        .map((p) => p.title),
    [posts, draft.id],
  );
  const otherCategoryPosts = useMemo(
    () => posts.filter((p) => p.category === "Other"),
    [posts],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { posts: list, settings } = await fetchAdminBlog();
      setPosts(list);
      setIndexSummary(settings.indexSummary || DEFAULT_INDEX_SUMMARY);
      setAuthorPhotoUrl(settings.authorPhotoUrl);
      setAuthorPhotoEnabled(settings.authorPhotoEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load posts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = useMemo(
    () =>
      selectedId && selectedId !== "new"
        ? posts.find((p) => p.id === selectedId) ?? null
        : null,
    [posts, selectedId],
  );

  function resetCoverListenUi(post?: AdminBlogPost | null) {
    setCoverProgress(null);
    setCoverBusy(null);
    setCoverPrompt("");
    setCoverPromptNotes("");
    setCoverOptions([]);
    setCoverError(null);
    setListenBusy(false);
    setListenInput(post?.listenSlug ?? "");
    setListenPreview(null);
    setListenWarning(null);
    setListenError(null);
  }

  function startNew() {
    const nextNonce = editorNonce + 1;
    liveEditorDocRef.current = editorDocKey("new", nextNonce);
    liveBodyRef.current = "";
    setSelectedId("new");
    setDraft(blankDraft());
    setSlugTouched(false);
    setStatus(null);
    setEditorNonce(nextNonce);
    resetCoverListenUi(null);
  }

  function selectPost(id: string) {
    if (id === selectedId) return;
    const post = posts.find((p) => p.id === id);
    const nextNonce = editorNonce + 1;
    liveEditorDocRef.current = editorDocKey(id, nextNonce);
    liveBodyRef.current = post?.body ?? "";
    setSelectedId(id);
    setDraft(post ? draftFromPost(post) : blankDraft());
    setSlugTouched(Boolean(post));
    setStatus(null);
    setEditorNonce(nextNonce);
    resetCoverListenUi(post ?? null);
  }

  async function onGenerateCoverPrompt() {
    setCoverBusy("prompt");
    setCoverError(null);
    setCoverProgress(
      coverPrompt.trim() && coverPromptNotes.trim()
        ? "Revising prompt…"
        : "Writing cover prompt…",
    );
    const bodyText = essayPlainTextFromBody(
      liveBodyRef.current || draft.body,
    );
    const previous = coverPrompt.trim();
    const notes = coverPromptNotes.trim();
    try {
      const { prompt } = await generateAdminBlogCoverPrompt({
        title: draft.title,
        subheader: draft.subheader,
        bodyText,
        ...(previous ? { previousPrompt: previous } : {}),
        ...(notes ? { revisionNotes: notes } : {}),
      });
      setCoverPrompt(prompt);
      if (notes) setCoverPromptNotes("");
      setStatus(
        previous && notes
          ? "Cover prompt revised — Generate image when ready."
          : "Cover prompt ready — Generate image when ready.",
      );
    } catch (e) {
      setCoverError(
        e instanceof Error ? e.message : "Cover prompt generation failed",
      );
    } finally {
      setCoverProgress(null);
      setCoverBusy(null);
    }
  }

  async function onGenerateCoverImages() {
    const prompt = coverPrompt.trim();
    if (!prompt) {
      setCoverError("Generate or write a prompt first, then generate images.");
      return;
    }
    setCoverBusy("image");
    setCoverError(null);
    setCoverProgress(null);
    // One image per request — API Gateway HTTP APIs time out at 30s; four
    // Nano Banana Pro gens in one Lambda never make it back to the browser.
    const total = 4;
    let gotAny = false;
    try {
      for (let i = 0; i < total; i += 1) {
        setCoverProgress(`Generating ${i + 1} of ${total}…`);
        const result = await generateAdminBlogCoverOptions({
          prompt,
          title: draft.title,
          subheader: draft.subheader,
          count: 1,
        });
        if (result.options.length) {
          gotAny = true;
          setCoverOptions((prev) =>
            [...result.options, ...prev].slice(0, 12),
          );
        }
      }
      if (!gotAny) {
        setCoverError("No covers came back. Try again.");
      }
    } catch (e) {
      setCoverError(
        e instanceof Error ? e.message : "Cover generation failed",
      );
    } finally {
      setCoverProgress(null);
      setCoverBusy(null);
    }
  }

  async function onUploadCover(file: File) {
    setCoverBusy("image");
    setCoverError(null);
    try {
      const { dataUrl, mimeType } = await fileToCompressedJpegDataUrl(file);
      const uploaded = await uploadAdminBlogCoverImage({
        imageBase64: dataUrl,
        mimeType,
      });
      setDraft((d) => ({
        ...d,
        coverImageUrl: uploaded.url,
        coverImageKey: uploaded.key,
      }));
      setStatus("Cover uploaded — Save to keep it.");
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : "Cover upload failed");
    } finally {
      setCoverBusy(null);
    }
  }

  async function onResolveListen() {
    setListenBusy(true);
    setListenError(null);
    setListenWarning(null);
    try {
      const result = await resolveAdminBlogListenSlug(listenInput);
      if (result.status === "missing" || result.status === "revoked") {
        setListenPreview(null);
        setListenError(
          result.error ||
            (result.status === "revoked"
              ? "This Listen item is no longer shared."
              : "No shared Listen item found."),
        );
        return;
      }
      if (!result.item) {
        setListenPreview(null);
        setListenError(result.error || "Could not resolve that Listen link.");
        return;
      }
      setListenPreview(result.item);
      setListenWarning(result.warning ?? null);
      setDraft((d) => ({
        ...d,
        listenSlug: result.item!.slug,
      }));
    } catch (e) {
      setListenError(
        e instanceof Error ? e.message : "Could not resolve Listen link",
      );
    } finally {
      setListenBusy(false);
    }
  }

  function onTitleChange(title: string) {
    setDraft((d) => ({
      ...d,
      title,
      slug: slugTouched ? d.slug : slugify(title),
    }));
  }

  async function onSaveIndexSummary() {
    setIndexSummaryBusy(true);
    setIndexSummaryStatus(null);
    try {
      const saved = await saveAdminBlogSettings({
        indexSummary: indexSummary.trim() || DEFAULT_INDEX_SUMMARY,
        authorPhotoEnabled,
      });
      setIndexSummary(saved.indexSummary);
      setAuthorPhotoUrl(saved.authorPhotoUrl);
      setAuthorPhotoEnabled(saved.authorPhotoEnabled);
      setIndexSummaryStatus("Page intro saved.");
    } catch (e) {
      setIndexSummaryStatus(
        e instanceof Error ? e.message : "Could not save page intro",
      );
    } finally {
      setIndexSummaryBusy(false);
    }
  }

  async function onPhotoSelected(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoStatus("Choose an image file (JPEG, PNG, or WebP).");
      return;
    }
    setPhotoBusy(true);
    setPhotoStatus(null);
    try {
      const { dataUrl, mimeType } = await fileToCompressedJpegDataUrl(file);
      const saved = await uploadAdminBlogAuthorPhoto({
        imageBase64: dataUrl,
        mimeType,
      });
      setAuthorPhotoUrl(saved.authorPhotoUrl);
      setAuthorPhotoEnabled(saved.authorPhotoEnabled);
      setPhotoStatus("Photo uploaded.");
    } catch (e) {
      setPhotoStatus(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPhotoBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function onClearPhoto() {
    if (!authorPhotoUrl) return;
    if (!window.confirm("Remove the author photo from /read?")) return;
    setPhotoBusy(true);
    setPhotoStatus(null);
    try {
      const saved = await clearAdminBlogAuthorPhoto();
      setAuthorPhotoUrl(saved.authorPhotoUrl);
      setAuthorPhotoEnabled(saved.authorPhotoEnabled);
      setPhotoStatus("Photo removed.");
    } catch (e) {
      setPhotoStatus(e instanceof Error ? e.message : "Could not remove photo");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onSave() {
    const d = draftRef.current;
    if (!d.title.trim()) {
      setStatus("Title is required.");
      return;
    }
    setBusy(true);
    setStatus(null);
    // Prefer TipTap's sync ref; fall back to draft, then last-known post body.
    // Never send an empty TipTap placeholder when we already have real content.
    const bodyHasText = (b: string) =>
      Boolean(
        b
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    const bodyToSave = replaceAiLongHyphen(
      [liveBodyRef.current, d.body, selected?.body ?? ""].find(bodyHasText) ||
        liveBodyRef.current ||
        d.body,
    );
    const hasBody = bodyHasText(bodyToSave);
    const title = replaceAiLongHyphen(d.title);
    const subheader = replaceAiLongHyphen(d.subheader);
    const excerpt = replaceAiLongHyphen(d.excerpt);
    const tags = d.tags.map((tag) => replaceAiLongHyphen(tag));
    const series = replaceAiLongHyphen(d.series);
    const notes = replaceAiLongHyphen(d.notes);
    try {
      // Placeholder / metadata-only edits: omit empty TipTap `<p></p>` on existing
      // posts so a body race can't interfere — category/pin/etc. still persist.
      const payload: Partial<AdminBlogPost> & { id?: string } = {
        ...(d.id ? { id: d.id } : {}),
        title,
        slug: d.slug || slugify(title),
        subheader,
        excerpt,
        tags,
        category: d.category,
        series,
        part: d.part,
        notes,
        published: d.published,
        pinned: d.pinned,
        topPicks: d.topPicks,
        startHere: d.startHere,
        coverImageUrl: d.coverImageUrl,
        coverImageKey: d.coverImageKey,
        listenSlug: d.listenSlug,
        listenCardLabel: d.listenCardLabel || "From Listen",
        publishedAt: d.publishedAt,
      };
      if (hasBody) {
        payload.body = bodyToSave;
      } else if (!d.id) {
        payload.body = "";
      }
      const saved = await saveAdminBlogPost(payload);
      // Trust the metadata we just sent — empty-body saves must not lose pin/category
      // if the response is partial or an older lambda omitted new fields.
      const savedWithBody: AdminBlogPost = {
        ...saved,
        title: title.trim() || saved.title,
        subheader,
        excerpt,
        tags,
        category: d.category,
        series,
        part: d.part,
        notes,
        published: d.published,
        pinned: d.pinned,
        topPicks: d.topPicks,
        startHere: d.startHere,
        coverImageUrl: d.coverImageUrl,
        coverImageKey: d.coverImageKey,
        listenSlug: d.listenSlug,
        listenCardLabel: d.listenCardLabel || "From Listen",
        publishedAt: d.publishedAt ?? saved.publishedAt,
        body: bodyHasText(saved.body)
          ? saved.body
          : hasBody
            ? bodyToSave
            : saved.body,
      };
      // Apply server response immediately — don’t wait on re-list (avoids a
      // brief stale title overwrite after capitalization-only edits).
      setPosts((prev) => {
        const rest = prev.filter((p) => p.id !== savedWithBody.id);
        return [savedWithBody, ...rest].sort((a, b) => {
          const aHas = a.body.replace(/<[^>]+>/g, " ").trim() ? 0 : 1;
          const bHas = b.body.replace(/<[^>]+>/g, " ").trim() ? 0 : 1;
          if (aHas !== bHas) return aHas - bHas;
          return b.updatedAt.localeCompare(a.updatedAt);
        });
      });
      liveBodyRef.current = savedWithBody.body;
      const wasNew = !d.id || d.id !== savedWithBody.id;
      // Remount only when a new post first gets an id — remounting on every
      // save races TipTap empty HTML into liveBodyRef before the next Save.
      if (wasNew) {
        const nextNonce = editorNonce + 1;
        liveEditorDocRef.current = editorDocKey(savedWithBody.id, nextNonce);
        setEditorNonce(nextNonce);
      } else {
        liveEditorDocRef.current = editorDocKey(savedWithBody.id, editorNonce);
      }
      setSelectedId(savedWithBody.id);
      setDraft(draftFromPost(savedWithBody));
      setSlugTouched(true);
      setStatus(
        savedWithBody.published ? "Saved & published." : "Saved as draft.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateAudio() {
    if (!draft.id) {
      setStatus("Save the post first, then generate audio.");
      return;
    }
    setAudioBusy(true);
    setStatus(null);
    try {
      const started = await generateAdminBlogAudio(
        draft.id,
        draft.audioTtsProvider === "fish" ? "fish" : "speechify",
      );
      setDraft(draftFromPost(started));
      setPosts((prev) => prev.map((p) => (p.id === started.id ? started : p)));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not start audio");
      setAudioBusy(false);
    }
  }

  useEffect(() => {
    if (draft.audioStatus !== "generating" || !draft.id) {
      if (draft.audioStatus !== "generating") setAudioBusy(false);
      return;
    }
    setAudioBusy(true);
    let cancelled = false;
    const tick = async () => {
      try {
        const { posts: list } = await fetchAdminBlog();
        if (cancelled) return;
        setPosts(list);
        const latest = list.find((p) => p.id === draft.id);
        if (!latest) return;
        setDraft((d) => {
          if (d.id !== latest.id) return d;
          const next = {
            ...d,
            ...draftFromPost(latest),
            body: d.body,
            title: d.title,
          };
          liveBodyRef.current = next.body;
          return next;
        });
        if (latest.audioStatus === "ready") {
          setAudioBusy(false);
        } else if (latest.audioStatus === "failed") {
          setAudioBusy(false);
        }
      } catch {
        /* keep polling */
      }
    };
    const id = window.setInterval(() => void tick(), 2500);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [draft.audioStatus, draft.id]);

  useEffect(() => {
    if (draft.audioStatus !== "generating" && !audioBusy) return;
    const id = window.setInterval(() => setAudioTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [draft.audioStatus, audioBusy]);

  async function onDelete() {
    if (!draft.id) return;
    if (!window.confirm(`Delete “${draft.title || "this post"}”?`)) return;
    setBusy(true);
    setStatus(null);
    try {
      await deleteAdminBlogPost(draft.id);
      setSelectedId(null);
      setDraft(blankDraft());
      await refresh();
      setStatus("Deleted.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const editing = selectedId === "new" || Boolean(selected);
  const editorDocId = editorDocKey(selectedId, editorNonce);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-display text-lg font-medium text-foreground">
          Read page intro
        </h2>
        <p className="mt-1 text-xs text-muted">
          Shown under the title on{" "}
          <a
            href="https://consciously.live/read"
            className="text-accent-link underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            /read
          </a>
          .
        </p>
        <div className="mt-3 flex items-stretch gap-4">
          <textarea
            value={indexSummary}
            onChange={(e) => setIndexSummary(e.target.value)}
            rows={4}
            className="w-full min-w-0 max-w-xl shrink-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            placeholder={DEFAULT_INDEX_SUMMARY}
          />
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2">
            {authorPhotoUrl ? (
              <img
                key={authorPhotoUrl}
                src={authorPhotoUrl}
                alt="Author"
                className={`size-24 rounded-full object-cover sm:size-28 ${
                  authorPhotoEnabled ? "" : "opacity-40"
                }`}
              />
            ) : (
              <div className="flex size-24 items-center justify-center rounded-full border border-dashed border-border bg-background text-[11px] text-muted sm:size-28">
                No photo
              </div>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) =>
                void onPhotoSelected(e.target.files?.[0] ?? null)
              }
            />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={photoBusy || loading}
                onClick={() => photoInputRef.current?.click()}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
              >
                {photoBusy
                  ? "Uploading…"
                  : authorPhotoUrl
                    ? "Replace"
                    : "Upload"}
              </button>
              {authorPhotoUrl ? (
                <button
                  type="button"
                  disabled={photoBusy || loading}
                  onClick={() => void onClearPhoto()}
                  className="rounded-lg border border-danger/40 px-2.5 py-1.5 text-xs font-medium text-danger disabled:opacity-50"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={authorPhotoEnabled}
                onChange={(e) => setAuthorPhotoEnabled(e.target.checked)}
                className="size-3.5 rounded border-border"
                disabled={loading || !authorPhotoUrl}
              />
              Show on /read
            </label>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={indexSummaryBusy || loading}
            onClick={() => void onSaveIndexSummary()}
            className="rounded-lg accent-fill-gradient px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
          >
            {indexSummaryBusy ? "Saving…" : "Save intro"}
          </button>
          {indexSummaryStatus ? (
            <p className="text-sm text-muted" role="status">
              {indexSummaryStatus}
            </p>
          ) : null}
          {photoStatus ? (
            <p className="text-sm text-muted" role="status">
              {photoStatus}
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 lg:w-72">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-medium text-foreground">
            Posts
          </h2>
          <button
            type="button"
            onClick={startNew}
            className="rounded-lg accent-fill-gradient px-3 py-1.5 text-sm font-semibold text-on-accent"
          >
            New
          </button>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-muted">Loading…</p>
        ) : error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : posts.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No posts yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-1">
            {posts.map((p) => {
              const active = selectedId === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => selectPost(p.id)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                      active
                        ? "bg-selected text-on-selected"
                        : "hover:bg-accent-soft/40"
                    }`}
                  >
                    <span className="block truncate text-sm font-medium">
                      {p.title}
                    </span>
                    {p.series || p.part != null ? (
                      <span
                        className={`mt-0.5 block truncate text-[11px] ${
                          active ? "text-on-selected/70" : "text-muted"
                        }`}
                      >
                        {p.series || "Series"}
                        {p.part != null ? ` · Part ${p.part}` : ""}
                      </span>
                    ) : null}
                    <span
                      className={`mt-0.5 block text-[11px] ${
                        active ? "text-on-selected/70" : "text-muted"
                      }`}
                    >
                      {p.category} · {p.published ? "Published" : "Draft"}
                      {p.startHere ? " · Start here" : ""}
                      {p.category === "Other" ? " · needs category" : ""}
                      {p.pinned ? " · Pinned" : ""}
                      {p.topPicks ? " · Top pick" : ""} · /
                      {p.slug}
                      {p.audioStatus === "generating"
                        ? " · generating audio"
                        : p.audioStatus === "failed"
                          ? " · audio failed"
                          : p.audioUrl
                            ? " · has audio"
                            : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="min-w-0 flex-1 rounded-xl border border-border bg-card p-4 sm:p-6">
        {!editing ? (
          <p className="text-sm text-muted">
            Select a post or create a new one. Published posts appear on{" "}
            <a
              href="https://consciously.live/read"
              className="text-accent-link underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              consciously.live/read
            </a>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-medium text-foreground">
                {draft.id ? "Edit post" : "New post"}
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
            <div>
              <label className="block text-xs font-medium text-muted">
                Title
              </label>
              <input
                value={draft.title}
                onChange={(e) => onTitleChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                placeholder="Post title"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">
                Subheader{" "}
                <span className="font-normal text-muted/80">(optional)</span>
              </label>
              <input
                value={draft.subheader}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, subheader: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                placeholder="Shown under the title on the published article"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">
                Category
              </label>
              <select
                value={draft.category}
                disabled={busy}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    category: normalizeBlogCategory(e.target.value),
                  }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {BLOG_PUBLIC_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {/* Other — kept for legacy posts; not shown on public chips. */}
                {draft.category === "Other" ||
                otherCategoryPosts.some((p) => p.id === draft.id) ? (
                  <option value="Other">Other (pick a real category)</option>
                ) : null}
              </select>
              <p className="mt-1 text-[11px] text-muted">
                Used to filter posts on /read.{" "}
                {draft.category === "Other"
                  ? "This essay is still in Other — choose one of the three categories."
                  : null}
              </p>
              {otherCategoryPosts.length > 0 && draft.category !== "Other" ? (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                  {otherCategoryPosts.length} essay
                  {otherCategoryPosts.length === 1 ? "" : "s"} still in Other:{" "}
                  {otherCategoryPosts.map((p) => p.title).join(", ")}
                </p>
              ) : null}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">
                Tags{" "}
                <span className="font-normal text-muted/80">(optional)</span>
              </label>
              <BlogTagsInput
                tags={draft.tags}
                disabled={busy}
                onChange={(tags) => setDraft((d) => ({ ...d, tags }))}
              />
              <p className="mt-1 text-[11px] text-muted">
                Press Enter to add. Shown as chips on /read and the article.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_7rem]">
              <div>
                <label className="block text-xs font-medium text-muted">
                  Series{" "}
                  <span className="font-normal text-muted/80">(optional)</span>
                </label>
                <input
                  value={draft.series}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, series: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  placeholder="Chasing Mountains"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted">
                  Part{" "}
                  <span className="font-normal text-muted/80">(optional)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={draft.part ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      setDraft((d) => ({ ...d, part: null }));
                      return;
                    }
                    const n = Number(raw);
                    setDraft((d) => ({
                      ...d,
                      part: Number.isFinite(n) ? Math.round(n) : null,
                    }));
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  placeholder="1"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">
                Notes{" "}
                <span className="font-normal text-muted/80">
                  (private — not published)
                </span>
              </label>
              <textarea
                value={draft.notes}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, notes: e.target.value }))
                }
                rows={5}
                disabled={busy}
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm leading-relaxed text-foreground"
                placeholder="Working notes, outline, sources — only visible in admin."
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
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
                placeholder="url-slug"
              />
              <p className="mt-1 text-[11px] text-muted">
                Public URL: /read/{draft.slug || "…"}
              </p>
            </div>
            {(() => {
              const generating =
                audioBusy || draft.audioStatus === "generating";
              const failed = draft.audioStatus === "failed";
              const ready = Boolean(draft.audioUrl);
              const startedMs = draft.audioStartedAt
                ? Date.parse(draft.audioStartedAt)
                : Number.NaN;
              const elapsedSec = Number.isFinite(startedMs)
                ? Math.max(0, Math.floor((audioTick - startedMs) / 1000))
                : 0;
              const stale = generating && elapsedSec > 16 * 60;
              const listenTrack = draft.audioUrl
                ? trackFromBlogNarration(draft.audioUrl, draft.title)
                : null;
              const listening =
                listenTrack != null &&
                nowPlaying?.s3Key === listenTrack.s3Key &&
                playingS3Key === listenTrack.s3Key;
              return (
                <div
                  className={`rounded-xl border px-3 py-3 sm:px-4 ${
                    failed
                      ? "border-danger/40 bg-danger/5"
                      : generating
                        ? "border-accent/35 bg-accent-soft/20"
                        : "border-border bg-background/60"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      Narration
                    </p>
                    <span className="text-[11px] uppercase tracking-wide text-muted">
                      {generating
                        ? "Generating"
                        : failed
                          ? "Failed"
                          : ready
                            ? "Ready"
                            : "Not generated"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Reads the last saved title, subheader, and body. No voice
                    FX or music. Does not run on save. Long posts can take
                    several minutes.
                  </p>
                  <label className="mt-3 block text-xs font-medium text-muted">
                    Voice engine
                  </label>
                  <select
                    value={
                      draft.audioTtsProvider === "fish" ? "fish" : "speechify"
                    }
                    disabled={generating}
                    onChange={(e) => {
                      const next =
                        e.target.value === "fish" ? "fish" : "speechify";
                      setDraft((d) => ({ ...d, audioTtsProvider: next }));
                    }}
                    className="mt-1 w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
                  >
                    <option value="speechify">Speechify</option>
                    <option value="fish">Fish Audio</option>
                  </select>
                  {generating ? (
                    <div className="mt-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-border">
                        <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
                      </div>
                      <p className="mt-2 text-sm text-foreground" role="status">
                        {draft.audioProgress ||
                          "Generating audio — calling the narrator…"}
                      </p>
                      <p className="mt-0.5 text-xs tabular-nums text-muted">
                        Elapsed {formatElapsedSeconds(elapsedSec)}
                        {stale
                          ? " · this is longer than usual; if it stays here, generate again after a deploy."
                          : ""}
                      </p>
                    </div>
                  ) : null}
                  {failed ? (
                    <p className="mt-3 text-sm text-danger" role="alert">
                      {draft.audioError ||
                        "Audio generation failed. Generate again to retry."}
                    </p>
                  ) : null}
                  {ready && !generating ? (
                    <p className="mt-2 text-xs text-muted">
                      Last generated{" "}
                      {formatWhen(draft.audioGeneratedAt)}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || generating || !draft.id}
                      onClick={() => void onGenerateAudio()}
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent-soft/40 disabled:opacity-50"
                    >
                      {generating
                        ? "Generating…"
                        : ready
                          ? "Regenerate audio"
                          : "Generate audio"}
                    </button>
                    {listenTrack ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            nowPlaying?.s3Key === listenTrack.s3Key
                          ) {
                            toggleCurrent();
                          } else {
                            playTrack(listenTrack);
                          }
                        }}
                        className="rounded-lg accent-fill-gradient px-4 py-2 text-sm font-semibold text-on-accent"
                      >
                        {listening ? "Pause" : "Listen"}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })()}
            <div>
              <label className="block text-xs font-medium text-muted">
                Body
              </label>
              <ReadRichEditor
                key={editorDocId}
                docId={editorDocId}
                initialHtml={bodyToEditorHtml(draft.body)}
                onHtmlChange={(html, fromDoc) => {
                  if (fromDoc !== liveEditorDocRef.current) return;
                  liveBodyRef.current = html;
                  setDraft((d) => ({ ...d, body: html }));
                }}
                linkPosts={posts
                  .filter((p) => p.id !== draft.id)
                  .map((p) => ({
                    id: p.id,
                    title: p.title,
                    slug: p.slug,
                    published: p.published,
                  }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">
                Cover
              </label>
              {draft.coverImageUrl ? (
                <img
                  src={draft.coverImageUrl}
                  alt=""
                  className="mt-2 aspect-[16/9] w-full max-w-md rounded-lg object-cover"
                />
              ) : (
                <p className="mt-1 text-[11px] text-muted">
                  No cover yet — Start here and Read next show a tinted panel.
                </p>
              )}
              {draft.startHere && !draft.coverImageUrl ? (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                  Start here essay is missing a cover.
                </p>
              ) : null}
              <div className="mt-2">
                <label className="block text-[11px] text-muted">
                  Image prompt
                </label>
                <textarea
                  value={coverPrompt}
                  onChange={(e) => setCoverPrompt(e.target.value)}
                  rows={3}
                  placeholder="Generate from the essay, or write your own…"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div className="mt-2">
                <label className="block text-[11px] text-muted">
                  Prompt changes{" "}
                  <span className="font-normal text-muted/80">
                    (optional — used when regenerating the prompt)
                  </span>
                </label>
                <textarea
                  value={coverPromptNotes}
                  onChange={(e) => setCoverPromptNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. less water, warmer light, show a figure from behind…"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(coverBusy) || busy}
                  onClick={() => void onGenerateCoverPrompt()}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {coverBusy === "prompt"
                    ? coverProgress || "Writing prompt…"
                    : coverPrompt.trim()
                      ? "Generate prompt again"
                      : "Generate prompt"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(coverBusy) || busy}
                  onClick={() => void onGenerateCoverImages()}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {coverBusy === "image"
                    ? coverProgress || "Generating…"
                    : "Generate image"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(coverBusy) || busy}
                  onClick={() => coverInputRef.current?.click()}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Upload
                </button>
                {draft.coverImageUrl ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        coverImageUrl: null,
                        coverImageKey: null,
                      }))
                    }
                    className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void onUploadCover(file);
                  }}
                />
              </div>
              {coverError ? (
                <p className="mt-1 text-[11px] text-danger" role="alert">
                  {coverError}{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      void (coverPrompt.trim()
                        ? onGenerateCoverImages()
                        : onGenerateCoverPrompt())
                    }
                  >
                    Retry
                  </button>
                </p>
              ) : null}
              {coverOptions.length > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {coverOptions.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          coverImageUrl: opt.url,
                          coverImageKey: opt.key,
                        }))
                      }
                      className={`overflow-hidden rounded-lg border-2 ${
                        draft.coverImageUrl === opt.url
                          ? "border-accent"
                          : "border-transparent"
                      }`}
                    >
                      <img
                        src={opt.url}
                        alt=""
                        className="aspect-[16/9] w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                Listen item{" "}
                <span className="font-normal text-muted/80">(optional)</span>
              </label>
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  value={listenInput}
                  onChange={(e) => setListenInput(e.target.value)}
                  placeholder="consciously.live/listen/… or slug"
                  className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                <button
                  type="button"
                  disabled={listenBusy || !listenInput.trim()}
                  onClick={() => void onResolveListen()}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {listenBusy ? "Checking…" : "Resolve"}
                </button>
                {draft.listenSlug ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((d) => ({ ...d, listenSlug: null }));
                      setListenInput("");
                      setListenPreview(null);
                      setListenWarning(null);
                      setListenError(null);
                    }}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {listenError ? (
                <p className="mt-1 text-[11px] text-danger">{listenError}</p>
              ) : null}
              {listenWarning ? (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                  {listenWarning}
                </p>
              ) : null}
              {listenPreview ? (
                <div className="mt-2 flex gap-3 rounded-lg border border-border p-2">
                  {listenPreview.coverImageUrl ? (
                    <img
                      src={listenPreview.coverImageUrl}
                      alt=""
                      className="size-14 rounded object-cover"
                    />
                  ) : (
                    <div className="size-14 rounded bg-muted/30" />
                  )}
                  <div className="min-w-0">
                    <p className="m-0 truncate text-sm font-medium">
                      {listenPreview.title}
                    </p>
                    <p className="m-0 text-[11px] text-muted">
                      {listenPreview.kind}
                      {listenPreview.durationSec
                        ? ` · ${Math.max(1, Math.round(listenPreview.durationSec / 60))} min`
                        : ""}
                      {listenPreview.listed ? "" : " · link only"}
                    </p>
                  </div>
                </div>
              ) : draft.listenSlug ? (
                <p className="mt-1 text-[11px] text-muted">
                  Linked: /listen/{draft.listenSlug}
                </p>
              ) : null}
              <label className="mt-2 block text-[11px] text-muted">
                Card label
              </label>
              <input
                value={draft.listenCardLabel}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    listenCardLabel: e.target.value,
                  }))
                }
                placeholder="From Listen"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                Published date
              </label>
              <input
                type="date"
                value={
                  draft.publishedAt
                    ? draft.publishedAt.slice(0, 10)
                    : ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    publishedAt: v
                      ? new Date(`${v}T12:00:00.000Z`).toISOString()
                      : d.publishedAt,
                  }));
                }}
                className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
              <p className="mt-1 text-[11px] text-muted">
                Read time (calculated):{" "}
                {blogReadMinutes(liveBodyRef.current || draft.body)} min
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.published}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, published: e.target.checked }))
                  }
                  className="size-4 rounded border-border"
                />
                Published
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.startHere}
                  disabled={
                    !draft.startHere && startHereCount >= 3
                  }
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, startHere: e.target.checked }))
                  }
                  className="size-4 rounded border-border"
                />
                <span>
                  Start here
                  <span className="ml-1.5 font-normal text-muted">
                    — up to 3 essays on /read
                  </span>
                </span>
              </label>
              {!draft.startHere && startHereCount >= 3 ? (
                <p className="text-[11px] text-muted">
                  Already 3 marked: {startHereTitles.join(", ")}. Unmark one
                  first.
                </p>
              ) : null}
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.pinned}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, pinned: e.target.checked }))
                  }
                  className="size-4 rounded border-border"
                />
                <span>
                  Pinned
                  <span className="ml-1.5 font-normal text-muted">
                    — app-related highlight
                  </span>
                </span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.topPicks}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, topPicks: e.target.checked }))
                  }
                  className="size-4 rounded border-border"
                />
                <span>
                  Top picks
                  <span className="ml-1.5 font-normal text-muted">
                    — personal favourites (my picks)
                  </span>
                </span>
              </label>
            </div>
            {draft.id ? (
              <p className="text-[11px] text-muted">
                Updated {formatWhen(selected?.updatedAt)}
                {draft.publishedAt
                  ? ` · First published ${formatWhen(draft.publishedAt)}`
                  : ""}
              </p>
            ) : null}
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
              {draft.published && draft.slug ? (
                <a
                  href={`https://consciously.live/read/${encodeURIComponent(draft.slug)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
                >
                  View live
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

/** @deprecated Prefer AdminReadPanel */
export const AdminBlogPanel = AdminReadPanel;
