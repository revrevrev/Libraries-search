# חיפוש ספרים בספריות דיגיטליות

A web app that searches for a book simultaneously in two Israeli digital library services and displays results side by side.

## Sites Searched

| Site | URL | Notes |
|------|-----|-------|
| עברית (e-vrit) | https://www.e-vrit.co.il | Book store + public library loans |
| Libby – Tel Aviv | https://libbyapp.com/library/telaviv | OverDrive-powered public library |

## Features

- Search both sites in parallel with a single query
- **e-vrit**: shows format badges (digital / print / audio); flags books available as library loans ("ספרייה ציבורית דיגיטלית") via a background ID cache
- **Libby**: shows cover image and format type
- Hebrew/RTL UI, responsive two-column layout
- Clickable results linking directly to each book's page

## Requirements

- Node.js 16+

## Setup

```bash
npm install
npm start
```

Then open http://localhost:3001 in your browser.

## Deployment

The app is deployable to [Render.com](https://render.com) (or any Node.js host):

1. Push the repo to GitHub
2. Create a new **Web Service** on Render pointing to the repo
3. Build command: `npm install` · Start command: `npm start`
4. Render automatically injects the `PORT` environment variable

> On the free tier, the service sleeps after 15 minutes of inactivity and takes ~30 seconds to wake on the next request.

## How It Works

### Backend (`server.js`)

- **`GET /api/evrit?q=...`** — Calls e-vrit's internal Next.js API (`/api/search/{query}/products?take=15`). Returns up to 15 results. Each result includes `isLoan: true/false` based on a startup cache of all ~27,000 book IDs in Group 286 ("ספרייה ציבורית דיגיטלית"); `isLoan` is `null` only during the brief window before the cache first loads. The cache refreshes every 6 hours.

- **`GET /api/libby?q=...`** — Proxies a search to the OverDrive API (`thunder.api.overdrive.com/v2/libraries/telaviv/media`). No authentication required. Availability data from this API is cached and unreliable, so it is not displayed.

### Frontend (`public/index.html`)

Single-file vanilla HTML/CSS/JS. Calls the two backend endpoints in parallel and renders results as book cards.

## Notes

- Port 3001 is used instead of 3000 to avoid conflicts with other local services.
