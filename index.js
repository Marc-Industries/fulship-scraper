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
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

    // 1. Login
    await page.goto(process.env.FULSHIP_LOGIN_URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#id_username', { visible: true });
    await page.type('#id_username', process.env.FULSHIP_USER);
    await page.type('#id_password', process.env.FULSHIP_PASS);
    await Promise.all([
      page.keyboard.press('Enter'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    let allProducts = [];

    // 2. Navigazione sulle 5 pagine dei prodotti
    for (let p = 1; p <= 5; p++) {
      console.log(`Scraping pagina ${p}...`);
      await page.goto(`https://cloud.fullship.it/products/?page=${p}`, { waitUntil: 'networkidle2' });

      const pageData = await page.evaluate(() => {
        const results = [];
        // Selezioniamo tutti i blocchi (card) che contengono un gruppo di prodotti
        const cards = document.querySelectorAll('.card.mb-3');
        
        cards.forEach(card => {
          const groupTitle = card.querySelector('.card-header')?.innerText.trim() || "Generico";
          const rows = card.querySelectorAll('table tbody tr');
          
          rows.forEach(row => {
            const cols = row.querySelectorAll('td');
            if (cols.length >= 8) {
              const variantName = cols[1]?.innerText.trim(); // Colonna Title
              const availableQty = cols[7]?.innerText.trim(); // Colonna Available
              
              results.push({
                group: groupTitle,
                variant: variantName,
                qty: availableQty
              });
            }
          });
        });
        return results;
      });
      allProducts = allProducts.concat(pageData);
    }

    await browser.close();
    console.log(`Totale varianti trovate: ${allProducts.length}`);
    res.status(200).json({ data: allProducts });

  } catch (err) {
    console.error("Errore:", err.message);
    if (browser) await browser.close();
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server attivo su porta ${PORT}`));
