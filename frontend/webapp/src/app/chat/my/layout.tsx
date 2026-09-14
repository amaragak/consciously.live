"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { AssistantChatWorkspace } from "@/components/assistant-chat-workspace";

/**
 * Chat threads share one mounted workspace so route changes only swap the
 * active thread (no remount / re-open).
 */
export default function ChatMyLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="hidden" aria-hidden>
        {children}
      </div>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center text-sm text-muted">
              Loading chat…
            </div>
          }
        >
          <AssistantChatWorkspace />
        </Suspense>
      </div>
    </>
  );
}
