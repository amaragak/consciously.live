#!/usr/bin/env bash
# Renders the splash background and the sun glow with headless Chrome, then regenerates
# the Capacitor iOS/Android splash sets. Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")/../.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SRC="$PWD/native-assets/src"
TMP="$(mktemp -d)"

# 2732² canvas, 2000px paisley tile: iOS aspect-fill of this matches the web tile
# calc(max(100vw,100vh) * 0.73206).
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --allow-file-access-from-files --window-size=2732,2732 --virtual-time-budget=4000 \
  --screenshot="$TMP/splash-bg.png" "file://$SRC/splash-bg.html" >/dev/null 2>&1
cp "$TMP/splash-bg.png" native-assets/splash.png
cp "$TMP/splash-bg.png" native-assets/splash-dark.png
node -e 'require("sharp")("native-assets/splash.png").webp({quality:82}).toFile("native-assets/runtime/launch.webp")'

# Storyboard glow view is 384·(28/34)·1.8 = 569.176pt wide; @3x → 1707.5px ⇒ scale 4.447.
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
  --force-device-scale-factor=4.447 --window-size=384,240 --virtual-time-budget=2000 \
  --screenshot="$TMP/glow.png" "file://$SRC/sun-glow.html" >/dev/null 2>&1
cp "$TMP/glow.png" ios/App/App/Assets.xcassets/SunGlow.imageset/sun-glow@3x.png

npm run native:assets
rm -rf "$TMP"
