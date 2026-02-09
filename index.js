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
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1200 });

    // 1. Login
    console.log("Accesso alla pagina di login...");
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

      // Attesa che HTMX carichi i dati nelle tabelle
      await page.waitForFunction(() => {
        return document.querySelectorAll('table tbody tr').length > 0;
      }, { timeout: 15000 }).catch(() => console.log(`Timeout: Nessuna tabella a pag ${p}`));

      const pageData = await page.evaluate(() => {
        const results = [];
        // Selezioniamo direttamente le righe di tutte le tabelle presenti nella pagina
        const rows = document.querySelectorAll('table tbody tr');
        
        rows.forEach(row => {
          const cols = row.querySelectorAll('td');
          // Verifichiamo che la riga abbia almeno 9 colonne (Available è la nona)
          if (cols.length >= 9) {
            const variantText = cols[1]?.innerText.trim(); // Colonna 'Title'
            const availableValue = cols[8]?.innerText.trim(); // Colonna 'Available' (Indice 8)

            // Filtriamo solo le righe che contengono un ID valido
            if (variantText && variantText.includes("(ID =")) {
              results.push({
                group: "", // Opzionale, rimosso per semplificare il match su Google Sheets
                variant: variantText,
                qty: availableValue // Manteniamo 'qty' per compatibilità con lo script GS e Make
              });
            }
          }
        });
        return results;
      });

      console.log(`Pagina ${p}: Estratti ${pageData.length} varianti.`);
      allProducts = allProducts.concat(pageData);
    }

    await browser.close();
    console.log(`Scraping completato. Totale prodotti: ${allProducts.length}`);
    res.status(200).json({ data: allProducts });

  } catch (err) {
    console.error("Errore critico:", err.message);
    if (browser) await browser.close();
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server attivo su porta ${PORT}`));
