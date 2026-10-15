// Tela "Contas a receber": parcelas em aberto, uma bandejinha por mês de vencimento, com busca por cliente.
// O mês atual fica sempre aberto (mesmo sem nada a receber); os outros abrem com um clique.
(() => {
  const App = (window.App = window.App || {});
  const {money, normalize, sum, today} = App.format;
  const {data} = App.store;
  const {receivableItems} = App.finance;
  const {receivableRows, monthTray} = App.components;
  const {byId} = App.ui;

  function render() {
    const items = receivableItems().sort((a, b) => a.due.localeCompare(b.due));
    const now = today().slice(0, 7);

    byId('app').innerHTML = `<section class="panel"><div class="panel-head"><h2>Contas a receber</h2><span class="muted">Valores ainda previstos para receber. O mês atual fica sempre aberto.</span></div><div class="toolbar"><input id="receivable-search" placeholder="Buscar cliente..."></div><div id="monthly-receivables"></div></section>`;

    const draw = () => {
      const query = normalize(byId('receivable-search').value);
      const filtered = items.filter(item => normalize(item.sale.client).includes(query));
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
      byId('monthly-receivables').innerHTML = data.sales.length ? html : App.firstRun.emptyState({title: 'Você ainda não tem contas a receber.', hint: 'Quando você vender no carnê (parcelado por você), as parcelas aparecem aqui, mês a mês.', action: 'new-sale', label: '+ Nova venda'});
    };
    byId('receivable-search').oninput = draw;
    draw();
  }

  App.ui.registerScreen('receivables', render);
})();
