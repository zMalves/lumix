const { runRemote } = require('./ssh_helper.js');

async function checkFailed() {
  const script = `node -e 'const q = JSON.parse(require("fs").readFileSync("/app/videos/production_queue.json", "utf8")); console.log(JSON.stringify(q.items.filter(i => i.status === "failed").map(i => ({id: i.id, target: i.target, error: i.error, lastLogs: (i.logs || []).slice(-10)})), null, 2))'`;
  const res = await runRemote(`docker exec lumix-studio ${script}`);
  console.log('FAILED DETAILS:\n', res.stdout);
}

checkFailed().catch(console.error);

