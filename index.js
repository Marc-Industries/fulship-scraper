import express from 'express';
import { chromium } from 'playwright';

const app = express();
const PORT = process.env.PORT || 10000; // Render usa solitamente la 10000

app.get('/api/scrape', async (req, res) => {
  let browser = null;
  try {
    console.log("Avvio scraping...");
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();

    // LOGIN FULSHIP
    await page.goto(process.env.FULSHIP_LOGIN_URL, { waitUntil: 'networkidle' });
    await page.fill('#username', process.env.FULSHIP_USER);
    await page.fill('#password', process.env.FULSHIP_PASS);
    
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle' })
    ]);

    // NAVIGAZIONE PRODOTTI
    await page.goto(process.env.FULSHIP_PRODUCTS_URL, { waitUntil: 'networkidle' });

    // ESTRAZIONE DATI
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
    console.log(`Scraping completato: ${data.length} righe trovate.`);
    res.json(data);

  } catch (err) {
    console.error("Errore:", err.message);
    if (browser) await browser.close();
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server pronto sulla porta ${PORT}`);
});
