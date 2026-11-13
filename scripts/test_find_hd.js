const { runRemote } = require('./ssh_helper.js');

async function test() {
  const r1 = await runRemote('ls -la /mnt/hd2tb');
  console.log('/mnt/hd2tb:\n' + r1.stdout);

  const r2 = await runRemote('find /mnt/hd2tb -maxdepth 3 -name "*www*" -o -name "*sistema*" 2>/dev/null');
  console.log('Search in /mnt/hd2tb:\n' + r2.stdout);
}

test().catch(console.error);

