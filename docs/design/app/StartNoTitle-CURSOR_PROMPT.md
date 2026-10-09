# Create · Start: remove the page title

## Scope

**This is the only change: the Create flow's Start step.** Desktop and mobile.

Don't touch:
- the composer's other contents (program/context tokens, the length chip, mic, send);
- the Format and Context tiles, "Surprise me", the footer;
- the header, the sidebar, the stepper;
- other steps and pages;
- colour tokens.

## Reference

`docs/design/app/StartNoTitle.dc.html` and `StartNoTitle.png`:
- **A:** the returning user.
- **B:** the first visit, with the hint.

Port only the parts listed below. Ignore the board titles and the sample content.

## Changes

### 1. Remove the visible title and description

1. Remove the "What's this one for?" heading and the "Write a line, choose a format…" paragraph.
2. In their place, render a visually hidden `<h1>Create</h1>`, using the app's existing `sr-only` utility, so screen readers and the document outline still get a page heading.
3. Remove the space the title and description took up as well. The composer becomes the first visible element, at the step's existing top padding.

### 2. "Brief" label in the composer

At the top of the composer, above the text field, add the label **"Brief"**.
- Use exactly the same style as the composer's existing **"Program"** label: same size, letter-spacing, uppercase and muted colour. Reuse that element or class.
- Leave **6px** between the label and the text field.
- The label is always shown.
- Associate it with the text field (`<label for>` or `aria-labelledby`).

### 3. Placeholder

Change the composer placeholder to: **"What's this one for? e.g. can't switch off after work…"**

### 4. First-visit hint

**When to show it:** on every visit to Start, until the user dismisses it. It's tied only to dismissal, not to how many meditations the user has made.

**What it is:** one row, directly above the composer, using the step's existing vertical gap.
- **Container:** padding **10px 14px**, radius **12px**, accent-tint background, 1px light-accent border, items centred, **10px** gap.
- **Content, left to right:**
  1. "✦" in the label/accent colour;
  2. "Write a line, choose a format, add context, or any mix. Then talk it through or skip to audio." in sans **14px**, body colour;
  3. a dismiss **×** on the right (`margin-left: auto`): a **14px** icon from the existing icon set, muted, with `aria-label="Dismiss"`.

**Dismissing:** clicking × hides it until the user turns it back on.
- Store this as a user preference, e.g. `showCreateHint: boolean`, default `true`.
- If the app has a server-side preferences store, use that so it follows the user across devices. Otherwise use localStorage.

### 5. Setting to show it again

Add a toggle to the **existing Settings page**: **"Show tips on Create"**, bound to the same preference.
- Pick the most fitting existing section yourself, for example a general, preferences or Meditate section. If there's no natural fit, add it to the most general section rather than creating a new page.
- Use the settings page's existing toggle component and row styling.
- Tell me where you put it.

**Mobile:** same row. The text may wrap to two lines, and × stays top-aligned.
