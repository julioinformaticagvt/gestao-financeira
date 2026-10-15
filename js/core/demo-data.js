// Dados de exemplo do MODO DEMONSTRAÇÃO (SPECS, seção 23.2). Tudo inventado e neutro: nenhum nome, CNPJ ou telefone de verdade.
// As datas são calculadas a partir de "hoje", para as parcelas aparecerem vencidas e a vencer. Este arquivo só monta os dados;
// quem grava (em outra chave de armazenamento, separada dos dados reais) é features/demo.js.
(() => {
  const addDays = (iso, days) => {
    const [y, m, d] = iso.split('-').map(Number), date = new Date(Date.UTC(y, m - 1, d + days));
    return date.toISOString().slice(0, 10);
  };
  const r2 = n => Math.round(n * 100) / 100;

  function build(today) {
    const day = offset => addDays(today, offset);
    const sales = [], payables = [];
    let seq = 0;
    const item = (name, type, price, cost) => ({name, type, qty: 1, unit: price, unitCost: cost, amount: price, cost});
    // Uma venda de exemplo. kind: 'pix' (já paga) ou 'carne' (parcelas; entry = entrada; paid = quanto já foi pago em parcelas).
    const sale = ({client, date, items, discount = 0, kind = 'pix', parts = 1, entry = 0, paidParts = 0}) => {
      const id = `V${String(++seq).padStart(4, '0')}`;
      const sold = items.reduce((t, i) => t + i.amount, 0), total = r2(sold - discount), cost = r2(items.reduce((t, i) => t + i.cost, 0));
      const payments = [];
      const s = {
        id, client, product: items[0].name, date, cost, total, paid: 0, balance: total, installments: kind === 'carne' ? parts : 1, entry: 0,
        quantity: 1, unitPrice: total, discount, method: kind === 'carne' ? 'Carnê' : 'Pix PJ', items,
        productTotal: items.filter(i => i.type === 'Produto').reduce((t, i) => t + i.amount, 0), serviceTotal: items.filter(i => i.type === 'Serviço').reduce((t, i) => t + i.amount, 0),
        payments, costInformed: true,
        pricing: {modality: kind, label: kind === 'carne' ? 'Carnê' : 'Pix PJ', installments: parts, plan: 'now', account: 'PJ', baseRate: 0, extraRate: 0, feeRate: 0, totalRate: 0, price: total, total, fee: 0, net: total, profit: r2(total - cost)}
      };
      if (discount > 0) { s.discountType = 'money'; s.discountValue = discount; }
      if (kind === 'pix') payments.push({amount: total, date, method: 'Pix PJ', installment: 0, note: 'Pagamento na venda'});
      else {
        const rest = r2(total - entry), each = r2(rest / parts);
        s.entry = entry;
        s.dueDates = Array.from({length: parts}, (_, i) => addDays(date, 30 * (i + 1)));
        if (entry > 0) payments.push({amount: entry, date, method: 'Entrada (carnê)', installment: 0, note: 'Entrada'});
        for (let i = 0; i < paidParts; i++) payments.push({amount: each, date: s.dueDates[i], method: 'Pix PJ', installment: i + 1});
      }
      s.paid = r2(payments.reduce((t, p) => t + p.amount, 0));
      s.balance = r2(total - s.paid);
      sales.push(s);
      return s;
    };

    const clients = ['Ana Souza', 'Bruno Lima', 'Carla Nunes', 'Diego Prado', 'Elisa Moraes', 'Fábio Teles'].map((name, i) => ({name, doc: '', phone: `(00) 90000-000${i + 1}`, email: '', notes: '', createdAt: day(-90 + i)}));
    const products = [
      {name: 'Formatação e instalação', sku: '', type: 'Serviço', cost: 0, price: 120, stock: 0},
      {name: 'Limpeza interna', sku: '', type: 'Serviço', cost: 0, price: 90, stock: 0},
      {name: 'Troca de tela de notebook', sku: '', type: 'Serviço', cost: 0, price: 250, stock: 0},
      {name: 'SSD 240 GB', sku: 'SSD240', type: 'Produto', cost: 130, price: 220, stock: 4},
      {name: 'Memória RAM 8 GB', sku: 'RAM8', type: 'Produto', cost: 110, price: 190, stock: 1},
      {name: 'Mouse sem fio', sku: 'MOUSE', type: 'Produto', cost: 25, price: 50, stock: 6},
      {name: 'Teclado USB', sku: 'TEC', type: 'Produto', cost: 30, price: 65, stock: 5},
      {name: 'Cabo HDMI', sku: 'HDMI', type: 'Produto', cost: 12, price: 30, stock: 8}
    ];
    const s = n => products.find(p => p.name === n);
    const it = (n, qty = 1) => { const p = s(n); return {...item(p.name, p.type, p.price * qty, p.cost * qty), qty, unit: p.price}; };

    sale({client: 'Ana Souza', date: day(-80), items: [it('Formatação e instalação')]});
    sale({client: 'Bruno Lima', date: day(-70), items: [it('SSD 240 GB'), it('Formatação e instalação')], kind: 'carne', parts: 3, entry: 100, paidParts: 1});   // parcela atrasada
    sale({client: 'Carla Nunes', date: day(-45), items: [it('Troca de tela de notebook')], kind: 'carne', parts: 2, paidParts: 0});               // parcelas vencidas
    sale({client: 'Diego Prado', date: day(-30), items: [it('Memória RAM 8 GB'), it('Limpeza interna')], discount: 20});                              // com desconto
    sale({client: 'Elisa Moraes', date: day(-20), items: [it('Mouse sem fio'), it('Teclado USB')]});
    sale({client: 'Fábio Teles', date: day(-12), items: [it('Limpeza interna')]});
    sale({client: 'Ana Souza', date: day(-8), items: [it('Cabo HDMI', 2)]});
    sale({client: 'Bruno Lima', date: day(-5), items: [it('Formatação e instalação')], kind: 'carne', parts: 2, entry: 20});                       // parcelas a vencer
    sale({client: 'Carla Nunes', date: day(-3), items: [it('SSD 240 GB')]});
    sale({client: 'Diego Prado', date: day(-1), items: [it('Mouse sem fio')]});

    // Uma compra de peças (com a conta a pagar dela) e outras contas.
    const purchase = {id: 'P0001', date: day(-15), supplier: 'Distribuidora Exemplo', items: [{name: 'SSD 240 GB', qty: 4, unitCost: 130, prevStock: 0, prevCost: 0}], total: 520, method: '', payableId: 'C0001'};
    payables.push({id: 'C0001', description: 'Compra P0001 - Distribuidora Exemplo', category: 'Fornecedor', amount: 520, dueDate: day(10), status: 'pendente', origin: 'compra', purchaseId: 'P0001'});
    payables.push({id: 'C0002', description: 'Internet', category: 'Internet', amount: 120, dueDate: day(5), status: 'pendente', origin: 'avulsa'});
    payables.push({id: 'C0003', description: 'Aluguel', category: 'Aluguel', amount: 600, dueDate: day(-2), status: 'pendente', origin: 'avulsa'});

    // Orçamento e ordem de serviço em andamento.
    const quote = {id: 'O0001', kind: 'quote', client: 'Elisa Moraes', product: 'SSD 240 GB', date: day(-4), validUntil: day(10), status: 'Enviado', updatedAt: day(-4), discount: 0,
      items: [it('SSD 240 GB'), it('Formatação e instalação')], total: 340, cost: 130, method: 'Pix PJ', installments: 1, entry: 0,
      pricing: {modality: 'pix', label: 'Pix PJ', installments: 1, plan: 'now', account: 'PJ', baseRate: 0, extraRate: 0, feeRate: 0, totalRate: 0, price: 340, total: 340, fee: 0, net: 340, profit: 210}};
    const os = {id: 'OS0001', kind: 'os', client: 'Fábio Teles', product: 'Troca de tela de notebook', date: day(-6), status: 'Em reparo', updatedAt: day(-2), discount: 0,
      items: [it('Troca de tela de notebook')], total: 250, cost: 0, method: 'Pix PJ', installments: 1, entry: 0,
      pricing: {modality: 'pix', label: 'Pix PJ', installments: 1, plan: 'now', account: 'PJ', baseRate: 0, extraRate: 0, feeRate: 0, totalRate: 0, price: 250, total: 250, fee: 0, net: 250, profit: 250},
      os: {equipment: {type: 'Notebook', brand: 'Marca X', model: 'Modelo 15', serial: '', accessories: 'carregador', condition: 'pequenos riscos'}, pin: '', defect: 'Tela quebrada', diagnosis: 'Troca de tela',
        entryDate: day(-6), dueDate: day(2), deliveredAt: '', warrantyDays: 90, warrantyText: 'Garantia de 90 dias para o serviço executado.', internalNotes: '', chargeDiagnosis: false, diagnosisFee: 0,
        history: [{status: 'Recebido', at: `${day(-6)} 09:00`}, {status: 'Aprovado', at: `${day(-5)} 10:30`}, {status: 'Em reparo', at: `${day(-2)} 14:00`}], itemsBackup: null}};

    return {
      schemaVersion: 2,
      clients, products, sales, quotes: [quote, os], expenses: [], receipts: [], payables, fixedExpenses: [], suppliers: [{name: 'Distribuidora Exemplo', phone: '', notes: ''}],
      purchases: [purchase], reminders: [],
      settings: {
        installmentInterest: 1.8, maxInstallments: 12, dueDay: 12, setupDone: true, onboardingCard: false, demo: true,
        business: {name: 'Loja de Exemplo', cnpj: '00.000.000/0000-00', phone: '(00) 90000-0000', instagram: '@lojadeexemplo', warranty: '90 dias para serviços', logo: null, logoTop: null, logoPdf: null},
        isMei: true, useDefaultLogo: false,
        machine: {plan: 'now', updatedAt: today, configured: true,
          rates: {now: {pix: 0, debit: 1.5, credit: {1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 8, 7: 9, 8: 10, 9: 11, 10: 12, 11: 13, 12: 14}}, d30: {pix: 0, debit: 1, credit: {1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 11, 11: 12, 12: 13}}}},
        os: {enabled: true}
      }
    };
  }

  window.DemoData = {build, addDays};
})();
