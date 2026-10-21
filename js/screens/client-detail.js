// Tela do cliente (aberta pela lista de Clientes): três números, lista de compras e os botões
// "Gerar extrato da conta" e "Nova venda". Edição do cadastro, lembretes e histórico abrem por botões.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel} = App.format;
  const {data} = App.store;
  const {byId, go} = App.ui;

  let current = '';
  const open = name => { current = name; go('client'); };

  // Recibos do cliente, do mais novo para o mais antigo. "Abrir" mostra o recibo (Resumido ou Detalhado) para imprimir ou mandar de novo.
  function receiptsHtml(client) {
    const list = data.receipts.filter(r => (r.clientId && r.clientId === client.uid) || r.client === client.name).sort((a, b) => b.number - a.number);
    if (!list.length) return '';
    const rows = list.map(r => `<tr class="${r.canceled ? 'voided' : ''}"><td>Nº ${App.receipts.pad(r.number)}</td><td>${dateLabel(r.date)}</td><td>${money(r.amount)}</td><td>${r.canceled ? 'Cancelado' : 'Valendo'}</td><td><button class="secondary" data-action="view-receipt" data-number="${r.number}">Abrir</button></td></tr>`).join('');
    return `<section class="block"><h2>Recibos</h2><div class="table-wrap"><table><thead><tr><th>Recibo</th><th>Data</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  function render() {
    const client = data.clients.find(c => c.name === current);
    if (!client) { go('clients'); return; }
    byId('page-title').textContent = client.name;
    const s = App.documents.situation(client.name), next = s.upcoming[0];
    const sales = App.finance.activeSales().filter(x => x.client === client.name).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const rows = sales.map(sale => {
      const overdue = s.purchases.find(p => p.saleId === sale.id);
      return `<tr><td>${dateLabel(sale.date)}</td><td class="muted">${esc(App.documents.itemsText(sale))}<span class="origin-line">${App.stock.originHtml(sale, (sale.items || []).length > 1)}</span></td><td>${money(sale.total)}</td><td>${sale.balance > 0.004 ? `<span class="${overdue && overdue.overdue > 0 ? 'negative' : ''}">${money(sale.balance)}</span>` : '<span class="positive">Quitada</span>'}</td></tr>`;
    }).join('');
    byId('app').innerHTML = `<section class="client-head"><p class="muted">${esc(client.phone || '[telefone]')} · cliente desde ${dateLabel(client.createdAt || (sales[0] && sales[0].date) || data.settings.business.createdAt || '')}</p><div class="client-actions"><button class="primary" data-action="open-extract" data-client="${esc(client.name)}">Gerar extrato da conta</button><button class="secondary" data-action="new-sale-for" data-client="${esc(client.name)}">Nova venda</button></div></section><section class="kpi-strip kpi-three"><div class="kpi"><span class="kpi-label">Em aberto</span><span class="kpi-value">${money(s.totalOpen)}</span></div><div class="kpi"><span class="kpi-label">Em atraso</span><span class="kpi-value ${s.late.length ? 'negative' : ''}">${money(s.totalLate)}</span></div><div class="kpi"><span class="kpi-label">Próximo vencimento</span><span class="kpi-value">${next ? App.documents.dm(next.due) : '-'}</span></div></section><section class="block"><h2>Compras</h2>${sales.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Item</th><th>Total</th><th>Falta pagar</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Nenhuma compra ainda.</div>'}</section><div class="client-more"><button class="secondary" data-action="edit-client" data-client="${esc(client.name)}">Editar cadastro</button><button class="secondary" data-action="client-reminders" data-client="${esc(client.name)}">Lembretes</button><button class="secondary" data-action="client-history" data-client="${esc(client.name)}">Histórico</button>${s.late.length ? `<button class="secondary" data-action="overdue-message" data-client="${esc(client.name)}">Mensagem de cobrança</button>` : ''}<button class="secondary" data-action="open-clients">← Voltar para Clientes</button></div>`;
    byId('app').insertAdjacentHTML('beforeend', receiptsHtml(client));   // todos os recibos do cliente, para tirar a 2ª via (SPECS 41)
    byId('app').insertAdjacentHTML('beforeend', App.serviceOrders.warrantiesHtml(client.name));   // garantias a vencer deste cliente (ordem de serviço)
  }

  App.ui.registerScreen('client', render);
  App.ui.registerAction('open-client', element => open(element.dataset.client));
  App.ui.registerAction('open-clients', () => go('clients'));
  App.ui.registerAction('open-extract', element => App.documents.showExtract(element.dataset.client));
  App.clientDetail = {open};
})();
