// Avisos de hoje: o que precisa de atenção. Aparece como um painel na Visão geral e, se houver mais de um
// aviso urgente, também numa janela única com o botão "Fechar todos e não mostrar novamente hoje".
// Ordem de prioridade (quando existirem): lembretes de clientes, estoque baixo, e POR ÚLTIMO os pagamentos.
(() => {
  const App = (window.App = window.App || {});
  const {money, today, sum} = App.format;
  const {data} = App.store;
  const {receivableItems, daysBetween} = App.finance;
  const {openModal, closeModal} = App.ui;

  const DISMISS_KEY = 'julio-informatica-avisos-dispensados';   // dia em que o usuário escolheu não ver mais a janela
  let shownThisSession = false;

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const dismissedToday = () => { try { return localStorage.getItem(DISMISS_KEY) === today(); } catch { return false; } };
  const dismissToday = () => { try { localStorage.setItem(DISMISS_KEY, today()); } catch {} };

  // Lista de avisos, já na ordem de prioridade. urgent = precisa de atenção hoje.
  function list() {
    const now = today(), result = [];
    const receivables = receivableItems();
    const bills = data.payables.filter(b => b.status !== 'paga');
    const dayOf = date => daysBetween(now, date);   // negativo = já passou
    const group = (items, dateOf, amountOf) => ({
      overdue: items.filter(i => dayOf(dateOf(i)) < 0), today: items.filter(i => dayOf(dateOf(i)) === 0), soon: items.filter(i => dayOf(dateOf(i)) > 0 && dayOf(dateOf(i)) <= 3), amountOf
    });
    const r = group(receivables, i => i.due, i => i.balance), b = group(bills, x => x.dueDate, x => Number(x.amount));
    const add = (urgent, kind, items, amountOf, wordOne, wordMany, verbOne, verbMany, view, tone) => {
      if (!items.length) return;
      result.push({urgent, kind, view, tone, text: `${plural(items.length, wordOne, wordMany)} ${items.length === 1 ? verbOne : verbMany}: ${money(sum(items, amountOf))}`});
    };
    // 1º lembretes de clientes, 2º estoque baixo, e só depois os pagamentos
    const due = data.reminders.filter(x => !x.done && x.date <= now);
    due.forEach(x => result.push({urgent: true, kind: 'lembrete', view: 'clients', text: `Lembrete — ${App.format.esc(x.client)}: ${App.format.esc(x.text)}${x.date < now ? ` (era para ${App.format.dateLabel(x.date)})` : ''}`}));
    const low = App.stock.lowStock();
    if (low.length) result.push({urgent: true, kind: 'estoque', view: 'products', text: `Estoque baixo: ${low.map(p => `${App.format.esc(p.name)} (${Number(p.stock) || 0})`).join(', ')}`});
    // 3º ordem de serviço: aguardando aprovação há muito tempo e equipamentos prontos sem retirar
    App.serviceOrders.alerts().forEach(a => result.push(a));
    const lowMargin = App.revenue.belowMargin();
    if (lowMargin.length) result.push({urgent: false, kind: 'margem', view: 'products', text: `${lowMargin.length} ${lowMargin.length === 1 ? 'produto abaixo' : 'produtos abaixo'} da margem mínima`});
    // 4º MEI: a RECEITA decide (70%, 90% e acima de 100%); as vendas só avisam se já passaram do limite.
    if (data.settings.isMei) {
      const m = App.finance.meiYear(now), warn = Number(data.settings.meiWarnPct) || 70, alert = Number(data.settings.meiAlertPct) || 90;
      const pct = m.receivedPct, base = `${money(m.received)} de ${money(m.limit)} (${pct.toFixed(1).replace('.', ',')}%)`;
      if (pct > 100) result.push({urgent: true, kind: 'mei', view: 'finance', text: `Sua receita do ano passou do limite do MEI: ${base}. Procure seu contador.`});
      else if (pct >= alert) result.push({urgent: true, kind: 'mei', view: 'finance', text: `Atenção: sua receita do ano está perto do limite do MEI: ${base}.`});
      else if (pct >= warn) result.push({urgent: false, kind: 'mei', view: 'finance', text: `Sua receita do ano já usou ${pct.toFixed(1).replace('.', ',')}% do limite do MEI (${base}).`});
      if (m.soldPct > 100 && pct <= 100) result.push({urgent: false, kind: 'mei', view: 'finance', text: 'Suas vendas já passaram do limite; a receita ainda não, mas atenção.'});
      if (!(Number(data.settings.dasValue) > 0)) result.push({urgent: false, kind: 'das', view: 'settings', text: 'Informe o valor do DAS em Configurações.'});
    }
    add(true, 'receber', r.overdue, r.amountOf, 'parcela', 'parcelas', 'vencida', 'vencidas', 'receivables', 'bad');
    add(true, 'receber', r.today, r.amountOf, 'parcela', 'parcelas', 'vence hoje', 'vencem hoje', 'receivables', 'warn');
    add(true, 'pagar', b.overdue, b.amountOf, 'conta a pagar', 'contas a pagar', 'vencida', 'vencidas', 'payables', 'bad');
    add(true, 'pagar', b.today, b.amountOf, 'conta a pagar', 'contas a pagar', 'vence hoje', 'vencem hoje', 'payables', 'warn');
    add(false, 'receber', r.soon, r.amountOf, 'parcela', 'parcelas', 'vence nos próximos 3 dias', 'vencem nos próximos 3 dias', 'receivables', 'info');
    add(false, 'pagar', b.soon, b.amountOf, 'conta a pagar', 'contas a pagar', 'vence nos próximos 3 dias', 'vencem nos próximos 3 dias', 'payables', 'info');
    return result;
  }

  // Cor do quadradinho do aviso: coral = vencido/urgente, âmbar = vence hoje/atenção, azul = informação. A cor sempre vem com o texto.
  function toneOf(a) {
    if (a.tone) return a.tone;
    if (/vencid|passou/i.test(a.text)) return 'bad';
    return a.urgent ? 'warn' : 'info';
  }
  const ICON_OF = {receber: 'receivables', pagar: 'payables', lembrete: 'collection', estoque: 'products', mei: 'financial', margem: 'percent', das: 'payables', os: 'tool'};
  // Um aviso: quadradinho com ícone + título em negrito (até os dois-pontos) + linha de apoio em cinza (o resto) + botão "Ver".
  function avisoHtml(a) {
    const cut = a.text.indexOf(': '), title = cut > 0 ? a.text.slice(0, cut) : a.text, rest = cut > 0 ? a.text.slice(cut + 2) : '';
    const icon = App.icons ? App.icons.svg(ICON_OF[a.kind] || 'alert', 22) : '';
    return `<div class="aviso tone-${toneOf(a)}"><span class="aviso-icon">${icon}</span><span class="aviso-text"><b>${title}</b>${rest ? `<small>${rest}</small>` : ''}</span><button class="secondary" data-action="alert-go" data-view="${a.view}">Ver</button></div>`;
  }

  // Painel "Avisos de hoje" da Visão geral.
  function panelHtml() {
    const items = list();
    return `<aside class="avisos-panel"><h2>Avisos de hoje</h2>${items.length ? items.map(avisoHtml).join('') : '<p class="muted" style="margin:0">Tudo em dia por aqui.</p>'}</aside>`;
  }

  // Janela única com todos os avisos urgentes (só se houver mais de um e o usuário não tiver dispensado hoje).
  function showUrgent() {
    if (shownThisSession) return;
    const urgent = list().filter(a => a.urgent);
    if (urgent.length < 2 || dismissedToday()) return;
    shownThisSession = true;
    openModal(`<h2>Avisos urgentes de hoje</h2><div>${urgent.map(avisoHtml).join('')}</div><div class="actions"><button type="button" class="secondary" data-action="close-modal">Fechar</button><button type="button" class="primary" data-action="alerts-dismiss">Fechar todos e não mostrar novamente hoje</button></div>`);
  }

  App.ui.registerAction('alert-go', element => { closeModal(); App.ui.go(element.dataset.view); });
  App.ui.registerAction('alerts-dismiss', () => { dismissToday(); closeModal(); });

  App.alerts = {list, panelHtml, showUrgent};
})();
