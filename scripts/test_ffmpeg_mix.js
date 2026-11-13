const { runRemote } = require('./ssh_helper.js');

async function main() {
  const cmd = `docker exec lumix-studio ffmpeg -y -i /app/videos/No_one_loved_meexcept_my_adoptive_parents_shorts_movie_film_movierecap/narracao.mp3 -stream_loop -1 -i /app/assets/music/Ogryzek.mp3 -filter_complex "[0:a]volume=1.0[voice];[1:a]volume=0.12[bg];[voice][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,volume=1.0[aout]" -map "[aout]" -t 5 /app/videos/test_audio.mp3 2>&1`;
  const res = await runRemote(cmd);
  console.log('STDOUT:', res.stdout);
}

main().catch(console.error);

