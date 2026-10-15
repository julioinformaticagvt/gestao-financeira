// Tela "Vendas": lista de vendas, formulário "Registrar venda", editar venda e cancelamento de venda.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today, normalize} = App.format;
  const {data, save} = App.store;
  const {openModal, closeModal, byId, go} = App.ui;
  const {paymentBlock} = App.components;
  const {activePayments, recalcSale, round2, totalsByType, itemType} = App.finance;
  const P = App.pricing;

  // ---------- lista ----------
  function render() {
    const rows = data.sales.slice().reverse().map(sale => {
      const canceled = sale.status === 'Cancelada';
      const status = (canceled ? '<span class="badge neutral">Cancelada</span>' : `<span class="badge ${sale.balance ? 'warn' : ''}">${sale.balance ? 'Em aberto' : 'Pago'}</span>`)
        + (sale.editedAt ? ` <span class="badge neutral" title="Editada em ${dateLabel(sale.editedAt)}">editada</span>` : '');
      const actions = canceled ? '' : `<button class="secondary" data-action="edit-sale" data-sale="${sale.id}">Editar</button> <button class="secondary" data-action="cancel-sale" data-sale="${sale.id}">Cancelar</button>`;
      return `<tr class="${canceled ? 'voided' : ''}"><td>${sale.id}${sale.osId ? `<br><small class="muted">Origem: ${esc(sale.osId)}</small>` : ""}</td><td>${esc(sale.client)}</td><td>${dateLabel(sale.date)}</td><td>${esc(sale.method || '-')}</td><td>${money(sale.total)}</td><td class="positive">${money(sale.paid)}</td><td class="negative">${money(sale.balance)}</td><td>${status}</td><td>${actions}</td></tr>`;
    }).join('');
    byId('app').innerHTML = `<section class="panel"><div class="panel-head"><h2>Vendas realizadas</h2><button class="primary" data-action="new-sale">+ Nova venda</button></div>${data.sales.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Cliente</th><th>Data</th><th>Forma</th><th>Total</th><th>Pago</th><th>Saldo</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : App.firstRun.emptyState({title: 'Você ainda não registrou vendas.', hint: 'Cada venda guarda o cliente, o valor, a forma de pagamento e gera o recibo.', action: 'new-sale', label: '+ Nova venda'})}</section>`;
  }

  // ---------- registrar (ou editar) venda ----------
  // editing = a venda que está sendo editada (formulário já preenchido); sem ela, é uma venda nova.
  function saleForm(clientName, editing, prefill) {
    const clientOptions = data.clients.map(c => `<option value="${esc(c.name)}">`).join('');
    const productOptions = data.products.map(p => `<option value="${esc(p.name)}">`).join('');
    openModal(`<h2>${editing ? `Editar venda ${editing.id}` : 'Registrar venda'}</h2><form id="sale-form" class="form-grid"><div class="field full"><label>Cliente *</label><input id="sale-client" name="client" list="client-options" placeholder="Buscar cliente..." required><datalist id="client-options">${clientOptions}</datalist><button type="button" class="secondary" data-action="new-client-quick">+ Adicionar novo cliente</button></div>${paymentBlock.markup.items('product-options')}<datalist id="product-options">${productOptions}</datalist><div class="field full"><button type="button" class="secondary" data-action="new-product-quick">+ Adicionar novo produto ou serviço</button></div><div class="field"><label>Data da venda *</label><input name="date" type="date" value="${today()}" max="${today()}" required></div>${paymentBlock.markup.discount()}${paymentBlock.markup.payment()}<p class="muted field full" data-show="carne">No carnê, a primeira parcela vence no dia ${data.settings.dueDay || 12} do mês seguinte à data da venda.</p>${editing ? '<p class="muted field full">Ao salvar, o estoque é acertado (o que esta venda tirou volta e o novo é descontado) e, se a venda já estava paga, o recibo antigo é cancelado e um novo é emitido.</p>' : ''}<p class="negative field full" id="sale-error" hidden></p><div class="actions field full"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary">${editing ? 'Salvar alterações' : 'Registrar venda'}</button></div></form>`);

    const form = byId('sale-form');
    let initial = {};
    if (editing) {
      const p = editing.pricing || {};
      form.elements.client.value = editing.client;
      form.elements.date.value = editing.date;
      form.elements.discount.value = editing.discountType === "percent" ? (editing.discountValue || 0) : (editing.discount || 0);
      form.elements.discountType.value = editing.discountType === "percent" ? "percent" : "money";
      form.elements.invoiceIssued.checked = !!(editing.invoice && editing.invoice.issued);
      form.elements.invoiceNumber.value = (editing.invoice && editing.invoice.number) || "";
      paymentBlock.fillItems(form, editing.items || []);
      initial = {modality: p.modality, installments: p.installments, account: p.account, entry: editing.entry || 0, firstDue: editing.firstDue || '', feeRate: p.feeRate, baseRate: p.baseRate, extraRate: p.extraRate};
    }
    if (prefill) {   // volta do cadastro rápido: devolve o que já estava digitado
      App.ui.applyForm(form, prefill);
      initial = {modality: prefill.modality, installments: prefill.installments, account: prefill.account, entry: prefill.entry, firstDue: prefill.firstDue, feeRate: prefill.feeRate, baseRate: prefill.baseRate, extraRate: prefill.extraRate};
    }
    const block = paymentBlock.bind(form, initial);
    App.ui.groupFields(form, [
      {kind: 'client', title: 'Cliente', items: ['client', '[data-action="new-product-quick"]']},
      {kind: 'product', title: 'Produto ou serviço', items: ['.item-block', '#add-item', '.items-help']},
      {kind: 'pay', title: 'Pagamento e datas', items: ['date', 'discount', 'modality', 'installments', 'account', 'entry', 'firstDue', 'feeRate', 'baseRate', 'extraRate', '#pay-compare', '#pay-schedule', 'p[data-show="carne"]', 'invoiceIssued', 'invoiceNumber']}
    ]);
    form.elements.installments.max = data.settings.maxInstallments;
    if (editing) form.querySelectorAll('[data-action="new-client-quick"], [data-action="new-product-quick"]').forEach(button => button.remove());   // o cadastro rápido reabriria uma venda nova
    else if (clientName) { form.elements.client.value = clientName; form.elements.client.dispatchEvent(new Event('change')); }   // vindo da tela do cliente

    form.onsubmit = event => {
      event.preventDefault();
      const pay = block.read();
      const error = message => { const box = byId('sale-error'); box.textContent = message; box.hidden = false; };
      if (!(pay.withExtra.total > 0)) return error('O valor da venda precisa ser maior que zero.');
      const client = App.clientApi.resolve(form.elements.client.value), date = form.elements.date.value;
      if (!client) return error('Escolha um cliente da lista ou cadastre o cliente novo.');
      if (date > today()) return error('A data da venda não pode ser no futuro.');
      if (editing) return applyEdit(editing, {client, date, pay});
      App.finance.ensureProducts(pay.items);
      const sale = App.saleBuilder.create({client, date, pay});
      data.sales.push(sale);
      const receipts = sale.payments.map(payment => App.receipts.issue(sale, payment));
      save();
      closeModal();
      go('sales');
      if (receipts.length) App.receipts.show(receipts[0].number);
    };
  }

  // ---------- editar venda ----------
  // Venda sem pagamento recebido, ou paga na hora (à vista): dá para mudar tudo. Carnê com pagamento (entrada ou parcela
  // paga) e vendas antigas: só cliente, data, nomes e custos dos itens (o valor, a forma e as parcelas ficam como estão).
  const isImmediate = sale => !!(sale.pricing && P.modality(sale.pricing.modality).immediate);
  const canEditAll = sale => !!sale.pricing && (isImmediate(sale) || !activePayments(sale).length);

  function editSale(saleId) {
    const sale = data.sales.find(s => s.id === saleId);
    if (!sale || sale.status === 'Cancelada') return;
    if (canEditAll(sale)) saleForm(null, sale); else limitedForm(sale);
  }

  // Troca a venda antiga pela nova (mesmo número), acerta estoque e recibos.
  function applyEdit(old, {client, date, pay}) {
    const receiptsOld = activePayments(old).map(p => p.receipt).filter(Boolean);
    if (isImmediate(old) && receiptsOld.length) {
      const before = `${money(old.total)} · ${old.method} · ${old.client} · ${dateLabel(old.date)}`, after = `${money(pay.withExtra.total)} · ${P.paymentLabel(pay.modality, pay.account)} · ${client} · ${dateLabel(date)}`;
      if (!confirm(`Editar a venda ${old.id}?\n\nAntes: ${before}\nDepois: ${after}\n\nO recibo nº ${[...new Set(receiptsOld)].map(App.receipts.pad).join(', ')} será cancelado e um recibo novo será emitido.`)) return;
    }
    App.finance.ensureProducts(pay.items);
    App.stock.restore(old);                                    // devolve o que a venda antiga tirou
    const sale = App.saleBuilder.create({client, date, quoteId: old.quoteId, osId: old.osId, warranty: old.warranty, pay, id: old.id});   // monta a venda nova (e dá a nova baixa), com o mesmo código
    sale.uid = old.uid;   // é a mesma venda: o id interno continua
    sale.editedAt = today();
    // pagamentos antigos ficam no histórico como "desfeitos" e os recibos deles são cancelados
    const history = (old.payments || []).map(p => { if (p.voided) return p; App.receipts.cancelFor(p); return {...p, voided: true, voidedAt: today(), note: p.note ? `${p.note} · venda editada` : 'venda editada'}; });
    sale.payments = [...history, ...sale.payments];
    recalcSale(sale);
    data.sales[data.sales.indexOf(old)] = sale;
    const receipts = sale.payments.filter(p => !p.voided && !p.receipt).map(payment => App.receipts.issue(sale, payment));
    save();
    closeModal();
    go('sales');
    if (receipts.length) App.receipts.show(receipts[0].number);
  }

  function limitedForm(sale) {
    const clientOptions = data.clients.map(c => `<option value="${esc(c.name)}">`).join('');
    const productOptions = data.products.map(p => `<option value="${esc(p.name)}">`).join('');
    const rows = (sale.items || []).map((item, i) => `<div class="item-block"><div class="field item-name"><label>Item ${i + 1}</label><input name="name${i}" list="limited-products" value="${esc(item.name || '')}"></div><div class="field"><label>Quantidade</label><input value="${item.qty || 1}" disabled></div><div class="field"><label>VENDA (R$) <small>cada</small></label><input value="${item.unit ?? round2(item.amount / (item.qty || 1))}" disabled></div><div class="field"><label>COMPRA (R$) <small>cada · eu pago</small></label><input name="cost${i}" type="number" min="0" step="0.01" value="${item.unitCost ?? (item.cost === undefined ? '' : round2(item.cost / (item.qty || 1)))}"></div></div>`).join('');
    openModal(`<h2>Editar venda ${sale.id}</h2><form id="limited-form" class="form-grid"><div class="field full"><label>Cliente *</label><input name="client" list="limited-clients" value="${esc(sale.client)}" required><datalist id="limited-clients">${clientOptions}</datalist></div>${rows}<datalist id="limited-products">${productOptions}</datalist><div class="field"><label>Data da venda *</label><input name="date" type="date" value="${sale.date}" max="${today()}" required></div><p class="muted field full">Esta venda ${sale.pricing ? 'já tem pagamentos recebidos' : 'é antiga (feita antes do formulário atual)'}, por isso o <b>valor, a forma de pagamento e as parcelas não mudam aqui</b>. Dá para corrigir o cliente, a data e os nomes e custos dos itens. Para mudar o valor ou as parcelas, cancele a venda e registre de novo (os pagamentos já recebidos ficam no histórico).</p><p class="negative field full" id="limited-error" hidden></p><div class="actions field full"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary">Salvar alterações</button></div></form>`);
    const form = byId('limited-form');
    App.ui.groupFields(form, [
      {kind: 'client', title: 'Cliente', items: ['client']},
      {kind: 'product', title: 'Itens (nome e custo)', items: ['.item-block']},
      {kind: 'pay', title: 'Data', items: ['date']}
    ]);
    form.onsubmit = event => {
      event.preventDefault();
      const f = form.elements, client = App.clientApi.resolve(f.client.value);
      if (!client) { const box = byId('limited-error'); box.textContent = 'Escolha um cliente da lista ou cadastre o cliente novo.'; box.hidden = false; return; }
      const names = (sale.items || []).map((_, i) => f[`name${i}`].value.trim());
      if (names.some(name => !name)) { const box = byId('limited-error'); box.textContent = 'Todo item precisa de um nome.'; box.hidden = false; return; }
      App.finance.ensureProducts(names.map(name => ({name})));
      App.stock.restore(sale);
      sale.items.forEach((item, i) => {
        const qty = item.qty || 1, cost = f[`cost${i}`].value === '' ? item.unitCost : Number(f[`cost${i}`].value) || 0;
        Object.assign(item, {name: names[i], type: itemType(names[i])});
        if (cost !== undefined) Object.assign(item, {unitCost: cost, cost: round2(qty * cost)});
      });
      const types = totalsByType(sale.items);
      Object.assign(sale, {client, date: f.date.value, product: sale.items[0].name, productTotal: types.product, serviceTotal: types.service, editedAt: today()});
      if (sale.pricing && sale.items.every(i => i.cost !== undefined)) {
        sale.cost = round2(sale.items.reduce((total, i) => total + i.cost, 0));
        sale.pricing.profit = round2(sale.pricing.net - sale.cost);
      }
      App.stock.consume(sale);
      // recibos desta venda acompanham: cliente (se o recibo é só desta venda) e descrição dos itens
      for (const r of data.receipts) {
        const mine = r.lines ? r.lines.some(l => l.saleId === sale.id) : r.saleId === sale.id;
        if (!mine) continue;
        if (r.lines) r.lines.filter(l => l.saleId === sale.id).forEach(l => { l.itemsText = App.documents.itemsText(sale); l.saleDate = sale.date; l.items = sale.items.map(i => ({name: i.name, qty: i.qty || 1, amount: i.amount})); });
        else r.items = sale.items.map(i => ({name: i.name, qty: i.qty || 1, amount: i.amount}));
        if (!r.lines || r.lines.every(l => l.saleId === sale.id)) { if (r.client !== client) delete r.clientId; r.client = client; }   // o id é refeito pelo nome ao salvar
      }
      save();
      closeModal();
      go('sales');
    };
  }

  // ---------- cadastro rápido de cliente / produto ou serviço, sem sair da venda (nem do orçamento) ----------
  // Antes de abrir a janelinha, guarda o que já estava digitado; depois de salvar, reabre o mesmo formulário com tudo no lugar.
  let quick = null;   // {kind: 'sale' | 'quote', snapshot}
  function captureQuick() {
    const form = byId('sale-form') || byId('quote-form');
    if (form) quick = {kind: form.id === 'quote-form' ? 'quote' : 'sale', snapshot: App.ui.snapshotForm(form)};
  }
  function reopenQuick() {
    if (quick && quick.kind === 'quote') App.quotes.reopen(quick.snapshot); else saleForm(null, null, quick && quick.snapshot);
    return byId('sale-form') || byId('quote-form');
  }
  // Coloca um produto no primeiro item livre (abrindo mais um item se for preciso) e dispara o preenchimento automático em azul.
  function selectProduct(form, name) {
    const field = n => form.elements[n === 1 ? 'product' : `product${n}`];
    let n = 1;
    while (n < paymentBlock.MAX_ITEMS && field(n).value) n++;
    const blocks = [...form.querySelectorAll('.item-block')];
    while (blocks[n - 1].hidden) form.querySelector('#add-item').click();
    field(n).value = name;
    field(n).dispatchEvent(new Event('input', {bubbles: true}));
  }

  function quickClient() {
    captureQuick();
    openModal(`<h2>Adicionar novo cliente</h2><form id="quick-client"><div class="field"><label>Nome completo *</label><input name="name" required autofocus></div><div class="field"><label>Telefone / WhatsApp</label><input name="phone"></div><div class="actions"><button type="button" class="secondary" data-action="quick-cancel">Cancelar</button><button class="primary">Salvar e selecionar</button></div></form>`);
    byId('quick-client').onsubmit = event => {
      event.preventDefault();
      const client = Object.fromEntries(new FormData(event.target));
      data.clients.push({...client, createdAt: today()});
      save();
      closeModal();
      const form = reopenQuick();
      form.elements.client.value = client.name;
      form.elements.client.dispatchEvent(new Event('change'));
    };
  }

  // Primeiro pergunta se é produto ou serviço; depois pede nome, custo e preço (sugerido com a margem padrão).
  function quickProduct(element) {
    if (!(element && element.dataset && element.dataset.back)) captureQuick();   // "Voltar" não recaptura (o formulário já foi trocado)
    openModal(`<h2>Adicionar novo produto ou serviço</h2><p class="muted">O que você quer cadastrar?</p><div class="type-choice"><button type="button" class="type-btn" data-type="Produto"><b>Produto</b><span>tem estoque e custo de compra</span></button><button type="button" class="type-btn" data-type="Serviço"><b>Serviço</b><span>sem estoque (formatação, mão de obra...)</span></button></div><div class="actions"><button type="button" class="secondary" data-action="quick-cancel">Cancelar</button></div>`);
    document.querySelectorAll('.type-btn').forEach(button => { button.onclick = () => quickProductForm(button.dataset.type); });
  }

  function quickProductForm(type) {
    const service = type === 'Serviço', margin = Number(data.settings.defaultMargin) || 0;
    openModal(`<h2>Novo ${service ? 'serviço' : 'produto'}</h2><form id="quick-product" class="form-grid"><div class="field full"><label>Nome ${service ? 'do serviço' : 'do produto'} *</label><input name="name" required autofocus></div>${service ? '' : '<div class="field"><label>Estoque atual</label><input name="stock" type="number" step="1" value="0"></div>'}<div class="field"><label>${service ? 'Custo do serviço (R$)' : 'Custo (R$)'} <small>quanto eu pago</small></label><input name="cost" type="number" min="0" step="0.01"></div><div class="field"><label>Preço de venda (R$) <small>sugerido: custo + ${String(margin).replace('.', ',')}%</small></label><input name="price" type="number" min="0" step="0.01"></div><p class="negative field full" id="quick-error" hidden></p><div class="actions field full"><button type="button" class="secondary" data-action="new-product-quick" data-back="1">← Voltar</button><button class="primary">Salvar e selecionar</button></div></form>`);
    const form = byId('quick-product');
    App.ui.groupFields(form, [{kind: 'product', title: service ? 'Serviço' : 'Produto', items: ['name', 'stock']}, {kind: 'pay', title: 'Custo e preço', items: ['cost', 'price']}]);
    let priceTouched = false;
    form.addEventListener('input', event => {
      if (event.target.name === 'price') { priceTouched = true; event.target.classList.remove('auto'); return; }
      if (event.target.name === 'cost' && !priceTouched) {
        const cost = Number(form.elements.cost.value) || 0, price = round2(cost * (1 + margin / 100));
        form.elements.price.value = price > 0 ? price : '';
        form.elements.price.classList.toggle('auto', price > 0);
      }
    });
    form.onsubmit = event => {
      event.preventDefault();
      const f = form.elements, name = f.name.value.trim();
      if (data.products.some(p => normalize(p.name) === normalize(name))) { const box = byId('quick-error'); box.textContent = 'Já existe um item com esse nome.'; box.hidden = false; return; }
      const product = {name, sku: '', type, cost: Number(f.cost.value) || 0, price: Number(f.price.value) || 0, margin, stock: service ? 0 : Math.round(Number(f.stock.value) || 0)};
      data.products.push(product);
      save();
      closeModal();
      selectProduct(reopenQuick(), name);
    };
  }

  // ---------- cancelar venda ----------
  function cancelConfirm(saleId) {
    const sale = data.sales.find(s => s.id === saleId);
    openModal(`<h2>Cancelar a venda ${sale.id}?</h2><p>Venda de <b>${esc(sale.client)}</b>, ${dateLabel(sale.date)}, no valor de <b>${money(sale.total)}</b>.</p><p>Ela deixa de contar em vendido, recebido, lucro e contas a receber. Os recibos dela são marcados como cancelados. Já foram recebidos <b>${money(sale.paid)}</b>: o sistema <b>não devolve</b> esse dinheiro; se for devolvido ao cliente, isso é feito por fora. A venda continua na lista, marcada como cancelada.</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Voltar</button><button type="button" class="danger" data-action="cancel-sale-confirm" data-sale="${sale.id}">Cancelar venda</button></div>`);
  }

  function cancelSale(saleId) {
    const sale = data.sales.find(s => s.id === saleId);
    sale.status = 'Cancelada';
    sale.canceledAt = today();
    App.stock.restore(sale);   // as peças vendidas voltam para o estoque
    (sale.payments || []).forEach(payment => App.receipts.cancelFor(payment));
    save();
    closeModal();
    go('sales');
  }

  App.ui.registerScreen('sales', render);
  App.ui.registerAction('new-sale', () => saleForm());
  App.ui.registerAction('new-sale-for', element => saleForm(element.dataset.client));
  App.ui.registerAction('edit-sale', element => editSale(element.dataset.sale));
  App.ui.registerAction('new-client-quick', quickClient);
  App.ui.registerAction('quick-cancel', () => reopenQuick());   // desistiu do cadastro rápido: volta ao formulário como estava
  App.ui.registerAction('new-product-quick', element => quickProduct(element));
  App.ui.registerAction('cancel-sale', element => cancelConfirm(element.dataset.sale));
  App.ui.registerAction('cancel-sale-confirm', element => cancelSale(element.dataset.sale));
})();
