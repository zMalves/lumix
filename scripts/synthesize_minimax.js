/**
 * synthesize_minimax.js
 * Síntese de Voz Neural Ultra-Realista via MiniMax API (t2a_v2)
 * Substitui VoiceStudio para eliminar uso de GPU VRAM e garantir máxima qualidade de áudio.
 */

const fs = require('node:fs');
const path = require('node:path');

// Carrega .env
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path.resolve(__dirname, '..', '.env'));
  } catch (e) {}
}

// A chave vem somente do .env. Nunca coloque o valor literal aqui.
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const DEFAULT_VOICE_ID = process.env.MINIMAX_VOICE_ID || 'moss_audio_7eb5eaa1-d18c-11f1-a1a6-e6b4e5387684';

const ENDPOINTS = [
  'https://api.minimax.io/v1/t2a_v2',
  'https://api.minimaxi.chat/v1/t2a_v2'
];

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

async function callMiniMaxAPI(text, voiceId, speed = 1.05) {
  let lastError = null;

  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`[MiniMax] Chamando ${endpoint} (Voz: ${voiceId}, Velocidade: ${speed}, Chars: ${text.length})...`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MINIMAX_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'speech-02-turbo',
          text,
          stream: false,
          voice_setting: {
            voice_id: voiceId,
            speed: parseFloat(speed) || 1.05,
            vol: 1.0,
            pitch: 0
          },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: 'mp3',
            channel: 1
          }
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const data = await res.json();
      if (data.base_resp && data.base_resp.status_code !== 0) {
        throw new Error(`MiniMax Error [${data.base_resp.status_code}]: ${data.base_resp.status_msg}`);
      }

      if (data.data && data.data.audio) {
        return Buffer.from(data.data.audio, 'hex');
      }

      throw new Error(`Resposta MiniMax sem campo data.audio: ${JSON.stringify(data).slice(0, 200)}`);
    } catch (err) {
      console.warn(`[MiniMax Warning] Endpoint ${endpoint} falhou: ${err.message}`);
      lastError = err;
    }
  }

  throw lastError || new Error('Todos os endpoints MiniMax falharam');
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

  // 1. Tenta sintetizar via MiniMax TTS (Voz Neural Primária)
  try {
    if (!MINIMAX_API_KEY) {
      throw new Error('MINIMAX_API_KEY não configurada no .env');
    }

    console.log(`[MiniMax] Iniciando síntese (${text.length} caracteres)...`);
    const chunks = splitTextIntoSentences(text, 3500);
    const audioBuffers = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[MiniMax] Processando bloco ${i + 1}/${chunks.length} (${chunk.length} chars)...`);
      const audioBuf = await callMiniMaxAPI(chunk, voiceId, speed);
      audioBuffers.push(audioBuf);
    }

    const combined = Buffer.concat(audioBuffers);
    fs.writeFileSync(outputPath, combined);
    console.log(`[MiniMax] Sucesso! Áudio salvo em: ${outputPath} (${combined.length} bytes)`);
    return outputPath;
  } catch (minimaxErr) {
    console.warn(`[Aviso MiniMax] ${minimaxErr.message}`);

    // 2. Fallback automático para OpenAI TTS (HD) se houver falha de créditos ou rede na MiniMax
    if (OPENAI_API_KEY) {
      console.log(`[TTS Fallback] Acionando OpenAI TTS (Modelo tts-1-hd, Voz onyx)...`);
      try {
        const chunks = splitTextIntoSentences(text, 4000);
        const audioBuffers = [];

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const audioBuf = await callOpenAITTS(chunk, 'onyx', speed);
          audioBuffers.push(audioBuf);
        }

        const combined = Buffer.concat(audioBuffers);
        fs.writeFileSync(outputPath, combined);
        console.log(`[OpenAI TTS] Sucesso! Áudio salvo em: ${outputPath} (${combined.length} bytes) [Fallback ativo]`);
        return outputPath;
      } catch (openaiErr) {
        throw new Error(`Falha em ambos os provedores TTS. MiniMax: ${minimaxErr.message} | OpenAI: ${openaiErr.message}`);
      }
    }

    throw minimaxErr;
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
      console.error('[ERRO FATAL MiniMax]', err.message);
      process.exit(1);
    });
}

module.exports = { synthesizeText, callMiniMaxAPI, DEFAULT_VOICE_ID };
