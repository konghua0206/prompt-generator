# NovelAI Image Generator (Pure GitHub Pages)

This is a **pure front-end** generator intended for **personal use**.

## Important
- Token is **RAM-only** (not stored).
- The app calls NovelAI directly from the browser. Depending on NovelAI's CORS policy, direct calls may be blocked.
  - If blocked, use a backend proxy (the B version).

## Data for Prompt Generator
Put your category txt files under:
- `data/<分類>.txt` (Chinese filenames supported)
- Example: `data/外套.txt`

## Deploy to GitHub Pages
Upload `index.html`, `app.js`, `promptgen.js`, and `data/` folder to a repo and enable GitHub Pages.
