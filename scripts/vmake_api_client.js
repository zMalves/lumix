/**
 * scripts/vmake_api_client.js
 * 
 * Official VMake Developer API SDK implemented natively in Node.js.
 * Handles:
 * 1. HMAC-SHA256 request signing
 * 2. Remote config & catalog fetching (SKM0002 subtitle removal, SKM0005 smart pro, SKM0007 watermark removal)
 * 3. STS token policy acquisition for Alibaba Cloud OSS
 * 4. Video upload directly to OSS (kapkap-common bucket)
 * 5. Quota consumption check (/skill/consume.json)
 * 6. Task submission (/api/sdk/task/run_async)
 * 7. Real-time status polling (/api/sdk/task/status), com tempo máximo
 * 8. Automatic download of the cleaned MP4 result, validado com ffprobe
 *
 * Retomada: depois do envio, o Task ID fica salvo em vmake_task.json na pasta do projeto.
 * Se o processo cair durante o processamento, a próxima execução volta a consultar a
 * mesma tarefa em vez de reenviar o vídeo e gastar outro crédito.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const OSS = require('ali-oss');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Tempo máximo esperando o VMake processar uma tarefa (padrão 60 min, ajustável no .env)
const POLL_TIMEOUT_MS = (parseFloat(process.env.VMAKE_POLL_TIMEOUT_MIN) || 60) * 60 * 1000;
// Falhas de rede seguidas toleradas no polling antes de desistir (~5 min a 10s cada)
const MAX_CONSECUTIVE_POLL_ERRORS = 30;
// Uma tarefa salva só é retomada se foi enviada há menos de 6h
const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const TASK_STATE_FILE = 'vmake_task.json';

function hmacSha256(key, str) {
  return crypto.createHmac('sha256', key).update(str).digest('hex');
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Duração em segundos via ffprobe. Retorna NaN se o arquivo não for um vídeo legível,
 * ou null se o ffprobe não estiver instalado.
 */
function probeDuration(filePath) {
  const r = spawnSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'format=duration:stream=codec_type',
    '-of', 'default=noprint_wrappers=1',
    filePath
  ], { encoding: 'utf-8', timeout: 60000 });
  if (r.error && r.error.code === 'ENOENT') return null;
  const out = r.stdout || '';
  if (r.status !== 0 || !out.includes('codec_type=video')) return NaN;
  const m = out.match(/duration=([\d.]+)/);
  return m ? parseFloat(m[1]) : NaN;
}

/**
 * Confere se o vídeo limpo é legível e tem a duração do original.
 * Pega downloads truncados e respostas que não são vídeo.
 */
function validateCleanVideo(cleanPath, originalPath) {
  if (!fs.existsSync(cleanPath) || fs.statSync(cleanPath).size < 10 * 1024) {
    throw new Error(`Vídeo limpo ausente ou vazio: ${cleanPath}`);
  }
  const cleanDur = probeDuration(cleanPath);
  if (cleanDur === null) {
    console.warn('[VMake API] ffprobe não encontrado: validação do vídeo limpo ignorada.');
    return { cleanDur: null, origDur: null };
  }
  if (!Number.isFinite(cleanDur) || cleanDur <= 0) {
    throw new Error(`Vídeo limpo ilegível ou corrompido: ${cleanPath}`);
  }
  const origDur = originalPath ? probeDuration(originalPath) : null;
  if (Number.isFinite(origDur) && origDur > 0) {
    const tolerance = Math.max(2, origDur * 0.1);
    if (Math.abs(cleanDur - origDur) > tolerance) {
      throw new Error(`Duração do vídeo limpo (${cleanDur.toFixed(1)}s) diverge do original (${origDur.toFixed(1)}s): provável download incompleto.`);
    }
  }
  return { cleanDur, origDur };
}

function readTaskState(statePath, inputVideoPath, materialId) {
  try {
    if (!fs.existsSync(statePath)) return null;
    const s = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    const inputSize = fs.statSync(inputVideoPath).size;
    const fresh = Date.now() - new Date(s.submittedAt).getTime() < RESUME_MAX_AGE_MS;
    if (s.taskId && s.materialId === materialId && s.inputSize === inputSize && fresh) return s;
  } catch (_) {}
  return null;
}

function writeTaskState(statePath, data) {
  try { fs.writeFileSync(statePath, JSON.stringify(data, null, 2), 'utf-8'); } catch (_) {}
}

function clearTaskState(statePath) {
  try { if (fs.existsSync(statePath)) fs.unlinkSync(statePath); } catch (_) {}
}

class VMakeApiClient {
  constructor(ak, sk) {
    // Chaves somente via .env (VMAKE_AK / VMAKE_SK)
    this.ak = ak || process.env.VMAKE_AK || process.env.MT_AK || '';
    this.sk = sk || process.env.VMAKE_SK || process.env.MT_SK || '';

    if (!this.ak || !this.sk) {
      throw new Error('VMake API keys missing: please configure MT_AK and MT_SK.');
    }

    this.wapiEndpoint = 'wapi-skill.vmake.ai';
    this.strategyEndpoint = 'strategy.stariidata.com';
    this.gid = '';
    this.catalog = null;
    this.aiPolicy = null;
    this.storagePolicy = null;
  }

  sign(urlStr, method, headers = {}, body = '') {
    const u = new URL(urlStr);
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    headers['X-Sdk-Date'] = dateStr;
    headers['Host'] = u.host;

    const signedHeaders = Object.keys(headers).map(k => k.toLowerCase()).sort();
    const signedHeadersStr = signedHeaders.join(';');
    const lowHeaders = {};
    for (const k of Object.keys(headers)) lowHeaders[k.toLowerCase()] = String(headers[k]).trim();
    const canonicalHeaders = signedHeaders.map(k => k + ':' + lowHeaders[k]).join('\n');

    let p = u.pathname;
    if (!p || !p.endsWith('/')) p += '/';

    let queryStr = '';
    if (u.search && u.search.length > 1) {
      const params = Array.from(u.searchParams.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      queryStr = params.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
    }

    const hexBody = sha256(body);
    const canonicalRequest = `${method}\n${p}\n${queryStr}\n${canonicalHeaders}\n${signedHeadersStr}\n${hexBody}`;
    const stringToSign = `SDK-HMAC-SHA256\n${dateStr}\n${sha256(canonicalRequest)}`;
    const signature = hmacSha256(this.sk, stringToSign);
    const authHeader = `SDK-HMAC-SHA256 Access=${this.ak}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;
    headers['Authorization'] = 'Bearer ' + Buffer.from(authHeader).toString('base64');
    return headers;
  }

  request(urlStr, method = 'GET', headers = {}, body = '') {
    return new Promise((resolve, reject) => {
      const reqHeaders = {
        'User-Agent': 'action-api-sdk-v1.0.0',
        ...headers
      };
      this.sign(urlStr, method, reqHeaders, body);

      const u = new URL(urlStr);
      const req = https.request(urlStr, { method, headers: reqHeaders, family: 4 }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ status: res.statusCode, data: json });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  async fetchConfig() {
    const res = await this.request(
      `https://${this.wapiEndpoint}/skill/config.json`,
      'POST',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ gid: this.gid, version: 'v2.0.1', supported_schemas: ['v2', 'v1'] })
    );

    if (res.data?.meta?.code !== 0) {
      throw new Error(`VMake fetchConfig failed: ${res.data?.meta?.msg || 'code ' + res.data?.meta?.code}`);
    }

    this.gid = res.data?.response?.gid || this.gid;
    this.catalog = res.data?.response?.algorithm?.invoke || {};
    return res.data?.response;
  }

  async getStorageAndAiStrategy() {
    const res = await this.request(
      `https://${this.strategyEndpoint}/ai/token_policy?type=mtai`,
      'GET'
    );

    if (res.data?.code !== 0) {
      throw new Error(`VMake getStrategy failed: ${res.data?.msg || res.status}`);
    }

    const mtai = res.data?.data?.mtai;
    const uploadOrder = mtai?.upload?.order?.[0];
    this.storagePolicy = mtai?.upload?.[uploadOrder];

    const apiOrder = mtai?.api?.order?.[0];
    this.aiPolicy = mtai?.api?.[apiOrder];

    return { storagePolicy: this.storagePolicy, aiPolicy: this.aiPolicy };
  }

  async uploadFileToOSS(filePath, onProgress = null) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found for upload: ${filePath}`);
    }

    const { storagePolicy } = await this.getStorageAndAiStrategy();
    const creds = storagePolicy.credentials;

    const client = new OSS({
      endpoint: 'oss-accelerate.aliyuncs.com', // Rota com Aceleração Global (Diga adeus a timeouts no Brasil)
      accessKeyId: creds.access_key,
      accessKeySecret: creds.secret_key,
      stsToken: creds.session_token,
      bucket: storagePolicy.bucket,
      timeout: 120000,
      retry: 3
    });

    // Upload seguro em partes paralelas (multipartUpload) com Aceleração Global
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await client.multipartUpload(storagePolicy.key, filePath, {
          partSize: 1024 * 1024 * 2, // 2MB por chunk
          parallel: 2
        });

        if (result.res && (result.res.status === 200 || result.res.status === 204)) {
          return storagePolicy.data; // The public access URL
        }
        throw new Error(`OSS MultipartUpload status: ${result.res ? result.res.status : 'desconhecido'}`);
      } catch (err) {
        lastError = err;
        console.warn(`[VMake OSS Upload] Tentativa ${attempt}/3 falhou: ${err.message}. Aguardando 2s para retry...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    throw lastError || new Error(`OSS PutObject failed after 3 attempts`);
  }

  async consumeQuota(mediaUrl, materialId = 'SKM0002') {
    const res = await this.request(
      `https://${this.wapiEndpoint}/skill/consume.json`,
      'POST',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ url: mediaUrl, task: materialId, gid: this.gid })
    );

    if (res.data?.meta?.code !== 0) {
      throw new Error(`VMake consume quota failed: ${res.data?.meta?.msg || res.data?.meta?.code}`);
    }

    return res.data?.response;
  }

  async submitTask(mediaUrl, materialId = 'SKM0002', context = '') {
    if (!this.aiPolicy) {
      await this.getStorageAndAiStrategy();
    }
    if (!this.catalog) {
      await this.fetchConfig();
    }

    const spec = this.catalog[materialId] || {};
    const task = spec.task || 'videosubtitle_remove_async';
    const taskType = spec.task_type || 'mtlab';
    const params = spec.params || {};

    const payload = {
      params: JSON.stringify(params),
      context: context,
      task: task,
      task_type: taskType,
      sync_timeout: this.aiPolicy.sync_timeout || 60,
      init_images: [{ url: mediaUrl }]
    };

    const pushUrl = `${this.aiPolicy.url}/${this.aiPolicy.push_path}`;
    const bodyStr = JSON.stringify(payload);

    const res = await this.request(
      pushUrl,
      'POST',
      { 'Content-Type': 'application/json' },
      bodyStr
    );

    if (res.status !== 200 || !res.data?.data) {
      throw new Error(`VMake task submission failed: ${JSON.stringify(res.data || res.raw)}`);
    }

    const taskData = res.data.data;
    // status 9 means async queued, result.id contains the task ID
    if (taskData.status === 9 && taskData.result?.id) {
      return taskData.result.id;
    }

    if (taskData.result?.id) {
      return taskData.result.id;
    }

    throw new Error(`Unexpected task submission response: ${JSON.stringify(taskData)}`);
  }

  async pollTask(taskId, onProgress = null, timeoutMs = POLL_TIMEOUT_MS) {
    if (!this.aiPolicy) {
      await this.getStorageAndAiStrategy();
    }

    const statusQuery = this.aiPolicy.status_query || {};
    const statusUrl = `${this.aiPolicy.url}/${statusQuery.path || 'api/sdk/task/status'}?task_id=${taskId}`;
    const durations = (statusQuery.durations || '2000,3000,5000,5000,10000')
      .split(',')
      .map(d => parseInt(d.trim(), 10))
      .filter(n => !isNaN(n));

    let attempts = 0;
    let delayMs = 3000;
    let consecutiveErrors = 0;
    let lastError = '';
    const startedAt = Date.now();

    // Consulta enquanto a tarefa estiver em andamento, até o tempo máximo (VMAKE_POLL_TIMEOUT_MIN)
    while (Date.now() - startedAt < timeoutMs) {
      attempts++;
      if (durations[attempts - 1]) {
        delayMs = durations[attempts - 1];
      } else {
        delayMs = 10000; // Após a curva inicial de ramp-up, consulta a cada 10 segundos
      }

      await new Promise(r => setTimeout(r, delayMs));

      try {
        const res = await this.request(statusUrl, 'GET');
        const d = res.data?.data;
        if (!d) {
          throw new Error(`resposta sem dados (HTTP ${res.status})`);
        }
        consecutiveErrors = 0;

        const status = d.status;
        const progress = d.progress || 0;

        if (onProgress) {
          onProgress({ status, progress, attempts, raw: d });
        }

        // status 10: Succeeded!
        if (status === 10) {
          const output = d.result;
          let downloadUrl = null;
          if (Array.isArray(output?.urls) && output.urls[0]) {
            downloadUrl = output.urls[0];
          } else if (Array.isArray(output?.images) && output.images[0]) {
            downloadUrl = output.images[0];
          } else if (Array.isArray(output?.media_info_list) && output.media_info_list[0]?.media_data) {
            downloadUrl = output.media_info_list[0].media_data;
          } else if (output?.output_images?.[0]?.url) {
            downloadUrl = output.output_images[0].url;
          } else if (output?.url) {
            downloadUrl = output.url;
          } else if (output?.video_url) {
            downloadUrl = output.video_url;
          } else if (typeof output === 'string' && output.startsWith('http')) {
            downloadUrl = output;
          }

          return {
            success: true,
            downloadUrl,
            taskId,
            raw: d
          };
        }

        // status 2 or 20: Failed (definitivo: não adianta continuar consultando)
        if (status === 2 || status === 20) {
          const errCode = d.result?.code || d.code || status;
          const errMsg = d.result?.message || d.message || 'Task failed on VMake server';
          const err = new Error(`VMake task failed (${errCode}): ${errMsg}`);
          err.vmakeTerminal = true;
          throw err;
        }
      } catch (err) {
        if (err.vmakeTerminal) {
          throw err;
        }
        // Instabilidade de rede: continua consultando, mas desiste após muitas falhas seguidas
        consecutiveErrors++;
        lastError = err.message;
        if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
          throw new Error(`VMake: ${consecutiveErrors} falhas seguidas consultando a tarefa ${taskId} (último erro: ${lastError})`);
        }
      }
    }

    const mins = Math.round((Date.now() - startedAt) / 60000);
    const timeoutErr = new Error(`VMake: tarefa ${taskId} não terminou em ${mins} min (${attempts} consultas). Rode de novo para retomar a mesma tarefa sem gastar outro crédito.`);
    timeoutErr.vmakeTimeout = true;
    throw timeoutErr;
  }

  /**
   * Baixa o resultado. Rejeita se a conexão cair no meio ou se vierem menos bytes que o
   * Content-Length informado, e apaga o arquivo parcial.
   */
  downloadVideo(url, outputPath, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      let settled = false;
      let file = null;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        const cleanup = () => { try { fs.unlinkSync(outputPath); } catch (_) {} };
        if (file) file.destroy();
        // Espera o stream fechar antes de apagar (no Windows o arquivo aberto não pode ser removido)
        if (file && !file.closed) file.once('close', cleanup); else cleanup();
        reject(err);
      };

      const client = url.startsWith('http://') ? http : https;
      const req = client.get(url, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return fail(new Error('Download do vídeo: redirecionamentos demais'));
          settled = true;
          const next = new URL(res.headers.location, url).toString();
          return this.downloadVideo(next, outputPath, redirectsLeft - 1).then(resolve, reject);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return fail(new Error(`Failed to download result video: HTTP ${res.statusCode}`));
        }

        const expected = parseInt(res.headers['content-length'], 10);
        let received = 0;
        file = fs.createWriteStream(outputPath);

        res.on('data', chunk => { received += chunk.length; });
        res.on('aborted', () => fail(new Error(`Download interrompido (${received} bytes recebidos)`)));
        res.on('close', () => { if (!res.complete) fail(new Error(`Download interrompido (${received} bytes recebidos)`)); });
        res.on('error', err => fail(err));
        file.on('error', err => fail(err));

        file.on('finish', () => {
          if (settled) return;
          if (Number.isFinite(expected) && received < expected) {
            return fail(new Error(`Download incompleto: ${received} de ${expected} bytes`));
          }
          settled = true;
          file.close(() => resolve(outputPath));
        });

        res.pipe(file);
      });

      req.setTimeout(120000, () => req.destroy(new Error('Download do vídeo sem resposta por 120s')));
      req.on('error', err => fail(err));
    });
  }

  /**
   * Complete end-to-end clean runner
   * @param {string} inputVideoPath Local path to original.mp4
   * @param {string} outputVideoPath Target path for cleaned.mp4
   * @param {string} materialId 'SKM0002' (Subtitle), 'SKM0005' (Smart Pro), or 'SKM0007' (Watermark)
   * @param {function} onProgress Callback for status updates
   */
  async cleanVideo(inputVideoPath, outputVideoPath, materialId = 'SKM0002', onProgress = null) {
    const notify = (msg, pct) => {
      if (onProgress) onProgress({ message: msg, percent: pct });
      console.log(`[VMake API] ${msg}`);
    };

    const statePath = path.join(path.dirname(outputVideoPath), TASK_STATE_FILE);
    let taskId = null;

    const saved = readTaskState(statePath, inputVideoPath, materialId);
    if (saved) {
      taskId = saved.taskId;
      notify(`Retomando tarefa VMake já enviada (Task ID: ${taskId}), sem novo upload nem novo crédito...`, 55);
    } else {
      clearTaskState(statePath);

      notify(`Iniciando VMake API...`, 5);
      await this.fetchConfig();

      notify(`Fazendo upload direto do vídeo para a nuvem...`, 15);
      const mediaUrl = await this.uploadFileToOSS(inputVideoPath);

      notify(`Autorizando créditos da API (task: ${materialId})...`, 35);
      const consumeRes = await this.consumeQuota(mediaUrl, materialId);
      const context = consumeRes?.context || '';

      notify(`Enviando tarefa de remoção para processamento acelerado...`, 45);
      taskId = await this.submitTask(mediaUrl, materialId, context);

      // Salva o Task ID: se o processo cair daqui em diante, a próxima execução retoma esta tarefa
      writeTaskState(statePath, {
        taskId,
        materialId,
        inputSize: fs.statSync(inputVideoPath).size,
        submittedAt: new Date().toISOString()
      });
      notify(`Processando vídeo na nuvem (Task ID: ${taskId})...`, 55);
    }

    let pollResult;
    try {
      pollResult = await this.pollTask(taskId, ({ status, progress }) => {
        const calcPct = Math.min(92, 55 + Math.round((progress || 0) * 0.37));
        notify(`Processando IA (${progress || 0}%)...`, calcPct);
      });
    } catch (err) {
      // Falha definitiva no servidor: a tarefa não tem como ser retomada
      if (err.vmakeTerminal) clearTaskState(statePath);
      throw err;
    }

    if (!pollResult.downloadUrl) {
      clearTaskState(statePath);
      throw new Error('Processamento concluído mas nenhuma URL de vídeo foi retornada.');
    }

    // Baixa para um arquivo temporário e só promove para sem_marca.mp4 depois de validado,
    // para que um download truncado nunca seja reaproveitado como vídeo pronto.
    const tempPath = `${outputVideoPath}.download`;
    notify(`Baixando vídeo final limpo...`, 95);
    await this.downloadVideo(pollResult.downloadUrl, tempPath);

    try {
      validateCleanVideo(tempPath, inputVideoPath);
    } catch (err) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
      throw err;
    }
    fs.renameSync(tempPath, outputVideoPath);
    clearTaskState(statePath);

    notify(`Vídeo limpo salvo com sucesso em ${outputVideoPath}!`, 100);
    return {
      success: true,
      outputPath: outputVideoPath,
      taskId: taskId,
      sourceUrl: pollResult.downloadUrl
    };
  }
}

module.exports = { VMakeApiClient, probeDuration, validateCleanVideo };
