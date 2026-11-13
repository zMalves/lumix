const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectDir = path.join(__dirname, '..', 'videos', 'Puedes_sacar_una_moneda_de_una_maquina_expendedora_con_una_cuerda');
const inputVid = path.join(projectDir, 'final.mp4');
const subFile = path.join(projectDir, 'legendas.ass');
const outputVid = path.join(projectDir, 'video_1x1_legendado.mp4');

// Normaliza caminho para sintaxe de filtros do ffmpeg no Windows (subtitles='C\:/caminho/...')
const subEscaped = subFile.replace(/\\/g, '/').replace(/:/g, '\\:');

// Filtro otimizado:
// 1. [0:v] split para fundo e primeiro plano
// 2. Fundo: scale para cobrir 720x720, crop central, desfoque forte (boxblur ou avgblur), e escurece (eq=brightness=-0.35:contrast=0.85) dando exatamente a sensação de 60% de opacidade sobre fundo preto
// 3. Primeiro plano: scale mantendo proporção 9:16 com altura 720 (405x720)
// 4. Overlay do vídeo 9:16 centralizado sobre o fundo 1:1
// 5. Queima das legendas ASS dinâmicas palavra por palavra no centro exato
const filterComplex = [
  '[0:v]split=2[fg_raw][bg_in]',
  // Fundo desfocado 1:1 e escurecido (60% opacidade equivalente)
  '[bg_in]scale=720:1280,crop=720:720,avgblur=sizeX=25:sizeY=25,eq=brightness=-0.40:contrast=0.85[bg]',
  // Primeiro plano 9:16
  '[fg_raw]scale=-1:720[fg]',
  // Sobrepõe primeiro plano no meio do fundo
  '[bg][fg]overlay=(W-w)/2:0[v_comp]',
  // Aplica legendas dinâmicas
  `[v_comp]subtitles='${subEscaped}'[outv]`
].join(';');

const cmd = `ffmpeg -y -i "${inputVid}" -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -preset fast -crf 20 -c:a copy "${outputVid}"`;

console.log('Iniciando renderização de vídeo 1:1 com desfoque e legendas dinâmicas...');
execSync(cmd, { stdio: 'inherit' });

console.log('Vídeo 1:1 gerado com sucesso em:', outputVid);
