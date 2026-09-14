"use client";

import Link from "next/link";
import { useEffect, useState, type RefObject } from "react";
import { ChatMarkdown } from "@/components/chat-markdown";
import { DictationMicButton, appendSpokenText } from "@/components/dictation-mic-button";
import { assistantChatBubbles } from "@/lib/assistant-chat-protocol";
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
  emptyHint = "What's on your mind today?",
}: Props) {
  const showTyping =
    (opening && messages.length === 0) ||
    (busy && messages[messages.length - 1]?.role === "user");
  const showEmptyChrome = !opening && messages.length === 0 && !error;
  const textSize = compact ? "text-base" : "text-lg";

  return (
    <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto ${
          compact ? "px-3" : "px-4 sm:px-5"
        }`}
        onScroll={(e) => {
          const el = e.currentTarget;
          const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
          isAtBottomRef.current = dist < 50;
        }}
      >
        {showEmptyChrome ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8">
            <p className="font-display text-center text-[16px] font-normal text-muted">
              {emptyHint}
            </p>
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
                  } ${groupedWithNext ? "mb-1" : "mb-3"}`}
                >
                  {parts.map((part, pi) => {
                    const lastPart = pi === parts.length - 1;
                    const showTail = lastPart && !groupedWithNext;
                    const radius = isUser
                      ? showTail
                        ? "rounded-[1.25rem] rounded-br-sm"
                        : "rounded-[1.25rem]"
                      : showTail
                        ? "rounded-[1.25rem] rounded-bl-sm"
                        : "rounded-[1.25rem]";
                    const bubbleBase = `chat-bubble relative px-3.5 py-2.5 ${radius}`;
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
                  })}
                  {!isUser && msg.actionResults?.length ? (
                    <div className="mt-2 flex w-full max-w-[80%] flex-col gap-2">
                      {msg.actionResults.map((result, ri) => (
                        <div
                          key={ri}
                          className={`flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border px-3.5 py-2.5 text-sm ${
                            result.ok
                              ? "border-border bg-background text-foreground"
                              : "border-danger/30 bg-danger/5 text-danger"
                          }`}
                          role="status"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">
                              {result.ok ? "✓ " : ""}
                              {result.label}
                            </span>
                            {result.detail ? (
                              <span className="mt-0.5 block truncate text-muted">
                                {result.detail}
                              </span>
                            ) : null}
                          </span>
                          {result.ok && result.href ? (
                            <Link
                              href={result.href}
                              className="shrink-0 font-semibold text-accent-link underline-offset-2 hover:underline"
                            >
                              {result.linkLabel ?? "Open"}
                            </Link>
                          ) : null}
                        </div>
                      ))}
                    </div>
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
        className={`relative z-[1] flex shrink-0 flex-col gap-1 border-t border-border/60 bg-background pointer-events-auto ${
          compact ? "px-3 pb-2.5 pt-2" : "px-4 pb-3 pt-2 sm:px-5"
        }`}
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
              compact ? "py-2 text-base" : "py-2.5 text-lg"
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
