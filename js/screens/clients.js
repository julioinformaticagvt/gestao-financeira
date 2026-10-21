// Tela "Clientes": lista com busca, novo cliente, ficha editável, histórico de compras e pagamentos.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, normalize, today, sum} = App.format;
  const {data, save} = App.store;
  const {receivableItems, activeSales, recalcSale} = App.finance;
  const {openModal, closeModal, byId, go} = App.ui;

  // ---------- lista ----------
  function render() {
    byId('app').innerHTML = `<section class="panel"><div class="panel-head"><h2>Clientes cadastrados</h2><button class="primary" data-action="new-client">+ Novo cliente</button></div><div class="toolbar"><input id="search" placeholder="Buscar por nome, CPF ou telefone..."></div><div id="client-table"></div></section>`;

    const draw = () => {
      const query = normalize(byId('search').value);
      const rows = data.clients.filter(c => normalize(c.name + c.doc + c.phone).includes(query));
      byId('client-table').innerHTML = rows.length
        ? `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Telefone</th><th>Compras</th><th>Em aberto</th><th></th></tr></thead><tbody>${rows.map(client => {
          const sales = activeSales().filter(s => s.client === client.name);
          return `<tr><td><b>${esc(client.name)}</b></td><td>${esc(client.doc) || '-'}</td><td>${esc(client.phone) || '-'}</td><td>${money(sum(sales, s => s.total))}</td><td class="negative">${money(sum(sales, s => s.balance))}</td><td><button class="secondary" data-action="open-client" data-client="${esc(client.name)}">Abrir</button></td></tr>`;
        }).join('')}</tbody></table></div>`
        : (data.clients.length ? '<div class="empty">Nenhum cliente encontrado.</div>' : App.firstRun.emptyState({title: 'Você ainda não tem clientes.', hint: 'Cadastre quem compra de você.', action: 'new-client', label: '+ Novo cliente'}));
    };
    byId('search').oninput = draw;
    draw();
  }

  // ---------- novo cliente ----------
  function clientForm() {
    openModal(`<h2>Novo cliente</h2><form id="client-form" class="form-grid"><div class="field full"><label for="client-name">Nome completo *</label><input id="client-name" name="name" required></div><div class="field"><label>CPF/CNPJ</label><input name="doc"></div><div class="field"><label>Telefone / WhatsApp</label><input name="phone"></div><div class="field full"><label>E-mail</label><input name="email" type="email"></div><div class="field full"><label>Observações</label><textarea name="notes"></textarea></div><div class="actions field full"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary">Salvar cliente</button></div></form>`);
    App.ui.groupFields(byId('client-form'), [{kind: 'client', title: 'Cliente', items: ['name', 'doc', 'phone', 'email']}, {kind: 'other', title: 'Observações', items: ['notes']}]);
    byId('client-form').onsubmit = event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      values.name = String(values.name || '').trim();
      if (App.store.findByName('clients', values.name)) return alert(`Já existe um cliente chamado "${App.store.findByName('clients', values.name).name}". Use outro nome (por exemplo, com o sobrenome).`);
      data.clients.push({...values, createdAt: today()});
      save();
      closeModal();
      go('clients');
    };
  }

  // ---------- ficha do cliente (editar / excluir) ----------
  // Um registro pertence ao cliente pelo id interno (clientId); registro sem clientId (muito antigo) cai no nome.
  const ofClient = (record, client) => record.clientId ? record.clientId === client.uid : record.client === client.name;
  const hasMovement = client => data.sales.some(s => ofClient(s, client)) || (data.quotes || []).some(q => ofClient(q, client));

  function clientCard(name) {
    const client = data.clients.find(c => c.name === name);
    if (!client) return;
    const canDelete = !hasMovement(client);
    openModal(`<h2>Ficha do cliente</h2><form id="client-edit-form" class="form-grid"><div class="field full"><label>Nome completo *</label><input name="name" value="${esc(client.name)}" required></div><div class="field"><label>CPF/CNPJ</label><input name="doc" value="${esc(client.doc)}"></div><div class="field"><label>Telefone / WhatsApp</label><input name="phone" value="${esc(client.phone)}"></div><div class="field full"><label>E-mail</label><input name="email" type="email" value="${esc(client.email)}"></div><div class="field full"><label>Observações</label><textarea name="notes">${esc(client.notes)}</textarea></div><p class="negative field full" id="client-error" hidden></p><p class="muted field full">Mudar o nome atualiza as vendas (recibos não mudam).${canDelete ? '' : ' Tem vendas: não pode ser excluído.'}</p><div class="actions field full"><button type="button" class="secondary" data-action="client-history" data-client="${esc(client.name)}">Ver histórico</button><button type="button" class="secondary" data-action="client-reminders" data-client="${esc(client.name)}">Lembretes</button>${canDelete ? `<button type="button" class="danger" data-action="client-delete" data-client="${esc(client.name)}">Excluir cliente</button>` : ''}<button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary">Salvar</button></div></form>`);
    App.ui.groupFields(byId('client-edit-form'), [{kind: 'client', title: 'Cliente', items: ['name', 'doc', 'phone', 'email']}, {kind: 'other', title: 'Observações', items: ['notes']}]);

    byId('client-edit-form').onsubmit = event => {
      event.preventDefault();
      const f = Object.fromEntries(new FormData(event.target)), newName = f.name.trim();
      if (data.clients.some(c => c !== client && normalize(c.name) === normalize(newName))) {
        const box = byId('client-error'); box.textContent = 'Já existe outro cliente com esse nome.'; box.hidden = false; return;
      }
      if (newName !== client.name) {
        // pelo id interno: vendas, orçamentos e lembretes mostram o nome novo; recibos já emitidos NÃO mudam (são documentos)
        data.sales.forEach(s => { if (ofClient(s, client)) s.client = newName; });
        data.quotes.forEach(q => { if (ofClient(q, client)) q.client = newName; });
        data.reminders.forEach(r => { if (ofClient(r, client)) r.client = newName; });
      }
      Object.assign(client, {...f, name: newName});
      save();
      closeModal();
      App.clientDetail.open(newName);   // volta para a tela do cliente
    };
  }

  function clientDeleteConfirm(name) {
    openModal(`<h2>Excluir ${esc(name)}?</h2><p>O cadastro será apagado. Isso não afeta nenhuma venda (este cliente não tem nenhuma).</p><div class="actions"><button type="button" class="secondary" data-action="edit-client" data-client="${esc(name)}">Voltar</button><button type="button" class="danger" data-action="client-delete-confirm" data-client="${esc(name)}">Excluir cliente</button></div>`);
  }

  function clientDelete(name) {
    const client = data.clients.find(c => c.name === name);
    if (!client || hasMovement(client)) return;
    data.clients.splice(data.clients.indexOf(client), 1);
    for (let i = data.reminders.length - 1; i >= 0; i--) if (ofClient(data.reminders[i], client)) data.reminders.splice(i, 1);   // lembretes dele não ficam sobrando
    save();
    closeModal();
    go('clients');
  }

  // ---------- histórico ----------
  function history(name) {
    const client = data.clients.find(c => c.name === name) || {name};
    const allSales = data.sales.filter(s => s.client === name);
    const sales = activeSales().filter(s => s.client === name);
    // cada pagamento guarda a posição dentro da venda (é por ela que o "Editar" acha o pagamento certo)
    const payments = allSales.flatMap(sale => (sale.payments || []).map((payment, index) => ({payment, sale, index})));
    const valid = payments.filter(({payment, sale}) => !payment.voided && sale.status !== 'Cancelada');
    const pending = receivableItems().filter(i => i.sale.client === name);
    const overdue = sum(pending.filter(i => i.due < today()), i => i.balance);
    const next = pending.slice().sort((a, b) => a.due.localeCompare(b.due))[0];

    const salesRows = allSales.map(s => `<tr class="${s.status === 'Cancelada' ? 'voided' : ''}"><td>${dateLabel(s.date)}</td><td>${esc(s.product || 'Venda avulsa')}</td><td>${s.quantity || 1}</td><td>${money(s.unitPrice || s.total)}</td><td>${money(s.discount || 0)}</td><td>${money(s.total)}${s.status === 'Cancelada' ? ' (cancelada)' : ''}</td><td class="origin-cell">${s.status === 'Cancelada' ? '' : App.stock.originHtml(s, (s.items || []).length > 1)}</td></tr>`).join('');
    const payRows = payments.map(({payment, sale, index}) => {
      const state = sale.status === 'Cancelada' ? 'Venda cancelada' : payment.voided ? `Desfeito em ${dateLabel(payment.voidedAt)}` : 'Valendo';
      const canEdit = !payment.voided && sale.status !== 'Cancelada';
      const isEntry = payment.installment === 0 && sale.installments > 1;   // entrada do carnê: desfazer deixaria o valor fora das Contas a receber
      return `<tr class="${canEdit ? '' : 'voided'}"><td>${dateLabel(payment.date)}</td><td>${money(payment.amount)}</td><td>${esc(payment.method)}</td><td>${sale.id}${payment.installment ? ` / ${payment.installment}` : ''}</td><td>${esc(payment.note || '-')}</td><td>${state}</td><td>${payment.receipt ? `<button class="secondary" data-action="view-receipt" data-number="${payment.receipt}">Recibo ${App.receipts.pad(payment.receipt)}</button>` : ''}${canEdit ? ` <button class="secondary" data-action="edit-payment" data-sale="${sale.id}" data-payment="${index}">Editar</button> ${isEntry ? '<small class="muted">entrada: para mudar, edite a venda</small>' : `<button class="secondary" data-action="undo-payment" data-sale="${esc(sale.id)}" data-payment-index="${index}" data-installment="${esc(payment.installment)}">Desfazer</button>`}` : ''}</td></tr>`;
    }).join('');

    openModal(`<h2>Histórico · ${esc(client.name)}</h2><div class="cards"><div class="card"><span class="label">Total comprado</span><div class="metric">${money(sum(sales, s => s.total))}</div></div><div class="card"><span class="label">Total pago</span><div class="metric positive">${money(sum(valid, ({payment}) => Number(payment.amount)))}</div></div><div class="card"><span class="label">Total em aberto</span><div class="metric warning">${money(sum(sales, s => s.balance))}</div></div><div class="card"><span class="label">Total vencido</span><div class="metric negative">${money(overdue)}</div></div></div><p><b>Próximo vencimento:</b> ${next ? dateLabel(next.due) : 'Nenhum'}</p><h3>Compras</h3>${allSales.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Produto</th><th>Quantidade</th><th>Unitário</th><th>Desconto</th><th>Total</th><th>Origem do produto</th></tr></thead><tbody>${salesRows}</tbody></table></div>` : '<div class="empty">Nenhuma compra.</div>'}<h3>Pagamentos</h3>${payments.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Valor</th><th>Forma</th><th>Venda/parcela</th><th>Observação</th><th>Situação</th><th></th></tr></thead><tbody>${payRows}</tbody></table></div>` : '<div class="empty">Nenhum pagamento.</div>'}`);
  }

  // ---------- ligar uma venda antiga a uma compra (origem do produto) ----------
  function linkOrigin(saleId, name) {
    const sale = data.sales.find(s => s.id === saleId);
    const item = (sale.items || []).find(i => i.name === name), qty = (item && item.qty) || 1;
    // só compras feitas até o dia da venda e que ainda tenham peças livres (uma venda não pode vir de uma compra mais nova nem de um lote já esgotado)
    const free = p => p.items.filter(i => i.name === name).reduce((total, i) => total + i.qty, 0) - App.stock.usedQty(p.id, name);
    const options = data.purchases.filter(p => p.status !== 'Estornada' && p.date <= sale.date && free(p) >= qty).sort((a, b) => b.date.localeCompare(a.date));
    openModal(`<h2>Ligar a uma compra</h2><p>Venda <b>${sale.id}</b> · ${esc(name)} (${qty} un.) · ${esc(sale.client)}, ${dateLabel(sale.date)}.</p>${options.length ? `<form id="link-origin-form"><div class="field"><label>De qual compra veio este produto?</label><select name="purchase">${options.map(p => `<option value="${p.id}">${p.id} · ${esc(p.supplier || 'sem fornecedor')} · comprada em ${dateLabel(p.date)}</option>`).join('')}</select></div><p class="muted">Só para consulta: não muda estoque nem custo.</p><div class="actions"><button type="button" class="secondary" data-action="client-history" data-client="${esc(sale.client)}">Voltar</button><button class="primary">Salvar origem</button></div></form>` : `<div class="empty">Nenhuma compra disponível. Registre em Produtos > Compras.</div><div class="actions"><button type="button" class="secondary" data-action="client-history" data-client="${esc(sale.client)}">Voltar</button></div>`}`);
    const form = byId('link-origin-form');
    if (!form) return;
    form.onsubmit = event => {
      event.preventDefault();
      sale.originLinks = (sale.originLinks || []).filter(l => l.name !== name);
      sale.originLinks.push({name, lots: [{purchaseId: form.elements.purchase.value, qty}]});
      save();
      history(sale.client);
    };
  }

  // ---------- lembretes do cliente ----------
  // Um lembrete tem data e texto (ex.: "ligar para saber do notebook"). Quando a data chega, aparece nos avisos de hoje.
  function reminders(name) {
    const list = data.reminders.filter(r => r.client === name).sort((a, b) => a.date.localeCompare(b.date));
    const rows = list.map(r => `<tr class="${r.done ? 'voided' : ''}"><td>${dateLabel(r.date)}${!r.done && r.date < today() ? ' <span class="badge warn">atrasado</span>' : ''}</td><td>${esc(r.text)}</td><td>${r.done ? 'Feito' : `<button class="secondary" data-action="reminder-done" data-id="${r.id}">Marcar como feito</button>`} <button class="secondary" data-action="reminder-delete" data-id="${r.id}">Excluir</button></td></tr>`).join('');
    openModal(`<h2>Lembretes · ${esc(name)}</h2>${list.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Lembrete</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Nenhum lembrete.</div>'}<form id="reminder-form" class="form-grid"><div class="field"><label>Data *</label><input name="date" type="date" value="${today()}" required></div><div class="field full"><label>O que lembrar *</label><input name="text" required></div><div class="actions field full"><button type="button" class="secondary" data-action="close-modal">Fechar</button><button class="primary">Adicionar lembrete</button></div></form>`);
    byId('reminder-form').onsubmit = event => {
      event.preventDefault();
      const f = Object.fromEntries(new FormData(event.target));
      const id = App.store.nextCode('reminder');
      data.reminders.push({id, client: name, date: f.date, text: f.text.trim(), done: false});
      save();
      reminders(name);
    };
  }

  function changeReminder(id, change) {
    const reminder = data.reminders.find(r => r.id === id);
    if (!reminder) return;
    change(reminder);
    save();
    reminders(reminder.client);
  }

  // ---------- editar um pagamento ----------
  function editPayment(saleId, index) {
    const sale = data.sales.find(s => s.id === saleId);
    const payment = sale.payments[index];
    openModal(`<h2>Editar pagamento</h2><form id="edit-payment-form"><div class="field"><label>Valor (R$)</label><input name="amount" type="number" step="0.01" value="${payment.amount}" required></div><div class="field"><label>Data</label><input name="date" type="date" value="${payment.date}" required></div><div class="field"><label>Forma de pagamento</label><select name="method">${[...new Set([...App.finance.PAY_METHODS, payment.method])].map(m => `<option ${m === payment.method ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div><p class="negative" id="edit-payment-error" hidden></p><div class="actions"><button class="primary">Salvar alteração</button></div></form>`);
    byId('edit-payment-form').onsubmit = event => {
      event.preventDefault();
      const f = new FormData(event.target), amount = Number(f.get('amount')), date = f.get('date');
      const fail = message => { const box = byId('edit-payment-error'); box.textContent = message; box.hidden = false; };
      // Mesmas regras de receber: valor positivo, não passar do que a parcela deve, data entre a venda e hoje.
      const charges = Number(payment.charges || 0), n = payment.installment;
      const item = n ? App.finance.installmentsFor(sale).find(i => i.number === n) : null;
      const cap = n === 0 && sale.installments > 1 ? Number(sale.entry) || 0 : item ? item.value : sale.total;   // entrada do carnê, parcela, ou a venda inteira
      const others = App.finance.activePayments(sale).filter(p => p !== payment && p.installment === n).reduce((total, p) => total + App.finance.principalOf(p), 0);
      if (!(amount > 0)) return fail('Digite um valor maior que zero.');
      if (amount < charges - 0.004) return fail(`O valor não pode ser menor que a multa e os juros já cobrados neste pagamento (${money(charges)}).`);
      if (amount - charges > cap - others + 0.004) return fail(`O valor passa do que esta parcela deve (${money(Math.max(0, cap - others) + charges)}).`);
      if (date > today()) return fail('A data do pagamento não pode ser no futuro.');
      if (date < sale.date) return fail(`A data do pagamento não pode ser antes da venda (${dateLabel(sale.date)}).`);
      Object.assign(payment, {amount, date, method: f.get('method')});
      recalcSale(sale);
      App.receipts.sync(payment);   // o recibo acompanha
      save();
      closeModal();
      history(sale.client);
    };
  }

  // Nome de cliente digitado numa venda/orçamento: acha o cadastro sem diferenciar maiúsculas/acentos; se não existir, cadastra
  // o cliente na hora (só com o nome), igual ao botão "+ Adicionar novo cliente".
  function resolveClient(name) {
    const typed = String(name || '').trim();
    if (!typed) return null;
    const match = data.clients.find(c => normalize(c.name) === normalize(typed));
    if (match) return match.name;
    data.clients.push({name: typed, doc: '', phone: '', email: '', notes: '', createdAt: today()});
    return typed;
  }
  App.clientApi = {resolve: resolveClient};

  App.ui.registerScreen('clients', render);
  App.ui.registerAction('new-client', clientForm);
  App.ui.registerAction('edit-client', element => clientCard(element.dataset.client));
  App.ui.registerAction('client-delete', element => clientDeleteConfirm(element.dataset.client));
  App.ui.registerAction('client-delete-confirm', element => clientDelete(element.dataset.client));
  App.ui.registerAction('client-reminders', element => reminders(element.dataset.client));
  App.ui.registerAction('reminder-done', element => changeReminder(element.dataset.id, r => { r.done = true; }));
  App.ui.registerAction('reminder-delete', element => changeReminder(element.dataset.id, r => { data.reminders.splice(data.reminders.indexOf(r), 1); }));
  App.ui.registerAction('client-history', element => history(element.dataset.client));
  App.ui.registerAction('link-origin', element => linkOrigin(element.dataset.sale, element.dataset.name));
  App.ui.registerAction('edit-payment', element => editPayment(element.dataset.sale, Number(element.dataset.payment)));
})();
