import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminListenStoryStudio } from "@/components/admin-listen-story-studio";
import {
  fetchAdminListen,
  moveAdminListenSlot,
  pinAdminListenItem,
  setAdminListenIncludeCommunity,
  setAdminListenExampleFor,
  setAdminListenPromptLine,
  setAdminListenSlotPublished,
  unpinAdminListenSlot,
  type AdminListenPreview,
  type AdminListenState,
} from "@/lib/medimade-api";

function formatDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AdminListenPanel() {
  const [state, setState] = useState<AdminListenState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [meditationRef, setMeditationRef] = useState("");
  const [meditationPrompt, setMeditationPrompt] = useState("");
  const [storyRef, setStoryRef] = useState("");
  const [storyPrompt, setStoryPrompt] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await fetchAdminListen());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Listen curator");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const meditations = useMemo(
    () => (state?.previews ?? []).filter((p) => p.kind === "meditation"),
    [state],
  );
  const stories = useMemo(
    () => (state?.previews ?? []).filter((p) => p.kind === "story"),
    [state],
  );

  async function run(fn: () => Promise<AdminListenState>, okMsg: string) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      setState(await fn());
      setStatus(okMsg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPinMeditation() {
    const ref = meditationRef.trim();
    if (!ref) return;
    await run(
      () =>
        pinAdminListenItem({
          ref,
          kind: "meditation",
          promptLine: meditationPrompt.trim(),
        }),
      "Pinned meditation on /listen",
    );
    setMeditationRef("");
    setMeditationPrompt("");
  }

  async function onPinStory() {
    const ref = storyRef.trim();
    if (!ref) return;
    await run(
      () =>
        pinAdminListenItem({
          ref,
          kind: "story",
          promptLine: storyPrompt.trim(),
        }),
      "Pinned story on /listen",
    );
    setStoryRef("");
    setStoryPrompt("");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-1 pb-16">
      <header>
        <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">
          Listen
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Curate{" "}
          <a
            href="https://consciously.live/listen"
            className="text-foreground underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            consciously.live/listen
          </a>{" "}
          by attaching an existing Listen link, then writing the “Made from”
          line shown under the card.
        </p>
      </header>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {status ? <p className="text-sm text-muted">{status}</p> : null}

      <label className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={state?.includeCommunity === true}
          disabled={busy || loading || !state}
          onChange={(e) =>
            void run(
              () => setAdminListenIncludeCommunity(e.target.checked),
              e.target.checked
                ? "Community listings will also show on /listen"
                : "/listen shows curator only",
            )
          }
        />
        <span>
          <span className="font-medium text-foreground">
            Include community listings
          </span>
          <span className="mt-0.5 block text-muted">
            Off by default — only these curated examples appear on the public
            index.
          </span>
        </span>
      </label>

      <Section
        title="Meditations"
        hint="Up to 6. Mark from Library › ⋯ › Set as example, or paste a Listen link. Then write Made from + who it was for."
        linkValue={meditationRef}
        onLinkValue={setMeditationRef}
        linkPlaceholder="Listen URL or slug"
        promptValue={meditationPrompt}
        onPromptValue={setMeditationPrompt}
        promptPlaceholder="e.g. Softening anxiety before a hard conversation"
        onPin={() => void onPinMeditation()}
        busy={busy || loading}
        pinLabel="Pin meditation"
        items={meditations}
        onSaveMeta={(id, meta) =>
          void run(async () => {
            let next: AdminListenState | null = null;
            if (meta.exampleFor != null) {
              next = await setAdminListenExampleFor(id, meta.exampleFor);
            }
            if (meta.promptLine != null) {
              next = await setAdminListenPromptLine(id, meta.promptLine);
            }
            if (!next) throw new Error("Nothing to save");
            return next;
          }, "Saved example copy")
        }
        onMove={(id, dir) =>
          void run(() => moveAdminListenSlot(id, dir), "Reordered")
        }
        onToggle={(id, published) =>
          void run(
            () => setAdminListenSlotPublished(id, published),
            published ? "Published" : "Hidden",
          )
        }
        onRemove={(id) =>
          void run(() => unpinAdminListenSlot(id), "Removed from curator")
        }
      />

      <Section
        title="Stories"
        hint="Attach by link, or generate an example for a fake person below."
        linkValue={storyRef}
        onLinkValue={setStoryRef}
        linkPlaceholder="Listen URL or slug"
        promptValue={storyPrompt}
        onPromptValue={setStoryPrompt}
        promptPlaceholder="e.g. A quiet evening after choosing rest over hustle"
        onPin={() => void onPinStory()}
        busy={busy || loading}
        pinLabel="Pin story"
        items={stories}
        onSaveMeta={(id, meta) =>
          void run(async () => {
            let next: AdminListenState | null = null;
            if (meta.exampleFor != null) {
              next = await setAdminListenExampleFor(id, meta.exampleFor);
            }
            if (meta.promptLine != null) {
              next = await setAdminListenPromptLine(id, meta.promptLine);
            }
            if (!next) throw new Error("Nothing to save");
            return next;
          }, "Saved example copy")
        }
        onMove={(id, dir) =>
          void run(() => moveAdminListenSlot(id, dir), "Reordered")
        }
        onToggle={(id, published) =>
          void run(
            () => setAdminListenSlotPublished(id, published),
            published ? "Published" : "Hidden",
          )
        }
        onRemove={(id) =>
          void run(() => unpinAdminListenSlot(id), "Removed from curator")
        }
      />

      <AdminListenStoryStudio
        busy={busy || loading}
        onBusy={setBusy}
        onError={setError}
        onStatus={setStatus}
        onPinned={setState}
      />

      {loading && !state ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : null}
    </div>
  );
}

function Section({
  title,
  hint,
  linkValue,
  onLinkValue,
  linkPlaceholder,
  promptValue,
  onPromptValue,
  promptPlaceholder,
  onPin,
  busy,
  pinLabel,
  items,
  onSaveMeta,
  onMove,
  onToggle,
  onRemove,
}: {
  title: string;
  hint: string;
  linkValue: string;
  onLinkValue: (v: string) => void;
  linkPlaceholder: string;
  promptValue: string;
  onPromptValue: (v: string) => void;
  promptPlaceholder: string;
  onPin: () => void;
  busy: boolean;
  pinLabel: string;
  items: AdminListenPreview[];
  onSaveMeta: (
    slotId: string,
    meta: { promptLine?: string; exampleFor?: string },
  ) => void;
  onMove: (slotId: string, dir: "up" | "down") => void;
  onToggle: (slotId: string, published: boolean) => void;
  onRemove: (slotId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{hint}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 md:p-4">
        <label className="block text-[11px] font-medium text-muted">
          Listen link
        </label>
        <input
          value={linkValue}
          onChange={(e) => onLinkValue(e.target.value)}
          placeholder={linkPlaceholder}
          disabled={busy}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <label className="mt-3 block text-[11px] font-medium text-muted">
          Made from line
        </label>
        <textarea
          value={promptValue}
          onChange={(e) => onPromptValue(e.target.value)}
          rows={2}
          placeholder={promptPlaceholder}
          disabled={busy}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <button
          type="button"
          disabled={busy || !linkValue.trim()}
          onClick={onPin}
          className="mt-2 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"
        >
          {pinLabel}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted">
          None pinned yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item, i) => (
            <SlotCard
              key={item.slotId}
              item={item}
              index={i}
              total={items.length}
              busy={busy}
              onSaveMeta={onSaveMeta}
              onMove={onMove}
              onToggle={onToggle}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SlotCard({
  item,
  index,
  total,
  busy,
  onSaveMeta,
  onMove,
  onToggle,
  onRemove,
}: {
  item: AdminListenPreview;
  index: number;
  total: number;
  busy: boolean;
  onSaveMeta: (
    slotId: string,
    meta: { promptLine?: string; exampleFor?: string },
  ) => void;
  onMove: (slotId: string, dir: "up" | "down") => void;
  onToggle: (slotId: string, published: boolean) => void;
  onRemove: (slotId: string) => void;
}) {
  const [draft, setDraft] = useState(item.promptLine ?? "");
  const [forWhom, setForWhom] = useState(item.exampleFor ?? "");
  useEffect(() => {
    setDraft(item.promptLine ?? "");
    setForWhom(item.exampleFor ?? "");
  }, [item.promptLine, item.exampleFor, item.slotId]);

  const promptDirty = draft.trim() !== (item.promptLine ?? "").trim();
  const forDirty = forWhom.trim() !== (item.exampleFor ?? "").trim();
  const dirty = promptDirty || forDirty;

  return (
    <li
      className={`rounded-xl border border-border bg-card p-3 md:p-4 ${
        item.missing ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {item.coverImageUrl ? (
          <img
            src={item.coverImageUrl}
            alt=""
            className="size-14 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div
            className="size-14 shrink-0 rounded-md bg-accent-soft"
            aria-hidden
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-medium text-foreground">
            {item.title}
            {!item.published ? (
              <span className="ml-2 text-[11px] font-normal text-muted">
                hidden
              </span>
            ) : null}
            {item.missing ? (
              <span className="ml-2 text-[11px] font-normal text-danger">
                missing row
              </span>
            ) : null}
          </p>
          <p className="m-0 mt-0.5 truncate text-[12px] text-muted">
            {formatDuration(item.durationSec)}
            {item.style ? ` · ${item.style}` : ""}
            {item.href ? ` · ${item.href}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <button
            type="button"
            disabled={busy || index === 0}
            onClick={() => onMove(item.slotId, "up")}
            className="rounded border border-border px-2 py-1 text-[12px] disabled:opacity-40"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={busy || index === total - 1}
            onClick={() => onMove(item.slotId, "down")}
            className="rounded border border-border px-2 py-1 text-[12px] disabled:opacity-40"
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onToggle(item.slotId, !item.published)}
            className="rounded border border-border px-2 py-1 text-[12px] disabled:opacity-50"
          >
            {item.published ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(item.slotId)}
            className="rounded border border-border px-2 py-1 text-[12px] text-danger disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      </div>
      <label className="mt-3 block text-[11px] font-medium text-muted">
        For whom
      </label>
      <input
        value={forWhom}
        onChange={(e) => setForWhom(e.target.value)}
        disabled={busy}
        placeholder="e.g. Meditation for Bob"
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
      <label className="mt-3 block text-[11px] font-medium text-muted">
        Made from line
      </label>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        disabled={busy}
        placeholder="The one line shown under the card on /listen…"
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
      <button
        type="button"
        disabled={busy || !dirty}
        onClick={() =>
          onSaveMeta(item.slotId, {
            ...(forDirty ? { exampleFor: forWhom } : {}),
            ...(promptDirty ? { promptLine: draft } : {}),
          })
        }
        className="mt-2 rounded-lg border border-border px-3 py-1.5 text-[13px] disabled:opacity-50"
      >
        Save
      </button>
    </li>
  );
}
