/**
 * search-and-download.js - Módulo e CLI de Pesquisa e Download de Shorts Virais
 * 
 * Funcionalidades:
 * 1. Pesquisa Shorts no YouTube filtrando por views mínimas e duração (<= 60s).
 * 2. Baixa automaticamente o melhor vídeo (ou top N) em alta qualidade.
 * 3. Cria a pasta do projeto (ex: videos/<titulo>/original.mp4) e salva info.json.
 * 4. Carrega configurações do .env automaticamente.
 */

const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

// Carrega variáveis do .env nativamente
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (e) {}
}

const ROOT_DIR = __dirname;
const YT_DLP_PATH = path.join(ROOT_DIR, 'tools', 'yt-dlp.exe');
const VIDEOS_DIR = process.env.DOWNLOAD_OUTPUT_DIR || path.join(ROOT_DIR, 'videos');

// Formata data YYYYMMDD para DD/MM/AAAA
function formatDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return 'Não informada';
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return `${day}/${month}/${year}`;
}

// Limpa caracteres inválidos para nomes de pastas no Windows
function sanitizeFolderName(name) {
  return name
    .replace(/[\\/:*?"<>|#_]/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80); // Limite razoável de tamanho
}

/**
 * Pesquisa Shorts virais com base na consulta e filtros
 */
function searchShorts(options = {}) {
  const query = options.query || process.env.SEARCH_DEFAULT_QUERY || 'movierecap';
  const minViews = Number(options.minViews || process.env.SEARCH_MIN_VIEWS || 1000000);
  const maxDuration = Number(options.maxDuration || process.env.SEARCH_MAX_DURATION || 60);
  const limit = Number(options.limit || process.env.SEARCH_LIMIT || 3);

  console.log(`[Busca] Termo de pesquisa: "${query}"`);
  console.log(`[Busca] Filtros: Mínimo ${minViews.toLocaleString('pt-BR')} visualizações | Duração <= ${maxDuration}s\n`);

  const cleanTag = query.replace(/^#/, '').trim();
  const searchSource = cleanTag.length > 0 && !cleanTag.includes(' ')
    ? `https://www.youtube.com/hashtag/${cleanTag}/shorts`
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIYAQ%253D%253D`;

  const printFormat = '%(title)s|||%(view_count)s|||%(duration)s|||%(uploader)s|||%(id)s|||%(upload_date)s';
  const filter = `duration <= ${maxDuration} & view_count >= ${minViews}`;

  const cmd = `"${YT_DLP_PATH}" --js-runtimes node "${searchSource}" --match-filter "${filter}" --print "${printFormat}" --no-download --playlist-end 30`;

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
          title: title.trim(),
          views: viewNum,
          duration: `${duration}s`,
          durationSeconds: parseInt(duration, 10) || 0,
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

/**
 * Baixa um vídeo por URL e salva estruturado com info.json
 */
function downloadShort(url, customFolder = null) {
  if (!url) {
    throw new Error('URL do Short é obrigatória');
  }

  console.log(`[Download] Obtendo metadados do vídeo: ${url}...`);

  // Extrai informações completas em JSON
  let videoMeta = {};
  try {
    const jsonStr = execSync(`"${YT_DLP_PATH}" --js-runtimes node --dump-single-json "${url}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    videoMeta = JSON.parse(jsonStr);
  } catch (e) {
    videoMeta = { title: 'Short_' + Date.now(), id: path.basename(url) };
  }

  const title = videoMeta.title || 'Short_' + Date.now();
  const folderName = customFolder || sanitizeFolderName(title);
  const targetFolder = path.isAbsolute(folderName) ? folderName : path.join(VIDEOS_DIR, folderName);

  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  const outputPath = path.join(targetFolder, 'original.mp4');
  const infoPath = path.join(targetFolder, 'info.json');

  console.log(`[Download] Pasta de destino: ${targetFolder}`);
  console.log(`[Download] Baixando original.mp4...`);

  // Baixa o vídeo com a melhor qualidade MP4 disponível
  const cmd = `"${YT_DLP_PATH}" --js-runtimes node -f "18/best[ext=mp4]/best" "${url}" -o "${outputPath}"`;
  execSync(cmd, { stdio: 'inherit' });

  // Salva info.json estruturado
  const savedInfo = {
    id: videoMeta.id || path.basename(url),
    title: videoMeta.title || title,
    url,
    channel: videoMeta.uploader || videoMeta.channel || '',
    views: videoMeta.view_count || 0,
    duration: videoMeta.duration || 0,
    uploadDate: videoMeta.upload_date || '',
    downloadedAt: new Date().toISOString(),
    files: {
      original: 'original.mp4',
      cleaned: 'sem_marca.mp4'
    }
  };

  fs.writeFileSync(infoPath, JSON.stringify(savedInfo, null, 2), 'utf-8');

  console.log('\n=============================================================');
  console.log(`[Download] CONCLUÍDO COM SUCESSO!`);
  console.log(`📁 Pasta: ${targetFolder}`);
  console.log(`🎥 Vídeo: ${outputPath}`);
  console.log(`📄 Info:  ${infoPath}`);
  console.log('=============================================================\n');

  return {
    folder: targetFolder,
    videoPath: outputPath,
    infoPath,
    meta: savedInfo
  };
}

/**
 * Pesquisa e baixa automaticamente os vídeos encontrados
 */
function searchAndDownload(options = {}) {
  const results = searchShorts(options);

  if (results.length === 0) {
    console.log('[Busca] Nenhum vídeo encontrado com os critérios fornecidos.');
    return [];
  }

  console.log('=============================================================================');
  console.log(` 🏆 TOP ${results.length} SHORTS VIRAIS ENCONTRADOS:`);
  console.log('=============================================================================\n');

  results.forEach((s, idx) => {
    const formattedViews = Number(s.views).toLocaleString('pt-BR');
    console.log(`${idx + 1}. 🎬 "${s.title}"`);
    console.log(`   👀 ${formattedViews} views | ⏱️  ${s.duration} | 👤 ${s.channel}`);
    console.log(`   🔗 ${s.url}\n`);
  });

  const shouldDownload = options.download !== false;
  if (!shouldDownload) return results;

  const downloadCount = options.downloadAll ? results.length : 1;
  console.log(`[Pipeline] Baixando ${downloadCount} vídeo(s) para a pasta de produção...\n`);

  const downloaded = [];
  for (let i = 0; i < downloadCount; i++) {
    const item = results[i];
    console.log(`---> Baixando #${i + 1}: ${item.title}`);
    const res = downloadShort(item.url);
    downloaded.push(res);
  }

  return downloaded;
}

module.exports = {
  searchShorts,
  downloadShort,
  searchAndDownload
};

// Execução via terminal / CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    console.log(`
Uso de search-and-download.js:

  node search-and-download.js [termo] [opções]

Opções:
  --views <num>       Visualizações mínimas (padrão: 1000000)
  --duration <seg>    Duração máxima em segundos (padrão: 60)
  --limit <num>       Quantidade de resultados da busca (padrão: 3)
  --search-only       Apenas pesquisa e lista, sem baixar o vídeo
  --download-all      Baixa todos os vídeos encontrados da lista
  --url <link>        Baixa diretamente uma URL específica de Short

Exemplos:
  node search-and-download.js "fatos curiosos" --views 500000
  node search-and-download.js movierecap --search-only
  node search-and-download.js --url https://www.youtube.com/shorts/4fhBDBEtd-E
`);
    process.exit(0);
  }

  // Verifica se passou uma URL direta
  const urlIdx = args.indexOf('--url');
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    downloadShort(args[urlIdx + 1]);
    process.exit(0);
  }

  // Opções de busca
  let query = 'movierecap';
  if (args[0] && !args[0].startsWith('--')) {
    query = args[0];
  }

  const viewsArg = args.indexOf('--views');
  const minViews = viewsArg !== -1 ? parseInt(args[viewsArg + 1], 10) : undefined;

  const durArg = args.indexOf('--duration');
  const maxDuration = durArg !== -1 ? parseInt(args[durArg + 1], 10) : undefined;

  const limitArg = args.indexOf('--limit');
  const limit = limitArg !== -1 ? parseInt(args[limitArg + 1], 10) : undefined;

  const searchOnly = args.includes('--search-only');
  const downloadAll = args.includes('--download-all');

  searchAndDownload({
    query,
    minViews,
    maxDuration,
    limit,
    download: !searchOnly,
    downloadAll
  });
}
