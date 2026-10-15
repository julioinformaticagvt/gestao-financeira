// Preço, juros, taxa da maquininha e lucro líquido. Só contas; nada de tela.
//
// Fórmulas (todas arredondadas para centavos):
//   Total cobrado     = Preço × (1 + juros base% + juros extra%)
//   Taxa maquininha   = Total cobrado × taxa%
//   Você recebe       = Total cobrado − Taxa da maquininha
//   Lucro líquido     = Você recebe − Compra (custo)
(() => {
  const App = (window.App = window.App || {});
  const {data} = App.store;

  // As 5 formas de pagamento. "immediate" = o cliente paga na hora (a venda já nasce paga).
  const MODALITIES = [
    {key: 'pix', label: 'Pix', immediate: true, installments: false},
    {key: 'cash', label: 'Dinheiro', immediate: true, installments: false},
    {key: 'debit', label: 'Débito', immediate: true, installments: false},
    {key: 'credit', label: 'Crédito (maquininha)', immediate: true, installments: true},
    {key: 'carne', label: 'Carnê (parcelado por mim)', immediate: false, installments: true}
  ];
  const modality = key => MODALITIES.find(m => m.key === key) || MODALITIES[0];

  const round2 = number => Math.round((Number(number) + Number.EPSILON) * 100) / 100;

  // Texto curto gravado nos pagamentos e mostrado nas telas ("Forma").
  function paymentLabel(key, account) {
    if (key === 'pix') return account === 'PF' ? 'PIX PF' : 'PIX PJ';
    return {cash: 'Dinheiro', debit: 'Débito', credit: 'Crédito', carne: 'Carnê'}[key] || key;
  }

  // Tabela de taxas do plano de recebimento em uso (na hora ou 30 em 30 dias).
  const rateTable = () => data.settings.machine.rates[data.settings.machine.plan];

  // Taxa da maquininha (%) para a forma e parcelas. null = ainda não preenchida na tabela.
  function machineRate(key, installments) {
    const table = rateTable();
    if (key === 'pix') return table.pix;
    if (key === 'debit') return table.debit;
    if (key === 'credit') return table.credit[installments] ?? null;
    return 0; // dinheiro e carnê não passam pela maquininha
  }

  // Juros base padrão: a taxa da maquininha. No carnê é a taxa do crédito de mesmo número de parcelas (referência).
  function defaultBase(key, installments) {
    if (key === 'carne') return rateTable().credit[installments] ?? 0;
    return machineRate(key, installments) ?? 0;
  }

  const defaultExtra = key => Number(data.settings.pricing.extra[key]) || 0;

  // Faz as contas de uma venda. price e cost em R$; base, extra e feeRate em %.
  function calc({price, cost, base, extra, feeRate, installments}) {
    const total = round2(price * (1 + (base + extra) / 100));
    const fee = round2(total * (feeRate || 0) / 100);
    const net = round2(total - fee);
    const count = Math.max(1, installments || 1);
    return {total, installment: round2(total / count), fee, net, profit: round2(net - cost), totalRate: round2(base + extra)};
  }

  // As duas colunas lado a lado: só a taxa da maquininha, e com o meu juros extra.
  const compare = params => ({onlyFee: calc({...params, extra: 0}), withExtra: calc(params)});

  App.pricing = {MODALITIES, modality, round2, paymentLabel, machineRate, defaultBase, defaultExtra, calc, compare};
})();
