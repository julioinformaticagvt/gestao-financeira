// Tela "Configurações": regras financeiras, dados do negócio (recibo), maquininha e juros,
// e (no fim) zerar os dados de teste. O painel de backup é acrescentado por features/backup.js.
(() => {
  const App = (window.App = window.App || {});
  const {esc, dateLabel, today} = App.format;
  const {data, save} = App.store;
  const {MODALITIES} = App.pricing;
  const {byId, openModal} = App.ui;

  const number = value => value === '' || value === null || value === undefined ? null : Number(String(value).replace(',', '.'));
  const rateInput = (name, value) => `<input name="${name}" type="number" min="0" step="0.01" value="${value ?? ''}" placeholder="em branco">`;

  // ---------- painéis ----------
  function rulesPanel() {
    return `<section class="panel g-pay"><h2>Regras financeiras</h2><p class="muted">Vale só para operações novas.</p><form id="settings-form" class="form-grid"><div class="field"><label>Máximo de parcelas</label><input name="maxInstallments" type="number" value="${data.settings.maxInstallments}"></div><div class="field"><label>Dia padrão de vencimento</label><input name="dueDay" type="number" min="1" max="28" value="${data.settings.dueDay || 12}"></div><div class="field"><label>Estoque mínimo padrão <small>aviso de comprar</small></label><input name="defaultMinStock" type="number" min="0" step="1" value="${App.stock.defaultMin()}"></div><div class="field"><label>Margem de ganho padrão (%) <small>sobre o custo</small></label><input name="defaultMargin" type="number" min="0" step="0.01" value="${data.settings.defaultMargin ?? 40}"></div><div class="field"><label>Quando o cliente paga várias parcelas de uma vez</label><select name="receiptMode"><option value="one" ${data.settings.receiptMode !== 'each' ? 'selected' : ''}>Um recibo para tudo</option><option value="each" ${data.settings.receiptMode === 'each' ? 'selected' : ''}>Um recibo por parcela</option></select></div><div class="actions field full"><button class="primary">Salvar configurações</button></div></form></section>`;
  }

  // Uma linha de logo: prévia, escolher arquivo e remover.
  function logoRow(key, title, hint) {
    const stored = data.settings.business[key], src = App.branding.safeSrc(stored && stored.src), logo = src ? stored : null;
    return `<div class="logo-row"><div class="logo-preview">${logo ? `<img alt="" src="${esc(src)}">` : '<span class="muted">sem logo</span>'}</div><div><b>${title}</b><br><span class="muted">${hint}</span><br><label class="secondary button-like">Escolher imagem<input type="file" accept="image/*" data-logo="${key}" hidden></label>${logo ? ` <button type="button" class="secondary" data-action="logo-remove" data-key="${key}">Remover</button>` : ''}</div></div>`;
  }

  function businessPanel() {
    const b = data.settings.business;
    return `<section class="panel g-other"><h2>Dados do negócio</h2><p class="muted">Aparecem no recibo.</p><form id="business-form" class="form-grid"><div class="field"><label>Nome do negócio</label><input name="name" value="${esc(b.name)}" placeholder="Nome do seu negócio"></div><div class="field"><label>CNPJ ou CPF</label><input name="cnpj" value="${esc(b.cnpj)}" placeholder="CNPJ (00.000.000/0000-00) ou CPF"></div><div class="field"><label>Telefone</label><input name="phone" value="${esc(b.phone)}"><label class="inline-check"><input type="checkbox" name="phoneWhatsapp" ${b.phoneWhatsapp ? 'checked' : ''}> Este número tem WhatsApp</label></div><div class="field"><label>Rede social</label><div class="discount-row social-row"><select name="social" aria-label="Qual rede social">${[['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['site', 'Site'], ['other', 'Outra']].map(([key, text]) => `<option value="${key}" ${(b.social || 'instagram') === key ? 'selected' : ''}>${text}</option>`).join('')}</select><input name="instagram" value="${esc(b.instagram)}" placeholder="@seuperfil"></div></div><div class="field full"><label>Logo</label><div class="logo-rows">${logoRow('logo', 'Logo principal', 'Vale para o topo do sistema e para o PDF do recibo.')}${logoRow('logoTop', 'Outra logo só para o topo (opcional)', 'Se vazio, usa a logo principal.')}${logoRow('logoPdf', 'Outra logo só para o PDF e o recibo (opcional)', 'Se vazio, usa a logo principal.')}</div></div><div class="field full"><label>Tamanho da logo no topo</label><div class="size-row"><input type="range" id="logo-size" min="${App.branding.MIN_TOP}" max="${App.branding.MAX_TOP}" step="1" value="${App.branding.topHeight()}" aria-label="Tamanho da logo no topo"><output id="logo-size-out" for="logo-size">${App.branding.topHeight()} px</output><button type="button" class="secondary" id="logo-size-reset">Voltar ao tamanho padrão</button></div><p class="muted">Só no topo do sistema (${App.branding.MIN_TOP} a ${App.branding.MAX_TOP} px).</p></div>${App.appearance.sliderHtml('bar')}<div class="field full"><label class="inline-check"><input type="checkbox" name="showName" ${b.showName === false ? '' : 'checked'}> Mostrar o nome ao lado da logo</label></div><div class="field full"><label>Garantia padrão</label><textarea name="warranty" placeholder="Ex.: 90 dias para serviços e 12 meses de garantia do fabricante para peças">${esc(b.warranty)}</textarea></div><div class="field full"><label>Mensagem padrão do recibo (use {cliente}, {negócio}, {valor}, {forma}, {data}).</label><textarea name="receiptMessage" rows="6">${esc(b.receiptMessage)}</textarea></div><div class="actions field full"><button class="primary">Salvar dados do negócio</button></div></form></section>`;
  }

  // Painel do MEI: chave "Sou MEI", limite, avisos e DAS. Desligado, somem os medidores, o lembrete do DAS e os avisos.
  function meiPanel() {
    const s = data.settings;
    const dasHint = s.isMei && !(Number(s.dasValue) > 0) ? '<p class="negative">Informe o valor do DAS para o sistema criar o lembrete todo mês.</p>' : '';
    return `<section class="panel g-pay"><h2>MEI</h2><p class="muted">Mostra quanto do limite do MEI você já usou e lembra do DAS. <b>Não calcula imposto.</b></p><form id="mei-form" class="form-grid"><div class="field full"><label class="inline-check"><input type="checkbox" name="isMei" ${s.isMei ? 'checked' : ''}> <b>Sou MEI</b> (mostrar os medidores do limite e o lembrete do DAS)</label></div><div class="full mei-fields" ${s.isMei ? '' : 'hidden'}><div class="field"><label>Limite anual (R$)</label><input name="meiLimit" type="number" min="0" step="0.01" value="${s.meiLimit}"></div><div class="field"><label>Mês de abertura do MEI <small>opcional</small></label><input name="meiOpenMonth" type="month" value="${esc(s.meiOpenMonth || '')}"></div><div class="field"><label>Aviso amarelo a partir de (%)</label><input name="meiWarnPct" type="number" min="1" max="100" value="${s.meiWarnPct}"></div><div class="field"><label>Aviso vermelho a partir de (%)</label><input name="meiAlertPct" type="number" min="1" max="100" value="${s.meiAlertPct}"></div><div class="field"><label>Valor do DAS (R$) <small>o que você paga por mês</small></label><input name="dasValue" type="number" min="0" step="0.01" value="${s.dasValue === '' || s.dasValue == null ? '' : s.dasValue}" placeholder="em branco"></div><div class="field"><label>Dia de vencimento do DAS</label><input name="dasDay" type="number" min="1" max="28" value="${s.dasDay}"></div>${dasHint}</div><div class="actions field full"><button class="primary">Salvar MEI</button></div></form></section>`;
  }

  function machinePanel() {
    const m = data.settings.machine, extra = data.settings.pricing.extra;
    const rows = [['pix', 'Pix'], ['debit', 'Débito'], ...Array.from({length: 12}, (_, i) => [`credit-${i + 1}`, i === 0 ? 'Crédito à vista (1x)' : `Crédito ${i + 1}x`])];
    const get = (plan, key) => key.startsWith('credit-') ? m.rates[plan].credit[key.slice(7)] : m.rates[plan][key];
    return `<section class="panel g-pay"><h2>Maquininha e juros</h2><p class="muted">Confira no app da maquininha. Atualizado em: <b>${dateLabel(m.updatedAt)}</b>.</p>${m.configured ? '' : '<p class="negative"><b>Preencha com as taxas da sua maquininha.</b> Enquanto estiverem em zero, o sistema calcula as vendas sem taxa.</p>'}<form id="machine-form"><div class="field" style="max-width:340px"><label>Plano de recebimento que estou usando</label><select name="plan"><option value="now" ${m.plan === 'now' ? 'selected' : ''}>${esc(m.planNames.now)}</option><option value="d30" ${m.plan === 'd30' ? 'selected' : ''}>${esc(m.planNames.d30)}</option></select></div><div class="form-grid" style="max-width:700px;margin:10px 0"><div class="field"><label>Nome do plano 1</label><input name="planName-now" value="${esc(m.planNames.now)}"></div><div class="field"><label>Nome do plano 2</label><input name="planName-d30" value="${esc(m.planNames.d30)}"></div></div><div class="table-wrap"><table><thead><tr><th>Modalidade</th><th>${esc(m.planNames.now)} (%)</th><th>${esc(m.planNames.d30)} (%)</th></tr></thead><tbody>${rows.map(([key, label]) => `<tr><td>${label}</td><td>${rateInput(`now-${key}`, get('now', key))}</td><td>${rateInput(`d30-${key}`, get('d30', key))}</td></tr>`).join('')}</tbody></table></div><h3 style="margin-top:22px">Cobrança extra padrão (% sobre o preço)</h3><p class="muted">Seu acréscimo sobre a taxa. Padrão: 0.</p><div class="form-grid">${MODALITIES.map(item => `<div class="field"><label>${item.label}</label><input name="extra-${item.key}" type="number" min="0" step="0.01" value="${extra[item.key]}"></div>`).join('')}</div><div class="actions"><button class="primary">Salvar maquininha e juros</button></div></form></section>`;
  }

  function dangerPanel() {
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.innerHTML = `<h2>Apagar movimentações de teste</h2><p class="muted">Apaga vendas, orçamentos, recibos e o resto. <b>Clientes e produtos ficam</b> (com o estoque como está). Exige backup.</p><div class="actions"><button type="button" class="danger" id="reset-movements">Apagar movimentações...</button></div><h2>Zerar dados de teste</h2><p class="muted">Apaga cadastros e vendas para começar de verdade. As configurações ficam. Exige backup.</p><div class="actions"><button type="button" class="danger" id="reset-data">Zerar dados de teste...</button></div>`;
    byId('app').appendChild(panel);
    byId('reset-data').onclick = openResetModal;
    byId('reset-movements').onclick = openMovementsModal;
  }

  // ---------- zerar dados ----------
  // Apaga TUDO que o usuário cadastrou (as configurações ficam). Usado pelo botão "Zerar dados de teste".
  const CLEARED_LISTS = ['clients', 'products', 'sales', 'quotes', 'expenses', 'receipts', 'suppliers', 'purchases', 'reminders', 'payables', 'fixedExpenses', 'ignoredOrders'];
  function clearAllData() {
    CLEARED_LISTS.forEach(key => { (data[key] || []).length = 0; });
    data.counters = {};                 // a numeração (V0001, recibo nº 1...) começa de novo
    data.settings.dasCreated = [];      // as contas do DAS foram apagadas: o do mês pode ser criado de novo
    save();
  }
  App.clearAllData = clearAllData;

  // Apaga só as MOVIMENTAÇÕES (SPECS 43): tudo, menos clientes e produtos (o estoque e o custo dos produtos ficam como estão).
  const MOVEMENT_LISTS = CLEARED_LISTS.filter(key => key !== 'clients' && key !== 'products');
  function clearMovements() {
    MOVEMENT_LISTS.forEach(key => { (data[key] || []).length = 0; });
    data.counters = {};                 // a numeração (V0001, O0001, recibo nº 1...) começa de novo
    data.settings.dasCreated = [];
    save();
  }
  App.clearMovements = clearMovements;

  function openMovementsModal() {
    let backedUp = false;
    openModal(`<h2>Apagar movimentações?</h2><p class="negative"><b>Isto apaga:</b> vendas (com pagamentos e parcelas), orçamentos e ordens de serviço, recibos, compras, contas a pagar, saídas, lembretes, despesas fixas e fornecedores. Não dá para desfazer, a não ser importando um backup.</p><p class="positive"><b>Ficam:</b> clientes, produtos (com o estoque e o custo de hoje) e as configurações.</p><p><b>Passo 1.</b> Baixe um backup agora.</p><p><button type="button" class="secondary" id="mov-backup">Baixar backup</button> <span id="mov-backup-status" class="muted"></span></p><div class="field"><label for="mov-word"><b>Passo 2.</b> Para confirmar, digite APAGAR</label><input id="mov-word" autocomplete="off"></div><div class="actions"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button type="button" class="danger" id="mov-confirm" disabled>Apagar movimentações</button></div>`);
    const refresh = () => { byId('mov-confirm').disabled = !(backedUp && byId('mov-word').value.trim() === 'APAGAR'); };
    byId('mov-backup').onclick = () => { App.backup.exportBackup(); backedUp = true; byId('mov-backup-status').textContent = 'Backup baixado ✓'; refresh(); };
    byId('mov-word').oninput = refresh;
    byId('mov-confirm').onclick = () => {
      clearMovements();
      location.reload();
    };
  }

  function openResetModal() {
    let backedUp = false;
    openModal(`<h2>Zerar dados de teste?</h2><p class="negative"><b>Isto apaga tudo que você cadastrou</b> (clientes, produtos, fornecedores, compras, vendas, orçamentos, lembretes, saídas, contas a pagar, despesas fixas e recibos). Não dá para desfazer, a não ser importando um backup.</p><p><b>Passo 1.</b> Baixe um backup agora.</p><p><button type="button" class="secondary" id="reset-backup">Baixar backup agora</button> <span id="reset-backup-status" class="muted"></span></p><p><b>Passo 2.</b> Digite <b>APAGAR</b> para confirmar.</p><div class="field"><input id="reset-word" autocomplete="off" placeholder="APAGAR"></div><div class="actions"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button type="button" class="danger" id="reset-confirm" disabled>Apagar tudo e começar do zero</button></div>`);
    const refresh = () => { byId('reset-confirm').disabled = !(backedUp && byId('reset-word').value.trim() === 'APAGAR'); };
    byId('reset-backup').onclick = () => { App.backup.exportBackup(); backedUp = true; byId('reset-backup-status').textContent = 'Backup baixado ✓'; refresh(); };
    byId('reset-word').oninput = refresh;
    byId('reset-confirm').onclick = () => {
      clearAllData();
      location.reload();
    };
  }

  // ---------- tela ----------
  function render() {
    byId('app').innerHTML = App.sync.panelHtml() + App.motion.panelHtml() + rulesPanel() + businessPanel() + meiPanel() + machinePanel() + App.serviceOrders.settingsPanel() + App.catalog.settingsPanel() + App.revenue.settingsPanel() + App.pwa.settingsPanel() + App.firstRun.settingsPanels();
    App.serviceOrders.bindSettings();
    App.catalog.bindSettings();
    App.revenue.bindSettings();

    byId('settings-form').onsubmit = event => {
      event.preventDefault();
      const form = new FormData(event.target);
      data.settings.maxInstallments = Math.min(12, Math.max(1, Math.round(Number(form.get('maxInstallments'))) || 12));   // 1 a 12 (em branco = 12)
      data.settings.dueDay = Number(form.get('dueDay'));
      data.settings.defaultMargin = Number(form.get('defaultMargin')) || 0;
      data.settings.defaultMinStock = Math.max(0, Math.round(Number(form.get('defaultMinStock')) || 0));
      data.settings.receiptMode = form.get('receiptMode') === 'each' ? 'each' : 'one';
      save();
      alert('Configurações salvas.');
    };

    // Tamanho da logo do topo: muda na hora enquanto arrasta e grava ao soltar.
    const sizeInput = byId('logo-size');
    sizeInput.oninput = () => { byId('logo-size-out').textContent = `${sizeInput.value} px`; App.branding.setTopHeight(Number(sizeInput.value), false); };
    sizeInput.onchange = () => App.branding.setTopHeight(Number(sizeInput.value), true);
    byId('logo-size-reset').onclick = () => { App.branding.setTopHeight(null, true); sizeInput.value = App.branding.DEFAULT_TOP; byId('logo-size-out').textContent = `${App.branding.DEFAULT_TOP} px`; };

    byId('business-form').onsubmit = event => {
      event.preventDefault();
      const formData = new FormData(event.target);
      Object.assign(data.settings.business, Object.fromEntries(formData));
      data.settings.business.phoneWhatsapp = formData.get('phoneWhatsapp') === 'on';   // caixa desmarcada não vem no formulário
      if (formData.get('showName')) delete data.settings.business.showName; else data.settings.business.showName = false;   // marcado = padrão (não grava nada)
      save();
      App.branding.apply();
      alert('Dados do negócio salvos.');
    };

    // MEI: a caixa "Sou MEI" vale na hora (sem recarregar); os demais campos salvam pelo botão.
    const meiForm = byId('mei-form');
    meiForm.elements.isMei.onchange = () => {
      data.settings.isMei = meiForm.elements.isMei.checked;
      meiForm.querySelector('.mei-fields').hidden = !data.settings.isMei;
      if (data.settings.isMei) App.bills.ensureDas();
      save();
    };
    meiForm.onsubmit = event => {
      event.preventDefault();
      const f = meiForm.elements, s = data.settings, num = (value, fallback) => { const n = Number(String(value).replace(',', '.')); return Number.isFinite(n) && String(value).trim() !== '' ? n : fallback; };
      s.isMei = f.isMei.checked;
      const limit = num(f.meiLimit.value, 81000);
      if (!(limit > 0)) { alert("O limite anual precisa ser maior que zero."); return; }
      s.meiLimit = limit;
      s.meiOpenMonth = f.meiOpenMonth.value || '';
      s.meiWarnPct = Math.min(100, Math.max(1, num(f.meiWarnPct.value, 70)));
      s.meiAlertPct = Math.min(100, Math.max(s.meiWarnPct, num(f.meiAlertPct.value, 90)));
      s.dasValue = f.dasValue.value.trim() === '' ? '' : Math.max(0, num(f.dasValue.value, 0));
      s.dasDay = Math.min(28, Math.max(1, Math.round(num(f.dasDay.value, 20))));
      if (s.isMei) App.bills.ensureDas();
      save();
      alert('Dados do MEI salvos.');
      App.ui.go('settings');
    };

    // escolher uma imagem de logo (principal, do topo ou do PDF)
    document.querySelectorAll('[data-logo]').forEach(input => { input.onchange = async () => {
      try { data.settings.business[input.dataset.logo] = await App.branding.fromFile(input.files[0]); }
      catch (error) { alert(error.message); return; }
      save(); App.branding.apply(); App.ui.go('settings');
    }; });

    byId('machine-form').onsubmit = event => {
      event.preventDefault();
      const form = new FormData(event.target), m = data.settings.machine, before = JSON.stringify([m.plan, m.rates]);
      m.plan = form.get('plan');
      for (const plan of ['now', 'd30']) m.planNames[plan] = (form.get(`planName-${plan}`) || '').trim() || m.planNames[plan];
      m.configured = true;   // o dono já passou por aqui: o aviso de taxas some
      for (const plan of ['now', 'd30']) {
        m.rates[plan].pix = number(form.get(`${plan}-pix`));
        m.rates[plan].debit = number(form.get(`${plan}-debit`));
        for (let n = 1; n <= 12; n++) m.rates[plan].credit[n] = number(form.get(`${plan}-credit-${n}`));
      }
      if (JSON.stringify([m.plan, m.rates]) !== before) m.updatedAt = today();
      for (const item of MODALITIES) data.settings.pricing.extra[item.key] = number(form.get(`extra-${item.key}`)) || 0;
      save();
      alert('Taxas e juros salvos.');
      App.ui.go('settings'); // redesenha a tela inteira (com os painéis de backup e de zerar dados)
    };
  }

  App.ui.registerAction('logo-remove', element => { data.settings.business[element.dataset.key] = null; save(); App.branding.apply(); App.ui.go('settings'); });
  App.ui.registerScreen('settings', render);
  App.ui.onShow('settings', dangerPanel); // roda depois do painel de backup (que é registrado antes)
})();
