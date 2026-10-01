# Cursor prompt: Focus marketing page rewrite

Paste everything below the line into Cursor (Agent mode). Put `docs/design/marketing/` in the repo first.

---

## Goal

Rebuild the **Focus marketing page** in the Next.js marketing app. Focus is a calm, goal-linked focus timer:
- your own To Dos or a Manifest goal's next steps;
- an optional short meditation made from the session's tasks;
- sound from the focus sounds and the audio library;
- standard Pomodoro features;
- a Chrome extension with site blocking, coming soon.

Use new, shorter copy. Make it dark throughout, alternate the text and graphic sides, and give each graphic a fixed height.

Design reference (a design-tool file; treat it as a spec, not code to paste): `docs/design/marketing/FocusPage.dc.html`. There's a full-page screenshot beside it: `FocusPage-preview.png`.

**Colours:** use the codebase's current colour tokens and existing component styles. The colours in the design file are illustrative only; don't copy hex values from it. Below, colours are described by role (page background, alternate section background, card surface, accent, primary button, heading, body and muted text). Map each role to whatever token currently plays it.

## Scope

- **Change:** the Focus marketing page's sections and copy.
- **Don't change:** the site header and nav, other pages, the app, or the colour tokens.
- Reuse the existing marketing components, the same ones the Meditate, Journal and Manifest pages use: section wrapper, eyebrow, H2, lead, sub-points, card, chip, primary button, player card and waveform.
- If a progress-ring timer component already exists (the current page has one), reuse it.

## Step 0: plan first

Reply with a plan, and **wait for my OK.** Include a **fact check** of every claim below against the app code, and flag anything that isn't true yet:
- To Dos can be added directly on the timer;
- a Manifest goal's next steps can be queued;
- ticking a To Do off in Focus counts as progress on the goal;
- the optional pre-session meditation is generated from the session's tasks, and its length (the copy says two minutes);
- the timer starts when that meditation ends;
- focus sounds and their names (Rain, Brown noise, Café, Low piano), with per-sound levels;
- library audio from Listen can play during a session or between rounds;
- sound can keep playing through breaks;
- the Pomodoro features: a 25/5 preset, a 50/10 preset, custom lengths, long breaks after every four, a set number of rounds, and today's sessions and time.

Adjust the copy and tiles to match what's true. Drop a tile rather than claim something that doesn't exist.

**Exception:** the Chrome extension section (section 6) describes **unreleased** features on purpose. Keep its copy, and show the "Coming soon · Chrome" label clearly. Don't fact-check it against the code.

## Sections, in order (copy exact unless the fact check says otherwise)

**Background:** dark throughout. No light or grey bands.
- Alternate the page background and the alternate section background, with a hairline between sections.
- The paisley appears only in the hero, fading downwards.
- Content width is about 1200px. Section padding is about 96px (about 72px for the strip in section 5).

**Side-by-side sections alternate sides:** text left, then right, then left. Section 5 is full width. Section 6 has its text on the right.

**Cards:** one card style for every graphic. Use the card surface, a hairline border and the existing card radius. Don't mix filled and outline-only cards.

### 1. Hero (centred; keep the current copy)
- H1: **"Give your hours to your dream."**
- Sub: **"Pick the step. Start the timer. Stay with it."**
- **Primary button:** "Start a focus session" (same destination as today).

### 2. The timer (text left, graphic right)
- **Eyebrow:** "The timer". **H2:** "Start from what matters."
- **Lead:** "Your own To Dos, or the next steps from a goal. One task on the clock at a time."
- **Points:**
  - **Type your own:** "Add To Dos straight on the timer."
  - **Or pull from Manifest:** "A goal's next steps line up, and ticking one off counts as progress on the goal."
- **Graphic (about 290px):** one card in two columns.
  - **Left:** a progress ring with "18:24" in serif, with "Round 2 of 4" under it.
  - **Right:**
    - a "Now" label, then "Price the collection" with "From Manifest · Studio" in muted text;
    - an "Up next" label, then three rows with an empty checkbox and a muted source on the right: "Photograph every piece" (Studio), "Reply to the gallery" (Your To Do), "Book the kiln" (Your To Do);
    - finally, "+ Add a To Do" in muted text.

### 3. Before you start (graphic left, text right)
- **Eyebrow:** "Before you start". **H2:** "Set your head first."
- **Lead:** "An optional two-minute meditation made from the tasks in front of you, ready when you hit start."
- **Points:**
  - **Made from your list:** "It knows what you're about to do, and why it matters."
  - **Then straight in:** "The timer starts when the meditation ends."
- **Graphic (about 200px):** a "This session" card listing the three tasks, then an accent-coloured →, then a player card.
  - The player card is labelled "Before you start" and shows the title "Steady hands", the meta line "2 min · made from this session" and a waveform.

### 4. Sound (text left, graphic right)
- **Eyebrow:** "Sound". **H2:** "Work to the right sound."
- **Lead:** "Focus sounds, or anything from the audio library, while the clock runs."
- **Points:**
  - **Mix the room:** "Rain, brown noise, a café, low piano. Set each level."
  - **Or the library:** "Play a meditation or music from Listen between rounds."
- **Graphic (about 190px):** one card labelled "Playing while you work".
  - Chips: Rain and Brown noise are selected, in the accent style; Café, Low piano and "From the library" are outline-only.
  - Two labelled level bars, for Rain and Brown noise.
  - The caption "Keeps playing through breaks, if you like".

### 5. The timer you'd expect (full-width strip)
- **H2** on the left: "The timer you'd expect." On the right, the line: "Everything a good Pomodoro app does, without leaving your goals."
- Below, a row of six small tiles, each with a serif title and a muted line:
  - Pomodoro: "25 on, 5 off";
  - Deep work: "50 on, 10 off";
  - Custom: "Any length";
  - Long breaks: "After every four";
  - Rounds: "Set how many";
  - Today: "Sessions and time".
- Trim the tiles to what's real.

### 6. Chrome extension: coming soon (graphic left, text right)
- A small pill above the H2: **"Coming soon · Chrome"**, with an accent-tinted outline and small caps.
- **H2:** "Distraction blocking for the session."
- **Lead:** "Sites that pull you away stay blocked until the timer ends."
- **Points:**
  - **Focus on every new tab:** "Your timer and next step, wherever you open a tab."
  - **Until the bell:** "The block lasts as long as the session. Then it lifts."
- **Graphic (about 280px):** a simple browser frame: a top bar with three dots and a "New tab" tab.
  - **Inside, on the left:** a smaller progress ring showing "18:24", with "Price the collection" under it.
  - **On the right:** a "Blocked until the bell" list with Social feeds, News and Shopping, each with an accent-coloured "BLOCKED" label.

### 7. Closing call to action
- **"What's the next step?"**
- **Sub:** "Give it twenty-five minutes." If the default isn't 25 minutes, change this to match.
- **Primary button:** "Start a focus session".
- This replaces "Ready to try focus?".

## Graphics rules

- **Fixed heights** on desktop, as above. **Don't** stretch graphics to the text column's height.
- **No dead space and no overflow:** content fills the card. If something doesn't fit at the real font sizes, trim it rather than letting it spill.
- **Mobile (< 768px):**
  - sections stack with the text first;
  - the graphics' fixed heights are released (auto height);
  - the timer card stacks with the ring above the list;
  - side-by-side cards stack, and → becomes ↓;
  - the six tiles become a 2 × 3 grid.
- **Accessibility:**
  - the decorative rings, waveforms and arrows are `aria-hidden`;
  - illustrative checkboxes, chips and buttons inside graphics aren't focusable or interactive.

## Remove

The old sections' copy and any components left unused, e.g.:
- "Start from the To Dos that matter.", "Goal-linked sessions", "No hunting for what to do";
- "Set the tone first?", "Yes, generate 2-min meditation", "Focus sounds" (the Pomodoro/Deep work graphic);
- "breath+work for Chrome", "Until the session ends";
- "Close the loop on the goal.", "Progress on the goal", "Ready for tomorrow";
- "Ready to try focus?".

## Done when

- The seven sections appear in order with this copy, adjusted where the fact check required it (list the changes). The Chrome section is clearly labelled as coming soon.
- It's dark throughout, the sides alternate, there's one card style, and graphics have fixed heights with no dead space or overflow.
- The mobile layout works.
- No header or token changes.
- Typecheck, lint and build pass. List the files changed.
