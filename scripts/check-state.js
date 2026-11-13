const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: path.join(__dirname, 'vmake_auth.json'),
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  await page.goto('https://vmake.ai/pt/video-watermark-remover/editor', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Fecha eventuais modais
  try {
    const closeBtns = await page.$$('button[aria-label="Close"], button:has-text("Aceitar"), svg');
    for (const b of closeBtns) {
      const txt = await b.innerText().catch(() => '');
      if (txt === 'Aceitar' || txt === 'Accept') await b.click().catch(() => {});
    }
  } catch (e) {}

  await page.screenshot({ path: path.join(__dirname, 'current_editor_state.png'), fullPage: true });

  const state = await page.evaluate(() => {
    const text = document.body ? document.body.innerText : '';
    const cards = Array.from(document.querySelectorAll('*')).filter(el => {
      const t = el.innerText || '';
      return t.includes('.mp4') && t.length < 50;
    }).map(e => e.innerText.trim());

    const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]')).map(b => ({
      text: b.innerText.trim().replace(/\n/g, ' '),
      tag: b.tagName
    })).filter(b => b.text.length > 0 && b.text.length < 50);

    return {
      cards: Array.from(new Set(cards)),
      allButtons,
      hasPro: text.includes('Inteligente Pro'),
      hasAplicar: text.includes('Aplicar'),
      hasBaixar: text.includes('Baixar')
    };
  });

  console.log('ESTADO ATUAL DO EDITOR:', JSON.stringify(state, null, 2));
  await browser.close();
})();
