# חיפוש ספרים בספריות דיגיטליות

A web app that searches for a book simultaneously in two Israeli digital library services and displays results side by side.

## Sites Searched

| Site | URL | Notes |
|------|-----|-------|
| עברית (e-vrit) | https://www.e-vrit.co.il | Book store + public library loans |
| Libby – Tel Aviv | https://libbyapp.com/library/telaviv | OverDrive-powered public library |

## Features

- Search both sites in parallel with a single query
- **e-vrit**: shows format badges (digital / print / audio) and highlights books available for public library loan ("ספרייה ציבורית דיגיטלית")
- **Libby**: shows cover image, format type, and real-time availability (available / waitlist with estimated wait days / unavailable)
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

## How It Works

### Backend (`server.js`)

- **`GET /api/evrit?q=...`** — Fetches the e-vrit search page, extracts the `ProductListItems` array from the server-rendered React props, then checks each book's product page in parallel for the `loan-product__txt` CSS class to determine library loan availability. Returns up to 15 results.

- **`GET /api/libby?q=...`** — Proxies a search to the OverDrive API (`thunder.api.overdrive.com/v2/libraries/telaviv/media`) and returns structured availability data. No authentication required.

### Frontend (`public/index.html`)

Single-file vanilla HTML/CSS/JS. Calls the two backend endpoints in parallel and renders results as book cards.

## Notes

- The e-vrit loan check requires one HTTP request per result (up to 15), so the e-vrit column may take a few seconds longer to load.
- Port 3001 is used instead of 3000 to avoid conflicts with other local services.
