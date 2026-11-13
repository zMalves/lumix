const { chromium } = require('@playwright/test');
const path = require('path');

async function checkAccount() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: path.join(__dirname, 'vmake_auth.json'),
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  await page.goto('https://vmake.ai/pt/workspace', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Clica no avatar visível do header
  const avatar = page.locator('header img[alt="avatar"]').last();
  await avatar.click({ force: true });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(__dirname, 'vmake_menu_opened.png') });

  // Pega texto de todos os menus suspensos
  const dropdownTexts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('div[class*="popover"], div[class*="menu"], div[class*="dropdown"], div[class*="drawer"]'))
      .map(el => el.innerText.trim())
      .filter(Boolean);
  });

  console.log('Dados do menu suspenso:', dropdownTexts);
  await browser.close();
}

checkAccount().catch(console.error);
