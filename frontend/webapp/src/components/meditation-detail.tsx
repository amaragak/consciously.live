import * as Switch from "@radix-ui/react-switch";
import { MoreHorizontal, Pause, Play, SquarePen } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { LibraryHowMadeModal } from "@/components/library-how-made-modal";
import {
  formatDuration,
  formatWhen,
  IconHeart,
  IconMixer,
} from "@/components/library-meditation-card";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import {
  journalEntriesLinkedToMeditation,
  meditationIdFromLibraryItem,
} from "@/lib/journal-meditation-reflect";
import { subscribeJournalStore, type JournalEntry } from "@/lib/journal-storage";
import {
  formatChunkClock,
  formatRelativeDay,
  meditationMadeFrom,
  plainFromHtml,
  scriptChunksFromLibraryItem,
  scriptChunksHaveTimings,
  scriptChunksPlainText,
  scriptWordCount,
  type ScriptChunk,
} from "@/lib/library-meditation-detail";

const FOLLOW_ALONG_PREF_KEY = "consciously.library.followAlong";

function readFollowAlongPref(): boolean {
  try {
    const v = window.localStorage.getItem(FOLLOW_ALONG_PREF_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* */
  }
  return true;
}

function writeFollowAlongPref(on: boolean) {
  try {
    window.localStorage.setItem(FOLLOW_ALONG_PREF_KEY, on ? "1" : "0");
  } catch {
    /* */
  }
}
import {
  libraryMeditationCategoryLabel,
  type LibraryMeditationItem,
} from "@/lib/medimade-api";
import { parseMeditationCreationProvenance } from "@/lib/meditation-creation-provenance";

export type MeditationDetailSource = "own" | "community" | "program";

export type MeditationDetailProps = {
  item: LibraryMeditationItem;
  source: MeditationDetailSource;
  isMobile: boolean;
  soundscapeName: string | null;
  /** Play / pause through the global player. */
  onPlay: () => void;
  onReflect: () => void;
  onRating?: (rating: number | null) => void;
  ratingBusy?: boolean;
  onFavourite?: (favourite: boolean) => void;
  favouriteBusy?: boolean;
  onShare?: () => void;
  shareCopied?: boolean;
  onPublicChange?: (isPublic: boolean) => void;
  onArchive?: () => void;
  onOpenMix?: (anchorEl: HTMLElement) => void;
  mixOpen?: boolean;
  onCloseMix?: () => void;
};

const SECTION_LABEL =
  "text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link";
const CARD =
  "rounded-2xl border border-border bg-card shadow-[0_2px_10px_rgb(15_27_45_/_0.04)]";
const OUTLINE_BTN =
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50";

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function voiceInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function VoiceAvatar({
  name,
  src,
  px,
}: {
  name: string;
  src?: string | null;
  px: number;
}) {
  const url = src?.trim() || "";
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-[8px] font-semibold text-accent-link"
      style={{ width: px, height: px }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        voiceInitials(name)
      )}
    </span>
  );
}

function Stars({
  rating,
  px,
  editable,
  busy,
  onRating,
}: {
  rating: number | null;
  px: number;
  editable: boolean;
  busy?: boolean;
  onRating?: (r: number | null) => void;
}) {
  return (
    <span className="inline-flex items-center">
      {[1, 2, 3, 4, 5].map((star) => {
        const on = rating != null && star <= rating;
        const cls = on ? "text-star-filled" : "text-star-idle";
        const style = { fontSize: px, lineHeight: 1 } as const;
        if (!editable) {
          return (
            <span key={star} className={`${cls} px-px`} style={style} aria-hidden>
              ★
            </span>
          );
        }
        return (
          <button
            key={star}
            type="button"
            disabled={busy}
            aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
            onClick={() => onRating?.(rating === star ? null : star)}
            className={`${cls} cursor-pointer rounded px-px disabled:cursor-not-allowed disabled:opacity-60`}
            style={style}
          >
            ★
          </button>
        );
      })}
    </span>
  );
}

function IconCircleButton({
  label,
  children,
  onClick,
  disabled,
  active,
  buttonRef,
  expanded,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
  expanded?: boolean;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground/80 transition-colors hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function PlayButton({
  isPlaying,
  durationLabel,
  onClick,
  compact,
}: {
  isPlaying: boolean;
  durationLabel: string | null;
  onClick: () => void;
  compact?: boolean;
}) {
  const Icon = isPlaying ? Pause : Play;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isPlaying ? "Pause" : "Play"}
      className={`inline-flex h-12 cursor-pointer items-center gap-2.5 rounded-full border border-black/10 pl-2 pr-[22px] text-[15px] font-semibold text-on-accent transition-opacity hover:opacity-90 ${
        compact ? "min-w-0 flex-1" : ""
      }`}
      style={PRIMARY_ACCENT_FILL_STYLE}
    >
      <span
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-black/10"
        style={PRIMARY_ACCENT_FILL_STYLE}
      >
        <Icon
          className="size-3 translate-x-px"
          fill="currentColor"
          strokeWidth={0}
          aria-hidden
        />
      </span>
      {compact
        ? isPlaying
          ? "Pause"
          : "Play"
        : `${isPlaying ? "Pause" : "Play"}${durationLabel ? ` · ${durationLabel}` : ""}`}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* ⋯ menu                                                              */
/* ------------------------------------------------------------------ */

function DetailMenu({
  item,
  source,
  onShare,
  shareCopied,
  onPublicChange,
  onArchive,
  onOpenMix,
  mixOpen,
  onCloseMix,
  onHowMade,
}: Pick<
  MeditationDetailProps,
  | "item"
  | "source"
  | "onShare"
  | "shareCopied"
  | "onPublicChange"
  | "onArchive"
  | "onOpenMix"
  | "mixOpen"
  | "onCloseMix"
> & { onHowMade: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const own = source === "own";
  const canShare = Boolean(onShare);
  const canMix = item.liveMix === true && Boolean(item.sk) && Boolean(onOpenMix);
  const canHowMade = own;
  const canPublic = own && Boolean(item.sk) && Boolean(onPublicChange);
  const canArchive = own && Boolean(item.sk) && Boolean(onArchive);
  if (!canShare && !canMix && !canHowMade && !canPublic && !canArchive) {
    return null;
  }

  const itemCls =
    "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-background";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <IconCircleButton
        label="More actions"
        buttonRef={btnRef}
        expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="size-[18px]" strokeWidth={2} aria-hidden />
      </IconCircleButton>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-[90] mt-1 min-w-[12.5rem] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-xl isolate"
        >
          {canMix ? (
            <button
              type="button"
              role="menuitem"
              className={itemCls}
              onClick={() => {
                setOpen(false);
                if (mixOpen) onCloseMix?.();
                else if (btnRef.current) onOpenMix?.(btnRef.current);
              }}
            >
              <IconMixer className="h-4 w-4" />
              {mixOpen ? "Close mix" : "Edit mix"}
            </button>
          ) : null}
          {canHowMade ? (
            <button
              type="button"
              role="menuitem"
              className={itemCls}
              onClick={() => {
                setOpen(false);
                onHowMade();
              }}
            >
              How this was made
            </button>
          ) : null}
          {canShare ? (
            <button
              type="button"
              role="menuitem"
              className={itemCls}
              onClick={() => {
                onShare?.();
                setOpen(false);
              }}
            >
              {shareCopied ? "Copied!" : "Share"}
            </button>
          ) : null}
          {canPublic ? (
            <div
              role="menuitem"
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span
                className={`text-sm ${
                  item.isPublic === true ? "text-accent-link" : "text-foreground"
                }`}
              >
                Public
              </span>
              <Switch.Root
                checked={item.isPublic === true}
                onCheckedChange={(v) => onPublicChange?.(Boolean(v))}
                aria-label={
                  item.isPublic ? "Remove from community library" : "Make public"
                }
                className="relative h-5 w-9 shrink-0 cursor-pointer rounded-full border border-border bg-muted/40 transition-colors data-[state=checked]:border-accent-button data-[state=checked]:bg-accent-button"
              >
                <Switch.Thumb className="block h-4 w-4 translate-x-[2px] rounded-full bg-surface shadow-sm transition-transform will-change-transform data-[state=checked]:translate-x-[16px]" />
              </Switch.Root>
            </div>
          ) : null}
          {canArchive ? (
            <button
              type="button"
              role="menuitem"
              className={`${itemCls} text-muted`}
              onClick={() => {
                setOpen(false);
                onArchive?.();
              }}
            >
              Archive
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Script                                                              */
/* ------------------------------------------------------------------ */

/** Sticky bar under the app header (title row + tabs + bottom border). */
const MOBILE_STICKY_BAR_PX = 64;

function ScriptCard({
  chunks,
  wordCount,
  mobile,
  activeIndex,
  scrollMarginTopPx = 0,
  onSeekChunk,
}: {
  chunks: ScriptChunk[];
  wordCount: number;
  mobile: boolean;
  /** Only ever set when chunks carry timings. */
  activeIndex: number | null;
  /** Extra offset while the mobile sticky bar overlays the scroller. */
  scrollMarginTopPx?: number;
  /** Click-to-seek when timings exist. */
  onSeekChunk?: (startMs: number) => void;
}) {
  const timed = scriptChunksHaveTimings(chunks);
  const [followAlong, setFollowAlong] = useState(readFollowAlongPref);
  const [copied, setCopied] = useState(false);
  const activeRef = useRef<HTMLDivElement | null>(null);
  const followPausedUntilRef = useRef(0);

  useEffect(() => {
    if (!timed || !followAlong || activeIndex == null) return;
    if (Date.now() < followPausedUntilRef.current) return;
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [timed, followAlong, activeIndex]);

  useEffect(() => {
    if (!timed) return;
    const scroller = document.querySelector("main");
    if (!(scroller instanceof HTMLElement)) return;
    const onScroll = () => {
      followPausedUntilRef.current = Date.now() + 5000;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [timed]);

  function setFollowAlongPref(on: boolean) {
    setFollowAlong(on);
    writeFollowAlongPref(on);
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(scriptChunksPlainText(chunks));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const followToggle =
    timed ? (
      <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-foreground/80">
        <Switch.Root
          checked={followAlong}
          onCheckedChange={setFollowAlongPref}
          aria-label="Follow along"
          className="relative h-[18px] w-8 shrink-0 cursor-pointer rounded-full border border-border bg-muted/40 transition-colors data-[state=checked]:border-accent-button data-[state=checked]:bg-accent-button"
        >
          <Switch.Thumb className="block h-3.5 w-3.5 translate-x-[1px] rounded-full bg-surface shadow-sm transition-transform will-change-transform data-[state=checked]:translate-x-[15px]" />
        </Switch.Root>
        Follow along
      </label>
    ) : null;

  if (chunks.length === 0) {
    return (
      <div className={`${CARD} min-w-0 flex-1 px-5 py-4`}>
        <h2 className="font-display text-[22px] font-normal text-foreground">
          Script
        </h2>
        <p className="mt-2 text-sm text-muted">
          The script for this meditation isn&apos;t available.
        </p>
      </div>
    );
  }

  const textCls = mobile ? "text-base" : "text-[17px]";
  let lastSection: string | undefined;

  return (
    <div className={`${CARD} min-w-0 flex-1`}>
      {!mobile ? (
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <h2 className="font-display text-[22px] font-normal text-foreground">
            Script
          </h2>
          <span className="text-[13px] text-muted">
            {wordCount.toLocaleString()} words
          </span>
          <div className="ml-auto flex items-center gap-3.5">
            {followToggle}
            <button
              type="button"
              onClick={() => void copyScript()}
              className="cursor-pointer text-[13px] font-semibold text-accent-link hover:opacity-80"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 pt-3 text-[13px]">
          <span className="text-muted">{wordCount.toLocaleString()} words</span>
          <div className="flex items-center gap-3">
            {followToggle}
            <button
              type="button"
              onClick={() => void copyScript()}
              className="cursor-pointer font-semibold text-accent-link"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
      <div className={mobile ? "px-1 pb-3 pt-1.5" : "px-2.5 pb-4 pt-2"}>
        {chunks.map((c) => {
          const showSection = c.section && c.section !== lastSection;
          lastSection = c.section ?? lastSection;
          const active = timed && activeIndex === c.index;
          const seekable =
            timed && typeof c.startMs === "number" && Boolean(onSeekChunk);
          return (
            <div key={c.index}>
              {showSection ? (
                <div className="px-3.5 pb-1 pt-3.5 text-[10px] font-semibold uppercase tracking-[1.4px] text-muted">
                  {c.section}
                </div>
              ) : null}
              <div
                ref={active ? activeRef : undefined}
                role={seekable ? "button" : undefined}
                tabIndex={seekable ? 0 : undefined}
                onClick={
                  seekable
                    ? () => onSeekChunk?.(c.startMs as number)
                    : undefined
                }
                onKeyDown={
                  seekable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSeekChunk?.(c.startMs as number);
                        }
                      }
                    : undefined
                }
                style={
                  scrollMarginTopPx > 0
                    ? { scrollMarginTop: scrollMarginTopPx }
                    : undefined
                }
                className={`flex gap-4 rounded-[10px] px-3.5 py-2.5 ${
                  seekable ? "cursor-pointer" : ""
                } ${
                  active
                    ? "bg-accent-soft shadow-[inset_3px_0_0_var(--accent)]"
                    : ""
                }`}
              >
                {timed ? (
                  <span
                    className={`w-10 shrink-0 pt-[3px] text-xs tabular-nums ${
                      active ? "text-accent-link" : "text-muted"
                    }`}
                  >
                    {formatChunkClock(c.startMs ?? 0)}
                  </span>
                ) : null}
                <span
                  className={`font-display ${textCls} leading-[1.65] ${
                    active ? "text-foreground" : "text-foreground/80"
                  }`}
                >
                  {c.text}
                </span>
              </div>
              {typeof c.pauseAfterMs === "number" && c.pauseAfterMs > 0 ? (
                <div className="my-0.5 ml-16 flex items-center gap-2.5 text-[11px] text-muted">
                  <span className="h-px max-w-[120px] flex-1 bg-border" />
                  pause · {Math.round(c.pauseAfterMs / 1000)}s
                  <span className="h-px max-w-[120px] flex-1 bg-border" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rail cards                                                          */
/* ------------------------------------------------------------------ */

function RailCard({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={CARD}>
      <div className="flex flex-col gap-2 px-[18px] py-4">
        <span className={SECTION_LABEL}>{label}</span>
        {children}
      </div>
    </div>
  );
}

function MadeFromCard({ item }: { item: LibraryMeditationItem }) {
  const made = useMemo(() => meditationMadeFrom(item), [item]);
  if (!made) return null;
  return (
    <RailCard label="Made from">
      {made.brief ? (
        <span className="font-display text-[15px] italic leading-[1.5] text-foreground">
          “{made.brief}”
        </span>
      ) : null}
      {made.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {made.tags.map((t) => (
            <span
              key={t}
              className="whitespace-nowrap rounded-full bg-accent-soft px-[9px] py-0.5 text-[11px] text-accent-link"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </RailCard>
  );
}

function SoundVoiceCard({
  item,
  soundscapeName,
}: {
  item: LibraryMeditationItem;
  soundscapeName: string | null;
}) {
  const voice = item.speakerName?.trim() || "";
  const fx = item.createdVoiceFxDial ?? item.voiceFxDial;
  const rows: { label: string; value: ReactNode }[] = [];
  if (voice) {
    rows.push({
      label: "Voice",
      value: (
        <span className="inline-flex items-center gap-1.5">
          <VoiceAvatar name={voice} src={item.speakerPortraitUrl} px={18} />
          {voice}
        </span>
      ),
    });
  }
  if (soundscapeName) rows.push({ label: "Soundscape", value: soundscapeName });
  if (typeof fx === "number" && Number.isFinite(fx)) {
    rows.push({ label: "Voice FX", value: `${Math.round(fx)}` });
  }
  const length = formatDuration(item.durationSeconds);
  if (length !== "—") rows.push({ label: "Length", value: length });
  if (rows.length === 0) return null;
  return (
    <RailCard label="Sound & voice">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex justify-between gap-2.5 border-t border-border py-[7px] text-[13px]"
        >
          <span className="text-muted">{r.label}</span>
          <span className="text-right text-foreground">{r.value}</span>
        </div>
      ))}
    </RailCard>
  );
}

function useLinkedEntries(meditationId: string): JournalEntry[] {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeJournalStore(() => setTick((n) => n + 1)), []);
  return useMemo(() => {
    void tick;
    return journalEntriesLinkedToMeditation(meditationId).sort(
      (a, b) =>
        (Date.parse(b.updatedAt || b.createdAt) || 0) -
        (Date.parse(a.updatedAt || a.createdAt) || 0),
    );
  }, [meditationId, tick]);
}

function ReflectionsList({
  entries,
  onReflect,
  asCard,
}: {
  entries: JournalEntry[];
  onReflect: () => void;
  asCard?: boolean;
}) {
  const body = (
    <>
      {entries.map((e) => {
        const excerpt = plainFromHtml(e.contentHtml ?? "", 60);
        const when = formatRelativeDay(e.updatedAt || e.createdAt);
        return (
          <Link
            key={e.id}
            to={`/journal/my/${encodeURIComponent(e.id)}`}
            className="flex flex-col gap-[3px] border-t border-border py-2 hover:opacity-80"
          >
            <span className="text-sm font-semibold text-foreground">
              {e.title?.trim() || "Untitled entry"}
            </span>
            <span className="text-xs text-muted">
              {when}
              {excerpt ? ` · “${excerpt}”` : ""}
            </span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onReflect}
        className="cursor-pointer self-start text-[13px] font-semibold text-accent-link hover:opacity-80"
      >
        + New reflection
      </button>
    </>
  );
  if (asCard) {
    return (
      <div className={CARD}>
        <div className="flex flex-col gap-2 px-[18px] py-4">{body}</div>
      </div>
    );
  }
  return (
    <RailCard label={`Reflections · ${entries.length}`}>{body}</RailCard>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

type MobileTab = "script" | "details" | "reflections";

export default function MeditationDetail(props: MeditationDetailProps) {
  const {
    item,
    source,
    isMobile,
    soundscapeName,
    onPlay,
    onReflect,
    onRating,
    ratingBusy,
    onFavourite,
    favouriteBusy,
  } = props;
  const {
    nowPlaying,
    playingS3Key,
    playbackTimeSeconds,
    playerStripHeightPx,
    playItem,
    seekTo,
  } = useLibraryPlayer();
  const [howMadeOpen, setHowMadeOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("script");
  const [stickyBarVisible, setStickyBarVisible] = useState(false);
  const tabsSentinelRef = useRef<HTMLDivElement | null>(null);
  const tabPanelRef = useRef<HTMLDivElement | null>(null);

  const own = source === "own";
  const isCurrent = nowPlaying?.s3Key === item.s3Key;
  const isPlaying = playingS3Key === item.s3Key;
  const typeLabel = libraryMeditationCategoryLabel(item);
  const eyebrowType = typeLabel && typeLabel !== "—" ? typeLabel : "";
  const durationLabel = formatDuration(item.durationSeconds);
  const hasDuration = durationLabel !== "—";
  const voice = item.speakerName?.trim() || "";
  const meditationId = meditationIdFromLibraryItem(item);
  const entries = useLinkedEntries(meditationId);

  const chunks = useMemo(
    () => scriptChunksFromLibraryItem(item),
    [item.scriptText, item.scriptChunks],
  );
  const wordCount = useMemo(() => scriptWordCount(chunks), [chunks]);
  const timed = scriptChunksHaveTimings(chunks);
  const activeIndex = useMemo(() => {
    if (!timed || !isCurrent) return null;
    const ms = playbackTimeSeconds * 1000;
    let hit: ScriptChunk | null = null;
    for (const c of chunks) {
      if (typeof c.startMs !== "number") break;
      if (c.startMs > ms) break;
      hit = c;
    }
    return hit ? hit.index : null;
  }, [timed, isCurrent, chunks, playbackTimeSeconds]);

  function handleSeekChunk(startMs: number) {
    if (!isCurrent) playItem(item);
    else if (!isPlaying) playItem(item);
    seekTo(Math.max(0, startMs) / 1000);
  }

  const provenance = useMemo(
    () =>
      parseMeditationCreationProvenance(item.creationProvenance) ??
      item.creationProvenance ??
      null,
    [item.creationProvenance],
  );

  const canFavourite = own && Boolean(item.sk) && Boolean(onFavourite);
  const canRate = own && Boolean(item.sk) && Boolean(onRating);
  const showStars = own;

  const heart = canFavourite ? (
    <IconCircleButton
      label={item.favourite ? "Remove from favourites" : "Add to favourites"}
      active={item.favourite}
      disabled={favouriteBusy}
      onClick={() => onFavourite?.(!item.favourite)}
    >
      <IconHeart
        filled={item.favourite}
        strokeWidth={1.8}
        className={`h-[18px] w-[18px] ${item.favourite ? "text-gold" : ""}`}
      />
    </IconCircleButton>
  ) : null;

  const menu = (
    <DetailMenu
      item={item}
      source={source}
      onShare={props.onShare}
      shareCopied={props.shareCopied}
      onPublicChange={props.onPublicChange}
      onArchive={props.onArchive}
      onOpenMix={props.onOpenMix}
      mixOpen={props.mixOpen}
      onCloseMix={props.onCloseMix}
      onHowMade={() => setHowMadeOpen(true)}
    />
  );

  const cover = item.coverImageUrl?.trim() ? (
    <img
      src={item.coverImageUrl}
      alt=""
      className="h-full w-full object-cover"
    />
  ) : (
    <span className="block h-full w-full bg-muted/35" />
  );

  const stripPad = { paddingBottom: Math.max(playerStripHeightPx, 0) + 24 };

  const howMadeModal = (
    <LibraryHowMadeModal
      open={howMadeOpen}
      title={item.title}
      provenance={provenance}
      meditationStyleFallback={item.meditationStyle}
      onClose={() => setHowMadeOpen(false)}
    />
  );

  /* ---------------- Mobile ---------------- */
  useEffect(() => {
    if (!isMobile) {
      setStickyBarVisible(false);
      return;
    }
    const tabs = tabsSentinelRef.current;
    const scroller = document.querySelector("main");
    if (!tabs || !(scroller instanceof HTMLElement)) return;

    // Tabs fully leave the main viewport → sticky bar. Header sits above main,
    // so root = main (no extra top margin). Instant show/hide, no fade.
    const io = new IntersectionObserver(
      ([entry]) => {
        setStickyBarVisible(!(entry?.isIntersecting ?? true));
      },
      { root: scroller, threshold: 0, rootMargin: "0px" },
    );
    io.observe(tabs);
    return () => io.disconnect();
  }, [isMobile]);

  if (isMobile) {
    const meta: ReactNode[] = [];
    if (voice) {
      meta.push(
        <span key="voice" className="inline-flex min-w-0 items-center gap-2">
          <VoiceAvatar name={voice} src={item.speakerPortraitUrl} px={18} />
          <span className="truncate">{voice}</span>
        </span>,
      );
    }
    const dateShort = item.createdAt
      ? new Date(item.createdAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        })
      : "";
    if (dateShort && dateShort !== "Invalid Date") {
      meta.push(<span key="date">{dateShort}</span>);
    }
    if (showStars) {
      meta.push(
        <Stars
          key="stars"
          rating={item.rating}
          px={13}
          editable={canRate}
          busy={ratingBusy}
          onRating={onRating}
        />,
      );
    }

    const tabOptions: { id: MobileTab; label: string }[] = [
      { id: "script", label: "Script" },
      { id: "details", label: "Details" },
      { id: "reflections", label: `Reflections · ${entries.length}` },
    ];

    const stickyScrollMargin = stickyBarVisible ? MOBILE_STICKY_BAR_PX : 0;

    function selectMobileTab(next: MobileTab) {
      setMobileTab(next);
      if (!stickyBarVisible) return;
      requestAnimationFrame(() => {
        tabPanelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }

    function scrollPageToTop() {
      document.querySelector("main")?.scrollTo({
        top: 0,
        left: 0,
        behavior: "smooth",
      });
    }

    return (
      <div className="flex flex-col gap-3 px-3 pt-3" style={stripPad}>
        {/* Slides down from under the app header (z-130); stays mounted for exit. */}
        <div
          className={`fixed inset-x-0 top-14 z-40 border-b border-border bg-card shadow-[0_4px_10px_rgb(15_27_45_/_0.06)] transition-transform duration-200 ease-out md:hidden ${
            stickyBarVisible
              ? "translate-y-0"
              : "pointer-events-none -translate-y-full"
          }`}
          role="region"
          aria-label="Meditation shortcuts"
          aria-hidden={!stickyBarVisible}
        >
          <div className="flex items-center gap-2 py-1.5 pl-4 pr-3">
            <button
              type="button"
              tabIndex={stickyBarVisible ? 0 : -1}
              onClick={scrollPageToTop}
              className="min-w-0 flex-1 cursor-pointer truncate text-left font-display text-[15px] leading-snug text-foreground"
            >
              {item.title}
            </button>
            {!isCurrent ? (
              <button
                type="button"
                tabIndex={stickyBarVisible ? 0 : -1}
                aria-label="Play"
                onClick={onPlay}
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-black/10 text-on-accent"
                style={PRIMARY_ACCENT_FILL_STYLE}
              >
                <Play
                  className="size-2.5 translate-x-px"
                  fill="currentColor"
                  strokeWidth={0}
                  aria-hidden
                />
              </button>
            ) : null}
          </div>
          <div
            className="-mt-0.5 flex px-2"
            role="tablist"
            aria-label="Meditation sections"
          >
            {tabOptions.map((opt) => {
              const active = mobileTab === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  tabIndex={stickyBarVisible ? 0 : -1}
                  aria-selected={active}
                  onClick={() => selectMobileTab(opt.id)}
                  className={`flex h-7 flex-1 cursor-pointer items-center justify-center text-[13px] ${
                    active
                      ? "font-semibold text-foreground shadow-[inset_0_-2px_0_var(--accent)]"
                      : "font-normal text-foreground/80"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${CARD} overflow-hidden`}>
          <div className="h-[200px] w-full bg-muted/35">{cover}</div>
          <div className="flex flex-col gap-2.5 p-4">
            <span className={SECTION_LABEL}>
              {[eyebrowType, hasDuration ? durationLabel : ""]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <h1 className="font-display text-2xl font-normal leading-[1.2] text-foreground">
              {item.title}
            </h1>
            {meta.length > 0 ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                {meta.map((m, i) => (
                  <span key={i} className="inline-flex items-center gap-2">
                    {i > 0 ? <span aria-hidden>·</span> : null}
                    {m}
                  </span>
                ))}
              </span>
            ) : null}
            <div className="flex gap-2">
              <PlayButton
                compact
                isPlaying={isPlaying}
                durationLabel={null}
                onClick={onPlay}
              />
              <IconCircleButton label="Reflect on this meditation" onClick={onReflect}>
                <SquarePen
                  className="size-4 text-accent-link"
                  strokeWidth={2}
                  aria-hidden
                />
              </IconCircleButton>
              {heart}
              {menu}
            </div>
          </div>
        </div>

        <div ref={tabsSentinelRef}>
          <SegmentedPillTabs<MobileTab>
            aria-label="Meditation sections"
            value={mobileTab}
            onChange={selectMobileTab}
            equalWidth
            className="w-full gap-0.5 rounded-xl border-0 bg-surface-2 p-[3px]"
            selectedClassName="rounded-[9px] bg-card py-2 text-[13px] font-semibold text-foreground shadow-sm"
            idleClassName="rounded-[9px] py-2 text-[13px] font-normal text-muted"
            options={tabOptions}
          />
        </div>

        <div
          ref={tabPanelRef}
          style={
            stickyScrollMargin > 0
              ? { scrollMarginTop: stickyScrollMargin }
              : undefined
          }
        >
          {mobileTab === "script" ? (
            <ScriptCard
              chunks={chunks}
              wordCount={wordCount}
              mobile
              activeIndex={activeIndex}
              scrollMarginTopPx={stickyScrollMargin}
              onSeekChunk={timed ? handleSeekChunk : undefined}
            />
          ) : null}
          {mobileTab === "details" ? (
            <div className="flex flex-col gap-3">
              {own ? <MadeFromCard item={item} /> : null}
              <SoundVoiceCard item={item} soundscapeName={soundscapeName} />
            </div>
          ) : null}
          {mobileTab === "reflections" ? (
            <ReflectionsList entries={entries} onReflect={onReflect} asCard />
          ) : null}
        </div>
        {howMadeModal}
      </div>
    );
  }

  /* ---------------- Desktop ---------------- */
  const metaParts: ReactNode[] = [];
  if (voice) {
    metaParts.push(
      <span key="voice" className="flex items-center gap-1.5">
        <VoiceAvatar name={voice} src={item.speakerPortraitUrl} px={22} />
        {voice}
      </span>,
    );
  }
  if (soundscapeName) metaParts.push(<span key="sound">{soundscapeName}</span>);
  if (showStars) {
    metaParts.push(
      <span key="stars" className="flex items-center gap-1.5">
        <Stars
          rating={item.rating}
          px={16}
          editable={canRate}
          busy={ratingBusy}
          onRating={onRating}
        />
        <span className="text-muted">Your rating</span>
      </span>,
    );
  }

  const description = item.description?.trim();
  const made = item.createdAt ? formatWhen(item.createdAt) : "";

  return (
    <div className="mt-2 flex flex-col gap-3.5" style={stripPad}>
      <div className={CARD}>
        <div className="flex gap-7 p-6">
          <span className="block h-[240px] w-[240px] shrink-0 overflow-hidden rounded-[14px] bg-muted/35">
            {cover}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <span className="flex items-center gap-2">
              {eyebrowType ? (
                <span className="text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                  {eyebrowType}
                </span>
              ) : null}
              {made && made !== "—" ? (
                <span className="text-xs text-muted">· Made {made}</span>
              ) : null}
            </span>
            <h1 className="font-display text-[34px] font-normal leading-[1.15] text-foreground">
              {item.title}
            </h1>
            {description ? (
              <p className="max-w-[720px] text-[15px] leading-[1.6] text-foreground/80">
                {description}
              </p>
            ) : null}
            {metaParts.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3.5 text-[13px] text-foreground/80">
                {metaParts.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-3.5">
                    {i > 0 ? (
                      <span aria-hidden className="text-border">
                        |
                      </span>
                    ) : null}
                    {p}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-2">
              <PlayButton
                isPlaying={isPlaying}
                durationLabel={hasDuration ? durationLabel : null}
                onClick={onPlay}
              />
              <button
                type="button"
                onClick={onReflect}
                className={`${OUTLINE_BTN} h-11 px-4`}
              >
                <SquarePen
                  className="size-4 text-accent-link"
                  strokeWidth={2}
                  aria-hidden
                />
                Reflect
              </button>
              {heart}
              {menu}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-5">
        <ScriptCard
          chunks={chunks}
          wordCount={wordCount}
          mobile={false}
          activeIndex={activeIndex}
          onSeekChunk={timed ? handleSeekChunk : undefined}
        />
        <aside className="flex w-[320px] shrink-0 flex-col gap-3.5">
          {own ? <MadeFromCard item={item} /> : null}
          <SoundVoiceCard item={item} soundscapeName={soundscapeName} />
          <ReflectionsList entries={entries} onReflect={onReflect} />
        </aside>
      </div>
      {howMadeModal}
    </div>
  );
}
