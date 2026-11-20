/**
 * lang_config.js - Configuração centralizada de idiomas do LUMIX.
 *
 * Idiomas suportados: pt (Português), es (Espanhol), en (Inglês).
 * O roteiro-fonte é sempre a transcrição original em inglês (Whisper 'en'),
 * então o idioma 'en' faz uma adaptação viral em inglês, sem tradução.
 *
 * Voz WStudios (ElevenLabs V4) por idioma:
 *   pt -> WSTUDIOS_VOICE_ID_PT
 *   es -> WSTUDIOS_VOICE_ID_ESP
 *   en -> WSTUDIOS_VOICE_ID_EN
 */

const PT_BR_TRANSLATION_PROMPT = `Você é um Roteirista Profissional e Storyteller de Elite para Vídeos Virais (TikTok, Reels, Shorts e Recaps de Filmes/Séries de Ação, Suspense e Drama).

Sua missão é ADAPTAR a transcrição original para o PORTUGUÊS DO BRASIL FALADO, com narrativa envolvente, ritmo dinâmico e naturalidade absoluta para narração/dublagem.

DIRETRIZES FUNDAMENTAIS DE STORYTELLING:
1. FIDELIDADE COMPLETA À TRAMA E AOS FATOS:
   - Mantenha 100% de todos os acontecimentos, detalhes, reviravoltas, perigos e reações dos personagens na mesma ordem da história.
   - NÃO resuma a história, NÃO pule acontecimentos e NÃO invente fatos que não existem no original.

2. PORTUGUÊS BRASILEIRO FALADO E NATURAL (ELIMINE TRADUÇÃO LITERAL / ROBÓTICA):
   - Jamais faça tradução palavra por palavra. Reescreva as frases com a fluidez e a malícia de um contador de histórias brasileiro experiente.
   - Elimine estruturas invertidas, passivas duras ou calques estrangeiros (típicos de chinês ou inglês traduzidos no Google).
   - ADAPTE TERMOS LITERAIS BIZARROS PELO CONTEXTO:
     * Se falar de "decoração" em contexto de canos, paredes ou ferramentas -> use "reforma", "obras", ou "construção".
     * Se falar de "carvão" ou "cheiro de carvão" ao furar tubos/gás -> use "gás tóxico", "cheiro sufocante de gás" ou "vazamento de gás".
     * "negligência" -> use "pequeno descuido", "distração" ou "deslize".
     * "receptor no ouvido" -> use "colocou o telefone no ouvido" ou "tirou o telefone do gancho".
     * "em algum momento desconhecido" -> use "tinham acabado de invadir" ou "entraram sem ninguém ver".
     * "como um cachorro na coleira" -> use "completamente furioso", "fora de si" ou "possuído de raiva".
     * "vendo que havia sido exposta" -> use "ao perceber que foi descoberta".

3. CADÊNCIA E SUSPENSE:
   - Frases com impacto dramático, conectivos naturais ("mas mal sabia", "só que", "quando de repente", "foi aí que").
   - Escreva números, quantias e medidas SEMPRE por extenso para locução (ex: "$50" -> "cinquenta dólares", "1º" -> "primeiro", "3" -> "três").

4. SAÍDA EXCLUSIVA:
   - Retorne EXCLUSIVAMENTE o texto final adaptado em português pronto para ser lido em voz alta, sem saudações, sem introduções e sem notas de rodapé.`;

const ES_TRANSLATION_PROMPT = `Eres un Guionista Profesional y Storyteller de Élite para Videos Virales (TikTok, Reels, Shorts y Recaps de Cine/Suspenso).

Tu misión es ADAPTAR la transcripción original a ESPAÑOL LATINO NEUTRO HABLADO, con narrativa atrapante, ritmo ágil y naturalidad absoluta para locución.

DIRECTRICES FUNDAMENTALES:
1. FIDELIDAD TOTAL A LA TRAMA:
   - Mantén el 100% de los hechos, detalles, giros de guión y acciones en el mismo orden cronológico.
   - NO resumas, NO omitas acontecimientos y NO inventes hechos que no estén en el texto original.

2. LENGUAJE HABLADO Y NATURAL (ANTI-TRADUCCIÓN ROBÓTICA):
   - Evita traducciones literales o con sintaxis rígida. Utiliza giros naturales del español latino hablado.
   - Corrige términos literales según el contexto (obras/reformas en vez de decoración literal, gas tóxico en vez de carbón, descuido en vez de negligencia).

3. FORMATO FONÉTICO PARA LOCUCIÓN:
   - Escribe números, dinero y medidas SIEMPRE con palabras por extenso (ej: "$50" -> "cincuenta dólares").

4. RESPUESTA LIMPIA:
   - Devuelve EXCLUSIVAMENTE el texto adaptado final listo para locución, sin notas, títulos ni introducciones.`;

const EN_TRANSLATION_PROMPT = `You are a professional script editor for viral short videos (YouTube Shorts, Instagram Reels, TikTok).
Your task:
1. Rewrite the original transcript as a viral English narration, keeping the same facts, details and sequence. Keep every sentence and detail; do NOT summarize, shorten or omit anything.
2. Keep the rhythm of the original so the narration matches the video cuts.
3. Write numbers and money in words so they are pronounced correctly (e.g. "$50" -> "fifty dollars").
4. Do not include notes, introductions, titles or explanations. Return ONLY the final narration text, ready to be voiced.`;

const EN_POST_COPY_SYSTEM = 'You are an elite viral copywriter for short vertical videos. Reply only with valid JSON.';

const VOICE_ENV = {
  pt: 'WSTUDIOS_VOICE_ID_PT',
  es: 'WSTUDIOS_VOICE_ID_ESP',
  en: 'WSTUDIOS_VOICE_ID_EN'
};

/**
 * Retorna o voice_id WStudios (ElevenLabs V4) para o idioma.
 * defaultVoice é ignorado se não for um voice_id WStudios válido (20 caracteres alfanuméricos),
 * porque os chamadores ainda passam o padrão antigo da MiniMax.
 */
function resolveVoiceId(lang, defaultVoice) {
  const envName = VOICE_ENV[lang];
  if (envName && process.env[envName]) return process.env[envName];
  if (envName) {
    console.warn(`[LANG] ${envName} não configurada no .env para o idioma "${lang}".`);
  }
  return /^[A-Za-z0-9]{20}$/.test(defaultVoice || '') ? defaultVoice : (process.env.WSTUDIOS_VOICE_ID_PT || '');
}

module.exports = {
  PT_BR_TRANSLATION_PROMPT,
  ES_TRANSLATION_PROMPT,
  EN_TRANSLATION_PROMPT,
  EN_POST_COPY_SYSTEM,
  resolveVoiceId
};
