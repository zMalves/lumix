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
  console.log('[Playwright] Verificando status do vídeo "They threw a bomb at the swarm" no VMake...');

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

  console.log('[Playwright] Acessando editor do VMake...');
  await page.goto('https://vmake.ai/pt/video-watermark-remover/editor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Fecha eventuais diálogos
  try {
    const closeBtns = await page.$$('button:has-text("Aceitar"), div[role="dialog"] button, svg[class*="close"]');
    for (const b of closeBtns) {
      if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
    }
  } catch (e) {}

  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'current_editor_state.png') });

  // Lista todos os botões visíveis na página
  const buttonsInfo = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.innerText.trim(),
      classes: b.className,
      rect: b.getBoundingClientRect()
    })).filter(b => b.text.length > 0 && b.rect.width > 0);
  });
  console.log('[Playwright] Botões visíveis:', buttonsInfo.map(b => b.text));

  // Verifica se há botão "Baixar"
  const downloadBtn = page.locator('button:has-text("Baixar")').first();
  const hasDownload = await downloadBtn.isVisible().catch(() => false);

  if (hasDownload) {
    console.log('[Playwright] Botão "Baixar" encontrado! Iniciando download...');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      downloadBtn.click({ force: true })
    ]);

    await download.saveAs(outputPath);
    console.log(`[Playwright] Vídeo salvo com sucesso em: ${outputPath}`);
    const stats = fs.statSync(outputPath);
    console.log(`[Playwright] Tamanho do arquivo: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log('[Playwright] Botão Baixar ainda não visível. Verificando se ainda está processando...');
    const pageText = await page.evaluate(() => document.body.innerText);
    const percentMatch = pageText.match(/\b\d{1,3}%\b/);
    console.log('[Playwright] Texto de status:', percentMatch ? percentMatch[0] : 'Não detectado');

    // Aguarda até 5 minutos se estiver processando
    const startTime = Date.now();
    while (Date.now() - startTime < 5 * 60 * 1000) {
      if (await page.locator('button:has-text("Baixar")').first().isVisible().catch(() => false)) {
        console.log('\n[Playwright] Concluído! Baixando...');
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 60000 }),
          page.locator('button:has-text("Baixar")').first().click({ force: true })
        ]);
        await download.saveAs(outputPath);
        console.log(`[Playwright] Vídeo salvo em: ${outputPath}`);
        break;
      }
      await page.waitForTimeout(5000);
      process.stdout.write('.');
    }
  }

  await browser.close();
}

main().catch(err => {
  console.error('[Playwright] Erro:', err);
  process.exit(1);
});
