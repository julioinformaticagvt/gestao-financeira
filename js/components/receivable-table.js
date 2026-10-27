// Lista de parcelas a receber, usada em Contas a receber e no Resumo do Financeiro (SPECS 40.5).
// Cada parcela é um CARTÃO (no computador e no celular): inicial do cliente num círculo, nome e "Venda X, parcela N de M",
// vencimento com a situação ("Venceu há 3 dias", "Vence hoje", "Vence em 20 dias"), valores e os botões de sempre:
// "Receber", "Histórico" (se já houve pagamento) e "Cobrar" (vencida) ou "Lembrar" (a vencer).
// Analogia: é a mesma ficha de antes, só que cada parcela ganhou o seu próprio cartãozinho em vez de uma linha de planilha.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today} = App.format;

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // Situação pelo vencimento: quantos dias faltam ou já passaram.
  function situation(due) {
    const days = App.finance.daysBetween(today(), due);
    if (days < 0) return {late: true, text: `Venceu há ${plural(-days, 'dia', 'dias')}`};
    if (days === 0) return {late: false, text: 'Vence hoje'};
    return {late: false, text: `Vence em ${plural(days, 'dia', 'dias')}`};
  }
  // "Venda V0001, parcela 2 de 5" (venda de uma parcela só: "Venda V0001").
  const saleRef = (sale, number) => `Venda ${esc(sale.id)}${number && sale.installments > 1 ? `, parcela ${esc(number)} de ${esc(sale.installments)}` : ''}`;
  // Letra do círculo: a inicial do nome do cliente.
  const initial = name => esc((String(name || '?').trim()[0] || '?').toUpperCase());

  function receivableRows(rows) {
    if (!rows.length) return '<div class="empty">Nenhuma conta encontrada.</div>';
    const body = rows.map(item => {
      const sale = item.sale || item;
      const due = item.due || sale.due;
      const overdue = due < today();
      const s = situation(due);
      const hasHistory = (sale.payments || []).some(payment => (sale.installments <= 1 && !sale.legacy) || payment.installment === item.number);
      const buttons = `<button class="receive" data-pay="${esc(sale.id)}" data-installment="${item.number || 1}">Receber</button>${hasHistory ? ` <button class="secondary" data-action="installment-history" data-sale="${esc(sale.id)}" data-installment="${item.number || 1}">Histórico</button>` : ''}${overdue ? ` <button class="secondary" data-action="overdue-message" data-client="${esc(sale.client)}">Cobrar</button>` : (item.number ? ` <button class="secondary" data-action="remind-message" data-sale="${esc(sale.id)}" data-installment="${item.number}">Lembrar</button>` : '')}`;
      return `<article class="rcv-card${overdue ? ' is-late' : ''}">
        <span class="rcv-avatar" aria-hidden="true">${initial(sale.client)}</span>
        <div class="rcv-who"><b>${esc(sale.client)}</b><small>${saleRef(sale, item.number)}</small></div>
        <div class="rcv-due"><span>${dateLabel(due)}</span><small class="${s.late ? 'negative' : 'soon'}">${s.text}</small></div>
        <div class="rcv-money"><small>Original: ${money(item.value ?? sale.total)}</small><span>Saldo: <b>${money(item.balance ?? sale.balance)}</b></span>${item.charges ? `<small class="negative" title="Saldo + multa e juros por atraso">Com multa e juros: <b>${money(item.updated)}</b></small>` : ''}</div>
        <span class="badge ${overdue ? 'warn' : ''}">${overdue ? 'Vencido' : 'Em aberto'}</span>
        <div class="rcv-actions">${buttons}</div>
      </article>`;
    }).join('');
    return `<div class="rcv-list">${body}</div>`;
  }

  App.components = Object.assign(App.components || {}, {receivableRows, receivableSituation: situation, receivableInitial: initial, saleRef});
})();
