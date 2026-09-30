# Cursor prompt: swap in the new sun mark

Paste everything below the line into Cursor (Agent mode). First copy this folder's `svg/` and `png/` into the repo (e.g. `assets/brand/`), then update the paths below if you put them elsewhere.

---

Replace the sun logo mark across the marketing app (Next.js) and the SPA with the new files in `assets/brand/`. **Mark only:** don't change any colours or colour tokens, the wordmark text, the header layout, or anything else.

1. **One component.** Create (or update) a single `SunMark` component that renders the paths from `assets/brand/svg/sun.svg`, using `fill`/`stroke="currentColor"`. It takes a `size` prop (default 22), sets `aria-hidden="true"`, and has no title, because the wordmark next to it is the accessible name. Its colour comes from the same token the current sun uses. Replace every inline or duplicated sun SVG in both apps with this component, and list each place you changed.
2. **Keep sizes and alignment.** Same rendered size and position as today. The new mark has more whitespace inside its 48-unit box, so check it's vertically centred against the wordmark. Nudge by at most 1px if needed.
3. **Large placements.** Where the sun appears at 64px or larger (sign-in, splash or loading screen, if any), use `sun-gradient.svg` instead. The gradient id `sunfill` must be unique per instance if inlined; prefer loading it as an `<img>`.
4. **Favicons and app icons:**
   - `favicon.svg` as the primary icon (`<link rel="icon" type="image/svg+xml">`), with `favicon-32.png` / `favicon-16.png` as fallbacks.
   - `apple-touch-icon.png`.
   - `app-icon-192.png` and `app-icon-512.png` in the web manifest (both apps).
   - Remove the old icon files if nothing else references them.
5. **Social image.** If there's an Open Graph image that uses the old sun, list it. Don't regenerate it.

Done when no old sun SVG remains (search for its path data), both apps show the new mark in the header at the same size, the favicons and manifest icons are updated, no colour tokens changed, and build passes. List the files you changed.
