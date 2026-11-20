/**
 * synthesize_minimax.js (nome mantido por compatibilidade com o pipeline)
 * Síntese de voz via WStudios API v1, motor Ultra V4 (ElevenLabs eleven_v4).
 * Fallback automático: OpenAI TTS (tts-1-hd) se o WStudios falhar.
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
const WSTUDIOS_BASE = 'https://wstudios.app/api/v1';
const WSTUDIOS_MODEL_ID = 'eleven_v4';
const WSTUDIOS_PROVIDER = 'ultra-v4';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const DEFAULT_VOICE_ID = process.env.WSTUDIOS_VOICE_ID_PT || '';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 200; // ~10 min
const MAX_CHARS_PER_REQUEST = 45000; // limite oficial 50.000

function isValidVoiceId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9]{20}$/.test(id);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callOpenAITTS(text, voice = 'onyx', speed = 1.05) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada no .env');
  }
  console.log(`[OpenAI TTS] Chamando síntese OpenAI (Voz: ${voice}, Velocidade: ${speed}, Chars: ${text.length})...`);
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      input: text,
      voice: voice || 'onyx',
      speed: Math.max(0.25, Math.min(4.0, parseFloat(speed) || 1.05)),
      response_format: 'mp3'
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI TTS HTTP ${res.status}: ${errText}`);
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Gera um trecho com WStudios V4. Não reenvia automaticamente um pedido de aceite ambíguo (409 AMBIGUOUS_SUBMIT).
 */
async function callWStudiosV4(text, voiceId, speed = 1.05) {
  if (!WSTUDIOS_API_KEY) {
    throw new Error('WSTUDIOS_API_KEY não configurada no .env');
  }
  if (!isValidVoiceId(voiceId)) {
    throw new Error(`voice_id WStudios inválido (precisa de 20 caracteres alfanuméricos): "${voiceId}"`);
  }

  const idempotencyKey = crypto.randomUUID();
  const headers = {
    'Authorization': `Bearer ${WSTUDIOS_API_KEY}`,
    'Content-Type': 'application/json'
  };

  console.log(`[WStudios] Enviando V4 (Voz: ${voiceId}, Velocidade: ${speed}, Chars: ${text.length})...`);
  const createRes = await fetch(`${WSTUDIOS_BASE}/tts`, {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      provider: WSTUDIOS_PROVIDER,
      model_id: WSTUDIOS_MODEL_ID,
      speed: Math.max(0.5, Math.min(2, parseFloat(speed) || 1.0))
    })
  });

  const createBody = await createRes.text();
  if (!createRes.ok) {
    throw new Error(`WStudios HTTP ${createRes.status}: ${createBody.slice(0, 300)}`);
  }
  const task = JSON.parse(createBody);
  if (!task.id) {
    throw new Error(`WStudios sem id da tarefa: ${createBody.slice(0, 200)}`);
  }

  // Aguarda o áudio ficar pronto (GET /audio/{id}: 202 = ainda pendente)
  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(`${WSTUDIOS_BASE}/audio/${encodeURIComponent(task.id)}`, { headers });

    if (res.status === 202) continue;
    if (res.status === 429) {
      const retryAfter = parseFloat(res.headers.get('retry-after')) || 10;
      await sleep(retryAfter * 1000);
      continue;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`WStudios falhou ao baixar áudio ${task.id} (HTTP ${res.status}): ${errText.slice(0, 300)}`);
    }

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

  throw new Error(`WStudios: tempo esgotado aguardando a tarefa ${task.id}`);
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

  // 1. Síntese primária: WStudios Ultra V4
  try {
    const chunks = splitTextIntoSentences(text, MAX_CHARS_PER_REQUEST);
    const audioBuffers = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`[WStudios] Processando bloco ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
      audioBuffers.push(await callWStudiosV4(chunks[i], voiceId, speed));
    }

    const combined = Buffer.concat(audioBuffers);
    fs.writeFileSync(outputPath, combined);
    console.log(`[WStudios] Sucesso! Áudio salvo em: ${outputPath} (${combined.length} bytes)`);
    return outputPath;
  } catch (wstudiosErr) {
    console.warn(`[Aviso WStudios] ${wstudiosErr.message}`);

    // 2. Fallback automático para OpenAI TTS (HD)
    if (OPENAI_API_KEY) {
      console.log(`[TTS Fallback] Acionando OpenAI TTS (Modelo tts-1-hd, Voz onyx)...`);
      try {
        const chunks = splitTextIntoSentences(text, 4000);
        const audioBuffers = [];

        for (let i = 0; i < chunks.length; i++) {
          audioBuffers.push(await callOpenAITTS(chunks[i], 'onyx', speed));
        }

        const combined = Buffer.concat(audioBuffers);
        fs.writeFileSync(outputPath, combined);
        console.log(`[OpenAI TTS] Sucesso! Áudio salvo em: ${outputPath} (${combined.length} bytes) [Fallback ativo]`);
        return outputPath;
      } catch (openaiErr) {
        throw new Error(`Falha em ambos os provedores TTS. WStudios: ${wstudiosErr.message} | OpenAI: ${openaiErr.message}`);
      }
    }

    throw wstudiosErr;
  }
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
