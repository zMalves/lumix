const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function captureStudioFull() {
  const outDir = path.join(__dirname, '..', 'screenshots', 'qa_test');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 }
  });

  await page.goto('http://100.87.205.46:3334', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Seleciona o projeto que tem ES e PT
  await page.evaluate(() => {
    if (typeof window.selectProjectAndOpen === 'function') {
      window.selectProjectAndOpen('Slicing_A_Bullet_In_Half_3danimationfact_facts_science');
    }
  });

  await page.waitForTimeout(2000);

  console.log('Capturando Estúdio Base (Geral)...');
  await page.screenshot({ path: path.join(outDir, '04_tab_studio_base_full.png'), fullPage: true });

  console.log('Alternando para aba Espanhol (ES)...');
  await page.evaluate(() => {
    if (typeof window.switchStudioTab === 'function') {
      window.switchStudioTab('es');
    }
  });

  await page.waitForTimeout(1500);
  console.log('Capturando Estúdio ES (Espanhol)...');
  await page.screenshot({ path: path.join(outDir, '04b_tab_studio_es_full.png'), fullPage: true });

  await browser.close();
  console.log('Estúdio capturado com sucesso!');
}

captureStudioFull().catch(console.error);

