const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ytDlpPath = path.join(__dirname, 'tools', 'yt-dlp.exe');
const videosDir = path.join(__dirname, 'videos');

function sanitizeName(name) {
  return name.replace(/[\\/:*?"<>|#_]/g, ' ').trim().replace(/\s+/g, '_');
}

function downloadShort(url) {
  if (!url) {
    console.error('Uso: node download-short.js <URL_DO_SHORT>');
    process.exit(1);
  }

  console.log(`[yt-dlp] Obtendo informações do vídeo: ${url}...`);

  // Extrai o título do vídeo
  let title = '';
  try {
    title = execSync(`"${ytDlpPath}" --js-runtimes node --print "%(title)s" "${url}"`, { encoding: 'utf-8' }).trim();
  } catch (e) {
    title = 'Short_' + Date.now();
  }

  const folderName = sanitizeName(title);
  const targetFolder = path.join(videosDir, folderName);
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  const outputPath = path.join(targetFolder, 'original.mp4');

  console.log(`[yt-dlp] Criada pasta: ${targetFolder}`);
  console.log(`[yt-dlp] Baixando arquivo em: ${outputPath}...`);

  const cmd = `"${ytDlpPath}" --js-runtimes node -f "18/best[ext=mp4]/best" "${url}" -o "${outputPath}"`;
  execSync(cmd, { stdio: 'inherit' });

  console.log('\n=============================================================');
  console.log(`[yt-dlp] DOWNLOAD CONCLUÍDO COM SUCESSO!`);
  console.log(`Pasta: ${targetFolder}`);
  console.log(`Arquivo: ${outputPath}`);
  console.log('=============================================================\n');

  return { folder: targetFolder, file: outputPath };
}

const inputUrl = process.argv[2] || 'https://www.youtube.com/shorts/4fhBDBEtd-E';
downloadShort(inputUrl);
