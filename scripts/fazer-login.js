const { chromium } = require('@playwright/test');
const path = require('path');

async function login() {
  console.log('[Playwright] Abrindo Google Chrome real (sem bloqueios do Google)...');

  // Abre o Google Chrome instalado e remove bandeiras de automação que o Google bloqueia
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-sandbox'
    ]
  });

  const context = await browser.newContext({
    viewport: null,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  // Oculta a propriedade navigator.webdriver para contornar a detecção de bot do Google
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  console.log('[Playwright] Acessando https://vmake.ai/pt/workspace...');
  await page.goto('https://vmake.ai/pt/workspace');

  console.log('\n=============================================================');
  console.log('>> GOOGLE CHROME ABERTO!');
  console.log('>> Faça o login com sua conta Google ou e-mail normalmente.');
  console.log('>> O Google NÃO vai mais bloquear dizendo "navegador inseguro".');
  console.log('>> Quando estiver dentro da conta, basta FECHAR a janela do Chrome.');
  console.log('=============================================================\n');

  // Salva periodicamente os cookies enquanto você estiver logando
  const authPath = path.join(__dirname, 'vmake_auth.json');
  
  // Monitora o fechamento da página
  await new Promise((resolve) => {
    page.on('close', async () => {
      try {
        await context.storageState({ path: authPath });
        console.log(`\n[Playwright] SUCESSO! Cookies e sessão salvos em:\n>> ${authPath}\n`);
      } catch (e) {}
      resolve();
    });

    browser.on('disconnected', resolve);
  });

  await browser.close().catch(() => {});
}

login().catch(err => {
  console.error('[Playwright] Erro:', err);
});
