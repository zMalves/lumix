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
 * 7. Real-time status polling (/api/sdk/task/status)
 * 8. Automatic download of the cleaned MP4 result
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const OSS = require('ali-oss');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function hmacSha256(key, str) {
  return crypto.createHmac('sha256', key).update(str).digest('hex');
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
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

  async pollTask(taskId, onProgress = null) {
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

    // Polling sem timeout: processa continuamente enquanto o status indicar em andamento
    while (true) {
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
        if (!d) continue;

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

        // status 2 or 20: Failed
        if (status === 2 || status === 20) {
          const errCode = d.result?.code || d.code || status;
          const errMsg = d.result?.message || d.message || 'Task failed on VMake server';
          throw new Error(`VMake task failed (${errCode}): ${errMsg}`);
        }
      } catch (err) {
        if (err.message && err.message.includes('VMake task failed')) {
          throw err;
        }
        // Network flicker, continue polling
      }
    }

    throw new Error(`VMake task ${taskId} timed out after ${attempts} attempts`);
  }

  async downloadVideo(url, outputPath) {
    return new Promise((resolve, reject) => {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const file = fs.createWriteStream(outputPath);
      const req = https.get(url, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          fs.unlinkSync(outputPath);
          return this.downloadVideo(res.headers.location, outputPath).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(outputPath);
          return reject(new Error(`Failed to download result video: HTTP ${res.statusCode}`));
        }

        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(outputPath);
        });
      });

      req.on('error', err => {
        file.close();
        try { fs.unlinkSync(outputPath); } catch (_) {}
        reject(err);
      });
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

    notify(`Iniciando VMake API...`, 5);
    await this.fetchConfig();

    notify(`Fazendo upload direto do vídeo para a nuvem...`, 15);
    const mediaUrl = await this.uploadFileToOSS(inputVideoPath);

    notify(`Autorizando créditos da API (task: ${materialId})...`, 35);
    const consumeRes = await this.consumeQuota(mediaUrl, materialId);
    const context = consumeRes?.context || '';

    notify(`Enviando tarefa de remoção para processamento acelerado...`, 45);
    const taskId = await this.submitTask(mediaUrl, materialId, context);

    notify(`Processando vídeo na nuvem (Task ID: ${taskId})...`, 55);
    const pollResult = await this.pollTask(taskId, ({ status, progress }) => {
      const calcPct = Math.min(92, 55 + Math.round((progress || 0) * 0.37));
      notify(`Processando IA (${progress || 0}%)...`, calcPct);
    });

    if (!pollResult.downloadUrl) {
      throw new Error('Processamento concluído mas nenhuma URL de vídeo foi retornada.');
    }

    notify(`Baixando vídeo final limpo...`, 95);
    await this.downloadVideo(pollResult.downloadUrl, outputVideoPath);

    notify(`Vídeo limpo salvo com sucesso em ${outputVideoPath}!`, 100);
    return {
      success: true,
      outputPath: outputVideoPath,
      taskId: taskId,
      sourceUrl: pollResult.downloadUrl
    };
  }
}

module.exports = { VMakeApiClient };
