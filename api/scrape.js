// api/scrape.js
import chromium from '@sparticuz/chromium';
import playwright from 'playwright-core';
import { google } from 'googleapis';

export default async function handler(req, res) {
  try {
    const executablePath = await chromium.executablePath();
    const browser = await playwrightChromium.launch({
      executablePath,
      args: chromium.args,
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // --- LOGIN Fulship ---
    await page.goto(process.env.FULSHIP_LOGIN_URL, { waitUntil: 'networkidle' });
    await page.fill('#username', process.env.FULSHIP_USER);
    await page.fill('#password', process.env.FULSHIP_PASS);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // --- NAVIGA alla pagina prodotti ---
    await page.goto(process.env.FULSHIP_PRODUCTS_URL, { waitUntil: 'networkidle' });

    // --- ESTRARRE DATI ---
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

    await browser.close();

    // --- COLLEGA Google Sheets ---
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const rows = data.map(d => [d.sku, d.name, d.qty, d.location, new Date().toISOString()]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Sheet1!A:E',
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });

    res.status(200).json({ success: true, rows: data.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.toString() });
  }
}

