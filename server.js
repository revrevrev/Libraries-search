'use strict';

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = 3001;

app.use(express.static(path.join(__dirname, 'public')));

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
};

/**
 * Extract a JSON array from an HTML string by finding a key and bracket-matching.
 * Handles nested objects/arrays and string literals correctly.
 */
function extractJSONArray(html, key) {
  const keyPattern = `"${key}":`;
  const keyIdx = html.indexOf(keyPattern);
  if (keyIdx === -1) return null;

  const arrayStart = html.indexOf('[', keyIdx + keyPattern.length);
  if (arrayStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = arrayStart; i < html.length; i++) {
    const ch = html[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }

    if (!inString) {
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(arrayStart, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Fetch an e-vrit product page and check if the book is available for library loan.
 * Loanable books have a <span class="loan-product__txt"> element in the product section.
 */
async function checkIsLoan(productId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const html = await fetch(`https://www.e-vrit.co.il/Product/${productId}/`, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    }).then(r => r.text()).finally(() => clearTimeout(timeout));

    // The loan badge uses CSS class "loan-product__txt" – present only on loanable books.
    // Nav links to /Group/286/ also contain the Hebrew text but NOT this class.
    return html.includes('loan-product__txt');
  } catch {
    return null; // null = unknown (timeout or network error)
  }
}

// ─── e-vrit search endpoint ────────────────────────────────────────────────

app.get('/api/evrit', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    const url = `https://www.e-vrit.co.il/Search/${encodeURIComponent(q)}`;
    const html = await fetch(url, { headers: BROWSER_HEADERS }).then(r => r.text());

    // The React props use "ProductListItems" (not "ProductList")
    const products = extractJSONArray(html, 'ProductListItems') || [];
    const totalResults = (() => {
      const m = html.match(/"TotalResults"\s*:\s*(\d+)/);
      return m ? parseInt(m[1], 10) : products.length;
    })();

    const limited = products.slice(0, 15);

    // Check loan status for each book in parallel
    const books = await Promise.all(limited.map(async (p) => {
      const isLoan = await checkIsLoan(p.ProductID);

      const slug = encodeURIComponent((p.Name || '').replace(/\s+/g, '_'));
      const coverUrl = p.Image
        ? `https://www.e-vrit.co.il/${p.Image}`
        : null;

      return {
        id: p.ProductID,
        name: p.Name || '',
        author: p.AuthorName || '',
        isDigital: !!p.IsDigital,
        isPrinted: !!p.IsPrinted,
        isAudio: !!p.IsAudio,
        isLoan,
        coverUrl,
        priceDigital: p.ProductPrices?.DigitalOriginalPrice ?? null,
        rating: p.AvgReviews ?? null,
        reviewCount: p.CountReviews ?? 0,
        url: `https://www.e-vrit.co.il/Product/${p.ProductID}/${slug}`,
      };
    }));

    res.json({ books, total: totalResults, shown: books.length });
  } catch (err) {
    console.error('e-vrit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Libby/OverDrive search endpoint ───────────────────────────────────────

app.get('/api/libby', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    const url = `https://thunder.api.overdrive.com/v2/libraries/telaviv/media?query=${encodeURIComponent(q)}&limit=20`;
    const data = await fetch(url).then(r => r.json());

    const books = (data.items || []).map(item => ({
      id: item.id || item.reserveId,
      reserveId: item.reserveId,
      title: item.title || '',
      author: item.firstCreatorName || '',
      type: item.type?.name || '',
      typeId: item.type?.id || '',
      isAvailable: item.isAvailable,
      availableCopies: item.availableCopies ?? 0,
      ownedCopies: item.ownedCopies ?? 0,
      holdsCount: item.holdsCount ?? 0,
      estimatedWaitDays: item.estimatedWaitDays ?? 0,
      coverUrl: item.covers?.cover300Wide?.href || item.covers?.cover150Wide?.href || null,
      url: `https://libbyapp.com/library/telaviv/details/${item.id || item.reserveId}`,
    }));

    res.json({ books, total: data.totalItems || books.length });
  } catch (err) {
    console.error('libby error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function killIfSameProcess(port) {
  try {
    const netstat = execSync(`netstat -ano`, { encoding: 'utf8' });
    const match = netstat.split('\n')
      .find(line => line.includes(`:${port} `) && line.includes('LISTENING'));
    if (!match) return;

    const pid = match.trim().split(/\s+/).pop();
    const cmdline = execSync(
      `powershell -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
      { encoding: 'utf8' }
    );
    if (cmdline.toLowerCase().includes('server.js')) {
      console.log(`Killing previous instance (PID ${pid})...`);
      execSync(`taskkill /PID ${pid} /F`);
    }
  } catch {
    // port not in use or query failed — proceed normally
  }
}

killIfSameProcess(PORT);

app.listen(PORT, () => {
  console.log(`Library search running at http://localhost:${PORT}`);
});
