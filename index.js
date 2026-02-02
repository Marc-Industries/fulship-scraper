import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/api/scrape', async (req, res) => {
  let browser = null;
  try {
    console.log("Inizio sessione di scraping con selettori verificati...");
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

    // 1. Caricamento pagina di Login
    await page.goto(process.env.FULSHIP_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // 2. Inserimento credenziali con ID corretti (da DevTools)
    console.log("Inserimento credenziali...");
    await page.waitForSelector('#id_username', { visible: true, timeout: 15000 });
    
    // Pulizia e digitazione lenta per simulare un umano
    await page.click('#id_username', { clickCount: 3 });
    await page.type('#id_username', process.env.FULSHIP_USER, { delay: 100 });
    
    await page.type('#id_password', process.env.FULSHIP_PASS, { delay: 100 });

    // 3. Click sul pulsante Log In (usiamo la classe del pulsante visibile nei log)
    console.log("Invio form...");
    await Promise.all([
      page.keyboard.press('Enter'), // Più affidabile del click se il pulsante non ha ID
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // Verifichiamo se siamo entrati (se l'URL non è più quello di login)
    if (page.url().includes('login')) {
        throw new Error("Login fallito: credenziali errate o blocco CSRF.");
    }

    // 4. Navigazione alla tabella prodotti
    console.log("Navigazione alla tabella prodotti...");
    await page.goto(process.env.FULSHIP_PRODUCTS_URL, { waitUntil: 'networkidle2' });
    
    // Aspettiamo la tabella (selettore generico 'table' se l'ID non è noto)
    await page.waitForSelector('table', { timeout: 15000 });

    const data = await page.$$eval('table tbody tr', (rows) => {
      return rows.map(r => {
        const cols = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim());
        if (cols.length < 3) return null; // Salta righe vuote o di intestazione
        return { 
          sku: cols[0] || 'N/A', 
          name: cols[1] || 'N/A', 
          qty: cols[2] || '0', 
          location: cols[3] || 'N/A' 
        };
      }).filter(item => item !== null);
    });

    await browser.close();
    console.log(`Operazione completata. Righe estratte: ${data.length}`);
    res.status(200).json(data);

  } catch (err) {
    console.error("ERRORE:", err.message);
    if (browser) await browser.close();
    res.status(500).json({ error: "Scraping failed", message: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server pronto su porta ${PORT}`));
