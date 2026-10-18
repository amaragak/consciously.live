import { Leaf, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { DictationMicButton } from "@/components/dictation-mic-button";
import { appendSpokenText } from "@/hooks/use-whisper-dictation";
import { Link, useRouter } from "@/lib/spa-nav";
import {
  addHealEntry,
  deleteHealEntry,
  healItemById,
  loadHealStore,
  type HealStoreV1,
} from "@/lib/heal-store";
import {
  HEAL_OUTLINE,
  HEAL_PAGE,
  HEAL_PRIMARY,
  HealRiskPill,
  rememberRisk,
  useHealStore,
} from "@/components/heal/heal-bits";
import { HealNameChip } from "@/components/heal/heal-name-chip";

export function HealLetterView({
  itemId,
  entryId,
}: {
  itemId: string;
  entryId?: string;
}) {
  const [store, setStore] = useHealStore();
  const router = useRouter();
  const item = healItemById(store, itemId);
  const existing = entryId
    ? store.entries.find((entry) => entry.id === entryId)
    : null;
  const [text, setText] = useState(
    existing?.text ?? (item ? `Dear ${item.title},\n\n` : ""),
  );
  const [phase, setPhase] = useState<"write" | "fade" | "choice">("write");

  if (!item) {
    return (
      <div className={HEAL_PAGE}>
        <p className="text-sm text-muted">This isn&apos;t here anymore.</p>
      </div>
    );
  }

  function commit(next: HealStoreV1) {
    setStore(next);
  }

  function letGo() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase("choice");
      return;
    }
    setPhase("fade");
    window.setTimeout(() => setPhase("choice"), 1200);
  }

  return (
    <div className={HEAL_PAGE}>
      <div className="flex items-start justify-between gap-3">
        <Link href={`/heal/${item.id}`} className="text-sm font-semibold text-accent-link">
          ‹ {item.title}
        </Link>
        <div className="flex items-center gap-2">
          <HealRiskPill show={Boolean(item.riskAt)} />
          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
            <Lock className="size-3.5" aria-hidden />
            Only you can see this
          </span>
        </div>
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[1.4px] text-heal-accent">
        Unsent letter · to {item.title}
      </p>
      <div className="mt-3 flex gap-2 rounded-xl border border-heal-border bg-heal-tint px-3 py-2.5 text-[13px] text-foreground">
        <Mail className="mt-0.5 size-4 shrink-0 text-heal-accent" aria-hidden />
        <p>
          This letter is just for you, and isn&apos;t meant to be sent. Writing it is the point.
          If you&apos;re thinking about getting in touch with someone, give it a few days and talk
          it over with someone you trust first.
        </p>
      </div>

      {phase === "choice" ? (
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card px-6 py-8 text-center">
          <p className="font-display text-[22px] text-foreground">
            It&apos;s written. You don&apos;t have to hold it in your head now.
          </p>
          <p className="mt-2 text-sm text-muted">
            Keep a private copy in {item.title}&apos;s writing, or let it go completely. Either is
            fine.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              className={HEAL_OUTLINE}
              onClick={() => {
                if (existing) {
                  router.push(`/heal/${item.id}`);
                  return;
                }
                const added = addHealEntry(loadHealStore(), {
                  itemId: item.id,
                  kind: "letter",
                  promptKey: null,
                  text,
                });
                commit(added.store);
                void rememberRisk(item.id, text, commit);
                router.push(`/heal/${item.id}`);
              }}
            >
              Keep a private copy
            </button>
            <button
              type="button"
              className={HEAL_PRIMARY}
              onClick={() => {
                if (existing) commit(deleteHealEntry(loadHealStore(), existing.id));
                router.push(`/heal/${item.id}`);
              }}
            >
              <Leaf className="size-3.5" aria-hidden />
              Let it go completely
            </button>
          </div>
        </div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={`mx-auto mt-6 block w-full max-w-[70ch] resize-none bg-transparent font-display text-[22px] leading-[1.7] outline-none ${
              phase === "fade" ? "transition-all duration-[1200ms] opacity-0 blur-sm tracking-wide" : ""
            }`}
            rows={12}
          />
          <div className="fixed inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom,0px)+12px)] z-30 mx-auto flex w-max max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 shadow-lg sm:bottom-6">
            <DictationMicButton
              variant="inset"
              onTranscript={(spoken) =>
                setText((current) => appendSpokenText(current, spoken))
              }
            />
            <span className="text-[13px] font-semibold text-foreground">New perspective</span>
            <button
              type="button"
              className={HEAL_OUTLINE}
              onClick={() => {
                const added = addHealEntry(loadHealStore(), {
                  itemId: item.id,
                  kind: "letter",
                  promptKey: null,
                  text,
                });
                commit(added.store);
                void rememberRisk(item.id, text, commit);
                router.push(`/heal/${item.id}`);
              }}
            >
              Keep it
            </button>
            <button type="button" className={HEAL_PRIMARY} onClick={letGo}>
              <Leaf className="size-3.5" aria-hidden />
              Let it go
            </button>
          </div>
          <p className="sr-only">
            <HealNameChip item={item} store={store} />
          </p>
        </>
      )}
    </div>
  );
}
