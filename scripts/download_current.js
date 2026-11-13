const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const outputPath = 'C:\\Users\\Maychel\\OneDrive - Seconds\\Documentos\\Sistemas\\shorts_videos\\videos\\Random_Facts_You_Didnt_Know_13\\sem_marca.mp4';

(async () => {
  const authPath = path.join(__dirname, '..', 'vmake_auth.json');
  const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
  const storageMap = {};
  (authData.origins?.[0]?.localStorage || []).forEach(i => storageMap[i.name] = i.value);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: authPath, viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.addInitScript((storage) => {
    for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
  }, storageMap);

  console.log('[Check] Conectando ao VMake editor...');
  await page.goto('https://vmake.ai/pt/video-watermark-remover/editor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Monitora Card 0 até 100% ou botão Baixar
  const maxWaitMs = 900000; // 15 min
  const start = Date.now();
  let finished = false;

  while (Date.now() - start < maxWaitMs) {
    const card0 = page.locator('.task-card--Y5yrO').first();
    const btnBaixar = card0.locator('button:has-text("Baixar"), button:has-text("Download")');
    const isReady = await btnBaixar.isVisible().catch(() => false);

    const btnText = await page.locator('button:has-text("Processando")').first().innerText().catch(() => '');
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[Check] (${elapsed}s) Status: ${btnText || (isReady ? 'Concluído!' : 'Aguardando...')}`);

    if (isReady) {
      console.log('[Check] Vídeo concluído! Iniciando download do card correto...');
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        btnBaixar.click()
      ]);
      await download.saveAs(outputPath);
      console.log(`[Check] Download salvo com sucesso em: ${outputPath}`);
      finished = true;
      break;
    }

    await page.waitForTimeout(5000);
  }

  await browser.close();
  if (!finished) {
    console.log('[Check] Ainda não terminou no tempo limite do script.');
  }
})();
