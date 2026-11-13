const { runRemote } = require('./ssh_helper.js');

async function checkLiveStatus() {
  const script = `node -e 'const q = JSON.parse(require("fs").readFileSync("/app/videos/production_queue.json", "utf8")); console.log(JSON.stringify(q.items.filter(i => i.status === "processing").map(i => ({id: i.id, target: i.target, step: i.currentStep, pct: i.progress, lastLogs: (i.logs || []).slice(-8)})), null, 2))'`;
  const res = await runRemote(`docker exec lumix-studio ${script}`);
  console.log('LIVE STATUS:\n', res.stdout);
}

checkLiveStatus().catch(console.error);

