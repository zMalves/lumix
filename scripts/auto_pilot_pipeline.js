/**
 * auto_pilot_pipeline.js - Motor de Execução Automatizada Multi-Idioma (LUMIX Engine)
 * Uso CLI: node scripts/auto_pilot_pipeline.js "<URL_OU_NOME_DO_PROJETO>" [--from-step <etapa>] [--languages pt,es]
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// Carrega .env nativo
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (e) {}
}

const ROOT_DIR = path.resolve(__dirname, '..');
const VIDEOS_DIR = path.join(ROOT_DIR, 'videos');
const TOOLS_DIR = path.join(ROOT_DIR, 'tools');
const isWin = process.platform === 'win32';
const YT_DLP_PATH = process.env.YTDLP_BIN || (isWin ? path.join(TOOLS_DIR, 'yt-dlp.exe') : 'yt-dlp');
const pythonExe = process.env.PYTHON_BIN || (isWin ? 'C:\\Users\\Maychel\\AppData\\Roaming\\VoiceStudio\\runtime\\project\\.venv\\Scripts\\python.exe' : 'python3');
const { EN_TRANSLATION_PROMPT, EN_POST_COPY_SYSTEM, resolveVoiceId } = require('./lang_config.js');
const { ytDlpCommonArgsShell, ytDlpCommonArgs, fallbackFolderName, detectPlatform } = require('./media_download.js');

function log(stage, msg) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${ts}] [${stage.toUpperCase()}] ${msg}`);
}

function sanitizeFolderName(name) {
  return name.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 80);
}

function normalizeScriptForTTS(text, lang = 'pt') {
  let res = text;
  if (lang === 'pt') {
    const numberNames = {
      '1': 'um dólar', '2': 'dois dólares', '3': 'três dólares', '4': 'quatro dólares',
      '5': 'cinco dólares', '6': 'seis dólares', '7': 'sete dólares', '8': 'oito dólares',
      '9': 'nove dólares', '10': 'dez dólares', '15': 'quinze dólares', '16': 'dezesseis dólares',
      '20': 'vinte dólares', '24': 'vinte e quatro dólares', '32': 'trinta e dois dólares',
      '42': 'quarenta e dois dólares', '44': 'quarenta e quatro dólares', '50': 'cinquenta dólares',
      '100': 'cem dólares', '256': 'duzentos e cinquenta e seis dólares',
      '500': 'quinhentos dólares', '541': 'quinhentos e quarenta e um dólares',
      '880': 'oitocentos e oitenta dólares', '1000': 'mil dólares'
    };
    res = res.replace(/\$(\d+)/g, (m, n) => numberNames[n] || `${n} dólares`);
    res = res.replace(/\$/g, ' dólares ');
    res = res.replace(/(\d+)h\b/gi, '$1 horas');
  } else if (lang === 'es') {
    const numberNamesEs = {
      '1': 'un dólar', '2': 'dos dólares', '3': 'tres dólares', '4': 'cuatro dólares',
      '5': 'cinco dólares', '6': 'seis dólares', '7': 'siete dólares', '8': 'ocho dólares',
      '9': 'nueve dólares', '10': 'diez dólares', '15': 'quince dólares', '16': 'dieciséis dólares',
      '20': 'veinte dólares', '50': 'cincuenta dólares', '100': 'cien dólares', '1000': 'mil dólares'
    };
    res = res.replace(/\$(\d+)/g, (m, n) => numberNamesEs[n] || `${n} dólares`);
    res = res.replace(/\$/g, ' dólares ');
    res = res.replace(/(\d+)h\b/gi, '$1 horas');
  } else if (lang === 'en') {
    res = res.replace(/\$(\d+)/g, (m, n) => `${n} dollars`);
    res = res.replace(/\$/g, ' dollars ');
    res = res.replace(/(\d+)h\b/gi, '$1 hours');
  }
  return res.replace(/\s+/g, ' ').trim();
}

const STEP_ORDER = {
  'clean': 1,
  'download': 1,
  'transcribe': 2,
  'translate': 3,
  'tts': 4,
  'trim': 5,
  'cut': 6,
  'merge': 7,
  'render_9x16': 8,
  'render': 8,
  'post_copy': 9,
  'copy': 9,
  'full': 1
};

async function runAutoPilot(inputTarget, options = {}) {
  const isUrl = inputTarget.startsWith('http://') || inputTarget.startsWith('https://');
  let folderName = '';
  const fromStep = options.fromStep || null;
  const startStepNum = fromStep ? (STEP_ORDER[fromStep] || parseInt(fromStep, 10) || 1) : 1;
  const languages = (options.languages && options.languages.length) ? options.languages : (options.lang ? [options.lang] : ['pt']);
  const withMusic = options.withMusic !== undefined ? Boolean(options.withMusic) : true;

  log('INÍCIO', `Iniciando LUMIX Auto-Pilot Engine para: ${inputTarget} [Idiomas: ${languages.join(', ').toUpperCase()}] [Trilha: ${withMusic ? 'COM MÚSICA' : 'SEM MÚSICA'}]${fromStep ? ` [A partir da etapa: ${fromStep} (#${startStepNum})]` : ''}`);

  // ----------------------------------------------------
  // ETAPA 1: DOWNLOAD DO VÍDEO SE FOR UMA URL
  // ----------------------------------------------------
  if (isUrl) {
    log('DOWNLOAD', `Obtendo metadados e baixando o Short do YouTube...`);
    let videoTitle = 'Short_' + Date.now();
    const commonYtDlpArgs = ytDlpCommonArgs();

    try {
      const titleProbe = spawnSync(YT_DLP_PATH, [
        ...commonYtDlpArgs,
        '--print', '%(title)s', inputTarget
      ], { encoding: 'utf-8', timeout: 20000 });
      if (titleProbe.stdout && titleProbe.stdout.trim()) {
        videoTitle = titleProbe.stdout.trim().split('\n')[0].trim();
      }
    } catch (e) {}

    // Título vazio ou só com emojis viraria pasta '' (= pasta videos/ inteira): usa fallback seguro
    folderName = sanitizeFolderName(videoTitle) || fallbackFolderName(inputTarget);
    log('DOWNLOAD', `Plataforma: ${detectPlatform(inputTarget)} | Identificado projeto na pasta: ${folderName}`);
    const targetFolder = path.join(VIDEOS_DIR, folderName);
    if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });

    const outputPath = path.join(targetFolder, 'original.mp4');
    const infoPath = path.join(targetFolder, 'info.json');

    if (!fs.existsSync(outputPath)) {
      log('DOWNLOAD', `Baixando vídeo em alta qualidade para ${outputPath}...`);
      const cmd = `"${YT_DLP_PATH}" ${ytDlpCommonArgsShell()} --js-runtimes node -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 "${inputTarget}" -o "${outputPath}"`;
      execSync(cmd, { stdio: 'inherit' });
    } else {
      log('DOWNLOAD', `Vídeo original.mp4 já existe em cache.`);
    }

    const crypto = require('crypto');
    const videoId = 'VID-' + crypto.createHash('md5').update(folderName).digest('hex').slice(0, 6).toUpperCase();
    const meta = {
      id: videoId,
      title: videoTitle,
      url: inputTarget,
      folderName,
      languages,
      downloadedAt: new Date().toISOString()
    };
    fs.writeFileSync(infoPath, JSON.stringify(meta, null, 2), 'utf-8');
  } else {
    folderName = sanitizeFolderName(inputTarget);
  }

  const projectDir = path.join(VIDEOS_DIR, folderName);
  if (!fs.existsSync(projectDir)) {
    throw new Error(`Pasta do projeto não encontrada: ${projectDir}`);
  }

  const originalVid = path.join(projectDir, 'original.mp4');
  const cleanVid = path.join(projectDir, 'sem_marca.mp4');
  const transcriptFile = path.join(projectDir, 'transcricao_original.txt');

  if (!fs.existsSync(originalVid)) {
    throw new Error(`Arquivo original.mp4 não encontrado em: ${originalVid}`);
  }

  // ----------------------------------------------------
  // ETAPA 2: VMAKE - REMOÇÃO DE MARCA D'ÁGUA E LEGENDAS (API OFICIAL)
  // ----------------------------------------------------
  const shouldRunVmake = (startStepNum <= 1 && !fs.existsSync(cleanVid)) || (startStepNum === 1 && options.forceClean);
  if (shouldRunVmake) {
    log('VMAKE', `Executando remoção de marca d'água e legendas embutidas via VMake API Oficial...`);
    const vmakeScript = path.join(ROOT_DIR, 'remove-watermark.js');
    try {
      execSync(`"${process.execPath}" "${vmakeScript}" "${folderName}"`, { stdio: 'inherit', cwd: ROOT_DIR });
    } catch (vmakeErr) {
      log('VMAKE', `❌ Erro no VMake API: ${vmakeErr.message}`);
      throw new Error(`Falha no VMake API para remover legendas/marcas: ${vmakeErr.message}`);
    }

    if (!fs.existsSync(cleanVid)) {
      throw new Error(`Arquivo sem_marca.mp4 não foi gerado pelo VMake API.`);
    }
  } else {
    log('VMAKE', `Vídeo sem_marca.mp4 existente aproveitado.`);
  }

  // ----------------------------------------------------
  // VALIDAÇÃO 1: INSPEÇÃO VISUAL AUTOMÁTICA
  // ----------------------------------------------------
  if (fs.existsSync(cleanVid)) {
    log('VALIDAÇÃO_1', `Extraindo frames de controle para validação visual (5s, 15s, 20s, 30s)...`);
    const checkTimes = [5, 15, 20, 30];
    for (const t of checkTimes) {
      const cleanFrame = path.join(projectDir, `clean_val_${t}s.jpg`);
      try {
        execSync(`ffmpeg -y -ss ${t} -i "${cleanVid}" -vframes 1 -q:v 2 "${cleanFrame}"`, { stdio: 'ignore' });
      } catch (_) {}
    }
    log('VALIDAÇÃO_1', `✅ Frames de controle prontos para auditoria.`);
  }

  // ----------------------------------------------------
  // ETAPA 3: TRANSCRIÇÃO COM OPENAI WHISPER (API OFICIAL)
  // ----------------------------------------------------
  const shouldTranscribe = startStepNum === 2 || !fs.existsSync(transcriptFile) || !fs.readFileSync(transcriptFile, 'utf-8').trim();
  if (shouldTranscribe) {
    log('TRANSCRIÇÃO', `Transcrevendo áudio original do vídeo via OpenAI Whisper API...`);
    const { transcribeWithOpenAI } = require('./transcribe_openai.js');
    await transcribeWithOpenAI(originalVid, transcriptFile, 'en');
  } else {
    log('TRANSCRIÇÃO', `Transcrição existente reaproveitada.`);
  }

  const originalTranscript = fs.existsSync(transcriptFile) ? fs.readFileSync(transcriptFile, 'utf-8').trim() : '';
  log('TRANSCRIÇÃO', `Texto original: "${originalTranscript.slice(0, 80)}..."`);

  // ----------------------------------------------------
  // ETAPA EXTRA (GERAL): CORTES RÍTMICOS NO VÍDEO (0.5s a cada 3.0s)
  // ----------------------------------------------------
  const videoBase = fs.existsSync(cleanVid) ? cleanVid : originalVid;
  const cutVid = path.join(projectDir, 'video_cortado.mp4');
  const shouldCut = startStepNum <= 6 || !fs.existsSync(cutVid);
  if (shouldCut) {
    log('CORTES', `Aplicando cortes rítmicos de retenção (0.5s a cada 3.0s de cena)...`);
    try {
      const cleanDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${videoBase}"`, { encoding: 'utf-8' }).trim());
      const keepSec = 3.0;
      const cutSec = 0.5;

      const segments = [];
      let currentStart = 0;
      while (currentStart < cleanDur) {
        let currentEnd = currentStart + keepSec;
        if (currentEnd > cleanDur) currentEnd = cleanDur;
        segments.push({ start: currentStart, end: currentEnd });
        currentStart = currentEnd + cutSec;
      }

      if (segments.length > 1) {
        const filterParts = [];
        const concatInputs = [];
        segments.forEach((seg, i) => {
          filterParts.push(`[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
          concatInputs.push(`[v${i}]`);
        });
        const filterComplexCut = `${filterParts.join(';')};${concatInputs.join('')}concat=n=${segments.length}:v=1:a=0[outv]`;
        execSync(`ffmpeg -y -i "${videoBase}" -filter_complex "${filterComplexCut}" -map "[outv]" -c:v libx264 -preset fast -crf 19 "${cutVid}"`, { stdio: 'ignore' });
        const cutDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${cutVid}"`, { encoding: 'utf-8' }).trim());
        log('CORTES', `Vídeo cortado ritmicamente com sucesso: ${cutDur.toFixed(2)}s (${segments.length} cortes)`);
      } else {
        fs.copyFileSync(videoBase, cutVid);
      }
    } catch (cutErr) {
      log('CORTES', `Aviso ao aplicar cortes rítmicos: ${cutErr.message}. Mantendo vídeo contínuo.`);
      if (!fs.existsSync(cutVid)) fs.copyFileSync(videoBase, cutVid);
    }
  } else {
    log('CORTES', `Vídeo cortado video_cortado.mp4 já existente reaproveitado.`);
  }

  const effectiveCutVid = fs.existsSync(cutVid) ? cutVid : videoBase;
  const outputs = {};

  // ----------------------------------------------------
  // LOOP POR IDIOMA (PT, ES, ETC.)
  // ----------------------------------------------------
  for (const lang of languages) {
    log('IDIOMA', `════════════════════════════════════════════════════════`);
    log('IDIOMA', `Iniciando produção para o idioma: [${lang.toUpperCase()}]`);
    log('IDIOMA', `════════════════════════════════════════════════════════`);

    const isSpanish = lang === 'es';
    const isEnglish = lang === 'en';
    const langName = { pt: 'Português', es: 'Espanhol', en: 'Inglês' }[lang] || lang;
    const translatedFile = lang === 'pt' ? path.join(projectDir, 'roteiro_traduzido.txt') : path.join(projectDir, `roteiro_traduzido_${lang}.txt`);
    const rawAudio = lang === 'pt' ? path.join(projectDir, 'narracao.mp3') : path.join(projectDir, `narracao_${lang}.mp3`);
    const trimmedAudio = lang === 'pt' ? path.join(projectDir, 'narracao_trimmed.mp3') : path.join(projectDir, `narracao_trimmed_${lang}.mp3`);
    const finalVid = lang === 'pt' ? path.join(projectDir, 'final.mp4') : path.join(projectDir, `final_${lang}.mp4`);
    const subFile = lang === 'pt' ? path.join(projectDir, 'legendas.ass') : path.join(projectDir, `legendas_${lang}.ass`);
    const output9x16 = lang === 'pt' ? path.join(projectDir, 'video_9x16.mp4') : path.join(projectDir, `video_9x16_${lang}.mp4`);
    const outputLegacy = path.join(projectDir, `video_9x16_crop_quadrado_${lang}.mp4`);
    const output1x1 = path.join(projectDir, `video_1x1_legendado_${lang}.mp4`);

    // ETAPA 4: TRADUÇÃO & ADAPTAÇÃO VIRAL
    const shouldTranslate = startStepNum === 3 || startStepNum === 2 || !fs.existsSync(translatedFile) || !fs.readFileSync(translatedFile, 'utf-8').trim();
    if (shouldTranslate) {
      log('TRADUÇÃO', `Adaptando roteiro com storytelling viral em ${langName}...`);
      let translatedText = '';

      if (process.env.OPENAI_API_KEY) {
        try {
          const systemContent = isSpanish
            ? 'Eres un traductor profesional especializado en doblaje de videos virales. Traduce el texto a Español Latino Neutro con máxima fidelidad, manteniendo EXACTAMENTE todas las frases y palabras de la transcripción original. NO resumas, NO acortes, NO omitas nada y NO reduzcas caracteres. Devuelve EXCLUSIVAMENTE el texto final traducido listo para locución.'
            : isEnglish
            ? EN_TRANSLATION_PROMPT
            : 'Você é um tradutor profissional especializado em dublagem de vídeos. Traduza o texto para Português do Brasil com máxima fidelidade, mantendo EXATAMENTE todas as frases e palavras da transcrição original. NÃO resuma, NÃO encurte, NÃO omita nada e NÃO reduza caracteres. Retorne EXCLUSIVAMENTE o texto final traduzido pronto para narração.';

          const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: systemContent },
                { role: 'user', content: originalTranscript }
              ],
              temperature: 0.3
            })
          });
          if (oaiRes.ok) {
            const oaiData = await oaiRes.json();
            translatedText = oaiData.choices[0].message.content.trim();
          }
        } catch (e) {
          log('TRADUÇÃO', `Aviso OpenAI: ${e.message}`);
        }
      }

      if (!translatedText) {
        log('TRADUÇÃO', `Aplicando adaptação direta para ${lang.toUpperCase()}...`);
        translatedText = originalTranscript;
      }

      fs.writeFileSync(translatedFile, translatedText, 'utf-8');
      if (lang === 'pt') {
        try { fs.writeFileSync(path.join(projectDir, 'roteiro_traduzido_pt.txt'), translatedText, 'utf-8'); } catch (_) {}
      }
    } else {
      log('TRADUÇÃO', `Roteiro traduzido (${lang.toUpperCase()}) já existente reaproveitado.`);
    }

    let translatedScript = fs.existsSync(translatedFile) ? fs.readFileSync(translatedFile, 'utf-8').trim() : '';
    const normalizedScript = normalizeScriptForTTS(translatedScript, lang);
    if (normalizedScript !== translatedScript) {
      log('TRADUÇÃO', `Aplicando normalização fonética anti-erros (${lang.toUpperCase()})...`);
      fs.writeFileSync(translatedFile, normalizedScript, 'utf-8');
      translatedScript = normalizedScript;
    }
    log('TRADUÇÃO', `Roteiro em ${lang.toUpperCase()}: "${translatedScript.slice(0, 80)}..."`);

    // ETAPA 5: SÍNTESE DE VOZ NEURAL (MiniMax TTS)
    const shouldTts = startStepNum <= 4 || !fs.existsSync(rawAudio);
    if (shouldTts) {
      const minimaxVoice = resolveVoiceId(lang, process.env.MINIMAX_VOICE_ID || 'moss_audio_7eb5eaa1-d18c-11f1-a1a6-e6b4e5387684');
      log('VOZ', `Sintetizando locução ultra-realista via MiniMax API a 1.3x (${lang.toUpperCase()}, Voz: ${minimaxVoice})...`);
      const minimaxScript = path.join(ROOT_DIR, 'scripts', 'synthesize_minimax.js');
      execSync(`"${process.execPath}" "${minimaxScript}" "${translatedFile}" "${rawAudio}" "${minimaxVoice}" 1.3`, { stdio: 'inherit' });
      if (lang === 'pt') {
        try { fs.copyFileSync(rawAudio, path.join(projectDir, 'narracao_pt.mp3')); } catch (_) {}
      }
    } else {
      log('VOZ', `Áudio (${lang.toUpperCase()}) já existente reaproveitado.`);
    }

    // ETAPA 6: CORTE SUAVE DE SILÊNCIO
    const shouldTrim = startStepNum <= 5 || !fs.existsSync(trimmedAudio);
    if (shouldTrim) {
      log('ÁUDIO', `Aplicando higienização e corte suave de silêncios (${lang.toUpperCase()})...`);
      const trimScript = path.join(ROOT_DIR, 'scripts', 'trim-silence.py');
      try {
        execSync(`"${pythonExe}" "${trimScript}" "${rawAudio}" "${trimmedAudio}" 350 200`, { stdio: 'inherit' });
        if (fs.existsSync(trimmedAudio) && fs.statSync(trimmedAudio).size > 1000) {
          log('ÁUDIO', `Áudio narracao_trimmed (${lang.toUpperCase()}) gerado com sucesso.`);
        }
      } catch (trimErr) {
        log('ÁUDIO', `Aviso ao higienizar silêncios: ${trimErr.message}`);
        if (!fs.existsSync(trimmedAudio) && fs.existsSync(rawAudio)) fs.copyFileSync(rawAudio, trimmedAudio);
      }
      if (lang === 'pt') {
        try { fs.copyFileSync(trimmedAudio, path.join(projectDir, 'narracao_trimmed_pt.mp3')); } catch (_) {}
      }
    } else {
      log('ÁUDIO', `Áudio (${lang.toUpperCase()}) narracao_trimmed já existente reaproveitado.`);
    }

    // ETAPA 8: SINCRONIZAÇÃO ÁUDIO-VÍDEO
    const effectiveAudio = fs.existsSync(trimmedAudio) ? trimmedAudio : rawAudio;
    const shouldMerge = startStepNum <= 7 || !fs.existsSync(finalVid);
    if (shouldMerge) {
      log('SINCRONIA', `Mesclando vídeo cortado com a narração dublada (${lang.toUpperCase()})${withMusic ? ' [COM TRILHA OGRYZEK]' : ' [SEM TRILHA]'}...`);
      const vDurMerge = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${effectiveCutVid}"`, { encoding: 'utf-8' }).trim());
      const aDurMerge = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${effectiveAudio}"`, { encoding: 'utf-8' }).trim());
      
      let filterAudio = 'volume=1.0';
      if (aDurMerge > vDurMerge * 1.1) {
        const speed = Math.min(2.0, Math.max(0.5, aDurMerge / vDurMerge));
        filterAudio = `atempo=${speed.toFixed(4)}`;
      }

      const bgMusicFile = path.join(ROOT_DIR, 'assets', 'music', 'Ogryzek.mp3');
      const hasBgMusic = withMusic && fs.existsSync(bgMusicFile);

      let cmd = '';
      if (hasBgMusic) {
        const filterComplex = `[1:a]${filterAudio},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.0[voice];[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.15[bg];[voice][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,aformat=channel_layouts=stereo[aout]`;
        cmd = `ffmpeg -y -i "${effectiveCutVid}" -i "${effectiveAudio}" -stream_loop -1 -i "${bgMusicFile}" -filter_complex "${filterComplex}" -map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k -ar 44100 -ac 2 -shortest -movflags +faststart "${finalVid}"`;
      } else {
        cmd = `ffmpeg -y -i "${effectiveCutVid}" -i "${effectiveAudio}" -filter_complex "[1:a]${filterAudio},aformat=channel_layouts=stereo[aout]" -map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k -ar 44100 -ac 2 -movflags +faststart "${finalVid}"`;
      }

      execSync(cmd, { stdio: 'ignore' });
      if (lang === 'pt') {
        try { fs.copyFileSync(finalVid, path.join(projectDir, 'final_pt.mp4')); } catch (_) {}
      }

      // Registra a configuração de música no info.json
      try {
        const infoPath = path.join(projectDir, 'info.json');
        let curInfo = {};
        if (fs.existsSync(infoPath)) {
          curInfo = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
        }
        curInfo.withMusic = withMusic;
        fs.writeFileSync(infoPath, JSON.stringify(curInfo, null, 2), 'utf-8');
      } catch (_) {}
    } else {
      log('SINCRONIA', `Vídeo final (${lang.toUpperCase()}) já existente reaproveitado.`);
    }

    // ETAPA 9 & 10: LEGENDAS DINÂMICAS & RENDER 9:16 VERTICAL COM ANTI-HASH
    const shouldRender = startStepNum <= 8 || !fs.existsSync(output9x16);
    if (shouldRender) {
      log('LEGENDAS', `Gerando legendas dinâmicas palavra por palavra (${lang.toUpperCase()})...`);
      const subScript = path.join(ROOT_DIR, 'scripts', 'generate-subtitles.py');
      execSync(`"${pythonExe}" "${subScript}" "${finalVid}" "${subFile}" "${lang}"`, { stdio: 'inherit' });
      if (lang === 'pt') {
        try { fs.copyFileSync(subFile, path.join(projectDir, 'legendas_pt.ass')); } catch (_) {}
      }

      const useHflip = options.hflip !== false && process.env.ANTI_HASH_HFLIP !== 'false' && process.env.ANTI_HASH_HFLIP !== '0';
      log('RENDER', `Renderizando formato 9:16 vertical Full HD com Anti-Duplicate Hash (Zoom 1.05x, Velocidade 1.03x, RGB +2%, FastStart${useHflip ? ', H-Flip' : ''}) [${lang.toUpperCase()}]...`);
      const subEscaped = subFile.replace(/\\/g, '/').replace(/:/g, '\\:');
      const hflipFg = useHflip ? ',hflip' : '';

      const filterComplex = [
        `[0:v]crop='min(iw,ih)/1.05':'min(iw,ih)/1.05':(iw-ow)/2:(ih-oh)/2,split=2[fg_raw][bg_raw]`,
        `[bg_raw]scale=1920:1920,crop=1080:1920,avgblur=sizeX=45:sizeY=45,eq=brightness=-0.35:contrast=0.90[bg]`,
        `[fg_raw]scale=1080:1080,eq=contrast=1.02:saturation=1.04${hflipFg}[fg]`,
        `[bg][fg]overlay=0:(H-h)/2[v_comp]`,
        `[v_comp]subtitles='${subEscaped}'[v_sub]`,
        `[v_sub]setpts=PTS/1.03[outv]`,
        `[0:a]atempo=1.03[outa]`
      ].join(';');

      execSync(`ffmpeg -y -i "${finalVid}" -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 20 -movflags +faststart -c:a aac -b:a 192k -ar 44100 "${output9x16}"`, { stdio: 'inherit' });
      if (lang === 'pt') {
        try {
          fs.copyFileSync(output9x16, path.join(projectDir, 'video_9x16_pt.mp4'));
          fs.copyFileSync(output9x16, path.join(projectDir, 'video_9x16_crop_quadrado.mp4'));
          fs.copyFileSync(output9x16, path.join(projectDir, 'video_1x1_legendado.mp4'));
        } catch (_) {}
      }

      try {
        execSync(`ffmpeg -y -ss 00:00:05 -i "${output9x16}" -vframes 1 -q:v 2 "${path.join(projectDir, `final_val_5s_${lang}.jpg`)}"`, { stdio: 'ignore' });
        execSync(`ffmpeg -y -ss 00:00:20 -i "${output9x16}" -vframes 1 -q:v 2 "${path.join(projectDir, `final_val_20s_${lang}.jpg`)}"`, { stdio: 'ignore' });
        if (lang === 'pt') {
          execSync(`ffmpeg -y -ss 00:00:05 -i "${output9x16}" -vframes 1 -q:v 2 "${path.join(projectDir, 'final_val_5s.jpg')}"`, { stdio: 'ignore' });
          execSync(`ffmpeg -y -ss 00:00:20 -i "${output9x16}" -vframes 1 -q:v 2 "${path.join(projectDir, 'final_val_20s.jpg')}"`, { stdio: 'ignore' });
        }
      } catch (_) {}
    } else {
      log('RENDER', `Vídeo 9:16 vertical (${lang.toUpperCase()}) já existente reaproveitado.`);
    }

    // ETAPA 11: COPYS DE POSTAGEM
    log('COPYS', `Gerando títulos e kit de postagem viral (${lang.toUpperCase()})...`);
    try {
      const { generatePostCopyForProject } = require('./generate_post_copy.js');
      if (typeof generatePostCopyForProject === 'function') {
        await generatePostCopyForProject(folderName, lang);
      }
    } catch (e) {
      log('COPYS', `Aviso ao gerar copys automáticas (${lang.toUpperCase()}): ${e.message}`);
    }

    outputs[lang] = output9x16;
  }

  // Atualiza info.json registrando todos os idiomas gerados
  const infoPath = path.join(projectDir, 'info.json');
  if (fs.existsSync(infoPath)) {
    try {
      const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
      info.languages = Array.from(new Set([...(info.languages || ['pt']), ...languages]));
      fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), 'utf-8');
    } catch (_) {}
  }

  log('SUCESSO', `🎉 PRODUÇÃO CONCLUÍDA COM SUCESSO TOTAL (LUMIX MULTI-IDIOMA ENGINE)!`);
  log('SUCESSO', `📁 Versões geradas: ${languages.map(l => `[${l.toUpperCase()}]: ${outputs[l]}`).join(' | ')}`);

  return {
    success: true,
    folderName,
    languages,
    outputs
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const target = args[0];
  if (!target) {
    console.error('Uso: node auto_pilot_pipeline.js <URL_OU_NOME_DO_PROJETO> [--from-step <etapa>] [--languages pt,es]');
    process.exit(1);
  }
  let fromStep = null;
  const fIdx = args.indexOf('--from-step');
  if (fIdx !== -1 && args[fIdx + 1]) {
    fromStep = args[fIdx + 1];
  }
  let languages = ['pt'];
  const lIdx = args.indexOf('--languages');
  if (lIdx !== -1 && args[lIdx + 1]) {
    languages = args[lIdx + 1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  } else {
    const sLangIdx = args.indexOf('--lang');
    if (sLangIdx !== -1 && args[sLangIdx + 1]) {
      languages = [args[sLangIdx + 1].trim().toLowerCase()];
    }
  }

  const noHflip = args.includes('--no-hflip') || process.env.ANTI_HASH_HFLIP === 'false' || process.env.ANTI_HASH_HFLIP === '0';
  const hflip = !noHflip;

  let withMusic = true;
  const mIdx = args.indexOf('--with-music');
  if (mIdx !== -1 && args[mIdx + 1]) {
    withMusic = args[mIdx + 1] === 'true' || args[mIdx + 1] === '1';
  }

  runAutoPilot(target, { fromStep, languages, hflip, withMusic }).then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('[ERRO_FATAL]', err);
    process.exit(1);
  });
}

module.exports = { runAutoPilot };
