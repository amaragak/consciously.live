
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FavoriteHeartButton } from "@/components/favorite-heart-button";
import { SelectChevron } from "@/components/select-chevron";
import type { BackgroundAudioItem } from "@/lib/medimade-api";
import {
  categoryLabel,
  channelSubcategoryOptions,
  inferSoundSubcategory,
  prettySubcategoryLabel,
  soundDisplayName,
  subcategoryLabel,
  type SoundCategoryId,
} from "@/lib/sound-taxonomy";

type SoundFolderSelectProps = {
  category: SoundCategoryId;
  items: BackgroundAudioItem[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
  compact?: boolean;
  /** 36px rounded-10 trigger for the Sound mixer desk. */
  desk?: boolean;
  favoriteKeys?: ReadonlySet<string>;
  onToggleFavorite?: (key: string) => void;
};

function SampleButtons({
  sounds,
  value,
  onPick,
  favoriteKeys,
  onToggleFavorite,
}: {
  sounds: BackgroundAudioItem[];
  value: string;
  onPick: (key: string) => void;
  favoriteKeys?: ReadonlySet<string>;
  onToggleFavorite?: (key: string) => void;
}) {
  if (sounds.length === 0) {
    return <div className="px-3 py-1.5 text-sm text-muted">No sounds yet</div>;
  }
  const ranked = [...sounds].sort((a, b) => {
    const af = favoriteKeys?.has(a.key) ? 0 : 1;
    const bf = favoriteKeys?.has(b.key) ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.name.localeCompare(b.name);
  });
  return (
    <>
      {ranked.map((s) => (
        <div key={s.key} className="flex items-center gap-0.5">
          <button
            type="button"
            className={`min-w-0 flex-1 truncate px-3 py-1.5 text-left text-sm hover:bg-background ${
              s.key === value ? "font-medium text-foreground" : "text-muted"
            }`}
            onClick={() => onPick(s.key)}
          >
            {s.name}
          </button>
          {onToggleFavorite ? (
            <FavoriteHeartButton
              pressed={Boolean(favoriteKeys?.has(s.key))}
              label={s.name}
              onToggle={() => onToggleFavorite(s.key)}
            />
          ) : null}
        </div>
      ))}
    </>
  );
}

export function SoundFolderSelect({
  category,
  items,
  value,
  onChange,
  disabled,
  compact,
  desk,
  favoriteKeys,
  onToggleFavorite,
}: SoundFolderSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const mobileSamplesRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [menuBox, setMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const folders = useMemo(() => {
    const base = channelSubcategoryOptions(category);
    const known = new Set(base.map((o) => o.id));
    const extra = [
      ...new Set(
        items.map((it) => it.subcategory || "").filter((s) => s && !known.has(s)),
      ),
    ]
      .sort()
      .map((id) => ({ id, label: prettySubcategoryLabel(id) }));
    return extra.length > 0 ? [...base, ...extra] : base;
  }, [category, items]);
  const selected = items.find((s) => s.key === value);
  // Prefer catalog name; if the key is set but items aren’t ready yet, show a
  // stable basename so the trigger doesn’t flash “None” during preset switches.
  const label = selected
    ? desk
      ? soundDisplayName(selected.name)
      : selected.name
    : value.trim()
      ? soundDisplayName(
          value
            .replace(/\\/g, "/")
            .split("/")
            .pop()!
            .replace(/\.[^.]+$/, ""),
        )
      : "None";

  const bySub = useMemo(() => {
    const map = new Map<string, BackgroundAudioItem[]>();
    for (const item of items) {
      const sub =
        item.subcategory ||
        inferSoundSubcategory(category, item.key) ||
        (folders[0]?.id ?? "");
      const list = map.get(sub) ?? [];
      list.push(item);
      map.set(sub, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [items, folders, category]);

  const usePortal = Boolean(desk);

  useLayoutEffect(() => {
    if (!open || !usePortal) {
      setMenuBox(null);
      return;
    }
    const place = () => {
      const trigger = rootRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const gap = 4;
      const maxHeight = Math.min(288, Math.max(160, window.innerHeight - r.bottom - gap - 12));
      setMenuBox({
        top: r.bottom + gap,
        left: r.left,
        width: Math.max(r.width, 192),
        maxHeight,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, usePortal, activeSub]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
      setActiveSub(null);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open || !activeSub) return;
    const el = mobileSamplesRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open, activeSub]);

  function pickSound(key: string) {
    onChange(key);
    setOpen(false);
    setActiveSub(null);
  }

  function pickNone() {
    onChange("");
    setOpen(false);
    setActiveSub(null);
  }

  function toggleFolder(folderId: string) {
    setActiveSub((cur) => (cur === folderId ? null : folderId));
  }

  const hasValue = Boolean(value.trim());
  // Desk chrome stays constant (no bg/opacity flip) so factory preset switches
  // only change the label text — not the whole trigger surface.
  const triggerClass = desk
    ? `flex h-9 w-full min-w-0 items-center gap-2 rounded-[10px] border border-border bg-card px-3 text-left text-[14px] ${
        hasValue ? "text-foreground" : "text-muted"
      } disabled:cursor-not-allowed disabled:text-muted`
    : compact
      ? "flex w-full min-w-0 items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-left text-sm disabled:opacity-50"
      : "flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm disabled:opacity-50";

  const menuInner = (
    <>
      <button
        type="button"
        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-background"
        onClick={pickNone}
      >
        None
      </button>
      {folders.length === 0 ? (
        <SampleButtons
          sounds={items}
          value={value}
          onPick={pickSound}
          favoriteKeys={favoriteKeys}
          onToggleFavorite={onToggleFavorite}
        />
      ) : (
        folders.map((folder) => {
          const sounds = bySub.get(folder.id) ?? [];
          const isActive = activeSub === folder.id;
          return (
            <div key={folder.id}>
              <button
                type="button"
                aria-expanded={isActive}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-background ${
                  isActive ? "bg-background font-medium text-foreground" : ""
                }`}
                onClick={() => toggleFolder(folder.id)}
              >
                <span>
                  {folder.label}
                  <span className="ml-1 text-[11px] text-muted">
                    ({sounds.length})
                  </span>
                </span>
                <SelectChevron direction="right" open={isActive} />
              </button>
              {isActive ? (
                <div
                  ref={mobileSamplesRef}
                  tabIndex={-1}
                  role="group"
                  aria-label={`${folder.label} samples`}
                  className="border-t border-border/60 bg-background/40 pb-1 pl-2 outline-none"
                >
                  <SampleButtons
                    sounds={sounds}
                    value={value}
                    onPick={pickSound}
                    favoriteKeys={favoriteKeys}
                    onToggleFavorite={onToggleFavorite}
                  />
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </>
  );

  const menu = open ? (
    usePortal && menuBox ? (
      createPortal(
        <div
          ref={menuRef}
          className="overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-xl"
          style={{
            position: "fixed",
            top: menuBox.top,
            left: menuBox.left,
            width: menuBox.width,
            maxHeight: menuBox.maxHeight,
            zIndex: 200,
          }}
          role="listbox"
        >
          {menuInner}
        </div>,
        document.body,
      )
    ) : !usePortal ? (
      <div
        ref={menuRef}
        className={`absolute z-[90] max-h-72 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-xl ${
          compact
            ? "left-0 right-0 top-full mt-1 sm:left-1/2 sm:right-auto sm:min-w-[13rem] sm:-translate-x-1/2"
            : "left-0 top-full mt-1 min-w-[12rem]"
        }`}
        role="listbox"
      >
        {menuInner}
      </div>
    ) : null
  ) : null;

  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 ${
        desk || compact ? "w-full" : "flex-1"
      } ${open ? "z-30" : ""}`}
    >
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${categoryLabel(category)} sound`}
        title={
          selected
            ? `${selected.name}${selected.subcategory ? ` · ${subcategoryLabel(category, selected.subcategory)}` : ""}`
            : hasValue
              ? label
              : "None"
        }
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
          if (open) setActiveSub(null);
        }}
        className={triggerClass}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <SelectChevron open={open} />
      </button>
      {menu}
    </div>
  );
}
