import pkg from '@sparticuz/chromium';
const { chromium } = pkg; 
import { chromium as playwrightChromium } from 'playwright-core';

export default async function handler(req, res) {
  // Gestione CORS per permettere a Make di ricevere i dati
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let browser = null;

  try {
    // 1. Inizializzazione Chromium con i parametri per Vercel
    const executablePath = await chromium.executablePath();

    browser = await playwrightChromium.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: executablePath,
      headless: chromium.headless,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    // Timeout di 30 secondi per evitare attese infinite
    page.setDefaultTimeout(30000);

    // 2. Login su Fulship
    await page.goto(process.env.FULSHIP_LOGIN_URL, { waitUntil: 'networkidle' });
    
    await page.fill('#username', process.env.FULSHIP_USER);
    await page.fill('#password', process.env.FULSHIP_PASS);
    
    // Clicca e aspetta la navigazione post-login
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle' })
    ]);

    // 3. Navigazione alla tabella prodotti
    await page.goto(process.env.FULSHIP_PRODUCTS_URL, { waitUntil: 'networkidle' });

    // 4. Estrazione dati
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

    // 5. Chiusura browser e invio risposta a Make
    await browser.close();
    return res.status(200).json(data);

  } catch (err) {
    console.error("Scraper Error:", err.message);
    if (browser) await browser.close();
    
    return res.status(500).json({ 
      error: "Internal Server Error", 
      message: err.message 
    });
  }
}
