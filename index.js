import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/api/scrape', async (req, res) => {
  let browser = null;
  try {
    console.log("Avvio sessione...");
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

    // 1. Caricamento pagina di Login
    await page.goto(process.env.FULSHIP_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // 2. Identificazione dinamica dei campi (Ragionamento basato sulla struttura visiva)
    // Dato che gli ID mancano, cerchiamo il primo e il secondo input di tipo testo/password
    console.log("Ricerca campi di input basata sulla struttura...");
    await page.waitForSelector('input', { visible: true, timeout: 15000 });

    // Selezioniamo tutti gli input presenti nel form
    const inputs = await page.$$('input');
    
    if (inputs.length < 2) {
      throw new Error("Impossibile trovare i campi di input nella pagina.");
    }

    // Inserimento credenziali (solitamente il primo è l'utente, il secondo la password)
    await inputs[0].type(process.env.FULSHIP_USER, { delay: 100 });
    await inputs[1].type(process.env.FULSHIP_PASS, { delay: 100 });

    // Cerchiamo il pulsante di login per testo, dato che l'ID potrebbe mancare
    const [button] = await page.$x("//button[contains(., 'Log In')]");
    
    if (button) {
      await Promise.all([
        button.click(),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
      ]);
    } else {
      // Fallback: premiamo invio sull'ultimo campo
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
    }

    console.log("Login riuscito. Estrazione dati in corso...");

    // 3. Navigazione e Scraping tabella
    await page.goto(process.env.FULSHIP_PRODUCTS_URL, { waitUntil: 'networkidle2' });
    
    // Aspettiamo che appaia la tabella (se l'ID tabella è corretto)
    await page.waitForSelector('table', { timeout: 15000 });

    const data = await page.$$eval('table tbody tr', (rows) => {
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
    res.status(200).json(data);

  } catch (err) {
    console.error("Errore critico:", err.message);
    if (browser) await browser.close();
    res.status(500).json({ error: "Scraping failed", message: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server pronto su porta ${PORT}`));
