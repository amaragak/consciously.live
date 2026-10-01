# Cursor prompt: Manifest marketing page rewrite

Paste everything below the line into Cursor (Agent mode). Put `docs/design/marketing/` in the repo first.

---

## Goal

Rebuild the **Manifest marketing page** in the Next.js marketing app so it follows the product's own structure:
- Manifest-wide (vision board, manifesto);
- then life areas (the dream, the moment it's happened, what's in the way);
- then goals and To Dos;
- then Meditate and Focus;
- then thoughts and insights.

Use new, shorter copy. Make it dark throughout, alternate the text and graphic sides, and give each graphic a fixed height.

Design reference (a design-tool file; treat it as a spec, not code to paste): `docs/design/marketing/ManifestPage.dc.html`. There's a full-page screenshot beside it: `ManifestPage-preview.png`.

**Colours:** use the codebase's current colour tokens and existing component styles. The colours in the design file are illustrative only; don't copy hex values from it. Below, colours are described by role (page background, alternate section background, card surface, accent, primary button, heading, body and muted text). Map each role to whatever token currently plays it.

## Scope

- **Change:** the Manifest marketing page's sections and copy.
- **Don't change:** the site header and nav, other pages, the app, or the colour tokens.
- Reuse the existing marketing components, the same ones the Meditate and Journal pages use: section wrapper, eyebrow, H2, lead, sub-points, card, primary button, player card and waveform.

## Step 0: plan first

Reply with a plan, and **wait for my OK.** Include a **fact check** of every claim below against the app code, and flag anything that isn't true yet:
- the vision board shows the manifesto statement over the images;
- values are ordered (ranked);
- the manifesto has quotes and "questions to yourself" with answers;
- life areas have "The dream", "The moment it's happened" and "What's in the way";
- users can add as many life areas as they like;
- "Create To Dos" drafts To Dos from a goal's description, and the user can edit or delete them;
- the "What's getting in the way of the next step?" prompt;
- "Plan next steps" opens Chat;
- each life area can generate a meditation (visualisation) grounded in its dream and obstacles;
- a Focus session can start from a goal's To Dos, optionally with a short visualisation first, and the default Focus length (the graphic shows 25:00);
- the thought tags (Win, Hard blocker, Resistance, Insight, Question, Intention, Progress);
- per-area Insights show what's working, what's not, and patterns.

## Sections, in order (copy exact unless the fact check says otherwise)

**Background:** dark throughout. No light or grey bands.
- Alternate the page background and the alternate section background, with a hairline between sections.
- The paisley appears only in the hero, fading downwards.
- Content width is about 1200px. Section padding is about 96px.

**Side-by-side sections alternate sides:** text left, then right, then left, and so on.

**Cards:** one card style for every graphic. Use the card surface, a hairline border and the existing card radius. Don't mix filled and outline-only cards.

### 1. Hero (centred)
- H1: **"Know exactly who you're becoming."**
- Sub: **"Picture it. Name what's in the way. Take the next step."**
- **Primary button:** "Build your vision board" (same destination as today).

### 2. Vision board (text left, graphic right)
- **Eyebrow:** "Vision board". **H2:** "See it first."
- **Lead:** "Scenes of the life you're building, concrete enough to feel."
- **Points:**
  - **Your words over it:** "Your manifesto line sits on the board, so the picture and the promise stay together."
  - **Come back to it:** "Open it when motivation runs thin."
- **Graphic (about 340px):** a 3 × 2 collage of **real photos** with small gaps, inside one card.
  - Scenes: a ceramics studio with shelves and a big window; mountains at sunrise; a small stage under a spotlight; a quiet sea at dawn; a desk by a city window; a garden path.
  - Centred over the collage, a translucent dark panel shows the line "I make things with my hands, and I charge what they're worth." in serif italic, with the caption "Your manifesto line, over your board".
  - The images are only placeholders in the design file. Use licensed stock images in `public/`, using `next/image`. Give them empty `alt` text, since they're decorative. If no assets are available, add clearly named placeholder files and list them for me. Don't use photos of real users.

### 3. Manifesto (graphic left, text right)
- **Eyebrow:** "Manifesto". **H2:** "Say what you stand for."
- **Lead:** "Your values, the quotes that keep you honest, and the questions worth asking yourself."
- **Points:**
  - **Values, ranked:** "Know what wins when two things matter."
  - **Questions to yourself:** "Answer them when you're ready, and come back as the answer changes."
- **Graphic (about 260px):** two cards side by side.
  - A "Values" card with a numbered list (01 Craft, 02 Courage, 03 Family, 04 Freedom) in serif, with hairlines between the rows.
  - An "A question to yourself" card with "What would you regret not trying?" in serif italic. Below it, an answer with an accent-coloured left rule: "Never opening the studio. Never finding out."

### 4. Life areas (text left, graphic right)
- **Eyebrow:** "Life areas". **H2:** "Every part of your life gets its own dream."
- **Lead:** "Picture where it's going, the moment it happens, and what's in the way."
- **Points:**
  - **Name what's in the way:** "Dreaming alone tends to drain effort. Research on mental contrasting finds that pairing the dream with the obstacle is what gets people moving."
  - **As many areas as you need:** "Work, health, home, a side project. Each keeps its own dream."
- **Graphic (about 330px):** one card.
  - A row of area chips: Studio (selected, in the accent colour), Health, Family, Travel.
  - Below it, three stacked bands, each with a small-caps label and a serif italic line:
    - **The dream:** "My own studio. Clay on the shelves, light through the big window."
    - **The moment it's happened:** "Opening night. Forty people in, and the first piece sells."
    - **What's in the way:** "Who am I to charge for this?" This band is highlighted with an accent-tinted border and a slightly raised surface.
- If we have a source page for mental contrasting (Oettingen / WOOP), you may link "Research on mental contrasting" to it. Otherwise leave it unlinked. Don't invent statistics.

### 5. Goals and To Dos (graphic left, text right)
- **Eyebrow:** "Goals and To Dos". **H2:** "Make it plannable."
- **Lead:** "Each area holds goals. Each goal breaks into To Dos you can start today."
- **Points:**
  - **To Dos in one tap:** "Describe the goal and Consciously drafts the steps. Keep, edit or delete them."
  - **Stuck on a step?:** "Say what's in the way, or plan the next steps in Chat."
- **Graphic (about 300px):** one card.
  - The small label "Studio · Goal", then the title "Sell the first collection".
  - Four To Dos:
    - "Finish twelve pieces" is checked and struck through;
    - "Price the collection" has an accent-coloured outline and a small accent "Next" label at the right;
    - "Photograph every piece" and "Open the online shop" are plain.
  - At the bottom, a bordered box: "What's getting in the way of the next step?" in muted text, then "Naming a number out loud." in serif italic.

### 6. Meditate and Focus (text left, graphic right)
- **Eyebrow:** "Meditate and Focus". **H2:** "Feel it. Then do it."
- **Lead:** "Every area can make its own visualisation, and every goal can open a Focus session."
- **Points:**
  - **Generate a meditation:** "A visualisation built from your dream and what's in the way."
  - **Start a Focus session:** "Work the next To Do with the timer running. Set the tone first with a short visualisation if you like."
- **Graphic (about 200px):** two cards side by side, both in the same card style.
  - A player card labelled "consciously Meditate": a play button, the title "Opening night", the meta line "From your Studio dream · 8 min" and a waveform.
  - A card labelled "consciously Focus": a large serif "25:00", "Price the collection", and the caption "Next To Do · Studio".
  - The timer must match the real default Focus length. Use whatever the fact check finds, and make the copy agree.

### 7. Thoughts and insights (graphic left, text right)
- **Eyebrow:** "Thoughts and insights". **H2:** "It notices what you don't."
- **Lead:** "Jot thoughts as they come: wins, blockers, resistance. Insights reads them back."
- **Points:**
  - **What's working, what's not:** "A plain read on each area, from your goals, thoughts and progress."
  - **Patterns:** "Where you keep stalling, named before it costs another month."
- **Graphic (about 250px):** a "Thoughts" card, then an accent-coloured →, then an insight card.
  - The Thoughts card has three rows, each with a date, the text and a small outline tag:
    - 22 Sept: "Priced the first piece." (Win);
    - 24 Sept: "Put off the photos again." (Resistance);
    - 26 Sept: "Kiln booked till Friday." (Hard blocker).
  - The insight card has two parts:
    - **What's not:** "You've stalled on the step after pricing three times. The doubt shows up before anyone has seen the work."
    - **What's working:** "Twelve pieces finished. The making was never the problem."

### 8. Closing call to action
- **"Who are you becoming?"**
- **Sub:** "Put it on the board."
- **Primary button:** "Build your vision board".
- This replaces "Ready to try manifest?".

## Graphics rules

- **Fixed heights** on desktop, as above. **Don't** stretch graphics to the text column's height.
- **No dead space and no overflow:** content fills the card. If something doesn't fit at the real font sizes, trim it rather than letting it spill.
- **Mobile (< 768px):**
  - sections stack with the text first;
  - the graphics' fixed heights are released (auto height);
  - the collage becomes 2 × 3;
  - side-by-side cards stack, and → becomes ↓.
- **Accessibility:**
  - the decorative waveforms, arrows and collage images are `aria-hidden` or have empty `alt`;
  - illustrative buttons, checkboxes and chips inside graphics aren't focusable or interactive.

## Remove

The old sections' copy and any components left unused, e.g.:
- "Vision board.", "Collect what you're becoming", "Beside the plan";
- "Manifesto.", "Principles in your voice", "Values and quotes too", "Lines you'll recognise under pressure";
- "Goals and To Dos.", "Plan next steps", "Obstacles named";
- the colour-swatch vision board graphic, the "From Manifest" flow graphic and "Ready to try manifest?".

## Done when

- The eight sections appear in order with this copy, adjusted where the fact check required it (list the changes).
- It's dark throughout, the sides alternate, there's one card style, and graphics have fixed heights with no dead space or overflow.
- The vision board uses real photos, or named placeholders that you've listed.
- The mobile layout works.
- No header or token changes.
- Typecheck, lint and build pass. List the files changed.
