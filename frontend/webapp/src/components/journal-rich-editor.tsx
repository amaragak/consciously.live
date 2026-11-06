import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import {
  MarkdownClipboard,
  TIPTAP_DISABLE_PLAIN_CLIPBOARD,
} from "@/lib/tiptap-markdown-clipboard";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Image as ImageIcon, List, ListOrdered, Redo2, Undo2, X } from "lucide-react";
import { JournalMobileWritingBar } from "@/components/journal-mobile-writing-bar";
import { JournalVoiceAllowanceBar } from "@/components/journal-voice-allowance-bar";
import {
  APP_MOBILE_TAB_BAR_GAP_PX,
  APP_MOBILE_TAB_BAR_H_PX,
  readMobileTabPillBottomOffsetPx,
} from "@/lib/app-mobile-tab-bar";
import {
  NATIVE_KEYBOARD_EVENT,
  hideSoftwareKeyboard,
  isNativeApp,
  isNativeKeyboardOpen,
  setNativeKeyboardOverlay,
  type NativeKeyboardDetail,
} from "@/lib/native/native-bridge";
import {
  formatJournalEntryCardDate,
  formatJournalEntryDate,
  isoToDateInput,
  dateInputToIso,
} from "@/lib/journal-storage";
import {
  JournalVoiceClip,
  JournalVoiceParagraphAttrs,
  blobToDataUrl,
  clearLiveVoiceDraft,
  dataUrlToBase64,
  formatAudioClock,
  findJournalVoiceClipPosById,
  insertJournalVoiceClipAtCursor,
  NO_SPEECH_LABEL,
  peaksFromAudioBlob,
  plainTextToTipTapHtml,
  replaceTranscriptAfterClip,
  scrubOrphanVoiceHtml,
  silentWavDataUrl,
  stripOrphanJournalVoicePlaceholders,
  updateJournalVoiceClipSrc,
} from "@/components/journal-voice-clip-extension";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import {
  polishTranscript,
  startOnDeviceSpeech,
  writeTranscriptionEngineDiag,
  type OnDeviceSpeechHandle,
} from "@/lib/journal-on-device-speech";
import {
  transcribeJournalAudio,
  uploadJournalVoice,
} from "@/lib/medimade-api";
import {
  JournalImage,
  compressImageFileToJpegDataUrl,
} from "@/components/journal-image-extension";
import { JournalTranscribeApiContext } from "@/components/journal-transcribe-api-context";
import { JournalPrompt } from "@/components/journal-prompt-extension";
import {
  JournalPromptsPanel,
  type JournalPromptSources,
} from "@/components/journal-prompts-panel";
import { journalPromptMarksFromHtml } from "@/lib/journal-storage";

/** Browser SpeechRecognition (not in all TS DOM libs). */
type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0?: { transcript?: string };
  }>;
};

const editorClass =
  "min-h-[8rem] w-full px-7 py-6 text-base leading-[1.85] text-foreground focus:outline-none " +
  "[&_.ProseMirror]:min-h-[8rem] [&_p]:my-2 [&_p.is-editor-empty:first-child::before]:text-muted/60 " +
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-medium [&_h2]:tracking-tight " +
  "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-display [&_h3]:text-base [&_h3]:font-medium " +
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:my-0.5 [&_strong]:font-semibold [&_em]:italic " +
  "[&_.journal-prompt-answer_p]:my-0 " +
  "[&_sub]:align-sub [&_sub]:text-[0.75em] [&_sup]:align-super [&_sup]:text-[0.75em] " +
  "[&_img]:my-3 [&_img]:max-h-[28rem] [&_img]:max-w-full [&_img]:rounded-lg";

type Props = {
  entryId: string;
  initialHtml: string;
  initialTitle: string;
  /** Day the entry is about (editable under the title). */
  entryDate: string;
  /** System timestamps for the ⋯ menu info line. */
  createdAt: string;
  updatedAt: string;
  onEntryDateChange?: (iso: string) => void;
  /** When set, shows a mic that records into the journal and enables clip transcription. */
  transcribeApiBase: string | null;
  titlePlaceholder?: string;
  placeholder?: string;
  onHtmlChange: (html: string) => void;
  onTitleChange: (title: string) => void;
  onDelete?: () => void;
  onConnectLifeArea?: () => void;
  connectLifeAreaLabel?: string;
  onGenerateMeditation?: () => void;
  /** Extra classes for the overflow menu (e.g. hide on mobile when chrome is external). */
  entryMenuClassName?: string;
  /** Optional items rendered at the top of the entry overflow menu. */
  entryMenuBefore?: ReactNode;
  /** Mood row above the title (journal entries redesign). */
  headerBefore?: ReactNode;
  /** Connections / meta row below the title. */
  headerAfter?: ReactNode;
  /** Slot under title/meta, above the toolbar (e.g. Reflect meditation card). */
  belowHeader?: ReactNode;
  /** Prompt chips when the body is empty (Reflect). Commented out in the editor. */
  emptyBodyPrompts?: readonly string[];
  /** Life areas, values, and Heal items for the Prompts panel. */
  promptSources?: JournalPromptSources;
  /** Sticky bottom bar (word count + actions). */
  bottomBar?: ReactNode;
  /** Hide the created-date line when date is shown elsewhere. */
  hideCreatedDate?: boolean;
  /**
   * Mobile entry compose (consciously-journal-entry-mobile): one card, floating
   * writing bar, in-page toolbar commented out on phone.
   */
  mobileCardLayout?: boolean;
  /** Passage to highlight when opened from Insights (`?highlight=`). */
  highlightQuote?: string | null;
  /** Muted autosave line by the date ("Saving…", "Saved", …). */
  syncStatusLabel?: string | null;
  /** Optional secondary footer above the bottom bar (e.g. tags). */
  children?: ReactNode;
};

export function JournalRichEditor({
  entryId,
  initialHtml,
  initialTitle,
  entryDate,
  createdAt,
  updatedAt,
  onEntryDateChange,
  transcribeApiBase,
  titlePlaceholder = "Title",
  placeholder = "Write what's on your mind…",
  onHtmlChange,
  onTitleChange,
  onDelete,
  onConnectLifeArea,
  connectLifeAreaLabel = "Connect to life area",
  onGenerateMeditation,
  entryMenuClassName,
  entryMenuBefore,
  headerBefore,
  headerAfter,
  belowHeader,
  emptyBodyPrompts: _emptyBodyPrompts,
  promptSources,
  bottomBar,
  hideCreatedDate = false,
  mobileCardLayout = false,
  highlightQuote = null,
  syncStatusLabel = null,
  children,
}: Props) {
  const titleSeededForEntryRef = useRef<string | null>(null);
  const editorSeededForEntryRef = useRef<string | null>(null);
  const [entryTitle, setEntryTitle] = useState(initialTitle);
  const [menuOpen, setMenuOpen] = useState(false);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [toolbarMoreOpen, setToolbarMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voicePaused, setVoicePaused] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceBars, setVoiceBars] = useState<number[]>(() =>
    Array.from({ length: 48 }, () => 0.12),
  );
  const [bodyEmpty, setBodyEmpty] = useState(true);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [usedPromptIds, setUsedPromptIds] = useState<string[]>([]);
  const [bodyFocused, setBodyFocused] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const entryScrollRef = useRef<HTMLDivElement | null>(null);
  /** Locked from keyboard-closed viewport so opening the keyboard never shrinks the card. */
  const cardMinHeightLockedRef = useRef<number | null>(null);
  const [cardMinHeightPx, setCardMinHeightPx] = useState<number | undefined>();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaRecorderMimeRef = useRef<string>("");
  const mediaChunksRef = useRef<BlobPart[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const voiceDraftPosRef = useRef<number | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const voiceLevelRafRef = useRef<number | null>(null);
  const speechRecRef = useRef<BrowserSpeechRecognition | null>(null);
  const liveTranscriptRef = useRef("");
  const onDeviceSpeechRef = useRef<OnDeviceSpeechHandle | null>(null);
  const usedOnDeviceRef = useRef(false);
  const silenceSecRef = useRef(0);
  const voiceSecondsRef = useRef(0);
  const finishRecordingRef = useRef<() => void>(() => {});
  const serverFallbackRef = useRef(false);
  const [serverFallbackMode, setServerFallbackMode] = useState(false);
  const [silenceNote, setSilenceNote] = useState<string | null>(null);
  /** Capgo-only native session (no MediaRecorder — dual mic crashes iOS). */
  const nativeCapgoOnlyRef = useRef(false);
  const voicePeaksAccRef = useRef<number[]>([]);
  /** In-memory speech buffers — never written into the TipTap doc until Done. */
  const committedSpeechRef = useRef("");
  const currentSegmentRef = useRef("");
  const [livePreviewText, setLivePreviewText] = useState<string | null>(null);

  const stopVoiceMetering = useCallback(() => {
    if (voiceTimerRef.current != null) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    if (voiceLevelRafRef.current != null) {
      window.cancelAnimationFrame(voiceLevelRafRef.current);
      voiceLevelRafRef.current = null;
    }
    setVoiceLevel(0);
    setVoiceBars(Array.from({ length: 48 }, () => 0.12));
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    const rec = speechRecRef.current;
    speechRecRef.current = null;
    if (rec) {
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop();
      } catch {
        try {
          rec.abort();
        } catch {
          /* */
        }
      }
    }
    const od = onDeviceSpeechRef.current;
    onDeviceSpeechRef.current = null;
    if (od) void od.stop();
  }, []);

  const stopMediaRecorderAndCollectBlob = useCallback(async (): Promise<Blob | null> => {
    stopVoiceMetering();
    stopSpeechRecognition();
    const rec = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (rec && rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
        try {
          rec.stop();
        } catch {
          resolve();
        }
      });
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    const parts = mediaChunksRef.current;
    mediaChunksRef.current = [];
    const preferred =
      mediaRecorderMimeRef.current ||
      (typeof rec?.mimeType === "string" ? rec.mimeType : "") ||
      "audio/webm";
    mediaRecorderMimeRef.current = "";
    if (!parts.length) return null;
    const chunkType = (parts[0] as Blob).type;
    return new Blob(parts, { type: chunkType || preferred });
  }, [stopSpeechRecognition, stopVoiceMetering]);

  const refreshLivePreview = useCallback(() => {
    const full = [committedSpeechRef.current, currentSegmentRef.current]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    liveTranscriptRef.current = full;
    setLivePreviewText(full || null);
  }, []);

  const commitSpeechSegment = useCallback(() => {
    const cur = currentSegmentRef.current.trim();
    if (!cur) return;
    committedSpeechRef.current = [committedSpeechRef.current, cur]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    currentSegmentRef.current = "";
    refreshLivePreview();
  }, [refreshLivePreview]);

  /** Replace-only live hypothesis for the current segment (never append into the doc). */
  const pushLiveDraft = useCallback(
    (text: string) => {
      currentSegmentRef.current = text.trim();
      refreshLivePreview();
    },
    [refreshLivePreview],
  );

  const clearLivePreview = useCallback(() => {
    committedSpeechRef.current = "";
    currentSegmentRef.current = "";
    liveTranscriptRef.current = "";
    setLivePreviewText(null);
    const ed = editorRef.current;
    if (ed) clearLiveVoiceDraft(ed, voiceDraftPosRef);
  }, []);

  const pushCapgoLevel = useCallback((level: number) => {
    const n = Math.max(0, Math.min(1, level));
    setVoiceLevel(n);
    voicePeaksAccRef.current.push(n);
    if (voicePeaksAccRef.current.length > 240) {
      voicePeaksAccRef.current = voicePeaksAccRef.current.slice(-240);
    }
    if (n < 0.08) silenceSecRef.current += 1 / 15;
    else silenceSecRef.current = 0;
    if (silenceSecRef.current >= 60) {
      silenceSecRef.current = 0;
      setSilenceNote("Stopped after a minute of silence");
      finishRecordingRef.current();
    }
    setVoiceBars((prev) => {
      const next = prev.slice(1);
      next.push(0.12 + n * 0.88);
      return next;
    });
  }, []);

  const startSpeechRecognition = useCallback(
    (opts?: { withLevels?: boolean }) => {
      stopSpeechRecognition();
      usedOnDeviceRef.current = false;
      serverFallbackRef.current = false;
      setServerFallbackMode(false);
      void startOnDeviceSpeech({
        onPartial: (partial) => {
          pushLiveDraft(partial);
        },
        onSegmentEnd: () => {
          commitSpeechSegment();
        },
        onLevel: opts?.withLevels ? pushCapgoLevel : undefined,
      }).then((handle) => {
        if (!handle) {
          serverFallbackRef.current = true;
          setServerFallbackMode(true);
          return;
        }
        onDeviceSpeechRef.current = handle;
        usedOnDeviceRef.current = handle.usedOnDevice;
        serverFallbackRef.current = !handle.usedOnDevice;
        setServerFallbackMode(!handle.usedOnDevice);
      });
    },
    [commitSpeechSegment, pushCapgoLevel, pushLiveDraft, stopSpeechRecognition],
  );

  const startVoiceMetering = useCallback(
    (stream: MediaStream) => {
      stopVoiceMetering();
      setVoiceSeconds(0);
      silenceSecRef.current = 0;
      voiceSecondsRef.current = 0;
      voiceTimerRef.current = window.setInterval(() => {
        setVoiceSeconds((s) => {
          const next = s + 1;
          voiceSecondsRef.current = next;
          // Server fallback: hard stop at 15 minutes.
          if (serverFallbackRef.current && next >= 15 * 60) {
            finishRecordingRef.current();
          }
          return next;
        });
      }, 1000);
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i] ?? 0;
          const avg = sum / (data.length * 255);
          const level = Math.min(1, avg * 2.2);
          setVoiceLevel(level);
          if (level < 0.08) silenceSecRef.current += 1 / 60;
          else silenceSecRef.current = 0;
          if (silenceSecRef.current >= 60) {
            silenceSecRef.current = 0;
            setSilenceNote("Stopped after a minute of silence");
            finishRecordingRef.current();
          }
          setVoiceBars((prev) => {
            const next = prev.slice(1);
            next.push(0.12 + level * 0.88);
            return next;
          });
          voiceLevelRafRef.current = window.requestAnimationFrame(tick);
        };
        voiceLevelRafRef.current = window.requestAnimationFrame(tick);
        void ctx;
      } catch {
        /* waveform optional */
      }
    },
    [stopVoiceMetering],
  );

  const startMediaRecorderPath = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError("Recording is not supported in this browser.");
      return false;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    mediaChunksRef.current = [];
    setVoicePaused(false);
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    const mime =
      candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    mediaRecorderMimeRef.current = mime || rec.mimeType || "";
    mediaRecorderRef.current = rec;
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) mediaChunksRef.current.push(ev.data);
    };
    for (const track of stream.getAudioTracks()) {
      track.onmute = () => {
        setVoicePaused(true);
        try {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.pause();
          }
        } catch {
          /* */
        }
      };
      track.onunmute = () => {
        setVoicePaused(false);
        try {
          if (mediaRecorderRef.current?.state === "paused") {
            mediaRecorderRef.current.resume();
          }
        } catch {
          /* */
        }
      };
    }
    rec.start(200);
    startVoiceMetering(stream);
    return true;
  }, [startVoiceMetering]);

  const startVoiceRecording = useCallback(async () => {
    setVoiceError(null);
    if (!transcribeApiBase || voiceBusy) return;
    clearLivePreview();
    voiceDraftPosRef.current = null;
    voicePeaksAccRef.current = [];
    silenceSecRef.current = 0;
    voiceSecondsRef.current = 0;
    nativeCapgoOnlyRef.current = false;
    setVoicePaused(false);
    setVoiceSeconds(0);
    setVoiceBars(Array.from({ length: 48 }, () => 0.12));

    // Native: Capgo alone for on-device live text (MediaRecorder + Capgo crashes iOS).
    if (isNativeApp()) {
      stopSpeechRecognition();
      usedOnDeviceRef.current = false;
      serverFallbackRef.current = false;
      setServerFallbackMode(false);
      const handle = await startOnDeviceSpeech({
        onPartial: (partial) => {
          pushLiveDraft(partial);
        },
        onSegmentEnd: () => {
          commitSpeechSegment();
        },
        onLevel: pushCapgoLevel,
      });
      if (handle?.usedOnDevice) {
        onDeviceSpeechRef.current = handle;
        usedOnDeviceRef.current = true;
        nativeCapgoOnlyRef.current = true;
        // Keep audioLevel-driven bars; only start the clock (don't wipe levels).
        if (voiceTimerRef.current != null) {
          window.clearInterval(voiceTimerRef.current);
        }
        voiceTimerRef.current = window.setInterval(() => {
          setVoiceSeconds((s) => {
            const next = s + 1;
            voiceSecondsRef.current = next;
            return next;
          });
        }, 1000);
        setVoiceRecording(true);
        return;
      }
      // Capgo unavailable → MediaRecorder + server Whisper.
      serverFallbackRef.current = true;
      setServerFallbackMode(true);
      writeTranscriptionEngineDiag(
        "server",
        "Falling back to MediaRecorder + server transcribe",
      );
      try {
        const ok = await startMediaRecorderPath();
        if (!ok) return;
        setVoiceRecording(true);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Could not access microphone";
        setVoiceError(msg);
      }
      return;
    }

    // Web: MediaRecorder for the clip + browser speech when available.
    try {
      const ok = await startMediaRecorderPath();
      if (!ok) return;
      setVoiceRecording(true);
      startSpeechRecognition();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not access microphone";
      setVoiceError(msg);
    }
  }, [
    clearLivePreview,
    commitSpeechSegment,
    pushCapgoLevel,
    pushLiveDraft,
    startMediaRecorderPath,
    startSpeechRecognition,
    stopSpeechRecognition,
    transcribeApiBase,
    voiceBusy,
  ]);

  // Keep show/hide clips in sync with the account preference.
  useEffect(() => {
    let cancelled = false;
    void import("@/lib/journal-voice-clips-pref").then(async (m) => {
      m.applyShowVoiceClipsToDom(m.readShowVoiceClips());
      try {
        const { fetchUserSettings } = await import("@/lib/settings-api");
        const { settings } = await fetchUserSettings();
        if (!cancelled) m.syncShowVoiceClipsFromSettings(settings);
      } catch {
        /* offline / local */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Journal entry: shrink the web view with the keyboard (native resize) so the
  // page can scroll the caret above the writing bar. Restore overlay on leave.
  useEffect(() => {
    if (!mobileCardLayout || !isNativeApp()) return;
    setNativeKeyboardOverlay(false);
    return () => {
      setNativeKeyboardOverlay(true);
    };
  }, [mobileCardLayout]);

  // Card min-height from keyboard-closed screen only — never shrinks when the
  // keyboard opens (native resize would otherwise collapse flex-1 children).
  useEffect(() => {
    if (!mobileCardLayout) return;

    const keyboardOccludes = () => {
      if (isNativeApp() && isNativeKeyboardOpen()) return true;
      const vv = window.visualViewport;
      if (!vv) return false;
      return Math.max(0, window.innerHeight - vv.height - vv.offsetTop) > 80;
    };

    const measureClosed = () => {
      if (keyboardOccludes()) return;
      const scroller = entryScrollRef.current;
      if (!scroller) return;
      const top = scroller.getBoundingClientRect().top;
      const next = Math.round(window.innerHeight - top);
      if (next <= 0) return;
      const locked = cardMinHeightLockedRef.current;
      // Allow settling upward while closed; never shrink once locked.
      if (locked != null && next <= locked) return;
      cardMinHeightLockedRef.current = next;
      setCardMinHeightPx(next);
    };

    measureClosed();
    const t = window.setTimeout(measureClosed, 120);
    window.addEventListener("resize", measureClosed);
    window.visualViewport?.addEventListener("resize", measureClosed);
    window.addEventListener(NATIVE_KEYBOARD_EVENT, measureClosed);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measureClosed);
      window.visualViewport?.removeEventListener("resize", measureClosed);
      window.removeEventListener(NATIVE_KEYBOARD_EVENT, measureClosed);
    };
  }, [mobileCardLayout]);

  const scrollCaretAboveWritingBar = useCallback(() => {
    const ed = editorRef.current;
    const scroller = entryScrollRef.current;
    if (!ed || !scroller || typeof window === "undefined") return;
    try {
      const coords = ed.view.coordsAtPos(ed.state.selection.head);
      const barBottom = readMobileTabPillBottomOffsetPx();
      const clearAboveBar =
        APP_MOBILE_TAB_BAR_H_PX + APP_MOBILE_TAB_BAR_GAP_PX + 24;
      const limitY = window.innerHeight - barBottom - clearAboveBar;
      if (coords.bottom > limitY) {
        scroller.scrollBy({
          top: coords.bottom - limitY,
          behavior: "smooth",
        });
      } else if (coords.top < 72) {
        scroller.scrollBy({
          top: coords.top - 72,
          behavior: "smooth",
        });
      }
    } catch {
      /* selection can be transiently invalid */
    }
  }, []);

  // Overview “Talk it out” sets this before navigating to a new entry.
  useEffect(() => {
    try {
      if (sessionStorage.getItem("journal-autostart-voice") !== "1") return;
      sessionStorage.removeItem("journal-autostart-voice");
    } catch {
      return;
    }
    const t = window.setTimeout(() => {
      void startVoiceRecording();
    }, 450);
    return () => window.clearTimeout(t);
  }, [startVoiceRecording]);

  const finishRecordingIntoEditor = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed || voiceBusy) return;
    setVoiceError(null);
    setVoiceBusy(true);
    setVoiceRecording(false);
    setVoicePaused(false);
    // Fold the last open segment into the committed buffer before reading.
    commitSpeechSegment();
    const liveRaw = liveTranscriptRef.current;
    const live = polishTranscript(liveRaw);
    const usedOnDevice = usedOnDeviceRef.current;
    const capgoOnly = nativeCapgoOnlyRef.current;
    const durationSec = Math.max(1, voiceSecondsRef.current);
    const note = silenceNote;
    const peakSamples = voicePeaksAccRef.current.slice();
    setSilenceNote(null);
    // Remove preview entirely before inserting anything into the document.
    clearLivePreview();
    try {
      let blob: Blob | null = null;
      if (capgoOnly) {
        stopVoiceMetering();
        const od = onDeviceSpeechRef.current;
        onDeviceSpeechRef.current = null;
        if (od) await od.stop();
        const silent = silentWavDataUrl(durationSec);
        const res = await fetch(silent);
        blob = await res.blob();
        mediaRecorderMimeRef.current = "audio/wav";
      } else {
        blob = await stopMediaRecorderAndCollectBlob();
      }
      if (!blob || blob.size < 32) {
        const silent = silentWavDataUrl(durationSec);
        const res = await fetch(silent);
        blob = await res.blob();
        mediaRecorderMimeRef.current = "audio/wav";
      }
      const mimeType =
        (blob.type || mediaRecorderMimeRef.current || "audio/webm").split(
          ";",
        )[0] || "audio/webm";
      let peaks = "";
      if (peakSamples.length) {
        const step = Math.max(1, Math.floor(peakSamples.length / 36));
        peaks = peakSamples
          .filter((_, i) => i % step === 0)
          .slice(0, 36)
          .map((p) => p.toFixed(3))
          .join(",");
      }
      if (!peaks) peaks = (await peaksFromAudioBlob(blob)) || "";

      // Local blob URL first so the clip row plays immediately; never embed
      // data:audio in contentHtml (DynamoDB size limit → save retry loop).
      const localUrl = URL.createObjectURL(blob);
      const transcriptForInsert = usedOnDevice
        ? live || NO_SPEECH_LABEL
        : "Transcribing…";
      const { clipId } = insertJournalVoiceClipAtCursor(ed, {
        src: localUrl,
        mimeType,
        peaks: peaks || null,
        transcriptPlain: transcriptForInsert,
        transcriptHtml: plainTextToTipTapHtml(transcriptForInsert),
      });

      const dataUrl = await blobToDataUrl(blob);
      void (async () => {
        try {
          const uploaded = await uploadJournalVoice({
            audioBase64: dataUrlToBase64(dataUrl),
            mimeType,
          });
          const edNow = editorRef.current;
          if (edNow) updateJournalVoiceClipSrc(edNow, clipId, uploaded.url);
          try {
            URL.revokeObjectURL(localUrl);
          } catch {
            /* */
          }
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : "Voice upload failed";
          console.error("[journal-voice] upload failed", e);
          writeTranscriptionEngineDiag("server", `Voice upload failed: ${msg}`);
          // Leave blob: src so local play still works; sync stays small.
        }
      })();

      if (usedOnDevice) {
        if (note) {
          ed.chain()
            .focus()
            .insertContent(
              `<p data-voice-transcript="1"><em class="journal-voice-live">${note}</em></p>`,
            )
            .run();
        }
      } else {
        try {
          const { text, deferred, resetsAt } = await transcribeJournalAudio({
            audioBase64: dataUrlToBase64(dataUrl),
            mimeType,
            durationSec,
            feature: "journal-transcribe",
          });
          const clipPos = findJournalVoiceClipPosById(ed, clipId);
          if (clipPos != null) {
            let replacement: string;
            if (deferred) {
              const when = resetsAt
                ? new Date(resetsAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : "next month";
              replacement = `Transcribes on ${when}`;
            } else {
              replacement = polishTranscript(text || "") || NO_SPEECH_LABEL;
            }
            replaceTranscriptAfterClip(ed, clipPos, replacement);
            if (note) {
              ed.chain()
                .focus()
                .insertContent(
                  `<p data-voice-transcript="1"><em class="journal-voice-live">${note}</em></p>`,
                )
                .run();
            }
          }
        } catch (e) {
          const clipPos = findJournalVoiceClipPosById(ed, clipId);
          if (clipPos != null) {
            replaceTranscriptAfterClip(ed, clipPos, NO_SPEECH_LABEL);
          }
          setVoiceError(
            e instanceof Error ? e.message : "Could not transcribe recording",
          );
        }
      }
    } catch (e) {
      console.error("[journal-voice] finish failed", e);
      setVoiceError(e instanceof Error ? e.message : "Could not save recording");
    } finally {
      setVoiceBusy(false);
      setVoiceSeconds(0);
      voiceSecondsRef.current = 0;
      usedOnDeviceRef.current = false;
      serverFallbackRef.current = false;
      nativeCapgoOnlyRef.current = false;
      voicePeaksAccRef.current = [];
      setServerFallbackMode(false);
    }
  }, [
    clearLivePreview,
    commitSpeechSegment,
    silenceNote,
    stopMediaRecorderAndCollectBlob,
    stopVoiceMetering,
    voiceBusy,
  ]);

  finishRecordingRef.current = () => {
    void finishRecordingIntoEditor();
  };

  const cancelVoiceRecording = useCallback(async () => {
    clearLivePreview();
    setVoiceRecording(false);
    setVoicePaused(false);
    setVoiceSeconds(0);
    nativeCapgoOnlyRef.current = false;
    voicePeaksAccRef.current = [];
    await stopMediaRecorderAndCollectBlob();
    setVoiceError(null);
  }, [clearLivePreview, stopMediaRecorderAndCollectBlob]);

  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Subscript,
      Superscript,
      MarkdownClipboard,
      Placeholder.configure({
        placeholder: ({ editor: ed, pos }) => {
          try {
            const $pos = ed.state.doc.resolve(pos + 1);
            for (let depth = $pos.depth; depth > 0; depth--) {
              if ($pos.node(depth).type.name === "journalPrompt") {
                return "Write your answer…";
              }
            }
          } catch {
            /* position can sit at the end of the doc */
          }
          return placeholder;
        },
        emptyEditorClass: "is-editor-empty",
      }),
      JournalVoiceClip,
      JournalVoiceParagraphAttrs,
      JournalImage,
      JournalPrompt,
    ],
    content: scrubOrphanVoiceHtml(initialHtml),
    immediatelyRender: false,
    enableCoreExtensions: TIPTAP_DISABLE_PLAIN_CLIPBOARD,
    editorProps: {
      attributes: {
        class: editorClass,
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: ed }) => {
      editorRef.current = ed;
      setBodyEmpty(ed.isEmpty);
      setUsedPromptIds(
        journalPromptMarksFromHtml(ed.getHTML())
          .map((mark) => mark.id)
          .filter(Boolean),
      );
      onHtmlChange(ed.getHTML());
    },
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed;
      if (stripOrphanJournalVoicePlaceholders(ed)) {
        onHtmlChange(ed.getHTML());
      }
      setBodyEmpty(ed.isEmpty);
      setUsedPromptIds(
        journalPromptMarksFromHtml(ed.getHTML())
          .map((mark) => mark.id)
          .filter(Boolean),
      );
    },
  });

  useEffect(() => {
    if (titleSeededForEntryRef.current === entryId) return;
    titleSeededForEntryRef.current = entryId;
    setEntryTitle(initialTitle);
  }, [entryId, initialTitle]);

  useEffect(() => {
    if (!editor) return;
    if (editorSeededForEntryRef.current === entryId) return;
    editorSeededForEntryRef.current = entryId;
    editor.commands.setContent(scrubOrphanVoiceHtml(initialHtml), {
      emitUpdate: false,
    });
    stripOrphanJournalVoicePlaceholders(editor);
    setBodyEmpty(editor.isEmpty);
  }, [entryId, initialHtml, editor]);

  useEffect(() => {
    if (!editor) return;
    const timer = window.setTimeout(() => {
      let armed = false;
      try {
        armed = sessionStorage.getItem("journal-focus-prompt") === "1";
      } catch {
        return;
      }
      if (!armed) return;
      let pos: number | null = null;
      editor.state.doc.descendants((node, at) => {
        if (node.type.name === "journalPrompt") {
          pos = at + 2;
          return false;
        }
      });
      if (pos == null) return;
      editor.commands.focus(pos);
      try {
        sessionStorage.removeItem("journal-focus-prompt");
      } catch {
        /* ignore */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editor, entryId]);

  /** New entries: focus the body so the caret + keyboard are ready (mobile). */
  useEffect(() => {
    if (!editor || !mobileCardLayout) return;
    let armed = false;
    try {
      armed = sessionStorage.getItem("journal-autofocus-body") === "1";
    } catch {
      return;
    }
    if (!armed) return;
    const timer = window.setTimeout(() => {
      editor.commands.focus("end");
      try {
        sessionStorage.removeItem("journal-autofocus-body");
      } catch {
        /* ignore */
      }
    }, 50);
    return () => window.clearTimeout(timer);
  }, [editor, entryId, mobileCardLayout]);

  useEffect(() => {
    if (!mobileCardLayout || !editor) return;
    const onUpdate = () => {
      if (!keyboardOpen && !isNativeKeyboardOpen()) return;
      scrollCaretAboveWritingBar();
    };
    editor.on("selectionUpdate", onUpdate);
    editor.on("update", onUpdate);
    const onNative = (e: Event) => {
      const detail = (e as CustomEvent<NativeKeyboardDetail>).detail;
      if (detail.open) {
        window.requestAnimationFrame(() => scrollCaretAboveWritingBar());
      }
    };
    window.addEventListener(NATIVE_KEYBOARD_EVENT, onNative);
    const vv = window.visualViewport;
    const onVv = () => {
      if (keyboardOpen || isNativeKeyboardOpen()) scrollCaretAboveWritingBar();
    };
    vv?.addEventListener("resize", onVv);
    return () => {
      editor.off("selectionUpdate", onUpdate);
      editor.off("update", onUpdate);
      window.removeEventListener(NATIVE_KEYBOARD_EVENT, onNative);
      vv?.removeEventListener("resize", onVv);
    };
  }, [editor, keyboardOpen, mobileCardLayout, scrollCaretAboveWritingBar]);

  useEffect(() => {
    if (!editor) return;
    const onFocus = () => setBodyFocused(true);
    const onBlur = () => setBodyFocused(false);
    editor.on("focus", onFocus);
    editor.on("blur", onBlur);
    return () => {
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || !highlightQuote?.trim()) return;
    const root = editor.view.dom as HTMLElement;
    const quote = highlightQuote.trim();
    // Clear prior marks
    root.querySelectorAll("mark[data-insights-highlight]").forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) {
      if (n.nodeType === Node.TEXT_NODE && n.textContent) nodes.push(n as Text);
    }
    const haystack = nodes.map((t) => t.textContent ?? "").join("");
    const lower = haystack.toLowerCase();
    const idx = lower.indexOf(quote.toLowerCase());
    if (idx < 0) return;

    let remaining = idx;
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;
    let cursor = 0;
    for (const t of nodes) {
      const len = t.textContent?.length ?? 0;
      if (!startNode && remaining < len) {
        startNode = t;
        startOffset = remaining;
      }
      if (startNode && cursor + len >= idx + quote.length) {
        endNode = t;
        endOffset = idx + quote.length - cursor;
        break;
      }
      if (!startNode) remaining -= len;
      cursor += len;
    }
    if (!startNode || !endNode) return;
    try {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, Math.min(endOffset, endNode.textContent?.length ?? 0));
      const mark = document.createElement("mark");
      mark.setAttribute("data-insights-highlight", "1");
      mark.className =
        "rounded-sm bg-accent-soft px-0.5 transition-colors duration-[2.5s]";
      range.surroundContents(mark);
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
      const fade = window.setTimeout(() => {
        mark.classList.add("bg-transparent");
      }, 500);
      const cleanup = window.setTimeout(() => {
        if (!mark.parentNode) return;
        const parent = mark.parentNode;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
      }, 3500);
      return () => {
        window.clearTimeout(fade);
        window.clearTimeout(cleanup);
      };
    } catch {
      /* surroundContents can fail on partial elements — ignore */
    }
  }, [editor, entryId, highlightQuote, initialHtml]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    return () => {
      void cancelVoiceRecording();
    };
  }, [entryId, cancelVoiceRecording]);

  useEffect(() => {
    setMenuOpen(false);
    setToolbarMoreOpen(false);
  }, [entryId]);

  useEffect(() => {
    if (!voiceRecording) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") void cancelVoiceRecording();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [voiceRecording, cancelVoiceRecording]);

  useEffect(() => {
    if (!voiceRecording) return;
    function onVis() {
      const rec = mediaRecorderRef.current;
      if (!rec) return;
      if (document.hidden) {
        setVoicePaused(true);
        try {
          if (rec.state === "recording") rec.pause();
        } catch {
          /* */
        }
      } else {
        setVoicePaused(false);
        try {
          if (rec.state === "paused") rec.resume();
        } catch {
          /* */
        }
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [voiceRecording]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!editor) {
    return (
      <div className="min-h-[12rem] flex-1 animate-pulse rounded-[6px] bg-surface-2/40" />
    );
  }

  const showEntryMenu = Boolean(
    onDelete || onConnectLifeArea || onGenerateMeditation || entryMenuBefore,
  );
  const menuItemClass =
    "block w-full cursor-pointer px-3 py-2 text-left text-sm text-foreground hover:bg-accent-soft/30";

  const entryDateControl = (
    <span className="inline-flex items-baseline gap-2">
      {onEntryDateChange ? (
        <span className="relative inline-flex items-center">
          <button
            type="button"
            className="cursor-pointer text-[12px] text-muted underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => {
              const el = dateInputRef.current;
              if (!el) return;
              try {
                el.showPicker?.();
              } catch {
                el.click();
              }
            }}
          >
            <time dateTime={entryDate}>{formatJournalEntryDate(entryDate)}</time>
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={isoToDateInput(entryDate)}
            onChange={(ev) => {
              const iso = dateInputToIso(ev.target.value);
              if (iso) onEntryDateChange(iso);
            }}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
            tabIndex={-1}
            aria-label="Entry date"
          />
        </span>
      ) : (
        <time dateTime={entryDate} className="text-[12px] text-muted">
          {formatJournalEntryDate(entryDate)}
        </time>
      )}
      {syncStatusLabel ? (
        <span className="text-[11px] text-muted">{syncStatusLabel}</span>
      ) : null}
    </span>
  );

  const recordingBarInner = (
    <div className="flex h-full w-full items-center gap-2">
      <button
        type="button"
        aria-label="Cancel recording"
        disabled={voiceBusy}
        onClick={() => void cancelVoiceRecording()}
        className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
      >
        <X aria-hidden className="size-5" strokeWidth={2} />
      </button>
      <span className="flex shrink-0 items-center gap-2">
        <span
          className="relative flex size-2.5 items-center justify-center"
          aria-hidden
        >
          <span className="absolute size-4 rounded-full bg-danger/25" />
          <span className="relative size-2.5 rounded-full bg-danger" />
        </span>
        <span className="min-w-[2.5rem] font-mono text-[13px] tabular-nums text-foreground">
          {voicePaused
            ? "Paused"
            : serverFallbackMode && voiceSeconds >= 13 * 60
              ? `${Math.max(0, 15 * 60 - voiceSeconds)}s left`
              : formatAudioClock(voiceSeconds)}
        </span>
      </span>
      <div
        className="flex h-8 min-w-0 flex-1 items-end justify-between gap-px px-1"
        aria-hidden
      >
        {voiceBars.map((h, i) => (
          <span
            key={i}
            className="w-[2px] rounded-full bg-accent/70"
            style={{
              height: `${Math.max(12, Math.round(h * 100))}%`,
              opacity: 0.35 + voiceLevel * 0.65,
            }}
          />
        ))}
      </div>
      <button
        type="button"
        aria-label="Done recording"
        disabled={voiceBusy}
        onClick={() => void finishRecordingIntoEditor()}
        className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#AFC2DC] text-on-accent disabled:opacity-50"
        style={PRIMARY_ACCENT_FILL_STYLE}
      >
        <Check aria-hidden className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );

  const micButton = transcribeApiBase ? (
    <button
      type="button"
      title="Record voice"
      aria-label="Record voice"
      disabled={voiceBusy || voiceRecording}
      onClick={() => {
        if (voiceBusy || voiceRecording) return;
        void startVoiceRecording();
      }}
      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <IconMic />
    </button>
  ) : null;

  const writingBarPortal =
    mobileCardLayout && typeof document !== "undefined" ? (
      <>
        {voiceRecording || serverFallbackMode ? (
          <div className="pointer-events-none fixed inset-x-0 z-[119] px-3 md:hidden">
            <div
              className="pointer-events-auto mx-auto max-w-lg rounded-2xl border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur-sm"
              style={{
                bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
                position: "fixed",
                left: 12,
                right: 12,
              }}
            >
              <JournalVoiceAllowanceBar forceShow={serverFallbackMode} compact />
            </div>
          </div>
        ) : null}
        <JournalMobileWritingBar
          nativeResize
          onKeyboardOpenChange={setKeyboardOpen}
        >
          {voiceRecording ? (
            recordingBarInner
          ) : (
            <>
              {micButton}
              <ToolbarBtn
                label="Bold"
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <span className="font-bold">B</span>
              </ToolbarBtn>
              <ToolbarBtn
                label="Italic"
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <span className="italic">I</span>
              </ToolbarBtn>
              <ToolbarBtn
                label="More formatting"
                active={toolbarMoreOpen}
                onClick={() => setToolbarMoreOpen((v) => !v)}
              >
                <IconDotsHorizontal />
              </ToolbarBtn>
              {!keyboardOpen ? (
                <button
                  type="button"
                  onClick={() => setPromptsOpen((open) => !open)}
                  aria-pressed={promptsOpen}
                  style={PRIMARY_ACCENT_FILL_STYLE}
                  className="ml-auto inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full accent-fill-gradient px-3 text-[13px] font-semibold text-on-accent transition-opacity hover:opacity-90"
                >
                  Prompts
                </button>
              ) : null}
            </>
          )}
        </JournalMobileWritingBar>
      </>
    ) : null;

  const writingBarClearancePx =
    APP_MOBILE_TAB_BAR_H_PX +
    APP_MOBILE_TAB_BAR_GAP_PX +
    readMobileTabPillBottomOffsetPx();

  return (
    <div
      className={`flex min-h-0 flex-1 bg-transparent ${
        mobileCardLayout
          ? "max-sm:overflow-y-auto max-sm:overscroll-contain sm:overflow-hidden"
          : "overflow-hidden"
      }`}
      ref={mobileCardLayout ? entryScrollRef : undefined}
      onMouseDown={(e) => {
        if (!mobileCardLayout) return;
        const t = e.target as HTMLElement;
        // Tap empty page chrome outside the card → dismiss keyboard.
        if (t.closest("[data-journal-entry-card]")) return;
        if (t.closest(".ProseMirror")) return;
        hideSoftwareKeyboard();
      }}
    >
      {/* Fills the writing pane; parent journal shell is max-w-6xl + right pattern gutter.
          Mobile: height follows content (never viewport-tied / never shrinks with keyboard). */}
      <div
        data-journal-entry-card="1"
        className={`relative flex min-h-0 w-full min-w-0 flex-col ${
          mobileCardLayout
            ? "journal-entry-paper journal-entry-paper-from-sm max-sm:h-auto max-sm:flex-none max-sm:overflow-visible max-sm:bg-transparent sm:flex-1 sm:overflow-hidden sm:bg-[color:var(--journal-warm-bg)]"
            : "flex-1 journal-entry-paper overflow-hidden bg-[color:var(--journal-warm-bg)]"
        }`}
        style={
          mobileCardLayout
            ? {
                // Room to scroll the last line above the writing bar.
                paddingBottom: writingBarClearancePx,
                ...(cardMinHeightPx != null
                  ? { minHeight: cardMinHeightPx }
                  : null),
              }
            : undefined
        }
      >
        <div
          className={`flex shrink-0 flex-col ${
            mobileCardLayout
              ? `journal-entry-paper journal-entry-paper-until-sm max-sm:mx-3 max-sm:mt-1 max-sm:rounded-t-[18px] max-sm:border max-sm:border-b-0 max-sm:border-border max-sm:bg-card sm:border-b sm:border-border`
              : "border-b border-border"
          }`}
          onMouseDown={(e) => {
            if (!mobileCardLayout) return;
            const t = e.target as HTMLElement;
            // Tapping header chrome (not inputs) closes the keyboard.
            if (
              t.closest("input, textarea, button, a, [contenteditable='true']")
            ) {
              return;
            }
            hideSoftwareKeyboard();
          }}
        >
          <div
            className={`relative flex items-start gap-2 px-7 pb-3 pt-3 ${
              mobileCardLayout ? "max-sm:flex-col max-sm:gap-2 max-sm:px-4 max-sm:pb-2 max-sm:pt-3.5" : ""
            }`}
          >
            {mobileCardLayout ? (
              <div className="hidden w-full items-center justify-between gap-2 max-sm:flex">
                <div className="relative flex min-w-0 items-baseline gap-2">
                  <button
                    type="button"
                    className="cursor-pointer text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#8A6424]"
                    onClick={() => {
                      const el = dateInputRef.current;
                      if (!el) return;
                      try {
                        el.showPicker?.();
                      } catch {
                        el.click();
                      }
                    }}
                  >
                    <time dateTime={entryDate}>
                      {formatJournalEntryCardDate(entryDate)}
                    </time>
                  </button>
                  {syncStatusLabel ? (
                    <span className="truncate text-[11px] text-muted">
                      {syncStatusLabel}
                    </span>
                  ) : null}
                  {onEntryDateChange ? (
                    <input
                      ref={dateInputRef}
                      type="date"
                      value={isoToDateInput(entryDate)}
                      onChange={(ev) => {
                        const iso = dateInputToIso(ev.target.value);
                        if (iso) onEntryDateChange(iso);
                      }}
                      className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                      tabIndex={-1}
                      aria-label="Entry date"
                    />
                  ) : null}
                </div>
                {showEntryMenu ? (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      aria-label="Entry actions"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={() => setMenuOpen((v) => !v)}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-accent-soft/50 hover:text-foreground"
                    >
                      <IconMore />
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="min-w-0 flex-1 max-sm:w-full">
              {!hideCreatedDate && !mobileCardLayout ? (
                <div className="mb-1">{entryDateControl}</div>
              ) : null}
              {/* Desktop / sm+: keep prior date control when hideCreatedDate is false. */}
              {!hideCreatedDate && mobileCardLayout ? (
                <div className="mb-1 max-sm:hidden">{entryDateControl}</div>
              ) : null}
              {hideCreatedDate && syncStatusLabel ? (
                <p
                  className={`mb-1 text-[11px] text-muted ${
                    mobileCardLayout ? "max-sm:hidden" : ""
                  }`}
                >
                  {syncStatusLabel}
                </p>
              ) : null}
              <label className="block">
                <span className="sr-only">Title</span>
                <input
                  type="text"
                  value={entryTitle}
                  onChange={(ev) => {
                    const v = ev.target.value;
                    setEntryTitle(v);
                    onTitleChange(v);
                  }}
                  placeholder={titlePlaceholder}
                  autoComplete="off"
                  className={`w-full border-0 border-b border-transparent bg-transparent px-0 py-0.5 font-display font-normal tracking-tight text-foreground outline-none ring-0 placeholder:text-muted/35 focus:border-border ${
                    mobileCardLayout
                      ? "text-[26px] max-sm:text-[28px] max-sm:placeholder:text-muted/35"
                      : "text-[26px]"
                  }`}
                />
              </label>
              {headerBefore ? <div className="mt-2">{headerBefore}</div> : null}
              {headerAfter ? <div className="mt-2">{headerAfter}</div> : null}
            </div>
            {showEntryMenu ? (
              <div
                ref={menuRef}
                className={`relative flex shrink-0 items-center gap-2 ${
                  hideCreatedDate ? "self-center" : "self-start pt-1"
                } ${entryMenuClassName ?? ""} ${
                  mobileCardLayout ? "max-sm:hidden" : ""
                }`}
              >
                <button
                  type="button"
                  aria-label="Entry actions"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-accent-soft/50 hover:text-foreground"
                >
                  <IconMore />
                </button>
              </div>
            ) : null}
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-4 top-12 z-30 min-w-[12.5rem] rounded-xl border border-border bg-card py-1 shadow-lg max-sm:right-3 max-sm:top-11 sm:right-7 sm:top-14"
              >
                {entryMenuBefore}
                {onConnectLifeArea ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onConnectLifeArea();
                    }}
                    className={menuItemClass}
                  >
                    {connectLifeAreaLabel}
                  </button>
                ) : null}
                {onGenerateMeditation ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onGenerateMeditation();
                    }}
                    className={menuItemClass}
                  >
                    Create meditation
                  </button>
                ) : null}
                {onDelete ? (
                  <>
                    {onConnectLifeArea ||
                    onGenerateMeditation ||
                    entryMenuBefore ? (
                      <div className="my-1 border-t border-border" />
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete();
                      }}
                      className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft/40"
                    >
                      Delete entry
                    </button>
                  </>
                ) : null}
                <div className="my-1 border-t border-border" />
                <p className="px-3 py-2 text-[11px] leading-snug text-muted">
                  Created {formatJournalEntryDate(createdAt)}
                  {" · "}
                  Last edited {formatJournalEntryDate(updatedAt)}
                </p>
              </div>
            ) : null}
          </div>
          {belowHeader ? (
            <div
              className={`px-7 pb-3 ${
                mobileCardLayout ? "max-sm:px-4 max-sm:pb-2" : ""
              }`}
            >
              {belowHeader}
            </div>
          ) : null}
          {mobileCardLayout ? (
            <div
              className={`mx-4 hidden h-px max-sm:block ${
                bodyFocused ? "bg-[#8A6424]/70]" : "bg-border"
              }`}
              aria-hidden
            />
          ) : null}
        {/* sm+: full toolbar — recording bar replaces tools while capturing */}
        <div className="hidden items-center gap-1 border-t border-border px-3 py-2 sm:flex">
          {voiceRecording ? (
            <div className="h-9 w-full min-w-0">{recordingBarInner}</div>
          ) : (
            <>
            {transcribeApiBase ? (
              <>
                <button
                  type="button"
                  title="Record voice"
                  aria-label="Record voice"
                  disabled={voiceBusy}
                  onClick={() => {
                    if (voiceBusy) return;
                    void startVoiceRecording();
                  }}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <IconMic />
                </button>
                <span className="mx-1 h-6 w-px bg-border" aria-hidden />
              </>
            ) : null}
            <ToolbarBtn
              label="Bold"
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <span className="font-bold">B</span>
            </ToolbarBtn>
            <ToolbarBtn
              label="Italic"
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <span className="italic">I</span>
            </ToolbarBtn>
            <ToolbarBtn
              label="Subscript"
              active={editor.isActive("subscript")}
              onClick={() => editor.chain().focus().toggleSubscript().run()}
            >
              <span className="text-[13px] font-semibold leading-none">
                X<sub className="text-[9px]">2</sub>
              </span>
            </ToolbarBtn>
            <ToolbarBtn
              label="Superscript"
              active={editor.isActive("superscript")}
              onClick={() => editor.chain().focus().toggleSuperscript().run()}
            >
              <span className="text-[13px] font-semibold leading-none">
                X<sup className="text-[9px]">2</sup>
              </span>
            </ToolbarBtn>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
            <label className="sr-only" htmlFor="journal-text-style">
              Text style
            </label>
            <select
              id="journal-text-style"
              aria-label="Text style"
              value={
                editor.isActive("heading", { level: 2 })
                  ? "header"
                  : editor.isActive("heading", { level: 3 })
                    ? "subheader"
                    : "body"
              }
              onChange={(e) => {
                const v = e.target.value;
                const chain = editor.chain().focus();
                if (v === "header") {
                  chain.setHeading({ level: 2 }).run();
                  return;
                }
                if (v === "subheader") {
                  chain.setHeading({ level: 3 }).run();
                  return;
                }
                chain.setParagraph().run();
              }}
              className="cursor-pointer rounded-lg border border-border bg-transparent py-1.5 pl-2 pr-6 text-base font-semibold text-muted outline-none hover:bg-accent-soft/50 hover:text-foreground"
            >
              <option value="body">Body</option>
              <option value="header">Header</option>
              <option value="subheader">Subheader</option>
            </select>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
            <ToolbarBtn
              label="Bullet list"
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List aria-hidden className="size-4" strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn
              label="Numbered list"
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered aria-hidden className="size-4" strokeWidth={2} />
            </ToolbarBtn>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
            <ToolbarBtn
              label="Photo"
              onClick={() => photoInputRef.current?.click()}
            >
              <ImageIcon aria-hidden className="size-4" strokeWidth={2} />
            </ToolbarBtn>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
            <ToolbarBtn
              label="Undo"
              onClick={() => editor.chain().focus().undo().run()}
            >
              <Undo2 aria-hidden className="size-4" strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn
              label="Redo"
              onClick={() => editor.chain().focus().redo().run()}
            >
              <Redo2 aria-hidden className="size-4" strokeWidth={2} />
            </ToolbarBtn>
            <button
              type="button"
              onClick={() => setPromptsOpen((open) => !open)}
              aria-pressed={promptsOpen}
              style={PRIMARY_ACCENT_FILL_STYLE}
              className="ml-auto inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full accent-fill-gradient px-3 text-[13px] font-semibold text-on-accent transition-opacity hover:opacity-90"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 3.5M12 17h.01" />
              </svg>
              Prompts
            </button>
            </>
          )}
        </div>
        {/* Mobile in-page toolbar — superseded by JournalMobileWritingBar when
            mobileCardLayout is on (consciously-journal-entry-mobile).
        <div className="border-t border-border sm:hidden">…</div>
        */}
        {!mobileCardLayout ? (
          <div className="border-t border-border sm:hidden">
            <div className="flex flex-nowrap items-center gap-1 overflow-x-auto px-3 py-2">
              {voiceRecording ? (
                <div className="h-9 w-full min-w-0">{recordingBarInner}</div>
              ) : (
                <>
              {micButton}
              {micButton ? (
                <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
              ) : null}
              <ToolbarBtn
                label="Bold"
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <span className="font-bold">B</span>
              </ToolbarBtn>
              <ToolbarBtn
                label="Italic"
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <span className="italic">I</span>
              </ToolbarBtn>
              <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
              <ToolbarBtn
                label="More formatting"
                active={toolbarMoreOpen}
                onClick={() => setToolbarMoreOpen((v) => !v)}
              >
                <IconDotsHorizontal />
              </ToolbarBtn>
              <button
                type="button"
                onClick={() => setPromptsOpen((open) => !open)}
                aria-pressed={promptsOpen}
                style={PRIMARY_ACCENT_FILL_STYLE}
                className="ml-auto inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full accent-fill-gradient px-3 text-[13px] font-semibold text-on-accent transition-opacity hover:opacity-90"
              >
                Prompts
              </button>
                </>
              )}
            </div>
            {toolbarMoreOpen ? (
              <div className="flex flex-nowrap items-center gap-1 overflow-x-auto border-t border-border px-3 py-2">
                <ToolbarBtn
                  label="Subscript"
                  active={editor.isActive("subscript")}
                  onClick={() => editor.chain().focus().toggleSubscript().run()}
                >
                  <span className="text-[13px] font-semibold leading-none">
                    X<sub className="text-[9px]">2</sub>
                  </span>
                </ToolbarBtn>
                <ToolbarBtn
                  label="Superscript"
                  active={editor.isActive("superscript")}
                  onClick={() =>
                    editor.chain().focus().toggleSuperscript().run()
                  }
                >
                  <span className="text-[13px] font-semibold leading-none">
                    X<sup className="text-[9px]">2</sup>
                  </span>
                </ToolbarBtn>
                <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
                <ToolbarBtn
                  label="Heading 2"
                  active={editor.isActive("heading", { level: 2 })}
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 2 }).run()
                  }
                >
                  <span className="font-semibold">H2</span>
                </ToolbarBtn>
                <ToolbarBtn
                  label="Heading 3"
                  active={editor.isActive("heading", { level: 3 })}
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 3 }).run()
                  }
                >
                  <span className="font-semibold">H3</span>
                </ToolbarBtn>
                <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
                <ToolbarBtn
                  label="Bullet list"
                  active={editor.isActive("bulletList")}
                  onClick={() =>
                    editor.chain().focus().toggleBulletList().run()
                  }
                >
                  <List aria-hidden className="size-4" strokeWidth={2} />
                </ToolbarBtn>
                <ToolbarBtn
                  label="Numbered list"
                  active={editor.isActive("orderedList")}
                  onClick={() =>
                    editor.chain().focus().toggleOrderedList().run()
                  }
                >
                  <ListOrdered aria-hidden className="size-4" strokeWidth={2} />
                </ToolbarBtn>
                <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
                <ToolbarBtn
                  label="Photo"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <ImageIcon aria-hidden className="size-4" strokeWidth={2} />
                </ToolbarBtn>
                <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
                <ToolbarBtn
                  label="Undo"
                  onClick={() => editor.chain().focus().undo().run()}
                >
                  <Undo2 aria-hidden className="size-4" strokeWidth={2} />
                </ToolbarBtn>
                <ToolbarBtn
                  label="Redo"
                  onClick={() => editor.chain().focus().redo().run()}
                >
                  <Redo2 aria-hidden className="size-4" strokeWidth={2} />
                </ToolbarBtn>
              </div>
            ) : null}
          </div>
        ) : null}
        {mobileCardLayout && toolbarMoreOpen ? (
          <div className="mx-3 flex flex-nowrap items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card px-3 py-2 sm:hidden">
            <ToolbarBtn
              label="Subscript"
              active={editor.isActive("subscript")}
              onClick={() => editor.chain().focus().toggleSubscript().run()}
            >
              <span className="text-[13px] font-semibold leading-none">
                X<sub className="text-[9px]">2</sub>
              </span>
            </ToolbarBtn>
            <ToolbarBtn
              label="Superscript"
              active={editor.isActive("superscript")}
              onClick={() => editor.chain().focus().toggleSuperscript().run()}
            >
              <span className="text-[13px] font-semibold leading-none">
                X<sup className="text-[9px]">2</sup>
              </span>
            </ToolbarBtn>
            <ToolbarBtn
              label="Bullet list"
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List aria-hidden className="size-4" strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn
              label="Numbered list"
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered aria-hidden className="size-4" strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn
              label="Photo"
              onClick={() => photoInputRef.current?.click()}
            >
              <ImageIcon aria-hidden className="size-4" strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn
              label="Undo"
              onClick={() => editor.chain().focus().undo().run()}
            >
              <Undo2 aria-hidden className="size-4" strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn
              label="Redo"
              onClick={() => editor.chain().focus().redo().run()}
            >
              <Redo2 aria-hidden className="size-4" strokeWidth={2} />
            </ToolbarBtn>
            {keyboardOpen ? (
              <>
                <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
                <button
                  type="button"
                  onClick={() => {
                    setToolbarMoreOpen(false);
                    setPromptsOpen(true);
                  }}
                  style={PRIMARY_ACCENT_FILL_STYLE}
                  className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-full accent-fill-gradient px-3 text-[13px] font-semibold text-on-accent"
                >
                  Prompts
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {/* Recording hint superseded by recording bar (voice-notes-v2)
        {voiceRecording ? (
          <div className="border-t border-border px-4 py-2 text-xs">
            <span className="font-medium text-accent-link">
              Recording… tap the mic again to place the clip.
            </span>
          </div>
        ) : null}
        */}
        {voiceError ? (
          <div className="border-t border-border px-4 py-2 text-xs">
            <span className="text-danger">{voiceError}</span>
          </div>
        ) : null}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(ev) => {
            const file = ev.target.files?.[0];
            ev.target.value = "";
            if (!file) return;
            void compressImageFileToJpegDataUrl(file)
              .then((src) => {
                editor.chain().focus().setJournalImage({ src, alt: "" }).run();
              })
              .catch((e) => {
                setVoiceError(
                  e instanceof Error ? e.message : "Could not add that photo",
                );
              });
          }}
        />
      </div>
      <div
        className={`min-h-0 ${
          mobileCardLayout
            ? "journal-entry-paper journal-entry-paper-until-sm max-sm:mx-3 max-sm:mb-3 max-sm:min-h-[12rem] max-sm:flex-1 max-sm:overflow-visible max-sm:rounded-b-[18px] max-sm:border max-sm:border-t-0 max-sm:border-border max-sm:bg-card sm:flex-1 sm:overflow-y-auto sm:overscroll-contain"
            : "flex-1 overflow-y-auto overscroll-contain"
        }`}
        onMouseDown={(e) => {
          if (!mobileCardLayout || !editor) return;
          const target = e.target as HTMLElement;
          // Tap empty card chrome (not already in the prose) → focus end.
          if (target.closest(".ProseMirror")) return;
          e.preventDefault();
          editor.commands.focus("end");
        }}
        onTouchStart={(e) => {
          if (!mobileCardLayout) return;
          const t = e.touches[0];
          if (!t) return;
          const el = entryScrollRef.current ?? e.currentTarget;
          el.dataset.kbDismissY = String(t.clientY);
          el.dataset.kbDismissScroll = String(el.scrollTop);
          el.dataset.kbDismissed = "0";
        }}
        onTouchMove={(e) => {
          if (!mobileCardLayout) return;
          const el = entryScrollRef.current ?? e.currentTarget;
          if (el.dataset.kbDismissed === "1") return;
          const startY = Number(el.dataset.kbDismissY ?? "");
          const startScroll = Number(el.dataset.kbDismissScroll ?? "");
          const t = e.touches[0];
          if (!t || !Number.isFinite(startY)) return;
          const dy = t.clientY - startY;
          // Pack: finger scroll while typing must not dismiss. Only a clear
          // pull-down past the top closes the keyboard.
          if (dy > 72 && startScroll <= 2) {
            const active = document.activeElement;
            const editing =
              active instanceof HTMLElement &&
              (active.isContentEditable ||
                active.tagName === "TEXTAREA" ||
                active.tagName === "INPUT");
            if (!editing) return;
            el.dataset.kbDismissed = "1";
            hideSoftwareKeyboard();
          }
        }}
      >
        <JournalTranscribeApiContext.Provider value={transcribeApiBase}>
          <EditorContent
            editor={editor}
            className={
              mobileCardLayout
                ? "max-sm:min-h-[10rem] max-sm:[&_.ProseMirror]:min-h-[10rem] max-sm:[&_.ProseMirror]:px-4 max-sm:[&_.ProseMirror]:py-4 max-sm:[&_.ProseMirror]:text-[16px] max-sm:[&_.ProseMirror]:leading-[1.7] max-sm:[&_p.is-editor-empty:first-child::before]:text-muted/55"
                : undefined
            }
          />
          {/* Live speech preview — React overlay only (not TipTap content / not saved). */}
          {livePreviewText ? (
            <p
              className={`pointer-events-none select-none px-7 pb-3 text-base leading-[1.85] ${
                mobileCardLayout ? "max-sm:px-4 max-sm:text-[16px] max-sm:leading-[1.7]" : ""
              }`}
              aria-live="polite"
            >
              <em className="journal-voice-live">{livePreviewText}</em>
            </p>
          ) : null}
        </JournalTranscribeApiContext.Provider>
        {/* Empty-entry suggestions stay in the tree but are not shown.
            New entry opens blank; prompts come from the Prompts control.
        {bodyEmpty && emptyBodyPrompts && emptyBodyPrompts.length > 0 ? (
          <div className="flex flex-wrap gap-2 px-7 pb-3 pt-1">
            {emptyBodyPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  const ed = editorRef.current ?? editor;
                  if (!ed) return;
                  ed
                    .chain()
                    .focus()
                    .insertContent(`<p>${prompt}</p><p></p>`)
                    .run();
                }}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] text-foreground transition-colors hover:border-accent/40"
              >
                <span className="text-accent-link" aria-hidden>
                  ✦
                </span>
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
        */}
        {children ? (
          <div
            className={`px-7 pb-4 ${
              mobileCardLayout ? "max-sm:hidden" : ""
            }`}
          >
            {children}
          </div>
        ) : null}
        {/* Floating "Add a tag" field removed on mobile — tags via pill row.
            {children} */}
      </div>
      {bottomBar ? (
        <div className="shrink-0 border-t-[0.5px] border-border px-6 py-3">
          {bottomBar}
        </div>
      ) : null}
      {promptsOpen ? (
        <div className="absolute inset-y-3 right-3 z-30 w-[min(380px,calc(100%-1.5rem))]">
          <JournalPromptsPanel
            sources={
              promptSources ?? {
                areas: [],
                values: [],
                healItems: [],
                linkedRefIds: [],
                meditations: [],
              }
            }
            usedIds={new Set(usedPromptIds)}
            onClose={() => setPromptsOpen(false)}
            onPick={(prompt) => {
              const ed = editorRef.current ?? editor;
              if (!ed) return;
              if (usedPromptIds.includes(prompt.id)) {
                ed.commands.focusJournalPrompt(prompt.id);
                return;
              }
              ed.commands.insertJournalPrompt({
                promptId: prompt.id,
                template: prompt.template,
                name: prompt.name,
              });
            }}
          />
        </div>
      ) : null}
      {writingBarPortal}
      </div>
    </div>
  );
}

function IconMore({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

function IconDotsHorizontal({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

function IconMic({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function ToolbarBtn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? false}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-50"
          : active
            ? "cursor-pointer bg-selected text-on-selected"
            : "cursor-pointer text-muted hover:bg-accent-soft/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
