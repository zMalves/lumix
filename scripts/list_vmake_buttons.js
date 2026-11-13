const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

(async () => {
  const authPath = path.join(__dirname, '..', 'vmake_auth.json');
  const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
  const storageMap = {};
  (authData.origins?.[0]?.localStorage || []).forEach(i => storageMap[i.name] = i.value);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: authPath, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((storage) => {
    for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
  }, storageMap);

  await page.goto('https://vmake.ai/pt/video-watermark-remover/editor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  const btns = await page.$$eval('button', els => els.map(b => ({ text: b.innerText.trim(), class: b.className })));
  console.log('All buttons on page:');
  btns.filter(b => b.text).forEach(b => console.log('Button:', JSON.stringify(b.text), 'Class:', b.class));

  await browser.close();
})();
