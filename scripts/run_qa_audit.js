const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runQAAudit() {
  const outDir = path.join(__dirname, '..', 'screenshots', 'qa_test');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const pageErrors = [];

  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', err => {
    pageErrors.push(err.message || String(err));
  });

  console.log('--- Iniciando Auditoria QA Headless do LUMIX Studio ---');
  console.log('Conectando em http://100.87.205.46:3334 ...');

  await page.goto('http://100.87.205.46:3334', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 1. Tab Explorar / Trend Radar
  console.log('1. Capturando Tab Explorar / Trend Radar...');
  await page.screenshot({ path: path.join(outDir, '01_tab_search_full.png'), fullPage: true });

  // 2. Tab Fila de Produção
  console.log('2. Capturando Tab Fila de Produção...');
  await page.click('button[data-tab="tab-queue"]').catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '02_tab_queue_full.png'), fullPage: true });

  // 3. Tab Projetos
  console.log('3. Capturando Tab Projetos...');
  await page.click('button[data-tab="tab-projects"]').catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '03_tab_projects_full.png'), fullPage: true });

  // 4. Tab Estúdio (selecionando um projeto)
  console.log('4. Navegando para o Estúdio...');
  // Tenta selecionar um projeto na lista ou sidebar
  const projectLink = await page.$('.projects-table tbody tr, .project-item');
  if (projectLink) {
    await projectLink.click();
    await page.waitForTimeout(1500);
  } else {
    await page.click('button[data-tab="tab-studio"]').catch(() => {});
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: path.join(outDir, '04_tab_studio_base_full.png'), fullPage: true });

  // 4b. Estúdio Aba Espanhol
  console.log('4b. Alternando para aba ES no Estúdio...');
  const esTabBtn = await page.$('.studio-lang-tab-btn[data-lang="es"]');
  if (esTabBtn) {
    await esTabBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, '04b_tab_studio_es_full.png'), fullPage: true });
  }

  // 5. Tab YouTube
  console.log('5. Capturando Tab YouTube...');
  await page.click('button[data-tab="tab-youtube"]').catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '05_tab_youtube_full.png'), fullPage: true });

  // 6. Tab Configurações
  console.log('6. Capturando Tab Configurações...');
  await page.click('button[data-tab="tab-settings"]').catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '06_tab_settings_full.png'), fullPage: true });

  // 7. Modal Adicionar à Fila (simulação)
  console.log('7. Testando abertura do Modal de Fila...');
  await page.click('button[data-tab="tab-search"]').catch(() => {});
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    if (typeof window.openAddToQueueModal === 'function') {
      window.openAddToQueueModal('https://youtube.com/shorts/test', 'Vídeo Teste de Auditoria QA', '');
    }
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '07_modal_add_queue.png') });

  // Fecha o modal
  await page.evaluate(() => {
    if (typeof window.closeAddToQueueModal === 'function') {
      window.closeAddToQueueModal();
    }
  });

  // 8. Coleta de Métricas de Design e Elementos
  console.log('8. Analisando regras de design, fontes e contrastes...');
  const designAudit = await page.evaluate(() => {
    const findings = [];

    // Checagem de fonte aplicada no body
    const bodyStyle = window.getComputedStyle(document.body);
    findings.push({
      item: 'Font Family',
      value: bodyStyle.fontFamily,
      color: bodyStyle.color,
      backgroundColor: bodyStyle.backgroundColor
    });

    // Checagem de Logo
    const logoArea = document.querySelector('.logo-area');
    const logoSymbol = document.querySelector('.logo-symbol');
    const logoSvg = document.querySelector('.logo-symbol svg');
    findings.push({
      item: 'Logo Details',
      hasLogoArea: !!logoArea,
      hasSvg: !!logoSvg,
      logoAreaBg: logoArea ? window.getComputedStyle(logoArea).backgroundColor : null,
      logoSymbolBg: logoSymbol ? window.getComputedStyle(logoSymbol).backgroundColor : null,
      logoSymbolBorder: logoSymbol ? window.getComputedStyle(logoSymbol).border : null
    });

    // Checagem de headers de tabelas
    const thElements = Array.from(document.querySelectorAll('th'));
    const thDetails = thElements.map(th => {
      const style = window.getComputedStyle(th);
      return {
        text: th.innerText.trim(),
        whiteSpace: style.whiteSpace,
        color: style.color,
        backgroundColor: style.backgroundColor,
        fontSize: style.fontSize,
        textTransform: style.textTransform
      };
    });
    findings.push({ item: 'Table Headers', count: thElements.length, headers: thDetails });

    // Checagem de Inputs e Selects
    const sampleInput = document.querySelector('input[type="text"]');
    const sampleSelect = document.querySelector('select');
    findings.push({
      item: 'Inputs & Selects Style',
      input: sampleInput ? {
        bg: window.getComputedStyle(sampleInput).backgroundColor,
        color: window.getComputedStyle(sampleInput).color,
        border: window.getComputedStyle(sampleInput).border,
        borderRadius: window.getComputedStyle(sampleInput).borderRadius
      } : null,
      select: sampleSelect ? {
        bg: window.getComputedStyle(sampleSelect).backgroundColor,
        color: window.getComputedStyle(sampleSelect).color,
        border: window.getComputedStyle(sampleSelect).border,
        borderRadius: window.getComputedStyle(sampleSelect).borderRadius
      } : null
    });

    // Checagem de botões
    const sampleBtnPrimary = document.querySelector('.btn-primary');
    const sampleBtnSecondary = document.querySelector('.btn-secondary');
    findings.push({
      item: 'Buttons Style',
      primary: sampleBtnPrimary ? {
        bg: window.getComputedStyle(sampleBtnPrimary).backgroundColor,
        color: window.getComputedStyle(sampleBtnPrimary).color,
        borderRadius: window.getComputedStyle(sampleBtnPrimary).borderRadius
      } : null,
      secondary: sampleBtnSecondary ? {
        bg: window.getComputedStyle(sampleBtnSecondary).backgroundColor,
        color: window.getComputedStyle(sampleBtnSecondary).color,
        border: window.getComputedStyle(sampleBtnSecondary).border
      } : null
    });

    return findings;
  });

  await browser.close();

  const auditReport = {
    timestamp: new Date().toISOString(),
    pageErrors,
    consoleErrors: consoleLogs.filter(l => l.type === 'error'),
    consoleWarnings: consoleLogs.filter(l => l.type === 'warning'),
    designAudit
  };

  fs.writeFileSync(path.join(outDir, 'audit_report.json'), JSON.stringify(auditReport, null, 2), 'utf8');

  console.log('\n--- Auditoria QA Concluída ---');
  console.log(`Erros de Página (Uncaught JS): ${pageErrors.length}`);
  console.log(`Console Errors: ${auditReport.consoleErrors.length}`);
  console.log(`Console Warnings: ${auditReport.consoleWarnings.length}`);
  console.log(`Screenshots salvas em: ${outDir}`);
}

runQAAudit().catch(err => {
  console.error('[ERRO QA]', err);
  process.exit(1);
});

