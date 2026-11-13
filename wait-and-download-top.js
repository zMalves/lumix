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
  console.log('[Playwright] Conectando ao VMake para monitorar o vídeo do topo ("They threw a bomb at the swarm")...');

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

  await page.goto('https://vmake.ai/pt/video-watermark-remover/editor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Fecha eventuais diálogos
  try {
    const closeBtns = await page.$$('button:has-text("Aceitar"), div[role="dialog"] button, svg[class*="close"]');
    for (const b of closeBtns) {
      if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
    }
  } catch (e) {}

  console.log('[Playwright] Monitorando status do primeiro card...');

  const startTime = Date.now();
  const maxWait = 10 * 60 * 1000; // 10 min

  while (Date.now() - startTime < maxWait) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    const cardInfo = await page.evaluate(() => {
      // Procura todas as seções/cards de vídeos
      // Cada card contém o nome do arquivo, como "original.mp4"
      const titles = Array.from(document.querySelectorAll('*')).filter(el => {
        return el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 && el.textContent.trim() === 'original.mp4';
      });

      // Pega o card do topo
      // O botão de ação associado ao primeiro card
      const allButtons = Array.from(document.querySelectorAll('button')).map(b => {
        const rect = b.getBoundingClientRect();
        return {
          text: b.innerText.trim(),
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        };
      }).filter(b => b.width > 0 && b.height > 0);

      // O botão principal do primeiro card fica à direita (left > 900) e na altura entre 400 e 800
      const topActionButtons = allButtons.filter(b => b.left > 900 && b.top > 300 && b.top < 850);

      return {
        hasOriginalTitle: titles.length > 0,
        topActionButtons,
        bodyTextSnippet: document.body.innerText.slice(0, 500)
      };
    });

    const actionBtn = cardInfo.topActionButtons[0];
    const btnText = actionBtn ? actionBtn.text : 'Não identificado';

    process.stdout.write(`\r[Playwright] [${elapsed}s] Botão do card do topo: "${btnText}"`);

    if (btnText.includes('Baixar') || btnText.includes('Download')) {
      console.log('\n[Playwright] O card do topo está PRONTO para download!');
      break;
    }

    await page.waitForTimeout(4000);
  }

  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'top_card_ready.png') });

  // Agora localiza o botão de download ESPECÍFICO do primeiro card (o que tem left > 900 e top < 850)
  const downloadBtnHandle = await page.evaluateHandle(() => {
    const allButtons = Array.from(document.querySelectorAll('button'));
    return allButtons.find(b => {
      const rect = b.getBoundingClientRect();
      const text = b.innerText.trim();
      return (text.includes('Baixar') || text.includes('Download')) && rect.left > 900 && rect.top < 850;
    });
  });

  if (downloadBtnHandle) {
    console.log('[Playwright] Clicando no botão Baixar do card do topo...');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      downloadBtnHandle.click()
    ]);

    await download.saveAs(outputPath);
    const stats = fs.statSync(outputPath);
    console.log('\n=============================================================');
    console.log(`[Playwright] SUCESSO! Vídeo "They threw a bomb at the swarm" salvo:`);
    console.log(`>> Arquivo: ${outputPath}`);
    console.log(`>> Tamanho: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log('=============================================================\n');
  } else {
    console.error('[Playwright] Não foi possível encontrar o botão Baixar específico do card do topo.');
  }

  await browser.close();
}

main().catch(err => {
  console.error('[Playwright] Erro:', err);
  process.exit(1);
});
