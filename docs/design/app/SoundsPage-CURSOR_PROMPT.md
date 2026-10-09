# Sounds page (`/meditate/sounds`): mixer rebuild + Soundscapes and Voices grids

## Scope

**Only the route `/meditate/sounds` is in scope.** It has three tabs:
- **Part A: Custom sounds** (the preset and mix editor, `/meditate/sounds/preset/:id`). The faders currently don't render; rebuild the fader as a new component rather than patching the current one.
- **Part B: Soundscapes and Voices** (for listening and favouriting).

**Not in scope.** Other parts of the app also show sounds and mixers, and they must not change:
- **the Create flow's Sound step**, including its voice and sound cards, Change panels and sheets;
- **the Create flow's Build your own mixer panel**;
- the audio player strip;
- any other page that lists or plays sounds.

**Shared components:** if any component touched here (a fader, a layer row, a preset list, a soundscape row, a voice row, filter chips) is shared with those places, don't modify the shared version. Create new components for this page and leave the others as they are.

The only effect on Create is the data in "Power switch" below: a mix's `enabled` flags (and `masterVolume`, if added) must be respected when the mix is loaded there.

Also don't touch:
- the header and its tabs, the sidebar;
- colour tokens.

Keep the existing:
- layers, sound options, presets and mixes data;
- audio engine, save logic, playback, favourites and sorting;

except where this prompt says otherwise.

## Reference

`docs/design/app/SoundsPage.dc.html` and `SoundsPage.png`:
- **screen 1:** Custom sounds;
- **screen 2:** Soundscapes;
- **screen 3:** Voices.

Port the structure and px from the HTML source. Ignore the board titles and the sample names and data.

## Colours

Use the existing tokens by role:
- card surface, card border, page background (strip background);
- label/accent text (eyebrows, links), heading, body and muted text;
- **accent:** fader fill, cap border, power-on fill, selected-row inset, filled favourite heart;
- **accent tint:** selected row, factory pill, Master strip, tags;
- the light-accent border (Master strip, factory pill);
- the dark heading colour for the brainwave badge's fill, with light accent text;
- the primary play-circle style and the existing button and chip styles. Use the existing selected-chip style for the active chip; inactive chips are card surface with a 1px border.

---

# Part A: Custom sounds

### Layout

The content is two cards in a row with a **20px** gap, both `align-self: flex-start`. Use the page's existing content area and padding.

#### 1. Presets card (left, **300px**, padding **10px 6px**)

**Section labels:** "Factory presets", then "Your mixes".
- 11px, uppercase, letter-spacing 1.4px, weight 600, label colour, padding **4px 12px 6px**.
- "Your mixes" has the existing **+ New mix** action on the right, as a **28px** dashed light-accent pill (12px, 600, label colour).

**Rows:**
- Padding **10px 12px**, radius **10px**, items centred, **12px** gap.
- Contents, left to right:
  - the existing icon tile at **38×38**, radius **10px**;
  - the name (14px, 600) above the description (12px, muted, one line with an ellipsis). **Hide the description line when there's no description**; don't show "No description";
  - the favourite heart (16px);
  - a **28px** play circle.
- Selected row: accent-tint background plus `box-shadow: inset 3px 0 0` in the accent.

**Other details:**
- A 1px divider between the two sections (margin **8px 12px**).
- Your mixes empty state, in 12px muted text: "Start from a preset, tweak, then "Save as my mix"."
- **Remove the "Voices · No voices yet" section from this list.**

#### 2. Mixer card (right, flex 1)

**Header**
- Padding **18px 20px**, 1px bottom border, items centred, **12px** gap.
- **Name:** serif **26px**.
- **When a factory preset is loaded:**
  - a pill with an 11px lock icon and "Factory preset": padding **2px 10px**, accent tint, light-accent border, 12px label colour, `nowrap`;
  - "Unsaved changes" (12px, muted), shown only when anything differs from the preset.
- **Right side** (`margin-left: auto`, **8px** gap):
  - "Play all": a **40px** outline pill with a 28px play circle;
  - then, for a **factory preset**: "Reset" (outline, 40px, shown only with unsaved changes) and "**Save as my mix**" (primary, 40px);
  - for **one of your mixes**: the existing Save / Save as new / Delete, styled the same way.

**Strips row**
- Padding **18px 20px**, `display: flex`, **12px** gap.
- One layer strip per existing layer, in the existing order, then the Master strip.

### Layer strip

**Container:** flex 1, `min-width: 0`, 1px border, radius **14px**, page background, padding **12px 12px 14px**, a column with a **10px** gap.

**Contents, top to bottom:**
1. **Head row** (space-between, items centred):
   - the layer name: 11px, uppercase, letter-spacing 1.4px, 600, label colour;
   - the **power switch** (below).
2. **Body** (column, **10px** gap). It drops to **opacity 0.55** when the layer is off or its sound is None.
   - **Sound select:** the existing options, None first. **38px** high, radius **10px**, 1px border, card surface, 13px, `nowrap` with an ellipsis.
   - **The fader** (below).
   - **The value:** 14px, 600, tabular numbers. It reads "{n}%" when on, "Off" when switched off, and "–" when the sound is None.
3. **Preview:** a **30px** play circle, centred. It plays this layer alone (existing behaviour). It's disabled, at opacity 0.4, when the layer is off or None.

### Fader (new component)

- **Size:** a vertical slider with an explicit height of **300px**, margin **10px 0**, and a **28px** left gutter for the scale. The explicit height matters: don't let flex collapse it, which is the likely cause of the current bug.
- **Scale:** ticks at 0, 25, 50, 75 and 100. Each is a 10px muted tabular label, right-aligned in an 18px box, plus a 6px × 1px tick line in the border colour, positioned by percentage from the bottom.
- **Track:** **6px** wide, centred, radius 3px, a soft tint background.
- **Fill:** from the bottom up to the value, in the accent (the border colour when dimmed).
- **Cap:** **44×18**, radius **6px**, card surface, a **1.5px** accent border and a small shadow. Inside are two 22px × 1.5px grip lines with a 3px gap, centred on the value.
- **Level meter:** a **4px** bar at the strip's right edge showing the live preview level. Only include it if the audio engine already exposes a level or analyser. Don't fake it.

**Behaviour:**
- Bind to the layer's existing volume value and range.
- Use pointer drag on the cap or the track, and click-to-jump on the track.
- **Keyboard:** arrows ±1, PageUp/PageDown ±10, Home/End.
- **Accessibility:** `role="slider"`, `aria-orientation="vertical"`, `aria-valuemin/max/now`, and `aria-label="{layer} volume"`.
- **Dimmed:** while dimmed (off or None) it can't be dragged.

### Power switch (replaces mute/solo; there's no M/S)

- **Shape:** a **28px** circle with a 14px power icon, `role="switch"` and `aria-checked`.
- **On:** accent fill, white icon. **Off:** card surface, 1px border, muted icon.
- **When the sound is None:** disabled, at opacity 0.5.
- **Data:** add `enabled: boolean` (default `true`) to each layer in presets and mixes. Turning a layer off **keeps its sound and volume**, so turning it back on restores them.
- **What it affects:** Play all, Master and generation all skip disabled layers.
- **Build your own step:** when a mix is loaded there, its layers' `enabled` states come with it.

### Master strip

- **Container:** **120px** wide, a light-accent border, accent tint, radius 14px, padding **12px 12px 14px**, a column with a **10px** gap.
- **Contents:**
  - a **28px**-high centred row reading "Master" (eyebrow style);
  - a **38px**-high centred row reading "{n} layers on" (12px, muted);
  - the fader;
  - the value;
  - a 30px play circle that runs Play all.
- **Data:** if mixes have no master gain yet, add `masterVolume` (0–100, default 100), apply it to playback and generation, and tell me.

### Factory presets are locked

- Factory presets can be edited **in memory only**. They can never be saved over.
- **Any change** shows "Unsaved changes" and "Reset".
- **"Reset"** restores the preset's values.
- **"Save as my mix"** opens the existing save-as / name flow, creates a new mix under Your mixes, and selects it.

---

# Part B: Soundscapes and Voices

### Shared toolbar

- **Layout:** one row, items centred, **8px** gap.
- **Chips:** padding **7px 14px**, pill radius, 13px, `nowrap`.
- **Right side** (`margin-left: auto`, **10px** gap): the existing sort control as a quiet "A–Z ▾" text control (13px, body colour).
- **Count label:** under the toolbar, "All soundscapes · {n}" or "All voices · {n}", in 11px, uppercase, letter-spacing 1.4px, 600, label colour.
- **Spacing:** a **14px** column gap between the toolbar, the label and the grid.

### Soundscapes

**Chips**
- Order: **All**, **♡ Favourites**, **Our picks**, then the existing categories.
- If they don't fit on one row, keep the first ones and move the rest into **Filter**, together with any other tag facets that exist (brainwave, etc.).

**Filter button**
- An outline pill with a filter icon, in the right-hand group before the sort.
- It opens a popover with those extra options as chips.

**Grid**
- `repeat(auto-fill, minmax(220px, 1fr))`, **14px** gap.

**Card**
- Card surface, 1px border, radius **14px**, overflow hidden.
- **Image:** **128px** high, `object-fit: cover`, with a bottom scrim (transparent at 50%, about 35% of the dark heading colour at the bottom).
  - play: a **36px** play circle at left **10px** / bottom **10px**;
  - favourite: a **30px** white circle at right **10px** / top **10px**, with a 15px heart (filled in the accent when favourited).
- **Body:** padding **10px 12px 12px**, a column with a **6px** gap.
  - **Title:** serif **16px**, line-height 1.25, one line with an ellipsis.
  - **Tags row** (**4px** gap, wraps):
    - the brainwave tag first, as a badge: padding **2px 9px**, pill, 11px, weight 600;
    - then up to **3** other tags as tint pills: padding **2px 9px**, 11px, label colour.

### Voices

**Chips**
- **All**, **♡ Favourites**, **Female**, **Male**, then **Accent ▾**.
- Accent ▾ is a single dropdown listing the existing accents. It replaces the separate accent chips.

**Grid**
- `repeat(auto-fill, minmax(320px, 1fr))`, **14px** gap.

**Card**
- Card surface, 1px border, radius **14px**, padding **16px**, items centred, **14px** gap.

**Avatar (64px circle)**
- The voice's portrait, `object-fit: cover`.
- **No portrait:** the voice's initials (up to 2) in serif, around 25px, label colour, centred on an accent-tint circle with a 1px light-accent border. No empty placeholder circles.

**Text** (flex 1, `min-width: 0`, **3px** gap)
- name: serif **18px**;
- description: the existing descriptor, 13px, muted.

**Right column**
- A column with a **10px** gap, items centred.
- A **36px** play circle, then a 17px favourite heart.
