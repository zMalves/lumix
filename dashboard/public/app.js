/**
 * app.js - Lógica interativa do Frontend do Shorts Studio Pro
 */

let currentProject = null;
let activePollingInterval = null;
let activeStudioTab = 'base';

// Estado de navegação vindo da URL (?tab=...&project=...&id=...&lang=...)
// Guardado aqui para ser restaurado assim que o projeto for carregado.
const _initUrlParams = new URLSearchParams(window.location.search);
let pendingStudioState = { project: _initUrlParams.get('project'), lang: _initUrlParams.get('lang') };
let pendingQueueItem = null;
let currentSearchResults = [];

// Elementos do DOM
const badgeVoiceStudio = document.getElementById('badge-voice-studio');
const badgeOpenAI = document.getElementById('badge-openai');
const btnRefreshStatus = document.getElementById('btn-refresh-status');
const projectsList = document.getElementById('projects-list');
const projectsCount = document.getElementById('projects-count');
const btnOpenFolderRoot = document.getElementById('btn-open-folder-root');
const btnOpenActiveFolder = document.getElementById('btn-open-active-folder');

// Abas / Menus Laterais
const tabButtons = document.querySelectorAll('.nav-item-btn, .tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Busca
const formSearch = document.getElementById('form-search');
const searchLoading = document.getElementById('search-loading');
const searchResultsArea = document.getElementById('search-results-area');
const resultsGrid = document.getElementById('results-grid');
const resultsCountTitle = document.getElementById('results-count-title');
const btnDirectDownload = document.getElementById('btn-direct-download');
const directUrlInput = document.getElementById('direct-url');
const queueDirectUrlInput = document.getElementById('queue-direct-url');

// Pipeline
const pipelineProjectTitle = document.getElementById('pipeline-project-title');
const pipelineProjectPath = document.getElementById('pipeline-project-path');
const playerOriginal = document.getElementById('player-original');
const playerCleaned = document.getElementById('player-cleaned');
const playerCut = document.getElementById('player-cut');
const playerAudio = document.getElementById('player-audio');
const playerFinal = document.getElementById('player-final');
const playerSquareSub = document.getElementById('player-square-sub');

const statusOriginal = document.getElementById('status-original');
const statusCleaned = document.getElementById('status-cleaned');
const statusCut = document.getElementById('status-cut');
const statusAudio = document.getElementById('status-audio');
const statusFinal = document.getElementById('status-final');
const statusSquareSub = document.getElementById('status-square-sub');

const textTranscript = document.getElementById('text-transcript');
const textTranslation = document.getElementById('text-translation');
const btnSaveTranscript = document.getElementById('btn-save-transcript');
const btnSaveTranslation = document.getElementById('btn-save-translation');
const saveStatusTranscript = document.getElementById('save-status-transcript');
const saveStatusTranslation = document.getElementById('save-status-translation');

// Botões de Ação da Esteira
const btnRunVmake = document.getElementById('btn-run-vmake');
const btnRunTranscribe = document.getElementById('btn-run-transcribe');
const btnRunTranslate = document.getElementById('btn-run-translate');
const btnRunCutVideo = document.getElementById('btn-run-cut-video');
const btnRunTts = document.getElementById('btn-run-tts');
const btnRunMerge = document.getElementById('btn-run-merge');
const btnRunSquareSub = document.getElementById('btn-run-square-sub');

// Logs do VMake
const vmakeLogContainer = document.getElementById('vmake-log-container');
const vmakeLogOutput = document.getElementById('vmake-log-output');
const vmakeJobStatus = document.getElementById('vmake-job-status');

// Toast
const toastEl = document.getElementById('toast');
let toastTimer = null;

function showToast(message, duration = 3500) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
    toastTimer = null;
  }, duration);
}

// Configuração Global de Trilha Sonora / Música de Fundo
let globalWithMusic = localStorage.getItem('lumix_with_music') !== 'false';

function updateGlobalMusicUI() {
  const btn = document.getElementById('header-music-toggle');
  const statusEl = document.getElementById('header-music-status');
  if (btn) {
    if (globalWithMusic) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }
  if (statusEl) {
    statusEl.textContent = globalWithMusic ? 'ON' : 'OFF';
  }
}

window.toggleGlobalMusic = function() {
  globalWithMusic = !globalWithMusic;
  localStorage.setItem('lumix_with_music', globalWithMusic ? 'true' : 'false');
  updateGlobalMusicUI();
  showToast(globalWithMusic ? '🎵 Trilha sonora (Ogryzek) ATIVADA por padrão!' : '🔇 Trilha sonora DESATIVADA por padrão!');
};

// --------------------------------------------------------------------------
// INICIALIZAÇÃO
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  updateGlobalMusicUI();
  setupTabs();

  // Restaura a aba que estava aberta antes do F5 (ex.: ?tab=tab-pipeline)
  const initTab = _initUrlParams.get('tab');
  if (initTab && document.getElementById(initTab) && !window.location.hash.includes('tab-youtube')) {
    switchTab(initTab);
  }

  checkSystemStatus();
  loadProjects();
  loadYouTubeChannelsView();

  // Se a URL pedir a aba do YouTube
  if (window.location.hash.includes('tab-youtube')) {
    switchTab('tab-youtube');
  }

  // Verifica retorno de autorização do YouTube OAuth
  try {
    let qs = window.location.search;
    if (!qs && window.location.hash.includes('?')) {
      qs = '?' + window.location.hash.split('?')[1];
    }
    const urlParams = new URLSearchParams(qs);
    if (urlParams.get('youtube_connected') === 'true') {
      const ch = urlParams.get('channel') || 'Seu Canal';
      showToast(`🎉 Canal do YouTube "${ch}" conectado com sucesso!`, 6000);
      switchTab('tab-youtube');
      window.history.replaceState({}, document.title, window.location.pathname + '#tab-youtube');
    } else if (urlParams.get('error')) {
      showToast(`⚠️ ${urlParams.get('error')}`, 10000);
      switchTab('tab-youtube');
      window.history.replaceState({}, document.title, window.location.pathname + '#tab-youtube');
    }
  } catch (e) {}

  // Eventos do YouTube Studio
  const headerYtBtn = document.getElementById('header-youtube-btn');
  if (headerYtBtn) {
    headerYtBtn.addEventListener('click', (e) => {
      if (headerYtBtn.getAttribute('href') === '#tab-youtube') {
        e.preventDefault();
        switchTab('tab-youtube');
      }
    });
  }

  const ytSelector = document.getElementById('yt-channel-selector');
  if (ytSelector) {
    ytSelector.addEventListener('change', (e) => {
      const chId = e.target.value;
      if (chId) selectYouTubeChannel(chId);
    });
  }

  const btnSaveAlias = document.getElementById('btn-save-alias');
  const aliasInput = document.getElementById('yt-alias-input');
  if (btnSaveAlias && aliasInput) {
    btnSaveAlias.addEventListener('click', async () => {
      if (!currentYouTubeData?.activeChannelId) return;
      const alias = aliasInput.value.trim();
      btnSaveAlias.disabled = true;
      try {
        const res = await fetch('/api/youtube/channels/alias', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: currentYouTubeData.activeChannelId, alias })
        });
        if (res.ok) {
          showToast('Apelido do canal salvo com sucesso!', 'success');
          loadYouTubeChannelsView();
        } else {
          showToast('Erro ao salvar apelido.');
        }
      } catch (e) {
        showToast('Erro de conexão ao salvar apelido.');
      } finally {
        btnSaveAlias.disabled = false;
      }
    });
  }

  const btnYtRefresh = document.getElementById('btn-yt-refresh');
  if (btnYtRefresh) {
    btnYtRefresh.addEventListener('click', async () => {
      if (!currentYouTubeData?.activeChannelId) return;
      btnYtRefresh.disabled = true;
      showToast('Sincronizando estatísticas do YouTube...');
      try {
        const res = await fetch('/api/youtube/channels/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: currentYouTubeData.activeChannelId })
        });
        if (res.ok) {
          showToast('Métricas atualizadas com sucesso!', 'success');
          loadYouTubeChannelsView();
        } else {
          showToast('Erro ao sincronizar métricas.');
        }
      } catch (e) {
        showToast('Erro de comunicação.');
      } finally {
        btnYtRefresh.disabled = false;
      }
    });
  }

  const btnDisconnectActiveYt = document.getElementById('btn-disconnect-active-yt');
  if (btnDisconnectActiveYt) {
    btnDisconnectActiveYt.addEventListener('click', () => {
      if (!currentYouTubeData?.activeChannel) return;
      deleteYouTubeChannel(currentYouTubeData.activeChannel.id, currentYouTubeData.activeChannel.alias || currentYouTubeData.activeChannel.name);
    });
  }

  // Listener para desconectar canal do YouTube
  const btnSettingsDisconnect = document.getElementById('btn-settings-disconnect-youtube');
  if (btnSettingsDisconnect) {
    btnSettingsDisconnect.addEventListener('click', async () => {
      const confirmed = await showConfirmDialog({
        title: 'Desconectar YouTube',
        message: 'Deseja realmente desconectar o canal vinculado do YouTube?',
        confirmText: 'Desconectar',
        cancelText: 'Manter Conectado',
        type: 'warning'
      });
      if (!confirmed) return;
      try {
        const res = await fetch('/api/auth/youtube/disconnect', { method: 'POST' });
        if (res.ok) {
          showToast('Canal do YouTube desconectado com sucesso.');
          checkSystemStatus();
        }
      } catch (e) {
        showToast('Erro ao desconectar canal do YouTube.');
      }
    });
  }

  btnRefreshStatus.addEventListener('click', checkSystemStatus);
  if (btnOpenFolderRoot) btnOpenFolderRoot.addEventListener('click', () => openFolder(''));
  if (btnOpenActiveFolder) {
    btnOpenActiveFolder.addEventListener('click', () => {
      if (currentProject) openFolder(currentProject.name);
      else showToast('Nenhum projeto selecionado.');
    });
  }

  // Eventos de Busca
  formSearch.addEventListener('submit', handleSearch);
  btnDirectDownload.addEventListener('click', handleDirectDownload);

  // Chips de Tags Rápidas (Nicho 1-Click Search)
  const quickChips = document.querySelectorAll('.search-tag-chip');
  const searchInput = document.getElementById('search-query');
  quickChips.forEach(chip => {
    chip.addEventListener('click', () => {
      quickChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const tag = chip.getAttribute('data-tag');
      if (searchInput && tag) {
        searchInput.value = tag;
        handleSearch();
      }
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const val = searchInput.value.trim().toLowerCase();
      quickChips.forEach(c => {
        if (c.getAttribute('data-tag')?.toLowerCase() === val) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });
    });
  }

  // Eventos do Pipeline
  btnSaveTranscript.addEventListener('click', () => saveText('transcript'));
  btnSaveTranslation.addEventListener('click', () => saveText('translation'));

  btnRunVmake.addEventListener('click', handleRunVmake);
  btnRunTranscribe.addEventListener('click', handleRunTranscribe);
  btnRunTranslate.addEventListener('click', handleRunTranslate);
  btnRunCutVideo.addEventListener('click', handleRunCutVideo);
  btnRunTts.addEventListener('click', handleRunTts);
  const btnRunTrimSilence = document.getElementById('btn-run-trim-silence');
  if (btnRunTrimSilence) btnRunTrimSilence.addEventListener('click', handleRunTrimSilence);
  btnRunMerge.addEventListener('click', handleRunMerge);
  btnRunSquareSub.addEventListener('click', handleRunSquareSub);

  // Piloto Automático & Fila
  const btnDirectQueue = document.getElementById('btn-direct-queue');
  if (btnDirectQueue) {
    btnDirectQueue.addEventListener('click', handleDirectQueue);
  }

  // Entrada Direta na Própria Aba da Fila
  const btnQueueDirectAdd = document.getElementById('btn-queue-direct-add');
  if (btnQueueDirectAdd) {
    btnQueueDirectAdd.addEventListener('click', handleQueueDirectAdd);
  }

  const btnQueueDirectAutopilot = document.getElementById('btn-queue-direct-autopilot');
  if (btnQueueDirectAutopilot) {
    btnQueueDirectAutopilot.addEventListener('click', handleQueueDirectAutopilot);
  }

  if (queueDirectUrlInput) {
    queueDirectUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleQueueDirectAdd();
      }
    });
  }

  const btnCancelActiveJob = document.getElementById('btn-cancel-active-job');
  if (btnCancelActiveJob) {
    btnCancelActiveJob.addEventListener('click', cancelCurrentQueueJob);
  }

  const btnClearQueueHistory = document.getElementById('btn-clear-queue-history');
  if (btnClearQueueHistory) {
    btnClearQueueHistory.addEventListener('click', clearQueueHistory);
  }

  startQueuePolling();

  // Configurações & APIs
  const btnOpenSettings = document.getElementById('btn-open-settings');
  if (btnOpenSettings) btnOpenSettings.addEventListener('click', openSettingsModal);

  const btnCloseSettings = document.getElementById('btn-close-settings');
  if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettingsModal);

  const btnCancelSettings = document.getElementById('btn-cancel-settings');
  if (btnCancelSettings) btnCancelSettings.addEventListener('click', closeSettingsModal);

  const btnSaveSettings = document.getElementById('btn-save-settings');
  if (btnSaveSettings) btnSaveSettings.addEventListener('click', handleSaveSettings);

  const btnToggleOpenai = document.getElementById('btn-toggle-openai-key');
  if (btnToggleOpenai) btnToggleOpenai.addEventListener('click', () => togglePasswordVisibility('setting-openai-key'));

  const btnToggleMinimax = document.getElementById('btn-toggle-minimax-key');
  if (btnToggleMinimax) btnToggleMinimax.addEventListener('click', () => togglePasswordVisibility('setting-minimax-key'));

  // Renomear Projeto
  const btnRenameProject = document.getElementById('btn-rename-project');
  if (btnRenameProject) btnRenameProject.addEventListener('click', openRenameModal);

  const btnCloseRename = document.getElementById('btn-close-rename');
  if (btnCloseRename) btnCloseRename.addEventListener('click', closeRenameModal);

  const btnCancelRename = document.getElementById('btn-cancel-rename');
  if (btnCancelRename) btnCancelRename.addEventListener('click', closeRenameModal);

  const btnConfirmRename = document.getElementById('btn-confirm-rename');
  if (btnConfirmRename) btnConfirmRename.addEventListener('click', handleConfirmRename);

  // Refazer Projeto na Fila
  const btnCloseRerun = document.getElementById('btn-close-rerun-modal');
  if (btnCloseRerun) btnCloseRerun.addEventListener('click', closeRerunModal);

  const btnCancelRerun = document.getElementById('btn-cancel-rerun');
  if (btnCancelRerun) btnCancelRerun.addEventListener('click', closeRerunModal);

  const btnConfirmRerun = document.getElementById('btn-confirm-rerun');
  if (btnConfirmRerun) btnConfirmRerun.addEventListener('click', handleConfirmRerun);

  document.querySelectorAll('input[name="rerun-language"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.rerun-lang-pill').forEach(pill => pill.classList.remove('selected'));
      const activePill = radio.closest('.rerun-lang-pill');
      if (activePill) activePill.classList.add('selected');
    });
  });

  // Data de Postagem Agendada
  const btnSaveSched = document.getElementById('btn-save-scheduled-date');
  if (btnSaveSched) btnSaveSched.addEventListener('click', handleSaveScheduledDate);

  const btnClearSched = document.getElementById('btn-clear-scheduled-date');
  if (btnClearSched) btnClearSched.addEventListener('click', handleClearScheduledDate);

  // Deletar Projeto
  const btnDeleteProj = document.getElementById('btn-delete-project');
  if (btnDeleteProj) btnDeleteProj.addEventListener('click', handleDeleteCurrentProject);

  const btnDirectAutopilot = document.getElementById('btn-direct-autopilot');
  if (btnDirectAutopilot) {
    btnDirectAutopilot.addEventListener('click', () => {
      const url = directUrlInput.value.trim();
      if (!url) return showToast('Cole o link de um Short do YouTube, Reel do Instagram ou TikTok.');
      startAutoPilot(url);
      directUrlInput.value = '';
    });
  }

  const btnRunAutopilotCurrent = document.getElementById('btn-run-autopilot-current');
  if (btnRunAutopilotCurrent) {
    btnRunAutopilotCurrent.addEventListener('click', () => {
      if (!currentProject) return showToast('Selecione um projeto primeiro.');
      startAutoPilot(currentProject.name);
    });
  }

  const btnCloseAutopilot = document.getElementById('btn-close-autopilot');
  if (btnCloseAutopilot) {
    btnCloseAutopilot.addEventListener('click', () => {
      document.getElementById('autopilot-modal').classList.add('hidden');
    });
  }

  // Eventos do Kit de Publicação & Copys Virais
  const btnGenPostCopy = document.getElementById('btn-generate-post-copy');
  if (btnGenPostCopy) {
    btnGenPostCopy.addEventListener('click', handleGeneratePostCopy);
  }

  const btnCopyCaption = document.getElementById('btn-copy-caption');
  if (btnCopyCaption) {
    btnCopyCaption.addEventListener('click', () => {
      const caption = document.getElementById('post-caption-text').value;
      if (caption) copyToClipboard(caption, 'Legenda copiada com sucesso!');
    });
  }

  const btnCopyHashtags = document.getElementById('btn-copy-hashtags');
  if (btnCopyHashtags) {
    btnCopyHashtags.addEventListener('click', () => {
      const hashtags = document.getElementById('post-hashtags-text').value;
      if (hashtags) copyToClipboard(hashtags, 'Hashtags copiadas com sucesso!');
    });
  }

  // Eventos de Busca e Filtro da Galeria de Projetos
  const projSearchInput = document.getElementById('projects-search-input');
  if (projSearchInput) {
    projSearchInput.addEventListener('input', () => {
      filterAndDisplayProjects();
    });
  }

  const projFilterBtns = document.querySelectorAll('.filter-proj-btn');
  projFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      projFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentProjectFilter = btn.getAttribute('data-filter') || 'all';
      filterAndDisplayProjects();
    });
  });

  const btnProjOpenFolder = document.getElementById('btn-projects-open-folder');
  if (btnProjOpenFolder) {
    btnProjOpenFolder.addEventListener('click', () => openFolder(''));
  }

  // Eventos do YouTube Studio Multi-Canal
  const btnPostYt = document.getElementById('btn-post-youtube-short');
  if (btnPostYt) {
    btnPostYt.addEventListener('click', handlePostYouTubeShort);
  }

  const btnYtRefreshAll = document.getElementById('btn-yt-refresh-all');
  if (btnYtRefreshAll) {
    btnYtRefreshAll.addEventListener('click', refreshAllYouTubeMetrics);
  }

  // Toggle de Agendamento vs Envio Imediato
  const privacySelect = document.getElementById('post-yt-privacy-select');
  const scheduleRow = document.getElementById('post-yt-schedule-row');
  const btnPostText = document.getElementById('btn-post-youtube-text');

  if (privacySelect && scheduleRow) {
    privacySelect.addEventListener('change', () => {
      if (privacySelect.value === 'schedule') {
        scheduleRow.style.display = 'block';
        if (btnPostText) btnPostText.textContent = '📅 Agendar Short no YouTube';
        // Sugere default de 2 horas no futuro se vazio
        const dateInput = document.getElementById('post-yt-publish-at');
        if (dateInput && !dateInput.value) {
          const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
          future.setMinutes(0, 0, 0);
          const pad = n => String(n).padStart(2, '0');
          const localIso = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
          dateInput.value = localIso;
        }
      } else {
        scheduleRow.style.display = 'none';
        if (btnPostText) {
          btnPostText.textContent = privacySelect.value === 'public'
            ? '🚀 Publicar Short Agora'
            : (privacySelect.value === 'unlisted' ? '🔗 Enviar como Não Listado' : '🔒 Salvar como Privado');
        }
      }
    });
  }

  // Contador de caracteres do título de publicação
  // Eventos do Modal Adicionar a Fila com Selecao de Idiomas
  const btnCloseQueueAdd = document.getElementById('btn-close-queue-add-modal');
  if (btnCloseQueueAdd) btnCloseQueueAdd.addEventListener('click', closeAddToQueueModal);

  const btnCancelQueueAdd = document.getElementById('btn-cancel-queue-add');
  if (btnCancelQueueAdd) btnCancelQueueAdd.addEventListener('click', closeAddToQueueModal);

  const btnConfirmQueueAdd = document.getElementById('btn-confirm-queue-add');
  if (btnConfirmQueueAdd) btnConfirmQueueAdd.addEventListener('click', confirmAddToQueue);

  // Eventos do Modal Novo Idioma no Estudio
  const btnOpenStudioLang = document.getElementById('btn-add-studio-lang');
  if (btnOpenStudioLang) btnOpenStudioLang.addEventListener('click', openAddStudioLangModal);

  const btnCloseStudioLang = document.getElementById('btn-close-studio-add-lang');
  if (btnCloseStudioLang) btnCloseStudioLang.addEventListener('click', closeAddStudioLangModal);

  const btnConfirmStudioQueue = document.getElementById('btn-confirm-studio-lang-queue');
  if (btnConfirmStudioQueue) btnConfirmStudioQueue.addEventListener('click', handleConfirmStudioLangQueue);

  const btnConfirmStudioTab = document.getElementById('btn-confirm-studio-lang-tab');
  if (btnConfirmStudioTab) btnConfirmStudioTab.addEventListener('click', handleConfirmStudioLangTab);

  const titleInput = document.getElementById('post-yt-title-input');
  const titleCount = document.getElementById('post-yt-title-count');
  if (titleInput && titleCount) {
    titleInput.addEventListener('input', () => {
      titleCount.textContent = `${titleInput.value.length}/100`;
      if (titleInput.value.length >= 95) {
        titleCount.style.color = 'var(--color-code-rose)';
      } else {
        titleCount.style.color = 'var(--color-mist-text)';
      }
    });
  }
});

// --------------------------------------------------------------------------
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --------------------------------------------------------------------------
// GERENCIAMENTO DE ABAS / MENUS
// --------------------------------------------------------------------------
function setupTabs() {
  const allNavBtns = document.querySelectorAll('.nav-item-btn, .tab-btn');
  const allContents = document.querySelectorAll('.tab-content');

  allNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      if (!targetTab) return;

      allNavBtns.forEach(b => b.classList.remove('active'));
      allContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetEl = document.getElementById(targetTab);
      if (targetEl) targetEl.classList.add('active');

      // Se navegou para configurações, recarrega valores
      if (targetTab === 'tab-settings') {
        loadSettingsForm();
      }

      // Se navegou para projetos, renderiza galeria
      if (targetTab === 'tab-projects') {
        renderProjectsGallery();
      }

      // Se navegou para YouTube, carrega dados dos canais
      if (targetTab === 'tab-youtube') {
        loadYouTubeChannelsView();
      }

      syncUrlState();
    });
  });
}

// Mantém na URL a aba ativa, o projeto aberto, o vídeo e o idioma do estúdio.
// Assim, ao atualizar a página, o usuário volta exatamente ao mesmo lugar.
function syncUrlState() {
  try {
    const url = new URL(window.location.href);
    const activeEl = document.querySelector('.tab-content.active');
    if (activeEl && activeEl.id) url.searchParams.set('tab', activeEl.id);
    if (currentProject && currentProject.name) {
      const videoId = (currentProject.info && currentProject.info.id)
        ? currentProject.info.id
        : ('VID-' + currentProject.name.slice(0, 6).toUpperCase());
      url.searchParams.set('project', currentProject.name);
      url.searchParams.set('id', videoId);
      url.searchParams.set('lang', activeStudioTab || 'base');
    }
    window.history.replaceState(window.history.state, '', url.toString());
  } catch (_) {}
}

function switchTab(tabId) {
  const targetBtn = document.querySelector(`.nav-item-btn[data-tab="${tabId}"], .tab-btn[data-tab="${tabId}"]`);
  if (targetBtn) {
    targetBtn.click();
  } else {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const t = document.getElementById(tabId);
    if (t) t.classList.add('active');
  }
}

// --------------------------------------------------------------------------
// STATUS DO SISTEMA
// --------------------------------------------------------------------------
async function checkSystemStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    // MiniMax TTS / Voice Studio
    if (data.minimax && data.minimax.online) {
      badgeVoiceStudio.className = 'status-pill online';
      badgeVoiceStudio.querySelector('.status-text').textContent = 'MiniMax TTS: Ativo';
    } else if (data.voiceStudio && data.voiceStudio.online) {
      badgeVoiceStudio.className = 'status-pill online';
      badgeVoiceStudio.querySelector('.status-text').textContent = 'Voice Studio: Online (GPU)';
    } else {
      badgeVoiceStudio.className = 'status-pill offline';
      badgeVoiceStudio.querySelector('.status-text').textContent = 'TTS: Chave ausente';
    }

    // OpenAI
    if (data.openai && data.openai.configured) {
      badgeOpenAI.className = 'status-pill online';
      badgeOpenAI.querySelector('.status-text').textContent = 'OpenAI: Conectado';
    } else {
      badgeOpenAI.className = 'status-pill offline';
      badgeOpenAI.querySelector('.status-text').textContent = 'OpenAI: Chave ausente';
    }

    // YouTube Status
    const headerYtBtn = document.getElementById('header-youtube-btn');
    const headerYtText = document.getElementById('header-youtube-text');
    const settingsYtBadge = document.getElementById('settings-youtube-badge');
    const settingsYtInfo = document.getElementById('settings-youtube-info');
    const btnSettingsConnect = document.getElementById('btn-settings-connect-youtube');
    const btnSettingsDisconnect = document.getElementById('btn-settings-disconnect-youtube');

    if (data.youtube && data.youtube.connected) {
      const chName = data.youtube.channelName || 'Canais Conectados';
      if (headerYtBtn && headerYtText) {
        headerYtBtn.style.color = '#34d399';
        headerYtBtn.style.borderColor = 'rgba(52, 211, 153, 0.4)';
        headerYtBtn.style.background = 'rgba(52, 211, 153, 0.1)';
        headerYtBtn.href = '#tab-youtube';
        headerYtBtn.title = `Gerenciar canais do YouTube`;
        headerYtText.textContent = `YouTube: Ativo`;
      }
      if (settingsYtBadge) {
        settingsYtBadge.className = 'status-pill online';
        settingsYtBadge.querySelector('.status-text').textContent = 'Canal Conectado';
      }
      if (settingsYtInfo) {
        settingsYtInfo.innerHTML = `Conectado a: <strong style="color:var(--color-ultraviolet-key);">${escapeHtml(chName)}</strong> ${data.youtube.channelId ? `<span style="color:var(--color-mist-text);font-size:0.75rem;">(${data.youtube.channelId})</span>` : ''}`;
      }
      if (btnSettingsConnect) btnSettingsConnect.style.display = 'none';
      if (btnSettingsDisconnect) btnSettingsDisconnect.style.display = 'inline-flex';
    } else {
      if (headerYtBtn && headerYtText) {
        headerYtBtn.style.color = '#ff4d4d';
        headerYtBtn.style.borderColor = 'rgba(255, 77, 77, 0.25)';
        headerYtBtn.style.background = 'rgba(255, 77, 77, 0.1)';
        headerYtBtn.href = '/api/auth/youtube/login';
        headerYtBtn.title = 'Clique para autorizar e conectar seu canal do YouTube';
        headerYtText.textContent = 'Conectar YouTube';
      }
      if (settingsYtBadge) {
        settingsYtBadge.className = 'status-pill offline';
        settingsYtBadge.querySelector('.status-text').textContent = 'Desconectado';
      }
      if (settingsYtInfo) {
        settingsYtInfo.innerHTML = `<span>Nenhum canal conectado no momento.</span>`;
      }
      if (btnSettingsConnect) btnSettingsConnect.style.display = 'inline-flex';
      if (btnSettingsDisconnect) btnSettingsDisconnect.style.display = 'none';
    }
  } catch (err) {
    console.error('Falha ao checar status:', err);
  }
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month} às ${hours}:${mins}`;
  } catch (e) {
    return dateStr;
  }
}

// Helper para truncar texto com limite de caracteres
function truncateText(str, maxLen = 28) {
  if (!str) return '';
  const clean = String(str).trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).trim() + '...';
}

// --------------------------------------------------------------------------
// MODAL UNIVERSAL DE CONFIRMAÇÃO & CAIXAS DE DIÁLOGO LUMIX
// Substitui confirm() e alert() nativos do navegador por modais modernos
// --------------------------------------------------------------------------
window.showConfirmDialog = function({
  title = 'Confirmação',
  message = 'Tem certeza que deseja prosseguir?',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  type = 'warning' // 'danger' | 'warning' | 'info' | 'success'
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-dialog-modal');
    const titleEl = document.getElementById('dialog-title');
    const messageEl = document.getElementById('dialog-message');
    const iconWrapper = document.getElementById('dialog-icon-wrapper');
    const iconEl = document.getElementById('dialog-icon');
    const btnConfirm = document.getElementById('dialog-btn-confirm');
    const btnCancel = document.getElementById('dialog-btn-cancel');

    if (!modal) {
      resolve(confirm(message));
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;

    if (btnConfirm) {
      btnConfirm.textContent = confirmText;
      btnConfirm.className = type === 'danger' ? 'btn-danger' : 'btn-primary';
      btnConfirm.style.flex = '1';
      btnConfirm.style.justifyContent = 'center';
      btnConfirm.style.fontWeight = '700';
    }
    if (btnCancel) {
      btnCancel.textContent = cancelText;
      btnCancel.style.flex = '1';
      btnCancel.style.justifyContent = 'center';
    }

    if (iconWrapper && iconEl) {
      iconWrapper.className = `dialog-icon-wrapper ${type}`;
      if (type === 'danger') iconEl.textContent = '🗑️';
      else if (type === 'warning') iconEl.textContent = '⚠️';
      else if (type === 'info') iconEl.textContent = '🚀';
      else if (type === 'success') iconEl.textContent = '✅';
      else iconEl.textContent = '💬';
    }

    modal.classList.remove('hidden');

    function cleanup() {
      modal.classList.add('hidden');
      btnConfirm.removeEventListener('click', onConfirm);
      btnCancel.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdropClick);
      document.removeEventListener('keydown', onKeyDown);
    }

    function onConfirm(e) {
      if (e) e.preventDefault();
      cleanup();
      resolve(true);
    }

    function onCancel(e) {
      if (e) e.preventDefault();
      cleanup();
      resolve(false);
    }

    function onBackdropClick(e) {
      if (e.target === modal) {
        cleanup();
        resolve(false);
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        cleanup();
        resolve(false);
      } else if (e.key === 'Enter') {
        cleanup();
        resolve(true);
      }
    }

    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKeyDown);
  });
};

// Modal de Prompt e Cópia de Link Estilizado
window.showPromptDialog = function({
  title = 'Copiar Link',
  message = 'Copie o link abaixo:',
  value = ''
} = {}) {
  const modal = document.getElementById('custom-prompt-modal');
  const titleEl = document.getElementById('prompt-dialog-title');
  const msgEl = document.getElementById('prompt-dialog-message');
  const inputEl = document.getElementById('prompt-dialog-input');
  const btnClose = document.getElementById('prompt-btn-close');
  const btnCopy = document.getElementById('prompt-btn-copy');

  if (!modal) {
    prompt(message, value);
    return;
  }

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (inputEl) {
    inputEl.value = value;
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 50);
  }

  modal.classList.remove('hidden');

  function cleanup() {
    modal.classList.add('hidden');
    btnClose?.removeEventListener('click', onClose);
    btnCopy?.removeEventListener('click', onCopy);
    modal.removeEventListener('click', onBackdropClick);
  }

  function onClose() {
    cleanup();
  }

  function onCopy() {
    if (inputEl) {
      navigator.clipboard.writeText(inputEl.value).then(() => {
        showToast('📋 Copiado com sucesso!');
        cleanup();
      }).catch(() => {
        inputEl.select();
      });
    }
  }

  function onBackdropClick(e) {
    if (e.target === modal) cleanup();
  }

  btnClose?.addEventListener('click', onClose);
  btnCopy?.addEventListener('click', onCopy);
  modal.addEventListener('click', onBackdropClick);
};

// --------------------------------------------------------------------------
// CUSTOM STATUS DROPDOWN HANDLERS (TABELA E ESTÚDIO)
// --------------------------------------------------------------------------
window.toggleStatusDropdown = function(projectName, triggerBtn, event) {
  if (event) event.stopPropagation();
  const parent = triggerBtn.closest('.custom-status-dropdown');
  const menu = parent ? parent.querySelector('.status-dropdown-menu') : document.getElementById(`status-menu-${projectName}`);
  const isOpen = menu && !menu.classList.contains('hidden');

  // Fecha todos os dropdowns abertos
  document.querySelectorAll('.status-dropdown-menu').forEach(m => m.classList.add('hidden'));
  document.querySelectorAll('.custom-status-dropdown').forEach(d => d.classList.remove('open'));

  if (!isOpen && menu) {
    menu.classList.remove('hidden');
    if (parent) parent.classList.add('open');
  }
};

// Marca/desmarca um idioma como postado (clique no selo da coluna Idiomas)
window.toggleLanguagePosted = async function(projectName, lang) {
  try {
    const res = await fetch('/api/projects/toggle-language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: projectName, lang })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Falha ao atualizar o idioma');
    const idx = allLoadedProjects.findIndex(item => item.name === projectName);
    if (idx !== -1) allLoadedProjects[idx] = data.project;
    const nowPosted = (data.project.postedLanguages || []).includes(lang);
    showToast(nowPosted ? `✅ ${lang.toUpperCase()} marcado como postado` : `↩️ ${lang.toUpperCase()} desmarcado`);
    filterAndDisplayProjects();
    if (currentProject && currentProject.name === projectName) {
      selectProject(projectName);
    }
  } catch (err) {
    showToast(`⚠️ ${err.message}`);
  }
};

window.selectProjectStatusOption = async function(projectName, newStatus) {
  document.querySelectorAll('.status-dropdown-menu').forEach(m => m.classList.add('hidden'));
  document.querySelectorAll('.custom-status-dropdown').forEach(d => d.classList.remove('open'));
  if (newStatus === 'posted') {
    showToast('Postado é automático: clique no idioma (PT, ESP, ENG) na coluna Idiomas para marcar.');
    return;
  }
  await window.changeProjectStatus(projectName, newStatus);
};

// Fecha dropdowns ao clicar fora
document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-status-dropdown')) {
    document.querySelectorAll('.status-dropdown-menu').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.custom-status-dropdown').forEach(d => d.classList.remove('open'));
  }
});

// Fechar modais ao clicar no backdrop (fora do card)
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop') || e.target.classList.contains('modal-overlay')) {
    if (e.target.id === 'custom-dialog-modal' || e.target.id === 'custom-prompt-modal') return;
    if (e.target.id === 'modal-add-to-queue' && typeof closeAddToQueueModal === 'function') {
      closeAddToQueueModal();
      return;
    }
    if (e.target.id === 'rerun-queue-modal' && typeof closeRerunModal === 'function') {
      closeRerunModal();
      return;
    }
    e.target.classList.add('hidden');
  }
});

// Tecla Escape para fechar modais e dropdowns
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const openModals = document.querySelectorAll('.modal-backdrop:not(.hidden), .modal-overlay:not(.hidden)');
    openModals.forEach(m => {
      if (m.id !== 'custom-dialog-modal' && m.id !== 'custom-prompt-modal') m.classList.add('hidden');
    });
    document.querySelectorAll('.status-dropdown-menu').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.custom-status-dropdown').forEach(d => d.classList.remove('open'));
  }
});

// --------------------------------------------------------------------------
// PROJETOS / VÍDEOS NA PASTA
// --------------------------------------------------------------------------
async function loadProjects(selectProjectName = null) {
  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    const projects = data.projects || [];
    allLoadedProjects = projects;

    if (projectsCount) projectsCount.textContent = projects.length;
    const totalBadge = document.getElementById('projects-total-badge');
    if (totalBadge) totalBadge.textContent = `${projects.length} Projetos`;

    if (projectsList) {
      projectsList.innerHTML = '';

      if (projects.length === 0) {
        currentProject = null;
        pipelineProjectTitle.textContent = 'Nenhum projeto selecionado';
        pipelineProjectPath.textContent = '';
        projectsList.innerHTML = `<div style="padding:1rem;font-size:0.8rem;color:var(--text-muted);text-align:center;">Nenhum vídeo baixado ainda.<br>Faça uma pesquisa para começar!</div>`;
        return;
      }
    }

    // Se a aba Projetos estiver visível, atualiza a galeria
    const tabProj = document.getElementById('tab-projects');
    if (tabProj && tabProj.classList.contains('active')) {
      filterAndDisplayProjects();
    }

    if (projectsList) {
      projects.forEach(p => {
        const div = document.createElement('div');
        div.className = `project-item ${currentProject && currentProject.name === p.name ? 'active' : ''}`;
        div.onclick = () => selectProject(p.name);

        const rawTitle = p.info && p.info.title ? p.info.title : p.name.replace(/_/g, ' ');
        const truncatedTitle = truncateText(rawTitle, 28);
        const videoId = (p.info && p.info.id) ? p.info.id : ('VID-' + p.name.slice(0, 6).toUpperCase());
        const sDate = p.scheduledDate || (p.info && p.info.scheduledDate);

        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; width:100%;">
            <div class="project-title" title="${rawTitle}" style="flex:1;">
              <span style="font-family:var(--font-mono); font-size:0.7rem; color:var(--color-ultraviolet-key); background:rgba(184,140,255,0.12); padding:1px 5px; border-radius:4px; margin-right:4px; font-weight:700;">#${videoId}</span>
              ${truncatedTitle}
            </div>
            <button class="btn-delete-small" onclick="event.stopPropagation(); deleteProject('${p.name}')" title="Excluir projeto e arquivos do disco" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:0.85rem; padding:2px 4px; border-radius:4px; opacity:0.6; transition:opacity 0.2s;" onmouseover="this.style.opacity='1'; this.style.color='#ef4444';" onmouseout="this.style.opacity='0.6'; this.style.color='var(--text-muted)';">🗑️</button>
          </div>
          <div class="project-meta-row" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.35rem; margin-top:0.35rem;">
            <span class="project-tag ${p.hasVertical9x16 || p.hasSquareSubtitled ? 'ready' : ''}">
              ${p.hasVertical9x16 || p.hasSquareSubtitled ? '✅ 9:16 Pronto' : (p.hasFinal ? '🎬 Montado' : (p.hasCleaned ? '🧼 Limpo' : '📥 Baixado'))}
            </span>
            ${sDate ? `<span style="font-size:0.68rem; color:#60a5fa; background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.3); padding:1px 6px; border-radius:4px; font-weight:700;" title="Data de postagem agendada">📅 ${formatDisplayDate(sDate)}</span>` : ''}
          </div>
        `;

        projectsList.appendChild(div);
      });
    }

    if (selectProjectName) {
      selectProject(selectProjectName);
    } else {
      // Verifica se há parâmetros na URL (?project=... ou ?id=...) para carregar direto
      const urlParams = new URLSearchParams(window.location.search);
      const urlProject = urlParams.get('project');
      const urlId = urlParams.get('id');

      if (urlProject) {
        selectProject(urlProject);
      } else if (urlId) {
        const found = projects.find(p => (p.info && p.info.id === urlId) || p.id === urlId);
        if (found) selectProject(found.name);
        else if (!currentProject && projects.length > 0) selectProject(projects[0].name);
      } else if (!currentProject && projects.length > 0) {
        selectProject(projects[0].name);
      }
    }
  } catch (err) {
    console.error('Erro ao carregar projetos:', err);
  }
}

async function selectProject(name) {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error('Não foi possível carregar o projeto');
    const project = await res.json();
    currentProject = project;

    // Atualiza estilo na sidebar
    document.querySelectorAll('.project-item').forEach(el => {
      const titleEl = el.querySelector('.project-title');
      if (titleEl && titleEl.title === (project.info.title || project.name.replace(/_/g, ' '))) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Atualiza painel da esteira
    const rawTitle = project.info && project.info.title ? project.info.title : project.name.replace(/_/g, ' ');
    const displayName = truncateText(rawTitle, 28);
    const videoId = (project.info && project.info.id) ? project.info.id : ('VID-' + project.name.slice(0, 6).toUpperCase());
    
    if (pipelineProjectTitle) {
      pipelineProjectTitle.textContent = displayName;
      pipelineProjectTitle.title = rawTitle; // Tooltip com título integral
    }
    if (pipelineProjectPath) pipelineProjectPath.textContent = project.path || '';

    // Atualiza Badge com ID clicável
    const badgeId = document.getElementById('project-id-badge');
    if (badgeId) {
      badgeId.style.display = 'inline-flex';
      badgeId.textContent = `#${videoId}`;
      badgeId.setAttribute('data-id', videoId);
    }

    // Sincroniza tab, projeto, vídeo e idioma na URL sem recarregar
    syncUrlState();

    // Atualiza data de postagem agendada
    const inputScheduledDate = document.getElementById('input-scheduled-date');
    const badgeScheduledDate = document.getElementById('project-scheduled-badge');
    const sDate = project.scheduledDate || (project.info && project.info.scheduledDate) || '';

    if (inputScheduledDate) {
      inputScheduledDate.value = sDate;
    }
    if (badgeScheduledDate) {
      if (sDate) {
        badgeScheduledDate.style.display = 'inline-block';
        badgeScheduledDate.textContent = `📅 Post agendado: ${formatDisplayDate(sDate)}`;
      } else {
        badgeScheduledDate.style.display = 'none';
      }
    }

    // Atualiza Seletor de Status no Studio
    const studioStatusBox = document.getElementById('studio-status-box');
    const selectStudioStatus = document.getElementById('select-studio-status');
    const studioStatusDot = document.getElementById('studio-status-dot');
    if (studioStatusBox && selectStudioStatus) {
      studioStatusBox.style.display = 'inline-flex';
      // "Postado" é automático: vale quando algum idioma está marcado na coluna Idiomas
      const postedLangs = project.postedLanguages || [];
      let curStatus;
      if (postedLangs.length > 0) curStatus = 'posted';
      else if (project.status === 'ready' || (project.info && project.info.status === 'ready')) curStatus = 'ready';
      else curStatus = 'in_progress';

      selectStudioStatus.value = curStatus;
      if (studioStatusDot) {
        studioStatusDot.className = `status-dot-indicator ${curStatus}`;
      }
      if (!selectStudioStatus.dataset.bound) {
        selectStudioStatus.dataset.bound = 'true';
        selectStudioStatus.addEventListener('change', () => {
          if (!currentProject) return;
          changeProjectStatus(currentProject.name, selectStudioStatus.value);
        });
      }
    }

    // Atualiza Players
    updateMediaElement(playerOriginal, project.urls.original, statusOriginal, 'Vídeo bruto pronto');
    updateMediaElement(playerCleaned, project.urls.cleaned, statusCleaned, 'Vídeo limpo pronto (VMake)');
    updateMediaElement(playerCut, project.urls.cut, statusCut, 'Vídeo com cortes rítmicos pronto');
    updateMediaElement(playerAudio, project.urls.audio, statusAudio, 'Áudio pronto (narracao.mp3)');
    updateMediaElement(playerFinal, project.urls.final, statusFinal, 'Vídeo final com nova locução pronto');
    const finalVerticalUrl = project.urls.vertical9x16 || project.urls.squareSubtitled;
    updateMediaElement(playerSquareSub, finalVerticalUrl, statusSquareSub, 'Vídeo 9:16 Vertical pronto (Tela Cheia Nativa + Legendas)');

    // Atualiza Textos
    textTranscript.value = project.transcript || '';
    textTranslation.value = project.translation || '';
    saveStatusTranscript.textContent = '';
    saveStatusTranslation.textContent = '';

    // Limpa campos de postagem anteriores para sincronizar estritamente com a aba do idioma
    const postTitleInput = document.getElementById('post-yt-title-input');
    const postDescInput = document.getElementById('post-yt-desc-input');
    const postTagsInput = document.getElementById('post-yt-tags-input');
    const postLinkContainer = document.getElementById('post-yt-published-link');
    const postStatusBadge = document.getElementById('post-yt-status-badge');

    if (postTitleInput) { postTitleInput.value = ''; const c = document.getElementById('post-yt-title-count'); if (c) c.textContent = '0/100'; }
    if (postDescInput) postDescInput.value = '';
    if (postTagsInput) postTagsInput.value = '';
    if (postLinkContainer) postLinkContainer.innerHTML = '';

    // Se o projeto já foi postado anteriormente no YouTube, mostra o link direto
    if (project.info && project.info.youtube && project.info.youtube.url) {
      if (postStatusBadge) {
        postStatusBadge.textContent = 'Postado no YouTube';
        postStatusBadge.style.color = 'var(--color-emerald-ok)';
      }
      if (postLinkContainer) {
        postLinkContainer.innerHTML = `<a href="${project.info.youtube.url}" target="_blank" rel="noopener" style="color:var(--color-emerald-ok); text-decoration:underline;">Short publicado: ${project.info.youtube.url} ↗</a>`;
      }
    } else if (postStatusBadge) {
      postStatusBadge.textContent = 'Pronto para postar';
      postStatusBadge.style.color = 'var(--color-fog-text)';
    }

    // Atualiza Stepper e Abas de Idioma (o renderStudioLangTabs sincroniza o postCopy do idioma ativo automaticamente)
    updateStepperBadges(project);
    renderStudioLangTabs(project);

  } catch (err) {
    showToast(`Erro: ${err.message}`);
  }
}

function updateMediaElement(mediaEl, url, statusEl, successText) {
  if (url) {
    const separator = url.includes('?') ? '&' : '?';
    const freshUrl = `${url}${separator}t=${Date.now()}`;
    mediaEl.src = freshUrl;
    mediaEl.load();
    mediaEl.classList.remove('hidden');
    statusEl.textContent = `✅ ${successText}`;
    statusEl.style.color = 'var(--accent-success)';
  } else {
    mediaEl.removeAttribute('src');
    mediaEl.load();
    statusEl.textContent = '⏳ Pendente / Não gerado';
    statusEl.style.color = 'var(--text-muted)';
  }
}

function updateStepperBadges(p) {
  toggleStepBadge('step-badge-1', p.hasOriginal);
  toggleStepBadge('step-badge-2', p.hasCleaned);
  toggleStepBadge('step-badge-3', p.hasTranscript);
  toggleStepBadge('step-badge-4', p.hasTranslation);
  toggleStepBadge('step-badge-5', p.hasAudio);
  toggleStepBadge('step-badge-6', p.hasFinal);
}

function toggleStepBadge(id, isDone) {
  const el = document.getElementById(id);
  if (el) {
    if (isDone) el.classList.add('done');
    else el.classList.remove('done');
  }
}

// --------------------------------------------------------------------------
// PESQUISA DE SHORTS
// --------------------------------------------------------------------------
async function handleSearch(e) {
  if (e && e.preventDefault) e.preventDefault();
  const query = document.getElementById('search-query').value.trim();
  const dateRange = document.getElementById('search-date').value;
  const minViews = document.getElementById('search-views').value;
  const limit = document.getElementById('search-limit').value;
  const filterExisting = document.getElementById('search-filter-existing')?.value || 'hide';
  const minDuration = parseInt(document.getElementById('search-duration-min')?.value, 10) || 0;
  const maxDuration = parseInt(document.getElementById('search-duration-max')?.value, 10) || 0;

  if (!query) return;

  searchLoading.classList.remove('hidden');
  searchResultsArea.classList.add('hidden');
  resultsGrid.innerHTML = '';

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, dateRange, minViews, limit, minDuration, maxDuration, filterExisting })
    });

    const data = await res.json();
    searchLoading.classList.add('hidden');
    searchResultsArea.classList.remove('hidden');

    const results = data.results || [];
    const minViewsNum = Number(minViews);
    const filterDesc = minViewsNum > 0 ? ` (+${minViewsNum.toLocaleString('pt-BR')} views)` : '';
    const existingDesc = filterExisting === 'hide' ? ' • 🚫 Apenas Inéditos' : (filterExisting === 'only' ? ' • 📂 Apenas Já Feitos' : '');
    resultsCountTitle.textContent = `${results.length} Shorts Encontrados${filterDesc}${existingDesc}`;

    if (results.length === 0) {
      resultsGrid.innerHTML = `<div style="grid-column:1/-1;padding:2rem;text-align:center;color:var(--text-muted);">Nenhum vídeo encontrado com esses critérios. Tente flexibilizar os filtros de visualizações ou alterar o termo de pesquisa.</div>`;
      return;
    }

    currentSearchResults = results;

    results.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'video-card' + (item.alreadyExists ? ' card-already-produced' : '');
      const formattedViews = item.viewsRaw ? item.viewsRaw : `${Number(item.views || 0).toLocaleString('pt-BR')} views`;
      const durSec = item.duration || 45;
      const formattedDuration = durSec >= 60 
        ? `${Math.floor(durSec / 60)}:${(durSec % 60).toString().padStart(2, '0')}`
        : `${durSec}s`;

      card.innerHTML = `
        <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="thumb-wrapper" title="Assistir no YouTube">
          <img src="${item.thumbnail}" alt="" loading="lazy">
          <span class="duration-pill">⏱️ ${formattedDuration}</span>
          ${item.alreadyExists ? `<span class="already-done-badge">✅ Já no Estúdio</span>` : ''}
          <div class="thumb-play-overlay">
            <svg viewBox="0 0 24 24" width="44" height="44" fill="#ffffff">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </a>
        <div class="video-card-body">
          <h4 class="video-card-title">
            <a href="${item.url}" target="_blank" rel="noopener noreferrer" style="color:inherit; text-decoration:none;"></a>
          </h4>
          <div class="video-card-meta">
            <span class="views-tag" style="background:rgba(249,38,114,0.12); color:var(--color-code-rose); font-weight:600; font-family:var(--font-mono); border:1px solid rgba(249,38,114,0.25);">🔥 ${formattedViews}</span>
            ${item.alreadyExists 
              ? `<span style="font-size:0.72rem; color:var(--color-emerald-ok); font-family:var(--font-mono); background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); padding:2px 6px; border-radius:4px;">✅ Já Produzido</span>` 
              : `<span style="font-size:0.72rem; color:var(--color-ash-text); font-family:var(--font-mono);">⚡ Inédito</span>`}
          </div>
          <div style="font-size:0.75rem; color:var(--color-fog-text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:0.25rem;">
            👤 ${escapeHtml(item.channel || 'YouTube Shorts')}
          </div>
          <div class="video-card-btn" style="display:flex; flex-direction:column; gap:0.45rem; margin-top:0.85rem;">
            ${item.alreadyExists && item.existingFolder ? `
              <button class="btn-secondary full-width btn-sm" style="color:var(--color-emerald-ok); border-color:rgba(16,185,129,0.45); font-weight:600;" onclick="openProjectInStudioFromSearch(${index})">
                📂 Abrir no Estúdio
              </button>
            ` : ''}
            <button id="btn-queue-search-${index}" class="btn-primary full-width btn-sm" onclick="openAddToQueueFromSearch(${index})">
              ➕ Adicionar à Fila
            </button>
            <button class="btn-secondary full-width btn-sm" style="color:var(--color-ultraviolet-key); border-color:rgba(184,140,255,0.35);" onclick="startAutoPilotFromSearch(${index})">
              ⚡ Produzir Agora (1-Click)
            </button>
            <button class="btn-secondary full-width btn-sm" onclick="downloadFromSearch(${index})">
              ⬇️ Apenas Baixar
            </button>
          </div>
        </div>
      `;

      // Define título com textContent para imunidade contra quebras por aspas/apóstrofos
      const titleLink = card.querySelector('.video-card-title a');
      if (titleLink) {
        titleLink.textContent = item.title;
        titleLink.parentElement.title = item.title;
      }
      const thumbWrap = card.querySelector('.thumb-wrapper');
      if (thumbWrap) {
        thumbWrap.title = `Assistir no YouTube: ${item.title}`;
      }

      resultsGrid.appendChild(card);
    });

  } catch (err) {
    searchLoading.classList.add('hidden');
    showToast(`Erro na pesquisa: ${err.message}`);
  }
}

// Funções acionadas por índice a partir da grade de pesquisa (100% à prova de quebra de caracteres)
window.openAddToQueueFromSearch = function(index) {
  const item = currentSearchResults[index];
  if (!item) return;
  openAddToQueueModal(item.url, item.title, item.thumbnail, index);
};

window.startAutoPilotFromSearch = function(index) {
  const item = currentSearchResults[index];
  if (!item) return;
  startAutoPilot(item.url);
};

window.downloadFromSearch = function(index) {
  const item = currentSearchResults[index];
  if (!item) return;
  downloadSelected(item.url, item.title);
};

window.openProjectInStudioFromSearch = function(index) {
  const item = currentSearchResults[index];
  if (!item || !item.existingFolder) return;
  openProjectInStudio(item.existingFolder);
};

async function downloadSelected(targetUrl, targetTitle) {
  let url = targetUrl || '';
  try { if (url.includes('%')) url = decodeURIComponent(url); } catch (_) {}

  let title = targetTitle || 'Short Viral';
  try { if (title.includes('%')) title = decodeURIComponent(title); } catch (_) {}

  showToast(`Iniciando download de "${title.slice(0, 30)}..."`);
  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha no download');

    showToast('Download concluído com sucesso!');
    await loadProjects(data.project.name);
    switchTab('tab-pipeline');
  } catch (err) {
    showToast(`Erro no download: ${err.message}`);
  }
}

async function handleDirectDownload() {
  const url = directUrlInput.value.trim();
  if (!url) return showToast('Cole a URL de um Short do YouTube.');
  await downloadSelected(encodeURIComponent(url), encodeURIComponent('Short_' + Date.now()));
  directUrlInput.value = '';
}

// --------------------------------------------------------------------------
// SALVAR TEXTOS EDITADOS
// --------------------------------------------------------------------------
async function saveText(type) {
  if (!currentProject) return showToast('Selecione um projeto.');
  const text = type === 'transcript' ? textTranscript.value : textTranslation.value;
  const statusEl = type === 'transcript' ? saveStatusTranscript : saveStatusTranslation;

  try {
    const res = await fetch('/api/save-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: currentProject.name, type, text })
    });

    if (res.ok) {
      statusEl.textContent = 'Salvo com sucesso!';
      setTimeout(() => { statusEl.textContent = ''; }, 2500);
      loadProjects(currentProject.name);
    }
  } catch (e) {
    showToast('Erro ao salvar texto');
  }
}

// --------------------------------------------------------------------------
// EXECUÇÃO DO VMAKE (API OFICIAL)
// --------------------------------------------------------------------------
async function handleRunVmake() {
  if (!currentProject) return showToast('Selecione um projeto primeiro.');

  btnRunVmake.disabled = true;
  btnRunVmake.textContent = '⏳ Executando VMake API...';
  vmakeLogContainer.classList.remove('hidden');
  vmakeLogOutput.textContent = 'Enviando vídeo para a API do VMake...\n';
  vmakeJobStatus.textContent = 'Processando...';

  try {
    const res = await fetch('/api/vmake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: currentProject.name })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao iniciar VMake');

    const jobId = data.jobId;

    // Polling de logs a cada 2 segundos
    if (activePollingInterval) clearInterval(activePollingInterval);
    activePollingInterval = setInterval(async () => {
      try {
        const jobRes = await fetch(`/api/jobs/${jobId}`);
        const jobData = await jobRes.json();

        if (jobData.logs) {
          vmakeLogOutput.textContent = jobData.logs.join('');
          vmakeLogOutput.scrollTop = vmakeLogOutput.scrollHeight;
        }

        if (jobData.status === 'completed') {
          clearInterval(activePollingInterval);
          btnRunVmake.disabled = false;
          btnRunVmake.textContent = '🧼 Executar Remoção VMake';
          vmakeJobStatus.textContent = 'Concluído com Sucesso!';
          vmakeJobStatus.style.color = 'var(--accent-success)';
          showToast('Vídeo sem marca d\'água baixado com sucesso!');
          loadProjects(currentProject.name);
        } else if (jobData.status === 'failed') {
          clearInterval(activePollingInterval);
          btnRunVmake.disabled = false;
          btnRunVmake.textContent = '🧼 Executar Remoção VMake';
          vmakeJobStatus.textContent = 'Falhou';
          vmakeJobStatus.style.color = 'var(--accent-danger)';
          showToast('A automação do VMake falhou. Veja o log.');
        }
      } catch (err) {}
    }, 2000);

  } catch (err) {
    btnRunVmake.disabled = false;
    btnRunVmake.textContent = '🧼 Executar Remoção VMake';
    showToast(`Erro: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// EXECUÇÃO DA TRANSCRIÇÃO (VOICE STUDIO)
// --------------------------------------------------------------------------
async function handleRunTranscribe() {
  if (!currentProject) return showToast('Selecione um projeto.');

  btnRunTranscribe.disabled = true;
  btnRunTranscribe.textContent = '⏳ Transcrevendo (GPU)...';

  try {
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: currentProject.name })
    });

    const data = await res.json();
    btnRunTranscribe.disabled = false;
    btnRunTranscribe.textContent = '🎙️ Transcrever Áudio';

    if (!res.ok) throw new Error(data.detail || data.error || 'Falha na transcrição');

    textTranscript.value = data.transcript || '';
    const provMsg = data.provider ? ` (${data.provider})` : '';
    showToast(`Áudio transcrito com sucesso!${provMsg}`);
    loadProjects(currentProject.name);
  } catch (err) {
    btnRunTranscribe.disabled = false;
    btnRunTranscribe.textContent = '🎙️ Transcrever Áudio';
    showToast(`Erro: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// EXECUÇÃO DA TRADUÇÃO (CHATGPT)
// --------------------------------------------------------------------------
async function handleRunTranslate() {
  if (!currentProject) return showToast('Selecione um projeto.');

  const transcript = textTranscript.value.trim();
  if (!transcript) return showToast('Transcreva o vídeo primeiro ou digite um texto.');

  btnRunTranslate.disabled = true;
  btnRunTranslate.textContent = '⏳ Traduzindo com ChatGPT...';

  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: currentProject.name, transcript, lang: (activeStudioTab !== 'base' ? activeStudioTab : 'pt') })
    });

    const data = await res.json();
    btnRunTranslate.disabled = false;
    btnRunTranslate.textContent = '🌐 Traduzir com ChatGPT';

    if (!res.ok) throw new Error(data.detail || data.error || 'Falha na tradução');

    textTranslation.value = data.translation || '';
    showToast('Tradução gerada com sucesso! Você pode editá-la antes da narração.');
    loadProjects(currentProject.name);
  } catch (err) {
    btnRunTranslate.disabled = false;
    btnRunTranslate.textContent = '🌐 Traduzir com ChatGPT';
    showToast(`Erro: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// EXECUÇÃO DOS CORTES RÍTMICOS NO VÍDEO (0.5s a cada 3s)
// --------------------------------------------------------------------------
async function handleRunCutVideo() {
  if (!currentProject) return showToast('Selecione um projeto.');

  btnRunCutVideo.disabled = true;
  btnRunCutVideo.textContent = '⏳ Cortando vídeo (0.5s/3s)...';

  try {
    const res = await fetch('/api/cut-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: currentProject.name, keepSec: 3.0, cutSec: 0.5 })
    });

    const data = await res.json();
    btnRunCutVideo.disabled = false;
    btnRunCutVideo.textContent = '✂️ Aplicar Cortes no Vídeo';

    if (!res.ok) throw new Error(data.detail || data.error || 'Falha ao cortar vídeo');

    showToast(`Cortes rítmicos aplicados com sucesso! (${data.cutsCount} cortes gerados)`);
    loadProjects(currentProject.name);
  } catch (err) {
    btnRunCutVideo.disabled = false;
    btnRunCutVideo.textContent = '✂️ Aplicar Cortes no Vídeo';
    showToast(`Erro: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// EXECUÇÃO DA SÍNTESE DE VOZ (VOICE STUDIO)
// --------------------------------------------------------------------------
async function handleRunTts() {
  if (!currentProject) return showToast('Selecione um projeto.');

  const text = textTranslation.value.trim();
  if (!text) return showToast('Insira ou traduza um texto antes de gerar o áudio.');

  const voice = document.getElementById('select-voice').value;
  const speed = document.getElementById('voice-speed').value;
  const autoTrimCheck = document.getElementById('check-auto-trim-silence');
  const trimSilence = autoTrimCheck ? autoTrimCheck.checked : true;
  const trimMode = document.getElementById('select-trim-mode')?.value || '350_200';
  const [minSilence, keepSilence] = trimMode.split('_').map(Number);

  btnRunTts.disabled = true;
  btnRunTts.textContent = '⏳ Sintetizando Voz com IA...';

  try {
    const res = await fetch('/api/generate-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: currentProject.name, text, voice, speed, trimSilence, minSilence, keepSilence, lang: (activeStudioTab !== 'base' ? activeStudioTab : 'pt') })
    });

    const data = await res.json();
    btnRunTts.disabled = false;
    btnRunTts.textContent = '🔊 Gerar Narração';

    if (!res.ok) throw new Error(data.detail || data.error || 'Falha ao gerar voz');

    showToast('Áudio narrado e dinamizado com sucesso!');
    loadProjects(currentProject.name);
  } catch (err) {
    btnRunTts.disabled = false;
    btnRunTts.textContent = '🔊 Gerar Narração';
    showToast(`Erro: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// CORTE MANUAL DE SILÊNCIOS DO ÁUDIO
// --------------------------------------------------------------------------
async function handleRunTrimSilence() {
  if (!currentProject) return showToast('Selecione um projeto.');

  const btnTrim = document.getElementById('btn-run-trim-silence');
  const trimMode = document.getElementById('select-trim-mode')?.value || '350_200';
  const [minSilence, keepSilence] = trimMode.split('_').map(Number);

  btnTrim.disabled = true;
  btnTrim.textContent = '⏳ Cortando Silêncios...';

  try {
    const res = await fetch('/api/trim-silence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: currentProject.name, minSilence, keepSilence, lang: (activeStudioTab !== 'base' ? activeStudioTab : 'pt') })
    });

    const data = await res.json();
    btnTrim.disabled = false;
    btnTrim.textContent = '✂️ Cortar Silêncios Agora';

    if (!res.ok) throw new Error(data.detail || data.error || 'Falha ao cortar silêncios');

    showToast('Silêncios mortos removidos com sucesso da narração!');
    loadProjects(currentProject.name);
  } catch (err) {
    btnTrim.disabled = false;
    btnTrim.textContent = '✂️ Cortar Silêncios Agora';
    showToast(`Erro: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// MESCLAGEM FINAL (FFMPEG)
// --------------------------------------------------------------------------
async function handleRunMerge() {
  if (!currentProject) return showToast('Selecione um projeto.');

  btnRunMerge.disabled = true;
  btnRunMerge.textContent = '⏳ Mesclando com FFmpeg...';

  try {
    const res = await fetch('/api/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: currentProject.name, lang: (activeStudioTab !== 'base' ? activeStudioTab : 'pt') })
    });

    const data = await res.json();
    btnRunMerge.disabled = false;
    btnRunMerge.textContent = '🎬 Mesclar Vídeo + Novo Áudio';

    if (!res.ok) throw new Error(data.error || 'Falha na mesclagem');

    showToast('Vídeo final gerado com sucesso!');
    loadProjects(currentProject.name);
  } catch (err) {
    btnRunMerge.disabled = false;
    btnRunMerge.textContent = '🎬 Mesclar Vídeo + Novo Áudio';
    showToast(`Erro: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// EXECUÇÃO DO VÍDEO 1:1 COM FUNDO DESFOCADO E LEGENDA DINÂMICA
// --------------------------------------------------------------------------
async function handleRunSquareSub() {
  if (!currentProject) return showToast('Selecione um projeto.');

  btnRunSquareSub.disabled = true;
  btnRunSquareSub.textContent = '⏳ Renderizando 9:16 Full HD...';

  const chkHflip = document.getElementById('chk-hflip');
  const hflip = chkHflip ? chkHflip.checked : true;

  try {
    const res = await fetch('/api/generate-square-subtitles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: currentProject.name,
        lang: (activeStudioTab !== 'base' ? activeStudioTab : 'pt'),
        hflip
      })
    });

    const data = await res.json();
    btnRunSquareSub.disabled = false;
    btnRunSquareSub.textContent = 'Renderizar 9:16 Full HD';

    if (!res.ok) throw new Error(data.detail || data.error || 'Falha ao gerar versão 9:16');

    showToast('Vídeo 9:16 Full HD com proteção Anti-Hash e FastStart gerado com sucesso!');
    loadProjects(currentProject.name);
  } catch (err) {
    btnRunSquareSub.disabled = false;
    btnRunSquareSub.textContent = 'Renderizar 9:16 Full HD';
    showToast(`Erro: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// ABRIR PASTA NO WINDOWS EXPLORER
// --------------------------------------------------------------------------
async function openFolder(project) {
  try {
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project })
    });
  } catch (err) {
    showToast('Não foi possível abrir a pasta no Explorer.');
  }
}
// --------------------------------------------------------------------------
// PILOTO AUTOMÁTICO 1-CLICK (PROCESSO COMPLETO COM VALIDAÇÕES)
// --------------------------------------------------------------------------
let autopilotInterval = null;

async function startAutoPilot(target) {
  const decodedTarget = decodeURIComponent(target);
  const modal = document.getElementById('autopilot-modal');
  const targetLabel = document.getElementById('autopilot-target-name');
  const logOutput = document.getElementById('autopilot-log-output');
  const statusBadge = document.getElementById('autopilot-status-badge');

  modal.classList.remove('hidden');
  targetLabel.textContent = `Alvo: ${decodedTarget}`;
  logOutput.textContent = 'Inicializando motor do Piloto Automático com validações de qualidade...\n';
  statusBadge.textContent = 'Processando...';
  statusBadge.className = 'job-status-running';

  // Reseta visual dos steps
  for (let i = 1; i <= 10; i++) {
    const el = document.getElementById(`ap-step-${i}`);
    if (el) el.className = 'ap-step';
  }

  try {
    const res = await fetch('/api/auto-pilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: decodedTarget })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao iniciar Piloto Automático');

    const jobId = data.jobId;
    if (autopilotInterval) clearInterval(autopilotInterval);

    autopilotInterval = setInterval(async () => {
      try {
        const jobRes = await fetch(`/api/jobs/${jobId}`);
        if (!jobRes.ok) return;
        const job = await jobRes.json();

        // Atualiza console de logs
        if (job.logs && job.logs.length > 0) {
          logOutput.textContent = job.logs.join('\n');
          logOutput.scrollTop = logOutput.scrollHeight;
        }

        // Atualiza checklist dos steps com base nos estágios
        const fullLogs = (job.logs || []).join('\n');
        if (fullLogs.includes('[DOWNLOAD]')) markStep(1);
        if (fullLogs.includes('[VMAKE]')) markStep(2);
        if (fullLogs.includes('[VALIDAÇÃO_1]')) markStep(3);
        if (fullLogs.includes('[TRANSCRIÇÃO]')) markStep(4);
        if (fullLogs.includes('[TRADUÇÃO]')) markStep(5);
        if (fullLogs.includes('[VOZ]')) markStep(6);
        if (fullLogs.includes('[ÁUDIO]')) markStep(7);
        if (fullLogs.includes('[VALIDAÇÃO_2]')) markStep(8);
        if (fullLogs.includes('[CORTES]') || fullLogs.includes('[SINCRONIA]')) markStep(9);
        if (fullLogs.includes('[RENDER]') || fullLogs.includes('[SUCESSO]')) markStep(10);

        if (job.status === 'completed') {
          clearInterval(autopilotInterval);
          statusBadge.textContent = '🎉 Concluído com Sucesso Total!';
          statusBadge.className = 'job-status-completed';
          for (let i = 1; i <= 10; i++) markStep(i, true);
          showToast('🎉 Vídeo 9:16 finalizado com sucesso total no Piloto Automático!');
          await loadProjects();
          switchTab('tab-pipeline');
        } else if (job.status === 'failed') {
          clearInterval(autopilotInterval);
          statusBadge.textContent = '❌ Falha no Processo';
          statusBadge.className = 'job-status-failed';
          showToast('Erro durante a execução do Piloto Automático. Verifique os logs.');
        }
      } catch (err) {
        console.error('Erro no polling do Piloto Automático:', err);
      }
    }, 2500);

  } catch (err) {
    statusBadge.textContent = 'Erro ao iniciar';
    statusBadge.className = 'job-status-failed';
    showToast(`Erro: ${err.message}`);
  }
}

function markStep(stepNum, isFinal = false) {
  for (let i = 1; i < stepNum; i++) {
    const prev = document.getElementById(`ap-step-${i}`);
    if (prev) prev.className = 'ap-step done';
  }
  const current = document.getElementById(`ap-step-${stepNum}`);
  if (current) current.className = isFinal ? 'ap-step done' : 'ap-step running';
}

window.downloadSelected = downloadSelected;
window.startAutoPilot = startAutoPilot;

// --------------------------------------------------------------------------
// GERENCIADOR DE KIT DE PUBLICAÇÃO & COPYS VIRAIS
// --------------------------------------------------------------------------
function copyToClipboard(text, successMsg = 'Copiado para a área de transferência!') {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg);
    }).catch(() => {
      fallbackCopy(text, successMsg);
    });
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast(successMsg);
}

function renderPostCopy(project, forceOverwriteInputs = false) {
  const emptyEl = document.getElementById('post-copy-empty');
  const contentEl = document.getElementById('post-copy-content');
  const titlesList = document.getElementById('post-titles-list');
  const captionText = document.getElementById('post-caption-text');
  const hashtagsText = document.getElementById('post-hashtags-text');

  // Novos campos organizados do formulário de publicação
  const postTitleInput = document.getElementById('post-yt-title-input');
  const postDescInput = document.getElementById('post-yt-desc-input');
  const postTagsInput = document.getElementById('post-yt-tags-input');
  const postTitleCount = document.getElementById('post-yt-title-count');

  if (!emptyEl || !contentEl) return;

  if (!project || !project.postCopy || !Array.isArray(project.postCopy.titles) || project.postCopy.titles.length === 0) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    if (forceOverwriteInputs) {
      if (postTitleInput) { postTitleInput.value = ''; if (postTitleCount) postTitleCount.textContent = '0/100'; }
      if (postDescInput) postDescInput.value = '';
      if (postTagsInput) postTagsInput.value = '';
    }
    return;
  }

  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  const copy = project.postCopy;
  titlesList.innerHTML = '';

  const initialTitle = copy.recommendedTitle || copy.titles[0] || '';

  copy.titles.forEach((title, idx) => {
    const row = document.createElement('div');
    row.style = 'display:flex; justify-content:space-between; align-items:center; gap:0.6rem; background:var(--color-obsidian-surface); border:1px solid var(--color-carbon-border); border-radius:var(--radius-sm); padding:0.65rem 0.95rem;';
    
    const isRec = copy.recommendedTitle === title || idx === 0;
    row.innerHTML = `
      <div style="font-size:0.86rem; color:var(--color-frost-white); display:flex; align-items:center; gap:0.5rem; flex:1; word-break:break-word;">
        <span style="font-weight:700; font-family:var(--font-mono); color:var(--color-ultraviolet-key); font-size:0.75rem;">#${idx + 1}</span>
        <span style="font-weight:500;">${escapeHtml(title)}</span>
        ${isRec ? '<span class="card-step-badge" style="font-size:0.65rem; padding:0.15rem 0.5rem; letter-spacing:0.15em;">RECOMENDADO</span>' : ''}
      </div>
      <div style="display:flex; align-items:center; gap:0.4rem;">
        <button type="button" class="btn-primary btn-sm" onclick="applyTitleToPublish('${title.replace(/'/g, "\\'")}')" style="font-size:0.75rem; padding:4px 8px;" title="Usar este título no formulário de publicação">Usar ✏️</button>
        <button type="button" class="btn-secondary btn-sm" onclick="copyToClipboard('${title.replace(/'/g, "\\'")}', 'Título copiado!')">📋 Copiar</button>
      </div>
    `;
    titlesList.appendChild(row);
  });

  captionText.value = copy.caption || '';
  hashtagsText.value = copy.hashtags || '';

  // Preenche os campos do formulário de publicação direta
  if (postTitleInput && (!postTitleInput.value || forceOverwriteInputs)) {
    postTitleInput.value = initialTitle;
    if (postTitleCount) postTitleCount.textContent = `${postTitleInput.value.length}/100`;
  }
  if (postDescInput && (!postDescInput.value || forceOverwriteInputs)) {
    const fullDesc = `${copy.caption || ''}\n\n${copy.hashtags || ''}`.trim();
    postDescInput.value = fullDesc;
  }
  if (postTagsInput && (!postTagsInput.value || forceOverwriteInputs)) {
    const cleanTags = (copy.hashtags || '')
      .split(/\s+/)
      .map(t => t.replace(/^#/, '').trim())
      .filter(Boolean)
      .join(', ');
    postTagsInput.value = cleanTags || 'shorts, viral, curiosidades';
  }
}

function applyTitleToPublish(title) {
  const postTitleInput = document.getElementById('post-yt-title-input');
  const postTitleCount = document.getElementById('post-yt-title-count');
  if (postTitleInput) {
    postTitleInput.value = title;
    if (postTitleCount) postTitleCount.textContent = `${title.length}/100`;
    postTitleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    postTitleInput.focus();
    showToast('Título aplicado ao formulário de postagem!');
  }
}

window.applyTitleToPublish = applyTitleToPublish;

async function handleGeneratePostCopy() {
  if (!currentProject) return showToast('Selecione um projeto.');

  const targetLang = (activeStudioTab !== 'base' ? activeStudioTab : 'pt');
  const btn = document.getElementById('btn-generate-post-copy');
  btn.disabled = true;
  btn.textContent = `⏳ Criando Copys & Títulos (${targetLang.toUpperCase()})...`;

  try {
    const res = await fetch('/api/generate-post-copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: currentProject.name, lang: targetLang })
    });

    const data = await res.json();
    btn.disabled = false;
    btn.textContent = '⚡ Gerar / Regerar Copys';

    if (!res.ok) throw new Error(data.detail || data.error || 'Falha ao gerar títulos');

    if (!currentProject.languages) currentProject.languages = {};
    if (!currentProject.languages[targetLang]) currentProject.languages[targetLang] = {};
    currentProject.languages[targetLang].postCopy = data.postCopy;
    if (targetLang === 'pt') {
      currentProject.postCopy = data.postCopy;
    }

    renderPostCopy({ ...currentProject, postCopy: data.postCopy }, true);
    showToast(`🎉 Títulos e legendas (${targetLang.toUpperCase()}) criados com sucesso!`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '⚡ Gerar / Regerar Copys';
    showToast(`Erro: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// FILA DE PRODUÇÃO AUTOMÁTICA SEQUENCIAL
// --------------------------------------------------------------------------
let queuePollingTimer = null;

async function addToQueue(targetUrl, targetTitle, targetThumb, languages = null, withMusic = null) {
  let url = targetUrl || '';
  try { if (url.includes('%')) url = decodeURIComponent(url); } catch (_) {}

  let title = targetTitle || 'Short Viral';
  try { if (title.includes('%')) title = decodeURIComponent(title); } catch (_) {}

  let thumbnail = targetThumb || '';
  try { if (thumbnail.includes('%')) thumbnail = decodeURIComponent(thumbnail); } catch (_) {}

  if (!url) return showToast('URL inválida para adicionar à fila');

  // Se não passou languages explicitamente e não é chamada programática, abre o modal
  if (!languages) {
    openAddToQueueModal(url, title, thumbnail);
    return;
  }

  const effectiveWithMusic = withMusic !== null ? Boolean(withMusic) : globalWithMusic;

  try {
    const res = await fetch('/api/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: url, title, thumbnail, languages, withMusic: effectiveWithMusic })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao adicionar à fila');

    const musicTag = effectiveWithMusic ? '🎵 com música' : '🔇 sem música';
    showToast(`⚡ Adicionado à Fila (#${data.position}) [${languages.map(l => l.toUpperCase()).join(', ')} - ${musicTag}]: ${title.slice(0, 26)}...`);
    renderQueueUI(data.queue);
  } catch (err) {
    showToast(`Erro na fila: ${err.message}`);
    throw err;
  }
}

function openAddToQueueModal(urlOrEncoded, titleOrEncoded, thumbOrEncoded, searchIndex = null) {
  let url = urlOrEncoded || '';
  try { if (url.includes('%')) url = decodeURIComponent(url); } catch (_) {}

  let title = titleOrEncoded || 'Short Viral';
  try { if (title.includes('%')) title = decodeURIComponent(title); } catch (_) {}

  let thumbnail = thumbOrEncoded || '';
  try { if (thumbnail.includes('%')) thumbnail = decodeURIComponent(thumbnail); } catch (_) {}

  pendingQueueItem = { url, title, thumbnail, searchIndex };

  const modal = document.getElementById('modal-add-to-queue');
  const modalThumb = document.getElementById('queue-add-modal-thumb');
  const modalTitle = document.getElementById('queue-add-modal-title');
  const modalTarget = document.getElementById('queue-add-modal-target');

  if (modalThumb) {
    if (thumbnail) {
      modalThumb.src = thumbnail;
      modalThumb.style.display = 'block';
    } else {
      modalThumb.style.display = 'none';
    }
  }
  if (modalTitle) modalTitle.textContent = title;
  if (modalTarget) modalTarget.textContent = url;

  const checkPt = document.getElementById('queue-lang-pt');
  const checkEs = document.getElementById('queue-lang-es');
  const checkEn = document.getElementById('queue-lang-en');
  if (checkPt) checkPt.checked = true;
  if (checkEs) checkEs.checked = false;
  if (checkEn) checkEn.checked = false;

  const checkMusic = document.getElementById('queue-add-music-checkbox');
  if (checkMusic) {
    checkMusic.checked = globalWithMusic;
  }

  if (modal) modal.classList.remove('hidden');
}

function closeAddToQueueModal() {
  const modal = document.getElementById('modal-add-to-queue');
  if (modal) modal.classList.add('hidden');
  pendingQueueItem = null;
}

async function confirmAddToQueue() {
  if (!pendingQueueItem) return;
  const checkPt = document.getElementById('queue-lang-pt');
  const checkEs = document.getElementById('queue-lang-es');
  const checkEn = document.getElementById('queue-lang-en');
  const checkMusic = document.getElementById('queue-add-music-checkbox');
  const btnConfirm = document.getElementById('btn-confirm-queue-add');

  const selectedLangs = [];
  if (checkPt && checkPt.checked) selectedLangs.push('pt');
  if (checkEs && checkEs.checked) selectedLangs.push('es');
  if (checkEn && checkEn.checked) selectedLangs.push('en');

  if (selectedLangs.length === 0) {
    showToast('Selecione pelo menos um idioma para gerar.');
    return;
  }

  const withMusic = checkMusic ? checkMusic.checked : globalWithMusic;
  const currentItem = { ...pendingQueueItem };

  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.textContent = 'Adicionando à fila...';
  }

  try {
    closeAddToQueueModal();
    await addToQueue(currentItem.url, currentItem.title, currentItem.thumbnail, selectedLangs, withMusic);

    // Se veio da pesquisa, dá feedback visual no botão daquele card sem travar os demais
    if (currentItem.searchIndex !== null && currentItem.searchIndex !== undefined) {
      const btn = document.getElementById(`btn-queue-search-${currentItem.searchIndex}`);
      if (btn) {
        btn.innerHTML = '✅ Na Fila';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        btn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        btn.style.color = 'var(--color-emerald-ok)';
        btn.disabled = true;
      }
    }
  } catch (err) {
    // Erro já notificado em addToQueue
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = '<span>⚡</span> Confirmar e Adicionar à Fila';
    }
  }
}

async function handleDirectQueue() {
  const url = directUrlInput.value.trim();
  if (!url) return showToast('Cole a URL de um Short do YouTube.');
  directUrlInput.value = '';
  await addToQueue(encodeURIComponent(url), encodeURIComponent('Short do YouTube'), '');
  switchTab('tab-queue');
}

async function handleQueueDirectAdd() {
  const input = document.getElementById('queue-direct-url');
  const url = input ? input.value.trim() : '';
  if (!url) return showToast('Cole a URL de um Short (YouTube, TikTok...)');
  input.value = '';
  await addToQueue(encodeURIComponent(url), encodeURIComponent('Vídeo Adicionado na Fila'), '');
  fetchQueueStatus();
}

async function handleQueueDirectAutopilot() {
  const input = document.getElementById('queue-direct-url');
  const url = input ? input.value.trim() : '';
  if (!url) return showToast('Cole a URL de um Short (YouTube, TikTok...)');
  input.value = '';
  startAutoPilot(url);
}

function startQueuePolling() {
  fetchQueueStatus();
  if (!queuePollingTimer) {
    queuePollingTimer = setInterval(fetchQueueStatus, 2500);
  }
}

async function fetchQueueStatus() {
  try {
    const res = await fetch('/api/queue');
    if (!res.ok) return;
    const data = await res.json();
    renderQueueUI(data);
  } catch (e) {
    // Falha silenciosa de polling
  }
}

function renderQueueUI(data) {
  if (!data) return;

  // Atualiza badge no topo da aba
  const navBadge = document.getElementById('nav-queue-count');
  if (navBadge) {
    if (data.totalPending > 0) {
      navBadge.style.display = 'inline-block';
      navBadge.textContent = data.totalPending;
    } else {
      navBadge.style.display = 'none';
    }
  }

  // Contadores
  const pendingCountEl = document.getElementById('queue-pending-count');
  const completedCountEl = document.getElementById('queue-completed-count');
  const runningCountEl = document.getElementById('queue-running-count');
  if (pendingCountEl) pendingCountEl.textContent = data.pending ? data.pending.length : 0;
  if (completedCountEl) completedCountEl.textContent = (data.completed ? data.completed.length : 0) + (data.failed ? data.failed.length : 0);
  if (runningCountEl) runningCountEl.textContent = data.runningCount || (data.activeList ? data.activeList.length : (data.active ? 1 : 0));

  // Status Indicator
  const statusIndicator = document.getElementById('queue-status-indicator');
  const statusText = document.getElementById('queue-status-text');
  if (statusIndicator && statusText) {
    if (data.isProcessing) {
      statusIndicator.className = 'status-pill online';
      statusIndicator.style.background = 'rgba(236, 72, 153, 0.2)';
      statusIndicator.style.color = '#f472b6';
      statusText.textContent = `Produzindo (${data.runningCount || 1} ativos | ${data.totalPending} na fila)`;
    } else {
      statusIndicator.className = 'status-pill online';
      statusIndicator.style.background = 'rgba(16, 185, 129, 0.15)';
      statusIndicator.style.color = '#34d399';
      statusText.textContent = 'Fila Pronta / Ociosa';
    }
  }

  // Lista de Slots em Produção Simultânea (Até 4 simultâneos)
  const runningSlotsContainer = document.getElementById('queue-running-slots');
  const activeList = data.activeList || (data.active ? [data.active] : []);
  if (runningSlotsContainer) {
    if (activeList.length > 1) {
      runningSlotsContainer.style.display = 'flex';
      runningSlotsContainer.innerHTML = activeList.map((item, idx) => `
        <div style="display:flex; align-items:center; gap:0.75rem; background:rgba(255,255,255,0.03); border:1px solid rgba(184,140,255,0.25); border-radius:8px; padding:0.6rem 0.85rem;">
          <span style="font-family:var(--font-mono); font-size:0.75rem; font-weight:700; color:var(--color-ultraviolet-key); background:rgba(184,140,255,0.15); padding:2px 6px; border-radius:4px;">Slot ${idx+1}</span>
          <div style="flex:1; min-width:0;">
            <div style="font-size:0.85rem; font-weight:600; color:var(--color-frost-white); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title || item.target}</div>
            <div style="font-size:0.75rem; color:var(--color-ultraviolet-key); font-family:var(--font-mono);">${item.currentStep || 'Processando...'} (${item.progress || 0}%)</div>
          </div>
          <button class="btn-secondary btn-sm" style="color:var(--color-code-rose); border-color:rgba(249,38,114,0.3); padding:3px 8px; font-size:0.72rem;" onclick="cancelQueueJob('${item.id}')" title="Cancelar este vídeo">Pular</button>
        </div>
      `).join('');
    } else {
      runningSlotsContainer.style.display = 'none';
    }
  }

  // Card do Ativo
  const activeCardBody = document.getElementById('queue-active-body');
  const activeTitle = document.getElementById('queue-active-title');
  const activeStep = document.getElementById('queue-active-step');
  const activePct = document.getElementById('queue-active-pct');
  const activeBar = document.getElementById('queue-active-bar');
  const activeThumb = document.getElementById('queue-active-thumb');
  const activeLogs = document.getElementById('queue-active-logs');
  const btnCancel = document.getElementById('btn-cancel-active-job');

  if (data.active) {
    if (activeCardBody) activeCardBody.style.display = 'block';
    if (btnCancel) btnCancel.style.display = 'inline-block';
    if (activeTitle) activeTitle.textContent = data.active.title || data.active.target;
    if (activeStep) activeStep.textContent = data.active.currentStep || 'Processando...';
    if (activePct) activePct.textContent = `${data.active.progress || 0}%`;
    if (activeBar) activeBar.style.width = `${data.active.progress || 0}%`;
    if (activeThumb) {
      if (data.active.thumbnail) {
        activeThumb.src = data.active.thumbnail;
        activeThumb.style.display = 'block';
      } else {
        activeThumb.style.display = 'none';
      }
    }

    // Mini badges de etapas
    highlightMiniStep(data.active.progress || 0);

    if (activeLogs && Array.isArray(data.active.logs)) {
      activeLogs.textContent = data.active.logs.join('');
      activeLogs.scrollTop = activeLogs.scrollHeight;
    }
  } else {
    if (activeCardBody) activeCardBody.style.display = 'none';
    if (btnCancel) btnCancel.style.display = 'none';
    if (activeTitle) {
      if (data.pending && data.pending.length > 0) {
        activeTitle.textContent = `Preparando próximo da fila: "${truncateText(data.pending[0].title, 38)}"`;
      } else {
        activeTitle.textContent = 'Fila Livre • Nenhum vídeo sendo processado';
      }
    }
    if (activeStep) {
      if (data.pending && data.pending.length > 0) {
        activeStep.textContent = 'Alocando worker...';
      } else {
        activeStep.textContent = 'Ociosa';
      }
    }
  }

  // Lista de Pendentes
  const pendingContainer = document.getElementById('queue-pending-list');
  if (pendingContainer) {
    if (!data.pending || data.pending.length === 0) {
      pendingContainer.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--text-muted); font-size:0.85rem;">Nenhum vídeo aguardando.<br>Explore o Radar de Tendências e clique em "➕ Adicionar à Fila"!</div>`;
    } else {
      pendingContainer.innerHTML = data.pending.map((item, idx) => `
        <div class="queue-item-card" style="display:flex; align-items:center; gap:0.85rem; background:var(--color-slate-layer); border:1px solid var(--color-carbon-border); padding:0.75rem 1rem; border-radius:var(--radius-cards); box-shadow:var(--shadow-card);">
          <span style="font-weight:700; font-size:0.85rem; color:var(--color-ultraviolet-key); font-family:var(--font-mono); min-width:28px;">#${idx + 1}</span>
          ${item.thumbnail ? `<img src="${item.thumbnail}" style="width:36px; height:48px; object-fit:cover; border-radius:6px; border:1px solid var(--color-carbon-border);">` : ''}
          <div style="flex:1; min-width:0;">
            <div style="font-size:0.88rem; font-weight:600; color:var(--color-frost-white); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.title}">${item.title}</div>
            <div style="font-size:0.75rem; color:var(--color-fog-text); font-weight:500;">Aguardando worker...</div>
          </div>
          <button class="btn-secondary btn-sm" style="color:var(--color-code-rose); border-color:rgba(249,38,114,0.3); padding:4px 8px;" onclick="removeQueueItem('${item.id}')" title="Remover da fila">❌</button>
        </div>
      `).join('');
    }
  }

  // Lista de Concluídos
  const completedContainer = document.getElementById('queue-completed-list');
  if (completedContainer) {
    const allFinished = [
      ...(data.completed || []),
      ...(data.failed || [])
    ].sort((a, b) => new Date(b.finishedAt || 0) - new Date(a.finishedAt || 0));

    if (allFinished.length === 0) {
      completedContainer.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--text-muted); font-size:0.85rem;">Nenhum vídeo finalizado nesta sessão.</div>`;
    } else {
      completedContainer.innerHTML = allFinished.map(item => {
        const isOk = item.status === 'completed';
        const project = (item.projectFolder && !item.projectFolder.startsWith('http')) ? item.projectFolder : null;
        const idBadge = project ? ('#VID-' + project.slice(0, 6).toUpperCase()) : (item.id ? '#' + item.id.slice(0, 8).toUpperCase() : '');
        return `
          <div class="queue-item-card" style="display:flex; align-items:center; gap:0.85rem; background:${isOk ? 'rgba(16, 185, 129, 0.04)' : 'rgba(249, 38, 114, 0.05)'}; border:1px solid ${isOk ? 'rgba(16, 185, 129, 0.2)' : 'rgba(249, 38, 114, 0.2)'}; padding:0.75rem 1rem; border-radius:var(--radius-cards); box-shadow:var(--shadow-card);">
            <div style="width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:${isOk ? 'rgba(16, 185, 129, 0.12)' : 'rgba(249, 38, 114, 0.12)'}; color:${isOk ? 'var(--color-emerald-ok)' : 'var(--color-code-rose)'};">
              ${isOk ? `
                <svg style="width:14px;height:14px;stroke:currentColor;stroke-width:2.2;fill:none;" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              ` : `
                <svg style="width:14px;height:14px;stroke:currentColor;stroke-width:2.2;fill:none;" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              `}
            </div>
            ${item.thumbnail ? `<img src="${item.thumbnail}" style="width:36px; height:48px; object-fit:cover; border-radius:6px; border:1px solid var(--color-carbon-border); flex-shrink:0;">` : ''}
            <div style="flex:1; min-width:0;">
              <div style="font-size:0.88rem; font-weight:600; color:var(--color-frost-white); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.title}">
                ${idBadge ? `<span style="font-family:var(--font-mono); font-size:0.7rem; color:var(--color-ultraviolet-key); background:rgba(184,140,255,0.12); padding:1px 5px; border-radius:4px; margin-right:4px; font-weight:700;">${idBadge}</span>` : ''}
                ${truncateText(item.title, 28)}
              </div>
              <div style="font-size:0.76rem; font-weight:500; color:${isOk ? 'var(--color-emerald-ok)' : 'var(--color-code-rose)'}; margin-top:2px; font-family:var(--font-mono);">${isOk ? 'Pronto para postar (9:16 Vertical)' : (item.error || 'Falha')}</div>
            </div>
            ${project ? `
              <button class="btn-primary btn-sm" onclick="selectProjectAndOpen('${project}')" style="display:inline-flex; align-items:center; gap:0.35rem; flex-shrink:0;">
                <svg style="width:12px;height:12px;stroke:currentColor;stroke-width:1.75;fill:none;" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="3"/><path d="m10 8 6 4-6 4V8z"/></svg>
                Studio
              </button>
            ` : ''}
            <button class="btn-secondary btn-sm" onclick="openJobLogsModal('${item.id}')" title="Ver histórico completo de logs e diagnóstico do erro" style="display:inline-flex; align-items:center; gap:0.35rem; flex-shrink:0; font-size:0.75rem; padding:4px 8px; font-weight:600;">
              <svg style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none;" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              Logs
            </button>
          </div>
        `;
      }).join('');
    }
  }
}

function highlightMiniStep(pct) {
  const steps = [
    { id: 'qstep-1', min: 10 },
    { id: 'qstep-2', min: 25 },
    { id: 'qstep-3', min: 45 },
    { id: 'qstep-4', min: 58 },
    { id: 'qstep-5', min: 68 },
    { id: 'qstep-6', min: 78 },
    { id: 'qstep-7', min: 85 },
    { id: 'qstep-8', min: 92 },
    { id: 'qstep-9', min: 96 },
    { id: 'qstep-10', min: 99 }
  ];

  steps.forEach(s => {
    const el = document.getElementById(s.id);
    if (!el) return;
    if (pct >= s.min) {
      el.style.background = 'rgba(184, 140, 255, 0.15)';
      el.style.borderColor = 'var(--color-ultraviolet-key)';
      el.style.color = 'var(--color-frost-white)';
      el.style.fontWeight = '600';
      el.style.boxShadow = '0 0 10px rgba(184, 140, 255, 0.25)';
    } else {
      el.style.background = 'var(--color-obsidian-surface)';
      el.style.borderColor = 'var(--color-carbon-border)';
      el.style.color = 'var(--color-ash-text)';
      el.style.fontWeight = '400';
      el.style.boxShadow = 'none';
    }
  });
}

async function removeQueueItem(id) {
  try {
    const res = await fetch('/api/queue/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    showToast('Item removido da fila.');
    renderQueueUI(data.queue);
  } catch (e) {
    showToast(`Erro ao remover: ${e.message}`);
  }
}

async function cancelQueueJob(id) {
  const confirmed = await showConfirmDialog({
    title: 'Cancelar Processamento',
    message: 'Deseja realmente cancelar o processamento deste vídeo na fila?',
    confirmText: 'Sim, Cancelar',
    cancelText: 'Continuar Processando',
    type: 'warning'
  });
  if (!confirmed) return;
  try {
    const res = await fetch('/api/queue/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    showToast('Processo interrompido.');
    renderQueueUI(data.queue);
  } catch (e) {
    showToast(`Erro ao cancelar: ${e.message}`);
  }
}

async function cancelCurrentQueueJob() {
  cancelQueueJob();
}

async function clearQueueHistory() {
  try {
    const res = await fetch('/api/queue/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    showToast('Histórico da fila limpo.');
    renderQueueUI(data.queue);
  } catch (e) {
    showToast(`Erro: ${e.message}`);
  }
}

function selectProjectAndOpen(projectName) {
  selectProject(projectName);
  switchTab('tab-pipeline');
}

// --------------------------------------------------------------------------
// CONFIGURAÇÕES & CHAVES DE API
// --------------------------------------------------------------------------
async function loadSettingsForm() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();

    const elOpenai = document.getElementById('setting-openai-key');
    if (elOpenai) elOpenai.value = data.openaiKey || '';

    const elMinimax = document.getElementById('setting-minimax-key');
    if (elMinimax) elMinimax.value = data.minimaxKey || '';

    const elMinimaxVoice = document.getElementById('setting-minimax-voice');
    if (elMinimaxVoice) elMinimaxVoice.value = data.minimaxVoiceId || '';

    const elVoiceUrl = document.getElementById('setting-voicestudio-url');
    if (elVoiceUrl) elVoiceUrl.value = data.voicestudioUrl || '';

    const elVmakeAk = document.getElementById('setting-vmake-ak');
    if (elVmakeAk) elVmakeAk.value = data.vmakeAk || '';

    const elVmakeSk = document.getElementById('setting-vmake-sk');
    if (elVmakeSk) elVmakeSk.value = data.vmakeSk || '';

    const elVmakeTask = document.getElementById('setting-vmake-task');
    if (elVmakeTask) elVmakeTask.value = data.vmakeTask || 'SKM0002';

    const oaiStatus = document.getElementById('setting-openai-status');
    if (oaiStatus) {
      oaiStatus.textContent = data.hasOpenai ? '✅ Conectado' : '⚠️ Não configurado';
      oaiStatus.className = `status-pill ${data.hasOpenai ? 'online' : 'offline'}`;
    }

    const mmxStatus = document.getElementById('setting-minimax-status');
    if (mmxStatus) {
      mmxStatus.textContent = data.hasMinimax ? '✅ Ativo' : '⚠️ Não configurado';
      mmxStatus.className = `status-pill ${data.hasMinimax ? 'online' : 'offline'}`;
    }

    const vmakeStatus = document.getElementById('setting-vmake-status');
    if (vmakeStatus) {
      vmakeStatus.textContent = data.hasVmake ? '✅ Ativo (API Oficial)' : '⚠️ Não configurado';
      vmakeStatus.className = `status-pill ${data.hasVmake ? 'online' : 'offline'}`;
    }
  } catch (e) {
    console.error('Erro ao carregar formulário de configurações:', e);
  }
}

async function openSettingsModal() {
  await loadSettingsForm();
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('hidden');
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function handleSaveSettings() {
  const btn = document.getElementById('btn-save-settings');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '💾 Salvando...';
  }

  const openaiKey = document.getElementById('setting-openai-key') ? document.getElementById('setting-openai-key').value.trim() : '';
  const minimaxKey = document.getElementById('setting-minimax-key') ? document.getElementById('setting-minimax-key').value.trim() : '';
  const minimaxVoiceId = document.getElementById('setting-minimax-voice') ? document.getElementById('setting-minimax-voice').value.trim() : '';
  const voicestudioUrl = document.getElementById('setting-voicestudio-url') ? document.getElementById('setting-voicestudio-url').value.trim() : '';
  const vmakeAk = document.getElementById('setting-vmake-ak') ? document.getElementById('setting-vmake-ak').value.trim() : '';
  const vmakeSk = document.getElementById('setting-vmake-sk') ? document.getElementById('setting-vmake-sk').value.trim() : '';
  const vmakeTask = document.getElementById('setting-vmake-task') ? document.getElementById('setting-vmake-task').value.trim() : 'SKM0002';

  try {
    const res = await fetch('/api/settings/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openaiKey,
        minimaxKey,
        minimaxVoiceId,
        voicestudioUrl,
        vmakeAk,
        vmakeSk,
        vmakeTask
      })
    });

    const data = await res.json();
    if (btn) {
      btn.disabled = false;
      btn.textContent = '💾 Salvar Configurações';
    }

    if (!res.ok) throw new Error(data.error || 'Falha ao salvar configurações');

    showToast('🎉 Configurações e chaves salvas com sucesso!');
    closeSettingsModal();
    checkSystemStatus();
    loadSettingsForm();
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '💾 Salvar Configurações';
    }
    showToast(`Erro ao salvar: ${e.message}`);
  }
}

// --------------------------------------------------------------------------
// PROJETOS: GALERIA COMPLETA & FILTROS
// --------------------------------------------------------------------------
let allLoadedProjects = [];
let currentProjectFilter = 'all';

async function renderProjectsGallery() {
  const grid = document.getElementById('projects-full-grid');
  const totalBadge = document.getElementById('projects-total-badge');
  if (!grid) return;

  // Animação de carregamento: barra com anel girando + linhas "fantasma" que brilham (7 colunas)
  const skeletonRow = `
    <tr class="skeleton-row">
      <td><div class="skeleton" style="width:42px; height:56px;"></div></td>
      <td><div class="skeleton" style="width:70%; height:12px;"></div><div class="skeleton" style="width:40%; height:10px; margin-top:8px;"></div></td>
      <td><div class="skeleton" style="width:60%; height:12px;"></div></td>
      <td><div class="skeleton" style="width:80%; height:12px;"></div></td>
      <td><div class="skeleton" style="width:90px; height:20px; border-radius:999px;"></div></td>
      <td><div class="skeleton" style="width:60%; height:12px;"></div></td>
      <td><div class="skeleton" style="width:50%; height:12px;"></div></td>
    </tr>`;
  grid.innerHTML = `
    <tr>
      <td colspan="7" style="padding:0; border-bottom:none;">
        <div class="loading-status"><span class="loader-ring"></span><span>Carregando projetos do disco...</span></div>
      </td>
    </tr>
    ${skeletonRow.repeat(4)}`;

  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    allLoadedProjects = data.projects || [];

    if (totalBadge) totalBadge.textContent = `${allLoadedProjects.length} Projetos`;

    filterAndDisplayProjects();
  } catch (err) {
    grid.innerHTML = `<div style="grid-column: 1/-1; padding: 2rem; text-align: center; color: var(--accent-danger);">Erro ao carregar projetos: ${err.message}</div>`;
  }
}

function filterAndDisplayProjects() {
  const grid = document.getElementById('projects-full-grid');
  const searchInput = document.getElementById('projects-search-input');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  if (!grid) return;

  let filtered = allLoadedProjects.filter(p => {
    const title = (p.info && p.info.title ? p.info.title : p.name).toLowerCase();
    const matchesQuery = !query || title.includes(query) || p.name.toLowerCase().includes(query);

    if (!matchesQuery) return false;

    const projStatus = p.status || (p.info && p.info.status) || (p.hasVertical9x16 || p.hasSquareSubtitled ? 'ready' : (p.hasFinal ? 'in_progress' : 'in_progress'));

    const postedLangs = p.postedLanguages || [];
    const isPostedAny = projStatus === 'posted' || postedLangs.length > 0;
    const isPT = postedLangs.includes('pt') || projStatus === 'posted_pt' || projStatus === 'posted_both' || (isPostedAny && (!p.info?.youtubeUploads || p.info?.youtubeUploads?.pt || (p.info?.youtube && !p.info?.youtubeUploads?.es)));
    const isES = postedLangs.includes('es') || projStatus === 'posted_es' || projStatus === 'posted_both' || !!(p.info?.youtubeUploads && p.info?.youtubeUploads?.es);
    const isBoth = isPT && isES;

    if (currentProjectFilter === 'posted') {
      return isPostedAny;
    } else if (currentProjectFilter === 'posted_pt') {
      return isPT;
    } else if (currentProjectFilter === 'posted_es') {
      return isES;
    } else if (currentProjectFilter === 'posted_all') {
      return projStatus === 'posted_all' || (postedLangs.includes('pt') && postedLangs.includes('es') && postedLangs.includes('en'));
    } else if (currentProjectFilter === 'posted_en') {
      return postedLangs.includes('en') || projStatus === 'posted_en';
    } else if (currentProjectFilter === 'posted_both') {
      return isBoth;
    } else if (currentProjectFilter === 'ready') {
      return projStatus === 'ready';
    } else if (currentProjectFilter === 'in_progress') {
      return projStatus === 'in_progress' || projStatus === 'draft';
    }
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 3rem 1rem; text-align: center; color: var(--color-fog-text);">
          <span style="font-size: 2.2rem; display: block; margin-bottom: 0.5rem;">📂</span>
          <div style="font-weight: 600; font-size: 1rem; color: var(--color-frost-white); margin-bottom: 0.25rem;">Nenhum projeto encontrado</div>
          <div style="font-size: 0.8rem; margin-bottom: 1rem;">Nenhum projeto corresponde ao filtro ou busca atual.</div>
          <button class="btn-primary" onclick="switchTab('tab-search')" style="padding: 0.5rem 1.25rem;">
            🔍 Ir para Pesquisa
          </button>
        </td>
      </tr>
    `;
    return;
  }

  const LANG_FLAGS = {
    pt: { flag: '🇧🇷', name: 'PT' },
    es: { flag: '🇪🇸', name: 'ES' },
    en: { flag: '🇺🇸', name: 'EN' }
  };

  grid.innerHTML = filtered.map(p => {
    const rawName = p.info && p.info.title ? p.info.title : p.name.replace(/_/g, ' ');
    const displayName = truncateText(rawName, 36);
    const displaySubName = truncateText(p.name, 38);
    const videoId = (p.info && p.info.id) ? p.info.id : ('VID-' + p.name.slice(0, 6).toUpperCase());
    const sDate = p.scheduledDate || (p.info && p.info.scheduledDate);
    const projStatus = p.status || (p.info && p.info.status) || (p.hasVertical9x16 || p.hasSquareSubtitled ? 'ready' : 'in_progress');
    const isPosted = projStatus === 'posted';
    const isReady = projStatus === 'ready';

    let dotClass = 'in_progress';
    if (isPosted) dotClass = 'posted';
    else if (isReady) dotClass = 'ready';

    // Lista de idiomas disponíveis
    const availableLangs = (p.availableLanguages && p.availableLanguages.length > 0)
      ? p.availableLanguages
      : ['pt'];

    // Idiomas marcados como postados (clique no selo na coluna Idiomas)
    const postedLangs = p.postedLanguages || [];
    const anyPosted = postedLangs.length > 0 || projStatus === 'posted';

    // Status: "Postado" é automático (qualquer idioma marcado).
    // Sem idioma marcado, vale a escolha manual: Em Edição ou Pronto.
    let currentStatusVal = 'in_progress';
    let currentStatusLabel = 'Em Edição';
    if (anyPosted) {
      currentStatusVal = 'posted';
      currentStatusLabel = 'Postado';
    } else if (projStatus === 'ready') {
      currentStatusVal = 'ready';
      currentStatusLabel = 'Pronto (9:16)';
    }
    const currentStatusDot = currentStatusVal;

    const langBadges = availableLangs.map(l => {
      const langName = l.toUpperCase();
      const langData = p.languages && p.languages[l];
      const hasVideo = langData ? (langData.urls?.vertical9x16 || langData.urls?.final) : (l === 'pt' && (p.hasVertical9x16 || p.hasFinal));
      
      const isThisPosted = postedLangs.includes(l);
      const ytUrl = (p.info?.youtubeUploads && p.info.youtubeUploads[l]?.url) || (l === 'pt' && p.info?.youtube?.url) || null;

      let pillBg = '#f1f5f9';
      let pillBorder = '#e2e8f0';
      let pillColor = '#64748b';
      let statusDesc = 'Pendente';

      if (isThisPosted) {
        pillBg = '#f5f3ff';
        pillBorder = '#c4b5fd';
        pillColor = '#6d28d9';
        statusDesc = 'Postado';
      } else if (hasVideo) {
        pillBg = '#ecfdf5';
        pillBorder = '#a7f3d0';
        pillColor = '#059669';
        statusDesc = 'Vídeo 9:16 Pronto';
      }

      const toggleTitle = isThisPosted
        ? `${langName}: ${statusDesc}. Clique para desmarcar`
        : `${langName}: ${statusDesc}. Clique para marcar como postado`;
      const linkHtml = (isThisPosted && ytUrl)
        ? `<a href="${ytUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Abrir Short no YouTube" style="text-decoration:none; font-size:0.72rem; color:${pillColor};">↗</a>`
        : '';

      return `<span style="display:inline-flex; align-items:center; gap:3px;">
        <button type="button" onclick="event.stopPropagation(); toggleLanguagePosted('${p.name}', '${l}')" title="${toggleTitle}" style="cursor:pointer; font-size:0.72rem; font-weight:700; padding:2px 7px; border-radius:4px; background:${pillBg}; border:1px solid ${pillBorder}; color:${pillColor};">${langName}${isThisPosted ? ' ✓' : ''}</button>${linkHtml}
      </span>`;
    }).join(' ');

    return `
      <tr style="border-bottom: 1px solid var(--color-carbon-border); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
        <!-- Thumbnail -->
        <td style="padding: 0.75rem 1rem; vertical-align: middle;">
          ${p.thumbnail ? `<img src="${p.thumbnail}" style="width: 42px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid var(--color-carbon-border); display: block;">` : `<div style="width: 42px; height: 56px; border-radius: 6px; background: rgba(255,255,255,0.03); border: 1px solid var(--color-carbon-border); display:flex; align-items:center; justify-content:center; font-size:1.1rem;">🎬</div>`}
        </td>

        <!-- Informações do Vídeo -->
        <td style="padding: 0.75rem 1rem; vertical-align: middle; max-width: 360px;">
          <div style="display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.25rem;">
            <span style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--color-ultraviolet-key); background: rgba(184, 140, 255, 0.12); padding: 1px 5px; border-radius: 4px; font-weight: 700; border: 1px solid rgba(184, 140, 255, 0.25); flex-shrink: 0;">#${videoId}</span>
            <span class="project-title-clamp" onclick="selectProjectAndOpen('${p.name}')" title="${rawName}" style="font-size: 0.92rem; font-weight: 600; color: var(--color-frost-white); cursor:pointer;">
              ${displayName}
            </span>
          </div>
          <div class="project-subtitle-mono" title="${p.name}">
            <span>${displaySubName}</span>
          </div>
        </td>

        <!-- Duração do Vídeo Final -->
        <td style="padding: 0.75rem 1rem; vertical-align: middle; white-space: nowrap;">
          ${p.finalDurationFormatted ? `
            <span style="display: inline-flex; align-items: center; gap: 0.35rem; font-family: var(--font-mono); font-size: 0.75rem; font-weight: 700; color: var(--color-frost-white); background: #f1f5f9; border: 1px solid var(--color-carbon-border); padding: 3px 8px; border-radius: var(--radius-sm);" title="Duração do vídeo final: ${p.finalDurationFormatted}">
              <svg style="width: 12px; height: 12px; stroke: var(--color-ultraviolet-key); stroke-width: 2; fill: none;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${p.finalDurationFormatted}
            </span>
          ` : `<span style="font-size: 0.75rem; color: var(--color-fog-text); font-family: var(--font-mono);">-</span>`}
        </td>

        <!-- Idiomas -->
        <td style="padding: 0.75rem 1rem; vertical-align: middle;">
          <div style="display: flex; gap: 0.3rem; align-items: center; flex-wrap: nowrap; white-space: nowrap;">
            ${langBadges}
          </div>
        </td>

        <!-- Status (Custom Dropdown Estilizado) -->
        <td style="padding: 0.75rem 1rem; vertical-align: middle; position: relative;">
          <div class="custom-status-dropdown" data-project="${p.name}" onclick="event.stopPropagation()">
            <button type="button" class="status-dropdown-trigger" onclick="toggleStatusDropdown('${p.name}', this, event)" title="Alterar status de publicação deste projeto">
              <span class="status-dot-indicator ${currentStatusDot}"></span>
              <span class="status-label-text">${currentStatusLabel}</span>
              <svg class="dropdown-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <div class="status-dropdown-menu hidden" id="status-menu-${p.name}">
              <div class="status-option ${currentStatusVal === 'in_progress' ? 'active' : ''}" onclick="selectProjectStatusOption('${p.name}', 'in_progress')">
                <span class="status-dot-indicator in_progress"></span>
                <span>Em Edição</span>
              </div>
              <div class="status-option ${currentStatusVal === 'ready' ? 'active' : ''}" onclick="selectProjectStatusOption('${p.name}', 'ready')">
                <span class="status-dot-indicator ready"></span>
                <span>Pronto (9:16)</span>
              </div>
              <div class="status-option ${currentStatusVal === 'posted' ? 'active' : ''}" onclick="selectProjectStatusOption('${p.name}', 'posted')" title="Automático: marque os idiomas na coluna Idiomas">
                <span class="status-dot-indicator posted"></span>
                <span>Postado (automático)</span>
              </div>
            </div>
          </div>
        </td>

        <!-- Data Agendada -->
        <td style="padding: 0.75rem 1rem; vertical-align: middle;">
          ${sDate ? `<span style="font-size: 0.72rem; color: var(--color-ultraviolet-key); background: #f5f3ff; border: 1px solid #ddd6fe; padding: 2px 7px; border-radius: 4px; white-space: nowrap; font-weight: 600;">${formatDisplayDate(sDate)}</span>` : `<span style="font-size: 0.72rem; color: var(--color-fog-text);">-</span>`}
        </td>

        <!-- Ações -->
        <td style="padding: 0.75rem 1rem; vertical-align: middle; text-align: right;">
          <div style="display: inline-flex; gap: 0.4rem; align-items: center;">
            <button class="btn-primary btn-sm" onclick="selectProjectAndOpen('${p.name}')" title="Abrir no Estúdio" style="padding: 0.5rem 0.6rem; display: inline-flex; align-items: center; justify-content: center;">
              <svg style="width: 14px; height: 14px; stroke: currentColor; stroke-width: 1.85; fill: none;" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="3"/><path d="m10 8 6 4-6 4V8z"/></svg>
            </button>
            <button class="btn-secondary btn-sm" onclick="event.stopPropagation(); openRerunModal('${p.name}')" title="Refazer na Fila de Produção" style="padding: 0.5rem 0.6rem; color: var(--color-ultraviolet-key); border-color: rgba(184, 140, 255, 0.35); display: inline-flex; align-items: center; justify-content: center;">
              <svg style="width: 14px; height: 14px; stroke: currentColor; stroke-width: 1.85; fill: none;" viewBox="0 0 24 24"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            </button>
            <button class="btn-secondary btn-sm" onclick="openFolder('${p.name}')" title="Abrir pasta no Windows Explorer" style="padding: 0.5rem 0.6rem; display: inline-flex; align-items: center; justify-content: center;">
              <svg style="width: 14px; height: 14px; stroke: currentColor; stroke-width: 1.85; fill: none;" viewBox="0 0 24 24"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
            </button>
            <button class="btn-secondary btn-sm" onclick="event.stopPropagation(); deleteProject('${p.name}')" title="Excluir projeto do disco" style="padding: 0.5rem 0.6rem; color: var(--color-code-rose); border-color: rgba(249, 38, 114, 0.3); background: rgba(249, 38, 114, 0.08); display: inline-flex; align-items: center; justify-content: center;">
              <svg style="width: 14px; height: 14px; stroke: currentColor; stroke-width: 1.85; fill: none;" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.changeProjectStatus = async function(projectName, newStatus) {
  try {
    const res = await fetch('/api/projects/update-meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: projectName, status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      const msg = newStatus === 'posted' ? '🚀 Vídeo marcado como Postado!' : (newStatus === 'ready' ? '✅ Status: Pronto para Postar' : '⏳ Status: Em Edição');
      showToast(msg);
      const p = allLoadedProjects.find(item => item.name === projectName);
      if (p) {
        if (!p.info) p.info = {};
        p.info.status = newStatus;
        p.status = newStatus;
      }
      filterAndDisplayProjects();
      if (currentProject && currentProject.name === projectName) {
        currentProject.status = newStatus;
        if (!currentProject.info) currentProject.info = {};
        currentProject.info.status = newStatus;
        const selectStudioStatus = document.getElementById('select-studio-status');
        const studioStatusDot = document.getElementById('studio-status-dot');
        if (selectStudioStatus) selectStudioStatus.value = newStatus;
        if (studioStatusDot) studioStatusDot.className = `status-dot-indicator ${newStatus}`;
      }
    } else {
      showToast('Erro ao atualizar status: ' + (data.error || 'Falha'));
    }
  } catch (err) {
    showToast('Erro de conexão ao atualizar status: ' + err.message);
  }
};

// --------------------------------------------------------------------------
// RENOMEAR PROJETO
// --------------------------------------------------------------------------
function openRenameModal() {
  if (!currentProject) return showToast('Selecione um projeto para renomear.');
  const modal = document.getElementById('rename-modal');
  const input = document.getElementById('input-rename-title');
  const currentTitle = currentProject.info && currentProject.info.title ? currentProject.info.title : currentProject.name.replace(/_/g, ' ');

  input.value = currentTitle;
  modal.classList.remove('hidden');
  input.focus();
}

function closeRenameModal() {
  document.getElementById('rename-modal').classList.add('hidden');
}

async function handleConfirmRename() {
  if (!currentProject) return;
  const newTitle = document.getElementById('input-rename-title').value.trim();
  if (!newTitle) return showToast('Digite um título válido.');

  try {
    const res = await fetch('/api/projects/update-meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: currentProject.name,
        title: newTitle
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao renomear');

    showToast('Título do projeto atualizado com sucesso!');
    closeRenameModal();
    await loadProjects(currentProject.name);
  } catch (e) {
    showToast(`Erro ao renomear: ${e.message}`);
  }
}

// --------------------------------------------------------------------------
// MODAL DE REFAZER VÍDEO NA FILA (DO ZERO OU PARCIAL)
// --------------------------------------------------------------------------
let targetRerunProject = null;

function openRerunModal(projectName = null) {
  const targetName = projectName || (currentProject ? currentProject.name : null);
  if (!targetName) {
    showToast('Nenhum projeto selecionado para refazer.');
    return;
  }

  targetRerunProject = targetName;
  const modal = document.getElementById('rerun-queue-modal');
  const label = document.getElementById('rerun-modal-project-name');
  if (label) {
    label.textContent = truncateText(targetName, 36);
    label.title = targetName;
  }

  // Reseta modo de execução
  const radioPartial = document.querySelector('input[name="rerun-mode"][value="partial"]');
  if (radioPartial) radioPartial.checked = true;

  // Detecta idioma ativo do estúdio ou do projeto para pré-selecionar
  let defaultLang = 'pt';
  if (typeof activeStudioTab === 'string' && (activeStudioTab === 'es' || activeStudioTab === 'en')) {
    defaultLang = activeStudioTab;
  } else if (currentProject && currentProject.name === targetName) {
    if (activeStudioTab === 'es') defaultLang = 'es';
    else if (Array.isArray(currentProject.availableLanguages) && currentProject.availableLanguages.includes('es') && !currentProject.availableLanguages.includes('pt')) {
      defaultLang = 'es';
    }
  }

  const langRadios = document.querySelectorAll('input[name="rerun-language"]');
  langRadios.forEach(r => {
    r.checked = (r.value === defaultLang);
    const parentPill = r.closest('.rerun-lang-pill');
    if (parentPill) {
      if (r.checked) parentPill.classList.add('selected');
      else parentPill.classList.remove('selected');
    }
  });

  // Carrega configuração de música existente do projeto ou usa a preferência global
  let projMusic = globalWithMusic;
  const foundProj = (allLoadedProjects || []).find(p => p.name === targetName);
  if (foundProj && foundProj.info && typeof foundProj.info.withMusic === 'boolean') {
    projMusic = foundProj.info.withMusic;
  } else if (currentProject && currentProject.name === targetName && currentProject.info && typeof currentProject.info.withMusic === 'boolean') {
    projMusic = currentProject.info.withMusic;
  }

  const musicCheckbox = document.getElementById('rerun-music-checkbox');
  if (musicCheckbox) {
    musicCheckbox.checked = projMusic;
  }

  if (modal) modal.classList.remove('hidden');
}

function closeRerunModal() {
  const modal = document.getElementById('rerun-queue-modal');
  if (modal) modal.classList.add('hidden');
  targetRerunProject = null;
}

async function handleConfirmRerun() {
  if (!targetRerunProject) {
    showToast('Nenhum projeto selecionado.');
    return;
  }

  const mode = document.querySelector('input[name="rerun-mode"]:checked')?.value || 'partial';
  const fromStep = mode === 'partial' ? (document.getElementById('select-rerun-step')?.value || 'merge') : null;
  const rerunMusicCb = document.getElementById('rerun-music-checkbox');
  const withMusic = rerunMusicCb ? rerunMusicCb.checked : globalWithMusic;

  // Obtém o idioma selecionado
  const chosenLang = document.querySelector('input[name="rerun-language"]:checked')?.value || 'pt';
  let targetLanguages = ['pt'];
  if (chosenLang === 'en') {
    targetLanguages = ['en'];
  } else if (chosenLang === 'es') {
    targetLanguages = ['es'];
  } else if (chosenLang === 'both') {
    targetLanguages = ['pt', 'es'];
  } else {
    targetLanguages = ['pt'];
  }

  const btnConfirm = document.getElementById('btn-confirm-rerun');
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.textContent = 'Adicionando à fila...';
  }

  try {
    const res = await fetch('/api/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: targetRerunProject,
        title: targetRerunProject.replace(/_/g, ' '),
        fromStep: fromStep,
        languages: targetLanguages,
        withMusic: withMusic
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao adicionar à fila');

    const stepLabels = {
      transcribe: 'Etapa 2 (Transcrição)',
      translate: 'Etapa 3 (Tradução)',
      tts: 'Etapa 4 (Narração TTS)',
      trim: 'Etapa 5 (Corte de Silêncios)',
      cut: 'Etapa 6 (Cortes Rítmicos)',
      merge: 'Etapa 7 (Mesclar Áudio+Vídeo)',
      render_9x16: 'Etapa 8 (Render 9:16 + Legendas)',
      post_copy: 'Etapa 9 (Copys Virais)'
    };
    const stepLabel = fromStep ? `a partir da ${stepLabels[fromStep] || fromStep}` : 'completo do zero';
    const musicLabel = withMusic ? 'com música' : 'sem música';
    const langLabel = targetLanguages.map(l => l.toUpperCase()).join('+');
    showToast(`✅ "${targetRerunProject.slice(0, 25)}" enviado para a fila ([${langLabel}], ${stepLabel}, ${musicLabel})!`, 5000);
    closeRerunModal();

    if (typeof loadQueueStatus === 'function') {
      loadQueueStatus();
    }
  } catch (err) {
    showToast(`Erro ao refazer projeto: ${err.message}`, 6000);
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = '<span>➕</span> Enviar para Fila';
    }
  }
}

// --------------------------------------------------------------------------
// DATA DE POSTAGEM AGENDADA (ORGANIZAÇÃO)
// --------------------------------------------------------------------------
async function handleSaveScheduledDate() {
  if (!currentProject) return showToast('Selecione um projeto.');
  const input = document.getElementById('input-scheduled-date');
  const dateVal = input.value.trim();

  try {
    const res = await fetch('/api/projects/update-meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: currentProject.name,
        scheduledDate: dateVal
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao salvar data');

    showToast(dateVal ? '📅 Data de postagem agendada salva!' : 'Data de postagem desmarcada.');
    await loadProjects(currentProject.name);
  } catch (e) {
    showToast(`Erro: ${e.message}`);
  }
}

async function handleClearScheduledDate() {
  if (!currentProject) return;
  const input = document.getElementById('input-scheduled-date');
  input.value = '';
  await handleSaveScheduledDate();
}

// --------------------------------------------------------------------------
// DELETAR PROJETO (APAGA ARQUIVOS DO DISCO)
// --------------------------------------------------------------------------
async function handleDeleteCurrentProject() {
  if (!currentProject) return showToast('Nenhum projeto selecionado.');
  await deleteProject(currentProject.name);
}

async function deleteProject(projectName) {
  const confirmed = await showConfirmDialog({
    title: 'Excluir Projeto Permanentemente',
    message: `⚠️ Deseja realmente excluir permanentemente o projeto "${projectName.replace(/_/g, ' ')}" e todos os seus vídeos, áudios e arquivos do disco? Esta ação não pode ser desfeita.`,
    confirmText: 'Sim, Excluir Projeto',
    cancelText: 'Cancelar',
    type: 'danger'
  });
  if (!confirmed) return;

  try {
    const res = await fetch('/api/projects/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: projectName })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao deletar projeto');

    showToast(`🗑️ Projeto "${projectName}" e arquivos excluídos do disco!`);
    currentProject = null;
    await loadProjects();
  } catch (e) {
    showToast(`Erro ao excluir: ${e.message}`);
  }
}

window.copyToClipboard = copyToClipboard;

// Copia o ID do projeto para a área de transferência
window.copyProjectIdToClipboard = function() {
  if (!currentProject) return;
  const videoId = (currentProject.info && currentProject.info.id) || ('VID-' + currentProject.name.slice(0, 6).toUpperCase());
  navigator.clipboard.writeText(videoId).then(() => {
    showToast(`📋 ID #${videoId} copiado para a área de transferência!`);
  }).catch(() => {
    showToast(`ID: ${videoId}`);
  });
};

// Copia URL com parâmetros únicos do projeto (?project=...&id=...)
window.copyProjectShareUrl = function() {
  if (!currentProject) return showToast('Selecione um projeto primeiro.');
  const videoId = (currentProject.info && currentProject.info.id) || ('VID-' + currentProject.name.slice(0, 6).toUpperCase());
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('project', currentProject.name);
  url.searchParams.set('id', videoId);
  const shareableUrl = url.toString();

  navigator.clipboard.writeText(shareableUrl).then(() => {
    showToast('🔗 Link direto do vídeo copiado! Pode enviar para outra pessoa.');
  }).catch(() => {
    showPromptDialog({
      title: 'Compartilhar Link do Vídeo',
      message: 'Copie o link direto abaixo:',
      value: shareableUrl
    });
  });
};
// Modal de Logs do Histórico
let currentModalLogItem = null;
const queueLogsModal = document.getElementById('queue-logs-modal');
const modalLogsTitle = document.getElementById('modal-logs-title');
const modalLogsStatus = document.getElementById('modal-logs-status');
const modalLogsContent = document.getElementById('modal-logs-content');
const btnCloseQueueLogs = document.getElementById('btn-close-queue-logs');
const btnCopyModalLogs = document.getElementById('btn-copy-modal-logs');

if (btnCloseQueueLogs && queueLogsModal) {
  btnCloseQueueLogs.addEventListener('click', () => {
    queueLogsModal.classList.add('hidden');
  });
}

if (btnCopyModalLogs && modalLogsContent) {
  btnCopyModalLogs.addEventListener('click', () => {
    navigator.clipboard.writeText(modalLogsContent.textContent || '').then(() => {
      showToast('Logs copiados para a área de transferência!');
    });
  });
}

function openJobLogsModal(id) {
  fetch('/api/queue').then(r => r.json()).then(data => {
    const all = [
      ...(data.activeList || (data.active ? [data.active] : [])),
      ...(data.pending || []),
      ...(data.completed || []),
      ...(data.failed || [])
    ];
    const item = all.find(i => i.id === id);
    if (!item) {
      showToast('Registro de logs não encontrado.');
      return;
    }

    if (modalLogsTitle) modalLogsTitle.textContent = `Logs: ${item.title || item.target}`;
    if (modalLogsStatus) {
      const isFailed = item.status === 'failed' || item.status === 'cancelled';
      modalLogsStatus.style.color = isFailed ? 'var(--color-code-rose)' : 'var(--color-emerald-ok)';
      modalLogsStatus.textContent = `Status: ${item.status.toUpperCase()} ${item.error ? `(${item.error})` : ''}`;
    }
    if (modalLogsContent) {
      const logs = (item.logs && item.logs.length > 0) ? item.logs.join('') : 'Nenhum log gravado para esta execução.';
      modalLogsContent.textContent = logs;
      modalLogsContent.scrollTop = modalLogsContent.scrollHeight;
    }

    if (queueLogsModal) {
      queueLogsModal.classList.remove('hidden');
    }
  }).catch(e => {
    showToast(`Erro ao carregar logs: ${e.message}`);
  });
}

window.openJobLogsModal = openJobLogsModal;
window.handleGeneratePostCopy = handleGeneratePostCopy;
window.addToQueue = addToQueue;
window.removeQueueItem = removeQueueItem;
window.cancelCurrentQueueJob = cancelCurrentQueueJob;
window.clearQueueHistory = clearQueueHistory;
window.selectProjectAndOpen = selectProjectAndOpen;
window.deleteProject = deleteProject;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.openRenameModal = openRenameModal;
window.closeRenameModal = closeRenameModal;
window.openRerunModal = openRerunModal;
window.closeRerunModal = closeRerunModal;
window.switchTab = switchTab;
window.renderProjectsGallery = renderProjectsGallery;
window.openFolder = openFolder;
window.openProjectInStudio = function(folderName) {
  selectProject(folderName);
  switchTab('tab-pipeline');
};

// --------------------------------------------------------------------------
// YOUTUBE MULTI-CANAL STUDIO
// --------------------------------------------------------------------------

let currentYouTubeData = null;

function formatMetricNumber(val) {
  if (!val) return '0';
  const num = parseInt(val, 10);
  if (isNaN(num)) return val;
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace('.0', '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace('.0', '') + 'K';
  return num.toLocaleString('pt-BR');
}

async function loadYouTubeChannelsView() {
  try {
    const res = await fetch('/api/youtube/channels');
    const data = await res.json();
    currentYouTubeData = data;

    const navYtCount = document.getElementById('nav-youtube-count');
    const totalCountEl = document.getElementById('yt-total-channels-count');
    const headerYtBtn = document.getElementById('header-youtube-btn');
    const headerYtText = document.getElementById('header-youtube-text');
    const emptyState = document.getElementById('yt-empty-state');
    const channelsGrid = document.getElementById('yt-channels-grid');
    const postChannelSelect = document.getElementById('post-yt-channel-select');

    const channels = data.channels || [];

    // Atualiza contadores
    if (navYtCount) {
      if (channels.length > 0) {
        navYtCount.textContent = channels.length;
        navYtCount.style.display = 'inline-block';
      } else {
        navYtCount.style.display = 'none';
      }
    }
    if (totalCountEl) {
      totalCountEl.textContent = channels.length;
    }

    // Atualiza botão no Header
    if (headerYtBtn && headerYtText) {
      if (channels.length > 0) {
        headerYtBtn.style.color = '#34d399';
        headerYtBtn.style.borderColor = 'rgba(52, 211, 153, 0.4)';
        headerYtBtn.style.background = 'rgba(52, 211, 153, 0.1)';
        headerYtBtn.href = '#tab-youtube';
        headerYtBtn.title = `${channels.length} canal(is) conectado(s). Clique para gerenciar.`;
        headerYtText.textContent = `YouTube (${channels.length})`;
      } else {
        headerYtBtn.style.color = '#ff4d4d';
        headerYtBtn.style.borderColor = 'rgba(255, 77, 77, 0.25)';
        headerYtBtn.style.background = 'rgba(255, 77, 77, 0.1)';
        headerYtBtn.href = '/api/auth/youtube/login';
        headerYtBtn.title = 'Clique para autorizar e conectar seu canal do YouTube';
        headerYtText.textContent = 'Conectar YouTube';
      }
    }

    // Atualiza seletor de canal no Kit de Publicação
    if (postChannelSelect) {
      if (channels.length === 0) {
        postChannelSelect.innerHTML = '<option value="">Nenhum canal conectado - Conecte na aba YouTube</option>';
      } else {
        postChannelSelect.innerHTML = channels.map(c => `
          <option value="${c.id}">
            ${escapeHtml(c.alias || c.name)} (${formatMetricNumber(c.subscribers)} inscritos)
          </option>
        `).join('');
      }
    }

    // Se nenhum canal cadastrado
    if (channels.length === 0) {
      if (emptyState) {
        emptyState.classList.remove('hidden');
        emptyState.style.display = 'block';
      }
      if (channelsGrid) {
        channelsGrid.innerHTML = '';
      }
      return;
    }

    // Renderiza grid com TODOS os canais cadastrados
    if (emptyState) {
      emptyState.classList.add('hidden');
      emptyState.style.display = 'none';
    }

    if (channelsGrid) {
      channelsGrid.innerHTML = channels.map(c => {
        const displayName = escapeHtml(c.alias || c.name);
        const originalName = escapeHtml(c.name || '');
        const handle = escapeHtml(c.customUrl || '@' + (c.name || '').toLowerCase().replace(/\s+/g, ''));
        const avatar = c.avatar || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="%23222"/></svg>';
        
        return `
          <div class="channel-card" style="background:var(--color-obsidian-surface); border:1px solid var(--color-carbon-border); border-radius:var(--radius-cards); padding:1.5rem; display:flex; flex-direction:column; gap:1.25rem; box-shadow:0 8px 24px rgba(0,0,0,0.25);">
            <!-- Linha Superior: Avatar, Nomes e Edição de Apelido -->
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1.25rem;">
              <div style="display:flex; align-items:center; gap:1.1rem; min-width:260px;">
                <img src="${avatar}" style="width:64px; height:64px; border-radius:50%; object-fit:cover; border:2px solid var(--color-carbon-border); background:#181926;" alt="${displayName}">
                <div>
                  <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
                    <h3 style="font-size:1.2rem; font-weight:700; color:var(--color-frost-white); margin:0;">${displayName}</h3>
                    <span style="font-size:0.7rem; font-weight:700; background:rgba(52,211,153,0.15); color:#34d399; border:1px solid rgba(52,211,153,0.3); padding:2px 8px; border-radius:var(--radius-pill); font-family:var(--font-mono);">CONECTADO</span>
                  </div>
                  <div style="font-size:0.82rem; color:var(--color-fog-text); margin-top:3px; display:flex; align-items:center; gap:0.6rem;">
                    <span>${handle}</span>
                    <span>•</span>
                    <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--color-mist-text);">ID: ${c.id}</span>
                  </div>
                  ${c.alias && c.alias !== c.name ? `<div style="font-size:0.76rem; color:var(--color-mist-text); margin-top:2px;">Nome original: ${originalName}</div>` : ''}
                </div>
              </div>

              <!-- Box de Apelido Customizado -->
              <div style="background:#ffffff; border:1px solid var(--color-border-input); border-radius:var(--radius-inputs); padding:0.5rem 0.85rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <label style="font-size:0.75rem; font-weight:700; color:var(--color-fog-text); text-transform:uppercase; letter-spacing:0.05em;">Apelido:</label>
                <input type="text" id="alias-input-${c.id}" value="${escapeHtml(c.alias || '')}" placeholder="Ex: Canal Principal, Dark 01" style="background:transparent; border:none; outline:none; color:var(--color-frost-white); font-size:0.85rem; width:180px; font-weight:500;">
                <button type="button" class="btn-secondary btn-sm" onclick="saveChannelAlias('${c.id}')" style="font-size:0.78rem; padding:4px 10px;">Salvar</button>
              </div>
            </div>

            <!-- Grade de Métricas Reais do Canal -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:1rem;">
              <div style="background:#f8fafc; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); padding:1rem; text-align:center;">
                <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--color-fog-text); font-weight:700; display:block; margin-bottom:0.35rem;">Inscritos</span>
                <span style="font-size:1.6rem; font-weight:800; color:var(--color-frost-white); font-family:var(--font-mono);">${formatMetricNumber(c.subscribers)}</span>
              </div>
              <div style="background:#f8fafc; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); padding:1rem; text-align:center;">
                <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--color-fog-text); font-weight:700; display:block; margin-bottom:0.35rem;">Vídeos Publicados</span>
                <span style="font-size:1.6rem; font-weight:800; color:var(--color-frost-white); font-family:var(--font-mono);">${formatMetricNumber(c.videoCount)}</span>
              </div>
              <div style="background:#f8fafc; border:1px solid var(--color-carbon-border); border-radius:var(--radius-inputs); padding:1rem; text-align:center;">
                <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--color-fog-text); font-weight:700; display:block; margin-bottom:0.35rem;">Visualizações Totais</span>
                <span style="font-size:1.6rem; font-weight:800; color:var(--color-emerald-ok); font-family:var(--font-mono);">${formatMetricNumber(c.viewCount)}</span>
              </div>
            </div>

            <!-- Barra Inferior: Links e Ações -->
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--color-carbon-border); padding-top:0.85rem; flex-wrap:wrap; gap:0.75rem;">
              <a href="https://studio.youtube.com/channel/${c.id}" target="_blank" rel="noopener" style="color:var(--color-ultraviolet-key); font-size:0.82rem; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:0.35rem;">
                Abrir no YouTube Studio ↗
              </a>
              <div style="display:flex; align-items:center; gap:0.6rem;">
                <button type="button" class="btn-secondary btn-sm" onclick="refreshChannelMetrics('${c.id}')" title="Atualizar dados desta conta" style="font-size:0.78rem; padding:5px 12px; display:inline-flex; align-items:center; gap:0.35rem;">
                  <svg style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none;" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                  Sincronizar
                </button>
                <button type="button" class="btn-secondary btn-sm" onclick="deleteYouTubeChannel('${c.id}')" style="color:#f87171; border-color:rgba(239,68,68,0.25); font-size:0.78rem; padding:5px 12px;" title="Remover canal">
                  Desconectar Canal
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('[YouTube View Error]', err);
  }
}

async function saveChannelAlias(channelId) {
  const input = document.getElementById(`alias-input-${channelId}`);
  if (!input) return;
  const alias = input.value.trim();

  try {
    const res = await fetch('/api/youtube/channels/alias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, alias })
    });
    if (res.ok) {
      showToast('Apelido do canal atualizado com sucesso!', 3000);
      loadYouTubeChannelsView();
    } else {
      const err = await res.json();
      showToast(`Erro ao salvar apelido: ${err.error || 'Falha desconhecida'}`);
    }
  } catch (e) {
    showToast('Falha na conexão ao salvar apelido.');
  }
}

async function refreshChannelMetrics(channelId) {
  try {
    showToast('Sincronizando estatísticas com o YouTube...', 2500);
    const res = await fetch('/api/youtube/channels/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId })
    });
    if (res.ok) {
      showToast('Métricas atualizadas com sucesso!', 3000);
      loadYouTubeChannelsView();
    } else {
      const err = await res.json();
      showToast(`Erro: ${err.error || 'Falha ao atualizar métricas'}`);
    }
  } catch (e) {
    showToast('Falha na comunicação com o servidor.');
  }
}

async function refreshAllYouTubeMetrics() {
  if (!currentYouTubeData || !currentYouTubeData.channels || currentYouTubeData.channels.length === 0) {
    return showToast('Nenhum canal conectado para atualizar.');
  }
  showToast('Atualizando métricas de todos os canais...', 3000);
  for (const c of currentYouTubeData.channels) {
    try {
      await fetch('/api/youtube/channels/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: c.id })
      });
    } catch (e) {}
  }
  showToast('Todos os canais foram sincronizados!', 3000);
  loadYouTubeChannelsView();
}

async function deleteYouTubeChannel(channelId) {
  const ch = currentYouTubeData?.channels?.find(c => c.id === channelId);
  const name = ch ? (ch.alias || ch.name) : 'este canal';
  const confirmed = await showConfirmDialog({
    title: 'Desconectar Canal do YouTube',
    message: `Deseja realmente desconectar o canal "${name}"?`,
    confirmText: 'Desconectar Canal',
    cancelText: 'Cancelar',
    type: 'danger'
  });
  if (!confirmed) return;
  try {
    const res = await fetch('/api/youtube/channels/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId })
    });
    if (res.ok) {
      showToast('Canal removido com sucesso.', 4000);
      loadYouTubeChannelsView();
    }
  } catch (e) {
    showToast('Erro ao remover canal.');
  }
}

// Handler de Postagem Direta de Short no YouTube
async function handlePostYouTubeShort() {
  if (!currentProject) {
    return showToast('Abra um projeto no Estúdio para publicar.');
  }

  const channelSelect = document.getElementById('post-yt-channel-select');
  const privacySelect = document.getElementById('post-yt-privacy-select');
  const titleInput = document.getElementById('post-yt-title-input');
  const descInput = document.getElementById('post-yt-desc-input');
  const tagsInput = document.getElementById('post-yt-tags-input');
  const scheduleInput = document.getElementById('post-yt-publish-at');
  const btnPost = document.getElementById('btn-post-youtube-short');
  const statusBadge = document.getElementById('post-yt-status-badge');
  const linkContainer = document.getElementById('post-yt-published-link');

  const channelId = channelSelect?.value;
  if (!channelId) {
    return showToast('Selecione um canal de destino ou conecte um na aba YouTube.');
  }

  // Título
  const chosenTitle = (titleInput?.value || '').trim() || (currentProject.postCopy?.recommendedTitle || currentProject.name.replace(/_/g, ' '));
  if (!chosenTitle) {
    return showToast('Preencha o título do vídeo.');
  }

  // Descrição
  const description = (descInput?.value || '').trim();

  // Tags
  const rawTags = (tagsInput?.value || '').trim();
  const tags = rawTags ? rawTags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean) : ['shorts', 'viral'];

  // Modo e Data
  const mode = privacySelect?.value || 'public';
  let privacyStatus = 'public';
  let publishAt = null;

  if (mode === 'schedule') {
    const dateVal = scheduleInput?.value;
    if (!dateVal) {
      return showToast('Informe a data e o horário para agendar a publicação.');
    }
    const scheduleDate = new Date(dateVal);
    if (isNaN(scheduleDate.getTime()) || scheduleDate.getTime() <= Date.now() + 60000) {
      return showToast('A data de agendamento deve ser de pelo menos alguns minutos no futuro.');
    }
    publishAt = scheduleDate.toISOString();
    privacyStatus = 'private'; // No YouTube API v3, vídeos agendados iniciam como private com publishAt definido
  } else {
    privacyStatus = mode; // 'public', 'unlisted' ou 'private'
  }

  const ch = currentYouTubeData?.channels?.find(c => c.id === channelId);
  const channelName = ch ? (ch.alias || ch.name) : 'canal selecionado';

  const confirmMsg = mode === 'schedule'
    ? `Deseja agendar este Short no canal "${channelName}" para ${new Date(publishAt).toLocaleString('pt-BR')}?`
    : `Deseja publicar este Short no canal "${channelName}" com visibilidade "${privacyStatus.toUpperCase()}" agora?`;

  const confirmed = await showConfirmDialog({
    title: mode === 'schedule' ? 'Agendar Publicação no YouTube' : 'Publicar Short no YouTube',
    message: confirmMsg,
    confirmText: mode === 'schedule' ? '📅 Sim, Agendar' : '🚀 Sim, Publicar Agora',
    cancelText: 'Cancelar',
    type: 'info'
  });

  if (!confirmed) {
    return;
  }

  if (btnPost) {
    btnPost.disabled = true;
    btnPost.textContent = '🚀 Enviando ao YouTube...';
  }
  if (statusBadge) {
    statusBadge.textContent = mode === 'schedule' ? 'Agendando no YouTube...' : 'Enviando vídeo (pode levar alguns segundos)...';
    statusBadge.style.color = 'var(--color-ultraviolet-key)';
  }

  try {
    const res = await fetch('/api/youtube/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: currentProject.name,
        channelId,
        title: chosenTitle,
        description,
        tags,
        privacyStatus,
        publishAt,
        lang: (activeStudioTab !== 'base' ? activeStudioTab : 'pt')
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao postar no YouTube');

    const successMsg = mode === 'schedule'
      ? `🎉 Short agendado com sucesso para ${new Date(publishAt).toLocaleString('pt-BR')}!`
      : `🎉 Publicado com sucesso no YouTube: ${data.shortUrl}`;

    showToast(successMsg, 7000);
    if (statusBadge) {
      statusBadge.textContent = mode === 'schedule' ? 'Agendado no YouTube!' : 'Publicado com sucesso!';
      statusBadge.style.color = 'var(--color-emerald-ok)';
    }
    if (linkContainer && data.shortUrl) {
      linkContainer.innerHTML = `<a href="${data.shortUrl}" target="_blank" rel="noopener" style="color:var(--color-emerald-ok); text-decoration:underline;">Ver Short no YouTube: ${data.shortUrl} ↗</a>`;
    }

    await loadProjects();
  } catch (err) {
    showToast(`Erro na postagem: ${err.message}`, 5000);
    if (statusBadge) {
      statusBadge.textContent = `Erro: ${err.message}`;
      statusBadge.style.color = 'var(--color-code-rose)';
    }
  } finally {
    if (btnPost) {
      btnPost.disabled = false;
      const btnText = document.getElementById('btn-post-youtube-text');
      if (btnText) {
        btnText.textContent = mode === 'schedule' ? '📅 Agendar Short no YouTube' : '🚀 Publicar Short Agora';
      }
    }
  }
}

window.saveChannelAlias = saveChannelAlias;
window.refreshChannelMetrics = refreshChannelMetrics;
window.refreshAllYouTubeMetrics = refreshAllYouTubeMetrics;
window.deleteYouTubeChannel = deleteYouTubeChannel;
window.loadYouTubeChannelsView = loadYouTubeChannelsView;
window.handlePostYouTubeShort = handlePostYouTubeShort;








// --------------------------------------------------------------------------
// MULTI-IDIOMA NO ESTÚDIO (SUBMENUS GERAL, PT, ES + MODAL NOVO IDIOMA)
// --------------------------------------------------------------------------
const LANG_METADATA = {
  pt: { label: 'Português', flag: '🇧🇷' },
  es: { label: 'Espanhol', flag: '🇪🇸' },
  en: { label: 'Inglês', flag: '🇺🇸' }
};

function renderStudioLangTabs(project) {
  const tabsContainer = document.getElementById('studio-lang-tabs');
  if (!tabsContainer) return;

  const availableLangs = (project && project.availableLanguages && project.availableLanguages.length > 0)
    ? project.availableLanguages
    : ['pt'];

  if (activeStudioTab !== 'base' && !availableLangs.includes(activeStudioTab)) {
    activeStudioTab = availableLangs[0] || 'base';
  }

  // Restaura o idioma do estúdio vindo da URL, só para o projeto que estava aberto
  if (project && pendingStudioState.project && project.name === pendingStudioState.project) {
    const wanted = pendingStudioState.lang;
    if (wanted && (wanted === 'base' || availableLangs.includes(wanted))) {
      activeStudioTab = wanted;
    }
    pendingStudioState = { project: null, lang: null };
    syncUrlState();
  }

  let html = `
    <button type="button" class="studio-lang-tab-btn ${activeStudioTab === 'base' ? 'active' : ''}" data-lang="base" onclick="switchStudioTab('base')">
      Geral (Base)
    </button>
  `;

  availableLangs.forEach(lang => {
    const meta = LANG_METADATA[lang] || { label: lang.toUpperCase() };
    const langData = project && project.languages && project.languages[lang];
    const isReady = langData && (langData.urls?.vertical9x16 || langData.urls?.final || (lang === 'pt' && (project.hasVertical9x16 || project.hasFinal)));
    const isPostedLang = (project.postedLanguages && project.postedLanguages.includes(lang)) ||
                         (langData && langData.isPosted) ||
                         (project.info?.youtubeUploads && project.info.youtubeUploads[lang]) ||
                         (lang === 'pt' && (project.status === 'posted' || project.info?.status === 'posted' || project.info?.youtube));

    let badgeText = 'Pendente';
    let badgeBg = '#f1f5f9';
    let badgeBorder = '#e2e8f0';
    let badgeColor = '#64748b';

    if (isPostedLang) {
      badgeText = 'Postado';
      badgeBg = '#f5f3ff';
      badgeBorder = '#c4b5fd';
      badgeColor = '#6d28d9';
    } else if (isReady) {
      badgeText = 'Pronto';
      badgeBg = '#ecfdf5';
      badgeBorder = '#a7f3d0';
      badgeColor = '#059669';
    }

    html += `
      <button type="button" class="studio-lang-tab-btn ${activeStudioTab === lang ? 'active' : ''}" data-lang="${lang}" onclick="switchStudioTab('${lang}')">
        <span>${meta.label}</span>
        <span class="lang-status-pill" style="font-size:0.68rem; padding:1px 7px; border-radius:9999px; background:${badgeBg}; border:1px solid ${badgeBorder}; color:${badgeColor}; font-weight:700;">${badgeText}</span>
      </button>
    `;
  });

  tabsContainer.innerHTML = html;
  applyStudioTabVisibility();
}

function switchStudioTab(tabKey) {
  activeStudioTab = tabKey;
  syncUrlState();
  if (!currentProject) return;

  document.querySelectorAll('.studio-lang-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-lang') === tabKey) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  applyStudioTabVisibility();
}

function applyStudioTabVisibility() {
  const isBase = activeStudioTab === 'base';
  const geralItems = document.querySelectorAll('.stage-geral-item');
  const langItems = document.querySelectorAll('.stage-lang-item');

  if (isBase) {
    geralItems.forEach(el => el.style.display = '');
    langItems.forEach(el => el.style.display = 'none');
    if (currentProject) {
      const ptPostCopy = (currentProject.languages && currentProject.languages['pt'] && currentProject.languages['pt'].postCopy) || currentProject.postCopy;
      renderPostCopy({ ...currentProject, postCopy: ptPostCopy }, true);
      autoSelectYouTubeChannelForLang('pt');
    }
  } else {
    geralItems.forEach(el => el.style.display = 'none');
    langItems.forEach(el => el.style.display = '');
    updateLanguageStudioContent(activeStudioTab);
  }
}

function updateLanguageStudioContent(lang) {
  if (!currentProject) return;

  const langData = (currentProject.languages && currentProject.languages[lang]) || {};
  const meta = LANG_METADATA[lang] || { label: lang.toUpperCase(), flag: '🌐' };

  const titleStep4 = document.querySelector('#step-badge-4');
  if (titleStep4) titleStep4.innerHTML = `<span class="step-num">4</span> Storytelling (${meta.label})`;
  const btnTr = document.getElementById('btn-translate');
  if (btnTr) btnTr.textContent = `Adaptar para ${meta.label}`;

  const trText = langData.translation || (lang === 'pt' ? currentProject.translation : '');
  if (textTranslation) textTranslation.value = trText || '';

  const audioUrl = (langData.urls && langData.urls.audio) || (lang === 'pt' ? currentProject.urls?.audio : null);
  const finalUrl = (langData.urls && langData.urls.final) || (lang === 'pt' ? currentProject.urls?.final : null);
  const vertUrl = (langData.urls && (langData.urls.vertical9x16 || langData.urls.squareSubtitled)) || (lang === 'pt' ? (currentProject.urls?.vertical9x16 || currentProject.urls?.squareSubtitled) : null);

  updateMediaElement(playerAudio, audioUrl, statusAudio, `Áudio ${meta.label} pronto`);
  updateMediaElement(playerFinal, finalUrl, statusFinal, `Vídeo final ${meta.label} pronto`);
  updateMediaElement(playerSquareSub, vertUrl, statusSquareSub, `Vídeo 9:16 ${meta.label} pronto`);

  const postCopy = langData.postCopy || (lang === 'pt' ? currentProject.postCopy : null);
  renderPostCopy({ ...currentProject, postCopy }, true);

  autoSelectYouTubeChannelForLang(lang);
}

function autoSelectYouTubeChannelForLang(lang) {
  const selChannel = document.getElementById('post-yt-channel-select');
  if (!selChannel || !currentYouTubeData?.channels) return;

  const matched = currentYouTubeData.channels.find(c => {
    const n = ((c.alias || '') + ' ' + (c.name || '')).toLowerCase();
    if (lang === 'es' && (n.includes('espanhol') || n.includes('espanol') || n.includes('spanish') || n.includes('es '))) return true;
    if (lang === 'en' && (n.includes('ingl') || n.includes('english') || n.includes('en '))) return true;
    if (lang === 'pt' && (n.includes('brasil') || n.includes('portugues') || n.includes('português') || n.includes('pt '))) return true;
    return false;
  });

  if (matched) {
    selChannel.value = matched.id;
  }
}

function openAddStudioLangModal() {
  if (!currentProject) return showToast('Selecione um projeto primeiro.');
  const modal = document.getElementById('modal-add-studio-lang');
  const projLabel = document.getElementById('studio-add-lang-proj-name');
  if (projLabel) projLabel.textContent = currentProject.name;
  if (modal) modal.classList.remove('hidden');
}

function closeAddStudioLangModal() {
  const modal = document.getElementById('modal-add-studio-lang');
  if (modal) modal.classList.add('hidden');
}

async function handleConfirmStudioLangQueue() {
  if (!currentProject) return;
  const sel = document.getElementById('select-new-studio-lang');
  const chosenLang = sel ? sel.value : 'es';

  closeAddStudioLangModal();

  try {
    const res = await fetch('/api/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: currentProject.name,
        title: `${currentProject.name} [${chosenLang.toUpperCase()}]`,
        languages: [chosenLang],
        fromStep: 'translate'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao enfileirar');
    showToast(`🚀 Projeto adicionado à fila para gerar em ${chosenLang.toUpperCase()} a partir da tradução!`);
    switchTab('tab-queue');
  } catch (err) {
    showToast(`Erro: ${err.message}`);
  }
}

async function handleConfirmStudioLangTab() {
  if (!currentProject) return;
  const sel = document.getElementById('select-new-studio-lang');
  const chosenLang = sel ? sel.value : 'es';

  closeAddStudioLangModal();

  try {
    const res = await fetch('/api/project/add-language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: currentProject.name, lang: chosenLang })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao adicionar idioma');

    showToast(`Aba ${chosenLang.toUpperCase()} adicionada ao projeto!`);
    await loadProjects(currentProject.name);
    switchStudioTab(chosenLang);
  } catch (err) {
    showToast(`Erro: ${err.message}`);
  }
}

window.switchStudioTab = switchStudioTab;
window.openAddStudioLangModal = openAddStudioLangModal;
window.closeAddStudioLangModal = closeAddStudioLangModal;
window.handleConfirmStudioLangQueue = handleConfirmStudioLangQueue;
window.handleConfirmStudioLangTab = handleConfirmStudioLangTab;
window.openAddToQueueModal = openAddToQueueModal;
window.closeAddToQueueModal = closeAddToQueueModal;
window.confirmAddToQueue = confirmAddToQueue;
