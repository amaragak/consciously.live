"""Outline "consciously" exactly as the Next header sets it, scaled to the native 28px sun.

Writes WORD_PATH and BRAND_LOCKUP_W into src/lib/native/brand-lockup-markup.ts.
Run export-lockup-svg.mjs afterwards to refresh the iOS launch-screen SVG.

    python native-assets/src/outline_wordmark.py [--check]
"""

import io
import re
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

HERE = Path(__file__).resolve().parent
FONT = HERE / "fraunces-latin.woff2"
TS = HERE.parent.parent / "src/lib/native/brand-lockup-markup.ts"

# Next header (frontend/marketing/src/components/site-header.tsx): LogoMark 34px top +1px, mr 13px;
# word text-2xl (24px / 32px line), font-medium, tracking-tight (-0.025em), -top-px.
N_SUN, N_GAP, N_PX, N_LINE, N_WGHT = 34.0, 13.0, 24.0, 32.0, 500
N_TRACK = -0.025 * N_PX
SUN_DY, WORD_DY = 1.0, -1.0
K = 28.0 / N_SUN
AXES = {"wght": N_WGHT, "opsz": N_PX}


def outline() -> tuple[str, float]:
    font = TTFont(FONT)
    font.flavor = None
    raw = io.BytesIO()
    font.save(raw)
    ttf = raw.getvalue()

    inst = instantiateVariableFont(TTFont(io.BytesIO(ttf)), dict(AXES), inplace=False)
    upm = inst["head"].unitsPerEm
    asc, desc = inst["hhea"].ascent, -inst["hhea"].descent

    # Next layout: flex items-center, row height = max(sun, line).
    row = max(N_SUN, N_LINE)
    sun_cy = (row - N_SUN) / 2 + SUN_DY + N_SUN / 2
    word_top = (row - N_LINE) / 2 + WORD_DY
    s_n = N_PX / upm
    baseline_n = word_top + (N_LINE - (asc + desc) * s_n) / 2 + asc * s_n

    baseline = 14.0 + (baseline_n - sun_cy) * K
    s = N_PX * K / upm
    track = N_TRACK * K
    x = 28.0 + N_GAP * K

    hbfont = hb.Font(hb.Face(hb.Blob(ttf)))
    hbfont.set_variations(AXES)
    buf = hb.Buffer()
    buf.add_str("consciously")
    buf.guess_segment_properties()
    hb.shape(hbfont, buf, {"kern": True, "liga": True})

    gs = inst.getGlyphSet()
    order = inst.getGlyphOrder()
    paths = []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        pen = SVGPathPen(gs)
        gs[order[info.codepoint]].draw(
            TransformPen(pen, (s, 0, 0, -s, x + pos.x_offset * s, baseline - pos.y_offset * s))
        )
        paths.append(pen.getCommands())
        x += pos.x_advance * s + track
    d = re.sub(r"-?\d+\.\d+", lambda m: f"{float(m.group()):.3f}".rstrip("0").rstrip("."), " ".join(paths))
    # Box ends at the last advance, without trailing tracking.
    return d, round(x - track, 3)


def main() -> None:
    d, width = outline()
    src = TS.read_text()
    out = re.sub(r'const WORD_PATH = "[^"]*";', f'const WORD_PATH = "{d}";', src, count=1)
    out = re.sub(r"export const BRAND_LOCKUP_W = [\d.]+;", f"export const BRAND_LOCKUP_W = {width};", out, count=1)
    if "--check" in sys.argv:
        print("up to date" if out == src else "DIFFERS from brand-lockup-markup.ts")
        sys.exit(0 if out == src else 1)
    TS.write_text(out)
    print(f"width={width} path={len(d)} chars -> {TS.name}")


if __name__ == "__main__":
    main()
