const { runRemote } = require('./ssh_helper.js');

async function main() {
  const res = await runRemote('docker exec lumix-studio yt-dlp --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -F "https://vt.tiktok.com/ZSp8BYEAx/"');
  console.log('STDOUT:\n', res.stdout);
  console.log('STDERR:\n', res.stderr);
}

main().catch(console.error);

