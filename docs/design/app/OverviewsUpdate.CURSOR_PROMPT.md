# Meditate and Journal overview pages: greetings and Explore mini cards

## Scope

This updates the **current implementations** of the `/meditate` and `/journal` overview pages. Only these changes:

1. A feature-specific greeting at the top of each page.
2. **Meditate:** the Explore section becomes six mini cards in two groups.
3. **Journal:** a new Explore section of three mini cards, placed before Guides.

Everything else on both pages stays as it is: sections, order, data and behaviour. Don't touch other pages, the app dashboard (and its own greeting) or colour tokens.

## Reference

- `docs/design/app/MeditateHome.dc.html` and `MeditateHome.png`, with desktop and mobile.
- `docs/design/app/JournalHome.dc.html` and `JournalHome.png`, with desktop and mobile, plus the empty state below them.

Port only the greeting and the Explore sections, with the structure and px from the HTML source. Ignore the board titles and the sample data.

## Colours and icons

**Colours:** use the existing tokens by role: card surface and card border, heading, body and muted text, and label/accent text for the group labels.

**Icons:** use the app's standard icons. The "›" in the design is the app's standard chevron-right at its standard size.

## 1. Greeting (both pages)

**Placement:** the first thing in the content area, above the first section, on the page background. It's the page header, so it doesn't go on a card.

**Type**
- Column with a **4px** gap.
- Title: serif **32px** (mobile **26px**), line-height 1.15, heading colour.
- Subline: **16px** (mobile **14px**), body colour.

**Copy**
- It's **feature-specific**, not a time-of-day greeting (that belongs to the dashboard).
- Insert the user's first name where `{name}` appears. If there's no first name, drop the name and the comma before it.
- **Rotation:** each page has a small pool. Pick one line per day, deterministically from the date, so it stays the same all day. Each pool entry is a title plus a subline. Put the pools in one copy module so I can edit them.
- **Mobile:** use the short subline where one is given (after the "/"); otherwise use the same one.

**Meditate pool**
1. "Ready to settle in, {name}?" / "Pick up where you left off, or make something new for today." (mobile: "Pick up where you left off, or make something new.")
2. "A few quiet minutes, {name}?" / "Play something you've made, or shape one for right now."
3. "Make some space today, {name}." / "Your meditations, programs and sounds, all in one place."
4. "What would help right now, {name}?" / "Something to settle, or something to spark."

**Journal pool**
1. "What's on your mind, {name}?" / "Write it, say it, or just note one good thing." (mobile: "Write it, say it, or note one good thing.")
2. "How's today really going, {name}?" / "A few honest lines is plenty."
3. "Room to think, {name}." / "Get it out of your head and onto the page."
4. "What's worth remembering today, {name}?" / "Big or small, it all counts here."

**Journal empty state** (no entries and no insights). Don't rotate this one; always use:
"Your journal starts here, {name}." / "A space to think out loud. Nothing here has to be polished." (mobile: "A space to think out loud.")

## 2. Mini card (shared component for both pages)

**Container:** card surface, 1px border, radius **14px**, padding **14px 16px**, a soft card shadow, `display: flex`, top-aligned, **12px** gap. The whole card is a link.

**Contents, left to right:**
1. **Image:** a **44×44** tile, radius **10px**, cover. Use existing app imagery for that feature. If none fits, use an accent-tint tile with the feature's standard icon.
2. **Text column:** flex 1, `min-width: 0`, **3px** gap.
   - **Title row:** the title in serif **17px**, heading colour. When a count is provided, add it after the title in 12px muted, with a **6px** left margin. Hide the count when it's 0 or unknown.
   - **Description:** 13px, line-height 1.45, body colour.
3. **Standard chevron-right**, muted, vertically centred.

**Group label** (Meditate only): 10px, uppercase, letter-spacing 1.4px, 600, label colour. It spans the full grid width (`grid-column: 1 / -1`), with margins **4px 0 -4px** (mobile **6px 0 0**).

## 3. Meditate: Explore

**Replace** the current Library and Sounds link cards with this.

**Heading:** keep the existing "Explore" heading.

**Grid**
- At `md` and up: `repeat(3, minmax(0,1fr))`, **12px** gap.
- Below `md`: a single column, **8px** gap.

**Order and copy**

**LIBRARY**
- **My creations** · {count}: "Everything you've made, ready to play again." Goes to Library · My creations.
- **Community**: "Meditations other people have shared." Goes to Library · Community.
- **Programs** · {count}: "Guided courses you can follow or make your own." Goes to Library · Programs.

**SOUNDS**
- **Soundscapes** · {count}: "Just listen. Meditation music for sitting on your own." Goes to Sounds · Soundscapes.
- **Voices** · {count}: "Meet the guides who narrate your meditations." Goes to Sounds · Voices.
- **Custom sounds**: "Layer music, ambience and noise into a mix of your own." Goes to Sounds · Custom sounds.

## 4. Journal: Explore (new)

**Placement:** a new section titled "**Explore**", using the existing section heading style, placed **directly before Guides**, in both the normal and the empty state.

**Grid:** the same grid rules as Meditate, with **no group label**.

**Cards**
- **Entries** · {entry count}: "Write freely or talk it out. Tag how it felt and what it's about." Goes to the entries page.
- **Gratitudes**: "Three small good things a day. It adds up." Goes to Gratitudes.
- **Insights**: "A weekly letter on how things moved, written from your entries." Goes to Insights.

In the empty state the entry count is 0, so it's hidden.
