const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    storageState: 'vmake_auth.json',
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  await page.goto('https://vmake.ai/pt/workspace', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Clica no avatar no canto superior direito (perto de x: 1400, y: 35)
  await page.mouse.click(1405, 38);
  await page.waitForTimeout(2000);

  const popoverText = await page.evaluate(() => {
    // Pega qualquer menu flutuante ou modal aberto
    const modals = Array.from(document.querySelectorAll('div[role="dialog"], div[role="menu"], [class*="popover"], [class*="dropdown"], [class*="modal"]'));
    return modals.map(m => m.innerText.trim()).filter(Boolean);
  });

  console.log('Conteúdo do Popover do usuário:', popoverText);

  await page.screenshot({ path: 'avatar_click.png' });
  await browser.close();
})();
