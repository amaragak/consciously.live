const KEY = "mm_life_area_visit_v1";

type VisitTab = "thoughts" | "insights";
type Visits = Record<string, Partial<Record<VisitTab, string>>>;

function read(): Visits {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Visits) : {};
  } catch {
    return {};
  }
}

export function lifeAreaLastSeen(
  areaId: string,
  tab: VisitTab,
): string | null {
  const at = read()[areaId]?.[tab];
  return typeof at === "string" && at ? at : null;
}

export function markLifeAreaSeen(areaId: string, tab: VisitTab) {
  const all = read();
  const row = { ...(all[areaId] ?? {}), [tab]: new Date().toISOString() };
  all[areaId] = row;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
