import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";

/** Where a life-area meditation was started. Untagged rows stay under All. */
export type LifeAreaMeditationSource = "goal" | "dream" | "plan" | "thought";

const SOURCES = new Set<string>(["goal", "dream", "plan", "thought"]);
const MAP_KEY = "mm_life_area_meditation_sources_v1";
const PENDING_KEY = "mm_life_area_meditation_source_pending";

export function isLifeAreaMeditationSource(
  value: unknown,
): value is LifeAreaMeditationSource {
  return typeof value === "string" && SOURCES.has(value);
}

export function stageLifeAreaMeditationSource(
  source: LifeAreaMeditationSource,
): void {
  try {
    sessionStorage.setItem(PENDING_KEY, source);
  } catch {
    /* private mode */
  }
}

export function peekStagedLifeAreaMeditationSource(): LifeAreaMeditationSource | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return isLifeAreaMeditationSource(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function clearStagedLifeAreaMeditationSource(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

function loadMap(): Record<string, LifeAreaMeditationSource> {
  try {
    const raw = readAccountLocalStorage(MAP_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, LifeAreaMeditationSource> = {};
    for (const [key, value] of Object.entries(data)) {
      if (isLifeAreaMeditationSource(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function rememberLifeAreaMeditationSource(
  id: string,
  source: LifeAreaMeditationSource,
): void {
  const key = id.trim();
  if (!key) return;
  const map = loadMap();
  map[key] = source;
  const entries = Object.entries(map).slice(-200);
  writeAccountLocalStorage(MAP_KEY, JSON.stringify(Object.fromEntries(entries)));
}

export function lifeAreaMeditationSourceFor(
  ...ids: Array<string | null | undefined>
): LifeAreaMeditationSource | null {
  const map = loadMap();
  for (const id of ids) {
    const key = id?.trim();
    if (!key) continue;
    const hit = map[key];
    if (hit) return hit;
  }
  return null;
}

export const LIFE_AREA_SOURCE_TAG: Record<LifeAreaMeditationSource, string> = {
  goal: "Goal",
  dream: "Dream",
  plan: "Plan",
  thought: "Thought",
};

export const LIFE_AREA_SOURCE_CHIP: Record<LifeAreaMeditationSource, string> = {
  goal: "From goals",
  dream: "From the dream",
  plan: "From plans",
  thought: "From thoughts",
};

export const LIFE_AREA_SOURCE_ORDER: LifeAreaMeditationSource[] = [
  "goal",
  "dream",
  "plan",
  "thought",
];
