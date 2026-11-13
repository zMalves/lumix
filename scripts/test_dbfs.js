const { runRemote } = require('./ssh_helper.js');

async function main() {
  const code = `docker exec lumix-studio python3 -c "import pydub; o = pydub.AudioSegment.from_file('/app/assets/music/Ogryzek.mp3'); s = o.get_array_of_samples(); print('Ogryzek max sample:', max(s), 'min sample:', min(s), 'len:', len(s))"`;
  const res = await runRemote(code);
  console.log(res.stdout);
}

main().catch(console.error);