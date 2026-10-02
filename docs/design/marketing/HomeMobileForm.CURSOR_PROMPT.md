# Homepage mobile: match the design exactly (correction pass)

## Goal

The previous mobile pass doesn't match the design. **Make the homepage below the existing mobile breakpoint (`md`) match `docs/design/marketing/HomeMobile.dc.html` and `HomeMobile-360.png` exactly.**

The measurements below are taken from that file. Use them as given. Don't approximate, and don't invent alternatives.

**Colours:**
- **Section backgrounds:** don't take them from the design file. Use the desktop homepage's own section backgrounds, in the same alternation.
- **Everything else** (cards, hairlines, accent, buttons, text, bubbles, the ring, the bars, the tiles): match the design file. Use the desktop token wherever one already plays that role, so the two stay in sync. "Accent" below means the desktop accent; "muted" means the desktop muted text.

**Don't touch:** desktop (`md` and up), the footer, colour tokens, other pages.

## How to use the design file

`HomeMobile.dc.html` is plain HTML with inline styles. **Read its source and port its structure**: the same elements, nesting, borders, radii, padding and gaps.
- Replace only the colour values with desktop tokens (see Colours).
- Ignore its `<helmet>`, `<x-dc>` and script wrappers.
- Treat the source as the source of truth. Where this prompt and the file disagree, follow the file.

**Don't add anything the design doesn't have.** That means no extra containers, cards, borders, backgrounds, radii, shadows or padding around groups of elements. Likewise, don't drop anything it does have (hairlines, labels, dots, lines).

## Step 0

Render the current homepage at 360px wide and compare it with `HomeMobile-360.png`. List every difference, section by section. Then fix them all using the spec below, and send me before and after screenshots at 360px and 320px. (280px, the folded Galaxy Fold, is the narrowest width worth checking.)

## Global (below `md`)

- Side padding is **20px** in every section.
- No horizontal scroll at 320px.
- Sections are separated by a 1px hairline (top border).
- Fonts:
  - "Serif" means the desktop serif (Fraunces).
  - "Sans" means the desktop sans.
- Line heights are given where they matter. Otherwise inherit.

## 1. Header
- **Height 60px.** Padding 0 12px 0 20px, with a 1px hairline at the bottom.
- **Left:** sun mark 22×22, then an 8px gap, then "consciously" in serif 22px.
- **Right:** a menu button, 44×44, with a 22px two-line icon. No other header buttons on mobile.

## 2. Hero
- **Section padding:** 36px top, 40px bottom. The desktop hero pattern stays behind it, fading out downwards.
- One column with a **16px gap**:
  1. **H1:** serif 400, **40px**, line-height 1.06, letter-spacing −0.6px. "Become who you *said* you'd be." "said" is italic, in the accent colour.
  2. **Tagline:** sans **16px**, line-height 1.5, body colour. "*Live consciously* with our mind reprogramming suite." "Live consciously" is serif italic, in heading colour.
     - Hide the desktop's longer line and its feature list below `md`.
  3. **Form:** a column with a **10px gap** and 6px top padding.
     - **Label** "What would you like a meditation for?": sans **13px**, muted.
     - **Input:** **height 52px**, full width, radius **14px**, padding 0 16px, sans **16px**. Same border and fill treatment as the desktop input. Placeholder "e.g. calm before a pitch".
     - **Button** "Create my meditation": **height 52px**, full width, pill radius, sans **16px 600**, `white-space: nowrap`, in the primary button style.
- No helper text under the button.

## 3. "Or start somewhere else"
- **Section padding:** 28px top, 32px bottom. Use the alternate section background, as desktop does.
- **Label** "Or start somewhere else": sans **11px**, uppercase, letter-spacing **1.6px**, muted, with **8px** below it.
- **Four rows.** Each row is a link:
  - **min-height 64px**, padding 10px 0, **flex row**, items centred, **12px** gap;
  - a 1px hairline on top, and on the bottom of the last row too.
- **Left column** (flex 1, `min-width: 0`), with a **2px** gap:
  - the title in serif **18px**, heading colour;
  - the sub line in sans **13px**, muted.
- **Right:** the verb plus " →" in **serif italic 15px**, accent, `white-space: nowrap`.
- **Rows, in order:**
  - "Build your vision board" / "Picture the life you're creating" / *Manifest →*
  - "Write in your journal" / "See the patterns in how you feel" / *Journal →*
  - "Start a focus session" / "A timer for your goals" / *Focus →*
  - "Talk to your coach" / "Think out loud. It acts." / *Chat →*
- **The rows sit directly in the section. They are NOT inside a card or container:**
  - no outer border;
  - no background panel;
  - no rounded corners;
  - no inner side padding.
- The hairlines run the full content width (edge to edge within the 20px gutters).
- The only separators are those 1px hairlines between rows, plus one under the last row.
- **No two-column grid.**

## 4. "Five tools. One direction."
- **Section padding:** 40px top and bottom. A column with a **14px gap**.
- **H2:** serif 400, **30px**, line-height 1.1.
- **Lead:** sans **15px**, line-height 1.55, body colour, with 6px extra below it. The copy is the same as desktop.
- **One card:** radius **14px**, 1px hairline border, card surface, padding **10px 16px 12px**, `position: relative`.
  - **A vertical line:** 1px wide, accent at about 45% opacity, absolutely positioned at **left 20px**. It runs from the centre of the first row's dot to the centre of the last row's dot.
  - **Four rows.** Each row:
    - is a flex row with items centred and a **10px** gap;
    - has **min-height 40px** and **padding-left 22px**;
    - has a **9px accent dot** absolutely positioned at left 0, vertically centred (it sits on the line);
    - shows the verb in **serif italic 15px**, accent, **fixed width 70px** (no "consciously" here);
    - shows its content in sans **14px**, heading colour, on one line.
  - **Rows:**
    - *Journal*: "“Why do I keep waiting?”" (serif italic);
    - *Manifest*: "Open my own studio";
    - *Meditate*: a **22px** play circle in the primary button style with an 8px play icon, an 8px gap, then "Opening night" in serif 15px;
    - *Focus*: "25:00 · Pricing".
  - **The Chat line:** margin-top 8px, padding-top 10px, a 1px hairline on top, sans **13px**, line-height 1.45, body colour.
    - It starts with "consciously" in serif, muted, then *Chat* in serif italic, accent. Then: "runs through all of it: ask, reflect, and it moves the app for you."
- **No separate cards and no ↓ arrows.**

## 5. Feature strips: Meditate, Journal, Manifest, Focus, Chat (same order and copy as desktop)

**Each strip:**
- Section padding **40px** top and bottom. A single column with a **12px gap**. Backgrounds alternate as on desktop.
- Contents, in order:
  1. **Lockup:** serif **15px**. "consciously" muted, then the verb in italic, accent.
  2. **H2:** serif 400, **30px**, line-height 1.1.
  3. **Lead:** sans **15px**, line-height 1.55, body colour.
  4. **Link** ("Create a meditation →" etc.): sans **15px 600**, accent, padding 6px 0 4px.
  5. **Graphic card:**
     - radius **14px**, 1px hairline border, card surface;
     - padding **14px 16px**;
     - a column with a **10px gap**;
     - **auto height**, `overflow: hidden`.

**Small labels inside cards:** sans **10px**, uppercase, letter-spacing **1.4px**, accent.

**Graphics:**

- **Meditate:**
  - label "You ask";
  - the quote "“I want to manifest opening my new studio.”" in serif italic **15px**;
  - a 1px hairline;
  - label "You get";
  - a row with a **12px** gap:
    - a **40px** play circle in the primary button style, with a 13px play icon;
    - a column with a 2px gap: the title in serif **16px**, then the meta line in sans **12px**, muted.
- **Journal:**
  - label "Today's entry";
  - the quote in serif italic **15px**, line-height 1.45. Key phrases have a dotted accent underline with a 3px offset.
  - **A row of three bars** with a **12px** gap and 2px top padding. Each bar is flex 1, with a label in sans 12px and a **6px** pill bar under it (4px gap). The first bar's fill is accent; the others are muted.
  - "Turn into a meditation →" in sans **13px 600**, accent.
- **Manifest:**
  - label "Vision board";
  - **a row of four tiles:** **6px** gap, each flex 1, **height 44px**, radius **8px**, filled exactly like the desktop tiles;
  - the manifesto line in serif italic **15px**;
  - a 1px hairline;
  - the goal in serif **15px**;
  - the steps **inline, wrapping**, with a 4px row gap and a 14px column gap, sans **13px**: "● Price the first collection" (heading colour), "○ Find a studio space", "○ Open the online shop" (body colour).
- **Focus:** **one row**, items centred, with a **14px** gap:
  - a **64px progress ring** (4px stroke, accent arc on a muted track) with the time in serif **17px**;
  - a column with a **3px** gap:
    - the task in serif **16px**;
    - "From Manifest · step 1 of 3" in sans **12px**, muted;
    - "Distracting sites blocked" in sans **12px**, accent.
- **Chat:**
  - **User bubble:** right-aligned, max-width 82%, padding **9px 13px**, radius **12px 12px 4px 12px**, sans **14px**, line-height 1.4, in the same style as desktop's user bubble.
  - **Assistant bubble:** left-aligned, max-width 88%, the same padding and type, radius **12px 12px 12px 4px**, in desktop's assistant-bubble style.
  - **Pill** "▸ Start meditation": left-aligned, padding **6px 12px**, pill radius, 1px outline, sans **13px**.

## 6. Closing call to action
- **Section padding:** 44px top and bottom. Centred, in a column with a **14px gap**.
- **H2:** serif 400, **32px**, line-height 1.1.
- **Sub:** sans **15px**, body colour.
- **"Start free":** **height 52px**, **full width**, pill radius, sans **16px 600**, in the primary button style, with 6px top margin.

## Done when

- At 360px, a side-by-side comparison with `HomeMobile-360.png` matches: spacing, sizes, order and structure.
- At 320px, nothing is clipped and there's no horizontal scroll.
- Desktop and the footer are unchanged.
- Send me before and after screenshots at 360px and 320px, and list the files changed.
