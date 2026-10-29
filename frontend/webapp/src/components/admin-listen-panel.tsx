import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAdminListen,
  moveAdminListenSlot,
  pinAdminListenItem,
  setAdminListenIncludeCommunity,
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
  const [storyRef, setStoryRef] = useState("");

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
      () => pinAdminListenItem({ ref, kind: "meditation" }),
      "Pinned meditation on /listen",
    );
    setMeditationRef("");
  }

  async function onPinStory() {
    const ref = storyRef.trim();
    if (!ref) return;
    await run(
      () => pinAdminListenItem({ ref, kind: "story" }),
      "Pinned story on /listen",
    );
    setStoryRef("");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-1 pb-16">
      <header>
        <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">
          Listen
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Curate what appears on{" "}
          <a
            href="https://consciously.live/listen"
            className="text-foreground underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            consciously.live/listen
          </a>
          . Paste a Listen URL, slug, job id, or{" "}
          <code className="rounded bg-card px-1 text-[12px]">email|sk</code>.
          Create Stories under Create as Consciously (or any account), then pin
          them here so they are not tied to a personal story slot.
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
        hint="Example guided sessions on the public Listen page."
        input={meditationRef}
        onInput={setMeditationRef}
        placeholder="Listen URL, slug, job id, or email|sk"
        onAdd={() => void onPinMeditation()}
        busy={busy || loading}
        addLabel="Pin meditation"
        items={meditations}
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
        hint="Night Stories shown as Consciously examples (not limited to one per personal account)."
        input={storyRef}
        onInput={setStoryRef}
        placeholder="Listen URL, slug, job id, or email|sk"
        onAdd={() => void onPinStory()}
        busy={busy || loading}
        addLabel="Pin story"
        items={stories}
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

      {loading && !state ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : null}
    </div>
  );
}

function Section({
  title,
  hint,
  input,
  onInput,
  placeholder,
  onAdd,
  busy,
  addLabel,
  items,
  onMove,
  onToggle,
  onRemove,
}: {
  title: string;
  hint: string;
  input: string;
  onInput: (v: string) => void;
  placeholder: string;
  onAdd: () => void;
  busy: boolean;
  addLabel: string;
  items: AdminListenPreview[];
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
      <div className="flex flex-wrap gap-2">
        <input
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={placeholder}
          disabled={busy}
          className="min-w-[16rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <button
          type="button"
          disabled={busy || !input.trim()}
          onClick={onAdd}
          className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"
        >
          {addLabel}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted">
          None pinned yet.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {items.map((item, i) => (
            <li
              key={item.slotId}
              className={`flex items-center gap-3 px-3 py-3 md:px-4 ${
                i > 0 ? "border-t border-border" : ""
              } ${item.missing ? "opacity-60" : ""}`}
            >
              {item.coverImageUrl ? (
                <img
                  src={item.coverImageUrl}
                  alt=""
                  className="size-12 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div
                  className="size-12 shrink-0 rounded-md bg-accent-soft"
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
              <div className="flex shrink-0 flex-wrap gap-1">
                <button
                  type="button"
                  disabled={busy || i === 0}
                  onClick={() => onMove(item.slotId, "up")}
                  className="rounded border border-border px-2 py-1 text-[12px] disabled:opacity-40"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={busy || i === items.length - 1}
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
