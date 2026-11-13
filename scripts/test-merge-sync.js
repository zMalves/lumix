const { execSync } = require('child_process');
const path = require('path');

const projectDir = path.join(__dirname, '..', 'videos', 'Puedes_sacar_una_moneda_de_una_maquina_expendedora_con_una_cuerda');
const videoFile = path.join(projectDir, 'video_cortado.mp4');
const audioFile = path.join(projectDir, 'narracao.mp3');
const finalFile = path.join(projectDir, 'final.mp4');

const vDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${videoFile}"`, { encoding: 'utf-8' }).trim());
const aDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${audioFile}"`, { encoding: 'utf-8' }).trim());

// atempo aceita entre 0.5 e 2.0. Se for maior que 2.0, encadeia atempo
const speed = aDur / vDur;
console.log(`Duração do Vídeo: ${vDur.toFixed(2)}s | Duração do Áudio: ${aDur.toFixed(2)}s | Fator de Aceleração atempo: ${speed.toFixed(3)}x`);

let filterAudio = `atempo=${speed.toFixed(4)}`;
if (speed > 2.0) {
  const s1 = 2.0;
  const s2 = speed / 2.0;
  filterAudio = `atempo=${s1.toFixed(4)},atempo=${s2.toFixed(4)}`;
}

const cmd = `ffmpeg -y -i "${videoFile}" -i "${audioFile}" -filter_complex "[1:a]${filterAudio}[aout]" -map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k "${finalFile}"`;
console.log('Executando mesclagem com sincronização milimétrica...');
execSync(cmd, { stdio: 'inherit' });

const fDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${finalFile}"`, { encoding: 'utf-8' }).trim());
console.log(`Sucesso! Vídeo final gerado: final.mp4 com ${fDur.toFixed(2)}s sincronizado com o corte.`);
