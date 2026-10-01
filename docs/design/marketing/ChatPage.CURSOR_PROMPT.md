# Cursor prompt: Chat marketing page rewrite

Paste everything below the line into Cursor (Agent mode). Put `docs/design/marketing/` in the repo first.

---

## Goal

Rebuild the **Chat marketing page** in the Next.js marketing app around Chat's two jobs:
1. **a coach that knows you**, grounded in your goals, journal and meditations;
2. **hands in the app:** it plans next steps on Manifest goals, starts Focus sessions, makes meditations, and talks over journal entries.

Use new, shorter copy. Make it dark throughout, alternate the text and graphic sides, and give each graphic a fixed height.

Design reference (a design-tool file; treat it as a spec, not code to paste): `docs/design/marketing/ChatPage.dc.html`. There's a full-page screenshot beside it: `ChatPage-preview.png`.

**Colours:** use the codebase's current colour tokens and existing component styles. The colours in the design file are illustrative only; don't copy hex values from it. Below, colours are described by role (page background, alternate section background, card surface, raised surface, accent, primary button, heading, body and muted text). Map each role to whatever token currently plays it.

## Scope

- **Change:** the Chat marketing page's sections and copy.
- **Don't change:** the site header and nav, other pages, the app, or the colour tokens.
- Reuse the existing marketing components, the same ones the other feature pages use: section wrapper, eyebrow, H2, lead, sub-points, card, chip and primary button.
- Reuse the chat bubble components from the current Chat page.

## Step 0: plan first

Reply with a plan, and **wait for my OK.** Include a **fact check** of every claim below against the app code, and flag anything that isn't true yet:
- Chat uses goals, journal entries and meditations as context;
- the context used can be shown (the "Read:" chips);
- users control what Chat can read, in Settings (this depends on the private-defaults Settings work; if it hasn't shipped, use "Only for you: Your conversations stay private." instead, and tell me);
- Chat can add To Dos / next steps to a Manifest goal;
- Chat can start a Focus session;
- Chat can start a meditation generation;
- Chat can route the user to the right tool;
- a journal entry can be opened in Chat ("Talk it over");
- a line from the chat can be saved back to the entry, or turned into a next step;
- the conversation history carries over, and a new chat can be started any time;
- Chat surfaces support resources when wellbeing concerns come up (the same support resources as Insights).

**If the last point isn't true, keep the small print but tell me.** It's a safety line, and the behaviour should exist.

## Sections, in order (copy exact unless the fact check says otherwise)

**Background:** dark throughout. No light or grey bands.
- Alternate the page background and the alternate section background, with a hairline between sections.
- The paisley appears only in the hero, fading downwards.
- Content width is about 1200px. Section padding is about 96px.

**Side-by-side sections alternate sides:** text left, then right, then left, then right.

**Cards:** one card style for every graphic. Use the card surface, a hairline border and the existing card radius.

**Bubbles:**
- **User bubbles** are right-aligned in the accent style. Their bottom-right corner is less rounded.
- **Assistant bubbles** are left-aligned on the raised surface, with a hairline border. Their bottom-left corner is less rounded.

### 1. Hero (centred; keep the current copy)
- H1: **"Never stuck in your own head."**
- Sub: **"Think out loud. It listens, and it acts."**
- **Primary button:** "Talk to your coach" (same destination as today).

### 2. Your coach (text left, graphic right)
- **Eyebrow:** "Your coach". **H2:** "It already knows the story."
- **Lead:** "Replies grounded in your goals, your journal and your meditations, not a generic pep talk."
- **Points:**
  - **Grounded in your week:** "You can see what it read: the goal, the entry, the session."
  - **Reads only what you allow:** "You choose what Chat can see. Change it any time in Settings."
- **Graphic (about 240px):** one card.
  - A muted "Read:" label, then three outline chips: "Goal · Studio", "Journal · last night", "Meditation · Worth what you make".
  - User bubble: "I keep doubting myself before I price anything."
  - Assistant bubble: "That doubt showed up in last night's entry too, right after you wrote about opening night. Want to name what's under it?"

### 3. Actions (graphic left, text right)
- **Eyebrow:** "Actions". **H2:** "Then it does something about it."
- **Lead:** "Ask, and it acts in the app: no copying, no switching."
- **Points:**
  - **Plan next steps:** "Talk a goal through and the To Dos land in Manifest."
  - **Start the session:** "Open a Focus block or make a meditation from the conversation."
  - **Not sure where to start?:** "Say what's stuck. It opens the right tool."
- **Graphic (about 295px):** one card.
  - User bubble: "Help me get moving on the studio this week."
  - Assistant bubble: "Done. Here's where you're at:"
  - Three result rows. Each sits on a slightly darker surface with a hairline border, a small-caps label on the left and an accent-coloured action on the right:
    - **Manifest:** "3 next steps added to Studio" (View);
    - **Focus:** "Price the collection · 25 min" (Start);
    - **Meditate:** "Worth what you make" (Making…).

### 4. Journal (text left, graphic right)
- **Eyebrow:** "Journal". **H2:** "Talk it over."
- **Lead:** "Open any entry in Chat and think it through, with the page right there."
- **Points:**
  - **Start from the entry:** "One tap from the page you just wrote."
  - **Keep what helps:** "Save a line back to the entry, or turn it into a next step."
- **Graphic (about 210px):** an entry card, then an accent-coloured →, then a chat card.
  - **The entry card:** the small label "Journal · Thu 25 Sept", the serif italic quote "Priced the first piece today. Still felt like I was asking too much.", and a small primary-style pill "Talk it over".
  - **The chat card:**
    - user bubble: "Why does it feel like too much?";
    - assistant bubble: "You priced it below what you said it took to make. Want to work out a number that covers your time?"

### 5. Memory (graphic left, text right)
- **Eyebrow:** "Memory". **H2:** "Pick up where you left off."
- **Lead:** "Come back mid-doubt or mid-celebration. It remembers where you got to."
- **Points:**
  - **One ongoing thread:** "Your history carries over, so you never start from zero."
  - **A fresh start when you want one:** "Begin a new chat any time."
- **Graphic (about 220px):** one card.
  - The small label "Continues from Tuesday".
  - User bubble: "I'm back. The shop copy still feels stuck."
  - Assistant bubble: "Last time you priced the collection. Want a Focus block on the copy, or a short visualisation first?"

### 6. Closing call to action
- **"What's on your mind?"**
- **Sub:** "Say it out loud. Start there."
- **Primary button:** "Talk to your coach".
- Below it, after a hairline, small muted text: **"A coach, not a therapist. If things get heavy, it points you to real support."**
- This replaces "Ready to try chat?".

## Graphics rules

- **Fixed heights** on desktop, as above. **Don't** stretch graphics to the text column's height.
- **No dead space and no overflow:** content fills the card. If something doesn't fit at the real font sizes, trim it rather than letting it spill.
- **Mobile (< 768px):**
  - sections stack with the text first;
  - the graphics' fixed heights are released (auto height);
  - side-by-side cards stack, and → becomes ↓;
  - result rows keep the label, text and action on one line, wrapping the text if needed.
- **Accessibility:**
  - the arrows are `aria-hidden`;
  - the illustrative chips, pills and actions inside graphics aren't focusable or interactive;
  - the bubbles are plain text, not live regions.

## Remove

The old sections' copy and any components left unused, e.g.:
- "Conversation with context.", "When you're circling";
- "Actions, not only advice.", "Log and plan in-place", "Open Create Meditation", "Free flow chat";
- "One doorway when you don't know which tool." (it's now a point in Actions), "Orient first", "Then go deep";
- "Stay with the long arc.", "Tied to the suite", "New chat anytime";
- "Ready to try chat?".

## Done when

- The six sections appear in order with this copy, adjusted where the fact check required it (list the changes).
- It's dark throughout, the sides alternate, there's one card style, and graphics have fixed heights with no dead space or overflow.
- The small print is present.
- The mobile layout works.
- No header or token changes.
- Typecheck, lint and build pass. List the files changed.
