const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const bgMusic = path.join(__dirname, 'assets', 'music', 'Ogryzek.mp3');
console.log('Background music path:', bgMusic);
console.log('Exists:', fs.existsSync(bgMusic));

try {
  // Test with -stream_loop -1 -i bgMusic
  const testCmd = `ffmpeg -y -f lavfi -i color=c=black:s=720x1280:d=5 -f lavfi -i sine=f=440:d=5 -stream_loop -1 -i "${bgMusic}" -filter_complex "[1:a]volume=1.0[voice];[2:a]volume=0.15[bg];[voice][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]" -map 0:v:0 -map "[aout]" -c:v libx264 -c:a aac -shortest test_mix.mp4`;
  console.log('Running test command...');
  execSync(testCmd, { stdio: 'pipe' });
  console.log('SUCCESS! test_mix.mp4 created. Size:', fs.statSync('test_mix.mp4').size);
  fs.unlinkSync('test_mix.mp4');
} catch (e) {
  console.error('ERROR:', e.stderr ? e.stderr.toString() : e.message);
}
