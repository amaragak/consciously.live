#!/usr/bin/env bash
# Renders splash bg, sun glow, and app icons with headless Chrome, then regenerates
# the Capacitor iOS/Android icon + splash sets. Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")/../.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SRC="$PWD/native-assets/src"
TMP="$(mktemp -d)"

shot() {
  local out="$1" size="$2" url="$3"
  shift 3
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size="$size" --virtual-time-budget=4000 \
    "$@" --screenshot="$out" "$url" >/dev/null 2>&1
}

# 2732² canvas, 2000px paisley tile: iOS aspect-fill of this matches the web tile
# calc(max(100vw,100vh) * 0.73206).
shot "$TMP/splash-bg.png" 2732,2732 "file://$SRC/splash-bg.html"
cp "$TMP/splash-bg.png" native-assets/splash.png
cp "$TMP/splash-bg.png" native-assets/splash-dark.png
node -e 'require("sharp")("native-assets/splash.png").webp({quality:82}).toFile("native-assets/runtime/launch.webp")'

# Storyboard glow view is 384·(28/34)·1.8 = 569.176pt wide; @3x → 1707.5px ⇒ scale 4.447.
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
  --force-device-scale-factor=4.447 --window-size=384,240 --virtual-time-budget=2000 \
  --screenshot="$TMP/glow.png" "file://$SRC/sun-glow.html" >/dev/null 2>&1
cp "$TMP/glow.png" ios/App/App/Assets.xcassets/SunGlow.imageset/sun-glow@3x.png

# App icon: splash paisley + flat lockup sun; glow radius smaller than splash.
shot "$TMP/icon-only.png" 1024,1024 "file://$SRC/icon.html"
shot "$TMP/icon-bg.png" 1024,1024 "file://$SRC/icon-bg.html"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
  --force-device-scale-factor=1 --allow-file-access-from-files --window-size=1024,1024 \
  --virtual-time-budget=4000 --screenshot="$TMP/icon-fg.png" "file://$SRC/icon-fg.html" \
  >/dev/null 2>&1
cp "$TMP/icon-only.png" native-assets/icon-only.png
cp "$TMP/icon-bg.png" native-assets/icon-background.png
cp "$TMP/icon-fg.png" native-assets/icon-foreground.png

npm run native:assets
rm -rf "$TMP"
