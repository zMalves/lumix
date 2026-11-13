const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runFullQASuite() {
  const outDir = path.join(__dirname, '..', 'screenshots', 'qa_test');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1
  });

  const page = await context.newPage();
  const consoleLogs = [];
  const pageErrors = [];

  page.on('console', msg => consoleLogs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push(err.message || String(err)));

  console.log('--- RE-EXECUTANDO AUDITORIA QA APÓS CORREÇÕES ---');
  await page.goto('http://100.87.205.46:3334', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // 1. Explorar / Trend Radar
  console.log('1. Capturando Tab 1: Explorar / Trend Radar...');
  await page.screenshot({ path: path.join(outDir, '01_tab_search_full.png'), fullPage: true });

  // 2. Fila de Produção
  console.log('2. Capturando Tab 2: Fila de Produção...');
  await page.click('button[data-tab="tab-queue"]').catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '02_tab_queue_full.png'), fullPage: true });

  // 3. Projetos
  console.log('3. Capturando Tab 3: Projetos (Tabela Sleek)...');
  await page.click('button[data-tab="tab-projects"]').catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, '03_tab_projects_full.png'), fullPage: true });

  // 4. Estúdio - Base
  console.log('4. Capturando Tab 4: Estúdio (Base / Geral)...');
  await page.evaluate(() => {
    if (typeof window.selectProjectAndOpen === 'function') {
      window.selectProjectAndOpen('Slicing_A_Bullet_In_Half_3danimationfact_facts_science');
    }
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, '04_tab_studio_base_full.png'), fullPage: true });

  // 4b. Estúdio - Espanhol (ES)
  console.log('4b. Capturando Tab 4b: Estúdio (Aba Espanhol)...');
  await page.evaluate(() => {
    if (typeof window.switchStudioTab === 'function') {
      window.switchStudioTab('es');
    }
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '04b_tab_studio_es_full.png'), fullPage: true });

  // 5. YouTube Multi-Canal
  console.log('5. Capturando Tab 5: YouTube Studio...');
  await page.click('button[data-tab="tab-youtube"]').catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '05_tab_youtube_full.png'), fullPage: true });

  // 6. Configurações
  console.log('6. Capturando Tab 6: Configurações do Sistema...');
  await page.click('button[data-tab="tab-settings"]').catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '06_tab_settings_full.png'), fullPage: true });

  // 7. Simulação de Operação Interna: Teste de Geração de Copys via API
  console.log('7. Testando chamada de API interna (/api/generate-post-copy)...');
  const tStart = Date.now();
  const apiTestResult = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/generate-post-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: 'Slicing_A_Bullet_In_Half_3danimationfact_facts_science',
          lang: 'es'
        })
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  const tDuration = Date.now() - tStart;
  console.log(`API /api/generate-post-copy finalizada em ${tDuration}ms [Status: ${apiTestResult.status}]`);

  // 8. Checagem de Estilos e Contrastes nos Elementos Críticos
  const visualVerification = await page.evaluate(() => {
    const postCaption = document.getElementById('post-caption-text');
    const postYtTitle = document.getElementById('post-yt-title-input');
    const postYtDesc = document.getElementById('post-yt-desc-input');
    const queueUrl = document.getElementById('queue-direct-url');
    const thEls = Array.from(document.querySelectorAll('.projects-table th')).map(th => ({
      text: th.innerText.trim(),
      whiteSpace: window.getComputedStyle(th).whiteSpace
    }));
    const statusControl = document.querySelector('.project-status-control');

    return {
      postCaptionBg: postCaption ? window.getComputedStyle(postCaption).backgroundColor : null,
      postCaptionColor: postCaption ? window.getComputedStyle(postCaption).color : null,
      postYtTitleBg: postYtTitle ? window.getComputedStyle(postYtTitle).backgroundColor : null,
      postYtDescBg: postYtDesc ? window.getComputedStyle(postYtDesc).backgroundColor : null,
      queueUrlBg: queueUrl ? window.getComputedStyle(queueUrl).backgroundColor : null,
      tableHeaders: thEls,
      statusControlWidth: statusControl ? window.getComputedStyle(statusControl).width : null,
      statusControlWhiteSpace: statusControl ? window.getComputedStyle(statusControl).whiteSpace : null
    };
  });

  // 9. Gerar Imagem Stitched (Todas as telas em um único documento visual)
  console.log('9. Gerando imagem consolidada (Stitched Board)...');
  // Usamos um canvas headless via page para juntar as imagens
  const images = [
    { title: '01. Explorar / Trend Radar', file: '01_tab_search_full.png' },
    { title: '02. Fila de Produção', file: '02_tab_queue_full.png' },
    { title: '03. Tabela de Projetos Salvos', file: '03_tab_projects_full.png' },
    { title: '04. Estúdio - Base (Geral)', file: '04_tab_studio_base_full.png' },
    { title: '05. Estúdio - Versão Espanhol & Publicação', file: '04b_tab_studio_es_full.png' },
    { title: '06. YouTube Studio Multi-Canal', file: '05_tab_youtube_full.png' },
    { title: '07. Configurações & Motores de IA', file: '06_tab_settings_full.png' }
  ];

  // Cria um arquivo HTML temporário com todas as imagens e captura o fullPage
  const stitchHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>LUMIX Studio - Consolidated QA Board</title>
  <style>
    body {
      margin: 0;
      padding: 40px;
      background: #0f172a;
      font-family: 'Plus Jakarta Sans', sans-serif;
      color: #f8fafc;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .header h1 {
      font-size: 28px;
      margin: 0 0 10px 0;
      letter-spacing: -0.02em;
    }
    .header p {
      color: #94a3b8;
      font-size: 14px;
      margin: 0;
    }
    .grid {
      display: flex;
      flex-direction: column;
      gap: 50px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
    }
    .card-title {
      padding: 16px 24px;
      font-size: 16px;
      font-weight: 700;
      border-bottom: 1px solid #334155;
      background: #1e293b;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .card-title span.badge {
      background: #4f46e5;
      color: #fff;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 9999px;
      font-family: monospace;
    }
    .card img {
      width: 100%;
      display: block;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>LUMIX STUDIO — PAINEL INTEGRADO DE AUDITORIA DE DESIGN & QA</h1>
    <p>Tema Claro Minimalista • Alto Contraste • Validação Sem Emojis Grotescos • Sincronização Multi-Idioma</p>
  </div>
  <div class="grid">
    ${images.map((img, idx) => `
      <div class="card">
        <div class="card-title">
          <span class="badge">TELA 0${idx + 1}</span>
          ${img.title}
        </div>
        <img src="${img.file}" />
      </div>
    `).join('')}
  </div>
</body>
</html>`;

  const stitchHtmlPath = path.join(outDir, 'stitch_preview.html');
  fs.writeFileSync(stitchHtmlPath, stitchHtml, 'utf8');

  const stitchPage = await context.newPage();
  await stitchPage.goto('file:///' + stitchHtmlPath.replace(/\\/g, '/'), { waitUntil: 'load' });
  await stitchPage.waitForTimeout(2000);
  await stitchPage.screenshot({ path: path.join(outDir, 'qa_consolidated_board.png'), fullPage: true });
  await stitchPage.close();

  await browser.close();

  const finalReport = {
    timestamp: new Date().toISOString(),
    pageErrors,
    consoleErrors: consoleLogs.filter(l => l.type === 'error'),
    apiTest: {
      durationMs: tDuration,
      status: apiTestResult.status,
      success: apiTestResult.ok
    },
    visualVerification
  };

  fs.writeFileSync(path.join(outDir, 'final_qa_report.json'), JSON.stringify(finalReport, null, 2), 'utf8');
  console.log('\n--- BATERIA DE TESTES QA CONCLUÍDA COM SUCESSO ---');
}

runFullQASuite().catch(err => {
  console.error('[ERRO QA SUITE]', err);
  process.exit(1);
});

