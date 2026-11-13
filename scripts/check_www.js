const { runRemote } = require('./ssh_helper.js');

async function check() {
  const r = await runRemote('ls -la /mnt/hd2tb/apps/systems/www');
  console.log('/mnt/hd2tb/apps/systems/www:\n' + r.stdout);

  const r2 = await runRemote('find / -name "*sistemas*" 2>/dev/null | grep -i www');
  console.log('Any other www:\n' + r2.stdout);
}

check().catch(console.error);

