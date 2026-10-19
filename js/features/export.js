// Exportar para o contador: arquivos CSV que abrem direto no Excel brasileiro.
//   - separador ponto e vírgula; acentos certos (marca UTF-8); datas dd/mm/aaaa;
//   - vírgula como decimal; números sem separador de milhar e sem "R$" (para o Excel poder somar).
(() => {
  const App = (window.App = window.App || {});
  const {dateLabel, today} = App.format;
  const {data} = App.store;
  const {activeSales, installmentsFor, allOutflows, saleProfit, saleFee} = App.finance;

  const money = value => (Math.round((Number(value) || 0) * 100) / 100).toFixed(2).replace('.', ',');
  const text = value => String(value ?? '');
  // Texto com ; " ou quebra de linha vai entre aspas (aspas viram aspas duplas).
  // Texto que começa com = + - @ viraria fórmula no Excel: ganha um apóstrofo na frente (números negativos como -12,50 ficam como estão).
  const cell = value => { let s = text(value); if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-?[\d.,]+$/.test(s))) s = "'" + s; return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const toCsv = (headers, rows) => '﻿' + [headers, ...rows].map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';

  // Período: {kind: 'month'|'year'|'all', value: 'AAAA-MM' | 'AAAA'}
  const inPeriod = (date, period) => period.kind === 'all' || (!!date && date.startsWith(period.value));
  const suffix = period => period.kind === 'all' ? 'tudo' : period.value;

  // Cada arquivo: nome, cabeçalho e linhas (as linhas já vêm filtradas pelo período, quando o arquivo tem período).
  const FILES = {
    vendas: {title: 'Vendas', hasPeriod: true, headers: ['Número', 'Data', 'Cliente', 'Itens', 'Forma', 'Parcelas', 'Valor de venda', 'Desconto', 'Total cobrado', 'Taxa da maquininha', 'Custo', 'Lucro líquido', 'Pago', 'Saldo', 'Situação'], rows: period => data.sales.filter(s => inPeriod(s.date, period)).map(s => {
      const profit = saleProfit(s);
      return [s.id, dateLabel(s.date), s.client, (s.items || []).map(i => i.name).filter(Boolean).join(' + ') || s.product || '', s.method || '', (s.pricing && s.pricing.installments) || s.installments, money((s.items || []).reduce((t, i) => t + Number(i.amount || 0), 0)), money(s.discount || 0), money(s.total), money(saleFee(s)), s.costInformed ? money(s.cost) : '', profit.known ? money(profit.value) : '', money(s.paid), money(s.balance), s.status === 'Cancelada' ? 'Cancelada' : s.balance > 0.004 ? 'Em aberto' : 'Paga'];
    })},
    'contas-a-receber': {title: 'Contas a receber', hasPeriod: true, headers: ['Venda', 'Parcela', 'Cliente', 'Vencimento', 'Valor', 'Pago', 'Saldo', 'Situação'], rows: period => activeSales().filter(s => s.installments > 1 || s.balance > 0.004).flatMap(s => installmentsFor(s).filter(i => inPeriod(i.due, period)).map(i => [s.id, i.number, s.client, dateLabel(i.due), money(i.value), money(i.paid), money(i.balance), i.balance <= 0.004 ? 'Paga' : i.due < today() ? 'Vencida' : 'Em aberto']))},
    'contas-a-pagar': {title: 'Contas a pagar', hasPeriod: true, headers: ['Descrição', 'Categoria', 'Vencimento', 'Valor', 'Situação', 'Data do pagamento', 'Forma'], rows: period => data.payables.filter(b => inPeriod(b.dueDate, period)).map(b => [b.description, b.category || '', dateLabel(b.dueDate), money(b.amount), b.status === 'paga' ? 'Paga' : b.dueDate < today() ? 'Vencida' : 'Pendente', b.status === 'paga' ? dateLabel(b.paidAt) : '', b.method || ''])},
    despesas: {title: 'Despesas', hasPeriod: true, headers: ['Descrição', 'Categoria', 'Data', 'Valor', 'Forma'], rows: period => allOutflows().filter(x => inPeriod(x.date, period)).map(x => [x.description || '', x.category || '', dateLabel(x.date), money(x.amount), x.method || ''])},
    clientes: {title: 'Clientes', hasPeriod: false, headers: ['Nome', 'CPF/CNPJ', 'Telefone', 'E-mail', 'Cadastro', 'Observações'], rows: () => data.clients.map(c => [c.name, c.doc || '', c.phone || '', c.email || '', c.createdAt ? dateLabel(c.createdAt) : '', c.notes || ''])},
    produtos: {title: 'Produtos', hasPeriod: false, headers: ['Nome', 'Tipo', 'Custo', 'Preço', 'Estoque'], rows: () => data.products.map(p => [p.name, p.type || 'Produto', money(p.cost), money(p.price), p.type === 'Serviço' ? '' : text(p.stock)])}
  };

  // ---------- arquivos novos (itens de venda, pagamentos, compras e ordens de serviço) e ids internos ----------
  const dayText = date => date ? dateLabel(date) : '';
  FILES['itens-de-venda'] = {title: 'Itens de venda', hasPeriod: true, headers: ['Venda', 'Data', 'Cliente', 'Item', 'Tipo', 'Quantidade', 'Valor unitário', 'Valor do item', 'Atividade'],
    rows: period => activeSales().filter(s => inPeriod(s.date, period)).flatMap(s => (s.items || []).map(i => [s.id, dateLabel(s.date), s.client, i.name || '', i.type || 'Produto', i.qty || 1, money(i.unit ?? i.amount), money(i.amount), (App.revenue ? App.revenue.activityName(i.activityId || '') : '')])),
    uids: period => activeSales().filter(s => inPeriod(s.date, period)).flatMap(s => (s.items || []).map(() => s.uid))};
  FILES.pagamentos = {title: 'Pagamentos', hasPeriod: true, headers: ['Venda', 'Cliente', 'Data', 'Forma', 'Valor', 'Multa e juros', 'Parcela', 'Nota fiscal'],
    rows: period => App.finance.allPayments().filter(p => inPeriod(p.date, period)).map(p => [p.sale.id, p.sale.client, dateLabel(p.date), p.method || '', money(p.amount), money(p.charges || 0), p.installment || '', p.sale.invoice && p.sale.invoice.issued ? (p.sale.invoice.number || 'sim') : 'sem nota']),
    uids: period => App.finance.allPayments().filter(p => inPeriod(p.date, period)).map(p => p.uid)};
  FILES.compras = {title: 'Compras', hasPeriod: true, headers: ['Número', 'Data', 'Fornecedor', 'Itens', 'Total', 'Pagamento', 'Situação'],
    rows: period => data.purchases.filter(p => inPeriod(p.date, period)).map(p => [p.id, dateLabel(p.date), p.supplier || '', (p.items || []).map(i => `${i.qty}x ${i.name}`).join(' + '), money(p.total), p.method || '', p.status || 'Registrada']),
    uids: period => data.purchases.filter(p => inPeriod(p.date, period)).map(p => p.uid)};
  // Ordens de serviço: NUNCA exporta a senha/PIN do equipamento.
  FILES['ordens-de-servico'] = {title: 'Ordens de serviço', hasPeriod: true, headers: ['Número', 'Cliente', 'Equipamento', 'Defeito relatado', 'Situação', 'Entrada', 'Previsão', 'Entrega', 'Valor', 'Venda'],
    rows: period => data.quotes.filter(q => q.kind === 'os' && inPeriod(q.os && q.os.entryDate, period)).map(q => [q.id, q.client, [q.os.equipment.type, q.os.equipment.brand, q.os.equipment.model].filter(Boolean).join(' '), q.os.defect || '', q.status, dayText(q.os.entryDate), dayText(q.os.dueDate), dayText(q.os.deliveredAt), money(q.pricing ? q.pricing.total : Math.max(0, Number(q.total) - Number(q.discount || 0))), q.saleId || '']),
    uids: period => data.quotes.filter(q => q.kind === 'os' && inPeriod(q.os && q.os.entryDate, period)).map(q => q.uid)};
  FILES.vendas.uids = period => data.sales.filter(s => inPeriod(s.date, period)).map(s => s.uid);
  FILES.clientes.uids = () => data.clients.map(c => c.uid);
  FILES.produtos.uids = () => data.products.map(p => p.uid);
  FILES['contas-a-pagar'].uids = period => data.payables.filter(b => inPeriod(b.dueDate, period)).map(b => b.uid);
  FILES['contas-a-receber'].uids = period => activeSales().filter(s => s.installments > 1 || s.balance > 0.004).flatMap(s => installmentsFor(s).filter(i => inPeriod(i.due, period)).map(() => s.uid));

  // Monta o CSV de um arquivo.

  // Cada arquivo ganha, no fim, a coluna "ID interno" (o uid do registro; vazio onde não existe). Nunca exporta senha/PIN de equipamento.
  const build = (key, period) => {
    const file = FILES[key], rows = file.rows(period), ids = file.uids ? file.uids(period) : [];
    return {name: file.hasPeriod ? `${key}-${suffix(period)}.csv` : `${key}.csv`, content: toCsv([...file.headers, 'ID interno'], rows.map((row, i) => [...row, ids[i] || '']))};
  };

  function download(name, content) {
    const url = URL.createObjectURL(new Blob([content], {type: 'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- painel (dentro de Configurações > Backup e exportação) ----------
  function panelHtml() {
    return `<hr><h3>Exportar para o contador (CSV)</h3><p class="muted">Arquivos que abrem direto no Excel: separador ponto e vírgula, datas dd/mm/aaaa e vírgula como decimal. Atenção: clientes e vendas têm dados pessoais; envie ao contador por um canal seguro.</p><div class="form-grid"><div class="field"><label>Período</label><select id="export-kind"><option value="month">Um mês</option><option value="year">Um ano</option><option value="all">Tudo</option></select></div><div class="field"><label id="export-label">Mês</label><input id="export-month" type="month" value="${today().slice(0, 7)}"><input id="export-year" type="number" min="2000" max="2100" value="${today().slice(0, 4)}" hidden></div></div><div class="actions" style="justify-content:flex-start"><button type="button" class="primary" id="export-all">Exportar os ${Object.keys(FILES).length} arquivos</button>${Object.keys(FILES).map(key => `<button type="button" class="secondary" data-export="${key}">${FILES[key].title}</button>`).join('')}</div><p id="export-status" class="positive"></p>`;
  }

  function bind() {
    const byId = id => document.getElementById(id);
    const period = () => { const kind = byId('export-kind').value; return {kind, value: kind === 'month' ? byId('export-month').value : String(byId('export-year').value)}; };
    byId('export-kind').onchange = () => {
      const kind = byId('export-kind').value;
      byId('export-month').hidden = kind !== 'month';
      byId('export-year').hidden = kind !== 'year';
      byId('export-label').textContent = kind === 'month' ? 'Mês' : kind === 'year' ? 'Ano' : 'Todo o período';
    };
    byId('export-all').onclick = async () => {
      const p = period(), keys = Object.keys(FILES);
      for (const key of keys) { const file = build(key, p); download(file.name, file.content); await new Promise(resolve => setTimeout(resolve, 350)); }
      byId('export-status').textContent = `${keys.length} arquivos exportados.`;
    };
    document.querySelectorAll('[data-export]').forEach(button => {
      button.onclick = () => { const file = build(button.dataset.export, period()); download(file.name, file.content); byId('export-status').textContent = `${file.name} exportado.`; };
    });
  }

  App.exporter = {FILES, build, panelHtml, bind, toCsv, download};
})();
