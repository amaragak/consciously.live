#!/usr/bin/env python3
"""
Meditation harvester.

  search "terms" ["more terms"] [--type T] [--limit N]
              search YouTube; Haiku reads each result's title + description and keeps only
              real guided meditations, suggesting types -> data/videos.json
  search --defaults
              run the default query for every type in types.json
  add URL [URL ...] [--type T]
              add specific videos (still classified by Haiku, always kept)
  list        show every collected video with its given and suggested types
  download    pull audio for every kept video -> data/audio/<id>.m4a
  transcribe  local Whisper with word timings; silences become [pause Ns] -> data/transcripts/<id>.md
  classify    Haiku reads each transcript: confirms it's a guided meditation and suggests types
  synthesise  per type, Sonnet turns the transcripts + pacing stats (+ the style's delivery fingerprint, if
              `fingerprint` has run) into generation instructions
              -> output/instructions/<type>.md, output/instructions.json, output/analysis/<type>.md
  skeletons   per video, the session as passages + pauses (>= 4s) with Haiku-labelled roles/phases (no
              transcript text) -> data/skeletons/<id>.json; per-style pacing profiles; app import bundle
              -> output/skeletons.json, output/pacing.json, output/consciously-import.json
  fingerprint per style, how it is *delivered* vs the other styles: Haiku annotates each transcript (opening/closing
              moves, techniques, imagery, voice, delivery 1-5, repetition), code counts recurring 3-7 word phrases,
              Haiku groups them into families (marker / generic / foreign / neutral per style)
              -> output/fingerprints.json, output/fingerprints.md, and into output/consciously-import.json
  process     download + transcribe + classify + skeletons + fingerprint + synthesise

Every step skips work already done, so it is safe to re-run. --force redoes it.
"""
import argparse
import json
import os
import re
import statistics
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
AUDIO = DATA / "audio"
TRANSCRIPTS = DATA / "transcripts"
VIDEOS = DATA / "videos.json"
OUT = ROOT / "output"
INSTRUCTIONS = OUT / "instructions"
ANALYSIS = OUT / "analysis"
SKELETONS = DATA / "skeletons"
SKELETON_LABELS = DATA / "skeleton_labels"

# Cheap pre-filter before Haiku sees anything.
EXCLUDE_TITLE = [
    "no talking", "music only", "instrumental", "asmr", "#shorts", "hours of",
    "10 hours", "8 hours", "3 hours", "hz ", "binaural", "playlist", "compilation",
    "rain sounds", "white noise",
]


# ============================================================================ utils

def load_json(path, default=None):
    p = Path(path)
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


def save_json(path, obj):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(p)


def load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def fmt_ts(seconds):
    seconds = int(round(seconds or 0))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def log(msg):
    print(msg, flush=True)


def video_url(vid):
    return f"https://www.youtube.com/watch?v={vid}"


def check_type(types, t):
    """--type accepts one key or several comma-separated ('visualization,manifestation')."""
    if not t:
        return None
    parts = [x.strip() for x in t.split(",") if x.strip()]
    for x in parts:
        if x not in types:
            sys.exit(f"Unknown type '{x}'. Valid: {', '.join(types)}")
    return ",".join(parts)


def hints(v):
    """The type(s) you pointed a video at, as a list."""
    return [x for x in (v.get("user_type") or "").split(",") if x]


def resolve_type(v):
    """Primary type and how it was decided. Your hint(s) narrow it; the transcript confirms."""
    h = hints(v)
    tc = (v.get("transcript_check") or {}).get("types") or []
    if h:
        if tc:
            match = next((t for t in tc if t in h), None)
            if match:
                return match, f"your type, confirmed by transcript" + (f" (from {'/'.join(h)})" if len(h) > 1 else "")
            return tc[0], f"transcript classifier; you suggested {'/'.join(h)}"
        return h[0], "your type, not yet confirmed by transcript"
    vt = (v.get("vet") or {}).get("types") or []
    if tc:
        return tc[0], "transcript classifier"
    if vt:
        return vt[0], "title/description classifier"
    return None, ""


def parse_types_arg(types, arg):
    if not arg:
        return None
    wanted = [t.strip() for t in arg.split(",") if t.strip()]
    for t in wanted:
        check_type(types, t)
    return set(wanted)


# ============================================================================ LLM helpers

_client = None
_usage_lock = threading.Lock()


def client():
    global _client
    if _client is None:
        load_env()
        if not os.environ.get("ANTHROPIC_API_KEY"):
            sys.exit("ANTHROPIC_API_KEY not set. Put it in .env next to harvester.py (ANTHROPIC_API_KEY=sk-ant-...).")
        import anthropic
        _client = anthropic.Anthropic(max_retries=4)
    return _client


def llm_json(model, system, user, max_tokens=700):
    msg = client().messages.create(
        model=model, max_tokens=max_tokens, system=system,
        messages=[{"role": "user", "content": user}],
    )
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError(f"no JSON in reply: {text[:200]}")
    return json.loads(m.group(0))


def type_list(types):
    return "\n".join(f"- {k}: {v['label']}. {v['definition']}" for k, v in types.items())


def clean_types(types, lst, n):
    out = []
    for t in lst or []:
        t = str(t).strip().lower()
        if t in types and t not in out:
            out.append(t)
    return out[:n]


VET_SYSTEM = "You screen YouTube search results for a tool that collects guided meditations to study how they are written. Reply with one JSON object and nothing else."

VET_USER = """Meditation types:
{types}

Video:
- Title: {title}
- Channel: {channel}
- Length: {length}
- Description:
{description}
{expected}
Decide whether this video is itself a spoken, guided meditation in English that the listener follows along with. A short spoken intro before the guidance is fine. Answer false for interviews, podcasts, talks, lectures, sermons, courses or tutorials about meditation, reviews, reactions, trailers, music or soundscapes without spoken guidance, compilations of clips, and non-English guidance.

JSON:
{{"is_guided_meditation": true or false, "reason": "one short sentence", "types": ["best matching type key", "optional second key"]}}"""

CLASSIFY_SYSTEM = "You classify guided meditation transcripts. Reply with one JSON object and nothing else."

CLASSIFY_USER = """Meditation types:
{types}

Transcript (silences shown as [pause Ns], [mm:ss] marks when speech resumes):
{transcript}

First check it really is a guided meditation the listener follows (not a talk, interview or lecture). Then list up to three type keys it fits, best first, judged by what the guidance actually does rather than the title.

JSON:
{{"is_guided_meditation": true or false, "types": ["key", "..."], "reason": "one short sentence on why the first type fits"}}"""


# ============================================================================ videos store

def load_videos():
    return load_json(VIDEOS, {})


def is_active(v):
    if not v.get("accepted") or v.get("excluded"):
        return False
    tc = v.get("transcript_check")
    if tc and tc.get("is_guided_meditation") is False:
        return False
    return True


def effective_types(v, cfg):
    ts = []
    primary, _ = resolve_type(v)
    if primary:
        ts.append(primary)
    tc = v.get("transcript_check") or {}
    if cfg.get("synthesis_includes_machine_types") and tc.get("types"):
        if tc["types"][0] not in ts:
            ts.append(tc["types"][0])
    return ts


def filter_videos(videos, cfg, wanted):
    out = [v for v in videos.values() if is_active(v)]
    if wanted:
        out = [v for v in out if set(effective_types(v, cfg)) & wanted or set(hints(v)) & wanted]
    return out


# ============================================================================ search / add

def fetch_full(ydl, vid):
    try:
        info = ydl.extract_info(video_url(vid), download=False)
        return {
            "id": info["id"], "title": info.get("title"),
            "channel": info.get("channel") or info.get("uploader"),
            "views": info.get("view_count") or 0, "duration": info.get("duration") or 0,
            "url": video_url(info["id"]), "description": (info.get("description") or "")[:3000],
            "language": info.get("language"),
            "likes": info.get("like_count"), "likes_checked": True,
        }
    except Exception as e:
        log(f"  could not read {vid}: {e}")
        return None


def vet(cfg, types, meta, expected):
    exp = f"\nThe person searching expects one of these types: {expected.replace(',', ', ')}.\n" if expected else ""
    try:
        r = llm_json(cfg["vetting_model"], VET_SYSTEM, VET_USER.format(
            types=type_list(types), title=meta["title"], channel=meta["channel"],
            length=fmt_ts(meta["duration"]), description=meta["description"] or "(none)", expected=exp,
        ))
        return {
            "is_guided_meditation": bool(r.get("is_guided_meditation")),
            "reason": r.get("reason", ""), "types": clean_types(types, r.get("types"), 2),
        }
    except Exception as e:
        return {"is_guided_meditation": False, "reason": f"vetting failed: {e}", "types": [], "error": True}


def search(cfg, types, terms, user_type, limit, force):
    from yt_dlp import YoutubeDL

    videos = load_videos()
    flat = YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": "in_playlist", "skip_download": True})
    full = YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True})
    min_d, max_d = cfg["min_duration_minutes"] * 60, cfg["max_duration_minutes"] * 60
    par = cfg["parallel_llm_calls"]

    for term, ttype in terms:
        ttype = ttype or user_type
        log(f"\n[search] '{term}'" + (f"  (type: {ttype})" if ttype else ""))
        try:
            res = flat.extract_info(f"ytsearch{cfg['search_pool_per_query']}:{term}", download=False)
        except Exception as e:
            log(f"  search failed: {e}")
            continue

        pool = []
        for e in res.get("entries") or []:
            if not e or not e.get("id"):
                continue
            title = (e.get("title") or "").lower()
            dur = e.get("duration") or 0
            if any(x in title for x in EXCLUDE_TITLE) or (dur and not (min_d <= dur <= max_d)):
                continue
            pool.append(e)
        pool.sort(key=lambda e: e.get("view_count") or 0, reverse=True)

        kept, per_channel = 0, {}
        i = 0
        while kept < limit and i < len(pool):
            batch = []
            while len(batch) < par and i < len(pool):
                e = pool[i]; i += 1
                known = videos.get(e["id"])
                if known and not force:
                    if term not in known.setdefault("queries", []):
                        known["queries"].append(term)
                    if known.get("accepted"):
                        if ttype and not known.get("user_type"):
                            known["user_type"] = ttype
                        kept += 1
                        per_channel[known.get("channel")] = per_channel.get(known.get("channel"), 0) + 1
                        log(f"  =  {known['title']}  (already collected)")
                    if kept >= limit:
                        break
                    continue
                batch.append(e["id"])
            if not batch:
                continue
            with ThreadPoolExecutor(par) as ex:
                metas = [m for m in ex.map(lambda vid: fetch_full(full, vid), batch) if m]
            with ThreadPoolExecutor(par) as ex:
                vets = list(ex.map(lambda m: vet(cfg, types, m, ttype), metas))
            for m, vt in sorted(zip(metas, vets), key=lambda x: x[0]["views"], reverse=True):
                ch = m["channel"]
                over_channel = per_channel.get(ch, 0) >= cfg["max_per_channel_per_query"]
                ok = vt["is_guided_meditation"] and kept < limit and not over_channel
                if vt.get("error"):
                    log(f"  !  {m['title']} - {vt['reason']}")
                    continue  # not stored, so it's retried next time
                if vt["is_guided_meditation"] and not ok:
                    log(f"  -  {m['title']}  (passed, but over limit / channel cap; not stored)")
                    continue
                m.update({
                    "queries": [term], "user_type": ttype if ok else None, "source": "search",
                    "vet": vt, "accepted": ok,
                })
                videos[m["id"]] = m
                if ok:
                    kept += 1
                    per_channel[ch] = per_channel.get(ch, 0) + 1
                    log(f"  ✓  {m['views']:>11,}  {fmt_ts(m['duration'])}  {m['title']}  ({ch})  -> {', '.join(vt['types'])}")
                else:
                    log(f"  ✗  {m['title']}  ({ch})  - {vt['reason']}")
            save_json(VIDEOS, videos)
        log(f"  kept {kept}/{limit}")
    save_json(VIDEOS, videos)
    log(f"\n[search] {VIDEOS}  (set \"excluded\": true on any video to drop it)")


def add(cfg, types, urls, user_type):
    from yt_dlp import YoutubeDL

    videos = load_videos()
    full = YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True})
    for url in urls:
        m = re.search(r"(?:v=|youtu\.be/|shorts/|live/)([\w-]{11})", url)
        vid = m.group(1) if m else url
        meta = fetch_full(full, vid)
        if not meta:
            continue
        vt = vet(cfg, types, meta, user_type)
        meta.update({"queries": [], "user_type": user_type, "source": "manual", "vet": vt, "accepted": True})
        videos[meta["id"]] = meta
        flag = "" if vt["is_guided_meditation"] else f"  (Haiku doubts it: {vt['reason']}; kept anyway)"
        log(f"[add] {meta['title']} -> {user_type or ', '.join(vt['types'])}{flag}")
    save_json(VIDEOS, videos)


def list_videos(cfg, types, show_all):
    videos = load_videos()
    rows = sorted(videos.values(), key=lambda v: (not is_active(v), -(v.get("views") or 0)))
    for v in rows:
        if not show_all and not is_active(v):
            continue
        status = "kept" if is_active(v) else ("excluded" if v.get("excluded") else "rejected")
        given = v.get("user_type") or "-"
        vet_t = ",".join((v.get("vet") or {}).get("types", [])) or "-"
        tc = v.get("transcript_check") or {}
        tr_t = ",".join(tc.get("types", [])) or "-"
        mismatch = " *" if hints(v) and tc.get("types") and not set(tc["types"]) & set(hints(v)) else ""
        final = resolve_type(v)[0] or "-"
        sk = load_json(SKELETONS / f"{v['id']}.json")
        sk_s = f"{sk['counts']['passages']}p/{sk['counts']['pauses']}z" if sk else "-"
        log(f"{status:8} {v['id']}  {fmt_ts(v.get('duration'))}  -> {final:20} given:{given:30} meta:{vet_t:32} transcript:{tr_t}{mismatch}  skeleton:{sk_s}")
        log(f"         {v.get('title')}  ({v.get('channel')}, {v.get('views', 0):,} views)")
    log("\n-> = type it will be used for.  * = transcript matches none of the types you gave.  "
        "skeleton: Np/Nz = passages/pauses, - = none yet (run ./run.sh skeletons)")


# ============================================================================ download

def find_audio(vid):
    return [p for p in AUDIO.glob(f"{vid}.*") if not p.name.endswith((".part", ".ytdl"))]


def download(cfg, types, wanted, force):
    from yt_dlp import YoutubeDL

    AUDIO.mkdir(parents=True, exist_ok=True)
    for v in filter_videos(load_videos(), cfg, wanted):
        if find_audio(v["id"]) and not force:
            continue
        log(f"[download] {v['title']}")
        opts = {
            "quiet": True, "no_warnings": True,
            "format": "bestaudio[ext=m4a]/bestaudio",
            "outtmpl": str(AUDIO / "%(id)s.%(ext)s"),
            "overwrites": force,
        }
        try:
            with YoutubeDL(opts) as ydl:
                ydl.download([v["url"]])
        except Exception as e:
            log(f"[download]   failed: {e}")


# ============================================================================ transcribe

def build_transcript(words, duration, threshold):
    """words: list of (start, end, text). Returns (body, stats)."""
    if not words:
        return "", {"duration_s": round(duration or 0), "word_count": 0}

    lines, pauses, runs = [], [], []
    if words[0][0] >= threshold:
        pauses.append((0.0, words[0][0]))
        lines.append(f"[pause {plen(words[0][0])}s]")

    cur, cur_start, prev_end = [], words[0][0], words[0][0]
    for i, (s, e, w) in enumerate(words):
        gap = s - prev_end
        if i > 0 and gap >= threshold:
            runs.append((cur_start, prev_end))
            lines.append(f"[{fmt_ts(cur_start)}] " + "".join(cur).strip())
            lines.append(f"[pause {plen(gap)}s]")
            pauses.append((prev_end, s))
            cur, cur_start = [], s
        cur.append(w)
        prev_end = max(prev_end, e)
    runs.append((cur_start, prev_end))
    lines.append(f"[{fmt_ts(cur_start)}] " + "".join(cur).strip())

    if duration and duration - prev_end >= threshold:
        pauses.append((prev_end, duration))
        lines.append(f"[pause {plen(duration - prev_end)}s]  (silence/music to end)")

    duration = duration or prev_end
    speech_s = sum(e - s for s, e in runs)
    pause_lens = [e - s for s, e in pauses]
    n_words = len(words)

    deciles = []
    for d in range(10):
        a, b = duration * d / 10, duration * (d + 1) / 10
        silent = sum(max(0, min(e, b) - max(s, a)) for s, e in pauses)
        wc = sum(1 for s, _, _ in words if a <= s < b)
        here = [e - s for s, e in pauses if a <= s < b]
        deciles.append({
            "silence_pct": round(100 * silent / (b - a)) if b > a else 0, "words": wc,
            "pauses": len(here), "pause_median_s": round(statistics.median(here), 1) if here else 0,
            "pause_max_s": round(max(here), 1) if here else 0,
        })

    buckets = {"1-2s": 0, "2-5s": 0, "5-10s": 0, "10-30s": 0, "30-60s": 0, "60s+": 0}
    for p in pause_lens:
        key = "1-2s" if p < 2 else "2-5s" if p < 5 else "5-10s" if p < 10 else "10-30s" if p < 30 else "30-60s" if p < 60 else "60s+"
        buckets[key] += 1

    stats = {
        "duration_s": round(duration),
        "word_count": n_words,
        "speech_s": round(speech_s),
        "silence_pct": round(100 * (duration - speech_s) / duration) if duration else 0,
        "wpm_while_speaking": round(n_words / (speech_s / 60)) if speech_s else 0,
        "words_per_minute_of_runtime": round(n_words / (duration / 60), 1) if duration else 0,
        "pause_count": len(pause_lens),
        "pause_median_s": round(statistics.median(pause_lens), 1) if pause_lens else 0,
        "pause_max_s": round(max(pause_lens)) if pause_lens else 0,
        "pause_buckets": buckets,
        "first_words_at_s": round(words[0][0], 1),
        "last_words_at_s": round(prev_end, 1),
        "pacing_by_tenth": deciles,
    }
    return "\n".join(lines), stats


def plen(x):
    """Pause length as written in transcripts: one decimal under 10s, whole seconds above."""
    return f"{x:.1f}" if x < 10 else f"{round(x)}"


def stats_block(st):
    arc = " | ".join(f"{d['silence_pct']}%" for d in st.get("pacing_by_tenth", []))
    words = " | ".join(str(d["words"]) for d in st.get("pacing_by_tenth", []))
    lens = " | ".join(f"{d.get('pause_median_s', 0)}/{d.get('pause_max_s', 0)}s" for d in st.get("pacing_by_tenth", []))
    return (
        f"- Runtime: {fmt_ts(st['duration_s'])} | words: {st['word_count']} | "
        f"speaking: {fmt_ts(st.get('speech_s', 0))} | silence: {st.get('silence_pct', 0)}%\n"
        f"- Pace while speaking: {st.get('wpm_while_speaking', 0)} wpm | "
        f"words per minute of runtime: {st.get('words_per_minute_of_runtime', 0)}\n"
        f"- Pauses: {st.get('pause_count', 0)} | median {st.get('pause_median_s', 0)}s | "
        f"longest {st.get('pause_max_s', 0)}s | buckets {st.get('pause_buckets', {})}\n"
        f"- Silence % by tenth of runtime: {arc}\n"
        f"- Words by tenth of runtime: {words}\n"
        f"- Pause length by tenth of runtime (median/longest): {lens}"
    )


_model = None


def get_model(name):
    global _model
    if _model is None:
        import av
        if not getattr(av.open, "_harvester_patched", False):
            # Newer PyAV dropped the metadata_errors option faster-whisper still passes.
            _orig_open = av.open

            def _open(*a, **k):
                try:
                    return _orig_open(*a, **k)
                except TypeError as e:
                    if "metadata_errors" not in str(e):
                        raise
                    k.pop("metadata_errors", None)
                    return _orig_open(*a, **k)

            _open._harvester_patched = True
            av.open = _open
        from faster_whisper import WhisperModel
        log(f"[transcribe] loading Whisper model '{name}' (first run downloads it)")
        _model = WhisperModel(name, device="cpu", compute_type="int8")
    return _model


def transcribe(cfg, types, wanted, force):
    threshold = cfg["pause_threshold_seconds"]
    for v in filter_videos(load_videos(), cfg, wanted):
        out_md = TRANSCRIPTS / f"{v['id']}.md"
        out_json = TRANSCRIPTS / f"{v['id']}.json"
        if out_md.exists() and not force:
            continue
        audio = find_audio(v["id"])
        if not audio:
            log(f"[transcribe] no audio for {v['title']}, run download first")
            continue
        log(f"[transcribe] {v['title']}")
        t0 = time.time()
        segments, info = get_model(cfg["whisper_model"]).transcribe(
            str(audio[0]), language="en", word_timestamps=True, vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 700}, condition_on_previous_text=False,
        )
        words = [(float(w.start), float(w.end), w.word) for seg in segments for w in (seg.words or [])]
        body, st = build_transcript(words, float(info.duration), threshold)
        header = (
            f"# {v['title']}\n"
            f"- Channel: {v.get('channel')} | views: {v.get('views', 0):,} | {v['url']}\n"
            f"{stats_block(st) if st.get('word_count') else '- (no speech detected)'}\n\n"
        )
        out_md.parent.mkdir(parents=True, exist_ok=True)
        out_md.write_text(header + body + "\n", encoding="utf-8")
        save_json(out_json, {"video_id": v["id"], "stats": st, "words": words})
        log(f"[transcribe]   audio {fmt_ts(st.get('duration_s', 0))} | transcribed in {round(time.time() - t0)}s | "
            f"{st.get('word_count', 0)} words | {st.get('silence_pct', 0)}% silence")


# ============================================================================ classify

def transcript_excerpt(text, head=9000, tail=3000):
    body = text.split("\n\n", 1)[-1]
    if len(body) <= head + tail:
        return body
    return body[:head] + "\n\n[... middle omitted ...]\n\n" + body[-tail:]


def classify(cfg, types, wanted, force):
    videos = load_videos()
    todo = []
    for v in filter_videos(videos, cfg, wanted):
        md = TRANSCRIPTS / f"{v['id']}.md"
        if md.exists() and (force or not v.get("transcript_check")):
            todo.append((v, md))
    if not todo:
        log("[classify] nothing to classify")
        return

    def run(item):
        v, md = item
        try:
            r = llm_json(cfg["vetting_model"], CLASSIFY_SYSTEM, CLASSIFY_USER.format(
                types=type_list(types), transcript=transcript_excerpt(md.read_text(encoding="utf-8")),
            ))
            return v, {
                "is_guided_meditation": bool(r.get("is_guided_meditation")),
                "types": clean_types(types, r.get("types"), 3), "reason": r.get("reason", ""),
            }
        except Exception as e:
            log(f"[classify] {v['title']}: failed ({e})")
            return v, None

    with ThreadPoolExecutor(cfg["parallel_llm_calls"]) as ex:
        for v, tc in ex.map(run, todo):
            if not tc:
                continue
            videos[v["id"]]["transcript_check"] = tc
            note = ""
            if not tc["is_guided_meditation"]:
                note = "  NOT A GUIDED MEDITATION, dropped from synthesis"
            elif hints(v):
                match = next((t for t in tc["types"] if t in hints(v)), None)
                note = (f"  => {match} (confirmed from your {'/'.join(hints(v))})" if match
                        else f"  => {tc['types'][0] if tc['types'] else '?'} (none of your {'/'.join(hints(v))} fit)")
            log(f"[classify] {v['title']} -> {', '.join(tc['types'])}{note}")
    save_json(VIDEOS, videos)


# ============================================================================ synthesise

SYSTEM = """You analyse transcripts of popular guided meditations and turn them into generation instructions for an AI script writer.

The instructions you write are passed as a pre-prompt to {target} inside Consciously, an app that writes personalised guided meditation scripts which are then voiced by TTS. When a user picks the "{label}" style, your instructions tell the writer how a meditation of this style is built: structure, pacing, pauses, language and how to weave in the user's own context. The writer already receives the user's brief, their context and a target length separately; your job is to teach the style-specific craft: how to write a meditation of this style for any request, not what a typical one contains.

Everything you write is a default, not a rule. The user's request always wins: if they ask for a different direction, order, length, pacing, focus, tone, imagery, structure or anything else, the writer follows the request and uses your guidance only for whatever the request leaves open. So write every point as a default the writer applies when the user hasn't said otherwise. Do not use absolute words (never, always, must, only, do not) in a way that would stop the writer from following an explicit user request.

The style is defined as: {definition}

Ground every default in what the transcripts actually show (structure, timing, pause lengths, phrasing patterns), and generalise across sources rather than copying one teacher. Never reproduce more than six consecutive words from any source, and never name teachers, channels or brands."""

TASK = """Below are {n} transcripts of popular "{label}" meditations from YouTube, most viewed first. Silences of {threshold}s or longer appear inline as [pause Ns], at their measured length, right where they fall after what was said; [mm:ss] shows when each spoken passage starts. Each transcript is tagged with how it was assigned to this style; ones tagged as a secondary fit may blend in another style, so weight the primary ones more.

The scripts will be voiced by TTS, so the voice sets the speaking pace and the app handles overall length. Do not give speaking rates, words per minute, word budgets or silence percentages. Pause guidance should stay light; the writer judges individual pauses.

Pause data across these sources:
{aggregate}
{fingerprint_block}
Write two things.

<analysis>
Notes for the app's developer (not passed to the writer), under 250 words: what the sources share, where they differ, how they divide into phases, any source that doesn't fit this style, and what the pause patterns show.
</analysis>

<instructions>
The pre-prompt for the writer, as markdown. It teaches HOW to write this style, not WHAT a typical one contains. The user's request decides the content (focus, theme, imagery, order, length); the brief gives the writer the method for turning any request into a good meditation of this style. Write techniques and decision rules, each with the reason it works, instead of fixed sequences or lists of content. Where the sources share a common choice, give it as the default for when the request leaves that open. Don't prescribe fixed content (particular body parts in a set order, particular scenes, particular affirmations or phrases); anything like that appears only as a labelled example. Everything is guidance the writer applies with judgement, and the user's request overrides it. Address the writer directly.

The app writes each session in phases: it first plans the session as a sequence of sections (each with a purpose, what it covers, and where it starts and ends), then writes each section separately with the whole plan in view. This brief is read both when planning and when writing a section.

Cover:
1. Mechanism: what this style does to the listener's attention and state, and how the writing produces it, so the writer can judge requests the brief doesn't anticipate.
2. Phases: how sessions of this style unfold and how to divide one into sections. Describe the kinds of phase this style is built from and what each achieves; how to tell where one phase ends and the next begins (a change of focus, technique, depth or direction); how phases tend to size relative to the whole session, and whether a longer session gains more phases or lets each one run longer; what carries across phases (a thread that builds, recurring phrasing or images, a technique that returns) and how; how one phase hands over to the next so separately written sections still read as one session; and the default arc when the request doesn't say.
3. How things are brought in and said: how a new focus, technique or image is introduced and developed; the anatomy of a good cue (what it names, how it invites, what it leaves open); sequencing cues within a phase; transitions; how repetition and signature phrasing are used and varied; how instructions are softened or made permissive; sentence length, person and tense, sensory detail, and keeping it plain; and how the user's own material (goals, journal entries, struggles, a specific request) is woven in. Illustrate with short lines you write yourself.
4. Pauses, briefly. Give a few principles in plain terms, not rules: a pause gives the listener time to do what the line before asked, so its length follows the task; how silence tends to grow as the session deepens; and where not to pause. Mention typical ranges from the measured data in passing only. No tables and no per-moment rules: the writer is trusted to judge each pause. Write pauses as {marker}, where N is the length in seconds.
5. Opening and closing: how to do each, and how to adapt them to the request.
{expect_item}{n_mistakes}. Common mistakes and how to avoid them.
{n_example}. Worked example: invent a short, realistic user request for this style; show how you'd split it into phases (the purpose of each and what carries across), then a short excerpt (4–6 lines) from one phase showing how things are said and paused. Not a full script, no word counts.
Keep it tight enough to work as a pre-prompt: no preamble, no references to "the transcripts" or "the sources", under about {word_limit} words. Be concise: short bullets over prose, no repetition between sections, one or two example lines per point at most.
</instructions>

Return both sections wrapped in those exact tags and nothing else.

{transcripts}"""


FINGERPRINT_BLOCK = """
Delivery fingerprint for the "{label}" style, measured across all the meditations studied and compared with the other styles (shares are of this style's sessions; delivery ratings are 1-5 means):
{fingerprint}
"""

EXPECT_ITEM = """6. What listeners expect: a short section headed exactly "What listeners expect", turning the delivery fingerprint into defaults the writer applies when the request leaves them open. Keep it to a few bullets, about 150 words:
   - Standard opening and closing for this style, in their usual order, each stated with how common it is (e.g. "most sessions open with ..."; use the fingerprint's own frequency words). Present them as the default shape, not a script.
   - Expected delivery strength and voice in plain words (e.g. "assertive, present tense, as if already true" or "permissive and soft"), with person, how much it asks questions, and whether it repeats lines or invites the listener to repeat them.
   - Phrasing that fits: the marker families, described by what each does, with at most two short example phrasings of six words or fewer each.
   - Keep rare: the generic families, which are common everywhere and overused; use sparingly.
   - Avoid in this style: the foreign families, each with the style it belongs to.
   These are conventions that make the session sound like a familiar session of this style; the user's request overrides them, and the wording should stay fresh. Name families by what they do; never name teachers, channels or brands.
"""

PRECEDENCE = """> Guidance for {label} meditations, not fixed rules. Use judgement for each moment; the user's request overrides any of this.

"""


def aggregate_stats(stats):
    """Pause-focused summary for the synthesis prompt (no speaking-rate figures)."""
    stats = [s for s in stats if s.get("word_count")]
    if not stats:
        return "(no stats)"

    def med(rows, k):
        vals = [r[k] for r in rows if r.get(k) is not None]
        return round(statistics.median(vals), 1) if vals else 0

    plens = [round(statistics.median([s["pacing_by_tenth"][d].get("pause_median_s", 0) for s in stats]), 1) for d in range(10)]
    pmax = [round(statistics.median([s["pacing_by_tenth"][d].get("pause_max_s", 0) for s in stats])) for d in range(10)]
    buckets = {}
    for s in stats:
        for k, n in s.get("pause_buckets", {}).items():
            buckets[k] = buckets.get(k, 0) + n
    lines = [
        f"- Median session length: {fmt_ts(med(stats, 'duration_s'))} (range {fmt_ts(min(s['duration_s'] for s in stats))}–{fmt_ts(max(s['duration_s'] for s in stats))})",
        f"- Median typical pause: {med(stats, 'pause_median_s')}s; median longest pause: {med(stats, 'pause_max_s')}s",
        f"- All pauses by length, across sources: {buckets}",
        f"- Typical pause by tenth of the session (start to end): {' | '.join(f'{a}s' for a in plens)}",
        f"- Longest pause by tenth of the session (start to end): {' | '.join(f'{a}s' for a in pmax)}",
        f"- Silence before the first words (median): {med(stats, 'first_words_at_s')}s",
    ]
    groups = [("under 12 min", lambda d: d < 720), ("12–25 min", lambda d: 720 <= d < 1500), ("25 min or more", lambda d: d >= 1500)]
    for name, fn in groups:
        g = [s for s in stats if fn(s["duration_s"])]
        if g:
            lines.append(f"- Sessions {name} ({len(g)}): typical pause {med(g, 'pause_median_s')}s, longest {med(g, 'pause_max_s')}s, pauses per session {med(g, 'pause_count')}")
    return "\n".join(lines)


def assignment(v, key, cfg):
    primary, how = resolve_type(v)
    if primary == key:
        return f"primary ({how})"
    return "secondary fit (transcript's top type)"


def synthesise(cfg, types, wanted, force):
    videos = load_videos()
    combined = load_json(OUT / "instructions.json", {})
    marker = cfg["pause_marker"].replace("{s}", "N")
    fps = (load_fingerprints() or {}).get("styles", {})
    wrote = False

    for key in (sorted(wanted) if wanted else list(types)):
        out_path = INSTRUCTIONS / f"{key}.md"
        if out_path.exists() and not force:
            log(f"[synthesise] {key}: already written, skipping (--force to redo)")
            continue
        t = types[key]
        vids = [v for v in videos.values() if is_active(v) and key in effective_types(v, cfg)]
        vids.sort(key=lambda v: (assignment(v, key, cfg).startswith("secondary"), -(v.get("views") or 0)))
        docs, stats, used = [], [], []
        budget = cfg["max_transcript_chars_per_type"]
        for v in vids:
            md = TRANSCRIPTS / f"{v['id']}.md"
            if not md.exists():
                continue
            text = md.read_text(encoding="utf-8")
            # Speaking-rate figures aren't useful to the writer (TTS sets the pace), so keep them out.
            text = "\n".join(l for l in text.splitlines() if not re.match(r"- (Runtime:|Pace while speaking|Silence % by tenth|Words by tenth)", l))
            if sum(len(d) for d in docs) + len(text) > budget:
                log(f"[synthesise] {key}: char budget reached, leaving out {v['title']}")
                continue
            docs.append(f"<transcript index=\"{len(docs) + 1}\" assigned=\"{assignment(v, key, cfg)}\">\n{text}\n</transcript>")
            stats.append(load_json(TRANSCRIPTS / f"{v['id']}.json", {}).get("stats", {}))
            used.append(v)
        if not docs:
            log(f"[synthesise] {key}: no transcripts yet")
            continue

        fp = fps.get(key)
        if fp:
            fp_block = FINGERPRINT_BLOCK.format(label=t["label"], fingerprint=fingerprint_prompt(t["label"], fp))
            expect, n6, n7, words = EXPECT_ITEM, 7, 8, 750
        else:
            log(f"[synthesise] {key}: no delivery fingerprint yet (run ./run.sh fingerprint); writing without 'What listeners expect'")
            fp_block, expect, n6, n7, words = "", "", 6, 7, 600
        prompt = TASK.format(
            n=len(docs), label=t["label"], threshold=cfg["pause_threshold_seconds"],
            aggregate=aggregate_stats(stats), marker=marker, transcripts="\n\n".join(docs),
            fingerprint_block=fp_block, expect_item=expect, n_mistakes=n6, n_example=n7, word_limit=words,
        )
        log(f"[synthesise] {key}: sending {len(docs)} transcripts to {cfg['synthesis_model']}")
        with client().messages.stream(
            model=cfg["synthesis_model"], max_tokens=9000,
            system=SYSTEM.format(target=cfg["target_generator_model"], label=t["label"], definition=t["definition"]),
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            msg = stream.get_final_message()
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")

        ins = re.search(r"<instructions>\s*(.*?)\s*</instructions>", text, re.S)
        ana = re.search(r"<analysis>\s*(.*?)\s*</analysis>", text, re.S)
        if not ins:
            raw = OUT / "raw" / f"{key}.txt"
            raw.parent.mkdir(parents=True, exist_ok=True)
            raw.write_text(text, encoding="utf-8")
            log(f"[synthesise]   no <instructions> block in reply, raw saved to {raw}")
            continue

        INSTRUCTIONS.mkdir(parents=True, exist_ok=True)
        ANALYSIS.mkdir(parents=True, exist_ok=True)
        brief = PRECEDENCE.format(label=t["label"]) + ins.group(1).strip()
        out_path.write_text(brief + "\n", encoding="utf-8")
        sources = "\n".join(
            f"- {v['title']} ({v.get('channel')}, {v.get('views', 0):,} views) — {assignment(v, key, cfg)}; "
            f"transcript types: {', '.join((v.get('transcript_check') or {}).get('types', [])) or 'n/a'} — {v['url']}"
            for v in used
        )
        (ANALYSIS / f"{key}.md").write_text(
            f"# {t['label']}\n\n{(ana.group(1).strip() if ana else '(no analysis returned)')}\n\n"
            f"## Aggregate stats\n{aggregate_stats(stats)}\n\n## Sources\n{sources}\n",
            encoding="utf-8",
        )
        combined[key] = {"label": t["label"], "instructions": brief}
        save_json(OUT / "instructions.json", combined)
        wrote = True
        u = msg.usage
        log(f"[synthesise]   wrote {out_path.relative_to(ROOT)} ({u.input_tokens:,} in / {u.output_tokens:,} out tokens)")

    if wrote and (OUT / "skeletons.json").exists():  # keep the import bundle's style guides current
        export = build_exports(cfg, types, load_videos())
        if export["skeletons"]:
            write_exports(cfg, types, export)
            log(f"[synthesise] refreshed output/consciously-import.json ({export['import']['version']['id']})")


# ============================================================================ skeletons

ROLES = [
    "settle", "breath", "body", "imagery", "affirmation", "reflection prompt",
    "instruction", "story", "self-practice handover", "return", "close", "other",
]
PHASES = ["opening", "main", "closing"]

ROLE_HELP = """- settle: arriving, getting comfortable, closing the eyes, setting an intention or posture
- breath: breath awareness, counting breaths, a breathing pattern or breath-based instruction
- body: attention moved through the body, sensation, releasing tension in body parts
- imagery: an imagined place, scene, journey, light or other guided visualisation
- affirmation: statements to hear, repeat or take in (e.g. "I am...")
- reflection prompt: a question or prompt that invites the listener to reflect or notice
- instruction: a practical direction for a technique that is not breath, body or imagery (movement, noticing thoughts or sounds, how to do the exercise)
- story: narrative told to the listener (a tale, parable or scene with events)
- self-practice handover: the guide hands the listener over to practise alone in the silence that follows
- return: bringing the listener back to the room, the body, the day or waking
- close: final words, thanks, sign-off, ending
- other: anything that fits none of the above (introduction, housekeeping, chatter)"""

LABEL_SYSTEM = "You label the structure of guided meditations. Reply with one JSON object and nothing else."

LABEL_USER = """A guided meditation in the "{style}" style ("{title}", {runtime}) has been split into {n} spoken passages, in order. Silences of {pause_min:g}s or longer separate passages; the note on each passage says how far into the session it starts and how long the silence after it lasts. Each excerpt is trimmed ("..." marks omitted words).

Give each passage one role and one phase.

Roles (use these exact strings):
{roles}

Phases (use these exact strings):
- opening: arriving, settling and setting up, before the main practice begins
- main: the core practice of the session
- closing: winding down, returning, and ending
Phases run in order: opening, then main, then closing. They never go backwards, and a short session may skip one.

Passages:
{passages}

JSON, with one entry per passage, numbered as above:
{{"labels": [{{"n": 1, "role": "settle", "phase": "opening"}}, ...]}}"""


def wquant(pairs, q):
    """Weighted quantile (lower) of [(value, weight)]; None when empty."""
    pairs = sorted((v, w) for v, w in pairs if v is not None and w > 0)
    if not pairs:
        return None
    target = q * sum(w for _, w in pairs)
    cum = 0.0
    for v, w in pairs:
        cum += w
        if cum >= target - 1e-9:
            return v
    return pairs[-1][0]


def r1(x):
    return None if x is None else round(x, 1)


def r3(x):
    return None if x is None else round(x, 3)


def spread(pairs, nd=1):
    """median / p25 / p75 / min / max for [(value, weight)]; min and max ignore weights."""
    vals = [v for v, _ in pairs if v is not None]
    if not vals:
        return {"median": None, "p25": None, "p75": None, "min": None, "max": None}
    return {
        "median": round(wquant(pairs, 0.5), nd), "p25": round(wquant(pairs, 0.25), nd),
        "p75": round(wquant(pairs, 0.75), nd), "min": round(min(vals), nd), "max": round(max(vals), nd),
    }


def build_passages(words, duration_s, pause_min, short_min):
    """Split word timings into passages and pauses of pause_min seconds or more.

    Gaps under pause_min stay inside the passage; those of short_min or more are kept as its internal
    short pauses. Passages carry their text under '_text' for labelling only; it is never saved.
    Returns None when there are no words.
    """
    words = sorted(((float(s), float(e), w) for s, e, w in words), key=lambda x: x[0])
    if not words:
        return None
    runtime = max(float(duration_s or 0), max(e for _, e, _ in words))
    segs, cur = [], None
    prev_end = words[0][0]
    lead_in = 0.0
    if words[0][0] >= pause_min:
        segs.append({"type": "pause", "start": 0.0, "length": words[0][0]})
    else:
        lead_in = words[0][0]

    def close(c):
        c["length"] = c["end"] - c["start"]
        c["text"] = "".join(c.pop("_w")).strip()
        segs.append(c)

    for s, e, w in words:
        gap = s - prev_end
        if cur is not None and gap >= pause_min:
            close(cur)
            segs.append({"type": "pause", "start": prev_end, "length": gap})
            cur = None
        if cur is None:
            cur = {"type": "passage", "start": s, "end": e, "words": 0, "short": [], "_w": []}
        elif gap >= short_min:
            cur["short"].append(gap)
        cur["words"] += 1
        cur["_w"].append(w)
        cur["end"] = max(cur["end"], e)
        prev_end = max(prev_end, e)
    close(cur)
    tail = 0.0
    if runtime - prev_end >= pause_min:
        segs.append({"type": "pause", "start": prev_end, "length": runtime - prev_end})
    else:
        tail = max(0.0, runtime - prev_end)
    return {"runtime": runtime, "lead_in": lead_in, "tail": tail, "segments": segs}


def excerpt(text, head, tail):
    w = text.split()
    if len(w) <= head + tail + 4:
        return " ".join(w)
    return " ".join(w[:head]) + " ... " + " ".join(w[-tail:])


def passage_fingerprint(passages):
    import hashlib
    raw = json.dumps([[round(p["start"], 2), p["words"]] for p in passages])
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def label_prompt(cfg, types, v, style, parts, runtime):
    passages = [s for s in parts["segments"] if s["type"] == "passage"]
    n = len(passages)
    head, tail = (24, 10) if n <= 60 else (14, 6) if n <= 140 else (10, 4)
    after = {}
    segs = parts["segments"]
    for i, s in enumerate(segs):
        if s["type"] == "pause" and i > 0 and segs[i - 1]["type"] == "passage":
            after[id(segs[i - 1])] = s["length"]
    lines = []
    for i, p in enumerate(passages, 1):
        note = f"{p['start'] / runtime * 100:.0f}% in, {p['words']} words"
        if id(p) in after:
            note += f", {after[id(p)]:.0f}s silence after"
        lines.append(f'{i}. [{note}] "{excerpt(p["text"], head, tail)}"')
    return LABEL_USER.format(
        style=types[style]["label"], title=v["title"], runtime=fmt_ts(runtime), n=n,
        pause_min=cfg.get("skeleton_pause_seconds", 4.0), roles=ROLE_HELP, passages="\n".join(lines),
    ), n


def parse_labels(r, n):
    """Validated [(role, phase)] for passages 1..n, or None if any is missing or invalid."""
    got = {}
    for item in r.get("labels") or []:
        try:
            got[int(item["n"])] = (str(item["role"]).strip().lower(), str(item["phase"]).strip().lower())
        except (KeyError, TypeError, ValueError):
            continue
    out = []
    for i in range(1, n + 1):
        if i not in got or got[i][0] not in ROLES or got[i][1] not in PHASES:
            return None
        out.append(got[i])
    # phases only move forward
    hi = 0
    fixed = []
    for role, phase in out:
        hi = max(hi, PHASES.index(phase))
        fixed.append((role, PHASES[hi]))
    return fixed


def label_chunk(cfg, types, v, style, parts, runtime, usage, offset, count):
    """Label passages [offset, offset+count) with global 1-based numbers. Returns list or None."""
    # Build a prompt that only lists this chunk, but keeps global indices so parse_labels works.
    all_passages = [s for s in parts["segments"] if s["type"] == "passage"]
    chunk_parts = {
        "runtime": parts["runtime"],
        "lead_in": parts["lead_in"],
        "tail": parts["tail"],
        "segments": [],
    }
    # Recreate a segments view with only this chunk's passages (+ their following pauses for notes).
    segs = parts["segments"]
    passage_i = -1
    for s in segs:
        if s["type"] == "passage":
            passage_i += 1
            if offset <= passage_i < offset + count:
                chunk_parts["segments"].append(s)
        elif s["type"] == "pause" and chunk_parts["segments"] and chunk_parts["segments"][-1]["type"] == "passage":
            # Keep the pause after a kept passage for the "silence after" note.
            chunk_parts["segments"].append(s)

    # label_prompt numbers from 1; remap to global via a custom prompt for the chunk.
    passages = [s for s in chunk_parts["segments"] if s["type"] == "passage"]
    n_total = len(all_passages)
    head, tail = (24, 10) if n_total <= 60 else (14, 6) if n_total <= 140 else (10, 4)
    after = {}
    for i, s in enumerate(chunk_parts["segments"]):
        if s["type"] == "pause" and i > 0 and chunk_parts["segments"][i - 1]["type"] == "passage":
            after[id(chunk_parts["segments"][i - 1])] = s["length"]
    lines = []
    for local_i, p in enumerate(passages):
        global_n = offset + local_i + 1
        note = f"{p['start'] / runtime * 100:.0f}% in, {p['words']} words"
        if id(p) in after:
            note += f", {after[id(p)]:.0f}s silence after"
        lines.append(f'{global_n}. [{note}] "{excerpt(p["text"], head, tail)}"')
    prompt = LABEL_USER.format(
        style=types[style]["label"], title=v["title"], runtime=fmt_ts(runtime), n=count,
        pause_min=cfg.get("skeleton_pause_seconds", 4.0), roles=ROLE_HELP, passages="\n".join(lines),
    )
    # Ask only for the listed numbers (global).
    prompt += (
        f"\n\nLabel only the {count} passages listed above "
        f"(numbers {offset + 1}–{offset + count}). "
        f"Return JSON with a labels array of that length."
    )
    last = None
    for _ in range(2):
        msg = client().messages.create(
            model=cfg["vetting_model"],
            max_tokens=min(16000, 800 + 80 * count),
            system=LABEL_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
        usage["calls"] += 1
        usage["in"] += msg.usage.input_tokens
        usage["out"] += msg.usage.output_tokens
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        m = re.search(r"\{.*\}", text, re.S)
        try:
            raw = json.loads(m.group(0)) if m else None
        except ValueError:
            raw = None
        if not raw:
            last = f"unusable reply: {text[:120]!r}"
            continue
        got = {}
        for item in raw.get("labels") or []:
            try:
                got[int(item["n"])] = (
                    str(item["role"]).strip().lower(),
                    str(item["phase"]).strip().lower(),
                )
            except (KeyError, TypeError, ValueError):
                continue
        out = []
        ok = True
        for i in range(offset + 1, offset + count + 1):
            if i not in got or got[i][0] not in ROLES or got[i][1] not in PHASES:
                ok = False
                break
            out.append(got[i])
        if ok:
            return out
        last = f"unusable reply: {text[:120]!r}"
    raise ValueError(last)


def label_video(cfg, types, v, style, parts, runtime, usage):
    """Haiku labels every passage (chunked when long). Returns [(role, phase)]."""
    n = sum(1 for s in parts["segments"] if s["type"] == "passage")
    # Keep responses short enough that Haiku finishes the JSON.
    chunk = 40 if n > 40 else n
    labels = []
    for offset in range(0, n, chunk):
        count = min(chunk, n - offset)
        if n <= 40:
            # Single-call path for short videos (original prompt shape).
            prompt, _ = label_prompt(cfg, types, v, style, parts, runtime)
            last = None
            for _ in range(2):
                msg = client().messages.create(
                    model=cfg["vetting_model"],
                    max_tokens=min(16000, 800 + 80 * n),
                    system=LABEL_SYSTEM,
                    messages=[{"role": "user", "content": prompt}],
                )
                usage["calls"] += 1
                usage["in"] += msg.usage.input_tokens
                usage["out"] += msg.usage.output_tokens
                text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
                m = re.search(r"\{.*\}", text, re.S)
                try:
                    parsed = parse_labels(json.loads(m.group(0)), n) if m else None
                except ValueError:
                    parsed = None
                if parsed:
                    return parsed
                last = f"unusable reply: {text[:120]!r}"
            raise ValueError(last)
        labels.extend(label_chunk(cfg, types, v, style, parts, runtime, usage, offset, count))
    # phases only move forward across chunks
    hi = 0
    fixed = []
    for role, phase in labels:
        hi = max(hi, PHASES.index(phase))
        fixed.append((role, PHASES[hi]))
    return fixed


def skeleton_up_to_date(cfg, v):
    sk = load_json(SKELETONS / f"{v['id']}.json")
    return bool(sk) and sk.get("pause_min_s") == cfg.get("skeleton_pause_seconds", 4.0) and sk.get("short_min_s") == cfg["pause_threshold_seconds"]


def backfill_likes(cfg, videos, selected, force):
    """Add yt-dlp's like count to videos stored before it was recorded. Metadata only, no audio."""
    todo = [v for v in selected if force or not v.get("likes_checked")]
    if not todo:
        return
    from yt_dlp import YoutubeDL
    log(f"[skeletons] reading like counts for {len(todo)} videos (metadata only)")
    ydl = YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True})

    def run(v):
        try:
            info = ydl.extract_info(video_url(v["id"]), download=False)
            return v, info.get("like_count"), True
        except Exception as e:
            log(f"[skeletons]   likes: could not read {v['id']}: {str(e)[:100]}")
            return v, None, False

    done = 0
    with ThreadPoolExecutor(cfg["parallel_llm_calls"]) as ex:
        for v, likes, ok in ex.map(run, todo):
            if ok:
                videos[v["id"]]["likes"] = likes
                videos[v["id"]]["likes_checked"] = True
                done += 1
    save_json(VIDEOS, videos)
    have = sum(1 for v in todo if videos[v["id"]].get("likes") is not None)
    log(f"[skeletons]   likes read for {done}/{len(todo)} videos; {have} have a like count")


def skeletons(cfg, types, wanted, force):
    pause_min = cfg.get("skeleton_pause_seconds", 4.0)
    short_min = cfg["pause_threshold_seconds"]
    videos = load_videos()
    selected = filter_videos(videos, cfg, wanted)

    try:
        backfill_likes(cfg, videos, selected, force)
    except Exception as e:
        log(f"[skeletons] like backfill failed ({e}); continuing")

    skipped, already, todo = {}, 0, []

    def skip(reason, v):
        skipped.setdefault(reason, []).append(v["id"])

    for v in selected:
        if not v.get("transcript_check"):
            skip("not classified yet", v)
            continue
        style, _ = resolve_type(v)
        if not style:
            skip("no style", v)
            continue
        tj = TRANSCRIPTS / f"{v['id']}.json"
        if not tj.exists():
            skip("no transcript", v)
            continue
        if skeleton_up_to_date(cfg, v) and not force:
            already += 1
            continue
        doc = load_json(tj, {})
        parts = build_passages(doc.get("words") or [], (doc.get("stats") or {}).get("duration_s"), pause_min, short_min)
        if not parts:
            skip("no speech in transcript", v)
            continue
        todo.append((v, style, parts))

    usage = {"calls": 0, "in": 0, "out": 0}
    cached_labels = 0
    built, failed = 0, []
    max_delta = max_yt_delta = 0.0

    def labels_for(item):
        v, style, parts = item
        passages = [s for s in parts["segments"] if s["type"] == "passage"]
        fp = passage_fingerprint(passages)
        cache = load_json(SKELETON_LABELS / f"{v['id']}.json")
        if cache and not force and cache.get("fingerprint") == fp and cache.get("model") == cfg["vetting_model"]:
            return item, [tuple(x) for x in cache["labels"]], True, None
        try:
            labels = label_video(cfg, types, v, style, parts, parts["runtime"], usage)
        except Exception as e:
            return item, None, False, str(e)
        save_json(SKELETON_LABELS / f"{v['id']}.json", {
            "video_id": v["id"], "model": cfg["vetting_model"], "fingerprint": fp,
            "labels": [list(x) for x in labels],
        })
        return item, labels, False, None

    if todo:
        log(f"[skeletons] building {len(todo)} skeletons ({already} already done); labelling with {cfg['vetting_model']}")
    with ThreadPoolExecutor(cfg["parallel_llm_calls"]) as ex:
        for (v, style, parts), labels, cached, err in ex.map(labels_for, todo):
            if labels is None:
                failed.append((v["id"], err))
                log(f"[skeletons] {v['title']}: labelling failed ({err})")
                continue
            cached_labels += cached
            sk = assemble_skeleton(cfg, v, parts, labels, pause_min, short_min)
            save_json(SKELETONS / f"{v['id']}.json", sk)
            built += 1
            max_delta = max(max_delta, abs(sk["timing_check"]["delta_s"]))
            max_yt_delta = max(max_yt_delta, abs(sk["timing_check"]["vs_youtube_s"] or 0))
            log(f"[skeletons] {v['title']} -> {style}: {sk['counts']['passages']} passages, "
                f"{sk['counts']['pauses']} pauses{' (labels cached)' if cached else ''}")

    # Aggregate every skeleton on disk, not just this run's selection, so the bundle is always complete.
    videos = load_videos()
    export = build_exports(cfg, types, videos)
    if export["skeletons"]:
        write_exports(cfg, types, export)

    price = cfg.get("haiku_price_per_mtok", {"input": 1.0, "output": 5.0})
    cost = usage["in"] / 1e6 * price["input"] + usage["out"] / 1e6 * price["output"]
    log("\n[skeletons] summary")
    log("  skeletons per style (primary + secondary): " + ", ".join(
        f"{k} {sum(1 for e in export['skeletons'].get(k, []) if e['fit'] == 'primary')}"
        f"+{sum(1 for e in export['skeletons'].get(k, []) if e['fit'] == 'secondary')}" for k in types))
    log(f"  built this run: {built}; already done: {already}; labels from cache: {cached_labels}")
    if failed:
        log(f"  labelling failed (not saved, will retry next run): {len(failed)}")
    for reason, ids in skipped.items():
        log(f"  skipped, {reason}: {len(ids)}")
    if built:
        log(f"  timing: segments add up to runtime (max gap {max_delta:.2f}s); vs YouTube duration, max gap {max_yt_delta:.1f}s")
    log(f"  Haiku: {usage['calls']} calls, {usage['in']:,} in / {usage['out']:,} out tokens, "
        f"estimated cost ${cost:.3f} (at ${price['input']}/${price['output']} per M tokens in/out; set haiku_price_per_mtok in config.json)")
    if export["skeletons"]:
        log(f"  wrote output/skeletons.json, output/pacing.json, output/consciously-import.json ({export['import']['version']['id']})")
    else:
        log("  no skeletons yet, so no outputs were written")


def assemble_skeleton(cfg, v, parts, labels, pause_min, short_min):
    """The saved skeleton: timings, counts, roles and phases only. No transcript text."""
    runtime = parts["runtime"]
    segments, i = [], 0
    for s in parts["segments"]:
        if s["type"] == "pause":
            segments.append({"type": "pause", "start": round(s["start"], 2), "length": round(s["length"], 2)})
        else:
            role, phase = labels[i]
            i += 1
            segments.append({
                "type": "passage", "start": round(s["start"], 2), "length": round(s["length"], 2),
                "words": s["words"], "position": round(s["start"] / runtime, 4), "role": role, "phase": phase,
                "short_pauses": {"count": len(s["short"]), "lengths_s": [round(x, 1) for x in s["short"]]},
            })
    covered = parts["lead_in"] + parts["tail"] + sum(s["length"] for s in segments)
    yt = v.get("duration")
    return {
        "video_id": v["id"], "pause_min_s": pause_min, "short_min_s": short_min,
        "runtime_s": round(runtime, 2), "lead_in_s": round(parts["lead_in"], 2), "tail_s": round(parts["tail"], 2),
        "segments": segments,
        "counts": {
            "passages": sum(1 for s in segments if s["type"] == "passage"),
            "pauses": sum(1 for s in segments if s["type"] == "pause"),
            "words": sum(s.get("words", 0) for s in segments),
        },
        "timing_check": {
            "covered_s": round(covered, 2), "delta_s": round(covered - runtime, 2),
            "vs_youtube_s": round(covered - yt, 1) if yt else None,
        },
    }


def video_weight(cfg, fit):
    return 1.0 if fit == "primary" else cfg.get("secondary_weight", 0.5)


def pacing_profile(cfg, types, key, entries):
    """Aggregate one style's skeletons. Primary fits weigh 1, secondary fits `secondary_weight`."""
    W = [(e, video_weight(cfg, e["fit"])) for e in entries]
    prim = sum(1 for e in entries if e["fit"] == "primary")

    def tenth(frac):
        return min(9, max(0, int(frac * 10)))

    per_video = []
    for e, w in W:
        rt = e["runtime_s"]
        passages = [s for s in e["segments"] if s["type"] == "passage"]
        pauses = [s for s in e["segments"] if s["type"] == "pause"]
        spoken = [0.0] * 10
        for p in passages:
            for d in range(10):
                a, b = rt * d / 10, rt * (d + 1) / 10
                spoken[d] += max(0.0, min(p["start"] + p["length"], b) - max(p["start"], a))
        ops = [p["start"] + p["length"] for p in passages if p["phase"] == "opening"]
        cls = [p["start"] for p in passages if p["phase"] == "closing"]
        per_video.append({
            "w": w, "rt": rt, "passages": passages, "pauses": pauses,
            "speech_share": sum(p["length"] for p in passages) / rt,
            "by_tenth": [spoken[d] / (rt / 10) for d in range(10)],
            "ppm": len(passages) / (rt / 60),
            "opening": (max(ops) / rt) if ops else 0.0,
            "closing": ((rt - min(cls)) / rt) if cls else 0.0,
            "long": [p["length"] for p in pauses if p["length"] > 30],
        })

    def agg(f, nd=3):
        return spread([(f(x), x["w"]) for x in per_video], nd)

    profile = {
        "label": types[key]["label"],
        "videos": {"total": len(entries), "primary": prim, "secondary": len(entries) - prim},
        "weighting": f"primary 1, secondary {cfg.get('secondary_weight', 0.5)}; medians and spreads are weighted, min/max are not",
        "runtime_s": agg(lambda x: x["rt"], 0),
        "speech_share": {
            "definition": "time inside passages (short pauses included) / runtime",
            "overall": agg(lambda x: x["speech_share"]),
            "by_tenth": [r3(wquant([(x["by_tenth"][d], x["w"]) for x in per_video], 0.5)) for d in range(10)],
        },
        "passages_per_minute": agg(lambda x: x["ppm"], 2),
    }

    pause_tenths = []
    for d in range(10):
        pool = [(p["length"], x["w"]) for x in per_video for p in x["pauses"] if tenth(p["start"] / x["rt"]) == d]
        tot_w = sum(x["w"] for x in per_video)
        per = sum(x["w"] * sum(1 for p in x["pauses"] if tenth(p["start"] / x["rt"]) == d) for x in per_video) / tot_w
        pause_tenths.append({"pauses_per_session": round(per, 2), **spread(pool)})
    profile["pause_length_s_by_tenth"] = pause_tenths

    pool_t = [[] for _ in range(10)]
    pool_r = {r: [] for r in ROLES}
    role_cnt = {r: 0 for r in ROLES}
    for x in per_video:
        for p in x["passages"]:
            pool_t[tenth(p["position"])].append((p["words"], x["w"]))
            pool_r[p["role"]].append((p["words"], x["w"]))
            role_cnt[p["role"]] += 1
    profile["passage_words"] = {
        "by_tenth": [spread(pool_t[d], 0) for d in range(10)],
        "by_role": {r: {"count": role_cnt[r], **spread(pool_r[r], 0)} for r in ROLES if role_cnt[r]},
    }

    share_n = {r: 0.0 for r in ROLES}
    share_t = {r: 0.0 for r in ROLES}
    tot_w = sum(x["w"] for x in per_video)
    for x in per_video:
        n = len(x["passages"]) or 1
        t = sum(p["length"] for p in x["passages"]) or 1
        for p in x["passages"]:
            share_n[p["role"]] += x["w"] * 1 / n / tot_w
            share_t[p["role"]] += x["w"] * p["length"] / t / tot_w
    profile["role_share"] = {
        "by_passages": {r: r3(share_n[r]) for r in ROLES if share_n[r]},
        "by_speech_time": {r: r3(share_t[r]) for r in ROLES if share_t[r]},
    }
    profile["phases"] = {
        "opening_fraction_of_runtime": agg(lambda x: x["opening"]),
        "closing_fraction_of_runtime": agg(lambda x: x["closing"]),
    }
    longs = [(L, x["w"]) for x in per_video for L in x["long"]]
    profile["self_practice_silences"] = {
        "definition": "pauses longer than 30s",
        "per_session": spread([(len(x["long"]), x["w"]) for x in per_video], 1),
        "share_of_sessions_with_any": r3(sum(x["w"] for x in per_video if x["long"]) / tot_w),
        "total_count": len(longs),
        "length_s": spread(longs, 0),
        "lengths_s": sorted(round(L) for L, _ in longs),
    }
    return profile


def build_exports(cfg, types, videos):
    """Skeletons grouped by style, per-style pacing, and the app import bundle (not yet written)."""
    import datetime
    import hashlib

    grouped = {k: [] for k in types}
    for v in videos.values():
        if not is_active(v) or not v.get("transcript_check"):
            continue
        sk = load_json(SKELETONS / f"{v['id']}.json")
        if not sk:
            continue
        final, _ = resolve_type(v)
        for key in effective_types(v, cfg):
            if key not in grouped:
                continue
            grouped[key].append({
                "id": v["id"], "title": v.get("title"), "channel": v.get("channel"),
                "views": v.get("views") or 0, "likes": v.get("likes"),
                "runtime_s": sk["runtime_s"], "style": final,
                "fit": "primary" if key == final else "secondary",
                "lead_in_s": sk["lead_in_s"], "tail_s": sk["tail_s"],
                "segments": sk["segments"], "counts": sk["counts"],
            })
    for key in grouped:
        grouped[key].sort(key=lambda e: (e["fit"] != "primary", -e["views"]))
    skel = {k: e for k, e in grouped.items() if e}
    pacing = {k: pacing_profile(cfg, types, k, e) for k, e in skel.items()}

    ins = load_json(OUT / "instructions.json", {})
    guides = {k: ins[k] for k in types if k in ins}
    missing = [k for k in types if k not in ins]
    if missing:
        log(f"[skeletons] warning: no style guide yet for {', '.join(missing)} (run synthesise); bundle has {len(guides)}/{len(types)}")
    content = {"style_guides": guides, "pacing": pacing, "skeletons": skel}
    fp_doc = load_fingerprints()
    if fp_doc and fp_doc.get("styles"):
        content["fingerprints"] = fingerprint_bundle(fp_doc)
    digest = hashlib.sha256(json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()[:12]
    now = datetime.datetime.now(datetime.timezone.utc)
    version = {
        "id": f"{now.strftime('%Y%m%d-%H%M%S')}-{digest}",
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "hash": digest,
    }
    return {"skeletons": skel, "pacing": pacing, "import": {
        "schema": "consciously-harvester-import/1", "version": version, **content,
    }}


def write_exports(cfg, types, export):
    save_json(OUT / "skeletons.json", export["skeletons"])
    save_json(OUT / "pacing.json", export["pacing"])
    old = load_json(OUT / "consciously-import.json") or {}
    if old.get("version", {}).get("hash") == export["import"]["version"]["hash"]:
        export["import"]["version"] = old["version"]  # same content: keep the old stamp
    p = OUT / "consciously-import.json"  # compact: it's an upload file, not for reading
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(export["import"], ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(p)


# ============================================================================ fingerprints
#
# How each style is *delivered*, compared against the other styles:
#   1. one Haiku annotation per transcript (cached per video)      -> data/fingerprint_annotations/<id>.json
#   2. recurring 3-7 word phrases counted in code per style, grouped into families by Haiku (one call per
#      style, cached), then classified per style as marker / generic / foreign / neutral  -> data/fingerprint_families/<style>.json
#   3. per-style aggregate (primary fits weigh 1, secondary `secondary_weight`)           -> output/fingerprints.json, .md

FP_ANNOTATIONS = DATA / "fingerprint_annotations"
FP_FAMILIES = DATA / "fingerprint_families"
FP_JSON = OUT / "fingerprints.json"
FP_MD = OUT / "fingerprints.md"
FP_VERSION = 2  # bump when the annotation prompt or taxonomy changes: cached annotations are redone
FP_SCHEMA = "consciously-delivery-fingerprints/1"

# Thresholds (override any of them under "fingerprint" in config.json). Rates are weighted occurrences of a
# family's phrases per 1,000 words (each phrase capped at `count_cap` per video, so one looping affirmation
# video can't dominate); prevalence is the weighted share of a style's videos that use the family at all.
FP_DEFAULTS = {
    "min_docs": 3,                 # a phrase must occur in this many videos ...
    "min_channels": 3,             # ... from this many channels (drops names and channel sign-offs) ...
    "max_channel_share": 0.5,      # ... with no one channel supplying more than this share of them
    "count_cap": 5,                # per-video occurrences counted per phrase
    "candidate_min_share": 0.10,   # candidate within a style: in at least this share of its videos (min 2 videos)
    "candidates_per_style": 120,   # phrases sent to Haiku per style
    "present_rate": 0.2,           # family is "present" in a style at >= this rate per 1k words ...
    "present_prevalence": 0.15,    # ... and in >= this share of the style's videos
    "generic_styles_share": 0.6,   # generic: present in >= this share of the styles
    "marker_ratio": 2.0,           # marker: present, and rate >= this x its rate in the other styles' videos
    "foreign_rate_max": 0.1,       # foreign: rate here <= this and prevalence <= foreign_prevalence_max ...
    "foreign_prevalence_max": 0.05,
    "foreign_other_rate_min": 0.4, # ... while some other style uses it at >= this rate
    "move_order_min_share": 0.25,  # a move counts in a style's "usual order" at >= this share of sessions
    "top_markers": 8, "top_generic": 6, "top_foreign": 8,
}

OPEN_MOVES = {
    "welcome": "greeting or welcome to the session",
    "posture": "how to sit or lie down, posture, getting comfortable",
    "eyes_closed_or_soft_gaze": "closing the eyes or softening the gaze",
    "settling_breaths": "a few settling or deep breaths to arrive",
    "body_arrival": "arriving in the body, feeling its weight or contact with the seat/bed/floor",
    "intention_or_purpose": "naming an intention or the purpose of the session",
    "permission_or_acceptance": "permission/acceptance line (nothing to fix or do, whatever happens is fine)",
    "overview": "overview of what is coming in the session",
    "other": "any other opening move",
}
CLOSE_MOVES = {
    "deepen_once_more": "a last deepening or a moment of rest before ending",
    "return_attention": "returning attention to the body or the room",
    "movement": "gentle movement (fingers, toes, stretch)",
    "eyes_open": "opening the eyes",
    "gratitude": "gratitude or thanks",
    "carry_into_day": "carrying the practice or feeling into the day",
    "affirmation_or_intention": "an affirmation or intention restated",
    "other": "any other closing move",
}
TECHNIQUES = {
    "breath_counting_or_ratio": "breath counting or a breathing ratio/pattern",
    "body_part_sequence": "attention moved through body parts in a sequence",
    "imagery_journey": "an imagined place, scene or journey",
    "future_self_scene": "a scene of the listener's future or future self",
    "repeated_affirmations": "affirmation statements repeated",
    "reflection_questions": "questions for reflection",
    "noting_or_labelling": "noticing or labelling thoughts, sensations or sounds",
    "loving_kindness_phrases": "loving-kindness or compassion phrases",
    "movement_cues": "movement cues",
    "story_narration": "a story narrated",
    "other": "any other technique",
}
IMAGERY = {
    "nature": "forests, mountains, meadows, beaches, sky",
    "water": "ocean, river, waves, rain, pool",
    "light": "light, glow, sun, colour",
    "home": "a house, room, safe place or sanctuary",
    "future_success": "future success, achieving goals, abundance",
    "people": "other people, loved ones, relationships",
    "other": "any other imagery",
}
BODY_DIRS = ["head_to_feet", "feet_to_head", "other_order", "none"]
PERSONS = ["you", "we", "i", "mixed"]
TENSES = ["present", "future", "as_if_true", "mixed"]
LEVELS4 = ["none", "low", "medium", "high"]
DIMS = {  # key: (label, low pole, high pole, what the scale measures)
    "directiveness": ("Directiveness", "permissive", "assertive",
                      "1 = permissive throughout (\"you might notice\", \"if you like\", \"perhaps\"), 2 = mostly invitational (\"you can\", \"allow\", \"let\"), "
                      "3 = neutral instructions (\"bring your attention to\", \"take a breath\") with little softening or pushing, 4 = mostly direct commands without softeners, "
                      "5 = assertive and commanding, stating what is so (\"see it now\", \"you are\", \"it is yours\")"),
    "energy": ("Energy", "soothing", "energising", "1 = soothing, slowing, sedating, 3 = calm but alert, 5 = energising, activating, uplifting"),
    "certainty": ("Certainty about outcomes", "tentative", "certain",
                  "1 = tentative, promises nothing about outcomes, 3 = hopeful or open-ended, 5 = states outcomes as certain or already true"),
    "warmth": ("Warmth", "neutral", "warm", "1 = clinical or neutral, 3 = friendly, 5 = very warm, caring, personal"),
    "formality": ("Formality", "casual", "formal", "1 = casual and conversational, 3 = plain instruction, 5 = formal, ceremonial or scripted"),
}

ANNOT_SYSTEM = "You analyse how guided meditations are delivered. Reply with one JSON object and nothing else."

ANNOT_USER = """Below is the transcript of a guided meditation (each line is a spoken passage; silences are not shown). Describe HOW it is delivered, as JSON. Judge from what the guide actually says, not from the title.

Use these exact keys.

opening_moves: the opening moves that occur, in the order they first occur, from:
{opening}
closing_moves: the closing moves that occur, in the order they first occur, from:
{closing}
techniques: every technique used for a meaningful part of the session, from:
{techniques}
body_sequence_direction: if body_part_sequence is used, one of head_to_feet, feet_to_head, other_order; otherwise none.
imagery_themes: imagery themes present (empty list if none), from:
{imagery}
person_main: how the listener is mainly addressed: you, we, i (the guide gives first-person statements for the listener to repeat or take on, e.g. "I am ..."), or mixed.
listener_i_statements: true if the guide gives "I ..." statements for the listener to repeat or take on.
tense_main: present, future, as_if_true (described as already real or achieved, e.g. "you are now living ..."), or mixed.
question_rate: how much the guide asks questions: none, low (a few), medium (regular), high (questions are a main device).
directiveness, energy, certainty, warmth, formality: integers 1-5, judged against the whole range of guided meditations. Use 1, 2, 4 and 5 when the delivery clearly leans one way; keep 3 for genuinely neutral or mixed.
{dims}
repetition_level: how often lines or phrases are repeated: none, low, medium, high.
listener_repeats: true if the listener is invited to repeat lines aloud or silently.

Transcript:
{transcript}

JSON:
{{"opening_moves": [], "closing_moves": [], "techniques": [], "body_sequence_direction": "none", "imagery_themes": [], "person_main": "you", "listener_i_statements": false, "tense_main": "present", "question_rate": "low", "directiveness": 3, "energy": 3, "certainty": 3, "warmth": 3, "formality": 3, "repetition_level": "low", "listener_repeats": false}}"""

FAMILY_SYSTEM = "You group recurring phrases from guided meditations by what they do. Reply with one JSON object and nothing else."

FAMILY_USER = """These short phrases recur across popular "{style}" guided meditations (the number in brackets is the share of that style's sessions containing the phrase). Group phrases that mean the same thing or do the same job for the listener into families. For example "nothing you need to fix", "nothing to change" and "no need to do anything" are one family.

Rules:
- Each phrase goes in at most one family. Leave out fragments that do no job on their own (e.g. "going to be a"), names, brands and sign-offs.
- A family may have a single phrase if it is a distinct move. Prefer fewer, broader families over many tiny ones.
- name: 2-5 plain words. meaning: one short sentence in your own words saying what the family does for the listener. examples: at most two short example phrasings of six words or fewer, in your own words or taken from the members.
- members: the numbers of the phrases in the family.

Phrases:
{phrases}

JSON:
{{"families": [{{"name": "...", "meaning": "...", "examples": ["..."], "members": [1, 2]}}]}}"""

# Words that can't open or close a counted phrase, and words that don't count as content.
_FP_EDGE = set("""a an the and or but so to of in on at for with as that this these those is are was were be been am it its
if then than from by into just now um uh like very really also all what which who there here when while will would can
could should may might let lets let's do does did have has had not""".split())
_FP_STOP = _FP_EDGE | set("you your yours yourself i me my we us our they them he she his her one more".split())
_FP_SIGNOFF = set("""subscribe subscribed patreon youtube channel description website app download link follow newsletter
instagram podcast sponsor sponsored sponsors facebook tiktok comments playlist video videos""".split())


def fp_plain_text(md_text):
    """Transcript body as plain spoken lines: header, [mm:ss] stamps and [pause] lines removed."""
    out = []
    for line in md_text.split("\n\n", 1)[-1].splitlines():
        line = line.strip()
        if not line or line.startswith("[pause"):
            continue
        out.append(re.sub(r"^\[\d+:\d{2}(?::\d{2})?\]\s*", "", line))
    return "\n".join(out)


def fp_tokens(text):
    return re.findall(r"[a-z0-9']+", text.lower().replace("\u2019", "'"))


def fp_excerpt(text, head=38000, tail=18000):
    if len(text) <= head + tail:
        return text
    return text[:head] + "\n\n[... middle omitted ...]\n\n" + text[-tail:]


def fp_weight(cfg, v, key):
    """Weight of video v in style `key`: primary 1, secondary `secondary_weight`, else 0."""
    if key not in effective_types(v, cfg):
        return 0.0
    return video_weight(cfg, "primary" if resolve_type(v)[0] == key else "secondary")


def llm_json_usage(model, system, user, max_tokens, usage):
    # Thinking is switched off: these are classification tasks, and thinking tokens would eat max_tokens.
    try:
        msg = client().messages.create(
            model=model, max_tokens=max_tokens, system=system, messages=[{"role": "user", "content": user}],
            thinking={"type": "disabled"},
        )
    except Exception as e:
        if "thinking" not in str(e).lower():
            raise
        msg = client().messages.create(
            model=model, max_tokens=max_tokens + 6000, system=system, messages=[{"role": "user", "content": user}],
        )
    with _usage_lock:
        usage["calls"] += 1
        usage["in"] += msg.usage.input_tokens
        usage["out"] += msg.usage.output_tokens
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError(f"no JSON in reply: {text[:160]!r}")
    return json.loads(m.group(0)), (msg.usage.input_tokens, msg.usage.output_tokens)


def fp_ordered(lst, allowed):
    out = []
    for x in lst or []:
        x = str(x).strip().lower()
        if x in allowed and x not in out:
            out.append(x)
    return out


def fp_choice(x, allowed, default=None):
    x = str(x).strip().lower()
    return x if x in allowed else default


def fp_rating(x):
    try:
        n = int(round(float(x)))
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= 5 else None


def parse_annotation(r):
    """Validated annotation, or None when a required field is missing or invalid."""
    ann = {
        "opening_moves": fp_ordered(r.get("opening_moves"), OPEN_MOVES),
        "closing_moves": fp_ordered(r.get("closing_moves"), CLOSE_MOVES),
        "techniques": fp_ordered(r.get("techniques"), TECHNIQUES),
        "body_sequence_direction": fp_choice(r.get("body_sequence_direction"), BODY_DIRS, "none"),
        "imagery_themes": fp_ordered(r.get("imagery_themes"), IMAGERY),
        "person_main": fp_choice(r.get("person_main"), PERSONS),
        "listener_i_statements": bool(r.get("listener_i_statements")),
        "tense_main": fp_choice(r.get("tense_main"), TENSES),
        "question_rate": fp_choice(r.get("question_rate"), LEVELS4),
        "repetition_level": fp_choice(r.get("repetition_level"), LEVELS4),
        "listener_repeats": bool(r.get("listener_repeats")),
    }
    for k in DIMS:
        ann[k] = fp_rating(r.get(k))
    required = ["person_main", "tense_main", "question_rate", "repetition_level"] + list(DIMS)
    if any(ann[k] is None for k in required):
        return None
    if "body_part_sequence" not in ann["techniques"]:
        ann["body_sequence_direction"] = "none"
    return ann


def annotate_video(cfg, v, usage):
    """Haiku annotation for one video -> (cache dict or None, error, from_cache)."""
    path = FP_ANNOTATIONS / f"{v['id']}.json"
    text = fp_plain_text((TRANSCRIPTS / f"{v['id']}.md").read_text(encoding="utf-8"))
    n_words = len(fp_tokens(text))
    prompt = ANNOT_USER.format(
        opening="\n".join(f"- {k}: {d}" for k, d in OPEN_MOVES.items()),
        closing="\n".join(f"- {k}: {d}" for k, d in CLOSE_MOVES.items()),
        techniques="\n".join(f"- {k}: {d}" for k, d in TECHNIQUES.items()),
        imagery="\n".join(f"- {k}: {d}" for k, d in IMAGERY.items()),
        dims="\n".join(f"  {k}: {d[3]}" for k, d in DIMS.items()),
        transcript=fp_excerpt(text),
    )
    last = None
    for _ in range(2):
        try:
            r, (tin, tout) = llm_json_usage(cfg["vetting_model"], ANNOT_SYSTEM, prompt, 1200, usage)
        except Exception as e:
            last = str(e)[:200]
            continue
        ann = parse_annotation(r)
        if ann:
            rec = {
                "video_id": v["id"], "model": cfg["vetting_model"], "version": FP_VERSION, "annotation": ann,
                "words": n_words, "questions_per_1k_words": round(1000 * text.count("?") / n_words, 2) if n_words else 0.0,
                "usage": {"in": tin, "out": tout},
            }
            save_json(path, rec)
            return rec, None
        last = f"invalid annotation: {json.dumps(r)[:160]}"
    return None, last


def load_annotation(cfg, v):
    rec = load_json(FP_ANNOTATIONS / f"{v['id']}.json")
    if rec and rec.get("version") == FP_VERSION and rec.get("model") == cfg["vetting_model"]:
        return rec
    return None


# ---------------------------------------------------------------------------- phrase mining

def mine_phrases(fc, docs):
    """Recurring 3-7 word phrases. docs: [{'tokens', 'channel'}]. Returns {phrase: {doc_index: count}}.

    Level-wise (a longer phrase can only recur if both of its shorter halves do), so it stays fast.
    A phrase is kept when it occurs in >= min_docs videos from >= min_channels channels and no single
    channel supplies more than max_channel_share of those videos.
    """
    out, prev = {}, None
    for n in range(3, 8):
        cand = {}
        for di, d in enumerate(docs):
            toks = d["tokens"]
            for i in range(len(toks) - n + 1):
                g = tuple(toks[i:i + n])
                if prev is not None and (g[:-1] not in prev or g[1:] not in prev):
                    continue
                cand.setdefault(g, []).append(di)
        keep = {}
        for g, lst in cand.items():
            if len(lst) < fc["min_docs"]:
                continue
            cnt = {}
            for di in lst:
                cnt[di] = cnt.get(di, 0) + 1
            if len(cnt) < fc["min_docs"]:
                continue
            chans = [docs[di]["channel"] for di in cnt]
            if len(set(chans)) < fc["min_channels"]:
                continue
            keep[g] = cnt
        del cand
        for g, cnt in keep.items():
            chans = [docs[di]["channel"] for di in cnt]
            top = max(chans.count(c) for c in set(chans))
            out[g] = (cnt, top / len(chans))
        prev = set(keep)
        if not prev:
            break
    return {" ".join(g): cnt for g, (cnt, share) in out.items() if share <= fc["max_channel_share"]}


def phrase_ok(p):
    toks = p.split()
    if toks[0] in _FP_EDGE or toks[-1] in _FP_EDGE:
        return False
    if all(t in _FP_STOP for t in toks):
        return False
    if any(t in _FP_SIGNOFF or t.isdigit() for t in toks):
        return False
    return True


def style_candidates(fc, F, docs, wts, n_docs_style):
    """Top recurring phrases for one style: recur in enough of its videos, longest-first pruning of sub-phrases."""
    members = [i for i, w in enumerate(wts) if w > 0]
    min_docs = max(2, int(fc["candidate_min_share"] * len(members) + 0.999))
    tot_words = sum(wts[i] * docs[i]["n"] for i in members) or 1
    pool = {}
    for p, cnt in F.items():
        if not phrase_ok(p):
            continue
        ins = [di for di in cnt if wts[di] > 0]
        if len(ins) < min_docs or len({docs[di]["channel"] for di in ins}) < 2:
            continue
        rate = 1000 * sum(wts[di] * min(fc["count_cap"], cnt[di]) for di in ins) / tot_words
        pool[p] = {"docs": len(ins), "rate": rate, "prev": sum(wts[di] for di in ins) / (sum(wts[i] for i in members) or 1)}
    ext = {}
    for p, s in pool.items():  # best doc count of any longer pooled phrase that extends p by one word
        t = p.split()
        for sub in (" ".join(t[:-1]), " ".join(t[1:])):
            if len(t) > 3 and s["docs"] > ext.get(sub, 0):
                ext[sub] = s["docs"]
    kept = [p for p, s in pool.items() if ext.get(p, 0) < 0.7 * s["docs"]]
    kept.sort(key=lambda p: (-pool[p]["rate"], p))
    return [(p, pool[p]) for p in kept[:fc["candidates_per_style"]]]


def build_families(cfg, fc, types, style, cands, usage, force):
    """Haiku groups one style's candidate phrases into families (cached by candidate list)."""
    import hashlib
    cache_path = FP_FAMILIES / f"{style}.json"
    digest = hashlib.sha256(json.dumps([p for p, _ in cands] + [cfg["vetting_model"], FP_VERSION]).encode()).hexdigest()[:16]
    cache = load_json(cache_path)
    if cache and cache.get("digest") == digest and not force:
        return cache["families"], True
    phrases = "\n".join(f"{i}. {p} [{round(100 * s['prev'])}%]" for i, (p, s) in enumerate(cands, 1))
    r, _ = llm_json_usage(cfg["vetting_model"], FAMILY_SYSTEM,
                          FAMILY_USER.format(style=types[style]["label"], phrases=phrases), 8000, usage)
    seen, fams = set(), []
    for f in r.get("families") or []:
        mem = []
        for i in f.get("members") or []:
            try:
                i = int(i)
            except (TypeError, ValueError):
                continue
            if 1 <= i <= len(cands) and i not in seen:
                seen.add(i)
                mem.append(cands[i - 1][0])
        if not mem:
            continue
        ex = [str(x).strip() for x in (f.get("examples") or []) if str(x).strip() and len(str(x).split()) <= 6][:2]
        fams.append({"name": str(f.get("name", "")).strip()[:60] or mem[0], "meaning": str(f.get("meaning", "")).strip()[:240],
                     "examples": ex or mem[:1], "members": mem})
    save_json(cache_path, {"style": style, "model": cfg["vetting_model"], "digest": digest, "families": fams})
    return fams, False


def prune_members(members):
    """Drop members that sit inside another member, so a family's phrases don't double count."""
    ms = sorted(set(members), key=lambda m: (-len(m.split()), m))
    out = []
    for m in ms:
        if not any(f" {m} " in f" {o} " for o in out):
            out.append(m)
    return out


def merge_families(styled):
    """Merge families from different styles that share phrases (>= 40% of the smaller family's members)."""
    fams = [dict(f, origin=[s]) for s, lst in styled.items() for f in lst]
    parent = list(range(len(fams)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def overlap(a, b):
        sa, sb = fams[a]["members"], fams[b]["members"]
        small, big = (sa, sb) if len(sa) <= len(sb) else (sb, sa)
        hit = sum(1 for m in small if any(f" {m} " in f" {o} " or f" {o} " in f" {m} " for o in big))
        return hit / len(small)

    for a in range(len(fams)):
        for b in range(a + 1, len(fams)):
            if find(a) != find(b) and fams[a]["origin"] != fams[b]["origin"] and overlap(a, b) >= 0.4:
                parent[find(b)] = find(a)
    groups = {}
    for i in range(len(fams)):
        groups.setdefault(find(i), []).append(fams[i])
    merged = []
    for g in groups.values():
        lead = max(g, key=lambda f: len(f["members"]))
        merged.append({
            "name": lead["name"], "meaning": lead["meaning"], "examples": lead["examples"],
            "members": prune_members([m for f in g for m in f["members"]]),
            "origin": sorted({o for f in g for o in f["origin"]}),
        })
    merged.sort(key=lambda f: (-len(f["members"]), f["name"]))
    for i, f in enumerate(merged, 1):
        f["id"] = f"f{i:03d}"
    return merged


def classify_families(fc, fams, F, docs, W, styles):
    """Per family and style: rate, prevalence, rate/prevalence in the other styles' videos, and the class."""
    cap = fc["count_cap"]
    present_styles_needed = max(1, int(fc["generic_styles_share"] * len(styles) + 0.999))
    for f in fams:
        counts = [0] * len(docs)
        for m in f["members"]:
            for di, c in F.get(m, {}).items():
                counts[di] += min(cap, c)
        stats = {}
        for s in styles:
            w = W[s]
            ins = [i for i in range(len(docs)) if w[i] > 0]
            outs = [i for i in range(len(docs)) if w[i] == 0]
            sw = sum(w[i] for i in ins) or 1
            rate = 1000 * sum(w[i] * counts[i] for i in ins) / (sum(w[i] * docs[i]["n"] for i in ins) or 1)
            prev = sum(w[i] for i in ins if counts[i] > 0) / sw
            orate = 1000 * sum(counts[i] for i in outs) / (sum(docs[i]["n"] for i in outs) or 1)
            oprev = sum(1 for i in outs if counts[i] > 0) / (len(outs) or 1)
            stats[s] = {"rate": rate, "prevalence": prev, "other_rate": orate, "other_prevalence": oprev}
        present = {s for s, x in stats.items() if x["rate"] >= fc["present_rate"] and x["prevalence"] >= fc["present_prevalence"]}
        generic = len(present) >= present_styles_needed
        for s, x in stats.items():
            others = [stats[o]["rate"] for o in styles if o != s]
            if s in present and x["rate"] >= fc["marker_ratio"] * x["other_rate"]:
                cls = "marker"
            elif generic and s in present:
                cls = "generic"
            elif (not generic and x["rate"] <= fc["foreign_rate_max"] and x["prevalence"] <= fc["foreign_prevalence_max"]
                  and others and max(others) >= fc["foreign_other_rate_min"]):
                cls = "foreign"
            else:
                cls = "neutral"
            x["class"] = cls
        f["by_style"] = stats
        f["generic"] = generic
        f["present_in"] = sorted(present)


# ---------------------------------------------------------------------------- aggregation

def fp_share(entries, pred):
    tot = sum(w for _, _, w in entries)
    return round(sum(w for a, _, w in entries if pred(a)) / tot, 3) if tot else 0.0


def fp_mean(entries, f):
    pairs = [(f(a), w) for a, _, w in entries if f(a) is not None]
    tot = sum(w for _, w in pairs)
    return sum(x * w for x, w in pairs) / tot if tot else None


def fp_moves(entries, field, allowed):
    """Prevalence of each move, the usual order (by mean position, among moves in >= move_order_min_share), first move."""
    share = {k: fp_share(entries, lambda a, k=k: k in a[field]) for k in allowed}
    pos = {k: [] for k in allowed}
    for a, _, w in entries:
        seq = a[field]
        for i, k in enumerate(seq):
            pos[k].append((i / max(1, len(seq) - 1), w))
    first = {k: fp_share(entries, lambda a, k=k: bool(a[field]) and a[field][0] == k) for k in allowed}
    return share, pos, first


def aggregate_style(cfg, fc, types, key, entries, fam_view):
    """entries: [(annotation record, video, weight)]. Returns this style's fingerprint dict (no differences yet)."""
    ents = [(rec["annotation"], rec, w) for rec, v, w in entries]
    prim = sum(1 for rec, v, w in entries if w >= 1)
    fp = {
        "label": types[key]["label"],
        "videos": {"annotated": len(entries), "primary": prim, "secondary": len(entries) - prim},
        "weighting": f"primary 1, secondary {cfg.get('secondary_weight', 0.5)}; shares, medians and spreads are weighted",
    }
    for name, field, allowed in (("opening", "opening_moves", OPEN_MOVES), ("closing", "closing_moves", CLOSE_MOVES)):
        share, pos, first = fp_moves(ents, field, allowed)
        usual = [k for k in allowed if k != "other" and share[k] >= fc["move_order_min_share"]]
        usual.sort(key=lambda k: sum(p * w for p, w in pos[k]) / (sum(w for _, w in pos[k]) or 1))
        fp[name] = {
            "moves": [{"move": k, "share": share[k]} for k in sorted(allowed, key=lambda k: -share[k]) if share[k] > 0],
            "usual_order": usual,
            "first_move": [{"move": k, "share": first[k]} for k in sorted(allowed, key=lambda k: -first[k])[:3] if first[k] > 0],
        }
    fp["techniques"] = [{"technique": k, "share": s} for k, s in sorted(
        ((k, fp_share(ents, lambda a, k=k: k in a["techniques"])) for k in TECHNIQUES), key=lambda x: -x[1]) if s > 0]
    fp["body_sequence_direction"] = {k: fp_share(ents, lambda a, k=k: a["body_sequence_direction"] == k) for k in BODY_DIRS[:3]}
    fp["imagery_themes"] = [{"theme": k, "share": s} for k, s in sorted(
        ((k, fp_share(ents, lambda a, k=k: k in a["imagery_themes"])) for k in IMAGERY), key=lambda x: -x[1]) if s > 0]
    fp["delivery"] = {k: dict(spread([(a[k], w) for a, _, w in ents], 1), mean=round(fp_mean(ents, lambda a, k=k: a[k]), 2)) for k in DIMS}
    fp["voice"] = {
        "person": {k: fp_share(ents, lambda a, k=k: a["person_main"] == k) for k in PERSONS},
        "listener_i_statements": fp_share(ents, lambda a: a["listener_i_statements"]),
        "tense": {k: fp_share(ents, lambda a, k=k: a["tense_main"] == k) for k in TENSES},
        "question_rate": {k: fp_share(ents, lambda a, k=k: a["question_rate"] == k) for k in LEVELS4},
        "questions_per_1k_words": spread([(rec["questions_per_1k_words"], w) for _, rec, w in ents], 1),
    }
    fp["repetition"] = {
        "level": {k: fp_share(ents, lambda a, k=k: a["repetition_level"] == k) for k in LEVELS4},
        "listener_repeats": fp_share(ents, lambda a: a["listener_repeats"]),
    }
    fp["families"] = fam_view
    return fp


def fam_entry(f, s, styles):
    x = f["by_style"][s]
    ordered = sorted(styles, key=lambda o: -f["by_style"][o]["rate"])
    belongs = [o for o in ordered if f["by_style"][o]["class"] == "marker" and o != s] or \
              [o for o in ordered if o != s][:2]
    return {
        "id": f["id"], "name": f["name"], "meaning": f["meaning"], "examples": f["examples"][:2],
        "match_phrases": [m for m in f["members"] if len(m.split()) <= 6][:12],
        "class": x["class"], "rate_per_1k": round(x["rate"], 2), "prevalence": round(x["prevalence"], 3),
        "other_rate_per_1k": round(x["other_rate"], 2), "other_prevalence": round(x["other_prevalence"], 3),
        "belongs_to": belongs[:3] if x["class"] == "foreign" else [],
    }


def style_family_view(fc, fams, s, styles):
    mk = sorted((f for f in fams if f["by_style"][s]["class"] == "marker"), key=lambda f: -f["by_style"][s]["rate"])
    gn = sorted((f for f in fams if f["by_style"][s]["class"] == "generic"), key=lambda f: -f["by_style"][s]["rate"])
    fr = sorted((f for f in fams if f["by_style"][s]["class"] == "foreign"),
                key=lambda f: -max(f["by_style"][o]["rate"] for o in styles if o != s))
    return {
        "marker": [fam_entry(f, s, styles) for f in mk[:fc["top_markers"]]],
        "generic": [fam_entry(f, s, styles) for f in gn[:fc["top_generic"]]],
        "foreign": [fam_entry(f, s, styles) for f in fr[:fc["top_foreign"]]],
    }


def move_label(k):
    return k.replace("_", " ")


def fp_differences(fc, types, key, fps, ann_by_style, fam_all, styles, others_entries):
    """The five biggest differences from the other styles, each stated plainly. Scores are on a 0-1 scale."""
    mine = ann_by_style[key]
    oth = others_entries
    cands = []

    def add(score, text, kind):
        cands.append((score, text, kind))

    for k, (label, lo, hi, _) in DIMS.items():
        a = fp_mean(mine, lambda x, k=k: x[k])
        b = fp_mean(oth, lambda x, k=k: x[k])
        if a is None or b is None:
            continue
        d = a - b
        add(abs(d) / 4, f"{label}: rated {a:.1f}/5 here against {b:.1f} in the other styles, so {'more ' + hi if d > 0 else 'more ' + lo} ({lo} 1 to {hi} 5).", "rating")
    for field, allowed, where in (("opening_moves", OPEN_MOVES, "openings"), ("closing_moves", CLOSE_MOVES, "closings"),
                                 ("techniques", TECHNIQUES, "sessions")):
        for k in allowed:
            if k == "other":
                continue
            a = fp_share(mine, lambda x, k=k, f=field: k in x[f])
            b = fp_share(oth, lambda x, k=k, f=field: k in x[f])
            verb = "use" if field == "techniques" else "include"
            if where == "sessions":
                text = f"Technique '{move_label(k)}' appears in {round(100 * a)}% of sessions against {round(100 * b)}% elsewhere."
            else:
                text = f"{where.capitalize()}: '{move_label(k)}' in {round(100 * a)}% of sessions against {round(100 * b)}% elsewhere."
            add(abs(a - b), text, "move")
    for k in TENSES[:3]:
        a = fp_share(mine, lambda x, k=k: x["tense_main"] == k)
        b = fp_share(oth, lambda x, k=k: x["tense_main"] == k)
        add(abs(a - b), f"Main tense '{move_label(k)}': {round(100 * a)}% of sessions against {round(100 * b)}% elsewhere.", "voice")
    a = fp_share(mine, lambda x: x["listener_i_statements"])
    b = fp_share(oth, lambda x: x["listener_i_statements"])
    add(abs(a - b), f"First-person 'I' statements for the listener: {round(100 * a)}% of sessions against {round(100 * b)}% elsewhere.", "voice")
    a = fp_share(mine, lambda x: x["question_rate"] in ("medium", "high"))
    b = fp_share(oth, lambda x: x["question_rate"] in ("medium", "high"))
    add(abs(a - b), f"Regular or heavy use of questions: {round(100 * a)}% of sessions against {round(100 * b)}% elsewhere.", "voice")
    a = fp_share(mine, lambda x: x["repetition_level"] in ("medium", "high"))
    b = fp_share(oth, lambda x: x["repetition_level"] in ("medium", "high"))
    add(abs(a - b), f"Lines or phrases repeated often: {round(100 * a)}% of sessions against {round(100 * b)}% elsewhere.", "repetition")
    a = fp_share(mine, lambda x: x["listener_repeats"])
    b = fp_share(oth, lambda x: x["listener_repeats"])
    add(abs(a - b), f"Listener invited to repeat lines: {round(100 * a)}% of sessions against {round(100 * b)}% elsewhere.", "repetition")
    for f in fam_all:
        x = f["by_style"][key]
        d = x["prevalence"] - x["other_prevalence"]
        if x["class"] == "marker":
            add(abs(d), f"Phrasing: '{f['name']}' ({f['meaning'].rstrip('.')}) in {round(100 * x['prevalence'])}% of sessions against {round(100 * x['other_prevalence'])}% elsewhere.", "phrase")
        elif x["class"] == "foreign":
            add(abs(d), f"Phrasing: '{f['name']}' is common elsewhere ({round(100 * x['other_prevalence'])}% of sessions) but only {round(100 * x['prevalence'])}% here.", "phrase")
    cands.sort(key=lambda c: -c[0])
    out, per = [], {}
    for score, text, kind in cands:
        if per.get(kind, 0) >= (2 if kind in ("phrase", "rating", "move") else 1):
            continue
        per[kind] = per.get(kind, 0) + 1
        out.append({"text": text, "kind": kind, "size": round(score, 3)})
        if len(out) == 5:
            break
    return out


def build_fingerprints(cfg, fc, types, videos, F, docs, docvids, W, fams, annotated):
    """Assemble every style's fingerprint. annotated: {video_id: annotation record}."""
    styles = [k for k in types if any(w > 0 for w in W[k])]
    out = {}
    ann_by = {}
    for key in types:
        ents = [(annotated[v["id"]], v, fp_weight(cfg, v, key)) for v in docvids if v["id"] in annotated and fp_weight(cfg, v, key) > 0]
        if ents:
            ann_by[key] = [(rec["annotation"], rec, w) for rec, v, w in ents]
            out[key] = ents
    result = {}
    for key, ents in out.items():
        view = style_family_view(fc, fams, key, styles) if fams else {"marker": [], "generic": [], "foreign": []}
        fp = aggregate_style(cfg, fc, types, key, ents, view)
        others = [(annotated[v["id"]]["annotation"], annotated[v["id"]], 1.0) for v in docvids
                  if v["id"] in annotated and fp_weight(cfg, v, key) == 0]
        fp["differences"] = fp_differences(fc, types, key, result, ann_by, fams, styles, others) if fams else []
        result[key] = fp
    return result


# ---------------------------------------------------------------------------- outputs

def pct(x):
    return f"{round(100 * (x or 0))}%"


def commonness(share):
    return ("nearly all sessions" if share >= 0.75 else "most sessions" if share >= 0.5 else
            "many sessions" if share >= 0.3 else "some sessions" if share >= 0.15 else "few sessions")


def rating_word(key, val):
    """Plain words for a 1-5 mean: the high pole from 3.4, the low pole up to 2.6, otherwise in between."""
    if val is None:
        return "n/a"
    lo, hi = DIMS[key][1], DIMS[key][2]
    return hi if val >= 3.4 else lo if val <= 2.6 else f"between {lo} and {hi}"


def fp_family_line(f, with_origin=False):
    ex = "; ".join(f'"{e}"' for e in f["examples"])
    tail = f" Belongs to: {', '.join(f['belongs_to'])}." if with_origin and f.get("belongs_to") else ""
    return (f"**{f['name']}**: {f['meaning']} (e.g. {ex}; {f['rate_per_1k']}/1k words here vs {f['other_rate_per_1k']} elsewhere, "
            f"in {pct(f['prevalence'])} of sessions).{tail}")


def write_fingerprint_md(fc, types, styles_fp, meta):
    L = ["# Delivery fingerprints", "",
         "How each meditation style is *delivered*, learned from harvested transcripts and compared against the other styles. "
         f"Primary-fit videos weigh 1, secondary fits {meta['secondary_weight']}. Generated by `./run.sh fingerprint`.", "",
         "## Cross-style comparison", "",
         "Delivery ratings are weighted means on a 1-5 scale (medians are in each style's section): directiveness (1 permissive, 5 assertive), energy (1 soothing, "
         "5 energising), certainty (1 tentative, 5 certain), warmth, formality.", "",
         "| Style | Videos | Direct. | Energy | Certain. | Warmth | Formal. | Present / as-if-true | \"I\" statements | Questions /1k | Repeats often | Listener repeats | Usual opening | Usual closing |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for k, fp in styles_fp.items():
        d, v, r = fp["delivery"], fp["voice"], fp["repetition"]
        op = " > ".join(move_label(m) for m in fp["opening"]["usual_order"][:4]) or "-"
        cl = " > ".join(move_label(m) for m in fp["closing"]["usual_order"][:4]) or "-"
        L.append(f"| {fp['label']} | {fp['videos']['annotated']} | " + " | ".join(f"{d[x]['mean']:.1f}" for x in DIMS) +
                 f" | {pct(v['tense']['present'])} / {pct(v['tense']['as_if_true'])} | {pct(v['listener_i_statements'])} | "
                 f"{v['questions_per_1k_words']['median']} | {pct(r['level']['medium'] + r['level']['high'])} | {pct(r['listener_repeats'])} | {op} | {cl} |")
    L += ["", "## How phrase families are classified", "",
          f"Recurring 3-7 word phrases are counted per style (each phrase needs {fc['min_docs']}+ videos from {fc['min_channels']}+ channels, "
          f"at most {fc['count_cap']} counted per video), grouped into families by Haiku, then classified per style from the family's "
          "rate (occurrences per 1,000 words) and prevalence (share of the style's sessions using it):", "",
          f"- **marker**: present (rate >= {fc['present_rate']} and prevalence >= {round(100 * fc['present_prevalence'])}%) and rate >= {fc['marker_ratio']}x its rate in the other styles' videos.",
          f"- **generic**: present in at least {round(100 * fc['generic_styles_share'])}% of the styles (and present here), and not a marker. Overused; keep sparing.",
          f"- **foreign**: rate <= {fc['foreign_rate_max']} and prevalence <= {round(100 * fc['foreign_prevalence_max'])}% here, while another style uses it at >= {fc['foreign_other_rate_min']} per 1k words, and not generic.",
          "- **neutral**: everything else.", ""]
    for k, fp in styles_fp.items():
        v = fp["videos"]
        L += [f"## {fp['label']}", "", f"{v['annotated']} sessions ({v['primary']} primary, {v['secondary']} secondary).", ""]
        if fp.get("differences"):
            L += ["**How it differs most from the other styles**", ""] + [f"{i}. {d['text']}" for i, d in enumerate(fp["differences"], 1)] + [""]
        for name in ("opening", "closing"):
            m = fp[name]
            L.append(f"**{name.capitalize()}** (usual order: {' > '.join(move_label(x) for x in m['usual_order']) or 'no common order'})")
            L.append("")
            L.append(", ".join(f"{move_label(x['move'])} {pct(x['share'])}" for x in m["moves"]) or "-")
            L.append("")
        L.append("**Techniques:** " + (", ".join(f"{move_label(x['technique'])} {pct(x['share'])}" for x in fp["techniques"]) or "-"))
        bd = fp["body_sequence_direction"]
        if any(bd.values()):
            L.append("")
            L.append("**Body sequence direction:** " + ", ".join(f"{move_label(a)} {pct(b)}" for a, b in bd.items() if b))
        L.append("")
        L.append("**Imagery:** " + (", ".join(f"{move_label(x['theme'])} {pct(x['share'])}" for x in fp["imagery_themes"]) or "-"))
        L.append("")
        L.append("**Delivery (median, p25-p75):** " + "; ".join(
            f"{DIMS[x][0].lower()} median {fp['delivery'][x]['median']}, mean {fp['delivery'][x]['mean']:.1f} (p25-p75 {fp['delivery'][x]['p25']}-{fp['delivery'][x]['p75']}; {rating_word(x, fp['delivery'][x]['mean'])})" for x in DIMS))
        vo, re_ = fp["voice"], fp["repetition"]
        L.append("")
        L.append("**Voice:** person " + ", ".join(f"{a} {pct(b)}" for a, b in vo["person"].items() if b) +
                 f"; listener \"I\" statements {pct(vo['listener_i_statements'])}; tense " +
                 ", ".join(f"{move_label(a)} {pct(b)}" for a, b in vo["tense"].items() if b) +
                 f"; questions " + ", ".join(f"{a} {pct(b)}" for a, b in vo["question_rate"].items() if b) +
                 f" ({vo['questions_per_1k_words']['median']} per 1k words, p25-p75 {vo['questions_per_1k_words']['p25']}-{vo['questions_per_1k_words']['p75']})")
        L.append("")
        L.append("**Repetition:** " + ", ".join(f"{a} {pct(b)}" for a, b in re_["level"].items() if b) + f"; listener invited to repeat {pct(re_['listener_repeats'])}")
        L.append("")
        for cls, title in (("marker", "Marker phrasing (fits this style)"), ("generic", "Generic phrasing (keep sparing)"), ("foreign", "Foreign phrasing (belongs to other styles)")):
            lst = fp["families"][cls]
            L.append(f"**{title}**")
            L.append("")
            L += [f"- {fp_family_line(f, cls == 'foreign')}" for f in lst] or ["- none"]
            L.append("")
    FP_MD.write_text("\n".join(L) + "\n", encoding="utf-8")


def fingerprint_bundle(fp_doc):
    """The part of output/fingerprints.json that goes into the import bundle."""
    return {"schema": fp_doc["schema"], "styles": fp_doc["styles"]}


def fingerprint_prompt(label, fp):
    """Compact plain-text fingerprint of one style for the synthesis prompt."""
    def moves(name):
        m = fp[name]
        order = m["usual_order"]
        shares = {x["move"]: x["share"] for x in m["moves"]}
        parts = [f"{move_label(k)} ({commonness(shares[k])}, {pct(shares[k])})" for k in order]
        return " > ".join(parts) or "no common order"

    d, vo, rp = fp["delivery"], fp["voice"], fp["repetition"]
    lines = [
        f"- Usual opening, in order: {moves('opening')}",
        f"- Usual closing, in order: {moves('closing')}",
        "- Delivery ratings (mean 1-5): " + "; ".join(f"{DIMS[k][0].lower()} {d[k]['mean']:.1f} ({rating_word(k, d[k]['mean'])})" for k in DIMS),
        "- Voice: person " + ", ".join(f"{a} {pct(b)}" for a, b in vo["person"].items() if b) + f"; listener \"I\" statements in {pct(vo['listener_i_statements'])} of sessions; main tense " +
        ", ".join(f"{move_label(a)} {pct(b)}" for a, b in vo["tense"].items() if b) + "; questions " +
        ", ".join(f"{a} {pct(b)}" for a, b in vo["question_rate"].items() if b),
        "- Repetition: " + ", ".join(f"{a} {pct(b)}" for a, b in rp["level"].items() if b) + f"; listener invited to repeat in {pct(rp['listener_repeats'])}",
        "- Techniques (share of sessions): " + (", ".join(f"{move_label(x['technique'])} {pct(x['share'])}" for x in fp["techniques"][:6]) or "-"),
    ]
    if fp.get("differences"):
        lines.append("- Biggest differences from other styles:\n" + "\n".join(f"  - {x['text']}" for x in fp["differences"]))
    for cls, title in (("marker", "Phrasing families that mark this style (fit)"), ("generic", "Generic phrasing families (common everywhere; overused)"),
                       ("foreign", "Phrasing families that belong to other styles (rare here)")):
        fams = fp["families"][cls]
        lines.append(f"- {title}:")
        for f in fams:
            ex = "; ".join(f'"{e}"' for e in f["examples"])
            belongs = f" [belongs to: {', '.join(f['belongs_to'])}]" if cls == "foreign" and f.get("belongs_to") else ""
            lines.append(f"  - {f['name']}: {f['meaning']} e.g. {ex}{belongs}")
        if not fams:
            lines.append("  - (none identified)")
    return "\n".join(lines)


def load_fingerprints():
    return load_json(FP_JSON)


# ---------------------------------------------------------------------------- the step

def fingerprint(cfg, types, wanted, force):
    fc = fp_cfg(cfg)
    videos = load_videos()
    docvids = []
    for v in videos.values():
        if is_active(v) and v.get("transcript_check") and resolve_type(v)[0] and (TRANSCRIPTS / f"{v['id']}.md").exists():
            docvids.append(v)
    docvids.sort(key=lambda v: v["id"])
    if not docvids:
        log("[fingerprint] no classified transcripts yet")
        return
    selected = {v["id"] for v in filter_videos(videos, cfg, wanted)}
    usage = {"calls": 0, "in": 0, "out": 0}

    # 1. annotations (cached per video)
    todo, annotated, cached = [], {}, 0
    for v in docvids:
        rec = None if force and v["id"] in selected else load_annotation(cfg, v)
        if rec:
            annotated[v["id"]] = rec
            cached += 1
        elif v["id"] in selected:
            todo.append(v)
    if todo:
        log(f"[fingerprint] annotating {len(todo)} transcripts with {cfg['vetting_model']} ({cached} already done)")
    failed = []

    def run(v):
        try:
            return v, annotate_video(cfg, v, usage)
        except Exception as e:
            return v, (None, str(e)[:200])

    with ThreadPoolExecutor(cfg["parallel_llm_calls"]) as ex:
        for v, (rec, err) in ex.map(run, todo):
            if rec:
                annotated[v["id"]] = rec
            else:
                failed.append((v["id"], err))
                log(f"[fingerprint] {v['title']}: annotation failed ({err})")
    annotated_now = len(todo) - len(failed)

    # 2. phrases per style, grouped into families
    docs = []
    for v in docvids:
        toks = fp_tokens(fp_plain_text((TRANSCRIPTS / f"{v['id']}.md").read_text(encoding="utf-8")))
        docs.append({"tokens": toks, "n": len(toks), "channel": v.get("channel") or v["id"]})
    W = {k: [fp_weight(cfg, v, k) for v in docvids] for k in types}
    styles = [k for k in types if any(w > 0 for w in W[k])]
    log(f"[fingerprint] counting recurring 3-7 word phrases across {len(docs)} transcripts")
    F = mine_phrases(fc, docs)
    for d in docs:
        d["tokens"] = None
    log(f"[fingerprint]   {len(F):,} phrases recur in {fc['min_docs']}+ videos from {fc['min_channels']}+ channels")
    todo_styles = [k for k in styles if not wanted or k in wanted]
    styled, fam_cached, fam_missing = {}, 0, []

    def fam_run(k):
        cands = style_candidates(fc, F, docs, W[k], len(docs))
        if not cands:
            return k, [], True, None
        try:
            fams, was_cached = build_families(cfg, fc, types, k, cands, usage, force)
            return k, fams, was_cached, None
        except Exception as e:
            return k, None, False, str(e)[:200]

    with ThreadPoolExecutor(cfg["parallel_llm_calls"]) as ex:
        for k, fams, was_cached, err in ex.map(fam_run, styles if (not wanted) else todo_styles):
            if fams is None:
                log(f"[fingerprint] {k}: phrase grouping failed ({err})")
                fam_missing.append(k)
                continue
            styled[k] = fams
            fam_cached += was_cached
    if wanted:  # styles outside this run: use their cached families, if any
        for k in styles:
            if k not in styled:
                c = load_json(FP_FAMILIES / f"{k}.json")
                if c:
                    styled[k] = c["families"]
                else:
                    fam_missing.append(k)
    fams = merge_families(styled) if styled else []
    classify_families(fc, fams, F, docs, W, styles)

    # 3. aggregate and write
    result = build_fingerprints(cfg, fc, types, videos, F, docs, docvids, W, fams, annotated)
    thresholds = {k: fc[k] for k in fc}
    doc = {"schema": FP_SCHEMA, "thresholds": thresholds, "secondary_weight": cfg.get("secondary_weight", 0.5),
           "styles": result,
           "families": [{"id": f["id"], "name": f["name"], "meaning": f["meaning"], "examples": f["examples"], "members": f["members"],
                         "styles_found_in": f["origin"], "generic": f["generic"], "present_in": f["present_in"],
                         "by_style": {s: {a: (round(b, 3) if isinstance(b, float) else b) for a, b in x.items()} for s, x in f["by_style"].items()}}
                        for f in fams]}
    save_json(FP_JSON, doc)
    write_fingerprint_md(fc, types, result, {"secondary_weight": doc["secondary_weight"]})

    # 4. refresh the import bundle so it carries the fingerprints
    export = build_exports(cfg, types, load_videos())
    if export["skeletons"]:
        write_exports(cfg, types, export)

    price = cfg.get("haiku_price_per_mtok", {"input": 1.0, "output": 5.0})
    cost = usage["in"] / 1e6 * price["input"] + usage["out"] / 1e6 * price["output"]
    stored = [r for r in (load_json(p) for p in FP_ANNOTATIONS.glob("*.json")) if r]
    st_in = sum(r.get("usage", {}).get("in", 0) for r in stored)
    st_out = sum(r.get("usage", {}).get("out", 0) for r in stored)
    log("\n[fingerprint] summary")
    log(f"  annotated this run: {annotated_now}; already done: {cached}; failed (retried next run): {len(failed)}")
    log(f"  families: {len(fams)} across {len(styled)} styles ({fam_cached} style groupings from cache)")
    if fam_missing:
        log(f"  no phrase families yet for: {', '.join(fam_missing)}")
    log("  fingerprints per style: " + ", ".join(f"{k} {fp['videos']['annotated']}" for k, fp in result.items()))
    log(f"  Haiku this run: {usage['calls']} calls, {usage['in']:,} in / {usage['out']:,} out tokens, estimated cost ${cost:.3f}")
    log(f"  annotations on disk cost about ${st_in / 1e6 * price['input'] + st_out / 1e6 * price['output']:.3f} in total (at ${price['input']}/${price['output']} per M tokens)")
    log(f"  wrote {FP_JSON.relative_to(ROOT)}, {FP_MD.relative_to(ROOT)}" +
        (f", output/consciously-import.json ({export['import']['version']['id']})" if export["skeletons"] else ""))


def fp_cfg(cfg):
    d = dict(FP_DEFAULTS)
    d.update(cfg.get("fingerprint") or {})
    return d


# ============================================================================ main

PROCESS_STEPS = ["download", "transcribe", "classify", "skeletons", "fingerprint", "synthesise"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")

    p = sub.add_parser("search", help="search YouTube and vet results with Haiku")
    p.add_argument("terms", nargs="*", help="search terms, one quoted phrase per search")
    p.add_argument("--type", help="type(s) you expect, e.g. manifestation or visualization,manifestation; the transcript confirms")
    p.add_argument("--limit", type=int, help="videos to keep per search term")
    p.add_argument("--defaults", action="store_true", help="run each type's default query from types.json")
    p.add_argument("--force", action="store_true", help="re-vet videos already seen")

    p = sub.add_parser("add", help="add specific YouTube URLs")
    p.add_argument("urls", nargs="+")
    p.add_argument("--type")

    p = sub.add_parser("list", help="show collected videos")
    p.add_argument("--all", action="store_true", help="include rejected/excluded")

    p = sub.add_parser("all", help="search (your terms, or the defaults) then process")
    p.add_argument("terms", nargs="*", help="search terms; omit to use each type's default query")
    p.add_argument("--type", help="type(s) you expect, e.g. manifestation or visualization,manifestation; the transcript confirms")
    p.add_argument("--limit", type=int, help="videos to keep per search term")
    p.add_argument("--force", action="store_true")

    for name in ["download", "transcribe", "classify", "skeletons", "fingerprint", "synthesise", "process"]:
        p = sub.add_parser(name)
        p.add_argument("--types", help="comma-separated type keys (default: all)")
        p.add_argument("--force", action="store_true", help="redo work that already exists")

    args = ap.parse_args()
    cfg = load_json(ROOT / "config.json")
    types = load_json(ROOT / "types.json")

    if not args.cmd:
        ap.print_help()
        return

    if args.cmd == "all":
        t = check_type(types, args.type)
        terms = [(x, t) for x in args.terms] or [(q, k) for k, v in types.items() for q in v.get("default_queries", [])]
        search(cfg, types, terms, t, args.limit or cfg["results_per_query"], args.force)
        wanted = set(t.split(",")) if t else None
        for s in PROCESS_STEPS:
            globals()[s](cfg, types, wanted, args.force)
    elif args.cmd == "search":
        t = check_type(types, args.type)
        terms = [(x, t) for x in args.terms]
        if args.defaults:
            terms += [(q, k) for k, v in types.items() for q in v.get("default_queries", [])]
        if not terms:
            sys.exit('Give search terms, e.g.  ./run.sh search "joe dispenza meditation" --type manifestation')
        search(cfg, types, terms, t, args.limit or cfg["results_per_query"], args.force)
    elif args.cmd == "add":
        add(cfg, types, args.urls, check_type(types, args.type))
    elif args.cmd == "list":
        list_videos(cfg, types, args.all)
    else:
        wanted = parse_types_arg(types, args.types)
        steps = PROCESS_STEPS if args.cmd == "process" else [args.cmd]
        for s in steps:
            globals()[s](cfg, types, wanted, args.force)


if __name__ == "__main__":
    main()
