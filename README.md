# playables-research-dashboard

Static SPA dashboard for browsing and rating GitHub repositories collected by the [playables-research](https://github.com/ant0art/playables-research) pipeline.

## Features

- Google OAuth sign-in (client-side, no backend)
- Read/write data from Google Sheets via Sheets API v4
- Filter by category, language, status, effort
- Sort by any column (stars, score, rating, name...)
- Personal ratings (1-5 stars) and notes per repository
- Status tracking: new / watch / skip / integrated
- Dark & light theme toggle
- Responsive: desktop table, tablet, mobile cards

## Hosting

Deployed via GitHub Pages at `https://ant0art.github.io/playables-research-dashboard/`

## Development

```bash
# Local preview
python -m http.server 8080
# or
npx serve .
```

Open `http://localhost:8080` in browser.

## Architecture

```
index.html  — SPA entry point (3 screens: auth, sheet picker, dashboard)
style.css   — Design system (CSS custom properties, dark/light themes)
app.js      — OAuth, Sheets API, sorting, filtering, rendering
```

No build step. No dependencies. Pure HTML + CSS + JS.
