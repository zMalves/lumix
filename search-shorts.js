const { execSync } = require('child_process');
const path = require('path');

const ytDlpPath = path.join(__dirname, 'tools', 'yt-dlp.exe');

// Formata data YYYYMMDD para DD/MM/AAAA
function formatDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return 'Não informada';
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return `${day}/${month}/${year}`;
}

/**
 * Pesquisa Shorts virais no YouTube com filtro de visualizações mínimas e duração <= 60s
 */
function searchShorts(query = 'movierecap', minViews = 1000000, limit = 3) {
  console.log(`[yt-dlp] Buscando Shorts para: "${query}"...`);
  console.log(`[yt-dlp] Filtro: Mínimo ${minViews.toLocaleString('pt-BR')} visualizações | Duração <= 60s\n`);

  const cleanTag = query.replace(/^#/, '').trim();
  const searchSource = cleanTag.length > 0 && !cleanTag.includes(' ')
    ? `https://www.youtube.com/hashtag/${cleanTag}/shorts`
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIYAQ%253D%253D`;

  const printFormat = '%(title)s|||%(view_count)s|||%(duration)s|||%(uploader)s|||%(id)s|||%(upload_date)s';
  const filter = `duration <= 60 & view_count >= ${minViews}`;

  const cmd = `"${ytDlpPath}" --js-runtimes node "${searchSource}" --match-filter "${filter}" --print "${printFormat}" --no-download --playlist-end 30`;

  let stdout = '';
  try {
    stdout = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch (e) {
    stdout = e.stdout ? e.stdout.toString() : '';
  }

  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];

  for (const line of lines) {
    const parts = line.split('|||');
    if (parts.length >= 6) {
      const [title, views, duration, channel, id, uploadDate] = parts;
      const viewNum = parseInt(views, 10);
      if (viewNum >= minViews) {
        results.push({
          title,
          views: viewNum,
          duration: `${duration}s`,
          channel: channel || 'Desconhecido',
          id,
          uploadDate: formatDate(uploadDate),
          url: `https://www.youtube.com/shorts/${id}`
        });
        if (results.length >= limit) break;
      }
    }
  }

  return results;
}

const inputQuery = process.argv[2] || 'movierecap';
const results = searchShorts(inputQuery, 1000000, 3);

console.log('=============================================================================');
console.log(` 🏆 TOP ${results.length} SHORTS VIRAIS ENCONTRADOS (+1.000.000 VIEWS):`);
console.log('=============================================================================\n');

results.forEach((s, idx) => {
  const formattedViews = Number(s.views).toLocaleString('pt-BR');
  console.log(`${idx + 1}. 🎬 Título: "${s.title}"`);
  console.log(`   📅 Data de Postagem: ${s.uploadDate}`);
  console.log(`   👀 Visualizações: ${formattedViews} views`);
  console.log(`   ⏱️  Duração: ${s.duration}`);
  console.log(`   👤 Canal: ${s.channel}`);
  console.log(`   🔗 Link do Short: ${s.url}\n`);
});
