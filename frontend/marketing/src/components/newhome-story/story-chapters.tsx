import Image from "next/image";
import { Pause } from "lucide-react";
import { LogoMark } from "@/components/logo-mark";
import { Chapter, Copy } from "./chapter-shell";
import {
  HealChart,
  PlayDisc,
  SceneHarbour,
  SceneMeadow,
  SceneSummit,
  VisionFigure,
  WAVE_COMPACT,
  WAVE_MEDITATE,
  WAVE_STORY,
  Waveform,
} from "./story-art";

/* ───────────── 1 · Journal ───────────── */

const READ_BACK = [
  ["Self-doubt", 11, "88%"],
  ["Vision", 7, "56%"],
  ["Gratitude", 4, "32%"],
] as const;

function JournalChapter() {
  return (
    <Chapter
      id="journal"
      number={1}
      tone="cream"
      moment="Tonight"
      title="Write down what’s really going on."
      lede="Type it or say it. Consciously reads it back to you, picks out the doubt, and links it to the goal it’s holding up."
    >
      <div className="ns-journal">
        <article className="ns-card ns-entry">
          <div className="ns-entry-top">
            <span className="ns-entry-title ns-display">Tuesday, late</span>
            <span className="ns-entry-time">
              <Copy desktop="Saved · 22:14" mobile="22:14" />
            </span>
          </div>
          <p>
            Spent the whole evening on the pricing sheet and still didn’t send
            it.{" "}
            <span className="ns-hl-clear">I know what the numbers are.</span>{" "}
            <span className="ns-hl-doubt">
              What I don’t know is whether I’m allowed to ask for them.
            </span>
          </p>
          <div className="ns-tags">
            <span className="ns-chip">Manifest goal · Launch my business</span>
            <span className="ns-chip">Heal · Fear of failure</span>
          </div>
        </article>
        <div className="ns-journal-side">
          <aside className="ns-card ns-readback ns-lg-only">
            <span className="ns-label">Read back to you · this month</span>
            {READ_BACK.map(([name, count, width]) => (
              <div className="ns-bar-row" key={name}>
                <div className="ns-bar-label">
                  <span>{name}</span>
                  <span>{count}</span>
                </div>
                <span className="ns-bar" aria-hidden>
                  <i style={{ width }} />
                </span>
              </div>
            ))}
          </aside>
          <aside className="ns-card ns-insight">
            <span className="ns-label">Insight</span>
            <p className="ns-display">
              “You doubt yourself most on Sundays, and least after you’ve made
              something.”
            </p>
          </aside>
        </div>
      </div>
    </Chapter>
  );
}

/* ───────────── 2 · Meditate ───────────── */

const INPUTS = [
  ["Tuesday’s entry", "“…whether I’m allowed to ask for them.”"],
  ["Your goal", "Launch my business"],
  ["What’s in the way", "Fear of failure"],
] as const;

function MeditateChapter() {
  return (
    <Chapter
      id="meditate"
      number={2}
      tone="navy"
      moment="Tomorrow morning"
      title="A meditation made from what you wrote last night."
      lede={
        <Copy
          desktop="Written from your own words, your goal and what’s in the way. In the voice you choose, over the sound you like."
          mobile="Written from your own words, your goal and what’s in the way, in the voice you choose."
        />
      }
    >
      <div className="ns-meditate">
        <div className="ns-inputs ns-lg-only">
          {INPUTS.map(([label, text]) => (
            <div className="ns-card ns-input-card" key={label}>
              <span className="ns-label">{label}</span>
              <strong>{text}</strong>
            </div>
          ))}
        </div>
        <svg
          className="ns-connector ns-lg-only"
          viewBox="0 0 60 240"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 40 C34 40 26 120 60 120 M0 120 H60 M0 200 C34 200 26 120 60 120"
            fill="none"
            stroke="var(--ns-gold)"
            strokeWidth="1.6"
          />
        </svg>
        <span className="ns-made-from ns-sm-only">Made from</span>
        <div className="ns-made-chips ns-sm-only">
          <span>Tuesday’s entry</span>
          <span>Launch my business</span>
          <span>Fear of failure</span>
        </div>
        <div className="ns-player">
          <div className="ns-player-art">
            <SceneSummit />
          </div>
          <div className="ns-player-body">
            <span className="ns-player-meta">
              Visualisation · 10 min · Beatrice
            </span>
            <span className="ns-player-title ns-display">
              Steady before the pitch
            </span>
            <span className="ns-player-script">
              “Picture tomorrow’s call. You know these numbers. Say the price,
              then let the silence do the work.”
            </span>
            <div className="ns-player-controls">
              <PlayDisc />
              <Waveform
                className="ns-lg-only"
                heights={WAVE_MEDITATE}
                played={22}
              />
              <Waveform
                className="ns-sm-only"
                heights={WAVE_COMPACT}
                played={12}
              />
            </div>
            <span className="ns-player-time ns-lg-only">3:12 of 10:00</span>
          </div>
        </div>
      </div>
    </Chapter>
  );
}

/* ───────────── 3 · Heal ───────────── */

const MOOD_DOTS = ["0%", "25%", "50%", "100%"] as const;

function HealChapter() {
  return (
    <Chapter
      id="heal"
      number={3}
      tone="cream"
      moment="When it comes up again"
      title="Find the fear underneath, and work on it."
      lede={
        <Copy
          desktop="Name it, write the bad-day thought and the one you’d rather believe, and check in on how it feels. Over the weeks, you watch it move."
          mobile="Name it, write the thought you’d rather believe, and watch how it feels change over the weeks."
        />
      }
      quote={{
        text: "I’d been stuck on a breakup for years. Making meditations from Heal gives me something to turn to when the bad thoughts come up.",
        by: "Sarah · Healing from trauma · 2 weeks",
      }}
    >
      <div className="ns-heal">
        <div className="ns-heal-row">
          <article className="ns-card ns-thought is-bad">
            <span className="ns-label">On a bad day, I think…</span>
            <blockquote>“I always ruin things just before they take off.”</blockquote>
          </article>
          <article className="ns-card ns-thought is-good ns-lg-only">
            <span className="ns-label">On a good day, I think…</span>
            <blockquote>
              “I get scared when it matters. Now I notice it and keep going.”
            </blockquote>
          </article>
        </div>
        <div className="ns-heal-row">
          <article className="ns-card ns-mood">
            <div className="ns-mood-top">
              <span>Right now it feels</span>
              <span>Mostly good</span>
            </div>
            <div
              className="ns-slider"
              role="img"
              aria-label="Mood slider set to mostly good"
            >
              <span className="ns-slider-track" />
              <span className="ns-slider-fill" />
              {MOOD_DOTS.map((left) => (
                <span key={left} className="ns-slider-dot" style={{ left }} />
              ))}
              <span className="ns-slider-thumb" style={{ left: "75%" }}>
                <LogoMark size={22} />
              </span>
            </div>
            <div className="ns-mood-foot">
              <span className="ns-lg-only">Bad day</span>
              <span>Up from mostly bad in October</span>
              <span className="ns-lg-only">Good day</span>
            </div>
          </article>
          <article className="ns-card ns-chart-card">
            <span className="ns-label">How it’s felt · 8 weeks</span>
            <span className="ns-chart-headline">
              From mostly bad to mostly good.
            </span>
            <div className="ns-lg-only">
              <HealChart />
            </div>
            <div className="ns-sm-only">
              <HealChart tall />
            </div>
            <span className="ns-chart-source">From your weekly check-ins</span>
          </article>
        </div>
      </div>
    </Chapter>
  );
}

/* ───────────── 4 · Focus ───────────── */

const GOALS = [
  ["Build the website", "DOING", true],
  ["Write the homepage copy", "MANIFEST", false],
  ["Find the first ten customers", "MANIFEST", false],
] as const;

function FocusChapter() {
  return (
    <Chapter
      id="focus"
      number={4}
      tone="cream-alt"
      moment="When you sit down to work"
      title="Do the thing you’ve been putting off."
      lede="Two minutes to settle in, a soundscape on, and the next step pulled straight from your goal."
      quote={{
        text: "I’d put off starting my business for years. Now my inner critic has gone quiet, and I’m working through the actual to-dos.",
        by: "David · Visualising success · 3 weeks",
      }}
    >
      <div className="ns-focus-stage">
        <div className="ns-phone-crop">
          <div className="ns-device-crop">
            <Image
              src="/newhome/focus-timer-phone.png"
              alt="Focus timer in the Consciously app"
              width={780}
              height={1688}
              sizes="(min-width: 1024px) 340px, 262px"
            />
          </div>
        </div>
        <div className="ns-focus-cards">
          <article className="ns-card ns-goals">
            <span className="ns-label">Your goals, ready</span>
            <span className="ns-card-note ns-lg-only">
              Pull steps from Manifest, or add your own.
            </span>
            {GOALS.map(([name, tag, doing]) => (
              <div
                key={name}
                className={`ns-goal${doing ? " is-doing" : ""}`}
              >
                <span>{name}</span>
                <span className="ns-goal-tag">{tag}</span>
              </div>
            ))}
            <span className="ns-add-from ns-lg-only">+ Add from Manifest</span>
          </article>
          <article className="ns-card ns-goals ns-lg-only">
            <span className="ns-label">Settle in first</span>
            <span className="ns-card-note">
              A short meditation made for the task.
            </span>
            <div className="ns-mini">
              <PlayDisc size={11} />
              <span>
                <strong>2-min settle-in meditation</strong>
                <small>For: Build the website</small>
              </span>
            </div>
            <span className="ns-label">Sound while you work</span>
            <span className="ns-card-note">
              Music and soundscapes from the library.
            </span>
            <div className="ns-mini is-playing">
              <span className="ns-pause" aria-hidden>
                <Pause size={12} fill="currentColor" strokeWidth={0} />
              </span>
              <span>
                <small>Now playing</small>
                <strong>Soft rain + ambient piano</strong>
              </span>
            </div>
          </article>
        </div>
      </div>
    </Chapter>
  );
}

/* ───────────── 5 · Manifest ───────────── */

function ManifestChapter() {
  return (
    <Chapter
      id="manifest"
      number={5}
      tone="navy"
      moment="Every night"
      title="Fall asleep to the life you’re building."
      lede={
        <Copy
          desktop="Your vision board, with you in every picture, and your story narrated back to you in the voice you choose."
          mobile="Your vision board, with you in every picture, and your story narrated back to you."
        />
      }
      quote={{
        text: "Like a companion in my pocket. Each part of my inner life has its own space, and most nights I fall asleep to my Story.",
        by: "Ananda · Aligning with myself · 4 weeks",
      }}
    >
      <div className="ns-manifest">
        <div className="ns-board">
          <span className="ns-tile ns-tile-main">
            <Image
              src="/newhome/vision-business.jpg"
              alt=""
              width={360}
              height={360}
              sizes="(min-width: 1024px) 380px, 200px"
            />
            <span className="ns-tile-cap">A business that pays me well</span>
          </span>
          <span className="ns-tile">
            <SceneHarbour />
            <VisionFigure left="55%" />
            <span className="ns-tile-cap">Working from anywhere</span>
          </span>
          <span className="ns-tile">
            <SceneMeadow />
            <VisionFigure left="30%" />
            <span className="ns-tile-cap">Sundays with the people I love</span>
          </span>
        </div>
        <p className="ns-board-note">
          Every picture is made from one photo of you.
        </p>
        <article className="ns-card ns-story">
          <span className="ns-story-meta">Sam’s story · Beatrice · 4 min</span>
          <span className="ns-story-text ns-display">
            “Sam wakes up excited for the day. The business is growing, the work
            feels like play, and every evening is free for the people who
            matter…”
          </span>
          <div className="ns-player-controls">
            <PlayDisc />
            <Waveform className="ns-lg-only" heights={WAVE_STORY} played={30} />
            <Waveform
              className="ns-sm-only"
              heights={WAVE_COMPACT}
              played={20}
            />
          </div>
        </article>
      </div>
    </Chapter>
  );
}

export function StoryChapters() {
  return (
    <>
      <JournalChapter />
      <MeditateChapter />
      <HealChapter />
      <FocusChapter />
      <ManifestChapter />
    </>
  );
}
