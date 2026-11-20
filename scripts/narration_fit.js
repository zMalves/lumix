/**
 * narration_fit.js - Faz a narração caber no vídeo sem acelerar demais a voz.
 *
 * Problema que resolve: a tradução sai ~20% maior que o inglês original, os cortes rítmicos
 * tiravam 14% fixos do vídeo e a mesclagem acelerava a voz para caber (até 1,44x), em cima do
 * 1,3x do TTS. A fala chegava a ~1,9x do natural e soava atropelada/metálica.
 *
 * Estratégia:
 * 1. O roteiro já é pedido com um limite de tamanho calculado pela duração do vídeo.
 * 2. Cortes rítmicos só removem o tempo que o vídeo tem de sobra em relação à narração.
 * 3. Se a narração ainda passar do vídeo, a voz acelera no máximo 1,10x e o restante é
 *    compensado desacelerando levemente o vídeo (até 1,25x), o que em animação quase não se nota.
 */

// Velocidade medida no WStudios V4 a 1.3x (caracteres de roteiro por segundo de narração já sem silêncios)
const CHARS_PER_SEC = { pt: 18, es: 19.5, en: 17 };
// Média de caracteres por palavra (incluindo o espaço), para converter o limite em palavras
const CHARS_PER_WORD = { pt: 5.7, es: 5.3, en: 5.5 };
// Fração do vídeo que a narração deve ocupar: sobra espaço para os cortes rítmicos de retenção
const TARGET_FILL = 0.92;

const MAX_VOICE_TEMPO = 1.10;
const MAX_VIDEO_SLOW = 1.25;
const MAX_CUT_RATIO = 0.14;
const KEEP_SEC = 3.0;
const END_MARGIN_SEC = 0.3;

function narrationLimits(videoSec, lang = 'pt') {
  const cps = CHARS_PER_SEC[lang] || CHARS_PER_SEC.pt;
  const cpw = CHARS_PER_WORD[lang] || CHARS_PER_WORD.pt;
  const maxChars = Math.max(200, Math.round(videoSec * TARGET_FILL * cps));
  return { maxChars, maxWords: Math.round(maxChars / cpw), videoSec: Math.round(videoSec) };
}

/** Instrução de tamanho anexada ao prompt de tradução, no idioma do prompt */
function lengthInstruction(lang, limits) {
  const { maxWords, maxChars, videoSec } = limits;
  if (lang === 'es') {
    return `\n\n5. EXTENSIÓN OBLIGATORIA (TIENE PRIORIDAD SOBRE EL PUNTO 1):\n   - El video dura ${videoSec} segundos. El texto final debe tener COMO MÁXIMO ${maxWords} palabras (unos ${maxChars} caracteres) para que la locución quepa en el video.\n   - Si el original no cabe, condensa la redacción: frases más cortas y directas, sin repeticiones, manteniendo todos los hechos importantes en el mismo orden. Nunca superes el límite.`;
  }
  if (lang === 'en') {
    return `\n\n5. MANDATORY LENGTH (OVERRIDES RULE 1):\n   - The video is ${videoSec} seconds long. The final text must have AT MOST ${maxWords} words (about ${maxChars} characters) so the narration fits the video.\n   - If the original does not fit, tighten the wording: shorter, direct sentences, no repetition, keeping every important event in the same order. Never exceed the limit.`;
  }
  return `\n\n5. TAMANHO OBRIGATÓRIO (TEM PRIORIDADE SOBRE O ITEM 1):\n   - O vídeo tem ${videoSec} segundos. O texto final deve ter NO MÁXIMO ${maxWords} palavras (cerca de ${maxChars} caracteres) para a narração caber no vídeo.\n   - Se o original não couber, condense a redação: frases mais curtas e diretas, sem repetições, mantendo todos os acontecimentos importantes na mesma ordem. Nunca ultrapasse o limite.`;
}

/** Pedido de condensação usado quando a primeira tradução passa do limite */
function condenseInstruction(lang, limits) {
  const { maxWords, maxChars } = limits;
  if (lang === 'es') return `Condensa este guion para que tenga COMO MÁXIMO ${maxWords} palabras (unos ${maxChars} caracteres). Mantén todos los hechos importantes en el mismo orden, el tono narrativo y los números escritos con palabras. Devuelve SOLO el texto final.`;
  if (lang === 'en') return `Tighten this script to AT MOST ${maxWords} words (about ${maxChars} characters). Keep every important event in the same order, the narrative tone and numbers written as words. Return ONLY the final text.`;
  return `Condense este roteiro para no MÁXIMO ${maxWords} palavras (cerca de ${maxChars} caracteres). Mantenha todos os acontecimentos importantes na mesma ordem, o tom narrativo e os números por extenso. Retorne SOMENTE o texto final.`;
}

/**
 * Decide como encaixar a narração no vídeo.
 * @returns {{cutSec:number, voiceTempo:number, videoSlow:number}}
 *   cutSec: segundos removidos a cada 3s de vídeo (0 = sem cortes)
 *   voiceTempo: aceleração da voz (1 = nenhuma)
 *   videoSlow: fator de desaceleração do vídeo (1 = nenhuma)
 */
function planFit(videoSec, narrationSec) {
  if (!(videoSec > 0) || !(narrationSec > 0)) return { cutSec: 0, voiceTempo: 1, videoSlow: 1 };

  if (narrationSec <= videoSec) {
    const spare = videoSec - narrationSec - END_MARGIN_SEC;
    const remove = Math.min(videoSec * MAX_CUT_RATIO, spare);
    const cycles = Math.max(1, Math.floor(videoSec / KEEP_SEC));
    const cutSec = remove > 0 ? Math.min(0.5, remove / cycles) : 0;
    return { cutSec: cutSec >= 0.1 ? Number(cutSec.toFixed(3)) : 0, voiceTempo: 1, videoSlow: 1 };
  }

  const ratio = narrationSec / videoSec;
  let voiceTempo = Math.min(MAX_VOICE_TEMPO, ratio);
  let videoSlow = ratio / voiceTempo;
  if (videoSlow > MAX_VIDEO_SLOW) {
    videoSlow = MAX_VIDEO_SLOW;
    voiceTempo = ratio / MAX_VIDEO_SLOW;
  }
  return { cutSec: 0, voiceTempo: Number(voiceTempo.toFixed(4)), videoSlow: Number(videoSlow.toFixed(4)) };
}

/** Segmentos mantidos com cortes rítmicos (mantém 3s, remove cutSec, repete) */
function rhythmicSegments(videoSec, cutSec) {
  const segments = [];
  let start = 0;
  while (start < videoSec) {
    const end = Math.min(videoSec, start + KEEP_SEC);
    segments.push({ start, end });
    start = end + cutSec;
  }
  return segments;
}

module.exports = {
  narrationLimits,
  lengthInstruction,
  condenseInstruction,
  planFit,
  rhythmicSegments,
  MAX_VOICE_TEMPO,
  MAX_VIDEO_SLOW
};
