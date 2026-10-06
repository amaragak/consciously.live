# Create flow: Format vs Context, and per-session program lengths

Two related changes to the Create flow. Apply both.

## 1. Per-session lengths (program, "One per session")

### Goal
When a program is attached in **One per session** mode, each session can have its own length.
- Sessions start at the **program's default lengths** (which already exist in the program data, e.g. Introduction 5 min, other sessions 10 min).
- The user can override any single session.
- The footer Length control becomes the "apply to all" control.

**Reference:** `docs/design/app/ProgramLengths.dc.html` and `ProgramLengths.png`. The three frames are: program defaults, customised (with the pill menu open), and narrow expanded.
- Read the source of the checklist rows, the pills, the menu and the Sessions header, and port their structure: the same elements, nesting, borders, radii, padding, gaps and font sizes.
- Everything else in the frames is context. Leave it as it is.

### Colours
Don't take colours from the design file. Use the existing tokens for each role:
- pill border and muted text;
- the accent and accent tint (custom pills, the open ring, the selected menu row);
- card surface, border and shadow for the menu;
- label colour for the ✓ and the "Reset" item;
- body and heading text.

### Don't touch
- Layout, widths and breakpoints, the rail and header structure, and the program card apart from the checklist rows and Sessions header.
- The chat, the footer buttons, and the Start and Sound steps.

### State
- **Per-session length:** each session's length is its program default, unless the user overrides it. Store the overrides per session id in the flow state.
- **Generation:** it receives the length of each selected session.
- **"One meditation" mode:** it ignores per-session lengths and uses the footer Length, as it does today.

### Checklist rows (rail card, and the narrow expanded header)
**Row:** the checkbox, then the title (flex 1, `min-width: 0`, one line with an ellipsis), then the **length pill** pushed to the right. Items centred, **8px** gap, with **8px** between rows.

**Pill:**
- **24px** high, padding **0 8px**, pill radius, sans **12px**, `nowrap`;
- the text "{n} min" followed by a small ▾ (9px, muted).

**Pill states:**

| State | Style |
|---|---|
| Default (equals the program default) | transparent background, 1px border, muted text |
| Custom (differs from the program default) | accent-tint background, accent border, heading text, weight 600 |
| Open | card surface, accent border, a 3px accent-tint ring, weight 600 |

- **Unchecked sessions:** hide the pill.
- **"One meditation" mode:** no pills on any row.

**Pill menu:**
- Use the app's existing menu/popover component, positioned under the pill. It **opens upward** when there isn't room below.
- **Container:** **230px** wide, card surface, 1px border, radius **12px**, a soft shadow, padding **6px**, items 2px apart.
- **Items:** the **same length options as the footer Length control**. Each item is **32px** high, padding 0 10px, radius **8px**, sans **13px**, body colour. The selected item has the accent-tint background, weight 600 and a ✓ in the label colour on the right.
- **When the session is custom:** a 1px divider, then "**Reset to program ({default} min)**" (13px 600, label colour, `nowrap`), which clears the override.

### Sessions header
- The left side becomes "Sessions · {selected} of {total} · **≈ {sum} min**".
- The sum covers the **checked** sessions, in weight 600, body colour. It updates live.
- In "One meditation" mode, drop the sum.
- **All · None** stay as they are.

### Footer Length (only in program "One per session" mode)
**Displayed value:**
- **"Program"** when every session uses its program default;
- **"{n} min"** when every selected session has the same length because the user applied it from the footer;
- **"Mixed"** otherwise.

**Menu:**
- First item: "**Program lengths**", which clears all overrides.
- Then the usual options. Choosing one **applies that length to every session** and replaces any custom values.

In every other mode the footer Length works exactly as now.


## 2. Format and Context

### Goal
Split what you can attach into two kinds:
- **Format** (pick one): **Style** or **Program**. These are mutually exclusive.
- **Context** (add any): **Journal** and **Goal**.

Show this split on Start and in the Shape rail. Program and Style can then never both be attached, and the UI makes the either/or obvious.

**Reference:** `docs/design/app/FormatContext.dc.html` and `FormatContext.png`. The frames are: Start empty, Start with a format chosen, Shape, and mobile Start.
- Port the **grouping, labels, the "or" badge and the rail cards**.
- **Don't change the tiles themselves.** Keep the existing Start tiles exactly as they are now: their square images, sizes, copy and styling. The tiles in the design file are stand-ins.

### Colours
Don't take colours from the design file. Use the existing tokens for each role:
- label colour and muted text for the group labels;
- a subtle tint for the Format group background (the same token as the segmented-control track);
- card surface with an accent-tint border for the "or" badge;
- the existing rail card tokens.

### Start
**Group label:** above each tile group, an 8px gap above the tiles.
- the group name in the existing eyebrow style (11px, uppercase, letter-spacing 1.4px, 600, label colour);
- then " · pick one" / " · add any" in muted, weight 500, letter-spacing 1px.

**The groups:**
1. **"Format · pick one":** the **Style** and **Program** tiles.
   - They sit inside a wrapper: padding **8px**, radius **14px**, the subtle tint background, `role="radiogroup"`, `aria-label="Format"`.
   - **Between the two tiles** is a round "**or**" badge: **28px**, card surface, 1px accent-tint border, sans **11px 600**, letter-spacing 0.5px, label colour, vertically centred. It overlaps the gap (margin 0 -6px) and sits above the tiles.
2. **"Context · add any":** the **Journal** and **Goal** tiles, with no wrapper.

**Layout:**
- **Desktop:** the two groups sit side by side in one row, with a **24px** gap, aligned to the top.
- **Mobile (below `md`):** Format first, then Context, with a **14px** gap. The Format wrapper's padding is **6px**.

**Behaviour:**
- **Choosing a format:** once Style or Program is attached, **hide the whole Format group, including its label**. The token in the composer shows what was chosen, and removing that token brings the group back.
- **Context tiles:** these still drop out individually once attached, as now. When both are attached, hide the Context group and its label.
- **Remaining tiles** keep their normal size and stay left-aligned. They don't stretch to fill the row.
- **Sub-line under the H1:** "Write a line, choose a format, add context, or any mix. Then talk it through or skip to audio."

### Shape: wide layout (rail)
**Rail order:** You're making → **Format** → **Context**.

**Format card:** the same rail card shell as the others.
- **Style attached:**
  - **Eyebrow row** (space-between, baseline): "**Format · Style**", and "{i} of {n}" in sans 12px, muted, on the right.
  - **Top row** (centred, **10px** gap):
    - the style image at **36×36**, radius 8px;
    - the style name in serif **16px**, flex 1;
    - **×** (14px, muted, `aria-label="Remove format"`).
  - **A 1px hairline**, then the existing questions checklist and "Show as form", unchanged.
- **Program attached:** the eyebrow becomes "**Format · Program**". The rest is the existing program card content, unchanged: cover, title, ×, the toggle, sessions, and the lengths from section 1.
- **No format:** hide the card.

**Context card:**
- Only **journal entries and goals**.
- The add chips are only "**+ Journal**" (always shown, since you can attach several entries) and "**+ Goal**" (hidden once a goal is attached).
- **Never** offer "+ Style" or "+ Program" here. The format is chosen on Start; removing it with × makes Start's Format group available again.

### Shape: narrower layouts (panel header)
- **Chip row:** the format token first (if any), then the context tokens, then only "+ Journal" / "+ Goal".
- **Program:** the collapsible program row stays as it is now.

### Exclusivity
- With the UI above, Style and Program can't both be attached. Remove any code that silently replaced one with the other.
- **Deep links** that arrive with both keep the program and drop the style.

## Done when
**Lengths:**
- **Defaults:** a fresh program shows the program's default lengths (e.g. 5 / 10 / 10 / 10 / 10), the total "≈ 45 min", and the footer reads "Program".
- **Overrides:** a per-session override makes its pill custom, updates the total and sets the footer to "Mixed". "Reset to program" restores the default.
- **Footer menu:** choosing a value applies it to all sessions. "Program lengths" restores the defaults.
- **Generation:** each session is generated with its own length.
- **"One meditation" mode:** no pills, and the footer is unchanged.

**Format and Context:**
- **Start, empty:** shows the "Format · pick one" group (Style or Program, with the "or" badge) and the "Context · add any" group, with the existing tiles unchanged.
- **Choosing a format** hides the Format group, and removing the token restores it.
- **Shape rail:** shows You're making → Format (Style or Program) → Context (journal and goal only). No surface offers "+ Style" or "+ Program" after a format is chosen.
- **Exclusivity:** Style and Program can never both be attached.

**Report back:** list the files changed and any data or API changes.
