// Mensagens prontas para copiar ou abrir no WhatsApp: cobrança, lembrete e orçamento parado
// (as mensagens do recibo e do extrato ficam em documents.js). O sistema só monta o texto; quem envia é a pessoa, ao clicar.
// Os modelos são editáveis em Configurações > Modelos de mensagem (data.settings.messages); sem edição, valem os padrões abaixo,
// que reproduzem os textos de sempre.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today} = App.format;
  const {data} = App.store;
  const {receivableItems, installmentsFor} = App.finance;
  const {openModal, byId} = App.ui;

  // Marcadores: {cliente} {valor} {vencimento} {os} {equipamento} {negocio} (e {detalhe} {total} {parcela} {item} {id} em alguns modelos).
  const DEFAULTS = {
    collection: 'Olá, {cliente}! {detalhe}{total}\n\nQualquer dúvida é só me chamar.',
    reminder: 'Olá, {cliente}! Passando para lembrar que a parcela {parcela}, de {valor}, vence em {vencimento}.\n\nQualquer dúvida é só me chamar.',
    quote: 'Olá, {cliente}! Tudo bem? Passando para saber se você conseguiu ver o orçamento {id} ({item}), no valor de {valor}. Qualquer dúvida, estou à disposição. {negocio}'
  };
  const template = key => ((data.settings.messages || {})[key] || DEFAULTS[key]);
  function fill(text, vars) {
    const all = {negocio: data.settings.business.name || '', ...vars};
    return String(text).replace(/\{(negócio|[a-zA-Zçã]+)\}/g, (whole, name) => { const key = name === 'negócio' ? 'negocio' : name; return key in all ? all[key] : whole; });
  }

  function messageModal(title, message, client) {
    const wa = client && App.whatsapp.phoneOf(client) ? `<button type="button" class="secondary" data-action="wa-open" data-client="${esc(client)}">Abrir no WhatsApp</button>` : '';
    openModal(`<h2>${title}</h2><textarea id="confirmation-message" class="message-box">${esc(message)}</textarea><div class="actions"><button class="primary" data-action="copy-message">Copiar mensagem</button>${wa}</div><p id="copy-status" class="positive"></p>`);
  }

  // Cobrança: um bloco por parcela vencida, com multa e juros calculados para hoje (o texto é montado em documents.js).
  function overdueMessage(clientName) {
    messageModal('Mensagem de cobrança', App.documents.collectionMessage(clientName) || 'Este cliente não tem parcelas vencidas.', clientName);
  }

  // Lembrete antes do vencimento (parcela que ainda não venceu).
  function reminderMessage(saleId, installment) {
    const sale = data.sales.find(s => s.id === saleId);
    if (!sale) return;
    const item = installmentsFor(sale).find(i => i.number === Number(installment));
    if (!item) return;
    const text = fill(template('reminder'), {cliente: sale.client, valor: money(item.balance), vencimento: dateLabel(item.due), parcela: `${item.number} de ${sale.installments}`, id: sale.id});
    messageModal('Lembrete de vencimento', text, sale.client);
  }

  // Orçamento parado: pergunta, com educação, se o cliente conseguiu ver.
  function quoteFollowUp(quoteId) {
    const quote = data.quotes.find(q => q.id === quoteId);
    if (!quote) return;
    const item = quote.product || (quote.items && quote.items[0] && quote.items[0].name) || 'seu orçamento';
    const value = quote.pricing ? quote.pricing.total : Math.max(0, Number(quote.total) - Number(quote.discount || 0));
    messageModal('Mensagem do orçamento', fill(template('quote'), {cliente: quote.client, id: quote.id, item, valor: money(value)}), quote.client);
  }

  App.ui.registerAction('overdue-message', element => overdueMessage(element.dataset.client));
  App.ui.registerAction('remind-message', element => reminderMessage(element.dataset.sale, element.dataset.installment));
  App.ui.registerAction('quote-message', element => quoteFollowUp(element.dataset.id));
  App.ui.registerAction('wa-open', element => { const area = byId('confirmation-message') || byId('doc-message') || byId('os-message'); App.whatsapp.open(App.whatsapp.phoneOf(element.dataset.client), area ? area.value : ''); });
  App.ui.registerAction('copy-message', () => {
    const text = byId('confirmation-message');
    let copied;
    if (navigator.clipboard) copied = navigator.clipboard.writeText(text.value);
    else { text.select(); copied = Promise.resolve(document.execCommand('copy')); }
    copied.then(() => { byId('copy-status').textContent = 'Mensagem copiada!'; });
  });

  App.messages = {overdueMessage, reminderMessage, quoteFollowUp, template, fill, DEFAULTS};
})();
