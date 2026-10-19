// Tela "Despesas fixas" (Financeiro): modelos de despesas que se repetem todo mês (aluguel, internet, DAS...).
// A cada mês o sistema cria sozinho a conta a pagar de cada despesa fixa ativa.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, today, normalize} = App.format;
  const {data, save} = App.store;
  const {openModal, closeModal, byId, go} = App.ui;

  const CATEGORIES = ['Aluguel', 'Internet', 'Energia', 'Impostos', 'Fornecedor', 'Operacional', 'Outros'];
  const find = id => data.fixedExpenses.find(f => f.id === id);
  const hasDas = () => data.fixedExpenses.some(f => /\bdas\b/.test(normalize(f.description)));

  // ---------- lista ----------
  function render() {
    App.bills.generate();
    const rows = data.fixedExpenses.map(f => `<tr class="${f.active ? '' : 'voided'}"><td>${esc(f.description)}</td><td>${esc(f.category || '-')}</td><td>${money(f.amount)}</td><td>dia ${f.dueDay}</td><td>${f.startMonth.split('-').reverse().join('/')}</td><td>${f.active ? '<span class="badge">Ativa</span>' : '<span class="badge neutral">Desativada</span>'}</td><td><button class="secondary" data-action="fixed-edit" data-id="${f.id}">Editar</button> <button class="secondary" data-action="fixed-toggle" data-id="${f.id}">${f.active ? 'Desativar' : 'Ativar'}</button></td></tr>`).join('');
    byId('app').innerHTML = `${hasDas() || !data.settings.isMei ? '' : '<section class="panel"><div class="panel-head"><div><h2>Cadastrar o DAS do MEI?</h2><p class="muted" style="margin:0">O DAS vence todo dia 20. Você informa o valor; o sistema cria a conta de cada mês. Confira com o seu contador a regra de vencimento em dia sem expediente.</p></div><button class="primary" data-action="fixed-das">Cadastrar o DAS</button></div></section>'}<section class="panel"><div class="panel-head"><h2>Despesas fixas</h2><button class="primary" data-action="fixed-new">+ Nova despesa fixa</button></div><p class="muted">Todo mês o sistema cria a conta a pagar de cada despesa ativa, do mês de início até o mês atual, sem duplicar. Para mudar o valor de um mês só, edite a conta em Contas a pagar.</p>${data.fixedExpenses.length ? `<div class="table-wrap"><table><thead><tr><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Começa em</th><th>Situação</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Nenhuma despesa fixa cadastrada.</div>'}</section>`;
  }

  // ---------- nova / editar ----------
  function form(fixed, preset = {}) {
    const editing = !!fixed, v = fixed || preset;
    openModal(`<h2>${editing ? 'Editar despesa fixa' : 'Nova despesa fixa'}</h2><form id="fixed-form" class="form-grid"><div class="field full"><label>Descrição *</label><input name="description" value="${esc(v.description || '')}" required></div><div class="field"><label>Valor (R$) *</label><input name="amount" type="number" min="0" step="0.01" value="${v.amount ?? ''}" required></div><div class="field"><label>Dia do vencimento *</label><input name="dueDay" type="number" min="1" max="31" value="${v.dueDay || ''}" required></div><div class="field"><label>Categoria</label><input name="category" list="fixed-categories" value="${esc(v.category || 'Operacional')}"><datalist id="fixed-categories">${CATEGORIES.map(c => `<option value="${c}">`).join('')}</datalist></div><div class="field"><label>Começa em (mês) *</label><input name="startMonth" type="month" value="${v.startMonth || today().slice(0, 7)}" required></div><p class="muted field full">${editing ? 'Mudar o valor ou o dia vale para os meses que ainda não foram criados.' : 'As contas são criadas do mês de início até o mês atual.'}</p><div class="actions field full"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary">Salvar</button></div></form>`);
    App.ui.groupFields(byId('fixed-form'), [{kind: 'other', title: 'A despesa', items: ['description', 'category']}, {kind: 'pay', title: 'Valor e datas', items: ['amount', 'dueDay', 'startMonth']}]);
    byId('fixed-form').onsubmit = event => {
      event.preventDefault();
      const f = Object.fromEntries(new FormData(event.target));
      const values = {description: f.description.trim(), amount: Number(f.amount), dueDay: Number(f.dueDay), category: f.category.trim(), startMonth: f.startMonth};
      if (editing) Object.assign(fixed, values);
      else data.fixedExpenses.push({id: App.bills.nextFixedId(), ...values, active: true});
      save();
      closeModal();
      go('fixed');
    };
  }

  // Ao reativar, as contas recomeçam no mês atual (não cria contas atrasadas dos meses em que ficou desligada).
  const toggle = fixed => { fixed.active = !fixed.active; if (fixed.active) fixed.resumeMonth = today().slice(0, 7); save(); go('fixed'); };

  App.ui.registerScreen('fixed', render);
  App.ui.registerAction('fixed-new', () => form(null));
  App.ui.registerAction('fixed-das', () => form(null, {description: 'DAS do MEI', dueDay: 20, category: 'Impostos'}));
  App.ui.registerAction('fixed-edit', element => form(find(element.dataset.id)));
  App.ui.registerAction('fixed-toggle', element => toggle(find(element.dataset.id)));
})();
