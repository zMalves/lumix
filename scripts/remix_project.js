const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const folderName = process.argv[2] || 'He_Raised_a_Cheetah_Then_Had_to_Let_It_Go_emotional';
const ROOT_DIR = path.join(__dirname, '..');
const projectDir = path.join(ROOT_DIR, 'videos', folderName);

const cutVid = path.join(projectDir, 'video_cortado.mp4');
const trimmedAudio = path.join(projectDir, 'narracao_trimmed.mp3');
const finalVid = path.join(projectDir, 'final.mp4');
const output9x16 = path.join(projectDir, 'video_9x16.mp4');
const subFile = path.join(projectDir, 'legendas.ass');
const bgMusicFile = path.join(ROOT_DIR, 'assets', 'music', 'Ogryzek.mp3');

console.log(`[Remix] Processando pasta: ${folderName}`);
console.log(`[Remix] Usando trilha: ${bgMusicFile}`);

const cleanDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${cutVid}"`, { encoding: 'utf-8' }).trim());
const audioDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${trimmedAudio}"`, { encoding: 'utf-8' }).trim());
const speed = audioDur / cleanDur;
let filterAudio = `atempo=${speed.toFixed(4)}`;
if (speed > 2.0) filterAudio = `atempo=2.0,atempo=${(speed / 2.0).toFixed(4)}`;
else if (speed < 0.5) filterAudio = `atempo=0.5,atempo=${(speed / 0.5).toFixed(4)}`;

console.log('[Remix] 1. Mesclando final.mp4 com a nova trilha sonora 1026(1)...');
const filterComplex = `[1:a]${filterAudio},volume=1.0[voice];[2:a]volume=0.20[bg];[voice][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
const cmdMerge = `ffmpeg -y -i "${cutVid}" -i "${trimmedAudio}" -stream_loop -1 -i "${bgMusicFile}" -filter_complex "${filterComplex}" -map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "${finalVid}"`;
execSync(cmdMerge, { stdio: 'inherit' });

console.log('[Remix] 2. Removendo qualquer versão antiga da Etapa 7...');
if (fs.existsSync(output9x16)) fs.unlinkSync(output9x16);
const outCrop = path.join(projectDir, 'video_9x16_crop_quadrado.mp4');
const out1x1 = path.join(projectDir, 'video_1x1_legendado.mp4');
if (fs.existsSync(outCrop)) fs.unlinkSync(outCrop);
if (fs.existsSync(out1x1)) fs.unlinkSync(out1x1);

console.log('[Remix] Concluído! O final.mp4 agora tem a nova música 1026(1). A Etapa 7 está livre para renderizar.');

