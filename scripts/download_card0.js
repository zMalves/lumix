const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function downloadCard0() {
  const authPath = path.join(process.cwd(), 'vmake_auth.json');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: authPath, viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto('https://vmake.ai/pt/video-watermark-remover/editor', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const outputPath = path.join(process.cwd(), 'videos', '10_most_INTERESTING_facts_about_everything', 'sem_marca.mp4');

  const firstCard = page.locator('.task-card--Y5yrO').first();
  const downloadBtn = firstCard.locator('button.premium-button--TMvm2').first();

  console.log('Downloading real cleaned video from Card 0...');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    downloadBtn.click({ force: true })
  ]);

  await download.saveAs(outputPath);
  console.log('Saved to:', outputPath);
  console.log('Size:', (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2), 'MB');
  await browser.close();
}

downloadCard0().catch(console.error);
