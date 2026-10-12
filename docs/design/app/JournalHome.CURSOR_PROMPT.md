# Journal overview page (`/journal`)

## Scope

Add a new overview page at **`/journal`**, a mini summary of the Journal area. If `/journal` currently redirects to the entries page, it now renders this overview instead.

Also add Journal guides (section 6).

**Don't touch:**
- the Journal entries page and editor, Gratitudes, or Insights;
- the app dashboard and the Meditate pages;
- other pages;
- colour tokens.

## Reference

`docs/design/app/JournalHome.dc.html` and `JournalHome.png`.
- **Top row:** desktop and mobile, with content.
- **Bottom row:** desktop and mobile empty state (no entries, no insights).

Port the structure and px from the HTML source. Ignore the board titles and sample content; bind everything to real data.

## Colours and icons

**Colours:** use the existing tokens by role:
- card surface and card border, label/accent text, heading, body and muted text;
- the accent tint and light-accent border (New tile, gratitude slots);
- the primary and outline button styles;
- the primary play-circle style for the round + on the New tile;
- the **existing mood tag styles** (Calm, Good, Mixed, Low, Heavy) for mood tags and mood squares;
- the existing life-area tag style.

**Icons:** use the app's standard icons. Wherever the design shows "›", use the standard chevron-right at its standard size. Use the gratitude slot icons the Gratitudes page already uses.

## Layout

- Use the app's **existing default content area** (as on the Library page) and the existing page padding.
- The page is a column with a **28px** section gap (mobile **22px**, padding 16px).
- **Section heading row:** serif **22px** title (mobile 20px), with an optional link on the right: 14px, 600, label colour, plus the standard chevron-right. **12px** bottom margin.
- Render a visually hidden `<h1>Journal</h1>`.

**Navigation**
- The sidebar's **"Journal"** parent item links to `/journal` and shows the active state there. No child is active.
- The header shows the Journal wordmark, and the breadcrumb label is "**Overview**", using the existing pattern.
- No tabs on this page.

## 1. Recent entries (only when the user has at least one entry)

**Heading:** "Recent entries", with the link "All entries" going to the entries page.

**Desktop grid:** `repeat(4, minmax(0,1fr))`, **14px** gap.

**First cell: the New entry tile** (opens a new entry)
- Dashed **1.5px** light-accent border, accent tint, radius **14px**, centred, min-height **150px**.
- **Contents:**
  - a **48px** primary circle with the standard plus;
  - "New entry" in serif **18px**;
  - "Write or speak" in 12px, muted.

**Then the 3 most recent entries**
- **Card:** card surface, 1px border, radius **14px**, padding **14px 16px**, a column with an **8px** gap, min-height **150px**.
- **Contents:**
  - the title: 15px, 600;
  - the excerpt: 13px, line-height 1.5, body colour, clamped to **3 lines**;
  - the footer (`margin-top: auto`, 1px top border, padding-top **8px**, 12px muted): the date, then right-aligned the life-area tag (if any) and the mood tag (if any).
- **Click:** clicking opens the entry.

**Mobile:** one card holding a list.
- **First row:** "New entry", padding **12px 14px**, accent tint. It has a **36px** primary circle, "New entry" in serif 16px, and "Write or speak" right-aligned.
- **Entry rows:** padding **12px 14px**, 1px top border, **5px** gap.
  - title (14px, 600, flex 1) and the mood tag on the right;
  - the excerpt (12px, 2 lines);
  - the date (11px, muted).

## 2. Today's gratitudes (always shown)

**Card:** padding **16px 18px**, **12px** gap.

**Header row** (baseline-aligned, **10px** gap):
- "Today's gratitudes" in serif **19px**;
- "{n} of 3" in 13px, muted;
- right-aligned, "Gratitudes" plus the standard chevron. On mobile it reads "Open".

**Three slots**
- **Layout:** in a row with a **10px** gap on desktop; stacked with an **8px** gap on mobile.
- **Slot:** flex 1, padding **10px 12px**, radius **12px**, **10px** gap.
  - a **30px** round icon, using the Gratitudes page's icons and its fill;
  - the text in 14px.
- **Empty slot:** page background, a 1px **dashed** light-accent border, and the placeholder "I'm grateful for…" in muted text.
- **Filled slot:** card surface, a 1px solid border, and the text in heading colour.

**Behaviour:** the slots are **inline inputs**.
- They write to today's gratitude record, the same data as the Gratitudes page, and save on blur or Enter.
- "{n} of 3" updates as you type.

## 3. Insights (only when at least one insights period exists)

**Heading:** "Insights" (on mobile, with the link "All").

**Desktop card:** a grid of `minmax(0,1.3fr) minmax(0,1fr)`, **24px** gap, padding **18px 20px**.

**Left column** (**8px** gap):
- "Latest insights · {range}" in 10px uppercase label style;
- the opening of the latest letter in italic serif **19px**, line-height 1.45, ending with "…";
- "From {n} entries and {m} meditations" in 13px, muted;
- buttons: "Read your letter" (primary, 38px), which opens that insights period, and "All insights" (outline, 38px).

**Right column:** a 1px left border, **24px** left padding, **10px** gap.
- "How the week felt" in 13px, 600;
- a row of 7 day squares, **8px** gap. Each square is **40×28**, radius **8px**, filled with that day's mood tag colour. Days with no mood get a 1px dashed light-accent outline. A day label sits under each, in 11px muted;
- the period's one-line summary in 13px, body colour.

**Mobile:** stacked, padding **14px**.
- the label;
- the quote in italic serif 16px;
- the 7 squares (**36px** wide) spread across the width;
- "Read your letter" full width, 40px.

## 4. Guides

**Heading:** "Guides", with the link "All guides" (on mobile, "All") going to `/journal/guides`.

Use the same card grid (desktop) and list (mobile) as the Meditate overview's Guides. Show the first 4 Journal guides.

## 5. Empty state (no entries **and** no insights)

**Replaces Recent entries:** a welcome card.

**Desktop**
- **Layout:** a grid of `minmax(0,1fr) 360px`, min-height **300px**, overflow hidden. The right column is a full-bleed image, using existing journal imagery.
- **Left column:** padding **32px 36px**, **14px** gap, vertically centred.
  - "Your journal" in 10px uppercase label style;
  - "**Start where you are.**" in serif **34px**, line-height 1.15;
  - "A few honest lines is plenty. Write it down, or just talk it out, and it'll start shaping your insights and meditations." in 16px, line-height 1.55, body colour, max-width **520px**;
  - buttons:
    - "**Start writing**" (primary, 44px), which opens a new entry;
    - "**Talk it out**" (outline, 44px, with the standard mic icon), which opens a new entry with voice dictation started, using the editor's existing mic;
  - "Or begin with a prompt" in 12px, muted, then 3 prompt chips. Each chip is **36px**, pill, 1px border, card surface, 13px, prefixed with ✦ in the label colour. The prompts are:
    - "What's taking up space in your head?"
    - "One thing that went well today"
    - "What would make tomorrow easier?"
    - Clicking one opens a new entry with that prompt as the title, or as a placeholder line if the editor has no title field.

**Mobile**
- The image on top, **150px** high.
- Then padding **18px 16px**: the heading in serif **26px**; the shorter copy, "A few honest lines is plenty. Write it down, or just talk it out."; "Start writing" (flex 1) and "Talk" (outline); then the prompts as stacked full-width chips that wrap.

**Rest of the page:** Today's gratitudes as normal (it reads "0 of 3"), then **Guides directly after it**, because Insights is hidden.

**Mixed cases:** once there's at least one entry, use the normal layout. Insights stays hidden until a period exists.

## 6. Journal guides

Reuse the guides content module and routes from the Meditate overview.
- **Content field:** if it exists, add `area: 'meditate' | 'journal'` to the front-matter. If it doesn't exist yet, create it as specified there, with this field included.
- **Routes:** `/journal/guides` (index) and `/journal/guides/:slug` (reader), with the same layouts as the Meditate versions, filtered by `area`.
- **Placeholder guides:** add four, each with `draft: true` and placeholder body text:
  1. "Why writing things down helps": Basics, 4 min.
  2. "Prompts for when you're stuck": Practice, 5 min.
  3. "Gratitude without forcing it": Gratitude, 4 min.
  4. "Reading your weekly insights": Insights, 3 min.
