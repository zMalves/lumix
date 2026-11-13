FROM node:20-bookworm-slim

# Instala ffmpeg, python3, pip, curl e ferramentas essenciais para manipulação de vídeo
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    ca-certificates \
    fonts-liberation \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Instala yt-dlp versão linux
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Instala pacotes python necessários para corte de áudio / legendas / suporte a impersonate (TikTok e Shorts)
RUN python3 -m pip install --no-cache-dir --break-system-packages pydub requests faster-whisper "curl_cffi>=0.7.0"

WORKDIR /app

# Copia dependências primeiro para cache eficiente de camadas
COPY package*.json ./
RUN npm install --omit=dev

# Copia código da aplicação
COPY . .

# Garante permissões adequadas
RUN chmod -R 755 /app

ENV PORT=3333
ENV NODE_ENV=production
ENV PYTHON_BIN=python3
ENV FFMPEG_BIN=ffmpeg
ENV YTDLP_BIN=/usr/local/bin/yt-dlp

EXPOSE 3333

CMD ["node", "dashboard/server.js"]
