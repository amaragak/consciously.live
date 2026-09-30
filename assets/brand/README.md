# Consciously sun mark (option C, "fine sun")

This is a refinement of the current sun: a smaller disc, thinner rays, alternating long and short.

**svg/**
- `sun.svg`: single colour (`currentColor`). Use this everywhere in the UI; its colour comes from CSS.
- `sun-gold-on-light.svg` (#B8914F) / `sun-gold-on-dark.svg` (#C8A46A): fixed-colour versions for places without CSS (emails, docs).
- `sun-gradient.svg`: a radial light-gold to bronze disc. **Large uses only** (64px and up): splash screen, sign-in, social images. Keep small sizes flat.
- `favicon.svg`: new fine-sun mark in light-mode primary (`#F0A865`). Paired with `favicon-32.png` / `favicon-16.png`.
- `app-icon.svg`: the gradient sun on a navy (#0F1B2D) square. The platform rounds the corners.

**png/**
- `app-icon-512.png`, `app-icon-192.png` (web manifest)
- `apple-touch-icon.png` (180)
- `favicon-32.png`, `favicon-16.png`
- `sun-gradient-1024.png` (for social and press use)

Then paste `CURSOR_PROMPT.md` into Cursor to swap it in.
