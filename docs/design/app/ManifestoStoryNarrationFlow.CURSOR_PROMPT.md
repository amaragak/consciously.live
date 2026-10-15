# Manifest › Story: draft / narration toggle, in-place preparing, out-of-date sections

This replaces the current "Prepare for narration" flow (a "Checking" modal, then a separate view with Narrate in a different place). Draft and narration text become two views of the same page, switched by a toggle. The narration text tracks which sections are out of date with the draft.

**Reference:** `docs/design/app/ManifestoStory.dc.html` and `ManifestoStory.png`:
- row A: the header card in the My draft view, out-of-date state;
- row B: the For narration view, with the out-of-date banner and a marked section;
- the mobile frames for both.

Port px from the HTML source and ignore the board captions and sample text.

Use existing tokens by role only. Use the app's standard chevron at its standard size.

---

## 1. Data

On each prepared version (`StoryVersion`), alongside `sections` (from the print prompt; add it now if it's not there yet):

```
sections: Array<{
  key: string                // promptId, or 'opening' for text before the first label
  heading: string
  text: string               // narration text for this section
  sourceHash: string         // hash of the draft section's text when it was prepared
  editedByUser: boolean      // true once the user edits this section in the For narration view
}>
preparedAt
```

- **Splitting the draft:** a draft section is a prompt label and the paragraphs it owns. Text before the first label is the "opening" section.
- **Hashing:** hash the plain text of each draft section, ignoring the labels themselves.
- **Out of date:** a section is out of date when its current draft hash differs from `sourceHash`. That includes a draft section that was added or removed since the version was prepared.
- **Counting:** `changedCount` is the number of out-of-date sections. Compute it client-side as the draft changes.

## 2. View toggle (header card)

**Remove:**
- the "Checking" modal;
- the "Keep writing" back-link row;
- any separate route or view for the prepared story.

**Add a segmented control to the header card's toolbar row:** **My draft · For narration**.
- **Desktop:** at the left of the toolbar row, with "How to write it" after it (My draft view only).
- **Mobile:** full width, between the title row and the meter.
- **Style:**
  - track: progress-track pill, padding 3px, fully rounded, 13px, 600 (12px on mobile);
  - active segment: card surface, small shadow;
  - inactive segment: body colour.
- **Out-of-date dot:** when `changedCount > 0`, a **6px** accent dot follows the "For narration" label.
- **Disabled:** "For narration" is disabled until a first version exists.
- **URL:** the view is reflected in the URL (`?view=story&tab=draft|narration`).
- **Which side column shows:**
  - My draft: the Prompts card, as now;
  - For narration: Narrate, Every night and Versions, as now in state B.

## 3. The prepare button (My draft view, right of the toolbar)

| State | Shows |
|---|---|
| No version yet | "**Prepare for narration**" (primary, wand icon). Disabled under 150 words, as now. Hint to its left: "Third person, tidied, ready to record" (13px muted). |
| `changedCount > 0` | "**Update narration text**" (primary, wand icon). Hint: "{n} section(s) changed". |
| Up to date | No button. Show "✓ Ready to narrate" in 13px muted, with the check icon in the accent colour. |

**Clicking either button:**
1. The button itself shows a loading state: spinner plus "Preparing…", disabled. No modal.
2. **Prepare for narration** sends the whole draft. **Update narration text** sends only the out-of-date sections, plus the section before and after each one as read-only context for flow.
3. On success:
   - save a new version: unchanged sections are copied over with their text and `editedByUser`, and the updated sections get new text, a new `sourceHash` and `editedByUser: false`;
   - switch to the **For narration** view, scrolled to the first updated section, and highlight each updated section's text briefly (accent tint fading out over ~1.2s).
4. On error, restore the button and show the app's existing error toast.

**Hand-edited sections:** if any section being updated has `editedByUser: true`, confirm first with the app's confirm dialog:
- message: "You've edited {n} section(s) in the narration text. Updating will replace those edits.";
- buttons: "Update anyway" and "Cancel".

On mobile the button is full width in the header card, under the meter. The "Ready to narrate" text sits in the same place.

## 4. For narration view

- **Toolbar right side:** "Prepared {date} · edits here don't change your draft" in 13px muted.
- **Card header row:** "Third person · {words} words". No version number anywhere except the Versions card.
- **Editing:** the text stays editable, as now. Editing a section sets its `editedByUser` to true and saves to the current version. It never changes the draft.

### Out-of-date banner

Shown at the top of the narration card when `changedCount > 0`.
- **Container:** accent-tint box, 1px light-accent border, radius 12px, padding **12px 14px**, a row with a **12px** gap.
- **Contents:**
  - a clock icon in label colour;
  - "**{n} section(s) changed in your draft since you last prepared it**" (14px, 600), with "Update just those sections, or keep this version as it is." under it (13px, body colour);
  - on the right, "**Update {n} section(s)**" (primary, 34px). It runs the same flow as section 3.
- **Mobile:** the banner sits as its own box above the narration card, with the text and then a full-width button.

### Out-of-date sections

Each out-of-date section in the narration text gets:
- a **2px** accent rule on its left, drawn as `box-shadow: inset 2px 0 0`, with **16px** left padding;
- above its text, in a row with a **10px** gap:
  - "**Changed in your draft**" in 10px caps, letter-spacing 1.3px, 600, label colour ("Changed" on mobile);
  - "**Update this section**" (12px, 600, label colour, underlined, "Update" on mobile), which runs the update flow for that one section.

## 5. Narrate when out of date

If `changedCount > 0` when the user presses Narrate, confirm first with the app's confirm dialog:
- message: "{n} section(s) changed in your draft since you last prepared it.";
- buttons: "**Update first**" (runs the update, then returns to Narrate) and "**Narrate anyway**".

## Don't change

- The draft editor, prompt labels, Raise the ceiling, the floating editor tools.
- The Narrate, Every night and Versions cards, apart from the confirm above.
- The compose endpoint's rewrite rules, apart from working per section.
