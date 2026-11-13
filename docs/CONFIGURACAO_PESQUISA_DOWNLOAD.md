# Guia de Configuração: Pesquisa e Download de Shorts Virais

Este documento orienta sobre a configuração, filtros e comandos para automatizar a **pesquisa de tendências** e o **download em alta qualidade** de YouTube Shorts para o pipeline de produção.

---

## 1. Arquivo de Configuração (`.env`)

O projeto utiliza o arquivo `.env` na raiz para definir as chaves de inteligência artificial e os padrões de pesquisa e download:

```env
# Chaves de Inteligência Artificial
OPENAI_API_KEY="sk-proj-..."
ANTHROPIC_API_KEY="sk-ant-usr-..."

# Configurações Padrão de Pesquisa de Shorts
SEARCH_DEFAULT_QUERY="movierecap"
SEARCH_MIN_VIEWS=1000000
SEARCH_LIMIT=3
SEARCH_MAX_DURATION=60

# Diretório de Saída dos Vídeos
DOWNLOAD_OUTPUT_DIR="./videos"

# Configurações do Voice Studio (Local)
VOICESTUDIO_URL="http://127.0.0.1:3900"
VOICE_DEFAULT_MODEL="tts-1"
VOICE_DEFAULT_PROFILE="Curiosidades - Padrão"
```

> **Nota:** As chaves `OPENAI_API_KEY` e `ANTHROPIC_API_KEY` já estão carregadas e prontas para uso por qualquer script de análise de roteiro ou geração de ganchos virais.

---

## 2. Como Funciona a Pesquisa e o Download

A ferramenta utiliza o binário do **yt-dlp** localizado em `tools/yt-dlp.exe` com filtros estritos:
- **Duração Máxima:** `<= 60 segundos` (formato ideal de Shorts/Reels/TikTok).
- **Mínimo de Visualizações:** Filtra apenas conteúdos validados que atingiram pelo menos 1.000.000 de views (ou o valor definido via `--views`).
- **Fontes de Pesquisa:**
  - Hashtags do YouTube: ex: `#curiosidades`, `#movierecap`, `#fatosdesconhecidos`.
  - Termos de busca normais: ex: `"fatos surpreendentes"`, `"resumo de filme"`.
  - Links diretos: ex: `https://www.youtube.com/shorts/XYZ`.

---

## 3. Comandos Práticos via Terminal (CLI)

O script principal unificado é o `search-and-download.js`.

### 3.1 Apenas Pesquisar (Sem Baixar)
Lista os vídeos virais encontrados que cumprem os requisitos com título, views, duração e canal:

```bash
# Pesquisa pelo termo padrão (ex: movierecap)
node search-and-download.js --search-only

# Pesquisar outro nicho ou hashtag
node search-and-download.js "curiosidades" --search-only
node search-and-download.js "#historia" --search-only
```

### 3.2 Pesquisar com Filtros Customizados
```bash
# Buscar vídeos de curiosidades com no mínimo 500.000 views
node search-and-download.js "fatos bizarros" --views 500000 --search-only

# Buscar até 5 vídeos com duração máxima de 45 segundos
node search-and-download.js "cortes podcasts" --duration 45 --limit 5 --search-only
```

### 3.3 Pesquisar e Baixar Automaticamente o Top 1
Executa a busca e baixa automaticamente o vídeo viral #1 encontrado para a pasta de produção:

```bash
node search-and-download.js "curiosidades"
```

### 3.4 Baixar Todos os Vídeos Encontrados
Baixa todos os vídeos retornados pela pesquisa (por exemplo, os 3 melhores):

```bash
node search-and-download.js "movierecap" --download-all
```

### 3.5 Baixar um Short Específico por Link Direto
```bash
node search-and-download.js --url "https://www.youtube.com/shorts/4fhBDBEtd-E"
```

---

## 4. Estrutura de Arquivos Criada por Download

Para cada vídeo baixado, o sistema cria automaticamente uma subpasta organizada dentro de `videos/`:

```text
videos/
└── They_threw_a_bomb_at_the_swarm/
    ├── original.mp4      <- Vídeo bruto baixado em alta qualidade
    ├── sem_marca.mp4     <- Vídeo limpo gerado pelo VMake (quando processado)
    └── info.json         <- Metadados completos do vídeo (título, views, url, etc.)
```

### Exemplo de `info.json` gerado:
```json
{
  "id": "4fhBDBEtd-E",
  "title": "They threw a bomb at the swarm",
  "url": "https://www.youtube.com/shorts/4fhBDBEtd-E",
  "channel": "MovieRecap Channel",
  "views": 2450000,
  "duration": 58,
  "uploadDate": "20261015",
  "downloadedAt": "2026-10-24T10:45:00.000Z",
  "files": {
    "original": "original.mp4",
    "cleaned": "sem_marca.mp4"
  }
}
```

---

## 5. Como Importar nos Scripts do Pipeline (JavaScript)

Você pode invocar as funções diretamente em qualquer script do Node.js:

```javascript
const { searchShorts, downloadShort, searchAndDownload } = require('./search-and-download.js');

// 1. Apenas buscar os top virais
const virais = searchShorts({ query: 'curiosidades', minViews: 1000000, limit: 3 });
console.log('Vídeos encontrados:', virais);

// 2. Baixar um vídeo por link
const resultado = downloadShort('https://www.youtube.com/shorts/4fhBDBEtd-E');
console.log('Vídeo salvo em:', resultado.videoPath);
console.log('Pasta do projeto:', resultado.folder);
```
