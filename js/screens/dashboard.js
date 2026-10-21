// Tela "Visão geral": resumo do período, orçamentos parados, próximos vencimentos, avisos e gráficos.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today, monthKey, shiftMonth, monthLabel, sum} = App.format;
  const {data} = App.store;
  const {receivableItems, allPayments, allOutflows, monthTypeTotals, activeSales, saleProfit, saleFee, daysBetween} = App.finance;
  const {barChart} = App.components;
  const {byId} = App.ui;

  const MONTHS_BY_PERIOD = {'3': 3, '6': 6, '12': 12}; // os demais períodos valem 1 mês
  const shortMonth = key => monthLabel(key).split(' ')[0].slice(0, 3);

  const monthsBetween = (from, to) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
  // Lista de meses (AAAA-MM) que o período escolhido cobre.
  function periodMonths(period, customStart) {
    const thisMonth = today().slice(0, 7);
    // "Personalizado": do mês escolhido até o mês atual (o título diz "A partir de ...")
    const count = customStart ? Math.max(1, 1 + monthsBetween(customStart, thisMonth)) : MONTHS_BY_PERIOD[period] || 1;
    const last = period === 'previous' ? shiftMonth(thisMonth, -1) : thisMonth;
    const start = customStart || shiftMonth(last, -(count - 1));
    return Array.from({length: count}, (_, i) => shiftMonth(start, i));
  }

  // Todos os números da tela para o período escolhido.
  function summarize(period, customStart) {
    const thisMonth = today().slice(0, 7);
    const months = periodMonths(period, customStart);
    const start = months[0], end = months[months.length - 1];
    const inRange = date => date >= `${start}-01` && date < `${shiftMonth(end, 1)}-01`;
    const sales = activeSales().filter(s => inRange(s.date));
    const profits = sales.map(saleProfit);
    const payments = allPayments().filter(p => inRange(p.date));
    const outflows = allOutflows().filter(x => inRange(x.date));
    const receivables = receivableItems();
    const nextKey = shiftMonth(thisMonth, 1);
    return {
      sales,
      sold: sum(sales, s => s.total),
      profit: sum(profits.filter(p => p.known), p => p.value),                 // lucro líquido das vendas com custo informado
      noCost: profits.filter(p => !p.known).length,                              // vendas antigas, sem custo informado
      soldKnown: sum(sales.filter(s => saleProfit(s).known), s => s.total),      // vendido nas vendas com custo informado (base da margem)
      fees: sum(sales, saleFee),                                                  // taxas pagas à maquininha
      charges: sum(payments, p => Number(p.charges || 0)),                        // multa e juros recebidos
      received: sum(payments, p => Number(p.amount)),
      out: sum(outflows, x => x.amount),
      open: sum(receivables.filter(i => sales.includes(i.sale)), i => i.balance),
      openCount: receivables.filter(i => sales.includes(i.sale)).length,         // parcelas em aberto das vendas do período
      overdue: sum(receivables.filter(i => i.due < today()), i => i.balance),
      overdueCount: receivables.filter(i => i.due < today()).length,             // parcelas atrasadas
      next: sum(receivables.filter(i => monthKey(i.due) === nextKey), i => i.balance),
      soldRows: months.map(m => ({
        label: shortMonth(m),
        first: sum(activeSales().filter(s => monthKey(s.date) === m), s => s.total),
        second: sum(allPayments().filter(p => monthKey(p.date) === m), p => Number(p.amount))
      })),
      receivableRowsByMonth: Array.from({length: 6}, (_, i) => shiftMonth(thisMonth, i)).map(m => ({
        label: shortMonth(m),
        first: sum(receivables.filter(i => monthKey(i.due) === m), i => i.balance)
      })),
      methods: Object.entries(payments.reduce((all, p) => { all[p.method] = (all[p.method] || 0) + Number(p.amount); return all; }, {})).map(([label, first]) => ({label, first}))
    };
  }

  // Um dos 4 blocos de cor (SPECS 40.4): rótulo, valor e linha(s) de apoio. "kind" marca o valor (ex.: 'negative' para lucro negativo).
  const kpi = (label, value, kind = '', notes = []) => `<div class="kpi"><span class="kpi-label">${label}</span><span class="${kind ? `kpi-value ${kind}` : 'kpi-value'}">${money(value)}</span>${notes.filter(Boolean).map(note => `<small class="kpi-note">${note}</small>`).join('')}</div>`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // ---------- Produtos e serviços (rosca) ----------
  // Regra (SPECS 40.4): vendas do período, pela data da venda. O total de cada venda é dividido entre produto e serviço na proporção
  // do valor dos itens (a mesma regra do relatório de receitas, App.revenue.shares); o lucro de cada venda com custo informado é
  // dividido na mesma proporção. Assim Produtos + Serviços = Vendido, e o lucro dos dois = Lucro do bloco âmbar.
  function typeSplit(sales) {
    const out = {product: {sold: 0, profit: 0, known: 0}, service: {sold: 0, profit: 0, known: 0}};   // known = vendido com custo informado (base da margem)
    for (const sale of sales) {
      const serviceShare = App.revenue.shares(sale).filter(s => s.type === 'Serviço').reduce((total, s) => total + s.share, 0);
      const profit = saleProfit(sale);
      out.service.sold += (Number(sale.total) || 0) * serviceShare;
      out.product.sold += (Number(sale.total) || 0) * (1 - serviceShare);
      if (profit.known) { out.service.profit += profit.value * serviceShare; out.product.profit += profit.value * (1 - serviceShare); out.service.known += (Number(sale.total) || 0) * serviceShare; out.product.known += (Number(sale.total) || 0) * (1 - serviceShare); }
    }
    return out;
  }
  function typesBlock(sales, title) {
    const t = typeSplit(sales), total = t.product.sold + t.service.sold;
    if (!(total > 0)) return `<section class="block"><h2>${title}</h2><p class="muted">Sem vendas neste período.</p></section>`;
    const productPct = Math.round(t.product.sold / total * 100), servicePct = 100 - productPct;   // os dois somam sempre 100%
    const margin = x => x.known > 0 ? ` · ${Math.round(x.profit / x.known * 100)}% de margem` : '';
    const row = (name, cls, pct, x) => `<div class="donut-row ${cls}"><span class="donut-dot" aria-hidden="true"></span><div><b>${name}</b> <span class="muted">${pct}% das vendas</span><p>Vendido: <b>${money(x.sold)}</b></p><p class="muted">Lucro: ${money(x.profit)}${margin(x)}</p></div></div>`;
    return `<section class="block"><h2>${title}</h2><div class="donut-wrap"><div class="donut" role="img" aria-label="Produtos ${productPct}% e serviços ${servicePct}% das vendas" style="--p:${productPct}%"><div class="donut-hole"><small>Vendido</small><b>${money(total)}</b></div></div><div class="donut-legend">${row('Produtos', 'is-product', productPct, t.product)}${row('Serviços', 'is-service', servicePct, t.service)}</div></div></section>`;
  }
  // Um dos números menores logo abaixo da faixa.
  const smallStat = (label, value) => `<span>${label}<b>${money(value)}</b></span>`;

  function periodText(period, customStart) {
    if (period === 'previous') return 'Mês anterior';
    if (period === 'current') return 'Este mês';
    if (period === 'custom') return `A partir de ${monthLabel(customStart || today().slice(0, 7))}`;
    return `Últimos ${period} meses`;
  }

  // Aviso depois da atualização dos dados (ids internos): onde está a cópia de segurança e se há nomes repetidos.
  function migrationNotice() {
    const info = data.migration;
    if (!info || info.seen || !(info.backupKey || info.duplicates || info.unlinked)) return '';
    const parts = [];
    if (info.backupKey) parts.push('Seus dados foram atualizados para o novo formato (com identificação interna). <b>Uma cópia dos dados anteriores foi guardada.</b>');
    if (info.duplicates) parts.push(`<b>${info.duplicates}</b> registro(s) foram ligados a um nome repetido (dois cadastros com o mesmo nome): confira clientes, produtos e fornecedores.`);
    if (info.unlinked) parts.push(`${info.unlinked} registro(s) têm um nome que não está mais no cadastro (ficaram sem ligação, mas nada foi apagado).`);
    // Se o último backup é antigo (ou nunca foi feito), lembra de fazer um agora, antes de continuar usando.
    const last = App.backup && App.backup.lastAnyBackupDay ? App.backup.lastAnyBackupDay() : '';
    const warnDays = Number(data.settings.backupWarnDays) || 7;
    const stale = info.backupKey && (!last || daysBetween(last, today()) > warnDays);
    if (stale) parts.push('<b>Faça um backup agora:</b> seu último backup é antigo (ou ainda não existe). Guarde o arquivo no Google Drive.');
    const buttons = [
      stale ? '<button type="button" class="primary" data-action="backup-now-notice">Fazer backup agora</button>' : '',
      info.backupKey ? '<button type="button" class="secondary" data-action="download-pre-v2">Baixar a cópia</button><button type="button" class="secondary" data-action="drop-pre-v2">Apagar a cópia</button>' : '',
      '<button type="button" class="secondary" data-action="migration-seen">Entendi</button>'
    ].join('');
    return `<section class="panel migration-notice"><div class="panel-head"><div>${parts.map(p => `<p>${p}</p>`).join('')}</div><div class="actions">${buttons}</div></div></section>`;
  }

  // ---------- Orçamentos aguardando resposta (status "Enviado"), os mais antigos primeiro ----------
  function waitingQuotes() {
    const waiting = data.quotes.filter(q => q.status === 'Enviado' && q.kind !== 'os')
      .map(q => ({quote: q, days: daysBetween(q.updatedAt || q.date, today())}))
      .sort((a, b) => b.days - a.days);
    const rows = waiting.map(({quote, days}) => {
      const value = quote.pricing ? quote.pricing.total : Math.max(0, Number(quote.total) - Number(quote.discount || 0));
      const item = quote.product || (quote.items && quote.items[0] && quote.items[0].name) || '-';
      const age = days <= 0 ? 'hoje' : days === 1 ? '1 dia' : `${days} dias`;
      return `<tr><td><b>${esc(quote.client)}</b></td><td>${esc(item)}</td><td>${money(value)}</td><td class="${days >= 7 ? 'negative' : ''}">${age}</td><td><button class="secondary" data-action="quote-message" data-id="${quote.id}">Copiar mensagem</button></td></tr>`;
    }).join('');
    return `<section class="block"><h2>Orçamentos aguardando resposta</h2>${waiting.length ? `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Item</th><th>Valor</th><th>Parado há</th><th>Ação</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">Nenhum orçamento aguardando resposta.</p>'}</section>`;
  }

  // ---------- Próximos vencimentos: parcelas dos próximos 7 dias, a partir de amanhã ----------
  function upcoming() {
    const now = today();
    const items = receivableItems().filter(i => daysBetween(now, i.due) >= 1 && daysBetween(now, i.due) <= 7).sort((a, b) => a.due.localeCompare(b.due));
    const dayLabel = date => `${new Intl.DateTimeFormat('pt-BR', {weekday: 'short'}).format(new Date(`${date}T12:00:00`)).replace('.', '')}, ${dateLabel(date).slice(0, 5)}`;
    const C = App.components;
    const cards = items.map(i => `<div class="due-card"><span class="rcv-avatar" aria-hidden="true">${C.receivableInitial(i.sale.client)}</span><div class="rcv-who"><b>${esc(i.sale.client)}</b><small>${C.saleRef(i.sale, i.number)}</small></div><div class="due-card-end"><b>${money(i.balance)}</b><small>${dayLabel(i.due)} · ${C.receivableSituation(i.due).text}</small></div></div>`).join('');
    return `<section class="block"><div class="panel-head"><h2>Próximos vencimentos</h2><span class="muted">Próximos 7 dias · total de ${money(sum(items, i => i.balance))}</span></div>${items.length ? `<div class="due-list">${cards}</div>` : '<p class="muted">Nenhuma parcela vence nos próximos 7 dias.</p>'}</section>`;
  }

  function render(period = 'current', customStart) {
    const d = summarize(period, customStart);
    const cashBalance = d.received - d.out - d.fees;   // o que entrou, menos saídas e taxas da maquininha
    const noCostNote = d.noCost ? `${d.noCost} venda${d.noCost === 1 ? '' : 's'} sem custo fora da conta` : '';

    byId('app').innerHTML = `${migrationNotice()}${App.firstRun.startCardHtml()}${App.firstRun.noticesHtml()}<section class="period-bar"><p class="muted period-text">${period === 'custom' ? periodText(period, customStart) : ''}</p><div class="period-controls"><select id="dashboard-period"><option value="current">Este mês</option><option value="previous">Mês anterior</option><option value="3">Últimos 3 meses</option><option value="6">Últimos 6 meses</option><option value="12">Últimos 12 meses</option><option value="custom">Personalizado</option></select><input id="dashboard-custom" type="month" value="${customStart || today().slice(0, 7)}" style="display:${period === 'custom' ? 'inline-block' : 'none'}"></div></section><section class="kpi-strip">${[
      kpi('Recebido', d.received, '', [`de ${money(d.sold)} vendidos`]),
      kpi('A receber', d.open, '', [plural(d.openCount, 'parcela em aberto', 'parcelas em aberto')]),
      kpi('Vencido', d.overdue, 'negative', [plural(d.overdueCount, 'parcela atrasada', 'parcelas atrasadas')]),
      kpi('Lucro', d.profit, d.profit < 0 ? 'negative' : '', [d.soldKnown > 0 ? `${Math.round(d.profit / d.soldKnown * 100)}% de margem` : '', noCostNote])
    ].join('')}</section><p class="kpi-more">${[
      smallStat('Saldo de caixa', cashBalance),
      smallStat('Vendido', d.sold),
      smallStat('Saídas', d.out)
    ].join('')}</p><div class="dash-grid"><div class="dash-main">${waitingQuotes()}${upcoming()}</div>${App.alerts.panelHtml()}</div>${typesBlock(d.sales, period === 'current' || period === 'previous' ? 'Produtos e serviços do mês' : 'Produtos e serviços do período')}<section class="block"><h2>Vendido x recebido</h2>${barChart(d.soldRows, 'Vendido', 'Recebido')}</section><div class="grid-2"><section class="block"><h2>Contas a receber por mês</h2>${barChart(d.receivableRowsByMonth, 'A receber', null, {color: 'var(--blue)'})}</section><section class="block"><h2>Recebimentos por forma</h2>${barChart(d.methods.map(row => ({...row, color: App.components.methodColor(row.label), dot: true})), 'Recebido', null, {noLegend: true})}</section></div><section class="block"><h2>Evolução das vendas</h2>${barChart(d.soldRows, 'Vendido')}</section>`;

    const selector = byId('dashboard-period'), custom = byId('dashboard-custom');
    selector.value = period;
    selector.onchange = event => render(event.target.value, event.target.value === 'custom' ? custom.value : undefined);
    custom.onchange = () => { if (selector.value === 'custom') render('custom', custom.value); };
  }

  App.ui.registerAction('migration-seen', () => { data.migration.seen = true; App.store.save(); render(); });
  App.ui.registerAction('backup-now-notice', () => App.backup.exportBackup());
  // Apaga a cópia de segurança da atualização (libera espaço no navegador). Só depois de confirmar.
  App.ui.registerAction('drop-pre-v2', () => {
    if (!data.migration || !data.migration.backupKey) return;
    if (!confirm('Apagar a cópia dos dados de antes da atualização? Confirme que você já baixou e guardou o arquivo. Não dá para desfazer.')) return;
    try { localStorage.removeItem(data.migration.backupKey); } catch { /* segue */ }
    data.migration.backupKey = '';
    data.migration.seen = true;
    App.store.save();
    App.ui.go(document.getElementById('page-title').textContent === 'Configurações' ? 'settings' : 'dashboard');
  });
  App.ui.registerAction('download-pre-v2', () => {
    const raw = localStorage.getItem(data.migration.backupKey);
    if (!raw) return alert('A cópia de segurança não foi encontrada neste navegador.');
    // no mesmo formato do backup do sistema (dá para restaurar pela tela de Configurações)
    const file = JSON.stringify({app: 'julio-informatica', formatVersion: 1, exportedAt: new Date().toISOString(), data: JSON.parse(raw)}, null, 2);
    const url = URL.createObjectURL(new Blob([file], {type: 'application/json'})), link = document.createElement('a');
    link.href = url; link.download = `copia-antes-da-atualizacao-${App.format.today()}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  App.ui.registerScreen('dashboard', () => render());
})();
