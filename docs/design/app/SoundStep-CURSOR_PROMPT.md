# Meditate Create: Sound step redesign

## Goal

Redesign the **Sound step** of Create (the old "Audio & voice" step) on desktop and mobile.

**Starting point (current UI):**
- a large "You're making" card;
- the Guided / Open sits switch;
- a sideways-scrolling row of every voice;
- the FX knob;
- a Soundscapes grid that scrolls inside its own box;
- a **Build your own** tab whose mixer has degraded into a stack of form rows (Preset select, mix name, then a card per layer).

All of that is replaced as described below.

**What changes:**
- The step no longer shows every voice and soundscape at once. It shows **one voice and one soundscape picked for this meditation**.
- Each pick has a reason, three quick alternatives and its slider.
- The full libraries (all voices; all soundscapes and Build your own) open in a **Change** panel on desktop, or a bottom sheet on mobile.

**Everything the current step can do must still be possible:**
- Guided / Open sits;
- every voice, with preview;
- FX (now called "Space");
- every soundscape, with categories and preview;
- Build your own;
- Length;
- Generate.

**References:**
- **Desktop:** `docs/design/app/SoundStep.dc.html` and `SoundStep.png`. Three screens: 1 the step, 2 Change voice open, 3 Change sound open.
- **Mobile:** `docs/design/app/SoundStepMobile.dc.html` and `SoundStepMobile.png`. The same three screens at 360px.
- **Mixer:** `docs/design/app/SoundMixer.dc.html` / `SoundMixer.png` (desktop: the mixer panel, and the Sound card after a mix is used) and `SoundMixerMobile.dc.html` / `.png` (the mixer sheet).

## How to use the design files

- Both files are plain HTML with inline styles. **Read their source and port the structure** of the step content, the panels, the sheets and the footer buttons: the same elements, nesting, borders, radii, padding, gaps and font sizes.
- Ignore the `<helmet>`, `<x-dc>` and script wrappers, the board titles, and the app header and sidebar.
- **Don't add anything the design doesn't have, and don't drop anything it has.**
- The names, descriptions, reasons, counts and images in the design are sample data. Bind everything to real data.

## Colours

Don't take colours from the design files. Use the existing tokens for each role:
- page background, card surface, card border;
- label text (eyebrows, reasons, links), heading, body and muted text;
- the accent (selected borders, the check badge, slider fill and thumb border), and the accent tint (the summary strip, tags, the selected voice row, the Silence tile);
- the primary button style (play circles, primary buttons) and the secondary/outline button style.

Soundscape thumbnails keep their current images and treatment.

## Don't touch

- The app header, the sidebar and the Chat button.
- Colour tokens.
- The Start and Shape steps.
- The stepper and the footer bar component: reuse them as they are, and only change the buttons on this step.
- How audio is generated, apart from the parameters listed under "Data".

## Data

**Voices**
- Each voice needs:
  - `description`: a short line in the form "tone · pitch · accent", e.g. "Warm · low · UK";
  - `gender`;
  - `accent`.
- Add these to the voice config if they're missing. Fill in what you can't infer with clearly marked placeholders, and tell me which ones.
- The filter chips (All, then the gender values, then the accent values) are built from this data.

**Picks**
- Put all pick logic in **one module**, so it can be swapped for a model later. It takes the flow context (style or program, attached context, time of day) and the user's history.
- It returns:
  - `voice: {id, reason}`
  - `voiceAlts: [3 ids]`
  - `sound: {id, reason}`
  - `soundAlts: [3 ids]`

**Voice rules (v1)**
- **Default:** the user's last-used voice, with the reason "Your usual voice".
- **No history:** the style's default voice if there is one, otherwise the first voice. Reason: "A good fit for {style}".
- **Alternatives:** the user's other most-used voices, then voices in the default order.

**Sound rules (v1)**
- **Default:** the soundscape the user last chose for this style, with the reason "Your pick last time".
- **Otherwise:** the first soundscape in the style's categories. Reason: "Suits {a morning / an afternoon / an evening / a night} {style}".
- **Style → category map:** if no mapping exists, add a small config that maps each style to one or two categories.
- **Alternatives:** two more from the same categories, plus **Silence**.

**Silence**
- Silence means no soundscape.
- If that isn't already possible, add it as a "no soundscape" option.

**Space**
- Space is the existing FX value, on the same parameter and range.

**Balance**
- Balance is the voice ↔ music level.
- Bind it to the existing mix or volume parameter if there is one.
- If not, add a `musicLevel` parameter (0–100) whose default gives today's mix, and pass it to generation.
- Tell me which you did.

**Preview mix**
- Plays about 15 seconds of the selected voice's sample over the selected soundscape (or the Build your own mix), at the current Balance setting.
- Build it client-side with Web Audio, using the existing sample and soundscape files.
- Apply Space only if the existing preview path already supports FX.
- While it's playing, the button shows a stop icon and stops the preview when pressed.

**Playback**
- Only one preview plays at a time across the whole step and its panels: voice play buttons, soundscape thumbnails and Preview mix.

## Behaviour

**Step**
- **On entry:** the step loads the picks. If the user already chose something in this flow and comes back to the step, show their choice, not a fresh pick.
- **The reason line** shows only while the pick is the suggested one.
- **"Or try" chips:** tapping one makes it the pick. The previous pick moves into that chip's place, and the reason line hides.
- **Change** opens the panel (desktop) or sheet (mobile).
- **Guided / Open sits** is the existing setting.
- **The summary strip** is one line. Clicking it expands it in place to show the full sentence and the context tokens (as on the Create flow's summary card). Clicking again collapses it.

**Change panels and sheets**
- **Selection is staged:** tapping a voice or soundscape selects it in the panel. "Use this voice" / "Use this sound" (mobile: "Use {name}") commits the choice and closes. Close, the scrim, Esc or swiping down discards it.
- Focus is trapped while open, and focus returns to the Change button on close.

**Voice panel**
- The filter chips filter the list. Your usual voice gets a "Your usual" tag, and new voices get "New" if that data exists.

**Sound panel**
- **Search** filters by name and category.
- **The category chips** are the existing categories.
- **"Suggested for this meditation"** shows the pick plus its two non-Silence alternatives. Hide that section while searching or while a category other than All is selected.
- **"All soundscapes · {n}":** Silence first, then sorted by the sort control. The options are "A–Z" and "Recently used".

**Build your own (mixer)**
The mixer lives in the **Build your own** tab of the sound panel or sheet. Rebuild it as a proper mixing desk. Keep the **existing layers, sounds, presets, volume logic and save logic**; only the UI changes.

*Desktop layout (inside the 640px panel body):*
- **Preset bar** (a row with an 8px gap, items centred, 12px bottom padding, a 1px bottom hairline):
  - the existing **Preset** select (flex 1, **40px** high, radius **10px**, 1px border, card surface, sans **14px**), showing "None" or the preset name;
  - "**Save as new**": an outline pill, **40px** high, padding 0 14px, sans **13px 600**. Clicking it turns the bar into an inline name field ("Untitled mix") with **Save** and **Cancel**. Replace the always-visible name field with this.
  - If the loaded preset is one of the user's own: "**Update**" (outline pill) and "**Delete**" (text button, muted) as well.
- **Layer list:** one row per existing layer (Music, Ambience, Drums and the rest, in the existing order). Rows are separated by 1px hairlines inside a single card: card surface, 1px border, radius **14px**, rows with padding **10px 14px**.
- **Each layer row** is a grid with columns **88px | 1fr | 140px | 40px | 32px**, a **12px** gap, items centred:
  1. the layer name: sans **11px**, uppercase, letter-spacing 1.4px, weight 600, label colour;
  2. the sound picker: the existing options in a select (**36px** high, radius 10px, 1px border, card surface, sans 14px). "None" sits first;
  3. the volume slider, styled like Space and Balance (4px track, accent fill, 18px thumb with a 2px accent border);
  4. the volume value: sans **12px**, muted, right-aligned (e.g. "50%");
  5. preview: a **32px** play circle in the primary style. It plays that layer alone, as the existing preview does, and shows stop while it's playing.
- **Layers set to "None":** the row is muted (label and select at reduced emphasis), and the slider and preview are **disabled**, not hidden, so the columns stay aligned.
- **Under the card:** "**Play mix**" (an outline pill, 36px high, with a play circle) previews all active layers together. Next to it, in sans 12px, muted: "{n} layers".
- **Panel foot:** "Your mix · {n} layers" and the primary button "**Use this mix**".

*Mobile (sheet):*
- The preset bar stacks: the select full width, then the buttons.
- Each layer row becomes two lines:
  - **Line 1:** the layer name (left) and preview (right).
  - **Line 2:** the select (full width).
  - **Line 3:** the slider with its value.
- The rows keep their hairlines, and the foot button is full width.

*Committing a mix* sets the sound card to:
- the name "**Your mix**" (or the preset name, if one is loaded);
- the active layers' sound names joined with " · " as the description;
- a tint-square visual with a sliders icon, styled like the Silence tile.

**Re-opening:** Change shows the Build your own tab, with the mix loaded.

## Layout: desktop (`md` and up)

**Step content**
- A column with a **16px** gap, in this order: the summary strip, the Voice card, the Sound card. The stepper is unchanged.

**Summary strip**
- **40px** high, padding **0 14px**, radius **10px**, accent-tint background and border, items centred, **10px** gap.
- **Left:** "You're making" in sans **11px**, uppercase, letter-spacing 1.4px, weight 600, label colour, `nowrap`.
- **Middle:** the sentence in serif **15px**, flex 1, one line with an ellipsis.
- **Right:** ▾ at 11px, muted.

**Pick cards (Voice and Sound)**
- Radius **14px**, 1px border, card surface, padding **14px 16px**, a column with a **12px** gap.
- **Head row** (space-between, centred): the eyebrow ("Voice" / "Sound": 11px, uppercase, letter-spacing 1.4px, 600, label colour).
  - The Voice card also has the **Guided / Open sits** segmented control on the right: track padding **3px**, radius **12px**, 2px gap; segments padding **7px 14px**, radius **9px**, sans **13px**; the selected segment has the card surface, a 1px border and weight 600.
- **Main row** (centred, **12px** gap):
  - **The visual:**
    - **Voice:** a **44px** play circle in the primary style.
    - **Sound:** a **56×56** thumbnail, radius **8px**, with a **24px** translucent white play circle centred on it. It previews the soundscape.
  - **Text column** (flex 1, `min-width: 0`, **2px** gap):
    - the name in serif **19px**, line-height 1.25;
    - the description in sans **13px**, muted (for sound, the category);
    - the reason in sans **12px**, label colour, prefixed "✦ ".
  - **Change:** an outline pill, **36px** high, padding **0 14px**, sans **13px 600**.
- **Alternatives row** (centred, **6px** gap, wraps):
  - "Or try" in sans **12px**, muted;
  - three chips, each **32px** high, padding **0 10px 0 4px**, pill, 1px border, card surface, sans **13px**, with a **6px** gap and a **24px** round visual:
    - voice: a small play circle in the primary style that previews the voice;
    - sound: the round thumbnail;
    - Silence: an accent-tint circle with a 13px muted-speaker icon.
- **A 1px hairline.**
- **Slider row** (centred, **12px** gap):
  - the label in sans **13px 600**, **64px** wide ("Space" / "Balance");
  - the left end label in sans **12px**, muted ("Dry" / "Voice");
  - the track (flex 1): **4px** high, radius 2px, border colour, with an accent fill;
  - the thumb: **18px**, card surface, a **2px** accent border and a small shadow;
  - the right end label ("Spacious" / "Music").
  - Use a real `<input type="range">` styled to match, with `aria-label`s.

**Footer buttons on this step**
- **Back:** "‹ Shape".
- **Length:** unchanged.
- **On the right, 10px gap:**
  - **Preview mix:** outline pill, **44px** high, padding **0 16px 0 6px**, sans **14px 600**, with a **32px** play circle in the primary style before the label (8px gap).
  - **"✦ Create meditation"** in the primary style. It does what Generate does today.

**Change panel** (the same shell as the Create flow's picker panel)
- **Size:** **460px** wide for voices, **640px** for sounds.
- **Head:**
  - the eyebrow "Change · Voice" / "Change · Sound";
  - the title in serif **24px** ("Choose a voice" / "Choose a soundscape");
  - close, a **36px** circle.
- **Body:** padding **14px 24px**, a column with a **12px** gap. The list or grid area scrolls; the controls above it stay put.
- **Foot:** "{name} selected" in sans **13px**, body colour, and a **42px** primary button.
- **Voice body:**
  - **Filter chips:** **32px** high, padding 0 12px, pill, 1px border, card surface, sans **13px**, 6px gap. The selected chip has the accent border, accent-tint background and weight 600.
  - **The list:** one column with a **2px** gap.
  - **Each row:** min-height **52px**, padding **0 10px**, radius **10px**, **12px** gap, with:
    - a **32px** play circle;
    - the name in sans **14px 600**, with the description in sans **12px**, muted;
    - the tags: pill, padding 2px 8px, accent tint, sans **11px**, label colour;
    - at the right end, a **20px** slot that holds the check.
  - **The selected row** has the accent-tint background, an accent-tint border and a **20px** accent check circle.
- **Sound body:**
  - **Search:** **40px** high, radius **10px**, 1px border, card surface, padding 0 14px, 8px gap, a 16px search icon, sans **14px**. Placeholder: "Search {n} soundscapes".
  - **Soundscapes / Build your own:** a full-width segmented control (segments flex 1).
  - **Category chips:** as the filter chips, in one line that scrolls sideways.
  - **Scroll area:**
    - the eyebrow "Suggested for this meditation", then **3 columns** with an **8px** gap;
    - a row with the eyebrow "All soundscapes · {n}" on the left and the sort control (sans 12px, muted, "A–Z ▾") on the right, with a 4px top margin;
    - then **2 columns** with an **8px** gap.
  - **Soundscape tile:** flex row, centred, **12px** gap, padding **8px**, radius **12px**, 1px border, card surface.
    - a **56×56** thumbnail (as in the Sound card);
    - a text column with a **4px** gap: the title in serif **15px**, line-height 1.25, one line with an ellipsis; then the category tag (pill, padding 2px 8px, accent tint, sans **11px**, label colour).
    - **Selected:** a **2px** accent border, with padding **7px** so the tile doesn't shift.
    - **Silence:** the thumbnail is an accent-tint square with a **22px** muted-speaker icon in the label colour, and "Voice only" in sans 12px, muted, instead of the tag.

## Layout: mobile (below `md`)

Same behaviour. Only the following differs.

**Step**
- **Summary strip:** the label is "Making".
- **Pick cards:**
  - padding **12px 14px**;
  - in the Voice card, the eyebrow sits alone, with the **full-width** Guided / Open sits control under it (segments flex 1);
  - the voice visual is **40px**; the sound thumbnail is **48×48**;
  - the name is in serif **17px**;
  - the alternatives row stays on **one line and scrolls sideways** (no wrapping), running to the card's edge.
- **Footer buttons:**
  - **Back:** "‹ Shape".
  - **Length:** the compact select.
  - **Preview mix:** a **40px** round outline button with an **18px** headphones icon and `aria-label="Preview mix"`.
  - **"✦ Create":** primary, **40px**.

**Sheets** (the same shell as the Create flow's bottom sheet)
- **Head:** a 10px eyebrow and a serif **20px** title.
- **Foot:** a full-width **44px** primary button, "Use {name}".
- **Voice:** the filter chips in one line that scrolls sideways, then the same rows in one column.
- **Sound:**
  - the search, segmented control and chips as on desktop (the chips scroll sideways);
  - "Suggested for this meditation" in **1 column** with **2** tiles;
  - "All soundscapes" in **1 column**.

## Done when

- **Desktop** matches `SoundStep.png` (all three screens), and **360px** matches `SoundStepMobile.png`, with real data.
- **On desktop, the step itself needs no scrolling.** Only the panel lists scroll.
- **Every capability is still there:**
  - any of the voices and any of the soundscapes can be chosen (via the alternatives or the Change panel);
  - Silence;
  - Build your own (as the rebuilt mixer, with presets, save, per-layer preview, and Play mix);
  - Guided / Open sits;
  - Space;
  - Length.
- **Picks, previews and parameters:**
  - picks and reasons follow the v1 rules;
  - the alternatives swap in one tap;
  - only one preview plays at a time;
  - Preview mix works;
  - Space and Balance reach generation.
- **At 320px:** nothing is clipped, and nothing scrolls sideways except the chip and alternative rows.
- The header, sidebar, Start and Shape are unchanged.
- **Report back:**
  - a list of changed files;
  - any data or API changes (the voice fields, `musicLevel`, Silence, the style → category map);
  - desktop and 360px screenshots of all three states.
