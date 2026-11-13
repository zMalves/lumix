const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

// 1. DADOS DE LOCALSTORAGE COPIADOS DO CHROME
const rawLocalStorage = {
  "_uetvid_exp": "Tue, 16 Nov 2027 00:13:58 GMT",
  "meitu.account.client.login.history": "WBmTODvZbMa2wGnBEZV+olV7hFGLfPNsm9a81KwJxdZqYKmM7njNNyQZYkcLZ8o/Q5yFqMVL9PJ3PrETsjx5vs22estepF5U7hY/LZNgg5BhoLeEUkuC+KWBHul/UvO/JCp5J8lXBDSHBxFjqKCJTYKWlXissFyD+2UR6lGaG8p/r7+inGbgWVg535iKb/D5g5PWJv26U+QL4XBVqQ+4JIPpcawNJ7pR2nnlH/h2lTyRBIwaZH/TTp4WTj+2I0FLDGTl2k6oZEm9owAlZoxBFQ==",
  "_sm": "\"1a160d6af35684-0490bf8630f22d-26071c51-1327104-1a160d6af362563\"",
  "meitu.account.1200000026": "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",
  "_gcl_ls": "{\"schema\":\"gcl\",\"version\":1,\"gcl_ctr\":{\"value\":{\"value\":0,\"timeouts\":0,\"errors\":0,\"eopCount\":0,\"creationTimeMs\":1792626049762},\"expires\":1800402049762},\"gclid\":{\"value\":{\"value\":\"CjwKCAjwxeHWBhBPEiwAiqtQ-UBXszAz-RsGYwjIwGyIwDaPDeh1sZCbpsqV_iN2C9jtx7eu-WIfUxoC7YwQAvD_BwE\",\"creationTimeMs\":1792626050041,\"linkDecorationSources\":2},\"expires\":1800402050041},\"gsid_dc\":{\"value\":{\"joinId\":\"N6tkgBddP_UDgzV3x9z0yFlLduP9NBFFA\",\"lastJoinedTimeMs\":1792628037785},\"expires\":1792628337785},\"gcl_aw\":[{\"value\":{\"value\":\"CjwKCAjwxeHWBhBPEiwAiqtQ-UBXszAz-RsGYwjIwGyIwDaPDeh1sZCbpsqV_iN2C9jtx7eu-WIfUxoC7YwQAvD_BwE\",\"creationTimeMs\":1792626050158,\"linkDecorationSources\":32},\"expires\":1800402050158}]}",
  "abTest_23717E0F75083076": "[{\"abCode\":21801,\"et\":3,\"status\":5,\"v\":20251230,\"count\":0},{\"abCode\":21829,\"et\":1,\"status\":5,\"v\":20260727,\"count\":0},{\"abCode\":21831,\"et\":1,\"status\":5,\"v\":20260811,\"count\":0},{\"abCode\":21861,\"et\":1,\"status\":1,\"v\":20260929,\"count\":0},{\"abCode\":21864,\"et\":3,\"status\":1,\"v\":20261016,\"count\":0}]",
  "vmake-operation-popup-state": "{\"data\":{\"version\":1792552766,\"configId\":52,\"entryCount\":0,\"shownAt\":1792626049502},\"expiry\":0}",
  "_uetsid": "f0202040cda811f1b6e3e1f71471d3b6",
  "gg_client_id": "\"1770029020.1792626050\"",
  "vmake-auth-store": "{\"data\":{\"state\":{\"accessToken\":\"_v2YjQ3NWI1NzEjMTgwMDQwMjA4MyM4Mzg5MTIwIzQ0IzQ0ODFjMjllMjA0NmI2NGQ2MDg5YWI5MTgyNTYxYTZiM2MjU0lOR0FQT1JFI0FQX1NFIzZhZDk0ZGEz\",\"signedIn\":true,\"userInfo\":{\"id\":3027613041,\"screenName\":\"GabriellyVieira\",\"email\":\"gabriellyvieirapereira@gmail.com\",\"avatar\":\"https://avatar.stariidata.com/avatar/6abbb343895bd1514.jpg\",\"gender\":\"\",\"isVip\":true,\"membership\":{\"isVip\":true,\"validTime\":1790794869609,\"invalidTime\":1793473269609,\"serverTime\":1792628040541,\"status\":1,\"desc\":\"membership validity period:2026/11/01\",\"membershipId\":1028,\"displayName\":\"Vmake Pro\"},\"agentBeta\":false,\"balanceDetail\":{\"totalAmount\":4520,\"meidouAvailableAmount\":0,\"meiyeAvailableAmount\":4520,\"meiyeForeverAmount\":0,\"meiyeFollowAmount\":0,\"meiyeDayNumList\":[{\"day\":1,\"num\":20},{\"day\":10,\"num\":4500}],\"meiyeDayNumWithoutFollowList\":[{\"day\":1,\"num\":20},{\"day\":10,\"num\":4500}]},\"contractDetail\":{\"platform\":4,\"contractId\":\"7511137982553286624\",\"contractIdStr\":\"7511137982553286624\",\"commodityId\":\"1028\",\"planAmount\":6990,\"validTime\":1790794869392,\"invalidTime\":1793473269392,\"moneyUnit\":\"BRL\",\"subPeriod\":1,\"moneySymbol\":\"R$\"}},\"hasAgreedToDisclaimer\":false},\"version\":0},\"expiry\":0}",
  "lastExternalReferrerTime": "1792628038431",
  "first_url": "\"https://vmake.ai/pt/workspace?utm_source=Google&utm_medium=search&utm_campaign=VM_Web_gg_PT_Search_Brand&gad_source=1&gad_campaignid=24243937425&gbraid=0AAAABD5HqTYmuOi10gafKRuhkfC4UfmH8&gclid=CjwKCAjwxeHWBhBPEiwAiqtQ-UBXszAz-RsGYwjIwGyIwDaPDeh1sZCbpsqV_iN2C9jtx7eu-WIfUxoC7YwQAvD_BwE\"",
  "_uetsid_exp": "Fri, 23 Oct 2026 00:13:58 GMT",
  "track-store": "{\"gid\":\"1a160d6af35684-0490bf8630f22d-26071c51-1327104-1a160d6af362563\"}",
  "_uetvid": "f0203e50cda811f1b0d9054c47bdb393",
  "lastExternalReferrer": "empty",
  "vmake:country-code:v1": "BR",
  "meitu.account.debug": "0"
};

// 2. CONVERTE LOCALSTORAGE PARA O FORMATO DO PLAYWRIGHT STORAGESTATE
const localStorageEntries = Object.keys(rawLocalStorage).map(key => ({
  name: key,
  value: rawLocalStorage[key]
}));

// 3. COOKIES DA SESSÃO
const expiry = Math.floor(new Date('2027-01-16T15:38:19.032Z').getTime() / 1000);
const cookies = [
  {
    name: '__mt_uid__',
    value: '3027613041',
    domain: '.starii.com',
    path: '/',
    expires: expiry,
    httpOnly: false,
    secure: true,
    sameSite: 'None'
  },
  {
    name: '__mt_web_access_token__',
    value: 'l3yZoCIt84BJVzhmtwJEYOqpIDLX4u5SgFEmqynEBo8nn4tzAhcZDbSUjAmO5Q5qIFayR5tmI9PxlSx6qk1jXHKWn8hHg0QhGZkWU6zNdPGz-3NSf6YJkmL80AxLd8-rO-4STXfMnCUuyDvNWqu6QkKFSYVAhHqsEIanMTytrt877D2NZBooD4xw3i5MrW1Y',
    domain: '.starii.com',
    path: '/',
    expires: expiry,
    httpOnly: true,
    secure: true,
    sameSite: 'None'
  },
  {
    name: '__mt_web_client_id__',
    value: '1200000026',
    domain: '.starii.com',
    path: '/',
    expires: expiry,
    httpOnly: true,
    secure: true,
    sameSite: 'None'
  },
  {
    name: '__mt_uid__',
    value: '3027613041',
    domain: '.vmake.ai',
    path: '/',
    expires: expiry,
    httpOnly: false,
    secure: true,
    sameSite: 'None'
  },
  {
    name: '__mt_web_access_token__',
    value: 'l3yZoCIt84BJVzhmtwJEYOqpIDLX4u5SgFEmqynEBo8nn4tzAhcZDbSUjAmO5Q5qIFayR5tmI9PxlSx6qk1jXHKWn8hHg0QhGZkWU6zNdPGz-3NSf6YJkmL80AxLd8-rO-4STXfMnCUuyDvNWqu6QkKFSYVAhHqsEIanMTytrt877D2NZBooD4xw3i5MrW1Y',
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
  }
];

const fullStorageState = {
  cookies: cookies,
  origins: [
    {
      origin: 'https://vmake.ai',
      localStorage: localStorageEntries
    }
  ]
};

const authPath = path.join(__dirname, 'vmake_auth.json');
fs.writeFileSync(authPath, JSON.stringify(fullStorageState, null, 2), 'utf-8');
console.log(`[Playwright] vmake_auth.json configurado com sucesso com os dados de login de GabriellyVieira!`);

async function testWorkspace() {
  console.log('[Playwright] Abrindo o Workspace com o storageState autenticado...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: authPath,
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // Injeta também antes de qualquer script da página executar
  await page.addInitScript((storage) => {
    try {
      for (const [key, val] of Object.entries(storage)) {
        localStorage.setItem(key, val);
      }
    } catch (e) {}
  }, rawLocalStorage);

  await page.goto('https://vmake.ai/pt/workspace', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Fecha banner de cookie ou modal se existir
  try {
    const acceptCookieBtn = await page.$('button:has-text("Aceitar"), button:has-text("Accept")');
    if (acceptCookieBtn) await acceptCookieBtn.click();
  } catch (e) {}

  const screenshotPath = path.join(__dirname, 'vmake_logged_confirmed.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[Playwright] Screenshot autenticado salvo em: ${screenshotPath}`);

  // Coleta dados da interface autenticada
  const info = await page.evaluate(() => {
    const text = document.body ? document.body.innerText : '';
    const hasLogout = text.includes('Sair') || text.includes('Log out');
    const hasVip = text.includes('Pro') || text.includes('VIP');
    const hasCredits = text.includes('4520') || text.includes('crédito') || text.includes('Credits');
    
    return {
      title: document.title,
      url: window.location.href,
      hasLogout,
      hasVip,
      hasCredits,
      headerSnippet: text.slice(0, 300)
    };
  });

  console.log('[Playwright] Status da sessão:', info);
  await browser.close();
}

testWorkspace().catch(console.error);
