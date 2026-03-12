# Project: Library Book Search

Node.js/Express app that searches for books in e-vrit and Libby (Tel Aviv OverDrive library).

## Architecture

- **`server.js`** — Express backend on port 3001, two API endpoints
- **`public/index.html`** — Single-file frontend, vanilla JS, Hebrew RTL

## Running

```bash
npm start   # starts on http://localhost:3001
```

Port 3000 is occupied by another local service — do not change the port back to 3000.

## API Endpoints

### `GET /api/evrit?q=<query>`
Scrapes e-vrit search results.
- Fetches `https://www.e-vrit.co.il/Search/{query}`
- Extracts product data from the `"ProductListItems"` key inside the `ReactDOM.hydrate(...)` script block
- For each product, fetches its individual page and checks for `loan-product__txt` CSS class to determine library loan eligibility
- Returns up to 15 results

Key field names in the e-vrit React props:
- `ProductID` — numeric ID (used in product URLs)
- `Name` — book title
- `AuthorName` — author
- `IsDigital`, `IsPrinted`, `IsAudio` — format flags
- `Image` — relative path, prefix with `https://www.e-vrit.co.il/`
- `ProductPrices.DigitalOriginalPrice`

### `GET /api/libby?q=<query>`
Proxies to the OverDrive API.
- Endpoint: `https://thunder.api.overdrive.com/v2/libraries/telaviv/media?query=...&limit=20`
- No authentication required
- Key response fields: `title`, `firstCreatorName`, `isAvailable`, `availableCopies`, `ownedCopies`, `holdsCount`, `estimatedWaitDays`, `covers.cover300Wide.href`, `type.id` (ebook/audiobook/magazine)

## Loan Detection (e-vrit)

Loanable books ("ספרייה ציבורית דיגיטלית") are identified by the presence of `class="loan-product__txt"` in the product page HTML.
- The Hebrew text "ספרייה ציבורית דיגיטלית" also appears in the site navigation (link to `/Group/286/`), so text-only matching produces false positives — always use the CSS class.
- `IsLoan` is NOT present in the search results list; individual product page fetches are required.

## JSON Extraction from e-vrit HTML

The function `extractJSONArray(html, key)` uses bracket-matching (handling nested objects, arrays, and string literals) to extract a JSON array from the server-rendered React props script. The relevant key is `ProductListItems`.
