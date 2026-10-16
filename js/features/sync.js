// Sincronizar o computador e o celular pelo Google Drive da própria pessoa (SPECS, seção 27).
// Resumo: um arquivo com os dados fica numa pasta privada do aplicativo no Drive. Cada aparelho lembra "qual revisão do arquivo eu vi por
// último" e "como estavam meus dados nessa hora" (um número de conferência, o hash). Comparando isso com o que existe agora, o sistema
// descobre se mudou só aqui (envia), só no Drive (baixa) ou nos dois (CONFLITO: a pessoa escolhe; nada é apagado nem misturado).
// Analogia: é como duas pessoas com cópias do mesmo caderno e um armário em comum; só se troca o caderno quando só um dos lados escreveu.
// Segurança primeiro: antes de substituir qualquer coisa, uma cópia fica guardada; dados vazios nunca cobrem dados do Drive sem a pessoa decidir.
(() => {
  const App = (window.App = window.App || {});
  const {esc} = App.format;
  const {registerAction, openModal, closeModal, byId} = App.ui;
  const {data, KEY, SCHEMA} = App.store;

  const STATE_KEY = 'julio-informatica-sync';   // estado da sincronização DESTE aparelho (nunca vai para o Drive)
  // Coisas que são só deste aparelho: não vão para o Drive, não contam como "mudou" e são preservadas quando se baixa.
  const DEVICE_ONLY_SETTINGS = ['lastSeenVersion', 'setupStep', 'backupWarnDays', 'backupAlertDays'];
  const LISTS = ['clients', 'products', 'sales', 'quotes', 'expenses', 'receipts', 'suppliers', 'purchases', 'reminders', 'payables', 'fixedExpenses'];
  const KEEP_COPIES = 5, TICK_MS = 60000;

  // Pontos que os testes trocam (para nunca falar com o Google de verdade).
  const hooks = {
    delay: 5000,                                   // espera depois de uma mudança, antes de sincronizar
    reload: () => location.reload(),               // recarrega a página depois de baixar dados
    clock: null,                                   // (iso) => 'HH:MM'
    deviceName: null,
    originOk: null
  };
  let driveApi = null;
  const api = () => driveApi || App.syncDrive.api;
  const clientId = () => (st.clientId || App.syncConfig.GOOGLE_CLIENT_ID || '').trim();
  let auth = {
    configured: () => !!clientId() && clientId() !== App.syncConfig.PLACEHOLDER,
    hasToken: () => App.syncDrive.hasToken(),
    request: () => App.syncDrive.request(clientId()),
    clear: () => App.syncDrive.clear(),
    revoke: () => App.syncDrive.revoke()
  };

  // ---------- estado deste aparelho ----------
  const defaultState = () => ({on: false, deviceId: '', lastRev: null, lastHash: '', lastAt: '', appliedPending: false, conflict: null, clientId: '', otherDevice: false, localEditedAt: ''});
  const loadState = () => { try { return {...defaultState(), ...JSON.parse(localStorage.getItem(STATE_KEY) || '{}')}; } catch { return defaultState(); } };
  let st = loadState();
  const setState = patch => { st = {...st, ...patch}; try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch { /* sem espaço: o estado fica só na memória */ } };

  // Coisas que só existem enquanto a página está aberta.
  const run = {reloading: false, busy: false, again: false, offline: false, error: '', newer: false, dirty: false, note: '', conflictRemote: null};
  let timer = null;

  // ---------- dados: o que vale para comparar e enviar ----------
  const nowIso = () => new Date().toISOString();
  const isEmpty = d => LISTS.every(key => !(d[key] || []).length);
  const plainData = (d = data) => {
    const copy = {...d, settings: {...(d.settings || {})}};
    delete copy.migration;
    DEVICE_ONLY_SETTINGS.forEach(key => delete copy.settings[key]);
    return copy;
  };
  const canon = v => Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v);
  // Número de conferência (hash) dos dados: dois conjuntos iguais dão o mesmo número. Serve só para descobrir se algo mudou.
  function hashData(d = data) {
    const text = canon(plainData(d));
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)}-${text.length}`;
  }
  const localInfo = () => ({hash: hashData(), empty: isEmpty(data)});
  const localChanged = () => hashData() !== st.lastHash;
  const countsOf = d => ({clientes: (d.clients || []).length, vendas: (d.sales || []).length, produtos: (d.products || []).length, os: (d.quotes || []).filter(q => q.kind === 'os').length});

  // Junta os dados do Drive com o que é só deste aparelho.
  function mergeDevice(remoteData, localData) {
    const merged = {...remoteData, settings: {...(remoteData.settings || {})}};
    DEVICE_ONLY_SETTINGS.forEach(key => { if (localData.settings && localData.settings[key] !== undefined) merged.settings[key] = localData.settings[key]; });
    if (localData.migration) merged.migration = localData.migration;
    return merged;
  }

  // ---------- ambiente e textos ----------
  const originOk = () => hooks.originOk ? hooks.originOk() : (location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname));
  // Por que a sincronização não pode funcionar aqui ('' = pode).
  const block = () => App.store.isDemo ? 'demo' : App.store.blocked ? 'blocked' : !originOk() ? 'origin' : !auth.configured() ? 'config' : '';
  const canRun = () => st.on && !block();

  const deviceName = () => {
    if (hooks.deviceName) return hooks.deviceName();
    const ua = navigator.userAgent || '';
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
    const system = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'sistema desconhecido';
    return `${browser} no ${system}`;
  };
  const clock = iso => hooks.clock ? hooks.clock(iso) : new Date(iso).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const pad = n => String(n).padStart(2, '0');
  const dayText = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const whenText = iso => { if (!iso) return 'ainda não'; const d = new Date(iso); return `${sameDay(d, new Date()) ? 'hoje' : dayText(d)} às ${clock(iso)}`; };
  const shortWhen = iso => { const d = new Date(iso); return sameDay(d, new Date()) ? `às ${clock(iso)}` : `em ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };

  // ---------- cópias de segurança deste aparelho (IndexedDB; nos testes, memória) ----------
  const memory = [];
  let memoryId = 0;
  const memoryStore = {
    async add(rec) { rec.id = ++memoryId; memory.push(rec); },
    async all() { return memory.slice(); },
    async get(id) { return memory.find(r => r.id === id); },
    async remove(id) { const i = memory.findIndex(r => r.id === id); if (i >= 0) memory.splice(i, 1); }
  };
  const openDb = () => new Promise((resolve, reject) => {
    const req = indexedDB.open('julio-informatica-sync', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('copies', {keyPath: 'id', autoIncrement: true});
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const idbRun = async (mode, work) => {
    const db = await openDb();
    return new Promise((resolve, reject) => { const req = work(db.transaction('copies', mode).objectStore('copies')); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  };
  const idbStore = {
    add: rec => idbRun('readwrite', s => s.add(rec)),
    all: () => idbRun('readonly', s => s.getAll()),
    get: id => idbRun('readonly', s => s.get(id)),
    remove: id => idbRun('readwrite', s => s.delete(id))
  };
  let copies = window.__TEST_IDS ? memoryStore : idbStore;

  // Guarda uma cópia dos dados (por padrão, os de agora) e mantém só as últimas KEEP_COPIES. Se não conseguir guardar, QUEM CHAMOU deve parar.
  async function saveCopy(label, content = data) {
    await copies.add({at: nowIso(), label, counts: countsOf(content), json: JSON.stringify(content)});
    const all = (await copies.all()).sort((a, b) => a.id - b.id);
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_COPIES))) await copies.remove(old.id);
  }

  // ---------- estado visível (cor, texto) ----------
  function view() {
    if (run.reloading) return {key: 'syncing', color: 'amber', label: 'Atualizando os dados...', short: 'Atualizando...'};
    const reason = block();
    if (reason === 'demo') return {key: 'demo', color: 'gray', label: 'Bloqueada na demonstração', short: ''};
    if (!st.on) return {key: 'off', color: 'gray', label: 'Não sincronizado', short: '', reason};
    if (st.conflict) return {key: 'conflict', color: 'red', label: 'Conflito', short: 'Conflito'};
    if (run.newer) return {key: 'newer', color: 'red', label: 'Atualize o sistema', short: 'Atualize o sistema'};
    if (run.error) return {key: 'error', color: 'red', label: 'Erro', short: 'Erro'};
    if (run.busy) return {key: 'syncing', color: 'amber', label: 'Sincronizando...', short: 'Sincronizando...'};
    const changed = run.dirty || (st.lastRev !== null && localChanged());
    if (!auth.hasToken()) return {key: 'reconnect', color: 'amber', label: 'Reconectar', short: 'Reconectar', changed};
    if (run.offline) return {key: 'pending', color: 'amber', label: 'Pendente', short: 'Pendente', why: 'offline', changed};
    if (st.lastRev === null || changed) return {key: 'pending', color: 'amber', label: 'Pendente', short: 'Pendente', why: st.lastRev === null ? 'first' : 'changes', changed};
    return {key: 'synced', color: 'green', label: 'Sincronizado', short: `Sincronizado ${shortWhen(st.lastAt)}`};
  }

  const ICON = {green: '✔', amber: '⚠', red: '✖', gray: '○'};

  function refresh() {
    const v = view(), show = st.on && v.key !== 'demo';
    ['sync-indicator', 'sync-top'].forEach(id => {
      const el = byId(id);
      if (!el) return;
      el.hidden = !show;
      el.dataset.state = v.color;
      el.textContent = show ? `● ${v.short}` : '';
      el.title = show ? 'Sincronização com o Google Drive (clique para abrir)' : '';
    });
    const panel = byId('sync-panel');
    if (panel) panel.outerHTML = panelHtml();
  }

  // ---------- Drive: enviar, baixar, conflito ----------
  const props = (rev, hash) => ({rev: String(rev), deviceId: st.deviceId, hash, sv: String(data.schemaVersion || SCHEMA), dn: deviceName().slice(0, 40)});
  const makeEnvelope = rev => ({...App.backup.envelope(plainData()), schemaVersion: data.schemaVersion || SCHEMA, deviceId: st.deviceId, deviceName: deviceName(), revision: rev, updatedAt: nowIso()});

  function validate(env) {
    if (!env || env.app !== 'julio-informatica' || !env.data || !Array.isArray(env.data.clients) || !Array.isArray(env.data.products) || !Array.isArray(env.data.sales)) throw Object.assign(new Error('O arquivo do Drive não parece ser dos dados deste sistema. Nada foi alterado.'), {code: 'invalid'});
    if (Number(env.data.schemaVersion) > SCHEMA || Number(env.schemaVersion) > SCHEMA || Number(env.formatVersion) > SCHEMA) throw Object.assign(new Error('newer'), {code: 'newer'});
    return env;
  }
  const checkRemoteSchema = remote => { if (remote && remote.sv > SCHEMA) throw Object.assign(new Error('newer'), {code: 'newer'}); };

  // Envia os dados deste aparelho (cria o arquivo ou atualiza) com a revisão rev.
  async function put(remote, rev, local) {
    // o conteúdo e o número de conferência saem do MESMO instante (se a pessoa mexer durante o envio, a mudança nova é enviada no ciclo seguinte)
    const env = makeEnvelope(rev), hash = hashData(), meta = props(rev, hash);
    if (remote) await api().update(remote.id, env, meta); else await api().create(env, meta);
    setState({lastRev: rev, lastHash: hash, lastAt: nowIso(), appliedPending: false, conflict: null});
    run.dirty = false; run.conflictRemote = null;
  }

  // Grava no aparelho os dados vindos do Drive e recarrega a página para o sistema abrir com eles.
  function applyRemote(env, meta) {
    const merged = mergeDevice(env.data, data);
    App.store.freeze();   // nada desta janela pode gravar por cima dos dados novos
    try { localStorage.setItem(KEY, JSON.stringify(merged)); }
    catch { throw Object.assign(new Error('O navegador não tem espaço para guardar os dados do Drive. Nada foi alterado.'), {code: 'space'}); }
    setState({lastRev: meta.rev, lastHash: hashData(merged), lastAt: nowIso(), appliedPending: true, conflict: null, otherDevice: true});
    run.dirty = false; run.conflictRemote = null;
    run.reloading = true;   // a partir daqui, esta janela (com os dados velhos na memória) NUNCA mais envia nada ao Drive: só recarrega
    clearTimeout(timer);
    hooks.reload();
  }

  async function download(meta) {
    const env = validate(await api().download(meta.id));
    await saveCopy('Dados deste aparelho, antes de baixar do Drive');
    applyRemote(env, meta);
  }

  async function raiseConflict(meta, kind, interactive) {
    const env = validate(await api().download(meta.id));
    setState({conflict: {kind, at: nowIso(), remoteRev: meta.rev}});
    run.conflictRemote = {meta, env};
    if (interactive) conflictModal();
  }

  // Um ciclo: compara, decide e faz (SPECS 27.2).
  async function cycle(attempt, interactive) {
    const remote = await api().find();
    checkRemoteSchema(remote);
    if (remote && remote.deviceId && remote.deviceId !== st.deviceId && !st.otherDevice) setState({otherDevice: true});
    const local = localInfo();
    if (remote && remote.hash && remote.hash === local.hash) {   // os dois lados já são iguais: só registra
      setState({lastRev: remote.rev, lastHash: local.hash, lastAt: nowIso(), conflict: null, appliedPending: false});
      run.dirty = false; return;
    }
    if (st.lastRev === null) {   // primeira sincronização deste aparelho
      if (!remote) {
        if (local.empty) { setState({lastRev: 0, lastHash: local.hash, lastAt: nowIso()}); run.dirty = false; return; }   // nada para enviar ainda
        return put(null, 1, local);
      }
      if (local.empty) return download(remote);
      return raiseConflict(remote, 'first', interactive);
    }
    const remoteChanged = !!remote && remote.rev !== st.lastRev, localIsNew = local.hash !== st.lastHash;
    if (!remote) {
      if (local.empty) { run.dirty = false; return; }
      return put(null, Math.max(st.lastRev, 0) + 1, local);
    }
    if (remoteChanged && localIsNew) return raiseConflict(remote, 'both', interactive);
    if (remoteChanged) return download(remote);
    if (localIsNew) {
      if (local.empty) return raiseConflict(remote, 'empty', interactive);   // dados vazios nunca cobrem o Drive sem a pessoa escolher
      const fresh = await api().find();   // confere de novo antes de enviar
      if ((fresh ? fresh.rev : 0) !== remote.rev) { if (attempt < 1) return cycle(attempt + 1, interactive); return raiseConflict(fresh || remote, 'both', interactive); }
      return put(remote, Math.max(remote.rev, st.lastRev) + 1, local);
    }
    run.dirty = false;
  }

  function handleError(error) {
    const code = error && error.code;
    if (code === 'auth') { auth.clear(); return; }
    if (code === 'newer') { run.newer = true; return; }
    if ((error instanceof TypeError && /fetch|network|Failed|Load failed/i.test(error.message)) || code === 'offline' || navigator.onLine === false) { run.offline = true; return; }
    run.error = (error && error.message) || 'Erro desconhecido ao sincronizar.';
  }

  async function syncNow(options = {}) {
    if (run.reloading) return;
    if (!canRun()) { refresh(); return; }
    if (st.conflict) { refresh(); if (options.interactive) openConflict(); return; }   // enquanto não decidir, não envia nem baixa
    if (!auth.hasToken()) { refresh(); return; }
    if (run.busy) { run.again = true; return; }
    run.busy = true; run.error = ''; run.newer = false; run.note = '';
    refresh();
    try { await cycle(0, !!options.interactive); run.offline = false; }
    catch (error) { handleError(error); }
    finally {
      run.busy = false;
      refresh();
      if (run.again) { run.again = false; schedule(); }
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (run.reloading || !canRun() || st.conflict) return;
    timer = setTimeout(() => syncNow(), hooks.delay);
  }

  // ---------- ligar e desligar ----------
  async function connect() {
    if (block()) { refresh(); return; }
    run.note = ''; run.error = '';
    let ok = false;
    try { ok = await auth.request(); } catch (error) { run.note = (error && error.message) || 'Não consegui abrir o login do Google.'; }
    if (!ok) { run.note = run.note || 'O login com o Google não foi concluído. Tente de novo.'; refresh(); return; }
    setState({on: true, deviceId: st.deviceId || App.store.newId('dev')});
    refresh();
    await syncNow({interactive: true});
  }

  function resetState() {
    auth.revoke();
    setState({on: false, lastRev: null, lastHash: '', lastAt: '', appliedPending: false, conflict: null, otherDevice: false});
    Object.assign(run, {busy: false, again: false, offline: false, error: '', newer: false, dirty: false, note: '', conflictRemote: null});
    clearTimeout(timer);
    refresh();
  }

  // ---------- janela de conflito ----------
  async function openConflict() {
    if (!st.conflict) return;
    if (!run.conflictRemote) {
      if (!auth.hasToken()) { let ok = false; try { ok = await auth.request(); } catch { /* segue */ } if (!ok) { run.note = 'Entre com o Google para ver o que há no Drive.'; refresh(); return; } }
      try {
        const meta = await api().find();
        if (!meta) { setState({conflict: null}); refresh(); return syncNow(); }
        run.conflictRemote = {meta, env: validate(await api().download(meta.id))};
      } catch (error) { handleError(error); refresh(); return; }
    }
    conflictModal();
  }

  function conflictModal() {
    const cr = run.conflictRemote;
    if (!cr) return;
    const L = countsOf(data), R = countsOf(cr.env.data), kind = (st.conflict && st.conflict.kind) || 'both';
    const intro = {
      first: 'Este aparelho e o Google Drive já têm dados, e o sistema não sabe qual lado é o certo.',
      both: 'Os dados mudaram neste aparelho e também no Google Drive desde a última sincronização.',
      empty: 'Este aparelho está sem dados, mas o Google Drive tem dados. Por segurança, o sistema não envia dados vazios sozinho.'
    }[kind] || '';
    const row = (label, a, b) => `<tr><td>${label}</td><td>${a}</td><td>${b}</td></tr>`;
    openModal(`<h2>Escolha quais dados usar</h2><p>${esc(intro)}</p><p class="positive"><b>Nada é apagado:</b> o lado que você não escolher fica guardado como cópia de segurança.</p><div class="table-wrap sync-compare"><table><thead><tr><th></th><th>Neste aparelho</th><th>No Google Drive</th></tr></thead><tbody>${row('Clientes', L.clientes, R.clientes)}${row('Vendas', L.vendas, R.vendas)}${row('Produtos e serviços', L.produtos, R.produtos)}${row('Ordens de serviço', L.os, R.os)}${row('Última mudança', esc(st.localEditedAt ? whenText(st.localEditedAt) : 'não registrada'), esc(whenText(cr.env.updatedAt || cr.meta.modifiedTime)))}${row('Aparelho', esc(deviceName()), esc(cr.env.deviceName || cr.meta.deviceName || 'desconhecido'))}</tbody></table></div><div class="actions"><button type="button" class="primary" data-action="sync-use-local">Usar os dados deste aparelho</button><button type="button" class="primary" data-action="sync-use-drive">Usar os dados do Drive</button><button type="button" class="secondary" data-action="sync-decide-later">Decidir depois</button></div><p class="muted">"Decidir depois" não muda nada: o uso do sistema continua normal, mas nada é enviado ao Drive até você escolher.</p>`);
  }

  async function useLocal() {
    closeModal();
    if (isEmpty(data) && !confirm('Este aparelho está sem dados. Enviar dados vazios vai substituir os do Drive (a versão do Drive fica guardada como cópia). Continuar?')) { conflictModal(); return; }
    run.busy = true; run.error = ''; refresh();
    try {
      const remote = await api().find();
      if (remote) {
        const env = validate(await api().download(remote.id));
        await saveCopy('Dados do Drive, antes de serem substituídos', env.data);
        await api().createCopy(`${App.syncDrive.COPY_PREFIX}${stamp()}.json`, env);
        const old = (await api().listCopies()).sort((a, b) => String(b.name).localeCompare(String(a.name)));
        for (const extra of old.slice(KEEP_COPIES)) await api().remove(extra.id);
      }
      await put(remote, Math.max(remote ? remote.rev : 0, st.lastRev || 0) + 1, localInfo());
    } catch (error) { handleError(error); }
    finally { run.busy = false; refresh(); }
  }

  async function useDrive() {
    closeModal();
    run.busy = true; run.error = ''; refresh();
    try {
      const remote = await api().find();
      if (!remote) { setState({conflict: null}); return; }
      checkRemoteSchema(remote);
      await download(remote);
    } catch (error) { handleError(error); }
    finally { run.busy = false; refresh(); }
  }

  // ---------- cópias de segurança, baixar e apagar ----------
  async function openCopies() {
    let list = [];
    try { list = (await copies.all()).sort((a, b) => b.id - a.id); } catch { /* sem acesso às cópias */ }
    const rows = list.map(c => `<tr><td>${esc(whenText(c.at))}</td><td>${esc(c.label)}</td><td>${c.counts.clientes} clientes · ${c.counts.vendas} vendas</td><td><button type="button" class="secondary" data-action="sync-restore" data-id="${c.id}">Restaurar esta cópia</button></td></tr>`).join('');
    openModal(`<h2>Cópias de segurança deste aparelho</h2><p class="muted">Antes de baixar ou restaurar dados, o sistema guarda uma cópia dos dados daquele momento. Ficam as últimas ${KEEP_COPIES}.</p>${list.length ? `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Motivo</th><th>Conteúdo</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>Ainda não há cópias. Elas aparecem aqui quando o sistema baixar ou restaurar dados.</p>'}<div class="actions"><button type="button" class="secondary" data-action="close-modal">Fechar</button></div>`);
  }

  async function restoreCopy(id) {
    const rec = await copies.get(Number(id));
    if (!rec || !confirm('Restaurar esta cópia? Os dados de agora serão substituídos (antes disso, o sistema guarda uma cópia deles).')) return;
    try {
      await saveCopy('Dados deste aparelho, antes de restaurar uma cópia');
      const merged = mergeDevice(JSON.parse(rec.json), data);
      App.store.freeze();
      localStorage.setItem(KEY, JSON.stringify(merged));
      run.reloading = true; clearTimeout(timer);
      hooks.reload();
    } catch (error) { alert(`Não consegui restaurar: ${(error && error.message) || 'erro desconhecido'}`); }
  }

  async function ensureToken() {
    if (auth.hasToken()) return true;
    let ok = false;
    try { ok = await auth.request(); } catch { /* segue */ }
    if (!ok) { run.note = 'Entre com o Google para continuar.'; refresh(); }
    return ok;
  }

  function downloadFile(name, obj) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadDriveCopy() {
    if (!(await ensureToken())) return;
    try {
      const meta = await api().find();
      if (!meta) { alert('Ainda não há arquivo de dados no seu Google Drive.'); return; }
      const env = validate(await api().download(meta.id));
      downloadFile(`dados-do-drive-${stamp().slice(0, 8)}.json`, env);
    } catch (error) { handleError(error); refresh(); }
  }

  function openDelete() {
    openModal('<h2>Apagar os dados do Drive?</h2><p class="negative"><b>Isto apaga o arquivo de dados e as cópias que a sincronização guardou no seu Google Drive.</b> Os dados que estão neste aparelho <b>não</b> são apagados, e a sincronização será desligada aqui.</p><div class="field"><label>Para confirmar, digite APAGAR</label><input id="sync-delete-word" autocomplete="off"></div><div class="actions"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button type="button" class="danger" id="sync-delete-confirm" data-action="sync-delete-confirm" disabled>Apagar do Drive</button></div>');
    byId('sync-delete-word').oninput = () => { byId('sync-delete-confirm').disabled = byId('sync-delete-word').value.trim() !== 'APAGAR'; };
  }

  async function deleteDrive() {
    if (byId('sync-delete-word') && byId('sync-delete-word').value.trim() !== 'APAGAR') return;
    closeModal();
    if (!(await ensureToken())) return;
    try {
      const meta = await api().find();
      if (meta) await api().remove(meta.id);
      for (const copy of await api().listCopies()) await api().remove(copy.id);
      resetState();
      alert('Os dados foram apagados do seu Google Drive. A sincronização foi desligada neste aparelho.');
    } catch (error) { handleError(error); refresh(); }
  }

  // ---------- painel em Configurações (SPECS 27.6) ----------
  function address() { return `${location.origin}${location.pathname.replace(/index\.html$/, '')}`; }

  function stepsHtml(v) {
    const originDone = originOk();
    const steps = [
      {done: originDone, title: 'Abra o sistema pelo endereço publicado', body: `Endereço: <code>${esc(address())}</code> <button type="button" class="secondary" data-action="sync-copy-url">Copiar</button><br>Faça isso no computador <b>e</b> no celular.`},
      {done: st.on, title: 'Conecte sua conta Google', body: 'O sistema só acessa uma pasta privada dele no seu Drive, não os seus outros arquivos.'},
      {done: st.lastRev !== null, title: 'Primeira sincronização', body: 'O sistema envia os dados deste aparelho para o Drive, ou baixa os que já estão lá. Se os dois lados tiverem dados, você escolhe qual usar.'},
      {done: st.otherDevice, title: 'Repita no outro aparelho', body: 'No outro aparelho, abra o mesmo endereço, vá em Configurações > Sincronizar com o Google Drive e faça os passos 2 e 3. Ele baixa os dados do Drive.'}
    ];
    const current = steps.findIndex(s => !s.done);
    return `<ol class="sync-steps">${steps.map((s, i) => `<li class="${s.done ? 'done' : ''}${i === current ? ' current' : ''}"><span class="sync-step-mark" aria-hidden="true">${s.done ? '✔' : i + 1}</span><div><b>${esc(s.title)}</b>${s.done ? ' <span class="muted">(feito)</span>' : ''}<br><span class="muted">${s.body}</span></div></li>`).join('')}</ol>`;
  }

  function cardHtml(v) {
    const reason = block();
    const btn = (action, label, kind = 'secondary', extra = '') => `<button type="button" class="${kind}" data-action="${action}" ${extra}>${label}</button>`;
    let text = '', buttons = '';
    if (v.key === 'demo') text = 'A sincronização fica desligada no modo demonstração, para não misturar exemplos com os seus dados.';
    else if (v.key === 'off') {
      if (reason === 'blocked') text = 'Estes dados são de uma versão mais nova do sistema. Atualize o sistema neste aparelho antes de sincronizar.';
      else if (reason === 'origin') text = 'Abra o sistema pelo endereço publicado para sincronizar. Abrindo o arquivo direto no computador, o Google não deixa fazer o login.';
      else if (reason === 'config') text = 'Sincronização ainda não configurada neste sistema. Quem publica o sistema precisa colocar o ID do cliente do Google (veja "Avançado" abaixo).';
      else text = 'Seus dados ficam só neste aparelho. Ligue a sincronização para usar o mesmo sistema no computador e no celular, pelo seu Google Drive.';
      buttons = btn('sync-connect', 'Conectar com o Google', 'primary', reason ? 'disabled' : '');
    } else if (v.key === 'synced') {
      text = `Sincronizado com o seu Google Drive • última vez ${esc(whenText(st.lastAt))}`;
      buttons = btn('sync-now', 'Sincronizar agora') + btn('sync-copies', 'Cópias de segurança') + btn('sync-disconnect', 'Desconectar');
    } else if (v.key === 'syncing') {
      text = 'Sincronizando com o seu Google Drive...';
    } else if (v.key === 'reconnect') {
      text = `O login com o Google venceu (ou o sistema acabou de abrir). Entre de novo para continuar sincronizando.${v.changed ? ' Há mudanças ainda não enviadas: nada foi perdido.' : ''}`;
      buttons = btn('sync-connect', 'Reconectar', 'primary') + btn('sync-copies', 'Cópias de segurança') + btn('sync-disconnect', 'Desconectar');
    } else if (v.key === 'pending') {
      text = v.why === 'offline' ? 'Sem internet no momento. Nada foi perdido: o sistema tenta de novo sozinho quando a internet voltar.' : v.why === 'first' ? 'Falta a primeira sincronização.' : 'Há mudanças ainda não enviadas ao Google Drive.';
      buttons = btn('sync-now', 'Sincronizar agora', 'primary') + btn('sync-copies', 'Cópias de segurança') + btn('sync-disconnect', 'Desconectar');
    } else if (v.key === 'conflict') {
      text = 'Os dados mudaram neste aparelho e também no Google Drive. Nada é enviado nem baixado até você escolher qual usar (nada é apagado).';
      buttons = btn('sync-resolve', 'Resolver conflito', 'primary') + btn('sync-copies', 'Cópias de segurança') + btn('sync-disconnect', 'Desconectar');
    } else if (v.key === 'newer') {
      text = 'O arquivo do Drive foi criado por uma versão mais nova do sistema. Atualize o sistema neste aparelho para sincronizar. Nada foi baixado nem enviado.';
      buttons = btn('sync-now', 'Tentar de novo') + btn('sync-disconnect', 'Desconectar');
    } else if (v.key === 'error') {
      text = `Não consegui sincronizar: ${esc(run.error)} Nada foi perdido.`;
      buttons = btn('sync-now', 'Tentar de novo', 'primary') + btn('sync-copies', 'Cópias de segurança') + btn('sync-disconnect', 'Desconectar');
    }
    const note = run.note ? `<p class="negative">${esc(run.note)}</p>` : '';
    return `<div class="sync-card sync-${v.color}"><div class="sync-badge"><span aria-hidden="true">${ICON[v.color]}</span> ${esc(v.label)}</div><p>${text}</p>${note}<div class="actions">${buttons}</div></div>`;
  }

  function panelHtml() {
    const v = view();
    const steps = stepsHtml(v);
    const more = st.on ? `<details class="sync-more"><summary>Mais opções</summary><div class="actions"><button type="button" class="secondary" data-action="sync-download-drive">Baixar uma cópia dos dados do Drive</button><button type="button" class="danger" data-action="sync-delete">Apagar os dados do Drive</button></div></details>` : '';
    const advanced = `<details class="sync-more"><summary>Avançado</summary><p class="muted">ID do cliente do Google. Só mude se você tem o seu próprio projeto no Google Cloud.</p><div class="field"><input id="sync-client-id" value="${esc(st.clientId)}" placeholder="${esc(App.syncConfig.GOOGLE_CLIENT_ID)}" autocomplete="off"></div><div class="actions"><button type="button" class="secondary" data-action="sync-save-client-id">Salvar ID</button></div></details>`;
    return `<section class="panel g-other sync-panel" id="sync-panel" data-state="${v.color}"><h2>Sincronizar com o Google Drive</h2>${cardHtml(v)}${v.color === 'green' ? `<details class="sync-more"><summary>Ver passo a passo</summary>${steps}</details>` : steps}${more}${advanced}</section>`;
  }

  // ---------- ações (botões) ----------
  registerAction('sync-connect', connect);
  registerAction('sync-now', () => syncNow({interactive: true}));
  registerAction('sync-resolve', openConflict);
  registerAction('sync-use-local', useLocal);
  registerAction('sync-use-drive', useDrive);
  registerAction('sync-decide-later', () => { closeModal(); refresh(); });
  registerAction('sync-copies', openCopies);
  registerAction('sync-restore', element => restoreCopy(element.dataset.id));
  registerAction('sync-disconnect', () => { if (confirm('Desconectar? Os dados continuam neste aparelho e no seu Google Drive (o arquivo do Drive não é apagado).')) resetState(); });
  registerAction('sync-download-drive', downloadDriveCopy);
  registerAction('sync-delete', openDelete);
  registerAction('sync-delete-confirm', deleteDrive);
  registerAction('sync-copy-url', () => { try { navigator.clipboard.writeText(address()); } catch { /* sem permissão: a pessoa copia à mão */ } });
  registerAction('sync-save-client-id', () => { setState({clientId: byId('sync-client-id').value.trim()}); refresh(); });
  registerAction('sync-open', () => { App.ui.go('settings'); if (st.conflict) openConflict(); });

  // ---------- partida ----------
  function start() {
    if (st.appliedPending && st.lastRev !== null) setState({lastHash: hashData(), appliedPending: false});   // acabou de baixar: a migração do sistema pode ter acrescentado campos, isso não é "mudança"
    if (!App.store.isDemo && !App.store.blocked) {
      App.store.afterSave.push(() => {
        if (!st.on) return;
        run.dirty = true;
        setState({localEditedAt: nowIso()});
        refresh();
        schedule();
      });
      document.addEventListener('visibilitychange', () => { if (!document.hidden && canRun() && auth.hasToken()) syncNow(); });
      window.addEventListener('online', () => { run.offline = false; if (canRun() && auth.hasToken()) syncNow(); });
      setInterval(() => { if (canRun() && auth.hasToken() && (run.offline || run.dirty)) syncNow(); }, TICK_MS);
    }
    refresh();
    if (canRun() && auth.hasToken()) syncNow();
  }

  App.sync = {start, panelHtml, syncNow, view, hooks, hashData, isEmpty, openConflict, connect,
    state: () => ({...st}), setState, setDriveApi: value => { driveApi = value; }, setAuth: value => { auth = {...auth, ...value}; },
    setCopiesStore: value => { copies = value; }, saveCopy, copies: () => copies.all(), refresh, runState: run, DEVICE_ONLY_SETTINGS};
})();
