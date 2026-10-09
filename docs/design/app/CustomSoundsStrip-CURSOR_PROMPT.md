# Custom sounds: preset chip rows, full-width mixer, mobile layout

## Scope

**This is an update to the current implementation of `/meditate/sounds`, Custom sounds tab only.** The existing mixer (vertical faders, power switches, Master strip, factory lock) stays as built, except for the changes below.

**Not in scope.** Other places that show sounds or mixers must not change:
- the Create flow's Sound step and its Change panels and sheets;
- the Create flow's Build your own mixer;
- the audio player strip;
- the Soundscapes and Voices tabs;
- the header and its tabs, and the sidebar;
- colour tokens.

**Shared components:** if a component touched here is shared with those places, make a new one for this page.

## Reference

`docs/design/app/CustomSoundsStrip.dc.html` and `CustomSoundsStrip.png` show three screens:
1. **Desktop:** the default.
2. **About 1100px wide, sidebar showing:** with the "+n more" popover open.
3. **Mobile.**

Port the structure and px from the HTML source. Ignore the board titles and the sample names.

## Colours

Use the existing tokens, as in the current build:
- card surface and card border, label/accent text, heading and muted text;
- accent and accent tint (selected chip), the light-accent border (dashed "+ New mix");
- the page background (the "+n more" chip);
- the primary play-circle style and the existing button styles.

## 1. Replace the presets column with chip rows (at `md` and up)

**Remove** the left presets list card. The page becomes a single column: the **presets card**, then the **mixer card** at full width, with a **14px** gap.

**Presets card**
- Card surface, 1px border, radius **16px**, padding **12px 16px**, a column with an **8px** gap.
- Two rows, **Factory** and **Your mixes**. Each row:
  - is `display: flex`, items centred, **8px** gap;
  - is **exactly one line**, with no wrapping and no horizontal scrolling;
  - starts with a label in an **84px** box: 10px, uppercase, letter-spacing 1.4px, 600, label colour.

**Preset chip**
- **Container:** **40px** high, padding **0 6px**, pill radius, 1px border, card surface, **8px** gap, `flex-shrink: 0`.
- **Contents:**
  - the existing preset icon in a **28px** tile, radius **8px**, with its existing tint;
  - the name in 13px, 600, `nowrap`;
  - a **26px** play circle that previews the preset, as the list's play button does now.
- **Click:** clicking the chip anywhere except the play button loads that preset into the mixer.
- **Loaded:** accent-tint background with a **1.5px** accent border.

**"+ New mix"**
- A dashed light-accent pill, **40px** high, padding **0 14px**, 13px, 600, label colour.
- It's **always the last item** in the Your mixes row and is never hidden.

## 2. Overflow: "+n more" (no horizontal scrolling)

**Fitting chips to one line**
- Measure the available width with a ResizeObserver and show as many chips as fit on one line. Leave room for "+n more" (and for "+ New mix" in Your mixes).
- If any are hidden, end the row with a **"+{n} more ▾"** chip: **40px**, padding **0 14px**, pill, 1px border, page-background fill, 13px, 600, body text, ▾ muted.

**Order of visible chips:** favourites first, then most recently used, then the rest. The **loaded preset is always visible**. If it would be hidden, swap it in for the last visible chip.

**Popover**
- **Placement:** clicking "+n more" opens a popover anchored below that chip, **340px** wide, card surface, 1px border, radius **14px**, a soft shadow, padding **10px**, a column with a **4px** gap.
- **Contents:**
  - a search field (**38px**, radius **10px**, 1px border, search icon, placeholder "Search your mixes"), shown only when the group has more than 8 items. It filters by name;
  - a group heading, e.g. "Your mixes · {total}" (10px uppercase label style, padding **6px 10px 2px**);
  - every item in the group as a compact row (padding **8px 10px**, radius **10px**, **10px** gap): a **32px** icon tile, then the name (13px, 600) above its layers summary (11px, muted, ellipsis), then a heart (15px), then a **26px** play circle. The loaded item gets the tint;
  - a footer line, "Favourites and recently used appear first in the row." (12px, muted).
- **Behaviour:** choosing a row loads it and closes the popover. Esc or a click outside also closes it.
- **Applies to both groups:** Factory uses the same mechanism if it ever overflows.

## 3. Mixer card: full width, favourite in the header

**Favourite**
- Move favouriting out of the list: add an **18px** heart directly after the mix name in the mixer header, with a **12px** gap.
- It's filled in the accent when the loaded preset is a favourite, and toggles it.

**Strips**
- Layer strips are `flex: 1` with **`min-width: 112px`**, and the Master strip stays **120px**, so all strips fit from `md` upwards with no cropping.
- **Fader height:** **300px** at the existing `xl` breakpoint and up, **240px** from `md` to `xl`.
- The sound select truncates with an ellipsis.

## 4. Below `md` (mobile)

**No separate list page.** The tab shows the presets card on top and the mixer below. Remove the "‹ Sounds" back step.

**Presets card on mobile**
- Padding **10px 12px**, radius **16px**, a column with a **6px** gap.
- Each group is a label line (with "+ New mix" right-aligned on the Your mixes label line), then its chips, which **wrap to at most 2 lines**. Anything beyond goes behind "+n more".
- **Chips:** **34px** high, a **22px** icon tile with radius **6px**, padding **0 12px 0 6px**, and **no play button** (tap to load).
- **"+n more"** opens a **bottom sheet** with the same contents as the desktop popover.

**Mixer on mobile**
- **Header:** the mix name in serif **22px** on its own line, with the factory pill and "Unsaved changes" underneath. The heart sits after the name.
- **Layers:** one card. Each layer is a row separated by 1px hairlines, padding **14px 16px**, a column with a **10px** gap.
  - **Line 1:** the layer label on the left; a **30px** preview play circle and the power switch on the right.
  - **Line 2:** the sound select, full width, **40px**.
  - **Line 3:** a **horizontal** fader (the same component, horizontal orientation), with the value ("50%", "Off" or "–") right-aligned in a **40px** box.
  - **Horizontal fader:** track **6px** high, accent fill from the left, and a **18×34** cap with vertical grip lines. Same keyboard and ARIA, with `aria-orientation="horizontal"`.
- **Master:** a last row on the accent tint with a light-accent top border: "Master", "{n} layers on" (12px, muted), then its horizontal fader.
- **Off or None layers:** dimmed, exactly as on desktop.

**Sticky bottom action bar**
- Padding **12px 14px 18px**, a 1px top border, page background, and a soft upward shadow. Items centred, **8px** gap.
- **Factory preset:** a **48px** Play all icon button, then Reset (outline, 48px), then "Save as my mix" (primary, 48px, flex 1).
- **Your own mix:** a 48px Play all icon button, then ⋯ (outline, 48px; its menu holds Delete), then "Save as new" (outline, flex 1), then "Save" (primary, flex 1).
- Add bottom padding to the page so the bar never covers the Master row.
