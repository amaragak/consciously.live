"use client";

import { useLibraryPlayer } from "@/components/library-player-provider";
import type { LibraryMeditationItem } from "@/lib/medimade-api";

type Sample = {
  prompt: string;
  item: LibraryMeditationItem;
};

/** Three community-library picks for the Meditate marketing hero. */
const SAMPLES: Sample[] = [
  {
    prompt: "My mind won’t stop scattering — help me come back to the breath.",
    item: {
      id: "b3f239a6-5528-448e-bb70-409637c4b6c3",
      sk: "2026-08-15T11:34:06.023Z#b3f239a6-5528-448e-bb70-409637c4b6c3",
      s3Key: "meditations/_/0e3a06f4-cbd8-4c33-a067-f1e30c41db72.mp3",
      audioUrl:
        "https://d3k8rq6eqba40d.cloudfront.net/meditations/_/0e3a06f4-cbd8-4c33-a067-f1e30c41db72.mp3",
      title: "Following Your Breath Through the Scatter",
      meditationType: "Breath-led",
      meditationStyle: "Breath-led",
      speakerModelId: "21bcb45116b44157820dbffb1927e185",
      speakerName: "Alan Watts",
      description:
        "A gentle meditation that anchors your scattered mind by observing the breath naturally as it flows through your body.",
      createdAt: "2026-08-15T11:34:06.023Z",
      durationSeconds: 128.064,
      liveMix: true,
      backgroundMusicKey: "background-audio/music/432Hz/Antarctica Pad.mp3",
      backgroundNatureKey: "background-audio/nature/Children Playing.mp3",
      backgroundNoiseKey: "background-audio/noise/Vinyl Crackle.mp3",
      backgroundMusicGain: 50,
      backgroundNatureGain: 25,
      backgroundNoiseGain: 12,
      coverImageUrl:
        "https://d3k8rq6eqba40d.cloudfront.net/meditation-covers/_/b3f239a6-5528-448e-bb70-409637c4b6c3.jpg",
      isPublic: true,
      favourite: false,
      archived: false,
      catalogued: true,
      isDraft: false,
      scriptText: null,
      scriptTruncated: false,
      mp3Bytes: 1051917,
      rating: null,
    },
  },
  {
    prompt: "I’m so hard on myself. A short practice in self-compassion.",
    item: {
      id: "04fa5b91-fa0c-4351-b68d-00ee172e70b0",
      sk: "2026-08-13T19:39:28.824Z#04fa5b91-fa0c-4351-b68d-00ee172e70b0",
      s3Key: "meditations/_/4ad91230-4ad0-4f34-9521-01bb2c32860a.mp3",
      audioUrl:
        "https://d3k8rq6eqba40d.cloudfront.net/meditations/_/4ad91230-4ad0-4f34-9521-01bb2c32860a.mp3",
      title: "Softening the Grip: A Practice in Self-Compassion",
      meditationType: "Loving-kindness",
      meditationStyle: "Loving-kindness",
      speakerModelId: "daffce3e2eb74bb59c0701f469d83177",
      speakerName: "Deep Soothing",
      description:
        "A heart-centered practice that guides you to release self-judgment and embrace imperfection.",
      createdAt: "2026-08-13T19:39:28.824Z",
      durationSeconds: 95.088,
      liveMix: true,
      backgroundMusicKey:
        "background-audio/music/432Hz/Pads/Fmaj/Crystal Bowl.mp3",
      backgroundNatureKey: "background-audio/nature/fire/Campfire.mp3",
      backgroundMusicGain: 24,
      backgroundNatureGain: 17,
      coverImageUrl:
        "https://d3k8rq6eqba40d.cloudfront.net/meditation-covers/_/04fa5b91-fa0c-4351-b68d-00ee172e70b0.jpg",
      isPublic: true,
      favourite: false,
      archived: false,
      catalogued: true,
      isDraft: false,
      scriptText: null,
      scriptTruncated: false,
      mp3Bytes: 783885,
      rating: null,
    },
  },
  {
    prompt: "Body scan to release tension in my chest and find some peace.",
    item: {
      id: "d709dad9-c7d2-40ab-86d3-60e1b38c9d00",
      sk: "2026-08-15T00:46:24.869Z#d709dad9-c7d2-40ab-86d3-60e1b38c9d00",
      s3Key: "meditations/_/62af7ea0-33ea-43f4-ad46-4aabc748bbe0.mp3",
      audioUrl:
        "https://d3k8rq6eqba40d.cloudfront.net/meditations/_/62af7ea0-33ea-43f4-ad46-4aabc748bbe0.mp3",
      title: "Full Body Scan: Release Tension and Find Inner Peace",
      meditationType: "Body scan",
      meditationStyle: "Body scan",
      speakerModelId: "9f2792501813486399fbc827c733d3f0",
      speakerName: "Brit Monk",
      description:
        "A guided head-to-toe body scan meditation that systematically brings awareness to each area of your body.",
      createdAt: "2026-08-15T00:46:24.869Z",
      durationSeconds: 242.76,
      liveMix: true,
      backgroundMusicKey: "background-audio/music/Samsara Bowl.mp3",
      backgroundNatureKey: "background-audio/nature/birds/Morning Birds.mp3",
      backgroundMusicGain: 23,
      backgroundNatureGain: 11,
      coverImageUrl:
        "https://d3k8rq6eqba40d.cloudfront.net/meditation-covers/_/d709dad9-c7d2-40ab-86d3-60e1b38c9d00.jpg",
      isPublic: true,
      favourite: false,
      archived: false,
      catalogued: true,
      isDraft: false,
      scriptText: null,
      scriptTruncated: false,
      mp3Bytes: 1796349,
      rating: null,
    },
  },
];

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ArrowDown() {
  return (
    <div
      className="flex justify-center text-[var(--hv2-gold)]"
      aria-hidden
    >
      <svg
        width="18"
        height="20"
        viewBox="0 0 20 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 2v18" />
        <path d="M3 14l7 7 7-7" />
      </svg>
    </div>
  );
}

export function MeditateHeroSamples() {
  const { playItem, toggleCurrent, nowPlaying, playingS3Key } =
    useLibraryPlayer();

  return (
    <div className="mt-2 flex w-full flex-col gap-3 md:mt-3">
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3 md:gap-5">
        {SAMPLES.map(({ prompt, item: m }) => {
          const type =
            m.meditationType?.trim() || m.meditationStyle?.trim() || "";
          const duration = formatDuration(m.durationSeconds);
          const isActive = Boolean(m.s3Key && nowPlaying?.s3Key === m.s3Key);
          const isPlaying = Boolean(m.s3Key && playingS3Key === m.s3Key);

          return (
            <li key={m.id} className="flex min-w-0 flex-col gap-2">
              <div className="home-v2-hero-glass rounded-[14px] border border-[var(--hv2-hero-card-border)] bg-[rgba(246,241,231,0.05)] px-4 py-3 text-left md:rounded-[16px] md:px-4 md:py-3.5">
                <p className="m-0 text-[10px] uppercase tracking-[1.3px] text-[var(--hv2-gold)] md:text-[11px]">
                  You ask
                </p>
                <p className="home-v2-display m-0 mt-1.5 text-[15px] italic leading-snug text-[var(--hv2-hero-fg)] md:text-[16px]">
                  “{prompt}”
                </p>
              </div>
              <ArrowDown />
              <div className="group home-v2-hero-glass relative flex min-h-0 flex-1 flex-col gap-3 rounded-[16px] border border-[var(--hv2-hero-card-border)] bg-[var(--hv2-hero-card-bg)] p-4 text-left text-[var(--hv2-hero-card-fg)] shadow-[var(--hv2-hero-elev)] transition-[box-shadow,border-color,background-color] duration-200 ease-out hover:border-[rgb(var(--hv2-gold-rgb)/0.55)] hover:bg-[rgba(246,241,231,0.09)] hover:shadow-[0_14px_36px_rgb(0_0_0_/_0.35),0_2px_8px_rgb(0_0_0_/_0.18)] md:rounded-[20px] md:p-5">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    aria-label={
                      isPlaying ? `Pause ${m.title}` : `Play ${m.title}`
                    }
                    onClick={() => {
                      if (!m.s3Key) return;
                      if (isActive) toggleCurrent();
                      else playItem(m);
                    }}
                    className="accent-fill-gradient flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--hv2-navy)] transition-opacity hover:opacity-90"
                  >
                    {isPlaying ? (
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path d="M8 5v14l11-7L8 5z" />
                      </svg>
                    )}
                  </button>
                  <span className="home-v2-display min-w-0 flex-1 text-[16px] leading-snug transition-colors duration-200 group-hover:text-[var(--hv2-gold)] md:text-[18px]">
                    {m.title}
                  </span>
                </div>
                <span className="mt-auto flex flex-wrap gap-x-2 gap-y-0.5 pl-14 text-[13px] text-[var(--hv2-hero-card-muted)]">
                  {type ? <span>{type}</span> : null}
                  {type && m.speakerName ? <span aria-hidden>·</span> : null}
                  {m.speakerName ? <span>{m.speakerName}</span> : null}
                  {(type || m.speakerName) && duration ? (
                    <span aria-hidden>·</span>
                  ) : null}
                  {duration ? <span>{duration}</span> : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
