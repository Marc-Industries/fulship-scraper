import { chromium } from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';
import { google } from 'googleapis';

export default async function handler(req, res) {
  let browser = null;
  
  try {
    // FIX: Se l'import nominativo è undefined, proviamo a recuperarlo diversamente
    // o forziamo la logica di esecuzione.
    const executablePath = await chromium.executablePath();

    browser = await playwrightChromium.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: executablePath,
      headless: chromium.headless,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    // --- LOGICA DI SCRAPING (Invariata) ---
    await page.goto(process.env.FULSHIP_LOGIN_URL, { waitUntil: 'networkidle' });
    await page.fill('#username', process.env.FULSHIP_USER);
    await page.fill('#password', process.env.FULSHIP_PASS);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    await page.goto(process.env.FULSHIP_PRODUCTS_URL, { waitUntil: 'networkidle' });

    const data = await page.$$eval('table#products tbody tr', rows => {
      return rows.map(r => {
        const cols = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim());
        return {
          sku: cols[0],
          name: cols[1],
          qty: cols[2],
          location: cols[3],
        };
      });
    });

    // --- GOOGLE SHEETS (Invariata) ---
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const rows = data.map(d => [d.sku, d.name, d.qty, d.location, new Date().toISOString()]);

    if (rows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'Sheet1!A:E',
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });
    }

    res.status(200).json({ success: true, rows: data.length });
  } catch (err) {
    console.error("Scrape Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
}
