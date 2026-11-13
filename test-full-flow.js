const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const authPath = path.join(__dirname, 'vmake_auth.json');
const videoPath = path.join(__dirname, 'videos', 'They_threw_a_bomb_at_the_swarm', 'original.mp4');
const outputPath = path.join(__dirname, 'videos', 'They_threw_a_bomb_at_the_swarm', 'sem_marca.mp4');

const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
const storageOrigins = authData.origins && authData.origins.length > 0 ? authData.origins[0].localStorage : [];
const storageMap = {};
storageOrigins.forEach(item => {
  storageMap[item.name] = item.value;
});

async function run() {
  console.log('[Playwright] Iniciando automação para "They threw a bomb at the swarm"...');
  
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
  await page.waitForTimeout(3000);

  // Fecha banner de cookies
  try {
    const cookieBtn = page.locator('button:has-text("Aceitar"), button:has-text("Accept")').first();
    if (await cookieBtn.isVisible().catch(() => false)) await cookieBtn.click();
  } catch (e) {}

  console.log('[Playwright] Fazendo upload do vídeo original.mp4...');
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15000 }),
    page.locator('button:has-text("Enviar"), div[role="button"]:has-text("Enviar")').first().click()
  ]);
  await fileChooser.setFiles(videoPath);

  console.log('[Playwright] Aguardando o vídeo carregar no editor...');
  await page.waitForSelector('li:has-text("Inteligente Pro")', { timeout: 60000 });
  await page.waitForTimeout(3000);

  // Fecha eventuais popups de feedback sobrepostos
  try {
    const closeDialog = page.locator('div[role="dialog"] button, svg[class*="close"]').first();
    if (await closeDialog.isVisible().catch(() => false)) await closeDialog.click();
  } catch (e) {}

  console.log('[Playwright] Selecionando o card "Inteligente Pro" no novo vídeo do topo...');
  // Clica exatamente na tag LI do Inteligente Pro
  const proCard = page.locator('li:has-text("Inteligente Pro")').first();
  await proCard.click({ force: true });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'step_pro_selected.png') });

  console.log('[Playwright] Procurando e clicando no botão "Aplicar" do novo vídeo...');
  // Localiza o botão Aplicar no painel direito
  const applyBtn = page.locator('*').filter({ hasText: /^Aplicar/ }).filter({ has: page.locator('text=Você já está') }).first();
  if (await applyBtn.isVisible().catch(() => false)) {
    console.log('[Playwright] Botão Aplicar (com subtexto Pro) encontrado!');
    await applyBtn.click({ force: true });
  } else {
    console.log('[Playwright] Clicando no primeiro botão contendo "Aplicar"...');
    await page.locator('button:has-text("Aplicar"), div[role="button"]:has-text("Aplicar"), [class*="btn"]:has-text("Aplicar")').first().click({ force: true });
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'step_applied.png') });

  console.log('[Playwright] Processamento disparado! Aguardando a conclusão pela IA...');
  const start = Date.now();
  let finished = false;

  while (Date.now() - start < 600000) { // até 10 minutos
    const elapsed = Math.round((Date.now() - start) / 1000);

    // Verifica se na primeira área de ação o botão virou Baixar
    const check = await page.evaluate(() => {
      const allText = document.body ? document.body.innerText : '';
      const hasApplyingText = allText.includes('Clique em Aplicar para começar');
      const percentMatch = allText.match(/\b\d{1,3}%\b/);

      // Pega os botões visíveis no quadrante de ação do topo
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
      console.log(`\n[Playwright] IA finalizou com sucesso em ${elapsed}s! Botão Baixar liberado!`);
      finished = true;
      break;
    }

    const msg = check.progress ? `Progresso: ${check.progress}` : 'Processando na nuvem...';
    process.stdout.write(`\r[Playwright] ${msg} (${elapsed}s decorridos)`);

    await page.waitForTimeout(4000);
  }

  if (!finished) {
    console.error('\n[Playwright] Timeout.');
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'error_timeout.png') });
    await browser.close();
    process.exit(1);
  }

  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'step_ready_download.png') });

  console.log('\n[Playwright] Clicando em "Baixar" no vídeo processado do topo...');
  const downloadBtn = page.locator('button:has-text("Baixar")').first();
  await downloadBtn.scrollIntoViewIfNeeded();

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    downloadBtn.click({ force: true })
  ]);

  await download.saveAs(outputPath);

  console.log('\n=============================================================');
  console.log(`[Playwright] SUCESSO TOTAL! Vídeo limpo salvo em:`);
  console.log(`>> ${outputPath}`);
  console.log('=============================================================\n');

  await page.waitForTimeout(2000);
  await browser.close();
}

run().catch(console.error);
