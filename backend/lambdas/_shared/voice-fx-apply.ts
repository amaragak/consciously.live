/**
 * Apply committed voice FX (echo → IR afir) to a dry audio buffer (AAC/mp3/wav).
 */
import { S3Client } from "@aws-sdk/client-s3";
import {
  applyVoiceFxFfmpegChain,
  loadIrFromS3,
  putIrToS3,
  type VoiceFxChainResult,
  type VoiceFxInputExt,
} from "./voice-fx-ffmpeg-chain";
import {
  loadVoiceFxCommitted,
  VOICE_FX_IR_COMMITTED_KEY,
  voiceFxIrFingerprint,
  type VoiceFxSettings,
} from "./voice-fx-settings";

let cached:
  | {
      fingerprint: string;
      irWav: Buffer;
      settingsUpdatedAt: string;
    }
  | undefined;

/** Committed settings + IR wav (cached per container). */
export async function loadCommittedVoiceFxContext(params: {
  s3: S3Client;
  bucket: string;
}): Promise<{ settings: VoiceFxSettings; irWav: Buffer }> {
  const settings = await loadVoiceFxCommitted();
  const fp = voiceFxIrFingerprint(settings);

  if (!cached || cached.fingerprint !== fp) {
    let irWav = await loadIrFromS3({
      s3: params.s3,
      bucket: params.bucket,
      key: VOICE_FX_IR_COMMITTED_KEY,
    });
    if (!irWav) {
      await putIrToS3({
        s3: params.s3,
        bucket: params.bucket,
        key: VOICE_FX_IR_COMMITTED_KEY,
        settings,
      });
      irWav = await loadIrFromS3({
        s3: params.s3,
        bucket: params.bucket,
        key: VOICE_FX_IR_COMMITTED_KEY,
      });
    }
    if (!irWav) throw new Error("Could not load or build committed voice FX IR");
    cached = {
      fingerprint: fp,
      irWav,
      settingsUpdatedAt: settings.updatedAt,
    };
  }

  return { settings, irWav: cached.irWav };
}

export async function applyCommittedVoiceFx(params: {
  s3: S3Client;
  bucket: string;
  dryAudio?: Buffer;
  /** @deprecated use dryAudio */
  dryWav?: Buffer;
  inputExt?: VoiceFxInputExt;
  emitWetOnly?: boolean;
}): Promise<VoiceFxChainResult> {
  const dryAudio = params.dryAudio ?? params.dryWav;
  if (!dryAudio) throw new Error("dryAudio is required");
  const { settings, irWav } = await loadCommittedVoiceFxContext({
    s3: params.s3,
    bucket: params.bucket,
  });

  return applyVoiceFxFfmpegChain({
    dryAudio,
    inputExt: params.inputExt ?? ".wav",
    settings,
    irWav,
    emitWetOnly: params.emitWetOnly,
  });
}
