// Regras financeiras: parcelas, vencimentos, multa e juros por atraso, contas a receber, lucro e tipos de item.
// Aqui só tem cálculo; nada de tela.
(() => {
  const App = (window.App = window.App || {});
  const {data} = App.store;
  const {today} = App.format;

  // Formas de pagamento/recebimento das telas INTERNAS (qual conta do banco, ou dinheiro...). O cliente só vê "Pix".
  const PAY_METHODS = ['PIX PJ', 'PIX PF', 'Dinheiro', 'Cartão', 'Transferência', 'Boleto'];

  const round2 = number => Math.round((Number(number) + Number.EPSILON) * 100) / 100;
  const daysBetween = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);

  // Vendas canceladas saem de todos os números (continuam guardadas e aparecem na lista de vendas).
  const activeSales = () => data.sales.filter(sale => sale.status !== 'Cancelada');
  // Pagamentos desfeitos continuam no histórico, mas não contam em nenhum número.
  const activePayments = sale => (sale.payments || []).filter(payment => !payment.voided);
  // Parte de um pagamento que abate a parcela (o resto é multa e juros).
  const principalOf = payment => Number(payment.amount) - Number(payment.charges || 0);

  // Refaz "pago" e "saldo" de uma venda a partir dos pagamentos que valem (só a parte da parcela).
  function recalcSale(sale) {
    sale.paid = round2(activePayments(sale).reduce((total, payment) => total + principalOf(payment), 0));
    sale.balance = Math.max(0, round2(sale.total - sale.paid));
  }

  // Soma meses a uma data, sempre caindo no "dia de vencimento" configurado (padrão 12).
  function addMonths(date, months) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(Number(data.settings.dueDay) || 12);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  // Dia do mês, sem passar do último dia (31 em mês de 30 dias vira 30).
  function monthDay(month, day) {
    const [year, mon] = month.split('-').map(Number), last = new Date(year, mon, 0).getDate();
    return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
  }

  // Datas de vencimento das parcelas. Sem "firstDue": a 1ª vence no dia padrão do mês seguinte à venda.
  // Com "firstDue" (o usuário escolheu a data da 1ª): a 1ª vence nela e as seguintes, no dia padrão dos meses seguintes.
  // "extraDues" (opcional): datas escolhidas à mão da 2ª parcela em diante; a posição vazia segue o dia padrão.
  function dueDates({date, count, firstDue, extraDues}) {
    const day = Number(data.settings.dueDay) || 12;
    return Array.from({length: count}, (_, i) => {
      if (i > 0 && extraDues && extraDues[i - 1]) return extraDues[i - 1];
      if (!firstDue) return addMonths(date, i + 1);
      return i === 0 ? firstDue : monthDay(App.format.shiftMonth(firstDue.slice(0, 7), i), day);
    });
  }

  // Parcelas de um carnê ANTES de gravar (usado na prévia do formulário): [{number, due, value}]
  function scheduleFor({date, total, entry = 0, installments, firstDue, extraDues}) {
    const financed = Math.max(0, total - (Number(entry) || 0)), value = financed / installments;
    const dates = dueDates({date, count: installments, firstDue, extraDues});
    return dates.map((due, i) => ({number: i + 1, due, value: i === installments - 1 ? round2(financed - round2(value) * i) : round2(value)}));
  }

  // As parcelas de uma venda. Elas NÃO ficam gravadas: são calculadas toda vez a partir da venda.
  // Venda sem parcelamento = uma parcela só, vencendo na data da venda.
  function installmentsFor(sale) {
    if (sale.installments <= 1) return [{number: 1, due: sale.due || sale.date, value: sale.total, balance: sale.balance, paid: sale.paid}];
    const financed = Math.max(0, sale.total - (Number(sale.entry) || 0));
    const value = round2(financed / sale.installments);   // cada parcela em centavos
    const frozen = sale.dueDates && sale.dueDates.length === sale.installments;   // datas congeladas na venda (não mudam se o dia padrão mudar)
    const dates = frozen ? sale.dueDates : dueDates({date: sale.date, count: sale.installments, firstDue: sale.firstDue, extraDues: sale.extraDues});
    // quanto já foi pago em cada parcela (só a parte que abate a parcela)
    const paidBy = activePayments(sale).reduce((all, payment) => {
      if (payment.installment) all[payment.installment] = (all[payment.installment] || 0) + principalOf(payment);
      return all;
    }, {});
    return Array.from({length: sale.installments}, (_, i) => {
      const v = i === sale.installments - 1 ? round2(financed - value * i) : value;   // a última absorve o arredondamento
      const paid = Math.min(paidBy[i + 1] || 0, v);
      return {number: i + 1, due: dates[i], value: v, paid: round2(paid), balance: round2(v - paid)};
    });
  }

  // ---------- multa e juros por atraso ----------
  // Regras valem por parcela: as da venda (se o usuário mudou na cobrança) ou as padrão (Financeiro > Regras de cobrança).
  function chargeRules(sale, number) {
    const own = (sale.chargeRules || {})[number], standard = data.settings.collection;
    return {fine: own ? own.fine : standard.fine, interest: own ? own.interest : standard.interest};
  }
  const waiverOf = (sale, number) => (sale.waivers || {})[number] || {};

  // Multa e juros de uma parcela vencida, em uma data (padrão: hoje).
  //  - multa: uma vez só, % sobre o que faltava da parcela no vencimento;
  //  - juros: % ao mês, proporcional aos DIAS de atraso, sobre o que ainda falta da parcela (sem juros sobre juros);
  //  - começa no dia seguinte ao vencimento; os pagamentos abatem primeiro multa e juros, depois a parcela.
  // Devolve {fine, interest, collected, owed}: "owed" é o que ainda falta pagar de multa e juros.
  function chargesFor(sale, item, asOf = today(), rulesOverride) {
    const none = {fine: 0, interest: 0, collected: 0, owed: 0};
    if (!(item.due < asOf)) return none;
    if (daysBetween(item.due, asOf) <= (Number(data.settings.collection.grace) || 0)) return none;   // dentro da tolerância: não cobra nada
    const rules = rulesOverride || chargeRules(sale, item.number), waiver = waiverOf(sale, item.number);
    const payments = activePayments(sale)
      .filter(p => (sale.installments <= 1 || p.installment === item.number) && p.date <= asOf)
      .sort((a, b) => a.date.localeCompare(b.date));
    let principal = item.value, cursor = item.due, interest = 0, collected = 0, principalAtDue = null;
    for (const payment of payments) {
      if (payment.date > cursor) {
        if (principalAtDue === null) principalAtDue = principal;
        interest += principal * rules.interest / 100 * daysBetween(cursor, payment.date) / 30;
        cursor = payment.date;
      }
      principal -= principalOf(payment);
      collected += Number(payment.charges || 0);
    }
    if (principalAtDue === null) principalAtDue = principal;
    if (asOf > cursor) interest += Math.max(0, principal) * rules.interest / 100 * daysBetween(cursor, asOf) / 30;
    const fine = waiver.fine ? 0 : round2(Math.max(0, principalAtDue) * rules.fine / 100);
    const interestTotal = waiver.interest ? 0 : round2(interest);
    return {fine, interest: interestTotal, collected: round2(collected), owed: Math.max(0, round2(fine + interestTotal - collected))};
  }

  // Todas as parcelas que ainda têm saldo a receber, cada uma ligada à sua venda, com multa e juros de hoje.
  const receivableItems = () => activeSales().flatMap(sale => installmentsFor(sale).filter(i => i.balance > 0.004).map(i => {
    const ch = chargesFor(sale, i);
    return {...i, sale, charges: ch.owed, updated: round2(i.balance + ch.owed)};
  }));

  // Todos os pagamentos que valem, cada um ligado à sua venda.
  const allPayments = () => activeSales().flatMap(sale => activePayments(sale).map(payment => ({...payment, sale})));

  // Tudo que saiu do caixa: as "saídas" antigas e as contas a pagar já pagas.
  const allOutflows = () => [
    ...data.expenses.map(x => ({date: x.date, amount: Number(x.amount), description: x.description, category: x.category, method: x.method})),
    ...data.payables.filter(p => p.status === 'paga').map(p => ({date: p.paidAt, amount: Number(p.amount), description: p.description, category: p.category, method: p.method}))
  ];

  // 'Produto' ou 'Serviço' de um item pelo nome (se não achar, é Produto).
  const itemType = name => (App.store.findByName('products', name) || {}).type || 'Produto';

  // Soma uma lista de itens separando Produto e Serviço: {product: 0, service: 0}
  const totalsByType = rows => rows.reduce((all, row) => { all[row.type === 'Serviço' ? 'service' : 'product'] += Number(row.amount) || 0; return all; }, {product: 0, service: 0});

  // Faturamento de produtos e serviços das vendas de um mês (AAAA-MM).
  const monthTypeTotals = month => activeSales().filter(sale => sale.date.slice(0, 7) === month).reduce((all, sale) => { all.product += sale.productTotal || 0; all.service += sale.serviceTotal || 0; return all; }, {product: 0, service: 0});

  // Lucro líquido de uma venda. Só vendas novas (com o bloco "pricing") têm o custo informado;
  // as antigas ficam de fora para o número não fingir ser mais certo do que é.
  const saleProfit = sale => sale.pricing && sale.costInformed ? {known: true, value: sale.pricing.profit} : {known: false, value: 0};
  // Taxa da maquininha paga numa venda (R$).
  const saleFee = sale => (sale.pricing && sale.pricing.fee) || 0;

  // Produto ou serviço digitado numa venda/orçamento que ainda não existe no cadastro: é cadastrado na hora (só com o nome e os
  // valores digitados), para a venda ficar ligada a um produto de verdade.
  function ensureProducts(items) {
    for (const item of items || []) {
      const name = String(item.name || '').trim();
      if (!name || App.store.findByName('products', name)) continue;
      data.products.push({name, sku: '', type: item.type === 'Serviço' ? 'Serviço' : 'Produto', cost: Number(item.unitCost) || 0, price: Number(item.unit) || 0, stock: 0});
    }
  }

  // Limite do MEI no ano de "asOf": a RECEITA (o que realmente entrou, pela data do pagamento) é o que decide o enquadramento;
  // as VENDAS (o que foi vendido, mesmo a receber) servem de previsão. Valores brutos (a taxa da maquininha não é descontada).
  // Receita = soma do "amount" de allPayments() do ano (já fora: pagamentos desfeitos e de vendas canceladas); inclui entradas e a
  // parte de multa e juros recebida. Vendas = soma do "total" de activeSales() do ano, pela data da venda.
  function meiYear(asOf = today()) {
    const s = data.settings, year = asOf.slice(0, 4);
    const sum = (list, pick) => list.reduce((total, item) => total + (Number(pick(item)) || 0), 0);
    const base = Number(s.meiLimit) || 81000;
    let startMonth = 1;
    if (s.meiOpenMonth && String(s.meiOpenMonth).slice(0, 4) === year) startMonth = Math.min(12, Math.max(1, Number(String(s.meiOpenMonth).slice(5, 7)) || 1));
    const months = 13 - startMonth;                       // o mês de abertura conta inteiro
    const limit = round2(base / 12 * months);
    const sales = activeSales().filter(sale => String(sale.date).slice(0, 4) === year);
    const sold = round2(sum(sales, sale => sale.total));
    const received = round2(sum(allPayments().filter(p => String(p.date).slice(0, 4) === year), p => p.amount));
    const elapsed = Math.max(1, Number(asOf.slice(5, 7)) - startMonth + 1);
    const average = round2(received / elapsed);
    return {year, limit, months, sold, received, toReceive: round2(sum(sales, sale => sale.balance)), remaining: Math.max(0, round2(limit - received)), average,
      projected: round2(received / elapsed * months),   // se o ritmo médio até agora continuar até dezembro
      receivedPct: limit > 0 ? received / limit * 100 : 0, soldPct: limit > 0 ? sold / limit * 100 : 0};
  }

  // Congela as datas de vencimento de cada venda parcelada (campo "dueDates"). Roda toda vez que o sistema abre e só
  // preenche o que falta, com as mesmas regras de sempre: nenhuma data ou valor existente muda.
  function freezeDueDates() {
    let changed = false;
    for (const sale of data.sales) {
      if (sale.installments > 1 && !(sale.dueDates && sale.dueDates.length === sale.installments)) {
        sale.dueDates = dueDates({date: sale.date, count: sale.installments, firstDue: sale.firstDue, extraDues: sale.extraDues});
        changed = true;
      }
    }
    if (changed) App.store.save();
  }
  freezeDueDates();

  App.finance = {meiYear, ensureProducts, PAY_METHODS, round2, daysBetween, activeSales, activePayments, principalOf, recalcSale, addMonths, monthDay, dueDates, freezeDueDates, scheduleFor, installmentsFor, chargeRules, chargesFor, receivableItems, allPayments, allOutflows, itemType, totalsByType, monthTypeTotals, saleProfit, saleFee};
})();
