/**
 * queue_manager.js - Gerenciador de Fila Paralela de Produção LUMIX
 * Controla concorrência de até 4 vídeos simultâneos nas etapas pesadas (Download + VMake API),
 * continuando de forma contínua pelo restante do pipeline (Whisper -> TTS WStudios -> 9:16 Render -> Copys).
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

// Encerra o pipeline e todos os processos filhos dele (ffmpeg, Python, síntese de voz)
function killProcessTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGKILL'); // PID negativo = grupo inteiro (spawn com detached)
    }
  } catch (e) {
    try { child.kill('SIGKILL'); } catch (_) {}
  }
}

class ProductionQueue {
  constructor(rootDir, videosDir, maxConcurrent = 4) {
    this.rootDir = rootDir;
    this.videosDir = videosDir;
    this.stateFile = path.join(videosDir, 'production_queue.json');
    this.maxConcurrent = maxConcurrent;
    this.items = [];
    this.activeProcesses = new Map(); // id -> childProcess
    this.isPaused = false;

    this.loadState();

    // Dispara processamento de itens pendentes no boot
    setTimeout(() => this.processNext(), 1500);

    // Watchdog contínuo: a cada 4s garante que a fila nunca fique travada com itens pendentes
    setInterval(() => {
      if (!this.isPaused && this.activeProcesses.size < this.maxConcurrent) {
        const hasPending = this.items.some(i => i.status === 'pending');
        if (hasPending) {
          this.processNext();
        }
      }
    }, 4000);
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = fs.readFileSync(this.stateFile, 'utf-8');
        const data = JSON.parse(raw);
        this.items = Array.isArray(data.items) ? data.items : [];
        // Se o servidor reiniciou com itens em processamento, verifica se já havia concluído
        this.items.forEach(item => {
          if (item.status === 'processing') {
            const hasSuccessLog = Array.isArray(item.logs) && item.logs.some(l => typeof l === 'string' && (l.includes('PRODUÇÃO CONCLUÍDA') || l.includes('SUCESSO TOTAL')));
            if (hasSuccessLog || item.progress === 100) {
              item.status = 'completed';
              item.progress = 100;
              item.currentStep = 'Finalizado com Sucesso!';
              item.finishedAt = item.finishedAt || new Date().toISOString();
            } else {
              item.status = 'pending';
              item.currentStep = 'Aguardando worker...';
            }
          }
        });
      }
    } catch (e) {
      console.error('[Queue] Erro ao carregar estado da fila:', e.message);
      this.items = [];
    }
  }

  saveState() {
    try {
      const data = {
        updatedAt: new Date().toISOString(),
        items: this.items
      };
      fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Queue] Erro ao salvar estado da fila:', e.message);
    }
  }

  addItem({ target, title, thumbnail, fromStep = null, languages = ['pt'], withMusic = true }) {
    if (!target) throw new Error('Alvo necessário para adicionar à fila');

    const cleanTarget = target.trim();
    const id = 'queue_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const safeLanguages = Array.isArray(languages) && languages.length ? languages : ['pt'];
    const safeWithMusic = withMusic !== undefined ? Boolean(withMusic) : true;

    let displayTitle = title;
    if (!displayTitle) {
      if (cleanTarget.startsWith('http')) {
        const urlMatch = cleanTarget.match(/(?:shorts\/|v=)([a-zA-Z0-9_-]{11})/);
        const igMatch = cleanTarget.match(/instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/i);
        if (urlMatch) displayTitle = `Short YouTube (${urlMatch[1]})`;
        else if (igMatch) displayTitle = `Instagram (${igMatch[1]})`;
        else displayTitle = cleanTarget;
      } else {
        displayTitle = cleanTarget.replace(/_/g, ' ');
      }
    }

    if (fromStep) {
      const stepNames = {
        transcribe: 'Transcrição',
        translate: 'Tradução',
        tts: 'Narração TTS',
        trim: 'Corte de Silêncios',
        cut: 'Cortes Rítmicos',
        merge: 'Mesclar Áudio+Vídeo',
        render_9x16: 'Render 9:16 + Legendas',
        post_copy: 'Copys Virais'
      };
      const label = stepNames[fromStep] || fromStep;
      displayTitle += ` 🔄 [A partir de: ${label}]`;
    }

    const newItem = {
      id,
      target: cleanTarget,
      title: displayTitle,
      thumbnail: thumbnail || null,
      fromStep: fromStep || null,
      languages: safeLanguages,
      withMusic: safeWithMusic,
      status: 'pending',
      currentStep: 'Na fila de espera',
      progress: 0,
      logs: [],
      error: null,
      projectFolder: cleanTarget.startsWith('http') ? null : cleanTarget,
      addedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null
    };

    this.items.push(newItem);
    this.saveState();

    // Dispara alocação de slots imediatamente
    process.nextTick(() => this.processNext());

    const pendingCount = this.items.filter(i => i.status === 'pending').length;
    return {
      item: newItem,
      position: pendingCount
    };
  }

  removeItem(id) {
    const idx = this.items.findIndex(i => i.id === id);
    if (idx === -1) return false;

    // Se estiver processando ativamente, cancela o processo
    if (this.activeProcesses.has(id)) {
      this.cancelItem(id);
      return true;
    }

    this.items.splice(idx, 1);
    this.saveState();
    return true;
  }

  cancelItem(id) {
    const item = this.items.find(i => i.id === id);
    const child = this.activeProcesses.get(id);

    if (item) {
      item.status = 'cancelled';
      item.currentStep = 'Cancelado pelo usuário';
      item.finishedAt = new Date().toISOString();
    }

    if (child) {
      killProcessTree(child);
      this.activeProcesses.delete(id);
    }

    this.saveState();

    // Libera vaga para o próximo da fila
    setTimeout(() => this.processNext(), 1000);
    return true;
  }

  cancelCurrent() {
    // Se chamado sem ID, cancela o primeiro processo ativo
    const firstActiveId = this.activeProcesses.keys().next().value;
    if (firstActiveId) {
      return this.cancelItem(firstActiveId);
    }
    return false;
  }

  clearHistory() {
    this.items = this.items.filter(i => i.status === 'pending' || i.status === 'processing');
    this.saveState();
    return true;
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    this.processNext();
  }

  /**
   * Dispara workers respeitando o limite de até 4 simultâneos
   */
  processNext() {
    if (this.isPaused) return;

    // Enquanto houver vagas no limite de 4 simultâneos e houver itens pendentes:
    while (this.activeProcesses.size < this.maxConcurrent) {
      const nextItem = this.items.find(i => i.status === 'pending');
      if (!nextItem) break;

      this._startItem(nextItem);
    }
  }

  _startItem(item) {
    item.status = 'processing';
    item.startedAt = new Date().toISOString();
    item.currentStep = 'Inicializando pipeline...';
    item.progress = 5;
    item.stagePct = 5;
    this.saveState();

    console.log(`\n[Queue Manager] 🚀 [Slot ${this.activeProcesses.size + 1}/${this.maxConcurrent}] Iniciando: "${item.title}" (${item.target})`);

    const runnerScript = path.join(this.rootDir, 'scripts', 'auto_pilot_pipeline.js');
    const spawnArgs = [runnerScript, item.target];
    if (item.fromStep) {
      spawnArgs.push('--from-step', String(item.fromStep));
    }
    if (item.languages && item.languages.length) {
      spawnArgs.push('--languages', item.languages.join(','));
    }
    if (item.withMusic !== undefined) {
      spawnArgs.push('--with-music', item.withMusic ? 'true' : 'false');
    }
    const child = spawn(process.execPath, spawnArgs, {
      cwd: this.rootDir,
      env: { ...process.env, LUMIX_WORKER: '1' },
      // Grupo de processos próprio (Linux/Docker): permite cancelar o pipeline junto com
      // os ffmpeg/Whisper que ele abriu, em vez de deixá-los órfãos consumindo CPU
      detached: process.platform !== 'win32'
    });

    this.activeProcesses.set(item.id, child);

    child.stdout.on('data', chunk => {
      const text = chunk.toString();
      this.appendLog(item, text);
      this.applyStageFromLog(item, text);
    });

    child.stderr.on('data', chunk => {
      const text = chunk.toString();
      this.appendLog(item, '[ERR] ' + text);
      this.applyStageFromLog(item, text);
    });

    child.on('close', code => {
      console.log(`[Queue Manager] 🏁 Item finalizado (código ${code}): "${item.title}"`);
      this.activeProcesses.delete(item.id);

      if (item.status !== 'cancelled') {
        if (code === 0) {
          item.status = 'completed';
          item.progress = 100;
          item.currentStep = 'Finalizado com Sucesso!';
          item.finishedAt = new Date().toISOString();
        } else {
          item.status = 'failed';
          item.error = `Pipeline encerrou com código ${code}`;
          item.finishedAt = new Date().toISOString();
        }
      }

      this.saveState();

      // Imediatamente engata o próximo vídeo pendente da fila!
      setTimeout(() => this.processNext(), 1500);
    });
  }

  /**
   * Guarda a saída do pipeline no log do item. As linhas de progresso do ffmpeg
   * ("frame= ... time= ... speed=") substituem a anterior em vez de se acumular:
   * antes elas enchiam o limite de 250 entradas e apagavam todo o resto do log.
   */
  appendLog(item, text) {
    const isFfmpegProgress = (t) => /frame=\s*\d+.*time=/.test(t);
    const last = item.logs[item.logs.length - 1];
    if (isFfmpegProgress(text) && typeof last === 'string' && isFfmpegProgress(last)) {
      item.logs[item.logs.length - 1] = text;
      return;
    }
    item.logs.push(text);
    if (item.logs.length > 250) item.logs.shift();
  }

  /**
   * Atualiza etapa e progresso do item a partir da saída do pipeline.
   *
   * O progresso geral nunca volta: com vários idiomas, as etapas por idioma dividem
   * a faixa de 60% a 99% entre eles (ex.: PT vai de 60% a ~80% e ES de ~80% a 99%).
   * Antes cada idioma recomeçava em 68%, o que dava a impressão de que o vídeo estava em loop.
   * `stagePct` mantém o percentual da etapa (sem considerar o idioma) para os passos do painel.
   */
  applyStageFromLog(item, text) {
    const langMatch = text.match(/para o idioma:\s*\[([A-Z]{2,5})\]/i);
    if (langMatch && langMatch[1]) {
      item.activeLang = langMatch[1].toUpperCase();
    }

    const langs = (Array.isArray(item.languages) && item.languages.length ? item.languages : ['pt']).map(l => String(l).toLowerCase());
    const langIdx = item.activeLang ? Math.max(0, langs.indexOf(item.activeLang.toLowerCase())) : 0;
    const langLabel = item.activeLang
      ? (langs.length > 1 ? `[${item.activeLang} ${langIdx + 1}/${langs.length}] ` : `[${item.activeLang}] `)
      : '';

    // [marcador, texto da etapa, % da etapa, fração dentro do idioma (null = etapa geral)]
    const stages = [
      ['[INÍCIO]', 'Iniciando Pipeline LUMIX', 8, null],
      ['[DOWNLOAD]', 'Baixando vídeo original em HD', 18, null],
      ['[VMAKE]', 'Limpeza IA (VMake API 4x Slots)', 35, null],
      ['[VALIDAÇÃO_1]', 'Auditoria Visual dos Frames', 45, null],
      ['[TRANSCRIÇÃO]', 'Transcrição OpenAI Whisper API', 55, null],
      ['[CORTES]', 'Cálculo de Cortes Rítmicos da Timeline', 60, null],
      ['[TRADUÇÃO]', 'Storytelling Viral & Roteiro', 68, 0.05],
      ['[VOZ]', 'Síntese de Voz WStudios V4', 78, 0.25],
      ['[ÁUDIO]', 'Higienização e Corte de Silêncios', 84, 0.45],
      ['[SINCRONIA]', 'Mesclagem e Sincronização Áudio-Vídeo', 90, 0.55],
      ['[LEGENDAS]', 'Geração de Legendas Dinâmicas', 94, 0.7],
      ['[RENDER]', 'Renderização Master 9:16 Vertical', 97, 0.8],
      ['[COPYS]', 'Geração do Kit de Publicação & Títulos', 99, 0.95]
    ];

    if (text.includes('[SUCESSO]')) {
      item.currentStep = 'Concluído com Sucesso!';
      item.progress = 100;
      item.stagePct = 100;
      const matchFile = text.match(/Arquivo Final:\s*([^\r\n]+)/);
      if (matchFile && matchFile[1]) {
        const parts = matchFile[1].split(/[\\/]/);
        const vIdx = parts.indexOf('videos');
        if (vIdx !== -1 && parts[vIdx + 1]) {
          item.projectFolder = parts[vIdx + 1];
        }
      }
      return;
    }

    const stage = stages.find(s => text.includes(s[0]));
    if (!stage) return;
    const [marker, label, stagePct, langFraction] = stage;

    item.currentStep = langFraction === null ? label : `${langLabel}${label}`;
    item.stagePct = stagePct;
    const overall = langFraction === null
      ? stagePct
      : Math.round(60 + 39 * (langIdx + langFraction) / langs.length);
    item.progress = Math.max(item.progress || 0, overall);

    if (marker === '[INÍCIO]' && !item.target.startsWith('http://') && !item.target.startsWith('https://')) {
      item.projectFolder = item.target.trim();
    }
    if (marker === '[DOWNLOAD]') {
      const folderMatch = text.match(/Identificado projeto na pasta:\s*([^\r\n]+)/);
      if (folderMatch && folderMatch[1]) {
        item.projectFolder = folderMatch[1].trim();
      }
    }
  }

  getStatus() {
    const activeList = this.items.filter(i => i.status === 'processing');
    const pending = this.items.filter(i => i.status === 'pending');
    const completed = this.items.filter(i => i.status === 'completed');
    const failed = this.items.filter(i => i.status === 'failed' || i.status === 'cancelled');

    return {
      active: activeList[0] || null, // retrocompatibilidade
      activeList: activeList,        // lista com até 4 itens rodando simultâneos
      concurrencyLimit: this.maxConcurrent,
      runningCount: activeList.length,
      pending,
      completed,
      failed,
      totalPending: pending.length + activeList.length,
      isProcessing: activeList.length > 0,
      isPaused: this.isPaused
    };
  }
}

module.exports = { ProductionQueue, killProcessTree };
