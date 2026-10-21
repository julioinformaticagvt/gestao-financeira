// Relatórios informativos (SPECS, seção 24): Receitas do mês (estilo do relatório mensal de receitas brutas do MEI), Resumo do ano,
// Fechamento do dia, Produtos parados e margem mínima. Também guarda as "Atividades do negócio" e as opções de Configurações.
// Regras: tudo é BRUTO (a taxa da maquininha não é descontada); a receita é o que foi RECEBIDO (data do pagamento); o sistema NÃO calcula
// imposto: os relatórios mostram o aviso "Confira com seu contador". Sempre usa activeSales()/allPayments(), nunca as listas cruas.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today, monthLabel, sum} = App.format;
  const {data, save} = App.store;
  const {activeSales, allPayments, receivableItems, allOutflows, round2, daysBetween} = App.finance;

  const NOTICE = 'Este relatório é informativo e não substitui a declaração oficial. Confira com seu contador.';
  const cfg = () => data.settings;
  const activities = () => cfg().activities || [];
  const activityName = id => { const a = activities().find(x => x.id === id); return a ? a.name : 'Sem atividade'; };

  // ---------- divisão de um pagamento ----------
  // Cada pagamento é dividido entre os itens da venda proporcionalmente ao valor de cada item (já com o desconto aplicado: o
  // desconto é da venda inteira, então a proporção é a mesma). Multa e juros recebidos (payment.charges) ficam numa linha à parte.
  function shares(sale) {
    const items = sale.items || [], total = sum(items, i => Number(i.amount) || 0);
    if (!items.length || total <= 0) return [{type: 'Produto', activityId: '', share: 1}];
    return items.map(i => ({type: i.type === 'Serviço' ? 'Serviço' : 'Produto', activityId: i.activityId || '', share: (Number(i.amount) || 0) / total}));
  }
  function split(payment) {
    const charges = Math.min(Math.max(0, Number(payment.charges) || 0), Number(payment.amount) || 0);
    const base = round2((Number(payment.amount) || 0) - charges), list = shares(payment.sale);
    let used = 0;
    const parts = list.map((s, i) => {
      const amount = i === list.length - 1 ? round2(base - used) : round2(base * s.share);
      used = round2(used + amount);
      return {type: s.type, activityId: s.activityId, amount};
    });
    return {parts, charges: round2(charges), invoice: !!(payment.sale.invoice && payment.sale.invoice.issued)};
  }
  const monthOf = date => String(date || '').slice(0, 7);

  // ---------- Receitas do mês ----------
  function monthRevenue(month) {
    const acc = {commerce: {with: 0, without: 0}, service: {with: 0, without: 0}, charges: 0, details: []};
    for (const p of allPayments().filter(x => monthOf(x.date) === month)) {
      const s = split(p), side = s.invoice ? 'with' : 'without';
      for (const part of s.parts) {
        const bucket = part.type === 'Serviço' ? acc.service : acc.commerce;
        bucket[side] = round2(bucket[side] + part.amount);
      }
      acc.charges = round2(acc.charges + s.charges);
      acc.details.push({date: p.date, sale: p.sale.id, client: p.sale.client, method: p.method, amount: Number(p.amount), invoice: s.invoice,
        text: [...s.parts.filter(x => x.amount > 0).map(x => `${x.type === 'Serviço' ? 'Serviço' : 'Comércio'} ${money(x.amount)}`), ...(s.charges > 0 ? [`Multa e juros ${money(s.charges)}`] : [])].join(' · ')});
    }
    const t = x => round2(x.with + x.without);
    acc.total = round2(t(acc.commerce) + t(acc.service) + acc.charges);
    acc.details.sort((a, b) => a.date.localeCompare(b.date) || a.sale.localeCompare(b.sale));
    return acc;
  }
  const RULE = 'Venda com itens de produto e de serviço: cada pagamento é dividido proporcionalmente ao valor de cada item (depois do desconto). Valores brutos (a taxa da maquininha não é descontada). Multa e juros recebidos aparecem à parte e entram no total. Vendas sem nota informada contam como "sem nota fiscal".';

  function revenueTableHtml(rev) {
    const row = (label, w, wo, strong) => `<tr class="${strong ? 'strong' : ''}"><td>${label}</td><td class="num">${money(w)}</td><td class="num">${money(wo)}</td><td class="num"><b>${money(round2(w + wo))}</b></td></tr>`;
    const c = rev.commerce, s = rev.service;
    return `<table class="doc-table report-table"><thead><tr><th>Receita bruta recebida</th><th class="num">Com nota fiscal</th><th class="num">Sem nota fiscal</th><th class="num">Total</th></tr></thead><tbody>
      ${row('Comércio (produtos)', c.with, c.without)}${row('Serviços', s.with, s.without)}
      <tr><td>Multa e juros recebidos</td><td class="num">-</td><td class="num">-</td><td class="num"><b>${money(rev.charges)}</b></td></tr>
      <tr class="doc-total"><td>Total do mês</td><td class="num">${money(round2(c.with + s.with))}</td><td class="num">${money(round2(c.without + s.without))}</td><td class="num"><b>${money(rev.total)}</b></td></tr></tbody></table>`;
  }
  function detailsHtml(rev) {
    if (!rev.details.length) return '<p class="muted">Nenhum recebimento neste mês.</p>';
    return `<table class="doc-table report-table"><thead><tr><th>Data</th><th>Venda</th><th>Cliente</th><th>Forma</th><th class="num">Valor</th><th>Divisão</th><th>Nota</th></tr></thead><tbody>${rev.details.map(d => `<tr><td>${dateLabel(d.date)}</td><td>${esc(d.sale)}</td><td>${esc(d.client)}</td><td>${esc(App.documents.customerMethod(d.method))}</td><td class="num">${money(d.amount)}</td><td>${esc(d.text)}</td><td>${d.invoice ? 'com nota' : 'sem nota'}</td></tr>`).join('')}</tbody></table>`;
  }
  function revenueTitle() { return cfg().isMei ? 'Relatório mensal de receitas brutas' : 'Receitas do mês'; }
  function revenueCsv(month) {
    const rev = monthRevenue(month), v = n => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
    const rows = [['Comércio (produtos)', v(rev.commerce.with), v(rev.commerce.without), v(round2(rev.commerce.with + rev.commerce.without))], ['Serviços', v(rev.service.with), v(rev.service.without), v(round2(rev.service.with + rev.service.without))], ['Multa e juros recebidos', '', '', v(rev.charges)], ['Total do mês', v(round2(rev.commerce.with + rev.service.with)), v(round2(rev.commerce.without + rev.service.without)), v(rev.total)]];
    return {name: `receitas-do-mes-${month}.csv`, content: App.exporter.toCsv(['Receita bruta recebida', 'Com nota fiscal', 'Sem nota fiscal', 'Total'], rows)};
  }

  // ---------- Resumo do ano ----------
  function yearSummary(year) {
    const months = Array.from({length: 12}, (_, i) => ({month: `${year}-${String(i + 1).padStart(2, '0')}`, commerce: 0, service: 0, charges: 0, total: 0}));
    const byActivity = {};
    for (const p of allPayments().filter(x => String(x.date).slice(0, 4) === String(year))) {
      const s = split(p), m = months[Number(String(p.date).slice(5, 7)) - 1];
      if (!m) continue;
      for (const part of s.parts) {
        if (part.type === 'Serviço') m.service = round2(m.service + part.amount); else m.commerce = round2(m.commerce + part.amount);
        byActivity[part.activityId] = round2((byActivity[part.activityId] || 0) + part.amount);
      }
      m.charges = round2(m.charges + s.charges);
    }
    return finishYear(year, months, byActivity);
  }
  function finishYear(year, months, byActivity) {
    months.forEach(m => { m.total = round2(m.commerce + m.service + m.charges); });
    const total = x => round2(sum(months, m => m[x]));
    return {year, months, byActivity, commerce: total('commerce'), service: total('service'), charges: total('charges'), total: round2(sum(months, m => m.total)),
      salesCount: activeSales().filter(s => String(s.date).slice(0, 4) === String(year)).length, mei: App.finance.meiYear(`${year}-12-31`)};
  }
  const csvNumber = n => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
  function yearHtml(sy) {
    const rows = sy.months.map(m => `<tr><td>${esc(monthLabel(m.month))}</td><td class="num">${money(m.commerce)}</td><td class="num">${money(m.service)}</td><td class="num">${money(m.charges)}</td><td class="num"><b>${money(m.total)}</b></td></tr>`).join('');
    const acts = Object.entries(sy.byActivity).sort((a, b) => b[1] - a[1]).map(([id, v]) => `<tr><td>${esc(activityName(id))}</td><td class="num">${money(v)}</td></tr>`).join('');
    return `<table class="doc-table report-table"><thead><tr><th>Mês</th><th class="num">Comércio</th><th class="num">Serviços</th><th class="num">Multa e juros</th><th class="num">Total</th></tr></thead><tbody>${rows}<tr class="doc-total"><td>Total do ano</td><td class="num">${money(sy.commerce)}</td><td class="num">${money(sy.service)}</td><td class="num">${money(sy.charges)}</td><td class="num"><b>${money(sy.total)}</b></td></tr></tbody></table>
      <h3>Por atividade (sem multa e juros)</h3>${acts ? `<table class="doc-table report-table"><thead><tr><th>Atividade</th><th class="num">Recebido</th></tr></thead><tbody>${acts}</tbody></table>` : '<p class="muted">Sem recebimentos no ano.</p>'}
      <p class="muted">Vendas feitas no ano: <b>${sy.salesCount}</b>.</p>`;
  }
  function yearCsv(year) {
    const sy = yearSummary(year);
    const rows = [...sy.months.map(m => [m.month.slice(5, 7) + '/' + year, csvNumber(m.commerce), csvNumber(m.service), csvNumber(m.charges), csvNumber(m.total)]), ['Total do ano', csvNumber(sy.commerce), csvNumber(sy.service), csvNumber(sy.charges), csvNumber(sy.total)], [], ['Por atividade', 'Recebido'], ...Object.entries(sy.byActivity).map(([id, v]) => [activityName(id), csvNumber(v)])];
    return {name: `resumo-do-ano-${year}.csv`, content: App.exporter.toCsv(['Mês', 'Comércio', 'Serviços', 'Multa e juros', 'Total'], rows)};
  }

  // ---------- Fechamento do dia ----------
  function dayClose(date) {
    const pays = allPayments().filter(p => p.date === date), out = allOutflows().filter(x => x.date === date);
    const byMethod = Object.entries(pays.reduce((all, p) => { const k = App.documents.customerMethod(p.method); all[k] = round2((all[k] || 0) + Number(p.amount)); return all; }, {})).sort((a, b) => b[1] - a[1]);
    const sales = activeSales().filter(s => s.date === date);
    const open = receivableItems();
    const entered = round2(sum(pays, p => Number(p.amount))), left = round2(sum(out, x => Number(x.amount)));
    return {date, byMethod, entered, left, balance: round2(entered - left),
      salesCount: sales.length, salesTotal: round2(sum(sales, s => s.total)),
      credit: {sold: round2(sum(sales.filter(s => s.balance > 0.004), s => s.total)), toReceive: round2(sum(sales, s => s.balance))},
      dueToday: open.filter(i => i.due === date), overdue: open.filter(i => i.due < date),
      billsToday: data.payables.filter(b => b.status !== 'paga' && b.dueDate === date), outflows: out};
  }
  function dayHtml(d) {
    const list = (items, line) => items.length ? `<ul class="os-history">${items.map(line).join('')}</ul>` : '<p class="muted">Nenhum.</p>';
    return `<table class="doc-table report-table"><tbody>
      <tr><td>Entrou (recebimentos)</td><td class="num"><b>${money(d.entered)}</b></td></tr>
      <tr><td>Saiu (saídas e contas pagas)</td><td class="num"><b>${money(d.left)}</b></td></tr>
      <tr class="doc-total"><td>Saldo do dia</td><td class="num"><b>${money(d.balance)}</b></td></tr></tbody></table>
      <h3>Entrou por forma</h3>${d.byMethod.length ? `<table class="doc-table report-table"><tbody>${d.byMethod.map(([m, v]) => `<tr><td>${esc(m)}</td><td class="num">${money(v)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nenhum recebimento.</p>'}
      <h3>Vendas do dia</h3><p>${d.salesCount} venda${d.salesCount === 1 ? '' : 's'} · total ${money(d.salesTotal)} · fiado do dia: vendido ${money(d.credit.sold)}, a receber ${money(d.credit.toReceive)}</p>
      <h3>Parcelas que vencem hoje</h3>${list(d.dueToday, i => `<li>${esc(i.sale.client)} · venda ${esc(i.sale.id)} · ${money(i.balance)}</li>`)}
      <h3>Parcelas vencidas</h3>${list(d.overdue, i => `<li>${esc(i.sale.client)} · venda ${esc(i.sale.id)} · venceu ${dateLabel(i.due)} · ${money(i.balance)}</li>`)}
      <h3>Contas a pagar de hoje</h3>${list(d.billsToday, b => `<li>${esc(b.description)} · ${money(b.amount)}</li>`)}`;
  }

  // ---------- Produtos parados e margem mínima ----------
  function idleProducts(days = Number(cfg().idleDays) || 90) {
    const last = {};
    for (const s of activeSales()) for (const item of s.items || []) { if (item.name && (!last[item.name] || s.date > last[item.name])) last[item.name] = s.date; }
    const now = today();
    return data.products.filter(p => p.type !== 'Serviço' && Number(p.stock) > 0).map(p => {
      const lastSale = last[p.name] || '';
      return {product: p, lastSale, idleDays: lastSale ? daysBetween(lastSale, now) : null, value: round2(Number(p.stock) * Number(p.cost || 0))};
    }).filter(x => x.idleDays === null || x.idleDays > days).sort((a, b) => b.value - a.value);
  }
  const marginOf = p => Number(p.cost) > 0 && Number(p.price) > 0 ? round2((Number(p.price) / Number(p.cost) - 1) * 100) : null;
  function belowMargin() {
    const min = Number(cfg().minMargin) || 0;
    if (!(min > 0)) return [];
    return data.products.filter(p => { const m = marginOf(p); return m !== null && m < min; });
  }
  function idleHtml() {
    const days = Number(cfg().idleDays) || 90, list = idleProducts(days);
    const rows = list.map(x => `<tr><td>${esc(x.product.name)}</td><td class="num">${x.product.stock}</td><td>${x.lastSale ? `${dateLabel(x.lastSale)} (${x.idleDays} dias)` : 'nunca vendido'}</td><td class="num">${money(x.value)}</td></tr>`).join('');
    const below = belowMargin();
    return `<p class="muted">Com estoque e sem venda há mais de <b>${days}</b> dias.</p>${list.length ? `<table class="doc-table report-table"><thead><tr><th>Produto</th><th class="num">Estoque</th><th>Última venda</th><th class="num">Valor parado</th></tr></thead><tbody>${rows}<tr class="doc-total"><td colspan="3">Total parado</td><td class="num"><b>${money(sum(list, x => x.value))}</b></td></tr></tbody></table>` : '<p class="muted">Nenhum produto parado.</p>'}
      ${below.length ? `<h3>Abaixo da margem mínima (${Number(cfg().minMargin)}%)</h3><ul class="os-history">${below.map(p => `<li>${esc(p.name)} · margem ${String(marginOf(p)).replace('.', ',')}%</li>`).join('')}</ul>` : ''}`;
  }

  // ---------- documentos (imprimir / PDF) ----------
  function document_(title, big, dateText, bodyHtml, eco) {
    const D = App.documents, main = `<p class="doc-label">${esc(title.toUpperCase())}</p><p class="doc-value">${esc(big)}</p><p class="doc-muted">${esc(dateText)}</p>`;
    return D.frame(D.header('Relatório', title, today(), eco), main, `${bodyHtml}<p class="doc-foot">${esc(NOTICE)}</p>`, eco);
  }
  function openReport({title, fileName, big, dateText, body}) {
    App.documents.openDocument({title, fileName, build: eco => document_(title, big, dateText, body(), eco)});
  }
  function printRevenue(month) { const rev = monthRevenue(month); openReport({title: revenueTitle(), fileName: `Receitas-${month}`, big: money(rev.total), dateText: monthLabel(month), body: () => revenueTableHtml(rev) + `<p class="doc-note">${esc(RULE)}</p>` + detailsHtml(rev)}); }
  function printYear(year) { const sy = yearSummary(year); openReport({title: `Resumo do ano ${year}`, fileName: `Resumo-${year}`, big: money(sy.total), dateText: `Receita bruta recebida em ${year}`, body: () => yearHtml(sy)}); }
  function printDay(date) { const d = dayClose(date); openReport({title: 'Fechamento do dia', fileName: `Fechamento-${date}`, big: money(d.balance), dateText: dateLabel(date), body: () => dayHtml(d)}); }

  // ---------- Configurações: atividades, mensagens e relatórios ----------
  function settingsPanel() {
    const acts = activities(), m = cfg().messages || {}, M = App.messages;
    const area = (name, label, value) => `<div class="field full"><label>${label}</label><textarea name="${name}" rows="3">${esc(value)}</textarea></div>`;
    return `<section class="panel g-product"><h2>Atividades do negócio</h2><p class="muted">Separe o que entra por atividade (ex.: Informática, Peças).</p>
      <ul class="activity-list">${acts.map(a => `<li><input data-activity="${esc(a.id)}" value="${esc(a.name)}"> <label class="inline-check"><input type="checkbox" data-activity-on="${esc(a.id)}" ${a.active === false ? '' : 'checked'}> ativa</label></li>`).join('') || '<li class="muted">Nenhuma atividade cadastrada.</li>'}</ul>
      <form id="activity-form" class="form-grid"><div class="field"><label>Nova atividade</label><input name="name" placeholder="Ex.: Informática"></div><div class="actions field full"><button class="primary">Salvar atividades</button></div></form></section>
    <section class="panel g-other"><h2>Modelos de mensagem</h2><p class="muted">Marcadores: {cliente}, {valor}, {vencimento}, {os}, {equipamento}, {negocio}.</p><form id="messages-form" class="form-grid">
      ${area('collection', 'Cobrança (marcadores extras: {detalhe} e {total})', M.template('collection'))}
      ${area('reminder', 'Lembrete antes do vencimento (extras: {parcela})', M.template('reminder'))}
      ${area('quote', 'Orçamento', M.template('quote'))}
      ${area('ready', 'Equipamento pronto', cfg().os.msgReady)}
      ${area('thanks', 'Agradecimento (mensagem do recibo)', cfg().business.receiptMessage)}
      <div class="actions field full"><button class="primary">Salvar modelos</button></div></form></section>
    <section class="panel g-pay"><h2>Relatórios e estoque</h2><form id="reports-form" class="form-grid">
      <div class="field"><label>Produto parado: sem venda há mais de (dias)</label><input name="idleDays" type="number" min="1" step="1" value="${Number(cfg().idleDays) || 90}"></div>
      <div class="field"><label>Margem mínima sobre o custo (%) <small>0 = desligada</small></label><input name="minMargin" type="number" min="0" step="0.1" value="${Number(cfg().minMargin) || 0}"></div>
      <div class="actions field full"><button class="primary">Salvar</button></div></form></section>`;
  }
  function bindSettings() {
    const byId = id => document.getElementById(id);
    const act = byId('activity-form');
    if (act) act.onsubmit = event => {
      event.preventDefault();
      const list = activities();
      document.querySelectorAll('[data-activity]').forEach(input => { const a = list.find(x => x.id === input.dataset.activity); if (a && input.value.trim()) a.name = input.value.trim(); });
      document.querySelectorAll('[data-activity-on]').forEach(box => { const a = list.find(x => x.id === box.dataset.activityOn); if (a) a.active = box.checked; });
      const name = act.elements.name.value.trim();
      if (name && !list.some(a => a.name.toLowerCase() === name.toLowerCase())) list.push({id: App.store.newId('act'), name, active: true});
      cfg().activities = list;
      save(); App.ui.go('settings');
    };
    const msg = byId('messages-form');
    if (msg) msg.onsubmit = event => {
      event.preventDefault();
      const f = msg.elements, m = cfg().messages = cfg().messages || {};
      ['collection', 'reminder', 'quote'].forEach(key => { if (f[key].value.trim()) m[key] = f[key].value; });
      if (f.ready.value.trim()) cfg().os.msgReady = f.ready.value.trim();
      if (f.thanks.value.trim()) cfg().business.receiptMessage = f.thanks.value;
      save(); alert('Modelos de mensagem salvos.'); App.ui.go('settings');
    };
    const rep = byId('reports-form');
    if (rep) rep.onsubmit = event => {
      event.preventDefault();
      const f = rep.elements, idle = Math.round(Number(f.idleDays.value)), margin = Number(String(f.minMargin.value).replace(',', '.'));
      cfg().idleDays = idle > 0 ? idle : 90;
      cfg().minMargin = Number.isFinite(margin) && margin > 0 ? margin : 0;
      save(); alert('Salvo.'); App.ui.go('settings');
    };
  }

  App.revenue = {NOTICE, RULE, shares, split, monthRevenue, revenueTableHtml, detailsHtml, revenueTitle, revenueCsv, yearSummary, yearHtml, yearCsv, dayClose, dayHtml,
    idleProducts, idleHtml, belowMargin, marginOf, activityName, activities, printRevenue, printYear, printDay, settingsPanel, bindSettings};
})();
