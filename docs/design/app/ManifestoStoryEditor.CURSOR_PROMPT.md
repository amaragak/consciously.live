# Manifest › Story: editor tools, prompt labels, opener prompt, mobile layout, "Prepare for narration"

This updates the Story feature as it is now, including the plain-surfaces change. Change only what's listed here. Everything else stays as built.

## Reference

`docs/design/app/ManifestoStory.dc.html` and `ManifestoStory.png`, top to bottom:

| Row | Desktop | Mobile |
|---|---|---|
| **A** | writing | writing, and the All prompts sheet |
| **D** | Raise the ceiling | Raise the ceiling sheet |
| **C** | guidelines | guidelines |
| **B** | the third-person version with Narrate | the story, scrolled to the end |

Port the structure and px from the HTML source. Ignore the board captions and sample text.

**Styling:**
- **Colours:** existing tokens by role only. Use the label/accent text, muted text, accent, light accent, accent tint, card surface and card border, and the primary and outline buttons.
- **Chevrons:** wherever the design shows one, use the app's standard chevron icon at its standard size.

---

## 1. Rename "Make it my story" to "Prepare for narration"

- Change the label everywhere: the button, the mobile button and any copy that refers to it. Keep the wand icon.
- **Guideline VI** now reads: "Write "I". We'll turn it into the third person, by name, when you prepare it for narration."
- **Guideline V** now reads: "About 1,400 words makes ten minutes of listening. Use the mic if typing slows you down."
- Behaviour, endpoint and versions are unchanged. It stays disabled under 150 words.

## 2. Header card toolbar (desktop, A and D)

The toolbar row inside the header card now holds only two things:
- **Left:** "How to write it" (book icon, 13px, 600, label colour), as now.
- **Right:**
  - the hint "Third person, tidied, ready to record" in 13px muted;
  - then "**Prepare for narration**" (primary, 44px), with a **10px** gap between them.

Remove the "Talk it out" and "Raise the ceiling" buttons and the divider from this row. They move into the editor (section 3).

## 3. Editor tools: mic and Raise the ceiling (desktop and mobile)

### Desktop

The writing card's header row keeps "My life vision" and the rule. On the right, "Write it however it comes" is replaced by two controls with an **8px** gap:

1. **"Raise the ceiling" pill.**
   - Shape: **34px** high, padding 0 12px, fully rounded.
   - Colours: accent-tint fill, a 1px light-accent border.
   - Content: the sparkle icon in label colour, then the label in 12px, 600, heading colour, with normal case and letter-spacing.
   - Same action as before (state D).
2. **Mic button.**
   - Shape: **34px** circle, card surface, a 1px card-border border, mic icon 15px.
   - `aria-label` and tooltip: "Talk it out".
   - Same dictation as before. While recording, show the app's existing active/recording state on this button.

The same header row is used in state D.

### Mobile

The editor card's header row holds just the two controls, left-aligned: the pill and a **32px** mic. Drop the "My life vision" label and the rule.

## 4. Prompt labels in the editor

Picking a prompt now inserts it into the editor as a small label. The label is an editor-only cue.

### Data

Add a node type to the draft's rich text:

```
promptLabel { promptId, text, collapsed: boolean }
```

- **What a label owns:** the paragraphs after it, up to the next label, section break or the end.
- **Saving:** `collapsed` is saved with the draft, so the state persists for the user.

### Never part of the story

Labels must be left out of all of these:
- the word count and the listening meter;
- "Prepare for narration" (strip them before sending);
- "Raise the ceiling" analysis;
- narration;
- any export or print, including the story on the Manifesto print.

### Label UI (desktop)

- **Layout:** a row, centred vertically, with a **6px** gap and margin **6px 0 -6px**, so it sits close above its first paragraph.
- **Contents, in order:**
  1. The chevron, 14px, muted. It points down when open and right when collapsed.
  2. The question in the app's sans, 12px, 600, letter-spacing 0.2px, label colour. One line, truncated with an ellipsis.
  3. A 1px card-border rule (`flex: 1`).
  4. On the right:
     - when collapsed, "{n} words" in 12px muted;
     - an × (13px muted) on hover or focus, and always on the label that's just been inserted. It removes the label but keeps the paragraphs.
- **Collapsing:** clicking the chevron or the question toggles `collapsed`. Collapsed hides the paragraphs it owns.

### Label UI (mobile)

- The row aligns to the top, the question wraps instead of truncating, and there's no rule.
- The count and × sit at the right.

### Inserting a label

**From a prompt row, or "+ Answer" on mobile:**
- If the cursor is in the editor, insert the label after the current paragraph. Otherwise insert it at the end.
- Follow it with an empty paragraph and put the cursor in it.
- On mobile, close the prompts sheet and focus the editor.

**Placeholder** for that empty paragraph: "Write your answer…" in italic serif, muted, at the editor's size.

**If the prompt is already in the draft,** scroll to its label and expand it instead of inserting it again.

### Prompts list

- **Done is derived from the labels:** a prompt counts as done when its label exists in the draft. Remove manual toggling.
- **Done rows:** muted, struck through, with the check icon, as now.
- **Clicking a row:** inserts its label, or scrolls to it if it's already there. It no longer toggles.
- `promptsDone` is now computed from the labels. Drop the stored field, or keep it in sync.

### Go bigger

Base the next question on the text under the label the cursor is in, rather than the last ~300 words. Without a label, keep the current behaviour.

## 5. Opener prompt

- **Text:** add to the prompt library with id `start-here`: "**Everything worked out, and then some. What does your life look like now?**"
- **In the list:** pin it first under "All", with a "Start here" eyebrow (10px caps, letter-spacing 1.2px, 600, label colour) above the question.
- **A new draft** starts with this label already inserted, followed by an empty paragraph with the cursor in it.
  - Its placeholder is "**Start with the big picture. The details can come later.**"
  - This replaces the old empty-editor placeholder "Start anywhere. Who are you, now that it's all true?"
- **Otherwise it behaves like any other label:** it can be collapsed and removed, and it's never exported or narrated.

## 6. Mobile layout (below `md`)

Remove the "Talk it out" and "Make it my story" buttons that currently sit below the Go bigger box at the end of the page. Their replacements are the mic in the editor and "Prepare for narration" in the header card. Nothing on this page is pinned to the bottom of the screen.

### A: writing

The cards, top to bottom, with a **12px** gap:

1. **Header card** (padding **14px 16px**, **12px** gap):
   - a row with "Your story" (serif 24px) and, on the right, "How to write it" (book icon, 12px, 600, label colour). This replaces the old "Prompts" link.
   - the compact meter;
   - "**Prepare for narration**" (primary, 44px, full width).
2. **Prompt card** (padding **12px 16px**, **8px** gap):
   - **Top row:** "Prompt" in 10px caps, letter-spacing 1.4px, 600, muted. On the right, "**All prompts**" (sparkle icon, 12px, 600, label colour), which opens the All prompts sheet.
   - **The current prompt:** serif 16px, line-height 1.4, with a "**+ Answer**" pill on the right (30px, accent tint, 1px light-accent border, 12px, 600). The pill inserts the label (section 4).
   - "**Shuffle**" (12px, 600, label colour) shows the next prompt.
3. **Writing card:** the editor tools row (section 3), the fixed line, then the editor with labels.
4. **Go bigger box,** as built.

### All prompts sheet

- **Container:** a bottom sheet, card surface, top radius **22px**, over a dimmed backdrop. It starts about 150px from the top.
- **Top:** a grab handle, then a header row with the sparkle icon, "Prompts" (11px caps, letter-spacing 1.4px, 600) and an × on the right.
- **Contents,** as the desktop Prompts card, with padding **0 18px 18px** and a **10px** gap:
  - the topic chips;
  - the "Include my life areas" switch with its chips;
  - the "Include my values" switch with its chips;
  - the prompt rows, with "Start here" first;
  - "Shuffle prompts".

### D: Raise the ceiling

- **Highlights:** they stay inline in the writing card. There's no floating popover on mobile.
- **Sheet:** the results open as a bottom sheet, starting about 400px from the top, with the same handle and header as above ("Raise the ceiling").
- **Sheet contents** (padding **0 18px**, **12px** gap):
  1. the ambition read and bar;
  2. "{n} places you played it safe" in serif 19px;
  3. the findings list.
- **Active finding:** a tinted box (accent tint, 1px light-accent border, radius 12px, padding 12px, **8px** gap) containing:
  - the type label;
  - the original in 13px muted, in quotes;
  - the suggestion in serif 16px;
  - the actions "Use this" (primary, 34px), "Another" (outline, 34px) and "Keep mine" (13px muted, no wrapping).
- **Other findings:** the same compact rows as desktop.
- **Behaviour:** tapping a highlight opens the sheet scrolled to its finding, made active.
- **Footer,** fixed at the bottom of the sheet (1px top border, padding **12px 18px 16px**): "Use all {n}" (primary, 42px, `flex: 1`) and "Done" (outline, 42px).

### B: third-person version

Stacked cards, top to bottom, with a **12px** gap:
1. "Keep writing" back link card: padding **12px 16px**, the link at 14px, then the explanation line at 12px muted.
2. The story card. The label row shows "v{n}" on the right, and there are no prompt labels.
3. Narrate.
4. Every night.
5. Versions.

These are the same cards as in the desktop side column.

## Don't change

- The desktop Prompts and Go bigger card layout (apart from the list behaviour in section 4).
- The desktop "Raise the ceiling" popover and side card.
- Narration, versions and the reminder.
- The Manifesto print, and the Edit and Manifesto tabs.
