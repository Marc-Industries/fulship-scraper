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
    await page.setViewport({ width: 1400, height: 1000 });

    // 1. LOGIN
    console.log("Navigazione al login...");
    await page.goto(process.env.FULSHIP_LOGIN_URL, { waitUntil: 'networkidle2' });
    
    await page.waitForSelector('#id_username', { visible: true });
    await page.type('#id_username', process.env.FULSHIP_USER);
    await page.type('#id_password', process.env.FULSHIP_PASS);
    
    console.log("Invio form...");
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    let allProducts = [];

    // 2. LOOP PAGINE
    for (let p = 1; p <= 5; p++) {
      console.log(`Scraping pagina ${p}...`);
      await page.goto(`https://cloud.fullship.it/products/?page=${p}`, { waitUntil: 'networkidle2' });

      // ATTESA CRUCIALE: Aspettiamo che almeno una tabella HTMX sia caricata
      await page.waitForFunction(() => {
        const tables = document.querySelectorAll('table tbody tr');
        return tables.length > 0;
      }, { timeout: 15000 }).catch(() => console.log("Timeout attesa tabelle a pag " + p));

      const pageData = await page.evaluate(() => {
        const results = [];
        // Selezioniamo i gruppi (Spartan Strength+, Spartan Testo, ecc.)
        const groups = document.querySelectorAll('li.list-group-item'); 
        
        groups.forEach(group => {
          const groupTitle = group.querySelector('.d-flex.justify-content-between div')?.innerText.trim() || "";
          const rows = group.querySelectorAll('table tbody tr');
          
          rows.forEach(row => {
            const cols = row.querySelectorAll('td');
            if (cols.length >= 8) {
              results.push({
                group: groupTitle,
                variant: cols[1]?.innerText.trim(), // Contiene ID e Gusto/Tipo
                qty: cols[7]?.innerText.trim()     // Colonna Available
              });
            }
          });
        });
        return results;
      });

      console.log(`Trovati ${pageData.length} elementi.`);
      allProducts = allProducts.concat(pageData);
    }

    await browser.close();
    res.status(200).json({ data: allProducts });

  } catch (err) {
    console.error("Errore:", err.message);
    if (browser) await browser.close();
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server attivo`));
