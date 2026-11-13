/**
 * server.js - Servidor do Painel de Automação de Shorts
 * Suporta todo o pipeline manual passo a passo:
 * Pesquisa -> Download -> VMake -> Transcrição -> Tradução GPT -> Voz Studio -> Mesclagem
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');

// Carrega .env nativo
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (e) {}
}

const PORT = process.env.DASHBOARD_PORT || 3333;
const ROOT_DIR = path.resolve(__dirname, '..');
const VIDEOS_DIR = path.join(ROOT_DIR, 'videos');
const TOOLS_DIR = path.join(ROOT_DIR, 'tools');
const isWin = process.platform === 'win32';
const YT_DLP_PATH = process.env.YTDLP_BIN || (isWin ? path.join(TOOLS_DIR, 'yt-dlp.exe') : 'yt-dlp');
const PYTHON_BIN = process.env.PYTHON_BIN || (isWin ? 'C:\\Users\\Maychel\\AppData\\Roaming\\VoiceStudio\\runtime\\project\\.venv\\Scripts\\python.exe' : 'python3');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

const { ProductionQueue } = require('./queue_manager.js');
const productionQueue = new ProductionQueue(ROOT_DIR, VIDEOS_DIR);
const youtubeManager = require('./youtube_manager.js');
const { EN_TRANSLATION_PROMPT, resolveVoiceId } = require('../scripts/lang_config.js');
const { ytDlpCommonArgsShell, fallbackFolderName } = require('../scripts/media_download.js');

// Estado dos processos em background (ex: VMake)
const activeJobs = new Map();

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sanitizeFolderName(name) {
  return name.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 80);
}

// Cache em memória para durações de vídeos (evita chamadas redundantes ao ffprobe)
const durationCache = new Map();

function getVideoDurationInSeconds(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return 0;
  try {
    const stats = fs.statSync(filePath);
    const cacheKey = `${filePath}_${stats.mtimeMs}_${stats.size}`;
    if (durationCache.has(cacheKey)) {
      return durationCache.get(cacheKey);
    }
    const probe = execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 5000
    });
    const dur = parseFloat(probe.trim());
    const validDur = (!isNaN(dur) && dur > 0) ? dur : 0;
    durationCache.set(cacheKey, validDur);
    return validDur;
  } catch (err) {
    return 0;
  }
}

function formatDurationToMinutes(seconds) {
  if (!seconds || seconds <= 0) return null;
  const totalSecs = Math.round(seconds);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')} min`;
}

// Verifica status dos arquivos de um projeto
function getProjectDetails(folderName) {
  if (!folderName || typeof folderName !== 'string') return null;
  const folderPath = path.join(VIDEOS_DIR, folderName);
  if (!fs.existsSync(folderPath)) return null;

  const originalVideo = path.join(folderPath, 'original.mp4');
  const cleanedVideo = path.join(folderPath, 'sem_marca.mp4');
  const cutVideo = path.join(folderPath, 'video_cortado.mp4');
  const transcriptFile = path.join(folderPath, 'transcricao_original.txt');
  const translatedFile = path.join(folderPath, 'roteiro_traduzido.txt');
  const audioFile = path.join(folderPath, 'narracao.mp3');
  const finalVideo = path.join(folderPath, 'final.mp4');
  const infoFile = path.join(folderPath, 'info.json');

  let info = {};
  if (fs.existsSync(infoFile)) {
    try { info = JSON.parse(fs.readFileSync(infoFile, 'utf-8')); } catch (e) {}
  }

  // Gera ou recupera ID único fixo para o projeto (ex: VID-E1C660)
  if (!info.id) {
    const crypto = require('node:crypto');
    info.id = 'VID-' + crypto.createHash('md5').update(folderName).digest('hex').slice(0, 6).toUpperCase();
    try {
      fs.writeFileSync(infoFile, JSON.stringify(info, null, 2), 'utf-8');
    } catch (_) {}
  }

  const squareSubtitledVideo = path.join(folderPath, 'video_1x1_legendado.mp4');
  const vertical9x16Video = path.join(folderPath, 'video_9x16.mp4');
  const thumbVal20s = path.join(folderPath, 'final_val_20s.jpg');
  const thumbVal5s = path.join(folderPath, 'final_val_5s.jpg');
  const thumbClean5s = path.join(folderPath, 'clean_val_5s.jpg');

  let thumbnail = null;
  if (fs.existsSync(thumbVal20s)) thumbnail = `/media/${encodeURIComponent(folderName)}/final_val_20s.jpg`;
  else if (fs.existsSync(thumbVal5s)) thumbnail = `/media/${encodeURIComponent(folderName)}/final_val_5s.jpg`;
  else if (fs.existsSync(thumbClean5s)) thumbnail = `/media/${encodeURIComponent(folderName)}/clean_val_5s.jpg`;

  const postInfoFile = path.join(folderPath, 'post_info.json');
  let postCopy = null;
  if (fs.existsSync(postInfoFile)) {
    try { postCopy = JSON.parse(fs.readFileSync(postInfoFile, 'utf-8')); } catch (e) {}
  }

  // Detecção de idiomas disponíveis neste projeto
  const detectedLangs = new Set(['pt']);
  if (Array.isArray(info.languages)) {
    info.languages.forEach(l => { if (l) detectedLangs.add(String(l).toLowerCase()); });
  }
  try {
    const dirFiles = fs.readdirSync(folderPath);
    for (const f of dirFiles) {
      const m = f.match(/^(?:roteiro_traduzido|narracao|video_9x16|post_info)_([a-zA-Z]{2,5})\./);
      if (m && m[1]) {
        detectedLangs.add(m[1].toLowerCase());
      }
    }
  } catch (_) {}

  // Mapeia idiomas postados no YouTube (PT, ES ou Ambos)
  const postedLangs = new Set();
  if (info.youtubeUploads && typeof info.youtubeUploads === 'object') {
    for (const [lKey, uData] of Object.entries(info.youtubeUploads)) {
      if (uData && (uData.url || uData.videoId || uData.manual)) {
        postedLangs.add(lKey.toLowerCase());
      }
    }
  }
  if (info.youtube && (info.youtube.url || info.youtube.videoId) && postedLangs.size === 0) {
    postedLangs.add('pt');
  }
  if (info.status === 'posted_pt') postedLangs.add('pt');
  if (info.status === 'posted_es') postedLangs.add('es');
  if (info.status === 'posted_en') postedLangs.add('en');
  if (info.status === 'posted_all') { postedLangs.add('pt'); postedLangs.add('es'); postedLangs.add('en'); }
  if (info.status === 'posted_both') { postedLangs.add('pt'); postedLangs.add('es'); }
  if (info.status === 'posted' && postedLangs.size === 0) postedLangs.add('pt');
  // Marcação manual por idioma (clique no selo na coluna Idiomas) tem prioridade sobre o histórico de uploads
  if (Array.isArray(info.postedLangs)) {
    postedLangs.clear();
    info.postedLangs.forEach(l => postedLangs.add(String(l).toLowerCase()));
  }

  const langMetaMap = {
    pt: { name: 'Português', flag: '🇧🇷' },
    es: { name: 'Espanhol', flag: '🇪🇸' },
    en: { name: 'Inglês', flag: '🇺🇸' },
    fr: { name: 'Francês', flag: '🇫🇷' },
    de: { name: 'Alemão', flag: '🇩🇪' },
    it: { name: 'Italiano', flag: '🇮🇹' }
  };

  const languages = {};
  for (const l of detectedLangs) {
    const metaL = langMetaMap[l] || { name: l.toUpperCase(), flag: '🌐' };
    const lTransFile = (l === 'pt' && !fs.existsSync(path.join(folderPath, 'roteiro_traduzido_pt.txt')))
      ? path.join(folderPath, 'roteiro_traduzido.txt')
      : path.join(folderPath, `roteiro_traduzido_${l}.txt`);

    const lAudioFile = (l === 'pt' && !fs.existsSync(path.join(folderPath, 'narracao_pt.mp3')))
      ? path.join(folderPath, 'narracao.mp3')
      : path.join(folderPath, `narracao_${l}.mp3`);

    const lFinalFile = (l === 'pt' && !fs.existsSync(path.join(folderPath, 'final_pt.mp4')))
      ? path.join(folderPath, 'final.mp4')
      : path.join(folderPath, `final_${l}.mp4`);

    const l9x16File = (l === 'pt' && !fs.existsSync(path.join(folderPath, 'video_9x16_pt.mp4')))
      ? path.join(folderPath, 'video_9x16.mp4')
      : path.join(folderPath, `video_9x16_${l}.mp4`);

    const lPostFile = (l === 'pt' && !fs.existsSync(path.join(folderPath, 'post_info_pt.json')))
      ? path.join(folderPath, 'post_info.json')
      : path.join(folderPath, `post_info_${l}.json`);

    let lPostCopy = null;
    if (fs.existsSync(lPostFile)) {
      try { lPostCopy = JSON.parse(fs.readFileSync(lPostFile, 'utf-8')); } catch (_) {}
    }

    const isPostedThisLang = postedLangs.has(l);
    const ytUploadThisLang = (info.youtubeUploads && info.youtubeUploads[l]) || (l === 'pt' ? info.youtube : null);

    languages[l] = {
      code: l,
      name: metaL.name,
      flag: metaL.flag,
      isPosted: isPostedThisLang,
      youtubeUpload: ytUploadThisLang,
      hasTranslation: fs.existsSync(lTransFile),
      translation: fs.existsSync(lTransFile) ? fs.readFileSync(lTransFile, 'utf-8') : '',
      hasAudio: fs.existsSync(lAudioFile),
      hasFinal: fs.existsSync(lFinalFile),
      hasVertical9x16: fs.existsSync(l9x16File),
      hasPostCopy: !!lPostCopy,
      postCopy: lPostCopy,
      finalDuration: null,
      finalDurationFormatted: null,
      urls: {
        audio: fs.existsSync(lAudioFile) ? `/media/${encodeURIComponent(folderName)}/${path.basename(lAudioFile)}` : null,
        final: fs.existsSync(lFinalFile) ? `/media/${encodeURIComponent(folderName)}/${path.basename(lFinalFile)}` : null,
        vertical9x16: fs.existsSync(l9x16File) ? `/media/${encodeURIComponent(folderName)}/${path.basename(l9x16File)}` : null
      }
    };

    // Duração do vídeo final deste idioma específico
    const lFinalVideoPath = fs.existsSync(l9x16File) ? l9x16File : (fs.existsSync(lFinalFile) ? lFinalFile : null);
    if (lFinalVideoPath) {
      const lDur = getVideoDurationInSeconds(lFinalVideoPath);
      languages[l].finalDuration = lDur || null;
      languages[l].finalDurationFormatted = formatDurationToMinutes(lDur);
    }
  }

  const isPostedPT = postedLangs.has('pt');
  const isPostedES = postedLangs.has('es');
  const isPostedBoth = isPostedPT && isPostedES;

  // Status: "posted" sempre que houver algum idioma postado; senão, Em Edição/Pronto
  // (escolha manual) ou o cálculo pelos arquivos quando não há escolha salva.
  let computedStatus = info.status;
  if (postedLangs.size > 0) {
    computedStatus = 'posted';
  } else if (computedStatus !== 'in_progress' && computedStatus !== 'ready') {
    computedStatus = (fs.existsSync(vertical9x16Video) ? 'ready' : (fs.existsSync(finalVideo) ? 'assembled' : 'in_progress'));
  }

  // Identifica o vídeo final que foi gerado (prioriza 9:16 vertical, depois 1x1 ou final mesclado)
  let bestFinalVideo = null;
  if (fs.existsSync(vertical9x16Video)) bestFinalVideo = vertical9x16Video;
  else if (fs.existsSync(squareSubtitledVideo)) bestFinalVideo = squareSubtitledVideo;
  else if (fs.existsSync(finalVideo)) bestFinalVideo = finalVideo;

  // Se não encontrou nos caminhos principais, busca em qualquer idioma gerado
  if (!bestFinalVideo) {
    for (const l of detectedLangs) {
      const cand9x16 = path.join(folderPath, `video_9x16_${l}.mp4`);
      const candFinal = path.join(folderPath, `final_${l}.mp4`);
      if (fs.existsSync(cand9x16)) { bestFinalVideo = cand9x16; break; }
      if (fs.existsSync(candFinal)) { bestFinalVideo = candFinal; break; }
    }
  }

  const finalDurationSecs = bestFinalVideo ? getVideoDurationInSeconds(bestFinalVideo) : 0;
  const finalDurationFormatted = formatDurationToMinutes(finalDurationSecs);

  return {
    name: folderName,
    path: folderPath,
    info,
    availableLanguages: Array.from(detectedLangs),
    languages,
    postedLanguages: Array.from(postedLangs),
    isPostedPT,
    isPostedES,
    isPostedBoth,
    status: computedStatus,
    withMusic: info.withMusic !== undefined ? Boolean(info.withMusic) : false,
    finalDuration: finalDurationSecs || null,
    finalDurationFormatted: finalDurationFormatted || null,
    scheduledDate: info.scheduledDate || null,
    hasOriginal: fs.existsSync(originalVideo),
    hasCleaned: fs.existsSync(cleanedVideo),
    hasCut: fs.existsSync(cutVideo),
    hasTranscript: fs.existsSync(transcriptFile),
    hasTranslation: fs.existsSync(translatedFile),
    hasAudio: fs.existsSync(audioFile),
    hasFinal: fs.existsSync(finalVideo),
    hasSquareSubtitled: fs.existsSync(squareSubtitledVideo),
    hasVertical9x16: fs.existsSync(vertical9x16Video),
    hasPostCopy: !!postCopy,
    postCopy,
    thumbnail,
    transcript: fs.existsSync(transcriptFile) ? fs.readFileSync(transcriptFile, 'utf-8') : '',
    translation: fs.existsSync(translatedFile) ? fs.readFileSync(translatedFile, 'utf-8') : '',
    urls: {
      original: fs.existsSync(originalVideo) ? `/media/${encodeURIComponent(folderName)}/original.mp4` : null,
      cleaned: fs.existsSync(cleanedVideo) ? `/media/${encodeURIComponent(folderName)}/sem_marca.mp4` : null,
      cut: fs.existsSync(cutVideo) ? `/media/${encodeURIComponent(folderName)}/video_cortado.mp4` : null,
      audio: fs.existsSync(audioFile) ? `/media/${encodeURIComponent(folderName)}/narracao.mp3` : null,
      final: fs.existsSync(finalVideo) ? `/media/${encodeURIComponent(folderName)}/final.mp4` : null,
      squareSubtitled: fs.existsSync(squareSubtitledVideo) ? `/media/${encodeURIComponent(folderName)}/video_1x1_legendado.mp4` : null,
      vertical9x16: fs.existsSync(vertical9x16Video) ? `/media/${encodeURIComponent(folderName)}/video_9x16.mp4` : null,
      thumbnail
    }
  };
}

// Helper para mapear vídeos que já existem na pasta /videos ou na fila de produção
function getExistingVideosMap() {
  const existingMap = new Map(); // id -> { folderName, title, status }
  const existingTitles = new Set();

  function extractId(str) {
    if (!str || typeof str !== 'string') return null;
    const m = str.match(/(?:shorts\/|v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function cleanTitle(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  }

  // 1. Vascula projetos existentes no disco
  if (fs.existsSync(VIDEOS_DIR)) {
    try {
      const folders = fs.readdirSync(VIDEOS_DIR).filter(f => {
        try { return fs.statSync(path.join(VIDEOS_DIR, f)).isDirectory(); } catch(e) { return false; }
      });

      for (const f of folders) {
        const folderPath = path.join(VIDEOS_DIR, f);
        const infoPath = path.join(folderPath, 'info.json');
        let title = f.replace(/_/g, ' ');
        let status = 'ready';
        let foundId = extractId(f);

        if (fs.existsSync(infoPath)) {
          try {
            const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
            if (info.title) title = info.title;
            if (info.status) status = info.status;
            if (info.url) {
              const urlId = extractId(info.url);
              if (urlId) foundId = urlId;
            }
          } catch (_) {}
        }

        if (foundId) {
          existingMap.set(foundId, { folderName: f, title, status });
        }
        const ct = cleanTitle(title);
        if (ct.length > 6) {
          existingTitles.add(ct);
        }
      }
    } catch (e) {
      console.error('[ExistingVideosMap Disk Error]', e.message);
    }
  }

  // 2. Vascula itens na fila de produção (ProductionQueue)
  try {
    if (productionQueue && Array.isArray(productionQueue.items)) {
      for (const item of productionQueue.items) {
        const qId = extractId(item.target);
        if (qId && !existingMap.has(qId)) {
          existingMap.set(qId, {
            folderName: item.projectFolder || null,
            title: item.title,
            status: item.status === 'completed' ? 'ready' : (item.status || 'queued')
          });
        }
        const ct = cleanTitle(item.title);
        if (ct.length > 6) {
          existingTitles.add(ct);
        }
      }
    }
  } catch (_) {}

  return { existingMap, existingTitles, cleanTitle };
}

// ----------------------------------------------------
// Motor Ultrarrápido de Pesquisa de Shorts Virais (Innertube Web API)
// ----------------------------------------------------
async function searchYouTubeShortsFast(query, minViews = 1000000, limit = 10, filterExisting = 'hide') {
  function parseViews(str) {
    if (!str) return 0;
    const cleaned = str.toLowerCase().replace(/\s+/g, ' ').trim();
    // Bilhões: "1 bi", "2.5b", "1 bilhão", "1.2 bilhões"
    const bMatch = cleaned.match(/([\d,.]+)\s*(?:bi\b|b\b|bilh[ãa]o|bilh[õo]es)/);
    if (bMatch) {
      const num = parseFloat(bMatch[1].replace(',', '.'));
      return Math.round(num * 1000000000);
    }
    // Milhões: "1,4 mi", "2.5m", "10 milhões", "10 milhoes" (garante não casar com "mil")
    const mMatch = cleaned.match(/([\d,.]+)\s*(?:mi\b|m\b|milh[ãa]o|milh[õo]es)/);
    if (mMatch) {
      const num = parseFloat(mMatch[1].replace(',', '.'));
      return Math.round(num * 1000000);
    }
    // Mil: "500 mil", "200k"
    const kMatch = cleaned.match(/([\d,.]+)\s*(?:mil\b|k\b)/);
    if (kMatch) {
      const num = parseFloat(kMatch[1].replace(',', '.'));
      return Math.round(num * 1000);
    }
    const numOnly = cleaned.replace(/[^\d]/g, '');
    return parseInt(numOnly, 10) || 0;
  }

  // Tradução / Mapeamento automático para garantir que as buscas ao YouTube sejam SEMPRE em inglês
  function translateToEnglish(str) {
    if (!str) return 'movierecap';
    let s = str.toLowerCase().trim();
    const map = [
      [/\bresumo de filmes?\b/gi, 'movie recap'],
      [/\bcena de filmes?\b/gi, 'movie scene'],
      [/\bfilme explicad[oa]\b/gi, 'movie recap explained'],
      [/\bfilmes?\b/gi, 'movie'],
      [/\bfatos curiosos\b/gi, 'mind blowing facts'],
      [/\bfatos bizarros\b/gi, 'disturbing facts'],
      [/\bfatos desconhecidos\b/gi, 'facts you didnt know'],
      [/\bfatos que podem salvar sua vida\b/gi, 'life saving facts'],
      [/\bfatos\b/gi, 'facts'],
      [/\bcuriosidades?\b/gi, 'did you know facts'],
      [/\bvoc[eê] sabia\b/gi, 'did you know'],
      [/\bvocesabia\b/gi, 'did you know'],
      [/\bhist[oó]rias de terror\b/gi, 'scary stories'],
      [/\bhist[oó]rias assustadoras\b/gi, 'scary stories'],
      [/\brelatos assustadores\b/gi, 'creepy stories'],
      [/\brelatos reais\b/gi, 'true scary stories'],
      [/\bhist[oó]rias?\b/gi, 'stories'],
      [/\bmist[eé]rios sem explica[cç][aã]o\b/gi, 'unsolved mysteries'],
      [/\bmist[eé]rios?\b/gi, 'mysteries'],
      [/\bci[eê]ncia\b/gi, 'science facts'],
      [/\bexperimentos bizarros\b/gi, 'crazy experiments'],
      [/\bexperimentos?\b/gi, 'experiments'],
      [/\bcomo funciona\b/gi, 'how it works'],
      [/\bmotiva[cç][aã]o\b/gi, 'motivation'],
      [/\btecnologia\b/gi, 'technology'],
      [/\bespa[cç]o\b/gi, 'space facts'],
      [/\banimais\b/gi, 'animal facts'],
      [/\bpsicologia\b/gi, 'psychology facts']
    ];
    for (const [regex, rep] of map) {
      s = s.replace(regex, rep);
    }
    return s.trim();
  }

  const rawQuery = (query || 'movierecap').trim();
  const baseQuery = translateToEnglish(rawQuery) || 'movierecap';
  const queriesToRun = [];
  queriesToRun.push(baseQuery);
  const qLower = baseQuery.toLowerCase();
  if (!qLower.includes('short')) {
    queriesToRun.push(`${baseQuery} #shorts`);
    queriesToRun.push(`${baseQuery} shorts`);
  }
  if (!qLower.includes('viral')) {
    queriesToRun.push(`${baseQuery} viral`);
  }

  const candidates = [];
  const seenIds = new Set();

  function extractShorts(obj) {
    if (!obj || typeof obj !== 'object') return;

    // 1. YouTube 2024+ shortsLockupViewModel
    if (obj.shortsLockupViewModel) {
      const sl = obj.shortsLockupViewModel;
      const title = sl.overlayMetadata?.primaryText?.content || '';
      const viewsRaw = sl.overlayMetadata?.secondaryText?.content || '';
      const views = parseViews(viewsRaw);
      const thumb = sl.thumbnailViewModel?.thumbnailViewModel?.image?.sources?.[0]?.url || '';
      const jsonStr = JSON.stringify(sl);
      const idMatch = jsonStr.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      const id = idMatch ? idMatch[1] : null;

      if (id && title && !seenIds.has(id)) {
        seenIds.add(id);
        candidates.push({
          id,
          title,
          views,
          viewsRaw,
          thumbnail: thumb || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          channel: 'YouTube Shorts',
          duration: 45,
          durationFormatted: '45s',
          url: `https://www.youtube.com/shorts/${id}`
        });
      }
    }

    // 2. reelItemRenderer (Older/alternate format)
    if (obj.reelItemRenderer) {
      const rl = obj.reelItemRenderer;
      const id = rl.videoId;
      const title = rl.headline?.simpleText || rl.headline?.runs?.[0]?.text || '';
      const viewsRaw = rl.viewCountText?.simpleText || rl.viewCountText?.runs?.[0]?.text || '';
      const views = parseViews(viewsRaw);
      const thumb = rl.thumbnail?.thumbnails?.[0]?.url || '';
      if (id && title && !seenIds.has(id)) {
        seenIds.add(id);
        candidates.push({
          id,
          title: title || 'Short Viral',
          views,
          viewsRaw,
          thumbnail: thumb || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          channel: 'YouTube Shorts',
          duration: 45,
          durationFormatted: '45s',
          url: `https://www.youtube.com/shorts/${id}`
        });
      }
    }

    for (const k of Object.keys(obj)) {
      extractShorts(obj[k]);
    }
  }

  // Executa buscas paralelas com Promise.allSettled para máxima velocidade e abrangência
  await Promise.allSettled(
    queriesToRun.map(async (q) => {
      try {
        const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20240401.01.00',
                hl: 'en',
                gl: 'US'
              }
            },
            query: q
          }),
          signal: AbortSignal.timeout(6000)
        });

        if (!res.ok) return;
        const data = await res.json();
        extractShorts(data);
      } catch (e) {
        console.error(`[Search Innertube Error for "${q}"]`, e.message);
      }
    })
  );

  // Cruza candidatos com vídeos já produzidos ou em fila
  const { existingMap, existingTitles, cleanTitle } = getExistingVideosMap();

  candidates.forEach(c => {
    const isIdMatch = existingMap.has(c.id);
    const ct = cleanTitle(c.title);
    const isTitleMatch = ct.length > 8 && existingTitles.has(ct);

    if (isIdMatch) {
      const match = existingMap.get(c.id);
      c.alreadyExists = true;
      c.existingFolder = match.folderName || null;
      c.existingStatus = match.status || 'ready';
    } else if (isTitleMatch) {
      c.alreadyExists = true;
      c.existingFolder = null;
      c.existingStatus = 'ready';
    } else {
      c.alreadyExists = false;
      c.existingFolder = null;
      c.existingStatus = null;
    }
  });

  // Filtra de acordo com a opção de vídeos já produzidos:
  // 'hide' (padrão): pula os já feitos e traz apenas inéditos
  // 'only': traz apenas os já feitos
  // 'show': traz todos, mantendo marcação de já feito
  let pool = candidates;
  if (filterExisting === 'hide') {
    const fresh = candidates.filter(c => !c.alreadyExists);
    // Se o filtro 'hide' encontrar vídeos inéditos, usa eles; se não houver nenhum inédito, traz candidates
    if (fresh.length > 0) pool = fresh;
  } else if (filterExisting === 'only') {
    pool = candidates.filter(c => c.alreadyExists);
  }

  // Ordena por visualizações de forma estritamente decrescente
  pool.sort((a, b) => b.views - a.views);

  // Filtra por minViews com fallback inteligente para nunca retornar vazio se houver vídeos
  let filtered = pool;
  if (minViews > 0) {
    const withMinViews = pool.filter(c => c.views >= minViews);
    if (withMinViews.length >= limit) {
      filtered = withMinViews;
    } else if (withMinViews.length > 0) {
      const remaining = pool.filter(c => c.views < minViews);
      filtered = [...withMinViews, ...remaining];
    } else {
      // Nenhum bateu o corte estrito de minViews, usa os mais vistos encontrados no pool
      filtered = pool;
    }
  }

  const results = filtered.slice(0, limit);
  return {
    results,
    total: results.length,
    query,
    minViews,
    filterExisting
  };
}

// ----------------------------------------------------
const { generatePostCopyForProject } = require('../scripts/generate_post_copy.js');

// Servidor HTTP
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    // ----------------------------------------------------
    // API: Status geral do sistema e serviços
    // ----------------------------------------------------
    if (pathname === '/api/status' && req.method === 'GET') {
      let voiceStudioOnline = false;
      let voiceStudioInfo = null;

      try {
        const vsUrl = process.env.VOICESTUDIO_URL || 'http://127.0.0.1:3900';
        const vsRes = await fetch(`${vsUrl}/.well-known/voicestudio-speech`, { signal: AbortSignal.timeout(1500) });
        if (vsRes.ok) {
          voiceStudioOnline = true;
          voiceStudioInfo = await vsRes.json();
        }
      } catch (e) {}

      return sendJson(res, 200, {
        minimax: {
          online: !!process.env.MINIMAX_API_KEY,
          voiceId: process.env.MINIMAX_VOICE_ID || 'moss_audio_7eb5eaa1-d18c-11f1-a1a6-e6b4e5387684'
        },
        voiceStudio: {
          online: voiceStudioOnline,
          url: process.env.VOICESTUDIO_URL || 'http://127.0.0.1:3900',
          info: voiceStudioInfo
        },
        openai: {
          configured: !!process.env.OPENAI_API_KEY
        },
        anthropic: {
          configured: !!process.env.ANTHROPIC_API_KEY
        },
        vmakeAuth: fs.existsSync(path.join(ROOT_DIR, 'vmake_auth.json')),
        youtube: (() => {
          const ytList = youtubeManager.getPublicChannelsList();
          return {
            connected: ytList.channels.length > 0,
            count: ytList.channels.length,
            activeChannel: ytList.activeChannel
          };
        })()
      });
    }

    // ----------------------------------------------------
    // API: YouTube Multi-Canal (OAuth 2.0, Troca de canal, Apelidos, Métricas)
    // ----------------------------------------------------
    if (pathname === '/api/youtube/channels' && req.method === 'GET') {
      return sendJson(res, 200, youtubeManager.getPublicChannelsList());
    }

    if (pathname === '/api/youtube/channels/select' && req.method === 'POST') {
      const { channelId } = await parseBody(req);
      try {
        youtubeManager.setActiveChannel(channelId);
        return sendJson(res, 200, { success: true, ...youtubeManager.getPublicChannelsList() });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (pathname === '/api/youtube/channels/alias' && req.method === 'POST') {
      const { channelId, alias } = await parseBody(req);
      try {
        youtubeManager.setChannelAlias(channelId, alias);
        return sendJson(res, 200, { success: true, ...youtubeManager.getPublicChannelsList() });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (pathname === '/api/youtube/channels/delete' && req.method === 'POST') {
      const { channelId } = await parseBody(req);
      try {
        youtubeManager.removeChannel(channelId);
        return sendJson(res, 200, { success: true, ...youtubeManager.getPublicChannelsList() });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (pathname === '/api/youtube/channels/refresh' && req.method === 'POST') {
      const { channelId } = await parseBody(req);
      try {
        await youtubeManager.refreshChannelDetails(channelId);
        return sendJson(res, 200, { success: true, ...youtubeManager.getPublicChannelsList() });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (pathname === '/api/youtube/publish' && req.method === 'POST') {
      const { projectName, channelId, title, description, tags, privacyStatus, publishAt, lang = 'pt' } = await parseBody(req);
      if (!projectName) return sendJson(res, 400, { error: 'Nome do projeto é obrigatório.' });
      if (!channelId) return sendJson(res, 400, { error: 'Selecione um canal para postar.' });

      const folderPath = path.join(VIDEOS_DIR, projectName);
      if (!fs.existsSync(folderPath)) return sendJson(res, 404, { error: 'Pasta do projeto não encontrada.' });

      // Busca o vídeo final renderizado específico para o idioma ativo
      const lang9x16 = lang === 'pt' ? 'video_9x16.mp4' : `video_9x16_${lang}.mp4`;
      const langFinal = lang === 'pt' ? 'final.mp4' : `final_${lang}.mp4`;

      const videoPath = fs.existsSync(path.join(folderPath, lang9x16))
        ? path.join(folderPath, lang9x16)
        : (fs.existsSync(path.join(folderPath, langFinal))
            ? path.join(folderPath, langFinal)
            : (fs.existsSync(path.join(folderPath, 'video_9x16.mp4'))
                ? path.join(folderPath, 'video_9x16.mp4')
                : (fs.existsSync(path.join(folderPath, 'final.mp4'))
                    ? path.join(folderPath, 'final.mp4')
                    : (fs.existsSync(path.join(folderPath, 'video_1x1_legendado.mp4'))
                        ? path.join(folderPath, 'video_1x1_legendado.mp4')
                        : path.join(folderPath, 'original.mp4')))));

      try {
        const uploadRes = await youtubeManager.uploadShortVideo(channelId, videoPath, {
          title,
          description,
          tags,
          privacyStatus: privacyStatus || 'public',
          publishAt: publishAt || null
        });

        // Atualiza status do projeto no info.json com histórico por idioma
        const infoFile = path.join(folderPath, 'info.json');
        if (fs.existsSync(infoFile)) {
          try {
            const info = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
            if (!info.youtubeUploads) info.youtubeUploads = {};
            info.youtubeUploads[lang] = {
              videoId: uploadRes.videoId,
              url: uploadRes.shortUrl,
              channelId: uploadRes.channelId,
              title,
              publishedAt: uploadRes.uploadedAt,
              scheduledFor: publishAt || null
            };
            info.youtube = info.youtubeUploads[lang];
            if (Array.isArray(info.postedLangs) && !info.postedLangs.includes(lang)) info.postedLangs.push(lang);
            const hasPt = !!(info.youtubeUploads.pt?.url || info.youtubeUploads.pt?.videoId || info.youtubeUploads.pt?.manual);
            const hasEs = !!(info.youtubeUploads.es?.url || info.youtubeUploads.es?.videoId || info.youtubeUploads.es?.manual);
            if (hasPt && hasEs) info.status = 'posted_both';
            else if (hasEs) info.status = 'posted_es';
            else if (hasPt) info.status = 'posted_pt';
            else info.status = 'posted';
            fs.writeFileSync(infoFile, JSON.stringify(info, null, 2), 'utf-8');
          } catch (e) {}
        }

        return sendJson(res, 200, {
          success: true,
          ...uploadRes,
          lang,
          project: getProjectDetails(projectName)
        });
      } catch (err) {
        console.error('[YouTube Publish Error]', err);
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (pathname === '/api/auth/youtube/status' && req.method === 'GET') {
      const ytList = youtubeManager.getPublicChannelsList();
      return sendJson(res, 200, {
        connected: ytList.channels.length > 0,
        count: ytList.channels.length,
        activeChannel: ytList.activeChannel,
        channelName: ytList.activeChannel?.alias || ytList.activeChannel?.name || 'Canal Desconectado'
      });
    }

    if (pathname === '/api/auth/youtube/login' && req.method === 'GET') {
      const authUrl = youtubeManager.getLoginUrl(req);
      res.writeHead(302, { Location: authUrl });
      return res.end();
    }

    if (pathname === '/api/auth/youtube/callback' && req.method === 'GET') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(302, { Location: `/#tab-youtube?error=${encodeURIComponent('YouTube Auth recusado: ' + error)}` });
        return res.end();
      }

      if (!code) {
        res.writeHead(302, { Location: `/#tab-youtube?error=${encodeURIComponent('Código de autorização não recebido')}` });
        return res.end();
      }

      try {
        const redirectUri = youtubeManager.getRedirectUri(req);
        const tokens = await youtubeManager.exchangeCodeForTokens(code, redirectUri);
        const profile = await youtubeManager.fetchChannelProfile(tokens.access_token);
        await youtubeManager.addOrUpdateChannel(tokens, profile);

        res.writeHead(302, {
          Location: `/#tab-youtube?youtube_connected=true&channel=${encodeURIComponent(profile.name)}`
        });
        return res.end();
      } catch (err) {
        console.error('[YouTube Multi-Channel Callback Error]', err);
        res.writeHead(302, { Location: `/#tab-youtube?error=${encodeURIComponent('Erro ao autenticar: ' + err.message)}` });
        return res.end();
      }
    }

    if (pathname === '/api/auth/youtube/disconnect' && req.method === 'POST') {
      const { channelId } = await parseBody(req);
      const ytList = youtubeManager.getPublicChannelsList();
      const targetId = channelId || ytList.activeChannelId;
      if (targetId) {
        youtubeManager.removeChannel(targetId);
      }
      return sendJson(res, 200, { success: true, ...youtubeManager.getPublicChannelsList() });
    }

    // ----------------------------------------------------
    // API: Listar projetos na pasta /videos (Ordenados por data decrescente: do mais novo ao mais antigo)
    // ----------------------------------------------------
    if (pathname === '/api/projects' && req.method === 'GET') {
      const folders = fs.readdirSync(VIDEOS_DIR).filter(f => {
        return fs.statSync(path.join(VIDEOS_DIR, f)).isDirectory();
      });

      // Ordena pastas do disco por data de modificação decrescente (mais recente primeiro)
      folders.sort((a, b) => {
        const timeA = fs.statSync(path.join(VIDEOS_DIR, a)).mtimeMs;
        const timeB = fs.statSync(path.join(VIDEOS_DIR, b)).mtimeMs;
        return timeB - timeA;
      });

      const projects = folders.map(getProjectDetails).filter(Boolean);
      return sendJson(res, 200, { projects });
    }

    // ----------------------------------------------------
    // API: Obter detalhes de um projeto específico (por nome de pasta ou ID)
    // ----------------------------------------------------
    if (pathname.startsWith('/api/projects/') && req.method === 'GET') {
      const param = decodeURIComponent(pathname.replace('/api/projects/', ''));
      let details = getProjectDetails(param);

      // Se não encontrou por pasta, tenta buscar por id (ex: VID-E1C660)
      if (!details) {
        const folders = fs.readdirSync(VIDEOS_DIR).filter(f => fs.statSync(path.join(VIDEOS_DIR, f)).isDirectory());
        for (const f of folders) {
          const d = getProjectDetails(f);
          if (d && (d.info?.id === param || d.id === param)) {
            details = d;
            break;
          }
        }
      }

      if (!details) return sendJson(res, 404, { error: 'Projeto não encontrado' });
      return sendJson(res, 200, details);
    }

    // ----------------------------------------------------
    // API: Deletar Projeto (Exclui permanentemente do disco)
    // ----------------------------------------------------
    if (pathname === '/api/projects/delete' && req.method === 'POST') {
      const { project } = await parseBody(req);
      if (!project) return sendJson(res, 400, { error: 'Nome do projeto necessário' });
      const folderPath = path.join(VIDEOS_DIR, project);
      if (!fs.existsSync(folderPath)) return sendJson(res, 404, { error: 'Projeto não encontrado' });
      try {
        fs.rmSync(folderPath, { recursive: true, force: true });
        console.log(`[LUMIX] Projeto excluído do disco: "${project}"`);
        return sendJson(res, 200, { success: true, deleted: project });
      } catch (err) {
        console.error('[Delete Project Error]', err);
        return sendJson(res, 500, { error: 'Falha ao deletar pasta do projeto', detail: err.message });
      }
    }

    // ----------------------------------------------------
    // API: Marcar/desmarcar um idioma como postado (clique no selo da coluna Idiomas)
    // ----------------------------------------------------
    if (pathname === '/api/projects/toggle-language' && req.method === 'POST') {
      const { project, lang, posted } = await parseBody(req);
      if (!project || !lang) return sendJson(res, 400, { error: 'Projeto e idioma são necessários' });
      const folderPath = path.join(VIDEOS_DIR, project);
      const infoFile = path.join(folderPath, 'info.json');
      if (!fs.existsSync(infoFile)) return sendJson(res, 404, { error: 'Projeto não encontrado' });

      const current = new Set(getProjectDetails(project).postedLanguages || []);
      const l = String(lang).toLowerCase();
      const target = typeof posted === 'boolean' ? posted : !current.has(l);
      if (target) current.add(l); else current.delete(l);

      const info = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
      info.postedLangs = Array.from(current);
      fs.writeFileSync(infoFile, JSON.stringify(info, null, 2), 'utf-8');
      return sendJson(res, 200, { success: true, project: getProjectDetails(project) });
    }

    // ----------------------------------------------------
    // API: Atualizar Metadados do Projeto (Renomear e Data de Postagem)
    // ----------------------------------------------------
    if (pathname === '/api/projects/update-meta' && req.method === 'POST') {
      const { project, title, scheduledDate, status } = await parseBody(req);
      if (!project) return sendJson(res, 400, { error: 'Nome do projeto necessário' });
      const folderPath = path.join(VIDEOS_DIR, project);
      if (!fs.existsSync(folderPath)) return sendJson(res, 404, { error: 'Projeto não encontrado' });

      const infoFile = path.join(folderPath, 'info.json');
      let info = {};
      if (fs.existsSync(infoFile)) {
        try { info = JSON.parse(fs.readFileSync(infoFile, 'utf-8')); } catch (e) {}
      }

      if (typeof title === 'string' && title.trim()) {
        info.title = title.trim();
      }
      if (typeof scheduledDate !== 'undefined') {
        info.scheduledDate = scheduledDate ? scheduledDate.trim() : null;
      }
      // Só "Em Edição" e "Pronto" são escolhidos manualmente. "Postado" é automático (ver toggle por idioma).
      if (typeof status === 'string' && (status.trim() === 'in_progress' || status.trim() === 'ready')) {
        info.status = status.trim();
      }

      fs.writeFileSync(infoFile, JSON.stringify(info, null, 2), 'utf-8');
      return sendJson(res, 200, { success: true, project: getProjectDetails(project) });
    }

    // ----------------------------------------------------
    // ----------------------------------------------------
    // API: Configurações & Chaves de API (OpenAI, MiniMax, VoiceStudio, VMake API)
    // ----------------------------------------------------
    if (pathname === '/api/settings' && req.method === 'GET') {
      return sendJson(res, 200, {
        openaiKey: process.env.OPENAI_API_KEY || '',
        hasOpenai: !!process.env.OPENAI_API_KEY,
        minimaxKey: process.env.MINIMAX_API_KEY || '',
        hasMinimax: !!process.env.MINIMAX_API_KEY,
        minimaxVoiceId: process.env.MINIMAX_VOICE_ID || 'moss_audio_7eb5eaa1-d18c-11f1-a1a6-e6b4e5387684',
        voicestudioUrl: process.env.VOICESTUDIO_URL || 'http://127.0.0.1:3900',
        vmakeAk: process.env.VMAKE_AK || process.env.MT_AK || '',
        vmakeSk: process.env.VMAKE_SK || process.env.MT_SK || '',
        hasVmake: !!(process.env.VMAKE_AK || process.env.MT_AK),
        vmakeTask: process.env.VMAKE_TASK || 'SKM0002'
      });
    }

    if (pathname === '/api/settings/save' && req.method === 'POST') {
      const { openaiKey, minimaxKey, minimaxVoiceId, voicestudioUrl, vmakeAk, vmakeSk, vmakeTask } = await parseBody(req);
      const envPath = path.join(ROOT_DIR, '.env');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

      const updateEnvVar = (content, key, val) => {
        if (typeof val === 'undefined') return content;
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(content)) {
          return content.replace(regex, `${key}="${val}"`);
        }
        return content + (content.endsWith('\n') ? '' : '\n') + `${key}="${val}"\n`;
      };

      if (typeof openaiKey === 'string') {
        const cleanKey = openaiKey.trim();
        envContent = updateEnvVar(envContent, 'OPENAI_API_KEY', cleanKey);
        process.env.OPENAI_API_KEY = cleanKey;
      }

      if (typeof minimaxKey === 'string') {
        const cleanKey = minimaxKey.trim();
        envContent = updateEnvVar(envContent, 'MINIMAX_API_KEY', cleanKey);
        process.env.MINIMAX_API_KEY = cleanKey;
      }

      if (typeof minimaxVoiceId === 'string' && minimaxVoiceId.trim()) {
        const cleanVoice = minimaxVoiceId.trim();
        envContent = updateEnvVar(envContent, 'MINIMAX_VOICE_ID', cleanVoice);
        process.env.MINIMAX_VOICE_ID = cleanVoice;
      }

      if (typeof voicestudioUrl === 'string' && voicestudioUrl.trim()) {
        const cleanVs = voicestudioUrl.trim();
        envContent = updateEnvVar(envContent, 'VOICESTUDIO_URL', cleanVs);
        process.env.VOICESTUDIO_URL = cleanVs;
      }

      if (typeof vmakeAk === 'string') {
        const cleanAk = vmakeAk.trim();
        envContent = updateEnvVar(envContent, 'VMAKE_AK', cleanAk);
        envContent = updateEnvVar(envContent, 'MT_AK', cleanAk);
        process.env.VMAKE_AK = cleanAk;
        process.env.MT_AK = cleanAk;
      }

      if (typeof vmakeSk === 'string') {
        const cleanSk = vmakeSk.trim();
        envContent = updateEnvVar(envContent, 'VMAKE_SK', cleanSk);
        envContent = updateEnvVar(envContent, 'MT_SK', cleanSk);
        process.env.VMAKE_SK = cleanSk;
        process.env.MT_SK = cleanSk;
      }

      if (typeof vmakeTask === 'string' && vmakeTask.trim()) {
        const cleanTask = vmakeTask.trim();
        envContent = updateEnvVar(envContent, 'VMAKE_TASK', cleanTask);
        process.env.VMAKE_TASK = cleanTask;
      }

      fs.writeFileSync(envPath, envContent, 'utf-8');
      console.log('[LUMIX] Configurações de API salvas com sucesso em .env');
      return sendJson(res, 200, { success: true });
    }

    // ----------------------------------------------------
    // API: Salvar edições de texto do projeto
    // ----------------------------------------------------
    if (pathname === '/api/save-text' && req.method === 'POST') {
      const { project, type, text } = await parseBody(req);
      if (!project || !type) return sendJson(res, 400, { error: 'Parâmetros incompletos' });
      const folderPath = path.join(VIDEOS_DIR, project);
      if (!fs.existsSync(folderPath)) return sendJson(res, 404, { error: 'Projeto não encontrado' });

      const fileName = type === 'transcript' ? 'transcricao_original.txt' : 'roteiro_traduzido.txt';
      fs.writeFileSync(path.join(folderPath, fileName), text || '', 'utf-8');
      return sendJson(res, 200, { success: true, project: getProjectDetails(project) });
    }

    // ----------------------------------------------------
    // API: Pesquisa de Shorts Virais (Innertube Fast Engine + 1M+ Views Priority)
    // ----------------------------------------------------
    if (pathname === '/api/search' && req.method === 'POST') {
      const body = await parseBody(req);
      const query = (body.query || 'movierecap').trim();
      const minViews = parseInt(body.minViews, 10) || 0;
      const limit = parseInt(body.limit, 10) || 12;
      const filterExisting = body.filterExisting || 'hide'; // 'hide' | 'show' | 'only'

      try {
        const searchRes = await searchYouTubeShortsFast(query, minViews, limit, filterExisting);
        return sendJson(res, 200, searchRes);
      } catch (err) {
        console.error('[Search API Error]', err.message);
        return sendJson(res, 500, { error: 'Erro ao buscar Shorts', detail: err.message, results: [] });
      }
    }

    // ----------------------------------------------------
    // API: Gerar Kit de Publicação & Copys Virais (Títulos + Legenda + Hashtags)
    // ----------------------------------------------------
    if (pathname === '/api/generate-post-copy' && req.method === 'POST') {
      const { project, lang = 'pt' } = await parseBody(req);
      if (!project) return sendJson(res, 400, { error: 'Nome do projeto necessário' });

      try {
        const postCopy = await generatePostCopyForProject(project, lang);
        const details = getProjectDetails(project);
        return sendJson(res, 200, { success: true, postCopy, lang, project: details });
      } catch (err) {
        console.error('[Generate Post Copy Error]', err.message);
        return sendJson(res, 500, { error: 'Erro ao gerar kit de postagem', detail: err.message });
      }
    }


    // ----------------------------------------------------
    // API: Download de Short Selecionado
    // ----------------------------------------------------
    if (pathname === '/api/download' && req.method === 'POST') {
      const { url, title, customFolder } = await parseBody(req);
      if (!url) return sendJson(res, 400, { error: 'URL necessária' });

      // Título vazio/só emojis não pode virar pasta '' (apontaria para videos/ inteira)
      const folderName = sanitizeFolderName(customFolder || title || '') || fallbackFolderName(url);
      const targetFolder = path.join(VIDEOS_DIR, folderName);
      if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });

      const outputPath = path.join(targetFolder, 'original.mp4');
      const infoPath = path.join(targetFolder, 'info.json');

      // YouTube Shorts, TikTok e Instagram (Reels/posts) via yt-dlp
      const cmd = `"${YT_DLP_PATH}" ${ytDlpCommonArgsShell()} --js-runtimes node -f "18/best[ext=mp4]/best" "${url}" -o "${outputPath}"`;
      execSync(cmd, { stdio: 'inherit' });

      // Salva info.json
      const meta = {
        title: title || folderName,
        url,
        folderName,
        downloadedAt: new Date().toISOString()
      };
      fs.writeFileSync(infoPath, JSON.stringify(meta, null, 2), 'utf-8');

      return sendJson(res, 200, {
        success: true,
        project: getProjectDetails(folderName)
      });
    }

    // ----------------------------------------------------
    // API: Fila Sequencial de Produção (Queue Automática)
    // ----------------------------------------------------
    if (pathname === '/api/queue' && req.method === 'GET') {
      return sendJson(res, 200, productionQueue.getStatus());
    }

    if (pathname === '/api/queue/add' && req.method === 'POST') {
      const { target, title, thumbnail, fromStep, languages, withMusic } = await parseBody(req);
      if (!target) return sendJson(res, 400, { error: 'Alvo necessário' });
      try {
        const result = productionQueue.addItem({ target, title, thumbnail, fromStep, languages, withMusic });
        return sendJson(res, 200, { success: true, ...result, queue: productionQueue.getStatus() });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    if (pathname === '/api/queue/remove' && req.method === 'POST') {
      const { id } = await parseBody(req);
      const success = productionQueue.removeItem(id);
      return sendJson(res, 200, { success, queue: productionQueue.getStatus() });
    }

    if (pathname === '/api/queue/cancel' && req.method === 'POST') {
      const { id } = await parseBody(req);
      const success = id ? productionQueue.cancelItem(id) : productionQueue.cancelCurrent();
      return sendJson(res, 200, { success, queue: productionQueue.getStatus() });
    }

    if (pathname === '/api/queue/cancel-current' && req.method === 'POST') {
      const success = productionQueue.cancelCurrent();
      return sendJson(res, 200, { success, queue: productionQueue.getStatus() });
    }

    if (pathname === '/api/queue/clear' && req.method === 'POST') {
      const success = productionQueue.clearHistory();
      return sendJson(res, 200, { success, queue: productionQueue.getStatus() });
    }

    if (pathname === '/api/queue/pause' && req.method === 'POST') {
      productionQueue.pause();
      return sendJson(res, 200, { success: true, queue: productionQueue.getStatus() });
    }

    if (pathname === '/api/queue/resume' && req.method === 'POST') {
      productionQueue.resume();
      return sendJson(res, 200, { success: true, queue: productionQueue.getStatus() });
    }

    // ----------------------------------------------------
    // API: Piloto Automático 1-Click (Pipeline Completo com Validações)
    // ----------------------------------------------------
    if (pathname === '/api/auto-pilot' && req.method === 'POST') {
      const { target } = await parseBody(req);
      if (!target) return sendJson(res, 400, { error: 'Alvo necessário (URL ou nome do projeto)' });

      const jobId = 'autopilot_' + Date.now();
      const jobState = {
        id: jobId,
        target,
        status: 'running',
        logs: [],
        startedAt: new Date().toISOString()
      };
      activeJobs.set(jobId, jobState);

      const runnerScript = path.join(ROOT_DIR, 'scripts', 'auto_pilot_pipeline.js');
      const child = spawn(process.execPath, [runnerScript, target], {
        cwd: ROOT_DIR
      });

      child.stdout.on('data', chunk => {
        const text = chunk.toString();
        jobState.logs.push(text);
        if (jobState.logs.length > 300) jobState.logs.shift();
      });

      child.stderr.on('data', chunk => {
        const text = chunk.toString();
        jobState.logs.push('[ERR] ' + text);
      });

      child.on('close', code => {
        jobState.status = code === 0 ? 'completed' : 'failed';
        jobState.exitCode = code;
        jobState.finishedAt = new Date().toISOString();
      });

      return sendJson(res, 200, { jobId, status: 'running' });
    }

    // ----------------------------------------------------
    // API: Disparar Remoção de Marca d'Água (VMake API Pool - Max 4 Concorrentes)
    // ----------------------------------------------------
    if (pathname === '/api/vmake' && req.method === 'POST') {
      const { project } = await parseBody(req);
      if (!project) return sendJson(res, 400, { error: 'Nome do projeto necessário' });
      const folderPath = path.join(VIDEOS_DIR, project);
      if (!fs.existsSync(folderPath)) return sendJson(res, 404, { error: 'Projeto não encontrado' });

      const jobId = 'vmake_' + Date.now();
      const jobState = {
        id: jobId,
        project,
        status: 'running',
        logs: [],
        startedAt: new Date().toISOString()
      };
      activeJobs.set(jobId, jobState);

      // Inicia remove-watermark.js (que utiliza o vmake_pool com limite de 4 simultâneos e sem timeout)
      const vmakeScript = path.join(ROOT_DIR, 'remove-watermark.js');
      const vmakeProcess = spawn(process.execPath, [vmakeScript, project], {
        cwd: ROOT_DIR
      });

      vmakeProcess.stdout.on('data', chunk => {
        const text = chunk.toString();
        jobState.logs.push(text);
        if (jobState.logs.length > 200) jobState.logs.shift();
      });

      vmakeProcess.stderr.on('data', chunk => {
        const text = chunk.toString();
        jobState.logs.push('[ERR] ' + text);
      });

      vmakeProcess.on('close', code => {
        jobState.status = code === 0 ? 'completed' : 'failed';
        jobState.exitCode = code;
        jobState.finishedAt = new Date().toISOString();
      });

      return sendJson(res, 200, { jobId, status: 'running' });
    }

    // ----------------------------------------------------
    // API: Status de Job em execução (ex: VMake)
    // ----------------------------------------------------
    if (pathname.startsWith('/api/jobs/') && req.method === 'GET') {
      const jobId = pathname.replace('/api/jobs/', '');
      const job = activeJobs.get(jobId);
      if (!job) return sendJson(res, 404, { error: 'Job não encontrado' });

      const details = job.project ? getProjectDetails(job.project) : (job.target ? getProjectDetails(job.target) : null);
      return sendJson(res, 200, {
        ...job,
        projectDetails: details
      });
    }

    // ----------------------------------------------------
    // API: Transcrever Áudio 100% via OpenAI Whisper API
    // ----------------------------------------------------
    if (pathname === '/api/transcribe' && req.method === 'POST') {
      const { project } = await parseBody(req);
      if (!project) return sendJson(res, 400, { error: 'Nome do projeto necessário' });
      const folderPath = path.join(VIDEOS_DIR, project);
      const videoPath = path.join(folderPath, 'original.mp4');

      if (!fs.existsSync(videoPath)) {
        return sendJson(res, 404, { error: 'original.mp4 não encontrado' });
      }

      const transcriptFile = path.join(folderPath, 'transcricao_original.txt');

      try {
        const { transcribeWithOpenAI } = require('../scripts/transcribe_openai.js');
        const transcriptText = await transcribeWithOpenAI(videoPath, transcriptFile, 'en');

        return sendJson(res, 200, {
          success: true,
          transcript: transcriptText,
          provider: 'OpenAI Whisper API Cloud',
          project: getProjectDetails(project)
        });
      } catch (err) {
        console.error('[Transcribe Error]', err);
        return sendJson(res, 500, { error: 'Falha na transcrição OpenAI Whisper', detail: err.message });
      }
    }

    // ----------------------------------------------------
    // API: Traduzir Roteiro com ChatGPT (Sincronizado)
    // ----------------------------------------------------
    if (pathname === '/api/translate' && req.method === 'POST') {
      const { project, transcript, style = 'curiosidades', lang = 'pt' } = await parseBody(req);
      if (!project) return sendJson(res, 400, { error: 'Nome do projeto necessário' });
      const folderPath = path.join(VIDEOS_DIR, project);

      const textToTranslate = transcript || (fs.existsSync(path.join(folderPath, 'transcricao_original.txt'))
        ? fs.readFileSync(path.join(folderPath, 'transcricao_original.txt'), 'utf-8')
        : '');

      if (!textToTranslate.trim()) {
        return sendJson(res, 400, { error: 'Nenhum texto para traduzir' });
      }

      if (!process.env.OPENAI_API_KEY) {
        return sendJson(res, 500, { error: 'OPENAI_API_KEY não configurada no .env' });
      }

      const isSpanish = lang === 'es';
      const systemPrompt = isSpanish
        ? `Eres un traductor profesional especializado en doblaje y subtitulado de videos virales.
Tu misión:
1. Traducir el texto original a Español Latino Neutro con máxima fidelidad, manteniendo EXACTAMENTE todas las frases, detalles y acontecimientos de la transcripción original.
2. NO resumas, NO acortes, NO omitas nada y NO reduzcas el tamaño del texto. Preserva todas las palabras y el sentido completo frase por frase.
3. Asegura que el lenguaje suene natural para ser hablado en español, adaptando números y valores en palabras para lectura fonética correcta (ej: "$50" -> "cincuenta dólares").
4. No incluyas notas, introducciones, títulos, saludos o explicaciones. Devuelve EXCLUSIVAMENTE el texto traducido final listo para locución.`
        : lang === 'en'
        ? EN_TRANSLATION_PROMPT
        : `Você é um tradutor profissional especializado em dublagem e legendagem de vídeos.
Sua missão:
1. Traduzir o texto original para Português do Brasil com máxima fidelidade, mantendo EXATAMENTE todas as frases, detalhes e acontecimentos da transcrição original.
2. NÃO resuma, NÃO encurte, NÃO omita nenhuma fala e NÃO reduza o tamanho do texto. Preserve todas as palavras e o sentido completo frase por frase.
3. Garanta que a linguagem soe natural para ser falada em português do Brasil, adaptando números e valores por extenso para leitura fonética correta (ex: "$50" -> "cinquenta dólares").
4. Não inclua notas, introduções, títulos, saudações ou explicações. Retorne EXCLUSIVAMENTE o texto traduzido final pronto para narração.`;

      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: textToTranslate }
          ],
          temperature: 0.3
        })
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        return sendJson(res, aiRes.status, { error: 'Erro na OpenAI', detail: errText });
      }

      const aiData = await aiRes.json();
      const translatedText = aiData.choices[0].message.content.trim();

      const outScriptFile = lang === 'pt' ? 'roteiro_traduzido.txt' : `roteiro_traduzido_${lang}.txt`;
      fs.writeFileSync(path.join(folderPath, outScriptFile), translatedText, 'utf-8');
      if (lang === 'pt') {
        try { fs.writeFileSync(path.join(folderPath, 'roteiro_traduzido_pt.txt'), translatedText, 'utf-8'); } catch (_) {}
      }

      // Registra idioma no info.json
      const infoFile = path.join(folderPath, 'info.json');
      if (fs.existsSync(infoFile)) {
        try {
          const info = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
          info.languages = Array.from(new Set([...(info.languages || ['pt']), lang]));
          fs.writeFileSync(infoFile, JSON.stringify(info, null, 2), 'utf-8');
        } catch (_) {}
      }

      return sendJson(res, 200, {
        success: true,
        translation: translatedText,
        lang,
        project: getProjectDetails(project)
      });
    }

    // ----------------------------------------------------
    // API: Gerar Áudio com Voz MiniMax "Curiosidades" (Multi-Idioma)
    // ----------------------------------------------------
    if (pathname === '/api/generate-audio' && req.method === 'POST') {
      const { project, text, voice, speed = 1.3, trimSilence = true, minSilence = 350, keepSilence = 200, lang = 'pt' } = await parseBody(req);
      if (!project) return sendJson(res, 400, { error: 'Nome do projeto necessário' });
      const folderPath = path.join(VIDEOS_DIR, project);

      const scriptFileName = (lang === 'pt' && !fs.existsSync(path.join(folderPath, 'roteiro_traduzido_pt.txt')))
        ? 'roteiro_traduzido.txt'
        : `roteiro_traduzido_${lang}.txt`;
      const audioFileName = lang === 'pt' ? 'narracao.mp3' : `narracao_${lang}.mp3`;
      const trimmedFileName = lang === 'pt' ? 'narracao_trimmed.mp3' : `narracao_trimmed_${lang}.mp3`;

      const textToSpeak = text || (fs.existsSync(path.join(folderPath, scriptFileName))
        ? fs.readFileSync(path.join(folderPath, scriptFileName), 'utf-8')
        : '');

      if (!textToSpeak.trim()) {
        return sendJson(res, 400, { error: 'Nenhum texto para síntese de áudio' });
      }

      const minimaxVoice = voice || resolveVoiceId(lang, process.env.MINIMAX_VOICE_ID || 'moss_audio_7eb5eaa1-d18c-11f1-a1a6-e6b4e5387684');
      const minimaxScript = path.join(ROOT_DIR, 'scripts', 'synthesize_minimax.js');
      const tempTxt = path.join(folderPath, `temp_input_${lang}.txt`);
      const audioPath = path.join(folderPath, audioFileName);
      fs.writeFileSync(tempTxt, textToSpeak, 'utf-8');

      try {
        execSync(`node "${minimaxScript}" "${tempTxt}" "${audioPath}" "${minimaxVoice}" ${parseFloat(speed) || 1.3}`, { timeout: 180000 });
        if (fs.existsSync(tempTxt)) fs.unlinkSync(tempTxt);
        if (lang === 'pt') {
          try { fs.copyFileSync(audioPath, path.join(folderPath, 'narracao_pt.mp3')); } catch (_) {}
        }
      } catch (genErr) {
        if (fs.existsSync(tempTxt)) fs.unlinkSync(tempTxt);
        return sendJson(res, 500, { error: 'Falha na geração via MiniMax TTS', detail: genErr.message });
      }

      if (!fs.existsSync(audioPath)) {
        return sendJson(res, 500, { error: `Arquivo ${audioFileName} não foi gerado pelo MiniMax` });
      }

      // Se trimSilence estiver ativo (padrão true), corta os silêncios mortos
      if (trimSilence) {
        try {
          const trimmedPath = path.join(folderPath, trimmedFileName);
          const trimScript = path.join(ROOT_DIR, 'scripts', 'trim-silence.py');
          execSync(`"${PYTHON_BIN}" "${trimScript}" "${audioPath}" "${trimmedPath}" ${parseInt(minSilence) || 350} ${parseInt(keepSilence) || 200}`, { stdio: 'ignore' });
          if (lang === 'pt') {
            try { fs.copyFileSync(trimmedPath, path.join(folderPath, 'narracao_trimmed_pt.mp3')); } catch (_) {}
          }
        } catch (trimErr) {
          console.warn('[Trim Silence Warning]', trimErr.message);
        }
      }

      return sendJson(res, 200, {
        success: true,
        lang,
        project: getProjectDetails(project)
      });
    }

    // ----------------------------------------------------
    // API: Cortar Silêncios da Narração (Dinamismo para Shorts)
    // ----------------------------------------------------
    if (pathname === '/api/trim-silence' && req.method === 'POST') {
      const { project, minSilence = 350, keepSilence = 200, lang = 'pt' } = await parseBody(req);
      if (!project) return sendJson(res, 400, { error: 'Nome do projeto necessário' });
      const folderPath = path.join(VIDEOS_DIR, project);
      const audioFileName = lang === 'pt' ? 'narracao.mp3' : `narracao_${lang}.mp3`;
      const trimmedFileName = lang === 'pt' ? 'narracao_trimmed.mp3' : `narracao_trimmed_${lang}.mp3`;
      const audioPath = path.join(folderPath, audioFileName);
      const trimmedPath = path.join(folderPath, trimmedFileName);

      if (!fs.existsSync(audioPath)) {
        return sendJson(res, 404, { error: `Arquivo ${audioFileName} não encontrado` });
      }

      const trimScript = path.join(ROOT_DIR, 'scripts', 'trim-silence.py');

      try {
        const out = execSync(`"${PYTHON_BIN}" "${trimScript}" "${audioPath}" "${trimmedPath}" ${parseInt(minSilence) || 350} ${parseInt(keepSilence) || 200}`, { encoding: 'utf-8' });
        if (lang === 'pt') {
          try { fs.copyFileSync(trimmedPath, path.join(folderPath, 'narracao_trimmed_pt.mp3')); } catch (_) {}
        }
        return sendJson(res, 200, {
          success: true,
          output: out,
          lang,
          project: getProjectDetails(project)
        });
      } catch (err) {
        return sendJson(res, 500, { error: 'Falha ao cortar silêncios', detail: err.message });
      }
    }

    // ----------------------------------------------------
    // API: Cortes Rítmicos no Vídeo (0.5s a cada 3s)
    // ----------------------------------------------------
    if (pathname === '/api/cut-video' && req.method === 'POST') {
      const { project, keepSec = 3.0, cutSec = 0.5 } = await parseBody(req);
      if (!project) return sendJson(res, 400, { error: 'Nome do projeto necessário' });
      const folderPath = path.join(VIDEOS_DIR, project);

      const inputVideo = fs.existsSync(path.join(folderPath, 'sem_marca.mp4'))
        ? path.join(folderPath, 'sem_marca.mp4')
        : path.join(folderPath, 'original.mp4');
      const outputVideo = path.join(folderPath, 'video_cortado.mp4');

      if (!fs.existsSync(inputVideo)) {
        return sendJson(res, 404, { error: 'Nenhum vídeo base encontrado para corte' });
      }

      try {
        const probe = execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${inputVideo}"`, { encoding: 'utf-8' });
        const totalDuration = parseFloat(probe.trim());
        if (isNaN(totalDuration) || totalDuration <= 0) {
          throw new Error('Não foi possível ler duração do vídeo');
        }

        const keep = parseFloat(keepSec) || 3.0;
        const cut = parseFloat(cutSec) || 0.5;
        const segments = [];
        let currentStart = 0;

        while (currentStart < totalDuration) {
          let currentEnd = currentStart + keep;
          if (currentEnd > totalDuration) currentEnd = totalDuration;
          segments.push({ start: currentStart, end: currentEnd });
          currentStart = currentEnd + cut;
        }

        const filterParts = [];
        const concatInputs = [];
        segments.forEach((seg, i) => {
          filterParts.push(`[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
          concatInputs.push(`[v${i}]`);
        });

        const filterComplex = `${filterParts.join(';')};${concatInputs.join('')}concat=n=${segments.length}:v=1:a=0[outv]`;
        const cmd = `ffmpeg -y -i "${inputVideo}" -filter_complex "${filterComplex}" -map "[outv]" -c:v libx264 -preset fast -crf 20 "${outputVideo}"`;
        execSync(cmd, { stdio: 'ignore' });

        return sendJson(res, 200, {
          success: true,
          cutsCount: segments.length,
          project: getProjectDetails(project)
        });
      } catch (cutErr) {
        return sendJson(res, 500, { error: 'Erro ao aplicar cortes no vídeo', detail: cutErr.message });
      }
    }

    // ----------------------------------------------------
    // API: Mesclar Vídeo + Narração com Sincronização de Ritmo (Multi-Idioma)
    // ----------------------------------------------------
    if (pathname === '/api/merge' && req.method === 'POST') {
      const { project, lang = 'pt', withMusic = true } = await parseBody(req);
      if (!project) return sendJson(res, 400, { error: 'Nome do projeto necessário' });
      const folderPath = path.join(VIDEOS_DIR, project);

      // Prioridade de vídeo: video_cortado.mp4 -> sem_marca.mp4 -> original.mp4
      let videoFile = path.join(folderPath, 'original.mp4');
      if (fs.existsSync(path.join(folderPath, 'video_cortado.mp4'))) {
        videoFile = path.join(folderPath, 'video_cortado.mp4');
      } else if (fs.existsSync(path.join(folderPath, 'sem_marca.mp4'))) {
        videoFile = path.join(folderPath, 'sem_marca.mp4');
      }

      const trimmedName = lang === 'pt' ? 'narracao_trimmed.mp3' : `narracao_trimmed_${lang}.mp3`;
      const rawName = lang === 'pt' ? 'narracao.mp3' : `narracao_${lang}.mp3`;
      const finalName = lang === 'pt' ? 'final.mp4' : `final_${lang}.mp4`;

      const audioFile = fs.existsSync(path.join(folderPath, trimmedName))
        ? path.join(folderPath, trimmedName)
        : (fs.existsSync(path.join(folderPath, rawName))
            ? path.join(folderPath, rawName)
            : path.join(folderPath, 'narracao.mp3'));

      const finalFile = path.join(folderPath, finalName);

      if (!fs.existsSync(audioFile)) {
        return sendJson(res, 400, { error: `Arquivo de áudio (${trimmedName} ou ${rawName}) não encontrado` });
      }

      try {
        const vProbe = execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${videoFile}"`, { encoding: 'utf-8' });
        const aProbe = execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${audioFile}"`, { encoding: 'utf-8' });
        const vDur = parseFloat(vProbe.trim());
        const aDur = parseFloat(aProbe.trim());

        // Calcula aceleração exata para bater no tempo do vídeo se necessário
        const speed = aDur / vDur;
        let filterAudio = `atempo=${speed.toFixed(4)}`;
        if (speed > 2.0) {
          const s1 = 2.0;
          const s2 = speed / 2.0;
          filterAudio = `atempo=${s1.toFixed(4)},atempo=${s2.toFixed(4)}`;
        } else if (speed < 0.5) {
          filterAudio = `atempo=0.5,atempo=${(speed / 0.5).toFixed(4)}`;
        }

        const bgMusicFile = path.join(ROOT_DIR, 'assets', 'music', 'Ogryzek.mp3');
        const hasBgMusic = Boolean(withMusic) && fs.existsSync(bgMusicFile);

        let cmd = '';
        if (hasBgMusic) {
          const filterComplex = `[1:a]${filterAudio},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.0[voice];[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.15[bg];[voice][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,aformat=channel_layouts=stereo[aout]`;
          cmd = `ffmpeg -y -i "${videoFile}" -i "${audioFile}" -stream_loop -1 -i "${bgMusicFile}" -filter_complex "${filterComplex}" -map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k -ar 44100 -ac 2 -shortest -movflags +faststart "${finalFile}"`;
        } else {
          cmd = `ffmpeg -y -i "${videoFile}" -i "${audioFile}" -filter_complex "[1:a]${filterAudio},aformat=channel_layouts=stereo[aout]" -map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k -ar 44100 -ac 2 -movflags +faststart "${finalFile}"`;
        }

        console.log(`[Merge] Executando comando de mesclagem para idioma: [${lang.toUpperCase()}] [Com música: ${hasBgMusic}]...`);
        execSync(cmd, { stdio: 'inherit' });
        if (lang === 'pt') {
          try { fs.copyFileSync(finalFile, path.join(folderPath, 'final_pt.mp4')); } catch (_) {}
        }

        try {
          const infoPath = path.join(folderPath, 'info.json');
          let curInfo = {};
          if (fs.existsSync(infoPath)) curInfo = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
          curInfo.withMusic = Boolean(hasBgMusic);
          fs.writeFileSync(infoPath, JSON.stringify(curInfo, null, 2), 'utf-8');
        } catch (_) {}

        return sendJson(res, 200, {
          success: true,
          videoDuration: vDur,
          audioDuration: aDur,
          speedFactor: speed,
          hasBgMusic,
          lang,
          project: getProjectDetails(project)
        });
      } catch (mergeErr) {
        return sendJson(res, 500, { error: 'Erro ao mesclar áudio sincronizado', detail: mergeErr.message });
      }
    }

    // ----------------------------------------------------
    // API: Gerar Vídeo 9:16 Vertical Tela Cheia com Legenda Dinâmica Palavra por Palavra (Multi-Idioma)
    // ----------------------------------------------------
    if (pathname === '/api/generate-square-subtitles' && req.method === 'POST') {
      const { project, lang = 'pt', hflip = true } = await parseBody(req);
      if (!project) return sendJson(res, 400, { error: 'Nome do projeto necessário' });
      const folderPath = path.join(VIDEOS_DIR, project);

      const finalName = lang === 'pt' ? 'final.mp4' : `final_${lang}.mp4`;
      const subName = lang === 'pt' ? 'legendas.ass' : `legendas_${lang}.ass`;
      const out9x16Name = lang === 'pt' ? 'video_9x16.mp4' : `video_9x16_${lang}.mp4`;

      const inputVid = fs.existsSync(path.join(folderPath, finalName))
        ? path.join(folderPath, finalName)
        : (fs.existsSync(path.join(folderPath, 'final.mp4'))
            ? path.join(folderPath, 'final.mp4')
            : (fs.existsSync(path.join(folderPath, 'video_cortado.mp4'))
                ? path.join(folderPath, 'video_cortado.mp4')
                : (fs.existsSync(path.join(folderPath, 'sem_marca.mp4'))
                    ? path.join(folderPath, 'sem_marca.mp4')
                    : path.join(folderPath, 'original.mp4'))));

      const subFile = path.join(folderPath, subName);
      const output9x16 = path.join(folderPath, out9x16Name);
      const subScript = path.join(ROOT_DIR, 'scripts', 'generate-subtitles.py');

      try {
        // 1. Gera legendas ASS palavra por palavra passando o idioma
        execSync(`"${PYTHON_BIN}" "${subScript}" "${inputVid}" "${subFile}" "${lang}"`, { stdio: 'inherit' });
        if (lang === 'pt') {
          try { fs.copyFileSync(subFile, path.join(folderPath, 'legendas_pt.ass')); } catch (_) {}
        }

        // 2. Renderiza formato 9:16 vertical Full HD com Anti-Duplicate Hash
        let hasAudio = false;
        try {
          hasAudio = execSync(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${inputVid}"`, { encoding: 'utf-8' }).trim().length > 0;
        } catch (_) {}

        const subEscaped = subFile.replace(/\\/g, '/').replace(/:/g, '\\:');
        const useHflip = hflip !== false;
        const hflipFg = useHflip ? ',hflip' : '';
        const filterParts = [
          `[0:v]crop='min(iw,ih)/1.05':'min(iw,ih)/1.05':(iw-ow)/2:(ih-oh)/2,split=2[fg_raw][bg_raw]`,
          `[bg_raw]scale=1920:1920,crop=1080:1920,avgblur=sizeX=45:sizeY=45,eq=brightness=-0.35:contrast=0.90[bg]`,
          `[fg_raw]scale=1080:1080,eq=contrast=1.02:saturation=1.04${hflipFg}[fg]`,
          `[bg][fg]overlay=0:(H-h)/2[v_comp]`,
          `[v_comp]subtitles='${subEscaped}'[v_sub]`,
          `[v_sub]setpts=PTS/1.03[outv]`
        ];
        if (hasAudio) {
          filterParts.push(`[0:a]atempo=1.03[outa]`);
        }
        const filterComplex = filterParts.join(';');

        const audioArgs = hasAudio ? '-map "[outa]" -c:a aac -b:a 192k -ar 44100' : '-an';
        execSync(`ffmpeg -y -i "${inputVid}" -filter_complex "${filterComplex}" -map "[outv]" ${audioArgs} -c:v libx264 -preset fast -crf 20 -movflags +faststart "${output9x16}"`, { stdio: 'inherit' });
        if (lang === 'pt') {
          try {
            fs.copyFileSync(output9x16, path.join(folderPath, 'video_9x16_pt.mp4'));
            fs.copyFileSync(output9x16, path.join(folderPath, 'video_9x16_crop_quadrado.mp4'));
            fs.copyFileSync(output9x16, path.join(folderPath, 'video_1x1_legendado.mp4'));
          } catch (_) {}
        }

        // Previews atualizados para auditoria
        try {
          execSync(`ffmpeg -y -ss 00:00:05 -i "${output9x16}" -vframes 1 -q:v 2 "${path.join(folderPath, `final_val_5s_${lang}.jpg`)}"`, { stdio: 'ignore' });
          execSync(`ffmpeg -y -ss 00:00:20 -i "${output9x16}" -vframes 1 -q:v 2 "${path.join(folderPath, `final_val_20s_${lang}.jpg`)}"`, { stdio: 'ignore' });
          if (lang === 'pt') {
            execSync(`ffmpeg -y -ss 00:00:05 -i "${output9x16}" -vframes 1 -q:v 2 "${path.join(folderPath, 'final_val_5s.jpg')}"`, { stdio: 'ignore' });
            execSync(`ffmpeg -y -ss 00:00:20 -i "${output9x16}" -vframes 1 -q:v 2 "${path.join(folderPath, 'final_val_20s.jpg')}"`, { stdio: 'ignore' });
          }
        } catch (e) {}

        // 3. Gera automaticamente os títulos e legendas para postar naquele idioma
        try {
          await generatePostCopyForProject(project, lang);
        } catch (e) {
          console.error('[Auto Post Copy Error]', e.message);
        }

        return sendJson(res, 200, {
          success: true,
          lang,
          project: getProjectDetails(project)
        });
      } catch (err) {
        console.error('[Render 9x16 Error]', err);
        return sendJson(res, 500, { error: 'Erro ao gerar vídeo 9:16 vertical legendado', detail: err.message });
      }
    }

    // ----------------------------------------------------
    // API: Adicionar Novo Idioma a um Projeto
    // ----------------------------------------------------
    if (pathname === '/api/project/add-language' && req.method === 'POST') {
      const { project, lang } = await parseBody(req);
      if (!project) return sendJson(res, 400, { error: 'Nome do projeto necessário' });
      if (!lang) return sendJson(res, 400, { error: 'Código do idioma necessário' });

      const folderPath = path.join(VIDEOS_DIR, project);
      if (!fs.existsSync(folderPath)) return sendJson(res, 404, { error: 'Projeto não encontrado' });

      const infoPath = path.join(folderPath, 'info.json');
      let info = {};
      if (fs.existsSync(infoPath)) {
        try { info = JSON.parse(fs.readFileSync(infoPath, 'utf-8')); } catch (_) {}
      }
      info.languages = Array.from(new Set([...(info.languages || ['pt']), lang.toLowerCase()]));
      fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), 'utf-8');

      return sendJson(res, 200, {
        success: true,
        lang: lang.toLowerCase(),
        project: getProjectDetails(project)
      });
    }
    if (pathname === '/api/open-folder' && req.method === 'POST') {
      const { project } = await parseBody(req);
      const folderPath = project ? path.join(VIDEOS_DIR, project) : VIDEOS_DIR;
      execSync(`explorer "${folderPath}"`);
      return sendJson(res, 200, { success: true });
    }

    // ----------------------------------------------------
    // Servir arquivos de mídia (Vídeos e Áudios) com streaming
    // ----------------------------------------------------
    if (pathname.startsWith('/media/')) {
      const relativePart = decodeURIComponent(pathname.replace('/media/', ''));
      const filePath = path.join(VIDEOS_DIR, relativePart);

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Arquivo não encontrado');
        return;
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      const ext = path.extname(filePath).toLowerCase();
      let mime = 'application/octet-stream';
      if (ext === '.mp4') mime = 'video/mp4';
      else if (ext === '.mp3') mime = 'audio/mpeg';
      else if (ext === '.wav') mime = 'audio/wav';

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': mime
        });
        file.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': mime,
          'Accept-Ranges': 'bytes'
        });
        fs.createReadStream(filePath).pipe(res);
      }
      return;
    }

    // ----------------------------------------------------
    // Servir Arquivos Estáticos do Dashboard (HTML, CSS, JS)
    // ----------------------------------------------------
    let staticPath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(staticPath)) {
      staticPath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(staticPath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml'
    };

    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'text/plain',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    fs.createReadStream(staticPath).pipe(res);

  } catch (error) {
    console.error('[Server Error]', error);
    sendJson(res, 500, { error: error.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n=============================================================`);
    console.log(`⚡ LUMIX — AI VIDEO STUDIO RODANDO EM:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`✨ Simplicity • Modern • Elegant • Futuristic`);
    console.log(`=============================================================\n`);
  });
}

module.exports = {
  server,
  generatePostCopyForProject,
  searchYouTubeShortsFast,
  getProjectDetails
};

