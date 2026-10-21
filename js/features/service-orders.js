// Ordem de serviço (OS): a mesma ficha do orçamento, com campos de equipamento e andamento (SPECS, seção 22).
// A OS fica em data.quotes com kind:'os' (os orçamentos comuns têm kind:'quote'). Aqui ficam: os status e o histórico, os três
// papéis (comprovante de entrada, orçamento da OS e termo de garantia), as mensagens prontas, os avisos e as garantias a vencer.
// A tela (lista e formulário) continua em screens/quotes.js; as opções editáveis ficam em Configurações.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today, sum} = App.format;
  const {data, save} = App.store;

  const STATUSES = ['Recebido', 'Em análise', 'Aguardando aprovação', 'Aprovado', 'Aguardando peça', 'Em reparo', 'Pronto', 'Entregue'];
  const EXITS = ['Recusado', 'Cancelado'];
  const OPTIONAL = ['Em análise', 'Aprovado', 'Aguardando peça', 'Em reparo'];   // o dono pode desligar estes
  const EQUIPMENT_TYPES = ['PC', 'Notebook', 'Celular', 'Impressora', 'Outro'];

  const cfg = () => data.settings.os;
  const enabled = () => !!(data.settings.os && data.settings.os.enabled);
  const isOs = quote => !!quote && quote.kind === 'os';
  const statusList = () => STATUSES.filter(s => !cfg().statusesOff.includes(s));
  const allStatuses = () => [...statusList(), ...EXITS];
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${today()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const stampLabel = at => `${dateLabel(String(at).slice(0, 10))} ${String(at).slice(11, 16)}`;
  const valueOf = quote => quote.pricing ? quote.pricing.total : Math.max(0, Number(quote.total) - Number(quote.discount || 0));
  const equipmentText = quote => { const e = (quote.os && quote.os.equipment) || {}; return [e.type, e.brand, e.model].filter(Boolean).join(' ') || 'equipamento'; };
  const saleOf = quote => quote.saleId ? data.sales.find(s => s.id === quote.saleId && s.status !== 'Cancelada') : null;

  function newOs() {
    return {
      id: App.store.peekCode('os'), kind: 'os', client: '', product: '', date: today(), discount: 0, status: 'Recebido', updatedAt: today(),
      os: {equipment: {type: 'PC', brand: '', model: '', serial: '', accessories: '', condition: ''}, pin: '', defect: '', diagnosis: '', entryDate: today(), dueDate: '', deliveredAt: '',
        warrantyDays: cfg().warrantyDays, warrantyText: cfg().warrantyText, internalNotes: '', chargeDiagnosis: false, diagnosisFee: 0, history: [], itemsBackup: null}
    };
  }

  // ---------- campos da ficha ----------
  const field = (label, control, full) => `<div class="field${full ? ' full' : ''}"><label>${label}</label>${control}</div>`;
  function fieldsMarkup(quote) {
    const o = quote.os || newOs().os, e = o.equipment || {}, v = x => esc(x ?? '');
    const history = (o.history || []).length ? `<ul class="os-history">${o.history.map(h => `<li><b>${esc(h.status)}</b> · ${stampLabel(h.at)}</li>`).join('')}</ul>` : '<p class="muted">Sem histórico ainda.</p>';
    return [
      field('Tipo de equipamento', `<select name="os_type">${EQUIPMENT_TYPES.map(t => `<option ${e.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`),
      field('Marca', `<input name="os_brand" value="${v(e.brand)}">`),
      field('Modelo', `<input name="os_model" value="${v(e.model)}">`),
      field('Número de série', `<input name="os_serial" value="${v(e.serial)}">`),
      field('Acessórios deixados <small>carregador, mouse...</small>', `<input name="os_accessories" value="${v(e.accessories)}">`, true),
      field('Estado de entrada <small>riscos, avarias</small>', `<input name="os_condition" value="${v(e.condition)}">`, true),
      field('Senha ou PIN do equipamento <small>opcional · nunca é impresso</small>', `<input name="os_pin" value="${v(o.pin)}" autocomplete="off">`),
      field('Defeito relatado pelo cliente', `<textarea name="os_defect" rows="2">${v(o.defect)}</textarea>`, true),
      field('Diagnóstico do técnico', `<textarea name="os_diagnosis" rows="2">${v(o.diagnosis)}</textarea>`, true),
      field('Data de entrada', `<input name="os_entryDate" type="date" value="${v(o.entryDate)}">`),
      field('Previsão de entrega', `<input name="os_dueDate" type="date" value="${v(o.dueDate)}">`),
      field('Garantia (dias)', `<input name="os_warrantyDays" type="number" min="0" step="1" value="${v(o.warrantyDays)}">`),
      field('Texto da garantia', `<textarea name="os_warrantyText" rows="2">${v(o.warrantyText)}</textarea>`, true),
      field('Cobrar diagnóstico se o cliente recusar', `<label class="inline-check"><input type="checkbox" name="os_chargeDiagnosis" ${o.chargeDiagnosis ? 'checked' : ''}> Cobrar</label><input name="os_diagnosisFee" type="number" min="0" step="0.01" placeholder="valor do diagnóstico (R$)" value="${o.diagnosisFee || ''}">`),
      field('Observações internas <small>não aparecem em nenhum papel</small>', `<textarea name="os_internalNotes" rows="2">${v(o.internalNotes)}</textarea>`, true),
      `<div class="field full"><label>Histórico de andamento</label>${history}</div>`
    ].join('');
  }
  const FIELD_NAMES = {
    equipment: ['os_type', 'os_brand', 'os_model', 'os_serial', 'os_accessories', 'os_condition', 'os_pin'],
    defect: ['os_defect', 'os_diagnosis'],
    dates: ['os_entryDate', 'os_dueDate', 'os_warrantyDays', 'os_warrantyText', 'os_chargeDiagnosis', 'os_diagnosisFee'],
    notes: ['os_internalNotes']
  };

  // Lê os campos da OS do formulário e junta ao que o registro já tinha (histórico, data de entrega, cópia dos itens).
  function readFields(form, quote) {
    const f = form.elements, old = quote.os || newOs().os;
    quote.os = {
      ...old,
      equipment: {type: f.os_type.value, brand: f.os_brand.value.trim(), model: f.os_model.value.trim(), serial: f.os_serial.value.trim(), accessories: f.os_accessories.value.trim(), condition: f.os_condition.value.trim()},
      pin: f.os_pin.value, defect: f.os_defect.value.trim(), diagnosis: f.os_diagnosis.value.trim(),
      entryDate: f.os_entryDate.value || today(), dueDate: f.os_dueDate.value || '', warrantyDays: Math.max(0, Math.round(Number(f.os_warrantyDays.value) || 0)),
      warrantyText: f.os_warrantyText.value.trim(), internalNotes: f.os_internalNotes.value.trim(),
      chargeDiagnosis: f.os_chargeDiagnosis.checked, diagnosisFee: Math.max(0, Number(f.os_diagnosisFee.value) || 0)
    };
    if (!quote.os.history) quote.os.history = [];
  }

  // ---------- andamento ----------
  const pushHistory = (quote, status) => { quote.os.history = quote.os.history || []; quote.os.history.push({status, at: stamp()}); };
  function startHistory(quote) { if (!(quote.os.history || []).length) pushHistory(quote, quote.status || 'Recebido'); }

  // Muda o andamento respeitando as regras. Devolve true se mudou.
  function changeStatus(quote, status) {
    if (!isOs(quote) || quote.status === status) return false;
    const sale = saleOf(quote);
    if (status === 'Entregue') {
      if (!sale) { alert('Para marcar como Entregue, feche a venda antes ("Fechar venda").'); return false; }
      if (sale.balance > 0.004 && !confirm(`A venda ${sale.id} ainda tem saldo em aberto de ${money(sale.balance)}. Marcar como entregue mesmo assim?`)) return false;
      quote.os.deliveredAt = today();
    }
    if (status === 'Recusado' && quote.os.chargeDiagnosis && Number(quote.os.diagnosisFee) > 0 && !sale) {
      // recusou: só o diagnóstico é cobrado; guarda os itens para voltar se mudar de ideia
      quote.os.itemsBackup = {items: quote.items, total: quote.total, discount: quote.discount, cost: quote.cost, pricing: quote.pricing, installments: quote.installments, entry: quote.entry};
      const fee = Number(quote.os.diagnosisFee);
      Object.assign(quote, {items: [{name: 'Diagnóstico', type: 'Serviço', qty: 1, unit: fee, unitCost: 0, amount: fee, cost: 0}], total: fee, discount: 0, cost: 0, installments: 1, entry: 0});
      delete quote.pricing;
    } else if (quote.status === 'Recusado' && quote.os.itemsBackup && !sale) {
      const b = quote.os.itemsBackup;
      Object.assign(quote, {items: b.items, total: b.total, discount: b.discount, cost: b.cost, installments: b.installments, entry: b.entry});
      if (b.pricing) quote.pricing = b.pricing;
      quote.os.itemsBackup = null;
    }
    quote.status = status;
    quote.updatedAt = today();
    pushHistory(quote, status);
    save();
    return true;
  }

  // Próximo status ligado, na ordem do fluxo (para o botão "Avançar").
  function nextStatus(quote) {
    const list = statusList(), i = list.indexOf(quote.status);
    return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  }

  // Depois de "Fechar venda": a OS fica pelo menos "Aprovado" (se esse status estiver ligado).
  function afterSale(quote, sale) {
    quote.saleId = sale.id;
    const early = ['Recebido', 'Em análise', 'Aguardando aprovação'];
    if (early.includes(quote.status)) {
      const target = statusList().includes('Aprovado') ? 'Aprovado' : quote.status;
      if (target !== quote.status) { quote.status = target; pushHistory(quote, target); }
    }
  }

  const warrantyLabel = quote => `${quote.os.warrantyDays} dias a partir da entrega`;
  function warrantyUntil(quote) {
    const base = quote.os.deliveredAt || (saleOf(quote) && saleOf(quote).date) || '';
    if (!base || !(quote.os.warrantyDays > 0)) return '';
    const d = new Date(`${base}T12:00:00`);
    d.setDate(d.getDate() + Number(quote.os.warrantyDays));
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // ---------- papéis ----------
  const D = () => App.documents;
  const row = (label, value) => value ? `<div class="doc-row"><span>${label}</span><span class="doc-amount">${esc(value)}</span></div>` : '';
  const note = (label, text) => text ? `<div class="doc-block"><p class="doc-title">${label}</p><p class="doc-muted">${esc(text).replace(/\n/g, '<br>')}</p></div>` : '';
  const signatures = () => '<div class="os-signatures"><div><span></span><small>Cliente</small></div><div><span></span><small>Responsável</small></div></div>';
  const equipmentRows = q => { const e = q.os.equipment; return row('Equipamento', equipmentText(q)) + row('Número de série', e.serial) + row('Acessórios deixados', e.accessories) + row('Estado de entrada', e.condition); };

  // 1) Comprovante de entrada (nunca imprime a senha/PIN)
  function entryDocument(quote, eco) {
    const D_ = D(), o = quote.os, b = data.settings.business;
    const main = `<p class="doc-label">COMPROVANTE DE ENTRADA</p><p class="doc-lead-2">Equipamento recebido</p><p class="doc-who"><b>${esc(equipmentText(quote))}</b></p><p class="doc-who">Cliente: <b>${esc(quote.client)}</b></p><p class="doc-muted">Entrada em ${dateLabel(o.entryDate)}${o.dueDate ? ` · previsão de entrega ${dateLabel(o.dueDate)}` : ''}</p>`;
    const details = D_.section('Equipamento', equipmentRows(quote)) + D_.section('Defeito relatado', note('', o.defect) || '<p class="doc-muted">Não informado.</p>')
      + D_.section('Termos', `<p class="doc-muted">${esc(cfg().entryTerms).replace(/\n/g, '<br>')}</p>`) + signatures()
      + `<p class="doc-foot">${esc((b.name || '').trim() || 'Meu negócio')} · ordem de serviço ${esc(quote.id)}</p>`;
    return D_.frame(D_.header('Ordem de serviço', quote.id, o.entryDate, eco), main, details, eco);
  }

  // 2) Orçamento da OS
  function quoteDocument(quote, eco) {
    const D_ = D(), o = quote.os, items = quote.items || [];
    const rows = items.map(i => `<tr><td>${esc(i.name || 'Item')}</td><td class="num">${i.qty || 1}</td><td class="num">${money(i.amount)}</td></tr>`).join('');
    const sold = sum(items, i => Number(i.amount) || 0), discount = Number(quote.discount) || 0, total = valueOf(quote);
    const pay = quote.pricing ? `${quote.pricing.label}${quote.pricing.installments > 1 ? ` em ${quote.pricing.installments}x` : ''}` : (quote.method || '');
    const main = `<p class="doc-label">ORÇAMENTO</p><p class="doc-lead-2">Valor do serviço</p><p class="doc-value">${money(total)}</p><p class="doc-who">Para <b>${esc(quote.client)}</b> · ${esc(equipmentText(quote))}</p>${quote.validUntil ? `<p class="doc-muted">Válido até ${dateLabel(quote.validUntil)}</p>` : ''}`;
    const details = D_.section('Itens', `<table class="doc-table"><thead><tr><th>Item</th><th class="num">Qtd.</th><th class="num">Valor</th></tr></thead><tbody>${rows}</tbody></table>`)
      + D_.section('Valores', `${row('Soma dos itens', money(sold))}${discount > 0 ? `<div class="doc-row"><span>Desconto</span><span class="doc-amount doc-ok">− ${money(discount)}</span></div>` : ''}<div class="doc-row"><strong>Total</strong><span class="doc-amount"><b>${money(total)}</b></span></div>`)
      + D_.section('Condições', `${row('Forma de pagamento', pay)}${row('Garantia', o.warrantyDays > 0 ? `${o.warrantyDays} dias` : '')}<p class="doc-note">Em caso de atraso: multa de ${data.settings.collection.fine}% e juros de ${data.settings.collection.interest}% ao mês.</p>`)
      + note('Diagnóstico', o.diagnosis) + `<p class="doc-foot">Ordem de serviço ${esc(quote.id)}</p>`;
    return D_.frame(D_.header('Orçamento', quote.id, quote.date, eco), main, details, eco);
  }

  // 3) Termo de garantia
  function warrantyDocument(quote, eco) {
    const D_ = D(), o = quote.os, until = warrantyUntil(quote), sale = saleOf(quote);
    const main = `<p class="doc-label">TERMO DE GARANTIA</p><p class="doc-lead-2">Garantia do serviço</p><p class="doc-value">${o.warrantyDays} dias</p><p class="doc-who"><b>${esc(quote.client)}</b> · ${esc(equipmentText(quote))}</p><p class="doc-muted">${until ? `Válida até ${dateLabel(until)}` : 'Conta a partir da entrega do equipamento'}</p>`;
    const items = (quote.items || []).map(i => i.name).filter(Boolean).join(', ');
    const details = D_.section('Serviço', `${row('Ordem de serviço', quote.id)}${row('Venda', sale ? sale.id : '')}${row('Serviços e peças', items)}${row('Entrega', o.deliveredAt ? dateLabel(o.deliveredAt) : '')}`)
      + D_.section('O que cobre', `<p class="doc-muted">${esc(o.warrantyText).replace(/\n/g, '<br>')}</p>`) + signatures();
    return D_.frame(D_.header('Garantia', quote.id, o.deliveredAt || (sale && sale.date) || today(), eco), main, details, eco);
  }

  // ---------- mensagens ----------
  function fillMessage(template, quote) {
    return String(template).replaceAll('{cliente}', quote.client).replaceAll('{os}', quote.id).replaceAll('{equipamento}', equipmentText(quote)).replaceAll('{valor}', money(valueOf(quote)));
  }
  const MESSAGE_KEYS = {received: 'msgReceived', quote: 'msgQuote', ready: 'msgReady'};
  const messageFor = (quote, kind) => fillMessage(cfg()[MESSAGE_KEYS[kind]], quote);
  const kindForStatus = status => status === 'Pronto' ? 'ready' : status === 'Aguardando aprovação' ? 'quote' : 'received';

  function showMessage(quote, kind) {
    kind = kind || kindForStatus(quote.status);
    App.ui.openModal(`<h2>Avisar o cliente · ${esc(quote.id)}</h2><p class="muted">Copie e envie pelo WhatsApp.</p><div class="field"><textarea id="os-message" class="message-box" rows="6">${esc(messageFor(quote, kind))}</textarea></div><div class="actions"><button type="button" class="secondary" data-action="close-modal">Fechar</button><button type="button" class="primary" id="os-copy">Copiar mensagem</button>${App.whatsapp.buttonHtml(quote.client, 'os-wa')}</div><p id="os-copy-status" class="positive"></p>`);
    App.ui.byId('os-copy').onclick = () => {
      const area = App.ui.byId('os-message'), done = () => { App.ui.byId('os-copy-status').textContent = 'Mensagem copiada!'; };
      if (navigator.clipboard) navigator.clipboard.writeText(area.value).then(done); else { area.select(); document.execCommand('copy'); done(); }
    };
    const wa = App.ui.byId('os-wa');
    if (wa) wa.onclick = () => App.whatsapp.open(App.whatsapp.phoneOf(quote.client), App.ui.byId('os-message').value);
  }

  const open = (title, name, quote, build, kind) => D().openDocument({title, fileName: `${name}-${quote.id}`, client: quote.client, build: eco => build(quote, eco), message: () => messageFor(quote, kind)});
  const showEntry = quote => open(`Comprovante de entrada · ${esc(quote.id)}`, 'Comprovante-de-entrada', quote, entryDocument, 'received');
  const showQuote = quote => open(`Orçamento · ${esc(quote.id)}`, 'Orcamento', quote, quoteDocument, 'quote');
  const showWarranty = quote => open(`Termo de garantia · ${esc(quote.id)}`, 'Termo-de-garantia', quote, warrantyDocument, 'ready');

  // ---------- avisos e garantias ----------
  const lastChange = quote => { const h = (quote.os.history || []).filter(x => x.status === quote.status).pop(); return h ? h.at.slice(0, 10) : (quote.updatedAt || quote.date); };
  function alerts() {
    if (!enabled()) return [];
    const now = today(), list = data.quotes.filter(isOs), result = [], plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
    const days = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);
    const waiting = list.filter(q => q.status === 'Aguardando aprovação' && days(lastChange(q), now) > cfg().approvalDays);
    const ready = list.filter(q => q.status === 'Pronto' && days(lastChange(q), now) > cfg().readyDays);
    if (waiting.length) result.push({urgent: false, kind: 'os', view: 'quotes', text: `${plural(waiting.length, 'ordem de serviço aguardando', 'ordens de serviço aguardando')} aprovação há mais de ${cfg().approvalDays} dias`});
    if (ready.length) result.push({urgent: false, kind: 'os', view: 'quotes', text: `${plural(ready.length, 'equipamento pronto', 'equipamentos prontos')} há mais de ${cfg().readyDays} dias sem retirar`});
    return result;
  }

  // Garantias que vencem nos próximos 30 dias (opcionalmente só de um cliente).
  function warrantiesExpiring(client) {
    if (!enabled()) return [];
    const now = today(), limit = (() => { const d = new Date(`${now}T12:00:00`); d.setDate(d.getDate() + 30); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
    return data.quotes.filter(q => isOs(q) && q.saleId && q.status === 'Entregue' && (!client || q.client === client))
      .map(q => ({quote: q, until: warrantyUntil(q)})).filter(x => x.until && x.until >= now && x.until <= limit).sort((a, b) => a.until.localeCompare(b.until));
  }
  function warrantiesHtml(client) {
    const list = warrantiesExpiring(client);
    if (!list.length) return '';
    return `<section class="block"><h2>Garantias a vencer (30 dias)</h2><ul class="os-history">${list.map(x => `<li><b>${esc(x.quote.id)}</b> · ${esc(x.quote.client)} · ${esc(equipmentText(x.quote))} · vence em ${dateLabel(x.until)}</li>`).join('')}</ul></section>`;
  }

  // ---------- nome da aba ----------
  function applyLabels() {
    const label = enabled() ? 'Orçamentos e OS' : 'Orçamentos';
    const button = document.querySelector('#nav [data-view="quotes"]');
    if (button) button.textContent = label;
    App.ui.setTitle('quotes', label);
  }

  // ---------- Configurações ----------
  const MESSAGE_HELP = 'Marcadores: {cliente}, {os}, {equipamento}, {valor}.';
  function settingsPanel() {
    const c = cfg(), area = (name, label, value) => `<div class="field full"><label>${label}</label><textarea name="${name}" rows="3">${esc(value)}</textarea></div>`;
    return `<section class="panel g-product"><h2>Ordem de serviço</h2><p class="muted">Para equipamentos deixados para conserto. Desligar não apaga nada.</p><form id="os-form" class="form-grid">
      <div class="field full"><label class="inline-check"><input type="checkbox" name="enabled" ${c.enabled ? 'checked' : ''}> <b>Uso ordem de serviço</b></label></div>
      <div class="field"><label>Garantia padrão (dias)</label><input name="warrantyDays" type="number" min="0" step="1" value="${c.warrantyDays}"></div>
      <div class="field"><label>Avisar se aguardando aprovação há mais de (dias)</label><input name="approvalDays" type="number" min="1" step="1" value="${c.approvalDays}"></div>
      <div class="field"><label>Avisar se pronto e sem retirar há mais de (dias)</label><input name="readyDays" type="number" min="1" step="1" value="${c.readyDays}"></div>
      <div class="field full"><label>Etapas que eu uso <small>desmarque as que não usa</small></label><div class="os-steps">${OPTIONAL.map(s => `<label class="inline-check"><input type="checkbox" name="step" value="${esc(s)}" ${c.statusesOff.includes(s) ? '' : 'checked'}> ${esc(s)}</label>`).join('')}</div></div>
      ${area('warrantyText', 'Texto da garantia (padrão)', c.warrantyText)}
      ${area('entryTerms', 'Termos do comprovante de entrada', c.entryTerms)}
      ${area('msgReceived', `Mensagem: equipamento recebido. ${MESSAGE_HELP}`, c.msgReceived)}
      ${area('msgQuote', `Mensagem: orçamento para aprovar. ${MESSAGE_HELP}`, c.msgQuote)}
      ${area('msgReady', `Mensagem: pronto para retirar. ${MESSAGE_HELP}`, c.msgReady)}
      <div class="actions field full"><button class="primary">Salvar ordem de serviço</button></div></form></section>`;
  }
  function bindSettings() {
    const form = App.ui.byId('os-form');
    if (!form) return;
    form.onsubmit = event => {
      event.preventDefault();
      const f = form.elements, c = cfg(), num = (v, d, min) => { const n = Math.round(Number(String(v).replace(',', '.'))); return Number.isFinite(n) && String(v).trim() !== '' ? Math.max(min, n) : d; };
      c.enabled = f.enabled.checked;
      c.warrantyDays = num(f.warrantyDays.value, 90, 0);
      c.approvalDays = num(f.approvalDays.value, 3, 1);
      c.readyDays = num(f.readyDays.value, 7, 1);
      const on = [...form.querySelectorAll('input[name="step"]:checked')].map(x => x.value);
      c.statusesOff = OPTIONAL.filter(s => !on.includes(s));
      ['warrantyText', 'entryTerms', 'msgReceived', 'msgQuote', 'msgReady'].forEach(key => { if (f[key].value.trim()) c[key] = f[key].value.trim(); });
      save();
      applyLabels();
      alert('Configurações da ordem de serviço salvas.');
      App.ui.go('settings');
    };
  }

  // Mudar o andamento pela lista do cartão (um clique).
  document.addEventListener('change', event => {
    const select = event.target.closest && event.target.closest('[data-os-status]');
    if (!select) return;
    const quote = data.quotes.find(q => q.id === select.dataset.osStatus);
    if (quote) {
      const status = select.value;
      if (changeStatus(quote, status)) afterChange(quote, status);
    }
    App.ui.go('quotes');
  });
  // O que acontece depois de mudar o andamento (abre o papel ou a mensagem certa).
  function afterChange(quote, status) {
    if (status === 'Aguardando aprovação') showQuote(quote);
    else if (status === 'Pronto') showMessage(quote, 'ready');
  }

  App.serviceOrders = {
    STATUSES, EXITS, EQUIPMENT_TYPES, FIELD_NAMES, enabled, isOs, statusList, allStatuses, newOs, fieldsMarkup, readFields, startHistory, changeStatus, nextStatus, afterChange, afterSale,
    warrantyLabel, warrantyUntil, equipmentText, valueOf, saleOf, stampLabel, showEntry, showQuote, showWarranty, showMessage, messageFor, alerts, warrantiesExpiring, warrantiesHtml,
    applyLabels, settingsPanel, bindSettings, entryDocument, quoteDocument, warrantyDocument
  };
})();
