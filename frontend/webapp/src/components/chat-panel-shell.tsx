import type { ReactNode } from "react";
import { ASSISTANT_CHAT_PANEL_CLASSIC_STYLE } from "@/lib/assistant-chat-ui-flags";

const CHAT_PANEL_TILE_STYLE = {
  backgroundImage:
    'url("/patterns/hero/adobestock-2162625652-chat-tile.webp")',
  backgroundRepeat: "repeat",
  backgroundSize: "286px 320px",
  backgroundPosition: "center top",
} as const;

const CHAT_RAIL_TILE_STYLE = {
  backgroundImage: 'url("/patterns/hero/adobestock-2162625652.webp")',
  backgroundRepeat: "repeat",
  backgroundSize: "220px auto",
  backgroundPosition: "center top",
} as const;

/**
 * Warm fill + tile pattern for chat panels.
 * Hidden in hybrid. Only rendered when classic style is on.
 */
export function ChatPanelPatternTile({
  classic = ASSISTANT_CHAT_PANEL_CLASSIC_STYLE,
}: {
  classic?: boolean;
}) {
  if (!classic) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 opacity-15 hybrid:hidden"
      style={CHAT_PANEL_TILE_STYLE}
    />
  );
}

/** Sidebar / rail tile — same classic + hybrid rules as the main panel. */
export function ChatRailPatternTile({
  classic = ASSISTANT_CHAT_PANEL_CLASSIC_STYLE,
}: {
  classic?: boolean;
}) {
  if (!classic) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 opacity-[0.15] hybrid:hidden"
      style={CHAT_RAIL_TILE_STYLE}
    />
  );
}

/**
 * Shared chat panel chrome (Create coach chat + full Chat workspace).
 * Classic: warm fill + tile. Modern (default): transparent, no tile.
 */
export function ChatPanelShell({
  children,
  classic = ASSISTANT_CHAT_PANEL_CLASSIC_STYLE,
  className = "",
}: {
  children: ReactNode;
  /** Override; defaults to {@link ASSISTANT_CHAT_PANEL_CLASSIC_STYLE}. */
  classic?: boolean;
  /** Extra classes on the bordered panel. */
  className?: string;
}) {
  return (
    <div
      className={`relative z-[1] flex h-full min-h-0 w-full min-w-0 max-w-6xl overflow-hidden border-r-[0.5px] border-border bg-[color:var(--chat-panel-bg)] ${className}`.trim()}
    >
      <ChatPanelPatternTile classic={classic} />
      {children}
    </div>
  );
}
