const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

// Monta o arquivo vmake_auth.json com base nos cookies extraídos pelo usuário
const expiry = Math.floor(new Date('2027-01-16T15:38:19.032Z').getTime() / 1000);

const tokenValue = 'l3yZoCIt84BJVzhmtwJEYOqpIDLX4u5SgFEmqynEBo8nn4tzAhcZDbSUjAmO5Q5qIFayR5tmI9PxlSx6qk1jXHKWn8hHg0QhGZkWU6zNdPGz-3NSf6YJkmL80AxLd8-rO-4STXfMnCUuyDvNWqu6QkKFSYVAhHqsEIanMTytrt877D2NZBooD4xw3i5MrW1Y';
const uidValue = '3027613041';
const clientIdValue = '1200000026';

const cookies = [
  // Cookies Starii (Autenticação Meitu/Starii usada pelo VMake)
  {
    name: '__mt_uid__',
    value: uidValue,
    domain: '.starii.com',
    path: '/',
    expires: expiry,
    httpOnly: false,
    secure: true,
    sameSite: 'None'
  },
  {
    name: '__mt_web_access_token__',
    value: tokenValue,
    domain: '.starii.com',
    path: '/',
    expires: expiry,
    httpOnly: true,
    secure: true,
    sameSite: 'None'
  },
  {
    name: '__mt_web_client_id__',
    value: clientIdValue,
    domain: '.starii.com',
    path: '/',
    expires: expiry,
    httpOnly: true,
    secure: true,
    sameSite: 'None'
  },

  // Injetados também no domínio .vmake.ai para garantir leitura cruzada
  {
    name: '__mt_uid__',
    value: uidValue,
    domain: '.vmake.ai',
    path: '/',
    expires: expiry,
    httpOnly: false,
    secure: true,
    sameSite: 'None'
  },
  {
    name: '__mt_web_access_token__',
    value: tokenValue,
    domain: '.vmake.ai',
    path: '/',
    expires: expiry,
    httpOnly: true,
    secure: true,
    sameSite: 'None'
  },
  {
    name: '__mt_web_client_id__',
    value: clientIdValue,
    domain: '.vmake.ai',
    path: '/',
    expires: expiry,
    httpOnly: true,
    secure: true,
    sameSite: 'None'
  },
  {
    name: 'VMAKE_ANONYMOUS_GID',
    value: '1a14fa8ad39cf2-0d33ba00e0a8f08-26071c51-1327104-1a14fa8ad3a1fe5',
    domain: '.vmake.ai',
    path: '/',
    expires: expiry,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax'
  },
  {
    name: 'bing_anonymous_id',
    value: 'f0d9f8c0-00fd-40da-9b41-1a3546f3bbad',
    domain: '.vmake.ai',
    path: '/',
    expires: expiry,
    httpOnly: false,
    secure: true,
    sameSite: 'Lax'
  },
  {
    name: '_ga',
    value: 'GA1.1.830563830.1792337819',
    domain: '.vmake.ai',
    path: '/',
    expires: expiry,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax'
  }
];

const storageState = {
  cookies: cookies,
  origins: [
    {
      origin: 'https://vmake.ai',
      localStorage: [
        { name: '__mt_web_access_token__', value: tokenValue },
        { name: '__mt_uid__', value: uidValue },
        { name: '__mt_web_client_id__', value: clientIdValue },
        { name: 'token', value: tokenValue },
        { name: 'access_token', value: tokenValue },
        { name: 'uid', value: uidValue }
      ]
    }
  ]
};

const authPath = path.join(__dirname, 'vmake_auth.json');
fs.writeFileSync(authPath, JSON.stringify(storageState, null, 2), 'utf-8');
console.log(`[Playwright] Arquivo de autenticação salvo com sucesso em: ${authPath}`);

async function testLogin() {
  console.log('[Playwright] Testando acesso ao VMake utilizando os cookies salvos...');
  
  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    storageState: authPath,
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // Garante que o localStorage também receba as chaves de token no carregamento da página
  await page.addInitScript(({ token, uid }) => {
    try {
      localStorage.setItem('__mt_web_access_token__', token);
      localStorage.setItem('__mt_uid__', uid);
      localStorage.setItem('token', token);
      localStorage.setItem('access_token', token);
      localStorage.setItem('uid', uid);
    } catch (e) {}
  }, { token: tokenValue, uid: uidValue });

  console.log('[Playwright] Acessando https://vmake.ai/pt/workspace...');
  await page.goto('https://vmake.ai/pt/workspace', { waitUntil: 'networkidle', timeout: 60000 });

  await page.waitForTimeout(4000);

  const screenshotPath = path.join(__dirname, 'vmake_with_cookies.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[Playwright] Captura de tela salva em: ${screenshotPath}`);

  // Analisa os dados do cabeçalho e informações da conta
  const accountInfo = await page.evaluate(() => {
    const text = document.body ? document.body.innerText : '';
    const hasLoginButton = Array.from(document.querySelectorAll('button, a')).some(b => {
      const t = (b.innerText || '').trim().toLowerCase();
      return t === 'entrar' || t === 'sign in';
    });

    const userProfileText = Array.from(document.querySelectorAll('*'))
      .map(el => el.innerText ? el.innerText.trim() : '')
      .filter(t => t && (t.includes('crédito') || t.includes('pts') || t.includes('Credit') || t.includes('Plano') || t.includes('Pro') || t.includes('Free') || t.includes('3027613041')) && t.length < 50);

    return {
      title: document.title,
      url: window.location.href,
      hasLoginButton,
      userProfileText: Array.from(new Set(userProfileText)).slice(0, 10),
      rawSnippet: text.slice(0, 300)
    };
  });

  console.log('[Playwright] Informações detectadas na sessão:', accountInfo);
  await browser.close();
}

testLogin().catch(err => {
  console.error('[Playwright] Erro no teste:', err);
});
