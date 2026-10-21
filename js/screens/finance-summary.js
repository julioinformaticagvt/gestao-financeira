// Tela "Resumo" do Financeiro: limite do MEI (se "Sou MEI" estiver ligado) e, abaixo, uma bandejinha por mês.
// O mês atual fica sempre aberto; os outros meses abrem com um clique. Cada bandejinha mostra o que foi recebido, o que
// falta receber, o que falta pagar e o saldo do mês, e dentro dela estão as contas a receber e a pagar daquele mês.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today, monthKey, shiftMonth, sum} = App.format;
  const {data} = App.store;
  const {receivableItems, allPayments, allOutflows, activeSales, saleFee} = App.finance;
  const {receivableRows, monthTray, meter} = App.components;
  const {byId} = App.ui;

  // ---------- Limite do MEI: o bloco com os dois medidores fica em components/meter.js (também usado no topo de Relatórios) ----------
  const meiSection = () => App.components.meiBlock();

  // ---------- Números de um mês ----------
  function monthData(month) {
    const sales = activeSales().filter(s => monthKey(s.date) === month);             // vendido: pela data da venda
    const payments = allPayments().filter(p => monthKey(p.date) === month);          // recebido: pela data do pagamento
    const outs = allOutflows().filter(x => monthKey(x.date) === month);              // saídas já pagas
    const due = receivableItems().filter(i => monthKey(i.due) === month).sort((a, b) => a.due.localeCompare(b.due));
    const bills = data.payables.filter(b => monthKey(b.dueDate) === month).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const received = sum(payments, p => Number(p.amount));
    const out = sum(outs, x => Number(x.amount));
    const fees = sum(sales, saleFee);
    return {
      sales, payments, due, bills, received, out, fees,
      sold: sum(sales, s => s.total),
      charges: sum(payments, p => Number(p.charges || 0)),
      toReceive: sum(due, i => i.balance),
      toPay: sum(bills.filter(b => b.status !== 'paga'), b => Number(b.amount)),
      overdue: due.some(i => i.due < today()) || bills.some(b => b.status !== 'paga' && b.dueDate < today()),
      balance: received - out - fees
    };
  }

  // Todos os meses com algum movimento (mais o mês atual, que sempre existe).
  function allMonths() {
    const set = new Set([today().slice(0, 7)]);
    activeSales().forEach(s => set.add(monthKey(s.date)));
    allPayments().forEach(p => set.add(monthKey(p.date)));
    allOutflows().forEach(x => x.date && set.add(monthKey(x.date)));
    receivableItems().forEach(i => set.add(monthKey(i.due)));
    data.payables.forEach(b => b.dueDate && set.add(monthKey(b.dueDate)));
    return [...set].filter(Boolean).sort();
  }

  const statusBadge = bill => bill.status === 'paga' ? '<span class="badge">Paga</span>' : bill.dueDate < today() ? '<span class="badge warn">Vencida</span>' : '<span class="badge neutral">Pendente</span>';

  function billsTable(bills) {
    const rows = bills.map(b => `<tr><td>${dateLabel(b.dueDate)}</td><td>${esc(b.description)}${b.origin === 'fixa' ? ' <small class="muted">(fixa)</small>' : ''}</td><td>${money(b.amount)}</td><td>${statusBadge(b)}${b.status === 'paga' ? ` <small class="muted">${dateLabel(b.paidAt)}</small>` : ''}</td><td>${b.status === 'paga' ? '' : `<button class="secondary" data-action="bill-pay" data-id="${esc(b.id)}">Pagar</button>`}</td></tr>`).join('');
    return `<div class="table-wrap"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function trayFor(month, now) {
    const d = monthData(month), isNow = month === now;
    const methods = Object.entries(d.payments.reduce((all, p) => { all[p.method] = (all[p.method] || 0) + Number(p.amount); return all; }, {})).sort((a, b) => b[1] - a[1]);
    const empty = !d.sales.length && !d.payments.length && !d.due.length && !d.bills.length && !d.out;
    const body = empty ? '<p class="muted">Sem movimento neste mês.</p>' : [
      `<p class="tray-line">Vendido <b>${money(d.sold)}</b> · Saídas pagas <b>${money(d.out)}</b> · Taxas da maquininha <b>${money(d.fees)}</b> · Multa e juros recebidos <b>${money(d.charges)}</b></p>`,
      methods.length ? `<p class="tray-line">Recebido por forma: ${methods.map(([method, value]) => `${esc(method)} <b>${money(value)}</b>`).join(' · ')}</p>` : '',
      d.due.length ? `<h3 class="tray-sub">Contas a receber do mês</h3>${receivableRows(d.due)}` : '',
      d.bills.length ? `<h3 class="tray-sub">Contas a pagar do mês</h3>${billsTable(d.bills)}` : ''
    ].join('');
    const tag = isNow ? 'Mês atual' : (d.overdue && month < now ? 'Tem vencidas' : '');
    return monthTray({
      screen: 'finance', month, always: isNow, tag, tone: isNow ? 'now' : 'warn',
      stats: [{label: 'Recebido', value: d.received, kind: 'ok'}, {label: 'A receber', value: d.toReceive}, {label: 'A pagar', value: d.toPay, kind: d.toPay > 0 ? 'warn' : ''}, {label: 'Saldo', value: d.balance, kind: d.balance < 0 ? 'negative' : ''}],
      body
    });
  }

  function render() {
    App.bills.generate();   // cria as contas das despesas fixas que faltam (sem duplicar)
    const now = today().slice(0, 7), months = allMonths();
    const future = months.filter(m => m > now), past = months.filter(m => m < now).reverse();
    const section = (title, list) => list.length ? `<h2 class="tray-section">${title}</h2>${list.map(m => trayFor(m, now)).join('')}` : '';
    byId('app').innerHTML = `${meiSection()}<section class="trays"><p class="muted">Clique num mês para abrir.</p>${trayFor(now, now)}${section('Próximos meses', future)}${section('Meses anteriores', past)}</section>`;
  }

  App.ui.registerScreen('finance', render);
  App.financeSummary = {monthData, allMonths};
})();
