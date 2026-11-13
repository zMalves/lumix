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
  await page.waitForTimeout(3000);

  const btns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, div[role="button"]')).map(b => ({
      text: b.innerText.trim(),
      aria: b.getAttribute('aria-label') || '',
      visible: b.offsetParent !== null
    })).filter(b => b.text.length > 0 && b.text.length < 50);
  });

  console.log('Botões na página inicial:', btns);
  await browser.close();
})();
