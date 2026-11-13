const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function main() {
  console.log('[Playwright] Abrindo navegador visível para login...');
  
  // Inicia Chromium em modo visível
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: null
  });

  const page = await context.newPage();

  console.log('[Playwright] Acessando https://vmake.ai/pt/workspace...');
  await page.goto('https://vmake.ai/pt/workspace', { waitUntil: 'domcontentloaded' });

  console.log('\n=============================================================');
  console.log('NAVEGADOR ABERTO NA SUA TELA!');
  console.log('Faça o seu login (Google, e-mail, etc.).');
  console.log('O script está monitorando a tela e os cookies.');
  console.log('Assim que você fizer login, salvaremos o vmake_auth.json.');
  console.log('=============================================================\n');

  const authPath = path.join(__dirname, 'vmake_auth.json');
  let loggedIn = false;
  const timeoutMs = 300000; // 5 minutos para o usuário logar com calma
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (page.isClosed()) {
      console.log('[Playwright] O navegador foi fechado.');
      break;
    }

    // Avalia o estado do login na página
    const state = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const hasLoginBtn = buttons.some(b => {
        const t = (b.innerText || '').trim().toLowerCase();
        return t === 'entrar' || t === 'sign in' || t === 'log in';
      });
      const hasAvatar = !!document.querySelector('img[class*="avatar"], div[class*="avatar"], [class*="user-icon"], [class*="profile"]');
      const hasUserKeywords = text.includes('Sair') || text.includes('Log out') || text.includes('Meu plano') || text.includes('Créditos:');
      
      return {
        hasLoginBtn,
        hasAvatar,
        hasUserKeywords,
        url: window.location.href
      };
    }).catch(() => null);

    // Se o botão de "Entrar" sumiu ou apareceu avatar/sair/créditos
    if (state && (!state.hasLoginBtn || state.hasAvatar || state.hasUserKeywords)) {
      // Verifica se há cookies gravados
      const cookies = await context.cookies();
      if (cookies.length > 5) {
        console.log('[Playwright] Login detectado!');
        console.log(`[Playwright] URL atual: ${state.url}`);
        console.log(`[Playwright] Total de cookies capturados: ${cookies.length}`);
        
        // Aguarda 3 segundos para garantir que todos os tokens foram persistidos
        await page.waitForTimeout(3000);
        
        await context.storageState({ path: authPath });
        console.log(`\n=============================================================`);
        console.log(`SUCESSO! Sessão e cookies salvos em:`);
        console.log(`>> ${authPath}`);
        console.log(`=============================================================\n`);
        
        // Tira um screenshot confirmando a tela logada
        await page.screenshot({ path: path.join(__dirname, 'vmake_logged_success.png'), fullPage: false });
        
        loggedIn = true;
        break;
      }
    }

    await page.waitForTimeout(2000);
  }

  if (loggedIn) {
    console.log('[Playwright] Concluído! Fechando o navegador de configuração...');
    await page.waitForTimeout(3000);
    await browser.close();
  } else {
    console.log('[Playwright] Tempo limite esgotado ou janela fechada antes do login.');
    await browser.close().catch(() => {});
  }
}

main().catch(err => {
  console.error('[Playwright] Erro:', err);
  process.exit(1);
});
