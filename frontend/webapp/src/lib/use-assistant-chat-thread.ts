"use client";

/**
 * Shared send / session-open logic for full Chat + floating mini-chat.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { streamAssistantChat } from "@/lib/assistant-chat-api";
import { executeAssistantActions } from "@/lib/assistant-chat-actions";
import { scheduleAssistantChatCloudPush } from "@/lib/assistant-chat-cloud";
import {
  ASSISTANT_LIFE_AREA_IDEATE_OPEN,
  buildLifeAreaIdeateSystemSupplement,
  lifeAreaIdeateThreadTitle,
} from "@/lib/assistant-chat-life-area";
import { parseAssistantDisplayText } from "@/lib/assistant-chat-protocol";
import { ASSISTANT_SESSION_OPEN } from "@/lib/assistant-chat-system-prompt";
import {
  ASSISTANT_CHAT_STORE_CHANGED,
  deriveAssistantChatTitle,
  loadAssistantChatStore,
  newAssistantChatThread,
  saveAssistantChatStore,
  threadNeedsSessionOpen,
  upsertAssistantChatThread,
  type AssistantChatApiTurn,
  type AssistantChatThread,
  type AssistantChatThreadMode,
  type AssistantChatUiMessage,
} from "@/lib/assistant-chat-storage";

function persistThread(thread: AssistantChatThread): void {
  const store = upsertAssistantChatThread(loadAssistantChatStore(), thread);
  saveAssistantChatStore(store);
  scheduleAssistantChatCloudPush(store);
}

function resolveSystemSupplement(
  mode: AssistantChatThreadMode | undefined,
): string | undefined {
  if (mode?.type !== "life_area_ideate") return undefined;
  return buildLifeAreaIdeateSystemSupplement(mode.lifeAreaId) ?? undefined;
}

function openingCueForMode(mode: AssistantChatThreadMode | undefined): string {
  if (mode?.type === "life_area_ideate") return ASSISTANT_LIFE_AREA_IDEATE_OPEN;
  return ASSISTANT_SESSION_OPEN;
}

export function useAssistantChatThread(opts: {
  threadId: string | null;
  /** When true, create a thread if none and run SESSION_OPEN when needed. */
  autoOpen: boolean;
}) {
  const { threadId, autoOpen } = opts;

  const [activeId, setActiveId] = useState<string | null>(threadId);
  const [messages, setMessages] = useState<AssistantChatUiMessage[]>([]);
  const [apiThread, setApiThread] = useState<AssistantChatApiTurn[]>([]);
  const [title, setTitle] = useState("New chat");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const inputDraftRef = useRef("");
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const busyRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const openNonceRef = useRef(0);
  const threadMetaRef = useRef<{
    createdAt: string;
    mode?: AssistantChatThreadMode;
  } | null>(null);
  const activeIdRef = useRef<string | null>(threadId);

  useEffect(() => {
    inputDraftRef.current = input;
  }, [input]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const scrollToBottomIfPinned = useCallback(() => {
    if (!isAtBottomRef.current) return;
    requestAnimationFrame(() => {
      if (!isAtBottomRef.current) return;
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });
  }, []);

  useLayoutEffect(() => {
    scrollToBottomIfPinned();
  }, [messages, busy, opening, scrollToBottomIfPinned]);

  const loadThreadById = useCallback((id: string | null) => {
    const store = loadAssistantChatStore();
    if (!id) {
      setActiveId(null);
      setMessages([]);
      setApiThread([]);
      setTitle("New chat");
      threadMetaRef.current = null;
      return null;
    }
    const thread = store.threads.find((t) => t.id === id) ?? null;
    if (!thread) {
      setActiveId(null);
      setMessages([]);
      setApiThread([]);
      setTitle("New chat");
      threadMetaRef.current = null;
      return null;
    }
    setActiveId(thread.id);
    setMessages(thread.messages);
    setApiThread(thread.apiThread);
    setTitle(thread.title);
    threadMetaRef.current = {
      createdAt: thread.createdAt,
      mode: thread.mode,
    };
    return thread;
  }, []);

  const runSessionOpen = useCallback(
    async (thread: AssistantChatThread) => {
      const nonce = ++openNonceRef.current;
      setOpening(true);
      setError(null);

      const cue = openingCueForMode(thread.mode);
      const history: AssistantChatApiTurn[] = [
        { role: "user", content: cue },
      ];
      const systemSupplement = resolveSystemSupplement(thread.mode);

      let assistantStarted = false;
      let acc = "";

      try {
        const raw = await streamAssistantChat(
          {
            messages: history,
            ...(systemSupplement ? { systemSupplement } : {}),
          },
          (chunk) => {
            if (nonce !== openNonceRef.current) return;
            if (activeIdRef.current !== thread.id) return;
            acc += chunk;
            const { text } = parseAssistantDisplayText(acc);
            if (!assistantStarted) {
              assistantStarted = true;
              setMessages([{ role: "assistant", text }]);
            } else {
              setMessages([{ role: "assistant", text }]);
            }
            scrollToBottomIfPinned();
          },
        );

        if (nonce !== openNonceRef.current) return;
        if (activeIdRef.current !== thread.id) return;

        const parsed = parseAssistantDisplayText(raw);
        const nextApi: AssistantChatApiTurn[] = [
          { role: "user", content: cue },
          { role: "assistant", content: raw },
        ];
        const nextMessages: AssistantChatUiMessage[] = [
          { role: "assistant", text: parsed.text },
        ];
        setApiThread(nextApi);
        setMessages(nextMessages);

        const saved: AssistantChatThread = {
          ...thread,
          updatedAt: new Date().toISOString(),
          messages: nextMessages,
          apiThread: nextApi,
        };
        persistThread(saved);
      } catch (e) {
        if (nonce !== openNonceRef.current) return;
        if (activeIdRef.current !== thread.id) return;
        const msg = e instanceof Error ? e.message : "Could not open chat";
        setError(msg);
      } finally {
        if (nonce === openNonceRef.current) {
          setOpening(false);
          requestAnimationFrame(() => chatInputRef.current?.focus());
        }
      }
    },
    [scrollToBottomIfPinned],
  );

  const ensureThreadAndMaybeOpen = useCallback(async () => {
    let store = loadAssistantChatStore();
    let id = threadId ?? store.activeThreadId;
    let thread = id ? store.threads.find((t) => t.id === id) : undefined;

    // FAB (autoOpen false): resume most recent thread instead of starting empty.
    if (!thread && !autoOpen && store.threads[0]) {
      thread = store.threads[0];
      id = thread.id;
    }

    if (!thread && autoOpen) {
      thread = newAssistantChatThread();
      store = upsertAssistantChatThread(store, thread);
      saveAssistantChatStore(store);
      scheduleAssistantChatCloudPush();
      id = thread.id;
    }

    if (!thread || !id) {
      setHydrated(true);
      loadThreadById(null);
      return;
    }

    loadThreadById(id);
    setHydrated(true);

    if (autoOpen && threadNeedsSessionOpen(thread)) {
      await runSessionOpen(thread);
    }
  }, [threadId, autoOpen, loadThreadById, runSessionOpen]);

  useEffect(() => {
    void ensureThreadAndMaybeOpen();
  }, [ensureThreadAndMaybeOpen]);

  useEffect(() => {
    const onStore = () => {
      const id = activeIdRef.current;
      if (!id || busyRef.current || opening) return;
      const store = loadAssistantChatStore();
      const thread = store.threads.find((t) => t.id === id);
      if (!thread) return;
      // Don't clobber in-flight local edits while typing; only sync if idle.
      if (inputDraftRef.current.trim()) return;
      setMessages(thread.messages);
      setApiThread(thread.apiThread);
      setTitle(thread.title);
    };
    window.addEventListener(ASSISTANT_CHAT_STORE_CHANGED, onStore);
    return () => window.removeEventListener(ASSISTANT_CHAT_STORE_CHANGED, onStore);
  }, [opening]);

  const createNewThread = useCallback(async () => {
    if (busyRef.current) return null;
    openNonceRef.current += 1;
    const thread = newAssistantChatThread();
    const store = upsertAssistantChatThread(loadAssistantChatStore(), thread);
    saveAssistantChatStore(store);
    scheduleAssistantChatCloudPush(store);
    setActiveId(thread.id);
    setMessages([]);
    setApiThread([]);
    setTitle("New chat");
    setError(null);
    setInput("");
    threadMetaRef.current = { createdAt: thread.createdAt, mode: thread.mode };
    await runSessionOpen(thread);
    return thread.id;
  }, [runSessionOpen]);

  const startLifeAreaIdeate = useCallback(
    async (lifeAreaId: string) => {
      if (busyRef.current) return null;
      openNonceRef.current += 1;
      const mode: AssistantChatThreadMode = {
        type: "life_area_ideate",
        lifeAreaId,
      };
      const thread = newAssistantChatThread(new Date(), {
        title: lifeAreaIdeateThreadTitle(lifeAreaId),
        mode,
      });
      const store = upsertAssistantChatThread(loadAssistantChatStore(), thread);
      saveAssistantChatStore(store);
      scheduleAssistantChatCloudPush(store);
      setActiveId(thread.id);
      setMessages([]);
      setApiThread([]);
      setTitle(thread.title);
      setError(null);
      setInput("");
      threadMetaRef.current = { createdAt: thread.createdAt, mode };
      await runSessionOpen(thread);
      return thread.id;
    },
    [runSessionOpen],
  );

  const selectThread = useCallback(
    (id: string) => {
      if (busyRef.current) return;
      openNonceRef.current += 1;
      setOpening(false);
      setBusy(false);
      busyRef.current = false;
      setError(null);
      setInput("");
      const thread = loadThreadById(id);
      if (thread && threadNeedsSessionOpen(thread)) {
        void runSessionOpen(thread);
      }
      const store = loadAssistantChatStore();
      saveAssistantChatStore({ ...store, activeThreadId: id });
      scheduleAssistantChatCloudPush({ ...store, activeThreadId: id });
    },
    [loadThreadById, runSessionOpen],
  );

  const send = useCallback(async () => {
    const trimmed = (inputDraftRef.current || input).trim();
    if (!trimmed || busyRef.current || opening) return;

    let id = activeIdRef.current;
    let createdAt = threadMetaRef.current?.createdAt;
    let mode = threadMetaRef.current?.mode;
    let priorMessages: AssistantChatUiMessage[] = messages;
    let priorApi: AssistantChatApiTurn[] = apiThread;

    if (!id) {
      const thread = newAssistantChatThread();
      const store = upsertAssistantChatThread(loadAssistantChatStore(), thread);
      saveAssistantChatStore(store);
      scheduleAssistantChatCloudPush();
      id = thread.id;
      createdAt = thread.createdAt;
      mode = thread.mode;
      priorMessages = [];
      priorApi = [];
      setActiveId(id);
      threadMetaRef.current = { createdAt, mode };
      setApiThread([]);
      setMessages([]);
    } else {
      // Prefer persisted thread as source of truth (avoids stale React state).
      const existing = loadAssistantChatStore().threads.find((t) => t.id === id);
      if (existing) {
        priorMessages = existing.messages;
        priorApi = existing.apiThread;
        createdAt = existing.createdAt;
        mode = existing.mode ?? mode;
        threadMetaRef.current = {
          createdAt: existing.createdAt,
          mode: existing.mode,
        };
      }
    }

    if (!mode) {
      const existing = loadAssistantChatStore().threads.find((t) => t.id === id);
      mode = existing?.mode;
      if (existing) {
        threadMetaRef.current = {
          createdAt: existing.createdAt,
          mode: existing.mode,
        };
        createdAt = existing.createdAt;
      }
    }

    busyRef.current = true;
    setBusy(true);
    setError(null);
    setInput("");
    inputDraftRef.current = "";

    const history: AssistantChatApiTurn[] = [
      ...priorApi,
      { role: "user", content: trimmed },
    ];

    const userMsg: AssistantChatUiMessage = { role: "user", text: trimmed };
    const messagesAfterUser = [...priorMessages, userMsg];
    setMessages(messagesAfterUser);
    setApiThread(history);

    // Persist immediately so a refresh / navigation cannot lose the turn.
    const titleManual =
      loadAssistantChatStore().threads.find((t) => t.id === id)?.titleManual ===
      true;
    const midTitle = titleManual
      ? loadAssistantChatStore().threads.find((t) => t.id === id)!.title
      : deriveAssistantChatTitle(messagesAfterUser) ||
        (mode?.type === "life_area_ideate"
          ? lifeAreaIdeateThreadTitle(mode.lifeAreaId)
          : "New chat");
    if (!titleManual) setTitle(midTitle);
    persistThread({
      id,
      createdAt: createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: midTitle,
      ...(titleManual ? { titleManual: true } : {}),
      messages: messagesAfterUser,
      apiThread: history,
      ...(mode ? { mode } : {}),
    });

    let assistantStarted = false;
    let acc = "";
    const systemSupplement = resolveSystemSupplement(mode);
    const sendThreadId = id;

    try {
      const raw = await streamAssistantChat(
        {
          messages: history,
          ...(systemSupplement ? { systemSupplement } : {}),
        },
        (chunk) => {
          if (activeIdRef.current !== sendThreadId) return;
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
        },
      );

      const parsed = parseAssistantDisplayText(raw);
      let actionResults: AssistantChatUiMessage["actionResults"];
      try {
        const results = executeAssistantActions(parsed.actions);
        actionResults = results.map((r) => ({
          label: r.label,
          detail: r.detail,
          href: r.href,
          linkLabel: r.linkLabel,
          ok: r.ok,
        }));
      } catch {
        actionResults = undefined;
      }

      const nextApi: AssistantChatApiTurn[] = [
        ...history,
        { role: "assistant", content: raw },
      ];
      const nextMessages: AssistantChatUiMessage[] = [
        ...messagesAfterUser,
        {
          role: "assistant",
          text: parsed.text,
          ...(actionResults?.length ? { actionResults } : {}),
        },
      ];

      if (activeIdRef.current === sendThreadId) {
        setMessages(nextMessages);
        setApiThread(nextApi);
      }

      const existing = loadAssistantChatStore().threads.find(
        (t) => t.id === sendThreadId,
      );
      const manual = existing?.titleManual === true;
      const nextTitle = manual
        ? existing!.title
        : deriveAssistantChatTitle(nextMessages) ||
          (mode?.type === "life_area_ideate"
            ? lifeAreaIdeateThreadTitle(mode.lifeAreaId)
            : "New chat");
      if (activeIdRef.current === sendThreadId) setTitle(nextTitle);

      // Always persist for this send's thread — even if UI moved to another chat.
      persistThread({
        id: sendThreadId,
        createdAt: createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: nextTitle,
        ...(manual ? { titleManual: true } : {}),
        messages: nextMessages,
        apiThread: nextApi,
        ...(mode ? { mode } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not reach assistant";
      if (activeIdRef.current === sendThreadId) {
        setError(msg);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: `Sorry — ${msg}` },
        ]);
      }
      // Keep the user turn that was already persisted.
    } finally {
      busyRef.current = false;
      setBusy(false);
      requestAnimationFrame(() => chatInputRef.current?.focus());
    }
  }, [input, messages, apiThread, opening, scrollToBottomIfPinned]);

  return {
    hydrated,
    activeId,
    title,
    messages,
    input,
    setInput,
    inputDraftRef,
    chatInputRef,
    messagesEndRef,
    isAtBottomRef,
    scrollRef,
    busy,
    opening,
    error,
    setError,
    send,
    createNewThread,
    startLifeAreaIdeate,
    selectThread,
    loadThreadById,
  };
}
