# App dashboard: mobile layout

## Goal

Make the logged-in **dashboard** (the Vite app's home page) work on phones, **below the app's existing mobile breakpoint (`md`)**. Match `docs/design/app/DashboardMobile.dc.html` and `DashboardMobile-360.png` exactly. Desktop (`md` and up) stays unchanged.

- Use the **same cards, content and data as the current desktop dashboard**, in the same order. If a card on desktop isn't in the design, give it the same compact single-column treatment and tell me.
- The design uses sample data. Bind everything to the real data, exactly as desktop does.

## How to use the design file

`DashboardMobile.dc.html` is plain HTML with inline styles. **Read its source and port its structure**: the same elements, nesting, borders, radii, padding, gaps and font sizes.
- Ignore its `<helmet>`, `<x-dc>` and script wrappers.
- Treat the source as the source of truth for layout.

**Don't add anything the design doesn't have.** That means no extra wrappers, borders, backgrounds or shadows. Likewise, don't drop anything it does have (hairlines, labels, toggles, progress bars, the waveform).

## Colours

Don't take colours from the design file. Use the same tokens the desktop dashboard uses for each role: page background, card surface, card border, the dark "Ready when you are" card, header, accent, link and label text, primary button, and heading, body and muted text. This is a layout change only.

## Don't touch

Desktop (`md` and up). Also leave alone **the app header and the sidebar (and its mobile behaviour), which are already done**, as well as colour tokens, other pages, data fetching and logic. This prompt covers only the dashboard's page content. The header in the design file is only there for context.

## Layout (below `md`)

### Page
- **Main content:** a single column with a **22px** gap between blocks and 96px bottom padding (room for the Chat button).
- **Greeting block:** padding **24px 20px 8px**. Every other block has **16px** side padding.

### Greeting
A column with a **6px gap**:
- **H1** "Good afternoon, Alex.": serif 400, **28px**, line-height 1.15.
- **The manifesto line:** serif italic **15px**, line-height 1.45, body colour.
- **The "Becoming · …" pill:**
  - left-aligned, `max-width: 100%`, with 4px top margin;
  - padding **6px 12px**, pill radius, 1px card border, card surface;
  - sans **12px**, body colour;
  - **truncated to one line with an ellipsis.**

### Ready when you are (dark card)
- Radius **16px**, padding **16px**, a column with a **12px gap**.
- The label (sans 11px, uppercase, letter-spacing 1.4px, accent).
- **A row with a 14px gap:**
  - a **48px** play button in the primary style;
  - the title in serif **18px**, line-height 1.25, light text, wrapping;
  - the duration under it in sans 12px, muted light.
- **Waveform:** 3px bars with a 3px gap, 22px tall. The played part is accent and the rest is muted.

### Cards (Today, Meditate, Journal, Manifest)
Radius **14px**, 1px card border, card surface, padding **14px 16px**, a column with a **10px gap**.
- **Label row** (space-between, baseline aligned):
  - the label in sans **11px**, uppercase, letter-spacing 1.4px, weight 600, in the label colour;
  - on the right, the link or meta in sans 12px, muted.
- **Card H2** (Meditate, Journal, Manifest): serif 400, **21px**, line-height 1.2.
- **Rows:** padding **10px 0**, a 1px hairline between rows (none after the last).

**Today**
- The label row shows "Today · {date}" and "{n} of 3 done".
- **Each row:** an **18px** outline circle; then the title in sans **14px**, with the sub-line under it in sans **12px**, muted, **one line with an ellipsis**; and on the right the action ("Add →", "Play →", "Focus →") in sans **13px 600**, in the link colour, `nowrap`.

**Meditate**
- The label row, then the H2 "What do you need right now?".
- **Each row:** the title in sans **14px**, wrapping; "Recent" under it in 12px, muted; the duration on the right in sans **12px**, muted, `nowrap`.

**Journal**
- **The label row has the "Show previews" toggle on the right** (sans 12px, muted, with the existing switch at about 30×18).
- Then the H2 "How are you, really?".
- **Each row:** the title in sans **14px**, the date under it in 12px, muted, and the preview placeholder bar on the right (72×6px), as desktop does when previews are off.

**Manifest**
- The label row with "Open →", then the H2.
- **Vision board strip:** four tiles in a row, 6px gap, each flex 1, **40px** high, radius **8px**, showing the user's board, as desktop does.
- **Value chips** that wrap: padding 4px 10px, pill radius, 1px border, sans 12px.
- A hairline.
- **Life area rows.** Each row is a column with a 4px gap:
  - the area name in serif **16px**, with "{done} of {total} steps" on the right in 12px, muted;
  - the goal in sans **13px**, body colour;
  - a row with a **4px** progress bar (flex 1, accent fill), then "Next: {step} →" in sans **12px 600**, in the link colour, `nowrap`.

### Chat button
Keep the existing floating Chat button, **52px**, fixed **16px** from the right and **20px** from the bottom. It must not cover the last card's content (that's what the 96px bottom padding is for).

## Done when

- At 360px, the dashboard matches `DashboardMobile-360.png` in structure, spacing, sizes and order, with real data.
- At 320px, nothing is clipped and there's no horizontal scroll. Long titles wrap or truncate as specified.
- Desktop is unchanged.
- Send before and after screenshots at 360px, and list the files changed.
