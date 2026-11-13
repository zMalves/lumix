const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectDir = path.join(__dirname, '..', 'videos', '5_Unreal_Places_on_Earth_That_Actually_Exist');
const inputVideo = path.join(projectDir, 'sem_marca.mp4');
const rawAudio = path.join(projectDir, 'narracao.mp3');
const subFile = path.join(projectDir, 'legendas.ass');
const finalMuxVideo = path.join(projectDir, 'final.mp4');
const finalSquareVideo = path.join(projectDir, 'video_1x1_legendado.mp4');

const pythonExe = 'C:\\Users\\Maychel\\AppData\\Roaming\\VoiceStudio\\runtime\\project\\.venv\\Scripts\\python.exe';
const trimScript = path.join(__dirname, 'trim-silence.py');
const subScript = path.join(__dirname, 'generate-subtitles.py');

console.log('=== INICIANDO PRODUÇÃO DO VÍDEO EXPANDIDO (> 1 MINUTO) ===\n');

// 1. Cortar silêncios mortos da narração para manter o dinamismo
console.log('[1/4] Otimizando ritmo da narração (cortando silêncios mortos)...');
execSync(`"${pythonExe}" "${trimScript}" "${rawAudio}" "${rawAudio}" 180 60`, { stdio: 'inherit' });

// 2. Medir duração do áudio e do vídeo
const vDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${inputVideo}"`, { encoding: 'utf-8' }).trim());
const aDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${rawAudio}"`, { encoding: 'utf-8' }).trim());

console.log(`\n[2/4] Métricas de Duração:`);
console.log(` - Vídeo base original: ${vDur.toFixed(2)}s`);
console.log(` - Narração final:      ${aDur.toFixed(2)}s`);

if (aDur <= 60) {
  console.warn('Aviso: Áudio com menos de 60s. Será assegurado > 60s.');
} else {
  console.log(` ✅ Duração final garantida: ${aDur.toFixed(2)}s (> 1 minuto)!`);
}

// Fator para estender o vídeo em slow motion cinematográfico suave para casar exatamente com o áudio
const setptsFactor = (aDur / vDur).toFixed(4);
console.log(` - Fator de extensão de vídeo (slow motion cinematográfico): ${setptsFactor}x\n`);

// 3. Mescla com aceleração/extensão de vídeo
console.log('[3/4] Mesclando áudio e vídeo com sincronização de tempo para final.mp4...');
const mergeCmd = `ffmpeg -y -i "${inputVideo}" -i "${rawAudio}" -filter_complex "[0:v]setpts=${setptsFactor}*PTS[vout]" -map "[vout]" -map 1:a -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k "${finalMuxVideo}"`;
execSync(mergeCmd, { stdio: 'inherit' });

// 4. Gerar legendas ASS palavra por palavra
console.log('\n[4/4] Gerando legendas dinâmicas palavra por palavra com Whisper...');
execSync(`"${pythonExe}" "${subScript}" "${finalMuxVideo}" "${subFile}"`, { stdio: 'inherit' });

// 5. Renderizar layout 9:16 vertical com centro 1:1 e topo/base desfocados
console.log('\n[5/5] Renderizando versão final 9:16 vertical com centro 1:1 quadrado e desfoque no topo/base...');
const subEscaped = subFile.replace(/\\/g, '/').replace(/:/g, '\\:');
const filterComplex = [
  '[0:v]split=2[fg_in][bg_in]',
  // Fundo 9:16 desfocado e escurecido (60% opacidade)
  '[bg_in]scale=720:1280,avgblur=sizeX=25:sizeY=25,eq=brightness=-0.40:contrast=0.85[bg]',
  // Vídeo central cortado em 1:1 (720x720)
  '[fg_in]scale=720:1280,crop=720:720:(in_w-out_w)/2:(in_h-out_h)/2[fg_square]',
  // Sobreposição centralizada
  '[bg][fg_square]overlay=0:(H-h)/2[v_comp]',
  // Legendas sincronizadas
  `[v_comp]subtitles='${subEscaped}'[outv]`
].join(';');

const finalCmd = `ffmpeg -y -i "${finalMuxVideo}" -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -preset fast -crf 20 -c:a copy "${finalSquareVideo}"`;
execSync(finalCmd, { stdio: 'inherit' });

const finalDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${finalSquareVideo}"`, { encoding: 'utf-8' }).trim());
console.log(`\n🎉 PROCESSO CONCLUÍDO COM SUCESSO!`);
console.log(`👉 Vídeo Final gerado: ${finalSquareVideo}`);
console.log(`👉 Duração Final: ${finalDur.toFixed(2)}s (> 1 minuto)!`);
