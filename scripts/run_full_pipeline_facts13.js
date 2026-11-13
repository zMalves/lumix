const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const folderName = 'Random_Facts_You_Didnt_Know_13';
const projectDir = path.join(__dirname, '..', 'videos', folderName);
const originalVid = path.join(projectDir, 'original.mp4');
const cleanVid = path.join(projectDir, 'sem_marca.mp4');
const rawAudio = path.join(projectDir, 'narracao.mp3');
const trimmedAudio = path.join(projectDir, 'narracao_trimmed.mp3');
const cutVid = path.join(projectDir, 'video_cortado.mp4');
const finalVid = path.join(projectDir, 'final.mp4');
const subFile = path.join(projectDir, 'legendas.ass');
const output9x16 = path.join(projectDir, 'video_9x16_crop_quadrado.mp4');
const output1x1 = path.join(projectDir, 'video_1x1_legendado.mp4');

const pythonExe = 'C:\\Users\\Maychel\\AppData\\Roaming\\VoiceStudio\\runtime\\project\\.venv\\Scripts\\python.exe';

console.log('=============================================================');
console.log('🚀 PIPELINE AUTOMATIZADO COMPLETO: RANDOM FACTS 13');
console.log('=============================================================');

// 1. Verifica se sem_marca.mp4 existe
if (!fs.existsSync(cleanVid)) {
  console.error(`[Erro] sem_marca.mp4 ainda não existe em: ${cleanVid}`);
  process.exit(1);
}

// 2. Extrai frames de validação para conferência
console.log('\n[Passo 1/5] Extraindo frames de validação do sem_marca.mp4...');
const checkTimes = [5, 15, 20, 30, 45];
for (const t of checkTimes) {
  const origFrame = path.join(projectDir, `orig_val_${t}s.jpg`);
  const cleanFrame = path.join(projectDir, `clean_val_${t}s.jpg`);
  execSync(`ffmpeg -y -ss ${t} -i "${originalVid}" -vframes 1 -q:v 2 "${origFrame}"`, { stdio: 'ignore' });
  execSync(`ffmpeg -y -ss ${t} -i "${cleanVid}" -vframes 1 -q:v 2 "${cleanFrame}"`, { stdio: 'ignore' });
  console.log(`   - Frame ${t}s extraído: ${cleanFrame}`);
}

// 3. Obtém duração do áudio narrado e do vídeo sem marca
const cleanDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${cleanVid}"`, { encoding: 'utf-8' }).trim());
const audioDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${trimmedAudio}"`, { encoding: 'utf-8' }).trim());
console.log(`\n[Passo 2/5] Duração do vídeo limpo: ${cleanDur.toFixed(2)}s | Duração da narração: ${audioDur.toFixed(2)}s`);

// 4. Executa cortes rítmicos para sincronizar com precisão e criar dinamismo
console.log('\n[Passo 3/5] Aplicando cortes rítmicos dinâmicos...');
const keepSec = 3.0;
// Calcula corte exato para aproximar a duração do vídeo cortado da narração
const segments = [];
let currentStart = 0;
// Diferença total que precisamos eliminar se o vídeo for mais longo
const diffSec = Math.max(0, cleanDur - audioDur);
const estCycles = Math.floor(cleanDur / (keepSec + 0.15));
const cutSec = estCycles > 0 ? Math.min(0.5, Math.max(0.12, diffSec / estCycles)) : 0.15;

while (currentStart < cleanDur) {
  let currentEnd = currentStart + keepSec;
  if (currentEnd > cleanDur) currentEnd = cleanDur;
  segments.push({ start: currentStart, end: currentEnd });
  currentStart = currentEnd + cutSec;
}

console.log(`   - Segmentos gerados: ${segments.length} (Mantém ${keepSec}s, corta ${cutSec.toFixed(2)}s)`);
const filterParts = [];
const concatInputs = [];
segments.forEach((seg, i) => {
  filterParts.push(`[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
  concatInputs.push(`[v${i}]`);
});
const filterComplexCut = `${filterParts.join(';')};${concatInputs.join('')}concat=n=${segments.length}:v=1:a=0[outv]`;
execSync(`ffmpeg -y -i "${cleanVid}" -filter_complex "${filterComplexCut}" -map "[outv]" -c:v libx264 -preset fast -crf 19 "${cutVid}"`, { stdio: 'ignore' });

const cutDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${cutVid}"`, { encoding: 'utf-8' }).trim());
console.log(`   - Vídeo cortado com sucesso: ${cutDur.toFixed(2)}s`);

// 5. Mescla áudio e vídeo com sincronização fina
console.log('\n[Passo 4/5] Sincronizando vídeo cortado com a narração dublada...');
const speed = audioDur / cutDur;
let filterAudio = `atempo=${speed.toFixed(4)}`;
if (speed > 2.0) {
  filterAudio = `atempo=2.0,atempo=${(speed / 2.0).toFixed(4)}`;
} else if (speed < 0.5) {
  filterAudio = `atempo=0.5,atempo=${(speed / 0.5).toFixed(4)}`;
}

execSync(`ffmpeg -y -i "${cutVid}" -i "${trimmedAudio}" -filter_complex "[1:a]${filterAudio}[aout]" -map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k "${finalVid}"`, { stdio: 'ignore' });
console.log(`   - final.mp4 gerado com sincronismo perfeito!`);

// 6. Gera legendas ASS dinâmicas palavra por palavra
console.log('\n[Passo 5/5] Gerando legendas dinâmicas palavra por palavra e renderizando vídeo 9:16 final...');
const subScript = path.join(__dirname, 'generate-subtitles.py');
execSync(`"${pythonExe}" "${subScript}" "${trimmedAudio}" "${subFile}"`, { stdio: 'inherit' });

// 7. Renderiza 9:16 com centro 1:1 e fundo desfocado + legendas
const subEscaped = subFile.replace(/\\/g, '/').replace(/:/g, '\\:');
const renderFilter = [
  '[0:v]split=2[fg_in][bg_in]',
  '[bg_in]scale=720:1280,avgblur=sizeX=25:sizeY=25,eq=brightness=-0.40:contrast=0.85[bg]',
  '[fg_in]scale=720:1280,crop=720:720:(in_w-out_w)/2:(in_h-out_h)/2[fg_square]',
  '[bg][fg_square]overlay=0:(H-h)/2[v_comp]',
  `[v_comp]subtitles='${subEscaped}'[outv]`
].join(';');

execSync(`ffmpeg -y -i "${finalVid}" -filter_complex "${renderFilter}" -map "[outv]" -map 0:a -c:v libx264 -preset fast -crf 20 -c:a copy "${output9x16}"`, { stdio: 'inherit' });
fs.copyFileSync(output9x16, output1x1);

console.log('\n=============================================================');
console.log('🎉 PROCESSO CONCLUÍDO COM SUCESSO TOTAL!');
console.log(`📁 Vídeo Final 9:16: ${output9x16}`);
console.log('=============================================================');
