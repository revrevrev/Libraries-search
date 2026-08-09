'use strict';

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, 'public')));

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, */*;q=0.8',
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
};

// ─── Library loan cache (Group 286 = ספרייה ציבורית דיגיטלית) ──────────────
// e-vrit's loan flag (IsDigitalLending) is per-user and always false for anonymous
// requests. Instead we paginate through all books in group 286 and cache their IDs.

let loanBookIds = new Set();
let loanCacheReady = false;

async function refreshLoanCache() {
  const BATCH = 1000;
  const ids = new Set();
  let skip = 0;

  console.log('[loan-cache] refreshing...');
  for (;;) {
    try {
      const url = `https://www.e-vrit.co.il/api/group/286/products?skip=${skip}&take=${BATCH}`;
      const data = await fetch(url, { headers: BROWSER_HEADERS }).then(r => r.json());

      if (!data.Items || data.Items.length === 0) break;

      for (const p of data.Items) ids.add(p.ProductID);

      if (data.Items.length < BATCH) break;
      skip += BATCH;
    } catch (err) {
      console.error('[loan-cache] fetch error at skip', skip, ':', err.message);
      break;
    }
  }

  if (ids.size > 0) {
    loanBookIds = ids;
    loanCacheReady = true;
    console.log(`[loan-cache] loaded ${ids.size} loanable book IDs`);
  } else {
    console.warn('[loan-cache] got 0 IDs — keeping previous cache');
  }
}

// Refresh on startup (non-blocking) and every 6 hours
refreshLoanCache().catch(err => console.error('[loan-cache] startup error:', err.message));
setInterval(() => refreshLoanCache().catch(err => console.error('[loan-cache] refresh error:', err.message)), 6 * 60 * 60 * 1000);

// ─── e-vrit search endpoint ────────────────────────────────────────────────
app.get('/api/evrit', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    const url = `https://www.e-vrit.co.il/api/search/${encodeURIComponent(q)}/products?take=15`;
    const data = await fetch(url, { headers: BROWSER_HEADERS }).then(r => r.json());

    const products = data.Items || [];

    const books = products.map((p) => {
      const pricing = p.ProductPricing || {};
      const slug = encodeURIComponent((p.ProductName || '').replace(/\s+/g, '-'));
      const coverUrl = p.Image
        ? `https://images.e-vrit.co.il/${p.Image}`
        : null;

      return {
        id: p.ProductID,
        name: p.ProductName || '',
        author: (p.Authors || []).map(a => a.Name).join(', '),
        isDigital: !!pricing.DigitalPricing,
        isPrinted: !!pricing.PrintedPricing,
        isAudio: !!pricing.AudioPricing,
        isLoan: loanCacheReady ? loanBookIds.has(p.ProductID) : null,
        coverUrl,
        priceDigital: pricing.DigitalPricing?.priceFinal ?? null,
        rating: p.AvgReviews ?? null,
        reviewCount: p.CountReviews ?? 0,
        url: `https://www.e-vrit.co.il/product/${p.ProductID}/${slug}`,
      };
    });

    res.json({ books, total: books.length, shown: books.length });
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
      coverUrl: item.covers?.cover300Wide?.href || item.covers?.cover150Wide?.href || null,
      url: `https://libbyapp.com/library/telaviv/everything/page-1/${item.id || item.reserveId}`,
    }));

    res.json({ books, total: data.totalItems || books.length });
  } catch (err) {
    console.error('libby error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function killIfSameProcess(port) {
  if (process.platform !== 'win32') return;
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
