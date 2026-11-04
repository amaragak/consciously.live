# Brand lockup, splash and sun glow: sources

Everything the native opening sequence draws (iOS launch screen → HTML boot splash → `AuthShell`
band) comes from the files here. The Next app header
(`frontend/marketing/src/components/site-header.tsx`) is the reference. Never change it to match
native; change these instead.

## The one definition

`src/lib/native/brand-lockup-markup.ts` is the only lockup definition. Web boot splash, the
animation and the band all use its markup; the iOS launch screen uses an SVG exported from it.

- Lockup box: `BRAND_LOCKUP_W × 28` (sun 28px = Next's 34px × 28/34). Splash = `×1.8`.
- Sun: circle + 16 `<line>` rays (separate so the ray pulse can animate them).
- Word: Fraunces outlined to a path (`WORD_PATH`) so there is no font-loading or metric drift.
- Glow: Next's `.site-header-glow-sun` (288×144, blur 16, same radial gradient) × 28/34, centred
  on the sun (14, 14). It animates with the lockup's keyframes and pivot (`lockupMotion.ts`).

## Regenerating

Python deps (macOS system Python is PEP 668-locked, so use a venv):

```sh
python3 -m venv /tmp/cl-img && /tmp/cl-img/bin/pip install -r native-assets/src/requirements.txt
```

From `frontend/webapp`:

| Step | Command | Writes |
| --- | --- | --- |
| Wordmark path + width | `/tmp/cl-img/bin/python native-assets/src/outline_wordmark.py` | `WORD_PATH`, `BRAND_LOCKUP_W` in `brand-lockup-markup.ts` |
| iOS lockup SVG | `node native-assets/src/export-lockup-svg.mjs` | `ios/App/App/Assets.xcassets/Lockup.imageset/lockup.svg` |
| Splash bg + glow + Capacitor sets | `native-assets/src/render-images.sh` | `native-assets/splash*.png`, `runtime/launch.webp`, `SunGlow.imageset/sun-glow@3x.png`, iOS/Android splash res |

`outline_wordmark.py --check` exits non-zero if the TS is out of date. The steps are idempotent:
re-running them on an unchanged tree reproduces the committed files exactly.

After any change: `xcrun simctl uninstall <sim> live.consciously.app` before reinstalling (iOS
caches launch screens).

## Wordmark (`outline_wordmark.py`)

- Font: `fraunces-latin.woff2` is the exact latin subset Google Fonts serves for Fraunces
  (axes `opsz`, `wght` only). Keep this file; a different build shifts glyphs.
- Instance `wght 500, opsz 24` (Next: `text-2xl font-medium`).
- Shaped with HarfBuzz (`kern`, `liga`), tracking `-0.025em` (Next: `tracking-tight`).
- Layout copies Next's flex row: sun 34 with `top-px`, gap `mr-[13px]`, word 24/32 with
  `-top-px`, then scaled by 28/34 so the baseline sits relative to the sun centre exactly as in
  the header.
- Numbers rounded to 3 decimals.

## Splash background (`splash-bg.html`)

- 2732×2732, `#1A1820` (Next homepage header), paisley `public/patterns/paisley-dark-duotone.webp`
  at opacity `.49` (Next's 0.72 × its edge mask near the logo), 2000px tile.
- iOS aspect-fills this image, so the web tile is `calc(max(100vw, 100vh) * 0.73206)`
  (= 2000/2732) in `vite.config.ts`, `native-login.css` and `native-launch-overlay.css`. That keeps
  the pattern still across the splash → web handoff. Change both together.
- Background-only on purpose: the lockup and glow are separate layers on top.

## Sun glow (`sun-glow.html`)

- 384×240 transparent canvas with the 288×144 glow box centred (48px margin so the blur isn't
  clipped).
- Rendered at device scale `4.447` so 1 image px = 1 @3x px: 384 × 28/34 × 1.8 = 569.176pt.

## iOS launch screen (`ios/App/App/Base.lproj/LaunchScreen.storyboard`)

Layers bottom to top, all on a `#1A1820` view:

| View | Image | Size (pt) | Position |
| --- | --- | --- | --- |
| Background | `Splash` | full screen, aspect fill | pinned to edges |
| Glow | `SunGlow` | 569.176 × 355.765 | centerX −103.602, centerY 0 |
| Lockup | `Lockup` (vector SVG) | 257.603 × 50.4 | centred |

Derivations, if the lockup width changes:

- Lockup size = `BRAND_LOCKUP_W × 1.8` by `28 × 1.8`.
- Glow centerX offset = `(14 − BRAND_LOCKUP_W / 2) × 1.8` (sun centre relative to lockup centre).
