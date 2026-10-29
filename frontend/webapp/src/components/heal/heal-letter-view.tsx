import { ChevronLeft, Leaf, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DictationMicButton } from "@/components/dictation-mic-button";
import { appendSpokenText } from "@/hooks/use-whisper-dictation";
import { Link, useRouter } from "@/lib/spa-nav";
import { healItemHref } from "@/lib/entity-href";
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
  const [text, setText] = useState(existing?.text ?? "");
  const [phase, setPhase] = useState<"write" | "fade" | "choice">("write");
  const [keyboard, setKeyboard] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const place = () => {
      setKeyboard(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    };
    viewport.addEventListener("resize", place);
    viewport.addEventListener("scroll", place);
    return () => {
      viewport.removeEventListener("resize", place);
      viewport.removeEventListener("scroll", place);
    };
  }, []);

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 240)}px`;
  }, [text, phase]);

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

  function keep() {
    if (existing) {
      router.push(healItemHref(item!));
      return;
    }
    const added = addHealEntry(loadHealStore(), {
      itemId: item!.id,
      kind: "letter",
      promptKey: null,
      text,
    });
    commit(added.store);
    void rememberRisk(item!.id, text, commit);
    router.push(healItemHref(item!));
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl lg:px-6 lg:py-6">
      <div className="flex min-h-[calc(100dvh-4rem-48px)] flex-col border border-heal-border bg-card shadow-[0_2px_10px_rgb(15_27_45_/_0.04)] max-lg:rounded-t-2xl lg:rounded-2xl">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <Link href={healItemHref(item)} className="inline-flex min-w-0 items-center gap-1 text-sm font-semibold text-foreground">
            <ChevronLeft className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{item.title}</span>
          </Link>
          <HealRiskPill show={Boolean(item.riskAt)} />
        </div>
        <div className="mx-4 mt-3 flex gap-2 rounded-xl border border-heal-border bg-heal-tint px-3 py-2.5 text-[13px] text-foreground">
          <Mail className="mt-0.5 size-4 shrink-0 text-heal-accent" aria-hidden />
          <p>
            This letter is just for you, and isn&apos;t meant to be sent. Writing it is the point.
            If you&apos;re thinking about getting in touch with someone, give it a few days and talk
            it over with someone you trust first.
          </p>
        </div>
        <div className="mx-4 mt-3 border-t border-border" />

        {phase === "choice" ? (
          <div className="mx-auto my-16 w-full max-w-md rounded-2xl border border-border bg-card px-6 py-8 text-center">
            <p className="font-display text-[22px] text-foreground">
              It&apos;s written. You don&apos;t have to hold it in your head now.
            </p>
            <p className="mt-2 text-sm text-muted">
              Keep a private copy in {item.title}&apos;s writing, or let it go completely. Either is
              fine.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button type="button" className={HEAL_OUTLINE} onClick={keep}>
                Keep a private copy
              </button>
              <button
                type="button"
                className={HEAL_PRIMARY}
                onClick={() => {
                  if (existing) commit(deleteHealEntry(loadHealStore(), existing.id));
                  router.push(healItemHref(item));
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
              ref={field}
              autoFocus
              value={text}
              placeholder="Write whatever you need to say."
              onChange={(event) => setText(event.target.value)}
              className={`mx-4 mt-4 w-full max-w-[70ch] flex-1 resize-none border-0 bg-transparent font-display text-[22px] leading-[1.7] text-foreground outline-none placeholder:text-muted ${
                phase === "fade" ? "transition-all duration-[1200ms] opacity-0 blur-sm" : ""
              }`}
            />
            <div
              className="sticky z-20 mx-auto mb-3 mt-4 flex w-max max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 shadow-lg lg:bottom-4"
              style={{ bottom: `calc(58px + env(safe-area-inset-bottom, 0px) + 8px + ${keyboard}px)` }}
            >
              <DictationMicButton
                variant="inset"
                onTranscript={(spoken) => setText((current) => appendSpokenText(current, spoken))}
              />
              <span className="text-[13px] font-semibold text-foreground">New perspective</span>
              <button type="button" className={HEAL_OUTLINE} onClick={keep}>
                Keep it
              </button>
              <button type="button" className={HEAL_PRIMARY} onClick={letGo}>
                <Leaf className="size-3.5" aria-hidden />
                Let it go
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
