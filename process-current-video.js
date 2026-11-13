const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const authPath = path.join(__dirname, 'vmake_auth.json');
const outputPath = path.join(__dirname, 'videos', 'They_threw_a_bomb_at_the_swarm', 'sem_marca.mp4');

const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
const storageOrigins = authData.origins && authData.origins.length > 0 ? authData.origins[0].localStorage : [];
const storageMap = {};
storageOrigins.forEach(item => {
  storageMap[item.name] = item.value;
});

async function main() {
  console.log('[Playwright] Conectando ao VMake para processar o vídeo "They threw a bomb at the swarm"...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--start-maximized', '--no-sandbox']
  });

  const context = await browser.newContext({
    storageState: authPath,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true
  });

  const page = await context.newPage();

  await page.addInitScript((storage) => {
    try {
      for (const [k, v] of Object.entries(storage)) {
        localStorage.setItem(k, v);
      }
    } catch (e) {}
  }, storageMap);

  console.log('[Playwright] Acessando editor...');
  await page.goto('https://vmake.ai/pt/video-watermark-remover/editor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Fecha banner de cookies ou feedback
  try {
    const closeBtns = await page.$$('button:has-text("Aceitar"), div[role="dialog"] button, svg[class*="close"]');
    for (const b of closeBtns) {
      if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
    }
  } catch (e) {}

  console.log('[Playwright] Selecionando "Inteligente Pro" no vídeo do topo...');
  // O vídeo mais recente fica no TOPO (.first())
  const proCard = page.locator('div:has-text("Inteligente Pro"), button:has-text("Inteligente Pro")').first();
  await proCard.click({ force: true });
  await page.waitForTimeout(2000);

  console.log('[Playwright] Clicando em "Aplicar" no vídeo do topo...');
  const applyBtn = page.locator('button:has-text("Aplicar")').first();
  await applyBtn.click({ force: true });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'processing_they_threw_bomb.png') });
  console.log('[Playwright] Processamento iniciado! Aguardando conclusão da IA...');

  const startTime = Date.now();
  const maxWait = 10 * 60 * 1000; // 10 minutos
  let isDone = false;

  while (Date.now() - startTime < maxWait) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Avalia se o primeiro botão virou "Baixar" e se o "Aplicar" do topo sumiu
    const state = await page.evaluate(() => {
      const allText = document.body ? document.body.innerText : '';
      const topBtn = document.querySelector('button');
      const hasApplying = allText.includes('Clique em Aplicar para começar');
      const percentMatch = allText.match(/\b\d{1,3}%\b/);
      const isProcessing = allText.includes('Processando') || allText.includes('Generating') || !!percentMatch;

      // Verifica o botão do primeiro container de ações
      const actionButtons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());
      const firstDownloadBtn = actionButtons.find(b => b.includes('Baixar') || b.includes('Download'));

      return {
        hasApplying,
        isProcessing,
        progress: percentMatch ? percentMatch[0] : null,
        firstDownloadBtn: !!firstDownloadBtn
      };
    });

    // Se o texto "Clique em Aplicar para começar" sumiu e a IA não está mais processando
    // ou se o botão do topo virou "Baixar"
    const topButtonText = await page.locator('div[class*="panel"], div[class*="sidebar"], body').first().evaluate(() => {
      // Procura o botão na área de ação do topo
      const btns = Array.from(document.querySelectorAll('button')).filter(b => {
        const rect = b.getBoundingClientRect();
        return rect.top > 400 && rect.top < 650 && rect.left > 1000;
      });
      return btns.map(b => b.innerText.trim());
    });

    if (topButtonText.some(t => t.includes('Baixar'))) {
      console.log(`\n[Playwright] Processamento concluído em ${elapsed}s! Botão Baixar ativo no vídeo!`);
      isDone = true;
      break;
    }

    const currentMsg = state.progress ? `Progresso: ${state.progress}` : (state.isProcessing ? 'Processando na nuvem...' : 'Processando IA...');
    process.stdout.write(`\r[Playwright] ${currentMsg} (${elapsed}s decorridos)`);

    await page.waitForTimeout(4000);
  }

  if (!isDone) {
    console.error('\n[Playwright] Tempo limite excedido.');
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'timeout_they_threw_bomb.png') });
    await browser.close();
    process.exit(1);
  }

  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'ready_to_download_they_threw_bomb.png') });

  console.log('\n[Playwright] Clicando no botão "Baixar" do vídeo processado...');
  // O botão Baixar correspondente ao vídeo do topo
  const downloadBtn = page.locator('button:has-text("Baixar")').first();
  await downloadBtn.scrollIntoViewIfNeeded();

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    downloadBtn.click({ force: true })
  ]);

  await download.saveAs(outputPath);

  console.log('\n=============================================================');
  console.log(`[Playwright] SUCESSO TOTAL! Vídeo limpo baixado:`);
  console.log(`>> ${outputPath}`);
  console.log('=============================================================\n');

  await page.waitForTimeout(2000);
  await browser.close();
}

main().catch(err => {
  console.error('[Playwright] Erro:', err);
  process.exit(1);
});
