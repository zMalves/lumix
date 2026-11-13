const { chromium } = require('@playwright/test');
const path = require('path');

async function showProfile() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: path.join(__dirname, 'vmake_auth.json'),
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  await page.goto('https://vmake.ai/pt/workspace', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Clica no avatar do usuário no canto superior direito
  await page.click('img[src*="avatar"]');
  await page.waitForTimeout(1500);

  const menuScreenshot = path.join(__dirname, 'vmake_user_dropdown.png');
  await page.screenshot({ path: menuScreenshot });
  console.log('Dropdown do usuário capturado em:', menuScreenshot);

  const menuData = await page.evaluate(() => {
    const menus = Array.from(document.querySelectorAll('[role="menu"], [class*="popover"], [class*="dropdown"], [class*="user-info"], div[style*="position: absolute"]'));
    return menus.map(m => m.innerText.trim()).filter(Boolean);
  });

  console.log('Informações do Menu do Usuário:', menuData);
  await browser.close();
}

showProfile().catch(console.error);
