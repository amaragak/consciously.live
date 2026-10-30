/**
 * Admin Listen — generate example stories for three fake people.
 * Same raise → compose → createMeditationAudioJob path as Manifesto Story.
 */

import { useRef, useState } from "react";
import {
  CreateSoundStep,
  type CreateSoundStepHandle,
} from "@/components/create-sound-step";
import {
  ADMIN_LISTEN_STORY_PERSONAS,
  type AdminListenStoryPersona,
} from "@/lib/admin-listen-story-personas";
import { draftSectionsForCompose } from "@/lib/manifesto-story-draft";
import {
  composeStoryThirdPerson,
  raiseStoryCeiling,
  raisedDraftsFromFindings,
  RAISE_LEVEL_NAME,
  type RaiseLevel,
} from "@/lib/manifesto-story-llm";
import { draftPlainText } from "@/lib/manifesto-story";
import {
  getMeditationAudioJobStatus,
  patchMeditationShare,
  pinAdminListenItem,
  type AdminListenState,
} from "@/lib/medimade-api";
import { startStoryNarrationJob } from "@/lib/start-story-narration-job";

type RaisedPair = { ambitious: string; audacious: string };

async function pollJobUntilDone(jobId: string): Promise<{
  meditationSk: string;
  title: string;
}> {
  const start = Date.now();
  let delay = 1500;
  while (Date.now() - start < 12 * 60 * 1000) {
    const st = await getMeditationAudioJobStatus(jobId);
    if (st.status === "completed") {
      const sk =
        typeof st.meditationSk === "string" && st.meditationSk.trim()
          ? st.meditationSk.trim()
          : "";
      if (!sk) throw new Error("Job completed without a library row");
      return {
        meditationSk: sk,
        title:
          typeof st.title === "string" && st.title.trim()
            ? st.title.trim()
            : "Story",
      };
    }
    if (st.status === "failed") {
      throw new Error(st.error || "Narration failed");
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(5000, delay + 500);
  }
  throw new Error("Narration timed out");
}

export function AdminListenStoryStudio({
  busy,
  onBusy,
  onError,
  onStatus,
  onPinned,
}: {
  busy: boolean;
  onBusy: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onStatus: (msg: string | null) => void;
  onPinned: (state: AdminListenState) => void;
}) {
  const soundRef = useRef<CreateSoundStepHandle>(null);
  const [personaId, setPersonaId] = useState(
    ADMIN_LISTEN_STORY_PERSONAS[0]?.id ?? "maya",
  );
  const persona: AdminListenStoryPersona =
    ADMIN_LISTEN_STORY_PERSONAS.find((p) => p.id === personaId) ??
    ADMIN_LISTEN_STORY_PERSONAS[0]!;

  const [draft, setDraft] = useState("");
  const [raised, setRaised] = useState<RaisedPair | null>(null);
  const [level, setLevel] = useState<"ambitious" | "audacious">("audacious");
  const [voiceLabel, setVoiceLabel] = useState("Choose voice");
  const [soundLabel, setSoundLabel] = useState("Choose sound");
  const [promptLine, setPromptLine] = useState("");
  const [phase, setPhase] = useState<
    "idle" | "raising" | "composing" | "narrating" | "sharing"
  >("idle");

  const selectedText = raised
    ? level === "ambitious"
      ? raised.ambitious
      : raised.audacious
    : "";

  async function onRaise() {
    const plain = draftPlainText(draft);
    if (plain.trim().split(/\s+/).filter(Boolean).length < 40) {
      onError("Write a bit more first-person story (about 40+ words).");
      return;
    }
    onBusy(true);
    onError(null);
    onStatus(null);
    setPhase("raising");
    try {
      const res = await raiseStoryCeiling(draft);
      if (res.findings.length === 0) {
        setRaised({ ambitious: plain, audacious: plain });
        onStatus("Nothing to raise — using your draft as-is for both levels.");
      } else {
        setRaised(raisedDraftsFromFindings(plain, res.findings));
        onStatus(
          `Raised ${res.findings.length} line${res.findings.length === 1 ? "" : "s"} — pick Ambitious or Audacious.`,
        );
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Raise failed");
    } finally {
      setPhase("idle");
      onBusy(false);
    }
  }

  async function onGenerate() {
    if (!selectedText.trim()) {
      onError("Raise the ceiling first, then pick a level.");
      return;
    }
    onBusy(true);
    onError(null);
    onStatus(null);
    try {
      soundRef.current?.stopPreviews();
      const extras = await soundRef.current?.getJobExtras();
      if (!extras?.reference_id) throw new Error("Choose a voice first");

      setPhase("composing");
      onStatus(`Composing ${persona.firstName}'s third-person narration…`);
      const sections = draftSectionsForCompose(selectedText).map((s) => ({
        promptId: s.promptId,
        promptText: s.promptText,
        text: s.text,
        role: "rewrite" as const,
      }));
      const composed = await composeStoryThirdPerson({
        draft: selectedText,
        firstName: persona.firstName,
        pronouns: persona.pronouns,
        sections:
          sections.length > 0
            ? sections
            : [
                {
                  promptId: null,
                  promptText: "",
                  text: selectedText,
                  role: "rewrite",
                },
              ],
      });
      const thirdPerson = composed.text.trim();
      if (!thirdPerson) throw new Error("Compose returned empty narration");

      setPhase("narrating");
      onStatus("Generating audio (same pipeline as Manifesto Story)…");
      const { jobId, title } = await startStoryNarrationJob({
        thirdPersonText: thirdPerson,
        firstName: persona.firstName,
        extras,
        asHouse: true,
      });

      const done = await pollJobUntilDone(jobId);

      setPhase("sharing");
      onStatus("Publishing Listen link…");
      const share = await patchMeditationShare({
        sk: done.meditationSk,
        action: "create",
        kind: "story",
        title: done.title || title,
        description: "",
        shownAs: "Consciously",
        listed: true,
        asHouse: true,
      });
      const ref =
        share.url ||
        (share.slug ? `https://consciously.live/listen/${share.slug}` : "");
      if (!ref) throw new Error("Share succeeded but no Listen URL");

      const state = await pinAdminListenItem({
        ref,
        kind: "story",
        promptLine: promptLine.trim(),
      });
      onPinned(state);
      onStatus(
        `Pinned ${persona.firstName}'s ${RAISE_LEVEL_NAME[level as RaiseLevel]} story on /listen.`,
      );
      setRaised(null);
      setDraft("");
      setPromptLine("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setPhase("idle");
      onBusy(false);
    }
  }

  const phaseLabel =
    phase === "raising"
      ? "Raising…"
      : phase === "composing"
        ? "Composing…"
        : phase === "narrating"
          ? "Narrating…"
          : phase === "sharing"
            ? "Sharing…"
            : null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 md:p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Generate example story
        </h3>
        <p className="mt-0.5 text-[13px] text-muted">
          Write first person for a fake person, raise to Ambitious + Audacious,
          pick level / voice / sound, then generate. Uses the Manifesto Story
          pipeline (title → break → narration; 10s bed + 10s fade).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ADMIN_LISTEN_STORY_PERSONAS.map((p) => {
          const on = p.id === persona.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => {
                setPersonaId(p.id);
                setRaised(null);
              }}
              className={`rounded-lg border px-3 py-1.5 text-[13px] ${
                on
                  ? "border-accent bg-accent-soft text-foreground"
                  : "border-border text-muted"
              } disabled:opacity-50`}
            >
              {p.firstName}
            </button>
          );
        })}
      </div>
      <p className="text-[12px] text-muted">{persona.blurb}</p>

      <label className="block text-[11px] font-medium text-muted">
        First person (as {persona.firstName})
      </label>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setRaised(null);
        }}
        rows={8}
        disabled={busy}
        placeholder={`I wake up in…\n\nWrite like Manifesto Story — present tense, already true.`}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={() => void onRaise()}
          className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"
        >
          {phase === "raising" ? "Raising…" : "Raise the ceiling"}
        </button>
      </div>

      {raised ? (
        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              ["ambitious", raised.ambitious],
              ["audacious", raised.audacious],
            ] as const
          ).map(([key, text]) => {
            const on = level === key;
            return (
              <button
                key={key}
                type="button"
                disabled={busy}
                onClick={() => setLevel(key)}
                className={`rounded-lg border p-3 text-left disabled:opacity-50 ${
                  on
                    ? "border-accent bg-accent-soft"
                    : "border-border bg-background"
                }`}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {RAISE_LEVEL_NAME[key]}
                  {on ? " · selected" : ""}
                </span>
                <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                  {text || "(empty)"}
                </p>
              </button>
            );
          })}
        </div>
      ) : null}

      <CreateSoundStep
        ref={soundRef}
        meditationStyle="Story"
        pickerHost="viewport"
        hideMainUi
        freshOurPickSound
        onPickLabelsChange={({ voice, sound }) => {
          setVoiceLabel(voice);
          setSoundLabel(sound);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => soundRef.current?.openVoicePicker()}
          className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"
        >
          Voice · {voiceLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => soundRef.current?.openSoundPicker()}
          className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"
        >
          Sound · {soundLabel}
        </button>
      </div>

      <label className="block text-[11px] font-medium text-muted">
        Made from line (shown on /listen)
      </label>
      <textarea
        value={promptLine}
        onChange={(e) => setPromptLine(e.target.value)}
        rows={2}
        disabled={busy}
        placeholder="e.g. Softening into a life that already feels like home"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      />

      <button
        type="button"
        disabled={busy || !raised || !selectedText.trim()}
        onClick={() => void onGenerate()}
        className="rounded-lg border border-border bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {phaseLabel ??
          `Generate + pin ${persona.firstName}'s ${RAISE_LEVEL_NAME[level]} story`}
      </button>
    </section>
  );
}
