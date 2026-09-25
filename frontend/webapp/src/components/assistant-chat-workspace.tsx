import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AssistantChatCapabilitiesFab } from "@/components/assistant-chat-capabilities-fab";
import { AssistantChatConversation } from "@/components/assistant-chat-conversation";
import {
  ChatPanelShell,
  ChatRailPatternTile,
} from "@/components/chat-panel-shell";
import {
  clearAssistantChatRemoteSessionCache,
  markAssistantChatStorePulledThisSession,
  pullAssistantChatStoreFromCloud,
  scheduleAssistantChatCloudPush,
  wasAssistantChatStorePulledThisSession,
} from "@/lib/assistant-chat-cloud";
import {
  ASSISTANT_CHAT_STORE_CHANGED,
  clearLegacyAssistantChatKeys,
  deleteAssistantChatThread,
  formatAssistantChatThreadDate,
  groupAssistantChatThreadsForSidebar,
  loadAssistantChatStore,
  loadSidebarCollapsed,
  renameAssistantChatThread,
  saveAssistantChatStore,
  saveSidebarCollapsed,
  threadPreview,
  type AssistantChatThread,
} from "@/lib/assistant-chat-storage";
import {
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import { useAssistantChatThread } from "@/lib/use-assistant-chat-thread";

function threadIdFromPath(pathname: string): string | null {
  const m = /^\/chat\/my\/([^/]+)\/?$/.exec(pathname);
  if (!m?.[1] || m[1] === "my") return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function IconChevron({
  className,
  dir,
}: {
  className?: string;
  dir: "left" | "right";
}) {
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
      {dir === "left" ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  );
}

export function AssistantChatWorkspace() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeThreadId = threadIdFromPath(pathname || "/chat/my");
  const mobileComposeChrome = Boolean(routeThreadId);

  const [storeThreads, setStoreThreads] = useState<AssistantChatThread[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const chat = useAssistantChatThread({
    threadId: routeThreadId,
    autoOpen: true,
  });

  const refreshSidebar = useCallback(() => {
    setStoreThreads(loadAssistantChatStore().threads);
  }, []);

  useEffect(() => {
    clearLegacyAssistantChatKeys();
    setCollapsed(loadSidebarCollapsed());
    refreshSidebar();
  }, [refreshSidebar]);

  useEffect(() => {
    const onChange = () => refreshSidebar();
    window.addEventListener(ASSISTANT_CHAT_STORE_CHANGED, onChange);
    const onStorage = (ev: StorageEvent) => {
      if (
        ev.key !== null &&
        ev.key !== "mm_assistant_chat_store_v1" &&
        !ev.key.startsWith("mm_assistant_chat_store_v1:")
      ) {
        return;
      }
      refreshSidebar();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ASSISTANT_CHAT_STORE_CHANGED, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshSidebar]);

  // Cloud pull once per session when signed in.
  useEffect(() => {
    const sync = () => {
      const signedIn =
        isMedimadeSessionActive() && Boolean(getMedimadeSessionJwt());
      if (!signedIn) {
        clearAssistantChatRemoteSessionCache();
        setCloudReady(true);
        refreshSidebar();
        return;
      }
      // wasPulled is keyed by session email — account switch forces a new pull.
      if (wasAssistantChatStorePulledThisSession()) {
        setCloudReady(true);
        refreshSidebar();
        return;
      }
      void pullAssistantChatStoreFromCloud()
        .then((remote) => {
          if (remote) refreshSidebar();
          else markAssistantChatStorePulledThisSession();
        })
        .catch(() => {
          markAssistantChatStorePulledThisSession();
        })
        .finally(() => setCloudReady(true));
    };
    sync();
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, [refreshSidebar]);

  const newHandledRef = useRef(false);

  // Landing on /chat/my (breadcrumb, sidebar Chat, or direct URL) → always a fresh thread.
  // Also handles ?new=1.
  useEffect(() => {
    if (!cloudReady || !chat.hydrated) return;
    if (routeThreadId) {
      newHandledRef.current = false;
      return;
    }
    if (pathname !== "/chat/my" && pathname !== "/chat/my/") return;
    if (newHandledRef.current) return;
    newHandledRef.current = true;
    let cancelled = false;
    void (async () => {
      const id = await chat.createNewThread();
      if (cancelled || !id) {
        newHandledRef.current = false;
        return;
      }
      navigate(`/chat/my/${encodeURIComponent(id)}`, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReady, chat.hydrated, pathname, routeThreadId, searchParams]);

  // Invalid thread id in URL → start a fresh chat
  useEffect(() => {
    if (!chat.hydrated || !routeThreadId) return;
    if (chat.activeId === routeThreadId) return;
    const store = loadAssistantChatStore();
    if (!store.threads.some((t) => t.id === routeThreadId)) {
      void (async () => {
        const id = await chat.createNewThread();
        navigate(id ? `/chat/my/${encodeURIComponent(id)}` : "/chat/my", {
          replace: true,
        });
      })();
    }
  }, [chat, chat.hydrated, chat.activeId, routeThreadId, navigate]);

  const groups = useMemo(
    () => groupAssistantChatThreadsForSidebar(storeThreads),
    [storeThreads],
  );

  const onNewChat = useCallback(async () => {
    const id = await chat.createNewThread();
    if (id) navigate(`/chat/my/${encodeURIComponent(id)}`);
  }, [chat, navigate]);

  const onSelect = useCallback(
    (id: string) => {
      chat.selectThread(id);
      navigate(`/chat/my/${encodeURIComponent(id)}`);
    },
    [chat, navigate],
  );

  const onDelete = useCallback(
    (id: string) => {
      const next = deleteAssistantChatThread(loadAssistantChatStore(), id);
      saveAssistantChatStore(next);
      scheduleAssistantChatCloudPush(next);
      refreshSidebar();
      if (chat.activeId === id) {
        const fallback = next.activeThreadId;
        if (fallback) {
          chat.selectThread(fallback);
          navigate(`/chat/my/${encodeURIComponent(fallback)}`);
        } else {
          void onNewChat();
        }
      }
    },
    [chat, onNewChat, refreshSidebar, navigate],
  );

  const beginRename = useCallback((t: AssistantChatThread) => {
    setRenamingId(t.id);
    setRenameDraft(t.title === "New chat" ? "" : t.title);
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingId) return;
    const next = renameAssistantChatThread(
      loadAssistantChatStore(),
      renamingId,
      renameDraft,
    );
    saveAssistantChatStore(next);
    scheduleAssistantChatCloudPush(next);
    refreshSidebar();
    setRenamingId(null);
    setRenameDraft("");
  }, [renamingId, renameDraft, refreshSidebar]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      saveSidebarCollapsed(next);
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-transparent">
      <ChatPanelShell>
        <AssistantChatCapabilitiesFab />

        <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 overflow-hidden md:flex-row">
          {/* Collapsed rail (desktop) */}
          {collapsed ? (
            <aside
              className={`relative z-[1] hidden shrink-0 flex-col items-center gap-2 overflow-hidden border-r-[0.5px] border-border bg-surface-rail px-1.5 py-3 md:flex ${
                mobileComposeChrome ? "" : ""
              }`}
            >
              <ChatRailPatternTile />
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Expand chat list"
                className="relative z-[1] flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground"
              >
                <IconChevron dir="right" />
              </button>
              <button
                type="button"
                onClick={() => void onNewChat()}
                disabled={chat.busy || chat.opening}
                aria-label="New chat"
                className="relative z-[1] flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl accent-fill-gradient text-sm font-bold text-on-accent disabled:opacity-50"
              >
                +
              </button>
            </aside>
          ) : (
            <aside
              className={`relative z-[1] flex min-h-0 flex-col gap-3 overflow-hidden border-b-[0.5px] border-border bg-surface-rail px-3 pb-3 pt-3 md:w-[180px] md:shrink-0 md:self-stretch md:border-b-0 md:border-r-[0.5px] lg:w-[220px] xl:w-[260px] ${
                mobileComposeChrome
                  ? "max-sm:hidden"
                  : "max-sm:h-fit max-sm:max-h-full max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto max-sm:pb-5 max-sm:shadow-md"
              }`}
            >
              <ChatRailPatternTile />
              <div className="relative z-[1] flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label="Collapse chat list"
                  className="hidden h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground md:flex"
                >
                  <IconChevron dir="left" />
                </button>
                <button
                  type="button"
                  onClick={() => void onNewChat()}
                  disabled={chat.busy || chat.opening}
                  className="min-w-0 flex-1 cursor-pointer rounded-xl accent-fill-gradient px-3 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  + New chat
                </button>
              </div>

              <nav className="relative z-[1] min-h-0 flex-1 space-y-5 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
                {groups.length === 0 ? (
                  <p className="px-1 text-xs text-muted">No chats yet</p>
                ) : (
                  groups.map((group) => (
                    <div key={group.label}>
                      <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {group.label}
                      </p>
                      <ul className="space-y-1.5">
                        {group.threads.map((t) => {
                          const isActive = t.id === chat.activeId;
                          const isRenaming = renamingId === t.id;
                          const metaMuted = isActive
                            ? "text-faint"
                            : "text-muted";
                          return (
                            <li key={t.id} className="group relative">
                              {isRenaming ? (
                                <form
                                  className="rounded-xl border border-border border-l-[3px] border-l-accent bg-card px-3 py-2 shadow-sm"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    commitRename();
                                  }}
                                >
                                  <input
                                    ref={renameInputRef}
                                    value={renameDraft}
                                    onChange={(e) =>
                                      setRenameDraft(e.target.value)
                                    }
                                    onBlur={() => commitRename()}
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") {
                                        e.preventDefault();
                                        setRenamingId(null);
                                      }
                                    }}
                                    aria-label="Chat name"
                                    placeholder="Chat name"
                                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm font-semibold outline-none ring-accent/30 focus:ring-2"
                                  />
                                </form>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onSelect(t.id)}
                                    onDoubleClick={(e) => {
                                      e.preventDefault();
                                      beginRename(t);
                                    }}
                                    className={`w-full cursor-pointer rounded-xl border px-3 py-2.5 pr-14 text-left transition-colors ${
                                      isActive
                                        ? "border-border border-l-[3px] border-l-accent bg-card text-foreground shadow-sm"
                                        : "border-border bg-card text-foreground hover:border-accent/40 dark:bg-background"
                                    }`}
                                  >
                                    <span className="line-clamp-2 text-sm font-semibold">
                                      {t.title}
                                    </span>
                                    <span className="mt-0.5 line-clamp-2 text-xs text-muted">
                                      {threadPreview(t)}
                                    </span>
                                    <div
                                      className={`mt-2 border-t pt-2 text-[10px] leading-snug ${
                                        isActive
                                          ? "border-border-subtle"
                                          : "border-border"
                                      } ${metaMuted}`}
                                    >
                                      <time dateTime={t.updatedAt}>
                                        {formatAssistantChatThreadDate(
                                          t.updatedAt,
                                        )}
                                      </time>
                                    </div>
                                  </button>
                                  <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                      type="button"
                                      aria-label={`Rename ${t.title}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        beginRename(t);
                                      }}
                                      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted hover:bg-accent-soft/50 hover:text-foreground"
                                    >
                                      Rename
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`Delete ${t.title}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(t.id);
                                      }}
                                      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-danger hover:bg-danger/10"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))
                )}
              </nav>
            </aside>
          )}

          <section
            className={`relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
              mobileComposeChrome ? "" : "max-sm:hidden"
            }`}
          >
            <AssistantChatConversation
              messages={chat.messages}
              input={chat.input}
              setInput={chat.setInput}
              inputDraftRef={chat.inputDraftRef}
              chatInputRef={chat.chatInputRef}
              scrollRef={chat.scrollRef}
              messagesEndRef={chat.messagesEndRef}
              isAtBottomRef={chat.isAtBottomRef}
              busy={chat.busy}
              opening={chat.opening}
              error={chat.error}
              setError={chat.setError}
              onSend={() => void chat.send()}
            />
          </section>
        </div>
      </ChatPanelShell>
      <div
        className="journal-editor-pattern-gutter pointer-events-none min-h-0 min-w-0 flex-1"
        aria-hidden
      />
    </div>
  );
}
