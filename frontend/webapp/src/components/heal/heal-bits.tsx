import { Heart, KeyRound, Leaf, Lock, MessageCircle, Repeat } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@/lib/spa-nav";
import {
  addHealCheckin,
  healPhotoUrl,
  loadHealStore,
  patchHealItem,
  saveHealStore,
  subscribeHealStore,
  type HealItem,
  type HealStoreV1,
} from "@/lib/heal-store";
import { HealNameChip } from "@/components/heal/heal-name-chip";

export const HEAL_PAGE =
  "mx-auto w-full min-w-0 max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pb-10";

export const HEAL_PRIMARY =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold accent-fill-gradient disabled:cursor-not-allowed disabled:opacity-40";

export const HEAL_OUTLINE =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40";

export function useHealStore(): [HealStoreV1, (next: HealStoreV1) => void] {
  const [store, setStore] = useState(loadHealStore);
  useEffect(() => subscribeHealStore(() => setStore(loadHealStore())), []);
  return [
    store,
    (next) => {
      saveHealStore(next);
      setStore(next);
    },
  ];
}

export function HealAvatar({
  item,
  store,
  size,
}: {
  item: HealItem;
  store: HealStoreV1;
  size: number;
}) {
  const photo = healPhotoUrl(store, item);
  const letter = item.title.trim().slice(0, 1).toUpperCase() || "•";
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-heal-tint font-semibold text-heal-accent"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : item.type === "shame" ? (
        <Lock
          aria-hidden
          strokeWidth={1.8}
          style={{ width: Math.round(size * 0.42), height: Math.round(size * 0.42) }}
        />
      ) : item.type === "pattern" || item.type === "recurring_thought" || item.type === "belief" ? (
        item.type === "belief" ? (
          <KeyRound
            aria-hidden
            strokeWidth={1.8}
            style={{ width: Math.round(size * 0.42), height: Math.round(size * 0.42) }}
          />
        ) : item.type === "recurring_thought" ? (
          <MessageCircle
            aria-hidden
            strokeWidth={1.8}
            style={{ width: Math.round(size * 0.42), height: Math.round(size * 0.42) }}
          />
        ) : (
          <Repeat
            aria-hidden
            strokeWidth={1.8}
            style={{ width: Math.round(size * 0.42), height: Math.round(size * 0.42) }}
          />
        )
      ) : (
        letter
      )}
    </span>
  );
}

export function HealSparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const w = 96;
  const h = 28;
  const min = 1;
  const max = 10;
  const pts = scores.map((score, i) => {
    const x = (i / (scores.length - 1)) * w;
    const y = h - ((score - min) / (max - min)) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const area = `0,${h} ${pts.join(" ")} ${w},${h}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polygon points={area} fill="var(--heal-accent)" opacity="0.1" />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--heal-accent)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HealRiskPill({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="mb-3 flex justify-end">
      <Link
        href="/heal/support"
        className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-heal-border bg-heal-tint px-3 text-[12px] font-semibold text-heal-accent"
      >
        <Heart className="size-3.5" strokeWidth={1.8} aria-hidden />
        Need to talk to someone?
      </Link>
    </div>
  );
}

export function HealOverlay({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const wideClass = wide ? "sm:max-w-[560px]" : "sm:max-w-[440px]";
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--foreground)_55%,transparent)]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[min(92dvh,760px)] w-full flex-col overflow-hidden rounded-t-[22px] border border-border bg-card shadow-xl sm:rounded-2xl ${wideClass}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function CheckInDialog({
  items,
  onClose,
  onSaved,
}: {
  items: HealItem[];
  onClose: () => void;
  onSaved: (next: HealStoreV1) => void;
}) {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const item = items[index];
  if (!item) return null;
  const store = loadHealStore();

  function save() {
    if (!item || score == null) return;
    let next = addHealCheckin(loadHealStore(), item.id, score, note.trim() || null);
    onSaved(next);
    if (index < items.length - 1) {
      setIndex(index + 1);
      setScore(null);
      setNote("");
      return;
    }
    onClose();
  }

  return (
    <HealOverlay title={`How heavy is ${item.title} today?`} onClose={onClose}>
      <div className="overflow-y-auto px-5 py-5 sm:px-6">
        <h2 className="font-display text-[20px] leading-snug text-foreground">
          How heavy is <HealNameChip item={item} store={store} /> today?
        </h2>
        <div className="mt-4 grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setScore(n)}
              className={`h-[38px] cursor-pointer rounded-[10px] text-sm font-semibold ${
                score === n
                  ? "bg-foreground text-white"
                  : "bg-heal-tint text-foreground"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span>Barely there</span>
          <span>Overwhelming</span>
        </div>
        <label className="mt-4 block text-sm text-foreground">
          Anything on your mind? (optional)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
          />
        </label>
        <button
          type="button"
          disabled={score == null}
          onClick={save}
          className={`${HEAL_PRIMARY} mt-4 w-full`}
        >
          Save
        </button>
      </div>
    </HealOverlay>
  );
}

export function readHealPhotoFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 256;
      const scale = Math.min(max / img.width, max / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export function PerspectiveBlock({ text }: { text: string }) {
  return (
    <div className="mt-3 border-l-2 border-heal-border pl-3">
      <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[1.2px] text-heal-accent">
        <Leaf className="size-3" strokeWidth={1.8} aria-hidden />
        New perspective
      </p>
      <p className="mt-1 font-display text-[17px] italic leading-relaxed text-foreground">
        {text}
      </p>
    </div>
  );
}

export async function rememberRisk(
  itemId: string,
  text: string,
  commit: (next: HealStoreV1) => void,
): Promise<void> {
  const { healScreenRisk } = await import("@/lib/heal-ai");
  const flagged = await healScreenRisk(text);
  if (!flagged) return;
  commit(
    patchHealItem(loadHealStore(), itemId, { riskAt: new Date().toISOString() }),
  );
}
