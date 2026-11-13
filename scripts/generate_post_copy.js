/**
 * generate_post_copy.js - Gerador Inteligente de Títulos, Legendas e Copys Virais (LUMIX)
 * Totalmente isolado sem dependências circulares com o servidor HTTP.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const VIDEOS_DIR = path.join(ROOT_DIR, 'videos');
const { EN_POST_COPY_SYSTEM } = require('./lang_config.js');

async function generatePostCopyForProject(folderName, lang = 'pt', customVideosDir = null) {
  if (!folderName) return null;
  const targetVideosDir = customVideosDir || VIDEOS_DIR;
  const folderPath = path.join(targetVideosDir, folderName);
  if (!fs.existsSync(folderPath)) return null;

  const isSpanish = lang === 'es';
  const isEnglish = lang === 'en';
  const scriptFileName = (lang === 'pt' && !fs.existsSync(path.join(folderPath, 'roteiro_traduzido_pt.txt')))
    ? 'roteiro_traduzido.txt'
    : `roteiro_traduzido_${lang}.txt`;
  const postInfoJsonName = (lang === 'pt' && !fs.existsSync(path.join(folderPath, 'post_info_pt.json')))
    ? 'post_info.json'
    : `post_info_${lang}.json`;
  const postInfoTxtName = (lang === 'pt' && !fs.existsSync(path.join(folderPath, 'post_info_pt.txt')))
    ? 'post_info.txt'
    : `post_info_${lang}.txt`;

  const scriptPath = path.join(folderPath, scriptFileName);
  const transcriptPath = path.join(folderPath, 'transcricao_original.txt');
  const infoPath = path.join(folderPath, 'info.json');
  const postInfoJsonPath = path.join(folderPath, postInfoJsonName);
  const postInfoTxtPath = path.join(folderPath, postInfoTxtName);

  let scriptText = '';
  if (fs.existsSync(scriptPath)) {
    scriptText = fs.readFileSync(scriptPath, 'utf-8').trim();
  } else if (fs.existsSync(transcriptPath)) {
    scriptText = fs.readFileSync(transcriptPath, 'utf-8').trim();
  }

  let projectTitle = folderName;
  if (fs.existsSync(infoPath)) {
    try {
      const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
      if (info.title) projectTitle = info.title;
    } catch (e) {}
  }

  let postCopy = null;

  // 1. Tenta gerar via OpenAI GPT-4o-mini
  if (process.env.OPENAI_API_KEY && (scriptText.length > 10 || projectTitle)) {
    try {
      const prompt = isSpanish
        ? `Eres un estratega viral de redes sociales de élite especializado en videos cortos verticales (YouTube Shorts, Instagram Reels, TikTok).
Basándote en el guion y tema del video a continuación, crea un kit de publicación completo y altamente magnético en ESPAÑOL para generar el máximo CTR, retención y comentarios.

TÍTULO/TEMA: "${projectTitle}"
GUION DEL VIDEO:
"""
${scriptText.slice(0, 3000)}
"""

Responde ESTRICTAMENTE en formato JSON con la siguiente estructura:
{
  "titles": [
    "Título 1 con Gancho de Curiosidad y Emoji",
    "Título 2 Curioso y Provocativo",
    "Título 3 Corto e Impactante",
    "Título 4 En Formato de Pregunta Instigadora",
    "Título 5 Enfocado en el Hecho más impactante"
  ],
  "caption": "Gancho inicial impactante en la primera línea que haga que la gente quiera leer más.\\n\\nBreve resumen dinámico del video con storytelling.\\n\\n👇 ¿Cuál de estos datos te pareció más impresionante? ¡Comenta abajo y síguenos para más curiosidades diarias!",
  "hashtags": "#shorts #curiosidades #datoscuriosos #datosinteresantes #sabiasque #viral #parati #fyp #tendencia",
  "recommendedTitle": "Título 1"
}`
        : isEnglish
        ? `You are an elite viral social media strategist specialized in short vertical videos (YouTube Shorts, Instagram Reels, TikTok).
Based on the script and topic below, create a complete, highly magnetic publishing kit in ENGLISH to maximize CTR, retention and comments.

TITLE/TOPIC: "${projectTitle}"
VIDEO SCRIPT:
"""
${scriptText.slice(0, 3000)}
"""

Reply STRICTLY in JSON with this structure:
{
  "titles": [
    "Title 1 with a Curiosity Hook and Emoji",
    "Title 2 Curious and Provocative",
    "Title 3 Short and Punchy",
    "Title 4 As a Provocative Question",
    "Title 5 Focused on the Most Shocking Fact"
  ],
  "caption": "Strong opening line that makes people want to read more.\\n\\nBrief dynamic summary of the video with storytelling.\\n\\n👇 Which of these facts surprised you most? Comment below and follow for daily curiosities!",
  "hashtags": "#shorts #facts #didyouknow #interestingfacts #viral #fyp #trending #learnontiktok",
  "recommendedTitle": "Title 1"
}`
        : `Você é um estrategista viral de redes sociais de elite especializado em vídeos curtos verticais (YouTube Shorts, Instagram Reels, TikTok).
Com base no roteiro e tema do vídeo abaixo, crie um kit de publicação completo e altamente magnético para gerar máximo CTR, retenção e comentários.

TÍTULO/TEMA: "${projectTitle}"
ROTEIRO DO VÍDEO:
"""
${scriptText.slice(0, 3000)}
"""

Responda ESTRITAMENTE em formato JSON com a seguinte estrutura:
{
  "titles": [
    "Título 1 com Gancho de Curiosidade e Emoji",
    "Título 2 Curioso e Provocativo",
    "Título 3 Curto e Impactante",
    "Título 4 Em Formato de Pergunta Instigante",
    "Título 5 Focado no Fato mais chocante"
  ],
  "caption": "Gancho inicial impactante na primeira linha que faz a pessoa querer ler mais.\\n\\nBreve resumo dinâmico do vídeo com storytelling.\\n\\n👇 Qual desses fatos você achou mais impressionante? Comente aqui embaixo e siga para não perder curiosidades diárias!",
  "hashtags": "#shorts #curiosidades #fatosdesconhecidos #vocesabia #viral #reels #tiktok #fatoscuriosos #brasil",
  "recommendedTitle": "Título 1"
}`;

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: isEnglish ? EN_POST_COPY_SYSTEM : isSpanish ? 'Eres un estratega viral de copywriting para videos cortos. Responde únicamente con JSON válido.' : 'Você é um estrategista viral de copywriting para vídeos curtos. Responda apenas com JSON válido.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7
        })
      });

      const data = await res.json();
      if (data.choices && data.choices[0]) {
        postCopy = JSON.parse(data.choices[0].message.content);
      }
    } catch (err) {
      console.error('[OpenAI Post Copy Error]', err.message);
    }
  }

  // 2. Fallback inteligente com templates dinâmicos calibrados
  if (!postCopy || !Array.isArray(postCopy.titles) || postCopy.titles.length === 0) {
    const cleanTitle = projectTitle.replace(/[_#]/g, ' ').replace(/\s+/g, ' ').trim();
    if (isEnglish) {
      postCopy = {
        titles: [
          `You WON'T Believe This! 😱 ${cleanTitle.slice(0, 45)}`,
          `The Wildest Fact You'll See Today! 🤯 #Shorts`,
          `Nobody told you this about this mystery... 👀`,
          `Which One Surprised You Most? 🤔 Comment!`,
          `IS THIS REAL?! 🚨 ${cleanTitle.slice(0, 40)}`
        ],
        caption: `Did you know this? 😱 Watch until the end so you don't miss a single detail!\n\n${cleanTitle}\n\n👇 Which part did you find most unbelievable? Leave a comment and follow for the best curiosities every day!`,
        hashtags: `#shorts #facts #didyouknow #interestingfacts #viral #fyp #trending #learnontiktok`,
        recommendedTitle: `You WON'T Believe This! 😱 ${cleanTitle.slice(0, 45)}`
      };
    } else if (isSpanish) {
      postCopy = {
        titles: [
          `¡NO Sabías Esto! 😱 ${cleanTitle.slice(0, 45)}`,
          `¡El Dato Más Bizarro Que Verás Hoy! 🤯 #Shorts`,
          `Nadie te contó esto sobre este misterio... 👀`,
          `¿Cuál De Estos Te Sorprendió Más? 🤔 ¡Comenta!`,
          `¿ESTO ES REAL?! 🚨 ${cleanTitle.slice(0, 40)}`
        ],
        caption: `¿Sabías esto? 😱 ¡Mira hasta el final para no perderte ningún detalle!\n\n${cleanTitle}\n\n👇 ¿Qué parte te pareció más increíble? ¡Deja tu comentario y síguenos para las mejores curiosidades todos los días!`,
        hashtags: `#shorts #curiosidades #datoscuriosos #datosinteresantes #sabiasque #viral #parati #fyp #tendencia`,
        recommendedTitle: `¡NO Sabías Esto! 😱 ${cleanTitle.slice(0, 45)}`
      };
    } else {
      postCopy = {
        titles: [
          `Você NÃO Sabia Disso! 😱 ${cleanTitle.slice(0, 45)}`,
          `O Fato Mais Bizarro Que Você Já Viu! 🤯 #Shorts`,
          `Ninguém te contou isso sobre esse mistério... 👀`,
          `Qual Desses Mais Te Surpreendeu? 🤔 Comente!`,
          `ISSO É REAL?! 🚨 ${cleanTitle.slice(0, 40)}`
        ],
        caption: `Você sabia disso? 😱 Assista até o final para não perder nenhum detalhe!\n\n${cleanTitle}\n\n👇 Qual parte você achou mais inacreditável? Deixe seu comentário e siga para não perder as melhores curiosidades todos os dias!`,
        hashtags: `#shorts #curiosidades #fatosdesconhecidos #vocesabia #viral #reels #tiktok #fatoscuriosos #fyp`,
        recommendedTitle: `Você NÃO Sabia Disso! 😱 ${cleanTitle.slice(0, 45)}`
      };
    }
  }

  // 3. Salva em disco em formato JSON e TXT pronto para copiar e colar
  try {
    fs.writeFileSync(postInfoJsonPath, JSON.stringify(postCopy, null, 2), 'utf-8');
    if (lang === 'pt') {
      try { fs.writeFileSync(path.join(folderPath, 'post_info_pt.json'), JSON.stringify(postCopy, null, 2), 'utf-8'); } catch (_) {}
    }

    const txtContent = [
      `==================================================`,
      `📦 KIT DE PUBLICAÇÃO & COPYS VIRAIS [${lang.toUpperCase()}] - LUMIX STUDIO`,
      `Projeto: ${folderName}`,
      `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
      `==================================================\n`,
      `🎬 OPÇÕES DE TÍTULOS (CTR VIRAL):`,
      ...postCopy.titles.map((t, idx) => `[${idx + 1}] ${t}`),
      `\n🌟 Título Recomendado: ${postCopy.recommendedTitle || postCopy.titles[0]}\n`,
      `--------------------------------------------------`,
      `📝 LEGENDA / DESCRIÇÃO PARA O POST (Reels, Shorts, TikTok):`,
      `--------------------------------------------------`,
      postCopy.caption,
      `\n--------------------------------------------------`,
      `🏷️ HASHTAGS VIRAIS:`,
      `--------------------------------------------------`,
      postCopy.hashtags,
      `\n==================================================`
    ].join('\n');

    fs.writeFileSync(postInfoTxtPath, txtContent, 'utf-8');
    console.log(`[LUMIX] Kit de postagem [${lang.toUpperCase()}] gerado com sucesso para "${folderName}"!`);
  } catch (e) {
    console.error('[Save Post Copy Error]', e.message);
  }

  return postCopy;
}

module.exports = { generatePostCopyForProject };

