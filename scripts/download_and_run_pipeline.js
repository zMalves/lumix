const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

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

  console.log('[Pipeline] Conectando ao VMake editor...');
  await page.goto('https://vmake.ai/pt/video-watermark-remover/editor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Fecha eventuais popups
  try {
    const acceptCookie = page.locator('button:has-text("Aceitar"), button:has-text("Accept")').first();
    if (await acceptCookie.isVisible().catch(() => false)) await acceptCookie.click().catch(() => {});
  } catch (e) {}

  // Garante que Card 0 está selecionado
  try {
    const firstCard = page.locator('.task-card--Y5yrO').first();
    await firstCard.click().catch(() => {});
  } catch (e) {}

  console.log('[Pipeline] Monitorando conclusão do processamento em nuvem...');
  const maxWaitMs = 1800000; // 30 minutos
  const start = Date.now();
  let finished = false;

  while (Date.now() - start < maxWaitMs) {
    // Procura o botão principal do editor selecionado
    // Quando processando: "Processando... X%"
    // Quando concluído: "Baixar" ou "Download"
    const mainActionBtn = page.locator('button.premium-button--TMvm2').first();
    const btnText = await mainActionBtn.innerText().catch(() => '');
    const elapsed = Math.round((Date.now() - start) / 1000);

    const isDownloadReady = btnText.includes('Baixar') || btnText.includes('Download');
    console.log(`[Pipeline] (${elapsed}s) Botão Principal: "${btnText}"`);

    if (isDownloadReady) {
      console.log('[Pipeline] 🎯 VÍDEO CONCLUÍDO NO VMAKE! Iniciando download...');
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 45000 }),
        mainActionBtn.click()
      ]);
      await download.saveAs(outputPath);
      console.log(`[Pipeline] ✅ Download salvo com sucesso em: ${outputPath}`);
      finished = true;
      break;
    }

    await page.waitForTimeout(5000);
  }

  await browser.close();

  if (!finished) {
    console.error('[Pipeline] Tempo limite atingido sem conclusão.');
    process.exit(1);
  }

  // Agora dispara o restante do pipeline automatizado
  console.log('\n=============================================================');
  console.log('⚡ DISPARANDO ETAPAS FINAIS DO PIPELINE AUTOMATIZADO');
  console.log('=============================================================\n');

  const pipelineScript = path.join(__dirname, 'run_full_pipeline_facts13.js');
  execSync(`node "${pipelineScript}"`, { stdio: 'inherit' });

  console.log('\n✨ PIPELINE COMPLETO EXECUTADO COM SUCESSO ABSOLUTO!');
})();
