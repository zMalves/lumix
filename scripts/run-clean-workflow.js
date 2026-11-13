const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const authPath = path.join(__dirname, 'vmake_auth.json');
const videoFile = path.join(__dirname, 'This woman has one hand made of gold _ Movie Recap #shorts #movierecap #movieexplained.mp4');

const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
const storageOrigins = authData.origins && authData.origins.length > 0 ? authData.origins[0].localStorage : [];
const storageMap = {};
storageOrigins.forEach(item => {
  storageMap[item.name] = item.value;
});

async function runCleanWorkflow() {
  console.log('[Playwright] Iniciando fluxo limpo de remoção com Inteligente Pro...');
  
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

  // Fecha todos os modais/popups iniciais
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach(b => {
      const t = b.innerText.trim();
      if (t === 'Aceitar' || t === 'Accept' || t === 'Got it' || t === 'Entendi') b.click();
    });
  });

  console.log('[Playwright] Enviando o arquivo de vídeo...');
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15000 }).catch(() => null);
  const uploadButton = page.locator('button:has-text("Enviar")').first();
  await uploadButton.click();

  const fileChooser = await fileChooserPromise;
  if (fileChooser) {
    await fileChooser.setFiles(videoFile);
  } else {
    await page.locator('input[type="file"]').first().setInputFiles(videoFile);
  }

  console.log('[Playwright] Aguardando o card de opções aparecer...');
  await page.waitForSelector('text=Inteligente Pro', { timeout: 60000 });
  await page.waitForTimeout(3000);

  // Fecha qualquer popup de feedback ou anúncio que possa ter aberto por cima
  await page.evaluate(() => {
    document.querySelectorAll('div[role="dialog"] button, div[class*="feedback"] button, svg').forEach(el => {
      const parent = el.closest('div[role="dialog"]');
      if (parent && parent.innerText.includes('improve')) {
        const closeBtn = parent.querySelector('button, svg');
        if (closeBtn) closeBtn.click();
      }
    });
  });

  console.log('[Playwright] Selecionando "Inteligente Pro"...');
  // Localiza e clica especificamente no card Inteligente Pro
  const proCard = page.locator('div, button').filter({ hasText: /^Inteligente\s*Pro$/i }).last();
  await proCard.click({ force: true });
  await page.waitForTimeout(1500);

  console.log('[Playwright] Clicando no botão "Aplicar"...');
  // Localiza o botão Aplicar visível
  const applyBtn = page.locator('button:has-text("Aplicar")').filter({ hasText: /Aplicar/ }).last();
  await applyBtn.scrollIntoViewIfNeeded();
  await applyBtn.click({ force: true });
  
  console.log('[Playwright] "Aplicar" clicado! Aguardando o início do processamento...');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(__dirname, 'status_after_apply.png') });

  // Monitora o estado
  console.log('[Playwright] Aguardando a conclusão do processamento...');
  const startTime = Date.now();
  let completed = false;

  while (Date.now() - startTime < 600000) { // até 10 min
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Avalia o que está na tela
    const state = await page.evaluate(() => {
      const allText = document.body ? document.body.innerText : '';
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());
      const hasBaixar = buttons.some(t => t.includes('Baixar') || t.includes('Download'));
      const hasAplicar = buttons.some(t => t.includes('Aplicar'));
      const isProcessing = allText.includes('Processando') || allText.includes('Generating') || /\b\d{1,3}%\b/.test(allText);
      
      return { hasBaixar, hasAplicar, isProcessing, buttons: buttons.filter(b => b.length > 0 && b.length < 30) };
    });

    // Se o botão Baixar apareceu e o botão Aplicar sumiu ou mudou para Baixar
    if (state.hasBaixar) {
      console.log(`\n[Playwright] Botão Baixar detectado após ${elapsed}s!`);
      completed = true;
      break;
    }

    process.stdout.write(`\r[Playwright] Processando IA (${elapsed}s)... Status: ${state.isProcessing ? 'Em andamento' : 'Aguardando'}`);
    await page.waitForTimeout(5000);
  }

  await page.screenshot({ path: path.join(__dirname, 'status_before_download.png') });

  console.log('\n[Playwright] Acionando o download do vídeo processado...');
  
  // Localiza o botão Baixar do editor
  const downloadBtn = page.locator('button:has-text("Baixar")').last();
  
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    downloadBtn.click({ force: true })
  ]);

  const outputVideo = path.join(__dirname, 'video_sem_marca_dagua_final.mp4');
  await download.saveAs(outputVideo);

  console.log(`\n=============================================================`);
  console.log(`[Playwright] SUCESSO TOTAL! Vídeo baixado:`);
  console.log(`>> ${outputVideo}`);
  console.log(`=============================================================\n`);

  await browser.close();
}

runCleanWorkflow().catch(console.error);
