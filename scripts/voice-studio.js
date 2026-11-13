/**
 * voice-studio.js - Cliente e Utilitário de Integração para Voice Studio (CommonJS)
 * Suporta TTS (geração de voz), STT (transcrição) e checagem de status.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_BASE_URL = process.env.VOICESTUDIO_URL || 'http://127.0.0.1:3900';

/**
 * Verifica se o backend do Voice Studio está ativo e respondendo
 */
async function checkVoiceStudioHealth(baseUrl = DEFAULT_BASE_URL) {
  try {
    const res = await fetch(`${baseUrl}/.well-known/voicestudio-speech`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      return { online: true, data };
    }
    return { online: false, status: res.status };
  } catch (err) {
    return { online: false, error: err.message };
  }
}

/**
 * Lista as vozes disponíveis no Voice Studio
 */
async function listVoices(baseUrl = DEFAULT_BASE_URL) {
  const res = await fetch(`${baseUrl}/v1/audio/voices`);
  if (!res.ok) {
    throw new Error(`Falha ao obter vozes: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

/**
 * Gera áudio a partir de texto (Text-to-Speech)
 */
async function generateSpeech({
  text,
  voice = 'default',
  model = 'tts-1', // 'tts-1' usa o motor ativo (OmniVoice, etc.) automaticamente
  responseFormat = 'mp3',
  outputPath = 'output.mp3',
  baseUrl = DEFAULT_BASE_URL
}) {
  console.log(`[VoiceStudio] Gerando áudio via modelo "${model}" (voz: "${voice}")...`);
  const res = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: text,
      voice,
      model,
      response_format: responseFormat
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Erro na síntese de áudio: [${res.status}] ${errorText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
  console.log(`[VoiceStudio] Áudio gerado e salvo em: ${outputPath}`);
  return outputPath;
}

/**
 * Transcreve um arquivo de áudio ou vídeo para texto (Speech-to-Text)
 */
async function transcribeAudio({
  audioPath,
  model = 'whisper-1',
  responseFormat = 'json',
  language = null,
  baseUrl = DEFAULT_BASE_URL
}) {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Arquivo não encontrado: ${audioPath}`);
  }

  console.log(`[VoiceStudio] Transcrevendo arquivo: ${audioPath}...`);
  const fileBuffer = fs.readFileSync(audioPath);
  const fileName = path.basename(audioPath);
  const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });

  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('model', model);
  formData.append('response_format', responseFormat);
  if (language) {
    formData.append('language', language);
  }

  const res = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Erro na transcrição: [${res.status}] ${errorText}`);
  }

  if (responseFormat === 'json' || responseFormat === 'verbose_json') {
    const data = await res.json();
    return data.text || data;
  }

  return await res.text();
}

module.exports = {
  checkVoiceStudioHealth,
  listVoices,
  generateSpeech,
  transcribeAudio
};

// Execução direta via CLI para testes rápidos
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0] || '--status';

  (async () => {
    try {
      if (cmd === '--status') {
        console.log('[VoiceStudio] Verificando status na porta 3900...');
        const health = await checkVoiceStudioHealth();
        if (health.online) {
          console.log('✅ Voice Studio está ONLINE e pronto para uso!');
          console.log(JSON.stringify(health.data, null, 2));
        } else {
          console.log('❌ Voice Studio NÃO está rodando na porta 3900.');
          console.log('Detalhes:', health.error || `Status HTTP ${health.status}`);
          console.log('\nPara iniciar o backend em segundo plano, execute:');
          console.log('powershell -ExecutionPolicy Bypass -File scripts/start-voice-studio.ps1');
          console.log('ou');
          console.log('cd "C:\\Users\\Maychel\\OneDrive - Seconds\\Documentos\\Sistemas\\git\\voice-studio"');
          console.log('uv run uvicorn main:app --app-dir backend --host 127.0.0.1 --port 3900');
        }
      } else if (cmd === '--voices') {
        const voices = await listVoices();
        console.log('Vozes encontradas:', JSON.stringify(voices, null, 2));
      } else if (cmd === '--tts') {
        const text = args[1] || 'Olá! Este é um teste gerado localmente pelo Voice Studio.';
        const out = args[2] || 'test_audio.mp3';
        await generateSpeech({ text, outputPath: out });
      } else if (cmd === '--transcribe') {
        const file = args[1];
        if (!file) {
          console.error('Informe o caminho do arquivo: node scripts/voice-studio.js --transcribe <caminho>');
          process.exit(1);
        }
        const text = await transcribeAudio({ audioPath: file });
        console.log('Resultado da transcrição:\n', text);
      }
    } catch (e) {
      console.error('Erro na execução:', e.message);
    }
  })();
}
