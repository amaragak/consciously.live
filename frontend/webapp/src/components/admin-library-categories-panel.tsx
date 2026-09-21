import { useCallback, useEffect, useRef, useState } from "react";
import { LIBRARY_MEDITATION_CATEGORIES } from "@/lib/community-library";
import {
  ADMIN_IMAGE_MODELS,
  clearAdminLibraryCategoryImage,
  fetchAdminLibraryCategories,
  generateAdminLibraryCategoryImage,
  restoreAdminLibraryCategoryImage,
  uploadAdminLibraryCategoryImage,
  type AdminImageModel,
  type AdminLibraryCategoryImage,
} from "@/lib/medimade-api";

/** Admin image slots: Community "All" tile plus each library category. */
const CATEGORY_IMAGE_SLOTS = ["All", ...LIBRARY_MEDITATION_CATEGORIES] as const;

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

type RowState = {
  prompt: string;
  busy: boolean;
  status: string | null;
};

function emptyRows(): Record<string, RowState> {
  const out: Record<string, RowState> = {};
  for (const cat of CATEGORY_IMAGE_SLOTS) {
    out[cat] = { prompt: "", busy: false, status: null };
  }
  return out;
}

export function AdminLibraryCategoriesPanel() {
  const [images, setImages] = useState<
    Record<string, AdminLibraryCategoryImage>
  >({});
  const [rows, setRows] = useState(emptyRows);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageModel, setImageModel] =
    useState<AdminImageModel>("gpt-image-1-mini");
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const applyImages = useCallback((list: AdminLibraryCategoryImage[]) => {
    const map: Record<string, AdminLibraryCategoryImage> = {};
    for (const img of list) map[img.category] = img;
    setImages(map);
    setRows((prev) => {
      const next = { ...prev };
      for (const img of list) {
        const row = next[img.category];
        if (row && img.lastPrompt && !row.prompt) {
          next[img.category] = { ...row, prompt: img.lastPrompt };
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchAdminLibraryCategories()
      .then((data) => {
        if (cancelled) return;
        applyImages(data.images);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyImages]);

  function patchRow(category: string, patch: Partial<RowState>) {
    setRows((prev) => ({
      ...prev,
      [category]: { ...prev[category]!, ...patch },
    }));
  }

  async function onUpload(category: string, file: File | null) {
    if (!file) return;
    setError(null);
    patchRow(category, { busy: true, status: "Uploading…" });
    try {
      const { dataUrl, mimeType } = await fileToCompressedJpegDataUrl(file);
      const data = await uploadAdminLibraryCategoryImage({
        category,
        imageBase64: dataUrl,
        mimeType,
      });
      applyImages(data.images);
      patchRow(category, { busy: false, status: "Uploaded." });
    } catch (e) {
      patchRow(category, {
        busy: false,
        status: e instanceof Error ? e.message : "Upload failed",
      });
    } finally {
      const input = fileRefs.current[category];
      if (input) input.value = "";
    }
  }

  async function onGenerate(category: string) {
    const prompt = rows[category]?.prompt.trim() ?? "";
    if (!prompt) {
      patchRow(category, { status: "Enter a prompt first." });
      return;
    }
    setError(null);
    patchRow(category, { busy: true, status: "Generating…" });
    try {
      const data = await generateAdminLibraryCategoryImage({
        category,
        prompt,
        model: imageModel,
      });
      applyImages(data.images);
      patchRow(category, { busy: false, status: "Generated." });
    } catch (e) {
      patchRow(category, {
        busy: false,
        status: e instanceof Error ? e.message : "Generate failed",
      });
    }
  }

  async function onRestore(category: string, versionId: string) {
    setError(null);
    patchRow(category, { busy: true, status: "Switching…" });
    try {
      const data = await restoreAdminLibraryCategoryImage({
        category,
        versionId,
      });
      applyImages(data.images);
      const restored = data.images.find((x) => x.category === category);
      if (restored?.lastPrompt) {
        patchRow(category, {
          busy: false,
          status: "Switched.",
          prompt: restored.lastPrompt,
        });
      } else {
        patchRow(category, { busy: false, status: "Switched." });
      }
    } catch (e) {
      patchRow(category, {
        busy: false,
        status: e instanceof Error ? e.message : "Switch failed",
      });
    }
  }

  async function onClear(category: string) {
    if (!images[category]) return;
    setError(null);
    patchRow(category, { busy: true, status: "Clearing…" });
    try {
      const data = await clearAdminLibraryCategoryImage(category);
      applyImages(data.images);
      patchRow(category, { busy: false, status: "Cleared." });
    } catch (e) {
      patchRow(category, {
        busy: false,
        status: e instanceof Error ? e.message : "Clear failed",
      });
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          Category images
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Covers for Library → Community category cards (including All). Upload
          or generate keeps prior versions so you can switch back. Choose GPT
          Image 1 Mini or Nano Banana Pro for generate.
        </p>
        <label className="mt-4 flex max-w-xs flex-col gap-1 text-xs font-medium text-muted">
          Image model
          <select
            value={imageModel}
            onChange={(e) =>
              setImageModel(e.target.value as AdminImageModel)
            }
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
          >
            {ADMIN_IMAGE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <ul className="space-y-4">
          {CATEGORY_IMAGE_SLOTS.map((category) => {
            const img = images[category];
            const row = rows[category]!;
            const versions = img?.versions ?? [];
            return (
              <li
                key={category}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-border/40">
                    {img?.imageUrl ? (
                      <img
                        src={img.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h2 className="font-display text-lg font-medium">
                        {category}
                      </h2>
                      {img ? (
                        <span className="text-xs text-muted">
                          {versions.length + 1}v
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={(el) => {
                          fileRefs.current[category] = el;
                        }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) =>
                          void onUpload(
                            category,
                            e.target.files?.[0] ?? null,
                          )
                        }
                      />
                      <button
                        type="button"
                        disabled={row.busy}
                        onClick={() => fileRefs.current[category]?.click()}
                        className="cursor-pointer rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-card disabled:opacity-50"
                      >
                        Upload
                      </button>
                      {img ? (
                        <button
                          type="button"
                          disabled={row.busy}
                          onClick={() => void onClear(category)}
                          className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:bg-card disabled:opacity-50"
                        >
                          Clear all
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-muted">
                        Generate prompt
                        <textarea
                          value={row.prompt}
                          disabled={row.busy}
                          onChange={(e) =>
                            patchRow(category, { prompt: e.target.value })
                          }
                          rows={2}
                          placeholder="Sent as-is to the selected image model…"
                          className="mt-1 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted disabled:opacity-50"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={row.busy || !row.prompt.trim()}
                        onClick={() => void onGenerate(category)}
                        className="cursor-pointer rounded-full accent-fill-gradient px-3 py-1.5 text-sm font-medium text-on-accent disabled:opacity-50"
                      >
                        Generate
                      </button>
                    </div>
                    {versions.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted">
                          Earlier versions
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {[...versions].reverse().map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              disabled={row.busy}
                              title={
                                v.lastPrompt
                                  ? v.lastPrompt.slice(0, 120)
                                  : "Uploaded"
                              }
                              onClick={() => void onRestore(category, v.id)}
                              className="group relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border disabled:opacity-50"
                            >
                              <img
                                src={v.imageUrl}
                                alt=""
                                className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {row.status ? (
                      <p className="text-xs text-muted" role="status">
                        {row.status}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
