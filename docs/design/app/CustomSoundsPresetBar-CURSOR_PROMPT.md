# Custom sounds: plugin-style preset bar

## Scope

**This is an update to the current implementation of `/meditate/sounds`, Custom sounds tab only.**

Keep the mixer strips exactly as they are now:
- the vertical faders;
- the power switches;
- the sound selects;
- the per-layer preview;
- the Master strip.

What changes:
- the presets list card is replaced by a compact preset bar in the mixer header;
- the save and delete buttons are replaced by a split button;
- the mobile layout changes.

**Not in scope.** These must not change:
- the Create flow's Sound step and its Change panels and sheets;
- the Create flow's Build your own mixer;
- the audio player strip;
- the Soundscapes and Voices tabs;
- the header and its tabs, and the sidebar;
- colour tokens.

**Shared components:** if a component touched here is shared with those places, make a new one for this page.

## Reference

`docs/design/app/CustomSoundsPresetBar.dc.html` and `CustomSoundsPresetBar.png` show three screens:
1. **Desktop:** with the preset dropdown open.
2. **About 1100px wide:** an own mix loaded, with the Save ▾ menu open.
3. **Mobile.**

Port the structure and px from the HTML source. Ignore the board titles and the sample names.

## Colours

Use the existing tokens, as in the current build:
- card surface and card border, label/accent text, heading and muted text;
- **accent:** the unsaved dot, the open-state border, and a filled heart;
- **accent tint:** the selected menu row;
- each preset's existing icon tile tint;
- the primary button style for the Save split button;
- outline styles for the arrows and the Play all button.

## 1. Remove the presets list card

Remove the left presets card (Factory presets / Your mixes / + New mix). The mixer card becomes the whole page content at full width.

**Strips:** `flex: 1` with **`min-width: 112px`**. The Master strip stays **120px**.

**Fader height:** **400px** at the existing `xl` breakpoint and up, **340px** from `md` to `xl`.

## 2. Preset bar (the mixer card's header)

This replaces the current header (the name on the left, and Play all, Save, Save as new and Delete on the right).

**Container:** padding **12px 16px**, a 1px bottom border, items centred, **10px** gap.

**Left to right:**

1. **‹ (previous preset):** a **34px** outline circle. It steps through the presets in menu order and wraps around.

2. **Preset dropdown button:**
   - **Container:** **42px** high, radius **12px**, 1px border, card surface, padding **0 12px 0 6px**, **10px** gap. When open: a **1.5px** accent border plus a 3px accent ring at 20%.
   - **Contents, left to right:**
     - the preset's existing icon in a **30px** tile, radius **8px**;
     - the name in serif **20px**, with an ellipsis;
     - a **12px** lock icon (muted), only for factory presets;
     - a **7px** accent dot, only when there are unsaved changes (`title="Unsaved changes"`);
     - ▾ at 11px, muted.
   - **Behaviour:** clicking it opens the preset menu (below).

3. **› (next preset):** the same as ‹.

4. **Heart:** **18px**. It toggles favourite for the loaded preset (filled in the accent when it's a favourite).

5. **Status text:** 12px, muted, `nowrap`. It reads "Factory · unsaved changes", "Factory", "unsaved changes" or "saved", as appropriate.

6. **Right side** (`margin-left: auto`, **8px** gap):
   - **Play all:** a **42px** outline circle containing a 32px play circle (`aria-label="Play all"`). It plays and stops the mix, as now.
   - **Save split button:** **42px** high, pill, primary style, with a 1px divider between its two parts.
     - **Main part:** padding **0 16px 0 18px**, 14px, 600. It reads "**Save**" for one of your mixes; it's disabled when there are no changes. It reads "**Save as…**" for a factory preset, and opens the existing save-as / name flow.
     - **▾ part:** padding **0 12px**. It opens the save menu (below).

## 3. Preset menu (dropdown)

**Container**
- Anchored below the dropdown button, left-aligned, **6px** gap.
- **300px** wide, card surface, 1px border, radius **14px**, a soft shadow, padding **8px**.
- Max height about 70vh, scrolling inside.

**Contents, in order**
1. **Search field:** **36px**, radius **10px**, 1px border, a search icon, placeholder "Search presets". It filters all the sections by name.
2. **Sections**, each with a heading in 10px uppercase, letter-spacing 1.4px, 600, label colour, padding **8px 8px 2px**:
   - **♡ Favourites:** only if there are any. It holds factory presets and own mixes.
   - **Factory.**
   - **Your mixes.**
3. **Rows:**
   - padding **6px 8px**, radius **8px**, **10px** gap;
   - the existing icon in a **26px** tile;
   - the name in 14px;
   - for factory presets, an 11px lock in muted;
   - the loaded preset gets the tint, weight 600 and ✓ on the right.
4. **Footer:** "**+ New mix**" (13px, 600, label colour), with a 1px top border and padding **8px 8px 2px**. It creates and loads a new untitled mix (the existing behaviour).

**Behaviour**
- Choosing a row loads it and closes the menu.
- Esc or a click outside closes it.
- Use full keyboard support: arrows move, Enter loads, and typing focuses the search.
- **Unsaved changes:** if the current preset has unsaved changes, use the app's existing unsaved-changes confirm before switching. If there isn't one, add a simple confirm: "Discard changes to {name}?" with Discard / Cancel.

## 4. Save menu (from ▾)

**Container**
- Anchored below the split button, right-aligned.
- **210px** wide, card surface, 1px border, radius **12px**, a soft shadow, padding **6px**.

**Items** (padding **8px 10px**, radius 8px, 14px)
- **Save as new…:** the existing save-as flow.
- **Rename…:** own mixes only.
- **Revert to saved:** restores the last saved state (for a factory preset, its factory values). Disabled when there are no changes.
- A 1px divider.
- **Delete mix:** own mixes only. Use the existing delete confirm.

## 5. Below `md` (mobile)

There's no separate list page. Remove the "‹ Sounds" back step and the list view. The tab shows one card.

**Card contents, top to bottom**

1. **Preset bar row:** padding **10px 10px 6px**, **8px** gap.
   - **‹**, then the dropdown button at `flex: 1` (name in serif **18px**), then **›**.
   - The menu opens as a **bottom sheet** with the same contents.
2. **Status row:** padding **0 14px 10px**, 1px bottom border, **8px** gap. A 16px heart, then the status text.
3. **Layer rows:** each layer is a row separated by 1px hairlines, padding **14px 16px**, a column with a **10px** gap.
   - **Line 1:** the label; then, on the right, a **30px** preview play and the power switch.
   - **Line 2:** the sound select, full width, **40px**.
   - **Line 3:** a **horizontal** fader with the value ("50%", "Off" or "–") right-aligned in a **40px** box.
   - **Horizontal fader:** the same component in horizontal orientation. Track **6px**, accent fill from the left, an **18×34** cap with vertical grip lines, and `aria-orientation="horizontal"`.
   - **Off or None layers:** dimmed, as on desktop.
4. **Master row:** accent tint with a light-accent top border. "Master" and "{n} layers on" (12px, muted), then its horizontal fader.

**Sticky bottom bar**
- Padding **12px 14px 18px**, a 1px top border, page background, a soft upward shadow, **8px** gap.
- **Contents:**
  - a **48px** Play all icon button;
  - a **48px** "⋯" outline button that opens the save menu as a sheet;
  - the main save action as a primary button, **flex 1**, 48px, reading "Save as…" or "Save".
- Add bottom padding to the page so the bar never covers the Master row.
