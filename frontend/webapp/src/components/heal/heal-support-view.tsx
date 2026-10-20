import { useMvpFlags } from "@/lib/mvp-flags";
import { loadHealStore, saveHealStore } from "@/lib/heal-store";
import { HEAL_PAGE, useHealStore } from "@/components/heal/heal-bits";

type Line = { label: string; detail: string; href?: string };

function region(): string {
  if (typeof navigator === "undefined") return "GB";
  const lang = navigator.language || "";
  const part = lang.split("-")[1];
  return (part || "GB").toUpperCase();
}

function linesForRegion(code: string): Line[] {
  if (code === "US") {
    return [
      { label: "988 Suicide & Crisis Lifeline", detail: "Call or text 988", href: "tel:988" },
      {
        label: "International directory",
        detail: "If you're outside the US",
        href: "https://www.iasp.info/suicidalthoughts/",
      },
      { label: "In an emergency", detail: "Call 911" },
    ];
  }
  if (code !== "GB") {
    return [
      {
        label: "International directory",
        detail: "Find a local line",
        href: "https://www.iasp.info/suicidalthoughts/",
      },
      { label: "In an emergency", detail: "Call your local emergency number" },
    ];
  }
  return [
    { label: "Samaritans", detail: "116 123 · call, free, any time", href: "tel:116123" },
    { label: "Shout", detail: "Text SHOUT to 85258", href: "sms:85258?body=SHOUT" },
    {
      label: "Cruse Bereavement Support",
      detail: "0808 808 1677",
      href: "tel:08088081677",
    },
    {
      label: "NHS Talking Therapies",
      detail: "Self-referral, no GP needed in England",
      href: "https://www.nhs.uk/service-search/mental-health/find-an-nhs-talking-therapies-service",
    },
    { label: "In an emergency", detail: "Call 999 or go to A&E" },
  ];
}

export function HealSupportView() {
  const [store, setStore] = useHealStore();
  const mvp = useMvpFlags();
  const lines = linesForRegion(region());
  const showChatShare = mvp.chat;
  const showInsightShare = mvp.journalInsights || mvp.manifestInsights;
  return (
    <div className={`${HEAL_PAGE} max-w-xl`}>
      <ul className="flex flex-col gap-2">
        {lines.map((line) => (
          <li key={line.label} className="rounded-2xl border border-border bg-card px-4 py-3">
            {line.href ? (
              <a href={line.href} className="block">
                <span className="block font-semibold text-foreground">{line.label}</span>
                <span className="text-sm text-muted">{line.detail}</span>
              </a>
            ) : (
              <>
                <span className="block font-semibold text-foreground">{line.label}</span>
                <span className="text-sm text-muted">{line.detail}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      {showChatShare || showInsightShare ? (
      <section className="mt-8 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-[20px] text-foreground">Heal settings</h2>
        <p className="mt-1 text-sm text-muted">
          Both are off. Heal stays inside Heal unless you turn one on.
        </p>
        {showChatShare ? (
        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          Use Heal writing in Chat
          <input
            type="checkbox"
            checked={store.shareWithChat}
            onChange={(e) => {
              const next = { ...loadHealStore(), shareWithChat: e.target.checked };
              saveHealStore(next);
              setStore(next);
            }}
          />
        </label>
        ) : null}
        {showInsightShare ? (
        <label className="mt-2 flex items-center justify-between gap-3 text-sm">
          Use Heal writing in insights
          <input
            type="checkbox"
            checked={store.shareWithInsights}
            onChange={(e) => {
              const next = { ...loadHealStore(), shareWithInsights: e.target.checked };
              saveHealStore(next);
              setStore(next);
            }}
          />
        </label>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}
