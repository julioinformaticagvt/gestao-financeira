// Tela "Relatórios": fechamento de um mês (vendido, recebido, a receber, saldo) e recebimentos por forma.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, today, monthKey, monthLabel, sum} = App.format;
  const {data} = App.store;
  const {receivableItems, allPayments, allOutflows, monthTypeTotals, activeSales, saleFee} = App.finance;
  const {barChart} = App.components;
  const {byId} = App.ui;

  // ---------- abas do Relatórios ----------
  const TABS = [['month', 'Mês'], ['revenue', 'Receitas do mês'], ['year', 'Resumo do ano'], ['day', 'Fechamento do dia'], ['idle', 'Produtos parados']];
  let tab = 'month';
  const tabsHtml = () => `<div class="report-tabs">${TABS.map(([key, label]) => `<button type="button" class="${key === tab ? 'primary' : 'secondary'}" data-report-tab="${key}">${label}</button>`).join('')}</div>`;
  function bindTabs() {
    document.querySelectorAll('[data-report-tab]').forEach(button => { button.onclick = () => { tab = button.dataset.reportTab; show(); }; });
  }
  const R = () => App.revenue;

  // Receitas do mês, Resumo do ano, Fechamento do dia e Produtos parados (seção 24 da spec).
  function renderExtra(state) {
    const notice = `<p class="muted">${esc(R().NOTICE)}</p>`;
    let body = '';
    if (tab === 'revenue') {
      const month = state.month || today().slice(0, 7), rev = R().monthRevenue(month);
      body = `<div class="panel-head"><h2>${esc(R().revenueTitle())}</h2><input id="rep-month" type="month" value="${month}"></div>${R().revenueTableHtml(rev)}<p class="muted">${esc(R().RULE)}</p><div class="actions"><button type="button" class="secondary" id="rep-print">Imprimir / PDF</button><button type="button" class="secondary" id="rep-csv">Exportar CSV</button></div><details><summary>Pagamentos que compõem o mês (${rev.details.length})</summary>${R().detailsHtml(rev)}</details>`;
    } else if (tab === 'year') {
      const year = state.year || today().slice(0, 4), sy = R().yearSummary(year);
      const chart = barChart(sy.months.map(m => ({label: monthLabel(m.month).split(' ')[0].slice(0, 3), first: m.total})), 'Recebido no mês', null, {color: 'var(--ok)'});
      const mei = data.settings.isMei ? `<div class="meters">${App.components.meter({title: 'Receita do ano', value: sy.mei.received, limit: sy.mei.limit, color: '#1d7a46', warnPct: Number(data.settings.meiWarnPct) || 70, alertPct: Number(data.settings.meiAlertPct) || 90, main: true, note: 'Compara com o limite do MEI. Confira com seu contador.', overText: 'Você passou do limite. Procure seu contador.', lines: []})}</div>` : '';
      body = `<div class="panel-head"><h2>Resumo do ano</h2><input id="rep-year" type="number" min="2000" max="2100" value="${year}" style="width:100px"></div>${chart}${mei}${R().yearHtml(sy)}<div class="actions"><button type="button" class="secondary" id="rep-print">Imprimir / PDF</button><button type="button" class="secondary" id="rep-csv">Exportar CSV</button></div>`;
    } else if (tab === 'day') {
      const date = state.date || today();
      body = `<div class="panel-head"><h2>Fechamento do dia</h2><input id="rep-day" type="date" value="${date}"></div>${R().dayHtml(R().dayClose(date))}<div class="actions"><button type="button" class="secondary" id="rep-print">Imprimir / PDF</button></div>`;
    } else {
      body = `<h2>Produtos parados</h2>${R().idleHtml()}`;
    }
    byId('app').innerHTML = `<section class="panel">${tabsHtml()}${body}${notice}</section>`;
    bindTabs();
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    if (tab === 'revenue') {
      const m = () => byId('rep-month').value || state.month;
      byId('rep-month').onchange = event => { state.month = event.target.value; show(); };
      on('rep-print', () => R().printRevenue(m())); on('rep-csv', () => { const f = R().revenueCsv(m()); App.exporter.download(f.name, f.content); });
    } else if (tab === 'year') {
      const y = () => String(byId('rep-year').value || state.year);
      byId('rep-year').onchange = event => { state.year = event.target.value; show(); };
      on('rep-print', () => R().printYear(y())); on('rep-csv', () => { const f = R().yearCsv(y()); App.exporter.download(f.name, f.content); });
    } else if (tab === 'day') {
      byId('rep-day').onchange = event => { state.date = event.target.value; show(); };
      on('rep-print', () => R().printDay(byId('rep-day').value || today()));
    }
  }

  const extraState = {};
  function show(month) {
    if (tab === 'month') render(month); else renderExtra(extraState);
  }

  function render(selectedMonth) {
    const month = selectedMonth || today().slice(0, 7);
    const sales = activeSales().filter(s => monthKey(s.date) === month);                // vendido: pela data da venda
    const payments = allPayments().filter(p => monthKey(p.date) === month);            // recebido: pela data do pagamento
    const expenses = allOutflows().filter(x => monthKey(x.date) === month);              // saídas: as antigas e as contas a pagar já pagas
    const future = receivableItems().filter(i => monthKey(i.due) === month);           // a receber: pela data de vencimento
    const sold = sum(sales, s => s.total);
    const received = sum(payments, p => Number(p.amount));
    const out = sum(expenses, x => x.amount);
    const charges = sum(payments, p => Number(p.charges || 0));                          // multa e juros recebidos
    const open = sum(future, i => i.balance);
    const fees = sum(sales, saleFee);                                                    // taxas da maquininha (já descontadas do saldo)
    const types = monthTypeTotals(month);   // mês escolhido

    // Recebimentos por forma: barras horizontais, uma cor por forma (a cor sempre vem com o nome e o valor).
    // Aqui é uso interno, então Pix PJ e Pix PF aparecem separados.
    const {methodColor} = App.components;   // as cores das formas de pagamento ficam em components/bar-chart.js (as mesmas da Visão geral)
    const methodTotals = Object.entries(payments.reduce((all, p) => { all[p.method] = (all[p.method] || 0) + Number(p.amount); return all; }, {})).sort((a, b) => b[1] - a[1]);
    const methodMax = methodTotals.length ? methodTotals[0][1] : 0;
    const byMethod = methodTotals.map(([method, value]) => `<div class="mbar"><span class="mname"><i style="background:${methodColor(method)}"></i>${esc(method)}</span><div class="mtrack"><div class="mfill" style="width:${methodMax ? Math.max(2, value / methodMax * 100) : 0}%;background:${methodColor(method)}"></div></div><b>${money(value)}</b></div>`).join('') || '<div class="empty">Nenhum recebimento no mês.</div>';

    byId('app').innerHTML = `<section class="panel">${tabsHtml()}<section><h2>Faturamento por tipo</h2><div class="type-summary"><span>Produtos: ${money(types.product)}</span><span class="warning">Serviços: ${money(types.service)}</span><b>Total: ${money(types.product + types.service)}</b></div></section><div class="panel-head"><h2>Relatório mensal</h2><input id="report-month" type="month" value="${month}"></div><div class="cards"><div class="card"><span class="label">Total vendido</span><div class="metric accent">${money(sold)}</div></div><div class="card"><span class="label">Recebido</span><div class="metric positive">${money(received)}</div></div><div class="card"><span class="label">Ainda a receber</span><div class="metric warning">${money(open)}</div></div><div class="card"><span class="label">Saldo financeiro</span><div class="metric ${received - out - fees < 0 ? 'negative' : 'positive'}">${money(received - out - fees)}</div></div></div><p class="muted">Taxas da maquininha neste mês: ${money(fees)} (já descontadas do saldo financeiro). Multa e juros recebidos: ${money(charges)}. Ticket médio: ${money(sales.length ? sold / sales.length : 0)}. A receber no mês seguinte: ${money(sum(receivableItems().filter(i => monthKey(i.due) === App.format.shiftMonth(month, 1)), i => i.balance))}.</p>${barChart([{label: monthLabel(month).split(' ')[0].slice(0, 3), first: sold, second: received}], 'Vendido', 'Recebido')}<h2>Recebimentos por forma</h2>${byMethod}</section>`;
    byId('app').insertAdjacentHTML('beforeend', App.serviceOrders.warrantiesHtml());   // garantias que vencem nos próximos 30 dias

    byId('report-month').onchange = event => render(event.target.value);
    bindTabs();
  }

  App.ui.registerScreen('reports', () => show());
})();
