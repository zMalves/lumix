# LUMIX — AI Video Studio ⚡
> **Simplicity • Modern • Elegant • Futuristic**  
> Suíte completa de automação, inteligência artificial e renderização cinematográfica para produção de vídeos curtos verticais (YouTube Shorts, Instagram Reels, TikTok).

---

## 🏛️ 1. Arquitetura do Sistema

```text
lumix-studio/
│
├── dashboard/                     # Painel Visual Web (Glassmorphism LUMIX)
│   ├── server.js                  # API REST & Servidor de Mídia Local (Porta 3333)
│   └── public/
│       ├── index.html             # Interface Web do Studio LUMIX
│       ├── style.css              # Design System Cósmico (Glassmorphism & Mesh Glow)
│       └── app.js                 # Lógica Reativa do Frontend & Integrações
│
├── scripts/                       # Módulos Centrais do Pipeline de Produção
│   ├── auto_pilot_pipeline.js     # Orquestrador End-to-End 1-Click (10 Etapas)
│   ├── synthesize_chunked.py      # Síntese Neural de Voz em Blocos Seguros (GPU 1.25x)
│   ├── trim-silence.py            # Higienização Suave de Silêncios Calibrada
│   ├── generate-subtitles.py      # Gerador de Legendas ASS Dinâmicas Palavra por Palavra
│   └── remove-watermark.js        # Automação Playwright VMake Pro (Remoção Limpa)
│
├── docs/                          # Documentação Técnica e Critérios de Qualidade
│   └── PIPELINE_VALIDACAO_E_QUALIDADE.md # Protocolo de Auditoria Visual e Fonética
│
├── videos/                        # Diretório de Projetos e Masters de Saída
│   └── <Nome_Do_Projeto>/
│       ├── original.mp4           # Vídeo bruto capturado do YouTube
│       ├── sem_marca.mp4          # Vídeo limpo pelo VMake Pro (sem logos/legendas)
│       ├── transcricao_original.txt # Transcrição em inglês via Whisper
│       ├── roteiro_traduzido.txt  # Storytelling adaptado com normalização fonética
│       ├── narracao.mp3           # Locução neural sintetizada na GPU (1.25x)
│       ├── narracao_trimmed.mp3   # Áudio com silêncios mortos higienizados
│       ├── final.mp4              # Montagem de áudio sincronizado
│       ├── legendas.ass           # Legendas dinâmicas palavra por palavra
│       └── video_9x16.mp4         # Master final renderizado em 9:16 vertical tela cheia
│
└── package.json
```

---

## ⚡ 2. Esteira Automatizada (10 Etapas LUMIX)

1. **Trend Radar & Download:** Captura de Shorts virais com filtros de visualizações e retenção via `yt-dlp`.
2. **Remoção Inteligente VMake Pro:** Limpeza de logotipos, marcas d'água e legendas embutidas com inpainting temporal.
3. **Auditoria Visual de Controle:** Extração de frames nos instantes 5s, 15s, 20s e 30s para validação de transparência.
4. **Whisper ASR:** Transcrição acústica original de alta precisão.
5. **Storytelling PT-BR & Normalização Fonética:** Tradução viral com conversão automática de símbolos monetários e numéricos por extenso (`$1` ➔ `"um dólar"`, `$4` ➔ `"quatro dólares"`), garantindo pronúncia oxítona/paroxítona impecável.
6. **Voz Neural GPU (Chunked Safe):** Síntese em blocos seguros de ~800 caracteres para proteção de VRAM e velocidade acelerada nativa (1.25x) sem distorção metálica.
7. **Corte Suave de Silêncio:** Parâmetros de estúdio (`320ms` min silence, `150ms` keep silence, `100ms` padding).
8. **Auditoria de Fala Round-Trip:** Verificação Whisper contra gagueiras ou engolimento de sílabas.
9. **Cortes Rítmicos e Sincronia:** Ajuste milimétrico de pacing no vídeo cortado.
10. **Renderização 9:16 Tela Cheia:** Enquadramento universal `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'` na resolução `720x1280` (`SAR 1:1`, `DAR 9:16`) com queima de legendas ASS dinâmicas centralizadas.

---

## 🚀 3. Como Iniciar o Painel LUMIX

1. Certifique-se de que o backend do VoiceStudio está em execução na porta `3900`.
2. Inicie o servidor do Studio:
```bash
node dashboard/server.js
```
3. Acesse a interface web em:
👉 **`http://localhost:3333`**
