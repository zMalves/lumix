/**
 * media_download.js - Helpers compartilhados de download (YouTube Shorts, TikTok, Instagram).
 *
 * Instagram: o yt-dlp costuma exigir login para Reels/posts. Exporte os cookies do
 * navegador (formato Netscape cookies.txt, com a sessão do instagram.com logada) e
 * aponte YTDLP_COOKIES_FILE para o arquivo no .env.
 */

const fs = require('node:fs');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Argumentos comuns do yt-dlp (user-agent, certificados e cookies opcionais). */
function ytDlpCommonArgs() {
  const args = ['--user-agent', USER_AGENT, '--no-check-certificates'];
  const cookies = process.env.YTDLP_COOKIES_FILE;
  if (cookies && fs.existsSync(cookies)) {
    args.push('--cookies', cookies);
  }
  return args;
}

/** Mesmos argumentos, já quotados para uso em string de shell (execSync). */
function ytDlpCommonArgsShell() {
  return ytDlpCommonArgs().map(a => `"${a}"`).join(' ');
}

function detectPlatform(url = '') {
  if (/instagram\.com/i.test(url)) return 'Instagram';
  if (/tiktok\.com/i.test(url)) return 'TikTok';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YouTube';
  return 'Video';
}

/**
 * Nome de pasta seguro para quando o título vier vazio (ex.: título só com emojis).
 * Instagram: usa o shortcode do link (Instagram_<codigo>).
 */
function fallbackFolderName(url = '') {
  const m = url.match(/instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/i);
  if (m) return `Instagram_${m[1]}`;
  return `Short_${Date.now()}`;
}

module.exports = { ytDlpCommonArgs, ytDlpCommonArgsShell, detectPlatform, fallbackFolderName };
