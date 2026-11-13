const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const authPath = path.join(__dirname, 'vmake_auth.json');
const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
const storageOrigins = authData.origins && authData.origins.length > 0 ? authData.origins[0].localStorage : [];
const storageMap = {};
storageOrigins.forEach(item => {
  storageMap[item.name] = item.value;
});

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: authPath,
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  await page.addInitScript((storage) => {
    try {
      for (const [k, v] of Object.entries(storage)) {
        localStorage.setItem(k, v);
      }
    } catch (e) {}
  }, storageMap);

  await page.goto('https://vmake.ai/pt/video-watermark-remover/editor', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Procura QUALQUER elemento que contenha a palavra "Aplicar"
  const applyElements = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*')).filter(el => {
      const t = el.innerText || '';
      return t.includes('Aplicar') && t.length < 50;
    }).map(el => ({
      tag: el.tagName,
      text: el.innerText.trim().replace(/\n/g, ' '),
      className: el.className,
      role: el.getAttribute('role'),
      rect: el.getBoundingClientRect()
    }));
  });

  console.log('Todos os elementos com texto Aplicar:', applyElements);

  await browser.close();
})();
