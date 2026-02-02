import { chromium } from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';

export default async function handler(req, res) {
  // Protezione opzionale: controlla una API Key passata negli header
  const authHeader = req.headers['x-api-key'];
  if (process.env.SCRAPE_API_KEY && authHeader !== process.env.SCRAPE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let browser = null;

  try {
    // Configurazione Chromium per Vercel
    const executablePath = await chromium.executablePath();

    browser = await playwrightChromium.launch({
      args: chromium.args,
      executablePath: executablePath,
      headless: chromium.headless,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    // --- LOGIN FULSHIP ---
    await page.goto(process.env.FULSHIP_LOGIN_URL, { waitUntil: 'networkidle' });
    await page.fill('#username', process.env.FULSHIP_USER);
    await page.fill('#password', process.env.FULSHIP_PASS);
    await page.click('button[type="submit"]');
    
    // Aspetta che il login sia completato verificando un elemento della dashboard
    await page.waitForLoadState('networkidle');

    // --- NAVIGAZIONE PRODOTTI ---
    await page.goto(process.env.FULSHIP_PRODUCTS_URL, { waitUntil: 'networkidle' });

    // --- ESTRAZIONE DATI ---
    const data = await page.$$eval('table#products tbody tr', (rows) => {
      return rows.map(r => {
        const cols = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim());
        return {
          sku: cols[0] || 'N/A',
          name: cols[1] || 'N/A',
          qty: cols[2] || '0',
          location: cols[3] || 'N/A',
          timestamp: new Date().toISOString()
        };
      });
    });

    await browser.close();

    // Restituisce i dati a Make
    res.status(200).json(data);

  } catch (err) {
    console.error("Errore durante lo scraping:", err);
    
    if (browser) await browser.close();
    
    res.status(500).json({ 
      error: "Failed to scrape data", 
      details: err.message 
    });
  }
}
