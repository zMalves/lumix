# Guia Completo de Integração: Voice Studio

Este documento detalha o funcionamento, arquitetura e instruções práticas para utilizar o **Voice Studio** (`C:\Users\Maychel\OneDrive - Seconds\Documentos\Sistemas\git\voice-studio`) em conjunto com as automações do Playwright e Node.js para geração de áudio (TTS), clonagem de voz e transcrição (STT).

---

## 1. O Voice Studio precisa estar aberto ou roda em Background?

> **RESPOSTA DIRETA:** **NÃO precisa da janela aberta!** O Voice Studio pode rodar 100% em **segundo plano (background / headless)**.

### Como funciona a arquitetura:
1. **Interface Gráfica (Electron):** É apenas a casca visual para uso manual no desktop. Quando aberta, ela inicia o backend localmente.
2. **Servidor Backend (Python + FastAPI / Uvicorn):** É o motor real de IA que carrega os modelos (OmniVoice, Kokoro, F5-TTS, CosyVoice, Whisper, etc.) na memória/GPU e expõe uma API REST, WebSockets e MCP na porta **`3900`**.
3. **Modo Headless / Background:** Você pode iniciar apenas o servidor backend através do terminal, PowerShell, agendador de tarefas ou script de inicialização do Windows sem abrir nenhuma janela gráfica.

---

## 2. Inicialização do Voice Studio

### Opção A: Rodar em Background (Recomendado para Automação)
No terminal PowerShell, entre na pasta do projeto e inicie o backend:

```powershell
# 1. Navegue até a pasta do Voice Studio
cd "C:\Users\Maychel\OneDrive - Seconds\Documentos\Sistemas\git\voice-studio"

# 2. Iniciar o backend diretamente com uv (FastAPI na porta 3900)
uv run uvicorn main:app --app-dir backend --host 127.0.0.1 --port 3900
```
*Ou usando o script de dev configurado pelo repositório:*
```powershell
bun run dev:api
```

#### Para rodar oculto / em segundo plano no Windows (sem travar o terminal):
```powershell
Start-Process powershell -WindowStyle Hidden -ArgumentList "-Command cd 'C:\Users\Maychel\OneDrive - Seconds\Documentos\Sistemas\git\voice-studio'; uv run uvicorn main:app --app-dir backend --host 127.0.0.1 --port 3900"
```

### Opção B: Interface Gráfica (Desktop)
Caso queira clonar vozes manualmente, testar áudios na interface ou configurar novos modelos:
```powershell
cd "C:\Users\Maychel\OneDrive - Seconds\Documentos\Sistemas\git\voice-studio"
bun run dev
```

---

## 3. Endpoints Principais da API (Porta 3900)

O Voice Studio possui compatibilidade nativa com a API de Áudio da OpenAI (`/v1/audio/*`), o que facilita muito a integração com qualquer biblioteca ou chamada HTTP comum:

| Funcionalidade | Método | Endpoint | Descrição |
|---|---|---|---|
| **Verificar Status** | `GET` | `http://127.0.0.1:3900/.well-known/voicestudio-speech` | Checagem de disponibilidade do serviço |
| **Documentação Interativa** | `GET` | `http://127.0.0.1:3900/docs` | Painel interativo Scalar com todas as rotas |
| **Listar Vozes** | `GET` | `http://127.0.0.1:3900/v1/audio/voices` | Retorna as vozes e clones disponíveis |
| **Listar Modelos** | `GET` | `http://127.0.0.1:3900/v1/models` | Retorna os modelos de síntese/ASR instalados |
| **Gerar Áudio (TTS)** | `POST` | `http://127.0.0.1:3900/v1/audio/speech` | Converte texto em arquivo de áudio (MP3/WAV) |
| **Transcrever (STT)** | `POST` | `http://127.0.0.1:3900/v1/audio/transcriptions` | Converte arquivo de áudio/vídeo em texto/legendas |
| **Traduzir Áudio** | `POST` | `http://127.0.0.1:3900/v1/audio/translations` | Transcreve e traduz áudio diretamente |
| **Streaming Transcrição** | `WS` | `ws://127.0.0.1:3900/v1/audio/transcriptions/stream` | Transcrição em tempo real via WebSocket |

---

## 4. Configurações para Criar Áudio (TTS)

Ao fazer uma requisição para `POST http://127.0.0.1:3900/v1/audio/speech`, você pode enviar os seguintes parâmetros no corpo (JSON):

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| **`input`** *(obrigatório)* | `string` | - | O texto a ser narrado (máximo de 4.096 caracteres). |
| **`voice`** | `string` | `'default'` | Voz a ser usada. Pode ser o **nome** ou **ID** da voz (veja vozes abaixo). |
| **`model`** | `string` | `'tts-1'` | Motor de síntese. Use `'tts-1'` ou `'tts-1-hd'` para o motor ativo, ou `'omnivoice'`. |
| **`response_format`** | `string` | `'mp3'` | Formato de saída: `'mp3'`, `'wav'`, `'opus'`, `'aac'`, `'flac'` ou `'pcm'`. |
| **`speed`** | `number` | `1.0` | Velocidade da fala (`0.25` a `4.0`). Para Shorts virais, use `1.05` a `1.15`. |
| **`language`** | `string` | `null` | Código do idioma (ex: `'pt'`, `'en'`). |
| **`instruct`** / **`instructions`** | `string` | `null` | Instrução de estilo/tom da voz (ex: `"narrador enérgico"`, `"tom misterioso"`). |
| **`num_step`** | `number` | `16` | Passos de difusão (`1` a `128`). Use `32` para qualidade máxima de estúdio. |
| **`guidance_scale`** | `number` | `2.0` | Aderência ao estilo da voz de referência. |
| **`denoise`** | `boolean` | `true` | Filtro para remoção de ruído no áudio gerado. |
| **`seed`** | `number` | `null` | Semente para reproduzir exatamente a mesma entonação sempre. |

---

### Vozes Disponíveis no seu Sistema

Consultando o seu servidor local, encontramos as seguintes vozes prontas para uso:

1. **Sua Voz Clonada Personalizada:**
   - Nome: `"Curiosidades - Padrão"` (ou ID: `"7182adf6"`)
   - Ideal para os Shorts de curiosidades/recaps!
2. **Voz de Demonstração:**
   - Nome: `"VoiceStudio Demo Voice"` (ou ID: `"demo0001"`)
3. **Aliases Padrão da OpenAI:**
   - `"alloy"`, `"ash"`, `"ballad"`, `"cedar"`, `"coral"`, `"echo"`, `"fable"`, `"marin"`, `"nova"`, `"onyx"`, `"sage"`, `"shimmer"`, `"verse"`.

---

## 5. Exemplos Práticos de Uso em Node.js / JavaScript

### 5.1 Gerar Áudio com Voz Clonada e Alta Qualidade
```javascript
const { generateSpeech } = require('../scripts/voice-studio.js');

// Gerar narração usando a sua voz "Curiosidades - Padrão"
await generateSpeech({
  text: 'Você sabia que este é um fato completamente impressionante?',
  voice: 'Curiosidades - Padrão', // ou '7182adf6'
  model: 'tts-1',                 // motor ativo de alta qualidade
  responseFormat: 'mp3',
  outputPath: 'videos/minha_narracao.mp3'
});
```

### 4.2 Transcrever Áudio ou Vídeo (Speech-to-Text)
```javascript
import fs from 'node:fs';

async function transcreverAudio(caminhoArquivo) {
  const url = 'http://127.0.0.1:3900/v1/audio/transcriptions';
  
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(caminhoArquivo);
  const blob = new Blob([fileBuffer], { type: 'audio/wav' });
  
  formData.append('file', blob, 'audio.wav');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'json'); // ou 'verbose_json', 'srt', 'vtt'

  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Erro na transcrição: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  console.log('Texto transcrito:', data.text);
  return data.text;
}
```

---

## 5. Como usar com o Pipeline de Vídeos do Playwright

Como você já tem scripts de download e remoção de marca d'água no Playwright (ex: `remove-watermark.js` e `wait-and-download-top.js`):
1. **Transcrever o vídeo original:** Extraia o áudio com FFmpeg ou passe o vídeo diretamente para o endpoint `/v1/audio/transcriptions` do Voice Studio para obter o roteiro/fala original.
2. **Alterar ou Traduzir a narração:** Modifique o texto transcrito.
3. **Gerar nova voz clonada:** Chame `/v1/audio/speech` usando o perfil de voz desejado.
4. **Juntar áudio e vídeo:** Substitua a trilha de áudio original do vídeo sem marca d'água pelo novo áudio gerado.
