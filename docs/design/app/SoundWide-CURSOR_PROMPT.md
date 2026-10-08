# Meditate Create: Sound step, wide layout update

## Scope

This is an update to the **Sound step as it is currently implemented**. Change **only the step's content area**.

Do not touch:
- the app header, the sidebar, the stepper or the footer bar;
- the Change panels and sheets, or the mixer;
- any other step or page;
- colour tokens.

## Reference

- `docs/design/app/SoundWide.dc.html` and `SoundWide.png` show two screens:
  - **A**: a soundscape is picked.
  - **B**: a Build your own mix is picked.
- **Using the reference:**
  - Port the structure of the step content from the HTML source: the same elements, nesting, borders, radii, padding, gaps and font sizes.
  - Ignore the board titles, the frame width, the app header, the sidebar and the footer.
  - Add nothing the design doesn't have, and drop nothing it has.
  - Names, tags, reasons and images are sample data. Bind everything to real data.

## Colours

Don't take colours from the design file. Use the existing tokens by role:
- card surface, card border, page background (the sample-line row);
- label text (eyebrows, reasons, links), heading, body and muted text;
- accent (slider fill, switch on), accent tint (tags, summary strip);
- primary button style (play circles), outline button style (Change).

The brainwave badge uses the dark heading colour as its fill, with light accent text. Text over the cover image is light.

## 1. Layout

- From the app's **existing breakpoint nearest 1200px** and up, the Voice and Sound cards sit **side by side**:
  - grid `minmax(0,1fr) minmax(0,1fr)`;
  - **16px** gap;
  - `align-items: stretch`, so both cards are always the same height.
- Below that breakpoint, the cards stack in the current order (Voice, then Sound). The card contents below apply at every width.
- The summary strip stays above the cards, full width.
- Use existing breakpoints only. Don't change the content-area width or alignment.

## 2. Summary strip

After the sentence, add one chip each for the length, the voice name and the sound name:
- chip style: padding **3px 10px**, pill, card surface, 1px border in the light accent, sans **12px**, `nowrap`;
- **6px** gap between chips, and **6px** left margin before the first chip.

Everything else in the strip is unchanged.

## 3. Cards (both)

- Radius **16px**, 1px border, card surface, padding **18px 20px**.
- Column layout with a **14px** gap.
- The **last block in each card sits at the bottom** (`margin-top: auto` on its hairline), so the slider rows of the two cards line up.

## 4. Voice card

In order:
1. **Head row:** unchanged (eyebrow + Guided / Open sits).
2. **Main row:** **14px** gap, items centred.
   - a **46px** play circle;
   - the text column:
     - name: serif **21px**;
     - description: **13px**, muted;
     - reason: **12px**, label colour, prefixed "✦ ".
   - Change: outline pill, on the right.
3. **Sample line (new):**
   - A row with a **12px** gap, padding **12px 14px**, radius **12px**, page-background fill.
   - It contains a **30px** play circle and the line *"Let your shoulders soften, and let the day settle around you…"* in italic serif **16px**, line-height 1.45.
   - The play circle plays the voice's existing sample.
   - Put the line text in one constant.
4. **Or try:** unchanged.
5. **A 1px hairline**, with `margin-top: auto`.
6. **Slider rows:**
   - **Pace** ("Slower" ↔ "Faster"): add it **only if an existing speech-rate or speed parameter exists**; otherwise leave it out.
   - **Space** ("Dry" ↔ "Spacious"): moved here from wherever it currently is.
   - Both use the existing slider row styling (label **64px** wide, **13px 600**, **12px** gap).

## 5. Sound card: soundscape picked (screen A)

1. **Cover banner** (replaces the 56px thumbnail main row):
   - **136px** high, full bleed to the card edges (margin **-18px -20px 0**), top radius **16px**, overflow hidden;
   - the soundscape's existing image, cover-fit;
   - a scrim from near-transparent at the top to ~45% of the dark heading colour at the bottom.
   - **Overlaid:**
     - "Sound" eyebrow, in light text, at left **20px** / top **16px**;
     - Change (outline pill), at right **16px** / top **12px**;
     - at left **20px** / bottom **14px**, a row with a **12px** gap: a **44px** play circle (previews the soundscape), then the name in serif **22px**, light, with a soft text shadow.
2. **Tags row:** **6px** gap, items centred, wraps.
   - **Brainwave badge first:** the brainwave tag from the soundscape's admin tags (e.g. "α 8 Hz"); padding **2px 9px**, pill, **11px 600**, `nowrap`.
   - **Then up to 4 other tags:** padding **2px 9px**, pill, accent-tint fill, **11px**, label colour.
   - **Reason** on the right (`margin-left: auto`): **12px**, label colour, "✦ " prefix.
   - Omit the badge if there's no brainwave tag.
3. **Or try:** unchanged.
4. **Balance:** a 1px hairline with `margin-top: auto`, padding-top **14px**, then the Balance slider row ("Voice" ↔ "Sound").
5. **Switches row (new):** **24px** gap, left padding **76px** (aligns with the slider track). Use the app's existing switch component.
   - "20 s of sound before the voice": on by default.
   - "Fade out at the end": on by default.

## 6. Sound card: Build your own picked (screen B)

There is no banner. In order:
1. **Head row:** "Sound" eyebrow (left), Change (right).
2. **Main row:** **14px** gap, items centred.
   - a **46px** play circle (previews the mix);
   - the mix or preset name in serif **21px**;
   - below it, "Your mix" in **13px**, muted.
3. **Layers row:** **6px** gap, items centred, wraps.
   - "Layers" in **12px**, muted;
   - one chip per active layer, showing its sample name: padding **4px 10px**, pill, 1px border, **12px**, body text. No icons.
   - Right-aligned (`margin-left: auto`): "Open mixer ›" in **13px 600**, label colour. It opens the existing Change panel on the Build your own tab with this mix loaded, exactly like Change does.
4. **Or try**, **Balance** and **switches:** identical to screen A.

## 7. Data

- **Lead-in and fade-out:**
  - If generation already has intro-padding or fade parameters, bind the switches to them.
  - If not, add `leadInSeconds` (0 or 20, default 20) and `fadeOut` (boolean, default true), and pass them to generation.
  - Tell me which you did.
- **Tags:** read them from the soundscape's existing tags. If the brainwave tag isn't separable, use the tag whose category is Brainwave.
- **Pace:** see section 4. Tell me whether you added it.
