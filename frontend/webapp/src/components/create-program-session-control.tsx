/**
 * Shared program session control — Shape Format · Program card + length-chip popover.
 */

import { SessionLengthPill } from "@/components/meditation-length-select";
import {
  MEDITATION_TARGET_MINUTES,
  type MeditationTargetMinutes,
} from "@/lib/medimade-api";
import type { MeditationLengthMinutes } from "@/lib/create-one-flow-state";

export type CreateProgramSessionControlProps = {
  mode: "one" | "perSession";
  onModeChange: (mode: "one" | "perSession") => void;
  /** All sessions in the program (id → title), display order. */
  sessions: Array<{ id: string; title: string }>;
  selectedIds: string[];
  onToggleSession: (id: string) => void;
  onSelectAll: (all: boolean) => void;
  selectedMinutesSum: number;
  sessionDefaultMinutes: (id: string) => MeditationLengthMinutes;
  sessionEffectiveMinutes: (id: string) => MeditationLengthMinutes;
  onSessionLengthChange: (id: string, mins: MeditationLengthMinutes) => void;
  onSessionLengthReset: (id: string) => void;
  /** One-meditation length (state.lengthMinutes). */
  oneMeditationMinutes: MeditationLengthMinutes;
  onOneMeditationMinutesChange: (mins: MeditationLengthMinutes) => void;
  /** Optional class on the scrollable session list (e.g. max-height on Shape card). */
  sessionListClassName?: string;
};

export function CreateProgramSessionControl({
  mode,
  onModeChange,
  sessions,
  selectedIds,
  onToggleSession,
  onSelectAll,
  selectedMinutesSum,
  sessionDefaultMinutes,
  sessionEffectiveMinutes,
  onSessionLengthChange,
  onSessionLengthReset,
  oneMeditationMinutes,
  onOneMeditationMinutesChange,
  sessionListClassName,
}: CreateProgramSessionControlProps) {
  const selectedCount = selectedIds.length;
  const totalCount = sessions.length;
  const selectedSet = new Set(selectedIds);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center rounded-[10px] border border-border/70 bg-accent-soft/25 p-[3px]">
        {(
          [
            ["one", "One meditation"],
            ["perSession", "One per session"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onModeChange(id)}
            className={`flex-1 cursor-pointer rounded-lg px-2 py-1.5 text-[12px] ${
              mode === id
                ? "header-gold-sunlit-fill font-semibold text-on-accent"
                : "border border-transparent text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "perSession" ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] text-muted">
              Sessions · {selectedCount} of {totalCount}
              {" · "}
              <span className="font-semibold text-foreground">
                ≈ {selectedMinutesSum} min
              </span>
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                className="cursor-pointer text-[12px] font-semibold text-accent-link"
                onClick={() => onSelectAll(true)}
              >
                All
              </button>
              <button
                type="button"
                className="cursor-pointer text-[12px] font-semibold text-muted"
                onClick={() => onSelectAll(false)}
              >
                None
              </button>
            </div>
          </div>
          <div className={`flex flex-col gap-2 ${sessionListClassName ?? ""}`}>
            {sessions.map(({ id, title }, i) => {
              const checked = selectedSet.has(id);
              const defaultMins = sessionDefaultMinutes(id);
              const effectiveMins = sessionEffectiveMinutes(id);
              return (
                <div key={id} className="flex items-center gap-2">
                  <label
                    className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[13px] ${
                      checked ? "text-foreground" : "text-muted"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleSession(id)}
                      className="h-[18px] w-[18px] shrink-0 rounded-[5px] accent-[var(--color-accent)]"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {i + 1}. {title}
                    </span>
                  </label>
                  {checked ? (
                    <SessionLengthPill
                      value={effectiveMins as MeditationTargetMinutes}
                      defaultMinutes={defaultMins as MeditationTargetMinutes}
                      onChange={(mins) => onSessionLengthChange(id, mins)}
                      onReset={() => onSessionLengthReset(id)}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <p className="text-[12px] text-muted">
            All {totalCount} sessions&apos; material in a single meditation
          </p>
          <div className="flex flex-col gap-0.5">
            {MEDITATION_TARGET_MINUTES.map((mins) => {
              const selected = mins === oneMeditationMinutes;
              return (
                <button
                  key={mins}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onOneMeditationMinutesChange(mins)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px] ${
                    selected
                      ? "bg-accent-soft font-semibold text-foreground"
                      : "text-foreground hover:bg-background"
                  }`}
                >
                  {mins} min
                  {selected ? (
                    <span className="text-accent-link" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
