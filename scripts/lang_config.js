/**
 * lang_config.js - Configuração centralizada de idiomas do LUMIX.
 *
 * Idiomas suportados: pt (Português), es (Espanhol), en (Inglês).
 * O roteiro-fonte é sempre a transcrição original em inglês (Whisper 'en'),
 * então o idioma 'en' faz uma adaptação viral em inglês, sem tradução.
 *
 * Voz MiniMax por idioma:
 *   pt, es -> MINIMAX_VOICE_ID (comportamento original)
 *   en     -> MINIMAX_VOICE_ID_EN (recomendado: uma voz clonada em inglês)
 */

const EN_TRANSLATION_PROMPT = `You are a professional script editor for viral short videos (YouTube Shorts, Instagram Reels, TikTok).
Your task:
1. Rewrite the original transcript as a viral English narration, keeping the same facts, details and sequence. Keep every sentence and detail; do NOT summarize, shorten or omit anything.
2. Keep the rhythm of the original so the narration matches the video cuts.
3. Write numbers and money in words so they are pronounced correctly (e.g. "$50" -> "fifty dollars").
4. Do not include notes, introductions, titles or explanations. Return ONLY the final narration text, ready to be voiced.`;

const EN_POST_COPY_SYSTEM = 'You are an elite viral copywriter for short vertical videos. Reply only with valid JSON.';

const VOICE_ENV = {
  pt: 'MINIMAX_VOICE_ID',
  es: 'MINIMAX_VOICE_ID',
  en: 'MINIMAX_VOICE_ID_EN'
};

/**
 * Retorna o voice_id da MiniMax para o idioma.
 * Para 'en', se MINIMAX_VOICE_ID_EN não existir, cai na voz padrão (que costuma ser PT).
 */
function resolveVoiceId(lang, defaultVoice) {
  const envName = VOICE_ENV[lang];
  if (envName && process.env[envName]) return process.env[envName];
  if (lang === 'en') {
    console.warn('[LANG] MINIMAX_VOICE_ID_EN não configurada no .env; usando a voz padrão para inglês (pode soar com sotaque).');
  }
  return defaultVoice;
}

module.exports = { EN_TRANSLATION_PROMPT, EN_POST_COPY_SYSTEM, resolveVoiceId };
