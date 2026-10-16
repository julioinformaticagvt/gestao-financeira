// Backup dos dados: (1) manual, exportar/importar um arquivo .json; (2) automático, gravando numa pasta escolhida.
(() => {
  const App = (window.App = window.App || {});
  const {esc} = App.format;
  const {data, KEY} = App.store;
  const {openModal} = App.ui;

  const LAST_KEY = 'julio-informatica-last-backup';      // data do último backup manual (fora do 'data')
  const AUTO_LAST_KEY = 'julio-informatica-auto-last';   // momento da última gravação automática
  const WARN_DAYS = 7;
  const KEEP_FILES = 30;          // quantos arquivos diários manter na pasta
  const CHECK_EVERY_MS = 60000;   // de quanto em quanto tempo o automático confere se houve mudança
  const FILE_PATTERN = /^julio-informatica-(\d{4}-\d{2}-\d{2})\.json$/;

  // Dia no fuso do computador (AAAA-MM-DD). today() do app usa UTC e pode adiantar o dia à noite.
  const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const readLast = () => { try { return localStorage.getItem(LAST_KEY) || ''; } catch { return ''; } };
  const daysSince = day => Math.floor((new Date(`${localDay()}T12:00:00`) - new Date(`${day}T12:00:00`)) / 864e5);

  // O arquivo de backup é uma "caixa" com uma etiqueta (app, versão, data) e os dados dentro.
  const envelope = (content = data) => ({app: 'julio-informatica', formatVersion: App.store.SCHEMA, exportedAt: new Date().toISOString(), data: content});
  const counts = d => ({clientes: d.clients.length, produtos: d.products.length, vendas: d.sales.length, orcamentos: (d.quotes || []).length, saidas: (d.expenses || []).length});

  // ===================== Parte 1: backup manual =====================

  function download(name, obj) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const DEMO_MSG = "No modo demonstração o backup fica desligado, para não misturar exemplos com dados reais. Saia da demonstração para fazer backup dos seus dados.";
  function exportBackup() {
    if (App.store.isDemo) { alert(DEMO_MSG); return; }
    download(`julio-informatica-${localDay()}.json`, envelope());
    try { localStorage.setItem(LAST_KEY, localDay()); } catch {}
    const info = document.getElementById('backup-last');
    if (info) info.textContent = lastBackupText();
    renderNotice();
  }

  function readBackupFile(file) {
    if (App.store.isDemo) { alert(DEMO_MSG); return; }
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); } catch { return alert('Não foi possível ler este arquivo. Ele não parece ser um backup válido.'); }
      const incoming = parsed && parsed.app === 'julio-informatica' ? parsed.data : null;
      if (!incoming || !Array.isArray(incoming.clients) || !Array.isArray(incoming.products) || !Array.isArray(incoming.sales)) return alert('Este arquivo não é um backup válido deste sistema.');
      if (Number(incoming.schemaVersion) > App.store.SCHEMA || Number(parsed.formatVersion) > App.store.SCHEMA) return alert('Este backup foi criado por uma versão mais nova do sistema. Atualize o sistema para restaurá-lo. Nada foi alterado.');
      confirmImport(parsed, incoming);
    };
    reader.readAsText(file);
  }

  function confirmImport(parsed, incoming) {
    const novo = counts(incoming), atual = counts(data);
    const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('pt-BR') : 'data desconhecida';
    const row = (label, key) => `<tr><td>${label}</td><td>${novo[key]}</td><td>${atual[key]}</td></tr>`;
    openModal(`<h2>Restaurar backup?</h2><p>Backup feito em <b>${esc(when)}</b>.</p><div class="table-wrap"><table><thead><tr><th></th><th>No backup</th><th>Hoje no sistema</th></tr></thead><tbody>${row('Clientes', 'clientes')}${row('Produtos e serviços', 'produtos')}${row('Vendas', 'vendas')}${row('Orçamentos', 'orcamentos')}${row('Saídas', 'saidas')}</tbody></table></div><p class="negative"><b>Atenção:</b> os dados atuais serão substituídos pelos do backup. Antes disso, o sistema baixa uma cópia dos dados de hoje (arquivo "copia-antes-de-restaurar"), para você poder voltar atrás.</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button type="button" class="primary" id="backup-confirm">Substituir dados atuais</button></div>`);
    document.getElementById('backup-confirm').onclick = event => {
      event.target.disabled = true;
      download(`copia-antes-de-restaurar-${localDay()}.json`, envelope());
      localStorage.setItem(KEY, JSON.stringify(incoming));
      // Recarrega a página para o sistema começar de novo já com os dados restaurados.
      setTimeout(() => location.reload(), 800);
    };
  }

  function lastBackupText() {
    const last = readLast();
    if (!last) return 'Nenhum backup manual feito ainda.';
    const age = daysSince(last);
    return `Último backup manual: ${last.split('-').reverse().join('/')} (${age <= 0 ? 'hoje' : age === 1 ? 'ontem' : `há ${age} dias`}).`;
  }

  // ===================== Parte 2: backup automático numa pasta =====================
  // O navegador deixa o usuário escolher UMA pasta; o sistema guarda a "chave" dessa pasta (handle) no IndexedDB
  // (uma gavetinha do navegador para objetos) e depois grava nela sozinho, sem perguntar de novo.

  // status: carregando | indisponivel | off | ativo | permissao | erro
  const auto = {handle: null, status: window.showDirectoryPicker ? 'carregando' : 'indisponivel', error: '', lastSnapshot: '', running: false};

  const openDb = () => new Promise((resolve, reject) => {
    const req = indexedDB.open('julio-informatica-backup', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const dbRun = async (mode, work) => {
    const db = await openDb();
    return new Promise((resolve, reject) => { const req = work(db.transaction('handles', mode).objectStore('handles')); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  };

  const describe = e => e && e.name === 'NotFoundError' ? 'a pasta não foi encontrada (foi apagada ou movida?).' : e && e.name === 'NotAllowedError' ? 'o Chrome não permitiu gravar na pasta.' : `${(e && e.name) || 'Erro'}: ${(e && e.message) || 'falha desconhecida'}`;

  // Grava o arquivo do dia na pasta, só se os dados mudaram. Nunca grava com o sistema vazio.
  async function runBackup() {
    if (App.store.isDemo) return;
    if (!auto.handle || auto.running) return;
    const json = localStorage.getItem(KEY);
    if (!json || json === auto.lastSnapshot) return;
    let content;
    try { content = JSON.parse(json); } catch { return; }
    if (!(content.clients || []).length && !(content.products || []).length && !(content.sales || []).length) return; // proteção: não sobrescrever cópia boa com dados vazios
    auto.running = true;
    try {
      const file = await auto.handle.getFileHandle(`julio-informatica-${localDay()}.json`, {create: true});
      const out = await file.createWritable();   // grava num arquivo temporário e só troca ao fechar: nunca deixa o arquivo pela metade
      await out.write(JSON.stringify(envelope(content), null, 2));
      await out.close();
      auto.lastSnapshot = json;
      localStorage.setItem(AUTO_LAST_KEY, new Date().toISOString());
      auto.status = 'ativo'; auto.error = '';
      await cleanOld(); // só apaga cópias antigas depois de gravar a nova com sucesso
    } catch (e) {
      if (e && e.name === 'NotAllowedError') auto.status = 'permissao'; else { auto.status = 'erro'; auto.error = describe(e); }
    } finally {
      auto.running = false;
    }
    renderAuto();
  }

  // Mantém só os KEEP_FILES arquivos mais recentes (mexe apenas em arquivos com o nome do backup).
  async function cleanOld() {
    const names = [];
    for await (const entry of auto.handle.values()) if (entry.kind === 'file' && FILE_PATTERN.test(entry.name)) names.push(entry.name);
    names.sort(); // o nome começa pela data, então ordem alfabética = ordem cronológica
    for (const name of names.slice(0, Math.max(0, names.length - KEEP_FILES))) await auto.handle.removeEntry(name);
  }

  async function activate() {
    let dir;
    try { dir = await window.showDirectoryPicker({id: 'julio-backup', mode: 'readwrite'}); }
    catch (e) { if (e && e.name !== 'AbortError') alert(`Não foi possível ativar o backup automático: ${describe(e)}`); return; }
    await dbRun('readwrite', store => store.put(dir, 'dir'));
    auto.handle = dir; auto.status = 'ativo'; auto.error = ''; auto.lastSnapshot = '';
    renderAuto();
    runBackup();
  }

  async function reactivate() {
    try { auto.status = (await auto.handle.requestPermission({mode: 'readwrite'})) === 'granted' ? 'ativo' : 'permissao'; }
    catch (e) { auto.status = 'erro'; auto.error = describe(e); }
    auto.lastSnapshot = '';
    renderAuto();
    if (auto.status === 'ativo') runBackup();
  }

  async function deactivate() {
    if (!confirm('Desativar o backup automático? Os arquivos que já estão na pasta continuam lá.')) return;
    await dbRun('readwrite', store => store.delete('dir'));
    auto.handle = null; auto.status = 'off'; auto.error = '';
    renderAuto();
  }

  async function initAuto() {
    if (App.store.isDemo) { auto.status = 'demo'; return renderAuto(); }
    if (!window.showDirectoryPicker) { auto.status = 'indisponivel'; return renderAuto(); }
    try {
      const saved = await dbRun('readonly', store => store.get('dir'));
      if (saved) { auto.handle = saved; auto.status = (await saved.queryPermission({mode: 'readwrite'})) === 'granted' ? 'ativo' : 'permissao'; }
      else auto.status = 'off';
    } catch { auto.status = 'off'; }
    renderAuto();
    if (auto.status === 'ativo') runBackup();
  }

  const whenText = iso => {
    if (!iso) return 'ainda sem gravação';
    const d = new Date(iso), day = localDay(d);
    return `${day === localDay() ? 'hoje' : day.split('-').reverse().join('/')} às ${d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`;
  };

  function autoMarkup() {
    const last = (() => { try { return localStorage.getItem(AUTO_LAST_KEY) || ''; } catch { return ''; } })();
    const folder = auto.handle ? esc(auto.handle.name) : '';
    if (auto.status === 'carregando') return '<p class="muted">Verificando o backup automático...</p>';
    if (auto.status === 'demo') return '<p class="muted">Backup automático desligado no modo demonstração.</p>';
    if (auto.status === 'indisponivel') return '<p class="muted">Este sistema funciona melhor no Chrome ou Edge. Neste navegador o backup automático não está disponível: use o backup manual.</p><div class="actions"><button type="button" class="primary" disabled>Ativar backup automático (indisponível neste navegador)</button></div>';
    if (auto.status === 'off') return '<p>Backup automático <b>desativado</b>.</p><div class="actions"><button type="button" class="primary" id="auto-activate">Ativar backup automático</button></div>';
    if (auto.status === 'ativo') return `<p class="positive"><b>Backup automático ativo</b> · pasta <b>${folder}</b> · última gravação ${esc(whenText(last))}.</p><div class="actions"><button type="button" class="secondary" id="auto-deactivate">Desativar backup automático</button></div>`;
    if (auto.status === 'permissao') return `<p class="negative"><b>Backup automático parado:</b> o Chrome precisa da sua permissão para gravar na pasta <b>${folder}</b>.</p><div class="actions"><button type="button" class="primary" id="auto-reactivate">Reativar</button><button type="button" class="secondary" id="auto-deactivate">Desativar</button></div>`;
    return `<p class="negative"><b>Backup automático com problema:</b> ${esc(auto.error)}</p><div class="actions"><button type="button" class="primary" id="auto-retry">Tentar de novo</button><button type="button" class="secondary" id="auto-deactivate">Desativar</button></div>`;
  }

  // Redesenha o bloco do automático (se a tela Configurações estiver aberta) e o aviso da Visão geral.
  function renderAuto() {
    const box = document.getElementById('auto-backup');
    if (box) {
      box.innerHTML = autoMarkup();
      const on = (id, fn) => { const button = document.getElementById(id); if (button) button.onclick = fn; };
      on('auto-activate', activate); on('auto-reactivate', reactivate); on('auto-deactivate', deactivate); on('auto-retry', runBackup);
    }
    renderNotice();
  }

  // ===================== Telas =====================

  // Configurações: painel de backup no fim da página.
  function backupPanel() {
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.innerHTML = `<h2>Backup e exportação</h2><p class="muted"><b>Seus dados ficam só neste navegador. Faça backup e confira com seu contador as regras de imposto, multa e juros.</b> O backup automático grava uma cópia por dia numa pasta (ex.: dentro do Google Drive); guarda as 30 mais recentes.</p><div id="auto-backup"></div><hr><h3>Backup manual</h3><p id="backup-last">${esc(lastBackupText())}</p><div class="actions"><button type="button" class="secondary" id="backup-export">Exportar backup</button><button type="button" class="secondary" id="backup-import">Importar backup...</button><input type="file" id="backup-file" accept=".json,application/json" hidden></div>${preV2Html()}<div class="actions"><button type="button" class="secondary" id="backup-verify">Verificar meu último backup</button><input type="file" id="backup-verify-file" accept=".json,application/json" hidden></div><form id="backup-days-form" class="form-grid" style="margin-top:14px"><div class="field"><label>Avisar quando o último backup passar de (dias)</label><input name="backupWarnDays" type="number" min="1" value="${data.settings.backupWarnDays}"></div><div class="field"><label>Aviso vermelho a partir de (dias)</label><input name="backupAlertDays" type="number" min="1" value="${data.settings.backupAlertDays}"></div><div class="actions field full"><button class="secondary">Salvar dias de aviso</button></div></form>${App.exporter.panelHtml()}`;
    document.getElementById('app').appendChild(panel);
    App.exporter.bind();
    document.getElementById('backup-export').onclick = exportBackup;
    const input = document.getElementById('backup-file');
    document.getElementById('backup-import').onclick = () => input.click();
    input.onchange = () => { if (input.files[0]) readBackupFile(input.files[0]); input.value = ''; };
    document.getElementById('backup-verify').onclick = verifyLast;
    const verifyInput = document.getElementById('backup-verify-file');
    verifyInput.onchange = async () => { const file = verifyInput.files[0]; verifyInput.value = ''; if (file) inspectBackup(await file.text(), file.name); };
    document.getElementById('backup-days-form').onsubmit = event => {
      event.preventDefault();
      const f = event.target.elements, warn = Math.max(1, Math.round(Number(f.backupWarnDays.value) || 7));
      data.settings.backupWarnDays = warn;
      data.settings.backupAlertDays = Math.max(warn, Math.round(Number(f.backupAlertDays.value) || 30));
      App.store.save();
      alert('Dias de aviso salvos.');
    };
    renderAuto();
  }

  // Visão geral: avisos de backup (só aparece se houver algo a avisar).
  function renderNotice() {
    document.getElementById('backup-notice')?.remove();
    if (document.getElementById('page-title')?.textContent === 'Visão geral') backupNotice();
  }

  // Botões da cópia de segurança feita na atualização para ids internos (aparecem só enquanto ela existir).
  function preV2Html() {
    const key = data.migration && data.migration.backupKey;
    let exists = false;
    try { exists = !!key && localStorage.getItem(key) !== null; } catch { /* sem acesso */ }
    if (!exists) return '';
    return '<p class="muted">Existe uma cópia dos dados de antes da atualização para ids internos. Ela ocupa espaço no navegador: baixe e guarde o arquivo, depois apague.</p><div class="actions"><button type="button" class="secondary" data-action="download-pre-v2">Baixar a cópia anterior</button><button type="button" class="danger" data-action="drop-pre-v2">Apagar a cópia anterior</button></div>';
  }

  // Dia do último backup, manual ou automático (o mais recente dos dois). '' = nunca fez.
  function lastAnyBackupDay() {
    let autoIso = '';
    try { autoIso = localStorage.getItem(AUTO_LAST_KEY) || ''; } catch { /* sem acesso: segue */ }
    const autoDay = autoIso ? localDay(new Date(autoIso)) : '';
    return [readLast(), autoDay].filter(Boolean).sort().pop() || '';
  }

  // Faixa na Visão geral: amarela depois de backupWarnDays (padrão 7), vermelha depois de backupAlertDays (padrão 30).
  function backupNotice() {
    if (App.store.isDemo) return;
    const warnDays = Number(data.settings.backupWarnDays) || WARN_DAYS, alertDays = Number(data.settings.backupAlertDays) || 30;
    let text, label, action, red = false;
    if (auto.status === 'permissao') { text = 'Backup automático parado: o Chrome precisa da sua permissão.'; label = 'Reativar'; action = reactivate; }
    else if (auto.status === 'erro') { text = `Backup automático com problema: ${auto.error}`; label = 'Tentar de novo'; action = runBackup; }
    else {
      const last = lastAnyBackupDay(), age = last ? daysSince(last) : Infinity;
      if (age <= warnDays) return;
      // Sistema vazio e sem nenhum backup: não há o que salvar, então não incomoda.
      if (!last && !(data.clients.length || data.products.length || data.sales.length || data.purchases.length || data.payables.length)) return;
      text = last ? `Seu último backup foi há ${age} dias (${last.split('-').reverse().join('/')}).` : 'Você ainda não fez backup dos dados.';
      red = age >= alertDays;
      label = 'Fazer backup agora'; action = exportBackup;
    }
    const box = document.createElement('section');
    box.id = 'backup-notice';
    box.className = `panel backup-band${red ? ' backup-alert' : ''}`;
    box.innerHTML = `<div class="panel-head"><span class="${red ? 'negative' : 'muted'}">${esc(text)}</span><button type="button" class="secondary" id="backup-now">${label}</button></div>`;
    document.getElementById('app').insertAdjacentElement('afterbegin', box);
    document.getElementById('backup-now').onclick = action;
  }

  // ---------- verificar o último backup (só lê; não muda nenhum dado) ----------
  function inspectBackup(text, name) {
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* arquivo ilegível */ }
    const d = parsed && parsed.app === 'julio-informatica' ? parsed.data : null;
    const ok = d && Array.isArray(d.clients) && Array.isArray(d.products) && Array.isArray(d.sales);
    if (!ok) {
      openModal(`<h2>Verificar backup</h2><p class="negative"><b>Este arquivo não é um backup válido</b> (${esc(name || 'arquivo')}). Faça um backup novo agora em "Exportar backup".</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Fechar</button></div>`);
      return;
    }
    const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('pt-BR') : 'data desconhecida';
    const n = list => (d[list] || []).length;
    const rows = [['Clientes', n('clients')], ['Produtos e serviços', n('products')], ['Vendas', n('sales')], ['Orçamentos', n('quotes')], ['Compras', n('purchases')], ['Fornecedores', n('suppliers')], ['Recibos', n('receipts')], ['Contas a pagar', n('payables')]];
    openModal(`<h2>Verificar backup</h2><p class="positive"><b>O arquivo abre e é um backup válido.</b></p><p>Arquivo: <b>${esc(name || 'escolhido por você')}</b><br>Feito em: <b>${esc(when)}</b></p><div class="table-wrap"><table><thead><tr><th>O que tem dentro</th><th>Quantidade</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`).join('')}</tbody></table></div><p class="muted">Nada foi alterado nos seus dados: isto só leu o arquivo.</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Fechar</button></div>`);
  }

  async function verifyLast() {
    // 1º: a pasta do backup automático (arquivo mais recente). 2º: pede para escolher um arquivo.
    if (auto.handle && auto.status === 'ativo') {
      try {
        let best = null;
        for await (const [name, handle] of auto.handle.entries()) {
          const match = FILE_PATTERN.exec(name);
          if (match && handle.kind === 'file' && (!best || match[1] > best.day)) best = {day: match[1], name, handle};
        }
        if (best) return inspectBackup(await (await best.handle.getFile()).text(), best.name);
      } catch { /* cai para a escolha manual */ }
    }
    document.getElementById('backup-verify-file').click();
  }

  App.ui.onShow('settings', backupPanel);
  App.ui.onShow('dashboard', backupNotice);

  // Liga o backup automático (chamado pelo main.js depois que a primeira tela já apareceu).
  function start() {
    setInterval(() => { if (auto.status === 'ativo' || auto.status === 'erro') runBackup(); }, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && auto.status === 'ativo') runBackup(); });
    initAuto();
  }

  App.backup = {start, envelope, exportBackup, lastAnyBackupDay, chooseFolder: activate};
})();
