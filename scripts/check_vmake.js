const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

(async () => {
  const authPath = path.join(__dirname, '..', 'vmake_auth.json');
  const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
  const storageMap = {};
  (authData.origins?.[0]?.localStorage || []).forEach(i => storageMap[i.name] = i.value);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: authPath, viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.addInitScript((storage) => {
    for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
  }, storageMap);

  await page.goto('https://vmake.ai/pt/video-watermark-remover/editor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  const cards = await page.$$('.task-card--Y5yrO');
  console.log('Total de cards na tela:', cards.length);

  for (let i = 0; i < cards.length; i++) {
    const text = await cards[i].innerText().catch(() => '');
    const cleanText = text.replace(/\n+/g, ' | ');
    console.log(`Card ${i}: ${cleanText.substring(0, 100)}`);
  }

  const screenshotsDir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotsDir, 'vmake_current_state.png') });
  console.log('Screenshot salva em screenshots/vmake_current_state.png');

  await browser.close();
})();
