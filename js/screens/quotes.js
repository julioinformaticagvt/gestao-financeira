// Tela "Orçamentos" (e "Orçamentos e OS"): lista por cliente, simulação com taxa/juros/lucro e conversão em venda.
// Com "Uso ordem de serviço" ligado, a mesma ficha também vira ordem de serviço (kind: 'os'); ver features/service-orders.js.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, normalize, today} = App.format;
  const {data, save} = App.store;
  const {byId, openModal, closeModal} = App.ui;
  const {paymentBlock} = App.components;
  const P = App.pricing;
  const SO = () => App.serviceOrders;

  const STATUSES = ['Rascunho', 'Enviado', 'Aprovado', 'Recusado', 'Cancelado'];

  const quoteId = () => App.store.peekCode('quote');   // só prévia: o código de verdade é dado ao salvar (contador, nunca reaproveita)
  // Valor do orçamento depois do desconto (orçamentos antigos).
  const netTotal = quote => Math.max(0, Number(quote.total) - Number(quote.discount || 0));
  const isOs = quote => quote.kind === 'os';

  // ---------- lista ----------
  function render() {
    const withOs = SO().enabled();
    SO().applyLabels();
    const visible = data.quotes.filter(q => withOs || !isOs(q));   // com a chave desligada, as OS ficam guardadas e escondidas
    const byClient = visible.reduce((all, quote) => { (all[quote.client || 'Sem cliente'] ||= []).push(quote); return all; }, {});
    const buttons = withOs
      ? '<span><button class="secondary" data-action="new-quote">+ Orçamento</button> <button class="primary" data-action="new-os">+ Ordem de serviço</button></span>'
      : '<button class="primary" data-action="new-quote">+ Simular venda</button>';
    byId('app').innerHTML = `<section class="panel"><div class="panel-head"><h2>${withOs ? 'Orçamentos e OS' : 'Orçamentos'}</h2>${buttons}</div><div class="toolbar"><input id="quote-search" placeholder="Buscar cliente..."></div><div id="quote-list"></div></section>`;

    // Orçamentos novos mostram forma de pagamento, venda, compra e lucro; os antigos mostram parcelas e juros ao mês.
    const detail = quote => quote.pricing
      ? `${esc(quote.pricing.label)}${quote.pricing.installments > 1 ? ` em ${quote.pricing.installments}x` : ''} · venda ${money(quote.pricing.price)} · compra ${money(quote.cost)} · <b>lucro líquido ${money(quote.pricing.profit)}</b>`
      : `${quote.installments} parcelas · juros ${Number(quote.monthlyInterest || 0).toFixed(2)}% ao mês`;
    const quoteCard = quote => `<div class="card" style="margin-bottom:10px"><div class="panel-head"><div><b>${esc(quote.id)}</b> · ${dateLabel(quote.date)}<br><span class="quote-status">${esc(quote.status || 'Rascunho')}</span></div><strong>${money(quote.pricing ? quote.pricing.total : netTotal(quote))}</strong></div><p class="muted">${detail(quote)} · atualizado ${dateLabel(quote.updatedAt)}${quote.validUntil ? ` · válido até ${dateLabel(quote.validUntil)}` : ''}</p><div class="quote-actions"><button class="secondary" data-action="edit-quote" data-id="${esc(quote.id)}">Editar</button><button class="primary" data-action="convert-quote" data-id="${esc(quote.id)}" ${quote.status === 'Convertido em venda' ? 'disabled' : ''}>Fechar venda</button></div></div>`;
    // Cartão da ordem de serviço: equipamento, andamento (lista de um clique), histórico e os papéis.
    const osCard = quote => {
      const o = quote.os, sale = SO().saleOf(quote), next = SO().nextStatus(quote);
      const options = [...new Set([quote.status, ...SO().allStatuses()])].map(s => `<option ${s === quote.status ? 'selected' : ''}>${esc(s)}</option>`).join('');
      const last = (o.history || []).slice(-1)[0];
      return `<div class="card os-card" style="margin-bottom:10px"><div class="panel-head"><div><b>${esc(quote.id)}</b> · ${esc(SO().equipmentText(quote))} · entrada ${dateLabel(o.entryDate)}${o.dueDate ? ` · previsão ${dateLabel(o.dueDate)}` : ''}<br><label class="os-status">Andamento <select data-os-status="${esc(quote.id)}">${options}</select></label></div><strong>${money(SO().valueOf(quote))}</strong></div><p class="muted">${esc(o.defect || 'Sem defeito relatado')}${last ? ` · último andamento: ${SO().stampLabel(last.at)}` : ''}${sale ? ` · venda ${esc(sale.id)}` : ''}</p><div class="quote-actions"><button class="secondary" data-action="edit-quote" data-id="${esc(quote.id)}">Editar</button>${next ? `<button class="secondary" data-action="os-advance" data-id="${esc(quote.id)}">Avançar ▸ ${esc(next)}</button>` : ''}<button class="secondary" data-action="os-entry" data-id="${esc(quote.id)}">Comprovante de entrada</button><button class="secondary" data-action="os-quote" data-id="${esc(quote.id)}">Orçamento</button><button class="secondary" data-action="os-message" data-id="${esc(quote.id)}">Avisar o cliente</button>${sale ? `<button class="secondary" data-action="os-warranty" data-id="${esc(quote.id)}">Termo de garantia</button>` : ''}<button class="primary" data-action="convert-quote" data-id="${esc(quote.id)}" ${sale ? 'disabled' : ''}>Fechar venda</button></div></div>`;
    };
    const card = quote => isOs(quote) ? osCard(quote) : quoteCard(quote);
    const draw = () => {
      const search = normalize(byId('quote-search').value);
      byId('quote-list').innerHTML = Object.entries(byClient).map(([client, items]) => {
        const list = items.filter(() => normalize(client).includes(search));
        if (!list.length) return '';
        return `<div><h3>${esc(client)}</h3>${list.map(card).join('')}</div>`;
      }).join('') || (visible.length ? '<div class="empty">Nenhum resultado para a busca.</div>' : App.firstRun.emptyState({title: withOs ? 'Você ainda não tem orçamentos nem ordens de serviço.' : 'Você ainda não tem orçamentos.', hint: withOs ? 'Use a ordem de serviço quando o cliente deixa o equipamento para conserto.' : 'Simule o preço e a forma de pagamento antes de fechar a venda.', action: withOs ? 'new-os' : 'new-quote', label: withOs ? '+ Ordem de serviço' : '+ Simular venda'}));
    };
    byId('quote-search').oninput = draw;
    draw();
  }

  // ---------- formulário ----------
  function formMarkup(quote) {
    const os = isOs(quote);
    const clientOptions = data.clients.map(c => `<option value="${esc(c.name)}">`).join('');
    const productOptions = data.products.map(p => `<option value="${esc(p.name)}">`).join('');
    const statusOptions = os
      ? [...new Set([quote.status, ...SO().allStatuses()])].map(s => `<option ${s === quote.status ? 'selected' : ''}>${esc(s)}</option>`).join('')
      : `${STATUSES.map(s => `<option>${s}</option>`).join('')}<option ${quote.status === 'Convertido em venda' ? 'selected' : ''}>Convertido em venda</option>`;
    const title = os ? (quote.existing ? `Editar ordem de serviço ${esc(quote.id)}` : 'Nova ordem de serviço') : (quote.existing ? 'Editar orçamento' : 'Simular venda / criar orçamento');
    return `<h2>${title}</h2><form id="quote-form" data-quote-id="${esc(quote.id)}" class="form-grid"><div class="field full"><label>Cliente *</label><input name="client" list="q-clients" value="${esc(quote.client)}" required><datalist id="q-clients">${clientOptions}</datalist><button type="button" class="secondary" data-action="new-client-quick">+ Adicionar novo cliente</button></div>${os ? SO().fieldsMarkup(quote) : ''}${paymentBlock.markup.items('q-products')}<datalist id="q-products">${productOptions}</datalist><div class="field full"><button type="button" class="secondary" data-action="new-product-quick">+ Adicionar novo produto ou serviço</button></div><div class="field"><label>Data do orçamento</label><input name="date" type="date" value="${quote.date}" required></div><div class="field"><label>Válido até</label><input name="validUntil" type="date" value="${quote.validUntil || ''}"></div>${paymentBlock.markup.discount()}${paymentBlock.markup.payment()}<p class="muted help late-note">Em caso de atraso, valem multa de ${data.settings.collection.fine}% e juros de ${data.settings.collection.interest}% ao mês (Financeiro &gt; Regras de cobrança).</p><div class="field"><label>${os ? 'Andamento' : 'Status'}</label><select name="status">${statusOptions}</select></div><div class="field full"><label>Observações</label><textarea name="notes">${esc(quote.notes || '')}</textarea></div><div class="actions field full"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button type="button" class="secondary" data-action="save-quote">${os ? 'Salvar ordem de serviço' : 'Salvar orçamento'}</button><button type="submit" class="primary">Fechar venda</button></div></form>`;
  }

  // Preenche os campos de itens e desconto de um orçamento que já existe.
  function fillExisting(form, quote) {
    const items = quote.items || [], first = items[0] || {};
    const set = (name, value) => { if (value !== undefined && value !== null) form.elements[name].value = value; };
    // itens novos guardam quantidade e valor unitário; os antigos só o total (quantidade 1)
    const fill = (n, item) => {
      set(`itemQty${n}`, item.qty || 1);
      set(`itemAmount${n}`, item.unit ?? item.amount);
      set(`itemCost${n}`, item.unitCost ?? item.cost);   // orçamentos antigos não têm custo: fica vazio e precisa ser preenchido
    };
    set('product', first.name ?? quote.product ?? '');
    if (items.length) fill(1, first); else set('itemAmount1', quote.total);
    items.slice(1, paymentBlock.MAX_ITEMS).forEach((item, i) => { set(`product${i + 2}`, item.name); fill(i + 2, item); });
    set('discount', quote.discountType === 'percent' ? (quote.discountValue || 0) : (quote.discount || 0));
    set('discountType', quote.discountType === 'percent' ? 'percent' : 'money');
    form.elements.invoiceIssued.checked = !!(quote.invoice && quote.invoice.issued);
    form.elements.invoiceNumber.value = (quote.invoice && quote.invoice.number) || '';
    if (quote.status && !isOs(quote)) form.elements.status.value = quote.status;
  }

  // Valores iniciais do bloco de pagamento: do orçamento novo, ou uma conversão razoável de um orçamento antigo.
  function initialPayment(quote) {
    if (quote.pricing) return {modality: quote.pricing.modality, installments: quote.pricing.installments, account: quote.pricing.account, entry: quote.entry || 0, firstDue: quote.firstDue || '', feeRate: quote.pricing.feeRate, baseRate: quote.pricing.baseRate, extraRate: quote.pricing.extraRate};
    if (quote.installments > 1) return {modality: 'carne', installments: quote.installments, entry: quote.entry || 0};
    return {modality: 'pix'};
  }

  // Abre o formulário. convert = true quando veio do botão "Fechar venda" do cartão (pede confirmação).
  // prefill = o que já estava digitado (volta do cadastro rápido de cliente ou produto).
  let current = null;
  function openQuote(quote, convert, prefill) {
    current = {quote, convert};
    openModal(formMarkup(quote));
    const os = isOs(quote);
    const form = byId('quote-form');
    fillExisting(form, quote);
    let initial = initialPayment(quote);
    if (prefill) {
      App.ui.applyForm(form, prefill);
      initial = {modality: prefill.modality, installments: prefill.installments, account: prefill.account, entry: prefill.entry, firstDue: prefill.firstDue, feeRate: prefill.feeRate, baseRate: prefill.baseRate, extraRate: prefill.extraRate};
    }
    const block = paymentBlock.bind(form, initial);
    const N = SO().FIELD_NAMES;
    App.ui.groupFields(form, [
      {kind: 'client', title: 'Cliente', items: ['client', '[data-action="new-product-quick"]']},
      ...(os ? [
        {kind: 'product', title: 'Equipamento', items: N.equipment},
        {kind: 'other', title: 'Defeito e diagnóstico', items: N.defect},
        {kind: 'pay', title: 'Datas, garantia e diagnóstico', items: N.dates}
      ] : []),
      {kind: 'product', title: 'Produto ou serviço', items: ['.item-block', '#add-item', '.items-help']},
      {kind: 'pay', title: 'Pagamento e datas', items: ['date', 'validUntil', 'discount', 'modality', 'installments', 'account', 'entry', 'firstDue', 'feeRate', 'baseRate', 'extraRate', '#pay-compare', '#pay-schedule', '.late-note', 'invoiceIssued', 'invoiceNumber']},
      {kind: 'other', title: 'Situação e observações', items: ['status', 'notes', ...(os ? N.notes : [])]}
    ]);
    block.refresh();

    // Guarda os dados do formulário no orçamento. Devolve {pay, wasNew}.
    const capture = () => {
      const pay = block.read(), f = form.elements;
      const clientName = App.clientApi.resolve(f.client.value);
      if (!clientName) { alert('Escolha um cliente da lista ou cadastre o cliente novo.'); return null; }
      App.finance.ensureProducts(pay.items);   // produto digitado que ainda não existe é cadastrado
      const wanted = f.status.value;
      Object.assign(quote, {
        client: clientName, product: pay.items[0]?.name || '', date: f.date.value, validUntil: f.validUntil.value,
        notes: f.notes.value, invoice: pay.invoiceIssued ? {issued: true, number: pay.invoiceNumber} : undefined, discount: pay.discount, discountType: pay.discountType, discountValue: pay.discountValue, items: pay.items, total: pay.sold, cost: pay.cost,
        productType: pay.items[0]?.type || 'Produto', installments: pay.modality === 'carne' ? pay.installments : 1, entry: pay.entry, firstDue: pay.firstDue,
        method: P.paymentLabel(pay.modality, pay.account), monthlyInterest: 0, updatedAt: today(),
        pricing: {modality: pay.modality, label: P.paymentLabel(pay.modality, pay.account), installments: pay.installments, plan: data.settings.machine.plan, account: pay.account, baseRate: pay.base, extraRate: pay.extra, feeRate: pay.feeRate, totalRate: pay.withExtra.totalRate, price: pay.price, total: pay.withExtra.total, fee: pay.withExtra.fee, net: pay.withExtra.net, profit: pay.withExtra.profit}
      });
      if (!os) quote.status = wanted;
      const wasNew = !data.quotes.some(x => x.id === quote.id);
      if (wasNew) {
        quote.id = os ? App.store.nextCode('os') : App.store.nextCode('quote');   // o código de verdade só nasce ao salvar
        data.quotes.push(quote);
      }
      if (os) {
        SO().readFields(form, quote);
        SO().startHistory(quote);
        if (wanted !== quote.status) SO().changeStatus(quote, wanted);   // regras do andamento (entregar, recusar...)
      }
      return {pay, wasNew, status: wanted};
    };

    form.querySelector('[data-action="save-quote"]').onclick = () => {
      if (!form.reportValidity()) return;
      const before = quote.status;
      const result = capture();
      if (!result) return;
      quote.status = quote.status || (os ? 'Recebido' : 'Rascunho');
      save();
      closeModal();
      render();
      if (os && result.wasNew) SO().showEntry(quote);                       // comprovante de entrada (sem a senha)
      else if (os && quote.status !== before) SO().afterChange(quote, quote.status);
    };

    form.onsubmit = event => {
      event.preventDefault();
      const already = quote.saleId && data.sales.find(s => s.id === quote.saleId && s.status !== 'Cancelada');
      if (already) return alert(`Este orçamento já virou a venda ${already.id}. Para mudar a venda, use "Editar" em Vendas.`);
      // pergunta SEMPRE (apertar Enter num campo também envia o formulário e viraria venda sem aviso)
      if (!confirm(os ? 'Deseja fechar a venda desta ordem de serviço?' : 'Deseja transformar este orçamento em uma venda?')) return;
      // confere o valor ANTES de gravar o orçamento (senão ficava um orçamento "fantasma" gravado)
      if (!(block.read().withExtra.total > 0)) return alert('O valor do orçamento precisa ser maior que zero.');
      const firstDue = block.read().firstDue;   // a venda nasce hoje: a 1ª parcela do carnê não pode já estar vencida
      if (firstDue && firstDue < today()) return alert(`A 1ª parcela está marcada para ${dateLabel(firstDue)}, antes de hoje. Mude a data da 1ª parcela (ou deixe em branco) antes de fechar a venda.`);
      const result = capture();
      if (!result) return;
      const pay = result.pay;
      const extra = os ? {osId: quote.id, warranty: quote.os.warrantyDays > 0 ? SO().warrantyLabel(quote) : ''} : {};
      // a venda nasce HOJE (dia em que foi fechada), não na data do orçamento: a receita entra no mês certo e o carnê não nasce atrasado
      const sale = App.saleBuilder.create({client: quote.client, date: today(), quoteId: quote.id, pay, ...extra});
      data.sales.push(sale);
      const receipts = sale.payments.map(payment => App.receipts.issue(sale, payment));
      quote.saleId = sale.id;
      if (os) SO().afterSale(quote, sale);
      else quote.status = 'Convertido em venda';
      save();
      closeModal();
      render();
      if (receipts.length) App.receipts.show(receipts[0].number);
    };
  }

  const newQuote = () => ({id: quoteId(), kind: 'quote', client: '', product: '', date: today(), discount: 0, status: 'Rascunho', updatedAt: today()});
  const findQuote = element => data.quotes.find(q => q.id === element.dataset.id);

  App.quotes = {reopen: prefill => current && openQuote(current.quote, current.convert, prefill)};   // usado pelo cadastro rápido
  App.ui.registerScreen('quotes', render);
  App.ui.registerAction('new-quote', () => openQuote(newQuote()));
  App.ui.registerAction('new-os', () => openQuote(SO().newOs()));
  App.ui.registerAction('edit-quote', element => { const quote = findQuote(element); if (quote) { quote.existing = true; openQuote(quote, false); } });
  App.ui.registerAction('convert-quote', element => { const quote = findQuote(element); if (quote) { if (isOs(quote)) quote.existing = true; openQuote(quote, true); } });
  App.ui.registerAction('os-advance', element => {
    const quote = findQuote(element), next = quote && SO().nextStatus(quote);
    if (next && SO().changeStatus(quote, next)) SO().afterChange(quote, next);
    App.ui.go('quotes');
  });
  App.ui.registerAction('os-entry', element => { const quote = findQuote(element); if (quote) SO().showEntry(quote); });
  App.ui.registerAction('os-quote', element => { const quote = findQuote(element); if (quote) SO().showQuote(quote); });
  App.ui.registerAction('os-message', element => { const quote = findQuote(element); if (quote) SO().showMessage(quote); });
  App.ui.registerAction('os-warranty', element => { const quote = findQuote(element); if (quote) SO().showWarranty(quote); });
})();
