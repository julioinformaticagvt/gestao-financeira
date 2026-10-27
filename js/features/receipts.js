// Recibos: número em sequência, um recibo por visita (ou por parcela, conforme as Configurações), cancelamento
// e a janela do recibo. O desenho do documento fica em documents.js.
// O número nunca é reaproveitado: recibo cancelado continua na lista. Cada recibo guarda uma "foto" do que foi
// pago e da situação da conta naquele dia, para o recibo nunca mudar depois.
(() => {
  const App = (window.App = window.App || {});
  const {esc, today} = App.format;
  const {data, save} = App.store;
  const {installmentsFor, daysBetween, chargeRules, round2} = App.finance;

  const pad = number => String(number).padStart(4, '0');
  const find = number => data.receipts.find(r => r.number === Number(number));
  const nextNumber = () => App.store.nextReceiptNumber();   // nº do recibo com contador (nunca reaproveita)

  // Uma linha do recibo (um pagamento aplicado a uma parcela). info = {ch, rules, waived} vindo da tela de receber.
  function lineFor(sale, payment, info = {}) {
    const n = Number(payment.installment) || 0, charges = Number(payment.charges || 0);
    const item = n ? installmentsFor(sale).find(i => i.number === n) : null;
    const due = item ? item.due : (n ? (sale.due || sale.date) : null);
    const ch = info.ch, whole = ch && !ch.collected && Math.abs(ch.owed - charges) < 0.005 && charges > 0;
    return {
      ref: {saleId: sale.id, index: sale.payments.indexOf(payment)},
      saleId: sale.id, saleDate: sale.date, itemsText: App.documents.itemsText(sale),
      items: (sale.items || []).map(i => ({name: i.name || 'Item', qty: i.qty || 1, amount: i.amount})),
      kind: sale.installments > 1 || (sale.legacy && !sale.paidAtSale) ? (n === 0 ? 'entrada' : 'parcela') : 'vista',   // conta antiga de 1 parcela também é parcela   // venda sem parcelas = recibo à vista
      installment: n, of: sale.installments, due,
      value: round2(Number(payment.amount) - charges), charges,
      fine: whole ? ch.fine : 0, interest: whole ? ch.interest : 0, breakdown: !!whole, waived: !!info.waived,
      rule: info.rules || chargeRules(sale, n),
      daysLate: due ? Math.max(0, daysBetween(due, payment.date)) : 0,
      early: due ? Math.max(0, daysBetween(payment.date, due)) : 0
    };
  }

  // Cria UM recibo para uma lista de {sale, payment, info} (pagamentos já gravados nas vendas).
  function build(entries) {
    const b = data.settings.business, first = entries[0];
    const lines = entries.map(e => lineFor(e.sale, e.payment, e.info));
    const date = first.payment.date, client = first.sale.client;
    const after = App.documents.situation(client, date, [...new Set(entries.map(e => e.sale.id))]);
    const hasLate = lines.some(l => l.daysLate > 0);
    const receipt = {
      number: nextNumber(), version: 2, date, createdAt: today(), client, method: first.payment.method,   // createdAt: dia em que o recibo foi emitido (para a 2ª via)
      amount: round2(entries.reduce((total, e) => total + Number(e.payment.amount), 0)),
      saleId: first.sale.id, lines,
      after: {purchases: after.purchases, late: after.late, upcoming: after.upcoming},
      applied: hasLate && after.upcoming.length + after.late.length > 0,   // pagou parcela atrasada e ainda há outras abertas: explica a ordem
      warranty: first.sale.warranty || b.warranty,   // venda de uma OS traz a garantia da OS
      ...(Number(first.sale.discount) > 0 ? {discount: round2(Number(first.sale.discount))} : {}),   // só quando houve desconto (recibos antigos não mudam)
      business: {name: b.name, cnpj: b.cnpj, phone: b.phone, instagram: b.instagram},
      canceled: false
    };
    data.receipts.push(receipt);
    entries.forEach(e => { e.payment.receipt = receipt.number; });
    return receipt;
  }

  // Emite os recibos de vários pagamentos: um só (padrão) ou um por pagamento, conforme Configurações.
  function issueVisit(entries) {
    if (!entries.length) return [];
    if (data.settings.receiptMode !== 'each') return [build(entries)];
    // um recibo por parcela: cada um mostra a conta como estava logo depois do SEU pagamento (os pagamentos seguintes da visita
    // ficam "de lado" só enquanto o recibo é montado)
    return entries.map((entry, i) => {
      const later = entries.slice(i + 1);
      later.forEach(e => { e.payment.voided = true; App.finance.recalcSale(e.sale); });
      const receipt = build([entry]);
      later.forEach(e => { delete e.payment.voided; App.finance.recalcSale(e.sale); });
      return receipt;
    });
  }

  // Um recibo para um único pagamento (venda paga na hora, entrada).
  const issue = (sale, payment, info) => build([{sale, payment, info}]);

  // Cancela o recibo de um pagamento desfeito (o número não é reaproveitado). Devolve o recibo cancelado.
  function cancelFor(payment) {
    const receipt = payment.receipt && find(payment.receipt);
    if (receipt) receipt.canceled = true;
    return receipt || null;
  }

  // Pagamentos ainda válidos que apontam para um recibo.
  function paymentsOf(number) {
    return data.sales.filter(sale => sale.status !== 'Cancelada').flatMap(sale => (sale.payments || []).filter(p => p.receipt === number && !p.voided).map(payment => ({sale, payment})));
  }

  // Depois de desfazer um pagamento de um recibo com vários: emite um recibo novo só com os que continuam valendo.
  function reissueRemaining(number) {
    const entries = paymentsOf(number);
    if (!entries.length) return [];
    const receipts = issueVisit(entries);
    save();
    return receipts;
  }

  // O pagamento foi editado (valor, data ou forma): o recibo acompanha.
  function sync(payment) {
    const receipt = payment.receipt && find(payment.receipt);
    if (!receipt) return;
    receipt.date = payment.date; receipt.method = payment.method;
    if (!receipt.lines) { receipt.amount = payment.amount; return; }
    const line = receipt.lines.find(l => l.ref && payment === (data.sales.find(s => s.id === l.ref.saleId) || {payments: []}).payments[l.ref.index]);
    if (line) { line.charges = Number(payment.charges || 0); line.value = round2(Number(payment.amount) - line.charges); }
    receipt.amount = round2(receipt.lines.reduce((total, l) => total + l.value + l.charges, 0));
  }

  // ---------- janela do recibo ----------
  function show(number) {
    const receipt = find(number);
    if (!receipt) return;
    App.documents.openDocument({
      title: `Recibo nº ${pad(receipt.number)}`, fileName: `Recibo-${pad(receipt.number)}`, client: receipt.client,
      modes: true,   // Resumido / Detalhado (SPECS 41)
      build: (eco, mode) => App.documents.receiptDocument(receipt, eco, {mode, copy: (receipt.createdAt || receipt.date) < today()}),   // reaberto depois do dia da emissão = 2ª via
      message: () => App.documents.receiptMessage(receipt),
      extra: `<div class="field"><label>Garantia (você pode mudar para este recibo)</label><textarea id="receipt-warranty" rows="2">${esc(receipt.warranty || '')}</textarea></div>`,
      onExtra: ({redraw}) => { App.ui.byId('receipt-warranty').oninput = event => { receipt.warranty = event.target.value; save(); redraw(); }; }
    });
  }

  App.ui.registerAction('view-receipt', element => show(element.dataset.number));

  App.receipts = {issue, issueVisit, cancelFor, paymentsOf, reissueRemaining, sync, find, show, pad};
})();
