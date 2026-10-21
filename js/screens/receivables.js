// Tela "Contas a receber": parcelas em aberto, uma bandejinha por mês de vencimento, com busca por cliente.
// O mês atual fica sempre aberto (mesmo sem nada a receber); os outros abrem com um clique.
(() => {
  const App = (window.App = window.App || {});
  const {money, normalize, sum, today} = App.format;
  const {data} = App.store;
  const {receivableItems} = App.finance;
  const {receivableRows, monthTray} = App.components;
  const {byId} = App.ui;

  // Filtro em pílulas (SPECS 40.5): Todas / Vencidas / A vencer, cada uma com a contagem. Fica lembrado enquanto a página está aberta.
  let filter = 'all';
  const FILTERS = [['all', 'Todas'], ['late', 'Vencidas'], ['next', 'A vencer']];
  // "Ordenar por" (SPECS 42): dentro de cada mês. Fica lembrado neste aparelho.
  const SORTS = {
    'due-asc': ['Vencimento (mais próximo)', (a, b) => a.due.localeCompare(b.due)],
    'due-desc': ['Vencimento (mais distante)', (a, b) => b.due.localeCompare(a.due)],
    'client': ['Cliente (A a Z)', (a, b) => a.sale.client.localeCompare(b.sale.client, 'pt-BR', {sensitivity: 'base'})],
    'balance-desc': ['Saldo (maior primeiro)', (a, b) => b.balance - a.balance],
    'balance-asc': ['Saldo (menor primeiro)', (a, b) => a.balance - b.balance]
  };
  const order = () => App.sortable.cardSort('receivables', 'due-asc');
  const passes = (item, which) => which === 'all' || (which === 'late' ? item.due < today() : item.due >= today());

  function render() {
    const items = receivableItems().sort((a, b) => a.due.localeCompare(b.due));
    const now = today().slice(0, 7);

    byId('app').innerHTML = `<section class="panel"><div class="panel-head"><h2>Contas a receber</h2></div><div class="toolbar"><input id="receivable-search" placeholder="Buscar cliente..."></div><div class="pill-filters" id="receivable-filters" role="group" aria-label="Mostrar"></div><label class="card-sort">Ordenar por <select id="receivable-sort">${Object.entries(SORTS).map(([key, [label]]) => `<option value="${key}"${order().value() === key ? ' selected' : ''}>${label}</option>`).join('')}</select></label><div id="monthly-receivables"></div></section>`;

    const draw = () => {
      const query = normalize(byId('receivable-search').value);
      const found = items.filter(item => normalize(item.sale.client).includes(query));
      byId('receivable-filters').innerHTML = FILTERS.map(([key, label]) => `<button type="button" class="filter-pill${filter === key ? ' active' : ''}" data-rcv-filter="${key}" aria-pressed="${filter === key}">${label}, ${found.filter(item => passes(item, key)).length}</button>`).join('');
      const filtered = found.filter(item => passes(item, filter)).sort((SORTS[order().value()] || SORTS['due-asc'])[1]);
      const byMonth = filtered.reduce((all, item) => { (all[item.due.slice(0, 7)] ??= []).push(item); return all; }, {});
      byMonth[now] = byMonth[now] || [];   // o mês atual sempre aparece
      const html = Object.keys(byMonth).sort().map(month => {
        const monthItems = byMonth[month], total = sum(monthItems, item => item.balance);
        const late = month < now;
        const body = monthItems.length
          ? `${receivableRows(monthItems)}<p class="month-total"><b>Total previsto para o mês: ${money(total)}</b> · ${monthItems.length} vencimento${monthItems.length === 1 ? '' : 's'}</p>`
          : '<p class="muted">Nada a receber neste mês.</p>';
        return monthTray({
          screen: 'receivables', month, always: month === now,
          tag: month === now ? 'Mês atual' : late ? 'Vencido' : `${monthItems.length} vencimento${monthItems.length === 1 ? '' : 's'}`, tone: month === now ? 'now' : late ? 'warn' : '',
          stats: [{label: 'A receber', value: total, kind: late && total > 0 ? 'negative' : ''}], body
        });
      }).join('');
      byId('monthly-receivables').innerHTML = data.sales.length ? html : App.firstRun.emptyState({title: 'Você ainda não tem contas a receber.', hint: 'Vendas no carnê aparecem aqui.', action: 'new-sale', label: '+ Nova venda'});
    };
    byId('receivable-search').oninput = draw;
    byId('receivable-sort').onchange = event => { order().set(event.target.value); draw(); };
    byId('receivable-filters').onclick = event => { const pill = event.target.closest('[data-rcv-filter]'); if (pill) { filter = pill.dataset.rcvFilter; draw(); } };
    draw();
  }

  App.ui.registerScreen('receivables', render);
})();
