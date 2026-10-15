// Monta uma venda nova a partir dos dados do formulário (venda direta ou orçamento fechado).
// Vendas pagas na hora (Pix, dinheiro, débito, crédito) já nascem pagas; o carnê gera parcelas a receber.
(() => {
  const App = (window.App = window.App || {});
  const {data} = App.store;
  const {totalsByType, recalcSale} = App.finance;
  const P = App.pricing;

  // pay = resultado de paymentBlock.read(): {items, discount, price, cost, modality, account, installments, base, extra, feeRate, entry, withExtra:{total, fee, net, profit, totalRate}}
  function create({client, date, quoteId, pay, id, osId, warranty}) {
    const meta = P.modality(pay.modality), calc = pay.withExtra, label = P.paymentLabel(pay.modality, pay.account);
    const types = totalsByType(pay.items);
    const sale = {
      id: id || App.store.nextCode('sale'),
      client, product: pay.items[0]?.name || '', date,
      cost: pay.cost, total: calc.total, paid: 0, balance: calc.total,
      installments: pay.modality === 'carne' ? pay.installments : 1,   // só o carnê gera parcelas a receber
      entry: 0, quantity: 1, unitPrice: calc.total, discount: pay.discount,
      method: label, monthlyInterest: 0,
      items: pay.items, productTotal: types.product, serviceTotal: types.service, productType: pay.items[0]?.type || 'Produto',
      payments: [],
      costInformed: true,
      pricing: {
        modality: pay.modality, label, installments: pay.installments, plan: data.settings.machine.plan, account: pay.account,
        baseRate: pay.base, extraRate: pay.extra, feeRate: pay.feeRate, totalRate: calc.totalRate,
        price: pay.price, total: calc.total, fee: calc.fee, net: calc.net, profit: calc.profit
      }
    };
    if (quoteId) sale.quoteId = quoteId;
    if (pay.invoiceIssued) sale.invoice = {issued: true, number: pay.invoiceNumber || ''};   // nota fiscal emitida (relatórios com e sem nota)
    if (osId) sale.osId = osId;                          // veio de uma ordem de serviço ("Origem: OS0007")
    if (warranty) sale.warranty = warranty;              // garantia da OS (texto), usada no recibo
    if (pay.discount > 0) { sale.discountType = pay.discountType; sale.discountValue = pay.discountValue; }   // o que foi digitado (R$ ou %)
    if (pay.firstDue) sale.firstDue = pay.firstDue;     // data da 1ª parcela escolhida (as seguintes seguem o dia padrão)
    if (sale.installments > 1) sale.dueDates = App.finance.dueDates({date: sale.date, count: sale.installments, firstDue: sale.firstDue});   // datas congeladas
    App.stock.consume(sale);                            // dá baixa no estoque dos produtos vendidos

    if (meta.immediate) {
      sale.payments.push({amount: calc.total, date, method: label, installment: 0, note: 'Pagamento na venda', fee: calc.fee});
    } else if (pay.entry > 0) {
      sale.entry = pay.entry;
      sale.payments.push({amount: pay.entry, date, method: 'Entrada (carnê)', installment: 0, note: 'Entrada'});
    }
    recalcSale(sale);
    return sale;
  }

  App.saleBuilder = {create};
})();
