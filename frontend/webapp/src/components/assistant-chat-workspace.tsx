"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ChatMarkdown } from "@/components/chat-markdown";
import { AssistantChatCapabilitiesFab } from "@/components/assistant-chat-capabilities-fab";
import { DictationMicButton, appendSpokenText } from "@/components/dictation-mic-button";
import { streamAssistantChat } from "@/lib/assistant-chat-api";
import { executeAssistantActions } from "@/lib/assistant-chat-actions";
import {
  assistantChatBubbles,
  parseAssistantDisplayText,
  type AssistantAction,
} from "@/lib/assistant-chat-protocol";
import { clearAssistantChatSession } from "@/lib/assistant-chat-storage";

/** Empty-state chrome only — not a chat bubble. */
const EMPTY_HINT = "What's on your mind today?";

type AssistantChatMessage = {
  role: "user" | "assistant";
  text: string;
  actions?: AssistantAction[];
  actionResults?: Array<{ label: string; href?: string; ok: boolean }>;
};

function ChatTypingIndicator() {
  return (
    <div
      className="mb-3 flex w-full justify-start px-3.5 py-2.5"
      aria-live="polite"
      aria-label="Assistant is typing"
    >
      <div className="flex h-4 items-end gap-1.5">
        <span className="chat-typing-dot h-2 w-2 rounded-full bg-accent" />
        <span className="chat-typing-dot h-2 w-2 rounded-full bg-accent" />
        <span className="chat-typing-dot h-2 w-2 rounded-full bg-accent" />
      </div>
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

function IconResetArrow({ className }: { className?: string }) {
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
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  );
}

export function AssistantChatWorkspace() {
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [thread, setThread] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputDraftRef = useRef("");
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const busyRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Drop any leftover keys from earlier builds; transcript stays in memory only.
    clearAssistantChatSession();
  }, []);

  useEffect(() => {
    inputDraftRef.current = input;
  }, [input]);

  const scrollToBottomIfPinned = useCallback(() => {
    if (!isAtBottomRef.current) return;
    requestAnimationFrame(() => {
      if (!isAtBottomRef.current) return;
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });
  }, []);

  useLayoutEffect(() => {
    scrollToBottomIfPinned();
  }, [messages, busy, scrollToBottomIfPinned]);

  const resetChat = useCallback(() => {
    if (busyRef.current) return;
    clearAssistantChatSession();
    setMessages([]);
    setThread([]);
    setInput("");
    setError(null);
    chatInputRef.current?.focus();
  }, []);

  const send = useCallback(async () => {
    const trimmed = (inputDraftRef.current || input).trim();
    if (!trimmed || busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError(null);
    setInput("");
    inputDraftRef.current = "";

    const history = [...thread, { role: "user" as const, content: trimmed }];

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setThread(history);

    let assistantStarted = false;
    let acc = "";

    try {
      const raw = await streamAssistantChat({ messages: history }, (chunk) => {
        acc += chunk;
        const { text } = parseAssistantDisplayText(acc);
        if (!assistantStarted) {
          assistantStarted = true;
          setMessages((prev) => [...prev, { role: "assistant", text }]);
        } else {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, text };
            }
            return next;
          });
        }
        scrollToBottomIfPinned();
      });

      const parsed = parseAssistantDisplayText(raw);
      const results = executeAssistantActions(parsed.actions);
      const actionResults = results.map((r) => ({
        label: r.label,
        href: r.href,
        ok: r.ok,
      }));

      setThread([...history, { role: "assistant", content: raw }]);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = {
            ...last,
            text: parsed.text,
            actions: parsed.actions,
            actionResults,
          };
        } else {
          next.push({
            role: "assistant",
            text: parsed.text,
            actions: parsed.actions,
            actionResults,
          });
        }
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not reach assistant";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Sorry — ${msg}` },
      ]);
    } finally {
      busyRef.current = false;
      setBusy(false);
      requestAnimationFrame(() => chatInputRef.current?.focus());
    }
  }, [input, thread, scrollToBottomIfPinned]);

  const showTyping = busy && messages[messages.length - 1]?.role === "user";
  const hasUserTurns = messages.some((m) => m.role === "user");

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-transparent">
      <div className="relative z-[1] flex h-full min-h-0 w-full min-w-0 max-w-6xl flex-col overflow-hidden border-r-[0.5px] border-border bg-[color:var(--card-warm-bg)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 opacity-15"
          style={{
            backgroundImage:
              'url("/patterns/hero/adobestock-2162625652-chat-tile.webp")',
            backgroundRepeat: "repeat",
            backgroundSize: "286px 320px",
            backgroundPosition: "center top",
          }}
        />

        <AssistantChatCapabilitiesFab />

        <div className="relative z-[1] flex shrink-0 items-center justify-end px-4 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={resetChat}
            disabled={busy || !hasUserTurns}
            aria-label="Reset chat"
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-accent-soft/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconResetArrow className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
          <div
            ref={scrollRef}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-4 sm:px-5"
            onScroll={(e) => {
              const el = e.currentTarget;
              const dist =
                el.scrollHeight - el.scrollTop - el.clientHeight;
              isAtBottomRef.current = dist < 50;
            }}
          >
            {!hasUserTurns ? (
              <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
                <p className="font-display text-center text-[18px] font-normal text-muted">
                  {EMPTY_HINT}
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
                        const bubbleBase = `chat-bubble relative inline-block w-fit max-w-[calc(100%-16px)] px-3.5 py-2.5 ${radius}`;
                        const bubble = isUser
                          ? `${bubbleBase} bg-accent-soft text-lg leading-[1.5] text-foreground ${
                              showTail ? "chat-bubble-tail-right" : ""
                            }`
                          : `${bubbleBase} bg-card text-lg leading-[1.5] text-foreground ${
                              showTail ? "chat-bubble-tail-left" : ""
                            }`;
                        return (
                          <div
                            key={pi}
                            className={`flex w-full min-w-0 ${
                              isUser ? "justify-end" : "justify-start"
                            } ${lastPart ? "" : "mb-1"}`}
                          >
                            <div className={bubble}>
                              <ChatMarkdown
                                text={part}
                                className="relative z-[2] text-lg font-normal leading-[1.5]"
                              />
                            </div>
                          </div>
                        );
                      })}
                      {!isUser && msg.actionResults?.length ? (
                        <div className="mt-2 flex w-full flex-wrap justify-start gap-2">
                          {msg.actionResults.map((result, ri) => {
                            if (result.href && result.ok) {
                              return (
                                <Link
                                  key={ri}
                                  href={result.href}
                                  className="inline-flex cursor-pointer items-center rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-accent-link transition-colors hover:bg-accent-soft/40"
                                >
                                  {result.label}
                                </Link>
                              );
                            }
                            return (
                              <span
                                key={ri}
                                className={`inline-flex items-center rounded-full border border-border/80 bg-background/80 px-3 py-1.5 text-sm ${
                                  result.ok ? "text-muted" : "text-danger"
                                }`}
                              >
                                {result.label}
                              </span>
                            );
                          })}
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
        </div>

        <form
          className="relative z-[1] flex shrink-0 flex-col gap-1 border-t border-border/60 bg-background px-4 pb-3 pt-2 pointer-events-auto sm:px-5"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
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
              aria-busy={busy}
              placeholder="Share what’s on your mind…"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-lg outline-none ring-accent/30 focus:ring-2"
            />
            <DictationMicButton
              disabled={busy}
              onTranscript={(spoken) => {
                setInput(appendSpokenText(inputDraftRef.current || input, spoken));
                chatInputRef.current?.focus();
              }}
            />
            <button
              type="submit"
              aria-disabled={busy}
              aria-label={busy ? "Sending…" : "Send message"}
              className={`relative z-[200] flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl accent-fill-gradient text-on-accent transition-opacity ${
                busy ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              {busy ? (
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
      <div
        className="journal-editor-pattern-gutter pointer-events-none min-h-0 min-w-0 flex-1"
        aria-hidden
      />
    </div>
  );
}
