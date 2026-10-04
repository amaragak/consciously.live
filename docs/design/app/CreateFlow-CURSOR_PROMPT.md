# Meditate Create: one flow (Start → Shape → Sound)

## Goal

Replace the separate Create entry points with **one three-step flow**, on desktop and mobile.

**Entry points being replaced:** the start page with its 7 option cards; By type → Questions; By chat; By program → sessions → chat; From journal; From goal; One-shot; Random.

**The three steps:**
- **Start:** one composer. Types, programs, journal entries and goals become **context you attach** to it.
- **Shape:** one chat. A type's questions, By chat and the program chat all happen here.
- **Sound:** the existing Audio & voice step.

**References** (both files are plain HTML with inline styles; read their source):
- **Desktop:** `docs/design/app/CreateFlow.dc.html` and `CreateFlow.png`. Five screens: 1 Start, 2 Start with the Style panel open, 3 Shape with a style, 4 Shape from a program, 5 Sound.
- **Mobile:** `docs/design/app/CreateFlowMobile.dc.html` and `CreateFlowMobile.png`. The same five screens at 360px.

**Before you write code**, read the current Create code end to end:
- every route and door;
- the type grid and its question definitions;
- the program session picker and its toggle;
- the journal and goal pickers;
- the chat (and the program chat);
- the one-shot and random paths;
- the footer bar and the Audio & voice step;
- the generation API calls.

Reuse those components and calls. This is a re-composition of what exists, not a rewrite.

## How to use the design files

- **Port the structure:** the same elements, nesting, borders, radii, padding, gaps and font sizes. Ignore the `<helmet>`, `<x-dc>` and script wrappers.
- **Don't add anything the design doesn't have, and don't drop anything it has.**
- **Layout:**
  - The app header and sidebar in the files are context only.
  - The content column is a stand-in. Use the app's **existing content container**: its width, flush left against the sidebar. Don't centre it, and don't give it a new width.
- **Placeholder content:**
  - The images, the copy in the chat bubbles, and the voice and background tiles on Sound are placeholders.
  - The **Sound step keeps the existing Audio & voice controls and content as they are**. Only the step shell and the summary card are new.

## Colours

Don't take colours from the design files. Use the existing tokens for each role:
- page background, card surface, card border;
- label text (eyebrows and links), heading, body and muted text;
- the accent, and an accent tint for attached tokens, the summary card and the selected-state borders;
- the primary button style (also used for user chat bubbles and the send button), and the secondary/outline button style.

## Don't touch

- The app header and the sidebar (the header already derives its crumbs from route data).
- The Chat floating button.
- Colour tokens.
- The Library, other pages, and audio generation itself.

## Routes and state

- **One route:** the existing Create route, with the step in the URL (e.g. `?step=start|shape|sound`).
- **Flow state** is held in one place and survives Back and Next. It contains:
  - `prompt` (the composer text);
  - the attached `style` (a type id), `program` (id, the mode "one" or "per session", and the selected session ids), `journal` (one or more entry ids) and `goal` (a life area id plus an optional goal id);
  - the `chat` thread;
  - the `answers` to the style questions, keyed by question;
  - `length`.
- **Breadcrumb data:** Create (on Start), Create › Shape, Create › Sound.
- **Old routes redirect** to the new flow with the right context attached:
  - by-type with a type → Start with that style attached;
  - by-chat → Shape with no context;
  - by-program with a program → Shape with that program attached;
  - from-journal → Start (with the entry attached, if one is in the URL);
  - from-goal → the same, with the goal attached;
  - one-shot → Start;
  - random → Surprise me (see below).
- **Links into Create from elsewhere** must land in the new flow with their context attached:
  - "Make it your own" on a program → Shape with the program attached;
  - "Meditate on this" from a journal entry or a Manifest life area/goal → Start with it attached and the composer focused.
- **Delete** the old start page and the door pages once they redirect. List the deleted files.

## Behaviour

### Start
- **The composer text is optional.**
- **The "Add" chips** are Style, Program, Journal, Goal and Surprise me. Each of the first four opens its picker (desktop: side panel; mobile: bottom sheet).
- **Pickers.** Each picker is the **existing picker UI**, placed inside the new panel shell:
  - **Style:** the type grid (single select).
  - **Program:** the program cards (single select). Its session checklist and toggle move to Shape.
  - **Journal:** the entry list, keeping its search, filters, mood tags and multi-select.
  - **Goal:** the life areas, with an optional goal.
- **Tokens.** Confirming a picker attaches a token inside the composer. × removes it.
  - A chip whose context is attached shows the "attached" state.
  - Re-opening a picker edits the current selection.
- **Combining context.** Any combination is allowed, e.g. Style + Journal + Goal. There's one limit:
  - **Program and Style are exclusive**, because a program already has its own style.
  - Attaching one replaces the other, with a short inline note.
- **Send (→), or "Talk it through ›"** goes to Shape.
  - The composer text becomes the first user message.
  - If the text is empty, the assistant opens instead.
- **"Create now"** skips Shape and goes to Sound. This is today's one-shot path, now with the attached context included.
- **Surprise me** is today's Random behaviour: a random style and a seed script, then straight to Sound. The style it picked appears as a token on the summary card.
- **"Or start from" tiles** (A style, A program, Your journal, A goal) open the same pickers as the chips. Show them on every visit for now.

### Shape (one chat for every route)
- **Context bar** at the top: the attached tokens (removable) and a dashed "+ Add" that opens a menu of the four pickers.
  - If a program is attached, the **program card** replaces the bar. If a journal entry or goal is also attached, show their tokens in a row under the card.
- **Use the existing chat component and endpoint.** Every request sends the full flow context: the prompt, every attached item, and the answers so far.

**How the chat opens:**
- **With a style attached:**
  - The assistant asks **that style's existing questions**, one per turn, in order. It may adapt the wording slightly and add a short acknowledgement of the previous answer or the attached context.
  - Each turn returns `{question_id, text, quick_replies[2–4]}`. Use the question's predefined options as quick replies if it has any; otherwise generate them.
  - The bubble shows the label "{Style} · {i} of {n}". The progress bars in the context bar (desktop only) show the same.
  - Tapping a quick reply sends it as the user's message.
  - Store each answer against its `question_id`.
  - After the last question, the chat continues as an open chat.
- **With a program attached:** the chat opens the way today's program chat does. The toggle and session checklist live in the program card.
- **With journal entries or a goal only:** the first assistant turn reflects the context back in a sentence, then asks one question.
- **With nothing attached:** the same as today's By chat.

**Controls:**
- **"Show as form"** (style only) swaps the chat for the **existing Questions form**, with the answers so far filled in. Edits there update `answers`. "Show as chat" swaps back and the chat continues from the next unanswered question.
- **Reset** clears the chat and the answers, but keeps the context.
- **Context changes:** if the context changes mid-chat, the next request carries the new context. Don't reset the chat.
- **Next:** "Sound ›" is always enabled; you can stop talking at any point.
- **Program, "Create {n} now":** skips to Sound, where `n` is the number of sessions selected (or "Create now" in "One meditation" mode).
  - On desktop it's a secondary button in the footer.
  - On mobile it's a text link under the input, "Create {n} now with what you've said".

### Sound
- **The summary card** shows "You're making" plus one sentence. Use the existing title or intent text from the generation API if there is one. Otherwise, use the user's first message, shortened. The attached tokens are shown without their ×.
- **Below it are the existing Audio & voice controls, unchanged.**
- **The final button**, "✦ Create meditation" (mobile "✦ Create"), calls the generation API with the whole flow state.
- **If the API only takes one source per request**, extend it to accept all the context (prompt, chat, style plus answers, program plus mode and sessions, journal ids, goal) and combine them into the script prompt. Tell me what you changed.

### Footer (every step)
- Reuse the existing footer bar component and restyle it as below.
- **Back** returns to the previous step, keeping all state. It's disabled on Start (desktop), and hidden on Start (mobile).
- **Length** is the existing control.
- **Next buttons:**

| Step | Buttons |
|---|---|
| Start | "Create now" (secondary), "Talk it through ›" (primary). Mobile: "Create now", "Talk ›". |
| Shape | "Sound ›" (primary). For a program on desktop, "Create {n} now" (secondary) before it. |
| Sound | "✦ Create meditation" (primary) |

## Layout: desktop (`md` and up)

### Content
- **Inside the existing content container:** padding top **28px**, bottom **92px** (clearing the footer); a column, left-aligned, with a **22px** gap between the stepper and the step content. The step content is a column with a **16px** gap.

### Stepper
- `<nav aria-label="Steps">` containing three steps, 10px gap, about **360px** wide.
- **Each step:** a **22px** circle (1px border, sans 12px 600) and the label in sans **13px**, with an 8px gap.
- **States:**
  - **Current:** accent-filled circle, label weight 600, heading colour.
  - **Done:** tinted circle with an accent border and a ✓; label in body colour.
  - **To do:** border-colour circle, muted label.
- **Connectors:** a 1px line, flex 1, min **16px**, max **64px**. Accent once done.

### Start
- **H1** "What's this one for?": serif 400, **32px**, line-height 1.15.
- **Sub-line:** sans **15px**, body colour, **8px** under the H1, 4px above the composer.
- **Composer card:** radius **18px**, 1px border, card surface, padding **20px 20px 14px**, a column with a **14px** gap, and a soft shadow.
  - **Text:** an auto-growing textarea, serif **20px**, line-height 1.45, min-height **84px**, no border.
  - **Tokens:** a wrapping row with a **6px** gap.
    - **Each token:** **34px** high, padding **0 6px 0 5px**, radius **10px**, accent-tint background and border, sans **13px**, 8px gap.
    - **Inside each token:**
      - a **24×24** visual: the cover or type image, radius 6px; or, for journal and goal, a card-surface square with a 1px border, radius 6px and a 14px icon in the label colour;
      - the name, weight 600;
      - an optional detail in sans **12px**, muted (e.g. "Tue · Pitch nerves", or the goal);
      - a × (14px, muted, `aria-label="Remove {name}"`).
  - **Bottom row:** a 1px top border, padding-top **12px**, items centred, **6px** gap.
    - "Add": sans **12px**, uppercase, letter-spacing 1.4px, muted, 4px right margin.
    - **The chips:** **34px** high, padding 0 12px, pill, 1px border, card surface, sans **13px**, body colour, with a **15px** icon in the label colour and a 6px gap. The attached state uses the accent-tint background and border, with heading-colour text.
    - **On the right:** the mic (**40px** circle, outline style), then send (**40px** circle, primary style), with an 8px gap. Use the existing voice input if there is one.
- **"Or start from":**
  - **Label:** sans **11px**, uppercase, letter-spacing 1.4px, weight 600, label colour, with a 6px top margin.
  - **Row:** **four tiles**, each flex 1, with a **10px** gap.
  - **Each tile:** radius **12px**, 1px border, card surface, `overflow: hidden`, containing an image **84px** high (`object-fit: cover`), then padding **8px 10px 10px** with the title (sans **13px 600**) and the line under it (sans **12px**, muted, line-height 1.35, 2px gap).
  - **Images:** use real images from the media bucket (a type image, a program cover, and whatever the journal and goal areas use).

### Picker panel
- A scrim over the **content area only** (not the header or sidebar).
- **The panel:** fixed to the right of the content area, **520px** wide, full height, page background, a 1px left border, a soft shadow to the left, and a column layout.
- **Head:** padding **20px 24px 14px**, a 1px bottom border.
  - **Text:**
    - eyebrow "Add · {Style|Program|Journal|Goal}" in sans **11px**, uppercase, letter-spacing 1.4px, 600, label colour;
    - title in serif **24px** (e.g. "Pick a meditation style");
    - one line in sans **13px**, body colour.
  - **Close:** a **36px** circle, outline style.
- **Body:** scrolls, padding **16px 24px**. It holds the existing picker.
  - **Type grid:** 3 columns, **10px** gap. Each tile has radius 12px, an image 74px high and its name in sans 13px 600.
  - **Selected tile:** a **2px** accent border and a **20px** accent check badge, 6px from the top right.
- **Foot:** padding **14px 24px**, a 1px top border, space-between.
  - The selection summary in sans **13px**, body colour.
  - The primary button, **42px** high: "Add to meditation" (or "Save" when editing).
- Esc and the scrim close the panel. Focus is trapped while it's open.

### Shape
- **Context bar:** a wrapping row with an 8px gap, holding the tokens and "+ Add".
  - **"+ Add":** 34px high, padding 0 10px, radius 10px, a 1px dashed accent-tint border, sans 13px, label colour, with a 14px plus.
  - **Right-aligned:** "{Style} questions" in sans **12px**, muted, then **n** bars (**14×4px**, radius 2px, 3px gap; accent when answered, border colour when not), then "{i} of {n}".
- **Thread:** flex 1, a column with a **12px** gap, aligned to the bottom, and scrolls.
  - **Assistant bubble:** card surface, 1px border, radius **14px 14px 14px 4px**, padding **11px 14px**, sans **14px**, line-height 1.5, max-width **86%**, left-aligned.
  - **Question label** inside the bubble: sans **11px**, uppercase, letter-spacing 1.4px, 600, label colour, 4px above the text.
  - **User bubble:** primary button surface and border, radius **14px 14px 4px 14px**, the same padding and type, max-width **80%**, right-aligned.
  - **Quick replies:** under the latest assistant bubble, a wrapping row with a 6px gap. Each one is **32px** high, padding 0 12px, pill, a 1px accent-tint border, card surface, sans **13px**.
- **Input:** a pill with a 1px border, card surface, padding **6px 6px 6px 16px**, an 8px gap and a soft shadow.
  - The field in sans **15px**.
  - The mic (36px circle, outline) and send (36px circle, primary).
- **Under the input:** a row with an 18px gap, 16px left padding and a 10px gap above it: "Show as form" (sans 13px 600, label colour) and "Reset" (sans 13px, muted).
- **Program card** (instead of the context bar): radius **14px**, 1px border, card surface, padding **12px 14px**, a column with a **12px** gap.
  - **Top row** (12px gap, centred):
    - the **44×44** cover, radius 8px;
    - title in serif **17px**, with "Making it your own · {selected} of {total} sessions" under it in sans 12px, muted;
    - the existing **One meditation / One per session** segmented control (track padding 3px, radius 10px, sans 12px; selected segment on the card surface with a 1px border, weight 600);
    - "Sessions ▴/▾" in sans 13px 600, label colour, which toggles the checklist.
  - **Checklist:** a 1px top border, padding-top **10px**, 2 columns with an **8px 20px** gap.
    - **Each row:** an **18px** checkbox (radius 5px; checked: accent fill with a ✓), then "{n}. {session title}" in sans **13px**. Unchecked rows are muted.
    - Use the existing selection logic, including Clear all.

### Sound
- **Summary card:** accent-tint background and border, radius **14px**, padding **14px 16px**, a column with an **8px** gap.
  - eyebrow "You're making" (11px, as above);
  - the sentence in serif **20px**, line-height 1.3;
  - the tokens (as above, without ×).
- **Then the existing Audio & voice content**, with its section labels in the same 11px eyebrow style.

### Footer
- **Bar:** fixed to the bottom of the content area, **68px** high, padding **0 28px**, page background, a 1px top border.
- **Grid:** three columns (`1fr auto 1fr`).
  - **Left: Back.** A text button, 40px high, sans **14px**, body colour: "‹ {previous step name}". Disabled on Start.
  - **Centre:** "Length" in sans **11px**, uppercase, letter-spacing 1.4px, muted, with a 10px gap before the select. The select is **40px** high, padding 0 12px, radius 10px, 1px border, card surface, sans **14px 600**, with a small chevron.
  - **Right:** the buttons, 10px gap. Each is **44px** high, padding 0 18px, pill, sans **14px 600**, `nowrap`, in the primary or secondary style.

## Layout: mobile (below `md`)

Same behaviour and the same components. Only the following differs.

### Content and stepper
- **Content:** padding **14px 16px 76px**, a column with a **14px** gap.
- **Stepper:** full width (connectors flex 1, no max).

### Start
- **H1:** serif **24px**, line-height 1.2, 4px top margin.
- **Composer:** radius **16px**, padding **14px 14px 12px**, gap **12px**.
  - Text: serif **17px**, min-height **72px**.
  - Tokens: as desktop.
  - **Bottom row:** "Add context below, or just send" in sans 12px, muted, on the left; mic and send (**38px**) on the right.
- **Chips:** a row **under** the card. It scrolls horizontally, bleeds to the screen edges with 16px inner padding, has a 6px gap, no scrollbar, and doesn't shrink. The labels are the same, except "Surprise me" becomes "Surprise".
- **"Or start from":** a **2×2** grid with an **8px** gap. Each image is **64px** high, and the lines are short ("12 types", "Make it yours", "An entry", "A life area"). The page scrolls under the footer.

### Bottom sheet (pickers)
- A scrim over the whole screen.
- **The sheet:** `max-height: 85vh` (about 600px at 760px tall), radius **18px 18px 0 0**, page background, a shadow above it.
- **Grabber:** **40×4px**, 8px from the top.
- **Head:** padding **6px 16px 12px**, a 1px bottom border.
  - eyebrow at **10px**;
  - title in serif **20px**;
  - close, a **34px** circle.
- **Body:**
  - padding **12px 16px**;
  - the type grid in **2 columns** with an 8px gap and images **62px** high;
  - the other pickers in their existing mobile layout.
- **Foot:** padding **10px 16px 14px**, with a full-width primary button, **44px** high: "Add {name}".
- **Closing:** swipe down, the scrim, or close.

### Shape
- **Context bar:** **one line** that scrolls horizontally (tokens only).
  - No progress bars and no "+ Add". The "{Style} · i of n" label in each bubble carries the progress.
  - Context is edited by going Back to Start.
- **Bubbles:** assistant max-width **92%**.
- **Input:** the field at **14px**.
- **Links:** "Show as form" and "Reset" at **12px**, centred.
- **Program card** (compact): padding **10px 12px**.
  - a **40×40** cover;
  - title in serif **16px**, with "{selected} of {total} sessions · one each" (or "· one meditation") under it in 12px, muted;
  - "Edit ▾" (13px 600, label colour) expands the toggle and checklist in place, with the checklist in 1 column.
  - Under the input: the "Create {n} now with what you've said" link (12px 600, label colour, centred).

### Sound
- **Summary sentence:** serif **17px**.
- **Then the existing Audio & voice content** in its mobile layout.

### Footer
- **Bar:** **64px** high, padding **0 12px**, an 8px gap, a 1px top border, and a soft upward shadow. It respects `env(safe-area-inset-bottom)`.
- **Back:** "‹ {step}", padding 0 8px. It's hidden on Start.
- **Length:** the select alone (with `aria-label="Length"` and no visible label), **40px** high, padding 0 10px, sans **13px 600**, `nowrap`.
- **Right:** the buttons are **40px** high.
- **Chat button:** if it overlaps the bar, lift it above the bar on these pages only.

## Done when

- One Create route with the three steps. Every old route and every external "make it your own" or "meditate on this" link lands in the right step with its context attached.
- **Every old capability still works**, and each one produces the same kind of meditation as before:

| Capability | Now done by |
|---|---|
| Type + questions | Style + Shape |
| Chat | Shape with no context |
| Program, one or per session | Program + Shape |
| Journal | Journal context |
| Goal | Goal context |
| One-shot | Create now |
| Random | Surprise me |

- **Combined contexts work**, e.g. Style + Journal + Goal.
- **The style questions:** every answer lands in `answers`, and Show as form ↔ chat keeps them in sync.
- **Visual match:** desktop matches `CreateFlow.png`, and 360px matches `CreateFlowMobile.png`, apart from the placeholder imagery and copy and the existing Sound controls.
- **At 320px:** nothing is clipped, and nothing scrolls sideways except the chip and token rows.
- The header, sidebar and colour tokens are unchanged.
- **Report back:**
  - a list of changed and deleted files;
  - any API changes;
  - desktop and 360px screenshots of all five states.
