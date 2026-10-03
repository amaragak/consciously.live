#!/usr/bin/env python3
"""
Local A/B: Pedalboard vs SoX vs ffmpeg reverb on Beatrice's dry sample.

Every wet engine renders a WET-ONLY stem, then the same final mix is applied:

    out = 1.0 * dry + 0.25 * wet

Usage:
  python3 scripts/compare-reverbs.py
  python3 scripts/compare-reverbs.py --open
  AWS_PROFILE=mm python3 scripts/compare-reverbs.py --source s3

Requires: ffmpeg, sox on PATH; pedalboard + numpy (pip install pedalboard numpy).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import time
import urllib.request
import wave
from pathlib import Path

BUCKET_DEFAULT = "consciouslybackend-medianested-mediabucketbcbb02ba-teu1qg0gltjz"
CF_DEFAULT = "https://d3k8rq6eqba40d.cloudfront.net"
BEATRICE_DRY_KEY = "speaker-samples/beatrice_32/loud-dry.wav"

# Fixed blend for every example.
DRY_GAIN = 1.0
WET_GAIN = 0.25
TAIL_PAD_SEC = 1.5

# Pedalboard mixer-ish room (wet-only render; dry comes from the final mix).
PB_ROOM = 0.22
PB_DAMP = 0.5
PB_WIDTH = 0.85


def which(name: str) -> str | None:
    return shutil.which(name)


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, capture_output=True)


def download_beatrice(out_path: Path, source: str, bucket: str, cf: str) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if source in ("auto", "cf"):
        url = f"{cf.rstrip('/')}/{BEATRICE_DRY_KEY}"
        print(f"download CloudFront → {url}")
        try:
            urllib.request.urlretrieve(url, out_path)
            if out_path.stat().st_size > 1000:
                return
        except Exception as e:
            if source == "cf":
                raise
            print(f"  CloudFront failed ({e}); trying S3…")
    profile = os.environ.get("AWS_PROFILE", "mm")
    print(f"download S3 → s3://{bucket}/{BEATRICE_DRY_KEY} (profile={profile})")
    run(
        [
            "aws",
            "s3",
            "cp",
            f"s3://{bucket}/{BEATRICE_DRY_KEY}",
            str(out_path),
            "--profile",
            profile,
        ]
    )


def ensure_tools() -> None:
    missing = [n for n in ("ffmpeg", "sox") if not which(n)]
    if missing:
        raise SystemExit(f"Missing on PATH: {', '.join(missing)}")


def _peak(path: Path) -> float:
    """Abs peak via ffmpeg volumedetect."""
    r = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(path),
            "-af",
            "volumedetect",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
    )
    m = re.search(r"max_volume:\s*([-\d.]+) dB", r.stderr)
    if not m:
        return 1.0
    db = float(m.group(1))
    return max(1e-6, 10 ** (db / 20.0))


def mix_dry_wet(dry_wav: Path, wet_wav: Path, out_wav: Path) -> None:
    """
    out = DRY_GAIN * dry + WET_GAIN * wet.

    Wet is peak-matched to dry first so a 0.25 wet mix stays audible even when
    the wet engine (afir, etc.) renders a quiet stem.
    """
    dry_pk = _peak(dry_wav)
    wet_pk = _peak(wet_wav)
    match = dry_pk / wet_pk
    fc = (
        f"[1:a]volume={match:.6f}[w];"
        f"[0:a][w]amix=inputs=2:weights={DRY_GAIN} {WET_GAIN}:"
        f"normalize=0:duration=longest,apad=pad_dur={TAIL_PAD_SEC}[a]"
    )
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(dry_wav),
            "-i",
            str(wet_wav),
            "-filter_complex",
            fc,
            "-map",
            "[a]",
            str(out_wav),
        ]
    )


def finish(name: str, dry_wav: Path, wet_wav: Path, out_dir: Path, t0: float) -> dict:
    out = out_dir / f"{name}.wav"
    mix_dry_wet(dry_wav, wet_wav, out)
    ms = (time.perf_counter() - t0) * 1000
    print(f"  {name:28} {ms:7.1f} ms → {out.name}")
    return {
        "name": name,
        "ms": round(ms, 1),
        "path": str(out),
        "dryGain": DRY_GAIN,
        "wetGain": WET_GAIN,
        "wetStem": str(wet_wav),
    }


def process_pedalboard(dry_wav: Path, out_dir: Path) -> list[dict]:
    try:
        from pedalboard import (
            Delay,
            Gain,
            HighpassFilter,
            LowpassFilter,
            Pedalboard,
            Reverb,
        )
        from pedalboard.io import AudioFile
        import numpy as np
    except ImportError:
        print(
            "skip pedalboard — install with: python3 -m pip install pedalboard numpy",
            file=sys.stderr,
        )
        return []

    with AudioFile(str(dry_wav)) as f:
        audio = f.read(f.frames)
        sr = int(f.samplerate)

    variants: list[tuple[str, Pedalboard]] = [
        (
            "pedalboard-reverb-only",
            Pedalboard(
                [
                    Reverb(
                        room_size=PB_ROOM,
                        damping=PB_DAMP,
                        wet_level=1.0,
                        dry_level=0.0,
                        width=PB_WIDTH,
                        freeze_mode=0.0,
                    )
                ]
            ),
        ),
        (
            "pedalboard-mixer",
            Pedalboard(
                [
                    HighpassFilter(cutoff_frequency_hz=80),
                    LowpassFilter(cutoff_frequency_hz=9600),
                    Gain(gain_db=1.0),
                    Delay(delay_seconds=0.2, feedback=0.15, mix=0.05),
                    Reverb(
                        room_size=PB_ROOM,
                        damping=PB_DAMP,
                        wet_level=1.0,
                        dry_level=0.0,
                        width=PB_WIDTH,
                        freeze_mode=0.0,
                    ),
                ]
            ),
        ),
    ]

    rows: list[dict] = []
    for name, board in variants:
        t0 = time.perf_counter()
        n = int(audio.shape[-1]) if hasattr(audio, "shape") else 0
        wet = board(audio, sr, reset=True, buffer_size=max(n, 1))
        pad_n = int(sr * TAIL_PAD_SEC)
        if wet.ndim == 1:
            wet = np.concatenate([wet, np.zeros(pad_n, dtype=wet.dtype)])
            ch = 1
        else:
            wet = np.concatenate(
                [wet, np.zeros((wet.shape[0], pad_n), dtype=wet.dtype)],
                axis=-1,
            )
            ch = int(wet.shape[0])
        wet_path = out_dir / f"_{name}-wet.wav"
        with AudioFile(str(wet_path), "w", sr, ch) as f:
            f.write(wet)
        rows.append(finish(name, dry_wav, wet_path, out_dir, t0))
    return rows


def process_sox(dry_wav: Path, out_dir: Path) -> list[dict]:
    """SoX `reverb -w` = wet-only, then shared 100/25 mix."""
    rows: list[dict] = []
    variants = [
        ("sox-reverb-light", ["22", "50", "25", "80", "20", "0"]),
        ("sox-reverb-med", ["50", "50", "50", "100", "20", "0"]),
    ]
    for name, params in variants:
        t0 = time.perf_counter()
        wet_path = out_dir / f"_{name}-wet.wav"
        run(
            [
                "sox",
                str(dry_wav),
                str(wet_path),
                "reverb",
                "-w",
                *params,
                "pad",
                "0",
                str(TAIL_PAD_SEC),
            ]
        )
        rows.append(finish(name, dry_wav, wet_path, out_dir, t0))
    return rows


def _write_delta_wav(path: Path, sr: int = 44100, seconds: float = 2.0) -> None:
    n = max(sr // 10, int(sr * seconds))
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(struct.pack("<h", 30000) + (b"\x00\x00" * (n - 1)))


def _zero_ir_direct_tap(in_ir: Path, out_ir: Path) -> None:
    with wave.open(str(in_ir), "r") as r:
        sr = r.getframerate()
        ch = r.getnchannels()
        sw = r.getsampwidth()
        raw = r.readframes(r.getnframes())
    if sw != 2 or ch != 1:
        raise RuntimeError(f"expected 16-bit mono IR, got sw={sw} ch={ch}")
    samples = list(struct.unpack("<" + "h" * (len(raw) // 2), raw))
    if samples:
        samples[0] = 0
    with wave.open(str(out_ir), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(struct.pack("<" + "h" * len(samples), *samples))


def process_ffmpeg(dry_wav: Path, out_dir: Path) -> list[dict]:
    rows: list[dict] = []

    # 1) aecho wet-ish: in_gain=0 so original isn't in the echo output.
    name = "ffmpeg-aecho"
    t0 = time.perf_counter()
    wet_path = out_dir / f"_{name}-wet.wav"
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(dry_wav),
            "-af",
            f"aecho=0:1:40|80|120|200:0.5|0.35|0.25|0.15,apad=pad_dur={TAIL_PAD_SEC}",
            str(wet_path),
        ]
    )
    rows.append(finish(name, dry_wav, wet_path, out_dir, t0))

    # 2) afir wet-only IR (direct tap cleared), then shared mix.
    delta = out_dir / "_delta.wav"
    ir = out_dir / "_ir-sox-impulse.wav"
    ir_wet = out_dir / "_ir-sox-wetonly.wav"
    _write_delta_wav(delta, seconds=2.0)
    run(
        [
            "sox",
            str(delta),
            str(ir),
            "reverb",
            "70",
            "50",
            "90",
            "100",
            "10",
            "0",
        ]
    )
    _zero_ir_direct_tap(ir, ir_wet)

    name = "ffmpeg-afir-sox-ir"
    t0 = time.perf_counter()
    wet_path = out_dir / f"_{name}-wet.wav"
    # afir dry=0 mutes everything — keep dry=1; IR[0]=0 so output is wet-only.
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(dry_wav),
            "-i",
            str(ir_wet),
            "-lavfi",
            f"afir=dry=1:wet=1:gtype=none:irnorm=-1,apad=pad_dur={TAIL_PAD_SEC}",
            str(wet_path),
        ]
    )
    rows.append(finish(name, dry_wav, wet_path, out_dir, t0))

    # 3) dry → discrete echo → convolution, then 100/25 mix.
    #    aecho in_gain=0 → wet stem is only the echo taps (no dry).
    #    Full SoX IR after that so those taps stay as voice + room (wet-only IR
    #    would mute the echo directs and leave only late bloom again).
    name = "ffmpeg-delay-afir-sox-ir"
    t0 = time.perf_counter()
    wet_path = out_dir / f"_{name}-wet.wav"
    fc = (
        f"[0:a]aecho=0:1:320|640:0.7|0.4[e];"
        f"[e][1:a]afir=dry=1:wet=1:gtype=none:irnorm=-1,"
        f"apad=pad_dur={TAIL_PAD_SEC}[a]"
    )
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(dry_wav),
            "-i",
            str(ir),
            "-filter_complex",
            fc,
            "-map",
            "[a]",
            str(wet_path),
        ]
    )
    rows.append(finish(name, dry_wav, wet_path, out_dir, t0))
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--source", choices=("auto", "cf", "s3"), default="auto")
    ap.add_argument("--bucket", default=os.environ.get("MEDIA_BUCKET_NAME", BUCKET_DEFAULT))
    ap.add_argument("--cf", default=os.environ.get("MEDIA_CF_BASE", CF_DEFAULT))
    ap.add_argument("--input", type=Path, default=None)
    ap.add_argument("--open", action="store_true")
    args = ap.parse_args()

    ensure_tools()
    ts = time.strftime("%Y%m%d-%H%M%S")
    out_dir = args.out or Path(f"/tmp/reverb-compare-{ts}")
    out_dir.mkdir(parents=True, exist_ok=True)

    dry = args.input or (out_dir / "beatrice-loud-dry.wav")
    if args.input:
        if not dry.is_file():
            raise SystemExit(f"Input not found: {dry}")
        print(f"using local input {dry}")
    else:
        download_beatrice(dry, args.source, args.bucket, args.cf)

    dry_copy = out_dir / "00-dry.wav"
    if dry.resolve() != dry_copy.resolve():
        shutil.copy2(dry, dry_copy)

    print(f"\nout → {out_dir}")
    print(f"mix  → dry={DRY_GAIN:.2f}  wet={WET_GAIN:.2f}  (every example)")
    print("running…")
    results: list[dict] = [{"name": "dry", "ms": 0, "path": str(dry_copy)}]
    results.extend(process_pedalboard(dry_copy, out_dir))
    results.extend(process_sox(dry_copy, out_dir))
    results.extend(process_ffmpeg(dry_copy, out_dir))

    meta = {
        "sourceKey": BEATRICE_DRY_KEY,
        "mix": {"dryGain": DRY_GAIN, "wetGain": WET_GAIN},
        "results": results,
    }
    (out_dir / "manifest.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"\nmanifest → {out_dir / 'manifest.json'}")

    if args.open and sys.platform == "darwin":
        subprocess.run(["open", str(out_dir)], check=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
