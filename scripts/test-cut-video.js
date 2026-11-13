const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function cutVideoPaced(inputVideo, outputVideo, keepSec = 3.0, cutSec = 0.5) {
  // 1. Obtém duração do vídeo
  const probe = execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${inputVideo}"`, { encoding: 'utf-8' });
  const totalDuration = parseFloat(probe.trim());
  if (isNaN(totalDuration) || totalDuration <= 0) {
    throw new Error('Não foi possível obter a duração do vídeo.');
  }

  console.log(`Duração original do vídeo: ${totalDuration.toFixed(2)}s`);

  // 2. Calcula os segmentos a manter
  // Mantém [0, 3.0], pula [3.0, 3.5], mantém [3.5, 6.5], pula [6.5, 7.0]...
  const segments = [];
  let currentStart = 0;

  while (currentStart < totalDuration) {
    let currentEnd = currentStart + keepSec;
    if (currentEnd > totalDuration) {
      currentEnd = totalDuration;
    }
    segments.push({ start: currentStart, end: currentEnd });
    currentStart = currentEnd + cutSec;
  }

  console.log(`Gerando ${segments.length} cortes...`);

  // 3. Monta o filtro complexo do ffmpeg
  // Exemplo: [0:v]trim=start=0:end=3,setpts=PTS-STARTPTS[v0]; ... concat=n=...:v=1:a=0[outv]
  const filterParts = [];
  const concatInputs = [];

  segments.forEach((seg, i) => {
    filterParts.push(`[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    concatInputs.push(`[v${i}]`);
  });

  const filterComplex = `${filterParts.join(';')};${concatInputs.join('')}concat=n=${segments.length}:v=1:a=0[outv]`;

  const cmd = `ffmpeg -y -i "${inputVideo}" -filter_complex "${filterComplex}" -map "[outv]" -c:v libx264 -preset fast -crf 20 "${outputVideo}"`;
  console.log('Executando ffmpeg para corte ritmado...');
  execSync(cmd, { stdio: 'inherit' });

  const finalProbe = execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${outputVideo}"`, { encoding: 'utf-8' });
  const finalDuration = parseFloat(finalProbe.trim());
  console.log(`Novo vídeo cortado gerado com sucesso! Nova duração: ${finalDuration.toFixed(2)}s`);
  return finalDuration;
}

// Teste no vídeo atual
const projectDir = path.join(__dirname, '..', 'videos', 'Puedes_sacar_una_moneda_de_una_maquina_expendedora_con_una_cuerda');
const input = path.join(projectDir, 'sem_marca.mp4');
const output = path.join(projectDir, 'video_cortado.mp4');

cutVideoPaced(input, output);
