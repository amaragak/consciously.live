# Manifest: the Manifesto print view (phased)

## Scope

Add a second view to the Manifesto page: a designed, printable **print** of the user's manifesto, which the user can add to and edit in place. The current Manifesto page becomes the **Edit** view, with its layout unchanged.

Two phases. **Stop and report after each one.**
1. **Phase 1:** tag Vision board images to life areas.
2. **Phase 2:** the print view: header tabs, the print, adding and editing in place, Preview, export, and the empty state.

**Don't touch:**
- the Edit view's layout;
- the Life area pages;
- other pages;
- colour tokens.

## Reference

| Board | What it shows |
|---|---|
| `docs/design/app/ManifestoPrint.dc.html` + `.png` | The **Preview / exported** print, desktop (left) and mobile (right). This is exactly what gets exported. |
| `docs/design/app/ManifestoCompose.dc.html` + `.png` | The **default on-screen** print, with its floating add and edit controls and a missing-image placeholder. |
| `docs/design/app/ManifestoEmpty.dc.html` + `.png` | The **fresh user** state. |

Port the structure and px from the HTML source. Ignore the board captions and sample content; bind everything to real data. Keep the app's existing default content area and page padding.

## Colours, fonts and icons

**Colours:** use the existing tokens by role:
- page background, card surface and card border;
- heading, body and muted text, label/accent text;
- accent (✦, Roman numerals, the gold rules);
- light accent (rules, the inner frame, dashed placeholders);
- accent tint (notes);
- the primary and outline button styles.

**Surfaces:**
- **Paper:** the existing ivory surface the Manifesto bands use.
- **Print mount:** the card surface.
- **Notes:** four subtle variations of the accent tint, cycling through them (for example, mixing the tint with the paper at different strengths).

**Grain:** a very faint paper grain over the poster, using an inline SVG `feTurbulence` noise as a background image at very low alpha. Keep it subtle; it must not muddy the text.

**Fonts:**
- **Display and serif text:** the app's serif. Where it supports optical sizing (`opsz`), use a high value for display sizes (name, area names) and a text value for body italics.
- **Small caps labels:** the app's sans, uppercase, with the letter-spacing given.

**Icons:** use the app's standard icons (plus, edit, eye, download, image). Wherever the design shows "›", use the app's standard chevron at its standard size.

---

## Phase 1: tag Vision board images to life areas

**Data:** add `lifeAreaIds: string[]` to vision board images.
- Empty means untagged.
- An image can belong to several areas.

**Vision board UI** (minimal; use the existing chip/tag style and menu component):
- Each image shows its life area chips.
- The image's existing actions get "**Life areas…**", which opens a checkbox menu of the user's areas and saves on change.
- Deleting a life area removes its ID from all images.

Stop and report.

---

## Phase 2: the print view

### 2.1 Tabs, routing and the actions column

**Tabs**
- Add **Edit | Manifesto** tabs to the header on the Manifesto page, **Edit first**.
- Use the **existing header tab component** (the one Library uses), centred in the header the same way.
- **Mobile:** the tabs take the place of the breadcrumb's last item, at the compact size.

**URL and default**
- **URL:** `?view=manifesto` for the print. No param means Edit.
- **Default:** Manifesto. Remember the user's last choice.

**Desktop layout**
- **Content area:** a row, items aligned to the top, **20px** gap: the print (scaled to fit), then a sticky actions column with a **10px** gap:
  - "**Export**" (primary, 40px, download icon);
  - "**Preview**" (outline, 40px, eye icon). It's a toggle; its active state uses the existing selected style for outline buttons.
- **No toolbar row** above the print.

**Mobile bottom bar** (sticky, **14px** from the edges, **8px** gap):
- "**Save as image**" (primary, 46px, full width);
- a **46px** round outline button with the eye icon, which toggles Preview.

Pad the content so the bar never covers it.

### 2.2 The print: desktop

**Design size and scaling**
- Draw it at a fixed design size of **1000 × 1414**, scaled with a CSS transform to fit the available width.
- Export uses the design size.

**Container**
- The paper surface plus grain, with a shadow of `0 2px 4px` (faint) and `0 24px 60px -20px` (soft).
- Padding **58px 76px 44px**, a column.
- **Double inner frame:** a 1px light-accent border inset **18px**, and a second 1px border at about 45% inset **23px**. No pointer events.

**Top to bottom**
1. **Label row:** a rule, then "My manifesto", then a rule. **16px** gap; the label in 10px caps, letter-spacing 3px, 600, label colour; the rules 1px light accent with `flex: 1`. **No year.**
2. **Name:** the user's first name. **18px** top margin, centred, italic display serif, weight **300**, **40px**, line-height 1, letter-spacing −0.4px, heading colour.
3. **Statement:** **14px** top margin, centred, `max-width: 720px`, italic serif **25px**, line-height 1.42, heading colour, wrapped in curly quotes. **No separate quote glyph.**
4. **Values:**
   - **20px** top margin, then a double rule (two 1px light-accent rules with a **3px** gap);
   - the values row: padding **12px 0**, centred, caps **11px**, letter-spacing 2.6px, 600, heading colour, separated by ✦ in accent at 9px with **14px** horizontal margins;
   - then another double rule.
5. **Life areas:** **26px** top margin, a column with an **18px** gap. Between areas, an ornament: a rule, ✦ in accent at 10px, then a rule, with a **14px** gap.
6. **Words to keep** (section 2.4): `margin-top: auto`, **30px** top padding.
7. **Footer:** **22px** top margin. A rule, then the sun mark at 12px with "consciously" in 9px caps, letter-spacing 2px, 500, muted, then a rule.

**Life area row**
- **Layout:** a row, items centred, **36px** gap. A **300px** image slot, then the text, swapped on alternate rows: the image is on the left in rows I, III, … and on the right in rows II, IV, ….
- **Text is always left-aligned.**
- **Image slot:** the prints are aligned to the outer edge of the poster.
- **Text column** (`flex: 1`, **12px** gap):
  - **Name row** (baseline-aligned, **14px** gap):
    - the Roman numeral (I, II, III…) in italic display serif 18px, accent, `min-width: 26px`;
    - the **area name** in display serif **44px**, line-height 0.98, letter-spacing −0.5px, heading colour.
  - **Dream:** italic serif **19px**, line-height 1.38, heading colour, `padding-left: 40px` so it lines up under the name.
  - **What it looks like** (only if set; `padding-left: 40px`, **4px** gap):
    - "What it looks like" in 9px caps, letter-spacing 1.8px, muted;
    - the answer in 14px, line-height 1.55, body colour.
- **Not shown in the row:** values, blockers, goals, quotes, questions.

**Prints** (the area's tagged images; always **square**, `object-fit: cover`)
- **Mount:** each image sits in a card-surface mount with **6px** padding.
  - **Shadow:** `0 1px 0` (faint) and `0 10px 22px -8px` (soft).
  - **Slight tilt:** on rows I, III… the tiles rotate −1.4°, 1.2° and −0.8°. On rows II, IV… they rotate 1.2°, −1.0° and 0.9°.
- **Base size:** **166px** (`BIG`).
  - **1 image:** one 166px square.
  - **2 images:** two squares at `BIG × 0.78`, **10px** gap, centred vertically.
  - **3 or more:** one 166px square, then two stacked squares at `(166 − 10) / 2`, **10px** gap. Further images aren't shown.
- **No images:** in Preview and export, the row is text only, spanning the full width. On screen it shows the placeholder (section 2.5).

**Fit:** the poster has a fixed height. If the content doesn't fit, reduce `BIG` in steps, down to **140px**. If it still doesn't fit, tell me rather than inventing a layout.

### 2.3 The print: mobile (below `md`)

**Container:** a scrolling card on the paper surface plus grain, with a soft shadow and padding **34px 22px 26px**. A single inner frame: 1px light accent, inset **10px**.

**Header block**
- the label row at 9px, letter-spacing 2.4px;
- the name at **34px**;
- the statement at **19px**, line-height 1.42, centred;
- the values wrapping and centred, in 10px caps, letter-spacing 2px, with a **14px** column gap and a **6px** row gap, between double rules.

**Areas:** **30px** top margin, **26px** gap, with an ornament between areas. Each area stacks, with a **14px** gap:
1. **Name row** (baseline-aligned, **12px** gap): the numeral at 15px, then the name in display serif **34px**, line-height 1.
2. **Prints:** a row of up to 3 squares, **10px** gap, each `(inner width − gaps) / n`. A single image is **180px**. Mount padding **5px**; rotations −1.6°, 1.3° and −0.9°.
3. **Dream:** italic serif **17px**, line-height 1.4.
4. **What it looks like:** the label at 8.5px, then 13px, line-height 1.5.

**Words to keep:** **44px** top margin, a 2-column grid of notes with an **18px × 14px** gap. Note text is 13px, with padding **16px 13px 12px**.

**Footer:** as on desktop, at the smaller sizes.

### 2.4 Words to keep (notes)

Quotes and **answered** Questions to yourself appear here as **taped notes**. They are never attached to life areas.

**Section**
- **Label row:** "Words to keep" in 9px caps, letter-spacing 2.4px, label colour, followed by a rule, with a **14px** gap.
- **Grid:** 4 columns on desktop, **22px** gap, items aligned to the start. On mobile, 2 columns.

**Note**
- **Background:** one of the four tint variations, cycling.
- **Layout:** padding **18px 16px 14px**, a column with a **10px** gap.
- **Shadow:** `0 1px 0` (faint) and `0 12px 20px -12px`.
- **Rotation:** cycling −2.2°, 1.6°, −1.1° and 2.0°.
- **Tape:** a **46 × 14** strip, centred at the top with **−7px** offset, white at about 70%, a faint shadow, rotated about −1.5 × the note's angle.
- **Quote note:** the quote in italic serif **14px**, line-height 1.42, heading colour, then the source in 8.5px caps, letter-spacing 1.6px, label colour. No source line if there's no source.
- **Answer note:** the question first, in 8.5px caps, letter-spacing 1.5px, line-height 1.5, label colour, then the answer in italic serif 14px.

**Which notes show**
- Up to **4**, most recent first.
- Each quote and question gets `hiddenOnPrint: boolean` (default false). In compose, a note's hover pencil offers "Edit" and "**Remove from print**".
- The section is hidden in Preview and export when there are no notes.

### 2.5 Compose: on-screen only, never in Preview or export

**The rule:** every control here is **absolutely positioned** over the print. Showing or hiding them must not move any other element.

**Floating "+" buttons**
- **Style:** **30px** circles; 28px on mobile. Card surface, a 1px light-accent border, the plus icon in accent, and a soft shadow.
- **Desktop positions:** in the poster's right margin (`right: -58px` of the content, vertically centred) on:
  - the **values row**, which adds a value;
  - **each life area row**, which adds an image to that area;
  - the **Words to keep** row, which adds a note.
- **Mobile positions:**
  - at the right end of each area's name row (`top: 2px; right: -2px`), which adds an image;
  - at the bottom-right of the values row;
  - at the end of the Words to keep label row.

**"+ Add a life area" pill**
- **Position:** absolutely centred on the bottom edge of the areas column (`bottom: -30px`; `-36px` on mobile), sitting in the gap above Words to keep.
- **Style:** 30px high (28px on mobile), padding 0 14px, card surface, 1px light-accent border, soft shadow, 12px, 600, label colour, with the plus icon at 13px.

**Pencil on hover:** a **26px** circle at the top right of any text item (statement, value, area name, dream, "What it looks like", note). It edits in place. On touch, tapping the item edits it.

**Missing image placeholder:** an area with no images shows a **166px** square (the single-print footprint, rotated like a print) instead:
- a 1.5px dashed light-accent border and a faint paper fill;
- a centred 30px "+" circle;
- "Add an image for {area}" in 12px, 600, label colour.

Clicking it is the same as that area's "+". In Preview and export, the placeholder is removed and the row is text only.

**What each control opens** (use the app's existing popover/sheet components; everything saves to the **same data the Edit view uses**):

| Control | Opens |
|---|---|
| Statement, value, dream, "What it looks like", area name | An inline text field in a small popover, with Save and Cancel. |
| Add value | A single input. Enter adds it. |
| Add image (area "+" or placeholder) | A sheet with "Choose from your Vision board" (multi-select) and "Upload". The chosen images get that area's ID in `lifeAreaIds`. |
| Add note | A popover with two tabs. **Quote** has the text and source fields. **Answer a question** lists the user's questions; picking one shows its answer field. |
| Add a life area | A popover asking only for the name and dream, with "Full setup ›" linking to the new area's page. |
| Remove from print | Sets `hiddenOnPrint`. |

**Preview:** hides every compose control and placeholder, and renders exactly what export produces.

### 2.6 Empty state (fresh user)

Follow `ManifestoEmpty`. The print's frame and name are always shown; every missing piece is a dashed slot.

**Statement slot**
- **Container:** a 1.5px dashed light-accent border, faint paper fill, radius **12px**, padding **22px 30px**, **16px** top margin. A centred column with an **8px** gap.
- **Contents:**
  - a 30px "+" circle;
  - "**“Write the sentence you want to grow into.”**" in italic serif 22px, muted;
  - the hint "One line about who you're becoming. It heads your print." in 12px muted.

**Values:** between the double rules, a 26px "+" circle, then "**Add your values**" (12px, 600, label colour), then the hint "· the 3 to 5 things you want your choices to come from" in 12px muted.

**First life area (ghost)**
- a dashed 166px mount, rotated −1.2°, containing a "+" and "**Add images**";
- the numeral "I", then "**Your first life area**" in display serif 44px, in light accent;
- the hint "Music, work, health, people… an area of your life you want to grow. Give it a name and a dream, then pin images to it." in 13px muted;
- an "**Add a life area**" pill, 36px high.

**Ghost rows II to IV:** skeleton bars in light accent at about 20–25%, plus dashed 150px squares, alternating sides, at opacities **0.5**, **0.32** and **0.18**. Show them only while the user has no life areas.

**Words to keep:** a single dashed note with a "+", "**Add a quote**" and the hint "A line you want to keep close."

**Actions:** Export and Preview (and Save as image on mobile) are disabled at about 45% opacity. Under them, in 12px muted: "Add a statement or a life area to start your print."

**Partially filled:** each section shows its real content once it has some, and its dashed slot only while it's empty.

### 2.7 Export

"Export" opens a small menu:
- **PDF · A3** and **PDF · A2**: use the browser print path, with `@page` set to that size in portrait and the print at its design size scaled to the page. Hide all app chrome.
- **Image (PNG):** capture the print at its design size at 2× with a DOM-to-image library.

"**Save as image**" on mobile captures the mobile print at 3×, padded to a 9:19.5 phone wallpaper on the paper colour.

Export always renders the **Preview** state.

Report when done.
