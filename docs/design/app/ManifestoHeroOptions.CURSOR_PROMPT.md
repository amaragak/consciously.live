# Manifest › Manifesto (Edit view): vision board hero as statement panel + bento

The vision board hero is an equal 4 × 2 grid with the statement overlaid. It takes most of the first screen. Replace it with a shorter, two-part hero:
- a dark statement panel on the left;
- a bento of images on the right, with mixed sizes.

This replaces the hero entirely, including any band or rounded-block treatment it has now. Change only what's listed here.

**Reference:** `docs/design/app/ManifestoHeroOptions.dc.html` and `ManifestoHeroOptions.png`, option **1 · Statement panel + bento**. Port px from the HTML source.
- **Ignore:** the other options, the window frames, the board captions and the sample content.
- **Styling:** existing tokens by role only. Use the app's standard chevron at its standard size.

---

## 1. Layout (`xl` and up)

**Position:** same as the current hero, at the top of the Edit view, inset by the page's usual horizontal padding so it lines up with the story card. It sits on the normal page background, with no band.

**Grid:** two columns, `5fr 7fr`, a **6px** gap, height **300px**.

## 2. Statement panel (left)

**Container:** radius **16px**, padding **30px 32px**, a column centred vertically with a **16px** gap.
- **Background:** the app's dark surface, the same as the dashboard's dark "Ready when you are" card.

**Contents:**
1. "**My manifesto**": 11px caps, letter-spacing 1.8px, 600, light accent on dark.
2. The statement: the app's serif, italic, **24px**, line-height 1.38, white, **left-aligned**.
   - Clamp it to **5 lines**. If it's longer, the panel shows the clamped text, and the full statement is in the Manifesto view.
3. **Buttons:** a row with a **10px** gap that wraps if needed.
   - The primary "**✦ Meditate on this**" (40px).
   - An outline-on-dark "**Vision board**" (40px, 1px white border at about 70%, white text, chevron), which opens the vision board.

**Edit:** a **32px** circle at the panel's top-right, inset 14px: white at about 14%, with a white pencil at 13px. `aria-label` "Edit statement". It opens the existing statement editor.

**No statement yet:** in place of the statement, show "Write the one sentence you want to live by." in serif italic 24px, white at about 60%. Replace the buttons with the primary "**Write your statement**".

## 3. Bento (right)

**Container:** radius **16px**, `overflow: hidden`.

**Grid:** `grid-template-columns: 2fr 1fr 1fr`, two equal rows, a **6px** gap.
- **Slot 1:** the large image, spanning both rows of the first column.
- **Slots 2–5:** the four small ones, in reading order: top-middle, top-right, bottom-middle, bottom-right.

**Each tile:** the image with `object-fit: cover` and radius **10px**. Clicking it opens the vision board with that image selected.

**Which images:** the first five in the vision board's own order. If the vision board has a cover or pinned image, it takes slot 1.

**More than 5 images:**
- slot 5 shows its image under a scrim (the heading colour at about 55%);
- on top of the scrim, "**+{n}**" in white, 18px, 600, centred, where n is the number of images not shown;
- clicking it opens the vision board.

**Fewer than 5 images:** fill the remaining slots in order with add tiles.
- **Add tile:** accent-tint background, a **1.5px** dashed light-accent border, radius 10px. A plus at 18px and "Add image" (13px, 600, label colour), centred. It opens the existing add-image flow.
- **Only one add tile at a time:** if more than one slot is empty, show the add tile in the first empty slot. Further empty slots are plain accent tint with no border or label.

**No images:** slot 1 becomes a large add tile, with "Add your first image" and the subline "Pictures of the life you're building" (12px muted). The other slots are plain accent tint.

## 4. Responsive

| Breakpoint | Layout |
|---|---|
| `xl` and up | As above: two columns, 300px. |
| `md` | Statement panel full width on top (auto height, same padding). Bento below at **220px** high, same grid. |
| `sm` and below | Panel padding 22px 20px, statement **20px** clamped to 6 lines, buttons full width and stacked with Meditate first. Below it, one row of **3 square images** with a 6px gap (the third with the +n scrim if there are more than 3), radius 10px. No large slot. |

## Don't change

- The story card and everything below it.
- The Manifesto and Story views.
- The vision board page itself.
- The statement editor and the add-image flow.
