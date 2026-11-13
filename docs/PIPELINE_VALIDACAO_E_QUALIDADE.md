# Pipeline de Produção, Validação e Qualidade de Vídeos (LUMIX Studio)

Este documento descreve detalhadamente a arquitetura, o fluxo de execução e os critérios rigorosos de validação de qualidade aplicados na esteira de produção automatizada de vídeos curtos (YouTube Shorts, Reels, TikTok).

---

## 1. Visão Geral da Arquitetura

O pipeline é composto por 6 módulos principais que atuam de forma sequencial e validada:

```
[ Download Original ] 
       │
       ▼
[ Remoção VMake (Inteligente Pro) ] ──► [ Validação Visual de Frames ]
       │
       ▼
[ Transcrição & Roteiro Viral ] ──► [ Normalização Fonética ]
       │
       ▼
[ Síntese Chunked VoiceStudio GPU (1.25x) ] ──► [ Corte de Silêncio Suave ] ──► [ Validação de Fala ]
       │
       ▼
[ Cortes Rítmicos no Vídeo (Retenção) ]
       │
       ▼
[ Sincronização Áudio-Vídeo (final.mp4) ]
       │
       ▼
[ Legendas ASS Dinâmicas (Extraídas do final.mp4) ]
       │
       ▼
[ Render 9:16 Vertical (Tela Cheia Nativa) ] ──► [ Validação Final ]
```

---

## 2. Etapa 1: Remoção de Marca d'Água e Legendas (VMake)

### Requisitos Obrigatórios:
1. **Remoção Dupla:** Eliminar tanto o logotipo/marca d'água do canal quanto todas as legendas originais em inglês embutidas na imagem.
2. **Modo:** Utilizar exclusivamente o modo **"Inteligente Pro"** do VMake, que emprega inpainting generativo temporal frame a frame.

### Protocolo de Validação Visual:
Para evitar qualquer avanço com resquícios ou falhas de processamento:
1. **Limpeza Prévia do Editor:** O script Playwright deve obrigatoriamente deletar cards concluídos de projetos anteriores antes de submeter o novo vídeo, evitando que um download prematuro pegue um vídeo antigo da fila.
2. **Extração de Frames de Controle:** Extrair frames em alta definição nos instantes-chave do vídeo (ex: `5s`, `15s`, `20s`, `30s`, `45s`).
   ```bash
   ffmpeg -ss 00:00:20 -i "sem_marca.mp4" -vframes 1 -q:v 2 "vmake_verify_20s.jpg" -y
   ```
3. **Inspeção Visual:**
   - Conferir se o rodapé/topo está limpo (sem `@BrainBlud` ou logos).
   - Conferir se o centro da tela não possui palavras fantasmas ou borrados grosseiros.

---

## 3. Etapa 2: Áudio, Narração, Fonética e Higienização de Silêncio

### 1. Normalização Fonética Pré-TTS (Obrigatório):
Motores neurais de TTS (como F5-TTS, Kokoro e Chatterbox) interpretam símbolos soltos ou abreviações de forma imprevisível ou com fonética inglesa:
* **Problema do Cifrão (`$`):** Símbolos monetários crus (`$1`, `$4`, `$8`) faziam a IA pronunciar a palavra como oxítona com sílaba tônica no final ("do-LÁR").
* **Regra de Ouro:** Todos os símbolos monetários e abreviações numéricas devem ser normalizados por extenso com acentuação ortográfica gráfica:
  * `$1` ➔ `"um dólar"`
  * `$2` ➔ `"dois dólares"`
  * `$4` ➔ `"quatro dólares"`
  * `$16` ➔ `"dezesseis dólares"`
  * `11h` ➔ `"onze horas"` (ou `"onze da manhã"`)
* **Resultado:** Dicção 100% brasileira, natural, com acentuação correta e fluidez humana.

### 2. Síntese em Velocidade Neural Nativa (1.25x) vs Aceleração DSP:
* **Problema de Aceleração por Software (`atempo`):** Tentar acelerar uma narração lenta no FFmpeg com filtros de tempo (`atempo=1.20+`) deforma os formantes vocais, gerando um tom metálico, robótico e agudo ("efeito esquilo").
* **Regra de Ouro:** A aceleração necessária para o ritmo dinâmico de Shorts deve ser configurada **diretamente no parâmetro nativo do modelo de TTS (`speed: 1.25` a `1.30`)**.
* **Resultado:** A fala já é sintetizada com articulação acelerada nativa de estúdio, preservando graves encorpados, clareza e fidelidade orgânica da voz.

### 3. Chunking Seguro de Textos Longos (Prevenção de Estouro de VRAM / Erro 10054):
* Textos extensos (> 800 caracteres) causam estouro de memória VRAM na GPU durante a geração da marca d'água sintética (`AudioSeal`), resultando na queda súbita do backend (`ConnectionResetError [WinError 10054]`).
* **Solução:** O script `synthesize_chunked.py` divide o roteiro automaticamente em blocos seguros (~750 a 800 caracteres) respeitando fronteiras de pontuação final (`.`, `!`, `?`), sintetiza cada bloco na GPU de forma estável e os une via FFmpeg `concat`.

### 4. Calibração do Corte de Silêncio (`trim-silence.py`):
Para evitar cortes agressivos que engolem o final das frases ou geram sensação de gagueira:
* **`min_silence_len = 320ms`**: Não corta micropausas naturais entre palavras ou sons consonantais.
* **`keep_silence = 150ms`**: Mantém 150 milissegundos de respiro acústico entre sentenças.
* **`padding = 100ms`**: Adiciona margem de segurança nas bordas de cada fala para preservar vogais finais e respirações humanas.
* **`merge_distance = 220ms`**: Se duas palavras tiverem menos de 220ms entre si, elas são mantidas como um único bloco indivisível.

### 5. Protocolo de Validação de Áudio:
* Executar transcrição de volta (round-trip) via Whisper no arquivo `narracao_trimmed.mp3`.
* Conferir se o texto transcrito corresponde integralmente ao roteiro sem repetições de palavras (gagueira) ou finais cortados.

---

## 4. Etapa 3: Cortes Rítmicos e Sincronia de Pacing

Para maximizar a retenção nos primeiros 30 a 60 segundos do Short:
1. **Cortes Rítmicos Condicionais:**
   * Se o vídeo limpo for mais longo que a narração (`cleanDur - audioDur > 0.5s`), aplica a fórmula de microcortes rítmicos (mantém `3.0s` e remove `0.15s` a `0.5s`).
   * Se o vídeo já for mais curto ou equivalente à narração, mantém a integridade visual total sem cortes desnecessários.
2. **Sincronia Milimétrica:**
   * Mede a duração exata do vídeo cortado e da narração higienizada.
   * Aplica modulação proporcional mínima apenas para casamento fino de finalização.

---

## 5. Etapa 4: Legendas Dinâmicas ASS (Regra de Sincronia Absoluta)

### Regra de Ouro de Sincronização:
* **Causa do Desalinhamento:** Gerar legendas a partir de áudios intermediários (`narracao.mp3` ou `narracao_trimmed.mp3`) gera atrasos cumulativos de até 10 a 20 segundos em relação ao vídeo final.
* **Solução Obrigatória:** O Whisper **deve transcrever diretamente o arquivo de vídeo final montado (`final.mp4`)**. Como o arquivo de vídeo final já possui a trilha sonora definitiva sincronizada no tempo zero, cada timestamp de palavra gerado fica **100% travado e perfeitamente síncrono com a imagem e a fala**.

### Estilização Visual de Alto Impacto:
* **Fonte:** `Arial Black` ou `Montserrat Heavy`
* **Tamanho:** `50px` (escala 720x1280)
* **Cor primária:** Branco puro (`&H00FFFFFF`)
* **Borda/Contorno:** Preto sólido de 5px (`&H00000000`)
* **Sombra:** Suave translúcida de 2px
* **Alinhamento:** `5` (Centro exato da tela)
* **Formato:** Letras maiúsculas (`UPPERCASE`) com exibição palavra por palavra (word-by-word highlight).

---

## 6. Etapa 5: Renderização 9:16 Vertical (Tela Cheia Nativa)

### Critérios de Enquadramento:
* **Dimensões Finais:** `720x1280` com `SAR 1:1` e `DAR 9:16`.
* **Sem Efeito Quadrado:** Evitar o uso de molduras centrais 1:1 (`crop=720:720`) que forçam reprodutores a exibir o vídeo como um quadrado. O vídeo deve ocupar 100% do campo visual vertical do smartphone.
* **Fórmula Universal de Crop 9:16 (Auto-Aspect):**
  Funciona com qualquer formato de origem (quadrado 1:1, horizontal 16:9 ou vertical nativo):
  ```bash
  crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':(iw-ow)/2:(ih-oh)/2,scale=720:1280,setsar=1
  ```

### Filtro FFmpeg Consolidado:
```bash
ffmpeg -y -i "final.mp4" -vf "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':(iw-ow)/2:(ih-oh)/2,scale=720:1280,setsar=1,subtitles='legendas.ass'" -c:v libx264 -preset fast -crf 20 -c:a copy "video_9x16.mp4"
```

---

## 7. Checklist de Validação Final Antes de Publicar

- [x] **Enquadramento 9:16:** Vídeo final em tela cheia vertical pura (720x1280 com SAR 1:1 e DAR 9:16), sem barras pretas ou efeito quadrado.
- [x] **Limpeza Visual:** Zero marcas d'água originais ou legendas em inglês antigas.
- [x] **Dicção Fonética:** Valores numéricos e monetários lidos com acentuação correta (*dólar* / *dólares*), sem entonações oxítonas errôneas.
- [x] **Qualidade da Voz:** Locução fluida gerada na velocidade nativa (1.25x), sem efeitos metálicos ou robóticos de aceleração pós-processada.
- [x] **Sincronia Perfeita de Legenda:** Legendas extraídas do `final.mp4`, piscando no milissegundo exato da voz e da cena.
