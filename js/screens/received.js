// Tela "Recebimentos" (Financeiro, SPECS 64 e 66): TODOS os pagamentos recebidos, de todos os clientes, numa lista só.
// Uma linha = um pagamento de verdade (o que o cliente entregou na mão). Quando o sistema dividiu esse valor entre parcelas,
// os pedaços (gravados um por parcela, por baixo) aparecem juntos na coluna "Para onde foi" (SPECS 66).
// Filtros: mês (padrão: este mês, com setas e "Todos os meses"), pesquisa por cliente ou código da venda, forma e "Mostrar desfeitos".
// Só mostra: nada é gravado aqui, a não ser o "Desfazer", que é o mesmo do histórico da parcela.
// Analogia: é o caderno de entradas do caixa; cada linha é uma nota que entrou, com o "troco" anotado ao lado (para onde foi cada parte).
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today, normalize, monthLabel, shiftMonth, sum} = App.format;
  const {data} = App.store;
  const {byId, openModal} = App.ui;

  const ALL = 'all';
  const state = {month: '', query: '', method: '', voided: false};
  let groupsByKey = {};   // os grupos da última lista desenhada (para a janelinha do "Desfazer")

  // Pedaços (pagamentos gravados) de todas as vendas, do mais novo para o mais antigo.
  function allParts() {
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
  // Quem fica junto (SPECS 66): o mesmo recibo ("um recibo por visita"); sem recibo em comum, o mesmo cliente + dia + forma.
  const keyOf = ({sale, payment}) => payment.receipt && data.settings.receiptMode !== 'each'
    ? `r${payment.receipt}` : `c|${sale.clientId || sale.client}|${payment.date}|${payment.method || ''}`;
  function groupsOf(parts) {
    const map = new Map();
    parts.forEach(part => { const key = keyOf(part); if (!map.has(key)) map.set(key, {key, parts: []}); map.get(key).parts.push(part); });
    return [...map.values()].map(g => {
      g.parts.sort((a, b) => a.sale.id.localeCompare(b.sale.id) || (a.payment.installment || 0) - (b.payment.installment || 0) || a.index - b.index);   // parcela 2 antes da 3
      const first = g.parts[0], ok = g.parts.filter(valid);
      return {...g, date: first.payment.date, client: first.sale.client, method: first.payment.method || '-', ok,
        amount: sum(ok, p => Number(p.payment.amount)), was: sum(g.parts, p => Number(p.payment.amount))};
    });
  }

  const partLabel = part => `${esc(part.sale.id)} · ${esc(kindOf(part))} <small class="muted">(${esc(App.documents.itemsText(part.sale))})</small>`;
  const partValue = ({payment}) => `<b>${money(payment.amount)}</b>${Number(payment.charges) > 0 ? ` <small class="muted">(dos quais ${money(payment.charges)} de multa e juros)</small>` : ''}`;
  const undoButton = part => isEntry(part)
    ? `<small class="muted">${part.sale.legacy ? 'para mudar: "Ajustar recebimentos" em Vendas' : 'entrada: para mudar, edite a venda'}</small>`
    : `<button class="secondary" data-action="undo-payment" data-sale="${esc(part.sale.id)}" data-payment-index="${part.index}" data-installment="${esc(part.payment.installment)}">Desfazer</button>`;

  function render() {
    const month = state.month || today().slice(0, 7);
    const parts = allParts();
    const methods = [...new Set(parts.map(r => r.payment.method).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const monthText = month === ALL ? 'Todos os meses' : monthLabel(month);
    byId('app').innerHTML = `<section class="panel"><div class="panel-head"><h2>Recebimentos</h2></div><div class="toolbar received-toolbar"><span class="month-step"><button type="button" class="secondary" id="received-prev" aria-label="Mês anterior"${month === ALL ? ' disabled' : ''}>‹</button><b id="received-month">${esc(monthText)}</b><button type="button" class="secondary" id="received-next" aria-label="Próximo mês"${month === ALL ? ' disabled' : ''}>›</button></span><button type="button" class="secondary" id="received-all">${month === ALL ? 'Voltar para este mês' : 'Todos os meses'}</button><input id="received-search" placeholder="Buscar cliente ou venda..." value="${esc(state.query)}"><select id="received-method" aria-label="Forma"><option value="">Todas as formas</option>${methods.map(m => `<option${m === state.method ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select><label class="inline-check"><input type="checkbox" id="received-voided"${state.voided ? ' checked' : ''}> Mostrar desfeitos</label></div><div id="received-body"></div></section>`;

    const draw = () => {
      const query = normalize(state.query);
      const shown = parts.filter(r => (month === ALL || r.payment.date.slice(0, 7) === month)
        && (!state.method || r.payment.method === state.method)
        && (state.voided || valid(r)));
      const groups = groupsOf(shown).filter(g => !query || normalize(`${g.client} ${g.parts.map(p => p.sale.id).join(' ')}`).includes(query));
      groupsByKey = Object.fromEntries(groups.map(g => [g.key, g]));
      const counted = groups.filter(g => g.ok.length), total = sum(counted, g => g.amount);
      const byMethod = Object.entries(counted.reduce((all, g) => { all[g.method] = (all[g.method] || 0) + g.amount; return all; }, {}))
        .sort((a, b) => b[1] - a[1]).map(([m, v]) => `${esc(m)} ${money(v)}`).join(' · ');
      const line = g => {
        const whole = g.ok.length === g.parts.length, none = !g.ok.length;
        const voidedPart = g.parts.find(p => !valid(p));
        const status = whole ? 'Valendo' : none ? (voidedPart.sale.status === 'Cancelada' ? 'Venda cancelada' : `Desfeito em ${dateLabel(voidedPart.payment.voidedAt)}`) : 'Parte desfeita';
        const where = g.parts.map(p => `<div class="received-part${valid(p) ? '' : ' voided-part'}">${partLabel(p)}: ${partValue(p)}</div>`).join('');
        const receipts = [...new Set(g.parts.map(p => p.payment.receipt).filter(Boolean))];
        const undo = none ? '' : g.ok.length === 1 ? undoButton(g.ok[0]) : `<button class="secondary" data-action="received-parts" data-key="${esc(g.key)}">Desfazer</button>`;
        const value = `${money(g.amount)}${!whole && !none ? ` <small class="muted">era ${money(g.was)}</small>` : ''}`;
        return `<tr class="${none ? 'voided' : ''}"><td>${dateLabel(g.date)}</td><td>${esc(g.client)}</td><td class="positive"><b>${none ? money(g.was) : value}</b></td><td>${esc(g.method)}</td><td>${where}</td><td>${status}</td><td>${receipts.map(n => `<button class="secondary" data-action="view-receipt" data-number="${n}">Recibo ${App.receipts.pad(n)}</button> `).join('')}<button class="secondary" data-action="open-client" data-client="${esc(g.client)}">Venda</button> ${undo}</td></tr>`;
      };
      byId('received-body').innerHTML = `<div class="cards"><div class="card"><span class="label">${counted.length} recebimento${counted.length === 1 ? '' : 's'}</span><div class="metric positive">${money(total)}</div></div></div>${byMethod ? `<p class="muted received-methods">${byMethod}</p>` : ''}${groups.length
        ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Valor pago</th><th>Forma</th><th>Para onde foi</th><th>Situação</th><th></th></tr></thead><tbody>${groups.map(line).join('')}</tbody></table></div>`
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

  // "Desfazer" numa linha com vários pedaços: escolher qual pedaço desfazer (cada um como no histórico da parcela).
  App.ui.registerAction('received-parts', element => {
    const g = groupsByKey[element.dataset.key];
    if (!g) return;
    openModal(`<h2>Desfazer qual parte?</h2><p>${esc(g.client)} pagou <b>${money(g.amount)}</b> em ${dateLabel(g.date)} (${esc(g.method)}). Esse valor foi dividido assim; escolha a parte que quer desfazer:</p><div class="table-wrap"><table><tbody>${g.ok.map(p => `<tr><td>${partLabel(p)}</td><td>${partValue(p)}</td><td>${undoButton(p)}</td></tr>`).join('')}</tbody></table></div><div class="actions"><button type="button" class="secondary" data-action="close-modal">Fechar</button></div>`);
  });

  App.ui.registerScreen('received', render);
})();
