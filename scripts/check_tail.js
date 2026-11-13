const { runRemote } = require('./ssh_helper.js');

async function checkLiveLogTail() {
  const script = `node -e 'const q = JSON.parse(require("fs").readFileSync("/app/videos/production_queue.json", "utf8")); const it = q.items.find(i => i.status === "processing") || q.items[0]; console.log("Status:", it ? it.status : "none"); if (it && it.logs) console.log(it.logs.slice(-15).join(""));'`;
  const res = await runRemote(`docker exec lumix-studio ${script}`);
  console.log('TAIL:\n', res.stdout);
}

checkLiveLogTail().catch(console.error);

