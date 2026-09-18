import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteAdminBlogPost,
  listAdminBlogPosts,
  saveAdminBlogPost,
  type AdminBlogPost,
} from "@/lib/medimade-api";
import {
  ReadRichEditor,
  bodyToEditorHtml,
} from "@/components/read-rich-editor";

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

function blankDraft(): Omit<AdminBlogPost, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
} {
  return {
    slug: "",
    title: "",
    subheader: "",
    excerpt: "",
    body: "",
    published: false,
    publishedAt: null,
  };
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
  const [posts, setPosts] = useState<AdminBlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState(blankDraft());
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listAdminBlogPosts();
      setPosts(list);
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

  useEffect(() => {
    if (selectedId === "new") {
      setDraft(blankDraft());
      setSlugTouched(false);
      setStatus(null);
      return;
    }
    if (selected) {
      setDraft({
        id: selected.id,
        slug: selected.slug,
        title: selected.title,
        subheader: selected.subheader,
        excerpt: selected.excerpt,
        body: selected.body,
        published: selected.published,
        publishedAt: selected.publishedAt,
      });
      setSlugTouched(true);
      setStatus(null);
    }
  }, [selectedId, selected]);

  function startNew() {
    setSelectedId("new");
  }

  function onTitleChange(title: string) {
    setDraft((d) => ({
      ...d,
      title,
      slug: slugTouched ? d.slug : slugify(title),
    }));
  }

  async function onSave() {
    if (!draft.title.trim()) {
      setStatus("Title is required.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const saved = await saveAdminBlogPost({
        id: draft.id,
        title: draft.title,
        slug: draft.slug || slugify(draft.title),
        subheader: draft.subheader,
        excerpt: draft.excerpt,
        body: draft.body,
        published: draft.published,
      });
      await refresh();
      setSelectedId(saved.id);
      setStatus(saved.published ? "Saved & published." : "Saved as draft.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

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
  const editorDocId =
    selectedId === "new" ? "new" : selectedId ?? "none";

  return (
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
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                      active
                        ? "bg-selected text-on-selected"
                        : "hover:bg-accent-soft/40"
                    }`}
                  >
                    <span className="block truncate text-sm font-medium">
                      {p.title}
                    </span>
                    <span
                      className={`mt-0.5 block text-[11px] ${
                        active ? "text-on-selected/70" : "text-muted"
                      }`}
                    >
                      {p.published ? "Published" : "Draft"} · /{p.slug}
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
            <div>
              <label className="block text-xs font-medium text-muted">
                Excerpt
              </label>
              <textarea
                value={draft.excerpt}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, excerpt: e.target.value }))
                }
                rows={2}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                placeholder="Short summary for the index"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">
                Body
              </label>
              <ReadRichEditor
                docId={editorDocId}
                initialHtml={bodyToEditorHtml(draft.body)}
                onHtmlChange={(html) =>
                  setDraft((d) => ({ ...d, body: html }))
                }
              />
            </div>
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
  );
}

/** @deprecated Prefer AdminReadPanel */
export const AdminBlogPanel = AdminReadPanel;
