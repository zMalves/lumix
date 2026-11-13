const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const bgMusicFile = path.join(__dirname, 'assets', 'music', 'Ogryzek.mp3');
const videoFile = path.join(__dirname, 'videos', 'The_recruit_was_a_sharpshooterbut_was_branded_a_desertermovie_viral_motivation_s', 'video_cortado.mp4');
const audioFile = path.join(__dirname, 'videos', 'The_recruit_was_a_sharpshooterbut_was_branded_a_desertermovie_viral_motivation_s', 'narracao_trimmed.mp3');
const finalFile = path.join(__dirname, 'test_final.mp4');

const vDur = 10; // test 10s
const filterAudio = 'atempo=1.0';

console.log('Testing cmd 1 (aloop):');
try {
  const filterComplex = `[1:a]${filterAudio},volume=1.0[voice];[2:a]aloop=loop=-1:size=2e+09,volume=0.15[bg];[voice][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
  const cmd = `ffmpeg -y -t 5 -i "${videoFile}" -t 5 -i "${audioFile}" -i "${bgMusicFile}" -filter_complex "${filterComplex}" -map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "${finalFile}"`;
  execSync(cmd, { stdio: 'pipe' });
  console.log('aloop succeeded!');
} catch (e) {
  console.error('aloop failed:', e.stderr?.toString());
}

console.log('Testing cmd 2 (-stream_loop -1):');
try {
  const filterComplex = `[1:a]${filterAudio},volume=1.0[voice];[2:a]volume=0.25[bg];[voice][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
  const cmd = `ffmpeg -y -t 5 -i "${videoFile}" -t 5 -i "${audioFile}" -stream_loop -1 -i "${bgMusicFile}" -filter_complex "${filterComplex}" -map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "${finalFile}"`;
  execSync(cmd, { stdio: 'pipe' });
  console.log('-stream_loop succeeded!');
} catch (e) {
  console.error('-stream_loop failed:', e.stderr?.toString());
}

if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
