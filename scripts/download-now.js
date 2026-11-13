const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const authPath = path.join(__dirname, 'vmake_auth.json');

async function downloadVideo() {
  console.log('[Playwright] Conectando ao editor para realizar o download do vídeo processado...');

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

  console.log('[Playwright] Abrindo editor...');
  await page.goto('https://vmake.ai/pt/video-watermark-remover/editor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Fecha eventuais modais que estejam na tela
  try {
    const feedbackModalClose = page.locator('div[role="dialog"] button, [class*="feedback"] button, svg[class*="close"]').first();
    if (await feedbackModalClose.isVisible().catch(() => false)) {
      await feedbackModalClose.click();
      console.log('[Playwright] Modal fechado.');
    }
  } catch (e) {}

  // Pega o primeiro botão Baixar (que corresponde ao vídeo "This woman has one hand made of gold")
  const downloadButton = page.locator('button:has-text("Baixar")').first();
  await downloadButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  console.log('[Playwright] Clicando no botão "Baixar"...');

  // Prepara promessas para capturar o download ou modal
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await downloadButton.click({ force: true });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(__dirname, 'after_click_baixar.png') });

  let download = await downloadPromise;

  // Se não disparou o download imediatamente, verifica se abriu um modal de confirmação/resolução
  if (!download) {
    console.log('[Playwright] Verificando opções do modal de exportação...');
    const modalButtons = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"], [class*="modal"], [class*="drawer"]');
      if (!dialog) return [];
      return Array.from(dialog.querySelectorAll('button, a')).map(b => b.innerText.trim()).filter(Boolean);
    });
    console.log('[Playwright] Botões dentro do modal:', modalButtons);

    // Clica no botão de confirmar download dentro do modal
    const confirmDownload = page.locator('div[role="dialog"] button:has-text("Baixar"), div[role="dialog"] button:has-text("Download"), div[role="dialog"] button:has-text("Confirmar"), div[role="dialog"] button:has-text("Salvar")').last();
    if (await confirmDownload.isVisible().catch(() => false)) {
      console.log('[Playwright] Clicando para confirmar o download no modal...');
      const secondDownloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await confirmDownload.click({ force: true });
      download = await secondDownloadPromise;
    }
  }

  if (download) {
    const outputPath = path.join(__dirname, 'This_woman_has_one_hand_made_of_gold_SEM_MARCA.mp4');
    await download.saveAs(outputPath);
    console.log('\n=============================================================');
    console.log(`[Playwright] SUCESSO! O VÍDEO PROCESSADO FOI BAIXADO:`);
    console.log(`>> ${outputPath}`);
    console.log('=============================================================\n');
  } else {
    // Procura por links de download direto (tags <a href="..."> ou <video src="...">)
    const videoSources = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('video, a[download], a[href*=".mp4"]')).map(el => ({
        tag: el.tagName,
        src: el.src || el.href
      }));
    });
    console.log('[Playwright] Fontes de vídeo encontradas:', videoSources);
  }

  await page.waitForTimeout(2000);
  await browser.close();
}

downloadVideo().catch(console.error);
