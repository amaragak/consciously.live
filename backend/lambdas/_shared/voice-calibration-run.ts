/**
 * One measurement step: speak the next slice of the measurement text at the
 * provider's standard settings and record words ÷ total audio duration.
 * Each call stays small enough for the API Gateway timeout.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getMp3DurationSeconds } from "./script-segment-audio";
import { countWords } from "./script-text-metrics";
import {
  expireStaleMeasure,
  loadCalibration,
  loadCalibrationConfig,
  measureTimeoutMs,
  saveCalibration,
  type SpeakerRateDoc,
  type TextMeasurement,
} from "./voice-calibration-store";

const execFileAsync = promisify(execFile);
/** Short enough that TTS plus ffmpeg returns inside the API Gateway limit. */
const CHUNK_WORDS = 40;
/** A second request waits while the first chunk is still speaking. */
const STEP_LOCK_MS = 90_000;

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

function wordSurfaces(text: string): string[] {
  const matches = [...text.matchAll(/[a-z0-9']+/gi)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const nextStart =
      index + 1 < matches.length ? (matches[index + 1]?.index ?? text.length) : text.length;
    return text.slice(start, nextStart).trim().replace(/\s+/g, " ");
  });
}

function nextSlice(
  script: string,
  doneWords: number,
): { text: string; words: number } | null {
  const spans = wordSurfaces(script);
  if (doneWords >= spans.length) return null;
  const slice = spans.slice(doneWords, doneWords + CHUNK_WORDS);
  if (!slice.length) return null;
  return { text: slice.join(" "), words: slice.length };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A sentence end followed by more text, closing quotes or brackets included. */
const SENTENCE_GAP_RE = /(?<!\d)([.!?]["'”’)]*)\s+(?=\S)/g;
const ENDS_SENTENCE_RE = /(?<!\d)[.!?]["'”’)]*$/;

/** Every place a Fish [break] goes: before each sentence after the first. */
function fishPauseCount(text: string): number {
  return text.match(SENTENCE_GAP_RE)?.length ?? 0;
}

/** Fish documents [break] before the phrase it delays, so it opens each following sentence. */
function withFishBreaks(script: string, doneWords: number, sliceText: string): string {
  const tagged = sliceText.replace(SENTENCE_GAP_RE, "$1 [break] ");
  if (doneWords <= 0) return tagged;
  const previous = wordSurfaces(script)[doneWords - 1] ?? "";
  return ENDS_SENTENCE_RE.test(previous) ? `[break] ${tagged}` : tagged;
}

function progressLabel(textIndex: number, variant: 0 | 1, comparePauses: boolean): string {
  const perText = comparePauses ? 2 : 1;
  const n = textIndex * perText + (comparePauses ? variant + 1 : 1);
  const total = comparePauses ? 6 : 3;
  return `Measuring… ${n}/${total}`;
}

/** Extra seconds one [break] added, across every text that got longer with the tag. */
function guessShortPause(runs: TextMeasurement[]): number | null {
  let extra = 0;
  let count = 0;
  for (const run of runs) {
    const plain = run.plainDurationSec;
    const pauses = run.pauseCount ?? 0;
    if (plain == null || pauses <= 0) continue;
    const delta = run.durationSec - plain;
    if (!(delta > 0)) continue;
    extra += delta;
    count += pauses;
  }
  if (count <= 0) return null;
  return round2(extra / count);
}

function resetPass(job: NonNullable<SpeakerRateDoc["job"]>): void {
  job.words = 0;
  job.durationSec = 0;
  job.audioKey = null;
  job.stepStartedAt = undefined;
}

/** Closes the pass just spoken. Returns true when the whole measurement is stored. */
function closeCurrentText(doc: SpeakerRateDoc, script: string): boolean {
  const job = doc.job;
  if (!job) return true;
  const minutes = job.durationSec / 60;
  const wpm = minutes > 0 ? round1(job.words / minutes) : 0;
  if (wpm < 1) {
    doc.error = "Could not measure a speaking rate";
    doc.job = null;
    doc.progress = null;
    return true;
  }
  if (job.comparePauses && job.variant === 0) {
    job.plainDurationSec = round1(job.durationSec);
    job.plainAudioKey = job.audioKey;
    job.variant = 1;
    resetPass(job);
    doc.progress = progressLabel(job.textIndex, job.variant, true);
    return false;
  }
  const run: TextMeasurement = {
    wpm,
    words: job.words,
    durationSec: round1(job.durationSec),
    audioKey: job.audioKey,
  };
  if (job.comparePauses) {
    run.plainDurationSec = job.plainDurationSec;
    run.plainAudioKey = job.plainAudioKey;
    run.pauseCount = fishPauseCount(script);
  }
  job.runs = [...job.runs, run];
  if (job.textIndex < 2) {
    job.textIndex += 1;
    job.variant = 0;
    job.plainDurationSec = null;
    job.plainAudioKey = null;
    resetPass(job);
    doc.progress = progressLabel(job.textIndex, job.variant, job.comparePauses);
    return false;
  }
  const wpms = job.runs.map((item) => item.wpm);
  const average = wpms.length ? round1(wpms.reduce((sum, n) => sum + n, 0) / wpms.length) : 0;
  if (average < 1 || wpms.some((n) => n < 1)) {
    doc.error = "Could not measure a speaking rate";
    doc.job = null;
    doc.progress = null;
    return true;
  }
  const at = new Date().toISOString();
  doc.wpm = average;
  doc.measuredAt = at;
  doc.texts = job.runs;
  doc.audioKey = job.runs[0]?.audioKey ?? null;
  doc.words = job.runs.reduce((sum, item) => sum + item.words, 0);
  doc.durationSec = round1(job.runs.reduce((sum, item) => sum + item.durationSec, 0));
  doc.shortPauseSec = job.comparePauses ? guessShortPause(job.runs) : null;
  doc.sentencePauseSec = job.sentencePauseSec;
  doc.error = null;
  doc.progress = null;
  doc.history = [
    {
      at,
      by: job.by,
      wpm: average,
      words: doc.words,
      durationSec: doc.durationSec,
      audioKey: doc.audioKey,
      texts: job.runs,
      shortPauseSec: doc.shortPauseSec,
      sentencePauseSec: doc.sentencePauseSec,
    },
    ...doc.history,
  ].slice(0, 40);
  doc.job = null;
  return true;
}

export async function stepVoiceCalibration(params: {
  modelId: string;
  by: string;
  /** Fish speaks each text twice so the extra time can be blamed on [break]. */
  comparePauses?: boolean;
  /** Sentence break to use when a new run starts. The run keeps it to the end. */
  sentencePauseSec?: number | null;
  synthesize: (text: string, sentencePauseSec: number | null) => Promise<Buffer>;
  s3: S3Client;
  bucket: string;
}): Promise<{ doc: SpeakerRateDoc; done: boolean; busy?: boolean }> {
  let doc = await loadCalibration(params.modelId);
  const expired = expireStaleMeasure(doc);
  if (expired !== doc) {
    await saveCalibration(expired);
    return { doc: expired, done: true };
  }
  doc = expired;
  const config = await loadCalibrationConfig();
  const comparePauses = doc.job?.comparePauses ?? params.comparePauses === true;
  const existingStartedAt = doc.job?.startedAt ?? null;
  if (!doc.job) {
    doc.job = {
      textIndex: 0,
      variant: 0,
      comparePauses,
      plainDurationSec: null,
      plainAudioKey: null,
      sentencePauseSec: params.sentencePauseSec ?? null,
      words: 0,
      durationSec: 0,
      audioKey: null,
      startedAt: new Date().toISOString(),
      by: params.by,
      runs: [],
    };
    doc.error = null;
    doc.progress = progressLabel(0, 0, comparePauses);
  }
  const job = doc.job;
  let persisted = existingStartedAt === job.startedAt;
  /** A stop clears the stored job. Ignore a chunk that finished after that. */
  const keepGoing = async (): Promise<boolean> => {
    if (!persisted) return true;
    const fresh = await loadCalibration(params.modelId);
    if (!fresh.job || fresh.job.startedAt !== job.startedAt) {
      doc = fresh;
      return false;
    }
    return true;
  };
  const age = Date.now() - Date.parse(job.startedAt);
  if (Number.isFinite(age) && age >= measureTimeoutMs(job.comparePauses)) {
    doc = expireStaleMeasure(doc);
    await saveCalibration(doc);
    return { doc, done: true };
  }

  const lockAge = job.stepStartedAt
    ? Date.now() - Date.parse(job.stepStartedAt)
    : Number.POSITIVE_INFINITY;
  if (Number.isFinite(lockAge) && lockAge >= 0 && lockAge < STEP_LOCK_MS) {
    return { doc, done: false, busy: true };
  }

  const script = config.texts[job.textIndex] ?? "";
  if (countWords(script) < 40) throw new Error("Each measurement text needs at least 40 words");
  const slice = nextSlice(script, job.words);
  if (!slice) {
    if (!(await keepGoing())) return { doc, done: true };
    const done = closeCurrentText(doc, script);
    await saveCalibration(doc);
    persisted = true;
    return { doc, done };
  }

  if (!(await keepGoing())) return { doc, done: true };
  job.stepStartedAt = new Date().toISOString();
  doc.progress = progressLabel(job.textIndex, job.variant, job.comparePauses);
  await saveCalibration(doc);
  persisted = true;

  try {
    const spoken =
      job.comparePauses && job.variant === 1
        ? withFishBreaks(script, job.words, slice.text)
        : slice.text;
    const audio = await params.synthesize(spoken, job.sentencePauseSec);
    const durationSec = (await getMp3DurationSeconds(audio)) ?? 0;
    if (durationSec < 0.2) throw new Error("Measurement audio was empty");
    const stamp = job.startedAt.replace(/[:.]/g, "-");
    const plainSuffix = job.comparePauses && job.variant === 0 ? "-plain" : "";
    const key = `voice-calibration/${params.modelId}/${stamp}-t${job.textIndex + 1}${plainSuffix}.mp3`;
    const previous = job.audioKey
      ? await readObject(params.s3, params.bucket, job.audioKey)
      : null;
    const combined = await concatMp3(previous, audio);
    await params.s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: key,
        Body: combined,
        ContentType: "audio/mpeg",
        CacheControl: "no-store",
      }),
    );
    if (!(await keepGoing())) return { doc, done: true };
    job.words += slice.words;
    job.durationSec += durationSec;
    job.audioKey = key;
    job.stepStartedAt = undefined;
    if (job.words >= countWords(script)) {
      const done = closeCurrentText(doc, script);
      await saveCalibration(doc);
      return { doc, done };
    }
    doc.progress = progressLabel(job.textIndex, job.variant, job.comparePauses);
    await saveCalibration(doc);
    return { doc, done: false };
  } catch (e) {
    if (!(await keepGoing())) return { doc, done: true };
    doc.error = e instanceof Error ? e.message : "Measurement failed";
    doc.job = null;
    doc.progress = null;
    await saveCalibration(doc);
    return { doc, done: true };
  }
}

async function readObject(s3: S3Client, bucket: string, key: string): Promise<Buffer | null> {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await out.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  } catch {
    return null;
  }
}

async function concatMp3(prev: Buffer | null, next: Buffer): Promise<Buffer> {
  if (!prev?.length) return next;
  const dir = await mkdtemp(path.join(tmpdir(), "voice-cal-join-"));
  try {
    const a = path.join(dir, "a.mp3");
    const b = path.join(dir, "b.mp3");
    const list = path.join(dir, "list.txt");
    const out = path.join(dir, "out.mp3");
    await writeFile(a, prev);
    await writeFile(b, next);
    await writeFile(list, `file '${a}'\nfile '${b}'\n`);
    await execFileAsync(ffmpegBin(), [
      "-y",
      "-hide_banner",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-c",
      "copy",
      out,
    ]);
    return await readFile(out);
  } catch {
    return Buffer.concat([prev, next]);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
