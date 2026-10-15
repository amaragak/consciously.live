# Manifest: Manifesto page + Manifest guides

## Scope

1. **Manifesto page**: rebuild the content area of the Manifesto page (Manifest › Manifesto) to the design. Keep all existing data, saving and editing behaviour; this is a layout and presentation change.
2. **Guides on the Manifesto page**: a new Guides section, plus guide links in two empty states.
3. **Manifest guides**: extend the existing database-backed Guides (reader, admin, data) to a third area, `manifest`.

**Don't touch:**
- the sidebar, the header and other Manifest pages (Vision board, Life area pages), except where listed;
- the Meditate and Journal guides, beyond what's needed to add the area;
- colour tokens.

## Reference

- `docs/design/app/ManifestApp.dc.html` and `ManifestApp.png`: the full page, desktop.
- `docs/design/app/ManifestGuides.dc.html` and `ManifestGuides.png`:
  - **top:** the page from Your life areas down, with the Guides section and a life area with no goal;
  - **bottom left:** the empty manifesto state;
  - **bottom right:** the Manifest practice cards for the guide reader.

Port the structure and px from the HTML source. Ignore the board titles, the dark "Context link", "New section" and "practiceAction" labels, and the sample content; bind everything to real data. Use the app's existing default content area and page padding.

## Colours and icons

**Colours:** use the existing tokens by role:
- card surface and card border, heading, body and muted text, label/accent text;
- accent (the goal progress fill, the left rule on answered questions);
- accent tint and light-accent border (the This month strip, the empty manifesto background, the dashed tiles);
- the progress track colour already used for progress bars;
- the primary and outline button styles, and the existing light-on-image text and outline treatment for the hero;
- the hero image overlay: the navy tint the app already uses for overlays on imagery.

**Icons:** use the app's standard icons (plus, edit, search, Focus, Meditate, book for guide links). Wherever the design shows "→", "›" or "‹", use the app's standard chevron at its standard size.

## 1. Manifesto page layout

The page is one column, in this order:
1. the vision hero;
2. Your life areas;
3. the manifesto card (values, questions, quotes);
4. This month;
5. Guides.

**Section header** (Your life areas, Guides, and inside the manifesto card)
- Left: the label in 12px, uppercase, letter-spacing 1.6px, 600, label colour, with an optional subline under it (14px, body colour, **4px** gap).
- Right: an optional action link (13px, 600, label colour), e.g. "+ Add life area" with the standard plus at 13px.
- Bottom-aligned, **16px** gap.

### 1.1 Vision hero

- **Height:** **400px**, radius **12px**.
- **Background:** the user's vision board images in a **4 × 2** grid with a **10px** gap, each tile radius 12px, cover-fit. Take the first 7 images, in vision board order.
- **Add image tile:** the 8th cell is an "Add image" tile (dashed 1.5px light-accent border, page background, the standard plus at 18px, "Add image" in 13px 600 label colour). It sits above the overlay so it isn't darkened. Show it only when the board has fewer than 8 images; otherwise the 8th cell is the 8th image.
- **Overlay:** over the images, a flat navy tint at about 30%, plus a radial navy shade centred behind the text (about 62% at the centre, fading out by 75%), as in the source.
- **Content** (centred, a column with a **22px** gap, side padding **140px**):
  - "My manifesto" in 11px, uppercase, letter-spacing 1.8px, 600, light accent;
  - the manifesto statement in italic serif **30px**, line-height 1.35, white, with a soft text shadow, in curly quotes;
  - buttons, **10px** gap:
    - "**Open vision board**" with a chevron-right: **44px**, padding 0 18px, a pill with a 1px white border at about 70% and a faint navy fill, white text. It goes to the Vision board page.
    - "**✦ Meditate on this**": primary. It uses the existing "Meditate on this" behaviour.
- **Edit:** a **34px** round button at the top right (**14px** from the top and right edges), white at about 85%, with the standard edit icon at 14px in heading colour. It edits the statement, using the existing edit behaviour.

**Empty manifesto** (no statement **and** no images)
- **Container:** the same 400px hero, with an accent tint background, a 1px border and radius 14px. The 8 tiles become dashed 1.5px light-accent outlines on a faint white fill, with a **16px** inset and a **10px** gap.
- **Centred card on top:** card surface, 1px border, radius **16px**, padding **24px 28px**, `max-width: 440px`, a soft shadow, a centred column with a **12px** gap:
  - "My manifesto" in the 11px label style, label colour;
  - "**Write the sentence you want to grow into.**" in serif **24px**, line-height 1.3;
  - buttons, **10px** gap: "**Write my statement**" (primary, 42px), which opens the statement editor, and "**Add images**" (outline, 42px), which goes to the Vision board;
  - the guide link (section 3).
- **Partly filled:** with only images, show the normal hero, with "Write the sentence you want to grow into." as the statement in the same style plus the edit button. With only a statement, show the normal hero over the dashed tiles.

### 1.2 Your life areas

- **Header:** "Your life areas", the subline "The areas of your life you want to grow.", and "+ Add life area" on the right. That link uses the existing add flow.
- **Spacing:** **36px** above the section, **16px** between the header and the grid.
- **Grid:** `repeat(4, minmax(0, 1fr))`, **14px** gap.

**Life area card** (card surface, 1px border, radius **16px**, padding **18px 18px 14px**, a column with a **12px** gap, soft card shadow). The whole card opens that life area.
1. **Name and vision:** the name in serif **22px**, then the area's vision/dream in 13px, line-height 1.45, body colour, clamped to 2 lines, min-height **38px**. **4px** gap.
2. A 1px divider.
3. **Current goal** (**6px** gap):
   - "Current goal" in 10px, uppercase, letter-spacing 1.4px, 600, muted;
   - the goal title in 14px, 600;
   - a progress row (**8px** gap): a **5px** track with an accent fill (steps done ÷ total), then "{done} of {total}" in 12px muted;
   - "**Next:** {next step}" with a chevron-right in 13px, 600, label colour, one line with an ellipsis. It opens that step.
4. **Footer** (**6px** gap, 2px top margin):
   - "**Focus**" and "**Meditate**" as **30px** outline pills (padding 0 10px, 12px, 600, the standard Focus and Meditate icons at 13px). They use the existing Focus and Meditate actions for that area;
   - right-aligned, the last activity in 12px muted: "Today", or a short date such as "9 Sept". When there's been no activity for **3 weeks or more**, show "{n} wks quiet" in label colour, 600, instead.

**Life area with no current goal**
- In the goal block, show "No goal yet" in 14px muted, then "**+ Set a goal**" (13px, 600, label colour), which opens that area's Goals tab with a new goal started. **8px** gap.
- **Footer:** replace Focus/Meditate and the date with the guide link (section 3). It sits at the bottom (`margin-top: auto`) with a 1px top border and **10px** top padding.

### 1.3 Manifesto card

- **Container:** **28px** above it, card surface, 1px border, radius **18px**, padding **28px 32px**, a 2-column grid (`1fr 1fr`) with a **48px** gap.
- **Left column** (**28px** gap between groups; inside each group, the header then the content with a **10px** gap):
  - **Values:** header "Values" with "+ Add". The values sit in a 2-column grid with a **24px** column gap. Each value row has padding **8px 0**, a 1px bottom border, and a **12px** gap: the number ("01", "02"…) in 12px muted with a fixed **18px** width, then the value in serif **20px**.
  - **Questions to yourself:** header with "+ Add". Each question has padding **12px 0 12px 16px**, a 2px left border, and a **6px** gap: the question in serif **18px**, then:
    - **answered:** the answer in 14px, line-height 1.5, body colour, with an **accent** left border;
    - **unanswered:** "Add your answer" with a chevron-right (13px, 600, label colour), with a **border-colour** left border. It opens the answer editor.
- **Right column** (**14px** gap):
  - **Quotes:** header "Quotes" with "+ Add". Each quote has padding-bottom **18px**, a 1px bottom border, and an **8px** gap: the quote in italic serif **19px**, line-height 1.45, in curly quotes, then "— {source}" in 13px muted, shown only if there is a source.
- **Behaviour:** the "+ Add" links and editing use the existing behaviour for each list.

### 1.4 This month

- **Container:** **24px** above it, padding **20px 24px**, accent tint, a 1px light-accent border, radius **16px**, a row with items centred.
- **Left** (min-width **200px**, padding-right **20px**, **4px** gap): "This month" in the 12px label style, then "**See insights**" with a chevron-right (14px, 600, label colour), which goes to Manifest insights.
- **Then three stats**, each `flex: 1`, padding **0 20px**, a 1px left border, **4px** gap:
  - the label in 10px, uppercase, letter-spacing 1.4px, 600, muted;
  - the value in serif **24px**;
  - the subline in 12px, body colour.
- **The stats** come from the existing insights data for the current month:
  - **Pace:** steps per week, with the change from last month;
  - **Done:** steps completed, "across {n} life areas";
  - **Sentiment:** the overall sentiment, with the per-area note.
- **Visibility:** if a stat has no data, hide it. If none have data, hide the whole strip.

### 1.5 Guides (new)

- **Spacing:** **32px** above, **40px** below.
- **Header:** "Guides", with the subline "Short reads on vision, goals and following through." and "**All guides**" with a chevron-right on the right, which goes to `/manifest/guides`.
- **Grid:** the same guide card grid as the Meditate overview's Guides (4 columns, **14px** gap). Show the first 4 published Manifest guides by `order`.
- **No guides published:** hide the section.

### 1.6 Narrower screens

Use the existing breakpoints only:
- **Life area grid:** 4 columns at `xl`, 2 columns from `sm` to `xl`, 1 below `sm`.
- **Below `md`:**
  - the manifesto card becomes a single column;
  - This month stacks: the label row, then each stat with a top border instead of a left border;
  - Guides uses the same mobile list as the Meditate overview's Guides;
  - the hero tiles become **2 × 2**, with the statement at serif **22px** and side padding **20px**, and the buttons wrap.

## 2. Guides: the `manifest` area

- **Data:** add `'manifest'` to the Guide `area` values. Slugs stay unique per area.
- **Routes:** `/manifest/guides` (index) and `/manifest/guides/:slug` (reader), with the same layouts as Meditate and Journal. The sidebar parent active state is Manifest.
- **Admin:**
  - add **Manifest** to the area select and the list filters (All, Meditate, Journal, Manifest);
  - add a **Practice action** select, shown only when the area is Manifest: "Add to a life area" (`lifeArea`) or "Make a meditation" (`create`), defaulting to `lifeArea`. Store it as `practiceAction` (nullable; ignored for other areas).
- **Placeholder guides:** add four Manifest guides as drafts, with placeholder body text:
  1. "Writing a vision that pulls you forward": Vision, 5 min;
  2. "Goals you'll actually keep": Goals, 6 min;
  3. "Making a vision board that works": Vision board, 4 min;
  4. "When a life area goes quiet": Practice, 3 min.
- **Slugs for links:** the guide links in section 3 point to guides 1 and 2. Look them up by slug, and hide a link if its guide isn't published.

## 3. Guide links in context

**Style:** an inline link with a **6px** gap: the standard book icon at 14px, the guide title in 13px, 600, label colour, then the standard chevron-right. It opens the guide reader.

**Where they appear:**
- **Life area with no current goal** (1.2): links to "Goals you'll actually keep".
- **Empty manifesto** (1.1): links to "How to write a vision that pulls you forward", i.e. guide 1. Its link text is "How to write a vision that pulls you forward", not the guide title.

These are the only two places. Don't add guide links elsewhere.

## 4. Guide reader: the Manifest practice card

For `area: 'manifest'` guides with a `practiceBrief`, the "Put it into practice" card (in the rail, and the end-of-article card on mobile) keeps the existing layout, with the title from the first line of `practiceBrief` and the description from the rest. The button depends on `practiceAction`:

**`lifeArea`:** "**Add to a life area**" (primary, full width, 40px; 44px on mobile).
- Clicking it opens a picker anchored under the button: **300px** wide, card surface, 1px border, radius **14px**, padding **8px**, a soft shadow, **2px** gap.
  - "Add to which life area?" in the 10px uppercase muted label style, padding **6px 12px 4px**;
  - one row per life area: padding **9px 12px**, radius 10px, with the name in 14px 600 and "Goal: {current goal}" or "No goal yet" in 12px muted. The hovered or focused row gets the accent tint and a chevron-right;
  - a footer with a 1px top border, padding **10px 12px 4px**: "+ New life area" (13px, 600, label colour), which uses the existing add flow and then continues.
- Picking an area opens that area's **Goals tab** with a new goal **drafted** from `practiceBrief`, using the existing new-goal form. Nothing is saved until the user confirms.

**`create`:** "**✦ Make a meditation for this**" (primary, full width).
- It opens Create with the brief pre-filled from `practiceBrief` and the manifesto attached as context, the same way the existing "Meditate on this" does.
