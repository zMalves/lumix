const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'dashboard', 'public', 'style.css');
const htmlPath = path.join(__dirname, '..', 'dashboard', 'public', 'index.html');
const appPath = path.join(__dirname, '..', 'dashboard', 'public', 'app.js');

let css = fs.readFileSync(cssPath, 'utf8');
let html = fs.readFileSync(htmlPath, 'utf8');
let app = fs.readFileSync(appPath, 'utf8');

console.log('--- Aplicando Correções de QA / Design ---');

// =========================================================================
// 1. CORREÇÕES NO STYLE.CSS
// =========================================================================

// Garantir white-space: nowrap em headers de tabelas e ajuste de colunas
const tableCssAdd = `
/* Tabela de Projetos - Ajustes Anti-Quebra e Alinhamento */
.projects-table th {
  padding: 0.85rem 1rem;
  white-space: nowrap !important;
  font-weight: 700 !important;
  letter-spacing: 0.06em;
  color: var(--color-fog-text);
  border-bottom: 1px solid var(--color-carbon-border);
}

.projects-table td {
  padding: 0.75rem 1rem;
  vertical-align: middle;
  white-space: nowrap !important;
}

.projects-table th:nth-child(2),
.projects-table td:nth-child(2) {
  white-space: normal !important;
  min-width: 280px;
  max-width: 440px;
}

.project-status-control {
  display: inline-flex !important;
  align-items: center !important;
  gap: 0.45rem !important;
  background: #ffffff !important;
  border: 1px solid var(--color-border-input) !important;
  border-radius: var(--radius-pill) !important;
  padding: 3px 10px !important;
  white-space: nowrap !important;
  min-width: 130px !important;
  transition: all 0.2s ease !important;
}

.project-status-control:hover {
  border-color: var(--color-ultraviolet-key) !important;
  box-shadow: 0 1px 4px rgba(79, 70, 229, 0.12) !important;
}

.evervault-select-status {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: var(--color-frost-white) !important;
  font-family: var(--font-main) !important;
  font-size: 0.76rem !important;
  font-weight: 600 !important;
  padding: 2px 18px 2px 2px !important;
  cursor: pointer;
  background-position: right 4px center !important;
  background-size: 10px !important;
  white-space: nowrap !important;
  width: auto !important;
  min-width: 95px !important;
}

/* Padronização de Inputs do Kit de Postagem e Publicação */
#post-caption-text,
#post-hashtags-text,
#post-yt-title-input,
#post-yt-desc-input,
#post-yt-tags-input,
#post-yt-channel-select,
#post-yt-privacy-select {
  background-color: #ffffff !important;
  border: 1px solid var(--color-border-input) !important;
  color: var(--color-frost-white) !important;
  font-family: var(--font-main) !important;
  transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
}

#post-caption-text:focus,
#post-hashtags-text:focus,
#post-yt-title-input:focus,
#post-yt-desc-input:focus,
#post-yt-tags-input:focus,
#post-yt-channel-select:focus,
#post-yt-privacy-select:focus {
  border-color: var(--color-ultraviolet-key) !important;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12) !important;
  outline: none !important;
}

#post-yt-tags-input,
#post-hashtags-text {
  font-family: var(--font-mono) !important;
  color: var(--color-ultraviolet-key) !important;
}

#post-yt-status-badge {
  background: #f1f5f9 !important;
  border: 1px solid var(--color-carbon-border) !important;
  color: var(--color-fog-text) !important;
}

#queue-direct-url {
  background: #ffffff !important;
  border: 1px solid var(--color-border-input) !important;
  color: var(--color-frost-white) !important;
}
`;

css += '\n' + tableCssAdd;
fs.writeFileSync(cssPath, css, 'utf8');
console.log('[OK] style.css atualizado com regras anti-quebra e padronização visual');

// =========================================================================
// 2. CORREÇÕES NO INDEX.HTML
// =========================================================================

// A) Substituir background:#12131f e variantes escuras no formulário de publicação
html = html.replace(
  `background:#12131f; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); color:var(--color-frost-white); font-size:0.85rem; line-height:1.6; padding:0.75rem; resize:vertical;`,
  `background:#ffffff; border:1px solid var(--color-border-input); border-radius:var(--radius-inputs); color:var(--color-frost-white); font-size:0.85rem; line-height:1.6; padding:0.75rem; resize:vertical;`
);

html = html.replace(
  `background:#12131f; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); color:var(--color-ultraviolet-key); font-size:0.85rem; padding:0.6rem 0.75rem; font-weight:500; font-family:var(--font-mono);`,
  `background:#ffffff; border:1px solid var(--color-border-input); border-radius:var(--radius-inputs); color:var(--color-ultraviolet-key); font-size:0.85rem; padding:0.6rem 0.75rem; font-weight:600; font-family:var(--font-mono);`
);

html = html.replace(
  `<span id="post-yt-status-badge" style="font-size:0.76rem; font-family:var(--font-mono); color:var(--color-fog-text); background:#12131f; padding:3px 10px; border-radius:var(--radius-pill); border:1px solid var(--color-carbon-border);">Pronto para postar</span>`,
  `<span id="post-yt-status-badge" style="font-size:0.76rem; font-family:var(--font-mono); color:var(--color-fog-text); background:#f1f5f9; padding:3px 10px; border-radius:var(--radius-pill); border:1px solid var(--color-carbon-border);">Pronto para postar</span>`
);

html = html.replace(
  `select id="post-yt-channel-select" style="width:100%; font-size:0.86rem; padding:0.65rem; background:#12131f; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); color:var(--color-frost-white);"`,
  `select id="post-yt-channel-select" style="width:100%; font-size:0.86rem; padding:0.65rem; background:#ffffff; border:1px solid var(--color-border-input); border-radius:var(--radius-inputs); color:var(--color-frost-white);"`
);

html = html.replace(
  `select id="post-yt-privacy-select" style="width:100%; font-size:0.86rem; padding:0.65rem; background:#12131f; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); color:var(--color-frost-white);"`,
  `select id="post-yt-privacy-select" style="width:100%; font-size:0.86rem; padding:0.65rem; background:#ffffff; border:1px solid var(--color-border-input); border-radius:var(--radius-inputs); color:var(--color-frost-white);"`
);

html = html.replace(
  `style="display:none; background:#12131f; border:1px dashed var(--color-carbon-border); border-radius:var(--radius-inputs); padding:0.85rem 1rem;"`,
  `style="display:none; background:#f8fafc; border:1px dashed var(--color-border-input); border-radius:var(--radius-inputs); padding:0.85rem 1rem;"`
);

html = html.replace(
  `input type="datetime-local" id="post-yt-publish-at" style="font-size:0.85rem; padding:0.6rem 0.8rem; background:#0b0c14; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); color:var(--color-frost-white); font-family:var(--font-mono);"`,
  `input type="datetime-local" id="post-yt-publish-at" style="font-size:0.85rem; padding:0.6rem 0.8rem; background:#ffffff; border:1px solid var(--color-border-input); border-radius:var(--radius-inputs); color:var(--color-frost-white); font-family:var(--font-mono);"`
);

html = html.replace(
  `input type="text" id="post-yt-title-input" placeholder="Cole ou edite o título do vídeo aqui..." maxlength="100" style="width:100%; font-size:0.88rem; padding:0.65rem 0.85rem; background:#12131f; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); color:var(--color-frost-white); font-weight:500;"`,
  `input type="text" id="post-yt-title-input" placeholder="Cole ou edite o título do vídeo aqui..." maxlength="100" style="width:100%; font-size:0.88rem; padding:0.65rem 0.85rem; background:#ffffff; border:1px solid var(--color-border-input); border-radius:var(--radius-inputs); color:var(--color-frost-white); font-weight:500;"`
);

html = html.replace(
  `textarea id="post-yt-desc-input" rows="4" placeholder="Cole ou digite a descrição do vídeo aqui..." style="width:100%; font-size:0.85rem; padding:0.75rem; background:#12131f; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); color:var(--color-frost-white); line-height:1.6; resize:vertical;"`,
  `textarea id="post-yt-desc-input" rows="4" placeholder="Cole ou digite a descrição do vídeo aqui..." style="width:100%; font-size:0.85rem; padding:0.75rem; background:#ffffff; border:1px solid var(--color-border-input); border-radius:var(--radius-inputs); color:var(--color-frost-white); line-height:1.6; resize:vertical;"`
);

html = html.replace(
  `input type="text" id="post-yt-tags-input" placeholder="shorts, viral, curiosidades, fatos..." style="width:100%; font-size:0.85rem; padding:0.65rem 0.85rem; background:#12131f; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); color:var(--color-ultraviolet-key); font-family:var(--font-mono);"`,
  `input type="text" id="post-yt-tags-input" placeholder="shorts, viral, curiosidades, fatos..." style="width:100%; font-size:0.85rem; padding:0.65rem 0.85rem; background:#ffffff; border:1px solid var(--color-border-input); border-radius:var(--radius-inputs); color:var(--color-ultraviolet-key); font-family:var(--font-mono);"`
);

// B) Input de Fila Direta (remover background escuro)
html = html.replace(
  `id="queue-direct-url" placeholder="Cole o link do YouTube Shorts ou TikTok (ex: https://www.youtube.com/shorts/...)" style="flex: 1; min-width: 280px; font-size: 0.88rem; padding: 0.65rem 0.9rem; background: #0c0d16; border: 1px solid var(--color-carbon-border); border-radius: var(--radius-inputs); color: var(--color-frost-white);"`,
  `id="queue-direct-url" placeholder="Cole o link do YouTube Shorts ou TikTok (ex: https://www.youtube.com/shorts/...)" style="flex: 1; min-width: 280px; font-size: 0.88rem; padding: 0.65rem 0.9rem; background: #ffffff; border: 1px solid var(--color-border-input); border-radius: var(--radius-inputs); color: var(--color-frost-white);"`
);

// C) Settings: Box de canal conectado no YouTube
html = html.replace(
  `style="display:flex; justify-content:space-between; align-items:center; background:#11121d; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); padding:0.9rem 1.1rem;"`,
  `style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); padding:0.9rem 1.1rem;"`
);

// D) Remover emojis nas opções de modo de envio
html = html.replace(`<option value="public" selected>🚀 Publicar Agora (Público)</option>`, `<option value="public" selected>Publicar Agora (Público)</option>`);
html = html.replace(`<option value="schedule">📅 Agendar Publicação (Data & Horário)</option>`, `<option value="schedule">Agendar Publicação (Data & Horário)</option>`);
html = html.replace(`<option value="unlisted">🔗 Não Listado (Apenas com o Link)</option>`, `<option value="unlisted">Não Listado (Apenas com o Link)</option>`);
html = html.replace(`<option value="private">🔒 Privado (Rascunho)</option>`, `<option value="private">Privado (Rascunho)</option>`);
html = html.replace(`<span id="btn-post-youtube-text">🚀 Publicar Short Agora</span>`, `<span id="btn-post-youtube-text">Publicar Short Agora</span>`);

// E) Remover emojis nos títulos da aba de configurações
html = html.replace(`🔑 OpenAI API Key`, `OpenAI API Key`);
html = html.replace(`🎙️ MiniMax API Key`, `MiniMax API Key`);
html = html.replace(`🔊 MiniMax Voice ID`, `MiniMax Voice ID`);
html = html.replace(`🖥️ Voice Studio URL`, `Voice Studio URL`);
html = html.replace(`⚡ VMake AI Developer API`, `VMake AI Developer API`);
html = html.replace(`💾 Salvar Configurações`, `Salvar Configurações`);

// F) Limpeza no console VMake
html = html.replace(
  `style="background: #0a0e17; border: 1px solid var(--color-carbon-border); border-radius: var(--radius-inputs); padding: 0.75rem 1rem; margin-top: 1rem; font-family: var(--font-mono); font-size: 0.8rem; display: flex; justify-content: space-between; align-items: center;"`,
  `style="background: #0f172a; border: 1px solid #334155; border-radius: var(--radius-inputs); padding: 0.75rem 1rem; margin-top: 1rem; font-family: var(--font-mono); font-size: 0.8rem; display: flex; justify-content: space-between; align-items: center;"`
);
html = html.replace(
  `<span id="vmake-status" style="color: var(--color-ultraviolet-key);">Processando...</span>`,
  `<span id="vmake-status" style="color: #10b981; font-weight: 600;">Aguardando...</span>`
);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('[OK] index.html atualizado com paleta limpa e sem elementos escuros residuais');

// =========================================================================
// 3. CORREÇÕES NO APP.JS
// =========================================================================

// A) YouTube Channel Cards no app.js: Substituir backgrounds escuros por superfícies claras
const oldYtCardMetrics = `            <!-- Box de Apelido Customizado -->
              <div style="background:#12131f; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); padding:0.6rem 0.85rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <label style="font-size:0.75rem; font-weight:700; color:var(--color-mist-text); text-transform:uppercase; letter-spacing:0.05em;">Apelido:</label>
                <input type="text" id="alias-input-\${c.id}" value="\${escapeHtml(c.alias || '')}" placeholder="Ex: Canal Principal, Dark 01" style="background:transparent; border:none; outline:none; color:var(--color-frost-white); font-size:0.85rem; width:180px;">
                <button type="button" class="btn-secondary btn-sm" onclick="saveChannelAlias('\${c.id}')" style="font-size:0.78rem; padding:4px 10px;">Salvar</button>
              </div>
            </div>

            <!-- Grade de Métricas Reais do Canal -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:1rem;">
              <div style="background:#10111a; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); padding:1rem; text-align:center;">
                <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--color-mist-text); font-weight:700; display:block; margin-bottom:0.35rem;">Inscritos</span>
                <span style="font-size:1.6rem; font-weight:800; color:var(--color-frost-white); font-family:var(--font-mono);">\${formatMetricNumber(c.subscribers)}</span>
              </div>
              <div style="background:#10111a; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); padding:1rem; text-align:center;">
                <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--color-mist-text); font-weight:700; display:block; margin-bottom:0.35rem;">Vídeos Publicados</span>
                <span style="font-size:1.6rem; font-weight:800; color:var(--color-frost-white); font-family:var(--font-mono);">\${formatMetricNumber(c.videoCount)}</span>
              </div>
              <div style="background:#10111a; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); padding:1rem; text-align:center;">
                <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--color-mist-text); font-weight:700; display:block; margin-bottom:0.35rem;">Visualizações Totais</span>
                <span style="font-size:1.6rem; font-weight:800; color:var(--color-emerald-ok); font-family:var(--font-mono);">\${formatMetricNumber(c.viewCount)}</span>
              </div>
            </div>`;

const newYtCardMetrics = `            <!-- Box de Apelido Customizado -->
              <div style="background:#ffffff; border:1px solid var(--color-border-input); border-radius:var(--radius-inputs); padding:0.5rem 0.85rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <label style="font-size:0.75rem; font-weight:700; color:var(--color-fog-text); text-transform:uppercase; letter-spacing:0.05em;">Apelido:</label>
                <input type="text" id="alias-input-\${c.id}" value="\${escapeHtml(c.alias || '')}" placeholder="Ex: Canal Principal, Dark 01" style="background:transparent; border:none; outline:none; color:var(--color-frost-white); font-size:0.85rem; width:180px; font-weight:500;">
                <button type="button" class="btn-secondary btn-sm" onclick="saveChannelAlias('\${c.id}')" style="font-size:0.78rem; padding:4px 10px;">Salvar</button>
              </div>
            </div>

            <!-- Grade de Métricas Reais do Canal -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:1rem;">
              <div style="background:#f8fafc; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); padding:1rem; text-align:center;">
                <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--color-fog-text); font-weight:700; display:block; margin-bottom:0.35rem;">Inscritos</span>
                <span style="font-size:1.6rem; font-weight:800; color:var(--color-frost-white); font-family:var(--font-mono);">\${formatMetricNumber(c.subscribers)}</span>
              </div>
              <div style="background:#f8fafc; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); padding:1rem; text-align:center;">
                <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--color-fog-text); font-weight:700; display:block; margin-bottom:0.35rem;">Vídeos Publicados</span>
                <span style="font-size:1.6rem; font-weight:800; color:var(--color-frost-white); font-family:var(--font-mono);">\${formatMetricNumber(c.videoCount)}</span>
              </div>
              <div style="background:#f8fafc; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); padding:1rem; text-align:center;">
                <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--color-fog-text); font-weight:700; display:block; margin-bottom:0.35rem;">Visualizações Totais</span>
                <span style="font-size:1.6rem; font-weight:800; color:var(--color-emerald-ok); font-family:var(--font-mono);">\${formatMetricNumber(c.viewCount)}</span>
              </div>
            </div>`;

if (app.includes(oldYtCardMetrics)) {
  app = app.replace(oldYtCardMetrics, newYtCardMetrics);
  console.log('[OK] app.js métricas dos cartões do YouTube atualizadas para tema claro');
} else {
  console.log('[WARN] oldYtCardMetrics não encontrado');
}

// B) Ajustar o botão de tradução na etapa 4 para refletir o idioma ativo
app = app.replace(
  `const titleStep4 = document.querySelector('#step-badge-4');\n  if (titleStep4) titleStep4.innerHTML = \`<span class="step-num">4</span> Storytelling (\${meta.label})\`;`,
  `const titleStep4 = document.querySelector('#step-badge-4');
  if (titleStep4) titleStep4.innerHTML = \`<span class="step-num">4</span> Storytelling (\${meta.label})\`;
  const btnTr = document.getElementById('btn-translate');
  if (btnTr) btnTr.textContent = \`Adaptar para \${meta.label}\`;`
);

// C) Remover emoji de calendário na data agendada da tabela
app = app.replace(
  `\${sDate ? \`<span style="font-size: 0.72rem; color: var(--color-ultraviolet-key); background: rgba(184, 140, 255, 0.08); border: 1px solid rgba(184, 140, 255, 0.2); padding: 2px 7px; border-radius: 4px; white-space: nowrap;">📅 \${formatDisplayDate(sDate)}</span>\` : \`<span style="font-size: 0.72rem; color: var(--color-ash-text);">-</span>\`}`,
  `\${sDate ? \`<span style="font-size: 0.72rem; color: var(--color-ultraviolet-key); background: #f5f3ff; border: 1px solid #ddd6fe; padding: 2px 7px; border-radius: 4px; white-space: nowrap; font-weight: 600;">\${formatDisplayDate(sDate)}</span>\` : \`<span style="font-size: 0.72rem; color: var(--color-fog-text);">-</span>\`}`
);

fs.writeFileSync(appPath, app, 'utf8');
console.log('[OK] app.js atualizado com sucesso');

