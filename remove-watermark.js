/**
 * remove-watermark.js
 * Remoção de Marcas d'Água e Legendas 100% via API Oficial VMake (Sem Playwright)
 * Usa pool gerenciado com limite de 4 requisições simultâneas e polling sem timeout.
 */

const path = require('node:path');
const fs = require('node:fs');

// Permite passar o nome da pasta como argumento: node remove-watermark.js "Nome_Da_Pasta"
const folderArg = process.argv[2];
if (!folderArg) {
  console.error('Uso: node remove-watermark.js <nome_da_pasta_em_videos>');
  process.exit(1);
}

// Carrega variáveis de ambiente
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path.resolve(__dirname, '.env'));
  } catch (e) {}
}

const targetDir = path.isAbsolute(folderArg) ? folderArg : path.join(__dirname, 'videos', folderArg);
const videoPath = path.join(targetDir, 'original.mp4');
const outputPath = path.join(targetDir, 'sem_marca.mp4');

if (!fs.existsSync(videoPath)) {
  console.error(`Erro: Arquivo original.mp4 não encontrado em: ${videoPath}`);
  process.exit(1);
}

async function run() {
  const ak = process.env.VMAKE_AK || process.env.MT_AK;
  const sk = process.env.VMAKE_SK || process.env.MT_SK;

  if (!ak || !sk) {
    console.error('[VMake Error] Chaves VMAKE_AK / VMAKE_SK não encontradas no .env');
    process.exit(1);
  }

  const { vmakePool } = require('./vmake_pool.js');
  const materialId = process.env.VMAKE_TASK || 'SKM0002'; // SKM0002 = Subtitle Remover

  console.log(`\n=============================================================`);
  console.log(`[VMake API] INICIANDO PROCESSAMENTO (API Direta sem Playwright)`);
  console.log(`[VMake API] Pasta: ${path.basename(targetDir)}`);
  console.log(`[VMake API] Task ID: ${materialId}`);
  console.log(`[VMake API] Original: ${videoPath}`);
  console.log(`[VMake API] Saída esperada: ${outputPath}`);
  console.log(`=============================================================\n`);

  try {
    await vmakePool.enqueue(videoPath, outputPath, materialId, (p) => {
      process.stdout.write(`\r[VMake API] ${p.message} (${p.percent || 0}%)`);
    });

    console.log('\n');
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log(`[VMake API] ✅ Concluído com sucesso! Tamanho: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      process.exit(0);
    } else {
      console.error('[VMake API] ❌ Arquivo de saída não foi gerado.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n[VMake API] ❌ Falha no processamento: ${err.message}`);
    process.exit(1);
  }
}

run();
