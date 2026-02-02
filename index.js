import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/api/scrape', async (req, res) => {
  let browser = null;
  try {
    console.log("Avvio sessione di scraping...");
    
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    // Impostiamo un User Agent reale per evitare blocchi
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

    // 1. Navigazione al Login
    await page.goto(process.env.FULSHIP_LOGIN_URL, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });

    // 2. Attesa e inserimento credenziali
    // Usiamo waitForSelector per evitare l'errore "No element found"
    console.log("In attesa dei campi di login...");
    await page.waitForSelector('#username', { visible: true, timeout: 15000 });
    await page.waitForSelector('#password', { visible: true, timeout: 15000 });

    await page.type('#username', process.env.FULSHIP_USER, { delay: 50 });
    await page.type('#password', process.env.FULSHIP_PASS, { delay: 50 });

    // 3. Click sul Login e attesa navigazione
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    console.log("Login effettuato, navigazione verso i prodotti...");

    // 4. Navigazione alla tabella prodotti
    await page.goto(process.env.FULSHIP_PRODUCTS_URL, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });

    // Aspettiamo che la tabella sia effettivamente caricata
    await page.waitForSelector('table#products', { timeout: 15000 });

    // 5. Estrazione dati (Reasoning: analitico e strutturato per la tabella)
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
    console.log(`Scraping concluso con successo. Trovati ${data.length} prodotti.`);
    
    // Invio dei dati a Make
    res.status(200).json(data);

  } catch (err) {
    console.error("ERRORE DURANTE LO SCRAPING:", err.message);
    if (browser) await browser.close();
    
    res.status(500).json({ 
      error: "Errore durante l'esecuzione", 
      message: err.message 
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server Fulship Scraper attivo sulla porta ${PORT}`);
});
