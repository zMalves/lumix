const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.join(__dirname, '..');
const projectDir = path.join(ROOT_DIR, 'videos', 'The_recruit_was_a_sharpshooterbut_was_branded_a_desertermovie_viral_motivation_s');
const cutVid = path.join(projectDir, 'video_cortado.mp4');
const trimmedAudio = path.join(projectDir, 'narracao_trimmed.mp3');
const finalVid = path.join(projectDir, 'final.mp4');
const output9x16 = path.join(projectDir, 'video_9x16.mp4');
const subFile = path.join(projectDir, 'legendas.ass');
const bgMusicFile = path.join(ROOT_DIR, 'assets', 'music', 'Ogryzek.mp3');

const cleanDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${cutVid}"`, { encoding: 'utf-8' }).trim());
const audioDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv="p=0" "${trimmedAudio}"`, { encoding: 'utf-8' }).trim());
const speed = audioDur / cleanDur;
let filterAudio = `atempo=${speed.toFixed(4)}`;
if (speed > 2.0) filterAudio = `atempo=2.0,atempo=${(speed / 2.0).toFixed(4)}`;
else if (speed < 0.5) filterAudio = `atempo=0.5,atempo=${(speed / 0.5).toFixed(4)}`;

console.log('1. Remixing final.mp4 with Ogryzek background music...');
// volume voice = 1.0, bg music = 0.22 (perfect presence for dark channel curiosities)
const filterComplex = `[1:a]${filterAudio},volume=1.0[voice];[2:a]volume=0.22[bg];[voice][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
const cmdMerge = `ffmpeg -y -i "${cutVid}" -i "${trimmedAudio}" -stream_loop -1 -i "${bgMusicFile}" -filter_complex "${filterComplex}" -map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "${finalVid}"`;
execSync(cmdMerge, { stdio: 'inherit' });

console.log('2. Re-rendering video_9x16.mp4 with dynamic subtitles and mixed audio...');
const subEscaped = subFile.replace(/\\/g, '/').replace(/:/g, '\\:');
const renderFilter = `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':(iw-ow)/2:(ih-oh)/2,scale=720:1280,setsar=1,subtitles='${subEscaped}'`;
const cmdRender = `ffmpeg -y -i "${finalVid}" -vf "${renderFilter}" -c:v libx264 -preset fast -crf 20 -c:a copy "${output9x16}"`;
execSync(cmdRender, { stdio: 'inherit' });

fs.copyFileSync(output9x16, path.join(projectDir, 'video_9x16_crop_quadrado.mp4'));
fs.copyFileSync(output9x16, path.join(projectDir, 'video_1x1_legendado.mp4'));
console.log('SUCCESS! Video re-rendered with background music. Size:', fs.statSync(output9x16).size);
