const { runRemote } = require('./ssh_helper.js');

async function checkVideos() {
  const r = await runRemote('ls -lh /mnt/hd2tb/apps/systems/www/lumix/videos');
  console.log('VIDEOS FOLDER:\n', r.stdout);

  const r2 = await runRemote('find /mnt/hd2tb/apps/systems/www/lumix/videos -name "original.mp4" -exec ls -lh {} \\;');
  console.log('ORIGINALS:\n', r2.stdout);
}

checkVideos().catch(console.error);

