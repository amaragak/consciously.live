# Native app (Capacitor)

The iOS and Android apps are Capacitor shells around this SPA. `ios/` and `android/`
are generated projects that are committed to the repo. The web build is unchanged: native code only
compiles in with `vite --mode native*` (`__NATIVE_BUILD__`), and every native code path also
checks `isNativeApp()`.

- App name **Consciously**, bundle / application ID **`live.consciously.app`**
- Web dir: `dist/` (built with `--mode native`)
- API base URL: `VITE_MEDIMADE_API_URL` from `.env` (prod). For staging, see [Builds](#builds).

All commands below run from `frontend/webapp/` unless noted.

## One-time setup

1. **Node 22+** (Capacitor CLI 8 refuses older Node):
   ```sh
   node -v   # v22 or newer; with Homebrew: export PATH=/opt/homebrew/bin:$PATH
   ```
2. **Install from the repo root.** This applies `patches/` (see [Audio](#audio)):
   ```sh
   cd ../.. && npm install && cd frontend/webapp
   ```
3. **iOS:** install Xcode from the App Store, then select it and accept the licence once:
   ```sh
   sudo xcode-select -s /Applications/Xcode.app
   sudo xcodebuild -license accept
   xcodebuild -downloadPlatform iOS   # simulator runtime, if Xcode didn't install one
   ```
   No CocoaPods needed: the iOS project uses Swift Package Manager.
4. **Android:** install [Android Studio](https://developer.android.com/studio). Its first-run
   wizard installs the SDK, platform tools and an emulator image. Then add this to `~/.zshrc`:
   ```sh
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   ```
   In Android Studio → Device Manager, create a Pixel device (API 35 or 36).

## iOS simulator

```sh
npm run native:run:ios                  # internal build (includes /dev/audio), pick a simulator
npm run native:run:ios -- --target "iPhone 17"   # or by name / id from: npx cap run ios --list
```

Or open Xcode and press Run:

```sh
npm run native:ios                      # prod build + sync + open Xcode
```

Simulator audio does play, but the lock screen, silent switch and interruptions only behave
realistically on a real device.

## Real iPhone (free Apple ID signing)

1. Plug the iPhone in over USB and tap **Trust** on the phone.
2. `npm run native:sync:internal && npx cap open ios`
3. In Xcode, sign in under **Settings → Accounts → +** with your Apple ID.
4. Select the **App** target, then **Signing & Capabilities**:
   - **Team:** "<your name> (Personal Team)"
   - **Bundle Identifier:** free accounts can't use an ID that's registered elsewhere. If Xcode
     says `live.consciously.app` is unavailable, change it locally to something unique like
     `live.consciously.app.<yourname>`, and don't commit that change.
   - Keep **Background Modes → Audio** (already set in `Info.plist`).
5. Pick the iPhone as the run destination and press **Run** (⌘R).
6. First launch on the phone: **Settings → General → VPN & Device Management → <your Apple ID> →
   Trust**. On iOS 16+ you also need **Settings → Privacy & Security → Developer Mode → On**,
   which restarts the phone.

Free-signing builds expire after 7 days; press Run again to reinstall.

## Android emulator

```sh
npm run native:run:android              # internal build, pick the emulator
npx cap run android --list              # list device ids
npm run native:run:android -- --target <id>
```

Or `npm run native:android` to open Android Studio and press Run.
For a real Android phone, turn on **Developer options → USB debugging**, plug it in, and it shows up in
the same list.

## Live reload (Vite on your LAN)

The phone loads the app straight from Vite on this Mac, so code changes reload instantly.

```sh
npm run native:dev:ios                  # or: npm run native:dev:android
npm run native:dev:ios -- --target <id>
CAP_DEV_HOST=192.168.1.23 npm run native:dev:ios   # if the auto-picked LAN IP is wrong
```

- The phone or simulator and the Mac must be on the same Wi-Fi network. Port 5173 must be free:
  stop `npm run dev` / `dev:web` first, or set `CAP_DEV_PORT`.
- API calls go through the Vite dev server (`/__api` proxy), because the API's CORS list does not
  include LAN origins. Chat streaming URLs (`VITE_MEDIMADE_CHAT_URL`, …) are not proxied.
- The lock-screen fallback artwork and the silent carrier for bed-only Focus mixes come from the
  bundled build. Run `npm run native:sync:internal` once before your first live-reload session.
- Live reload changes only the web layer. Native changes (plugins, `Info.plist`, manifest, the
  audio patch) need a full `native:run:*`.

## Builds

| Command | What |
| --- | --- |
| `npm run build:native` | Production native bundle (no `/dev/audio`) |
| `npm run build:native:internal` | Internal test bundle (`VITE_INTERNAL_BUILD=1` keeps `/dev/audio`) |
| `npm run build:native:staging` | Internal bundle using `.env.native-staging.local` (staging API) |
| `npm run native:sync` / `native:sync:internal` | Build + `cap sync` (copy web assets, update plugins) |
| `npm run native:assets` | Regenerate icons + splash from `native-assets/*.png` |

The env files load in this order: `.env` → `.env.local` → `.env.native` (→ `.env.native.local`).
`.env.native` resets `VITE_MARKETING_ORIGIN` so that the localhost value written by `scripts/dev-web`
doesn't leak into app builds. For staging, create `.env.native-staging.local` containing
`VITE_MEDIMADE_API_URL` and `VITE_MEDIMADE_MEDIA_BASE_URL`.

Android calls the API from `https://localhost`, which is in the CORS list
(`backend/lib/consciously/api-http.ts`). API Gateway rejects `capacitor://localhost` as a CORS
origin, so on iOS the API origin goes through native HTTP instead (`src/lib/native/native-http.ts`).

## Audio

Native playback goes through **[`@mediagrid/capacitor-native-audio`](https://github.com/mediagrid/capacitor-native-audio)**
(AVPlayer on iOS; Media3 ExoPlayer with a `MediaSessionService` foreground service on Android).
The web player is unchanged and still runs in browsers.

**Why native:** in WKWebView, `<audio>` and Web Audio stop when the phone locks or the app goes to
the background, and they follow the silent switch. They also get no lock-screen or Control Centre
controls, and a backgrounded web view can't keep several beds in sync.

**Why this plugin:** it supports one notification source (the voice) plus several simultaneous
background sources (nature, music, drums, noise), each with its own volume and gapless looping.
On Android it ships the Media3 foreground service itself. `@capgo/native-audio`, the main
alternative, leaves the Android foreground service for you to write.

**Patch (`patches/@mediagrid+capacitor-native-audio+3.0.0.patch`, applied by the root
`postinstall`).** It adds what the background case needs, all of it running in native code
because the web view is suspended:

- Beds follow the voice: they play and pause with it, including from the lock screen, Control
  Centre, the notification and interruptions.
- A soundscape follows the voice's seeks.
- After the voice ends, the beds hold for 10 s and then fade out over 10 s (the same outro as the web).
- iOS lock-screen scrubbing (`changePlaybackPositionCommand`).
- After an interruption, playback resumes only when iOS says it should (`shouldResume`).
  Otherwise it stays paused until you press play.
- A looping primary source restarts when it ends. Bed-only Focus mixes use a silent 60 s carrier
  (`native-assets/runtime/silence.m4a`) so they still get lock-screen controls.

To change the patch, edit the files under `node_modules/@mediagrid/capacitor-native-audio/`, then
regenerate it from the repo root with `npx patch-package @mediagrid/capacitor-native-audio`. If
`git` complains about the Xcode licence, prefix the command with
`PATH=/Library/Developer/CommandLineTools/usr/bin:$PATH`.

**Config:**

- iOS: `UIBackgroundModes: audio` in `ios/App/App/Info.plist`. The plugin sets the `.playback`
  session, so audio ignores the silent switch.
- Android: `AudioPlayerService` (`foregroundServiceType="mediaPlayback"`), plus the
  `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` and `WAKE_LOCK` permissions, in
  `android/app/src/main/AndroidManifest.xml`.

**Code:**

- `src/components/native-library-audio-strip.tsx`: the same strip UI (`PlayerStripView` from
  common), driven by `src/lib/native/native-mix-session.ts`.
- `src/lib/native/offline-audio.ts`: downloads (`@capacitor/file-transfer`) into app data. If a
  downloaded copy exists, playback uses it.
- Create · Sound auditions stay on web audio. They're foreground-only and tied to the create step.
- The voice FX dial is web-only. Native plays the baked voice.

### `/dev/audio` test page

This page is in dev servers and internal builds only; production compiles it out. It needs no
sign-in: in the app, open it from **Audio test** under the welcome screen's Sign in button.

- Plays public Listen items from user `consciously` or the listed examples. While none are
  pinned, it uses catalog soundscapes as stand-ins.
- One item has a **Play + soundscape** option (a seek-locked composition).
- Focus sounds: a soundscape, and an endlessly looping bed mix.
- **Download** shows progress and size, then plays the local copy. **Delete** removes it.
- Event log with timestamps: play, pause, seek, end, focus changes, background and foreground,
  downloads and errors. **Copy** puts it on the clipboard.

Device checklist:

- Lock the phone mid-meditation: audio keeps playing, and the lock screen shows the title,
  "Consciously" and the artwork, with play, pause and scrubbing.
- Turn the silent switch on: audio keeps playing.
- Background the app for a few minutes, then return: the strip time and play state are correct.
- Play a meditation with beds through to the end: the beds hold for 10 s, then fade, with the
  phone locked too.
- Take a call, or start a voice memo, during playback: playback pauses and resumes from the
  lock screen.
- Android: the media notification shows the title and artwork, and its controls work.

## Sign-in

### What the app does

- **Welcome screen** (`src/pages/native-login-page.tsx`, styles in `native-login.css`). Shown on
  first launch and after sign-out; a stored session goes straight to the dashboard. The line
  is kept on the device (so it survives the trip to the mail app). The mic dictates on-device
  (`@capgo/capacitor-speech-recognition`); server Whisper needs a session.
- **Sign-up sheet.** Opens from **Create meditation**. Apple, Google, or email. Email sends one message
  with a 6-digit code and a link. The sheet takes the code, and the link opens the app (universal link)
  and signs in there. Nothing is generated before the account exists. Afterwards Create opens on
  Shape with the line as the brief (`?step=shape&fromBrief=1`, `createFromBriefHref`). An existing
  account signs in and goes to the same place.
- **Sign-in screen.** "Welcome back." with a back control, then Apple, Google, email + password,
  and **Email me a sign-in code instead**.
- **Sessions.** The refresh token lives in Keychain / Keystore (`@aparajita/capacitor-secure-storage`,
  `src/lib/native/native-secure-session.ts`), not WebView storage. It is read before the first render.
  On a fresh install it is wiped, because the Keychain outlives an uninstall. Sign-out
  (and account deletion) clears it and returns to the welcome screen. The web keeps cookies +
  localStorage as before.
- **Apple / Google** (`src/lib/native/native-social.ts`, `@capgo/capacitor-social-login`). The
  provider's ID token goes to `POST /auth/social`. The backend verifies it against Apple's or
  Google's keys and requires a verified email. It then signs into the account with that email, or
  creates one. Apple private relay addresses are stable inboxes and are treated like any other email.
  Apple is iOS-only in the app; Google is iOS + Android.
- **Account deletion.** Settings › Account › **Delete account and all data** → confirm →
  `POST /auth/account/delete`. This deletes the user's rows in every per-user table, their S3 media
  (`meditations/`, `meditation-covers/`, `drafts/`, `journal-transcriptions/`), refresh tokens,
  username, the Cognito user and the user record. The shared guest account can't be deleted.
- **Passkeys stay web-only.** There's no maintained Capacitor plugin that does WebAuthn against
  Cognito's passkey flow, and the web view's `capacitor://localhost` origin can't use them. The
  `webcredentials:consciously.live` association is in place for a native plugin later.
- **App Review account.** Set `CONSCIOUSLY_REVIEW_ACCOUNT_EMAIL` and
  `CONSCIOUSLY_REVIEW_ACCOUNT_CODE` (or CDK context `reviewAccountEmail` / `reviewAccountCode`)
  when deploying the backend. Review signs in with **Continue with email**, that address, and
  that fixed 6-digit code; no email is needed. Give both to App Review in App Store Connect.

### Web changes

- The magic-link email now carries a 6-digit code (same 15 minutes, single use; using the code or
  the link consumes both). Every "Check your inbox" state has a code field.
- **Continue with Apple** on `consciously.live/login` (Apple JS popup → `/auth/social`). It only
  shows once `CONSCIOUSLY_APPLE_SERVICES_ID` is deployed.
- Google on the web still says "isn't available yet" (unchanged). It needs Google Identity Services
  on the login page next; the backend already accepts web Google ID tokens.

### Console setup (once)

Backend values are read at deploy time from env or CDK context
(`backend/lib/consciously/api-http.ts`, `resolveSocialAuthConfig`). Redeploy the backend
after setting them.

**Apple** ([developer.apple.com](https://developer.apple.com/account/resources/identifiers/list)):

1. Identifiers → App ID `live.consciously.app` → enable **Sign in with Apple** and
   **Associated Domains**. In Xcode, set the Team on the App target (Signing & Capabilities).
   The entitlements (`ios/App/App/App.entitlements`) already list both. Sign in with Apple
   doesn't work with a free Personal Team.
2. Replace `APPLE_TEAM_ID` in `frontend/marketing/public/.well-known/apple-app-site-association`
   with the 10-character Team ID, and deploy marketing. Check
   `https://consciously.live/.well-known/apple-app-site-association` returns the JSON with no redirect.
3. Web: Identifiers → **+** → Services IDs, e.g. `live.consciously.web`. Enable Sign in with
   Apple, set the primary App ID to `live.consciously.app`, add domain `consciously.live` and
   return URL `https://consciously.live/login`. Deploy the backend with
   `CONSCIOUSLY_APPLE_SERVICES_ID=live.consciously.web`.
4. Private relay: Services → **Sign in with Apple for Email Communication** → add the sending
   domain / address (the Brevo sender in `AUTH_EMAIL_FROM`), or emails to `@privaterelay.appleid.com`
   bounce.

Native Apple needs no backend setting: the bundle ID is always an accepted audience.

**Google** ([console.cloud.google.com](https://console.cloud.google.com/apis/credentials)):

1. OAuth consent screen: external, app name Consciously, scopes `email`, `profile`, `openid`.
2. Create OAuth client **Web application** (used by Android and later the web). Deploy with
   `CONSCIOUSLY_GOOGLE_WEB_CLIENT_ID=<id>.apps.googleusercontent.com`.
3. Create OAuth client **iOS**, bundle ID `live.consciously.app`. Deploy with
   `CONSCIOUSLY_GOOGLE_IOS_CLIENT_ID=<id>.apps.googleusercontent.com`. Then in
   `ios/App/App/Info.plist`, add the client's **reversed client ID**
   (`com.googleusercontent.apps.<id>`) as a second URL scheme under `CFBundleURLTypes`.
4. Create OAuth client **Android**, package `live.consciously.app`, with the SHA-1 of the
   signing key (debug: `keytool -list -v -keystore ~/.android/debug.keystore -storepass android`;
   release: Play Console → App signing).

The Google buttons appear once the client IDs are deployed (iOS needs both IDs).

**Android app links:** replace `ANDROID_SIGNING_SHA256_FINGERPRINT` in
`frontend/marketing/public/.well-known/assetlinks.json` with the SHA-256 of the signing key
(Play Console → App signing → "App signing key certificate"), and deploy marketing.

**Terms and Privacy:** the sheet links to `https://consciously.live/terms` and `/privacy`, which
don't exist yet. App Store Connect also needs the privacy policy URL.

## Known gaps (next prompts)

- **Google on the web** (see above).
- **Pricing / Stripe checkout:** web checkout returns to `capacitor://localhost` and doesn't work in the
  app. Digital subscriptions in iOS apps also fall under App Store payment rules.
- During the 20 s post-voice outro, the lock-screen controls are cleared. The beds still fade out
  natively.
