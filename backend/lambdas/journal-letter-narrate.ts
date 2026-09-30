/**
 * Async Speechify TTS for an Insights letter (Beatrice). No FX, no backing music.
 */
import type { Context } from "aws-lambda";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import fs from "fs";
import { promisify } from "util";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { loudnormMp3Buffer } from "./_shared/ffmpeg-loudnorm";
import { htmlToBlogNarrationScript } from "./_shared/blog";
import { insightSortKey } from "./_shared/insight-period";
import { stripLetterGreetingForNarration } from "./_shared/letter-markdown";
import {
  getSpeechifyApiKey,
  speechifyTtsMp3,
} from "./_shared/speechify-tts";
import { listVoiceSpeakers } from "./_shared/voice-admin";

const execFileAsync = promisify(execFile);
const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const TIME_RESERVE_MS = 45_000;
const PACK_CHARS = 12_000;

export type LetterNarrateEvent = {
  ownerId?: string;
  startDate?: string;
  endDate?: string;
  /** Speechify voice model id from Insights generate picker (defaults to Beatrice). */
  voiceId?: string;
};

function assertTimeLeft(context: Context | undefined, label: string) {
  if (!context) return;
  const left = context.getRemainingTimeInMillis();
  if (left < TIME_RESERVE_MS) {
    throw new Error(
      `Ran out of time during ${label} (${Math.round(left / 1000)}s left).`,
    );
  }
}

function insightsTable(): string {
  const n = process.env.JOURNAL_INSIGHTS_TABLE_NAME?.trim();
  if (!n) throw new Error("JOURNAL_INSIGHTS_TABLE_NAME is not set");
  return n;
}

async function resolveNarrationVoice(requestedVoiceId?: string | null): Promise<{
  voiceId: string;
  name: string;
}> {
  try {
    const speakers = await listVoiceSpeakers();
    const speechify = speakers.filter(
      (s) => !s.hidden && s.brand === "speechify",
    );
    const requested = requestedVoiceId?.trim() || "";
    if (requested) {
      const byId = speechify.find((s) => s.modelId === requested);
      if (byId?.modelId?.trim()) {
        return {
          voiceId: byId.modelId.trim(),
          name: byId.name.trim() || "Speechify",
        };
      }
    }
    const exact = speechify.find((s) => /^beatrice$/i.test(s.name.trim()));
    const soft = speechify.find((s) => /beatrice/i.test(s.name));
    const hit = exact ?? soft;
    if (hit?.modelId?.trim()) {
      return {
        voiceId: hit.modelId.trim(),
        name: hit.name.trim() || "Beatrice",
      };
    }
  } catch (e) {
    console.warn("journal-letter-narrate: voice admin lookup failed", e);
  }
  const fallback =
    process.env.LETTER_NARRATION_VOICE_ID?.trim() ||
    process.env.SPEECHIFY_VOICE_ID?.trim();
  if (fallback) return { voiceId: fallback, name: "Beatrice" };
  throw new Error(
    'Speechify voice "Beatrice" is not configured in Voice Admin',
  );
}

function chunkNarration(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= PACK_CHARS) return [trimmed];
  const paras = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = "";
  for (const para of paras) {
    const next = buf ? `${buf}\n\n${para}` : para;
    if (buf && next.length > PACK_CHARS) {
      chunks.push(buf.trim());
      buf = para;
      continue;
    }
    buf = next;
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.length ? chunks : [trimmed];
}

async function concatMp3(parts: Buffer[]): Promise<Buffer> {
  if (parts.length === 1) return parts[0]!;
  const id = randomUUID();
  const files: string[] = [];
  const listPath = `/tmp/letter-concat-${id}.txt`;
  const outPath = `/tmp/letter-concat-out-${id}.mp3`;
  try {
    for (let i = 0; i < parts.length; i += 1) {
      const p = `/tmp/letter-part-${id}-${i}.mp3`;
      fs.writeFileSync(p, parts[i]!);
      files.push(p);
    }
    fs.writeFileSync(
      listPath,
      files.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    );
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      outPath,
    ]);
    return fs.readFileSync(outPath);
  } finally {
    for (const p of [...files, listPath, outPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
  }
}

function audioKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/(insights\/letter-audio\/[^/?#]+)/i.exec(url);
  return m?.[1] ?? null;
}

async function patchLetterAudio(
  ownerId: string,
  startDate: string,
  endDate: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const names: string[] = [];
  const values: Record<string, unknown> = {};
  const expr: string[] = [];
  let i = 0;
  for (const [k, v] of Object.entries(patch)) {
    const nk = `#k${i}`;
    const nv = `:v${i}`;
    names.push(nk);
    values[nv] = v;
    expr.push(`${nk} = ${nv}`);
    i += 1;
  }
  if (!expr.length) return;
  const nameMap: Record<string, string> = {};
  Object.keys(patch).forEach((k, idx) => {
    nameMap[`#k${idx}`] = k;
  });
  await ddb.send(
    new UpdateCommand({
      TableName: insightsTable(),
      Key: { pk: ownerId, sk: insightSortKey(startDate, endDate) },
      UpdateExpression: `SET ${expr.join(", ")}`,
      ExpressionAttributeNames: nameMap,
      ExpressionAttributeValues: values,
    }),
  );
}

export async function handler(
  event: LetterNarrateEvent,
  context?: Context,
): Promise<void> {
  const ownerId = typeof event?.ownerId === "string" ? event.ownerId.trim() : "";
  const startDate =
    typeof event?.startDate === "string" ? event.startDate.trim() : "";
  const endDate = typeof event?.endDate === "string" ? event.endDate.trim() : "";
  if (!ownerId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    console.error("journal-letter-narrate: missing ownerId/startDate/endDate");
    return;
  }

  const got = await ddb.send(
    new GetCommand({
      TableName: insightsTable(),
      Key: { pk: ownerId, sk: insightSortKey(startDate, endDate) },
    }),
  );
  const item = got.Item as Record<string, unknown> | undefined;
  if (!item) {
    console.error("journal-letter-narrate: reflection not found", ownerId, startDate, endDate);
    return;
  }
  const letterMarkdown =
    typeof item.letterMarkdown === "string" ? item.letterMarkdown.trim() : "";
  if (!letterMarkdown) {
    await patchLetterAudio(ownerId, startDate, endDate, {
      letterAudioStatus: "failed",
      letterAudioError: "No letter to narrate",
      letterAudioProgress: null,
    });
    return;
  }

  try {
    const forNarration = stripLetterGreetingForNarration(letterMarkdown);
    const script = htmlToBlogNarrationScript(forNarration);
    if (!script.trim()) {
      throw new Error("Nothing to narrate — letter has no spoken text.");
    }
    const chunks = chunkNarration(script);
    if (!chunks.length) throw new Error("Nothing to narrate");

    const requested =
      typeof event?.voiceId === "string" ? event.voiceId.trim() : "";
    const { voiceId, name: voiceName } = await resolveNarrationVoice(
      requested ||
        (typeof item.letterAudioVoiceId === "string"
          ? item.letterAudioVoiceId
          : null),
    );
    const apiKey = await getSpeechifyApiKey();

    await patchLetterAudio(ownerId, startDate, endDate, {
      letterAudioStatus: "generating",
      letterAudioProgress: `Speechify (${voiceName}): preparing ${chunks.length} part${chunks.length === 1 ? "" : "s"}…`,
      letterAudioVoiceId: voiceId,
    });

    const rawParts: Buffer[] = [];
    for (let i = 0; i < chunks.length; i += 1) {
      assertTimeLeft(context, `Speechify ${i + 1}/${chunks.length}`);
      await patchLetterAudio(ownerId, startDate, endDate, {
        letterAudioStatus: "generating",
        letterAudioProgress: `Speechify (${voiceName}): synthesizing ${i + 1} of ${chunks.length}…`,
      });
      rawParts.push(
        await speechifyTtsMp3({
          apiKey,
          text: chunks[i]!,
          voiceId,
        }),
      );
    }

    await patchLetterAudio(ownerId, startDate, endDate, {
      letterAudioStatus: "generating",
      letterAudioProgress: "Mixing and uploading…",
    });
    const joined = await concatMp3(rawParts);
    const mp3 = await loudnormMp3Buffer(joined);

    const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
    const cfDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
    if (!bucket || !cfDomain) {
      throw new Error("MEDIA_BUCKET_NAME or MEDIA_CLOUDFRONT_DOMAIN is not set");
    }
    const key = `insights/letter-audio/${ownerId}/${startDate}_${endDate}-${Date.now()}.mp3`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: mp3,
        ContentType: "audio/mpeg",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    const previousKey = audioKeyFromUrl(
      typeof item.letterAudioUrl === "string" ? item.letterAudioUrl : null,
    );
    if (previousKey && previousKey !== key) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: previousKey }));
      } catch (e) {
        console.warn("journal-letter-narrate: could not delete old audio", previousKey, e);
      }
    }

    await patchLetterAudio(ownerId, startDate, endDate, {
      letterAudioUrl: `https://${cfDomain}/${key}`,
      letterAudioStatus: "ready",
      letterAudioError: null,
      letterAudioProgress: null,
      letterAudioGeneratedAt: new Date().toISOString(),
      letterAudioVoiceId: voiceId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Letter audio generation failed";
    console.error("journal-letter-narrate", ownerId, startDate, endDate, msg);
    try {
      await patchLetterAudio(ownerId, startDate, endDate, {
        letterAudioStatus: "failed",
        letterAudioError: msg,
        letterAudioProgress: null,
      });
    } catch (patchErr) {
      console.error("journal-letter-narrate: failed to record error", patchErr);
    }
  }
}
