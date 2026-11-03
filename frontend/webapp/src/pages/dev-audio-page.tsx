/**
 * `/dev/audio` — native audio test bench (dev servers + internal builds only;
 * the route is compiled out of production). No sign-in: uses public Listen
 * items and the public sound catalog, through the real strip + provider.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  backgroundAudioPlaybackKey,
  backgroundAudioStreamingKey,
  mediaFileUrl,
  trackFromFocusMix,
  type BackgroundAudioItem,
} from "@consciously/common";
import {
  LibraryPlayerProvider,
  useLibraryPlayer,
  type LibraryActiveTrack,
} from "@/components/library-player-provider";
import { getMedimadeApiBase, getMedimadeMediaBaseUrl, listBackgroundAudio } from "@/lib/medimade-api";
import { isNativeApp, nativePlatform } from "@/lib/native/native-bridge";
import {
  clearNativeAudioLog,
  formatNativeAudioLogTime,
  nativeAudioLog,
  nativeAudioLogEntries,
  nativeAudioLogText,
  subscribeNativeAudioLog,
} from "@/lib/native/native-audio-log";

const HOUSE_USERNAME = "consciously";
const MAX_ITEMS = 3;

type TestItem = {
  id: string;
  title: string;
  audioUrl: string;
  coverImageUrl: string | null;
  durationSec: number | null;
  source: "listen" | "catalog";
};

type OfflineApi = typeof import("@/lib/native/offline-audio");

function parseListenItems(data: unknown): TestItem[] {
  if (!data || typeof data !== "object") return [];
  const o = data as { meditations?: unknown[]; stories?: unknown[] };
  const rows = [...(o.meditations ?? []), ...(o.stories ?? [])];
  const out: TestItem[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const audioUrl = typeof r.audioUrl === "string" ? r.audioUrl.trim() : "";
    if (!audioUrl) continue;
    out.push({
      id: `listen:${String(r.slug ?? audioUrl)}`,
      title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : "Untitled",
      audioUrl,
      coverImageUrl: typeof r.coverImageUrl === "string" ? r.coverImageUrl : null,
      durationSec: typeof r.durationSec === "number" ? r.durationSec : null,
      source: "listen",
    });
  }
  return out;
}

async function fetchListenTestItems(): Promise<TestItem[]> {
  const base = getMedimadeApiBase();
  if (!base) return [];
  const urls = [`${base}/public/listen/${HOUSE_USERNAME}`, `${base}/public/listen`];
  const seen = new Set<string>();
  const out: TestItem[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      for (const item of parseListenItems(await res.json())) {
        if (seen.has(item.audioUrl)) continue;
        seen.add(item.audioUrl);
        out.push(item);
      }
    } catch {
      /* try next */
    }
    if (out.length >= MAX_ITEMS) break;
  }
  return out.slice(0, MAX_ITEMS);
}

function trackForItem(item: TestItem, soundscape: BackgroundAudioItem | null): LibraryActiveTrack {
  const base: LibraryActiveTrack = {
    url: item.audioUrl,
    title: item.title,
    s3Key: `dev:audio:${item.id}${soundscape ? ":soundscape" : ""}`,
    ...(item.coverImageUrl ? { coverImageUrl: item.coverImageUrl } : {}),
    ...(item.durationSec ? { durationSeconds: item.durationSec } : {}),
  };
  if (!soundscape) return base;
  return {
    ...base,
    liveMix: true,
    musicKey: backgroundAudioStreamingKey(soundscape.key),
    musicGain: 50,
    natureKey: "",
    drumsKey: "",
    noiseKey: "",
    mediaCacheBust: soundscape.updatedAt ?? null,
  };
}

function DownloadControls({ url, offline }: { url: string; offline: OfflineApi | null }) {
  const [progress, setProgress] = useState<{ bytes: number; total: number } | null>(null);
  const [saved, setSaved] = useState(() => offline?.offlineAudioEntry(url) ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setSaved(offline?.offlineAudioEntry(url) ?? null), [offline, url]);
  if (!offline) return <span className="text-xs text-muted">Download: native only</span>;

  if (saved) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="text-muted">Saved · {offline.formatBytes(saved.bytes)}</span>
        <button
          type="button"
          className="rounded-full border border-current px-3 py-1"
          onClick={() => void offline.deleteOfflineAudio(url).then(() => setSaved(null))}
        >
          Delete
        </button>
      </span>
    );
  }
  if (progress) {
    const pct = progress.total > 0 ? Math.round((progress.bytes / progress.total) * 100) : null;
    return (
      <span className="text-xs text-muted">
        Downloading {pct != null ? `${pct}%` : ""} · {offline.formatBytes(progress.bytes)}
        {progress.total > 0 ? ` / ${offline.formatBytes(progress.total)}` : ""}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <button
        type="button"
        className="rounded-full border border-current px-3 py-1"
        onClick={() => {
          setError(null);
          setProgress({ bytes: 0, total: 0 });
          void offline
            .downloadOfflineAudio(url, (bytes, total) => setProgress({ bytes, total }))
            .then((entry) => setSaved(entry))
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setProgress(null));
        }}
      >
        Download
      </button>
      {error ? <span className="text-red-500">{error}</span> : null}
    </span>
  );
}

function EventLog() {
  const entries = useSyncExternalStore(subscribeNativeAudioLog, nativeAudioLogEntries, nativeAudioLogEntries);
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    const text = nativeAudioLogText();
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    };
    void navigator.clipboard?.writeText(text).then(done, () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      done();
    });
  }, []);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Event log ({entries.length})</h2>
        <div className="flex gap-2 text-xs">
          <button type="button" className="rounded-full border border-current px-3 py-1" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className="rounded-full border border-current px-3 py-1"
            onClick={clearNativeAudioLog}
          >
            Clear
          </button>
        </div>
      </div>
      <ol className="max-h-80 overflow-y-auto rounded-xl border border-current/20 p-2 font-mono text-[11px] leading-snug">
        {entries.length === 0 ? <li className="text-muted">No events yet.</li> : null}
        {[...entries].reverse().map((e) => (
          <li key={e.id} className="whitespace-pre-wrap break-all">
            <span className="text-muted">{formatNativeAudioLogTime(e.at)}</span>{" "}
            <span className="font-semibold">{e.kind}</span> {e.message}
          </li>
        ))}
      </ol>
    </section>
  );
}

function DevAudioBench() {
  const player = useLibraryPlayer();
  const native = isNativeApp();
  const mediaBase = getMedimadeMediaBaseUrl();
  const [items, setItems] = useState<TestItem[] | null>(null);
  const [catalog, setCatalog] = useState<{
    compositions: BackgroundAudioItem[];
    nature: BackgroundAudioItem[];
    noise: BackgroundAudioItem[];
  } | null>(null);
  const [offline, setOffline] = useState<OfflineApi | null>(null);
  const [customUrl, setCustomUrl] = useState("");

  useEffect(() => {
    if (!native) return;
    void import("@/lib/native/offline-audio").then(setOffline);
  }, [native]);

  useEffect(() => {
    let cancelled = false;
    void fetchListenTestItems().then((list) => {
      if (!cancelled) setItems(list);
    });
    void listBackgroundAudio()
      .then((data) => {
        if (cancelled) return;
        setCatalog({
          compositions: data.compositions ?? [],
          nature: data.nature ?? [],
          noise: data.noise ?? [],
        });
      })
      .catch((e) => nativeAudioLog("error", `sound catalog: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      cancelled = true;
    };
  }, []);

  const compositions = catalog?.compositions ?? [];
  const pairedSoundscape = compositions[0] ?? null;

  /** Without pinned Listen items, stand in with catalog soundscapes (real duration, seekable). */
  const testItems = useMemo<TestItem[]>(() => {
    if (items && items.length > 0) return items;
    if (!mediaBase) return [];
    return compositions.slice(1, 1 + MAX_ITEMS).map((c) => ({
      id: `catalog:${c.key}`,
      title: c.name,
      audioUrl: mediaFileUrl(mediaBase, backgroundAudioPlaybackKey(c.key), c.updatedAt),
      coverImageUrl: c.coverImageUrl ?? null,
      durationSec: null,
      source: "catalog" as const,
    }));
  }, [items, compositions, mediaBase]);

  const focusSoundscape = useMemo(() => {
    if (!pairedSoundscape) return null;
    return trackFromFocusMix(
      {
        natureKey: "",
        musicKey: pairedSoundscape.key,
        drumsKey: "",
        noiseKey: "",
        natureGain: 0,
        musicGain: 60,
        drumsGain: 0,
        noiseGain: 0,
      },
      { title: `Focus · ${pairedSoundscape.name}`, mediaBase, compositions },
    );
  }, [pairedSoundscape, mediaBase, compositions]);

  const focusMix = useMemo(() => {
    const nature = catalog?.nature[0];
    const noise = catalog?.noise[0];
    if (!nature && !noise) return null;
    return trackFromFocusMix(
      {
        natureKey: nature?.key ?? "",
        musicKey: "",
        drumsKey: "",
        noiseKey: noise?.key ?? "",
        natureGain: 40,
        musicGain: 0,
        drumsGain: 0,
        noiseGain: 15,
      },
      { title: "Focus · Rain mix", mediaBase, compositions },
    );
  }, [catalog, mediaBase, compositions]);

  const play = (track: LibraryActiveTrack) => {
    nativeAudioLog("play", `tap: ${track.title}`);
    player.playTrack(track);
  };

  const btn = "rounded-full border border-current px-3 py-1 text-xs";

  return (
    <main
      className="native-safe-top mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-5 py-8"
      style={{ paddingBottom: player.playerStripHeightPx + 32 }}
    >
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl">Audio test</h1>
        <p className="text-xs text-muted">
          {native ? `Native · ${nativePlatform()}` : "Web"} · {import.meta.env.MODE}
          {player.playingS3Key ? " · playing" : ""}
        </p>
        <p className="text-xs text-muted">
          Lock the phone, flip the silent switch, open Control Centre, take a call: each event lands in the
          log below.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Meditations</h2>
        {items === null ? <p className="text-xs text-muted">Loading public Listen…</p> : null}
        {items !== null && items.length === 0 ? (
          <p className="text-xs text-muted">
            No public Listen items (user “{HOUSE_USERNAME}” or listed examples). Using catalog soundscapes as
            stand-ins — pin examples in Admin → Listen to test real meditations.
          </p>
        ) : null}
        {testItems.map((item, i) => (
          <div key={item.id} className="flex flex-col gap-2 rounded-2xl border border-current/20 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <span className="shrink-0 text-xs text-muted">{item.source}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btn} onClick={() => play(trackForItem(item, null))}>
                Play
              </button>
              {i === 0 && pairedSoundscape ? (
                <button
                  type="button"
                  className={btn}
                  onClick={() => play(trackForItem(item, pairedSoundscape))}
                >
                  Play + soundscape ({pairedSoundscape.name})
                </button>
              ) : null}
              <DownloadControls url={item.audioUrl} offline={offline} />
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Focus sounds</h2>
        <div className="flex flex-wrap gap-2">
          {focusSoundscape ? (
            <button type="button" className={btn} onClick={() => play(focusSoundscape)}>
              {focusSoundscape.title}
            </button>
          ) : null}
          {focusMix ? (
            <button type="button" className={btn} onClick={() => play(focusMix)}>
              {focusMix.title} (∞)
            </button>
          ) : null}
          {!focusSoundscape && !focusMix ? <p className="text-xs text-muted">Loading sound catalog…</p> : null}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Any URL</h2>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-full border border-current/30 bg-transparent px-3 py-1 text-xs"
            placeholder="https://…/voice.m4a"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
          />
          <button
            type="button"
            className={btn}
            disabled={!/^https?:\/\//.test(customUrl.trim())}
            onClick={() =>
              play({ url: customUrl.trim(), title: "Custom URL", s3Key: `dev:audio:url:${customUrl.trim()}` })
            }
          >
            Play
          </button>
        </div>
      </section>

      <EventLog />
    </main>
  );
}

export default function DevAudioPage() {
  return (
    <LibraryPlayerProvider>
      <DevAudioBench />
    </LibraryPlayerProvider>
  );
}
