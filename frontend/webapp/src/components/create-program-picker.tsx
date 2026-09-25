"use client";

import type { LibraryProgram } from "@/lib/medimade-api";
import { SURFACE_CARD_CLASS } from "@/components/surface-card";

export function CreateProgramPicker({
  programs,
  listReady,
  selectedId,
  onSelect,
}: {
  programs: LibraryProgram[];
  listReady: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!listReady) {
    return (
      <p className="py-8 text-center text-sm text-muted">Loading programs…</p>
    );
  }
  if (programs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No programs available yet.
      </p>
    );
  }
  return (
    <ul className="grid w-full list-none grid-cols-1 gap-4 p-0 pb-2 sm:grid-cols-2 lg:grid-cols-3">
      {programs.map((program) => {
        const selected = selectedId === program.id;
        const lessonCount = program.days.length;
        return (
          <li key={program.id} className="min-w-0">
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(program.id)}
              className={`flex w-full cursor-pointer flex-col text-left transition-colors ${SURFACE_CARD_CLASS} ${
                selected
                  ? "border-accent bg-accent-soft/30"
                  : "hover:border-accent/40 hover:bg-accent-soft/15"
              }`}
            >
              <div
                className="h-44 w-full shrink-0 overflow-hidden rounded-t-[11px] bg-background sm:h-48"
                aria-hidden
              >
                {program.coverImageUrl ? (
                  <img
                    src={program.coverImageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted/40">
                    <svg
                      viewBox="0 0 48 48"
                      className="h-14 w-14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <rect x="8" y="10" width="32" height="28" rx="3" />
                      <path d="M16 20h16M16 26h12" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="min-w-0 px-3.5 py-3 sm:px-4 sm:py-3.5">
                <p className="font-display text-[16px] font-normal leading-snug text-foreground sm:text-[17px]">
                  {program.title.trim() || "Untitled program"}
                </p>
                {program.description.trim() ? (
                  <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted sm:text-[14px]">
                    {program.description}
                  </p>
                ) : null}
                <p className="mt-1.5 text-[12px] text-muted">
                  {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}
                </p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
