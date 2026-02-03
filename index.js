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
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

    // 1. LOGIN CON LOG DI VERIFICA
    console.log("Navigazione alla pagina di login...");
    await page.goto(process.env.FULSHIP_LOGIN_URL, { waitUntil: 'networkidle2' });

    console.log("Inserimento credenziali...");
    await page.waitForSelector('#id_username', { visible: true, timeout: 10000 });
    await page.type('#id_username', process.env.FULSHIP_USER, { delay: 50 });
    await page.type('#id_password', process.env.FULSHIP_PASS, { delay: 50 });

    console.log("Invio form di login...");
    await Promise.all([
      page.click('button[type="submit"]'), // Clicca esplicitamente il tasto Log In
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    let allProducts = [];

    // 2. LOOP SULLE 5 PAGINE CON ATTESA CARICAMENTO TABELLE
    for (let p = 1; p <= 5; p++) {
      console.log(`Scraping pagina ${p}...`);
      await page.goto(`https://cloud.fullship.it/products/?page=${p}`, { waitUntil: 'networkidle0' });

      // Aspettiamo che appaia almeno una tabella di prodotti
      try {
        await page.waitForSelector('table tbody tr', { timeout: 5000 });
      } catch (e) {
        console.log(`Nessuna tabella trovata a pagina ${p}, salto...`);
        continue;
      }

      const pageData = await page.evaluate(() => {
        const results = [];
        // Selezioniamo tutti i blocchi card che contengono i titoli dei prodotti
        const cards = document.querySelectorAll('.card'); 
        
        cards.forEach(card => {
          // Il titolo del gruppo (es: Spartan Testo) è nell'header della card o sopra la tabella
          const groupTitle = card.previousElementSibling?.innerText.trim() || 
                             card.querySelector('.card-header')?.innerText.trim() || "";
          
          const rows = card.querySelectorAll('table tbody tr');
          rows.forEach(row => {
            const cols = row.querySelectorAll('td');
            if (cols.length >= 8) {
              results.push({
                group: groupTitle,
                variant: cols[1]?.innerText.trim(), // Colonna Title
                qty: cols[7]?.innerText.trim()     // Colonna Available
              });
            }
          });
        });
        return results;
      });
      console.log(`Trovati ${pageData.length} elementi a pagina ${p}`);
      allProducts = allProducts.concat(pageData);
    }

    await browser.close();
    console.log(`Totale varianti estratte: ${allProducts.length}`);
    res.status(200).json({ data: allProducts });

  } catch (err) {
    console.error("ERRORE CRITICO:", err.message);
    if (browser) await browser.close();
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server attivo su porta ${PORT}`));
