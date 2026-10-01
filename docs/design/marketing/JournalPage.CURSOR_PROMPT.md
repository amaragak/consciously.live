# Cursor prompt: Journal marketing page rewrite

Paste everything below the line into Cursor (Agent mode). Put `docs/design/marketing/` in the repo first.

---

## Goal

Update the **Journal marketing page** in the Next.js marketing app.
- Keep the current set of features.
- Replace the copy with the shorter version below.
- Reorder the sections.
- Make it dark throughout. The privacy point lives inside the Insights section, not in a separate band.
- Alternate the text and graphic sides.
- Give each graphic a fixed height.

Design reference (a design-tool file; treat it as a spec, not code to paste): `docs/design/marketing/JournalPage.dc.html`.

**Colours:** use the codebase's current colour tokens and existing component styles. The colours in the design file are illustrative only; don't copy hex values from it. Below, colours are described by role (page background, alternate section background, accent, primary button, heading, body and muted text). Map each role to whatever token currently plays it.

## Scope

- **Change:** the Journal marketing page's sections and copy.
- **Don't change:** the site header and nav, other pages, the app, or the colour tokens.
- Reuse the existing marketing components, the same ones the Meditate page uses if it has been rebuilt: section wrapper, eyebrow, primary button, player card and waveform.

## Step 0: plan first

Reply with a plan, and **wait for my OK.** Include a **fact check** of every claim below against the code, and flag anything that isn't true yet:
- voice entries keep the recording alongside the transcript;
- handwriting photos are read and reviewed before saving;
- the import formats (Day One, Markdown/text, CSV, PDF notes or highlights);
- insights are generated only when asked, for any stretch of time;
- "Only you see what it finds";
- an entry can generate a meditation in one tap;
- entries can be linked to a Manifest life area;
- **the "Private by default" point in Insights:** AI only reads the journal when the user turns it on.

**That point depends on the Settings work (private defaults) having shipped.** If it hasn't, use "Only for you: Built from your writing. Only you can see it." instead, and tell me.

## Sections, in order (copy exact unless the fact check says otherwise)

**Background:** dark throughout. No light or grey bands.
- Alternate the page background and the alternate section background, with a hairline between sections.
- The paisley appears only in the hero, fading downwards.
- Content width is about 1200px. Section padding is about 96px.

**Side-by-side sections alternate sides:** text left, then right, then left, and so on.

### 1. Hero (centred)
- H1: **"Hear what you've been telling yourself."**
- Sub: **"Write it, say it, or bring your old notebooks. Consciously notices what keeps coming back."**
- **Primary button:** "Write your first entry" (same destination as today).

### 2. Write or speak (text left, graphic right)
- **Eyebrow:** "Write or speak". **H2:** "Say it however it comes out."
- **Lead:** "A careful paragraph or a voice note on the walk home. Same private page."
- **Points:**
  - **Type:** "A quiet page, no one to perform for."
  - **Speak:** "Talk it out. Your recording stays with the words."
- **Graphic (about 300px):** two cards side by side.
  - A typed entry: a title and two short paragraphs, with the caption "Saved to your journal".
  - A spoken entry: a small play button, waveform and duration, then the transcript, with the caption "Your voice, kept with the words."

### 3. Insights (graphic left, text right)
- **Eyebrow:** "Insights". **H2:** "See what keeps coming back."
- **Lead:** "The doubt you keep writing. The dream that won't let go. See the patterns, and exactly where they came from."
- **Points:**
  - **A letter when you ask:** "A reflection on any stretch of time. Nothing is written until you ask."
  - **Private by default:** "AI only reads your journal when you turn that on. Only you see what it finds."
- **Graphic (about 320px):** an entries card with two quotes, key phrases underlined with accent-coloured dotted lines, and dates. Then an accent-coloured arrow →, then a patterns card:
  - four bars (the first in the accent colour, the rest muted);
  - "From {n} entries";
  - an accent-coloured link **"Turn this into a meditation →"**, which bridges into section 4.

### 4. Entry → meditation (text left, graphic right)
- **Eyebrow:** "Journal → Meditate". **H2:** "Turn a heavy page into something you can sit with."
- **Lead:** "Then do something with it. One tap makes a meditation from that exact entry."
- **Points:**
  - **No explaining twice:** "The session already knows what's going on."
  - **Linked to your goals:** "Connect an entry to a life area in Manifest."
- **Graphic (about 250px):** an entry card with a quote and a small "Make a meditation" button, then →, then a "You get" player card.

### 5. Gratitudes (graphic left, text right)
- **Eyebrow:** "Gratitudes". **H2:** "Keep the good bits too."
- **Lead:** "Log the small wins as they happen, so the hard days aren't the only ones on record."
- **Points:**
  - **In the moment:** "One line, before it fades."
  - **One thread:** "The thanks sit beside the struggles."
- **Graphic:** a "Today" list of four gratitudes (accent-coloured ✦, serif italic) with a date. It's sized to its content.

### 6. Import (text left, graphic right)
- **Eyebrow:** "Bring your past". **H2:** "Your old notebooks belong here too."
- **Lead:** "Photograph handwritten pages, or import from Day One, Markdown, CSV or PDF notes."
- **Points:**
  - **Paper pages:** "We read the handwriting; you check it before saving."
  - **Other apps:** "Bring your archive and keep writing in one place."
- **Graphic (about 240px):**
  - a "Paper pages" card with three page thumbnails and the caption "We read the handwriting. You check it.";
  - an "Or import" card with the formats as a stacked list.

### 7. Closing call to action
- **"Start with one line tonight."**
- **Sub:** "Whenever you're ready."
- **Primary button:** "Write your first entry".
- This replaces "Ready to try journal?".

## Graphics rules

- **Fixed heights** on desktop, as above. **Don't** stretch graphics to the text column's height.
- **No dead space:** content fills the card. If something doesn't fit, trim it rather than letting it overflow.
- **Mobile (< 768px):**
  - sections stack with the text first;
  - the graphics' fixed heights are released (auto height);
  - side-by-side cards stack, and → becomes ↓.
- **Accessibility:**
  - the decorative waveforms and arrows are `aria-hidden`;
  - illustrative buttons inside graphics aren't focusable, or they're real links if they go somewhere.

## Remove

The old sections' copy and any components left unused, e.g. "A private page for what's actually going on", "From entry to guided session", "Insights over weeks", "Gratitudes beside the hard days", "Bring the journal you already keep" and "Ready to try journal?".

## Done when

- The seven sections appear in order with this copy, adjusted where the fact check required it (list the changes).
- It's dark throughout, the sides alternate, and graphics have fixed heights with no dead space.
- The mobile layout works.
- No header or token changes.
- Typecheck, lint and build pass. List the files changed.
