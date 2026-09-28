# Cursor prompt: Settings page, pass 1 (full UI, wire what exists, mark the rest)

Paste everything below the line into Cursor (Agent mode). Put `docs/design/settings/` in the repo first so Cursor can read the mock-up. The follow-up prompts for wiring the rest are in `FOLLOW_UP_BATCHES.md`.

---

## Goal

Build the complete **Settings** UI in the SPA, opened from the settings cog already added to the bottom of the app sidebar. In this pass:

1. **Build every section and every setting listed below in the UI.**
2. **Wire up only the settings whose behaviour already exists** in the app (e.g. theme). "Wire up" means the setting is stored and actually changes behaviour.
3. **Everything else is rendered but disabled, with a monospace status marker**, and listed in a status checklist.

Enforcing the rest (journal personalisation, Chat modes, analytics, email preferences…) comes in later, smaller prompts. **Don't implement new enforcement logic in this pass**, apart from storing the settings themselves.

Design reference: `docs/design/settings/Settings.dc.html` (desktop, 1440px). It's a design-tool file: layout, components and copy are the spec; treat it as a spec, not code to paste. It shows **AI & data** and **Privacy** in full; build every other section in the same pattern.

## Scope

- **In scope:** the Settings route(s), the settings section nav, all section content, the settings storage/API, and the status checklist.
- **Out of scope:** the app header, the main app sidebar (only make sure the cog links to `/settings` and shows as active there), other pages, and the colour tokens. Use the existing tokens as they are; map mock-up hexes to the nearest existing token.

## Step 0: investigate, then plan

For **every setting below**, classify it:

- **WIRED:** the behaviour already exists and this pass can connect the setting to it with little risk (e.g. theme, community display name, the existing shared-links list, existing export/delete endpoints).
- **NOT IMPLEMENTED:** the feature exists, but making this setting control it needs new logic (e.g. keeping journal text out of prompts, Chat action modes, analytics opt-out, email preference checks).
- **NOT AVAILABLE YET:** the feature itself doesn't exist (e.g. offline downloads, a model tier, push notifications if there's no push).

Reply with the table and your plan, and **wait for my OK**.

## Status markers

- Each non-wired row shows a small **monospace, uppercase** marker next to its title: `NOT IMPLEMENTED` or `NOT AVAILABLE YET`. Use the existing monospace font, a muted outline pill, about 11px, letter-spaced, and give it `title=` text explaining what's missing.
- **Its control is disabled** (visible but not interactive, `aria-disabled`) and never pretends to work.
- **Markers are only visible to admins or in development builds.** Put this behind one helper (e.g. `canSeeSettingsStatus()`). For everyone else, **rows that aren't wired are hidden entirely**, and a card or section with no wired rows is hidden too. Real users must never see a toggle that does nothing, or a marker.
- **Status lives in one config map** (setting key → `wired | not_implemented | not_available`), so later batches just flip the status and add logic.

## Status checklist

Create `docs/settings-status.md`: a table of every setting, its section, its status, and one line on what's needed to wire it. Group it by the batches in `FOLLOW_UP_BATCHES.md` (AI & data, Privacy, Email, Notifications, the rest). Keep it in sync with the config map.

## Principles

- **Private by default.** Every setting's default is the most private option (listed below). Store defaults server-side.
- **Saves on change.** No Save button. Toggles and segmented controls save immediately (optimistic UI, with a revert and an error toast on failure); text fields save on blur or after about 600ms of no typing. A small "✓ Saved" status in the page header (`role="status"`) appears briefly after each save. Non-wired settings still store their value (so the UI is real), but nothing reads it yet.
- **One helper line under every control**, in plain language. No FAQ.
- Deep links: `/settings/account`, `/settings/ai`, `/settings/privacy`, `/settings/notifications`, `/settings/email`, `/settings/meditate`, `/settings/focus`, `/settings/general`. `/settings` opens Account on desktop.

## Layout

- The app sidebar, then a **settings section nav** (list-pane surface, one step lighter than the app sidebar), then the content column (max about 760px, centred).
- Section nav order: **Account, AI & data, Privacy, Notifications, Email, Meditate, Focus, General**, then a divider, **Help & feedback** and the app version.
- The page header "Settings" with "Changes save automatically. Everything starts at the most private option." and the Saved status.
- Sections: an H2, a one-line lead, then grouped **cards** of **rows** (title + helper on the left, control on the right). Controls: a switch (`role="switch"`, `aria-checked`), a segmented control (buttons with `aria-pressed`), a text field, a time picker, a checkbox grid, or a button. Destructive buttons use the danger style and always confirm.
- **Mobile (< 768px):** the section nav becomes a list page; each section opens full screen with a back button.

## Sections, settings and defaults

**Account**
- Email address + Change email (re-verify via a link to the new address)
- Active sessions / devices + Sign out everywhere
- Connected sign-in methods (Google, passkeys; Cognito/social later)
- Export all my data (journals, meditations, goals): emailed as a link when it's ready
- Delete account and all data (a dialog that requires typing "delete")

**AI & data** (as in the mock-up)
- The "Who processes your data" card: providers and what each receives. Read them from the code; keep them in one config file; show me before shipping.
- The "Your content is never used to train AI models." line + privacy policy link, **behind a config flag, off by default**, until I confirm it.
- Personalise with my journal: **off**. Helper: "Let meditations and Chat draw on your journal entries. Off means they only use what you type into them."
- Insights from my journal: **off**. Helper: "Weekly letters, patterns and themes. Nothing is generated until you ask for it."
- What Chat can do: **Suggest only** · Ask first · Act (default Suggest only). Helper: "Whether Chat only suggests, asks before changing anything, or acts straight away (creating goals, starting sessions)."
- Delete AI-made data (themes, scores, letters, embeddings; entries stay)
- Clear chat history
- Model / quality tier (NOT AVAILABLE YET)

**Privacy** (as in the mock-up)
- Journal lock (mobile): **off**
- New meditations are: **Private** · Link only · Public
- Shared links: "{n} active links" + Manage (a list with copy and revoke)
- Community name; Post anonymously by default: **on**; Show my activity in Connect: **off**
- Blocked people and muted threads + View
- Share anonymous usage data: **off**

**Notifications**
- Channels × categories grid: rows Reminders, Replies in Connect, Meditation ready, Streaks & nudges; columns Push, Email, In-app. Default: In-app on, Push and Email off.
- Daily reminder: **off**; when on, Meditation or Journal plus a time picker
- Focus session alerts (start/end): **off**
- Quiet hours: from/to times + days, **off**
- Nudge style: None · **Gentle** · Regular. Helper: "How often we remind you. We never guilt-trip."

**Email**
- Transactional (sign-in, receipts, security): "Always on", with no control and a one-line explanation
- Product updates and newsletter: **off**
- Weekly summary (meditations, focus time, goal progress): **off**
- Community replies and mentions: **off**
- Note: "Every email has a one-click unsubscribe that updates these settings."

**Meditate**
- Default voice, length and type (existing options)
- Background sound on/off + volume
- Playback speed
- Downloads / offline (NOT AVAILABLE YET)

**Focus**
- Default session length and break rules
- Distraction blocking / nudge preference
- Which goals appear in the picker (NOT AVAILABLE YET; waiting on the Manifest wiring)

**General**
- Theme: Light · Dark · **System** (move the existing control here; keep any existing entry point working)
- Language; time zone (detected, with an override)
- Accessibility: text size, reduced motion (follows the OS setting by default), captions for audio
- Subscription and billing (current plan + manage link if billing exists)
- Help & feedback link and app version

## Storage & API

- One settings record per user with a versioned schema and **server-side defaults**. Typed on both ends; no `any`.
- `GET /settings` and `PATCH /settings` (partial). Validate every key and value on the server.
- Only **wired** settings are read by app code in this pass.

## Done when

- The cog opens Settings; every section and setting renders; deep links work; mobile uses the list → section pattern.
- Wired settings work end to end.
- Non-wired settings are disabled with the right marker for admins and in development, and hidden for everyone else.
- `docs/settings-status.md` lists everything, matching the config map.
- No colour tokens were added or changed; the header and main sidebar are untouched apart from the cog's link and active state.
- Typecheck, lint and build pass. List files changed and the settings schema with defaults.
