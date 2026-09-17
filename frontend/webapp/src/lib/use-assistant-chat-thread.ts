"use client";

/**
 * Shared send / session-open logic for full Chat + floating mini-chat.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { streamAssistantChat, generateAssistantChatTitle } from "@/lib/assistant-chat-api";
import { executeAssistantActions } from "@/lib/assistant-chat-actions";
import { scheduleAssistantChatCloudPush } from "@/lib/assistant-chat-cloud";
import {
  ASSISTANT_LIFE_AREA_IDEATE_OPEN,
  buildLifeAreaIdeateSystemSupplement,
  lifeAreaIdeateThreadTitle,
} from "@/lib/assistant-chat-life-area";
import { parseAssistantDisplayText } from "@/lib/assistant-chat-protocol";
import {
  ASSISTANT_CHAT_STORE_CHANGED,
  deriveAssistantChatTitle,
  loadAssistantChatStore,
  newAssistantChatThread,
  pickAssistantChatFabResumeThread,
  saveAssistantChatStore,
  threadNeedsSessionOpen,
  upsertAssistantChatThread,
  type AssistantChatApiTurn,
  type AssistantChatThread,
  type AssistantChatThreadMode,
  type AssistantChatUiMessage,
} from "@/lib/assistant-chat-storage";
import { sanitizeAssistantChatTitle } from "@/lib/assistant-chat-title";

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

function openingCueForMode(mode: AssistantChatThreadMode | undefined): string | null {
  if (mode?.type === "life_area_ideate") return ASSISTANT_LIFE_AREA_IDEATE_OPEN;
  // Default chat: no LLM opening — empty chrome invites the first user message.
  return null;
}

export function useAssistantChatThread(opts: {
  threadId: string | null;
  /** When true, load `threadId` (full Chat). When false, FAB resume rules apply. */
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

  const scrollToBottom = useCallback((force = false) => {
    const run = () => {
      if (!force && !isAtBottomRef.current) return;
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
        isAtBottomRef.current = true;
        return;
      }
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      isAtBottomRef.current = true;
    };
    // Double rAF: scroll container may not have final height on first paint
    // (FAB panel open, thread switch, markdown layout).
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, []);

  const scrollToBottomIfPinned = useCallback(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  useLayoutEffect(() => {
    scrollToBottomIfPinned();
  }, [messages, busy, opening, scrollToBottomIfPinned]);

  // Opening a thread (or switching) should always land on the latest message.
  useLayoutEffect(() => {
    isAtBottomRef.current = true;
    scrollToBottom(true);
  }, [activeId, scrollToBottom]);

  const loadThreadById = useCallback((id: string | null) => {
    const store = loadAssistantChatStore();
    isAtBottomRef.current = true;
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
      const cue = openingCueForMode(thread.mode);
      if (!cue) return;

      const nonce = ++openNonceRef.current;
      setOpening(true);
      setError(null);

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
    let id: string | null | undefined;
    let thread: AssistantChatThread | undefined;

    if (!autoOpen) {
      // FAB: only resume a thread with recent activity (and not create-excluded).
      const resume = pickAssistantChatFabResumeThread(store);
      thread = resume ?? undefined;
      id = resume?.id;
    } else if (threadId) {
      id = threadId;
      thread = store.threads.find((t) => t.id === id);
    } else {
      // Full Chat at /chat/my with no id — workspace creates a fresh thread.
      // Do not resume the last active chat.
      setHydrated(true);
      loadThreadById(null);
      return;
    }

    if (!thread && autoOpen && threadId) {
      // Invalid id — hydrate empty; workspace redirects.
      setHydrated(true);
      loadThreadById(null);
      return;
    }

    if (!thread || !id) {
      setHydrated(true);
      loadThreadById(null);
      return;
    }

    loadThreadById(id);
    setHydrated(true);

    if (thread.mode?.type === "life_area_ideate" && threadNeedsSessionOpen(thread)) {
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
    setOpening(false);
    const thread = newAssistantChatThread();
    let store = upsertAssistantChatThread(loadAssistantChatStore(), thread);
    // Avoid stacking blank “New chat” rows from repeated /chat/my entries.
    store = {
      ...store,
      threads: store.threads.filter(
        (t) =>
          t.id === thread.id ||
          t.messages.length > 0 ||
          Boolean(t.mode) ||
          t.titleManual === true ||
          t.title.trim() !== "New chat",
      ),
    };
    saveAssistantChatStore(store);
    scheduleAssistantChatCloudPush(store);
    setActiveId(thread.id);
    setMessages([]);
    setApiThread([]);
    setTitle("New chat");
    setError(null);
    setInput("");
    threadMetaRef.current = { createdAt: thread.createdAt, mode: thread.mode };
    requestAnimationFrame(() => chatInputRef.current?.focus());
    return thread.id;
  }, []);

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
      if (
        thread?.mode?.type === "life_area_ideate" &&
        threadNeedsSessionOpen(thread)
      ) {
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
    const existingMid = loadAssistantChatStore().threads.find((t) => t.id === id);
    const titleManual = existingMid?.titleManual === true;
    const isFirstUserTurn = !priorMessages.some(
      (m) => m.role === "user" && m.text.trim(),
    );
    const midTitle = titleManual
      ? existingMid!.title
      : mode?.type === "life_area_ideate"
        ? lifeAreaIdeateThreadTitle(mode.lifeAreaId)
        : deriveAssistantChatTitle(messagesAfterUser) || "New chat";
    if (!titleManual) setTitle(midTitle);
    persistThread({
      id,
      createdAt: createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: midTitle,
      ...(titleManual ? { titleManual: true } : {}),
      ...(existingMid?.excludeFromFabResume
        ? { excludeFromFabResume: true }
        : {}),
      messages: messagesAfterUser,
      apiThread: history,
      ...(mode ? { mode } : {}),
    });

    // Claude-style: briefly summarise the first user message into a thread title.
    if (
      isFirstUserTurn &&
      !titleManual &&
      mode?.type !== "life_area_ideate"
    ) {
      const titleThreadId = id;
      const titleCreatedAt = createdAt ?? new Date().toISOString();
      const titleMode = mode;
      void (async () => {
        const smart = await generateAssistantChatTitle(trimmed);
        const cleaned = smart ? sanitizeAssistantChatTitle(smart) : "";
        if (!cleaned) return;
        const store = loadAssistantChatStore();
        const thread = store.threads.find((t) => t.id === titleThreadId);
        if (!thread || thread.titleManual) return;
        // Always prefer Haiku over provisional / derived titles.
        if (activeIdRef.current === titleThreadId) setTitle(cleaned);
        persistThread({
          ...thread,
          title: cleaned,
          updatedAt: new Date().toISOString(),
          createdAt: thread.createdAt || titleCreatedAt,
          ...(titleMode ? { mode: titleMode } : {}),
        });
      })();
    }

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
        const results = await executeAssistantActions(parsed.actions);
        actionResults = results.map((r) => ({
          label: r.label,
          detail: r.detail,
          href: r.href,
          linkLabel: r.linkLabel,
          ok: r.ok,
          ...(r.items?.length ? { items: r.items } : {}),
        }));
      } catch {
        actionResults = undefined;
      }

      const handedOffToCreate = parsed.actions.some(
        (a) =>
          a.name === "create_meditation" ||
          a.name === "navigate_create_by_type" ||
          a.name === "navigate_create_from_journal" ||
          a.name === "navigate_create_from_idea",
      );

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
      const excludeFromFabResume =
        existing?.excludeFromFabResume === true || handedOffToCreate;
      // Re-read title after actions — Haiku may have landed while we streamed.
      const latestTitle =
        loadAssistantChatStore().threads.find((t) => t.id === sendThreadId)
          ?.title ?? existing?.title;
      const nextTitle = manual
        ? (latestTitle ?? existing!.title)
        : latestTitle && latestTitle !== "New chat"
          ? latestTitle
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
        ...(excludeFromFabResume ? { excludeFromFabResume: true } : {}),
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
    scrollToBottom,
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
