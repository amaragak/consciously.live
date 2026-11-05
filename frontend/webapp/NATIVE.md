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
- Sounds · Custom **Play all** uses the same native strip on device (silent carrier + looping beds). Per-layer audition taps stay on web audio (foreground-only mixer tweaking).
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

## Opening sequence

Native splash → HTML boot → app. Signed-out uses `AuthShell` (`native-auth-shell.tsx`): one
lockup (band size) + shell paisley; screens only render an invisible placeholder. Opening is
transform-only onto the placeholder (`scale(1.8)` → identity) with the form/copy timeline from
`consciously-native-opening-fix`. Signed-in: launch overlay cross-fades (250ms). Regenerate
splash with `npm run native:assets` after changing `native-assets/`. How the lockup, splash
background and sun glow images are generated: [`native-assets/src/README.md`](native-assets/src/README.md).

## Sign-in

### What the app does

- **Email-first sign-in** (`src/pages/native-login-page.tsx`, `native-login.css`). First launch,
  sign-out and expired sessions open **Continue** (paisley navy band + ivory form): Apple, Google,
  or email → Continue. `POST /auth/email-check` (rate-limited per IP and device, same timing either
  way) sends a known email to **Welcome back** (password, forgot password; Apple/Google button
  instead if the account has no password) and a new one to **Create your account** (password) →
  Cognito verify code → **Your first meditation** or home. **Change** goes back with the email kept.
  The old separate Sign up / Sign in screens are commented out in the page. No name on sign-up;
  name step only if the session still needs one. Passkey offer is skipped on native until
  WebAuthn works in the Capacitor web view. First meditation Create opens Shape with the brief
  (`createFromBriefHref`); Skip goes to home / Get set up.

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

### Web

`/login` (and `/login?mode=signup`) uses the same email-first steps in the form column only:
Continue (Apple, Google, email) → Sign in (sign-in layout) or Create your account → code →
passkey offer → `/auth/complete-profile` if needed. Apple uses Sign in with Apple JS
(`marketing/src/lib/apple-web-sign-in.ts`) and Google uses Google Identity Services
(`google-web-sign-in.ts`), both posting ID tokens to `/auth/social` with the same Services ID /
OAuth client as the app. Accounts link by verified email, so an Apple or Google sign-in with the
same email lands on the existing account.

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
3. For web Apple sign-in: Identifiers → **+** → Services IDs, e.g. `live.consciously.web`. Enable Sign in with
   Apple, set the primary App ID to `live.consciously.app`, add domain `consciously.live` and
   return URL `https://consciously.live/login`. Deploy the backend with
   `CONSCIOUSLY_APPLE_SERVICES_ID=live.consciously.web`.
4. Private relay: see **Your steps** below (Apple relay email).

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

**Terms and Privacy:** the sheet links to `https://consciously.live/terms` and `/privacy`
(marketing, `src/app/(legal)/`). They go live with the next marketing deploy.

## Email

All sign-in email goes through `sendTransactionalEmail` (`backend/lambdas/_shared/consciously-email.ts`).
One deploy setting picks the provider:

- `CONSCIOUSLY_EMAIL_PROVIDER=brevo` (default today): the old Gmail sender via Brevo
  (`AUTH_EMAIL_FROM`). Kept until SES is confirmed.
- `CONSCIOUSLY_EMAIL_PROVIDER=ses`: Amazon SES from `Consciously <hello@consciously.live>`
  (`CONSCIOUSLY_EMAIL_FROM` to change the address), configuration set `consciously-transactional`.

SES (`backend/lib/consciously/email-nested-stack.ts`) has domain identity `consciously.live`, MAIL
FROM `mail.consciously.live` and the configuration set. Bounces, complaints, rejects and delays go
via SNS to `email-events.ts`, which logs them to CloudWatch. Hard bounces and complaints are
suppressed (account level and configuration set), so they are never resent.

The sign-in email is link-only. `CONSCIOUSLY_MAGIC_CODE_IN_EMAIL=1` adds the 6-digit code; leave
it off until web sign-in has a code field. The App Review account's fixed code works either way.

**Test email:** Admin › **Email** (`/admin/email`, `POST /admin/email-test`). It always requires
signing in as an admin, and sends through whichever provider is live.

## Your steps

(The prompt said `apps/app/NATIVE.md`; this repo's file is `frontend/webapp/NATIVE.md`.)
In order:

1. **Cloudflare DNS → consciously.live.** Add these records with Proxy status **DNS only**. Keep the
   existing Namecheap forwarding MX records (`eforward1`–`5.registrar-servers.com`).

   | Type | Name | Value |
   |---|---|---|
   | CNAME | `yheviyi6mtvhvg5leedktxv3ypxnjk44._domainkey` | `yheviyi6mtvhvg5leedktxv3ypxnjk44.dkim.amazonses.com` |
   | CNAME | `thv5vuk6mp5jkq7wr3lyzj6uipovnfn2._domainkey` | `thv5vuk6mp5jkq7wr3lyzj6uipovnfn2.dkim.amazonses.com` |
   | CNAME | `moybdmr5nnzdglrxvtjeouqc4dbz5zgi._domainkey` | `moybdmr5nnzdglrxvtjeouqc4dbz5zgi.dkim.amazonses.com` |
   | MX | `mail` | `feedback-smtp.eu-west-2.amazonses.com`, priority `10` |
   | TXT | `mail` | `v=spf1 include:amazonses.com ~all` |
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:hello@consciously.live` |

   **Edit** (don't add a second) the root TXT SPF record from
   `v=spf1 include:spf.efwd.registrar-servers.com ~all` to
   `v=spf1 include:spf.efwd.registrar-servers.com include:amazonses.com ~all`.
   (The DKIM tokens are also in the `ConsciouslyBackend…Email` stack outputs.)
2. **Wait for verification.** In the SES console (eu-west-2) → Identities → `consciously.live`,
   wait for DKIM **Successful** and MAIL FROM **Successful**, usually minutes and up to 72 hours.
   Check from the terminal:
   `AWS_PROFILE=mm aws sesv2 get-email-identity --email-identity consciously.live --region eu-west-2`.
3. **Request production access.** SES → Account dashboard → **Request production access**:
   - Mail type: **Transactional**.
   - Website URL: `https://consciously.live`.
   - Use case: "Sign-in links and account emails for consciously.live users who request them. No
     marketing lists. Bounces and complaints are handled by SES account-level suppression and a
     configuration set (consciously-transactional) whose events are logged; hard bounces and
     complainants are never re-sent to."
   - Until it's approved (200 emails a day, 1 a second), SES only delivers to verified addresses.
     To test, add your own address under Identities → Create identity → Email address.
4. **Switch to SES.** Deploy the backend with
   `CONSCIOUSLY_EMAIL_PROVIDER=ses AWS_PROFILE=mm backend/scripts/deploy-back ConsciouslyBackend`.
   The setting is read at deploy time, so a later deploy without it goes back to Brevo. To make it
   stick (including deploys from GitHub Actions), add `"emailProvider": "ses"` to `context` in
   `backend/cdk.json`.
5. **Test.** Admin › Email → send to your own address. Then sign in with Apple using
   **Hide My Email** and send to that `@privaterelay.appleid.com` address. That only arrives once
   step 6 is done.
6. **Apple relay email.** In [developer.apple.com](https://developer.apple.com/account/resources/services/configure)
   → Certificates, Identifiers & Profiles → **Services** → **Sign in with Apple for Email
   Communication** → Configure:
   - Domains and subdomains: `consciously.live` and `mail.consciously.live`.
   - Email addresses: `hello@consciously.live`.
   - SPF must pass for the sending domain, which needs the step 1 records. Apple's list shows a
     check mark once it passes. Register the old Gmail sender too only if you stay on Brevo, but
     Gmail addresses usually fail Apple's SPF check, which is why relay mail needs SES.
7. **Confirm SES works, then remove Brevo.**    Delete the Brevo branch in
   `sendTransactionalEmail` (`consciously-email.ts`) and the `BREVO_SECRET_NAME` grants. Not done yet, as you asked.
8. **Later:** once deliverability looks good in the DMARC reports, tighten `_dmarc` to `p=quarantine`.
9. **Legal pages.** Fill the bracketed items listed at the end of `docs/legal/data-inventory.md`,
   have it reviewed, then deploy marketing. Add `https://consciously.live/privacy` as the privacy
   policy URL in App Store Connect (and Play Console).
10. The Apple, Google and Android app-link console steps in **Console setup** above are unchanged.
11. **Apple and Google on the web** (email-first web pack):
    - Apple: [Identifiers](https://developer.apple.com/account/resources/identifiers/list/serviceId)
      → **+** → **Services IDs** → Continue. Description `Consciously Web`, identifier
      `live.consciously.web` → Register.
    - Open it, tick **Sign in with Apple** → **Configure**: Primary App ID `live.consciously.app`;
      Domains `consciously.live`, `www.consciously.live`; Return URLs
      `https://consciously.live/login`, `https://www.consciously.live/login` → Next → Done →
      Continue → **Save**. (Same primary App ID as the app, so one Apple ID is one account.)
    - For local testing Apple needs https; add your tunnel domain and its `/login` there too.
    - Google: [Credentials](https://console.cloud.google.com/apis/credentials) → the **Web
      application** client used by the app → **Authorised JavaScript origins**: add
      `https://consciously.live`, `https://www.consciously.live` and `http://localhost:3000` → Save.
    - Deploy the backend with `CONSCIOUSLY_APPLE_SERVICES_ID=live.consciously.web` and
      `CONSCIOUSLY_GOOGLE_WEB_CLIENT_ID=<id>.apps.googleusercontent.com` (or `appleServicesId` /
      `googleWebClientId` in `backend/cdk.json` context so it sticks). The web buttons read both
      from `/auth/cognito/config`.

## Known gaps (next prompts)

- **Pricing / Stripe checkout:** web checkout returns to `capacitor://localhost` and doesn't work in the
  app. Digital subscriptions in iOS apps also fall under App Store payment rules.
- During the 20 s post-voice outro, the lock-screen controls are cleared. The beds still fade out
  natively.
