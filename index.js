import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/api/scrape', async (req, res) => {
  let browser = null;
  try {
    console.log("Avvio Browser...");
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null, // Per Render
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1200 });

    // 1. Login - Uso dei selettori ID confermati dalle tue immagini
    await page.goto(process.env.FULSHIP_LOGIN_URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#id_username', { visible: true });
    await page.type('#id_username', process.env.FULSHIP_USER);
    await page.type('#id_password', process.env.FULSHIP_PASS);
    
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    let allProducts = [];

    // 2. Loop sulle 5 pagine
    for (let p = 1; p <= 5; p++) {
      console.log(`Scraping pagina ${p}...`);
      await page.goto(`https://cloud.fullship.it/products/?page=${p}`, { waitUntil: 'networkidle2' });

      // Attesa che HTMX carichi le tabelle (basata sui tuoi DevTools)
      await page.waitForFunction(() => {
        return document.querySelectorAll('table tbody tr').length > 0;
      }, { timeout: 15000 }).catch(() => console.log("Nessuna tabella caricata a pag " + p));

      const pageData = await page.evaluate(() => {
        const results = [];
        // Selettore basato sulle tue card HTMX
        const items = document.querySelectorAll('li.list-group-item');
        
        items.forEach(item => {
          // Il titolo del gruppo (es: Spartan Strength+)
          const groupTitle = item.querySelector('.d-flex.justify-content-between div b')?.innerText.trim() || "";
          
          const rows = item.querySelectorAll('table tbody tr');
          rows.forEach(row => {
            const cols = row.querySelectorAll('td');
            if (cols.length >= 8) {
              results.push({
                group: groupTitle,
                variant: cols[1]?.innerText.trim(), // Title
                qty: cols[7]?.innerText.trim()     // Available
              });
            }
          });
        });
        return results;
      });
      allProducts = allProducts.concat(pageData);
    }

    await browser.close();
    res.status(200).json({ data: allProducts });

  } catch (err) {
    console.error("Errore critico:", err.message);
    if (browser) await browser.close();
    res.status(500).json({ error: err.message, message: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server attivo su porta ${PORT}`));
