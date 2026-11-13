/**
 * youtube_manager.js
 * Gerenciador Multi-Canal do YouTube para o LUMIX Studio
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'youtube_channels.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || '355888238513-b4asm12ei1jk7le7filf5k644m52dii8.apps.googleusercontent.com';
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || ''; // somente via .env

function loadChannelsData() {
  if (!fs.existsSync(CHANNELS_FILE)) {
    return { activeChannelId: null, channels: [] };
  }
  try {
    const raw = fs.readFileSync(CHANNELS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.channels)) data.channels = [];
    return data;
  } catch (e) {
    console.error('[YouTube Manager] Erro ao ler channels.json:', e);
    return { activeChannelId: null, channels: [] };
  }
}

function saveChannelsData(data) {
  try {
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[YouTube Manager] Erro ao salvar channels.json:', e);
  }
}

function getRedirectUri(req) {
  if (process.env.YOUTUBE_REDIRECT_URI) return process.env.YOUTUBE_REDIRECT_URI;
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'lumix.malves.dev.br';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('lumix.malves.dev.br') ? 'https' : 'http');
  return `${proto}://${host}/api/auth/youtube/callback`;
}

function getLoginUrl(req) {
  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent select_account' // Força o seletor de conta para permitir conectar múltiplos canais!
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCodeForTokens(code, redirectUri) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  const data = await tokenRes.json();
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }
  return data;
}

async function fetchChannelProfile(accessToken) {
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await res.json();
  console.log('[YouTube channels.list response]', JSON.stringify(data));

  if (data.error) {
    console.error('[YouTube API Error]', data.error);
    const msg = data.error.message || JSON.stringify(data.error);
    if (msg.includes('has not been used in project') || msg.includes('disabled') || data.error.status === 'PERMISSION_DENIED') {
      throw new Error(`A API "YouTube Data API v3" precisa ser ATIVADA no seu Google Cloud Console: https://console.developers.google.com/apis/api/youtube.googleapis.com/overview?project=355888238513`);
    }
    throw new Error(`Erro na API do Google: ${msg}`);
  }

  if (!data.items || data.items.length === 0) {
    let emailInfo = '';
    try {
      const uRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const uData = await uRes.json();
      if (uData.email) emailInfo = ` (${uData.email})`;
    } catch (e) {}

    throw new Error(`Nenhum canal do YouTube encontrado nesta conta Google${emailInfo}. Se o canal for uma Conta de Marca (Brand Account) ou estiver em outro perfil, selecione o canal específico ao fazer login.`);
  }

  const item = data.items[0];
  const snippet = item.snippet || {};
  const stats = item.statistics || {};

  return {
    id: item.id,
    name: snippet.title || 'Canal Sem Nome',
    customUrl: snippet.customUrl || '',
    description: snippet.description || '',
    avatar: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
    banner: snippet.thumbnails?.high?.url || '',
    subscriberCount: stats.subscriberCount || '0',
    videoCount: stats.videoCount || '0',
    viewCount: stats.viewCount || '0'
  };
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Falha ao renovar token: ${data.error_description || data.error}`);
  }
  return data;
}

async function getValidAccessToken(channelId) {
  const store = loadChannelsData();
  const ch = store.channels.find(c => c.id === channelId);
  if (!ch) throw new Error('Canal não encontrado.');

  const now = Date.now();
  // Se o token expira em menos de 2 minutos e temos refresh_token, renova
  if (ch.tokens.expires_at && (ch.tokens.expires_at - now < 120000) && ch.tokens.refresh_token) {
    console.log(`[YouTube Manager] Renovando token para canal: ${ch.name}`);
    const newTokens = await refreshAccessToken(ch.tokens.refresh_token);
    ch.tokens.access_token = newTokens.access_token;
    if (newTokens.expires_in) {
      ch.tokens.expires_at = Date.now() + (newTokens.expires_in * 1000);
    }
    saveChannelsData(store);
  }
  return ch.tokens.access_token;
}

async function addOrUpdateChannel(tokens, profile) {
  const store = loadChannelsData();
  const existingIndex = store.channels.findIndex(c => c.id === profile.id);

  const expires_at = tokens.expires_in ? Date.now() + (tokens.expires_in * 1000) : null;
  const tokenPayload = {
    ...tokens,
    expires_at
  };

  if (existingIndex >= 0) {
    // Mantém alias existente e refresh_token se a Google não reenviar
    const old = store.channels[existingIndex];
    if (!tokenPayload.refresh_token && old.tokens?.refresh_token) {
      tokenPayload.refresh_token = old.tokens.refresh_token;
    }
    store.channels[existingIndex] = {
      ...old,
      ...profile,
      alias: old.alias || profile.name,
      tokens: tokenPayload,
      updatedAt: new Date().toISOString()
    };
  } else {
    store.channels.push({
      ...profile,
      alias: profile.name,
      tokens: tokenPayload,
      connectedAt: new Date().toISOString()
    });
  }

  // Define como canal ativo
  store.activeChannelId = profile.id;
  saveChannelsData(store);
  return store.channels.find(c => c.id === profile.id);
}

function setActiveChannel(channelId) {
  const store = loadChannelsData();
  const exists = store.channels.some(c => c.id === channelId);
  if (!exists) throw new Error('Canal não encontrado');
  store.activeChannelId = channelId;
  saveChannelsData(store);
  return store;
}

function setChannelAlias(channelId, alias) {
  const store = loadChannelsData();
  const ch = store.channels.find(c => c.id === channelId);
  if (!ch) throw new Error('Canal não encontrado');
  ch.alias = (alias || '').trim() || ch.name;
  saveChannelsData(store);
  return ch;
}

function removeChannel(channelId) {
  const store = loadChannelsData();
  store.channels = store.channels.filter(c => c.id !== channelId);
  if (store.activeChannelId === channelId) {
    store.activeChannelId = store.channels.length > 0 ? store.channels[0].id : null;
  }
  saveChannelsData(store);
  return store;
}

async function refreshChannelDetails(channelId) {
  const token = await getValidAccessToken(channelId);
  const profile = await fetchChannelProfile(token);
  const store = loadChannelsData();
  const ch = store.channels.find(c => c.id === channelId);
  if (ch) {
    ch.name = profile.name;
    ch.customUrl = profile.customUrl;
    ch.description = profile.description;
    ch.avatar = profile.avatar;
    ch.banner = profile.banner;
    ch.subscriberCount = profile.subscriberCount;
    ch.videoCount = profile.videoCount;
    ch.viewCount = profile.viewCount;
    ch.lastRefreshedAt = new Date().toISOString();
    saveChannelsData(store);
    return ch;
  }
  throw new Error('Canal não encontrado para atualizar');
}

function getPublicChannelsList() {
  const store = loadChannelsData();
  const active = store.channels.find(c => c.id === store.activeChannelId) || (store.channels.length > 0 ? store.channels[0] : null);
  
  return {
    activeChannelId: active ? active.id : null,
    activeChannel: active ? {
      id: active.id,
      name: active.name,
      alias: active.alias,
      customUrl: active.customUrl,
      avatar: active.avatar,
      subscribers: active.subscriberCount,
      videoCount: active.videoCount,
      viewCount: active.viewCount,
      connectedAt: active.connectedAt
    } : null,
    channels: store.channels.map(c => ({
      id: c.id,
      name: c.name,
      alias: c.alias,
      customUrl: c.customUrl,
      avatar: c.avatar,
      subscribers: c.subscriberCount,
      videoCount: c.videoCount,
      viewCount: c.viewCount,
      connectedAt: c.connectedAt,
      isActive: c.id === (active ? active.id : null)
    }))
  };
}

async function uploadShortVideo(channelId, videoPath, metadata = {}) {
  const token = await getValidAccessToken(channelId);
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Arquivo de vídeo não encontrado: ${videoPath}`);
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;

  let title = (metadata.title || 'Short do LUMIX Studio').trim();
  if (!title.toLowerCase().includes('#short')) {
    title = `${title} #shorts`;
  }
  if (title.length > 100) title = title.slice(0, 97) + '...';

  let description = (metadata.description || '').trim();
  if (!description.toLowerCase().includes('#shorts')) {
    description = `${description}\n\n#shorts`;
  }

  const tags = Array.isArray(metadata.tags)
    ? metadata.tags
    : (typeof metadata.tags === 'string'
        ? metadata.tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
        : ['shorts', 'viral']);

  const publishAt = metadata.publishAt ? new Date(metadata.publishAt).toISOString() : null;
  const isScheduled = !!publishAt;
  const privacyStatus = isScheduled ? 'private' : (metadata.privacyStatus || 'public');

  const statusPayload = {
    privacyStatus,
    selfDeclaredMadeForKids: false
  };

  if (isScheduled) {
    statusPayload.publishAt = publishAt;
  }

  const lang = metadata.lang || (metadata.defaultAudioLanguage) || (metadata.title && /[\u00BF\u00A1\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1]/i.test(metadata.title) ? 'es' : 'pt');
  const defaultAudioLanguage = lang === 'es' ? 'es' : 'pt';
  const defaultLanguage = lang === 'es' ? 'es' : 'pt-BR';

  const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(fileSize)
    },
    body: JSON.stringify({
      snippet: {
        title,
        description,
        tags,
        categoryId: '22',
        defaultLanguage,
        defaultAudioLanguage
      },
      status: statusPayload
    })
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Falha ao iniciar upload no YouTube: ${errText}`);
  }

  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) {
    throw new Error('Google não retornou a URL de upload.');
  }

  const fileBuffer = fs.readFileSync(videoPath);
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(fileSize)
    },
    body: fileBuffer
  });

  const uploadResult = await uploadRes.json();
  if (uploadResult.error) {
    throw new Error(`Erro durante o upload no YouTube: ${uploadResult.error.message || JSON.stringify(uploadResult.error)}`);
  }

  const videoId = uploadResult.id;
  const shortUrl = `https://www.youtube.com/shorts/${videoId}`;

  return {
    success: true,
    videoId,
    shortUrl,
    channelId,
    title,
    uploadedAt: new Date().toISOString()
  };
}

module.exports = {
  loadChannelsData,
  saveChannelsData,
  getLoginUrl,
  getRedirectUri,
  exchangeCodeForTokens,
  fetchChannelProfile,
  addOrUpdateChannel,
  setActiveChannel,
  setChannelAlias,
  removeChannel,
  refreshChannelDetails,
  getPublicChannelsList,
  getValidAccessToken,
  uploadShortVideo
};

