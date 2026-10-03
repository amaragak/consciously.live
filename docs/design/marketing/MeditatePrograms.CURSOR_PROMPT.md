# Meditate marketing page: Programs section (desktop and mobile)

## Goal

Replace the **Programs** section's graphic on the Meditate marketing page, on desktop and mobile, and update its copy. Everything else on the page stays as it is.
- **Remove** the old graphic: the "Chakra Cleanse" card with the As written / Made for me toggle and the session rows.
- **Add** small cards for four real programs, with an "And more in the library →" link.
- The "make it your own" process is now described in text, not drawn.

**References:**
- **Desktop:** the Programs section of `docs/design/marketing/MeditatePage.dc.html`, and `MeditatePage-programs.png`.
- **Mobile:** the Programs section of `docs/design/marketing/MeditateMobile.dc.html`, and `MeditateMobile-programs.png`.

Both design files are plain HTML with inline styles. **Read their source for this section and port its structure**: the same elements, nesting, borders, radii, padding, gaps and font sizes.
- Ignore the `<helmet>`, `<x-dc>` and script wrappers.
- The images in the design files are low-resolution stand-ins (see "Images").

## Colours

- Keep the section's current background.
- For everything else (cards, borders, title, muted text, link), match the design using the existing token for each role.

## Don't touch

Other sections, the header, the footer, colour tokens, other pages.

## Copy (desktop and mobile)

- **Eyebrow:** "Programs". **H2:** "Guided journeys, made personal." (both unchanged)
- **Lead:** "Follow a course session by session, as it's written. Or make it your own, and each session is rewritten around what's going on for you that day."
- **Point** (in the same style as other sections' sub-points):
  - **Make it your own:** "Pick a program, say what's going on in a quick chat, and every session after that is shaped around it."

## Data and images

Show these four programs, in this order:
1. **Four Directions of Self-Compassion**
2. **Sleep Reset**
3. **Confidence Rebuild**
4. **Chakra Cleanse**

- **Use their real cover images and lesson counts from the media bucket and program data** that the app's Programs tab already uses.
  - Find where the app gets program covers (the media bucket or its CDN URL) and the program records.
  - In the marketing app, read them the way it already reads public content (the public API used for the community library, if there is one). Fetch at build time or with ISR, not on the client. Look the four programs up by slug or ID.
  - If there's no public endpoint, use the four cover URLs from the media bucket directly, plus their current lesson counts, in a small config. Tell me which approach you used.
- Render the images with `next/image`. Add the bucket or CDN host to `images.remotePatterns` if it isn't already there. Use `alt=""`, since the images are decorative.
- **Don't** use the images embedded in the design files.

## Desktop graphic (`md` and up)

- Keep the section's two-column layout: text on the left; the graphic column about **600px** wide.
- **A 2×2 grid** with a **12px** gap.
- **Each card:**
  - a flex row, items stretched, radius **14px**, 1px card border, card surface, `overflow: hidden`;
  - a **square cover image, 120×120**, `object-fit: cover`, flush with the card's left, top and bottom edges;
  - beside it, a column, vertically centred, with padding **12px 14px** and a 4px gap: the title in serif **17px**, line-height 1.25, wrapping; then "{n} lessons" in sans **13px**, muted.
- **Under the grid:** "And more in the library →", right-aligned, sans **14px 600**, accent. It links to the public programs listing (or the app's Programs tab if there isn't one).
- Each card links to that program's public page, if one exists, or to the app's program page.

## Mobile graphic (below `md`)

- **One card**: radius **14px**, 1px card border, card surface, padding **4px 16px**.
- **Four rows.** Each row is a flex row with a **12px** gap, items centred, padding **10px 0**, and a 1px hairline between rows:
  - a **48×48** square cover, radius **9px**, `object-fit: cover`;
  - the title in serif **15px**, line-height 1.25, with "{n} lessons" under it in sans **12px**, muted (2px gap).
- **Last row:** "And more in the library →" in sans **13px 600**, accent, with padding 12px 0 10px and a hairline above it.
- The "Make it your own" point sits **above** the card, after the lead (eyebrow, H2, lead, point, card).

## Done when

- On desktop, the section matches `MeditatePage-programs.png`. At 360px, it matches `MeditateMobile-programs.png`.
- Real covers and lesson counts load from the media bucket and program data.
- The old toggle graphic is gone, along with any components left unused.
- No other section has changed.
- Send desktop and 360px screenshots of the section, and list the files changed.
