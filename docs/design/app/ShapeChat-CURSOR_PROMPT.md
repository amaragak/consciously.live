# Create flow: Shape step, chat panel and context rail

## Goal

Update the **Shape step** from its current state. Right now it has:
- a full-width brief card containing the brief text, ✎, and dashed "+ Style / + Program / + Journal / + Goal" chips;
- the thread and input in a centred column, with no surface behind them;
- "Reset" under the input.

Change it to the layout in `docs/design/app/ShapeChat.dc.html` and `ShapeChat.png`:
- **Wide screens:** two columns. On the left, a **chat panel** (a card surface holding the thread, with the input docked at its bottom). On the right, a **300px context rail** (the brief, the context, and progress).
- **Narrower screens and mobile:** one chat panel, with the brief and chips as the panel's header.

**References:** the desktop frame (wide layout) and the mobile frame (the panel-header layout used below the wide breakpoint).
- Read the source and port the structure: the same elements, nesting, borders, radii, padding, gaps and font sizes.
- Ignore the `<helmet>`, `<x-dc>` and script wrappers, the board text, the header, the sidebar and the background. The dot pattern stands in for the existing background, which stays as it is.

## Colours

Don't take colours from the design file. Use the existing tokens for each role:
- the card surface and border (the same as Start's composer card);
- the page background tint (for assistant bubbles);
- the primary style (user bubbles, the send button, the current-question marker);
- the accent and accent tint (done markers, tokens);
- heading, body, muted and label text;
- the outline button style (✎).

## Don't touch

The header and stepper, the sidebar, the footer, the Start and Sound steps, colour tokens, and the chat logic.

## Widths

- **The step as a whole:** use the app's **default content width**, the same container the **Library** page uses. Start and Sound use it too.
- **The chat column:** use the **narrower width the current Shape chat column already uses**. Keep that value; don't invent a new one.
  - In layout A, that column is the chat panel (thread, bubbles, input).
  - In layouts B and C, the whole panel uses it, header included.
- **Alignment:** both stay left-aligned, not centred.

## Layouts

### A. Wide: two columns
Use this from the app's **existing** breakpoint nearest a ~1200px viewport (probably `xl`). Don't add a new breakpoint.

**Row:** padding **24px 0 16px**, a flex row with a **20px** gap, items stretched, filling the height down to the footer. Left-aligned.

**Chat panel** (left):
- **Panel:** flex 1, `min-width: 0`, at most **the current chat column width** (see Widths), card surface, 1px border, radius **18px**, the same soft shadow as Start's composer, `overflow: hidden`, and a column layout.
- **Thread:** flex 1, padding **20px 24px**, a column with a **12px** gap, **aligned to the top**, and scrolls. It auto-scrolls to new messages unless the user has scrolled up.
- **Assistant bubble:** **page-background tint, no border**, radius **14px 14px 14px 4px**, padding **11px 14px**, sans **14px**, line-height 1.5, max-width **84%**.
- **User bubble:** unchanged (primary style), max-width **78%**.
- **Quick replies:** unchanged.
- **Bottom bar:** docked, a 1px top border, padding **14px 20px 12px**, a column with an **8px** gap.
  - The **input**: the existing pill input, **without its shadow**.
  - Under it, "**Reset chat**" in sans 13px, muted, with 16px left padding.
  - "Show as form" is not here in this layout; it lives in the rail.

**Context rail** (right):
- `<aside aria-label="This meditation">`, **300px** wide, no shrinking, a column with a **12px** gap.
- **Rail cards:** card surface, 1px border, radius **14px**, padding **14px 16px**, a column with a **10px** gap.
- **Eyebrows:** sans **11px**, uppercase, letter-spacing 1.4px, weight 600, label colour.

The rail has three cards:
1. **You're making**
   - **Top row** (space-between): the eyebrow "You're making", and ✎ (a **28px** outline circle, 13px pencil icon, `aria-label="Edit brief"`).
   - **The brief:** serif **17px**, line-height 1.4. Show it in full; it wraps and isn't truncated.
   - **Editing** works as now (inline textarea; Enter saves, Esc cancels).
   - **An empty brief** shows the existing placeholder.
2. **Context**
   - The eyebrow "Context".
   - Then a column with an **8px** gap, aligned to the start:
     - the **attached tokens** (unchanged; × removes);
     - then the existing **dashed "+ Style / + Program / + Journal / + Goal" chips, only for the types not yet attached**. They wrap, with a 6px gap, and open the same pickers as now.
3. **Questions** (only when a style is attached)
   - **Top row** (space-between, baseline): the eyebrow "{Style} questions", and "{i} of {n}" in sans 12px, muted.
   - **One row per question** (centred, **10px** gap, sans **13px**), using the question's short title:
     - **done:** a **20px** circle with an accent-tint fill, an accent border and a ✓ in the label colour; the text in body colour;
     - **current:** a **20px** filled circle in the accent with its number, the text in weight 600, heading colour;
     - **to come:** a **20px** circle with a 1px border and its number in muted; the text muted.
   - **Short titles:** if the question definitions have no short title, add one (3–5 words) to each. Tell me which you added.
   - **Under the rows:** "**Show as form**" in sans 13px 600, label colour, with a 2px top margin.

**With a program attached:**
- The **program card** (cover, title, One meditation / One per session, the session checklist) goes in the rail in place of the Questions card.
- Its checklist uses **one column** in the rail.
- "Create {n} now" stays in the footer.

### B. Below the wide breakpoint, down to `md`: one panel
- **The chat panel:** the same as above, at **the current chat column width** (see Widths). There's no rail.
- **Panel header:**
  - It holds what was the brief card, now as the panel's top section with a 1px bottom border, padding **16px 20px**, a column with a **10px** gap. It's no longer a separate card.
  - **Row 1:** the brief in serif **18px**, one line with an ellipsis, and the ✎ **32px** button.
  - **Row 2:** the tokens, the dashed add chips for unattached types, and the right-aligned "{Style} questions" progress bars with "{i} of {n}" (as now).
- **Thread and bubbles:** as in A.
- **Bottom bar:** as in A, but the links row is "**Show as form**" (style only, sans 13px 600, label colour) and "Reset chat" (13px, muted), with an 18px gap.
- **Program attached:** the program card sits in the panel header, under row 1.

### C. Below `md` (mobile)
- **Layout:** as B, with the step padding **14px 12px** and the panel radius **16px**.
- **Panel header:**
  - padding **12px 14px**;
  - the brief in serif **16px**, **clamped to 2 lines**;
  - row 2 shows the tokens only, on one line that scrolls sideways. There are no add chips and no progress bars; the bubble labels show the progress.
- **Thread:** padding **14px 12px**, a **10px** gap. Assistant bubbles max-width **92%**, user bubbles **85%**.
- **Bottom bar:** padding **10px 12px**, with the links centred, at 12px.

## Done when

- **Wide:** desktop matches the desktop frame of `ShapeChat.png`.
- **Mobile:** 360px matches the mobile frame.
- **In between:** the panel-header layout (B), with nothing clipped.
- **Brief:** it shows in full in the rail and is editable in every layout.
- **Add chips:** they only offer types that aren't attached, in every layout.
- **Questions:** the checklist tracks progress, and "Show as form" works from the rail and from the panel bar.
- **Thread:** it starts at the top and scrolls inside the panel. The page itself doesn't scroll on desktop.
- **Unchanged:** the header, footer, Start and Sound steps.
- List the files changed, and any question short titles you added.
