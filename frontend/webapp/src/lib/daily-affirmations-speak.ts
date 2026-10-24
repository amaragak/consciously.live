import {
  fetchOrpheusSpeechPreview,
  getMedimadeApiBase,
  listFishSpeakers,
  medimadeApiAuthHeaders,
  medimadeFetch,
} from "@/lib/medimade-api";
import { readMeditateDefaults } from "@/lib/settings-local-defaults";

/** Read the lines in the user's chosen voice. Returns a blob the library player can play. */
export async function affirmationSpeechBlob(text: string): Promise<Blob> {
  const spoken = text.replace(/\s+/g, " ").trim();
  if (!spoken) throw new Error("Nothing to read");
  const voiceId = readMeditateDefaults().defaultVoiceId;
  const speakers = await listFishSpeakers().catch(() => []);
  const speaker =
    speakers.find((row) => row.modelId === voiceId) ??
    speakers.find((row) => row.brand === "speechify") ??
    speakers[0];
  const id = speaker?.modelId || voiceId || "";
  if (speaker?.brand === "speechify" && id) {
    const base = getMedimadeApiBase();
    if (!base) throw new Error("API is not configured");
    const res = await medimadeFetch(`${base}/affirmations/speak`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...medimadeApiAuthHeaders(),
      },
      body: JSON.stringify({ text: spoken, voiceId: id }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      audioBase64?: string;
      contentType?: string;
      error?: string;
    };
    if (!res.ok || !data.audioBase64) {
      throw new Error(data.error || "Couldn't read these");
    }
    const bytes = Uint8Array.from(atob(data.audioBase64), (ch) => ch.charCodeAt(0));
    return new Blob([bytes], { type: data.contentType || "audio/aac" });
  }
  if (speaker && id && speaker.brand !== "speechify") {
    const base = getMedimadeApiBase();
    if (!base) throw new Error("API is not configured");
    const res = await medimadeFetch(`${base}/fish/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spoken, reference_id: id }),
    });
    if (!res.ok) throw new Error("Couldn't read these");
    const type = res.headers.get("content-type") || "";
    if (type.includes("json")) throw new Error("Couldn't read these");
    return res.blob();
  }
  if (!id) throw new Error("Choose a voice in Settings first");
  return fetchOrpheusSpeechPreview({ voice: id, input: spoken });
}
