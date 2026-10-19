"use client";

import { MessageSquare, X } from "lucide-react";
import { Link, usePathname } from "@/lib/spa-nav";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AssistantChatConversation } from "@/components/assistant-chat-conversation";
import { ChatPanelPatternTile } from "@/components/chat-panel-shell";
import { SelectChevron } from "@/components/select-chevron";
import { useMinWidth } from "@/hooks/use-min-width";
import {
  clearAssistantChatRemoteSessionCache,
  markAssistantChatStorePulledThisSession,
  pullAssistantChatStoreFromCloud,
  wasAssistantChatStorePulledThisSession,
} from "@/lib/assistant-chat-cloud";
import {
  ASSISTANT_CHAT_OPEN_CHANGED_EVENT,
  ASSISTANT_CHAT_OPEN_EVENT,
  ASSISTANT_CHAT_TOGGLE_EVENT,
  toggleAssistantChatPanel,
  type AssistantChatOpenDetail,
} from "@/lib/assistant-chat-launch";
import { clearLegacyAssistantChatKeys, assistantChatThreadActivityMs, loadAssistantChatStore, pickAssistantChatFabResumeThread } from "@/lib/assistant-chat-storage";
import {
  consumeCreateChatShownAtMs,
  isCreateMainChatVisible,
  subscribeCreateMainChatVisible,
} from "@/lib/assistant-chat-fab-visibility";
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

/** Header control. Opens the same panel as the life-area chat launch. */
export function AssistantChatHeaderButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onChange = (event: Event) => {
      setOpen(Boolean((event as CustomEvent<boolean>).detail));
    };
    window.addEventListener(ASSISTANT_CHAT_OPEN_CHANGED_EVENT, onChange);
    return () =>
      window.removeEventListener(ASSISTANT_CHAT_OPEN_CHANGED_EVENT, onChange);
  }, []);
  return (
    <button
      type="button"
      aria-label="Chat"
      title="Chat"
      aria-expanded={open}
      onClick={() => toggleAssistantChatPanel()}
      className="relative inline-flex h-9 w-9 max-md:h-8 max-md:w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-nav-muted transition-colors hover:bg-nav-active hover:text-nav-foreground"
    >
      <MessageSquare aria-hidden className="size-[18px]" strokeWidth={1.75} />
    </button>
  );
}

/**
 * Logged-in floating mini-chat.
 * Hidden only when full Chat (`/chat/my`) or Create’s chat pane is already on screen.
 */
export function AssistantChatFab() {
  const mdUp = useMinWidth(768);
  const pathname = usePathname() || "/";
  const [createChatVisible, setCreateChatVisible] = useState(
    isCreateMainChatVisible,
  );
  const hidden = hideFabOnPath(pathname, createChatVisible);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const pendingLaunchRef = useRef<AssistantChatOpenDetail | null>(null);
  const launchSeqRef = useRef(0);
  const [launchSeq, setLaunchSeq] = useState(0);

  useEffect(() => subscribeCreateMainChatVisible(() => {
    setCreateChatVisible(isCreateMainChatVisible());
  }), []);

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
    window.dispatchEvent(
      new CustomEvent(ASSISTANT_CHAT_OPEN_CHANGED_EVENT, { detail: open }),
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
      const seed = pending.seed;
      void chat.startLifeAreaIdeate(pending.lifeAreaId).then(() => {
        if (seed) chat.setInput(seed);
      });
      return;
    }
    const createChatShownAt = consumeCreateChatShownAtMs();
    const resume = pickAssistantChatFabResumeThread(loadAssistantChatStore());
    // After Create Meditation → Chat, don't reopen a pre-Create Consciously Chat.
    // A thread updated after that Create session (e.g. full Chat) may still resume.
    if (
      createChatShownAt > 0 &&
      (!resume ||
        assistantChatThreadActivityMs(resume) <= createChatShownAt)
    ) {
      void chat.createNewThread();
      return;
    }
    if (resume) {
      if (chat.activeId !== resume.id) {
        chat.selectThread(resume.id);
      } else {
        chat.scrollToBottom(true);
      }
    } else {
      void chat.createNewThread();
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

  useEffect(() => {
    const onToggle = () => toggleOpen();
    window.addEventListener(ASSISTANT_CHAT_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(ASSISTANT_CHAT_TOGGLE_EVENT, onToggle);
  }, [toggleOpen]);

  if (!enabled || hidden || !open || typeof document === "undefined") return null;

  const fullHref = chat.activeId
    ? `/chat/my/${encodeURIComponent(chat.activeId)}`
    : "/chat/my";

  return createPortal(
    <>
      {mdUp ? (
        <button
          type="button"
          aria-label="Close chat"
          className="fixed inset-x-0 bottom-0 top-[var(--app-header-h)] z-[125] cursor-pointer bg-black/40"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div
        role="dialog"
        aria-label="Chat"
        className={
          mdUp
            ? "fixed bottom-0 right-0 top-[var(--app-header-h)] z-[126] flex w-[420px] max-w-full flex-col border-l border-border bg-[color:var(--chat-panel-bg)] shadow-lg"
            : "fixed inset-0 z-[140] flex flex-col bg-[color:var(--chat-panel-bg)]"
        }
      >
        <ChatPanelPatternTile classic />
        <div className="relative z-[1] flex shrink-0 items-center gap-2 border-b border-border/60 bg-[color:var(--chat-panel-bg)]/90 px-3 py-2 backdrop-blur-[2px]">
          {mdUp ? null : (
            <button
              type="button"
              aria-label="Back"
              onClick={() => setOpen(false)}
              className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-foreground"
            >
              <SelectChevron className="rotate-90 text-foreground" />
            </button>
          )}
          <h2 className="font-display text-lg text-foreground">Chat</h2>
          <Link
            href={fullHref}
            className="ml-auto text-[13px] font-semibold text-accent-link"
            onClick={() => setOpen(false)}
          >
            Open full chat
          </Link>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-foreground"
          >
            <X className="size-5" />
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
    </>,
    document.body,
  );
}
