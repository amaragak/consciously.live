import { Suspense } from "react";
import { AssistantChatWorkspace } from "@/components/assistant-chat-workspace";

/**
 * Chat threads share one mounted workspace so route changes only swap the
 * active thread (no remount / re-open). Nested `/chat/my/*` routes all render
 * this same shell; pathname parsing inside AssistantChatWorkspace drives
 * thread selection.
 */
export function ChatPage() {
  return (
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
  );
}
