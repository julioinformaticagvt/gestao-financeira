// Tela "Recebimentos" (Financeiro, SPECS 64): TODOS os pagamentos recebidos, de todos os clientes, numa lista só.
// Filtros: mês (padrão: este mês, com setas e "Todos os meses"), pesquisa por cliente ou código da venda, forma e "Mostrar desfeitos".
// Só mostra: nada é gravado aqui, a não ser o "Desfazer", que é o mesmo do histórico da parcela.
// Analogia: é o caderno de entradas do caixa, com todas as páginas juntas, mas que dá para folhear mês a mês.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today, normalize, monthLabel, shiftMonth, sum} = App.format;
  const {data} = App.store;
  const {byId} = App.ui;

  const ALL = 'all';
  const state = {month: '', query: '', method: '', voided: false};

  // Pagamentos de todas as vendas (as canceladas e os desfeitos só servem para "Mostrar desfeitos"), do mais novo para o mais antigo.
  function allRows() {
    return data.sales.flatMap(sale => (sale.payments || []).map((payment, index) => ({sale, payment, index})))
      .sort((a, b) => b.payment.date.localeCompare(a.payment.date) || b.sale.id.localeCompare(a.sale.id) || b.index - a.index);
  }
  const valid = ({sale, payment}) => !payment.voided && sale.status !== 'Cancelada';
  // entrada de parcelado (carnê ou venda avulsa): não tem "Desfazer" (o valor sairia das Contas a receber), como na ficha do cliente
  const isEntry = ({sale, payment}) => payment.installment === 0 && (sale.installments > 1 || (sale.legacy && !sale.paidAtSale));
  function kindOf({sale, payment}) {
    if (payment.note === 'Pagamento antigo') return 'pagamento antigo';
    if (payment.installment) return `parcela ${payment.installment}${sale.installments > 1 ? ` de ${sale.installments}` : ''}`;
    return isEntry({sale, payment}) ? 'entrada' : 'à vista';
  }

  function render() {
    const month = state.month || today().slice(0, 7);
    const rows = allRows();
    const methods = [...new Set(rows.map(r => r.payment.method).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const monthText = month === ALL ? 'Todos os meses' : monthLabel(month);
    byId('app').innerHTML = `<section class="panel"><div class="panel-head"><h2>Recebimentos</h2></div><div class="toolbar received-toolbar"><span class="month-step"><button type="button" class="secondary" id="received-prev" aria-label="Mês anterior"${month === ALL ? ' disabled' : ''}>‹</button><b id="received-month">${esc(monthText)}</b><button type="button" class="secondary" id="received-next" aria-label="Próximo mês"${month === ALL ? ' disabled' : ''}>›</button></span><button type="button" class="secondary" id="received-all">${month === ALL ? 'Voltar para este mês' : 'Todos os meses'}</button><input id="received-search" placeholder="Buscar cliente ou venda..." value="${esc(state.query)}"><select id="received-method" aria-label="Forma"><option value="">Todas as formas</option>${methods.map(m => `<option${m === state.method ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select><label class="inline-check"><input type="checkbox" id="received-voided"${state.voided ? ' checked' : ''}> Mostrar desfeitos</label></div><div id="received-body"></div></section>`;

    const draw = () => {
      const query = normalize(state.query);
      const found = rows.filter(r => (month === ALL || r.payment.date.slice(0, 7) === month)
        && (!state.method || r.payment.method === state.method)
        && (!query || normalize(`${r.sale.client} ${r.sale.id}`).includes(query))
        && (state.voided || valid(r)));
      const counted = found.filter(valid), total = sum(counted, r => Number(r.payment.amount));
      const byMethod = Object.entries(counted.reduce((all, r) => { all[r.payment.method || '-'] = (all[r.payment.method || '-'] || 0) + Number(r.payment.amount); return all; }, {}))
        .sort((a, b) => b[1] - a[1]).map(([m, v]) => `${esc(m)} ${money(v)}`).join(' · ');
      const line = r => {
        const {sale, payment, index} = r, ok = valid(r);
        const status = sale.status === 'Cancelada' ? 'Venda cancelada' : payment.voided ? `Desfeito em ${dateLabel(payment.voidedAt)}` : 'Valendo';
        const undo = !ok ? '' : isEntry(r)
          ? `<small class="muted">${sale.legacy ? 'para mudar: "Ajustar recebimentos" em Vendas' : 'entrada: para mudar, edite a venda'}</small>`
          : `<button class="secondary" data-action="undo-payment" data-sale="${esc(sale.id)}" data-payment-index="${index}" data-installment="${esc(payment.installment)}">Desfazer</button>`;
        return `<tr class="${ok ? '' : 'voided'}"><td>${dateLabel(payment.date)}</td><td>${esc(sale.client)}</td><td>${esc(sale.id)} <small class="muted">${esc(kindOf(r))}</small></td><td class="muted">${esc(App.documents.itemsText(sale))}</td><td>${esc(payment.method || '-')}</td><td class="positive">${money(payment.amount)}</td><td>${status}</td><td>${payment.receipt ? `<button class="secondary" data-action="view-receipt" data-number="${payment.receipt}">Recibo ${App.receipts.pad(payment.receipt)}</button> ` : ''}<button class="secondary" data-action="open-client" data-client="${esc(sale.client)}">Venda</button> ${undo}</td></tr>`;
      };
      byId('received-body').innerHTML = `<div class="cards"><div class="card"><span class="label">${counted.length} recebimento${counted.length === 1 ? '' : 's'}</span><div class="metric positive">${money(total)}</div></div></div>${byMethod ? `<p class="muted received-methods">${byMethod}</p>` : ''}${found.length
        ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Venda</th><th>O que foi comprado</th><th>Forma</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>${found.map(line).join('')}</tbody></table></div>`
        : `<div class="empty">Nenhum recebimento ${month === ALL ? '' : `em ${esc(monthText)}`}${state.query || state.method ? ' com esses filtros' : ''}.</div>`}`;
    };
    draw();

    const moveTo = value => { state.month = value; render(); };
    byId('received-prev').onclick = () => moveTo(shiftMonth(month, -1));
    byId('received-next').onclick = () => moveTo(shiftMonth(month, 1));
    byId('received-all').onclick = () => moveTo(month === ALL ? '' : ALL);
    byId('received-search').oninput = event => { state.query = event.target.value; draw(); };
    byId('received-method').onchange = event => { state.method = event.target.value; draw(); };
    byId('received-voided').onchange = event => { state.voided = event.target.checked; draw(); };
  }

  App.ui.registerScreen('received', render);
})();
