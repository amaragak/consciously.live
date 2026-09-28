# Cursor prompt: Journal Insights, update 7 (safety, sources, corrections, generation states)

Paste everything below the line into Cursor (Agent mode).

---

## Context

Insights updates 1–6 are built: the letter, patterns, the opt-in Generate dialog, collapsible sections and flexible periods. This update adds four things. Build on what's there, and keep the existing visual language (tokens, the 12px card radius, the collapsible section headers).

## Scope

- **In scope:**
  - the insights generation backend and prompt;
  - the Insights content area and its "Your insights" sidebar;
  - a small support link in the Journal and Insights pages' footer or overflow area;
  - a new support-resources config.
- **Out of scope:** the main app header and sidebar, other pages, the colour tokens, and any real-time checks while writing an entry (that's a later update).

## Step 0: plan first

Reply with a plan covering:
- the added fields in the generation response;
- how the wellbeing level changes what's generated and shown;
- the support-resources config shape and how a user's country is chosen;
- how source entries are referenced;
- where corrections are stored;
- the generation states and the daily limit.

**Wait for my OK.**

---

## 1. Wellbeing safety

### Detection (same model call)
- The generation response always includes `wellbeing: { level: 'none' | 'struggling' | 'at_risk' }`, whatever the user asked to generate (letter, patterns, or both).
  - **`struggling`:** sustained distress, hopelessness, exhaustion, panic, grief.
  - **`at_risk`:** any mention of suicidal thoughts, wanting to not be here, self-harm, or being unsafe, **past or present**.
- **The prompt must rule out figures of speech** ("killing it", "I could die of embarrassment", song lyrics, fiction clearly marked as such). When it's genuinely unclear, it should choose the **safer** level.
- Store the level with the insight only. **It is never:**
  - sent to analytics;
  - emailed;
  - shown to anyone else;
  - used anywhere outside this page.

### What changes by level
- **`none`:** as now.
- **`struggling`:**
  - The letter's tone is gentler: acknowledge before encouraging, with no "wins" pep talk.
  - "Wins you might have missed" and the emotion scores still show.
  - Show the **soft support banner**.
- **`at_risk`:**
  - Show the **full support banner** at the top of the content, above the letter. It can't be collapsed.
  - The letter becomes a short, warm note. It acknowledges how heavy things have been, says they deserve support right now, and points to the banner. **No advice, no diagnosis, no claims that we "noticed" or "detected" anything.**
  - **Don't show:** emotion scores, How it moved, Wins, Promises, What lifts you, the recurring thought's meditation button, or "Turn this into a meditation". Mood and the entry links can stay.
  - Don't offer to make a meditation from these entries.
- Put the letter instructions for `struggling` and `at_risk` in the prompt as fixed guidance, **not** something the model improvises. Show me the exact wording before shipping.

### Support banner
- **Full (`at_risk`):**
  - A calm card using existing tokens: no red, no alarm icons.
  - Title: **"You don't have to carry this alone."**
  - Body: "If you're thinking about ending your life or you might hurt yourself, please reach out now. These services are free and confidential."
  - Then the resources for the user's country: name, what it offers (call / text / chat), hours, and a **tap-to-call `tel:` or `sms:` link** plus the website.
  - Then: "If you're in immediate danger, call {emergency number}."
  - Footer:
    - "Consciously isn't a crisis service."
    - "Not in {country}? Change" (lets them pick another country).
    - "See services in other countries" (links to the international directory).
- **Soft (`struggling`):**
  - One line: "Going through a lot? Talking to someone can help." with a "Find support" link. The link opens the same resource list in a small dialog.
  - It can be dismissed for that insight.
- **Always visible, whatever the level:** a small "Need support?" link on the Journal and Insights pages. It opens the same dialog.

### Support-resources config
- Create `config/support-resources.(ts|json)`, keyed by ISO country code. Each resource has:
  - name, description, `phone` / `sms` / `url`, hours, languages;
  - `lastVerified` (a date).
- Each country also has its emergency number, and there's an international fallback.
- **Seed it with these, and mark each `lastVerified: null` so I verify them before shipping:**
  - **GB:** Samaritans 116 123 (24/7); Shout, text SHOUT to 85258 (24/7); NHS 111 (select the mental health option, England); emergency 999.
  - **IE:** Samaritans 116 123; emergency 112 / 999.
  - **US:** 988 Suicide & Crisis Lifeline (call or text 988); emergency 911.
  - **CA:** 988 (call or text); emergency 911.
  - **AU:** Lifeline 13 11 14; emergency 000.
  - **NZ:** 1737 (call or text); emergency 111.
  - **Fallback:** findahelpline.com, plus "contact your local emergency number".
- **Add a test that fails if any resource has `lastVerified` older than 12 months or null in production builds.** This guards against numbers going out of date.
- **Choosing the user's country**, in this order:
  1. a country stored on their account, if there is one;
  2. their chosen country from "Change" (store it);
  3. their time zone mapped to a country;
  4. their browser locale;
  5. the international fallback.
  
  Never block the banner on this: if the country is unknown, show the fallback.

### Tests
- Fixture entries for each level must produce the right shown and hidden cards:
  - clear figures of speech → `none`;
  - distress → `struggling`;
  - a past mention of self-harm → `at_risk`.
- The full banner can't be collapsed, and it renders even when the letter wasn't generated.

---

## 2. Links to the source entries

- The generation response references entries by **ID** for:
  - each win;
  - each promise;
  - the recurring thought (every occurrence);
  - each emotion score (the entries that most support it, up to 3).
  
  "What lifts you" activities already come from per-entry data, so use those entry IDs.
- **Validate the IDs server-side:** drop any that aren't the user's or aren't in the period.
- **UI:**
  - Each item gets a quiet "From {n} entries" or date link ("Tue 23 Sept").
  - Clicking one opens a small popover listing those entries (date, title, first line), each linking to the entry.
  - On emotion bars, the link sits at the end of the row.
  - Keyboard accessible.

## 3. Corrections

- Every pattern item (a win, promise, recurring thought, activity or emotion score) gets a small overflow menu, "⋯", with two options:
  - **"That's not right"** hides the item and records it as incorrect;
  - **"Hide this"** hides it without judgement.
  
  Both show an undo toast.
- **Hidden activities and thoughts are remembered per user** (normalised text), and left out of future insights and What lifts you.
- The letter gets **"Did this feel right? 👍 / 👎"**, rendered as icon buttons (not emoji) with labels. Store the answer with the insight. 👎 asks one optional follow-up: "What felt off?" (free text, optional).
- Add a "Hidden items" list under the page's "⋯" menu, so people can restore them.
- **Pass the user's recent corrections into the generation prompt as short guidance** (e.g. "The user said X wasn't accurate"). Cap it at 10.

## 4. Generation states and limits

- **Loading:**
  - After Generate, the dialog closes. The page shows the range header and skeleton sections.
  - **Stream the letter in** if the API route supports streaming; otherwise show "Writing your letter…" with a calm progress line (no fake percentages).
  - Patterns appear once the call completes.
- **Failure:**
  - An inline message: "Something went wrong writing this. Nothing was lost." with **Try again**. The retry reuses the same options and range.
  - A partial result is never saved as complete.
- **Leaving the page mid-generation:** generation continues on the server, and the sidebar item shows "Writing…" until it's done.
- **Daily limit:**
  - At most **5 generations per user per day**, including regenerations; put the number in config.
  - Enforce it on the server, and return 429 with a friendly message: "You've generated a lot today. Try again tomorrow."
  - Show the remaining count in the dialog only when there's **1** left.
  - Log token usage per generation, so I can see cost per user.

## Done when

- The three wellbeing levels behave as specified and are covered by tests. The support banner uses the config and the country rules, with tap-to-call links.
- The "Need support?" link is on the Journal and Insights pages.
- Source links open the right entries, and invalid IDs are dropped.
- Corrections hide items, undo works, hidden items stay out of future generations, and they can be restored.
- The loading, streaming (if supported), failure/retry and daily limit states all work.
- No colour tokens were changed.
- Typecheck, lint, tests and build pass. List the files changed, the response schema, and the exact prompt wording for the `struggling` and `at_risk` letters.
