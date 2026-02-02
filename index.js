import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/api/scrape', async (req, res) => {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    
    // Login
    await page.goto(process.env.FULSHIP_LOGIN_URL, { waitUntil: 'networkidle0' });
    await page.type('#username', process.env.FULSHIP_USER);
    await page.type('#password', process.env.FULSHIP_PASS);
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);

    // Navigazione Prodotti
    await page.goto(process.env.FULSHIP_PRODUCTS_URL, { waitUntil: 'networkidle0' });

    // Scraping
    const data = await page.$$eval('table#products tbody tr', (rows) => {
      return rows.map(r => {
        const cols = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim());
        return { sku: cols[0], name: cols[1], qty: cols[2], location: cols[3] };
      });
    });

    await browser.close();
    res.json(data);
  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server pronto su porta ${PORT}`));
