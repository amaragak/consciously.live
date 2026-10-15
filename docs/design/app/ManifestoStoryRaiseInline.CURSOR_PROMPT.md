# Manifest › Story: Raise the ceiling, inline suggestion preview

Replace the current inline preview for Raise the ceiling suggestions (the small floating labels above highlighted words) with an inline suggestion mode, like tracked changes. Change only how findings render and resolve in the editor. The side card (desktop) and the sheet (mobile) stay as they are.

**Reference:** `docs/design/app/ManifestoStory.dc.html` and `ManifestoStory.png`, row D (desktop and mobile). Port px from the HTML source and ignore the board captions.

Use existing tokens by role only.

## 1. Each finding renders inline

While Raise the ceiling results are showing, each finding's range becomes:

```
<del>{original}</del> <ins>{suggestion}</ins>
```

- **The original (`del`):** muted text colour, strikethrough with a 1px muted line. It stays in its place in the sentence.
- **The suggestion (`ins`):** follows straight after with one space.
  - Same font and size as the editor text, heading colour, no underline decoration.
  - Accent-tint background, radius 3px, padding 0 2px.
  - A light-accent bottom edge, drawn as `box-shadow: inset 0 -1.5px 0`.
- **Remove the floating labels and the old highlight style.**
- **Both are display-only decorations,** not real text in the draft. The draft keeps the original until the user chooses.
  - The suggestion must not be selectable as draft text or counted in the word count.
  - Use your editor's decoration or widget mechanism rather than writing `del`/`ins` into the document.

## 2. The active finding

- **Becoming active:** the first finding is active when results load. Clicking a finding's original or its suggestion makes it active, as does clicking its row in the side card.
- **Active style:** the suggestion's bottom edge becomes **2px** in the accent colour.
- **Actions pill:** sits inline straight after the suggestion, flowing with the text so it never overlaps other words.
  - **Container:** `display: inline-flex`, margin-left 6px, padding 3px, fully rounded, card surface, a 1px card-border border, a small shadow. App sans, 12px, 600, `vertical-align` adjusted so it sits on the text line.
  - **"Use"** (check icon): the app's primary (Mist) button style, 26px high.
  - **"Another"** (sparkle icon): outline, 26px.
  - **"Keep mine":** plain muted text, 26px.
- **Mobile:** no inline pill. The actions stay in the sheet as now, and tapping a finding opens the sheet on it.

## 3. Resolving

- **Use:** replace the original range in the draft with the suggestion. Its decoration disappears, and the next unresolved finding becomes active.
- **Another:** regenerate that one suggestion using the existing call, and show a brief loading state on the `ins` (reduced opacity).
- **Keep mine:** dismiss the finding and remove its decoration. The next one becomes active.
- **Use all {n}** (side card or sheet): apply every unresolved suggestion in one undoable step.
- **Done / ×:** remove all decorations and leave the draft as it is.
- **Editing text inside a finding's original range** dismisses that finding (as now).
- **Undo:** each Use is one undo step.

## Don't change

- The Raise the ceiling side card and sheet layout.
- The ambition read.
- The endpoint and the model instructions (phrase-level suggestions).
- Prompt labels.
- The floating editor tools.
