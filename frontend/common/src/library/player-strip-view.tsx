import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CoverArtThumb } from "./cover-art-thumb";
import type { LibraryActiveTrack } from "./library-audio-strip";

/** Optional strip subtitle — mixes / voice samples only (not soundscapes). */
function playerStripSubtitle(track: LibraryActiveTrack): string | null {
  if (track.s3Key.startsWith("create:sound:voice:")) return "Voice sample";
  if (track.s3Key === "create:sound:mix" || track.ambientKind === "mix") {
    return "Your mix";
  }
  return null;
}

function PlayerStripWaveformIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
    </svg>
  );
}

export function formatAudioClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Now-playing pill chrome (layout, cover, transport buttons, scrubber).
 * Transport-agnostic: the web strip and the native (Capacitor) strip both render this.
 */
export function PlayerStripView({
  track,
  playing,
  current,
  timelineDuration,
  canSeek,
  onTogglePlay,
  onSkip,
  onSeek,
  onScrubStart,
  onScrubEnd,
  onClose,
  onReflect = null,
  reflectActive = false,
  onHeightChange,
  besideSidebar = false,
  bottomOffsetPx = 0,
  placement = "fixed",
  hiddenMedia = null,
}: {
  track: LibraryActiveTrack;
  playing: boolean;
  current: number;
  /** Voice + post-voice outro pad (seconds). */
  timelineDuration: number;
  canSeek: boolean;
  onTogglePlay: () => void;
  onSkip: (deltaSeconds: number) => void;
  onSeek: (seconds: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  onClose: () => void;
  onReflect?: (() => void) | null;
  reflectActive?: boolean;
  onHeightChange?: (heightPx: number) => void;
  besideSidebar?: boolean;
  bottomOffsetPx?: number;
  placement?: "fixed" | "inline";
  /** Transport-owned hidden `<audio>` elements. */
  hiddenMedia?: ReactNode;
}) {
  const inline = placement === "inline";
  const rootRef = useRef<HTMLDivElement>(null);

  /** Phone floating mini-player (above the tab pill). Desktop keeps the fuller strip. */
  const [phoneFloat, setPhoneFloat] = useState(false);
  /** Tap the mini strip to expand into the full player (skip ± lives here). */
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (inline) {
      setPhoneFloat(false);
      setExpanded(false);
      return;
    }
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => {
      setPhoneFloat(mq.matches);
      if (!mq.matches) setExpanded(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [inline]);
  const floatingMini = phoneFloat && !expanded;

  /** Desktop app chrome: size the strip to the main column, not the viewport. */
  const [contentColumnLayout, setContentColumnLayout] = useState(false);
  useEffect(() => {
    if (!besideSidebar || inline) {
      setContentColumnLayout(false);
      return;
    }
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setContentColumnLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [besideSidebar, inline]);

  /** Focus tasks shelf — inset the strip so it doesn't run under the rail. */
  const [focusTasksInsetPx, setFocusTasksInsetPx] = useState(0);
  useEffect(() => {
    const readInset = () => {
      const root = document.documentElement;
      const open = root.dataset.focusTasks === "open";
      const raw = getComputedStyle(root)
        .getPropertyValue("--focus-tasks-w")
        .trim();
      const fromVar = Number.parseFloat(raw);
      setFocusTasksInsetPx(
        open ? (Number.isFinite(fromVar) && fromVar > 0 ? fromVar : 320) : 0,
      );
    };
    readInset();
    const mo = new MutationObserver(readInset);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-focus-tasks", "style"],
    });
    return () => mo.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || !onHeightChange) return;
    const report = () => {
      const h = el.getBoundingClientRect().height;
      // Avoid clobbering the optimistic estimate with a 0 pre-layout read.
      if (h > 0) onHeightChange(h);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [track, onHeightChange]);

  const max = Math.max(timelineDuration, 0.0001);
  const coverUrl =
    typeof track.coverImageUrl === "string" ? track.coverImageUrl.trim() : "";
  const stripSubtitle = playerStripSubtitle(track);
  const timeLeftSec = Math.max(0, max - current);
  const voiceMeta = track.speakerName?.trim() || null;
  const miniMeta = voiceMeta
    ? `${voiceMeta} · ${formatAudioClock(timeLeftSec)} left`
    : canSeek
      ? `${formatAudioClock(timeLeftSec)} left`
      : stripSubtitle;
  /** Match PlayerStrip mockup ivory — hard colors so Tailwind/theme remaps can't kill contrast. */
  const ivory = "#F3EDE2";
  const ivory60 = "rgba(243,237,226,0.6)";
  const ivory55 = "rgba(243,237,226,0.55)";
  const ivory18 = "rgba(243,237,226,0.18)";
  const ivory10 = "rgba(243,237,226,0.10)";
  const stripBorder = "rgba(243,237,226,0.22)";
  const paisleyFloat = phoneFloat;
  const stripStyle = {
    height: floatingMini ? 58 : track.speakerName ? 88 : 76,
    boxSizing: "border-box",
    color: ivory,
    backgroundColor: paisleyFloat ? "var(--deep, #0f1b2d)" : undefined,
    backgroundImage: paisleyFloat
      ? "url(/patterns/paisley-dark-duotone.webp), linear-gradient(90deg, var(--player-surface-start, #2a3c5a) 0%, var(--deep, #0f1b2d) 100%)"
      : "linear-gradient(90deg, var(--player-surface-start, #2a3c5a) 0%, var(--deep, #0f1b2d) 100%)",
    backgroundSize: paisleyFloat ? "220px 220px, auto" : undefined,
    backgroundBlendMode: paisleyFloat ? "soft-light, normal" : undefined,
    border: `1px solid ${stripBorder}`,
    boxShadow:
      "0 10px 28px -12px rgb(0 0 0 / 0.4), inset 0 1px 0 rgb(255 255 255 / 0.12)",
    padding: floatingMini ? "8px 12px 8px 8px" : "10px 24px 10px 10px",
    display: "flex",
    alignItems: "center",
    gap: floatingMini ? 10 : 16,
    position: "relative",
    overflow: "hidden",
    cursor: floatingMini ? "pointer" : undefined,
  } as CSSProperties;
  const outlineBtnStyle = {
    width: 36,
    height: 36,
    borderRadius: 9999,
    border: `1.5px solid ${ivory55}`,
    boxSizing: "border-box",
    background: "transparent",
    color: ivory,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    cursor: "pointer",
    padding: 0,
  } as CSSProperties;
  const playBtnStyle = {
    width: 44,
    height: 44,
    borderRadius: 9999,
    boxSizing: "border-box",
    backgroundColor: "var(--accent-button, #c3d2e8)",
    backgroundImage: "var(--accent-gradient-button)",
    border: "1px solid color-mix(in srgb, var(--accent-button, #c3d2e8) 72%, #6b7f9a)",
    color: "var(--on-accent, #0f1b2d)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    cursor: "pointer",
    padding: 0,
  } as CSSProperties;
  const mutedTextStyle = {
    color: ivory60,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  } as CSSProperties;
  const scrubPct = canSeek
    ? Math.min(100, Math.max(0, (Math.min(current, max) / max) * 100))
    : 50;
  const scrubTrackBg = `linear-gradient(to right, var(--accent, #c8a46a) 0%, var(--accent, #c8a46a) ${scrubPct}%, ${ivory18} ${scrubPct}%, ${ivory18} 100%)`;

  const artSize = floatingMini ? 42 : 56;
  const miniPlayStyle = {
    ...playBtnStyle,
    width: 36,
    height: 36,
    backgroundColor: ivory,
    backgroundImage: "none",
    border: "none",
    color: "var(--deep, #0f1b2d)",
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={
        // Match the page column: left-aligned max-w-6xl in the main area.
        // The column does not center in the leftover viewport (flex + max-width),
        // so a viewport-wide w-full pill with a sidebar left inset hangs off the right.
        // Sidebar inset must match AppChrome spacer (`lg:block`), not `md`.
        inline
          ? "pointer-events-none relative z-50 mx-auto w-full max-w-6xl px-4 pb-3 pt-2 md:px-6"
          : phoneFloat
            ? "pointer-events-none fixed z-[125] left-0 right-0"
            : `pointer-events-none fixed z-50 left-0 w-full max-w-6xl px-4 pt-3 md:px-6 ${
                besideSidebar ? "lg:left-[var(--app-sidebar-w,200px)]" : ""
              }`
      }
      style={
        inline
          ? undefined
          : phoneFloat
            ? {
                bottom: Math.max(0, bottomOffsetPx),
                paddingLeft: 14,
                paddingRight: 14,
              }
            : {
                bottom: Math.max(0, bottomOffsetPx),
                ...(contentColumnLayout
                  ? {
                      width: `min(72rem, calc(100% - var(--app-sidebar-w, 200px) - ${Math.max(0, focusTasksInsetPx)}px))`,
                      maxWidth: "none",
                    }
                  : {}),
                paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
              }
      }
    >
      {hiddenMedia}

      <div
        className="pointer-events-auto w-full min-w-0 rounded-full"
        style={stripStyle}
        role="region"
        aria-label="Now playing"
        onClick={
          floatingMini
            ? (e) => {
                const t = e.target as HTMLElement | null;
                if (t?.closest("button")) return;
                setExpanded(true);
              }
            : undefined
        }
      >
        {coverUrl ? (
          <div
            style={{
              width: artSize,
              height: artSize,
              borderRadius: 9999,
              flexShrink: 0,
              overflow: "hidden",
              border: `1px solid ${stripBorder}`,
              boxSizing: "border-box",
            }}
          >
            <CoverArtThumb
              src={coverUrl}
              alt=""
              edgePx={artSize - 2}
              className="!rounded-full"
            />
          </div>
        ) : (
          <div
            style={{
              width: artSize,
              height: artSize,
              borderRadius: 9999,
              flexShrink: 0,
              background: ivory10,
              border: `1px solid ${stripBorder}`,
              boxSizing: "border-box",
              color: "var(--accent, #c8a46a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-hidden
          >
            <PlayerStripWaveformIcon />
          </div>
        )}

        {floatingMini ? (
          <>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <p
                className="font-display"
                style={{
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 15,
                  lineHeight: 1.2,
                  color: ivory,
                }}
              >
                {track.title}
              </p>
              {miniMeta ? (
                <p
                  style={{
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 12,
                    lineHeight: 1.2,
                    color: ivory60,
                  }}
                >
                  {miniMeta}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onTogglePlay()}
              style={miniPlayStyle}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
                  <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flexShrink: 0,
                border: "none",
                background: "transparent",
                color: ivory60,
                cursor: "pointer",
                display: "flex",
                padding: 4,
              }}
              aria-label="Close player"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
            {canSeek ? (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 14,
                  right: 14,
                  bottom: 0,
                  height: 2,
                  borderRadius: 999,
                  background: ivory18,
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${scrubPct}%`,
                    background: "var(--accent, #c8a46a)",
                  }}
                />
              </span>
            ) : null}
          </>
        ) : null}

        {!floatingMini ? (
          <>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {canSeek ? (
            <button
              type="button"
              onClick={() => onSkip(-10)}
              style={outlineBtnStyle}
              aria-label="Back 10 seconds"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = ivory;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = ivory55;
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
                <path d="M11 6v12L3 12zM20 6v12l-8-6z" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onTogglePlay()}
            style={playBtnStyle}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
                <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            )}
          </button>
          {canSeek ? (
            <button
              type="button"
              onClick={() => onSkip(10)}
              style={outlineBtnStyle}
              aria-label="Forward 10 seconds"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = ivory;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = ivory55;
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
                <path d="M13 6v12l8-6zM4 6v12l8-6z" />
              </svg>
            </button>
          ) : null}
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "center",
                gap: 10,
                minWidth: 0,
                maxWidth: "100%",
              }}
            >
              <p
                className="font-display"
                style={{
                  margin: 0,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 19,
                  lineHeight: 1.15,
                  color: ivory,
                }}
              >
                {track.title}
              </p>
              {stripSubtitle ? (
                <span style={{ ...mutedTextStyle, flexShrink: 0, fontVariantNumeric: undefined }}>
                  {stripSubtitle}
                </span>
              ) : null}
            </div>
            {track.speakerName ? (
              <p
                className="font-sans"
                style={{
                  margin: 0,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  fontWeight: 400,
                  lineHeight: 1.2,
                  color: ivory60,
                }}
              >
                {track.speakerName}
              </p>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ ...mutedTextStyle, width: 40, flexShrink: 0 }}>
              {canSeek ? formatAudioClock(current) : ""}
            </span>
            <input
              type="range"
              className={`library-strip-scrubber min-w-0 flex-1 ${
                canSeek
                  ? "cursor-pointer"
                  : "pointer-events-none cursor-default opacity-50"
              }`}
              style={{ background: scrubTrackBg }}
              min={0}
              max={max}
              step={0.05}
              value={canSeek ? Math.min(current, max) : max / 2}
              disabled={!canSeek}
              aria-label={canSeek ? "Seek" : "Seek unavailable"}
              onMouseDown={() => {
                if (!canSeek) return;
                onScrubStart();
              }}
              onMouseUp={onScrubEnd}
              onMouseLeave={onScrubEnd}
              onTouchStart={() => {
                if (!canSeek) return;
                onScrubStart();
              }}
              onTouchEnd={onScrubEnd}
              onChange={(e) => {
                if (!canSeek) return;
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                onSeek(v);
              }}
            />
            <span
              style={{
                ...mutedTextStyle,
                width: 40,
                flexShrink: 0,
                textAlign: "right",
              }}
            >
              {canSeek ? formatAudioClock(timelineDuration) : ""}
            </span>
          </div>
        </div>

        {onReflect ? (
          <button
            type="button"
            onClick={onReflect}
            aria-label="Reflect on this meditation"
            aria-pressed={reflectActive}
            className="library-strip-reflect"
            style={{
              flexShrink: 0,
              height: 36,
              padding: "0 14px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderRadius: 999,
              border: reflectActive
                ? "1.5px solid rgba(232, 196, 140, 0.85)"
                : "1.5px solid rgba(243, 237, 226, 0.55)",
              background: reflectActive
                ? "rgba(232, 196, 140, 0.18)"
                : "transparent",
              color: ivory,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span className="hidden sm:inline">Reflect</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          style={{
            flexShrink: 0,
            paddingLeft: 4,
            border: "none",
            background: "transparent",
            color: ivory60,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Close player"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = ivory;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = ivory60;
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
