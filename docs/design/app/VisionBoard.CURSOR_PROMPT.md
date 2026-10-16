# Manifest › Vision board: page redesign, favourites, New take, area coverage, and the Manifesto hero

Redesign the Vision board page, which has never been designed properly, and add:
- favourites;
- a paid-on-request "New take";
- area coverage.

Then connect favourites to the Manifesto hero bento. Keep all the existing generation, upload, versions and references logic. This is mostly layout plus a few new fields.

**Reference:** `docs/design/app/VisionBoard.dc.html` and `VisionBoard.png`. Port px from the HTML source.
- **Ignore:** the board captions and the sample content. Also ignore the "Edit caption" item in the tile menu (captions aren't part of this).
- **Styling:** existing tokens by role only. Use the app's standard chevron at its standard size. Use the app's existing star, grip, more, layers, refresh and sparkle icons, or the closest ones.

---

## 1. Data

Add the fields below, or reuse equivalents:

```
image {
  ...existing,
  favourite: boolean           // default false
  areaId: string | null        // life area, already set by generation if present
  onBoard: boolean, boardOrder: number   // existing "On mosaic"
  versions[], activeVersionId  // existing
}
```

**Board size:** keep the board's current slot limit, which is 8.

## 2. Page layout (desktop)

**Remove** the current page structure:
- the 4 × 2 mosaic with the "8" number placeholder;
- the "Drag to swap" overlay text;
- the "2v" / "3v" badges;
- the "On mosaic" chips;
- the inline "New image" generator;
- the References panel on the right.

The page becomes three parts. The content uses the app's normal content area and padding.

### 2.1 Title row

24px top padding, items aligned to the bottom, space between.
- **Left:** "**Vision board**" in the app's serif at **30px**. Under it, a 14px body-colour line: "{n} on your board · {f} favourites · {total} in your library". Leave out "· 0 favourites".
- **Right**, with a 10px gap:
  - an outline "**Upload**" button (40px, upload icon), which runs the existing upload flow;
  - a primary "**Create image**" button (40px, sparkle icon), which opens the Create sheet (section 5).

### 2.2 Your board

**Placement:** 22px below the title row.

**Header:**
- "**Your board**": 12px caps, letter-spacing 1.6px, 600, label colour.
- Below it, "Drag to reorder. Favourites lead on your Manifesto, story and poster." in 14px body colour.

**Coverage row:** 14px below the header. See section 7.

**Grid:** 4 columns, **10px** gap. Tiles are **190px** tall, radius **12px**, with the image as `object-fit: cover`.

**Tile, resting state:**
- the life area at the bottom-left, inset 10px, as a dark chip: 24px high, padding 0 9px, heading colour at about 55% with a light backdrop blur, white 11px 600 text. No chip if the image has no area.
- if it's a favourite, a **28px** filled star button at the top-right, inset 10px. The button is heading colour at about 55% with an accent-filled star.

**Tile, on hover (desktop) or focus:**
- a 3px accent ring;
- at the top-left, a **28px** drag handle on white at about 88%, radius 8px;
- at the top-right, a **32px** "⋯" more button and a **32px** star toggle (outline star on white at about 88% when not a favourite, the filled style when it is), with a 6px gap.

**Interactions:**
- **Drag** to reorder, updating `boardOrder`, with the existing drag logic.
- **The star** toggles `favourite`.
- **Clicking the image** opens the existing image detail or preview.

**Empty slot:** accent tint, a 1.5px dashed light-accent border, radius 12px, and a plus with "**Add from library**" (13px, 600, label colour). Clicking it scrolls to the library with the "Not on board" filter on. Only the first empty slot shows this. If an area is uncovered, see section 7.

**More menu** (the app's menu style, 250px wide):
1. **New take**, with "1 credit" on the right in 12px muted with a coin icon. See section 6.
2. **Versions ({n})**, which opens the existing versions UI. Hide it if there's only one version.
3. A divider.
4. **Remove from board**.

### 2.3 Library

**Placement:** 36px below the board, with 40px bottom padding.

**Header:** "**Library**", in the same style as "Your board".

**Filter chips**, which wrap, with an 8px gap. Chips are 34px high, padding 0 14px, 13px 600. The selected chip is solid heading colour with white text. Unselected chips are card surface with a 1px card border. Counts sit after the label at about 70% opacity.
- **All** {total}
- **★ Favourites** {f}, with an accent-filled star at 13px
- **On board** {n}
- **Not on board** {m}
- a 1px divider
- one chip per life area

The status chips are single-select. An area chip combines with them (AND). Clicking a selected area chip again clears it.

**Grid:** 6 columns, **10px** gap, square tiles, radius 10px.
- **Favourite:** a **26px** filled star button at the top-right, inset 8px.
- **On board:** a dark chip at the bottom-left with a check icon and "On board".
- **More than one version:** a dark chip at the bottom-right with a layers icon and the count, for example "3". This replaces "2v".
- **Hover:** shows the star toggle (if it isn't already shown), plus "Add to board" or "Remove from board" in the more menu, and New take and Versions as in 2.2.

## 3. Mobile (below `sm`)

- **Title row:** the title is 26px, with the counts line "{n} on your board · {f} favourites". There are no buttons in the row.
- **Fixed bottom bar:** above the app's bottom navigation, inset 14px, 46px high: the primary "**Create image**" at full width, with a **46px** circular Upload button beside it (outline, upload icon), both with a soft shadow.
- **Board:** 2 columns, 8px gap, **150px** tiles.
  - The tiles have no hover state. The star shows only when the image is a favourite.
  - Long-press opens the more menu, which also has Favourite and Unfavourite.
  - Reordering is drag after a long-press.
- **Coverage row:** scrolls horizontally on one line.
- **Library chips:** one horizontal scrolling row.
- **Library grid:** 3 columns, 6px gap. The "On board" chip shows the check icon only.

## 4. Favourites drive image selection everywhere

Wherever the app picks images automatically, use this order:
1. favourites, in board order;
2. then the other board images, in board order;
3. then the library, newest first.

This applies to:
- **Manifesto hero bento:** see section 8.
- **Story artwork** (the 2×2 in the story card, Library pin and dashboard): the first four in this order.
- **Poster:** for each life area's prints, that area's favourites first, then the rest as now.
- **Phone wallpaper:** one image per area, the area's first favourite, else its first board image.

## 5. Create sheet

**Opening:** "Create image" opens a sheet over the page, using the app's sheet or drawer component.
- **Desktop:** from the right, **440px** wide, full height, padding **26px 26px 22px**, a column with a **20px** gap, over the app's scrim.
- **Mobile:** a full-height bottom sheet.

**Contents, in order:**
1. **Title row:** "**Create an image**" (serif 24px) and a close ×.
2. **"Describe the scene":**
   - field label 13px 600;
   - a multi-line input (min height 96px, radius 12px, 1px card border, padding 12px 14px, 15px text, line-height 1.5), with the existing placeholder;
   - helper text "Mention people or pets by their reference names." in 12px muted.
3. **"Life area":** single-select chips, one per area plus "**None**", in the 34px chip style. This sets `areaId` on the result.
4. **"References":** a chip per saved reference (40px pill, a 32px round thumbnail, then the label, for example "You"), and a dashed "**+ Person, pet or place**" chip. Then "Manage references ›" (13px 600, label colour), which opens the existing references UI in the app's dialog.
5. **Footer, pinned to the bottom:**
   - the primary "**Generate · 1 credit**", full width, 46px;
   - under it, "New images go to your library. Add them to your board from there." in 12px muted, centred.

**Generating:** use the existing generation call and loading state. The result appears at the top of the library with a brief highlight, and the sheet stays open for another generation.

**Credits:** if the app tracks image credits, show the cost on Generate as above. If it doesn't, drop "· 1 credit" from the label.

## 6. New take (paid, user-initiated only)

New take regenerates the same scene as a fresh moment: same description, same references, with the current image as a reference for continuity.
- **Model:** if a cheaper image-edit model is available, use it here, since this changes an existing image rather than making a new one.
- **Never automatic.** Only the New take menu item starts it.

**Flow:**
1. **Start:** choosing New take immediately opens a dialog (app dialog, **700px**, radius 20px, padding 24px):
   - title "**New take**" in serif 24px, with ×;
   - the subline "Same scene and people, a fresh moment. Kept as a version; your board shows the one you pick." in 13px body colour;
   - a row of **200px** version cards with a 16px gap: "Current" (subline "On your board" if the image is on the board) and a **placeholder** card. The placeholder has an accent-tint shimmer, a 1px light-accent border, a sparkle and "Making a new take…" in 13px 600 label colour, and the subline "About 20 seconds".
2. **When it arrives:**
   - it replaces the placeholder, labelled "New take · Just now", and is selected (3px accent ring);
   - up to one earlier version is shown after it ("Earlier version · {date}");
   - clicking any card selects it.
3. **Footer:**
   - on the left, a coin icon and "Used 1 credit · {left} left this month" in 13px muted (or just "Used 1 credit" if there's no balance to show);
   - on the right, the outline "**Another take · 1**" (refresh icon) and the primary "**Use new take**". When another card is selected, the primary reads "**Use this one**".
4. **Saving:**
   - the new take is always saved as a new version of the same image (`versions[]`);
   - "Use …" sets `activeVersionId`;
   - closing the dialog keeps the current active version, and the new take stays in Versions.
5. **Errors:** show the app's error toast, and don't charge.

## 7. Area coverage

**Coverage row:** between the board header and the grid.
- "Areas on your board" (12px, 600, muted), then one chip per life area: the area name and the number of board images in it.
- **Covered:** card surface, 1px card border, heading-colour text with a muted count.
- **Uncovered** (0 board images): accent tint, **1.5px dashed** accent border, label-colour text, then "0" and a plus.
- **Clicking a covered chip** filters the library to that area. **Clicking an uncovered chip** opens the Create sheet prefilled (below).

**Suggestion tile:** if the board has an empty slot and at least one area is uncovered, the first empty slot shows a suggestion for the first uncovered area (in the life areas' order) instead of "Add from library".
- **Container:** accent tint, 1.5px dashed accent border, radius 12px, padding 16px, a column with an 8px gap.
- **Contents:**
  - the area name in 11px caps, label colour;
  - "**Nothing for {Area} yet**" in serif 18px;
  - "Your vision: “{area vision}”" in 13px body colour, clamped to 2 lines (left out if the area has no vision text);
  - pinned to the bottom, the primary "**Create one**" (34px, sparkle), then "From library" (13px 600 label colour), which opens the library filtered to Not on board.

**Prefilled Create:** "Create one" (or an uncovered chip) opens the Create sheet with:
- the area selected;
- the scene field prefilled with a one-sentence draft from a cheap text-model call. The input is the area's name, its vision and the user's reference names. The output is a concrete, present-tense scene with the user in it.
- the prefilled field gets a 1px accent border and accent-tint background, with a line under it: sparkle and "Drafted from your {Area} vision · edit freely" (12px 600 label colour). Both go back to normal once the user edits it.

Drafting is text only and uses no image credit.

## 8. Manifesto hero bento

This updates the hero from the previous prompt.

**Large slot:**
- one image per local day, cycling through favourites in board order;
- if there are no favourites, cycle through board images;
- store the cycle position per user.

**Small slots:** the next four images in the section 4 order, leaving out the one in the large slot.

**Clicking a small tile:**
- it **swaps** with the large slot, with a 250ms crossfade on both;
- the swap lasts only for this page view, and nothing is saved;
- a further click on a small tile swaps again.

**Clicking the large image** opens the Vision board with that image selected.

**Hovering the large image:** shows a **34px** star toggle at its top-right, inset 12px, styled as in 2.2, which toggles `favourite` in place.

**"+n"** opens the Vision board, as before.

## Don't change

- Generation, upload, references and versions logic, apart from what's above.
- The Manifesto statement panel.
- The poster layout.
- The story features, beyond the image selection order.
