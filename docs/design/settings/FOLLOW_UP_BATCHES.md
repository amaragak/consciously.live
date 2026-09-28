# Settings: follow-up prompts (after pass 1)

Run these one at a time in Cursor, in this order, after pass 1 is merged. Each one starts the same way, so paste the shared intro first and then the batch.

---

## Shared intro (paste before each batch)

Read `docs/settings-status.md` and the settings status config map. Wire up only the settings listed in this batch: make each one actually control the app's behaviour, **enforced server-side**, reading the value from stored settings (never from client state). When a setting is done, flip its status to `wired` (removing its marker) and update the checklist. Don't change the Settings UI layout, other settings, the app header or sidebar, or the colour tokens. Plan first and wait for my OK. When done, tell me how you verified each setting (a test, or manual steps).

---

## Batch 1: AI & data (do this first)

- **Personalise with my journal:** when off, no journal content reaches any model prompt (meditation generation, Chat, anything else). Add a test that builds each prompt with the setting off and asserts no journal text is in it. Add the **just-in-time ask**: the first time someone creates a meditation with this off, show an inline "Use your journal to personalise this? You can change this in Settings." with Yes / Not now. Yes turns it on; Not now doesn't ask again for 30 days.
- **Insights from my journal:** when off, the insights generation endpoint refuses (403 with a clear message), and the "Generate insights" dialog explains and links to `/settings/ai`.
- **What Chat can do:** enforce it in the Chat tool-execution layer. Suggest only means no data-changing tool runs (Chat describes what it *would* do). Ask first means every data-changing tool call shows an in-chat confirm/cancel before running. Act means run directly. Read-only tools are always allowed.
- **Delete AI-made data:** deletes themes, scores, letters and embeddings for the user (not entries), with confirmation; confirm with a count of what was removed.
- **Clear chat history:** deletes all Chat conversations for the user, with confirmation.
- **Who processes your data:** make sure the providers config matches every AI call in the code; list any mismatch.

## Batch 2: Privacy

- **New meditations are:** applied at creation everywhere meditations are created (including via Chat).
- **Shared links → Manage:** list, copy and revoke; revoking kills the link immediately (the share page returns a friendly "no longer shared" page).
- **Post anonymously by default / Show my activity in Connect:** applied to new posts and replies, and to activity visibility.
- **Blocked people and muted threads:** list and unblock/unmute, if blocking/muting exists.
- **Share anonymous usage data:** when off, no analytics events are sent for this user from the client **or** the server (check every analytics call site).
- **Journal lock:** only if there's a mobile app shell; otherwise leave it as NOT AVAILABLE YET.

## Batch 3: Email

- The email sender checks the user's email preferences before every non-transactional email.
- Every non-transactional email gets a one-click unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post` if the provider supports it) that writes to the **same** settings, plus a visible link in the footer.
- **Weekly summary:** only wire it if the summary email exists; otherwise leave it NOT AVAILABLE YET.

## Batch 4: Notifications

- Route every notification through one function that checks channel × category preferences, **quiet hours** (in the user's time zone) and **nudge style** (None suppresses streak and nudge notifications; Gentle caps them at one a day).
- **Daily reminder** with the time picker: schedule it in the user's time zone.
- **Focus session alerts:** start/end.
- Push only if push exists; otherwise its column stays NOT AVAILABLE YET.

## Batch 5: The rest

- **Account:** change email with re-verification; sessions list + sign out everywhere; connected sign-in methods; export (async, emailed link); delete account (a grace period if you have one; signs out everywhere).
- **Meditate:** default voice, length and type pre-fill the create flow; background sound and volume; playback speed in the player.
- **Focus:** default session length and break rules; distraction preferences (if the extension supports them).
- **General:** language and time zone; text size; reduced motion (overrides the OS setting when set); captions if audio captions exist; subscription and billing.
