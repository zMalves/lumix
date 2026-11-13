const { runRemote } = require('./ssh_helper.js');

async function main() {
  const code = `curl -s -X POST http://127.0.0.1:3334/api/merge -H "Content-Type: application/json" -d "{\\"project\\":\\"No_one_loved_meexcept_my_adoptive_parents_shorts_movie_film_movierecap\\"}"`;
  const res = await runRemote(code);
  console.log(res.stdout);
}

main().catch(console.error);

