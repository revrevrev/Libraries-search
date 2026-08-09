# Project: Library Book Search

Node.js/Express app that searches for books in e-vrit and Libby (Tel Aviv OverDrive library).

## Architecture

- **`server.js`** — Express backend on port 3001, two API endpoints
- **`public/index.html`** — Single-file frontend, vanilla JS, Hebrew RTL
- **`README.md`** — User-facing project documentation

## Running

```bash
npm start   # starts on http://localhost:3001
```

Port 3000 is occupied by another local service — do not change the port back to 3000.

## Deployment

Deployed on [Render.com](https://render.com) as a Web Service from the GitHub repo.

- **Build command**: `npm install`
- **Start command**: `npm start`
- **Port**: Render injects a `PORT` env variable; the server uses `process.env.PORT || 3001`
- **Platform note**: `killIfSameProcess()` is guarded by `process.platform !== 'win32'` — it is a no-op on Render's Linux containers (dev convenience only)

## API Endpoints

### `GET /api/evrit?q=<query>`
Proxies to e-vrit's internal Next.js API.
- Fetches `https://www.e-vrit.co.il/api/search/{encodedQuery}/products?take=15`
- The site migrated to Next.js (2025); the old `/Search/{query}` HTML-scraping approach no longer works
- Returns up to 15 results

Key field names in the e-vrit API response (`Items` array):
- `ProductID` — numeric ID (used in product URLs)
- `ProductName` — book title
- `Authors` — array of `{ID, Name, Url}` objects
- `ProductPricing.DigitalPricing` — present if book has a digital version (also signals digital availability)
- `ProductPricing.AudioPricing` — present if book has an audio version
- `ProductPricing.PrintedPricing` — present if book has a printed version
- `Image` — relative path, prefix with `https://images.e-vrit.co.il/`
- `AvgReviews`, `CountReviews` — rating data
- Product URL format: `https://www.e-vrit.co.il/product/{id}/{title-with-hyphens}`

### `GET /api/libby?q=<query>`
Proxies to the OverDrive API.
- Endpoint: `https://thunder.api.overdrive.com/v2/libraries/telaviv/media?query=...&limit=20`
- No authentication required
- Key response fields: `title`, `firstCreatorName`, `covers.cover300Wide.href`, `type.id` (ebook/audiobook/magazine)
- Availability fields (`isAvailable`, `availableCopies`, `ownedCopies`, `holdsCount`, `estimatedWaitDays`) are NOT used — the OverDrive API returns cached/stale availability data that doesn't match what Libby actually shows; availability badges were removed from the UI for this reason
- Book URLs use the format: `https://libbyapp.com/library/telaviv/everything/page-1/{id}`

## Loan Detection (e-vrit)

Library loan status (`isLoan`) is detected via a **startup ID cache**:
- e-vrit's public digital library books belong to **Group 286** ("ספרייה ציבורית דיגיטלית") — ~27,108 books total.
- The server paginates `GET https://www.e-vrit.co.il/api/group/286/products?skip=N&take=1000` on startup (~28 sequential requests), collecting all `ProductID` values into a JavaScript `Set`.
- The cache refreshes every 6 hours via `setInterval`.
- `isLoan` is `true`/`false` once the cache is ready, `null` during the brief startup window before the first load completes.
- Why not single-request? `take=27500` technically works but returns 85 MB JSON over ~3 minutes; pagination is more resilient and much faster.
- The old approach (CSS class `loan-product__txt`) is gone — the site is now client-side rendered.
- `IsDigitalLending`/`IsAudioLending` in the product API are per-user and always `false` for unauthenticated requests.
