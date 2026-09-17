"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { AssistantChatActionResults } from "@/components/assistant-chat-action-results";
import { ChatMarkdown } from "@/components/chat-markdown";
import { DictationMicButton, appendSpokenText } from "@/components/dictation-mic-button";
import { assistantChatBubbles } from "@/lib/assistant-chat-protocol";
import { ASSISTANT_CHAT_PANEL_CLASSIC_STYLE } from "@/lib/assistant-chat-ui-flags";
import type { AssistantChatUiMessage } from "@/lib/assistant-chat-storage";

const SLOW_REPLY_MS = 7000;

function ChatTypingIndicator() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), SLOW_REPLY_MS);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      className="mb-3 flex w-full items-center justify-start gap-2.5 px-3.5 py-2.5"
      aria-live="polite"
      aria-label={
        slow ? "Taking longer than usual" : "Assistant is typing"
      }
    >
      <div className="flex h-4 items-end gap-1.5">
        <span className="chat-typing-dot h-2 w-2 rounded-full bg-accent" />
        <span className="chat-typing-dot h-2 w-2 rounded-full bg-accent" />
        <span className="chat-typing-dot h-2 w-2 rounded-full bg-accent" />
      </div>
      {slow ? (
        <span className="text-sm text-muted">Taking longer than usual…</span>
      ) : null}
    </div>
  );
}

function IconPaperAirplane({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

type Props = {
  messages: AssistantChatUiMessage[];
  input: string;
  setInput: (v: string) => void;
  inputDraftRef: RefObject<string>;
  chatInputRef: RefObject<HTMLInputElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  isAtBottomRef: RefObject<boolean>;
  busy: boolean;
  opening: boolean;
  error: string | null;
  setError: (v: string | null) => void;
  onSend: () => void;
  compact?: boolean;
  emptyHint?: string;
};

export function AssistantChatConversation({
  messages,
  input,
  setInput,
  inputDraftRef,
  chatInputRef,
  scrollRef,
  messagesEndRef,
  isAtBottomRef,
  busy,
  opening,
  error,
  setError,
  onSend,
  compact = false,
  emptyHint =
    "What would help right now? I can help you journal, note a gratitude, shape a goal, or start a meditation — or we can just talk something through.",
}: Props) {
  /** FAB (`compact`) always classic; full panel follows the flag. */
  const classicBubbles = compact || ASSISTANT_CHAT_PANEL_CLASSIC_STYLE;
  const showTyping =
    (opening && messages.length === 0) ||
    (busy && messages[messages.length - 1]?.role === "user");
  const showEmptyChrome = !opening && messages.length === 0 && !error;
  // 16px main chat (also iOS input no-zoom floor). FAB compact matches.
  const textSize = "text-base";

  // FAB remounts this pane without changing messages — force bottom on mount.
  useLayoutEffect(() => {
    isAtBottomRef.current = true;
    const run = () => {
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
        isAtBottomRef.current = true;
      }
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, [isAtBottomRef, scrollRef]);

  return (
    <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
      <div
        ref={scrollRef}
        className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-transparent ${
          compact ? "px-3" : "px-4 sm:px-5"
        }`}
        onScroll={(e) => {
          const el = e.currentTarget;
          const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
          isAtBottomRef.current = dist < 50;
        }}
      >
        {showEmptyChrome ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 sm:px-8">
            <div className="w-full max-w-md text-center">
              {!compact ? (
                <p className="font-display text-2xl font-medium tracking-tight text-foreground sm:text-[1.75rem]">
                  Chat
                </p>
              ) : null}
              <p
                className={`font-display text-[16px] font-normal leading-relaxed text-muted ${
                  compact ? "" : "mt-3"
                }`}
              >
                {emptyHint}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-auto flex w-full min-w-0 flex-col py-3">
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              const next = messages[i + 1];
              const groupedWithNext = !!next && next.role === msg.role;
              const parts = isUser
                ? [msg.text]
                : assistantChatBubbles(msg.text).length
                  ? assistantChatBubbles(msg.text)
                  : [msg.text];

              return (
                <div
                  key={`${msg.role}-${i}`}
                  className={`flex w-full min-w-0 flex-col ${
                    isUser ? "items-end" : "items-start"
                  } ${groupedWithNext ? "mb-1" : "mb-6"}`}
                >
                  {parts.map((part, pi) => {
                    const lastPart = pi === parts.length - 1;
                    const showTail = lastPart && !groupedWithNext;

                    if (classicBubbles) {
                      const radius = isUser
                        ? showTail
                          ? "rounded-xl rounded-br-sm"
                          : "rounded-xl"
                        : showTail
                          ? "rounded-xl rounded-bl-sm"
                          : "rounded-xl";
                      const bubbleBase = `chat-bubble relative px-3 py-2 ${radius}`;
                      const bubble = isUser
                        ? `${bubbleBase} bg-accent-soft ${textSize} leading-[1.5] text-foreground ${
                            showTail ? "chat-bubble-tail-right" : ""
                          }`
                        : `${bubbleBase} bg-card ${textSize} leading-[1.5] text-foreground ${
                            showTail ? "chat-bubble-tail-left" : ""
                          }`;
                      return (
                        <div
                          key={pi}
                          className={`flex w-full min-w-0 ${
                            isUser ? "justify-end" : "justify-start"
                          } ${lastPart ? "" : "mb-1"}`}
                        >
                          <div className="chat-bubble-shell">
                            <div className={bubble}>
                              <ChatMarkdown
                                text={part}
                                className={`relative z-[2] ${textSize} font-normal leading-[1.5]`}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    }

                    /* Modern panel: user bubbles only; assistant is plain text. */
                    if (isUser) {
                      const radius = showTail
                        ? "rounded-xl rounded-br-sm"
                        : "rounded-xl";
                      return (
                        <div
                          key={pi}
                          className={`flex w-full min-w-0 justify-end ${
                            lastPart ? "" : "mb-1"
                          }`}
                        >
                          <div className="chat-bubble-shell">
                            <div
                              className={`chat-bubble relative px-3 py-2 ${radius} bg-black/[0.028] dark:bg-accent-soft ${textSize} leading-[1.5] text-foreground ${
                                showTail ? "chat-bubble-tail-right" : ""
                              }`}
                            >
                              <ChatMarkdown
                                text={part}
                                className={`relative z-[2] ${textSize} font-normal leading-[1.5]`}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={pi}
                        className={`flex w-full min-w-0 max-w-[min(100%,42rem)] justify-start ${
                          lastPart ? "" : "mb-3"
                        }`}
                      >
                        <ChatMarkdown
                          text={part}
                          className={`${textSize} font-normal leading-[1.5] text-foreground`}
                        />
                      </div>
                    );
                  })}
                  {!isUser && msg.actionResults?.length ? (
                    <AssistantChatActionResults results={msg.actionResults} />
                  ) : null}
                </div>
              );
            })}
            {showTyping ? <ChatTypingIndicator /> : null}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form
        className={`relative z-[1] flex shrink-0 flex-col gap-1 border-t border-border/60 pointer-events-auto ${
          classicBubbles
            ? "bg-background"
            : "bg-transparent"
        } ${compact ? "px-3 pb-2.5 pt-2" : "px-4 pb-3 pt-2 sm:px-5"}`}
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        <div className="flex items-center gap-2">
          <input
            ref={chatInputRef}
            value={input}
            onChange={(e) => {
              setError(null);
              setInput(e.target.value);
            }}
            disabled={busy || opening}
            placeholder="Share what’s on your mind…"
            className={`min-w-0 flex-1 rounded-xl border border-border bg-background px-3 outline-none ring-accent/30 focus:ring-2 ${
              compact ? "py-2 text-base" : "py-2.5 text-base"
            }`}
          />
          <DictationMicButton
            disabled={busy || opening}
            onTranscript={(spoken) => {
              setInput(appendSpokenText(inputDraftRef.current || input, spoken));
              chatInputRef.current?.focus();
            }}
          />
          <button
            type="submit"
            aria-disabled={busy || opening}
            aria-label={busy || opening ? "Sending…" : "Send message"}
            className={`relative z-[200] flex shrink-0 cursor-pointer items-center justify-center rounded-xl accent-fill-gradient text-on-accent transition-opacity ${
              compact ? "h-10 w-10" : "h-11 w-11"
            } ${busy || opening ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {busy || opening ? (
              <span className="text-sm font-medium" aria-hidden>
                …
              </span>
            ) : (
              <IconPaperAirplane className="pointer-events-none -translate-y-px translate-x-px" />
            )}
          </button>
        </div>
        {error ? (
          <p className="text-xs text-danger" role="status">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
