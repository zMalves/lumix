/**
 * vmake_pool.js - Gerenciador de Concorrência e Fila da API VMake (Limite de 4 tarefas simultâneas)
 * Garante que nunca mais de 4 vídeos estejam sendo enviados/processados no VMake ao mesmo tempo.
 *
 * O limite vale entre processos: cada vídeo da fila roda em um processo Node separado
 * (fila -> auto_pilot_pipeline.js -> remove-watermark.js), então as vagas são arquivos de trava
 * numa pasta compartilhada (VMAKE_SLOTS_DIR, padrão: pasta temporária do sistema).
 * Uma vaga cujo processo dono morreu (ex.: cancelado com SIGKILL) é liberada automaticamente.
 */

const EventEmitter = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { VMakeApiClient } = require('./scripts/vmake_api_client.js');

const SLOTS_DIR = process.env.VMAKE_SLOTS_DIR || path.join(os.tmpdir(), 'lumix_vmake_slots');
const SLOT_WAIT_MS = 5000;
const SLOT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // vaga mais velha que isso é considerada abandonada

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM'; // existe, mas pertence a outro usuário
  }
}

// Vagas ocupadas por este processo, liberadas também numa saída normal ou por erro
const heldSlots = new Set();
process.on('exit', () => {
  for (const slot of heldSlots) {
    try { fs.unlinkSync(slot); } catch (_) {}
  }
});

function tryAcquireSlot(slotPath, jobId) {
  try {
    const fd = fs.openSync(slotPath, 'wx');
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, jobId, since: new Date().toISOString() }));
    fs.closeSync(fd);
    heldSlots.add(slotPath);
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }

  // Vaga ocupada: libera se o dono morreu ou se ela foi abandonada
  try {
    const info = JSON.parse(fs.readFileSync(slotPath, 'utf-8'));
    const age = Date.now() - new Date(info.since).getTime();
    if (!isProcessAlive(info.pid) || !(age < SLOT_MAX_AGE_MS)) {
      fs.unlinkSync(slotPath);
    }
  } catch (e) {
    // Arquivo ilegível (escrita interrompida) e com mais de 1 min: descarta
    try {
      if (Date.now() - fs.statSync(slotPath).mtimeMs > 60000) fs.unlinkSync(slotPath);
    } catch (_) {}
  }
  return false;
}

async function acquireGlobalSlot(concurrency, jobId, onWait) {
  fs.mkdirSync(SLOTS_DIR, { recursive: true });
  let warned = false;
  while (true) {
    for (let i = 0; i < concurrency; i++) {
      const slotPath = path.join(SLOTS_DIR, `slot_${i}.lock`);
      if (tryAcquireSlot(slotPath, jobId)) return slotPath;
    }
    if (!warned && typeof onWait === 'function') {
      onWait({ message: `Aguardando vaga no VMake (${concurrency}/${concurrency} em uso)...`, percent: 2 });
      warned = true;
    }
    await new Promise(r => setTimeout(r, SLOT_WAIT_MS));
  }
}

function releaseGlobalSlot(slotPath) {
  if (!slotPath) return;
  heldSlots.delete(slotPath);
  try { fs.unlinkSync(slotPath); } catch (_) {}
}

class VMakePool extends EventEmitter {
  constructor(concurrency = 4) {
    super();
    this.concurrency = concurrency;
    this.queue = [];
    this.activeTasks = new Map(); // taskId -> job info
    this.client = null;
  }

  getClient() {
    if (!this.client) {
      const ak = process.env.VMAKE_AK || process.env.MT_AK;
      const sk = process.env.VMAKE_SK || process.env.MT_SK;
      this.client = new VMakeApiClient(ak, sk);
    }
    return this.client;
  }

  /**
   * Adiciona um vídeo à fila do VMake
   * @param {string} inputVideoPath Caminho para original.mp4
   * @param {string} outputVideoPath Caminho de saída sem_marca.mp4
   * @param {string} materialId 'SKM0002' (Legendas) ou 'SKM0005'/'SKM0007'
   * @param {function} onProgress Callback de status
   * @returns {Promise<object>}
   */
  enqueue(inputVideoPath, outputVideoPath, materialId = 'SKM0002', onProgress = null) {
    return new Promise((resolve, reject) => {
      const jobId = 'vmake_job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const job = {
        id: jobId,
        inputVideoPath,
        outputVideoPath,
        materialId,
        onProgress,
        resolve,
        reject,
        status: 'queued',
        progress: 0,
        enqueuedAt: Date.now()
      };

      this.queue.push(job);
      this.emit('job_enqueued', job);
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.activeTasks.size >= this.concurrency) {
      return; // Já atingiu o limite de 4 simultâneos neste processo
    }

    if (this.queue.length === 0) {
      return; // Nada na fila
    }

    const job = this.queue.shift();
    this.activeTasks.set(job.id, job);
    job.status = 'processing';
    this.emit('job_started', job);

    const report = (progressInfo) => {
      job.progress = progressInfo.percent || job.progress;
      job.statusText = progressInfo.message;
      if (typeof job.onProgress === 'function') {
        job.onProgress(progressInfo);
      }
      this.emit('job_progress', { id: job.id, ...progressInfo });
    };

    let slot = null;
    try {
      // Vaga global: respeita o limite somando todos os processos que usam o VMake
      slot = await acquireGlobalSlot(this.concurrency, job.id, report);

      const client = this.getClient();
      const result = await client.cleanVideo(
        job.inputVideoPath,
        job.outputVideoPath,
        job.materialId,
        report
      );

      job.status = 'completed';
      job.resolve(result);
      this.emit('job_completed', { id: job.id, result });
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      job.reject(err);
      this.emit('job_failed', { id: job.id, error: err.message });
    } finally {
      releaseGlobalSlot(slot);
      this.activeTasks.delete(job.id);
      // Processa o próximo da fila assim que liberar vaga
      this._processQueue();
    }
  }

  getStatus() {
    return {
      concurrencyLimit: this.concurrency,
      activeCount: this.activeTasks.size,
      queuedCount: this.queue.length,
      activeJobs: Array.from(this.activeTasks.values()).map(j => ({
        id: j.id,
        input: path.basename(path.dirname(j.inputVideoPath)),
        progress: j.progress,
        statusText: j.statusText
      })),
      queuedJobs: this.queue.map(j => ({
        id: j.id,
        input: path.basename(path.dirname(j.inputVideoPath)),
        enqueuedAt: j.enqueuedAt
      }))
    };
  }
}

// Singleton global para a aplicação
const globalVMakePool = new VMakePool(4);

module.exports = {
  VMakePool,
  vmakePool: globalVMakePool,
  acquireGlobalSlot,
  releaseGlobalSlot
};
