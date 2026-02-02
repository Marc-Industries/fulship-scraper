// Modifica gli import per gestire il pacchetto CommonJS
import pkg from '@sparticuz/chromium';
const { chromium } = pkg; 

import { chromium as playwrightChromium } from 'playwright-core';

export default async function handler(req, res) {
  let browser = null;
  
  try {
    // Il resto del codice rimane lo stesso
    const executablePath = await chromium.executablePath();

    browser = await playwrightChromium.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: executablePath,
      headless: chromium.headless,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    
    const page = await context.newPage();

    // --- LOGICA DI LOGIN E SCRAPING ---
    await page.goto(process.env.FULSHIP_LOGIN_URL, { waitUntil: 'networkidle' });
    await page.fill('#username', process.env.FULSHIP_USER);
    await page.fill('#password', process.env.FULSHIP_PASS);
    
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForLoadState('networkidle')
    ]);

    await page.goto(process.env.FULSHIP_PRODUCTS_URL, { waitUntil: 'networkidle' });

    const data = await page.$$eval('table#products tbody tr', (rows) => {
      return rows.map(r => {
        const cols = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim());
        return {
          sku: cols[0] || 'N/A',
          name: cols[1] || 'N/A',
          qty: cols[2] || '0',
          location: cols[3] || 'N/A'
        };
      });
    });

    await browser.close();
    return res.status(200).json(data);

  } catch (err) {
    if (browser) await browser.close();
    return res.status(500).json({ error: err.message });
  }
}
