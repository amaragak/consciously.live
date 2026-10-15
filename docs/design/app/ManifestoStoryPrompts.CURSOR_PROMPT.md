# Manifest › Story: prompts list (unused / used), filters, balanced order, plain prompt library

This updates the Story page as it is now, after the prompt-labels and editor-top changes. Change only the Prompts card (desktop), the All prompts sheet and prompt card (mobile), and the prompt library.

**Reference:** `docs/design/app/ManifestoStory.dc.html` and `ManifestoStory.png`:
- row A: the desktop Prompts card;
- the mobile column: the prompt card, and the All prompts sheet.

Port px from the HTML source and ignore the board captions. Use existing tokens by role only, and the app's standard chevron at its standard size.

---

## 1. Prompt data: templates with a slot

Replace the prompt library module with the library in section 7. Each prompt is:

```
Prompt {
  id: string
  bucket: 'start' | 'topic' | 'area' | 'value'
  topic?: 'who' | 'feel' | 'people' | 'home' | 'work' | 'body' | 'money' | 'rhythm'
  template: string   // area/value prompts contain {name}
}
```

- **Area and value prompts** are templates. Generate one prompt per enabled life area or value from each template.
  - The id is `${templateId}:${refId}`, and the prompt keeps its `refId`.
  - `{name}` is filled with the area or value's display name.
- **The label text in the editor** is the rendered string (plain text, no tag styling).

## 2. Inline name tags

Where `{name}` is rendered in a prompt row, show it as an inline tag:
- **Shape:** padding 0 5px, radius 4px.
- **Fill and edge:** accent-tint fill, an inset 1px light-accent edge (box-shadow, so line height doesn't change).
- **Text:** weight 500, label colour, no wrapping inside the tag.

Clicking a tag applies that area or value's filter (section 4).

## 3. The list holds only unused prompts

- **Unused:** a prompt is "used" when its label exists in the draft. The main list shows unused prompts only.
- **Picking a row** (or "+ Answer" on mobile) inserts the label, as now, and plays this sequence:
  1. The row's arrow becomes a check (fade and scale, ~150ms), and the row takes the accent-tint background.
  2. The row fades out and collapses its height (~250ms). The rows below close the gap.
  3. The prompt appears at the top of **Used** with an accent-tint highlight that fades out over ~1.2s.
  4. If the list was showing a page's worth, the next unused prompt in order fills the empty slot at the bottom.
  - With `prefers-reduced-motion`, skip the animation and apply the end state instantly.
- **Deleting a label** from the editor moves its prompt back into the unused list, at its place in the order.

### Used section

Under "More prompts", separated by a 1px top border with **10px** top padding:
- **Header row:** the chevron (14px, muted, down when open) and "**Used · {n}**" (10px caps, letter-spacing 1.4px, 600, muted). Clicking it collapses or expands the section. Remember that state in local storage.
- **Rows:** newest first.
  - Each row has the check icon (13px, accent) and the rendered prompt text (13px, line-height 1.45, muted, tags included), with padding **7px 0** and a **10px** gap.
  - Clicking a row scrolls the editor to that label and expands it if it's collapsed.
- **Hide the section** while nothing is used.

## 4. Chips are filters

- **One filter is active at a time:** "All" (default), a topic, a life area or a value. The active chip uses the existing selected-chip style.
  - Topic chips filter to that topic.
  - Area and value chips filter to that area's or value's prompts.
  - Tapping the active chip again returns to All.
- **Switches:** "Include my life areas" and "Include my values" stay.
  - Their sublines become "**Tap one to see only its prompts**".
  - Switching one off hides its chips and removes its prompts from the list. If its filter was active, return to All.
- **Coverage check:** an area or value chip shows the check icon (11px, accent) after its name once any of its prompts is used.
- **Mobile:** the same filter behaviour applies in the All prompts sheet.

## 5. Balanced order (the "All" view)

Build the order of unused prompts like this:
1. `start-here`, if unused.
2. Then repeat rounds until every prompt is placed. Each round takes the next unused prompt from:
   - each enabled **life area**: areas with no used prompts first, then the fewest used, ties in the user's area order;
   - then each enabled **value**, with the same rule;
   - then each **topic**, with the same rule.
   - Within a bucket, prompts keep their library order.

A filtered view keeps the same order, restricted to that filter. Recompute the order whenever a label is added or removed.

## 6. "More prompts" replaces Shuffle

- **Remove Shuffle** on desktop and in the sheet.
- **Paging:** show **6** prompts at first. The row under the list has:
  - "**More prompts**" on the left (13px, 600, label colour), which appends the next 6;
  - "{shown} of {total unused}" on the right (12px, muted).
  - Hide the row when everything is shown.
- **Mobile prompt card:** it shows the first unused prompt in order, with its tags.
  - "+ Answer" inserts it. The next one replaces it with a short crossfade.
  - Rename "Shuffle" to "**Skip**", which moves to the next prompt without using this one.

## 7. Prompt library (plain wording)

Write prompts plainly: concrete questions about what the user's life is like now, in the present tense. No poetic phrasing. Use these exactly.

**start**
- `start-here`: Everything worked out, and then some. What does your life look like now?

**topic: who** (Who you are)
- What are you known for?
- How would your friends describe you now?
- What are you proud of?
- What do you no longer put up with?
- What do you believe about yourself now?

**topic: feel** (How you feel)
- How do you feel when you wake up?
- How do you feel on a normal day?
- What used to stress you that doesn't now?
- When do you feel most at ease?
- What makes you laugh these days?

**topic: people** (People)
- Who are the people closest to you now?
- How do you treat the people closest to you?
- Who do you spend most of your time with?
- What do people come to you for?
- Who have you helped, and how?

**topic: home** (Home)
- Where do you live now?
- Describe your home.
- What do you see when you look out of the window?
- What's your favourite place at home?
- Who lives with you?

**topic: work** (Work)
- What do you do for work now?
- What does a normal working day look like?
- Who do you work with?
- What are you most proud of at work?
- How much do you work, and when do you stop?

**topic: body** (Body)
- How does your body feel now?
- What do you eat on a normal day?
- How do you move your body each week?
- How do you sleep?
- What can your body do now that it couldn't before?

**topic: money** (Money)
- How much do you earn now?
- What does money let you do now?
- How do you feel when you check your bank balance?
- What have you bought that you used to only want?
- What do you give away, and to whom?

**topic: rhythm** (Daily rhythm)
- What does your morning look like?
- What does a normal weekday look like, start to finish?
- What do you do in the evenings?
- What does a perfect weekend look like?
- What do you do every day without fail?

**area** (one prompt per template per enabled life area)
- What have you achieved in {name}?
- What does a normal week of {name} involve now?
- How do you feel about {name} now?
- What's the best thing that's happened in {name} so far?
- Who else is involved in {name}, and what do they say about it?

**value** (one prompt per template per enabled value)
- What does {name} look like in your life now?
- What do you do now because {name} matters to you?
- What did you change in your life to make room for {name}?
- How does {name} affect the way you work?
- How does {name} affect the way you treat people?

**Existing data:** existing labels that reference removed prompt ids stay in the draft as they are, and don't count towards any filter or coverage.

## Don't change

- The prompt label UI in the editor.
- The editor tools.
- The header card and "Prepare for narration".
- Raise the ceiling, state B and the guidelines.
