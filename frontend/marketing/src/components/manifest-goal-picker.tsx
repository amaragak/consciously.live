"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { SearchInput } from "@/components/search-input";
import {
  sortByAlgoliaOrder,
  useUserContentSearchIds,
} from "@/lib/use-user-content-search";

export type ManifestGoalPickerGoal = {
  id: string;
  title: string;
  /** Short preview under the goal title (optional). */
  preview: string;
  done: boolean;
};

export type ManifestLifeAreaPickerItem = {
  id: string;
  title: string;
  createdAt: string;
  dreamText: string;
  obstacleText: string;
  visionText: string;
  /** Collapsed-row preview. */
  preview: string;
  goals: ManifestGoalPickerGoal[];
};

type SortOrder = "newest" | "oldest";

type Props = {
  lifeAreas: ManifestLifeAreaPickerItem[];
  listReady: boolean;
  selectedLifeAreaId: string | null;
  /** Optional goal under the selected life area — increases specificity. */
  selectedGoalId: string | null;
  onSelectLifeArea: (id: string) => void;
  onSelectGoal: (lifeAreaId: string, goalId: string) => void;
  guidance: string;
  onGuidanceChange: (value: string) => void;
};

function IconCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12.5l4.2 4.2L19 7.5" />
    </svg>
  );
}

function dateParts(iso: string): { month: string; day: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { month: "—", day: "" };
  return {
    month: d.toLocaleString("en-US", { month: "short" }).toUpperCase(),
    day: String(d.getDate()),
  };
}

function SelectCheck({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-md ${
          selected
            ? "bg-selected text-on-selected"
            : "border-[1.5px] border-border bg-transparent text-transparent"
        }`}
      >
        <IconCheck />
      </span>
    </button>
  );
}

export function ManifestGoalPicker({
  lifeAreas,
  listReady,
  selectedLifeAreaId,
  selectedGoalId,
  onSelectLifeArea,
  onSelectGoal,
  guidance,
  onGuidanceChange,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const {
    ids: algoliaIds,
    orderedIds: algoliaOrderedIds,
  } = useUserContentSearchIds(searchQuery, "life_area,goal");

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const next = lifeAreas.filter((area) => {
      if (!q) return true;
      if (algoliaIds) {
        if (algoliaIds.has(area.id)) return true;
        return area.goals.some((g) => algoliaIds.has(g.id));
      }
      const hay = [
        area.title,
        area.preview,
        area.dreamText,
        area.obstacleText,
        area.visionText,
        ...area.goals.map((g) => `${g.title} ${g.preview}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    if (algoliaOrderedIds?.length) {
      return sortByAlgoliaOrder(next, algoliaOrderedIds, (a) => a.id);
    }
    next.sort((a, b) => {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      return sortOrder === "oldest" ? da - db : db - da;
    });
    return next;
  }, [lifeAreas, searchQuery, sortOrder, algoliaIds, algoliaOrderedIds]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="manifest-goal-sort">
          Sort order
        </label>
        <select
          id="manifest-goal-sort"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          className="cursor-pointer rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
        <SearchInput
          className="ml-auto w-full sm:w-60"
          inputClassName="py-2"
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search life areas & goals"
          aria-label="Search life areas and goals"
        />
      </div>

      <ul className="space-y-2">
        {!listReady ? (
          <li className="text-sm text-muted">Loading life areas…</li>
        ) : filtered.length === 0 ? (
          <li className="text-sm leading-relaxed text-muted">
            {searchQuery.trim() ? (
              "No life areas match."
            ) : (
              <>
                Add a life area in{" "}
                <Link
                  href="/manifest/my"
                  className="font-semibold text-accent-link underline-offset-2 hover:underline"
                >
                  Manifest
                </Link>{" "}
                to use this flow.
              </>
            )}
          </li>
        ) : (
          filtered.map((area) => {
            const title = area.title.trim() || "Untitled life area";
            const lifeSelected = selectedLifeAreaId === area.id;
            const expanded = expandedIds.has(area.id);
            const { month, day } = dateParts(area.createdAt);
            const openGoals = area.goals.filter((g) => !g.done).length;
            return (
              <li key={area.id}>
                <div
                  className={`overflow-hidden rounded-xl bg-card ${
                    lifeSelected
                      ? "border-2 border-[#F0A855]"
                      : "border border-border"
                  }`}
                >
                  <div className="flex items-center gap-1 px-2 py-2 sm:gap-3 sm:px-3 sm:py-2.5">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-1 py-0.5 text-left"
                      onClick={() => toggleExpand(area.id)}
                      aria-expanded={expanded}
                    >
                      <span
                        className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg ${
                          lifeSelected ? "bg-[#FBF6EA]" : "bg-[#F3F1EA]"
                        }`}
                        aria-hidden
                      >
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted">
                          {month}
                        </span>
                        <span className="text-sm font-bold leading-none text-foreground">
                          {day}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold text-foreground">
                          {title}
                        </span>
                        <span className="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-sm text-muted">
                          {area.goals.length
                            ? `${openGoals || area.goals.length} goal${
                                (openGoals || area.goals.length) === 1 ? "" : "s"
                              }`
                            : "No goals yet"}
                          {area.preview ? ` · ${area.preview}` : ""}
                        </span>
                      </span>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center text-muted sm:h-auto sm:w-auto">
                        {expanded ? (
                          <IconChevronUp size={18} aria-hidden />
                        ) : (
                          <IconChevronDown size={18} aria-hidden />
                        )}
                      </span>
                    </button>
                    <SelectCheck
                      selected={lifeSelected && !selectedGoalId}
                      label={
                        lifeSelected && !selectedGoalId
                          ? "Deselect this life area"
                          : "Select this life area for a general meditation"
                      }
                      onClick={() => onSelectLifeArea(area.id)}
                    />
                  </div>

                  {expanded ? (
                    <div className="border-t border-[#EEDFC0] bg-[#FEFCF7]">
                      <div className="max-h-[220px] space-y-3 overflow-y-auto px-3 py-3 pl-4 sm:pl-20 sm:pr-3">
                        {area.dreamText.trim() ? (
                          <section>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                              The dream
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.7] text-foreground">
                              {area.dreamText.trim()}
                            </p>
                          </section>
                        ) : null}
                        {area.obstacleText.trim() ? (
                          <section>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                              What&apos;s in the way
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.7] text-foreground">
                              {area.obstacleText.trim()}
                            </p>
                          </section>
                        ) : null}
                        {area.visionText.trim() ? (
                          <section>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                              Vision
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.7] text-foreground">
                              {area.visionText.trim()}
                            </p>
                          </section>
                        ) : null}
                        {!area.dreamText.trim() &&
                        !area.obstacleText.trim() &&
                        !area.visionText.trim() ? (
                          <p className="italic text-[13px] text-muted">
                            No dream / blockers / vision written yet.
                          </p>
                        ) : null}

                        <section>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                            Goals
                          </p>
                          <p className="mt-0.5 text-[12px] text-muted">
                            Optional — pick one to focus the meditation on that
                            goal. Life-area context is always included.
                          </p>
                          {area.goals.length === 0 ? (
                            <p className="mt-2 text-[13px] italic text-muted">
                              No goals in this life area yet.
                            </p>
                          ) : (
                            <ul className="mt-2 space-y-1.5">
                              {area.goals.map((goal) => {
                                const goalSelected =
                                  selectedLifeAreaId === area.id &&
                                  selectedGoalId === goal.id;
                                return (
                                  <li key={goal.id}>
                                    <div
                                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                                        goalSelected
                                          ? "bg-accent-soft/50"
                                          : "hover:bg-background/70"
                                      } ${goal.done ? "opacity-60" : ""}`}
                                    >
                                      <button
                                        type="button"
                                        className="min-w-0 flex-1 cursor-pointer text-left"
                                        onClick={() =>
                                          onSelectGoal(area.id, goal.id)
                                        }
                                      >
                                        <span className="block truncate text-[13px] font-semibold text-foreground">
                                          {goal.title.trim() || "Untitled goal"}
                                          {goal.done ? (
                                            <span className="ml-1.5 text-[11px] font-medium text-muted">
                                              Done
                                            </span>
                                          ) : null}
                                        </span>
                                        {goal.preview.trim() ? (
                                          <span className="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-muted">
                                            {goal.preview.trim()}
                                          </span>
                                        ) : null}
                                      </button>
                                      <SelectCheck
                                        selected={goalSelected}
                                        label={
                                          goalSelected
                                            ? "Deselect this goal"
                                            : "Focus meditation on this goal"
                                        }
                                        onClick={() =>
                                          onSelectGoal(area.id, goal.id)
                                        }
                                      />
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </section>
                      </div>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Optional
        </p>
        <p className="mt-1 text-[15px] font-bold text-foreground">
          Anything to guide how this gets used?
        </p>
        <p className="mt-1 text-[13px] text-muted">
          e.g. focus on how success would feel — or leave blank and let the guide
          decide.
        </p>
        <textarea
          value={guidance}
          onChange={(e) => onGuidanceChange(e.target.value)}
          placeholder="Optional note for the guide…"
          rows={3}
          className="mt-2 min-h-[70px] w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent/30 placeholder:text-muted/70 focus:ring-2"
        />
      </div>
    </div>
  );
}
