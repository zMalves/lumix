const { execSync } = require('child_process');
const path = require('path');

const projectDir = path.join(__dirname, '..', 'videos', 'Puedes_sacar_una_moneda_de_una_maquina_expendedora_con_una_cuerda');
const inputVid = path.join(projectDir, 'final.mp4');
const subFile = path.join(projectDir, 'legendas.ass');
const outputVid = path.join(projectDir, 'video_9x16_crop_quadrado.mp4');

// Caminho de legendas escapado para o filtro do ffmpeg
const subEscaped = subFile.replace(/\\/g, '/').replace(/:/g, '\\:');

// Lógica de Renderização:
// 1. O vídeo final completo é 9:16 vertical (720x1280).
// 2. Fundo: o vídeo original preenche 720x1280, recebe desfoque gaussiano/médio forte e escurecimento (60% de opacidade) cobrindo topo e rodapé.
// 3. Vídeo principal no centro: o vídeo original é CORTADO no formato quadrado 1:1 central (720x720) [crop=in_w:in_w].
// 4. Esse quadrado 1:1 é posicionado exatamente no meio do quadro 9:16 vertical (Y = (1280 - 720) / 2 = 280).
// 5. Queima das legendas dinâmicas palavra por palavra no centro exato da tela.

const filterComplex = [
  '[0:v]split=2[fg_in][bg_in]',
  // Fundo 9:16 desfocado e escurecido (60% opacidade sobre preto)
  '[bg_in]scale=720:1280,avgblur=sizeX=25:sizeY=25,eq=brightness=-0.40:contrast=0.85[bg]',
  // Primeiro plano cortado em 1:1 quadrado (720x720) a partir do centro
  '[fg_in]scale=720:1280,crop=720:720:(in_w-out_w)/2:(in_h-out_h)/2[fg_square]',
  // Sobrepõe o quadrado 1:1 no meio da tela 9:16 (topo e rodapé exibem o desfoque)
  '[bg][fg_square]overlay=0:(H-h)/2[v_comp]',
  // Aplica as legendas dinâmicas palavra por palavra centralizadas
  `[v_comp]subtitles='${subEscaped}'[outv]`
].join(';');

const cmd = `ffmpeg -y -i "${inputVid}" -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -preset fast -crf 20 -c:a copy "${outputVid}"`;

console.log('Iniciando renderização: Formato final 9:16 + Vídeo central cortado em 1:1 + Topo/Base desfocados + Legenda...');
execSync(cmd, { stdio: 'inherit' });

console.log('Vídeo 9:16 com centro 1:1 gerado com sucesso em:', outputVid);
