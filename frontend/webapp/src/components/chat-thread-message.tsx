import type { ReactNode } from "react";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ASSISTANT_CHAT_PANEL_CLASSIC_STYLE } from "@/lib/assistant-chat-ui-flags";

/** Split assistant text into bubble parts (blank-line separated). */
export function splitChatBubbles(text: string): string[] {
  return text
    .split(/\n{2,}/g)
    .map((s) => s.replace(/[ \t]*\n+[ \t]*/g, " ").trim())
    .filter(Boolean);
}

export type ChatThreadMessageProps = {
  role: "user" | "assistant";
  /** Pre-split bubble parts (usually one for user, blank-line splits for assistant). */
  parts: string[];
  /**
   * Classic = bubbles both sides.
   * Modern (default from flag) = user bubbles only; assistant plain text.
   * FAB passes `true` to force classic.
   */
  classic?: boolean;
  textSize?: string;
  muted?: boolean;
  groupedWithNext?: boolean;
  /** Hide bubble tails (e.g. more parts still streaming in). */
  suppressTail?: boolean;
  /**
   * Force bubble chrome for assistant even in modern mode
   * (e.g. Create meditation script card).
   */
  alwaysBubble?: boolean;
  /** Extra classes on the assistant bubble when bubbled. */
  assistantBubbleClassName?: string;
  /** Override default ChatMarkdown body for a part. */
  renderPart?: (
    part: string,
    index: number,
    meta: { isLast: boolean },
  ) => ReactNode;
  /** Content under the bubbles (action results, audio CTA, …). */
  footer?: ReactNode;
  className?: string;
};

/**
 * Shared message chrome for full Chat + Create coach chat.
 * Change styles here once — both surfaces pick them up.
 */
export function ChatThreadMessage({
  role,
  parts,
  classic = ASSISTANT_CHAT_PANEL_CLASSIC_STYLE,
  textSize = "text-base",
  muted = false,
  groupedWithNext = false,
  suppressTail = false,
  alwaysBubble = false,
  assistantBubbleClassName = "",
  renderPart,
  footer,
  className = "",
}: ChatThreadMessageProps) {
  const isUser = role === "user";
  const mutedClass = muted ? "opacity-50" : "";
  const useBubbles = classic || isUser || alwaysBubble;

  const defaultPart = (part: string) => (
    <ChatMarkdown
      text={part}
      className={
        classic || isUser || alwaysBubble
          ? `relative z-[2] ${textSize} font-normal leading-[1.5]`
          : `${textSize} font-normal leading-[1.5] text-foreground`
      }
    />
  );

  return (
    <div
      className={`flex w-full min-w-0 flex-col ${
        isUser ? "items-end" : "items-start"
      } ${groupedWithNext ? "mb-1" : "mb-6"} ${className}`.trim()}
    >
      {parts.map((part, pi) => {
        const lastPart = pi === parts.length - 1;
        const showTail = lastPart && !groupedWithNext && !suppressTail;
        const body = renderPart
          ? renderPart(part, pi, { isLast: lastPart })
          : defaultPart(part);

        if (useBubbles) {
          const radius = isUser
            ? showTail
              ? "rounded-xl rounded-br-sm"
              : "rounded-xl"
            : showTail
              ? "rounded-xl rounded-bl-sm"
              : "rounded-xl";
          const bubbleBase = `chat-bubble relative px-3 py-2 ${radius}`;
          const bubble = isUser
            ? classic
              ? `${bubbleBase} chat-user-bubble ${textSize} leading-[1.5] text-foreground ${
                  showTail ? "chat-bubble-tail-right" : ""
                } ${mutedClass}`
              : `${bubbleBase} chat-user-bubble chat-user-bubble--modern relative ${textSize} leading-[1.5] text-foreground ${
                  showTail ? "chat-bubble-tail-right" : ""
                } ${mutedClass}`
            : `${bubbleBase} ${
                assistantBubbleClassName.trim() || "bg-card"
              } ${textSize} leading-[1.5] text-foreground ${
                showTail ? "chat-bubble-tail-left" : ""
              } ${mutedClass}`;

          return (
            <div
              key={pi}
              className={`flex w-full min-w-0 ${
                isUser ? "justify-end" : "justify-start"
              } ${lastPart ? "" : "mb-1"}`}
            >
              <div className="chat-bubble-shell">
                <div className={bubble}>{body}</div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={pi}
            className={`flex w-full min-w-0 max-w-[min(100%,42rem)] justify-start ${
              lastPart ? "" : "mb-3"
            } ${mutedClass}`}
          >
            {body}
          </div>
        );
      })}
      {footer}
    </div>
  );
}
