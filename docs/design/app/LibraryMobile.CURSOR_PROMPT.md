# Meditate library: mobile layout

## Goal

Make the Meditate **Library** page (the Vite app) work on phones, **below the app's existing mobile breakpoint (`md`)**. Match `docs/design/app/LibraryMobile.dc.html` and `LibraryMobile-360.png` exactly. For Programs, match `ProgramsMobile.dc.html` / `ProgramsMobile-360.png` (list) and `ProgramMobile.dc.html` / `ProgramMobile-360.png` (detail). Desktop (`md` and up) stays unchanged.

- **Scope: all three tabs.**
  - **My creations and Community** share one list layout ("Top block" and "List" below).
  - **Programs** has two views: the programs list and a program's detail page (see "Programs").
- Use the **same tabs, controls, data and behaviour as the current desktop library**: tabs, Create, search, favourites, sort, category filter, date groups, items, ratings.
- The design uses sample data. Bind everything to the real data, exactly as desktop does.
- If the desktop library has something the design doesn't show, give it the same compact treatment and tell me.

## How to use the design file

The design files are plain HTML with inline styles. **Read its source and port its structure**: the same elements, nesting, borders, radii, padding, gaps and font sizes.
- Ignore its `<helmet>`, `<x-dc>` and script wrappers.
- Treat the source as the source of truth for layout.

**Don't add anything the design doesn't have.** No extra wrappers, cards, borders or shadows. Likewise, don't drop anything it has.

## Colours

Don't take colours from the design file. Use the same tokens the desktop library uses for each role: page background, card or row surface, borders, segmented-control track, selected tab, primary button, label text, tag background, stars, and heading, body and muted text. This is a layout change only.

## Don't touch

Desktop (`md` and up). Also leave alone **the app header, the sidebar (and its mobile behaviour) and the Chat button, which are already done**. The header in the design file is only there for context. Also leave colour tokens, other pages, data fetching and logic alone.

## Layout (below `md`)

### Top block
Padding **20px 16px 4px**, a column with a **14px gap**.

1. **Tabs** (My creations / Programs / Community): a segmented control, full width. On desktop the tabs sit in the header. **If your mobile header already shows them, don't duplicate them here.** Otherwise, render them at the top of the page, as in the design.
   - The track has padding **4px**, radius **14px**, and a 4px gap between segments.
   - Each segment is flex 1, centred, with padding **8px 4px**, radius **10px**, sans **14px**, `nowrap`.
   - The selected segment is on the card surface, with a 1px border, weight 600, heading colour. The others have body-coloured text and no surface.
2. **Title row** (space-between, items centred, 12px gap):
   - **H1** "A library for your inner life": serif 400, **24px**, line-height 1.15, wrapping;
   - **"+ Create":** the primary button style, **40px** high, padding 0 14px, sans **14px 600**, `nowrap`, `flex-shrink: 0`. It's the same action as desktop's "+ Create new".
3. **Search:** full width, **44px** high, radius **12px**, 1px border, card surface, padding 0 14px, a 16px search icon, 8px gap, sans **14px**. Placeholder: "Search title, description, type".
4. **Filter row:** one line that **scrolls horizontally** (bleeds to the screen edges with 16px inner padding, no visible scrollbar), with an 8px gap.
   - Pills: **34px** high, padding 0 12px, pill radius, 1px border, card surface, sans **13px**, `nowrap`.
   - The pills are: Favourites (toggle), Sort (shows the current value, e.g. "Newest ▾") and Category ("All categories ▾"). They use the same controls and options as desktop.

### List
- **Date group heading:** padding **18px 16px 6px**, sans **11px**, uppercase, letter-spacing 1.4px, weight 600, in the label colour. Use the same date grouping and labels as desktop.
- **Item rows:** **full-bleed rows, not cards**. Each row:
  - is a flex row with a **12px** gap and padding **12px 16px**, on the card surface;
  - has a 1px border on top, and on the bottom of a group's last row.
- **Each row contains:**
  - a **64×64** thumbnail, radius **10px**, `object-fit: cover`, using the meditation's image;
  - a column (flex 1, `min-width: 0`, 4px gap) with:
    - the title in serif **15px**, line-height 1.3, **clamped to 2 lines**;
    - a meta row (8px gap, sans 12px, muted): the duration, then the type tag (padding 2px 8px, pill radius, tag background, sans 11px);
    - the description in sans **13px**, line-height 1.45, body colour, **clamped to 2 lines**;
    - a footer row (space-between, sans 11px, muted): the date · creator on the left, and the star rating (small, 11px) on the right.
- Tapping a row opens the meditation, as on desktop.
- The list ends with **96px** of bottom padding, so the Chat button doesn't cover the last row.

### Programs

**Programs list**
- **Top block:** the tabs (same rule as above), then the title row: H1 "Guided courses, one lesson at a time" (serif **24px**, wrapping), with **"+ Create"** on the right, in the primary style, **40px** high. It's the same action as desktop's "+ Create new".
- **Course cards:** a column with a **12px** gap and 14px top padding, with 16px side padding.
  - **Each card:** radius **14px**, 1px border, card surface, padding **14px**, a column with a **10px gap**.
  - **Top row** (12px gap, items aligned to the top):
    - a **72×72** image, radius 10px, `object-fit: cover`;
    - a column with a 4px gap: the course title in serif **18px**, line-height 1.25, wrapping; then "{n} lessons" in sans 12px, muted.
  - **Description:** sans **13px**, line-height 1.5, body colour, **clamped to 3 lines**.
  - **Buttons:** a row with an 8px gap. Each button is flex 1, **38px** high, pill, padding 0 8px, sans **12px 600**, `nowrap`.
    - "Explore course →" is in the primary style.
    - "Make it your own" is the secondary or outline style: card surface, 1px border, no icon on mobile.

**Program detail**
- **Top block:** padding 20px 16px 8px, a column with a **12px** gap:
  - the tabs (same rule as above);
  - "← All programs" in sans **13px 600**, body colour;
  - the **H1** (the program title): serif 400, **26px**, line-height 1.15;
  - **Description:** sans **14px**, line-height 1.55, body colour, **clamped to 4 lines**, with a "Read more" link (sans 13px 600, in the link colour) that expands it in place;
  - **A row** (space-between, items centred): "{n} lessons" in sans 12px, muted, and **"✦ Make it your own"** in the primary style, **40px** high.
- **Lessons:** the same full-bleed row as the My creations list items, after an 8px gap, but **without date-group headings and without the date · creator line**. The stars stay, aligned right.
  - The program tag in each row is truncated with an ellipsis if it's long (max about 140px).

## Done when

- At 360px, My creations and Community match `LibraryMobile-360.png`, and Programs matches `ProgramsMobile-360.png` and `ProgramMobile-360.png` in structure, spacing, sizes and order, with real data.
- At 320px, nothing is clipped and there's no horizontal page scroll. Only the filter row scrolls sideways.
- Every desktop control still works on mobile.
- Desktop, the header, the sidebar and the Chat button are unchanged.
- Send before and after screenshots at 360px, and list the files changed.
