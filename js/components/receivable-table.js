// Tabela de parcelas a receber, usada em Contas a receber e na Visão geral.
// Cada linha tem "Receber", "Histórico" (se já houve pagamento) e, se estiver vencida, "Cobrar".
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today} = App.format;

  function receivableRows(rows) {
    if (!rows.length) return '<div class="empty">Nenhuma conta encontrada.</div>';
    const body = rows.map(item => {
      const sale = item.sale || item;
      const overdue = item.due < today();
      const hasHistory = (sale.payments || []).some(payment => sale.installments <= 1 || payment.installment === item.number);
      return `<tr><td>${esc(sale.client)}</td><td>${esc(sale.id)}${item.number ? ` / ${esc(item.number)}` : ''}</td><td>${dateLabel(item.due || sale.due)}</td><td>${money(item.value ?? sale.total)}</td><td><b>${money(item.balance ?? sale.balance)}</b></td><td>${item.charges ? `<b class="negative" title="Saldo + multa e juros por atraso">${money(item.updated)}</b>` : '-'}</td><td><span class="badge ${overdue ? 'warn' : ''}">${overdue ? 'Vencido' : 'Em aberto'}</span></td><td><button class="receive" data-pay="${sale.id}" data-installment="${item.number || 1}">Receber</button>${hasHistory ? ` <button class="secondary" data-action="installment-history" data-sale="${sale.id}" data-installment="${item.number || 1}">Histórico</button>` : ''}${overdue ? ` <button class="secondary" data-action="overdue-message" data-client="${esc(sale.client)}">Cobrar</button>` : (item.number ? ` <button class="secondary" data-action="remind-message" data-sale="${sale.id}" data-installment="${item.number}">Lembrar</button>` : '')}</td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Venda / parcela</th><th>Vencimento</th><th>Original</th><th>Saldo</th><th>Com multa e juros</th><th>Status</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  App.components = Object.assign(App.components || {}, {receivableRows});
})();
