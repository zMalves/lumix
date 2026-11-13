/**
 * transcribe_openai.js
 * Transcrição de áudio 100% via API OpenAI Whisper Cloud
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path.resolve(__dirname, '..', '.env'));
  } catch (e) {}
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Transcreve um arquivo de vídeo ou áudio utilizando OpenAI Whisper
 * @param {string} inputMedia Caminho para original.mp4 ou arquivo de áudio
 * @param {string} outputTextFile Caminho onde salvar o arquivo .txt transcrito
 * @param {string} language Idioma (padrão 'en' para shorts gringos)
 */
async function transcribeWithOpenAI(inputMedia, outputTextFile, language = 'en') {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada no .env');
  }

  if (!fs.existsSync(inputMedia)) {
    throw new Error(`Arquivo de entrada não encontrado: ${inputMedia}`);
  }

  const projectDir = path.dirname(inputMedia);
  const tempAudio = path.join(projectDir, 'temp_whisper_extract.mp3');

  // Extrai áudio comprimido leve (16kHz mono) para envio ultrarrápido à OpenAI
  try {
    execSync(`ffmpeg -y -i "${inputMedia}" -vn -ar 16000 -ac 1 -b:a 64k "${tempAudio}"`, { stdio: 'ignore' });
  } catch (err) {
    console.warn('[OpenAI Whisper] Aviso ao extrair áudio com ffmpeg:', err.message);
  }

  const fileToSend = fs.existsSync(tempAudio) ? tempAudio : inputMedia;
  const fileBuffer = fs.readFileSync(fileToSend);
  const fileName = path.basename(fileToSend);
  const mimeType = fileName.endsWith('.mp3') ? 'audio/mp3' : 'video/mp4';

  const blob = new Blob([fileBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('model', 'whisper-1');
  if (language) formData.append('language', language);
  formData.append('response_format', 'json');

  console.log(`[OpenAI Whisper] Enviando ${fileName} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB) para API OpenAI...`);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: formData
  });

  if (fs.existsSync(tempAudio)) {
    try { fs.unlinkSync(tempAudio); } catch (_) {}
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro na API OpenAI Whisper (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = (data.text || '').trim();

  if (!text) {
    throw new Error('OpenAI Whisper retornou texto vazio.');
  }

  if (outputTextFile) {
    fs.writeFileSync(outputTextFile, text, 'utf-8');
  }

  return text;
}

// Suporte para execução direta via terminal: node scripts/transcribe_openai.js <inputVideo> <outputTxt>
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Uso: node transcribe_openai.js <inputMedia> <outputTxt>');
    process.exit(1);
  }

  transcribeWithOpenAI(args[0], args[1])
    .then(text => {
      console.log(`[OpenAI Whisper] ✅ Transcrição salva com sucesso (${text.length} caracteres).`);
      process.exit(0);
    })
    .catch(err => {
      console.error(`[OpenAI Whisper] ❌ Erro: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { transcribeWithOpenAI };

