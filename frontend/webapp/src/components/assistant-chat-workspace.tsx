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
} from "@/lib/assistant-chat-protocol";
import {
  clearAssistantChatSession,
  loadAssistantChatSession,
  saveAssistantChatSession,
  type AssistantChatMessage,
} from "@/lib/assistant-chat-storage";

const OPENING =
  "I'm here with you. What's on your mind — or what would you like help with?";

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
  const [hydrated, setHydrated] = useState(false);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([
    { role: "assistant", text: OPENING },
  ]);
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
    const session = loadAssistantChatSession();
    if (session.messages.length > 0) {
      setMessages(session.messages);
      setThread(session.thread);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveAssistantChatSession({
      v: 1,
      messages,
      thread,
      updatedAt: new Date().toISOString(),
    });
  }, [hydrated, messages, thread]);

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
    setMessages([{ role: "assistant", text: OPENING }]);
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

    const history =
      thread.length === 0
        ? [
            { role: "assistant" as const, content: OPENING },
            { role: "user" as const, content: trimmed },
          ]
        : [...thread, { role: "user" as const, content: trimmed }];

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
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text },
          ]);
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
          className="pointer-events-none absolute inset-0 opacity-15"
          style={{
            backgroundImage:
              'url("/patterns/hero/adobestock-2162625652-chat-tile.webp")',
            backgroundSize: "286px 320px",
            backgroundRepeat: "repeat",
          }}
          aria-hidden
        />

        <AssistantChatCapabilitiesFab />

        <div className="relative z-[1] flex shrink-0 items-center justify-end gap-2 px-4 pb-1 pt-3 sm:px-5">
          <button
            type="button"
            onClick={resetChat}
            disabled={busy || !hasUserTurns}
            aria-label="Reset chat"
            title="Reset chat"
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm text-muted transition-colors hover:bg-accent-soft/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconResetArrow />
            <span>Reset</span>
          </button>
        </div>

        <div
          ref={scrollRef}
          className="relative z-[1] min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1 sm:px-5"
          onScroll={(e) => {
            const el = e.currentTarget;
            const dist =
              el.scrollHeight - el.scrollTop - el.clientHeight;
            isAtBottomRef.current = dist < 80;
          }}
        >
          {!hasUserTurns ? (
            <div className="flex min-h-[min(52vh,28rem)] flex-col items-center justify-center px-2 text-center">
              <p className="font-display text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
                Chat
              </p>
              <p className="mt-3 max-w-md text-base leading-relaxed text-muted">
                {OPENING}
              </p>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col pt-2">
              {messages.map((msg, i) => {
                if (!hasUserTurns && i === 0 && msg.role === "assistant") {
                  return null;
                }
                const isUser = msg.role === "user";
                const next = messages[i + 1];
                const groupedWithNext =
                  !!next && next.role === msg.role;
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
                      <div className="mt-2 flex flex-wrap gap-2">
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

        <form
          className="relative z-[1] flex shrink-0 flex-col gap-1 border-t border-border/60 bg-background px-4 pb-3 pt-2 sm:px-5"
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
