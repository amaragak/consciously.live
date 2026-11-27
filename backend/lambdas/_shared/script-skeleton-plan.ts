/**
 * Create: pick a harvested skeleton for the style and scale it to the chosen
 * length (pure; no I/O). The plan is what Sonnet writes into.
 *
 * - Choose: closest runtime to the chosen length, preferring primary fits and
 *   higher views/likes; random among the top three.
 * - Scale: every passage and pause × (script time ÷ skeleton body time), so the
 *   speech share and its shape through the session (incl. opening / closing
 *   phase shares) stay the source's. Word targets use the app voice's WPM.
 * - Shortening: merge neighbouring same-role passages instead of < ~8 words.
 *   Lengthening a lot: split long passages, keeping their role.
 * - No usable skeleton: build one from the style's pacing profile.
 */
import type {
  HarvesterSkeleton,
  PacingProfile,
  SkeletonSegment,
} from "./preprompts/harvester-datasets";

export const SKELETON_EXTENDABLE_MIN_SECONDS = 4;
export const SKELETON_SELF_PRACTICE_SECONDS = 30;
const MIN_PASSAGE_WORDS = 8;
const MERGE_WHEN_SCALE_BELOW = 0.9;
const SPLIT_WHEN_SCALE_AT_LEAST = 1.5;
const SPLIT_ABOVE_WORDS = 140;
const SPLIT_PART_WORDS = 100;
const SPLIT_PAUSE_SECONDS = 5;
/** Below this many words a passage merges into a neighbour even when not shortening. */
const TINY_PASSAGE_WORDS = 4;
const BLOCK_MAX_SECONDS = 150;
const MIN_BODY_SECONDS = 60;
const MIN_PASSAGES = 3;
const MAX_TAIL_SHARE = 0.2;
/** Ranking weight on |skeleton speech share − style profile median|. */
const SPEECH_SHARE_WEIGHT = 1.2;

export type PlannedPassage = {
  n: number;
  role: string;
  phase: string;
  words: number;
  speechSeconds: number;
  shortGapCount: number;
  shortGapSeconds: number;
  /** Silence after this passage (0 = none; last passage usually 0). */
  pauseAfter: number;
};

export type PlannedBlock = {
  index: number;
  phase: string;
  firstPassage: number;
  lastPassage: number;
  seconds: number;
  words: number;
  headerLine: string;
};

export type SkeletonPlanSource =
  | {
      kind: "skeleton";
      id: string;
      title?: string;
      channel?: string;
      fit: string;
      views: number | null;
      likes: number | null;
      runtimeS: number;
      bodySeconds: number;
    }
  | { kind: "pacing_profile" | "default_profile"; bodySeconds: number };

export type SkeletonPlan = {
  style: string;
  source: SkeletonPlanSource;
  /** Script seconds ÷ source body seconds. */
  scale: number;
  targetSeconds: number;
  wpm: number;
  passages: PlannedPassage[];
  blocks: PlannedBlock[];
  totalWords: number;
  speechSeconds: number;
  shortGapSeconds: number;
  pauseSeconds: number;
  extendablePauseCount: number;
  /** (speech + short gaps) ÷ target — the harvester's speech-share definition. */
  speechShare: number;
  sourceSpeechShare: number;
  openingShare: number;
  closingShare: number;
  merged: number;
  split: number;
  /** Top-three candidates the pick was drawn from (skeleton source only). */
  candidates: Array<{ id: string; runtimeS: number; fit: string; score: number }>;
};

type Rng = () => number;

function finite(n: unknown, d = 0): number {
  return typeof n === "number" && Number.isFinite(n) ? n : d;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function median(nums: number[]): number | null {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

// ─── Body extraction ───────────────────────────────────────────────────────

type BodyPassage = {
  role: string;
  phase: string;
  length: number;
  words: number;
  shortCount: number;
  shortLength: number;
  pauseAfter: number;
};

/** Passages with the silence after each; leading / trailing silence dropped. */
function bodyFromSegments(segments: SkeletonSegment[]): {
  passages: BodyPassage[];
  bodySeconds: number;
} {
  const passages: BodyPassage[] = [];
  let pendingPause = 0;
  for (const seg of segments) {
    if (seg.type === "pause") {
      pendingPause += Math.max(0, finite(seg.length));
      continue;
    }
    if (passages.length) {
      passages[passages.length - 1]!.pauseAfter += pendingPause;
    }
    pendingPause = 0;
    const lengths = (seg.short_pauses?.lengths_s ?? []).filter(
      (x) => typeof x === "number" && x > 0,
    );
    passages.push({
      role: String(seg.role || "other"),
      phase: ["opening", "main", "closing"].includes(String(seg.phase))
        ? String(seg.phase)
        : "main",
      length: Math.max(0, finite(seg.length)),
      words: Math.max(0, finite(seg.words)),
      shortCount: Math.max(0, Math.round(finite(seg.short_pauses?.count))),
      shortLength: Math.min(3.5, Math.max(0.8, median(lengths) ?? 2)),
      pauseAfter: 0,
    });
  }
  // Leading silence is dropped (the app has its own lead-in). Trailing silence
  // stays as the last passage's pause (e.g. a closing self-practice / drift-off
  // silence), capped so long music tails don't swallow the session.
  if (passages.length) {
    const last = passages[passages.length - 1]!;
    const before = passages.reduce(
      (s, p, i) => s + p.length + (i < passages.length - 1 ? p.pauseAfter : 0),
      0,
    );
    const tail = pendingPause >= SKELETON_EXTENDABLE_MIN_SECONDS ? pendingPause : 0;
    last.pauseAfter = Math.min(tail, before * (MAX_TAIL_SHARE / (1 - MAX_TAIL_SHARE)));
  }
  const bodySeconds = passages.reduce((s, p) => s + p.length + p.pauseAfter, 0);
  return { passages, bodySeconds };
}

function speechShareOf(passages: BodyPassage[], bodySeconds: number): number {
  return passages.reduce((s, p) => s + p.length, 0) / Math.max(1, bodySeconds);
}

function usable(s: HarvesterSkeleton): boolean {
  const { passages, bodySeconds } = bodyFromSegments(s.segments ?? []);
  return passages.length >= MIN_PASSAGES && bodySeconds >= MIN_BODY_SECONDS;
}

// ─── Choose ────────────────────────────────────────────────────────────────

export function rankSkeletons(
  list: HarvesterSkeleton[],
  targetSessionSeconds: number,
  /** Style profile's median speech share; outlier skeletons rank lower. */
  profileSpeechShare?: number | null,
): Array<{ skeleton: HarvesterSkeleton; score: number }> {
  const ok = list.filter(usable);
  if (!ok.length) return [];
  const shares = ok.map((s) => {
    const b = bodyFromSegments(s.segments);
    return speechShareOf(b.passages, b.bodySeconds);
  });
  const logViews = ok.map((s) => Math.log10(1 + Math.max(0, finite(s.views))));
  const logLikes = ok.map((s) => Math.log10(1 + Math.max(0, finite(s.likes))));
  const maxV = Math.max(...logViews, 1e-9);
  const maxL = Math.max(...logLikes, 1e-9);
  const hasLikes = ok.some((s) => finite(s.likes) > 0);
  const target = Math.max(60, targetSessionSeconds);
  return ok
    .map((s, i) => {
      // Lower is better: runtime distance (log ratio) dominates; primary fit and
      // popularity break ties among similarly long sessions.
      const closeness = Math.abs(Math.log(Math.max(60, s.runtime_s) / target));
      const secondary = s.fit === "primary" ? 0 : 0.25;
      const popularity =
        0.12 * (logViews[i]! / maxV) + (hasLikes ? 0.06 * (logLikes[i]! / maxL) : 0);
      const shareOff =
        typeof profileSpeechShare === "number" && profileSpeechShare > 0
          ? SPEECH_SHARE_WEIGHT * Math.abs(shares[i]! - profileSpeechShare)
          : 0;
      return { skeleton: s, score: closeness + secondary + shareOff - popularity };
    })
    .sort((a, b) => a.score - b.score);
}

// ─── Scale ─────────────────────────────────────────────────────────────────

function planPassages(
  body: BodyPassage[],
  scale: number,
  wpm: number,
): PlannedPassage[] {
  const wps = Math.max(0.5, wpm) / 60;
  return body.map((p, i) => {
    const len = p.length * scale;
    let shortCount = Math.round(p.shortCount * scale);
    // Keep at least ~4 s of speech per short gap.
    shortCount = Math.min(shortCount, Math.floor(len / (p.shortLength + 4)));
    shortCount = Math.max(0, shortCount);
    const shortSeconds = shortCount * p.shortLength;
    const speechSeconds = Math.max(0, len - shortSeconds);
    return {
      n: i + 1,
      role: p.role,
      phase: p.phase,
      words: Math.max(1, Math.round(speechSeconds * wps)),
      speechSeconds,
      shortGapCount: shortCount,
      shortGapSeconds: p.shortLength,
      pauseAfter: p.pauseAfter * scale,
    };
  });
}

/**
 * Merge passages under `minWords` into a neighbour: a same-role neighbour first
 * (same phase); if none, the smaller same-phase neighbour (role of the longer).
 */
function mergeShortPassages(
  passages: PlannedPassage[],
  minWords: number,
): {
  passages: PlannedPassage[];
  merged: number;
} {
  const out = passages.map((p) => ({ ...p }));
  let merged = 0;
  for (let guard = 0; guard < 1000; guard++) {
    let did = false;
    for (let i = 0; i < out.length; i++) {
      const p = out[i]!;
      if (p.words >= minWords) continue;
      const neighbours = [i - 1, i + 1]
        .filter((j) => j >= 0 && j < out.length)
        .filter((j) => out[j]!.phase === p.phase)
        .sort((a, b) => out[a]!.words - out[b]!.words);
      const sameRole = neighbours.filter((j) => out[j]!.role === p.role);
      const j = sameRole[0] ?? neighbours[0];
      if (j == null) continue;
      const a = out[Math.min(i, j)]!;
      const b = out[Math.max(i, j)]!;
      const combined: PlannedPassage = {
        n: a.n,
        role: a.words >= b.words ? a.role : b.role,
        phase: a.phase,
        words: a.words + b.words,
        speechSeconds: a.speechSeconds + b.speechSeconds,
        shortGapCount: a.shortGapCount + b.shortGapCount,
        shortGapSeconds:
          a.shortGapCount + b.shortGapCount > 0
            ? (a.shortGapCount * a.shortGapSeconds +
                b.shortGapCount * b.shortGapSeconds) /
              (a.shortGapCount + b.shortGapCount)
            : a.shortGapSeconds,
        // Silence between the two moves after the merged passage (silence total kept).
        pauseAfter: a.pauseAfter + b.pauseAfter,
      };
      out.splice(Math.min(i, j), 2, combined);
      merged += 1;
      did = true;
      break;
    }
    if (!did) break;
  }
  return { passages: out, merged };
}

/** Split long passages into same-role parts with a short extendable pause between. */
function splitLongPassages(
  passages: PlannedPassage[],
  wpm: number,
): { passages: PlannedPassage[]; split: number } {
  const wps = Math.max(0.5, wpm) / 60;
  const out: PlannedPassage[] = [];
  let split = 0;
  for (const p of passages) {
    if (p.words <= SPLIT_ABOVE_WORDS) {
      out.push(p);
      continue;
    }
    const k = Math.ceil(p.words / SPLIT_PART_WORDS);
    const inserted = (k - 1) * SPLIT_PAUSE_SECONDS;
    // Take the inserted silence from the following pause when it has room, else
    // from this passage's speech, so the total length is unchanged.
    let pauseAfter = p.pauseAfter;
    let speech = p.speechSeconds;
    if (pauseAfter - inserted >= SKELETON_EXTENDABLE_MIN_SECONDS) {
      pauseAfter -= inserted;
    } else {
      speech = Math.max(k * 10, speech - inserted);
    }
    const partSpeech = speech / k;
    const shortEach = Math.floor(p.shortGapCount / k);
    const shortExtra = p.shortGapCount % k;
    for (let i = 0; i < k; i++) {
      out.push({
        ...p,
        words: Math.max(1, Math.round(partSpeech * wps)),
        speechSeconds: partSpeech,
        shortGapCount: shortEach + (i < shortExtra ? 1 : 0),
        pauseAfter: i < k - 1 ? SPLIT_PAUSE_SECONDS : pauseAfter,
      });
    }
    split += k - 1;
  }
  return { passages: out, split };
}

function buildBlocks(passages: PlannedPassage[]): PlannedBlock[] {
  const blocks: PlannedBlock[] = [];
  let cur: PlannedBlock | null = null;
  const passageSeconds = (p: PlannedPassage) =>
    p.speechSeconds + p.shortGapCount * p.shortGapSeconds + p.pauseAfter;
  for (const p of passages) {
    const sec = passageSeconds(p);
    const startNew =
      !cur ||
      cur.phase !== p.phase ||
      cur.seconds + sec > BLOCK_MAX_SECONDS * 1.2;
    if (startNew) {
      cur = {
        index: blocks.length + 1,
        phase: p.phase,
        firstPassage: p.n,
        lastPassage: p.n,
        seconds: 0,
        words: 0,
        headerLine: "",
      };
      blocks.push(cur);
    }
    cur!.lastPassage = p.n;
    cur!.seconds += sec;
    cur!.words += p.words;
    // Close the block after a self-practice silence or once it is long enough.
    if (
      p.pauseAfter >= SKELETON_SELF_PRACTICE_SECONDS ||
      cur!.seconds >= BLOCK_MAX_SECONDS
    ) {
      cur = null;
    }
  }
  for (const b of blocks) {
    const min = Math.max(0.1, round1(b.seconds / 60));
    b.headerLine = `## block ${b.index} (${b.phase}) · ~${min} min · ~${b.words} words`;
  }
  return blocks;
}

function finishPlan(params: {
  style: string;
  source: SkeletonPlanSource;
  body: BodyPassage[];
  bodySeconds: number;
  targetSeconds: number;
  wpm: number;
  candidates: SkeletonPlan["candidates"];
}): SkeletonPlan {
  const { body, bodySeconds, targetSeconds, wpm } = params;
  const scale = targetSeconds / Math.max(1, bodySeconds);
  let passages = planPassages(body, scale, wpm);
  let merged = 0;
  let split = 0;
  {
    const m = mergeShortPassages(
      passages,
      scale < MERGE_WHEN_SCALE_BELOW ? MIN_PASSAGE_WORDS : TINY_PASSAGE_WORDS,
    );
    passages = m.passages;
    merged = m.merged;
  }
  if (scale >= SPLIT_WHEN_SCALE_AT_LEAST) {
    const s = splitLongPassages(passages, wpm);
    passages = s.passages;
    split = s.split;
  }
  passages = passages.map((p, i) => ({
    ...p,
    n: i + 1,
    pauseAfter: round1(p.pauseAfter),
    speechSeconds: round1(p.speechSeconds),
    shortGapSeconds: round1(p.shortGapSeconds),
  }));
  const blocks = buildBlocks(passages);

  const speechSeconds = passages.reduce((s, p) => s + p.speechSeconds, 0);
  const shortGapSeconds = passages.reduce(
    (s, p) => s + p.shortGapCount * p.shortGapSeconds,
    0,
  );
  const pauseSeconds = passages.reduce((s, p) => s + p.pauseAfter, 0);
  const total = Math.max(1, speechSeconds + shortGapSeconds + pauseSeconds);
  const phaseSeconds = (phase: string) =>
    passages
      .filter((p) => p.phase === phase)
      .reduce(
        (s, p) =>
          s + p.speechSeconds + p.shortGapCount * p.shortGapSeconds + p.pauseAfter,
        0,
      );
  const sourceSpeech = body.reduce((s, p) => s + p.length, 0);
  return {
    style: params.style,
    source: params.source,
    scale: Math.round(scale * 1000) / 1000,
    targetSeconds: Math.round(targetSeconds),
    wpm: round1(wpm),
    passages,
    blocks,
    totalWords: passages.reduce((s, p) => s + p.words, 0),
    speechSeconds: round1(speechSeconds),
    shortGapSeconds: round1(shortGapSeconds),
    pauseSeconds: round1(pauseSeconds),
    extendablePauseCount: passages.filter(
      (p) => p.pauseAfter >= SKELETON_EXTENDABLE_MIN_SECONDS,
    ).length,
    speechShare:
      Math.round(((speechSeconds + shortGapSeconds) / total) * 1000) / 1000,
    sourceSpeechShare:
      Math.round((sourceSpeech / Math.max(1, bodySeconds)) * 1000) / 1000,
    openingShare: Math.round((phaseSeconds("opening") / total) * 1000) / 1000,
    closingShare: Math.round((phaseSeconds("closing") / total) * 1000) / 1000,
    merged,
    split,
    candidates: params.candidates,
  };
}

// ─── Pacing-profile fallback ───────────────────────────────────────────────

const DEFAULT_PROFILE: PacingProfile = {
  runtime_s: { median: 900 },
  speech_share: {
    overall: { median: 0.45 },
    by_tenth: [0.7, 0.55, 0.45, 0.4, 0.35, 0.35, 0.35, 0.4, 0.45, 0.6],
  },
  passages_per_minute: { median: 1.4 },
  role_share: {
    by_passages: { breath: 0.2, body: 0.2, imagery: 0.2, instruction: 0.2, "reflection prompt": 0.1, other: 0.1 },
  },
  phases: {
    opening_fraction_of_runtime: { median: 0.1 },
    closing_fraction_of_runtime: { median: 0.08 },
  },
  self_practice_silences: { per_session: { median: 1 }, length_s: { median: 60 } },
};

/** Weighted role sequence (largest remainder) from a profile's role shares. */
function mainRoleSequence(profile: PacingProfile, n: number): string[] {
  const shares = Object.entries(profile.role_share?.by_passages ?? {}).filter(
    ([role, v]) =>
      v > 0 &&
      !["settle", "return", "close", "self-practice handover"].includes(role),
  );
  if (!shares.length || n <= 0) return Array(Math.max(0, n)).fill("instruction");
  const sum = shares.reduce((s, [, v]) => s + v, 0);
  const counts = shares.map(([role, v]) => ({
    role,
    exact: (v / sum) * n,
    count: Math.floor((v / sum) * n),
  }));
  let left = n - counts.reduce((s, c) => s + c.count, 0);
  for (const c of [...counts].sort(
    (a, b) => b.exact - b.count - (a.exact - a.count),
  )) {
    if (left <= 0) break;
    c.count += 1;
    left -= 1;
  }
  // Interleave so the same role isn't stacked: round-robin by remaining count.
  const seq: string[] = [];
  const pool = counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  while (seq.length < n && pool.some((c) => c.count > 0)) {
    for (const c of pool) {
      if (c.count > 0 && seq.length < n) {
        seq.push(c.role);
        c.count -= 1;
      }
    }
  }
  return seq;
}

/** Synthetic skeleton body (runtime = target) from a style's pacing profile. */
export function bodyFromPacingProfile(
  profile: PacingProfile,
  targetSeconds: number,
): BodyPassage[] {
  const T = Math.max(MIN_BODY_SECONDS, targetSeconds);
  const D = T / 10;
  const overall = finite(profile.speech_share?.overall?.median, 0.45);
  const byTenth = profile.speech_share?.by_tenth ?? [];
  const ppm = Math.max(0.3, finite(profile.passages_per_minute?.median, 1.4));
  const opening = finite(profile.phases?.opening_fraction_of_runtime?.median, 0.1);
  const closing = finite(profile.phases?.closing_fraction_of_runtime?.median, 0.08);
  const runtimeMedian = finite(profile.runtime_s?.median, 900);
  const spPerSession = finite(profile.self_practice_silences?.per_session?.median, 0);
  const spLen = finite(profile.self_practice_silences?.length_s?.median, 60);
  const spCount = Math.max(0, Math.round((spPerSession * T) / Math.max(60, runtimeMedian)));
  // Self-practice silences go in the main body, spread evenly (tenths 3–8).
  const spTenths = new Set<number>();
  for (let i = 0; i < spCount; i++) {
    spTenths.add(Math.min(8, 3 + Math.round(((i + 0.5) * 6) / Math.max(1, spCount)) - 1));
  }

  const slots: Array<{ phase: string; t: number; length: number; pauseAfter: number; sp: boolean }> = [];
  for (let t = 0; t < 10; t++) {
    const share = Math.min(0.95, Math.max(0.05, finite(byTenth[t], overall)));
    const n = Math.max(1, Math.round((ppm * D) / 60));
    const speech = D * share;
    let silence = D - speech;
    const hasSp = spTenths.has(t);
    const spSeconds = hasSp ? Math.min(spLen, silence * 0.8) : 0;
    silence -= spSeconds;
    for (let i = 0; i < n; i++) {
      const pos = (t + (i + 0.5) / n) / 10;
      const phase = pos < opening ? "opening" : pos > 1 - closing ? "closing" : "main";
      const last = i === n - 1;
      slots.push({
        phase,
        t,
        length: speech / n,
        pauseAfter: silence / n + (last && hasSp ? spSeconds : 0),
        sp: last && hasSp,
      });
    }
  }
  const mainCount = slots.filter((s) => s.phase === "main" && !s.sp).length;
  const mainRoles = mainRoleSequence(profile, mainCount);
  let mi = 0;
  let oi = 0;
  const closingSlots = slots.filter((s) => s.phase === "closing").length;
  let ci = 0;
  return slots.map((s) => {
    let role: string;
    if (s.phase === "opening") role = oi++ === 0 ? "settle" : "breath";
    else if (s.phase === "closing") role = ++ci === closingSlots ? "close" : "return";
    else if (s.sp) role = "self-practice handover";
    else role = mainRoles[mi++] ?? "instruction";
    return {
      role,
      phase: s.phase,
      length: s.length,
      words: 0,
      shortCount: Math.floor(s.length / 12),
      shortLength: 2,
      pauseAfter: s.pauseAfter,
    };
  });
}

// ─── Entry point ───────────────────────────────────────────────────────────

export function planSkeletonForCreate(params: {
  style: string;
  skeletons: HarvesterSkeleton[] | null | undefined;
  profile: PacingProfile | null | undefined;
  /** Chosen length (whole session) for picking by runtime. */
  targetSessionSeconds: number;
  /** Script time the skeleton body is scaled to. */
  scriptTimeSeconds: number;
  wpm: number;
  rng?: Rng;
}): SkeletonPlan {
  const rng = params.rng ?? Math.random;
  const ranked = rankSkeletons(
    params.skeletons ?? [],
    params.targetSessionSeconds,
    params.profile?.speech_share?.overall?.median ?? null,
  );
  if (ranked.length) {
    const top = ranked.slice(0, 3);
    const pick = top[Math.min(top.length - 1, Math.floor(rng() * top.length))]!;
    const s = pick.skeleton;
    const { passages, bodySeconds } = bodyFromSegments(s.segments);
    return finishPlan({
      style: params.style,
      source: {
        kind: "skeleton",
        id: s.id,
        ...(s.title ? { title: s.title } : {}),
        ...(s.channel ? { channel: s.channel } : {}),
        fit: s.fit,
        views: typeof s.views === "number" ? s.views : null,
        likes: typeof s.likes === "number" ? s.likes : null,
        runtimeS: s.runtime_s,
        bodySeconds: round1(bodySeconds),
      },
      body: passages,
      bodySeconds,
      targetSeconds: params.scriptTimeSeconds,
      wpm: params.wpm,
      candidates: top.map((c) => ({
        id: c.skeleton.id,
        runtimeS: c.skeleton.runtime_s,
        fit: c.skeleton.fit,
        score: Math.round(c.score * 1000) / 1000,
      })),
    });
  }
  const profile = params.profile ?? DEFAULT_PROFILE;
  const body = bodyFromPacingProfile(profile, params.scriptTimeSeconds);
  const bodySeconds = body.reduce((s, p) => s + p.length + p.pauseAfter, 0);
  return finishPlan({
    style: params.style,
    source: {
      kind: params.profile ? "pacing_profile" : "default_profile",
      bodySeconds: round1(bodySeconds),
    },
    body,
    bodySeconds,
    targetSeconds: params.scriptTimeSeconds,
    wpm: params.wpm,
    candidates: [],
  });
}

/** Ordered list for the prompt: block headers, passages, and the pause after each. */
export function formatSkeletonForPrompt(plan: SkeletonPlan): string {
  const lines: string[] = [];
  const byN = new Map(plan.passages.map((p) => [p.n, p]));
  for (const b of plan.blocks) {
    lines.push(b.headerLine);
    for (let n = b.firstPassage; n <= b.lastPassage; n++) {
      const p = byN.get(n)!;
      const gaps =
        p.shortGapCount > 0
          ? ` · short gaps: about ${p.shortGapCount} × <${p.shortGapSeconds}>`
          : "";
      lines.push(`P${p.n} · ${p.role} · ${p.phase} · ~${p.words} words${gaps}`);
      if (p.pauseAfter >= SKELETON_EXTENDABLE_MIN_SECONDS) {
        const sp =
          p.pauseAfter >= SKELETON_SELF_PRACTICE_SECONDS ? " (self-practice silence)" : "";
        lines.push(`  then <x ${Math.round(p.pauseAfter)}>${sp}`);
      } else if (p.pauseAfter >= 0.5) {
        lines.push(`  then <${round1(p.pauseAfter)}>`);
      }
      if (n === plan.passages.length) lines.push("  (end of script)");
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
