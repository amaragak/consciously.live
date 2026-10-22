"use client";

import Image from "next/image";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Bell,
  Bold,
  BookOpen,
  Check,
  ChevronRight,
  Heart,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  MessageCircle,
  Minus,
  Pause,
  Target,
  Underline,
} from "lucide-react";
import { HOME_V2_START_FREE_HREF } from "@/components/home-v2/constants";
import { HomeV2ToolIcon } from "@/components/home-v2/home-v2-tool-icon";
import { appHref } from "@/lib/app-origins";
import { listBackgroundAudio, type BackgroundAudioByCategory } from "@/lib/medimade-api";
import type { MixerFactoryPreset } from "@/lib/mixer-factory-presets";
import { soundDisplayName } from "@/lib/sound-taxonomy";
import {
  CEILING,
  FEATURED_PROGRAMS,
  FOCUS_ART,
  HEAL_ART,
  SOUNDS,
  STYLES,
  VISION_SCENES,
  VOICES,
  styleImage,
  type CeilingLevel,
} from "./new-home-catalog";
import { SelectChevron } from "@/components/select-chevron";
import { PlayMark, PreviewButton } from "./new-home-preview";

const IMPORT_CHIPS = [
  "Day One",
  "Markdown or text",
  "CSV",
  "PDF annotations",
  "Handwritten photos",
];

const SHOWCASE_SOUNDS: { name: string; mood: string }[] = [
  { name: "Celestial Chamber", mood: "Majestic" },
  { name: "Astral Secrets", mood: "Mystic" },
  { name: "Deep Stillness", mood: "Mystic" },
];

const SHOWCASE_VOICES = ["Benjamin", "Arun", "Beatrice"];

const STYLE_ORDER = [
  "Manifestation",
  "Visualization",
  "Affirmation loop",
  "Sleep",
  "Body scan",
  "Breath-led",
  "Story",
  "Reflection",
  "Anxiety relief",
  "Loving-kindness",
  "Movement",
  "Open awareness",
];

const BRIEFS: {
  text: string;
  tokens: { icon?: "journal" | "goal" | "heal"; kind?: string; value: string; chip?: boolean }[];
}[] = [
  {
    text: "Can't switch off after work.",
    tokens: [
      { kind: "Style", value: "Sleep" },
      { icon: "journal", kind: "Journal", value: "Late Monday" },
      { value: "10 min", chip: true },
    ],
  },
  {
    text: "Big pitch on Friday. I want to walk in calm and certain.",
    tokens: [
      { kind: "Style", value: "Visualize" },
      { icon: "goal", kind: "Manifest goal", value: "Own studio" },
      { value: "8 min", chip: true },
    ],
  },
  {
    text: "Another Sunday dreading Monday.",
    tokens: [
      { kind: "Style", value: "Reflect" },
      { icon: "journal", kind: "Journal", value: "Sunday night" },
      { value: "10 min", chip: true },
    ],
  },
  {
    text: "I keep sabotaging things just as they take off.",
    tokens: [
      { kind: "Style", value: "Affirm" },
      { icon: "heal", kind: "Heal", value: "Self-sabotage" },
      { value: "8 min", chip: true },
    ],
  },
  {
    text: "Day 3 of my Chakra Cleanse.",
    tokens: [
      { kind: "Program", value: "Chakra 3" },
      { icon: "goal", kind: "Manifest goal", value: "Marathon" },
      { value: "15 min", chip: true },
    ],
  },
  {
    text: "Still thinking about how it ended with Sam.",
    tokens: [
      { kind: "Style", value: "Kindness" },
      { icon: "heal", kind: "Heal", value: "Me and Sam" },
      { value: "12 min", chip: true },
    ],
  },
];

const LIBRARY = [
  {
    title: "Before the pitch",
    meta: "Visualization · 10 min",
    art: styleImage("visualization-1792449647092"),
  },
  {
    title: "Sleep after a long week",
    meta: "Sleep · 20 min",
    art: styleImage("sleep-1792449746726"),
  },
  {
    title: "Steady hands",
    meta: "Affirmation loop · 8 min",
    art: styleImage("affirmation-loop-1792449697503"),
  },
];

type GoalStep = { label: string; state: "done" | "now" | "todo"; children?: string[] };

const GOALS: { area: string; title: string; progress: number; steps: GoalStep[] }[] = [
  {
    area: "Work",
    title: "Open my own studio",
    progress: 40,
    steps: [
      { label: "Find a space", state: "done" },
      {
        label: "Price the first collection",
        state: "now",
        children: ["Cost of materials", "Compare local prices"],
      },
      { label: "Open the online shop", state: "todo" },
    ],
  },
  {
    area: "Fitness",
    title: "Run the London marathon",
    progress: 25,
    steps: [
      { label: "Sign up", state: "done" },
      { label: "Three runs a week", state: "now" },
      { label: "First 10k race", state: "todo" },
      { label: "First half", state: "todo" },
    ],
  },
  {
    area: "Music",
    title: "Release the EP",
    progress: 60,
    steps: [
      { label: "Finish the songs", state: "done" },
      { label: "Record vocals", state: "done" },
      { label: "Mix and master", state: "now" },
      { label: "Release day", state: "todo" },
    ],
  },
];

const STYLES_IN_ORDER = STYLE_ORDER.map((label) => {
  const row = STYLES.find(([name]) =>
    label === "Movement" ? name.startsWith("Movement") : name === label,
  );
  return { label, file: row?.[1] ?? "" };
});

function Lockup({ lead, accent, light }: { lead: string; accent: string; light?: boolean }) {
  return (
    <p className={`new-home-lockup${light ? " is-on-dark" : ""}`}>
      {lead} <em>{accent}</em>
    </p>
  );
}

const ROW_STEP = 90;

function useReveal() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nodes = [...root.querySelectorAll<HTMLElement>("[data-hv2-reveal]")];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      nodes.forEach((node) => node.classList.add("is-in"));
      return;
    }

    const play = (node: HTMLElement, delay: number) => {
      if (node.dataset.hv2Played === "1") return;
      node.dataset.hv2Played = "1";
      node.style.animationDelay = `${delay}ms`;
      requestAnimationFrame(() => node.classList.add("is-in"));
    };

    const inHiddenTab = (node: HTMLElement) => {
      const panel = node.closest(".new-home-tabpanel");
      return panel instanceof HTMLElement && !panel.classList.contains("is-on");
    };

    const playGroup = (list: HTMLElement[]) => {
      list.forEach((node, index) => play(node, index * ROW_STEP));
    };

    let scroller: HTMLElement | null = root.parentElement;
    while (scroller) {
      const { overflowY } = getComputedStyle(scroller);
      if (/(auto|scroll)/.test(overflowY) && scroller.scrollHeight > scroller.clientHeight + 1) break;
      scroller = scroller.parentElement;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const section = entry.target as HTMLElement;
          section.dataset.hv2Seen = "1";
          const panel = section.querySelector<HTMLElement>(".new-home-tabpanel.is-on");
          if (panel) panel.setAttribute("data-hv2-tab-played", "1");
          playGroup(
            [...section.querySelectorAll<HTMLElement>("[data-hv2-reveal]")].filter(
              (node) => !inHiddenTab(node),
            ),
          );
          observer.unobserve(section);
        });
      },
      {
        root: scroller instanceof HTMLElement ? scroller : null,
        rootMargin: "0px 0px 20% 0px",
        threshold: 0,
      },
    );

    root.querySelectorAll<HTMLElement>("section").forEach((section) => observer.observe(section));

    const tabs = new MutationObserver(() => {
      root.querySelectorAll<HTMLElement>(".new-home-tabpanel.is-on").forEach((panel) => {
        if (panel.getAttribute("data-hv2-tab-played") === "1") return;
        const section = panel.closest("section");
        if (!(section instanceof HTMLElement) || section.dataset.hv2Seen !== "1") return;
        panel.setAttribute("data-hv2-tab-played", "1");
        playGroup([...panel.querySelectorAll<HTMLElement>("[data-hv2-reveal]")]);
      });
    });
    tabs.observe(root, { subtree: true, attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
      tabs.disconnect();
    };
  }, []);

  return rootRef;
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return reduce;
}

function openJournalImport() {
  const href = appHref("/journal?import=1");
  const popup = window.open(href, "consciously-journal-import", "popup,width=520,height=720");
  if (!popup) window.location.href = href;
}

function BandHead({
  lockup,
  title,
  body,
  light,
  action,
  tabs,
}: {
  lockup: [string, string];
  title: string;
  body: string;
  light?: boolean;
  action?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <div className="new-home-band-head is-center" data-hv2-reveal>
      <Lockup lead={lockup[0]} accent={lockup[1]} light={light} />
      <h2 className="new-home-display">{title}</h2>
      <p className="new-home-body">{body}</p>
      {action}
      {tabs}
    </div>
  );
}

function FeatureTabs({
  base,
  label,
  tabs,
  selected,
  onSelect,
}: {
  base: string;
  label: string;
  tabs: string[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = tabs.length - 1;
    let next = selected;
    if (event.key === "ArrowRight") next = selected === last ? 0 : selected + 1;
    else if (event.key === "ArrowLeft") next = selected === 0 ? last : selected - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    onSelect(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="new-home-tabs" role="tablist" aria-label={label} onKeyDown={move}>
      {tabs.map((tab, index) => (
        <button
          key={tab}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="button"
          role="tab"
          id={`${base}-tab-${index}`}
          aria-selected={selected === index}
          aria-controls={`${base}-panel-${index}`}
          tabIndex={selected === index ? 0 : -1}
          className={selected === index ? "is-on" : ""}
          onClick={() => onSelect(index)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function TabPanels({
  base,
  tabs,
  selected,
  children,
}: {
  base: string;
  tabs: string[];
  selected: number;
  children: ReactNode[];
}) {
  return (
    <div className="new-home-panels">
      {children.map((child, index) => (
        <div
          key={tabs[index]}
          role="tabpanel"
          id={`${base}-panel-${index}`}
          aria-labelledby={`${base}-tab-${index}`}
          className={`new-home-tabpanel${selected === index ? " is-on" : ""}`}
          inert={selected === index ? undefined : true}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

function TokenIcon({ icon }: { icon?: "journal" | "goal" | "heal" }) {
  if (icon === "journal") return <BookOpen size={13} aria-hidden />;
  if (icon === "goal") return <Target size={13} aria-hidden />;
  if (icon === "heal") return <Heart size={13} aria-hidden />;
  return null;
}

function BriefPanel() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<"type" | "hold" | "delete">("type");

  useEffect(() => {
    if (reduce) return;
    const full = BRIEFS[index].text.length;
    const wait = phase === "hold" ? 1500 : phase === "delete" ? 18 : 32;
    const timer = window.setTimeout(() => {
      if (phase === "type" && count < full) setCount((value) => value + 1);
      else if (phase === "type") setPhase("hold");
      else if (phase === "hold") setPhase("delete");
      else if (count > 0) setCount((value) => value - 1);
      else {
        setIndex((value) => (value + 1) % BRIEFS.length);
        setPhase("type");
      }
    }, wait);
    return () => window.clearTimeout(timer);
  }, [reduce, index, count, phase]);

  const brief = BRIEFS[reduce ? 1 : index];
  const shown = reduce ? brief.text : brief.text.slice(0, count);
  const ready = reduce || phase === "hold";

  return (
    <div className="new-home-brief">
      <p className="new-home-brief-kind">Brief</p>
      <p className="new-home-display new-home-brief-text">
        {shown}
        {reduce ? null : <span className="new-home-caret" />}
      </p>
      <div className="new-home-brief-foot">
        <span>Attached</span>
        <div className={`new-home-brief-tokens${ready ? " is-in" : ""}`}>
          {brief.tokens.map((token) => (
            <span key={`${token.kind ?? ""}-${token.value}`} className={token.chip ? "is-chip" : ""}>
              <TokenIcon icon={token.icon} />
              {token.kind ? <em>{token.kind}</em> : null}
              <b>{token.value}</b>
            </span>
          ))}
        </div>
        <div className="new-home-brief-actions">
          <button type="button" className="is-talk">
            Create meditation
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

type MixLane = {
  id: string;
  label: string;
  name: string;
  level: number | null;
};

/** Live Nostalgia factory mix, used until the catalog responds. */
const NOSTALGIA_LANES: MixLane[] = [
  { id: "music", label: "Music", name: "Nostalgia Pad", level: 100 },
  { id: "ambience", label: "Ambience", name: "Children Playing", level: 50 },
  { id: "drums", label: "Drums", name: "None", level: null },
  { id: "noise", label: "Noise", name: "Vinyl Crackle", level: 6 },
];

function lanesFromNostalgia(
  preset: MixerFactoryPreset,
  catalog: BackgroundAudioByCategory,
): MixLane[] {
  const pools = {
    music: catalog.music,
    ambience: catalog.nature,
    drums: catalog.drums,
    noise: catalog.noise,
  };
  return (["music", "ambience", "drums", "noise"] as const).map((id) => {
    const channel = preset.channels[id];
    const source = channel.source?.trim() || "";
    const hit = source ? pools[id].find((item) => item.key === source) : undefined;
    const name = source ? soundDisplayName(hit?.name || source) : "";
    return {
      id,
      label: NOSTALGIA_LANES.find((lane) => lane.id === id)?.label ?? id,
      name: name || "None",
      level: name ? channel.volume : null,
    };
  });
}

function MixFader({
  label,
  level,
  onChange,
}: {
  label: string;
  level: number | null;
  onChange: (level: number) => void;
}) {
  const trackRef = useRef<HTMLSpanElement>(null);
  const empty = level == null;

  const setFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track || empty) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onChange(Math.round(ratio * 100));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (empty) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setFromClientX(event.clientX);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setFromClientX(event.clientX);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (empty || level == null) return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onChange(Math.min(100, level + step));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onChange(Math.max(0, level - step));
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange(100);
    }
  };

  return (
    <div className="new-home-mix-level">
      <span
        ref={trackRef}
        role="slider"
        tabIndex={empty ? -1 : 0}
        aria-label={`${label} level`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={level ?? undefined}
        aria-valuetext={empty ? "Empty" : `${level}%`}
        aria-disabled={empty || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        {empty ? null : (
          <>
            <i style={{ width: `${level}%` }} />
            <b style={{ left: `${level}%` }} />
          </>
        )}
      </span>
      <em>{empty ? "–" : `${level}%`}</em>
    </div>
  );
}

function NewHomeMixer() {
  const [presetName, setPresetName] = useState("Nostalgia");
  const [lanes, setLanes] = useState<MixLane[]>(NOSTALGIA_LANES);
  const touched = useRef(false);

  useEffect(() => {
    let cancel = false;
    listBackgroundAudio()
      .then((catalog) => {
        if (cancel || touched.current) return;
        const preset = catalog.factoryMixes?.find(
          (item) => item.name.trim().toLowerCase() === "nostalgia",
        );
        if (!preset) return;
        setPresetName(preset.name);
        setLanes(lanesFromNostalgia(preset, catalog));
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

  const layers = lanes.filter((lane) => lane.level != null).length;

  return (
    <div className="new-home-mixer">
      <div className="new-home-mixer-bar">
        <div className="new-home-mix-preset">
          <span>Preset</span>
          <div className="new-home-mix-pick" aria-disabled="true">
            <span>{presetName}</span>
            <SelectChevron className="new-home-mix-chevron" />
          </div>
        </div>
        <div className="new-home-mix-actions">
          <button type="button" tabIndex={-1}>
            Pause mix
          </button>
          <button type="button" className="is-save" tabIndex={-1}>
            Save as new
          </button>
        </div>
      </div>
      <div className="new-home-mix-lanes">
        {lanes.map((lane) => (
          <div key={lane.id} className={`new-home-mix-lane${lane.level == null ? " is-empty" : ""}`}>
            <strong>{lane.label}</strong>
            <div className="new-home-mix-pick" aria-disabled="true">
              <span>{lane.name}</span>
              <SelectChevron className="new-home-mix-chevron" />
            </div>
            <MixFader
              label={lane.label}
              level={lane.level}
              onChange={(level) => {
                touched.current = true;
                setLanes((current) =>
                  current.map((item) => (item.id === lane.id ? { ...item, level } : item)),
                );
              }}
            />
          </div>
        ))}
      </div>
      <p>
        Your mix · {layers} {layers === 1 ? "layer" : "layers"} · use it on any meditation, or on
        its own
      </p>
    </div>
  );
}

function Row({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="new-home-row" data-hv2-reveal>
      <h3 className="new-home-display">{title}</h3>
      {body ? <p>{body}</p> : null}
      {children}
    </div>
  );
}

function MeditateBand() {
  const base = useId();
  const [tab, setTab] = useState(0);
  const tabs = ["Create", "Sounds", "Library"];
  const sounds = SHOWCASE_SOUNDS.map((item) => {
    const sound = SOUNDS.find((entry) => entry.name === item.name);
    return sound ? { ...sound, mood: item.mood } : null;
  }).filter((sound): sound is (typeof SOUNDS)[number] & { mood: string } => Boolean(sound));
  const voices = SHOWCASE_VOICES.map((name) => VOICES.find((voice) => voice.name === name)).filter(
    (voice): voice is (typeof VOICES)[number] => Boolean(voice),
  );

  return (
    <section id="meditate" className="new-home-band new-home-dark">
      <div className="new-home-wrap">
        <BandHead
          light
          lockup={["consciously", "Meditate"]}
          title="Written for you, every time."
          body="Massive customisation and personalisation. Written from your words, your goals, your journal and your blocks."
          tabs={<FeatureTabs base={base} label="Meditate" tabs={tabs} selected={tab} onSelect={setTab} />}
        />
        <TabPanels base={base} tabs={tabs} selected={tab}>
          <div className="new-home-rows">
            <div data-hv2-reveal>
              <BriefPanel />
            </div>
            <div className="new-home-create-split" data-hv2-reveal>
              <div>
                <h3 className="new-home-display">Start from anything in your life</h3>
                <div className="new-home-starts">
                  {(
                    [
                      ["chat", "Chat", "Talk it through with us"],
                      ["journal", "Journal", "An entry you wrote"],
                      ["goal", "Manifest", "A goal you're working towards"],
                      ["heal", "Heal", "Something you're carrying"],
                    ] as const
                  ).map(([icon, name, line]) => (
                    <article key={name}>
                      <span>
                        {icon === "journal" ? <BookOpen size={16} aria-hidden /> : null}
                        {icon === "goal" ? <Target size={16} aria-hidden /> : null}
                        {icon === "heal" ? <Heart size={16} aria-hidden /> : null}
                        {icon === "chat" ? <MessageCircle size={16} aria-hidden /> : null}
                      </span>
                      <div>
                        <strong>{name}</strong>
                        <p>{line}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="new-home-display">Twelve meditation styles</h3>
                <div className="new-home-style-pills">
                  {STYLES_IN_ORDER.map((style) => (
                    <span key={style.file}>{style.label}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="new-home-rows">
            <div className="new-home-sound-split" data-hv2-reveal>
              <div>
                <h3 className="new-home-display">Beautiful sound library</h3>
                <div>
                  <div className="new-home-sound-grid">
                    {sounds.map((sound) => (
                      <article key={sound.name}>
                        <div>
                          <img src={sound.art} alt="" />
                          <PreviewButton src={sound.audio} label={`Preview ${sound.name}`} />
                        </div>
                        <strong>{sound.name}</strong>
                        <span>{sound.mood}</span>
                      </article>
                    ))}
                  </div>
                  <a className="new-home-text-link" href={appHref("/meditate/sounds/soundscapes")}>
                    Browse the whole library in the app →
                  </a>
                </div>
              </div>
              <div>
                <h3 className="new-home-display">Realistic, calming voices</h3>
                <div>
                  <div className="new-home-voice-grid">
                    {voices.map((voice) => (
                      <article key={voice.name}>
                        <img src={voice.portrait} alt="" />
                        <div>
                          <strong>{voice.name}</strong>
                          <span>{voice.descriptor}</span>
                        </div>
                        <PreviewButton
                          className="new-home-voice-play"
                          src={voice.sample}
                          label={`Preview ${voice.name}`}
                        />
                      </article>
                    ))}
                  </div>
                  <a className="new-home-text-link" href={appHref("/meditate/sounds/voices")}>
                    And more voices →
                  </a>
                </div>
              </div>
            </div>
            <Row title="Build your own sounds with our mixer.">
              <NewHomeMixer />
            </Row>
          </div>

          <div className="new-home-rows">
            <Row title="Your own growing library.">
              <div className="new-home-library">
                <div className="new-home-library-chips">
                  <span className="is-on">My creations</span>
                  <span>Community</span>
                  <span>Programs</span>
                </div>
                <div className="new-home-library-row">
                  {LIBRARY.map((item) => (
                    <article key={item.title}>
                      <div className="new-home-library-art">
                        <img src={item.art} alt="" />
                        <span className="new-home-library-play" aria-hidden>
                          <PlayMark />
                        </span>
                      </div>
                      <div>
                        <strong>{item.title}</strong>
                        <span>{item.meta}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </Row>
            <Row
              title="Shared by the community."
              body="Meditations other members have chosen to share. Browse by style, and share your own if you like."
            />
            <Row
              title="Programs, made personal."
              body="Multi-session journeys we plan and you make yours: answer a few questions and every session is written around your life. A Chakra Cleanse based on your own energy, for example."
            >
              <p className="new-home-swipe-hint new-home-program-swipe">Swipe for more →</p>
              <div className="new-home-program-row">
                {FEATURED_PROGRAMS.map((program) => (
                  <article key={program.href}>
                    <div style={{ backgroundImage: `url(${program.cover})` }}>
                      {program.chakras ? (
                        <span className="new-home-chakras" aria-hidden>
                          {Array.from({ length: 7 }, (_, bar) => (
                            <i key={bar} />
                          ))}
                        </span>
                      ) : null}
                    </div>
                    <strong>{program.title}</strong>
                    <span>{program.sessions}</span>
                  </article>
                ))}
              </div>
            </Row>
          </div>
        </TabPanels>
      </div>
    </section>
  );
}

function StoryText({ level }: { level: CeilingLevel }) {
  const [place, sales, closer] = CEILING[level];
  return (
    <p className="new-home-story-quote">
      Alex opens <s>a small studio</s> <mark>{place}</mark> and <s>sells some paintings</s>{" "}
      <mark>{sales}</mark>. He works for himself, and money is <s>not scary any more</s>{" "}
      <mark>something he has plenty of</mark>. <mark>{closer}</mark>
    </p>
  );
}

function visionCaption(caption: string) {
  const rest = caption.replace(/^Me\s+/i, "");
  if (!rest) return caption;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

function ManifestBand() {
  const base = useId();
  const [tab, setTab] = useState(0);
  const [level, setLevel] = useState<CeilingLevel>("audacious");
  const tabs = ["See it", "Hear it", "Become it"];
  const scenes = VISION_SCENES.slice(0, 5);

  return (
    <section id="manifest" className="new-home-band">
      <div className="new-home-wrap">
        <BandHead
          lockup={["consciously", "Manifest"]}
          title="See it. Hear it. Become it."
          body="Picture it, aim higher, turn it into steps."
          tabs={<FeatureTabs base={base} label="Manifest" tabs={tabs} selected={tab} onSelect={setTab} />}
        />
        <TabPanels base={base} tabs={tabs} selected={tab}>
          <div className="new-home-rows">
            <Row
              title="See yourself living your dreams."
              body="AI images of you in the life you describe, from one photo. Photorealistic or illustrated."
            >
              <div className="new-home-vision-card">
                <div className="new-home-vision is-captioned">
                  {scenes.map((scene) => (
                    <figure key={scene.caption}>
                      <img src={scene.illustrated} alt="" />
                      <figcaption>{visionCaption(scene.caption)}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            </Row>
          </div>

          <div className="new-home-rows">
            <Row
              title="Your ideal life, narrated to you every night."
              body="An ambitious story about you, in the third person, narrated in your chosen voice. Listen every night and let it programme your mind."
            >
              <div className="new-home-story-card">
                <div className="new-home-step">
                  <div className="new-home-step-rail">
                    <span className="new-home-num">1</span>
                    <span className="new-home-rail" />
                  </div>
                  <div>
                    <h4 className="new-home-display">Write your story</h4>
                    <p className="new-home-story-help">
                      A few lines on the life you want.
                    </p>
                    <p className="new-home-story-quote">
                      I open a small studio and sell some of my paintings. I work for myself, and
                      I&apos;m not scared of money any more.
                    </p>
                  </div>
                </div>
                <div className="new-home-step">
                  <div className="new-home-step-rail">
                    <span className="new-home-num">2</span>
                    <span className="new-home-rail" />
                  </div>
                  <div>
                    <div className="new-home-goal-top">
                      <h4 className="new-home-display">Raise the ceiling</h4>
                      <div className="new-home-segs" role="group" aria-label="Ceiling">
                        {(["ambitious", "audacious", "delusional"] as const).map((item) => (
                          <button
                            key={item}
                            type="button"
                            className={level === item ? "is-on" : ""}
                            onClick={() => setLevel(item)}
                          >
                            {item[0].toUpperCase() + item.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="new-home-story-help">
                      Rewritten in the third person, bigger than you&apos;d dare. Pick how far to push.
                    </p>
                    <StoryText level={level} />
                  </div>
                </div>
                <div className="new-home-step">
                  <div className="new-home-step-rail">
                    <span className="new-home-num is-last">3</span>
                  </div>
                  <div>
                    <h4 className="new-home-display">Listen every night</h4>
                    <p className="new-home-story-help">
                      Narrated over your soundscape. Play it as you fall asleep, until your mind
                      stops arguing with it.
                    </p>
                  </div>
                </div>
                <div className="new-home-player">
                  <span aria-hidden>
                    <PlayMark />
                  </span>
                  <div>
                    <strong>Alex&apos;s story</strong>
                    <span>Beatrice · The Cosmic Key · 4 min</span>
                  </div>
                  <span className="new-home-wave" aria-hidden>
                    {Array.from({ length: 18 }, (_, bar) => (
                      <i key={bar} style={{ height: `${8 + ((bar * 17) % 16)}px` }} />
                    ))}
                  </span>
                </div>
              </div>
            </Row>
          </div>

          <div className="new-home-rows">
            <Row title="Turn it into steps.">
              <div className="new-home-goal-grid">
                {GOALS.map((goal) => (
                  <article key={goal.title}>
                    <p>
                      <span>{goal.area}</span>
                      <span>{goal.progress}%</span>
                    </p>
                    <h4 className="new-home-display">{goal.title}</h4>
                    <div className="new-home-bar" aria-hidden>
                      <i style={{ width: `${goal.progress}%` }} />
                    </div>
                    <ul>
                      {goal.steps.map((step) => (
                        <li key={step.label} className={`is-${step.state}`}>
                          <span>{step.label}</span>
                          {step.children ? (
                            <ul>
                              {step.children.map((child) => (
                                <li key={child}>{child}</li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </Row>
            <Row title="Write your manifesto.">
              <div className="new-home-manifesto-grid">
                <article>
                  <h4>Values</h4>
                  <div>
                    {["Courage", "Craft", "Freedom", "Family", "Play"].map((value) => (
                      <span key={value}>{value}</span>
                    ))}
                  </div>
                </article>
                <article>
                  <h4>Quotes</h4>
                  <blockquote>A journey of a thousand miles begins with a single step.</blockquote>
                  <cite>Lao Tzu</cite>
                </article>
                <article>
                  <h4>Questions to myself</h4>
                  <p>What would I do today if I knew it couldn&apos;t fail?</p>
                  <p>Will this matter to the person I&apos;m becoming?</p>
                </article>
              </div>
            </Row>
          </div>
        </TabPanels>
      </div>
    </section>
  );
}

function JournalBand() {
  const base = useId();
  const [tab, setTab] = useState(0);
  const tabs = ["Journal", "Gratitude", "Insights"];

  return (
    <section id="journal" className="new-home-band new-home-warm">
      <div className="new-home-wrap">
        <BandHead
          lockup={["consciously", "Journal"]}
          title="Hear what you've been telling yourself."
          body="Write or speak freely. See the doubts that keep coming back and the dreams that won’t go away."
          tabs={<FeatureTabs base={base} label="Journal" tabs={tabs} selected={tab} onSelect={setTab} />}
        />
        <TabPanels base={base} tabs={tabs} selected={tab}>
          <div className="new-home-rows">
            <Row
              title="A proper journal, first."
              body="Write it or dictate it. Attach the goal, Heal item or meditation it’s about."
            >
              <div className="new-home-editor" aria-hidden>
                <div className="new-home-editor-tools">
                  <span className="new-home-editor-btn is-on">
                    <Bold size={14} strokeWidth={2.4} />
                  </span>
                  <span className="new-home-editor-btn">
                    <Italic size={14} strokeWidth={2} />
                  </span>
                  <span className="new-home-editor-btn">
                    <Underline size={14} strokeWidth={2} />
                  </span>
                  <span className="new-home-editor-btn">H1</span>
                  <span className="new-home-editor-btn">H2</span>
                  <span className="new-home-editor-btn">“</span>
                  <span className="new-home-editor-btn">
                    <List size={14} strokeWidth={2} />
                  </span>
                  <span className="new-home-editor-btn">
                    <ListOrdered size={14} strokeWidth={2} />
                  </span>
                  <span className="new-home-editor-btn">
                    <Minus size={14} strokeWidth={2} />
                  </span>
                  <span className="new-home-editor-btn">
                    <ImageIcon size={14} strokeWidth={2} />
                  </span>
                  <em>Saved · 21/10 · 22:14</em>
                </div>
                <div className="new-home-editor-body">
                  <h4 className="new-home-display">Tuesday, late</h4>
                  <p>
                    Spent the whole evening on the <strong>pricing sheet</strong> and still didn&apos;t
                    send it. I know what the numbers are. What I don&apos;t know is whether I&apos;m
                    allowed to ask for them.
                  </p>
                  <blockquote>
                    &apos;Price the first collection&apos; has been the next step for two weeks now.
                  </blockquote>
                  <ul>
                    <li>Send the sheet to Mum first</li>
                    <li>Then to the gallery</li>
                  </ul>
                </div>
                <div className="new-home-editor-attached">
                  <span>Attached</span>
                  <em>
                    <HomeV2ToolIcon tool="manifest" size={14} />
                    Manifest goal · Open my own studio
                  </em>
                  <em>
                    <HomeV2ToolIcon tool="meditate" size={14} />
                    Meditation · Before the pitch
                  </em>
                  <em>
                    <Heart size={14} strokeWidth={1.75} />
                    Heal · Self-sabotage
                  </em>
                  <span className="new-home-editor-add">+ Attach</span>
                </div>
              </div>
            </Row>
            <Row title="Bring your old journals with you.">
              <button type="button" className="new-home-import" onClick={openJournalImport}>
                <strong>Import a journal</strong>
                <div>
                  {IMPORT_CHIPS.map((chip) => (
                    <em key={chip}>{chip}</em>
                  ))}
                </div>
              </button>
            </Row>
          </div>

          <div className="new-home-rows">
            <Row title="A gratitude journal, with a daily reminder.">
              <div className="new-home-thanks">
                <div className="new-home-thanks-remind">
                  <div className="new-home-thanks-art" aria-hidden>
                    <span>Illustration · Gratitude (evening window, warm lamp)</span>
                  </div>
                  <div className="new-home-thanks-alarm">
                    <span className="new-home-thanks-bell">
                      <Bell size={16} strokeWidth={1.75} />
                    </span>
                    <span>
                      <strong className="new-home-display">Every evening, 9:00 pm</strong>
                      <em>Three things that went well today</em>
                    </span>
                    <i className="new-home-switch" aria-hidden />
                  </div>
                  <div className="new-home-thanks-week">
                    {(
                      [
                        ["mon", "M", true],
                        ["tue", "T", true],
                        ["wed", "W", true],
                        ["thu", "T", true],
                        ["fri", "F", true],
                        ["sat", "S", false],
                        ["sun", "S", false],
                      ] as const
                    ).map(([id, label, on]) => (
                      <span key={id} className={on ? "is-on" : undefined}>
                        <i>
                          {on ? <Check size={14} strokeWidth={2.4} /> : null}
                        </i>
                        {label}
                      </span>
                    ))}
                  </div>
                  <p className="new-home-thanks-streak">✦ 5 days in a row</p>
                </div>
                <div className="new-home-thanks-list">
                  <header>
                    <h4 className="new-home-display">Grateful for · Tuesday 21/10</h4>
                    <Heart size={16} strokeWidth={1.75} aria-hidden />
                  </header>
                  <ol>
                    <li>
                      <span>1</span>My first paying customer
                    </li>
                    <li>
                      <span>2</span>A quiet morning to paint
                    </li>
                    <li>
                      <span>3</span>Mum asking about the shop
                    </li>
                  </ol>
                  <div className="new-home-thanks-look">
                    <span>Look back</span>
                    <em>Mon 20/10</em>
                    <em>Sun 19/10</em>
                    <em>Sat 18/10</em>
                    <span className="new-home-thanks-all">All days →</span>
                  </div>
                </div>
              </div>
            </Row>
          </div>

          <div className="new-home-pair">
            <Row
              title="Every entry, read back to you."
              body="The vision, self-doubt and gratitude in what you wrote, underlined and counted."
            >
              <article className="new-home-insight-entry">
                <p>
                  “<mark className="is-vision">I can picture the studio so clearly</mark>. But{" "}
                  <mark className="is-doubt">who am I to charge for this?</mark>{" "}
                  <mark className="is-thanks">Grateful for a quiet morning</mark> to paint.”
                </p>
                <ul>
                  <li className="is-vision">Vision</li>
                  <li className="is-doubt">Self-doubt</li>
                  <li className="is-thanks">Gratitude</li>
                </ul>
                <h4>Patterns this month</h4>
                <div>
                  <span>
                    Vision <i style={{ width: "90%" }} /> 9
                  </span>
                  <span>
                    Self-doubt <i style={{ width: "60%" }} /> 6
                  </span>
                  <span>
                    Gratitude <i style={{ width: "40%" }} /> 4
                  </span>
                </div>
              </article>
            </Row>
            <Row
              title="Insights."
              body="Mood week by week, and a letter on your month if you want one."
            >
              <article className="new-home-insight-mood">
                <h4>Mood, week by week</h4>
                <div aria-hidden>
                  {[40, 35, 55, 50, 70, 78, 88, 94].map((height, index) => (
                    <i key={index} style={{ height: `${height}%` }} />
                  ))}
                </div>
                <p>You doubt yourself most on Sundays, and least after you&apos;ve made something.</p>
              </article>
            </Row>
          </div>
        </TabPanels>
      </div>
    </section>
  );
}

function HealBand() {
  const base = useId();
  const [tab, setTab] = useState(0);
  const tabs = ["What you're carrying", "Work through it"];

  return (
    <section id="heal" className="new-home-band new-home-dark">
      <div className="new-home-wrap">
        <BandHead
          light
          lockup={["consciously", "Heal"]}
          title="Face what keeps stopping you."
          body="For the blocks that keep coming back. Work through them and get past them for good."
          tabs={<FeatureTabs base={base} label="Heal" tabs={tabs} selected={tab} onSelect={setTab} />}
        />
        <TabPanels base={base} tabs={tabs} selected={tab}>
          <div className="new-home-rows">
            <Row
              title="One card for each thing you're carrying."
              body="Patterns, heartbreak, regret, grief. Name it, note how long it's been there, and write the bad-day thought and the one you'd rather believe."
            >
              <div className="new-home-carry">
                {(
                  [
                    ["Pattern", "Self-sabotage", "Since 2022", "I get scared when it matters. Now I notice it and keep going."],
                    ["Heartbreak", "Me and Sam", "Since January", "It ended, but the three years weren’t wasted."],
                    ["Regret", "Leaving the band", "Since 2021", "Leaving was right for then. I can still play."],
                    ["Laid to rest", "Losing the job", "Lighter since May", ""],
                  ] as const
                ).map(([kind, title, since, line]) => (
                  <article key={title} className={kind === "Laid to rest" ? "is-rest" : ""}>
                    <div>
                      <span>{kind}</span>
                      <strong>{title}</strong>
                      <em>{since}</em>
                    </div>
                    {line ? <p>{line}</p> : null}
                  </article>
                ))}
              </div>
            </Row>
          </div>
          <div className="new-home-rows">
            <Row
              title="Work through it, one card at a time."
              body="Exercises for that block, an unsent letter, and one thing you can actually do. Any card can become a meditation."
            >
              <div className="new-home-heal-stage" style={{ backgroundImage: `url(${HEAL_ART})` }}>
                <article>
                  <span>On a bad day, I think…</span>
                  <p>I always ruin things just before they take off.</p>
                </article>
                <article>
                  <span>On a good day, I think…</span>
                  <p>I get scared when it matters. Now I notice it and keep going.</p>
                </article>
              </div>
              <div className="new-home-work-cards">
                <article>
                  <h4>Exercises</h4>
                  <p>
                    <span>01</span> What would you tell a friend who said this?
                  </p>
                  <em>Write your answer →</em>
                </article>
                <article>
                  <h4>Unsent letter</h4>
                  <p>Write what you can’t say out loud.</p>
                  <div>
                    <span>Keep it</span>
                    <span>Let it go</span>
                  </div>
                </article>
                <article>
                  <h4>Can you do anything?</h4>
                  <p>Book the launch date, and tell two friends.</p>
                  <em>Added to your Tracker</em>
                </article>
              </div>
            </Row>
          </div>
        </TabPanels>
      </div>
    </section>
  );
}

function FocusBand() {
  return (
    <section id="focus" className="new-home-band">
      <div className="new-home-wrap">
        <BandHead
          lockup={["consciously", "Focus"]}
          title="Give your hours to your dream."
          body="Pull the next step from your goals, settle your mind, do the work."
          action={
            <a className="new-home-text-link" href={appHref("/focus")}>
              Start a focus session <ChevronRight size={16} aria-hidden />
            </a>
          }
        />
        <div className="new-home-rows">
          <div className="new-home-focus-split" data-hv2-reveal>
            <div>
              <h3 className="new-home-display">A timer that knows your goals.</h3>
              <p>Settle in with a short meditation made for the step, then work to music or a soundscape.</p>
              <article className="new-home-focus-card">
                <div className="new-home-focus-top">
                  <div className="new-home-focus-ring">
                    <svg viewBox="0 0 120 120" aria-hidden>
                      <circle className="track" cx="60" cy="60" r="50" />
                      <circle className="arc" cx="60" cy="60" r="50" />
                    </svg>
                    <div>
                      <strong>18:24</strong>
                      <span>of 25:00</span>
                    </div>
                  </div>
                  <div className="new-home-focus-session">
                    <p>This session</p>
                    <ul>
                      <li className="is-done">
                        <i aria-hidden>
                          <Check size={14} strokeWidth={2.4} />
                        </i>
                        2-min settle-in meditation
                      </li>
                      <li className="is-now">
                        <i aria-hidden />
                        <span>
                          Price the first collection
                          <em>Manifest</em>
                        </span>
                      </li>
                      <li>
                        <i aria-hidden />
                        Email the framer
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="new-home-focus-points">
                  <div>
                    <strong>Your goals, ready</strong>
                    <span>Pull steps from Manifest, or add your own.</span>
                  </div>
                  <div>
                    <strong>Settle in first</strong>
                    <span>A short meditation made for the task.</span>
                  </div>
                  <div>
                    <strong>Sound while you work</strong>
                    <span>Music and soundscapes from the library.</span>
                  </div>
                </div>
                <div className="new-home-focus-now">
                  <span className="thumb" aria-hidden />
                  <div>
                    <small>Now playing</small>
                    <strong>Soft rain + ambient piano</strong>
                  </div>
                  <span className="pause" aria-hidden>
                    <Pause size={14} strokeWidth={2.4} />
                  </span>
                </div>
              </article>
            </div>
            <div>
              <h3 className="new-home-display">Add from Manifest.</h3>
              <p>Steps come straight from your goals.</p>
              <article className="new-home-focus-add">
                <div className="art" style={{ backgroundImage: `url(${FOCUS_ART})` }} />
                <ul>
                  <li className="is-on">
                    <i aria-hidden>
                      <Check size={13} strokeWidth={2.6} />
                    </i>
                    Price the first collection
                  </li>
                  <li>
                    <i aria-hidden>+</i>
                    Open the online shop
                  </li>
                  <li>
                    <i aria-hidden>+</i>
                    Photograph the collection
                  </li>
                </ul>
              </article>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CloseBand() {
  return (
    <section className="new-home-close">
      <Image
        src="/new-home/hero-a-night.jpg"
        alt=""
        fill
        sizes="100vw"
        className="new-home-close-photo"
      />
      <div className="new-home-wrap" data-hv2-reveal>
        <h2 className="new-home-display">
          Who are you <em>becoming?</em>
        </h2>
        <a className="new-home-mist" href={HOME_V2_START_FREE_HREF}>
          Start free
        </a>
      </div>
    </section>
  );
}

export function NewHomeSections() {
  const rootRef = useReveal();
  return (
    <div ref={rootRef}>
      <MeditateBand />
      <ManifestBand />
      <JournalBand />
      <HealBand />
      <FocusBand />
      <CloseBand />
    </div>
  );
}
