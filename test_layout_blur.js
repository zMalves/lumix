const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testVid = path.join(__dirname, 'videos', 'The_recruit_was_a_sharpshooterbut_was_branded_a_desertermovie_viral_motivation_s', 'final.mp4');
const subFile = path.join(__dirname, 'videos', 'The_recruit_was_a_sharpshooterbut_was_branded_a_desertermovie_viral_motivation_s', 'legendas.ass');
const subEscaped = subFile.replace(/\\/g, '/').replace(/:/g, '\\:');
const outTest = path.join(__dirname, 'test_blur_vertical.mp4');

// Filter:
// 1. Crop to 1:1 square: crop='min(iw,ih)':'min(iw,ih)':(iw-ow)/2:(ih-oh)/2
// 2. Split into foreground [fg] and background [bg]
// 3. [fg] scale to 720:720
// 4. [bg] scale and crop to 720x1280 (vertical fill), apply avgblur and dark opacity
// 5. overlay [fg] in the exact center: (W-w)/2:(H-h)/2 = (720-720)/2 : (1280-720)/2 = 0 : 280
// 6. burn dynamic subtitles

const filterComplex = [
  // Crop to square 1:1 first
  `[0:v]crop='min(iw,ih)':'min(iw,ih)':(iw-ow)/2:(ih-oh)/2,split=2[fg_raw][bg_raw]`,
  // Background: preenche verticalmente 720x1280 (crop das laterais), desfoque gaussiano/avgblur + escurecimento suave
  `[bg_raw]scale=1280:1280,crop=720:1280,avgblur=sizeX=35:sizeY=35,eq=brightness=-0.35:contrast=0.90[bg]`,
  // Foreground: vídeo 1:1 ajustado na largura (720x720)
  `[fg_raw]scale=720:720[fg]`,
  // Centraliza o quadrado 720x720 bem no meio da tela 720x1280 (y=(1280-720)/2 = 280)
  `[bg][fg]overlay=0:(H-h)/2[v_comp]`,
  // Aplica legendas dinâmicas
  `[v_comp]subtitles='${subEscaped}'[outv]`
].join(';');

const cmd = `ffmpeg -y -t 5 -i "${testVid}" -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -preset fast -crf 20 -c:a copy "${outTest}"`;

console.log('Running test ffmpeg...');
execSync(cmd, { stdio: 'inherit' });
console.log('Success! outTest size:', fs.statSync(outTest).size);

// Extract a preview frame at 2s
execSync(`ffmpeg -y -ss 00:00:02 -i "${outTest}" -vframes 1 -q:v 2 test_preview_blur.jpg`, { stdio: 'ignore' });
console.log('Preview frame created: test_preview_blur.jpg');

if (fs.existsSync(outTest)) fs.unlinkSync(outTest);
