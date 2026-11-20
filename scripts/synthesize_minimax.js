/**
 * synthesize_minimax.js (nome mantido por compatibilidade com o pipeline)
 * Síntese de voz via WStudios API v1, motor Ultra V4 (ElevenLabs eleven_v4).
 *
 * Usa SOMENTE o WStudios. Não existe mais fallback para OpenAI TTS: a voz "onyx" da OpenAI
 * não é a voz do canal e soava robótica. Se o WStudios falhar mesmo depois das novas
 * tentativas, o script termina com erro e o pipeline para (melhor que publicar com voz errada).
 *
 * Fluxo WStudios: POST /api/v1/tts (com Idempotency-Key) -> GET /api/v1/audio/{id} até pronto -> MP3.
 * A cobrança é de 3 créditos por caractere (com 25% OFF no beta).
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Carrega .env
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path.resolve(__dirname, '..', '.env'));
  } catch (e) {}
}

// Chaves vêm somente do .env. Nunca coloque valores literais aqui.
const WSTUDIOS_API_KEY = process.env.WSTUDIOS_API_KEY || '';
const WSTUDIOS_BASE = process.env.WSTUDIOS_BASE_URL || 'https://wstudios.app/api/v1';
const WSTUDIOS_MODEL_ID = 'eleven_v4';
const WSTUDIOS_PROVIDER = 'ultra-v4';
const DEFAULT_VOICE_ID = process.env.WSTUDIOS_VOICE_ID_PT || '';

const POLL_INTERVAL_MS = 3000;
// Tempo máximo esperando um áudio ficar pronto (o WStudios chegou a levar 11 min com fila cheia)
const MAX_WAIT_MS = (parseFloat(process.env.WSTUDIOS_MAX_WAIT_MIN) || 20) * 60 * 1000;
// Erros temporários seguidos (5xx, rede) tolerados enquanto espera, antes de considerar a tarefa perdida
const MAX_TRANSIENT_ERRORS = 20;
// Tarefas completas tentadas por trecho quando o WStudios recusa ou falha a geração
const MAX_TASK_ATTEMPTS = 3;
const MAX_CHARS_PER_REQUEST = 45000; // limite oficial 50.000

function isValidVoiceId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9]{20}$/.test(id);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const isTransientStatus = (status) => status === 429 || status >= 500;

/**
 * Cria a tarefa de voz. Erros de rede e 5xx são repetidos com a MESMA Idempotency-Key,
 * então o WStudios não cria (nem cobra) duas tarefas para o mesmo pedido.
 */
async function createWStudiosTask(body, headers, idempotencyKey) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(`${WSTUDIOS_BASE}/tts`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(body)
      });
      const text = await res.text();
      if (res.ok) {
        const task = JSON.parse(text);
        if (!task.id) throw new Error(`WStudios sem id da tarefa: ${text.slice(0, 200)}`);
        return task.id;
      }
      const err = new Error(`WStudios HTTP ${res.status} ao criar tarefa: ${text.slice(0, 300)}`);
      if (!isTransientStatus(res.status)) {
        err.permanent = true; // 4xx: chave, voz ou texto inválidos; repetir não resolve
        throw err;
      }
      lastErr = err;
      const retryAfter = parseFloat(res.headers.get('retry-after'));
      await sleep((retryAfter > 0 ? retryAfter : 5 * attempt) * 1000);
    } catch (err) {
      if (err.permanent) throw err;
      lastErr = err;
      await sleep(5000 * attempt);
    }
  }
  throw lastErr;
}

/**
 * Espera o áudio da tarefa ficar pronto. 202 = pendente. Erros 5xx/rede no meio da espera
 * (ex.: 502 do nginx deles) não derrubam a tarefa: a consulta continua.
 */
async function waitWStudiosAudio(taskId, headers) {
  const startedAt = Date.now();
  let transientErrors = 0;
  let lastErr = '';

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS);
    let res;
    try {
      res = await fetch(`${WSTUDIOS_BASE}/audio/${encodeURIComponent(taskId)}`, { headers });
    } catch (err) {
      res = null;
      lastErr = err.message;
    }

    if (res && res.status === 202) { transientErrors = 0; continue; }

    if (!res || isTransientStatus(res.status)) {
      if (res) {
        lastErr = `HTTP ${res.status}`;
        const retryAfter = parseFloat(res.headers.get('retry-after'));
        if (res.status === 429) { await sleep((retryAfter > 0 ? retryAfter : 10) * 1000); continue; }
        await res.text().catch(() => '');
      }
      transientErrors++;
      if (transientErrors >= MAX_TRANSIENT_ERRORS) {
        throw new Error(`WStudios: ${transientErrors} erros seguidos consultando a tarefa ${taskId} (último: ${lastErr})`);
      }
      console.warn(`[WStudios] Instabilidade consultando ${taskId} (${lastErr}). Tentando de novo...`);
      await sleep(Math.min(30000, 3000 * transientErrors));
      continue;
    }
    transientErrors = 0;

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`WStudios falhou ao baixar áudio ${taskId} (HTTP ${res.status}): ${errText.slice(0, 300)}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('audio/')) {
      return Buffer.from(await res.arrayBuffer());
    }

    // Resposta JSON: pode trazer status ainda pendente ou uma URL do áudio
    const json = JSON.parse(await res.text());
    if (json.status === 'failed') {
      throw new Error(`WStudios V4 falhou: ${json.reason || json.code || 'motivo não informado'}`);
    }
    if (json.url) {
      const audioUrl = json.url.startsWith('http') ? json.url : `https://wstudios.app${json.url}`;
      const audioRes = await fetch(audioUrl, { headers });
      if (!audioRes.ok) {
        throw new Error(`WStudios: falha ao baixar MP3 (HTTP ${audioRes.status})`);
      }
      return Buffer.from(await audioRes.arrayBuffer());
    }
  }

  const err = new Error(`WStudios: a tarefa ${taskId} não ficou pronta em ${Math.round(MAX_WAIT_MS / 60000)} min`);
  err.timeout = true;
  throw err;
}

/**
 * Gera um trecho com WStudios V4.
 * - Falha da geração (status "failed" ou tarefa perdida): cria uma nova tarefa, até MAX_TASK_ATTEMPTS.
 * - Tempo esgotado com a tarefa ainda pendente: NÃO cria outra (poderia cobrar duas vezes); termina com erro.
 * - Erro 4xx ao criar (chave/voz/texto inválidos): termina na hora.
 */
async function callWStudiosV4(text, voiceId, speed = 1.05) {
  if (!WSTUDIOS_API_KEY) {
    throw new Error('WSTUDIOS_API_KEY não configurada no .env');
  }
  if (!isValidVoiceId(voiceId)) {
    throw new Error(`voice_id WStudios inválido (precisa de 20 caracteres alfanuméricos): "${voiceId}"`);
  }

  const headers = {
    'Authorization': `Bearer ${WSTUDIOS_API_KEY}`,
    'Content-Type': 'application/json'
  };
  const body = {
    text,
    voice_id: voiceId,
    provider: WSTUDIOS_PROVIDER,
    model_id: WSTUDIOS_MODEL_ID,
    speed: Math.max(0.5, Math.min(2, parseFloat(speed) || 1.0))
  };

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_TASK_ATTEMPTS; attempt++) {
    console.log(`[WStudios] Enviando V4 (Voz: ${voiceId}, Velocidade: ${body.speed}, Chars: ${text.length}, tentativa ${attempt}/${MAX_TASK_ATTEMPTS})...`);
    try {
      const taskId = await createWStudiosTask(body, headers, crypto.randomUUID());
      return await waitWStudiosAudio(taskId, headers);
    } catch (err) {
      if (err.permanent || err.timeout) throw err;
      lastErr = err;
      if (attempt < MAX_TASK_ATTEMPTS) {
        const waitSec = 30 * attempt;
        console.warn(`[WStudios] ${err.message}. Nova tentativa em ${waitSec}s...`);
        await sleep(waitSec * 1000);
      }
    }
  }
  throw lastErr;
}

/**
 * Divide o texto em sentenças seguras de até maxLen caracteres caso seja excessivamente longo
 */
function splitTextIntoSentences(text, maxLen = 3000) {
  if (text.length <= maxLen) return [text];

  const sentences = text.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [text];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function synthesizeText(inputTextOrPath, outputPath, voiceId = DEFAULT_VOICE_ID, speed = 1.05) {
  let text = '';
  if (fs.existsSync(inputTextOrPath)) {
    text = fs.readFileSync(inputTextOrPath, 'utf-8').trim();
  } else {
    text = inputTextOrPath.trim();
  }

  if (!text) {
    throw new Error('Texto para síntese está vazio!');
  }

  // Somente WStudios Ultra V4 (sem fallback de outra voz)
  const chunks = splitTextIntoSentences(text, MAX_CHARS_PER_REQUEST);
  const audioBuffers = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`[WStudios] Processando bloco ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
    audioBuffers.push(await callWStudiosV4(chunks[i], voiceId, speed));
  }

  // Grava num temporário e só então substitui: uma falha nunca deixa um MP3 pela metade no lugar
  const combined = Buffer.concat(audioBuffers);
  const tempPath = `${outputPath}.tmp`;
  fs.writeFileSync(tempPath, combined);
  fs.renameSync(tempPath, outputPath);
  console.log(`[WStudios] Sucesso! Áudio salvo em: ${outputPath} (${combined.length} bytes)`);
  return outputPath;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Uso: node synthesize_minimax.js <input.txt ou "texto"> <output.mp3> [voice_id] [speed]');
    process.exit(1);
  }

  const [input, output, voiceId, speed] = args;
  synthesizeText(input, output, voiceId || DEFAULT_VOICE_ID, speed || 1.05)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[ERRO FATAL TTS]', err.message);
      process.exit(1);
    });
}

module.exports = { synthesizeText, callWStudiosV4, DEFAULT_VOICE_ID };
