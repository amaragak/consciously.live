import { useEffect, useMemo, useRef, useState } from "react";
import {
  ASSISTANT_CHAT_CAPABILITIES,
  assistantCapabilitiesByDomain,
  isAssistantChatDevHost,
  type AssistantCapability,
  type AssistantCapabilityStatus,
  type AssistantCapabilityVerb,
} from "@/lib/assistant-chat-capabilities";

const DOMAIN_LABEL: Record<AssistantCapability["domain"], string> = {
  coach: "Companion",
  journal: "Journal",
  ideate: "Manifest",
  meditate: "Meditate",
  library: "Library",
  sounds: "Sounds",
  focus: "Focus",
  account: "Account",
  nav: "Navigation",
};

const DOMAIN_ORDER: AssistantCapability["domain"][] = [
  "coach",
  "journal",
  "ideate",
  "meditate",
  "library",
  "sounds",
  "focus",
  "nav",
  "account",
];

function verbTone(verb: AssistantCapabilityVerb): string {
  switch (verb) {
    case "get":
    case "list":
      return "bg-sky-500/15 text-sky-800 dark:text-sky-200";
    case "put":
    case "create":
    case "update":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
    case "delete":
      return "bg-rose-500/15 text-rose-800 dark:text-rose-200";
    case "run":
      return "bg-amber-500/15 text-amber-900 dark:text-amber-200";
    case "navigate":
      return "bg-violet-500/15 text-violet-800 dark:text-violet-200";
    default:
      return "bg-muted text-muted";
  }
}

function statusTone(status: AssistantCapabilityStatus): string {
  return status === "live"
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-muted";
}

/**
 * Dev-only floating control listing every assistant ACTION / planned capability.
 */
export function AssistantChatCapabilitiesFab() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisible(isAssistantChatDevHost());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      const el = panelRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const byDomain = useMemo(() => assistantCapabilitiesByDomain(), []);
  const liveCount = ASSISTANT_CHAT_CAPABILITIES.filter(
    (c) => c.status === "live",
  ).length;
  const plannedCount = ASSISTANT_CHAT_CAPABILITIES.length - liveCount;

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      className="pointer-events-none absolute inset-x-0 top-3 z-[80] flex justify-center px-3"
    >
      <div className="pointer-events-auto relative flex max-w-[min(100%,42rem)] flex-col items-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="inline-flex cursor-pointer items-center gap-1.5 border border-dashed border-[#c026d3] bg-[#fdf4ff] px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[#86198e] shadow-md transition-colors hover:bg-[#fae8ff] dark:border-[#e879f9] dark:bg-[#4a044e]/40 dark:text-[#f0abfc] dark:hover:bg-[#4a044e]/70"
          style={{ borderRadius: 0 }}
        >
          Chat functions
          <span className="font-normal normal-case tracking-normal opacity-80">
            {liveCount} live · {plannedCount} planned
          </span>
        </button>

        {open ? (
          <div
            role="dialog"
            aria-label="Assistant chat capabilities"
            className="mt-2 max-h-[min(70vh,32rem)] w-[min(100vw-1.5rem,40rem)] overflow-y-auto border border-dashed border-[#c026d3] bg-[#fdf4ff] shadow-xl dark:border-[#e879f9] dark:bg-[#2a0a2e]"
            style={{ borderRadius: 0 }}
          >
            <div className="sticky top-0 z-[1] border-b border-[#c026d3]/40 bg-[#fdf4ff] px-3 py-2 dark:border-[#e879f9]/40 dark:bg-[#2a0a2e]">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#86198e] dark:text-[#f0abfc]">
                Assistant capability catalog
              </p>
              <p className="mt-0.5 font-mono text-[10px] leading-snug text-[#86198e]/80 dark:text-[#f0abfc]/80">
                Live markers execute today. Planned = get / list / put surfaces
                for the control plane.
              </p>
            </div>
            <div className="space-y-4 px-3 py-3">
              {DOMAIN_ORDER.map((domain) => {
                const caps = byDomain.get(domain);
                if (!caps?.length) return null;
                return (
                  <section key={domain}>
                    <h3 className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#86198e] dark:text-[#f0abfc]">
                      {DOMAIN_LABEL[domain]}
                    </h3>
                    <ul className="space-y-1.5">
                      {caps.map((cap) => (
                        <li
                          key={cap.id}
                          className="border border-[#c026d3]/25 bg-white/70 px-2 py-1.5 dark:border-[#e879f9]/25 dark:bg-black/20"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide ${verbTone(
                                cap.verb,
                              )}`}
                            >
                              {cap.verb}
                            </span>
                            <code className="font-mono text-[11px] font-semibold text-foreground">
                              {cap.action}
                            </code>
                            <span
                              className={`ml-auto font-mono text-[9px] uppercase tracking-wide ${statusTone(
                                cap.status,
                              )}`}
                            >
                              {cap.status}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] leading-snug text-foreground/80">
                            {cap.summary}
                          </p>
                          {cap.params?.length ? (
                            <p className="mt-0.5 font-mono text-[9px] text-muted">
                              {cap.params.join(" · ")}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
