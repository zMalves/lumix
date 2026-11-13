const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const OSS = require('ali-oss');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const AK = process.env.VMAKE_AK || process.env.MT_AK || '';
const SK = process.env.VMAKE_SK || process.env.MT_SK || '';

function hmacSha256(key, str) {
  return crypto.createHmac('sha256', key).update(str).digest('hex');
}
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function signRequest(urlStr, method, headers = {}, body = '') {
  const u = new URL(urlStr);
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  headers['X-Sdk-Date'] = dateStr;
  headers['Host'] = u.host;
  
  const signedHeaders = Object.keys(headers).map(k => k.toLowerCase()).sort();
  const signedHeadersStr = signedHeaders.join(';');
  const lowHeaders = {};
  for (const k of Object.keys(headers)) lowHeaders[k.toLowerCase()] = String(headers[k]).trim();
  const canonicalHeaders = signedHeaders.map(k => k + ':' + lowHeaders[k]).join('\n');
  
  let p = u.pathname;
  if (!p || !p.endsWith('/')) p += '/';
  
  let queryStr = '';
  if (u.search && u.search.length > 1) {
    const params = Array.from(u.searchParams.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    queryStr = params.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  }
  
  const hexBody = sha256(body);
  const canonicalRequest = `${method}\n${p}\n${queryStr}\n${canonicalHeaders}\n${signedHeadersStr}\n${hexBody}`;
  const stringToSign = `SDK-HMAC-SHA256\n${dateStr}\n${sha256(canonicalRequest)}`;
  const signature = hmacSha256(SK, stringToSign);
  const authHeader = `SDK-HMAC-SHA256 Access=${AK}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;
  headers['Authorization'] = 'Bearer ' + Buffer.from(authHeader).toString('base64');
  return headers;
}

function httpsRequest(urlStr, method = 'GET', headers = {}, body = '') {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const reqHeaders = { ...headers };
    signRequest(urlStr, method, reqHeaders, body);
    
    const req = https.request(urlStr, { method, headers: reqHeaders }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function testFullPipeline() {
  console.log('--- 1. Fetching config ---');
  const configRes = await httpsRequest(
    'https://wapi-skill.vmake.ai/skill/config.json',
    'POST',
    { 'User-Agent': 'action-api-sdk-v1.0.0', 'Content-Type': 'application/json' },
    JSON.stringify({ gid: '', version: 'v2.0.1', supported_schemas: ['v2', 'v1'] })
  );
  console.log('Config status:', configRes.status, 'code:', configRes.data?.meta?.code);
  const gid = configRes.data?.response?.gid || '';

  console.log('--- 2. Getting Token Policy (Upload & AI) ---');
  const policyRes = await httpsRequest(
    'https://strategy.stariidata.com/ai/token_policy?type=mtai',
    'GET',
    { 'User-Agent': 'action-api-sdk-v1.0.0' }
  );
  
  const mtai = policyRes.data?.data?.mtai;
  const uploadOrder = mtai?.upload?.order?.[0];
  const uploadPolicy = mtai?.upload?.[uploadOrder];
  const apiOrder = mtai?.api?.order?.[0];
  const aiPolicy = mtai?.api?.[apiOrder];

  console.log('Upload Bucket:', uploadPolicy?.bucket, 'Key:', uploadPolicy?.key);
  console.log('AI Endpoint:', aiPolicy?.url, 'Push Path:', aiPolicy?.push_path);

  console.log('--- 3. Testing OSS Upload of dummy test text/file ---');
  const creds = uploadPolicy.credentials;
  const client = new OSS({
    region: 'oss-ap-southeast-1',
    accessKeyId: creds.access_key,
    accessKeySecret: creds.secret_key,
    stsToken: creds.session_token,
    bucket: uploadPolicy.bucket,
    endpoint: uploadPolicy.url
  });

  const testBuf = Buffer.from('TEST VMAKE UPLOAD ' + Date.now());
  const uploadResult = await client.put(uploadPolicy.key, testBuf);
  console.log('OSS Upload Status:', uploadResult.res.status);
  const fileUrl = uploadPolicy.data; // The URL to pass to VMake!
  console.log('Uploaded File URL:', fileUrl);

  console.log('--- 4. Checking Quota / Permission Consume for SKM0002 (Subtitle Remover) ---');
  const consumeRes = await httpsRequest(
    'https://wapi-skill.vmake.ai/skill/consume.json',
    'POST',
    { 'User-Agent': 'action-api-sdk-v1.0.0', 'Content-Type': 'application/json' },
    JSON.stringify({ url: fileUrl, task: 'SKM0002', gid: gid })
  );
  console.log('Consume Response:', consumeRes.data);
}

testFullPipeline().catch(console.error);
