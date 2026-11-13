/**
 * vmake_pool.js - Gerenciador de Concorrência e Fila da API VMake (Limite de 4 tarefas simultâneas)
 * Garante que nunca mais de 4 vídeos estejam sendo enviados/processados no VMake ao mesmo tempo.
 */

const EventEmitter = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const { VMakeApiClient } = require('./scripts/vmake_api_client.js');

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
      return; // Já atingiu o limite de 4 simultâneos
    }

    if (this.queue.length === 0) {
      return; // Nada na fila
    }

    const job = this.queue.shift();
    this.activeTasks.set(job.id, job);
    job.status = 'processing';
    this.emit('job_started', job);

    try {
      const client = this.getClient();
      const result = await client.cleanVideo(
        job.inputVideoPath,
        job.outputVideoPath,
        job.materialId,
        (progressInfo) => {
          job.progress = progressInfo.percent || job.progress;
          job.statusText = progressInfo.message;
          if (typeof job.onProgress === 'function') {
            job.onProgress(progressInfo);
          }
          this.emit('job_progress', { id: job.id, ...progressInfo });
        }
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
  vmakePool: globalVMakePool
};

