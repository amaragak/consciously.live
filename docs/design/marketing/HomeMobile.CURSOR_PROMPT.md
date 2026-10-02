# Cursor prompt: Homepage mobile layout

Paste everything below the line into Cursor (Agent mode). Put `docs/design/marketing/` in the repo first.

---

## Goal

The marketing homepage is squashed on phones. It's the desktop layout shrunk down: the header button is cut off, the hero has too much text before the input, and two-column cards force the serif titles onto one word per line.

**Fix the layout under the existing mobile breakpoint (below `md`). Leave desktop unchanged.**

- Keep the **same sections, in the same order, with the same copy as desktop.** Only the hero is shortened on mobile (see section 2).
- Save vertical space by restyling the **graphics** into compact stacked versions, not by dropping content.

Design reference (a design-tool file; treat it as a spec, not code to paste): `docs/design/marketing/HomeMobile.dc.html`, with screenshots at 360px and 320px beside it.

**Colours:** don't take colours from the design file. Mobile uses exactly the colours, tokens and component styles the desktop homepage uses now: the same section backgrounds in the same alternation, the same card surface, accent, primary button, and heading/body/muted text. This is a layout change only.

## Scope

- **Change:** responsive styles and markup for the marketing homepage below `md`. Share the components with desktop and switch layout with the existing breakpoint.
- **Don't change:** the desktop layout or copy (`md` and up), **the footer** (handled separately), colour tokens, other pages, or the app.

## Step 0: plan first

Reply with a plan, and **wait for my OK.** List:
- the homepage's current sections, in order;
- how each will render below `md`, using the mapping below.

If the live homepage has sections the mapping doesn't cover, propose a compact mobile treatment for each one in the same spirit.

## Breakpoint

Use the app's **existing mobile breakpoint** (the `md` marker, below 768px). Don't add new breakpoints. Everything below applies under it; above it, nothing changes.

## Global rules (below `md`)

- **Gutters and width:** 20px side gutters. **No horizontal scroll** at 320px (check `scrollWidth`).
- **Type:**
  - H1 is about 40px (use `clamp()`);
  - H2s are about 30px;
  - body text is 15–16px;
  - inputs are at least 16px, so iOS doesn't zoom.
- **Tap targets:** at least 44px.
- **Sections:** keep the desktop background alternation, with a hairline between sections. Section padding is about 40px vertically.
- **Strip layout:** every side-by-side strip becomes one column, in this order:
  1. the "consciously *Verb*" lockup;
  2. H2;
  3. lead;
  4. the text link ("… →");
  5. the compact graphic.
- **Graphics:** auto height on mobile. No fixed heights, no dead space, no overflow, no side-by-side cards. Arrows (→) become ↓ or are dropped.

## Section mapping

### 1. Header
- Below `md`, show only the sun, the "consciously" wordmark and a 44px menu button. Move the header's "Start free" / "Sign in" actions into the menu.
- Nothing in the header should be clipped at 320px.

### 2. Hero
- H1 is unchanged: **"Become who you *said* you'd be."** The emphasised word keeps its desktop accent styling.
- **Mobile-only tagline:** "*Live consciously* with our mind reprogramming suite." Keep "Live consciously" in serif italic, as it is on desktop.
- **Hide on mobile:** the longer desktop line and the dotted feature list (meditations · vision board · goal planner · manifesto · focus sessions). Hide them with a breakpoint; don't delete them, because desktop keeps them.
- **The meditation input:**
  - a visible label above it: "What would you like a meditation for?";
  - full width;
  - a shorter placeholder that fits at 320px: "e.g. calm before a pitch".
- **"Create my meditation":** full width, on one line, in the primary button style.
- Drop the small helper line under the button on mobile, if it's there.

### 3. "Or start somewhere else"
- Replace the two-column cards with **single-column rows**, each at least 64px tall, with a hairline between rows:
  - **left:** the serif title (e.g. "Build your vision board"), with one muted line under it;
  - **right:** the tool's verb in serif italic, in the accent text style, with an arrow ("Manifest →").
- The whole row is the link.
- Use short descriptions, so each stays on one or two lines:
  - "Picture the life you're creating";
  - "See the patterns in how you feel";
  - "A timer for your goals";
  - "Think out loud. It acts."
  - If desktop's descriptions are longer, use these on mobile only.

### 4. "Five tools. One direction."
- The same H2 and lead.
- The diagram becomes **one compact card**: a vertical timeline of four rows, each at least 40px tall.
  - A thin accent-coloured line runs down the left, with a small accent dot on each row.
  - Each row has the tool's verb in serif italic, in the accent text style, at a fixed width of about 70px. Drop "consciously" here to keep each row on one line. Then one short line of content:
    - **Journal:** "“Why do I keep waiting?”" (serif italic);
    - **Manifest:** "Open my own studio";
    - **Meditate:** a tiny play button and "Opening night";
    - **Focus:** "25:00 · Pricing".
- Below a hairline, inside the same card, the Chat line in small text: "consciously *Chat* runs through all of it: ask, reflect, and it moves the app for you."
- Each row's content must fit on one line at 360px. Shorten it if not.

### 5. Feature strips: Meditate, Journal, Manifest, Focus, Chat
These are the same five strips, in the same order, with the same copy and links as desktop, using the strip layout above. Each graphic is **one compact card**:

- **Meditate:**
  - a "You ask" label and the quote;
  - a hairline;
  - a "You get" label, then a play button, the title and the meta line in one row.
  - Drop the style chips on mobile.
- **Journal:**
  - a "Today's entry" label and the quote, with the dotted-underlined phrases;
  - **three mini bars side by side** (Vision, Self-doubt, Gratitude), each a label over a 6px bar;
  - the "Turn into a meditation →" link.
- **Manifest:** keep parity with the desktop graphic.
  - The "Vision board" label, then the **same four vision-board tiles desktop renders** (whatever they currently are), as one row about 44px tall.
  - If the vision board ever moves to images, change desktop and mobile together;
  - the manifesto line in serif italic;
  - a hairline;
  - the goal title;
  - its three steps, wrapping inline (● current, ○ others).
- **Focus:** one row: a **small progress ring** (about 64px) with the time, then the task, its source line, and the "Distracting sites blocked" line.
- **Chat:** two bubbles (user, then assistant) and the "▸ Start meditation" pill.

### 6. Closing call to action
- Centred H2 and sub, as on desktop.
- A **full-width** "Start free" button.

## Accessibility

- The menu button has `aria-label="Open menu"` and `aria-expanded`. The menu is focus-trapped and closes on Escape.
- The input has a real `<label>`.
- Decorative images, rings and arrows are `aria-hidden` or have empty `alt`.
- Illustrative controls inside graphics aren't focusable.

## Done when

- At 320, 360, 375 and 430px wide, and just below `md`: no horizontal scroll, nothing clipped, and no heading broken one word per line.
- Every desktop section appears on mobile in the same order with the same copy, apart from the hero changes listed above.
- Graphics are compact single cards with no dead space.
- Desktop (`md` and up) and the footer are unchanged (compare screenshots).
- No colour or token changes.
- Typecheck, lint and build pass. List the files changed, with before and after screenshots at 360px.
