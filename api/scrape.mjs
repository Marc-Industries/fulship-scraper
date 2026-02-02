import { chromium } from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';

export default async function handler(req, res) {
  // 1. Gestione CORS (permette a Make o altri servizi di chiamare l'API)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let browser = null;

  try {
    // 2. Configurazione specifica per l'ambiente Vercel
    const executablePath = await chromium.executablePath();

    browser = await playwrightChromium.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: executablePath,
      headless: chromium.headless,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    // 3. Esecuzione Login Fulship
    await page.goto(process.env.FULSHIP_LOGIN_URL, { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    
    await page.fill('#username', process.env.FULSHIP_USER);
    await page.fill('#password', process.env.FULSHIP_PASS);
    
    // Usiamo Promise.all per gestire il click e l'attesa del caricamento
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForLoadState('networkidle')
    ]);

    // 4. Navigazione alla pagina prodotti
    await page.goto(process.env.FULSHIP_PRODUCTS_URL, { waitUntil: 'networkidle' });

    // 5. Estrazione dati dalla tabella
    const data = await page.$$eval('table#products tbody tr', (rows) => {
      return rows.map(r => {
        const cols = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim());
        return {
          sku: cols[0] || '',
          name: cols[1] || '',
          qty: cols[2] || '0',
          location: cols[3] || '',
        };
      });
    });

    // 6. Chiusura browser e invio risposta
    await browser.close();
    
    // Restituiamo l'array JSON che Make leggerà automaticamente
    return res.status(200).json(data);

  } catch (err) {
    console.error("Dettaglio Errore:", err);
    if (browser) await browser.close();
    return res.status(500).json({ error: err.message });
  }
}
