import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Lock, Search } from "lucide-react";
import { SoundsMixTile } from "@/components/sounds-preset-chip";

/** One loadable preset in the Sounds preset menu (factory or own mix). */
export type SoundsPresetMenuItem = {
  /** Unique across kinds: `f:<id>` / `u:<id>`. */
  key: string;
  kind: "factory" | "user";
  id: string;
  name: string;
  iconId: string;
  iconBg?: string;
  iconColor?: string;
  favorite: boolean;
};

export type SoundsPresetSections = {
  favourites: SoundsPresetMenuItem[];
  factory: SoundsPresetMenuItem[];
  user: SoundsPresetMenuItem[];
};

/**
 * Splits presets into Favourites / Factory / Your mixes. Favourites hold both
 * kinds and are removed from the other two sections so nothing repeats.
 */
export function sectionPresetMenu(
  factory: SoundsPresetMenuItem[],
  user: SoundsPresetMenuItem[],
): SoundsPresetSections {
  const all = [...factory, ...user];
  return {
    favourites: all.filter((i) => i.favorite),
    factory: factory.filter((i) => !i.favorite),
    user: user.filter((i) => !i.favorite),
  };
}

/** Menu order — also the order ‹ › step through. */
export function flattenPresetSections(
  s: SoundsPresetSections,
): SoundsPresetMenuItem[] {
  return [...s.favourites, ...s.factory, ...s.user];
}

const SECTION_LABEL_CLASS =
  "px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link";

/**
 * Preset menu body: search, sections, rows, "+ New mix" footer.
 * Keyboard: ↑/↓ move, Enter loads, typing focuses the search field.
 * (Esc / outside click are handled by the popover that hosts this.)
 */
export function SoundsPresetMenuPanel({
  sections,
  loadedKey,
  onSelect,
  onNew,
  roomy = false,
  autoFocusSearch = true,
  listMaxClass = "max-h-[calc(70vh-110px)]",
}: {
  sections: SoundsPresetSections;
  loadedKey: string | null;
  onSelect: (item: SoundsPresetMenuItem) => void;
  onNew: () => void;
  /** Taller rows for the touch bottom sheet. */
  roomy?: boolean;
  autoFocusSearch?: boolean;
  listMaxClass?: string;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());

  const [hi, setHi] = useState(() => {
    const idx = flattenPresetSections(sections).findIndex(
      (i) => i.key === loadedKey,
    );
    return Math.max(0, idx);
  });

  const q = query.trim().toLowerCase();
  const view = useMemo(() => {
    const f = (list: SoundsPresetMenuItem[]) =>
      q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list;
    return {
      favourites: f(sections.favourites),
      factory: f(sections.factory),
      user: f(sections.user),
    };
  }, [sections, q]);
  const flat = useMemo(() => flattenPresetSections(view), [view]);
  const activeIndex = flat.length === 0 ? -1 : Math.min(hi, flat.length - 1);
  const activeKey = activeIndex >= 0 ? flat[activeIndex].key : null;

  useEffect(() => {
    if (autoFocusSearch) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocusSearch]);

  useEffect(() => {
    if (!activeKey) return;
    rowRefs.current.get(activeKey)?.scrollIntoView({ block: "nearest" });
  }, [activeKey]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length === 0) return;
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setHi((activeIndex + dir + flat.length) % flat.length);
      return;
    }
    if (e.key === "Enter") {
      if (e.target instanceof HTMLButtonElement) return;
      const item = flat[activeIndex];
      if (item) {
        e.preventDefault();
        onSelect(item);
      }
      return;
    }
    if (
      e.key.length === 1 &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      document.activeElement !== inputRef.current
    ) {
      inputRef.current?.focus();
    }
  }

  const rowPad = roomy ? "py-2.5" : "py-1.5";
  let cursor = 0;
  const renderSection = (label: string, list: SoundsPresetMenuItem[]) => {
    if (list.length === 0) return null;
    return (
      <div role="group" aria-label={label}>
        <p className={SECTION_LABEL_CLASS}>{label}</p>
        {list.map((item) => {
          const idx = cursor++;
          const loaded = item.key === loadedKey;
          const active = idx === activeIndex;
          return (
            <div
              key={item.key}
              id={`sounds-preset-opt-${item.key}`}
              role="option"
              aria-selected={loaded}
              ref={(el) => {
                if (el) rowRefs.current.set(item.key, el);
                else rowRefs.current.delete(item.key);
              }}
              onMouseEnter={() => setHi(idx)}
              onClick={() => onSelect(item)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 ${rowPad} ${
                loaded
                  ? "bg-accent-soft"
                  : active
                    ? "bg-accent-soft/50"
                    : ""
              }`}
            >
              <SoundsMixTile
                iconId={item.iconId}
                iconBg={item.iconBg}
                iconColor={item.iconColor}
                size={26}
                radius={8}
                iconSize={15}
              />
              <span
                className={`min-w-0 truncate text-sm text-foreground ${
                  loaded ? "font-semibold" : ""
                }`}
              >
                {item.name}
              </span>
              {item.kind === "factory" ? (
                <Lock
                  aria-hidden
                  className="size-[11px] shrink-0 text-muted"
                  strokeWidth={2.2}
                />
              ) : null}
              {loaded ? (
                <Check
                  aria-hidden
                  className="ml-auto size-3.5 shrink-0 text-accent-link"
                  strokeWidth={2.4}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div onKeyDown={onKeyDown} className="flex flex-col">
      <div className="relative mb-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          strokeWidth={2}
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHi(0);
          }}
          placeholder="Search presets"
          aria-label="Search presets"
          role="combobox"
          aria-expanded
          aria-controls="sounds-preset-listbox"
          aria-activedescendant={
            activeKey ? `sounds-preset-opt-${activeKey}` : undefined
          }
          className="h-9 w-full rounded-[10px] border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted focus:border-accent/50"
        />
      </div>
      <div
        id="sounds-preset-listbox"
        role="listbox"
        aria-label="Presets"
        className={`overflow-y-auto ${listMaxClass}`}
      >
        {renderSection("♡ Favourites", view.favourites)}
        {renderSection("Factory", view.factory)}
        {renderSection("Your mixes", view.user)}
        {flat.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted">No matches.</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onNew}
        className="mt-1 w-full cursor-pointer border-t border-border px-2 pb-0.5 pt-2 text-left text-[13px] font-semibold text-accent-link hover:opacity-80"
      >
        + New mix
      </button>
    </div>
  );
}
