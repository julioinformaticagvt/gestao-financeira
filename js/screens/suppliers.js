// Tela "Fornecedores": cadastro simples de quem vende as peças, com o total comprado por mês.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, normalize, today, shiftMonth, monthLabel, sum} = App.format;
  const {data, save} = App.store;
  const {openModal, closeModal, byId, go} = App.ui;

  let month = today().slice(0, 7);   // mês mostrado ('todos' = só o total geral)

  const valid = name => data.purchases.filter(p => p.supplier === name && p.status !== 'Estornada');
  const totalOf = (name, only) => sum(valid(name).filter(p => !only || p.date.slice(0, 7) === only), p => p.total);

  function render() {
    const months = [...new Set([today().slice(0, 7), month, ...data.purchases.map(p => p.date.slice(0, 7))].filter(m => m && m !== 'todos'))].sort().reverse();
    const rows = data.suppliers.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.phone || '-')}</td><td>${esc(s.notes || '')}</td><td>${month === 'todos' ? '-' : money(totalOf(s.name, month))}</td><td>${money(totalOf(s.name))}</td><td><button class="secondary" data-action="supplier-months" data-name="${esc(s.name)}">Mês a mês</button> <button class="secondary" data-action="edit-supplier" data-name="${esc(s.name)}">Editar</button></td></tr>`).join('');
    const monthTotal = month === 'todos' ? null : sum(data.suppliers, s => totalOf(s.name, month));
    const nav = `<div class="month-nav"><button class="secondary" data-action="supplier-month-step" data-step="-1" ${month === 'todos' ? 'disabled' : ''} title="Mês anterior">‹</button><select id="supplier-month"><option value="todos" ${month === 'todos' ? 'selected' : ''}>Só o total geral</option>${months.map(m => `<option value="${m}" ${m === month ? 'selected' : ''}>${esc(monthLabel(m))}</option>`).join('')}</select><button class="secondary" data-action="supplier-month-step" data-step="1" ${month === 'todos' ? 'disabled' : ''} title="Próximo mês">›</button>${monthTotal === null ? '' : `<span class="muted">Comprado no mês: <b>${money(monthTotal)}</b></span>`}</div>`;
    byId('app').innerHTML = `<section class="panel"><div class="panel-head"><h2>Fornecedores</h2><button class="primary" data-action="new-supplier">+ Novo fornecedor</button></div>${data.suppliers.length ? `${nav}<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Observações</th><th>${month === 'todos' ? 'No mês' : esc(monthLabel(month))}</th><th>Total geral</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : App.firstRun.emptyState({title: 'Você ainda não tem fornecedores.', hint: 'Cadastre de quem você compra peças para acompanhar o que comprou.', action: 'new-supplier', label: '+ Novo fornecedor'})}</section>`;
    const select = byId('supplier-month');
    if (select) select.onchange = event => { month = event.target.value; render(); };
  }

  // Total comprado de um fornecedor em cada mês.
  function months(name) {
    const byMonth = {};
    valid(name).forEach(p => { const m = p.date.slice(0, 7); byMonth[m] = byMonth[m] || {count: 0, total: 0}; byMonth[m].count++; byMonth[m].total += p.total; });
    const rows = Object.keys(byMonth).sort().reverse().map(m => `<tr><td>${esc(monthLabel(m))}</td><td>${byMonth[m].count}</td><td>${money(byMonth[m].total)}</td></tr>`).join('');
    openModal(`<h2>${esc(name)} · mês a mês</h2>${rows ? `<div class="table-wrap"><table><thead><tr><th>Mês</th><th>Compras</th><th>Total comprado</th></tr></thead><tbody>${rows}<tr class="doc-total"><td><b>Total geral</b></td><td></td><td><b>${money(totalOf(name))}</b></td></tr></tbody></table></div>` : '<div class="empty">Nenhuma compra deste fornecedor.</div>'}<div class="actions"><button type="button" class="secondary" data-action="close-modal">Fechar</button></div>`);
  }

  function form(name) {
    const old = data.suppliers.find(s => s.name === name), v = old || {};
    const inUse = old && data.purchases.some(p => p.supplier === name);
    openModal(`<h2>${old ? 'Editar' : 'Novo'} fornecedor</h2><form id="supplier-form" class="form-grid"><div class="field full"><label>Nome *</label><input name="name" value="${esc(v.name || '')}" required></div><div class="field"><label>Telefone</label><input name="phone" value="${esc(v.phone || '')}"></div><div class="field"><label>Observações</label><input name="notes" value="${esc(v.notes || '')}"></div><p class="negative field full" id="supplier-error" hidden></p><div class="actions field full">${old && !inUse ? `<button type="button" class="danger" data-action="supplier-delete" data-name="${esc(name)}">Excluir</button>` : ''}<button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary">Salvar</button></div></form>`);
    App.ui.groupFields(byId('supplier-form'), [{kind: 'client', title: 'Fornecedor', items: ['name', 'phone']}, {kind: 'other', title: 'Observações', items: ['notes']}]);
    byId('supplier-form').onsubmit = event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      values.name = values.name.trim();
      if (data.suppliers.some(s => s !== old && normalize(s.name) === normalize(values.name))) { const box = byId('supplier-error'); box.textContent = 'Já existe um fornecedor com esse nome.'; box.hidden = false; return; }
      if (old) {
        if (values.name !== old.name) data.purchases.forEach(p => { if (p.supplierId ? p.supplierId === old.uid : p.supplier === old.name) p.supplier = values.name; });
        Object.assign(old, values);
      } else data.suppliers.push(values);
      save();
      closeModal();
      go('suppliers');
    };
  }

  App.ui.registerScreen('suppliers', render);
  App.ui.registerAction('new-supplier', () => form());
  App.ui.registerAction('edit-supplier', element => form(element.dataset.name));
  App.ui.registerAction('supplier-months', element => months(element.dataset.name));
  App.ui.registerAction('supplier-month-step', element => { if (month !== 'todos') { month = shiftMonth(month, Number(element.dataset.step)); render(); } });
  App.ui.registerAction('supplier-delete', element => {
    const index = data.suppliers.findIndex(s => s.name === element.dataset.name);
    if (index >= 0) data.suppliers.splice(index, 1);
    save(); closeModal(); go('suppliers');
  });
})();
