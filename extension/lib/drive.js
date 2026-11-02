(function (global) {
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const PREFIX = '52poke-mark-v1-';
  const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(45000) });
    if (!response.ok) {
      // Do not echo OAuth responses or credentials into UI/logs.
      if (response.status === 401) throw new Error('Google 授权已失效，请重新连接');
      if (response.status === 403) throw new Error('Google 拒绝访问，请检查 Drive API、授权范围和测试用户');
      throw new Error(`Google 请求失败（${response.status}），本地标记已保留`);
    }
    const body = await response.text();
    if (body.length > 12 * 1024 * 1024) throw new Error('云端文件过大，已停止读取');
    return body ? JSON.parse(body) : null;
  }
  async function tokenRequest(config, params) {
    return request('https://oauth2.googleapis.com/token', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }) });
  }
  async function authorize(config) {
    const state = encode(crypto.getRandomValues(new Uint8Array(32)));
    const verifier = encode(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const redirect = browser.identity.getRedirectURL();
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPE,
      state, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent select_account' });
    const result = new URL(await browser.identity.launchWebAuthFlow({ url: auth.href, interactive: true }));
    const expected = new URL(redirect);
    if (result.origin !== expected.origin || result.pathname !== expected.pathname || result.searchParams.get('state') !== state) throw new Error('Google 登录验证失败，请重试');
    if (result.searchParams.has('error') || !result.searchParams.get('code')) throw new Error('Google 授权未完成');
    const token = await tokenRequest(config, { grant_type: 'authorization_code', code: result.searchParams.get('code'), code_verifier: verifier, redirect_uri: redirect });
    if (!token.access_token || !token.scope?.split(' ').includes(SCOPE)) throw new Error('没有获得 Drive 标记数据权限');
    return { accessToken: token.access_token, refreshToken: token.refresh_token || '', expiresAt: Date.now() + token.expires_in * 1000 };
  }
  async function refresh(config, auth) {
    if (auth.accessToken && auth.expiresAt > Date.now() + 60000) return auth;
    if (!auth.refreshToken) throw new Error('请重新连接 Google Drive');
    const token = await tokenRequest(config, { grant_type: 'refresh_token', refresh_token: auth.refreshToken });
    return { ...auth, accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  }
  async function list(accessToken) {
    const files = []; let pageToken;
    do {
      const query = new URLSearchParams({ spaces: 'appDataFolder', q: `trashed = false and name contains '${PREFIX}'`, fields: 'nextPageToken,files(id,name)', pageSize: '1000' });
      if (pageToken) query.set('pageToken', pageToken);
      const data = await request(`${API}?${query}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      files.push(...data.files.filter(x => /^52poke-mark-v1-[a-zA-Z0-9_-]+\.json$/.test(x.name)));
      pageToken = data.nextPageToken;
      if (files.length > 200) throw new Error('同步设备文件过多，请先导出备份并检查云端');
    } while (pageToken);
    return files;
  }
  async function download(accessToken, fileId) {
    return request(`${API}/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
  }
  async function upload(accessToken, deviceId, fileId, data) {
    const headers = { Authorization: `Bearer ${accessToken}` };
    if (fileId) {
      await request(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, {
        method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      return fileId;
    }
    const boundary = 'pkm_' + crypto.randomUUID().replaceAll('-', '');
    const metadata = { name: PREFIX + deviceId + '.json', parents: ['appDataFolder'], mimeType: 'application/json' };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
    const result = await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST', headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    return result.id;
  }
  global.PokeDrive = { authorize, refresh, list, download, upload, PREFIX };
})(globalThis);
