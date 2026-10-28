import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { libraryMeditationDetailHrefById } from "@/lib/library-meditation-detail";
import { useMvpFlags } from "@/lib/mvp-flags";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { ensureTracker, itemsForArea } from "@/lib/tracker-items";

export type WhiteboardReturnView = {
  viewport: { x: number; y: number; zoom: number };
  selected: string[];
};

export type CardRef = {
  kind: string;
  refId: string | null;
  refType?: string | null;
  label: string;
  imageId?: string | null;
};

const VIEW = (id: string) => `mm_wb_view:${id}`;
const RESTORE = (id: string) => `mm_wb_restore:${id}`;

let recent: { id: string; at: number; data: WhiteboardReturnView } | null = null;

export function rememberWhiteboardView(areaId: string, view: WhiteboardReturnView) {
  try {
    sessionStorage.setItem(VIEW(areaId), JSON.stringify(view));
    sessionStorage.setItem(RESTORE(areaId), "1");
  } catch {
    /* private mode */
  }
}

/** Read the view saved when a card was opened. A second read within a second still returns it. */
export function takeWhiteboardReturn(areaId: string): WhiteboardReturnView | null {
  const now = Date.now();
  if (recent && recent.id === areaId && now - recent.at < 1000) return recent.data;
  try {
    if (sessionStorage.getItem(RESTORE(areaId)) !== "1") return null;
    sessionStorage.removeItem(RESTORE(areaId));
    const raw = sessionStorage.getItem(VIEW(areaId));
    if (!raw) return null;
    const data = JSON.parse(raw) as WhiteboardReturnView;
    if (!data?.viewport || !Array.isArray(data.selected)) return null;
    recent = { id: areaId, at: now, data };
    return data;
  } catch {
    return null;
  }
}

export function sourceCardTarget(
  areaId: string,
  card: CardRef,
): { href: string; place: string } | null {
  const kind = card.refType || card.kind;
  const ref = card.kind === "image" ? card.imageId || card.refId : card.refId;
  if (kind === "sticky" || kind === "text") return null;
  if (kind === "item" || kind === "goal" || kind === "step") {
    if (!ref) return null;
    const items = itemsForArea(ensureTracker(loadIdeateStore()), areaId);
    let top = ref;
    let current = items.find((item) => item.id === ref) ?? null;
    const seen = new Set<string>();
    while (current?.parentId && !seen.has(current.parentId)) {
      seen.add(current.parentId);
      top = current.parentId;
      current = items.find((item) => item.id === current!.parentId) ?? null;
    }
    const q = new URLSearchParams({ wb: "1", focus: ref });
    return {
      href: `/manifest/goal/${encodeURIComponent(areaId)}/tracker/${encodeURIComponent(top)}?${q}`,
      place: "Tracker",
    };
  }
  if (kind === "dream" || kind === "moment" || kind === "obstacle" || kind === "plan") {
    const q = new URLSearchParams({ wb: "1", edit: kind === "plan" ? "dream" : kind });
    if (kind === "obstacle") q.set("label", card.label);
    return {
      href: `/manifest/goal/${encodeURIComponent(areaId)}?${q}`,
      place: "Vision",
    };
  }
  if (kind === "thought" && ref) {
    const q = new URLSearchParams({ wb: "1", thought: ref });
    return {
      href: `/manifest/goal/${encodeURIComponent(areaId)}/thoughts?${q}`,
      place: "Thoughts",
    };
  }
  if (kind === "meditation" && ref) {
    const href = libraryMeditationDetailHrefById(ref);
    const join = href.includes("?") ? "&" : "?";
    return { href: `${href}${join}wb=${encodeURIComponent(areaId)}`, place: "Library" };
  }
  if (kind === "image" && ref) {
    return {
      href: `/manifest/vision-board?wb=${encodeURIComponent(areaId)}&select=${encodeURIComponent(ref)}#vision-tile-${ref}`,
      place: "Vision",
    };
  }
  if (kind === "insight") {
    return {
      href: `/manifest/goal/${encodeURIComponent(areaId)}/insights?wb=1`,
      place: "Insights",
    };
  }
  return null;
}

export function WhiteboardBackChip({ areaId }: { areaId: string }) {
  const whiteboardOn = useMvpFlags().whiteboard;
  const navigate = useNavigate();
  if (!whiteboardOn) return null;
  const title =
    loadIdeateStore().dreams.find((dream) => dream.id === areaId)?.title.trim() ||
    "this area";
  return (
    <button
      type="button"
      className="mb-3 inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground"
      onClick={() => navigate(`/manifest/goal/${encodeURIComponent(areaId)}/whiteboard`)}
    >
      <ChevronLeft className="size-4" aria-hidden />
      Back to {title} whiteboard
    </button>
  );
}
