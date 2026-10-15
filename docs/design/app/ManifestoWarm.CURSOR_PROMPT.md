# Manifest: Manifesto page update + Manifest guides

## Scope

Update the **current Manifesto page** (Manifest › Manifesto) to the design, and add Manifest guides. This is a delta from what's there now. Keep all existing data, saving, editing and behaviour unless it's listed below.

**Don't touch:**
- the sidebar, the header and other Manifest pages (Vision board, Life area pages);
- the Meditate and Journal guides, beyond what's needed to add the area;
- colour tokens.

## Reference

- `docs/design/app/ManifestoWarm.dc.html` and `ManifestoWarm.png`: the full page, desktop.
- `docs/design/app/ManifestGuides.dc.html` and `ManifestGuides.png`: use **only the bottom row**, i.e. the empty manifesto state (left) and the guide reader practice cards (right). Ignore its top frame; ManifestoWarm supersedes it.

Port the structure and px from the HTML source. Ignore the board titles, the dark annotation pills and the sample content. Keep the app's existing default content area and page padding.

## Colours and icons

**Colours:** use the existing tokens by role:
- card surface and card border, heading, body and muted text, label/accent text;
- accent (progress fills, value numbers, answered-question rules);
- light accent (unanswered-question rules);
- accent tint and light-accent border (This month);
- the primary and outline button styles.

**Surfaces to keep:**
- the **life area card tints** the page already uses;
- the **ivory band** the Values and Questions sections already use;
- the **warm band** the quotes section already uses.

**Icons:** use the app's standard icons (plus, edit, Focus, Meditate, book). Wherever the design shows "→", "›" or "‹", use the app's standard chevron at its standard size.

## 1. Section titles (all sections except the hero)

Replace the current uppercase section labels ("YOUR LIFE AREAS", "VALUES", "MEANINGFUL QUOTES", "QUESTIONS TO YOURSELF") with:

**Layout:** a row, bottom-aligned, **16px** gap.
- **Left** (a column, **6px** gap):
  - the title in serif **30px**, line-height 1.15, heading colour;
  - the subline in **15px**, body colour.
- **Right:** an optional control (see each section).

**Copy**

| Section | Title | Subline |
|---|---|---|
| Life areas | Your life areas | The areas of your life you want to grow. |
| Values | Values | What you want your choices to come from. |
| Quotes | Quotes | Words you want to keep close. |
| Questions | Questions to yourself | Come back to these when things feel noisy. |
| Guides | Guides | Short reads on vision, goals and following through. |

**Remove** the collapse chevrons from Values, Quotes and Questions. The sections are always expanded.

## 2. Hero

Keep the image grid, its size and position, the image behaviour and the hero's **existing controls exactly as they are**, including the edit button for the vision board background and any refresh button. Change only the following.

1. **Overlay:** remove the dark rectangular box behind the statement. Replace it with a flat navy tint over the whole grid (about 30%), plus a radial navy shade centred behind the text (about 62% at the centre, fading out by 75%). Use the overlay colour the app already uses on imagery.
2. **Content** (centred, a column with a **22px** gap):
   - Add "**My manifesto**" above the statement: 11px, uppercase, letter-spacing 1.8px, 600, light accent.
   - The statement stays as it is: italic serif, white, in curly quotes, with a soft text shadow.
   - **Buttons** (**10px** gap):
     - "**Open vision board**": keep it, with a standard chevron-right. Style it as a **44px** pill with a 1px white border at about 70%, a faint navy fill and white text.
     - Add "**✦ Meditate on this**" next to it: primary, 44px. It opens Create with the manifesto statement pre-filled as the brief and the manifesto attached as context. If the app already has a "Meditate on this" for the manifesto, reuse it.
3. **Empty image slots:** the first empty slot becomes an "**Add image**" tile:
   - dashed 1.5px light-accent border, page background, radius 12px;
   - the standard plus at 18px, then "Add image" in 13px, 600, label colour;
   - it sits **above** the overlay so it isn't darkened;
   - clicking it uses the existing add-image flow.

   Any further empty slots stay as they are now.

**Empty manifesto** (no statement **and** no images; see the ManifestGuides bottom-left panel)
- The 8 slots become dashed 1.5px light-accent outlines on a faint white fill, on an accent-tint background.
- **Centred card:** card surface, 1px border, radius **16px**, padding **24px 28px**, `max-width: 440px`, a soft shadow, a centred column with a **12px** gap:
  - "My manifesto" in the 11px label style, label colour;
  - "**Write the sentence you want to grow into.**" in serif **24px**, line-height 1.3;
  - buttons, **10px** gap: "**Write my statement**" (primary, 42px), which uses the existing statement editing, and "**Add images**" (outline, 42px), which goes to the Vision board;
  - the guide link (section 8).

## 3. Your life areas

- **Spacing:** padding **40px** top and **44px** bottom. **20px** between the header and the grid.
- **Header right:** "**+ Add life area**" as a link (14px, 600, label colour, the standard plus at 14px). It uses the existing add flow. **Remove** the centred "+ Add new life area" button under the grid.
- **Grid:** keep the current 4-column grid, with a **14px** gap.

**Card**

Keep the existing tint per area. Container: radius **16px**, padding **20px**, a column with a **14px** gap, and a soft shadow. There's no min-height: cards in a row stretch to the tallest card, which is the grid default. The whole card opens that life area.

1. **Name and vision** (**8px** gap):
   - **name row:** baseline-aligned, space-between, **10px** gap:
     - the name in serif **26px**, line-height 1.15;
     - the **activity meta** on the right (see below);
   - the vision in **14px**, line-height 1.5, body colour, clamped to **3 lines**.
2. **Goal panel** (only when the area has a current goal):
   - **Container:** white at about **62%** opacity over the tint, radius **12px**, padding **12px 14px**, a column with a **7px** gap.
   - **Contents:**
     - "Current goal" in 10px, uppercase, letter-spacing 1.4px, 600, label colour;
     - the goal title in 14px, 600, line-height 1.35;
     - a progress row (**8px** gap): a **5px** track (heading colour at about 10%) with an accent fill for steps done ÷ total, then "{done} of {total}" in 12px, body colour;
     - "**Next:** {next step}" with a chevron-right, in 13px, 600, label colour, one line with an ellipsis. It opens that step.
   **Without a current goal,** show an empty goal panel in its place:
   - **Container:** a dashed 1.5px border in white at about 90%, white at about 28% fill, radius **12px**, padding **12px 14px**, a column with an **8px** gap, items aligned to the start, and **`flex: 1`**, so it fills the card's remaining height and leaves no dead space.
   - **Contents:**
     - "Current goal" in the same label style;
     - "Nothing set yet. What would move {area name} forward?" in 13px, line-height 1.45, body colour;
     - "**+ Set a goal**": a **32px** pill, padding 0 13px, white at about 75%, 13px, 600, with the standard plus at 13px. It's pinned to the bottom of the panel (`margin-top: auto`) and opens that area's Goals tab with a new goal started.
3. **Footer** (with a goal only, `margin-top: auto`, a wrapping row with a **6px** gap):
   - "**Focus**" and "**Meditate**" pills: **30px**, padding 0 11px, white at about 60%, 12px, 600, with the standard icons at 13px. They use the existing Focus and Meditate actions for that area.

**Activity meta** (in the name row): 12px, heading colour at about 55%, no wrapping.
- It shows the short date of the last activity, e.g. "9 Sept", replacing "Last interacted on 9 Sept 2026". Show the year only if it's not the current year.
- After **3 weeks or more** with no activity, it reads "**{n} wks quiet**" in label colour, 600.

## 4. Values (ivory band)

**Band:** keep the full-width band and its colour. Add a 1px top border. Padding **48px** top and **52px** bottom, a column with a **24px** gap.

**Header right:** an "**Edit**" pill: **34px**, padding 0 14px, outline style, the standard edit icon at 13px, 13px, 600. It opens the existing editing for values (reorder, rename, delete).

**List**
- A 2-column grid, column gap **48px**, row gap **14px**, filled row by row.
- **Each value** (baseline-aligned, **16px** gap):
  - the number ("01", "02"…) in 13px, 600, accent, tabular, **22px** wide;
  - the value in serif **34px**, line-height 1.2, heading colour.
- **No rules** between rows.
- **Last cell:** "**+ Add a value**" (14px, 600, label colour, the standard plus at 14px), indented to line up with the value text. It uses the existing add flow.

**Remove** the centred "+ Add a value" button.

## 5. Quotes (warm band)

**Band:** keep the full-width band and its colour. Use the same border, padding and gap as Values.

**Header right:** the Edit pill, for quotes.

**List**
- A 2-column grid, column gap **56px**, row gap **36px**.
- **Each quote** (a column, **10px** gap):
  - the quote in italic serif **26px**, line-height 1.4, heading colour, in curly quotes;
  - "— {source}" **directly under it** in 14px, 600, label colour. It's no longer right-aligned, and it's hidden when there's no source.
- **Last item:** "+ Add a quote", in the same style as "+ Add a value".

**Remove** the centred add button.

## 6. Questions to yourself (ivory band)

**Band:** the same as Values.

**Header right:** the Edit pill, for questions.

**List**
- A 2-column grid, column gap **56px**, row gap **28px**.
- **Each question** (padding **4px 0 4px 20px**, a **3px** left border, a column with an **8px** gap):
  - the question in serif **24px**, line-height 1.3;
  - **answered:** the answer in 16px, line-height 1.6, body colour, with an **accent** left border;
  - **unanswered:** "**Add your answer**" with a chevron-right (14px, 600, label colour), with a **light-accent** left border. It uses the existing answer flow.
- **Last item:** "+ Add a question", in the same style as "+ Add a value".

**Remove** the centred add button.

## 7. Showing the Edit and Add controls

- **Pointer devices:** within Values, Quotes and Questions, the Edit pill and the "+ Add …" item show **only while the band is hovered or has focus inside it** (`:hover` / `:focus-within`). Fade them in and out over about 150ms.
- **Touch** (`@media (hover: none)`): always show them.
- **Empty list:** always show the "+ Add …" item, on any device.
- **Accessibility:** they stay in the tab order, so keyboard users get them through `:focus-within`.

## 8. Guide link (empty manifesto only)

**Style:** an inline link with a **6px** gap: the standard book icon at 14px, the text in 13px, 600, label colour, then a chevron-right.

**Use:** in the empty manifesto card (section 2), it reads "**How to write a vision that pulls you forward**" and opens the guide "Writing a vision that pulls you forward". Look the guide up by slug, and hide the link if that guide isn't published.

## 9. This month (new, after Questions)

- **Container:** **40px** above it, padding **20px 24px**, accent tint, a 1px light-accent border, radius **16px**, a row with items centred.
- **Left** (min-width **200px**, padding-right **20px**, **4px** gap): "This month" in 12px, uppercase, letter-spacing 1.6px, 600, label colour, then "**See insights**" with a chevron-right (14px, 600, label colour), which goes to Manifest insights.
- **Then three stats**, each `flex: 1`, padding **0 20px**, a 1px left border, **4px** gap:
  - the label in 10px, uppercase, letter-spacing 1.4px, 600, muted;
  - the value in serif **24px**;
  - the subline in 12px, body colour.
- **The stats** come from the existing insights data for the current month:
  - **Pace:** steps per week, with the change from last month;
  - **Done:** steps completed, "across {n} life areas";
  - **Sentiment:** the overall sentiment, with the per-area note.
- **Visibility:** hide any stat without data, and hide the strip if none have data.

## 10. Guides (new, last)

- **Spacing:** padding **40px** top and **48px** bottom. **20px** between the header and the grid.
- **Header right:** "**All guides**" with a chevron-right (14px, 600, label colour), which goes to `/manifest/guides`.
- **Grid:** the same guide card grid as the Meditate overview's Guides. Show the first 4 published Manifest guides by `order`.
- **No guides published:** hide the section.

## 11. Narrower screens

Use the existing breakpoints only:
- **Life area grid:** keep its current responsive behaviour.
- **Below `md`:**
  - Values, Quotes and Questions become single-column;
  - section titles go to serif **24px**;
  - value text goes to serif **28px**, quotes to **21px**, and questions to **20px**;
  - This month stacks: the label row, then each stat with a top border instead of a left border;
  - Guides uses the Meditate overview's mobile guide list;
  - in the hero, the statement shrinks as it does now, and the buttons wrap.

## 12. Guides: the `manifest` area

- **Data:** add `'manifest'` to the Guide `area` values. Slugs stay unique per area.
- **Routes:** `/manifest/guides` (index) and `/manifest/guides/:slug` (reader), with the same layouts as Meditate and Journal. The sidebar parent active state is Manifest.
- **Admin:**
  - add **Manifest** to the area select and the list filters (All, Meditate, Journal, Manifest);
  - add a **Practice action** select, shown only when the area is Manifest: "Add to a life area" (`lifeArea`) or "Make a meditation" (`create`), defaulting to `lifeArea`. Store it as `practiceAction` (nullable).
- **Placeholder guides:** add four Manifest guides as drafts, with placeholder body text:
  1. "Writing a vision that pulls you forward" (slug `writing-a-vision`): Vision, 5 min;
  2. "Goals you'll actually keep": Goals, 6 min;
  3. "Making a vision board that works": Vision board, 4 min;
  4. "When a life area goes quiet": Practice, 3 min.

## 13. Guide reader: the Manifest practice card

For `area: 'manifest'` guides with a `practiceBrief`, the "Put it into practice" card (rail, and the end-of-article card on mobile) keeps its layout. The button depends on `practiceAction`:

**`lifeArea`:** "**Add to a life area**" (primary, full width, 40px; 44px on mobile).
- Clicking it opens a picker under the button: **300px** wide, card surface, 1px border, radius **14px**, padding **8px**, a soft shadow, **2px** gap.
  - "Add to which life area?" in the 10px uppercase muted label style, padding **6px 12px 4px**;
  - one row per life area: padding **9px 12px**, radius 10px, with the name in 14px 600 and "Goal: {current goal}" or "No goal yet" in 12px muted. Hover and focus give the row the accent tint and a chevron-right;
  - a footer with a 1px top border, padding **10px 12px 4px**: "+ New life area" (13px, 600, label colour), which uses the existing add flow and then continues.
- Picking an area opens its **Goals tab** with a new goal **drafted** from `practiceBrief`, using the existing new-goal form. Nothing is saved until the user confirms.

**`create`:** "**✦ Make a meditation for this**" (primary, full width). It opens Create with the brief pre-filled from `practiceBrief` and the manifesto attached as context, the same as "Meditate on this".
