# Manifest › Story: ambition check before preparing, "checked" tracking, negative findings, clearer out-of-date wording

This builds on the Story page as it is now, with Raise the ceiling inline suggestions, the draft / narration toggle and per-section out-of-date tracking. Change only what's listed here.

**Reference:** `docs/design/app/StoryCheck.dc.html` and `StoryCheck.png`. The desktop dialog is on the left and the mobile sheet on the right. Port px from the HTML source and ignore the board captions and sample text.

Use existing tokens by role only.

---

## 1. "Checked" tracking replaces the "already raised" mark

The current mark stops lines that were already raised from being raised again. Generalise it.

- **What's checked:** any draft range the user has resolved through Raise the ceiling. That covers suggestions they used (✓) and suggestions they kept their own wording on (✕), whether in the editor or in the dialog in section 2.
- **Storage:** keep checked ranges with the draft as they're stored now, plus a `kind: 'used' | 'kept'`.
- **The visible underline:** only `used` ranges keep the current thin Mist underline. `kept` ranges have no visible mark.
- **Editing checked text:**
  - small edits keep the range checked;
  - if more than half the words in the range change, the range is no longer checked;
  - text typed inside a checked range joins it, and text typed at its edges doesn't.
- **Raise the ceiling skips checked ranges,** both from the button and in the check in section 2. Only unchecked text is sent to the model.
- **Never part of the story:** checked marks never reach "Prepare for narration", narration or print.

## 2. Ambition check before preparing

Pressing "**Prepare for narration**" or "**Update narration text**" (and "Update {n} sections" or "Update this section" in the narration view) first runs the Raise the ceiling analysis on the **unchecked** text in the sections being prepared.

- **The check runs inside the button's loading state** ("Checking…" while it runs, then "Preparing…").
- **No findings:** carry straight on to preparing, as now.
- **Findings:** open the review dialog before preparing. Nothing is sent to prepare until the user confirms.

### Dialog (desktop)

- **Container:** centred, width **660px**, card surface, radius **20px**, padding **26px 26px 22px**, an **18px** gap, a large soft shadow, over the app's scrim. The floating editor tools sit under the scrim.
- **Header row:** a close × on the right, and a column with a **6px** gap:
  - "**Before you narrate**" in 11px caps, letter-spacing 1.4px, 600, label colour, with the sparkle icon;
  - "**{n} lines could go bigger**" (or "1 line could go bigger") in the app's serif, **26px**;
  - "Only new or changed lines are checked. Anything you keep stays as you wrote it." in 13px, body colour.
- **Ambition read:** the same component as the Raise the ceiling side card.
- **Findings list:** one row per finding, with a **10px** gap between rows.
  - **Row container:** radius **14px**, padding **12px 14px**, 1px card-border border. It's a row with a **12px** gap.
  - **Left column** (**6px** gap):
    - the type in 10px caps, letter-spacing 1.3px, 600, label colour;
    - the user's line in 13px muted, struck through;
    - the suggestion in serif 16px, line-height 1.5, ink;
    - "Another" (sparkle icon, 12px, 600, label colour) while the row is undecided.
  - **Right side:** two **30px** circular buttons with a **6px** gap.
    - **✓ Use:** the primary (Mist) style. Once chosen it's solid, using the selected-chip style.
    - **✕ Keep mine:** outline. Once chosen it's solid, in the heading colour.
    - Clicking the chosen one again un-chooses it.
  - **States:**
    - **used:** accent-tint background, 1px light-accent border;
    - **kept:** 55% opacity, the user's line no longer struck through, the suggestion struck through instead;
    - **undecided:** the default.
- **Footer row:**
  - on the left, "{used} used · {kept} kept · {left} to decide" in 13px muted;
  - on the right, "**Prepare as it is**" (outline, 44px) and "**Prepare with {used} change(s)**" (primary, 44px, wand icon).
  - The primary label follows the count. With 0 used it reads "Prepare".
- **Mobile:** the same contents as a bottom sheet, starting about 90px from the top.
  - The ambition read is hidden.
  - The suggestion text is 15px.
  - The two footer buttons are full width and stacked, with "Prepare as it is" first.
  - The count line is hidden.

### Confirming

- **Either button:**
  1. writes every **used** suggestion into the draft as one undoable step;
  2. marks used rows `used` and kept rows `kept` (section 1);
  3. continues to prepare, as now.
- **Prepare as it is:** marks every row still undecided as `kept`, so it won't be asked about again.
- **Undecided rows when using the primary:** count them as `kept`.
- **× or Escape:** closes the dialog without preparing or marking anything.

## 3. New finding type: negative

Add `'negative'` to the Raise the ceiling finding types, shown as "Negative".

- **Model instructions:** flag lines where the user puts themselves down, judges themselves harshly, or describes others thinking badly of them, e.g. "my friends would describe me as a massive prick".
- **Suggestion:** the positive opposite, keeping the same subject and specifics and written in the same person as the text, e.g. "Alex's friends describe him as the most generous, loyal person they know."
- **Applies everywhere** the analysis runs: the Raise the ceiling button and the check in section 2.

Raise the ceiling never flags grammar. That's left to "Prepare for narration".

## 4. Clearer out-of-date wording

Replace any "stale" or "out of date" wording users can see:

- **The dot on the "For narration" toggle:** tooltip and `aria-label` "Your draft has changes the narration doesn't have yet".
- **The narration view banner:** title "**Your draft has changed since this was prepared**". Keep the subline and the "Update {n} section(s)" button as they are.
- **The per-section label** "Changed in your draft" stays as it is.

## Don't change

- The inline suggestion mode in the editor.
- The side card.
- Prompt labels.
- The toggle and button states.
- Narration and print.
