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
    return `<section class="panel g-pay"><h2>Regras financeiras</h2><p class="muted">Valores alterados valem para novas operações; históricos preservam os valores usados.</p><form id="settings-form" class="form-grid"><div class="field"><label>Máximo de parcelas</label><input name="maxInstallments" type="number" value="${data.settings.maxInstallments}"></div><div class="field"><label>Dia padrão de vencimento</label><input name="dueDay" type="number" min="1" max="28" value="${data.settings.dueDay || 12}"></div><div class="field"><label>Estoque mínimo padrão <small>avisa quando o produto chegar nele (cada produto pode ter o seu)</small></label><input name="defaultMinStock" type="number" min="0" step="1" value="${App.stock.defaultMin()}"></div><div class="field"><label>Margem de ganho padrão (%) <small>em cima do custo, para sugerir o preço dos produtos</small></label><input name="defaultMargin" type="number" min="0" step="0.01" value="${data.settings.defaultMargin ?? 40}"></div><div class="field"><label>Quando o cliente paga várias parcelas de uma vez</label><select name="receiptMode"><option value="one" ${data.settings.receiptMode !== 'each' ? 'selected' : ''}>Um recibo para tudo</option><option value="each" ${data.settings.receiptMode === 'each' ? 'selected' : ''}>Um recibo por parcela</option></select></div><div class="actions field full"><button class="primary">Salvar configurações</button></div></form></section>`;
  }

  // Uma linha de logo: prévia, escolher arquivo e remover.
  function logoRow(key, title, hint) {
    const logo = data.settings.business[key];
    return `<div class="logo-row"><div class="logo-preview">${logo ? `<img alt="" src="${logo.src}">` : '<span class="muted">sem logo</span>'}</div><div><b>${title}</b><br><span class="muted">${hint}</span><br><label class="secondary button-like">Escolher imagem<input type="file" accept="image/*" data-logo="${key}" hidden></label>${logo ? ` <button type="button" class="secondary" data-action="logo-remove" data-key="${key}">Remover</button>` : ''}</div></div>`;
  }

  function businessPanel() {
    const b = data.settings.business;
    return `<section class="panel g-other"><h2>Dados do negócio</h2><p class="muted">Aparecem no recibo. Enquanto um campo estiver vazio, o recibo mostra o nome do campo entre colchetes.</p><form id="business-form" class="form-grid"><div class="field"><label>Nome do negócio</label><input name="name" value="${esc(b.name)}" placeholder="Nome do seu negócio"></div><div class="field"><label>CNPJ ou CPF</label><input name="cnpj" value="${esc(b.cnpj)}" placeholder="CNPJ (00.000.000/0000-00) ou CPF"></div><div class="field"><label>Telefone / WhatsApp</label><input name="phone" value="${esc(b.phone)}"></div><div class="field"><label>Instagram</label><input name="instagram" value="${esc(b.instagram)}" placeholder="@seuperfil"></div><div class="field full"><label>Logo</label><div class="logo-rows">${logoRow('logo', 'Logo principal', 'Vale para o topo do sistema e para o PDF do recibo.')}${logoRow('logoTop', 'Outra logo só para o topo (opcional)', 'Se vazio, usa a logo principal.')}${logoRow('logoPdf', 'Outra logo só para o PDF e o recibo (opcional)', 'Se vazio, usa a logo principal.')}</div></div><div class="field full"><label>Garantia padrão (aparece no recibo; dá para mudar em cada recibo)</label><textarea name="warranty" placeholder="Ex.: 90 dias para serviços e 12 meses de garantia do fabricante para peças">${esc(b.warranty)}</textarea></div><div class="field full"><label>Mensagem padrão do recibo (use {cliente}, {negócio}, {valor}, {forma}, {data}). O agradecimento final (compra quitada, tudo quitado, quanto falta) é acrescentado sozinho</label><textarea name="receiptMessage" rows="6">${esc(b.receiptMessage)}</textarea></div><div class="actions field full"><button class="primary">Salvar dados do negócio</button></div></form></section>`;
  }

  // Painel do MEI: chave "Sou MEI", limite, avisos e DAS. Desligado, somem os medidores, o lembrete do DAS e os avisos.
  function meiPanel() {
    const s = data.settings;
    const dasHint = s.isMei && !(Number(s.dasValue) > 0) ? '<p class="negative">Informe o valor do DAS para o sistema criar o lembrete todo mês.</p>' : '';
    return `<section class="panel g-pay"><h2>MEI</h2><p class="muted">Se o seu negócio é MEI, o sistema mostra na Visão geral o quanto do limite anual você já usou (vendas e receita) e lembra do DAS. O sistema <b>não calcula imposto</b>: o valor do DAS é o que você informar.</p><form id="mei-form" class="form-grid"><div class="field full"><label class="inline-check"><input type="checkbox" name="isMei" ${s.isMei ? 'checked' : ''}> <b>Sou MEI</b> (mostrar os medidores do limite e o lembrete do DAS)</label></div><div class="full mei-fields" ${s.isMei ? '' : 'hidden'}><div class="field"><label>Limite anual (R$)</label><input name="meiLimit" type="number" min="0" step="0.01" value="${s.meiLimit}"></div><div class="field"><label>Mês de abertura do MEI <small>opcional; se foi neste ano, o limite fica proporcional</small></label><input name="meiOpenMonth" type="month" value="${esc(s.meiOpenMonth || '')}"></div><div class="field"><label>Aviso amarelo a partir de (%)</label><input name="meiWarnPct" type="number" min="1" max="100" value="${s.meiWarnPct}"></div><div class="field"><label>Aviso vermelho a partir de (%)</label><input name="meiAlertPct" type="number" min="1" max="100" value="${s.meiAlertPct}"></div><div class="field"><label>Valor do DAS (R$) <small>o que você paga por mês</small></label><input name="dasValue" type="number" min="0" step="0.01" value="${s.dasValue === '' || s.dasValue == null ? '' : s.dasValue}" placeholder="em branco"></div><div class="field"><label>Dia de vencimento do DAS</label><input name="dasDay" type="number" min="1" max="28" value="${s.dasDay}"></div>${dasHint}</div><div class="actions field full"><button class="primary">Salvar MEI</button></div></form></section>`;
  }

  function machinePanel() {
    const m = data.settings.machine, extra = data.settings.pricing.extra;
    const rows = [['pix', 'Pix'], ['debit', 'Débito'], ...Array.from({length: 12}, (_, i) => [`credit-${i + 1}`, i === 0 ? 'Crédito à vista (1x)' : `Crédito ${i + 1}x`])];
    const get = (plan, key) => key.startsWith('credit-') ? m.rates[plan].credit[key.slice(7)] : m.rates[plan][key];
    return `<section class="panel g-pay"><h2>Maquininha e juros</h2><p class="muted">Taxas da sua maquininha, por modalidade: confira no aplicativo da sua maquininha e preencha aqui. Última atualização das taxas: <b>${dateLabel(m.updatedAt)}</b>.</p>${m.configured ? '' : '<p class="negative"><b>Preencha com as taxas da sua maquininha.</b> Enquanto estiverem em zero, o sistema calcula as vendas sem taxa.</p>'}<form id="machine-form"><div class="field" style="max-width:340px"><label>Plano de recebimento que estou usando</label><select name="plan"><option value="now" ${m.plan === 'now' ? 'selected' : ''}>${esc(m.planNames.now)}</option><option value="d30" ${m.plan === 'd30' ? 'selected' : ''}>${esc(m.planNames.d30)}</option></select></div><div class="form-grid" style="max-width:700px;margin:10px 0"><div class="field"><label>Nome do plano 1</label><input name="planName-now" value="${esc(m.planNames.now)}"></div><div class="field"><label>Nome do plano 2</label><input name="planName-d30" value="${esc(m.planNames.d30)}"></div></div><div class="table-wrap"><table><thead><tr><th>Modalidade</th><th>${esc(m.planNames.now)} (%)</th><th>${esc(m.planNames.d30)} (%)</th></tr></thead><tbody>${rows.map(([key, label]) => `<tr><td>${label}</td><td>${rateInput(`now-${key}`, get('now', key))}</td><td>${rateInput(`d30-${key}`, get('d30', key))}</td></tr>`).join('')}</tbody></table></div><h3 style="margin-top:22px">Cobrança extra padrão (% sobre o preço)</h3><p class="muted">É o acréscimo que eu ganho por cima da taxa da maquininha. O padrão é 0 (não cobrar nada a mais): na hora da venda ou do orçamento você digita "Cobrar extra (%)". Se quiser, preencha um valor aqui para já vir sugerido.</p><div class="form-grid">${MODALITIES.map(item => `<div class="field"><label>${item.label}</label><input name="extra-${item.key}" type="number" min="0" step="0.01" value="${extra[item.key]}"></div>`).join('')}</div><div class="actions"><button class="primary">Salvar maquininha e juros</button></div></form></section>`;
  }

  function dangerPanel() {
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.innerHTML = `<h2>Zerar dados de teste</h2><p class="muted">Apaga clientes, produtos, fornecedores, compras, vendas, orçamentos, lembretes, saídas, contas a pagar, despesas fixas e recibos, para começar a usar com clientes reais (a numeração volta a V0001). As configurações (dados do negócio, taxas, juros) ficam. Exige um backup antes.</p><div class="actions"><button type="button" class="danger" id="reset-data">Zerar dados de teste...</button></div>`;
    byId('app').appendChild(panel);
    byId('reset-data').onclick = openResetModal;
  }

  // ---------- zerar dados ----------
  // Apaga TUDO que o usuário cadastrou (as configurações ficam). Usado pelo botão "Zerar dados de teste".
  const CLEARED_LISTS = ['clients', 'products', 'sales', 'quotes', 'expenses', 'receipts', 'suppliers', 'purchases', 'reminders', 'payables', 'fixedExpenses'];
  function clearAllData() {
    CLEARED_LISTS.forEach(key => { (data[key] || []).length = 0; });
    data.counters = {};                 // a numeração (V0001, recibo nº 1...) começa de novo
    data.settings.dasCreated = [];      // as contas do DAS foram apagadas: o do mês pode ser criado de novo
    save();
  }
  App.clearAllData = clearAllData;

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
    byId('app').innerHTML = rulesPanel() + businessPanel() + meiPanel() + machinePanel() + App.serviceOrders.settingsPanel() + App.revenue.settingsPanel() + App.pwa.settingsPanel() + App.firstRun.settingsPanels();
    App.serviceOrders.bindSettings();
    App.revenue.bindSettings();

    byId('settings-form').onsubmit = event => {
      event.preventDefault();
      const form = new FormData(event.target);
      data.settings.maxInstallments = Number(form.get('maxInstallments'));
      data.settings.dueDay = Number(form.get('dueDay'));
      data.settings.defaultMargin = Number(form.get('defaultMargin')) || 0;
      data.settings.defaultMinStock = Math.max(0, Math.round(Number(form.get('defaultMinStock')) || 0));
      data.settings.receiptMode = form.get('receiptMode') === 'each' ? 'each' : 'one';
      save();
      alert('Configurações salvas.');
    };

    byId('business-form').onsubmit = event => {
      event.preventDefault();
      Object.assign(data.settings.business, Object.fromEntries(new FormData(event.target)));
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
