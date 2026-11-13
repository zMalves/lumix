const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function run() {
  console.log('[Playwright] Tentando conectar ao seu Chrome via porta 9222...');
  
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('[Playwright] Conectado com sucesso ao seu Google Chrome!');
  } catch (err) {
    console.error('[Playwright] Não foi possível conectar na porta 9222.');
    console.error('Certifique-se de fechar todas as instâncias do Chrome antes de rodar o comando com --remote-debugging-port=9222.');
    process.exit(1);
  }

  const contexts = browser.contexts();
  const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
  
  // Procura se já tem uma aba com o vmake aberta
  const pages = context.pages();
  let page = pages.find(p => p.url().includes('vmake.ai'));

  if (page) {
    console.log(`[Playwright] Encontrada aba já aberta: ${page.url()}`);
    await page.bringToFront();
  } else {
    console.log('[Playwright] Abrindo nova aba para https://vmake.ai/pt/workspace...');
    page = await context.newPage();
    await page.goto('https://vmake.ai/pt/workspace', { waitUntil: 'domcontentloaded' });
  }

  console.log('[Playwright] Aguardando 5 segundos para estabilizar a página...');
  await page.waitForTimeout(5000);

  // Captura o estado atual logado
  const title = await page.title();
  const currentUrl = page.url();
  console.log(`[Playwright] Título: ${title}`);
  console.log(`[Playwright] URL: ${currentUrl}`);

  const screenshotPath = path.join(__dirname, 'vmake_logged_workspace.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[Playwright] Screenshot da sua conta salva em: ${screenshotPath}`);

  // Extrai informações do usuário logado (créditos, plano, nome)
  const accountInfo = await page.evaluate(() => {
    const text = document.body ? document.body.innerText : '';
    const items = [];
    document.querySelectorAll('*').forEach(el => {
      const t = el.innerText ? el.innerText.trim() : '';
      if (t && (t.toLowerCase().includes('crédito') || t.toLowerCase().includes('credit') || t.toLowerCase().includes('pro') || t.toLowerCase().includes('free') || t.toLowerCase().includes('plano')) && t.length < 40) {
        if (!items.includes(t)) items.push(t);
      }
    });
    return {
      textLength: text.length,
      signals: items.slice(0, 10)
    };
  });

  console.log('[Playwright] Dados da conta detectados:', accountInfo.signals);
  console.log('[Playwright] O navegador NÃO será fechado, você continua usando seu Chrome normalmente!');
}

run().catch(console.error);
