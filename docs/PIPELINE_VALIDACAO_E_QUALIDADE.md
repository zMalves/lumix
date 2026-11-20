# Pipeline de Produção, Validação e Qualidade de Vídeos (LUMIX Studio)

Este documento descreve o fluxo de produção automatizada de vídeos curtos (YouTube Shorts, Reels, TikTok) **como ele está implementado hoje** e as validações que de fato rodam.

Arquivos principais: `scripts/auto_pilot_pipeline.js` (piloto automático), `dashboard/queue_manager.js` (fila), `remove-watermark.js` + `vmake_pool.js` + `scripts/vmake_api_client.js` (VMake), `dashboard/server.js` (Estúdio Manual e etapas avulsas).

---

## 1. Visão Geral

```
Fila de produção (até 4 vídeos em paralelo) → auto_pilot_pipeline.js
  1. Download (yt-dlp)                         → original.mp4
  2. VMake API (remoção de legendas/marcas)    → sem_marca.mp4   [validado com ffprobe]
  3. Frames de controle (5s, 15s, 20s, 30s)    → clean_val_*.jpg (auditoria manual)
  4. Transcrição em inglês (OpenAI Whisper API)→ transcricao_original.txt
  5. Cortes rítmicos (remove 0,5s a cada 3s)   → video_cortado.mp4
  6. Para cada idioma (pt, es, en):
       tradução/adaptação (gpt-4o-mini)        → roteiro_traduzido[_xx].txt
       normalização fonética
       voz (somente WStudios V4)               → narracao[_xx].mp3
       corte de silêncios                       → narracao_trimmed[_xx].mp3
       mesclagem voz + vídeo + trilha           → final[_xx].mp4
       legendas palavra por palavra             → legendas[_xx].ass
       render 9:16 1080x1920                    → video_9x16[_xx].mp4
       copys de postagem
```

Cada etapa reaproveita o arquivo já existente, e o pipeline pode ser retomado com `--from-step <etapa>` (`transcribe`, `translate`, `tts`, `trim`, `cut`, `merge`, `render_9x16`, `post_copy`).

---

## 2. Etapa VMake (remoção de legendas e marcas d'água)

### Função usada
Definida por `VMAKE_TASK` no `.env` (escolhida no painel de Configurações):

| Código | O que remove |
|---|---|
| `SKM0002` (padrão) | Só legendas embutidas. **Não remove logo/marca d'água do canal.** |
| `SKM0005` | Smart Pro: logos e textos (remoção completa) |
| `SKM0007` | Marca d'água específica |
| `SKM0003` | Smart rápido |

Se o vídeo de origem tem logo do canal (ex.: `@BrainBlud`), é preciso `SKM0005` ou `SKM0007`.

### Fluxo (`VMakeApiClient.cleanVideo`)
1. `fetchConfig`: catálogo de funções.
2. Upload do `original.mp4` para o OSS (token STS temporário, multipart de 2MB, 3 tentativas).
3. `consumeQuota`: debita o crédito.
4. `submitTask`: envia a tarefa assíncrona. **O Task ID é salvo em `vmake_task.json` na pasta do projeto.**
5. `pollTask`: consulta o status até concluir.
6. Download do resultado para `sem_marca.mp4.download`, validação e só então renomeia para `sem_marca.mp4`.

### Proteções
- **Retomada sem gastar crédito:** se o processo cair depois do envio (cancelamento, reinício, queda de rede), a próxima execução encontra `vmake_task.json` e volta a consultar a mesma tarefa, sem novo upload e sem novo crédito. A retomada só vale para o mesmo `original.mp4`, a mesma função SKM e tarefas enviadas há menos de 6h. Para forçar um envio novo, apague `vmake_task.json`.
- **Tempo máximo:** o polling desiste após `VMAKE_POLL_TIMEOUT_MIN` minutos (padrão 60) ou 30 falhas de rede seguidas. Falha reportada pelo VMake (status 2/20) encerra na hora e descarta a retomada.
- **Download validado:** conexão interrompida ou bytes a menos que o `Content-Length` fazem o download falhar. Depois, o `ffprobe` confere se o arquivo é um vídeo legível e se a duração bate com o original (tolerância de 10% ou 2s). Um arquivo inválido nunca vira `sem_marca.mp4`.
- **`sem_marca.mp4` antigo inválido:** ao rodar desde o início, o piloto automático revalida o arquivo existente; se estiver corrompido, ele é renomeado para `sem_marca_invalido.mp4` e a limpeza é refeita.
- **Máximo de 4 tarefas simultâneas no VMake, somando todos os processos:** as vagas são arquivos de trava em `VMAKE_SLOTS_DIR` (padrão: pasta temporária do sistema, `lumix_vmake_slots`). Vaga de processo morto é liberada automaticamente.

### Validação visual (manual)
O pipeline extrai frames em 5s, 15s, 20s e 30s (`clean_val_*.jpg`), mas **não os analisa**. Conferir:
- rodapé/topo sem logos ou `@canal`;
- centro sem palavras fantasmas ou borrões grosseiros.

---

## 3. Transcrição e Roteiro

- **Transcrição:** OpenAI Whisper API sobre o `original.mp4`, forçando inglês.
- **Adaptação:** `gpt-4o-mini` (temperatura 0.3) com os prompts de `scripts/lang_config.js`.
- **Falha na tradução interrompe o pipeline** para PT e ES (sem chave OpenAI, erro HTTP ou resposta vazia). Antes, o texto em inglês era narrado com voz em português sem aviso. Só a versão EN aceita cair para a transcrição original.

### Normalização fonética pré-TTS
Símbolos monetários e horas são escritos por extenso antes da síntese, para a voz não ler com fonética errada:
- `$1` ➔ `um dólar`, `$4` ➔ `quatro dólares`, `$16` ➔ `dezesseis dólares`
- `11h` ➔ `11 horas`

Limitação: a tabela de números é fixa; valores fora dela viram `N dólares`, e decimais como `$1.5` não são tratados.

---

## 4. Voz e Silêncios

### Síntese (`scripts/synthesize_minimax.js`, nome mantido por compatibilidade)
- **Primário:** WStudios API, motor Ultra V4 (`eleven_v4`), voz por idioma em `WSTUDIOS_VOICE_ID_*`.
- **Sem fallback de outra voz:** a voz `onyx` da OpenAI foi removida porque não é a voz do canal e soava robótica. Se o WStudios falhar, a etapa termina com erro e o vídeo para na fila, para ser recolocado a partir da narração.
- **Novas tentativas:** erros temporários (502, rede, 429) durante a espera não derrubam a tarefa; a consulta continua. Se a geração falhar no WStudios, uma nova tarefa é criada (até 3 por trecho, com 30s e 60s de intervalo). Se a tarefa continuar pendente após `WSTUDIOS_MAX_WAIT_MIN` minutos (padrão 20), a etapa termina com erro sem criar outra tarefa, para não cobrar duas vezes.
- **Velocidade nativa do modelo:** 1.3 no piloto automático, 1.05 no Estúdio Manual. A aceleração é feita no próprio TTS, não com `atempo`, para não deixar a voz metálica.
- Textos acima de 45.000 caracteres são divididos em blocos por frase.

### Corte de silêncio (`scripts/trim-silence.py`)
| Parâmetro | Valor |
|---|---|
| `min_silence_len` | 350ms |
| `keep_silence` (respiro entre frases) | 200ms, já incluindo as margens: o silêncio extra é `max(0, keep_silence − 2 × padding)` |
| `padding` (margem antes/depois da fala) | 150ms, para não cortar sílabas finais |
| distância para unir trechos | 200ms |
| limiar de silêncio | `max(dBFS − 25, −50)`, permissivo para manter caudas fracas de fim de frase |

Cada trecho recebe fade de 10ms nas bordas para evitar cliques.

---

## 5. Cortes Rítmicos e Mesclagem

- **Cortes:** o piloto automático sempre remove 0,5s a cada 3s de vídeo (cerca de 14% da duração), sem considerar a duração da narração.
- **Sincronia:** se a narração passar de 110% da duração do vídeo cortado, ela é acelerada com `atempo` para caber.
- **Áudio:** voz normalizada em −14 LUFS (`loudnorm I=-14:TP=-1.5:LRA=7`); trilha `assets/music/Ogryzek.mp3` em loop a 15% (13% por padrão no Estúdio Manual, ajustável no mixer).

---

## 6. Legendas Dinâmicas (`scripts/generate-subtitles.py`)

- **Regra de sincronia:** o Whisper (faster-whisper, modelo `base`, CPU) transcreve o **vídeo final já montado** (`final.mp4`), e não os áudios intermediários. Assim os tempos de cada palavra batem com a imagem e a voz.
- **Estilo:** Arial Black 75px, branco, contorno preto de 7px, sombra de 3px, centralizado (alinhamento 5), em MAIÚSCULAS, uma palavra por vez, em resolução 1080x1920.

---

## 7. Render 9:16 (1080x1920)

Existem dois enquadramentos, conforme o caminho usado:

| Caminho | Enquadramento |
|---|---|
| Piloto automático e "Gerar 9:16" (`/api/generate-square-subtitles`) | Recorte quadrado central (zoom 1.05x) em 1080x1080 sobre fundo desfocado, com anti-duplicidade: espelhamento horizontal (desligável com `ANTI_HASH_HFLIP=false`), contraste/saturação +2–4% e velocidade 1.03x |
| Estúdio Manual (`/api/manual/render-4x5-to-9x16`, `/api/manual/run-all`) | Recorte 4:5 em 1080x1350 sobre fundo desfocado, sem anti-duplicidade |

Codificação: `libx264` CRF 19–20, AAC 192k, `+faststart`. Frames de conferência em 5s e 20s (`final_val_*.jpg`).

---

## 8. Checklist Manual Antes de Publicar

Nenhum destes itens é verificado automaticamente:

- [ ] **Limpeza visual:** sem marcas d'água ou legendas originais (conferir `clean_val_*.jpg`; lembrar que `SKM0002` não remove logos).
- [ ] **Idioma da voz:** narração no idioma certo e sem trechos em inglês.
- [ ] **Dicção:** valores monetários e números lidos corretamente.
- [ ] **Voz:** fluida, sem efeito metálico (sinal de `atempo` alto na mesclagem).
- [ ] **Legendas:** sincronizadas e sem palavras trocadas pelo Whisper `base`.
- [ ] **Enquadramento:** 1080x1920 sem barras pretas (conferir `final_val_*.jpg`).
