"use client";

import { useEffect } from "react";
import { ChatMarkdown } from "@/components/chat-markdown";
import {
  creationPathDisplayLabel,
  parseMeditationCreationProvenance,
  type MeditationCreationProvenance,
} from "@/lib/meditation-creation-provenance";
import { intakeQuestionsForStyle } from "@/lib/meditation-style-intake";

type Props = {
  open: boolean;
  title: string;
  provenance: MeditationCreationProvenance | null | undefined;
  meditationStyleFallback?: string | null;
  onClose: () => void;
};

export function LibraryHowMadeModal({
  open,
  title,
  provenance: rawProvenance,
  meditationStyleFallback,
  onClose,
}: Props) {
  const provenance =
    parseMeditationCreationProvenance(rawProvenance) ??
    (rawProvenance && typeof rawProvenance === "object"
      ? (rawProvenance as MeditationCreationProvenance)
      : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pathLabel = provenance
    ? creationPathDisplayLabel(provenance.creationPath)
    : null;
  const styleLabel =
    provenance?.meditationStyle?.trim() ||
    meditationStyleFallback?.trim() ||
    null;

  const questions =
    provenance?.creationPath === "style" && styleLabel
      ? intakeQuestionsForStyle(styleLabel)
      : null;
  const answers = provenance?.styleQuestionAnswers ?? [];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-made-title"
        className="flex max-h-[min(88vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              How this was made
            </p>
            <h2
              id="how-made-title"
              className="mt-1 font-display text-xl font-normal tracking-tight text-foreground"
            >
              {title.trim() || "Meditation"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!provenance ? (
            <p className="text-sm text-muted">
              Creation details weren’t saved for this meditation
              {styleLabel ? (
                <>
                  . Style on file:{" "}
                  <span className="font-medium text-foreground">{styleLabel}</span>
                  .
                </>
              ) : (
                "."
              )}{" "}
              Newer creations keep the path and inputs used to make them.
            </p>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Path
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {pathLabel}
                  {styleLabel && provenance.creationPath === "style"
                    ? ` · ${styleLabel}`
                    : ""}
                </p>
              </div>

              {provenance.creationPath === "style" && questions ? (
                <div className="space-y-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Type & answers
                  </p>
                  {styleLabel ? (
                    <p className="text-sm text-foreground">
                      <span className="text-muted">Meditation type: </span>
                      {styleLabel}
                    </p>
                  ) : null}
                  {questions.map((q, i) => {
                    const a = answers[i]?.trim() ?? "";
                    return (
                      <div key={`q-${i}`}>
                        <p className="text-sm font-medium text-foreground">{q}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                          {a || "—"}
                        </p>
                      </div>
                    );
                  })}
                  {answers[3]?.trim() ? (
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Anything else?
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                        {answers[3].trim()}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {provenance.creationPath === "randomScript" ? (
                <p className="text-sm text-muted">
                  Generated from the Random Script path
                  {styleLabel ? (
                    <>
                      {" "}
                      (type:{" "}
                      <span className="font-medium text-foreground">
                        {styleLabel}
                      </span>
                      )
                    </>
                  ) : null}
                  .
                </p>
              ) : null}

              {provenance.creationPath === "freeflow" &&
              provenance.messages &&
              provenance.messages.length > 0 ? (
                <div>
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Chat
                  </p>
                  <ul className="space-y-3">
                    {provenance.messages.map((m, i) => (
                      <li
                        key={`m-${i}`}
                        className={`rounded-xl border border-border px-3 py-2.5 text-sm ${
                          m.role === "user"
                            ? "bg-background"
                            : "bg-accent-soft/20"
                        }`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                          {m.role === "user" ? "You" : "Guide"}
                        </p>
                        <div className="mt-1 text-foreground">
                          {m.role === "assistant" ? (
                            <ChatMarkdown text={m.text} />
                          ) : (
                            <p className="whitespace-pre-wrap">{m.text}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {provenance.creationPath === "freeflow" &&
              !provenance.messages?.length ? (
                <p className="text-sm text-muted">
                  No chat turns were stored for this creation.
                </p>
              ) : null}

              {provenance.creationPath === "journalReflect" ? (
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Journal entry
                  </p>
                  {provenance.journalEntries?.length ? (
                    provenance.journalEntries.map((s) => (
                      <div
                        key={s.entryId || s.title}
                        className="rounded-xl border border-border bg-background px-3 py-2.5"
                      >
                        <p className="text-sm font-semibold text-foreground">
                          {s.title || "Journal entry"}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                          {s.bodyPlain}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted">
                      No journal entry was stored for this creation.
                    </p>
                  )}
                  {provenance.journalGuidance?.trim() ? (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Guidance
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                        {provenance.journalGuidance.trim()}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {provenance.creationPath === "goal" ? (
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Manifest
                  </p>
                  {provenance.manifest ? (
                    <>
                      <p className="text-sm text-foreground">
                        <span className="text-muted">Life area: </span>
                        {provenance.manifest.lifeAreaTitle}
                      </p>
                      {provenance.manifest.focusGoalTitle ? (
                        <p className="text-sm text-foreground">
                          <span className="text-muted">Goal: </span>
                          {provenance.manifest.focusGoalTitle}
                        </p>
                      ) : (
                        <p className="text-sm text-muted">
                          Whole life area (no specific goal)
                        </p>
                      )}
                      {provenance.manifest.dreamText?.trim() ? (
                        <div>
                          <p className="text-xs font-medium text-muted">Dream</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                            {provenance.manifest.dreamText}
                          </p>
                        </div>
                      ) : null}
                      {provenance.manifest.obstacleText?.trim() ? (
                        <div>
                          <p className="text-xs font-medium text-muted">
                            What’s in the way
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                            {provenance.manifest.obstacleText}
                          </p>
                        </div>
                      ) : null}
                      {provenance.manifest.visionText?.trim() ? (
                        <div>
                          <p className="text-xs font-medium text-muted">Vision</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                            {provenance.manifest.visionText}
                          </p>
                        </div>
                      ) : null}
                      {provenance.manifest.focusGoalDetail?.trim() ? (
                        <div>
                          <p className="text-xs font-medium text-muted">
                            Goal detail
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                            {provenance.manifest.focusGoalDetail}
                          </p>
                        </div>
                      ) : null}
                      {provenance.manifest.guidance?.trim() ? (
                        <div>
                          <p className="text-xs font-medium text-muted">
                            Guidance
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                            {provenance.manifest.guidance}
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-muted">
                      No Manifest selection was stored for this creation.
                    </p>
                  )}
                </div>
              ) : null}

              {provenance.creationPath === "oneShot" ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Prompt
                  </p>
                  {provenance.directPrompt?.trim() ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                      {provenance.directPrompt.trim()}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted">
                      No prompt was stored for this creation.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
