const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const authPath = path.join(__dirname, 'vmake_auth.json');
const videoPath = path.join(__dirname, 'videos', 'They_threw_a_bomb_at_the_swarm', 'original.mp4');
const outputPath = path.join(__dirname, 'videos', 'They_threw_a_bomb_at_the_swarm', 'sem_marca.mp4');
const screenshotsDir = path.join(__dirname, 'screenshots');

const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
const storageOrigins = authData.origins && authData.origins.length > 0 ? authData.origins[0].localStorage : [];
const storageMap = {};
storageOrigins.forEach(item => {
  storageMap[item.name] = item.value;
});

async function main() {
  console.log(`\n=============================================================`);
  console.log(`[Playwright] REMOÇÃO DE MARCA D'ÁGUA COM INTELIGENTE PRO`);
  console.log(`[Playwright] Vídeo: They threw a bomb at the swarm`);
  console.log(`[Playwright] Destino: ${outputPath}`);
  console.log(`=============================================================\n`);

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

  // Injeta a sessão Pro no localStorage
  await page.addInitScript((storage) => {
    try {
      for (const [k, v] of Object.entries(storage)) {
        localStorage.setItem(k, v);
      }
    } catch (e) {}
  }, storageMap);

  console.log('[Playwright] Passo 1: Acessando o editor do VMake...');
  await page.goto('https://vmake.ai/pt/video-watermark-remover/editor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Fecha banner de cookies
  try {
    const acceptCookie = page.locator('button:has-text("Aceitar"), button:has-text("Accept")').first();
    if (await acceptCookie.isVisible().catch(() => false)) {
      await acceptCookie.click();
      await page.waitForTimeout(1000);
    }
  } catch (e) {}

  console.log('[Playwright] Passo 2: Enviando o vídeo original.mp4...');
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15000 }),
    page.locator('button:has-text("Enviar"), div[role="button"]:has-text("Enviar")').first().click()
  ]);
  await fileChooser.setFiles(videoPath);

  console.log('[Playwright] Passo 3: Aguardando o upload e decodificação do vídeo (até "Clique em Aplicar para começar")...');
  // Aguarda até o texto de carregamento sumir e a mensagem de início aparecer
  await page.waitForSelector('text=Clique em Aplicar para começar', { timeout: 90000 });
  await page.waitForTimeout(2000);
  console.log('[Playwright] Vídeo 100% carregado e pronto para configuração!');

  // Fecha eventuais modais de feedback sobrepostos se existirem
  try {
    const feedbackClose = page.locator('div[role="dialog"] button, svg[class*="close"]').first();
    if (await feedbackClose.isVisible().catch(() => false)) {
      await feedbackClose.click().catch(() => {});
    }
  } catch (e) {}

  console.log('[Playwright] Passo 4: Ativando a opção "Inteligente Pro"...');
  const proCard = page.locator('li:has-text("Inteligente Pro")').first();
  await proCard.click({ force: true });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(screenshotsDir, 'they_threw_bomb_pro_active.png') });
  console.log('[Playwright] "Inteligente Pro" confirmado!');

  console.log('[Playwright] Passo 5: Clicando em "Aplicar"...');
  const applyBtn = page.locator('button:has-text("Aplicar")').first();
  await applyBtn.click({ force: true });

  console.log('[Playwright] Botão Aplicar acionado! Aguardando o início do processamento...');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(screenshotsDir, 'they_threw_bomb_applied.png') });

  console.log('[Playwright] Passo 6: Aguardando a IA processar o vídeo...');
  const startTime = Date.now();
  const maxWait = 10 * 60 * 1000; // 10 minutos
  let isDone = false;

  while (Date.now() - startTime < maxWait) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    const check = await page.evaluate(() => {
      const allText = document.body ? document.body.innerText : '';
      const hasApplyingText = allText.includes('Clique em Aplicar para começar');
      const percentMatch = allText.match(/\b\d{1,3}%\b/);

      // Botões no quadrante superior direito (área de ação do vídeo do topo)
      const btns = Array.from(document.querySelectorAll('button')).filter(b => {
        const r = b.getBoundingClientRect();
        return r.left > 800 && r.top < 650;
      }).map(b => b.innerText.trim());

      const topHasBaixar = btns.some(t => t.includes('Baixar'));

      return {
        hasApplyingText,
        topHasBaixar,
        progress: percentMatch ? percentMatch[0] : null
      };
    });

    if (check.topHasBaixar && !check.hasApplyingText && elapsed > 5) {
      console.log(`\n[Playwright] IA finalizou com sucesso após ${elapsed}s! Botão Baixar liberado!`);
      isDone = true;
      break;
    }

    const currentMsg = check.progress ? `Progresso: ${check.progress}` : 'Processando na nuvem...';
    process.stdout.write(`\r[Playwright] ${currentMsg} (${elapsed}s decorridos)`);

    await page.waitForTimeout(4000);
  }

  if (!isDone) {
    console.error('\n[Playwright] Tempo limite excedido.');
    await page.screenshot({ path: path.join(screenshotsDir, 'timeout.png') });
    await browser.close();
    process.exit(1);
  }

  await page.screenshot({ path: path.join(screenshotsDir, 'video_ready_download.png') });

  console.log('\n[Playwright] Passo 7: Baixando o vídeo limpo sem marca d\'água...');
  const downloadBtn = page.locator('button:has-text("Baixar")').first();
  await downloadBtn.scrollIntoViewIfNeeded();

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    downloadBtn.click({ force: true })
  ]);

  await download.saveAs(outputPath);

  console.log(`\n=============================================================`);
  console.log(`[Playwright] SUCESSO TOTAL!`);
  console.log(`Vídeo limpo salvo diretamente em:`);
  console.log(`>> ${outputPath}`);
  console.log(`=============================================================\n`);

  await page.waitForTimeout(2000);
  await browser.close();
}

main().catch(err => {
  console.error('[Playwright] Erro:', err);
  process.exit(1);
});
