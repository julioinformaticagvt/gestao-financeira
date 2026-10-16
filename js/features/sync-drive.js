// Conversa com o Google (SPECS, seção 27.3): login (token) e as chamadas ao Drive. Só "fala" com o Google quando a pessoa liga a
// sincronização; o script de login do Google (accounts.google.com/gsi/client) só é carregado nesse momento.
// O token de acesso fica na memória da página e, para sobreviver a "puxar para atualizar" no celular, também no sessionStorage (a
// gaveta da ABA: some sozinha quando a aba ou o aplicativo é fechado, e vale no máximo ~1 hora). NUNCA vai para o localStorage, para os
// dados, para o backup nem para o Drive.
// Analogia: o token é uma pulseira de visitante que vale cerca de 1 hora; recarregar a página não a tira, mas fechar tudo sim.
(() => {
  const App = (window.App = window.App || {});

  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';   // só a pasta privada do aplicativo, nada dos outros arquivos
  const FILE_NAME = 'gestao-dados.json';
  const COPY_PREFIX = 'gestao-dados-copia-';
  const DRIVE = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

  const TOKEN_KEY = 'julio-informatica-sync-token';   // só no sessionStorage (a aba), nunca no localStorage
  let token = '', expiresAt = 0, clientId = '';

  const hasToken = () => !!token && Date.now() < expiresAt;
  const clear = () => { token = ''; expiresAt = 0; try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* sem acesso: segue só na memória */ } };
  // Guarda o token (valendo `seconds` segundos, menos uma folga de 1 minuto) na memória e na aba.
  const remember = (value, seconds) => {
    token = value; expiresAt = Date.now() + (seconds - 60) * 1000;
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({t: token, exp: expiresAt})); } catch { /* sem acesso: segue só na memória */ }
  };
  // Depois de recarregar a página: recupera o token da aba, se ainda valer; se venceu, apaga.
  const restore = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
      if (saved && saved.t && saved.exp > Date.now()) { token = saved.t; expiresAt = saved.exp; }
      else if (saved) sessionStorage.removeItem(TOKEN_KEY);
    } catch { /* sem acesso: segue sem token */ }
  };
  const dropMemory = () => { token = ''; expiresAt = 0; };   // só para os testes (simula o recarregar da página)

  function loadScript() {
    return new Promise((resolve, reject) => {
      if (window.google && google.accounts && google.accounts.oauth2) return resolve();
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Não consegui carregar o login do Google (sem internet?).'));
      document.head.appendChild(script);
    });
  }

  // Pede o token. Só deve ser chamada a partir de um clique da pessoa (o navegador pode bloquear a janela do Google se não for).
  // hint = e-mail da conta usada antes: o Google pula a escolha de conta.
  async function request(id, hint) {
    clientId = id || clientId;
    await loadScript();
    return new Promise(resolve => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        ...(hint ? {hint} : {}),
        callback: response => {
          if (response && response.access_token) { remember(response.access_token, Number(response.expires_in) || 3600); resolve(true); }
          else resolve(false);
        },
        error_callback: () => resolve(false)   // a pessoa fechou a janela, ou o navegador bloqueou
      });
      client.requestAccessToken({prompt: ''});
    });
  }

  function revoke() {
    const old = token;
    clear();
    try { if (old && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(old, () => {}); } catch { /* segue */ }
  }

  // ---------- Drive ----------
  async function call(url, options = {}) {
    if (!hasToken()) throw Object.assign(new Error('login vencido'), {code: 'auth'});
    const response = await fetch(url, {...options, headers: {Authorization: `Bearer ${token}`, ...(options.headers || {})}});
    if (response.status === 401) { clear(); throw Object.assign(new Error('login vencido'), {code: 'auth'}); }
    if (!response.ok) throw Object.assign(new Error(`O Google respondeu com erro ${response.status}.`), {code: 'http', status: response.status});
    return response;
  }

  const toMeta = file => file && {
    id: file.id, name: file.name, modifiedTime: file.modifiedTime,
    rev: Number((file.appProperties || {}).rev) || 0, hash: (file.appProperties || {}).hash || '',
    deviceId: (file.appProperties || {}).deviceId || '', deviceName: (file.appProperties || {}).dn || '', sv: Number((file.appProperties || {}).sv) || 0
  };

  function multipart(meta, content) {
    const boundary = `gd${Math.random().toString(36).slice(2)}`;
    return {
      headers: {'Content-Type': `multipart/related; boundary=${boundary}`},
      body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(content)}\r\n--${boundary}--`
    };
  }

  const list = async query => {
    const url = `${DRIVE}?spaces=appDataFolder&pageSize=100&fields=${encodeURIComponent('files(id,name,modifiedTime,createdTime,appProperties)')}&q=${encodeURIComponent(query)}`;
    return ((await (await call(url)).json()).files) || [];
  };

  const api = {
    // O arquivo principal (ou null). Se houver mais de um (raro), vale o de revisão mais alta.
    async find() {
      const files = (await list(`name='${FILE_NAME}' and trashed=false`)).map(toMeta);
      return files.sort((a, b) => b.rev - a.rev)[0] || null;
    },
    async download(id) { return (await call(`${DRIVE}/${id}?alt=media`)).json(); },
    async create(content, props) {
      const {headers, body} = multipart({name: FILE_NAME, parents: ['appDataFolder'], appProperties: props}, content);
      return (await call(`${UPLOAD}?uploadType=multipart&fields=id`, {method: 'POST', headers, body})).json();
    },
    async update(id, content, props) {
      const {headers, body} = multipart({appProperties: props}, content);
      return (await call(`${UPLOAD}/${id}?uploadType=multipart&fields=id`, {method: 'PATCH', headers, body})).json();
    },
    async createCopy(name, content) {
      const {headers, body} = multipart({name, parents: ['appDataFolder']}, content);
      return (await call(`${UPLOAD}?uploadType=multipart&fields=id`, {method: 'POST', headers, body})).json();
    },
    async listCopies() { return (await list(`name contains '${COPY_PREFIX}' and trashed=false`)).map(file => ({id: file.id, name: file.name, createdTime: file.createdTime})); },
    async remove(id) { await call(`${DRIVE}/${id}`, {method: 'DELETE'}); },
    // E-mail da conta Google conectada (só para guardar como dica neste aparelho).
    async userEmail() { return (((await (await call('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)')).json()).user) || {}).emailAddress || ''; }
  };

  restore();   // ao abrir (ou recarregar), reaproveita o token da aba se ainda valer
  App.syncDrive = {FILE_NAME, COPY_PREFIX, hasToken, request, clear, revoke, api, remember, restore, dropMemory};
})();
