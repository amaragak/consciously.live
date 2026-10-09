import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Lock, MoreHorizontal, Plus } from "lucide-react";
import { FavoriteHeartButton } from "@/components/favorite-heart-button";
import { SelectChevron } from "@/components/select-chevron";
import {
  SoundsMixTile,
  SoundsPlayCircle,
} from "@/components/sounds-preset-chip";
import {
  SoundsPresetMenuPanel,
  type SoundsPresetMenuItem,
  type SoundsPresetSections,
} from "@/components/sounds-preset-menu";

export type SoundsSaveActions = {
  /** "Save" | "Save as…" | "Saving…" */
  mainLabel: string;
  mainDisabled: boolean;
  onMain: () => void;
  onSaveAsNew: () => void;
  onRename: () => void;
  onRevert: () => void;
  onDelete: () => void;
  /** Own mixes only. */
  canRename: boolean;
  canDelete: boolean;
  canRevert: boolean;
};

export type SoundsPresetCurrent = {
  name: string;
  iconId: string;
  iconBg?: string;
  iconColor?: string;
  /** Factory preset (shows the lock). */
  locked: boolean;
};

const POPOVER_GAP = 6;
const SHADOW = "shadow-[0_12px_32px_rgb(15_27_45_/_0.16)]";

/**
 * Anchored dropdown (desktop, portalled so the card's overflow can't clip it)
 * or bottom sheet (mobile). Esc / outside click close it.
 */
function SoundsPopover({
  open,
  mode,
  anchorRef,
  align,
  width,
  label,
  onClose,
  children,
}: {
  open: boolean;
  mode: "dropdown" | "sheet";
  anchorRef: RefObject<HTMLElement | null>;
  align: "left" | "right";
  width: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || mode !== "dropdown") return;
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const raw = align === "left" ? rect.left : rect.right - width;
    const left = Math.max(8, Math.min(raw, window.innerWidth - width - 8));
    setPos({ top: rect.bottom + POPOVER_GAP, left });
  }, [open, mode, anchorRef, align, width]);

  useEffect(() => {
    if (!open) return;
    function returnFocus() {
      anchorRef.current?.focus();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
      returnFocus();
    }
    function onPointer(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
      returnFocus();
    }
    function onScroll(e: Event) {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    if (mode === "dropdown") {
      document.addEventListener("pointerdown", onPointer);
      window.addEventListener("resize", onClose);
      window.addEventListener("scroll", onScroll, true);
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, mode, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  if (mode === "sheet") {
    return createPortal(
      <div className="fixed inset-0 z-[140]">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 cursor-default bg-foreground/30"
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card px-3 pb-6 pt-2 shadow-[0_-8px_28px_rgb(15_27_45_/_0.18)]"
        >
          <div
            aria-hidden
            className="mx-auto mb-2 h-1 w-10 rounded-full bg-border"
          />
          {children}
        </div>
      </div>,
      document.body,
    );
  }

  if (!pos) return null;
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      className={`fixed z-[140] rounded-[14px] border border-border bg-card p-2 ${SHADOW}`}
      style={{ top: pos.top, left: pos.left, width }}
    >
      {children}
    </div>,
    document.body,
  );
}

function SaveMenuList({
  save,
  roomy,
  onClose,
}: {
  save: SoundsSaveActions;
  roomy: boolean;
  onClose: () => void;
}) {
  const pad = roomy ? "py-3" : "py-2";
  const item = (
    label: string,
    onClick: () => void,
    opts?: { disabled?: boolean; danger?: boolean },
  ) => (
    <button
      type="button"
      role="menuitem"
      disabled={opts?.disabled}
      onClick={() => {
        onClose();
        onClick();
      }}
      className={`block w-full cursor-pointer rounded-lg px-2.5 ${pad} text-left text-sm hover:bg-accent-soft/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
        opts?.danger ? "text-danger" : "text-foreground"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div role="menu" className="flex flex-col">
      {item("Save as new…", save.onSaveAsNew)}
      {save.canRename ? item("Rename…", save.onRename) : null}
      {item("Revert to saved", save.onRevert, { disabled: !save.canRevert })}
      {save.canDelete ? (
        <>
          <div className="my-1 h-px bg-border" aria-hidden />
          {item("Delete mix", save.onDelete, { danger: true })}
        </>
      ) : null}
    </div>
  );
}

const STEP_BTN_CLASS =
  "flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted transition-colors hover:border-accent/40 hover:text-foreground";

const NEW_MIX_BTN_CLASS =
  "flex shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-card text-muted transition-colors hover:border-accent/40 hover:text-foreground";

/**
 * Sounds-page preset bar. Desktop: the whole mixer-card header. Mobile: the
 * ‹ dropdown › row plus the heart/status row.
 */
export function SoundsPresetBar({
  variant,
  current,
  dirty,
  statusText,
  sections,
  loadedKey,
  onSelect,
  onPrev,
  onNext,
  onNew,
  favorite,
  playing,
  playDisabled,
  onTogglePlayAll,
  save,
}: {
  variant: "desktop" | "mobile";
  current: SoundsPresetCurrent;
  dirty: boolean;
  statusText: string;
  sections: SoundsPresetSections;
  loadedKey: string | null;
  onSelect: (item: SoundsPresetMenuItem) => void;
  onPrev: () => void;
  onNext: () => void;
  onNew: () => void;
  favorite: { pressed: boolean; onToggle: () => void } | null;
  playing: boolean;
  playDisabled: boolean;
  onTogglePlayAll: () => void;
  save: SoundsSaveActions;
}) {
  const desktop = variant === "desktop";
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLButtonElement | null>(null);
  const caretRef = useRef<HTMLButtonElement | null>(null);

  // Viewport crossed `md` while a menu was open: close it.
  useEffect(() => {
    setMenuOpen(false);
    setSaveMenuOpen(false);
  }, [variant]);

  const stepBtn = (dir: "prev" | "next") => (
    <button
      type="button"
      aria-label={dir === "prev" ? "Previous preset" : "Next preset"}
      onClick={dir === "prev" ? onPrev : onNext}
      className={`${STEP_BTN_CLASS} ${desktop ? "size-[34px]" : "size-9"}`}
    >
      {dir === "prev" ? (
        <ChevronLeft aria-hidden className="size-[18px]" strokeWidth={2} />
      ) : (
        <ChevronRight aria-hidden className="size-[18px]" strokeWidth={2} />
      )}
    </button>
  );

  const newMixBtn = (
    <button
      type="button"
      aria-label="New untitled mix"
      onClick={() => {
        setMenuOpen(false);
        setSaveMenuOpen(false);
        onNew();
      }}
      className={`${NEW_MIX_BTN_CLASS} ${desktop ? "size-[34px]" : "size-9"}`}
    >
      <Plus aria-hidden className="size-[18px]" strokeWidth={2.2} />
    </button>
  );

  const dropdown = (
    <button
      ref={dropdownRef}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={menuOpen}
      aria-label={`Preset: ${current.name}. Choose preset`}
      onClick={() => {
        setSaveMenuOpen(false);
        setMenuOpen((o) => !o);
      }}
      className={`box-border flex h-[42px] min-w-0 cursor-pointer items-center gap-2.5 rounded-xl bg-card pl-1.5 pr-3 text-left ${
        desktop ? "max-w-[340px]" : "flex-1"
      } ${
        menuOpen
          ? "border-[1.5px] border-accent ring-[3px] ring-accent/20"
          : "border border-border hover:border-accent/40"
      }`}
    >
      <SoundsMixTile
        iconId={current.iconId}
        iconBg={current.iconBg}
        iconColor={current.iconColor}
        size={30}
        radius={8}
        iconSize={17}
      />
      <span
        className={`min-w-0 truncate font-display font-medium leading-tight text-foreground ${
          desktop ? "text-[20px]" : "flex-1 text-[18px]"
        }`}
      >
        {current.name}
      </span>
      {current.locked ? (
        <Lock
          aria-hidden
          className="size-3 shrink-0 text-muted"
          strokeWidth={2.2}
        />
      ) : null}
      {dirty ? (
        <span
          title="Unsaved changes"
          className="size-[7px] shrink-0 rounded-full bg-accent"
        />
      ) : null}
      <SelectChevron open={menuOpen} />
    </button>
  );

  const heart = (size: number) =>
    favorite ? (
      <FavoriteHeartButton
        pressed={favorite.pressed}
        label={current.name}
        onToggle={favorite.onToggle}
        iconSize={size}
        boxClassName={size >= 18 ? "h-7 w-7 rounded-lg" : "h-6 w-6 rounded-md"}
      />
    ) : null;

  const menu = (
    <SoundsPopover
      open={menuOpen}
      mode={desktop ? "dropdown" : "sheet"}
      anchorRef={dropdownRef}
      align="left"
      width={300}
      label="Presets"
      onClose={() => setMenuOpen(false)}
    >
      <SoundsPresetMenuPanel
        sections={sections}
        loadedKey={loadedKey}
        roomy={!desktop}
        autoFocusSearch={desktop}
        listMaxClass={
          desktop ? "max-h-[calc(70vh-110px)]" : "max-h-[55vh]"
        }
        onSelect={(item) => {
          setMenuOpen(false);
          onSelect(item);
        }}
        onNew={() => {
          setMenuOpen(false);
          onNew();
        }}
      />
    </SoundsPopover>
  );

  if (!desktop) {
    return (
      <div>
        <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-2.5">
          {stepBtn("prev")}
          {dropdown}
          {stepBtn("next")}
          {newMixBtn}
        </div>
        <div className="flex items-center gap-2 border-b border-border px-3.5 pb-2.5">
          {heart(16)}
          <span className="whitespace-nowrap text-xs text-muted">
            {statusText}
          </span>
        </div>
        {menu}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
      {stepBtn("prev")}
      {dropdown}
      {stepBtn("next")}
      {newMixBtn}
      {heart(18)}
      <span className="shrink-0 whitespace-nowrap text-xs text-muted">
        {statusText}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={playing ? "Pause all" : "Play all"}
          onClick={onTogglePlayAll}
          disabled={playDisabled}
          className="flex size-[42px] cursor-pointer items-center justify-center rounded-full border border-border bg-card transition-colors hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SoundsPlayCircle playing={playing} size={32} iconSize={12} />
        </button>
        <div className="inline-flex h-[42px] items-stretch overflow-hidden rounded-full accent-fill-gradient text-on-accent">
          <button
            type="button"
            onClick={save.onMain}
            disabled={save.mainDisabled}
            className="cursor-pointer whitespace-nowrap pl-[18px] pr-4 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {save.mainLabel}
          </button>
          <span aria-hidden className="w-px bg-on-accent/30" />
          <button
            ref={caretRef}
            type="button"
            aria-label="More save options"
            aria-haspopup="menu"
            aria-expanded={saveMenuOpen}
            onClick={() => {
              setMenuOpen(false);
              setSaveMenuOpen((o) => !o);
            }}
            className="flex cursor-pointer items-center justify-center px-3 transition-opacity hover:opacity-90"
          >
            <SelectChevron open={saveMenuOpen} className="text-on-accent" />
          </button>
        </div>
      </div>
      {menu}
      <SoundsPopover
        open={saveMenuOpen}
        mode="dropdown"
        anchorRef={caretRef}
        align="right"
        width={210}
        label="Save options"
        onClose={() => setSaveMenuOpen(false)}
      >
        <SaveMenuList
          save={save}
          roomy={false}
          onClose={() => setSaveMenuOpen(false)}
        />
      </SoundsPopover>
    </div>
  );
}

/**
 * Mobile sticky bottom bar: Play all (48px), ⋯ (save menu as a sheet) and the
 * primary Save / Save as… action.
 */
export function SoundsMobileActionBar({
  playing,
  playDisabled,
  onTogglePlayAll,
  save,
}: {
  playing: boolean;
  playDisabled: boolean;
  onTogglePlayAll: () => void;
  save: SoundsSaveActions;
}) {
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="sticky bottom-0 z-20 mt-auto flex items-center gap-2 border-t border-border bg-background px-3.5 pb-[18px] pt-3 shadow-[0_-6px_18px_rgb(15_27_45_/_0.08)] md:hidden">
      <button
        type="button"
        onClick={onTogglePlayAll}
        disabled={playDisabled}
        aria-label={playing ? "Pause all" : "Play all"}
        className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        <SoundsPlayCircle playing={playing} size={48} iconSize={18} />
      </button>
      <button
        ref={moreRef}
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-accent/40"
      >
        <MoreHorizontal aria-hidden className="size-5" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={save.onMain}
        disabled={save.mainDisabled}
        className="inline-flex h-12 flex-1 cursor-pointer items-center justify-center rounded-full accent-fill-gradient px-4 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {save.mainLabel}
      </button>
      <SoundsPopover
        open={open}
        mode="sheet"
        anchorRef={moreRef}
        align="left"
        width={210}
        label="Save options"
        onClose={() => setOpen(false)}
      >
        <SaveMenuList save={save} roomy onClose={() => setOpen(false)} />
      </SoundsPopover>
    </div>
  );
}
