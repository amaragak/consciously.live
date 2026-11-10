/**
 * Per-speaker rate calibration and meditation length logs.
 * One text, one natural speed, one rate that aims every voice at the target WPM.
 * Stored on the voice-admin table. Older three-passage runs are left unread.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { coerceClaudeModel } from "./anthropic-pricing";
import { countWords } from "./script-text-metrics";
import {
  coerceDeliveryProfiles,
  defaultDeliveryProfiles,
  defaultWpmFor,
  speechShareFor,
  type DeliveryId,
  type DeliveryProfiles,
} from "./delivery-profiles";
import {
  coerceScriptTargetCorrection,
  type ScriptTargetCorrection,
} from "./script-target-correction";
import {
  coerceScriptGenerationSettings,
  correctionForModel,
  defaultScriptGenerationSettings,
  markModelCalibrated,
  setCorrectionForModel,
  type ScriptGenerationSettings,
} from "./script-generation-settings";
import type {
  CalibrationCellResult,
  StoredCalibrationBatch,
} from "./script-calibration-batch";
import { VOICE_SETTINGS_PK } from "./voice-admin";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const VOICE_CALIBRATION_PK = "VOICE_CALIBRATION";
export const VOICE_LENGTH_PK = "VOICE_LENGTH";
const PROFILES_SK = "delivery-profiles";
const CONFIG_SK = "calibration-config";
/** Per-model calibration batch meta (no full script bodies — Dynamo 400KB limit). */
const SCRIPT_CALIBRATION_SK_PREFIX = "script-calibration#";
/** One row per cell: script-calibration-cell#{model}#{delivery}#{minutes}#{briefIndex} */
const SCRIPT_CALIBRATION_CELL_SK_PREFIX = "script-calibration-cell#";

export const DEFAULT_TARGET_WPM = 100;

/** One varied passage, guided tone, no pause markers and no repeated paragraphs. */
export const DEFAULT_CALIBRATION_TEXT =
  "Let the next breath arrive without asking it to change. Notice the weight of the body where it meets the chair, and let that weight be enough. Soften the jaw, and let the tongue rest behind the teeth. If a thought appears, let it pass the way weather passes a window. Feel the ribs widen, then settle back toward the spine. There is nothing you need to finish in this moment, and nothing you need to hold onto. Allow the shoulders to drop a little further, as if a coat were sliding off. Stay with the out-breath until it ends on its own, then let the next one begin. The room can stay exactly as it is. You do not have to make the quiet louder. Notice the hands, and whether they are open or loosely closed. Either way is fine. Let the forehead smooth, and let the eyes rest in their sockets. If the mind starts a list, you can leave the list where it is. Come back to the feeling of the chair under you. Come back to the air at the nostrils, cool on the way in and warmer on the way out. A sound in the distance can be heard and left. You are not here to solve the day. You are here to sit with one breath, and then the one after it. Let the belly be soft. Let the knees be heavy. If a memory arrives, greet it and let it go on its way. The breath does not need a story. It only needs room. Notice the small pause that sometimes appears between breathing out and breathing in. You do not have to lengthen it. You only have to notice that it was there. Then the next breath comes, and you can meet it. Let the jaw stay easy. Let the tongue stay still. If the shoulders have crept up again, let them fall once more. There is no score for how still you are. Stillness is not the task. Attention is the task, and attention can be gentle. Feel the feet, even if they are far from the thought you were having. Feel the contact of the floor, or of the shoes, or of the air around the ankles. Let that contact be a place you can return to. The breath is another place. The hands are another. You can choose the one that is easiest to find. Stay there for a few breaths. When you leave, and you will leave, the return is the practice. Nothing has gone wrong when the mind wanders. The wandering is how you notice that you can come back. Let the next out-breath be a little longer than you planned, and then stop planning it. Let the ribs do what they already know. Let the shoulders stay down. Let the face stay unforced. If there is a tightness in the chest, you can name it quietly and leave it unnamed after that. Naming is enough. You do not have to change the tightness for this minute to count. The minute counts because you stayed. Feel the breath again, because the breath has been here the whole time. It did not require the words. The words are only a handrail. When the handrail ends, the breath remains. Let the last few lines be slower in your attention, even if the voice stays steady. Notice one place in the body that feels neutral, or even slightly pleasant. Rest attention there. Then include the breath in that same attention, so the body and the breath are one place. You can stay with that until the passage closes. When it closes, let the final word finish, and let the silence after it belong to the room.";


/** Text 2. Conversational, talking someone through a situation. No pause markers. */
export const DEFAULT_CALIBRATION_TEXT_2 =
  "You have been putting off the talk with Maya for three weeks. That is long enough. Sit down and say what you actually want, which is a clearer split of the weekend shifts, not a verdict on the friendship. She may hear it as criticism at first. You can tell her that you know the shop is short-staffed, and that you are not asking her to rebuild the whole rota tonight. Ask what she has already promised to other people. Then stop talking. The quiet will feel rude. It is not rude. It gives her room to answer with something specific. If she says Saturday cannot move, ask about Sunday morning instead of fighting the first refusal. You do not need a finished plan from one conversation. You need the next definite hour. Write that hour down before either of you leaves the table. If the talk slides into the old account of who founded the business, bring it back to the calendar. The story can wait until after the holiday cover, and the cover starts on the twelfth. Offer a trade. You will take the late Friday if she takes the early Monday. That is a bargain, not a complaint about her character. If she raises her voice, let the sentence end. Do not match it. Say that you still want to settle this today, and then ask what would make the next month fair from her side of the counter. Listen for a name, a day, or a task. Let the adjectives pass. Repeat the concrete part back to her, because people steady themselves when their own request is stated plainly. If she cannot name one thing, offer your trade again and put a return visit on Thursday. An open decision is allowed. A vague one is how the last three weeks disappeared. On the way home, do not invent a sharper speech. You already said the part that matters. Send a short note that records the trade and the day you will talk again. Keep it under four lines, since a long message will restart the argument in writing. If she answers with a different morning, take it unless it collides with the appointment you have already moved twice. Mention that appointment once. After that, look for another swap rather than repeating the constraint. This is ordinary logistics between two people who still want the doors to open. It is not a hearing. You can be direct and remain on her side. When you see her on the floor tomorrow, say hello the way you always have. One difficult hour does not have to follow you around the counter for the rest of the week. If a customer is waiting, serve the customer first and leave the rota where you left it. The work of the shop is still the work. The conversation has a date on it now, and that date is enough to carry until Thursday. Before Thursday, look at the rota yourself and mark the hours already fixed by deliveries. Bring that marked copy, so the talk stays on paper instead of memory. If Maya wants Jordan in the room, agree, and let Jordan hear the same trade without a private preface. Three people can still leave with one sentence written down. If the shop is too busy at the hour you chose, move the talk to the back room and shut the door. Do not hold it on the pavement. A pavement turns a practical request into a quarrel. You came to make the next month workable. End by reading the note aloud. If she corrects a day, change it while she is watching, then send the revised lines that same afternoon.";

/** Text 3. A plain reading passage. No pause markers. */
export const DEFAULT_CALIBRATION_TEXT_3 =
  "The harbour office opens at half past five, before the bakery and well before the first bus. A clerk checks the tide table against the handwritten board, then calls the night mechanic to confirm that the ferry's starboard engine kept its temperature through the dark. If the reading is high, the early crossing waits. Passengers are told at the gate, not by a rumour on the quay. The boat itself is a blunt steel thing, built to take grocery pallets and school bags in the same hold. There is a painted line where trucks must stop, and a second line for foot passengers when the ramp is wet. Crew members count heads twice, once on the ramp and once after the gate drops. The count is written in a log that stays on the boat, with the time, the wind, and the name of the person at the wheel. Most mornings the wind is a minor fact. On a day when it crosses the channel at an angle, the approach to the island berth takes an extra few minutes and the clerk adds a note for the return trip. Tickets are still sold from a window that sticks in winter. Regulars buy a strip of ten, and visitors pay for a single journey. Children under five ride without a ticket if they are with an adult, a rule printed on a card above the window and repeated, when needed, without embarrassment. Freight has its own column. A bakery order, a crate of engine parts, and the postbags from the night train are logged by weight and by destination. Nothing leaves the shed without a chalk mark. At the island, a shorter pier serves the same boat. The shop there sends back empty crates and, on Thursdays, a parcel of repaired nets. The crew do not sort the mail. They only keep it dry and hand it to the person who signs the sheet. By late morning the second crossing carries more cars than cargo. The ramp is hosed down, the log line is filled, and the engine temperature is checked again before the ropes come off. In the afternoon the pattern reverses, with school bags and shopping bags replacing the pallets. The last boat is timed so that the mechanic still has light enough to look at anything the day has complained about. Then the office locks the window, files the log, and leaves the tide table open for whoever arrives first tomorrow. Winter changes the timetable without changing the job. The first crossing slips by twenty minutes when the channel is dark, and the school run is given the second boat so that nobody is left waiting on an unlit pier. Fuel is dipped every evening and the figure is phoned to the depot, which sends a tanker only when the tank will not cover two full days. A relief skipper lives above the chandlery and can be on board in the time it takes to walk the quay. The relief signs the same log, in the same columns, and does not invent a shorter route to make up a delay. Once a month the ramp hinges are greased and the painted stop lines are touched up if the salt has lifted them. None of this is announced. It is simply how the crossing stays boring, which is what the people with shopping bags are paying for. The clerk who locks up also winds the clock in the office, because the log is useless if the times in it come from three different watches. Visitors sometimes ask why the boat does not run later. The answer is the light, and the light is the whole reason the last rope comes off when it does.";

export const DEFAULT_CALIBRATION_TEXTS: [string, string, string] = [
  DEFAULT_CALIBRATION_TEXT,
  DEFAULT_CALIBRATION_TEXT_2,
  DEFAULT_CALIBRATION_TEXT_3,
];

export type CalibrationBrand = "fish" | "speechify";

export type CalibrationConfig = {
  targetWpm: number;
  /** Text 1. Kept so a stored row from the single-text measurement still loads. */
  text: string;
  texts: [string, string, string];
};

/** One of the three texts in a measurement. Fish also keeps the plain pass, without [break]. */
export type TextMeasurement = {
  wpm: number;
  words: number;
  durationSec: number;
  audioKey: string | null;
  plainDurationSec?: number | null;
  plainAudioKey?: string | null;
  pauseCount?: number;
};

/** One finished measurement. Older ones stay in the row and are not shown. */
export type WpmSample = {
  at: string;
  by: string;
  wpm: number;
  words: number;
  durationSec: number;
  audioKey: string | null;
  texts?: TextMeasurement[];
  shortPauseSec?: number | null;
  sentencePauseSec?: number | null;
};

/** In-progress measure. One request speaks one slice, then returns. */
export type MeasureJob = {
  /** 0, 1, or 2. */
  textIndex: number;
  /** Fish speaks each text plain (0) and then with [break] (1). */
  variant: 0 | 1;
  comparePauses: boolean;
  /** Plain pass for the text currently being spoken. */
  plainDurationSec: number | null;
  plainAudioKey: string | null;
  /** Speechify only. Sentence break used for every pass of this run. */
  sentencePauseSec: number | null;
  words: number;
  durationSec: number;
  audioKey: string | null;
  startedAt: string;
  stepStartedAt?: string;
  by: string;
  runs: TextMeasurement[];
};

export type SpeakerRateDoc = {
  modelId: string;
  wpm: number | null;
  measuredAt: string | null;
  /** Text 1, so the WPM figure can play that recording. */
  audioKey: string | null;
  /** The three texts from the latest measurement. Empty on an older single-text row. */
  texts: TextMeasurement[];
  /** Fish only. Extra seconds added by one [break], from the plain and paused passes. */
  shortPauseSec: number | null;
  /** Speechify only. Sentence break the latest measurement was spoken with. */
  sentencePauseSec: number | null;
  words: number | null;
  durationSec: number | null;
  history: WpmSample[];
  error: string | null;
  /** Set only while a measurement is in progress. */
  progress: string | null;
  job: MeasureJob | null;
  updatedAt: string | null;
};

export const MEASURE_TIMEOUT_MS = 5 * 60 * 1000;
/** Six passes (plain and paused for each text) need longer than the three-text run. */
export const FISH_MEASURE_TIMEOUT_MS = 12 * 60 * 1000;

export function measureTimeoutMs(comparePauses: boolean): number {
  return comparePauses ? FISH_MEASURE_TIMEOUT_MS : MEASURE_TIMEOUT_MS;
}

export type LengthLog = {
  at: string;
  modelId: string;
  /** Claude model used for script generation (plan / sections / single). */
  claudeModel?: string;
  jobId: string;
  delivery: DeliveryId;
  requestedMinutes: number;
  actualSeconds: number;
  characters: number;
  /** Spoken words, pause markers removed. */
  words?: number;
  /** Seconds of silence the app inserted (pause markers), not the voice's own pauses. */
  pauseSeconds?: number;
  /** Length predicted before audio, after any pause scaling or revision. */
  predictedSeconds?: number;
  effectiveWpm?: number;
  paceAdjust?: number;
  style?: string;
  /** Scale on pauses of 3 s or more before audio (1 = none). */
  preAudioPauseScale?: number;
  /** Extra scale applied after the audio check (1 = none). */
  postAudioPauseScale?: number;
  postAudioScaled?: boolean;
  /** Dry voice timeline before encoding, seconds. */
  stemSeconds?: number;
  /** True when the one length revision call ran. */
  revised?: boolean;
  /** Lead-in and bed tail around the voice stem; session length = actualSeconds + this. */
  overheadSeconds?: number;
  planMs?: number;
  sectionsWriteMs?: number;
  /** Planned spoken words for the whole script. */
  targetWords?: number;
  /** Final words more than 10% under target; pauses were capped at 120%. */
  scriptShort?: boolean;
  sectionPlan?: Array<{ id: string; words: number; pauseSeconds: number }>;
  /** First draft, per section: target vs actual words and written pause seconds. */
  sectionsFirstDraft?: Array<{
    id: string;
    targetWords: number;
    words: number;
    targetPauseSeconds: number;
    pauseSeconds: number;
  }>;
  /** Sections the targeted fix changed (empty when it did not run). */
  sectionFix?: string[];
};

export type SpeakerCalibrationStatus =
  | "not_calibrated"
  | "calibrated"
  | "needs_calibration"
  | "out_of_range"
  | "drifting"
  | "failed"
  | "running";

function tableName(): string | null {
  const n = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  return n || null;
}

function requireTable(): string {
  const n = tableName();
  if (!n) throw new Error("VOICE_ADMIN_TABLE_NAME is not set");
  return n;
}

export function standardCalibrationRate(brand: CalibrationBrand): number {
  return brand === "speechify" ? 0 : 1;
}

export function speakingFactor(brand: CalibrationBrand, rate: number): number {
  if (brand === "speechify") return 1 + rate / 100;
  return rate;
}

/** Rate that would turn a measurement into the target, clamped to ±20% of standard. */
export function rateForTarget(params: {
  brand: CalibrationBrand;
  fromRate: number;
  measuredWpm: number;
  targetWpm: number;
}): { rate: number; limited: boolean } {
  const measured = params.measuredWpm > 0 ? params.measuredWpm : params.targetWpm;
  const factor =
    speakingFactor(params.brand, params.fromRate) * (params.targetWpm / measured);
  if (params.brand === "speechify") {
    const pct = (factor - 1) * 100;
    const clamped = Math.max(-20, Math.min(20, pct));
    return { rate: Math.round(clamped), limited: Math.abs(pct - clamped) > 0.4 };
  }
  const clamped = Math.max(0.8, Math.min(1.2, factor));
  return {
    rate: Math.round(clamped * 100) / 100,
    limited: Math.abs(factor - clamped) > 0.004,
  };
}

export function formatCalibrationRate(
  brand: CalibrationBrand,
  rate: number | null | undefined,
): string {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "—";
  if (brand === "speechify") {
    const n = Math.round(rate);
    if (n > 0) return `+${n}%`;
    if (n < 0) return `−${Math.abs(n)}%`;
    return "0%";
  }
  return `speed ${rate.toFixed(2)}`;
}

export function withinTargetWpm(measured: number, target: number): boolean {
  if (!(target > 0) || !(measured > 0)) return false;
  return Math.abs(measured - target) / target <= 0.03;
}

function clampTarget(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_TARGET_WPM;
  return Math.max(40, Math.min(220, Math.round(n)));
}

function threeTexts(raw: unknown, legacyText: unknown): [string, string, string] {
  const stored = Array.isArray(raw)
    ? raw.map((item) => (typeof item === "string" ? item.trim() : ""))
    : [];
  const first =
    stored[0] ||
    (typeof legacyText === "string" ? legacyText.trim() : "") ||
    DEFAULT_CALIBRATION_TEXTS[0];
  return [
    first,
    stored[1] || DEFAULT_CALIBRATION_TEXTS[1],
    stored[2] || DEFAULT_CALIBRATION_TEXTS[2],
  ];
}

export async function loadCalibrationConfig(): Promise<CalibrationConfig> {
  const table = tableName();
  if (!table) {
    return {
      targetWpm: DEFAULT_TARGET_WPM,
      text: DEFAULT_CALIBRATION_TEXTS[0],
      texts: [...DEFAULT_CALIBRATION_TEXTS],
    };
  }
  const out = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: VOICE_SETTINGS_PK, sk: CONFIG_SK },
    }),
  );
  const item = out.Item;
  const texts = threeTexts(item?.texts, item?.text);
  return { targetWpm: clampTarget(Number(item?.targetWpm)), text: texts[0], texts };
}

export async function saveCalibrationConfig(params: {
  targetWpm?: number;
  text?: string;
  texts?: unknown;
}): Promise<CalibrationConfig> {
  const prev = await loadCalibrationConfig();
  const incoming = Array.isArray(params.texts) ? params.texts : null;
  const texts: [string, string, string] = incoming
    ? [
        typeof incoming[0] === "string" && incoming[0].trim() ? incoming[0].trim() : prev.texts[0],
        typeof incoming[1] === "string" && incoming[1].trim() ? incoming[1].trim() : prev.texts[1],
        typeof incoming[2] === "string" && incoming[2].trim() ? incoming[2].trim() : prev.texts[2],
      ]
    : [...prev.texts];
  if (!incoming && typeof params.text === "string" && params.text.trim()) {
    texts[0] = params.text.trim();
  }
  for (const passage of texts) {
    if (countWords(passage) < 40) {
      throw new Error("Each measurement text needs at least 40 words");
    }
  }
  const next: CalibrationConfig = {
    targetWpm:
      params.targetWpm == null ? prev.targetWpm : clampTarget(params.targetWpm),
    text: texts[0],
    texts,
  };
  await ddb.send(
    new PutCommand({
      TableName: requireTable(),
      Item: {
        pk: VOICE_SETTINGS_PK,
        sk: CONFIG_SK,
        targetWpm: next.targetWpm,
        text: next.text,
        texts: next.texts,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  return next;
}

function emptyDoc(modelId: string): SpeakerRateDoc {
  return {
    modelId,
    wpm: null,
    measuredAt: null,
    audioKey: null,
    texts: [],
    shortPauseSec: null,
    sentencePauseSec: null,
    words: null,
    durationSec: null,
    history: [],
    error: null,
    progress: null,
    job: null,
    updatedAt: null,
  };
}

function numOrNull(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function coerceHistory(raw: unknown): WpmSample[] {
  if (!Array.isArray(raw)) return [];
  const out: WpmSample[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const wpm = numOrNull(o.wpm);
    if (wpm == null || wpm <= 0) continue;
    out.push({
      at: typeof o.at === "string" ? o.at : "",
      by: typeof o.by === "string" ? o.by : "",
      wpm,
      words: Math.max(0, Number(o.words) || 0),
      durationSec: Math.max(0, Number(o.durationSec) || 0),
      audioKey: typeof o.audioKey === "string" && o.audioKey ? o.audioKey : null,
      texts: coerceRuns(o.texts),
      shortPauseSec: numOrNull(o.shortPauseSec),
      sentencePauseSec: numOrNull(o.sentencePauseSec),
    });
  }
  return out.slice(0, 40);
}

function coerceRuns(raw: unknown): TextMeasurement[] {
  if (!Array.isArray(raw)) return [];
  const out: TextMeasurement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const wpm = numOrNull(o.wpm);
    if (wpm == null || wpm <= 0) continue;
    out.push({
      wpm,
      words: Math.max(0, Number(o.words) || 0),
      durationSec: Math.max(0, Number(o.durationSec) || 0),
      audioKey: typeof o.audioKey === "string" && o.audioKey ? o.audioKey : null,
      plainDurationSec: numOrNull(o.plainDurationSec),
      plainAudioKey:
        typeof o.plainAudioKey === "string" && o.plainAudioKey ? o.plainAudioKey : null,
      pauseCount: Math.max(0, Number(o.pauseCount) || 0),
    });
  }
  return out;
}

function coerceJob(raw: unknown): MeasureJob | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const startedAt = typeof o.startedAt === "string" ? o.startedAt : "";
  if (!startedAt) return null;
  const textIndex = Math.max(0, Math.min(2, Math.round(Number(o.textIndex) || 0)));
  const variant = Number(o.variant) === 1 ? 1 : 0;
  return {
    textIndex,
    variant,
    comparePauses: o.comparePauses === true,
    plainDurationSec: numOrNull(o.plainDurationSec),
    plainAudioKey: typeof o.plainAudioKey === "string" && o.plainAudioKey ? o.plainAudioKey : null,
    sentencePauseSec: numOrNull(o.sentencePauseSec),
    words: Math.max(0, Number(o.words) || 0),
    durationSec: Math.max(0, Number(o.durationSec) || 0),
    audioKey: typeof o.audioKey === "string" && o.audioKey ? o.audioKey : null,
    startedAt,
    ...(typeof o.stepStartedAt === "string" && o.stepStartedAt
      ? { stepStartedAt: o.stepStartedAt }
      : {}),
    by: typeof o.by === "string" ? o.by : "",
    runs: coerceRuns(o.runs),
  };
}

function coerceDoc(modelId: string, raw: unknown): SpeakerRateDoc {
  const base = emptyDoc(modelId);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const version = Number(o.version);
  if (version !== 2 && version !== 3) return base;
  return {
    modelId,
    wpm: numOrNull(o.wpm),
    measuredAt: typeof o.measuredAt === "string" ? o.measuredAt : null,
    audioKey: typeof o.audioKey === "string" && o.audioKey ? o.audioKey : null,
    texts: coerceRuns(o.texts),
    shortPauseSec: numOrNull(o.shortPauseSec),
    sentencePauseSec: numOrNull(o.sentencePauseSec),
    words: numOrNull(o.words),
    durationSec: numOrNull(o.durationSec),
    history: coerceHistory(o.history),
    error: typeof o.error === "string" && o.error ? o.error : null,
    progress: typeof o.progress === "string" && o.progress ? o.progress : null,
    job: coerceJob(o.job),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : null,
  };
}

/** A measurement still open after its limit is a failure. Fish has six passes, so twelve minutes. */
export function expireStaleMeasure(doc: SpeakerRateDoc, now = Date.now()): SpeakerRateDoc {
  const started = doc.job?.startedAt ? Date.parse(doc.job.startedAt) : NaN;
  if (!doc.job || !Number.isFinite(started)) return doc;
  const limit = measureTimeoutMs(doc.job.comparePauses);
  if (now - started < limit) return doc;
  const minutes = Math.round(limit / 60_000);
  return {
    ...doc,
    job: null,
    progress: null,
    error: `Measurement did not finish within ${minutes} minutes`,
  };
}

async function putDoc(doc: SpeakerRateDoc): Promise<SpeakerRateDoc> {
  const updatedAt = new Date().toISOString();
  const next = { ...doc, updatedAt, history: doc.history.slice(0, 20) };
  await ddb.send(
    new PutCommand({
      TableName: requireTable(),
      Item: {
        pk: VOICE_CALIBRATION_PK,
        sk: doc.modelId,
        version: 3,
        ...next,
      },
    }),
  );
  return next;
}

export async function loadCalibration(modelId: string): Promise<SpeakerRateDoc> {
  const table = tableName();
  if (!table || !modelId) return emptyDoc(modelId);
  const out = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: VOICE_CALIBRATION_PK, sk: modelId },
    }),
  );
  return coerceDoc(modelId, out.Item);
}

export async function saveCalibration(doc: SpeakerRateDoc): Promise<SpeakerRateDoc> {
  return putDoc(doc);
}

/** Clears an open measurement so the next page load does not continue it. */
export async function cancelCalibration(modelId: string): Promise<SpeakerRateDoc> {
  const doc = await loadCalibration(modelId);
  if (!doc.job) return doc;
  doc.job = null;
  doc.progress = null;
  doc.error = "Stopped";
  return saveCalibration(doc);
}

export async function loadAllCalibrations(): Promise<SpeakerRateDoc[]> {
  const table = tableName();
  if (!table) return [];
  const out: SpeakerRateDoc[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": VOICE_CALIBRATION_PK },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of page.Items ?? []) {
      const modelId = typeof item.modelId === "string" ? item.modelId : String(item.sk ?? "");
      if (modelId) out.push(coerceDoc(modelId, item));
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return out;
}

export type ProfileRecord = {
  profiles: DeliveryProfiles;
  /** v9+v2: script model + per-model correction factors. */
  scriptGeneration: ScriptGenerationSettings;
  /** Convenience: factors for the currently selected script model. */
  targetCorrection: ScriptTargetCorrection;
  updatedAt: string | null;
  updatedBy: string | null;
  history: Array<{ at: string; by: string; note: string }>;
};

export async function loadDeliveryProfileRecord(): Promise<ProfileRecord> {
  const table = tableName();
  if (!table) {
    const scriptGeneration = defaultScriptGenerationSettings();
    return {
      profiles: defaultDeliveryProfiles(),
      scriptGeneration,
      targetCorrection:
        scriptGeneration.targetCorrectionByModel[scriptGeneration.scriptModelId]!,
      updatedAt: null,
      updatedBy: null,
      history: [],
    };
  }
  const out = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: VOICE_SETTINGS_PK, sk: PROFILES_SK },
    }),
  );
  const item = out.Item;
  const history = Array.isArray(item?.history)
    ? (item.history as ProfileRecord["history"]).slice(0, 30)
    : [];
  const scriptGeneration = coerceScriptGenerationSettings(
    item?.scriptGeneration,
    item?.targetCorrection,
  );
  return {
    profiles: coerceDeliveryProfiles(item?.profiles),
    scriptGeneration,
    targetCorrection:
      scriptGeneration.targetCorrectionByModel[scriptGeneration.scriptModelId] ??
      coerceScriptTargetCorrection(undefined),
    updatedAt: typeof item?.updatedAt === "string" ? item.updatedAt : null,
    updatedBy: typeof item?.updatedBy === "string" ? item.updatedBy : null,
    history,
  };
}

export async function saveDeliveryProfileRecord(params: {
  profiles: unknown;
  targetCorrection?: unknown;
  scriptGeneration?: unknown;
  by: string;
  note?: string;
}): Promise<ProfileRecord> {
  const prev = await loadDeliveryProfileRecord();
  const profiles = coerceDeliveryProfiles(params.profiles);
  let scriptGeneration = coerceScriptGenerationSettings(
    params.scriptGeneration ?? prev.scriptGeneration,
    params.targetCorrection ?? prev.targetCorrection,
  );
  // Saving flat factors for the selected model (admin UI) updates that model's bucket.
  if (params.targetCorrection !== undefined && params.scriptGeneration === undefined) {
    scriptGeneration = setCorrectionForModel(
      scriptGeneration,
      scriptGeneration.scriptModelId,
      coerceScriptTargetCorrection(params.targetCorrection),
    );
  }
  const at = new Date().toISOString();
  const history = [
    { at, by: params.by, note: params.note?.trim() || "Saved delivery profiles" },
    ...prev.history,
  ].slice(0, 30);
  const targetCorrection =
    scriptGeneration.targetCorrectionByModel[scriptGeneration.scriptModelId] ??
    coerceScriptTargetCorrection(undefined);
  await ddb.send(
    new PutCommand({
      TableName: requireTable(),
      Item: {
        pk: VOICE_SETTINGS_PK,
        sk: PROFILES_SK,
        profiles,
        scriptGeneration,
        // Legacy flat field kept in sync for older readers.
        targetCorrection,
        updatedAt: at,
        updatedBy: params.by,
        history,
      },
    }),
  );
  return {
    profiles,
    scriptGeneration,
    targetCorrection,
    updatedAt: at,
    updatedBy: params.by,
    history,
  };
}

/** Persist learned correction factors for a specific Claude model. */
export async function saveTargetCorrection(params: {
  targetCorrection: ScriptTargetCorrection;
  /** Claude model id these factors belong to. Defaults to the selected script model. */
  claudeModelId?: string;
  /** When true, mark the model as calibrated. */
  markCalibrated?: boolean;
  by?: string;
}): Promise<ScriptTargetCorrection> {
  const prev = await loadDeliveryProfileRecord();
  const modelId = params.claudeModelId?.trim() || prev.scriptGeneration.scriptModelId;
  let scriptGeneration = setCorrectionForModel(
    prev.scriptGeneration,
    modelId,
    params.targetCorrection,
  );
  if (params.markCalibrated !== false) {
    scriptGeneration = markModelCalibrated(scriptGeneration, modelId);
  }
  const at = new Date().toISOString();
  const by = params.by?.trim() || "system";
  const targetCorrection =
    scriptGeneration.targetCorrectionByModel[scriptGeneration.scriptModelId] ??
    coerceScriptTargetCorrection(params.targetCorrection);
  await ddb.send(
    new PutCommand({
      TableName: requireTable(),
      Item: {
        pk: VOICE_SETTINGS_PK,
        sk: PROFILES_SK,
        profiles: prev.profiles,
        scriptGeneration,
        targetCorrection,
        updatedAt: at,
        updatedBy: by,
        history: prev.history,
      },
    }),
  );
  return coerceScriptTargetCorrection(params.targetCorrection);
}

export {
  correctionForModel,
  type ScriptGenerationSettings,
};

function scriptCalibrationSk(modelId: string): string {
  return `${SCRIPT_CALIBRATION_SK_PREFIX}${coerceClaudeModel(modelId)}`;
}

function scriptCalibrationCellSk(
  modelId: string,
  delivery: DeliveryId,
  minutes: number,
  briefIndex: number,
): string {
  return `${SCRIPT_CALIBRATION_CELL_SK_PREFIX}${coerceClaudeModel(modelId)}#${delivery}#${minutes}#${briefIndex}`;
}

/** Meta row only — no full script bodies (avoids Dynamo 400KB limit). */
function slimCellForMeta(c: CalibrationCellResult): CalibrationCellResult {
  return {
    ...c,
    scriptText: "",
    sections: (c.sections ?? []).map((s) => ({
      name: s.name,
      intention: s.intention,
      targetWords: s.targetWords,
      writtenWords: s.writtenWords,
      plannedPauseSeconds: s.plannedPauseSeconds,
      writtenPauseSeconds: s.writtenPauseSeconds,
      // drop per-section text from meta
    })),
  };
}

/** Save one calibration cell immediately (resume-safe; one item ≈ one script). */
export async function saveScriptCalibrationCell(params: {
  modelId: string;
  cell: CalibrationCellResult;
  runId?: string;
}): Promise<void> {
  const modelId = coerceClaudeModel(params.modelId);
  const cell = params.cell;
  await ddb.send(
    new PutCommand({
      TableName: requireTable(),
      Item: {
        pk: VOICE_SETTINGS_PK,
        sk: scriptCalibrationCellSk(
          modelId,
          cell.delivery,
          cell.minutes,
          cell.briefIndex,
        ),
        modelId,
        runId: params.runId ?? null,
        delivery: cell.delivery,
        minutes: cell.minutes,
        briefIndex: cell.briefIndex,
        cell,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}

/** Load all saved cells for a model (for resume / finalize). */
export async function loadScriptCalibrationCells(
  modelId: string,
): Promise<CalibrationCellResult[]> {
  const table = tableName();
  if (!table) return [];
  const id = coerceClaudeModel(modelId);
  const prefix = `${SCRIPT_CALIBRATION_CELL_SK_PREFIX}${id}#`;
  const cells: CalibrationCellResult[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: {
          ":pk": VOICE_SETTINGS_PK,
          ":sk": prefix,
        },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of page.Items ?? []) {
      if (item.cell && typeof item.cell === "object") {
        cells.push(item.cell as CalibrationCellResult);
      }
    }
    startKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return cells.sort((a, b) => {
    const ka = `${a.delivery}|${String(a.minutes).padStart(2, "0")}|${a.briefIndex}`;
    const kb = `${b.delivery}|${String(b.minutes).padStart(2, "0")}|${b.briefIndex}`;
    return ka.localeCompare(kb);
  });
}

export type CalibrationProgress = {
  completedKeys: string[];
  completedCount: number;
  cells: CalibrationCellResult[];
};

export function calibrationCellKey(
  delivery: string,
  minutes: number,
  briefIndex: number,
): string {
  return `${delivery}|${minutes}|${briefIndex}`;
}

/** Load last calibration batch meta (+ optional cells from per-cell rows). */
export async function loadScriptCalibrationBatch(
  modelId: string,
  opts?: { includeCells?: boolean },
): Promise<StoredCalibrationBatch | null> {
  const table = tableName();
  if (!table) return null;
  const id = coerceClaudeModel(modelId);
  const out = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: VOICE_SETTINGS_PK, sk: scriptCalibrationSk(id) },
    }),
  );
  const item = out.Item;
  const cells =
    opts?.includeCells === false
      ? []
      : await loadScriptCalibrationCells(id);
  if (!item || typeof item !== "object") {
    if (!cells.length) return null;
    return {
      modelId: id,
      ranAt: "",
      briefs: [],
      medianWpm: 0,
      cells,
      factors: coerceScriptTargetCorrection(undefined),
      failures: [],
      diversions: [],
    };
  }
  // Legacy: cells embedded on meta (may be empty after slim save).
  const legacyCells = Array.isArray(item.cells)
    ? (item.cells as StoredCalibrationBatch["cells"])
    : [];
  return {
    modelId: typeof item.modelId === "string" ? item.modelId : id,
    ranAt: typeof item.ranAt === "string" ? item.ranAt : "",
    briefs: Array.isArray(item.briefs)
      ? item.briefs.filter((x: unknown): x is string => typeof x === "string")
      : [],
    medianWpm:
      typeof item.medianWpm === "number" && Number.isFinite(item.medianWpm)
        ? item.medianWpm
        : 0,
    cells: cells.length ? cells : legacyCells,
    factors: coerceScriptTargetCorrection(item.factors),
    failures: Array.isArray(item.failures)
      ? (item.failures as StoredCalibrationBatch["failures"])
      : [],
    diversions: Array.isArray(item.diversions)
      ? (item.diversions as StoredCalibrationBatch["diversions"])
      : [],
  };
}

/**
 * Persist batch meta without full script bodies. Cells are already stored
 * one-per-item via saveScriptCalibrationCell.
 */
export async function saveScriptCalibrationBatch(
  batch: StoredCalibrationBatch,
): Promise<StoredCalibrationBatch> {
  const modelId = coerceClaudeModel(batch.modelId);
  // Ensure each cell is on its own row (resume / inspect).
  for (const cell of batch.cells) {
    await saveScriptCalibrationCell({ modelId, cell, runId: batch.ranAt });
  }
  const slimCells = batch.cells.map(slimCellForMeta);
  await ddb.send(
    new PutCommand({
      TableName: requireTable(),
      Item: {
        pk: VOICE_SETTINGS_PK,
        sk: scriptCalibrationSk(modelId),
        modelId,
        ranAt: batch.ranAt,
        briefs: batch.briefs,
        medianWpm: batch.medianWpm,
        // Slim measures only — full scriptText lives on cell rows.
        cells: slimCells,
        cellCount: batch.cells.length,
        factors: batch.factors,
        failures: batch.failures,
        diversions: batch.diversions ?? [],
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  return { ...batch, modelId };
}

export async function logMeditationLength(entry: LengthLog): Promise<void> {
  const table = tableName();
  if (!table || !entry.modelId || !entry.jobId) return;
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk: VOICE_LENGTH_PK,
        sk: `${entry.at}#${entry.modelId}#${entry.jobId}`,
        ...entry,
      },
    }),
  );
}

function optNum(item: Record<string, unknown>, key: string): Record<string, number> {
  const n = Number(item[key]);
  return item[key] != null && Number.isFinite(n) ? { [key]: n } : {};
}

export async function loadRecentLengthLogs(days = 90): Promise<LengthLog[]> {
  const table = tableName();
  if (!table) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const out: LengthLog[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk AND sk >= :since",
        ExpressionAttributeValues: { ":pk": VOICE_LENGTH_PK, ":since": since },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of page.Items ?? []) {
      const delivery = item.delivery;
      if (delivery !== "casual" && delivery !== "guided" && delivery !== "open_sits") continue;
      const requestedMinutes = Number(item.requestedMinutes);
      const actualSeconds = Number(item.actualSeconds);
      if (!Number.isFinite(requestedMinutes) || !Number.isFinite(actualSeconds)) continue;
      const words = Number(item.words);
      const pauseSeconds = Number(item.pauseSeconds);
      out.push({
        at: String(item.at ?? ""),
        modelId: String(item.modelId ?? ""),
        ...(typeof item.claudeModel === "string" && item.claudeModel.trim()
          ? { claudeModel: item.claudeModel.trim() }
          : {}),
        jobId: String(item.jobId ?? ""),
        delivery,
        requestedMinutes,
        actualSeconds,
        characters: Number(item.characters) || 0,
        ...(Number.isFinite(words) && words > 0 ? { words } : {}),
        ...(Number.isFinite(pauseSeconds) && pauseSeconds >= 0 ? { pauseSeconds } : {}),
        ...optNum(item, "predictedSeconds"),
        ...optNum(item, "effectiveWpm"),
        ...optNum(item, "paceAdjust"),
        ...optNum(item, "preAudioPauseScale"),
        ...optNum(item, "postAudioPauseScale"),
        ...optNum(item, "stemSeconds"),
        ...optNum(item, "overheadSeconds"),
        ...optNum(item, "planMs"),
        ...optNum(item, "sectionsWriteMs"),
        ...(typeof item.style === "string" ? { style: item.style } : {}),
        ...(typeof item.postAudioScaled === "boolean" ? { postAudioScaled: item.postAudioScaled } : {}),
        ...(typeof item.revised === "boolean" ? { revised: item.revised } : {}),
        ...optNum(item, "targetWords"),
        ...(typeof item.scriptShort === "boolean" ? { scriptShort: item.scriptShort } : {}),
        ...(Array.isArray(item.sectionPlan)
          ? { sectionPlan: item.sectionPlan as NonNullable<LengthLog["sectionPlan"]> }
          : {}),
        ...(Array.isArray(item.sectionsFirstDraft)
          ? {
              sectionsFirstDraft: item.sectionsFirstDraft as NonNullable<
                LengthLog["sectionsFirstDraft"]
              >,
            }
          : {}),
        ...(Array.isArray(item.sectionFix)
          ? { sectionFix: (item.sectionFix as unknown[]).map(String) }
          : {}),
      });
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return out;
}

/** Rolling pace of recent meditations: words ÷ (duration − silence the app inserted). */
export function realWpmStats(
  logs: LengthLog[],
  modelId: string,
): { wpm: number | null; count: number; drifting: boolean; target: number } {
  const rows = logs
    .filter((log) => log.modelId === modelId && typeof log.words === "number" && log.words > 0)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 10);
  if (rows.length < 3) {
    return { wpm: null, count: rows.length, drifting: false, target: 0 };
  }
  const values = rows.map((log) => {
    const speech = Math.max(1, log.actualSeconds - Math.max(0, log.pauseSeconds ?? 0));
    return (log.words as number) / (speech / 60);
  });
  const avg = values.reduce((sum, n) => sum + n, 0) / values.length;
  return {
    wpm: Math.round(avg),
    count: rows.length,
    drifting: false,
    target: avg,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** WPM of the Fish pass spoken with no [break]. */
function plainTextWpm(text: TextMeasurement): number | null {
  const plain = text.plainDurationSec;
  if (plain == null || !(plain > 0) || !(text.words > 0)) return null;
  return round1(text.words / (plain / 60));
}

export function describeSpeaker(doc: SpeakerRateDoc): {
  wpm: number | null;
  measuredAt: string | null;
  measuring: boolean;
  error: string | null;
  progress: string | null;
  /** WPM of each text in the latest measurement. Fish uses the pass that includes [break]. */
  texts: number[];
  /** Fish only. Average WPM of the three texts spoken with no [break]. */
  plainWpm: number | null;
  /** Fish only. Plain WPM of each text, text 1 first. */
  plainTexts: number[];
  /** Fish only. Estimated seconds added by one [break]. */
  shortPauseSec: number | null;
  /** Speechify only. Sentence break the latest measurement used. */
  sentencePauseSec: number | null;
} {
  const plainTexts = doc.texts.flatMap((text) => {
    const wpm = plainTextWpm(text);
    return wpm != null && wpm > 0 ? [wpm] : [];
  });
  const plainWpm = plainTexts.length
    ? round1(plainTexts.reduce((sum, n) => sum + n, 0) / plainTexts.length)
    : null;
  return {
    wpm: doc.wpm,
    measuredAt: doc.measuredAt,
    measuring: Boolean(doc.job),
    error: doc.job ? null : doc.error,
    progress: doc.job ? doc.progress ?? "Measuring… 1/3" : null,
    texts: doc.texts.map((text) => text.wpm).filter((wpm) => wpm > 0),
    plainWpm,
    plainTexts,
    shortPauseSec: doc.shortPauseSec,
    sentencePauseSec: doc.sentencePauseSec,
  };
}

/** Script budgets use the one target WPM. Speech share still comes from the delivery. */
export function resolveScriptPacing(params: {
  profiles: DeliveryProfiles;
  targetWpm: number;
  delivery: DeliveryId;
}): { wpm: number; speechShare: number } {
  const wpm =
    params.targetWpm > 0
      ? params.targetWpm
      : defaultWpmFor(params.profiles, params.delivery);
  return {
    wpm,
    speechShare: speechShareFor(params.profiles, params.delivery, wpm),
  };
}
