# Your story: library pin, Manifest page card, dashboard top slot

The narrated story now appears in three places outside the Story page. Add them as below. Nothing shows until the user has a narration, meaning a Library item of type Story with audio.

**Reference:** files in `docs/design/app/` (port px from the HTML source; ignore board captions and sample content):

| File | Shows |
|---|---|
| `StoryPlaces.dc.html` / `.png` | Meditate library, desktop and mobile; Manifest page (Manifesto, Edit view) |
| `Dashboard.dc.html` / `DashboardMobile.dc.html` | Dashboard when an unplayed new meditation takes the top slot |
| `DashboardStory.dc.html` / `DashboardStoryMobile.dc.html` | Dashboard when the story takes the top slot |

**Styling:**
- **Colours:** existing tokens by role only.
- **Chevrons:** the app's standard chevron at its standard size.
- **Play buttons:** the app's existing primary play button.
- **Dark cards:** use the same style as the dashboard's existing dark "Ready when you are" card.

---

## 1. Shared story card

Build one `StoryCard` component and use it on the Library and Manifest pages.

- **Container:** card surface, 1px card border, radius **16px**, padding **16px 20px 16px 16px**. It's a row with an **18px** gap, items centred.
- **Artwork:** a square, **104px** on the Library and **88px** on Manifest, radius **14px**.
  - It's a 2×2 grid of the user's first four vision board images.
  - Over it sits a bottom gradient (transparent to about 55% of the heading colour), with the sun mark at 18px in the bottom-left corner.
  - If there are fewer than four images, repeat them. With no images at all, fill it with the accent tint.
- **Text column** (**6px** gap):
  - an eyebrow in 11px caps, letter-spacing 1.4px, 600, label colour, with a 12px icon;
  - "{FirstName}'s story" in the app's serif, **24px**;
  - a meta line in 13px muted: "{minutes} min · {voice} · {sound} · Listened {n} times".
- **Right side:** a text link (13px, 600, label colour, chevron), then the primary play button at **52px**.
- **Play** starts the story in the app's player, using the existing Library playback.
- **Clicking the card body** opens the Story page in its For narration view.

## 2. Meditate library: pinned

- **Position:** the first item in the list, directly under the filter/search toolbar, above the first date heading.
- **Pinned regardless of view:** it ignores sort, category and favourites filters. Search still hides it when the query doesn't match.
- **Tabs:** it shows on the "My creations" tab only, not on Community or Programs.
- **Eyebrow:** "Pinned · Your story" with a pin icon. **Link:** "Open story".
- **Not duplicated:** don't also list the story in its date group.
- **Mobile:** a compact card.
  - Padding 12px, gap 12px.
  - Artwork **72px**.
  - Eyebrow "Pinned".
  - Title in serif 19px.
  - Meta "{minutes} min · {voice}".
  - Play button 44px.
  - No link; tapping the card opens the story.

## 3. Manifest page (Manifesto, Edit view)

- **Position:** directly under the vision board hero, above Values.
- **Eyebrow:** "Your story" with a moon icon. Never show the reminder time: it's a notification setting, not part of the UI.
- **Link:** "Edit story", which opens the Story page in the My draft view.
- **Out-of-date line:** when the draft has changes the narration doesn't have yet (the same `changedCount` as the Story page), add a line under the meta: a 6px accent dot, then "Your draft has newer changes" in 12px, label colour.
- **Mobile:** use the compact card from section 2, with the eyebrow "Your story" and no link.

## 4. Dashboard: top slot rule

The dark card at the top-left of the dashboard ("Ready when you are") currently shows any meditation. Replace that logic with this rule:

1. **Unplayed new meditation:** if the user has a meditation they generated in the last **7 days** that has never been played, show the newest one, exactly as the card looks now. The label "**Ready when you are**" is used only in this case.
2. **Otherwise, the story:** if a narrated story exists, the card becomes the story card (`DashboardStory`). Keep the same layout and size as now, with these changes:
   - **Label:** "**Your story**" with a moon icon. On the right, "Edit story →" in 14px, at about 75% of the card's text colour.
   - **Title:** "{FirstName}'s story".
   - **Meta:** "Your life vision · {minutes} min · {n} nights in a row". Use the listening streak if it's 2 or more, otherwise "Listened {n} times".
   - **Play button and waveform:** as now.
3. **Otherwise, neither:** the card becomes a prompt to create a meditation, with the label "Meditate", the title "Make something for today", and a primary "Create a meditation" button that opens Create. Don't show a random library meditation.

**The Today list's "Do a meditation" row follows the top slot:**
- "Try: {meditation title}" in case 1;
- "Try: your story, {minutes} min" in case 2;
- no "Try" line in case 3.

### Story row in the Manifest card

When the top slot shows case 1 or case 3 and a narrated story exists, add a story row at the top of the dashboard's Manifest card, between the card header and "Your vision board" (see `Dashboard.dc.html`):
- **Container:** a dark row in the same style as the top card, radius **16px**, padding **16px 20px**, an **16px** gap.
- **Play button:** **52px**.
- **Text column:** the label "Your story" (moon icon), then "{FirstName}'s story" in serif 21px, then the meta "{minutes} min · {n} nights in a row" in 13px at about 65% opacity.
- **Right side:** "Edit story →".

In case 2 the story is already in the top slot, so **don't** show this row.

**Mobile** (`DashboardMobile` / `DashboardStoryMobile`): apply the same rule to the mobile top card and the Manifest card.
- In the Manifest card the row is compact: padding 12px, a 12px gap, a 44px play button, the label at 10px, the title in serif 17px and the meta at 12px. There's no link; tapping the row opens the story.
- In case 2 the mobile top card shows the story, with "Edit →" at the right of its label row.

## 5. Data

- **Story:** read from the user's latest narrated `StoryVersion` and its Library item (audio, duration, voice, sound).
- **Reminder time:** never show it in story labels anywhere. It only belongs in the Story page's Every night setting.
- **Listening streak:** the number of consecutive nights the story was played to the end (more than 90% played), counted per local night (noon to noon). Add this if it doesn't exist. Otherwise use the existing listen count.
- **Unplayed new meditations:** the user's own generated meditations with `createdAt` within 7 days and no play events.

## Don't change

- The rest of the Library, Manifest page and Dashboard.
- The Story page itself.
