"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import {
  CoverageBars,
  DOMAIN_BAR_DEFS,
  TALK_BAR_DEFS,
} from "@/components/onboarding/coverage-bars";
import { appendSpokenText, useWhisperDictation } from "@/hooks/use-whisper-dictation";
import {
  coverageSummaryLine,
  draftManifestoFromExtract,
  extractFromTalk,
  mergeTalkScores,
  shortBars,
  type TalkExtract,
  type TalkScores,
} from "@/lib/onboarding-analyze";
import {
  applyGapAnswer,
  applyOnboardingExtract,
  draftManifestoOnlyFromExisting,
  type AppliedOnboarding,
} from "@/lib/onboarding-apply";
import {
  clearForceRerun,
  detectOnboardingCoverage,
  loadOnboardingStore,
  markMostlySetUpSeen,
  markOnboardingCompleted,
  markOnboardingSkipped,
  saveOnboardingStore,
  type OnboardingCoverageKey,
  type OnboardingMode,
  type OnboardingStep,
} from "@/lib/onboarding-state";
import {
  firstNameFromAccount,
} from "@/lib/manifesto-print";
import {
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
} from "@/lib/auth-session";
import { ensureIdeateManifesto, loadIdeateManifestoStore } from "@/lib/ideate-manifesto";
import { loadIdeateValuesStore } from "@/lib/ideate-values";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { Link, useRouter } from "@/lib/spa-nav";
import { LogoMark, LOGO_MARK_FILL } from "@/components/logo-mark";
import {
  ONB_EASE,
  ensureOnboardingMotionCss,
  onbTransition,
  usePrefersReducedMotion,
} from "@/lib/onboarding-motion";

const MIST_BTN =
  "inline-flex h-11 items-center justify-center rounded-full border border-[#AFC2DC] px-6 text-[15px] font-semibold text-on-accent";
const OUTLINE_BTN =
  "inline-flex h-11 items-center justify-center rounded-full border border-border bg-[#FFFDF8] px-6 text-[15px] font-semibold text-foreground";
const SKIP =
  "cursor-pointer text-[14px] text-[#8A8478] underline-offset-2 hover:underline";
const INPUT =
  "w-full rounded-2xl border border-border bg-[#FFFDF8] px-4 py-3 text-[16px] leading-snug text-foreground outline-none placeholder:text-muted focus:border-[#C8A46A]";
const IDEA_CHIPS = [
  "what you're working on",
  "what matters to you",
  "what you'd love to be true",
  "what's hard right now",
] as const;
const BODY =
  "mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 pb-16 pt-6 sm:px-7 md:max-w-3xl";

const SORT_STAGES = [
  "Finding the areas of your life",
  "Shaping a dream and a first goal for each",
  "Noting what gets in the way",
  "Picking out your values",
  "Writing your first meditation",
  "Drafting your manifesto",
] as const;

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Waveform({
  active,
  level,
}: {
  active: boolean;
  level: number;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <div className="flex h-10 items-end justify-center gap-1" aria-hidden>
      {Array.from({ length: 16 }).map((_, i) => {
        const phase = 0.55 + Math.sin(i * 0.9) * 0.35;
        const h = active
          ? Math.max(6, Math.round(6 + level * phase * 28))
          : 6;
        return (
          <span
            key={i}
            className="w-1 origin-bottom rounded-full bg-[#AFC2DC]"
            style={{
              height: `${h}px`,
              opacity: active ? 0.45 + level * 0.45 : 0.35,
              transition: reduced
                ? undefined
                : `height 220ms ${ONB_EASE}, opacity 220ms ${ONB_EASE}`,
            }}
          />
        );
      })}
    </div>
  );
}

function NavyBand({
  eyebrow,
  headline,
  subline,
  rightSlot,
  arrival,
}: {
  eyebrow?: string;
  headline: string;
  subline?: string;
  rightSlot?: ReactNode;
  /** 0 = hidden arrival, 1 = complete (Tell me entrance). */
  arrival?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const a = arrival ?? 1;
  const textIn = (threshold: number, rise = true) => {
    const on = a >= threshold;
    if (reduced) {
      return {
        opacity: on ? 1 : 0,
        transition: onbTransition("opacity", 150),
      } as const;
    }
    return {
      opacity: on ? 1 : 0,
      transform: on || !rise ? "translateY(0)" : "translateY(12px)",
      transition: onbTransition("opacity, transform", 500),
    } as const;
  };

  return (
    <header className="relative overflow-hidden bg-[#1E232E] text-[#F7F1E6]">
      <div className="navy-paisley-plate" aria-hidden />
      <div className="relative z-[1] mx-auto flex w-full max-w-2xl flex-col gap-3.5 px-5 pb-7 pt-[calc(1.1rem+env(safe-area-inset-top,0px))] sm:px-7 sm:pb-8 md:max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="onb-motion-sun inline-flex shrink-0"
              style={
                reduced
                  ? { opacity: a >= 0.05 ? 1 : 0, transition: onbTransition("opacity", 150) }
                  : {
                      opacity: a >= 0.05 ? 1 : 0,
                      animation:
                        a >= 0.05
                          ? `onb-sun-in 900ms ${ONB_EASE} both`
                          : undefined,
                    }
              }
            >
              <LogoMark size={28} fill={LOGO_MARK_FILL} />
            </span>
            <span
              className="font-display text-[22px] font-normal lowercase leading-none tracking-tight text-[#F7F1E6]"
              style={
                reduced
                  ? { opacity: a >= 0.05 ? 1 : 0, transition: onbTransition("opacity", 150) }
                  : {
                      opacity: a >= 0.15 ? 1 : 0,
                      transition: onbTransition("opacity", 700, 120),
                    }
              }
            >
              consciously
            </span>
          </div>
          {rightSlot}
        </div>
        {eyebrow ? (
          <p
            className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#C8A46A]"
            style={textIn(0.35)}
          >
            {eyebrow}
          </p>
        ) : null}
        <h1
          className="font-display text-[28px] font-normal leading-tight sm:text-[34px]"
          style={textIn(0.45)}
        >
          {headline}
        </h1>
        {subline ? (
          <p
            className="max-w-xl text-[15px] leading-relaxed text-[#D8D0C2]"
            style={textIn(0.55)}
          >
            {subline}
          </p>
        ) : null}
      </div>
    </header>
  );
}

function RoundMicButton({
  label,
  onClick,
  busy,
  breathe,
  appear,
  pressKey,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  breathe?: boolean;
  /** 0–1 arrival visibility */
  appear?: number;
  pressKey?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const shown = appear ?? 1;
  return (
    <div
      className="flex flex-col items-center gap-3"
      style={
        reduced
          ? { opacity: shown, transition: onbTransition("opacity", 150) }
          : {
              opacity: shown,
              transform: shown ? "scale(1)" : "scale(0.9)",
              transition: onbTransition("opacity, transform", 500),
            }
      }
    >
      <div className="relative flex size-[92px] items-center justify-center">
        {breathe && !reduced && !busy ? (
          <span
            className="onb-motion-breathe pointer-events-none absolute inset-0 rounded-full"
            style={{
              backgroundColor: "var(--accent-button)",
              animation: `onb-breathe 2.8s ${ONB_EASE} infinite`,
            }}
            aria-hidden
          />
        ) : null}
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          aria-label={label}
          className="relative z-[1] flex size-[92px] items-center justify-center rounded-full border border-[#AFC2DC]/80 text-on-accent shadow-[0_10px_28px_rgba(15,27,45,0.12)] disabled:opacity-60"
          style={{
            ...PRIMARY_ACCENT_FILL_STYLE,
            animation:
              pressKey && !reduced
                ? `onb-mic-press 300ms ${ONB_EASE}`
                : undefined,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path
              d="M5 11a7 7 0 0014 0M12 18v3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <p className="text-[15px] font-semibold text-foreground">
        {busy ? "Working…" : label}
      </p>
    </div>
  );
}

function MicButton({
  label,
  onClick,
  busy,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`${MIST_BTN} h-14 w-full max-w-md gap-2.5 text-[16px]`}
      style={PRIMARY_ACCENT_FILL_STYLE}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
        <path
          d="M5 11a7 7 0 0014 0M12 18v3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      {busy ? "Working…" : label}
    </button>
  );
}

type Props = {
  initialStep?: OnboardingStep;
  initialMode?: OnboardingMode;
  initialGap?: OnboardingCoverageKey | null;
};

export function OnboardingFlow({
  initialStep,
  initialMode,
  initialGap,
}: Props) {
  const router = useRouter();
  const dictation = useWhisperDictation();
  const reduced = usePrefersReducedMotion();
  const firstName =
    firstNameFromAccount(
      getMedimadeSessionDisplayName(),
      getMedimadeSessionEmail(),
    ) || "there";

  const boot = loadOnboardingStore();
  const [step, setStep] = useState<OnboardingStep>(
    initialStep || boot.resumeStep || "tell_me",
  );
  const [mode, setMode] = useState<OnboardingMode>(
    initialMode || boot.resumeMode || (boot.forceRerunAt ? "merge" : "full"),
  );
  const [gapFocus, setGapFocus] = useState<OnboardingCoverageKey | null>(
    initialGap || boot.gapFocus,
  );

  const [transcript, setTranscript] = useState(boot.talkTranscript || "");
  const [seconds, setSeconds] = useState(boot.talkSeconds || 0);
  const [paused, setPaused] = useState(false);
  const [scores, setScores] = useState<TalkScores>({
    goals: 0,
    values: 0,
    blockers: 0,
  });
  const [followUps, setFollowUps] = useState<
    ("blockers" | "values" | "goals")[]
  >([]);
  const [followIdx, setFollowIdx] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [showType, setShowType] = useState(false);
  const [typedAreas, setTypedAreas] = useState(["", "", ""]);
  const [typedValues, setTypedValues] = useState(["", "", "", "", ""]);
  const [manifestoDraft, setManifestoDraft] = useState("");
  const [applied, setApplied] = useState<AppliedOnboarding | null>(null);
  const [sortDone, setSortDone] = useState(0);
  const [skipBrief, setSkipBrief] = useState("");
  const [arrival, setArrival] = useState(0);
  const [bodyEnter, setBodyEnter] = useState(true);
  const [coverageSummaryOn, setCoverageSummaryOn] = useState(false);
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [micPress, setMicPress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const extractRef = useRef<TalkExtract | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const arrivalTimers = useRef<number[]>([]);
  const prevStepRef = useRef(step);

  const finishArrival = () => {
    arrivalTimers.current.forEach((t) => window.clearTimeout(t));
    arrivalTimers.current = [];
    setArrival(1);
  };

  const goStep = (next: OnboardingStep) => {
    if (next === step) return;
    setBodyEnter(false);
    window.setTimeout(
      () => {
        setStep(next);
        setBodyEnter(true);
      },
      reduced ? 150 : 250,
    );
  };

  useEffect(() => {
    ensureOnboardingMotionCss();
  }, []);

  useEffect(() => {
    saveOnboardingStore({
      resumeStep: step,
      resumeMode: mode,
      gapFocus,
      talkTranscript: transcript,
      talkSeconds: seconds,
    });
  }, [step, mode, gapFocus, transcript, seconds]);

  /** Tell me arrival sequence (~1.6s), skippable. */
  useEffect(() => {
    if (step !== "tell_me") {
      setArrival(1);
      return;
    }
    if (reduced) {
      setArrival(1);
      return;
    }
    setArrival(0);
    const t = arrivalTimers.current;
    t.push(window.setTimeout(() => setArrival(0.05), 40));
    t.push(window.setTimeout(() => setArrival(0.15), 160));
    t.push(window.setTimeout(() => setArrival(0.35), 420));
    t.push(window.setTimeout(() => setArrival(0.45), 510));
    t.push(window.setTimeout(() => setArrival(0.55), 600));
    t.push(window.setTimeout(() => setArrival(0.72), 780));
    t.push(window.setTimeout(() => setArrival(0.88), 1100));
    t.push(window.setTimeout(() => setArrival(1), 1450));
    return () => {
      t.forEach((id) => window.clearTimeout(id));
      arrivalTimers.current = [];
    };
  }, [step, reduced]);

  useEffect(() => {
    if (prevStepRef.current !== step) {
      setBodyEnter(true);
      prevStepRef.current = step;
    }
  }, [step]);

  useEffect(() => {
    if (step !== "sorting" || !transcript.trim()) return;
    const lines = transcript
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12);
    if (lines.length < 2) return;
    const id = window.setInterval(() => {
      setQuoteIdx((n) => (n + 1) % lines.length);
    }, 4000);
    return () => window.clearInterval(id);
  }, [step, transcript]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "nearest",
    });
  }, [transcript, reduced]);

  /** Light status-bar icons over the full-bleed navy band. */
  useEffect(() => {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    const prev = meta.getAttribute("content");
    meta.setAttribute("content", "#1E232E");
    return () => {
      if (prev) meta?.setAttribute("content", prev);
    };
  }, []);

  useEffect(() => {
    if (step !== "listening" || paused) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = window.setInterval(() => {
      setSeconds((n) => n + 1);
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [step, paused]);

  useEffect(() => {
    if (step !== "sorting") return;
    setSortDone(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setSortDone(i);
      if (i >= SORT_STAGES.length) {
        window.clearInterval(id);
        void finishSorting();
      }
    }, 650);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const talkBarItems = useMemo(
    () =>
      TALK_BAR_DEFS.map((d) => ({
        key: d.key,
        title: d.title,
        sub: d.sub,
        score: scores[d.key],
      })),
    [scores],
  );

  async function startListening() {
    finishArrival();
    setPaused(false);
    setMicPress((n) => n + 1);
    goStep("listening");
    await dictation.start();
  }

  async function pauseListening() {
    setPaused(true);
    const spoken = await dictation.stopAndTranscribe();
    if (spoken) setTranscript((t) => appendSpokenText(t, spoken));
  }

  async function resumeListening() {
    setPaused(false);
    await dictation.start();
  }

  async function doneListening() {
    const spoken = await dictation.stopAndTranscribe();
    const full = spoken ? appendSpokenText(transcript, spoken) : transcript;
    setTranscript(full);
    const extract = extractFromTalk(full);
    extractRef.current = extract;
    setScores(extract.scores);
    const shorts = shortBars(extract.scores);
    setFollowUps(shorts);
    setFollowIdx(0);
    setCoverageSummaryOn(false);
    goStep("coverage");
    if (shorts.length === 0) {
      window.setTimeout(() => goStep("sorting"), 900);
    }
  }

  function goFollowUps() {
    if (followUps.length === 0) {
      goStep("sorting");
      return;
    }
    goStep("follow_up");
    setTypedAnswer("");
    setShowType(false);
  }

  async function submitFollowUp(text: string) {
    const piece = text.trim();
    if (piece) {
      setTranscript((t) => appendSpokenText(t, piece));
      setScores((prev) => mergeTalkScores(prev, piece));
      const key = followUps[followIdx];
      if (key && extractRef.current) {
        const more = extractFromTalk(piece);
        if (key === "values") {
          extractRef.current = {
            ...extractRef.current,
            values: [
              ...extractRef.current.values,
              ...more.values,
              ...piece.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
            ].slice(0, 5),
            scores: mergeTalkScores(extractRef.current.scores, piece),
          };
        } else if (key === "blockers") {
          const healMissing = detectOnboardingCoverage().missing.includes("heal");
          extractRef.current = {
            ...extractRef.current,
            blockers: [
              ...extractRef.current.blockers,
              ...(more.blockers.length ? more.blockers : [piece]),
            ].slice(0, 4),
            healHints: healMissing
              ? [
                  ...extractRef.current.healHints,
                  ...(more.healHints.length ? more.healHints : [piece]),
                ].slice(0, 3)
              : extractRef.current.healHints,
            scores: mergeTalkScores(extractRef.current.scores, piece),
          };
        } else {
          extractRef.current = {
            ...extractRef.current,
            areas:
              more.areas.length > 0
                ? more.areas
                : extractRef.current.areas,
            scores: mergeTalkScores(extractRef.current.scores, piece),
          };
        }
      }
    }
    const nextScores = piece
      ? mergeTalkScores(scores, piece)
      : scores;
    const remaining = shortBars(nextScores).filter(
      (k, idx, arr) => arr.indexOf(k) === idx,
    );
    // Advance past current
    const cur = followUps[followIdx];
    const nextList = remaining.filter((k) => k !== cur || nextScores[k] < 0.55);
    const still = followUps.slice(followIdx + 1).filter((k) =>
      nextList.includes(k),
    );
    if (still.length === 0) {
      goStep("sorting");
      return;
    }
    setFollowUps([...followUps.slice(0, followIdx + 1), ...still]);
    setFollowIdx(followIdx + 1);
    setTypedAnswer("");
    setShowType(false);
  }

  async function finishSorting() {
    const extract =
      extractRef.current ??
      extractFromTalk(transcript) ??
      ({
        areas: [],
        values: [],
        blockers: [],
        healHints: [],
        scores,
      } satisfies TalkExtract);

    if (mode === "gap" && gapFocus) {
      const result = applyGapAnswer({ gap: gapFocus, text: transcript || typedAnswer });
      setApplied(result);
      markMostlySetUpSeen();
      clearForceRerun();
      goStep("gap_added");
      return;
    }

    if (mode === "mostly" && gapFocus === "manifesto") {
      const draft = draftManifestoOnlyFromExisting();
      const result = applyOnboardingExtract({
        extract: {
          areas: [],
          values: [],
          blockers: [],
          healHints: [],
          scores: { goals: 1, values: 1, blockers: 0 },
        },
        manifestoDraft: draft,
        acceptManifestoSuggestion: true,
        createJournal: false,
      });
      setApplied(result);
      markMostlySetUpSeen();
      markOnboardingCompleted();
      clearForceRerun();
      goStep("mostly_added");
      return;
    }

    const draft =
      manifestoDraft.trim() ||
      draftManifestoFromExtract(extract, transcript);
    const result = applyOnboardingExtract({
      extract,
      transcript,
      manifestoDraft: draft,
      acceptManifestoSuggestion: mode === "full" || !loadIdeateManifestoStore().text.trim(),
      createJournal: Boolean(transcript.trim()) && mode !== "mostly" && mode !== "gap",
      createHealFromHints:
        mode !== "gap" &&
        (mode === "full" ||
          detectOnboardingCoverage().missing.includes("heal") ||
          extract.healHints.length > 0),
    });
    setApplied(result);
    setManifestoDraft(result.manifesto);
    markOnboardingCompleted();
    markMostlySetUpSeen();
    clearForceRerun();
    goStep(mode === "mostly" ? "mostly_added" : "heard");
  }

  async function startTypedPath() {
    finishArrival();
    setMode(mode === "merge" ? "merge" : "full");
    goStep("typed_areas");
  }

  function continueTypedFromAreas() {
    const areas = typedAreas
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((title) => ({
        title,
        dream: `A fuller ${title.toLowerCase()}.`,
        goal: `Take a first step in ${title.toLowerCase()}`,
      }));
    extractRef.current = {
      areas:
        areas.length > 0
          ? areas
          : [
              {
                title: "The life I want",
                dream: "A life I'm building toward.",
                goal: "Take one clear next step",
              },
            ],
      values: [],
      blockers: [],
      healHints: [],
      scores: { goals: 0.7, values: 0, blockers: 0 },
    };
    goStep("typed_values");
  }

  function continueTypedFromValues() {
    const values = typedValues.map((v) => v.trim()).filter(Boolean);
    if (extractRef.current) {
      extractRef.current = {
        ...extractRef.current,
        values,
        scores: { ...extractRef.current.scores, values: values.length ? 0.8 : 0 },
      };
    }
    goStep("typed_voice");
  }

  async function draftTypedManifesto() {
    const extract = extractRef.current ?? extractFromTalk("");
    let draft = draftManifestoFromExtract(extract);
    try {
      const values =
        extract.values.length > 0
          ? extract.values
          : loadIdeateValuesStore().values.map((v) => v.text);
      const titles = extract.areas.map((a) => a.title);
      if (values.length) {
        draft = await ensureIdeateManifesto({
          values,
          lifeAreaTitles: titles,
          force: true,
        });
      }
    } catch {
      /* keep heuristic draft */
    }
    setManifestoDraft(draft);
    goStep("typed_manifesto");
  }

  function finishTypedManifesto() {
    if (extractRef.current) {
      setTranscript(
        [
          ...extractRef.current.areas.map((a) => a.dream),
          ...extractRef.current.values,
        ].join("\n"),
      );
    }
    goStep("sorting");
  }

  function skipForNow() {
    finishArrival();
    markOnboardingSkipped();
    markMostlySetUpSeen();
    clearForceRerun();
    goStep("skipped");
  }

  function finishSkipToDashboard() {
    router.push("/");
  }

  function createMeditationFromSkip() {
    const brief =
      skipBrief.trim() ||
      "A short practice for the life I want to live.";
    const href = applyOnboardingExtract({
      extract: {
        areas: [],
        values: [],
        blockers: [],
        healHints: [],
        scores: { goals: 0, values: 0, blockers: 0 },
      },
      manifestoDraft: loadIdeateManifestoStore().text || undefined,
      createJournal: false,
    }).meditationHref;
    void brief;
    router.push(href);
  }

  async function answerByVoice() {
    setMicPress((n) => n + 1);
    if (dictation.recording) {
      const spoken = await dictation.stopAndTranscribe();
      if (!spoken) return;
      if (step === "gap_follow_up" && gapFocus) {
        const result = applyGapAnswer({ gap: gapFocus, text: spoken });
        setApplied(result);
        markMostlySetUpSeen();
        goStep("gap_added");
        return;
      }
      await submitFollowUp(spoken);
      return;
    }
    await dictation.start();
  }

  const followKey = followUps[followIdx];
  const areaNames = (extractRef.current?.areas ?? [])
    .map((a) => a.title)
    .filter(Boolean);
  const leastArea =
    areaNames[areaNames.length - 1] ||
    loadIdeateStore().dreams[0]?.title ||
    null;

  // Gap-only entry
  useEffect(() => {
    if (mode === "gap" && gapFocus && step === "tell_me") {
      setStep("gap_follow_up");
    }
    if (mode === "mostly" && initialStep === "mostly_fill") {
      const cov = detectOnboardingCoverage();
      if (cov.missing.length === 1 && cov.missing[0] === "manifesto") {
        setGapFocus("manifesto");
        setStep("sorting");
        return;
      }
      const talkMissing = (["blockers", "values", "goals"] as const).filter(
        (k) => cov.missing.includes(k) || (k === "blockers" && cov.missing.includes("heal")),
      );
      // heal uses blockers-style question when only heal missing
      const ups: ("blockers" | "values" | "goals")[] = [];
      if (cov.missing.includes("blockers") || cov.missing.includes("heal")) {
        ups.push("blockers");
      }
      if (cov.missing.includes("values")) ups.push("values");
      if (cov.missing.includes("goals")) ups.push("goals");
      setFollowUps(ups.length ? ups : talkMissing);
      setFollowIdx(0);
      setMode("mostly");
      setStep(ups.length ? "follow_up" : "sorting");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bodyMotion = reduced
    ? {
        opacity: bodyEnter ? 1 : 0,
        transition: onbTransition("opacity", 150),
      }
    : {
        opacity: bodyEnter ? 1 : 0,
        transform: bodyEnter ? "translateY(0)" : "translateY(8px)",
        transition: bodyEnter
          ? onbTransition("opacity, transform", 400)
          : onbTransition("opacity, transform", 250),
      };

  const staggerStyle = (i: number) =>
    reduced
      ? undefined
      : {
          opacity: bodyEnter ? 1 : 0,
          transform: bodyEnter ? "translateY(0)" : "translateY(12px)",
          transition: onbTransition("opacity, transform", 400, i * 70),
        };

  return (
    <div
      className="flex min-h-dvh w-full flex-col bg-[var(--background)]"
      onPointerDown={arrival < 1 ? finishArrival : undefined}
    >
      {step === "tell_me" ? (
        <>
          <NavyBand
            arrival={arrival}
            eyebrow={`Welcome, ${firstName}`}
            headline="Tell me about the life you want."
            subline="Talk for a minute or ten. Ramble, jump around, mention anything. I'll turn it into your goals, your values and your first meditation."
          />
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 pb-16 pt-8 sm:px-7 md:max-w-3xl">
            <RoundMicButton
              label="Tap to start talking"
              onClick={() => void startListening()}
              busy={dictation.busy}
              breathe={arrival >= 0.72}
              appear={arrival >= 0.72 ? 1 : 0}
              pressKey={micPress}
            />
            <div
              className="flex flex-col gap-2.5"
              style={{
                opacity: arrival >= 0.88 ? 1 : 0,
                transition: onbTransition("opacity", reduced ? 150 : 400),
              }}
            >
              <p className="text-[13px] text-muted">Some ideas</p>
              <div className="flex flex-wrap gap-2">
                {IDEA_CHIPS.map((chip, i) => (
                  <span
                    key={chip}
                    className="rounded-full bg-[#F6EEDD] px-3 py-1.5 text-[13px] font-medium text-[#8A6424]"
                    style={
                      reduced
                        ? undefined
                        : {
                            opacity: arrival >= 0.88 ? 1 : 0,
                            transition: onbTransition(
                              "opacity",
                              400,
                              i * 60,
                            ),
                          }
                    }
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
            <div
              className="flex w-full flex-col items-center gap-3 pt-1"
              style={{
                opacity: arrival >= 1 ? 1 : 0,
                transition: onbTransition("opacity", reduced ? 150 : 400),
              }}
            >
              <div className="flex w-full items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[13px] text-muted">
                  Can&apos;t talk right now?
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <button
                type="button"
                className={`${OUTLINE_BTN} w-full`}
                onClick={() => void startTypedPath()}
              >
                Answer three quick questions
              </button>
              <button type="button" className={SKIP} onClick={skipForNow}>
                Skip for now
              </button>
              <p className="text-[12.5px] text-muted">Your words stay private.</p>
            </div>
          </div>
        </>
      ) : null}

      {step === "listening" ? (
        <>
          <NavyBand headline="I'm listening." />
          <div className={BODY} style={bodyMotion}>
            <div className="flex flex-col items-center gap-4 rounded-[22px] border border-border bg-[#FFFDF8] p-5">
              <p className="font-mono text-[22px] font-semibold text-foreground">
                {formatTimer(seconds)}
              </p>
              <Waveform
                active={dictation.recording && !paused}
                level={dictation.level}
              />
              <div className="max-h-[220px] min-h-[120px] w-full overflow-y-auto rounded-2xl border border-border bg-white/70 p-4 text-[15px] leading-relaxed text-foreground">
                {transcript ? (
                  <span
                    style={{
                      opacity: 1,
                      transition: onbTransition("opacity", 150),
                    }}
                  >
                    {transcript}
                  </span>
                ) : (
                  <span className="text-muted">Your words will show up here…</span>
                )}
                <div ref={transcriptEndRef} />
                {dictation.error ? (
                  <p className="mt-2 text-[13px] text-red-700">{dictation.error}</p>
                ) : null}
              </div>
              <div className="flex w-full flex-wrap justify-center gap-3">
                <button
                  type="button"
                  className={MIST_BTN}
                  style={PRIMARY_ACCENT_FILL_STYLE}
                  onClick={() => void doneListening()}
                >
                  Done
                </button>
                <button
                  type="button"
                  className={OUTLINE_BTN}
                  onClick={() =>
                    void (paused ? resumeListening() : pauseListening())
                  }
                >
                  {paused ? "Resume" : "Pause"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {step === "coverage" ? (
        <>
          <NavyBand headline="What you covered" />
          <div className={BODY} style={bodyMotion}>
            <CoverageBars
              items={talkBarItems}
              onAllFilled={() => setCoverageSummaryOn(true)}
            />
            <p
              className="text-[14.5px] leading-relaxed text-muted"
              style={{
                opacity: coverageSummaryOn ? 1 : 0,
                transition: onbTransition("opacity", reduced ? 150 : 400),
              }}
            >
              {coverageSummaryLine(scores)}
            </p>
            <div className="flex flex-wrap gap-3" style={staggerStyle(2)}>
              <button
                type="button"
                className={MIST_BTN}
                style={PRIMARY_ACCENT_FILL_STYLE}
                onClick={goFollowUps}
              >
                Next
              </button>
              <button
                type="button"
                className={SKIP}
                onClick={() => goStep("sorting")}
              >
                Skip and build it anyway
              </button>
            </div>
          </div>
        </>
      ) : null}

      {step === "follow_up" || step === "gap_follow_up" ? (
        <>
          <NavyBand
            eyebrow={
              step === "follow_up"
                ? `A quick question · ${followIdx + 1} of ${followUps.length}`
                : "A quick question"
            }
            headline={
              gapFocus === "heal" || followKey === "blockers"
                ? gapFocus === "heal"
                  ? "Is there anything hurting or holding you back?"
                  : "Is anything blocking you right now?"
                : followKey === "values" || gapFocus === "values"
                  ? "What matters most to you?"
                  : gapFocus === "manifesto"
                    ? "What do you want your manifesto to say?"
                    : leastArea
                      ? `What do you want in ${leastArea}?`
                      : "What do you want your life to look like?"
            }
            subline={
              followKey === "blockers" || gapFocus === "blockers" || gapFocus === "heal"
                ? areaNames.length
                  ? `Anything that stops you working on ${areaNames.join(", ")}: time, money, doubt, habits, other people.`
                  : "Time, money, doubt, habits, other people — whatever it is."
                : followKey === "values" || gapFocus === "values"
                  ? "The things you'd never trade away: people, freedom, honesty, health, whatever it is for you."
                  : "A sentence or two is enough."
            }
            rightSlot={
              <button
                type="button"
                className="text-[13px] font-semibold text-[#D8D0C2] underline-offset-2 hover:underline"
                onClick={() =>
                  void (step === "gap_follow_up"
                    ? (markMostlySetUpSeen(), router.push("/"))
                    : submitFollowUp(""))
                }
              >
                Skip
              </button>
            }
          />
          <div className={BODY} style={bodyMotion}>
            {step === "follow_up" ? (
              <CoverageBars items={talkBarItems} compact />
            ) : null}
            <div className="flex flex-col items-center gap-3">
              <RoundMicButton
                label={
                  dictation.recording ? "Tap when finished" : "Tap to answer"
                }
                onClick={() => void answerByVoice()}
                busy={dictation.busy}
                breathe={!dictation.recording}
                pressKey={micPress}
              />
              {!showType ? (
                <button
                  type="button"
                  className={SKIP}
                  onClick={() => setShowType(true)}
                >
                  Or type it
                </button>
              ) : (
                <div className="flex w-full flex-col gap-3">
                  <textarea
                    className={`${INPUT} min-h-[110px] resize-y`}
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    placeholder="Type your answer…"
                  />
                  <button
                    type="button"
                    className={MIST_BTN}
                    style={PRIMARY_ACCENT_FILL_STYLE}
                    onClick={() => {
                      if (step === "gap_follow_up" && gapFocus) {
                        const result = applyGapAnswer({
                          gap: gapFocus,
                          text: typedAnswer,
                        });
                        setApplied(result);
                        markMostlySetUpSeen();
                        goStep("gap_added");
                        return;
                      }
                      void submitFollowUp(typedAnswer);
                    }}
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {step === "sorting" ? (
        <>
          <NavyBand
            headline="Making sense of what you said…"
            subline={
              seconds > 0 ? `Your talk · ${formatTimer(seconds)}` : undefined
            }
          />
          <div className={BODY} style={bodyMotion}>
            <ul className="flex flex-col gap-2.5">
              {SORT_STAGES.map((label, i) => {
                const done = i < sortDone;
                const active = i === sortDone;
                return (
                  <li
                    key={label}
                    className="flex items-center gap-3 text-[15px] text-foreground"
                  >
                    <span
                      className={
                        done
                          ? "flex size-6 items-center justify-center rounded-full bg-[#E6F0E8] text-[#1E232E]"
                          : "flex size-6 items-center justify-center rounded-full border border-border text-muted"
                      }
                    >
                      {done ? (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          aria-hidden
                          className="onb-motion-check"
                          style={{
                            animation: reduced
                              ? undefined
                              : `onb-check-pop 250ms ${ONB_EASE} both`,
                          }}
                        >
                          <path d="M5 12l5 5 9-10" />
                        </svg>
                      ) : active && !reduced ? (
                        <span
                          className="onb-motion-spin block size-3.5 rounded-full border-2 border-[#C8A46A] border-t-transparent"
                          style={{
                            animation: `onb-spin 1.1s linear infinite`,
                          }}
                          aria-hidden
                        />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span
                      className={done || active ? "font-semibold" : "text-muted"}
                      style={{
                        transition: onbTransition("opacity, color", 300),
                      }}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
            {transcript ? (
              <p
                key={quoteIdx}
                className="rounded-2xl border border-border bg-[#FFFDF8] p-4 text-[14px] leading-relaxed text-muted line-clamp-4"
                style={{
                  opacity: 1,
                  transition: onbTransition("opacity", reduced ? 150 : 400),
                }}
              >
                {(
                  transcript
                    .split(/(?<=[.!?])\s+|\n+/)
                    .map((s) => s.trim())
                    .filter((s) => s.length > 12)[quoteIdx] ?? transcript
                ).slice(0, 220)}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {step === "heard" ||
      step === "mostly_added" ||
      step === "gap_added" ? (
        <>
          <NavyBand
            headline={
              step === "gap_added" || step === "mostly_added"
                ? "Here's what I added"
                : "Here's what I heard"
            }
          />
          <div className={`${BODY} gap-4`}>
            {applied?.manifesto ? (
              <section
                className="rounded-[22px] border border-border bg-[#FFFDF8] p-4"
                style={staggerStyle(0)}
              >
                <p className="mb-1 text-[12.5px] font-semibold uppercase tracking-wide text-muted">
                  Manifesto
                </p>
                <p className="text-[16px] leading-relaxed text-foreground">
                  {applied.manifesto}
                </p>
              </section>
            ) : null}
            {applied?.meditationHref && step === "heard" ? (
              <div className="relative" style={staggerStyle(1)}>
                {!reduced ? (
                  <span
                    className="onb-motion-breathe pointer-events-none absolute inset-0 rounded-full"
                    style={{
                      backgroundColor: "var(--accent-button)",
                      animation: `onb-breathe 2.8s ${ONB_EASE} 1`,
                    }}
                    aria-hidden
                  />
                ) : null}
                <Link
                  href={applied.meditationHref}
                  className={`${MIST_BTN} relative z-[1] w-full`}
                  style={PRIMARY_ACCENT_FILL_STYLE}
                >
                  Play your first meditation
                </Link>
              </div>
            ) : null}
            {applied?.areas?.length ? (
              <section
                className="rounded-[22px] border border-border bg-[#FFFDF8] p-4"
                style={staggerStyle(2)}
              >
                <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-muted">
                  Life areas
                </p>
                <ul className="flex flex-col gap-3">
                  {applied.areas.map((a) => (
                    <li key={a.id}>
                      <p className="font-semibold text-foreground">{a.title}</p>
                      <p className="text-[14px] text-muted">{a.dream}</p>
                      <p className="text-[13.5px] text-foreground">
                        First goal: {a.goal}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {applied?.blockers?.length ? (
              <section
                className="rounded-[22px] border border-border bg-[#FFFDF8] p-4"
                style={staggerStyle(3)}
              >
                <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-muted">
                  In the way
                </p>
                <ul className="list-disc space-y-1 pl-5 text-[14.5px] text-foreground">
                  {applied.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {applied?.values?.length ? (
              <section
                className="rounded-[22px] border border-border bg-[#FFFDF8] p-4"
                style={staggerStyle(4)}
              >
                <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-muted">
                  Values
                </p>
                <div className="flex flex-wrap gap-2">
                  {applied.values.map((v) => (
                    <span
                      key={v}
                      className="rounded-full border border-[#E6D3AE] bg-[#F6EEDD] px-3 py-1 text-[13px] font-semibold text-[#8A6424]"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
            {applied?.healTitles?.length ? (
              <section
                className="rounded-[22px] border border-border bg-[#FFFDF8] p-4"
                style={staggerStyle(5)}
              >
                <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-muted">
                  Heal
                </p>
                <ul className="list-disc space-y-1 pl-5 text-[14.5px]">
                  {applied.healTitles.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {applied?.journalEntryId && step === "heard" ? (
              <p className="text-[13.5px] text-muted" style={staggerStyle(6)}>
                Your talk is saved as your first journal entry.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3" style={staggerStyle(7)}>
              {step === "heard" ? (
                <Link href="/manifest" className={MIST_BTN} style={PRIMARY_ACCENT_FILL_STYLE}>
                  Explore your Manifest
                </Link>
              ) : null}
              <Link href="/" className={OUTLINE_BTN}>
                Go to dashboard
              </Link>
            </div>
          </div>
        </>
      ) : null}

      {step === "typed_areas" ? (
        <>
          <NavyBand
            eyebrow="Question 1 of 3"
            headline="Where do you want change?"
            subline="Up to three parts of your life. One line each."
          />
          <div className={`${BODY} gap-3`} style={bodyMotion}>
            {typedAreas.map((v, i) => (
              <input
                key={i}
                className={INPUT}
                value={v}
                placeholder={
                  i === 0 ? "e.g. Career" : i === 1 ? "e.g. Health" : "Optional"
                }
                onChange={(e) => {
                  const next = [...typedAreas];
                  next[i] = e.target.value;
                  setTypedAreas(next);
                }}
              />
            ))}
            <button
              type="button"
              className={MIST_BTN}
              style={PRIMARY_ACCENT_FILL_STYLE}
              onClick={continueTypedFromAreas}
            >
              Continue
            </button>
            <button
              type="button"
              className={SKIP}
              onClick={() => void startListening()}
            >
              Rather talk it through?
            </button>
          </div>
        </>
      ) : null}

      {step === "typed_values" ? (
        <>
          <NavyBand
            eyebrow="Question 2 of 3"
            headline="What matters most?"
            subline="Optional — up to five. Leave blank to skip."
          />
          <div className={`${BODY} gap-3`} style={bodyMotion}>
            {typedValues.map((v, i) => (
              <input
                key={i}
                className={INPUT}
                value={v}
                placeholder={i === 0 ? "e.g. Honesty" : "Optional"}
                onChange={(e) => {
                  const next = [...typedValues];
                  next[i] = e.target.value;
                  setTypedValues(next);
                }}
              />
            ))}
            <button
              type="button"
              className={MIST_BTN}
              style={PRIMARY_ACCENT_FILL_STYLE}
              onClick={continueTypedFromValues}
            >
              Continue
            </button>
          </div>
        </>
      ) : null}

      {step === "typed_voice" ? (
        <>
          <NavyBand
            eyebrow="Question 3 of 3"
            headline="Anything else?"
            subline="Optional — a line about the life you want, or draft your manifesto now."
          />
          <div className={`${BODY} gap-3`} style={bodyMotion}>
            <textarea
              className={`${INPUT} min-h-[120px]`}
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              placeholder="Optional notes…"
            />
            <button
              type="button"
              className={MIST_BTN}
              style={PRIMARY_ACCENT_FILL_STYLE}
              onClick={() => {
                if (typedAnswer.trim() && extractRef.current) {
                  extractRef.current = {
                    ...extractRef.current,
                    ...extractFromTalk(typedAnswer),
                    areas: extractRef.current.areas,
                    values: extractRef.current.values,
                  };
                }
                void draftTypedManifesto();
              }}
            >
              Draft my manifesto
            </button>
          </div>
        </>
      ) : null}

      {step === "typed_manifesto" ? (
        <>
          <NavyBand
            headline="Your manifesto"
            subline="Edit freely — you can change this later."
          />
          <div className={`${BODY} gap-3`} style={bodyMotion}>
            <textarea
              className={`${INPUT} min-h-[140px]`}
              value={manifestoDraft}
              onChange={(e) => setManifestoDraft(e.target.value)}
            />
            <button
              type="button"
              className={MIST_BTN}
              style={PRIMARY_ACCENT_FILL_STYLE}
              onClick={finishTypedManifesto}
            >
              Make my first meditation
            </button>
          </div>
        </>
      ) : null}

      {step === "skipped" ? (
        <>
          <NavyBand
            headline="No rush."
            subline="You can talk it through anytime from Get set up on Home. Or leave a one-line brief and I'll open Create."
          />
          <div className={`${BODY} gap-3`} style={bodyMotion}>
            <input
              className={INPUT}
              value={skipBrief}
              onChange={(e) => setSkipBrief(e.target.value)}
              placeholder="Optional: a one-line brief for a meditation"
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={MIST_BTN}
                style={PRIMARY_ACCENT_FILL_STYLE}
                onClick={createMeditationFromSkip}
              >
                Create meditation
              </button>
              <button
                type="button"
                className={OUTLINE_BTN}
                onClick={finishSkipToDashboard}
              >
                Go to dashboard
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Domain coverage bars for the mostly-set-up sheet. */
export function DomainCoverageBars() {
  const cov = detectOnboardingCoverage();
  return (
    <CoverageBars
      items={DOMAIN_BAR_DEFS.map((d) => ({
        key: d.key,
        title: d.title,
        sub: d.sub,
        score: cov.scores[d.key],
      }))}
    />
  );
}
