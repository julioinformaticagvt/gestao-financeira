// Primeiro uso e ajuda (SPECS, seção 23): assistente de primeira abertura, cartão "Comece por aqui", janela "O que há de novo",
// proteção contra dados de versão mais nova, avisos de espaço e de navegador, e os painéis de Configurações (Ajuda, Demonstração,
// Assistente, Dados do sistema e Sobre). O sistema que já tem dados NUNCA vê o assistente nem a demonstração sozinhos.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today} = App.format;
  const {data, save} = App.store;
  const {openModal, closeModal, registerAction, go, byId} = App.ui;

  const cfg = () => data.settings;
  const STEPS = 4;
  const SPACE_LIMIT = 5000000;            // cerca de 5 MB (o que o navegador costuma permitir)
  const BROWSER_SEEN = 'julio-informatica-browser-notice';
  const DATA_NOTE_SEEN = 'julio-informatica-data-note';   // "Entendi" na faixa "os dados ficam só neste aparelho" (só deste aparelho; fora dos dados)

  // ---------- versões ----------
  const parts = v => String(v || '0').split('.').map(n => Number(n) || 0);
  const compare = (a, b) => { const x = parts(a), y = parts(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };

  // ---------- assistente ----------
  const needsWizard = () => !cfg().setupDone && !App.store.isDemo && !App.store.blocked;
  const num = value => { const n = Number(String(value).replace(',', '.')); return Number.isFinite(n) && String(value).trim() !== '' ? n : null; };

  const progress = n => `<div class="wiz-progress"><span>Passo ${n} de ${STEPS}</span><div class="wiz-bar"><i style="width:${n / STEPS * 100}%"></i></div></div>`;
  const buttons = (n, next = 'Continuar') => `<div class="actions wiz-actions">${n > 1 ? '<button type="button" class="secondary" data-action="fr-back">Voltar</button>' : ''}<button type="button" class="secondary" data-action="fr-skip">Pular por enquanto</button><button class="primary">${next}</button></div>`;

  function stepMarkup(n) {
    const s = cfg(), b = s.business, m = s.machine, rate = key => { const r = m.rates.now; return key.startsWith('credit-') ? r.credit[key.slice(7)] : r[key]; };
    if (n === 1) {
      return `${progress(1)}<h2>Seu negócio</h2><p class="muted">Aparecem nos recibos. Dá para mudar depois.</p><form id="fr-form" class="form-grid">
        <div class="field full"><label>Nome do negócio</label><input name="name" value="${esc(b.name)}" placeholder="Nome do seu negócio"></div>
        <div class="field"><label>CNPJ ou CPF</label><input name="cnpj" value="${esc(b.cnpj)}"></div>
        <div class="field"><label>Telefone / WhatsApp</label><input name="phone" value="${esc(b.phone)}"></div>
        <div class="field"><label>Instagram <small>opcional</small></label><input name="instagram" value="${esc(b.instagram)}" placeholder="@seuperfil"></div>
        <div class="field"><label>Logo <small>opcional</small></label><input type="file" name="logo" accept="image/*"></div>${buttons(1)}</form>`;
    }
    if (n === 2) {
      return `${progress(2)}<h2>MEI</h2><p class="muted">Mostra quanto do limite do MEI você já usou e lembra do DAS.</p><form id="fr-form" class="form-grid">
        <div class="field full"><label class="inline-check"><input type="checkbox" name="isMei" ${s.isMei ? 'checked' : ''}> <b>Sou MEI</b></label></div>
        <div class="field"><label>Limite anual (R$)</label><input name="meiLimit" type="number" min="1" step="0.01" value="${s.meiLimit}"></div>
        <div class="field"><label>Mês de abertura <small>opcional</small></label><input name="meiOpenMonth" type="month" value="${esc(s.meiOpenMonth || '')}"></div>
        <div class="field"><label>Valor do DAS (R$) <small>opcional</small></label><input name="dasValue" type="number" min="0" step="0.01" value="${s.dasValue === '' || s.dasValue == null ? '' : s.dasValue}"></div>${buttons(2)}</form>`;
    }
    if (n === 3) {
      const credit = Array.from({length: 12}, (_, i) => `<div class="field"><label>Crédito ${i + 1}x (%)</label><input name="credit-${i + 1}" type="number" min="0" step="0.01" value="${rate('credit-' + (i + 1))}"></div>`).join('');
      return `${progress(3)}<h2>Maquininha e cobrança</h2><form id="fr-form" class="form-grid">
        <div class="field full"><label class="inline-check"><input type="checkbox" name="hasMachine" ${m.configured ? 'checked' : ''}> <b>Recebo por maquininha</b></label><small>veja no app da maquininha</small></div>
        <div class="field"><label>Pix (%)</label><input name="pix" type="number" min="0" step="0.01" value="${rate('pix')}"></div>
        <div class="field"><label>Débito (%)</label><input name="debit" type="number" min="0" step="0.01" value="${rate('debit')}"></div>${credit}
        <div class="field"><label>Dia padrão de vencimento</label><input name="dueDay" type="number" min="1" max="28" value="${s.dueDay || 12}"></div>
        <div class="field"><label>Multa por atraso (%)</label><input name="fine" type="number" min="0" step="0.01" value="${s.collection.fine}"></div>
        <div class="field"><label>Juros por atraso (% ao mês)</label><input name="interest" type="number" min="0" step="0.01" value="${s.collection.interest}"></div>
        <p class="muted field full">Confirme multa e juros com o seu contador.</p>${buttons(3)}</form>`;
    }
    const picker = !!window.showDirectoryPicker;
    return `${progress(4)}<h2>Backup</h2><p><b>Seus dados ficam só neste navegador e neste computador.</b> Se o navegador for limpo ou o computador estragar, eles se perdem.</p><p>Por isso, faça backup: o sistema avisa quando passar de 7 dias sem backup. Para usar em outro aparelho, exporte e importe um backup.</p>
      <div class="actions"><button type="button" class="primary" data-action="fr-auto" ${picker ? '' : 'disabled'}>Ativar backup automático</button><button type="button" class="secondary" data-action="fr-manual">Vou fazer backup manual</button></div>
      ${picker ? '' : '<p class="muted">Backup automático só no Chrome ou Edge. Use o backup manual.</p>'}
      <div class="actions wiz-actions"><button type="button" class="secondary" data-action="fr-back">Voltar</button><button type="button" class="primary" data-action="fr-finish">Concluir</button></div>`;
  }

  function doneMarkup() {
    return `<h2>Tudo pronto!</h2><p>Você já pode usar o sistema. O que ficou em branco pode ser preenchido depois, em Configurações. O botão <b>?</b> no topo abre o guia "Como usar".</p>
      <div class="actions wiz-done"><button type="button" class="primary" data-action="fr-first-client">Cadastrar o primeiro cliente</button><button type="button" class="secondary" data-action="demo-enter">Ver o modo demonstração</button><button type="button" class="secondary" data-action="fr-home">Ir para a Visão geral</button></div>`;
  }

  let currentStep = 1;
  function show(step) {
    currentStep = step;
    cfg().setupStep = step;
    save();
    openModal(step > STEPS ? doneMarkup() : stepMarkup(step));
    const form = byId('fr-form');
    if (form) form.onsubmit = event => { event.preventDefault(); if (saveStep(step, form)) show(step + 1); };
  }

  // Grava os campos do passo na hora de avançar (nada se perde se fechar a aba).
  function saveStep(n, form) {
    const f = form.elements, s = cfg();
    if (n === 1) {
      Object.assign(s.business, {name: f.name.value.trim(), cnpj: f.cnpj.value.trim(), phone: f.phone.value.trim(), instagram: f.instagram.value.trim()});
      const file = f.logo.files && f.logo.files[0];
      if (file && App.branding.fromFile) {
        App.branding.fromFile(file).then(logo => { s.business.logo = logo; save(); App.branding.apply(); }).catch(error => alert(error.message));
      }
      save(); App.branding.apply();
    } else if (n === 2) {
      s.isMei = f.isMei.checked;
      const limit = num(f.meiLimit.value);
      if (limit !== null && limit > 0) s.meiLimit = limit;
      s.meiOpenMonth = f.meiOpenMonth.value || '';
      const das = num(f.dasValue.value);
      s.dasValue = das === null ? '' : Math.max(0, das);
      if (s.isMei) App.bills.ensureDas();
      save();
    } else if (n === 3) {
      const m = s.machine, r = m.rates.now, read = (name, fallback) => { const v = num(f[name].value); return v === null ? fallback : Math.max(0, v); };
      r.pix = read('pix', 0); r.debit = read('debit', 0);
      for (let i = 1; i <= 12; i++) r.credit[i] = read(`credit-${i}`, 0);
      m.configured = f.hasMachine.checked; m.updatedAt = today();
      const due = num(f.dueDay.value);
      if (due !== null) s.dueDay = Math.min(28, Math.max(1, Math.round(due)));
      s.collection.fine = read('fine', s.collection.fine); s.collection.interest = read('interest', s.collection.interest);
      save();
    }
    return true;
  }

  // Termina o assistente (concluído ou pulado): não volta sozinho; liga o cartão "Comece por aqui".
  function finish(skipped) {
    const s = cfg();
    s.setupDone = true; s.setupStep = 1; s.setupSkipped = !!skipped; s.onboardingCard = true;
    save();
    App.branding.apply();
    App.serviceOrders.applyLabels();
  }

  function start({force = false} = {}) {
    if (!force && !needsWizard()) return false;
    show(force ? 1 : Math.min(Math.max(1, Number(cfg().setupStep) || 1), STEPS));
    return true;
  }

  registerAction('fr-back', () => show(Math.max(1, currentStep - 1)));
  registerAction('fr-skip', () => { finish(true); closeModal(); go('dashboard'); });
  registerAction('fr-finish', () => { finish(false); show(STEPS + 1); });
  registerAction('fr-manual', () => { cfg().backupMode = 'manual'; save(); const b = byId('fr-manual-msg'); if (!b) openModal(`${stepMarkup(STEPS)}<p class="positive">Combinado: o sistema vai lembrar do backup a cada ${Number(cfg().backupWarnDays) || 7} dias.</p>`); });
  registerAction('fr-auto', async () => { if (App.backup.chooseFolder) await App.backup.chooseFolder(); });
  registerAction('fr-first-client', () => { closeModal(); go('clients'); const b = document.querySelector('[data-action="new-client"]'); if (b) b.click(); });
  registerAction('fr-home', () => { closeModal(); go('dashboard'); });
  registerAction('fr-redo', () => start({force: true}));

  // ---------- "Comece por aqui" ----------
  function checklist() {
    return [
      {key: 'client', label: 'Cadastrar o primeiro cliente', done: data.clients.length > 0, view: 'clients'},
      {key: 'product', label: 'Cadastrar um produto ou serviço', done: data.products.length > 0, view: 'products'},
      {key: 'sale', label: 'Fazer a primeira venda', done: data.sales.length > 0, view: 'sales'},
      {key: 'backup', label: 'Fazer um backup', done: !!(App.backup && App.backup.lastAnyBackupDay && App.backup.lastAnyBackupDay()), view: 'settings'}
    ];
  }
  function startCardHtml() {
    const s = cfg();
    if (!s.onboardingCard || s.onboardingCardDismissed || App.store.isDemo) return '';
    const items = checklist();
    if (items.every(i => i.done)) return '';
    const empty = !data.clients.length && !data.sales.length;
    return `<section class="panel start-card"><div class="panel-head"><h2>Comece por aqui</h2><button type="button" class="secondary" data-action="fr-dismiss-card">Dispensar</button></div><ul class="start-list">${items.map(i => `<li class="${i.done ? 'done' : ''}"><span class="start-check">${i.done ? '✓' : ''}</span><span>${esc(i.label)}</span>${i.done ? '' : `<button type="button" class="secondary" data-action="help-go" data-view="${i.view}">Ir</button>`}</li>`).join('')}</ul>${empty ? '<div class="actions"><button type="button" class="secondary" data-action="demo-enter">Ver com dados de exemplo</button><button type="button" class="secondary" data-action="open-help">Como usar</button></div>' : '<div class="actions"><button type="button" class="secondary" data-action="open-help">Como usar</button></div>'}</section>`;
  }
  registerAction('fr-dismiss-card', () => { cfg().onboardingCardDismissed = true; save(); go('dashboard'); });

  // ---------- telas vazias que explicam ----------
  // title = frase curta; hint = dica de uma linha; action = data-action do botão; label = texto do botão.
  function emptyState({title, hint, action, label}) {
    return `<div class="empty empty-explain"><p><b>${esc(title)}</b></p><p class="muted">${esc(hint)}</p>${action ? `<button type="button" class="primary" data-action="${esc(action)}">${esc(label)}</button>` : ''}</div>`;
  }

  // ---------- espaço e navegador ----------
  function spaceInfo() {
    let used = 0;
    try {
      used += (localStorage.getItem(App.store.KEY) || '').length;
      const d = data.migration && data.migration.backupKey;
      if (d) used += (localStorage.getItem(d) || '').length;
    } catch { /* sem acesso */ }
    const pct = Math.min(100, used / SPACE_LIMIT * 100);
    return {used, limit: SPACE_LIMIT, pct};
  }
  const mb = bytes => `${(bytes / 1000000).toFixed(1).replace('.', ',')} MB`;

  // env = {hasPicker, ua}: parâmetros só para os testes.
  function browserNotice(env = {}) {
    const hasPicker = env.hasPicker ?? !!window.showDirectoryPicker, ua = env.ua ?? navigator.userAgent;
    const recommended = /Chrome|Chromium|Edg\//.test(ua);
    if (hasPicker && recommended) return '';
    return 'Este sistema funciona melhor no Chrome ou Edge. Neste navegador o backup automático não está disponível: use o backup manual.';
  }

  function dataNoteVisible() {
    try { if (localStorage.getItem(DATA_NOTE_SEEN) === '1') return false; } catch { /* sem acesso: mostra */ }
    if (App.sync && App.sync.state().on) return false;   // sincronizando com o Google Drive
    if (App.sync && App.sync.bandVisible()) return false;   // a faixa "ainda não sincronizado" já avisa (SPECS 33.4)
    const d = App.store.data;
    return !!((d.clients || []).length || (d.products || []).length || (d.sales || []).length);   // sistema vazio: o assistente já explica
  }
  registerAction('data-note-ok', () => { try { localStorage.setItem(DATA_NOTE_SEEN, '1'); } catch { /* segue */ } go('dashboard'); });

  function noticesHtml(options = {}) {
    if (window.__NO_FIRST_RUN && !options.force) return '';
    // Faixa só do celular (o CSS a esconde no computador): os dados ficam no aparelho.
    // Faixa só do celular. Some de vez com "Entendi"; não aparece com a sincronização ligada (os dados também estão no Drive) nem num sistema ainda vazio (SPECS 30.2).
    const out = [];
    if (dataNoteVisible()) out.push('<section class="panel mobile-data-note"><div class="panel-head"><span><b>Os dados ficam só neste aparelho.</b> O computador e o celular têm dados separados.</span><span class="note-actions"><button type="button" class="secondary" data-action="open-help">Entenda</button><button type="button" class="secondary" data-action="data-note-ok">Entendi</button></span></div></section>');
    const sp = spaceInfo();
    if (sp.pct >= 80) out.push(`<section class="panel backup-band backup-alert"><div class="panel-head"><span class="negative">O espaço do navegador está acabando: ${mb(sp.used)} de cerca de ${mb(SPACE_LIMIT)}. Faça um backup e use imagens menores nos logos.</span></div></section>`);
    const text = browserNotice(options.env);
    let seen = false;
    try { seen = localStorage.getItem(BROWSER_SEEN) === '1'; } catch { /* sem acesso */ }
    if (text && !seen) out.push(`<section class="panel backup-band"><div class="panel-head"><span class="muted">${esc(text)}</span><button type="button" class="secondary" data-action="fr-browser-ok">Entendi</button></div></section>`);
    return out.join('');
  }
  registerAction('fr-browser-ok', () => { try { localStorage.setItem(BROWSER_SEEN, '1'); } catch { /* segue */ } go('dashboard'); });

  // ---------- novidades ----------
  function newsEntries(since, upTo) {
    return (window.CHANGELOG || []).filter(e => (since === null || compare(e.version, since) > 0) && compare(e.version, upTo) <= 0);
  }
  function newsHtml(entries) {
    return `<h2>O que há de novo</h2><div class="news-list">${entries.map(e => `<section class="help-task"><h3>Versão ${esc(e.version)} · ${esc(e.name)} <small class="muted">${esc(e.date)}</small></h3><ul>${e.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section>`).join('')}</div><p class="help-note"><b>Antes de atualizar o sistema, faça um backup.</b> Seus dados ficam só neste navegador.</p><div class="actions"><button type="button" class="primary" data-action="close-modal">Entendi</button></div>`;
  }
  // Mostra uma vez por versão nova. Devolve true se mostrou.
  function maybeShowNews() {
    const version = window.APP_VERSION && window.APP_VERSION.number;
    if (!version || App.store.isDemo || App.store.blocked) return false;
    const last = cfg().lastSeenVersion;
    if (!last || compare(version, last) <= 0) return false;
    const entries = newsEntries(last, version);
    cfg().lastSeenVersion = version;
    save();
    if (!entries.length) return false;
    openModal(newsHtml(entries));
    document.querySelector('#modal .modal-card').classList.add('wide');
    return true;
  }
  registerAction('open-news', () => {
    const version = (window.APP_VERSION && window.APP_VERSION.number) || '0';
    const entries = newsEntries(null, version).slice(0, 3);
    if (!entries.length) return;
    openModal(newsHtml(entries));
    document.querySelector('#modal .modal-card').classList.add('wide');
  });

  // ---------- dados de versão mais nova ----------
  function blockedHtml() {
    return '<section class="panel blocked-box"><h2>Atualize o sistema para continuar</h2><p class="negative"><b>Seus dados foram criados por uma versão mais nova deste sistema.</b></p><p>Para não correr o risco de estragá-los, o sistema <b>não abriu</b> os dados e <b>não gravou nada</b>. Nada foi alterado.</p><p>Abra a versão mais nova do sistema, ou restaure um backup mais antigo.</p></section>';
  }

  // ---------- Configurações ----------
  function settingsPanels() {
    const v = window.APP_VERSION || {}, sp = spaceInfo(), demo = App.store.isDemo;
    const demoPanel = demo
      ? '<p class="negative"><b>Você está no modo demonstração.</b> Use "Sair" na faixa do topo para voltar aos seus dados.</p>'
      : '<p class="muted">Dados de exemplo, para conhecer as telas. <b>Seus dados reais não são tocados</b> e voltam quando você sair.</p><div class="actions"><button type="button" class="secondary" data-action="demo-enter">Ver com dados de exemplo</button></div>';
    return `<section class="panel g-other"><h2>Ajuda e primeiros passos</h2><p class="muted">O guia "Como usar" também abre pelo botão <b>?</b> no topo.</p><div class="actions"><button type="button" class="secondary" data-action="open-help">Abrir o guia "Como usar"</button><button type="button" class="secondary" data-action="fr-redo">Refazer o assistente</button></div><p class="muted">Refazer o assistente não apaga nenhum dado.</p></section>
      <section class="panel g-other"><h2>Modo demonstração</h2>${demoPanel}</section>
      <section class="panel g-other"><h2>Dados do sistema</h2><p>Espaço usado: <b>${mb(sp.used)}</b> de cerca de <b>${mb(sp.limit)}</b> (${Math.round(sp.pct)}%).</p><div class="meter-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(sp.pct)}" aria-label="Espaço usado"><div class="meter-fill" style="width:${sp.pct.toFixed(1)}%;background:${sp.pct >= 80 ? '#b4412b' : '#2a5db0'}"></div></div><p class="muted">Logos grandes ocupam espaço: use imagens menores.</p><p class="muted"><b>Seus dados ficam só neste aparelho e neste navegador.</b> O computador e o celular têm dados separados. Para usar em outro aparelho, exporte e importe um backup.</p></section>
      <section class="panel g-other"><h2>Sobre</h2><p>Versão <b>${esc(v.number || '-')}</b>${v.name ? ` · ${esc(v.name)}` : ''}${v.date ? ` · ${esc(v.date)}` : ''}</p><p class="muted"><b>Antes de atualizar o sistema, faça um backup.</b></p><div class="actions"><button type="button" class="secondary" data-action="open-news">O que há de novo</button><button type="button" class="secondary" data-action="legal-terms">Termos de uso</button><button type="button" class="secondary" data-action="legal-privacy">Privacidade</button><button type="button" class="secondary" data-action="legal-license">Licença</button></div><p>${App.legal.issuesHtml()}</p></section>`;
  }

  // ---------- partida (chamada pelo main.js) ----------
  // Devolve true se abriu alguma janela (para a janela de avisos urgentes esperar).
  function run() {
    if (App.demo) App.demo.installBanner();
    if (App.store.blocked) { byId('app').innerHTML = blockedHtml(); return true; }
    if (window.__NO_FIRST_RUN) return false;
    if (needsWizard()) { start(); return true; }
    return maybeShowNews();
  }

  App.firstRun = {
    STEPS, compare, needsWizard, start, finish, show, checklist, startCardHtml, emptyState, spaceInfo, browserNotice, noticesHtml,
    newsEntries, maybeShowNews, blockedHtml, settingsPanels, run
  };
})();
