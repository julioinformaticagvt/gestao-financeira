// Tela "Contas a pagar" (Financeiro): contas do mês, vencimentos e pagamentos. Contas pagas viram "saídas" nos números.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today, sum} = App.format;
  const {data, save} = App.store;
  const {openModal, closeModal, byId, go} = App.ui;

  const METHODS = App.finance.PAY_METHODS;
  const CATEGORIES = ['Aluguel', 'Internet', 'Energia', 'Impostos', 'Fornecedor', 'Operacional', 'Outros'];
  const find = id => data.payables.find(p => p.id === id);
  const filters = {status: 'all', month: ''};

  function statusBadge(bill) {
    if (bill.status === 'paga') return '<span class="badge">Paga</span>';
    return bill.dueDate < today() ? '<span class="badge warn">Vencida</span>' : '<span class="badge neutral">Pendente</span>';
  }

  // ---------- lista ----------
  function render() {
    App.bills.generate();
    const bills = data.payables
      .filter(b => filters.status === 'all' || (filters.status === 'pending' ? b.status !== 'paga' : b.status === 'paga'))
      .filter(b => !filters.month || b.dueDate.slice(0, 7) === filters.month)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const pending = bills.filter(b => b.status !== 'paga');
    const rowOf = b => `<tr><td>${dateLabel(b.dueDate)}</td><td>${esc(b.description)}${b.origin === 'fixa' ? ' <small class="muted">(fixa)</small>' : ''}</td><td>${esc(b.category || '-')}</td><td>${money(b.amount)}</td><td>${statusBadge(b)}${b.status === 'paga' ? ` <small class="muted">${dateLabel(b.paidAt)} · ${esc(b.method)}</small>` : ''}</td><td>${b.status === 'paga' ? `<button class="secondary" data-action="bill-unpay" data-id="${esc(b.id)}">Desfazer pagamento</button>` : `<button class="secondary" data-action="bill-pay" data-id="${esc(b.id)}">Pagar</button> <button class="secondary" data-action="bill-edit" data-id="${esc(b.id)}">Editar</button>${b.origin === 'fixa' ? '' : ` <button class="secondary" data-action="bill-delete" data-id="${esc(b.id)}">Excluir</button>`}`}</td></tr>`;

    // uma bandejinha por mês de vencimento; o mês atual fica sempre aberto
    const now = today().slice(0, 7), byMonth = bills.reduce((all, b) => { (all[b.dueDate.slice(0, 7)] ??= []).push(b); return all; }, {});
    if (!filters.month) byMonth[now] = byMonth[now] || [];
    const trays = Object.keys(byMonth).sort().map(month => {
      const list = byMonth[month], open = list.filter(b => b.status !== 'paga'), isNow = month === now, late = month < now && open.length > 0;
      const body = list.length
        ? `<div class="table-wrap"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>${list.map(rowOf).join('')}</tbody></table></div>`
        : '<p class="muted">Nenhuma conta neste mês.</p>';
      return App.components.monthTray({
        screen: 'payables', month, always: isNow || !!filters.month, tag: isNow ? 'Mês atual' : late ? 'Tem vencidas' : '', tone: isNow ? 'now' : 'warn',
        stats: [{label: 'A pagar', value: sum(open, b => Number(b.amount)), kind: late ? 'negative' : ''}, {label: 'Pagas', value: sum(list.filter(b => b.status === 'paga'), b => Number(b.amount)), kind: 'ok'}], body
      });
    }).join('') || App.firstRun.emptyState({title: 'Você ainda não tem contas a pagar.', hint: 'Cadastre contas e despesas fixas.', action: 'bill-new', label: '+ Nova conta'});

    byId('app').innerHTML = `<section class="panel"><div class="panel-head"><h2>Contas a pagar</h2><button class="primary" data-action="bill-new">+ Nova conta</button></div><div class="toolbar"><select id="bill-status"><option value="all">Todas</option><option value="pending">Pendentes</option><option value="paid">Pagas</option></select><input id="bill-month" type="month" title="Mês de vencimento"></div><p class="muted">${bills.length} conta${bills.length === 1 ? '' : 's'} · pendentes: <b>${money(sum(pending, b => Number(b.amount)))}</b> · pagas: <b>${money(sum(bills.filter(b => b.status === 'paga'), b => Number(b.amount)))}</b></p>${data.payables.length ? trays : App.firstRun.emptyState({title: 'Você ainda não tem contas a pagar.', hint: 'Cadastre contas e despesas fixas.', action: 'bill-new', label: '+ Nova conta'})}</section>`;
    byId('bill-status').value = filters.status;
    byId('bill-month').value = filters.month;
    byId('bill-status').onchange = event => { filters.status = event.target.value; render(); };
    byId('bill-month').onchange = event => { filters.month = event.target.value; render(); };
  }

  // ---------- nova / editar ----------
  function form(bill) {
    const editing = !!bill;
    openModal(`<h2>${editing ? 'Editar conta a pagar' : 'Nova conta a pagar'}</h2><form id="bill-form" class="form-grid"><div class="field full"><label>Descrição *</label><input name="description" value="${esc(bill ? bill.description : '')}" required></div><div class="field"><label>Categoria</label><input name="category" list="bill-categories" value="${esc(bill ? bill.category : 'Operacional')}"><datalist id="bill-categories">${CATEGORIES.map(c => `<option value="${c}">`).join('')}</datalist></div><div class="field"><label>Valor (R$) *</label><input name="amount" type="number" min="0" step="0.01" value="${bill ? bill.amount : ''}" required></div><div class="field"><label>Vencimento *</label><input name="dueDate" type="date" value="${bill ? bill.dueDate : today()}" required></div>${bill && bill.origin === 'fixa' ? '<p class="muted field full">Veio de uma despesa fixa: muda só este mês.</p>' : ''}<div class="actions field full"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary">Salvar</button></div></form>`);
    App.ui.groupFields(byId('bill-form'), [{kind: 'other', title: 'A conta', items: ['description', 'category']}, {kind: 'pay', title: 'Valor e vencimento', items: ['amount', 'dueDate']}]);
    byId('bill-form').onsubmit = event => {
      event.preventDefault();
      const f = Object.fromEntries(new FormData(event.target)), values = {description: f.description.trim(), category: f.category.trim(), amount: Number(f.amount), dueDate: f.dueDate};
      if (editing) Object.assign(bill, values);
      else data.payables.push({id: App.bills.nextId(), ...values, status: 'pendente', origin: 'avulsa'});
      save();
      closeModal();
      App.ui.back('payables');
    };
  }

  // ---------- pagar / desfazer ----------
  function payForm(bill) {
    openModal(`<h2>Pagar conta</h2><p>${esc(bill.description)} · vencimento ${dateLabel(bill.dueDate)} · <b>${money(bill.amount)}</b></p><form id="bill-pay-form" class="form-grid"><div class="field"><label>Data do pagamento *</label><input name="paidAt" type="date" value="${today()}" required></div><div class="field"><label>Forma de pagamento</label><select name="method">${METHODS.map(m => `<option>${m}</option>`).join('')}</select></div><div class="actions field full"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary">Confirmar pagamento</button></div></form>`);
    App.ui.groupFields(byId('bill-pay-form'), [{kind: 'pay', title: 'Pagamento', items: ['paidAt', 'method']}]);
    byId('bill-pay-form').onsubmit = event => {
      event.preventDefault();
      const f = new FormData(event.target);
      Object.assign(bill, {status: 'paga', paidAt: f.get('paidAt'), method: f.get('method')});
      save();
      closeModal();
      App.ui.back('payables');
    };
  }

  function unpay(bill) {
    openModal(`<h2>Desfazer pagamento?</h2><p>A conta <b>${esc(bill.description)}</b> (${money(bill.amount)}) volta a ficar pendente e deixa de contar como saída.</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Voltar</button><button type="button" class="danger" id="bill-unpay-ok">Desfazer pagamento</button></div>`);
    byId('bill-unpay-ok').onclick = () => { bill.status = 'pendente'; delete bill.paidAt; delete bill.method; save(); closeModal(); App.ui.back('payables'); };
  }

  function remove(bill) {
    openModal(`<h2>Excluir conta?</h2><p>Excluir <b>${esc(bill.description)}</b> (${money(bill.amount)}, vencimento ${dateLabel(bill.dueDate)})?</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Voltar</button><button type="button" class="danger" id="bill-delete-ok">Excluir</button></div>`);
    byId('bill-delete-ok').onclick = () => { data.payables.splice(data.payables.indexOf(bill), 1); save(); closeModal(); App.ui.back('payables'); };
  }

  App.ui.registerScreen('payables', render);
  App.ui.registerAction('bill-new', () => form(null));
  App.ui.registerAction('bill-edit', element => form(find(element.dataset.id)));
  App.ui.registerAction('bill-pay', element => payForm(find(element.dataset.id)));
  App.ui.registerAction('bill-unpay', element => unpay(find(element.dataset.id)));
  App.ui.registerAction('bill-delete', element => remove(find(element.dataset.id)));
})();
