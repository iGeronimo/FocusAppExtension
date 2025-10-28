# Focus Landing Site

A simple, dark, static landing page for the Focus extension.

## Structure

- `index.html` – Main landing page with hero, features, how it works, screenshots, and FAQ.
- `styles.css` – Minimalist, responsive dark theme matching the extension.
- `script.js` – Mobile nav toggle and smooth in-page scrolling.

## Replace placeholders

- Hero CTA: Update the "Add to Chrome" link to your Chrome Web Store listing once published.
- Screenshots: Replace the placeholder boxes with real images.
  - Option A: Drop PNGs/JPGs in a folder like `site/screenshots/` and replace each `.shot-box` with `<img src="screenshots/your-shot.png" alt="...">`.
  - Option B: Keep the placeholders until you capture screenshots.

## Local preview

Open `site/index.html` directly in your browser, or use a tiny static server if you prefer:

```powershell
# Optionally from the repository root
pwsh -NoLogo -NoProfile -Command "cd site; python -m http.server 8080"
# Then visit http://localhost:8080
```

## Customization tips

- Colors: Edit CSS variables at the top of `styles.css`.
- Sections: Add or remove cards by duplicating the existing markup.
- Analytics: If you add analytics, ensure it respects your privacy-first stance.
