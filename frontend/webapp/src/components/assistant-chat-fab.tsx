"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantChatConversation } from "@/components/assistant-chat-conversation";
import {
  clearAssistantChatRemoteSessionCache,
  markAssistantChatStorePulledThisSession,
  pullAssistantChatStoreFromCloud,
  wasAssistantChatStorePulledThisSession,
} from "@/lib/assistant-chat-cloud";
import {
  ASSISTANT_CHAT_OPEN_EVENT,
  type AssistantChatOpenDetail,
} from "@/lib/assistant-chat-launch";
import { clearLegacyAssistantChatKeys, loadAssistantChatStore } from "@/lib/assistant-chat-storage";
import {
  isCreateMainChatVisible,
  subscribeCreateMainChatVisible,
} from "@/lib/assistant-chat-fab-visibility";
import {
  getChatFabFooterInset,
  subscribeChatFabFooterInset,
} from "@/lib/assistant-chat-fab-footer-inset";
import {
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import { useAssistantChatThread } from "@/lib/use-assistant-chat-thread";

/** Hide only when main content already hosts a chat UI. */
function hideFabOnPath(pathname: string, createChatVisible: boolean): boolean {
  if (pathname === "/chat/my" || pathname.startsWith("/chat/my/")) return true;
  const onCreate =
    pathname === "/meditate/create" ||
    pathname.startsWith("/meditate/create/") ||
    pathname === "/create" ||
    pathname.startsWith("/create/");
  if (onCreate && createChatVisible) return true;
  return false;
}

/** Matches Tailwind `bottom-5` / `sm:bottom-6`. */
function useFabBottomPaddingPx(): number {
  const [pad, setPad] = useState(20);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setPad(mq.matches ? 24 : 20);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return pad;
}

function IconChat({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconExpand({ className }: { className?: string }) {
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
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

/**
 * Logged-in floating mini-chat.
 * Hidden only when full Chat (`/chat/my`) or Create’s chat pane is already on screen.
 */
export function AssistantChatFab() {
  const pathname = usePathname() || "/";
  const [createChatVisible, setCreateChatVisible] = useState(
    isCreateMainChatVisible,
  );
  const [footerInset, setFooterInset] = useState(getChatFabFooterInset);
  const bottomPad = useFabBottomPaddingPx();
  const fabBottom = footerInset + bottomPad;
  const hidden = hideFabOnPath(pathname, createChatVisible);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const pendingLaunchRef = useRef<AssistantChatOpenDetail | null>(null);
  const launchSeqRef = useRef(0);
  const [launchSeq, setLaunchSeq] = useState(0);

  useEffect(() => subscribeCreateMainChatVisible(() => {
    setCreateChatVisible(isCreateMainChatVisible());
  }), []);

  useEffect(
    () =>
      subscribeChatFabFooterInset(() => {
        setFooterInset(getChatFabFooterInset());
      }),
    [],
  );

  useEffect(() => {
    clearLegacyAssistantChatKeys();
    const sync = () => {
      const signedIn =
        isMedimadeSessionActive() && Boolean(getMedimadeSessionJwt());
      setEnabled(signedIn);
      if (!signedIn) {
        clearAssistantChatRemoteSessionCache();
        setOpen(false);
        return;
      }
      if (!wasAssistantChatStorePulledThisSession()) {
        void pullAssistantChatStoreFromCloud()
          .catch(() => null)
          .finally(() => markAssistantChatStorePulledThisSession());
      }
    };
    sync();
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  // Re-check session when navigating between app pages (late JWT hydrate).
  useEffect(() => {
    const signedIn =
      isMedimadeSessionActive() && Boolean(getMedimadeSessionJwt());
    setEnabled(signedIn);
  }, [pathname]);

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<AssistantChatOpenDetail>).detail;
      pendingLaunchRef.current = detail ?? { kind: "default" };
      launchSeqRef.current += 1;
      setLaunchSeq(launchSeqRef.current);
      setOpen(true);
    };
    window.addEventListener(ASSISTANT_CHAT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ASSISTANT_CHAT_OPEN_EVENT, onOpen);
  }, []);

  const chat = useAssistantChatThread({
    threadId: null,
    autoOpen: false,
  });

  useEffect(() => {
    if (!open || hidden || !enabled || !chat.hydrated) return;
    const pending = pendingLaunchRef.current;
    pendingLaunchRef.current = null;
    if (pending?.kind === "life_area_ideate") {
      void chat.startLifeAreaIdeate(pending.lifeAreaId);
      return;
    }
    if (!chat.activeId) {
      const existing = loadAssistantChatStore().threads[0];
      if (existing) {
        chat.selectThread(existing.id);
      } else {
        void chat.createNewThread();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- launch-driven
  }, [open, hidden, enabled, chat.hydrated, launchSeq]);

  const toggleOpen = useCallback(() => {
    setOpen((v) => {
      if (!v) {
        pendingLaunchRef.current = { kind: "default" };
        launchSeqRef.current += 1;
        setLaunchSeq(launchSeqRef.current);
      }
      return !v;
    });
  }, []);

  if (!enabled || hidden) return null;

  const fullHref = chat.activeId
    ? `/chat/my/${encodeURIComponent(chat.activeId)}`
    : "/chat/my";

  return (
    <>
      {open ? (
        <div
          className="pointer-events-auto fixed left-1 right-1 z-[60] flex h-[min(560px,70vh)] flex-col overflow-hidden rounded-2xl border border-border bg-[color:var(--card-warm-bg)] shadow-lg sm:left-auto sm:right-6 sm:w-[min(calc(100vw-3rem),380px)]"
          style={{
            // Sit above the FAB (3.5rem) with a 0.75rem gap, plus any nav footer.
            bottom: fabBottom + 56 + 12,
          }}
          role="dialog"
          aria-label="Chat"
        >
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
          <div className="relative z-[1] flex shrink-0 items-center justify-end gap-1 border-b border-border/60 bg-[color:var(--card-warm-bg)]/80 px-2 py-1.5 backdrop-blur-[2px]">
            <Link
              href={fullHref}
              aria-label="Open full screen chat"
              title="Full screen"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <IconExpand />
            </Link>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground"
            >
              <IconClose />
            </button>
          </div>
          <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
              compact
            />
          </div>
        </div>
      ) : null}

      <div
        className="pointer-events-none fixed right-5 z-[60] sm:right-6"
        style={{ bottom: fabBottom }}
      >
        <button
          type="button"
          aria-label={open ? "Close chat" : "Open chat"}
          aria-expanded={open}
          onClick={toggleOpen}
          className="pointer-events-auto flex h-14 w-14 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent shadow-md transition-opacity hover:opacity-95"
        >
          {open ? <IconClose /> : <IconChat />}
        </button>
      </div>
    </>
  );
}
