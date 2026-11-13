const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function run() {
  const userDataDir = path.join(__dirname, '.vmake_profile');
  console.log(`[Playwright] Iniciando o Chrome com perfil salvo em: ${userDataDir}`);

  // Tenta abrir o Google Chrome nativo com perfil persistente
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1366, height: 768 },
    args: ['--start-maximized']
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log('[Playwright] Acessando https://vmake.ai/pt/workspace...');
  await page.goto('https://vmake.ai/pt/workspace', { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('\n======================================================');
  console.log('NAVEGADOR ABERTO NA SUA TELA!');
  console.log('Se você ainda não estiver logado, por favor faça o login');
  console.log('na janela do Chrome aberta. O script irá detectar');
  console.log('automaticamente quando o painel estiver pronto.');
  console.log('======================================================\n');

  // Aguarda até que o usuário esteja logado e o conteúdo do workspace carregue (até 120 segundos)
  const startTime = Date.now();
  let workspaceLoaded = false;

  while (Date.now() - startTime < 120000) {
    const currentUrl = page.url();
    // Verifica se há elementos típicos do workspace carregados
    const hasWorkspaceElements = await page.evaluate(() => {
      // Procura por itens do dashboard, sidebar ou cards de ferramentas
      const cards = document.querySelectorAll('a, button, div[class*="card"], div[class*="tool"], div[class*="item"]');
      const text = document.body ? document.body.innerText : '';
      const hasTools = text.includes('Vídeo') || text.includes('Imagem') || text.includes('Remover') || text.includes('Ferramentas') || text.includes('Workspace') || text.includes('Créditos') || text.includes('Model');
      return { count: cards.length, textLength: text.length, hasTools };
    });

    if (hasWorkspaceElements.hasTools && hasWorkspaceElements.textLength > 500) {
      console.log('[Playwright] Conteúdo do Workspace detectado!');
      workspaceLoaded = true;
      break;
    }

    console.log(`[Playwright] Aguardando carregamento ou login... (${Math.round((Date.now() - startTime) / 1000)}s)`);
    await page.waitForTimeout(3000);
  }

  // Espera mais 3 segundos para animações e dados de rede finalizarem
  await page.waitForTimeout(3000);

  console.log('[Playwright] Capturando imagem do Workspace...');
  const screenshotPath = path.join(__dirname, 'vmake_workspace.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log('[Playwright] Extraindo ferramentas e funções do site...');
  const analysis = await page.evaluate(() => {
    const result = {
      title: document.title,
      url: window.location.href,
      extractedAt: new Date().toISOString(),
      userInfo: null,
      categories: [],
      tools: [],
      sidebarLinks: []
    };

    // Tentar pegar informações do usuário/créditos
    const userNodes = Array.from(document.querySelectorAll('*')).filter(el => {
      const t = el.innerText || '';
      return (t.includes('crédito') || t.includes('credit') || t.includes('pts') || t.includes('Plano')) && t.length < 50;
    });
    if (userNodes.length > 0) {
      result.userInfo = userNodes.slice(0, 5).map(n => n.innerText.trim()).filter(Boolean);
    }

    // Links de navegação e menu lateral
    const links = document.querySelectorAll('nav a, aside a, header a, [role="navigation"] a');
    links.forEach(l => {
      const text = l.innerText ? l.innerText.trim() : '';
      const href = l.href;
      if (text && href && !result.sidebarLinks.some(s => s.text === text)) {
        result.sidebarLinks.push({ text, href });
      }
    });

    // Ferramentas / Cards de IA
    const candidates = document.querySelectorAll('a, div[role="button"], button, [class*="card"], [class*="item"]');
    const seenTitles = new Set();

    candidates.forEach(el => {
      // Ignora elementos muito grandes ou com texto excessivo
      const text = el.innerText ? el.innerText.trim() : '';
      if (!text || text.length > 300) return;

      const lines = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
      if (lines.length >= 1 && lines.length <= 6) {
        const titleCandidate = lines[0];
        // Filtra títulos relevantes
        if (titleCandidate.length > 2 && titleCandidate.length < 60 && !seenTitles.has(titleCandidate)) {
          // Verifica se parece um card de ferramenta
          const isButtonOrLink = el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
          const hasHref = el.href || el.closest('a')?.href;
          
          if (isButtonOrLink || hasHref || lines.length >= 2) {
            seenTitles.add(titleCandidate);
            result.tools.push({
              name: titleCandidate,
              description: lines.slice(1).join(' - '),
              url: hasHref || null
            });
          }
        }
      }
    });

    return result;
  });

  const outputPath = path.join(__dirname, 'vmake_functions.json');
  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2), 'utf-8');

  console.log(`[Playwright] Análise concluída com sucesso!`);
  console.log(`- Screenshot salvo em: ${screenshotPath}`);
  console.log(`- Dados completos salvos em: ${outputPath}`);
  console.log(`- Total de funções/ferramentas mapeadas: ${analysis.tools.length}`);

  // Mantém aberto por mais 5 segundos antes de encerrar
  await page.waitForTimeout(5000);
  await context.close();
}

run().catch(err => {
  console.error('[Playwright] Erro durante a execução:', err);
  process.exit(1);
});
