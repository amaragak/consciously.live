import { Extension, Node, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { useJournalTranscribeApiBase } from "@/components/journal-transcribe-api-context";
import { transcribeJournalAudio } from "@/lib/medimade-api";
import { readShowVoiceClips } from "@/lib/journal-voice-clips-pref";

export type JournalVoiceClipAttrs = {
  src: string;
  mimeType: string;
  /** TipTap HTML kept for re-transcribe / legacy cards. */
  transcriptHtml?: string | null;
  /** Optional precomputed peak heights 0–1 for the slim waveform. */
  peaks?: string | null;
};

function encodeTranscriptForAttr(html: string): string {
  return encodeURIComponent(html);
}

function decodeTranscriptFromAttr(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export function formatAudioClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function plainTextToTipTapHtml(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const blocks = trimmed
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return blocks.map((b) => `<p>${escape(b).replace(/\n/g, "<br />")}</p>`).join("");
}

export function dataUrlToBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  if (i === -1) return dataUrl;
  return dataUrl.slice(i + 1);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result === "string") resolve(r.result);
      else reject(new Error("Could not read recording"));
    };
    r.onerror = () => reject(r.error ?? new Error("Could not read recording"));
    r.readAsDataURL(blob);
  });
}

/** Build a short peak string from a recording blob (best-effort). */
export async function peaksFromAudioBlob(
  blob: Blob,
  bars = 36,
): Promise<string> {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return "";
    const ctx = new Ctx();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channel = buf.getChannelData(0);
    const block = Math.max(1, Math.floor(channel.length / bars));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      const start = i * block;
      const end = Math.min(channel.length, start + block);
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j] ?? 0);
        if (v > peak) peak = v;
      }
      peaks.push(Math.min(1, peak * 1.6));
    }
    void ctx.close();
    return peaks.map((p) => p.toFixed(3)).join(",");
  } catch {
    return "";
  }
}

function parsePeaks(raw: string | null | undefined): number[] {
  if (!raw?.trim()) {
    return Array.from({ length: 36 }, (_, i) => 0.25 + ((i * 7) % 10) * 0.05);
  }
  const nums = raw
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  return nums.length ? nums : Array.from({ length: 36 }, () => 0.35);
}

/**
 * Insert a voice clip block at the cursor. If the cursor is not at the start of the
 * current text block, split first so the clip appears on the following line/block.
 */
export function insertJournalVoiceClipAtCursor(
  editor: Editor,
  attrs: JournalVoiceClipAttrs & { transcriptPlain?: string },
): void {
  const { $from } = editor.state.selection;
  const atBlockStart = $from.parentOffset === 0;
  const chain = editor.chain().focus();
  if (!atBlockStart) {
    chain.splitBlock();
  }
  const showClips = readShowVoiceClips();
  const transcript = (attrs.transcriptPlain ?? "").trim();
  chain
    .insertContent({
      type: "journalVoiceClip",
      attrs: {
        src: attrs.src,
        mimeType: attrs.mimeType,
        peaks: attrs.peaks ?? null,
        transcriptHtml: attrs.transcriptHtml ?? null,
      },
    })
    .run();

  if (transcript) {
    const html = plainTextToTipTapHtml(transcript);
    if (html) {
      // Grouped transcript paragraphs (bronze rule when clips are shown).
      const wrapped = html.replace(
        /<p(\s|>)/g,
        showClips
          ? '<p data-voice-transcript="1"$1'
          : "<p$1",
      );
      editor.chain().focus().insertContent(wrapped).run();
    }
  }
}

/** Insert/replace live interim muted italic text at the caret (during recording). */
export function upsertLiveVoiceDraft(
  editor: Editor,
  text: string,
  draftPosRef: { current: number | null },
): void {
  const plain = text.trim();
  const { state } = editor;
  if (!plain) {
    if (draftPosRef.current != null) {
      const pos = draftPosRef.current;
      try {
        const $pos = state.doc.resolve(Math.min(pos, state.doc.content.size));
        const from = $pos.before($pos.depth);
        const node = $pos.parent;
        if (node.type.name === "paragraph" && node.attrs?.voiceDraft) {
          editor
            .chain()
            .focus()
            .deleteRange({ from, to: from + node.nodeSize })
            .run();
        }
      } catch {
        /* */
      }
      draftPosRef.current = null;
    }
    return;
  }

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<p data-voice-draft="1"><em class="journal-voice-live">${escape(plain)}</em></p>`;

  if (draftPosRef.current == null) {
    const { $from } = state.selection;
    if ($from.parentOffset !== 0) {
      editor.chain().focus().splitBlock().run();
    }
    draftPosRef.current = editor.state.selection.from;
    editor.chain().focus().insertContent(html).run();
    return;
  }

  try {
    const pos = draftPosRef.current;
    const $pos = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size));
    let depth = $pos.depth;
    while (depth > 0 && $pos.node(depth).type.name !== "paragraph") depth -= 1;
    const node = $pos.node(depth);
    const from = $pos.before(depth);
    if (node?.attrs?.voiceDraft || node?.textContent != null) {
      editor
        .chain()
        .focus()
        .deleteRange({ from, to: from + node.nodeSize })
        .insertContentAt(from, html)
        .run();
      draftPosRef.current = from;
      return;
    }
  } catch {
    /* fall through */
  }
  draftPosRef.current = editor.state.selection.from;
  editor.chain().focus().insertContent(html).run();
}

export function clearLiveVoiceDraft(
  editor: Editor,
  draftPosRef: { current: number | null },
): void {
  upsertLiveVoiceDraft(editor, "", draftPosRef);
}

function ClipWaveform({
  peaks,
  progress,
  onSeek,
}: {
  peaks: number[];
  progress: number;
  onSeek: (ratio: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  function ratioFromEvent(clientX: number): number {
    const el = ref.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
  }

  function onPointerDown(e: ReactPointerEvent) {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onSeek(ratioFromEvent(e.clientX));
  }
  function onPointerMove(e: ReactPointerEvent) {
    if (!dragging.current) return;
    onSeek(ratioFromEvent(e.clientX));
  }
  function onPointerUp() {
    dragging.current = false;
  }

  return (
    <div
      ref={ref}
      className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-[2px]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-label="Seek"
      tabIndex={0}
    >
      {peaks.map((p, i) => {
        const t = peaks.length <= 1 ? 0 : i / (peaks.length - 1);
        const played = t <= progress;
        return (
          <span
            key={i}
            className="w-[2px] shrink-0 rounded-full"
            style={{
              height: `${Math.max(18, Math.round(18 + p * 70))}%`,
              backgroundColor: played ? "#C8A46A" : "rgba(200,164,106,0.28)",
            }}
          />
        );
      })}
    </div>
  );
}

function JournalVoiceClipView(props: NodeViewProps) {
  const { node, deleteNode, updateAttributes, editor, getPos } = props;
  const transcribeApiBase = useJournalTranscribeApiBase();
  const src = node.attrs.src as string;
  const mimeType = (node.attrs.mimeType as string) || "audio/webm";
  const peaks = parsePeaks(node.attrs.peaks as string | null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirm, setConfirm] = useState<null | "retranscribe" | "delete">(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrent(el.currentTime);
    const syncDur = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuration(el.duration);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", syncDur);
    el.addEventListener("durationchange", syncDur);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", syncDur);
      el.removeEventListener("durationchange", syncDur);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
    };
  }, [src]);

  const progress =
    duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  function playFromStart() {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    void el.play();
    setMenu(null);
  }

  function seekRatio(ratio: number) {
    const el = audioRef.current;
    if (!el || !duration) return;
    el.currentTime = ratio * duration;
    setCurrent(el.currentTime);
  }

  /** Remove following voice-transcript paragraphs. */
  function removeGroupedTranscript() {
    const pos = typeof getPos === "function" ? getPos() : null;
    if (pos == null || !editor) return;
    const after = pos + node.nodeSize;
    let scan = after;
    const tr = editor.state.tr;
    let removed = 0;
    while (scan < tr.doc.content.size) {
      const $pos = tr.doc.resolve(scan);
      const n = $pos.nodeAfter;
      if (!n) break;
      if (n.type.name === "paragraph" && n.attrs?.voiceTranscript) {
        tr.delete(scan, scan + n.nodeSize);
        removed += 1;
        continue;
      }
      break;
    }
    if (removed) editor.view.dispatch(tr);
  }

  function keepTextDeleteClip() {
    removeGroupedTranscriptAttrsOnly();
    deleteNode();
    setMenu(null);
  }

  function removeGroupedTranscriptAttrsOnly() {
    const pos = typeof getPos === "function" ? getPos() : null;
    if (pos == null || !editor) return;
    let scan = pos + node.nodeSize;
    const { tr } = editor.state;
    while (scan < tr.doc.content.size) {
      const $pos = tr.doc.resolve(scan);
      const n = $pos.nodeAfter;
      if (!n) break;
      if (n.type.name === "paragraph" && n.attrs?.voiceTranscript) {
        tr.setNodeMarkup(scan, undefined, {
          ...n.attrs,
          voiceTranscript: false,
        });
        scan += n.nodeSize;
        continue;
      }
      break;
    }
    editor.view.dispatch(tr);
  }

  function deleteClipAndText() {
    removeGroupedTranscript();
    deleteNode();
    setConfirm(null);
    setMenu(null);
  }

  async function retranscribe() {
    if (!transcribeApiBase) return;
    setBusy(true);
    setConfirm(null);
    setMenu(null);
    try {
      const { text } = await transcribeJournalAudio({
        audioBase64: dataUrlToBase64(src),
        mimeType,
      });
      const html = plainTextToTipTapHtml(text);
      updateAttributes({
        transcriptHtml: html,
      });
      removeGroupedTranscript();
      const pos = typeof getPos === "function" ? getPos() : null;
      if (pos != null && html) {
        const insertAt = pos + node.nodeSize;
        const wrapped = html.replace(
          /<p(\s|>)/g,
          '<p data-voice-transcript="1"$1',
        );
        editor.chain().focus().insertContentAt(insertAt, wrapped).run();
      }
    } catch {
      /* keep prior */
    } finally {
      setBusy(false);
    }
  }

  // Auto-transcribe legacy clips that still only have audio.
  useEffect(() => {
    if (!transcribeApiBase || node.attrs.transcriptHtml) return;
    const pos = typeof getPos === "function" ? getPos() : null;
    if (pos == null) return;
    // If next node is already a transcript paragraph, skip.
    try {
      const after = editor.state.doc.resolve(pos + node.nodeSize).nodeAfter;
      if (after?.type.name === "paragraph" && after.attrs?.voiceTranscript) {
        return;
      }
    } catch {
      /* */
    }
    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        const { text } = await transcribeJournalAudio({
          audioBase64: dataUrlToBase64(src),
          mimeType,
        });
        if (cancelled) return;
        const html = plainTextToTipTapHtml(text);
        if (!html) return;
        updateAttributes({ transcriptHtml: html });
        const insertAt = pos + node.nodeSize;
        const showClips = readShowVoiceClips();
        const wrapped = html.replace(
          /<p(\s|>)/g,
          showClips ? '<p data-voice-transcript="1"$1' : "<p$1",
        );
        editor.chain().focus().insertContentAt(insertAt, wrapped).run();
      } catch {
        /* */
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, mimeType, transcribeApiBase]);

  return (
    <NodeViewWrapper
      className="journal-voice-clip not-prose my-2"
      data-journal-voice-clip="1"
      as="div"
    >
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <div
        className="journal-voice-clip-row flex h-11 items-center gap-2.5 rounded-full border border-border bg-[color:var(--surface,#f3eee6)] px-1.5 pr-3"
        onContextMenu={(e) => {
          if (!readShowVoiceClips()) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") {
            const t = window.setTimeout(() => {
              if (!readShowVoiceClips()) return;
              setMenu({ x: e.clientX, y: e.clientY });
            }, 480);
            const clear = () => window.clearTimeout(t);
            e.currentTarget.addEventListener("pointerup", clear, { once: true });
            e.currentTarget.addEventListener("pointercancel", clear, {
              once: true,
            });
          }
        }}
      >
        <button
          type="button"
          onClick={togglePlay}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#AFC2DC] text-on-accent"
          style={PRIMARY_ACCENT_FILL_STYLE}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
              <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </button>
        <ClipWaveform peaks={peaks} progress={progress} onSeek={seekRatio} />
        <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted">
          {formatAudioClock(playing || current > 0 ? current : duration)}
        </span>
      </div>
      {busy ? (
        <p className="mt-1 pl-10 text-[11px] text-muted">Getting text from audio…</p>
      ) : null}

      {menu
        ? createPortal(
            <div
              className="fixed z-[200] min-w-[11rem] rounded-xl border border-border bg-card py-1 shadow-lg"
              style={{ left: menu.x, top: menu.y }}
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent-soft/40"
                onClick={playFromStart}
              >
                Play from start
              </button>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent-soft/40"
                onClick={() => setConfirm("retranscribe")}
              >
                Re-transcribe
              </button>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent-soft/40"
                onClick={keepTextDeleteClip}
              >
                Keep text, delete clip
              </button>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft/40"
                onClick={() => setConfirm("delete")}
              >
                Delete clip
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[12px] text-muted"
                onClick={() => setMenu(null)}
              >
                Cancel
              </button>
            </div>,
            document.body,
          )
        : null}

      {confirm
        ? createPortal(
            <div className="fixed inset-0 z-[210] flex items-center justify-center bg-[#1E232E]/40 p-4">
              <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-xl">
                <p className="text-[15px] font-semibold text-foreground">
                  {confirm === "delete"
                    ? "Delete this clip and its transcript?"
                    : "Replace the transcript with a new transcription?"}
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-full px-4 py-2 text-[13px] font-semibold text-muted"
                    onClick={() => setConfirm(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={
                      confirm === "delete"
                        ? "rounded-full bg-danger px-4 py-2 text-[13px] font-semibold text-white"
                        : "rounded-full border border-[#AFC2DC] px-4 py-2 text-[13px] font-semibold text-on-accent"
                    }
                    style={
                      confirm === "retranscribe"
                        ? PRIMARY_ACCENT_FILL_STYLE
                        : undefined
                    }
                    onClick={() => {
                      if (confirm === "delete") deleteClipAndText();
                      else void retranscribe();
                    }}
                  >
                    {confirm === "delete" ? "Delete" : "Re-transcribe"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </NodeViewWrapper>
  );
}

/** Extends paragraph with voice-transcript / voice-draft attrs. */
export const JournalVoiceParagraphAttrs = Extension.create({
  name: "journalVoiceParagraphAttrs",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          voiceTranscript: {
            default: false,
            parseHTML: (el) =>
              el.getAttribute("data-voice-transcript") === "1",
            renderHTML: (attrs) =>
              attrs.voiceTranscript
                ? {
                    "data-voice-transcript": "1",
                    class: "journal-voice-transcript",
                  }
                : {},
          },
          voiceDraft: {
            default: false,
            parseHTML: (el) => el.getAttribute("data-voice-draft") === "1",
            renderHTML: (attrs) =>
              attrs.voiceDraft
                ? {
                    "data-voice-draft": "1",
                    class: "journal-voice-draft",
                  }
                : {},
          },
        },
      },
    ];
  },
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== "paragraph") return false;
        if (!$from.parent.attrs.voiceTranscript) return false;
        // Split then clear the attr on the new paragraph.
        const ok = editor.commands.splitBlock();
        if (!ok) return false;
        const { $from: $next } = editor.state.selection;
        if ($next.parent.type.name === "paragraph") {
          editor.commands.updateAttributes("paragraph", {
            voiceTranscript: false,
            voiceDraft: false,
          });
        }
        return true;
      },
    };
  },
});

export const JournalVoiceClip = Node.create({
  name: "journalVoiceClip",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      mimeType: { default: "audio/webm" },
      transcriptHtml: { default: null },
      peaks: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-journal-voice-clip="1"]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const src =
            element.getAttribute("data-src") ||
            element.querySelector("audio")?.getAttribute("src");
          if (!src) return false;
          const mime =
            element.getAttribute("data-mime") ||
            element.querySelector("audio")?.getAttribute("type") ||
            "audio/webm";
          const rawTranscript = element.getAttribute("data-transcript");
          const transcriptHtml = decodeTranscriptFromAttr(rawTranscript);
          const peaks = element.getAttribute("data-peaks");
          return { src, mimeType: mime, transcriptHtml, peaks };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const src = node.attrs.src as string | null;
    const mimeType = (node.attrs.mimeType as string) || "audio/webm";
    const transcriptHtml = (node.attrs.transcriptHtml as string | null) ?? null;
    const peaks = (node.attrs.peaks as string | null) ?? null;
    const transcriptAttr =
      transcriptHtml && transcriptHtml.trim()
        ? encodeTranscriptForAttr(transcriptHtml)
        : null;
    if (!src) {
      return [
        "div",
        mergeAttributes(
          { "data-journal-voice-clip": "1", class: "journal-voice-clip" },
          HTMLAttributes,
        ),
      ];
    }
    return [
      "div",
      mergeAttributes(
        {
          "data-journal-voice-clip": "1",
          "data-src": src,
          "data-mime": mimeType,
          ...(transcriptAttr ? { "data-transcript": transcriptAttr } : {}),
          ...(peaks ? { "data-peaks": peaks } : {}),
          class: "journal-voice-clip my-2",
        },
        HTMLAttributes,
      ),
      ["audio", { controls: "true", preload: "metadata", src, type: mimeType }],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(JournalVoiceClipView);
  },
});

/* ── Legacy card UI (superseded by slim clip row) — kept for reference
function LegacyJournalVoiceClipCard() { ... }
── */
