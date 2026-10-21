// Estrutura da interface: janela (modal), troca de telas, menu e cliques.
// Analogia: é o "recepcionista": recebe cada clique e entrega para a tela ou ação certa.
(() => {
  const App = (window.App = window.App || {});

  const titles = {dashboard: 'Visão geral', finance: 'Financeiro', clients: 'Clientes', client: 'Cliente', products: 'Produtos', purchases: 'Compras', suppliers: 'Fornecedores', sales: 'Vendas', quotes: 'Orçamentos', receivables: 'Contas a receber', payables: 'Contas a pagar', fixed: 'Despesas fixas', collection: 'Regras de cobrança', reports: 'Relatórios', settings: 'Configurações'};
  const NAV_OF = {client: 'clients'};   // telas que não têm aba própria e acendem outra aba do menu
  const screens = {};   // nome da tela -> função que desenha a tela
  const showHooks = {}; // nome da tela -> funções extras que rodam depois de desenhar
  const actions = {};   // nome da ação (data-action="...") -> função que a executa
  const delegates = []; // [seletor, função] para cliques em botões que não usam data-action

  const byId = id => document.getElementById(id);

  const openModal = html => { byId('modal-content').innerHTML = html; document.querySelector('#modal .modal-card').classList.remove('wide'); byId('modal').classList.remove('hidden'); };
  const closeModal = () => byId('modal').classList.add('hidden');

  // Cada tela se registra com um nome e a função que a desenha.
  const registerScreen = (name, render) => { screens[name] = render; };
  const setTitle = (view, text) => { titles[view] = text; };   // muda o título de uma tela (ex.: "Orçamentos e OS")
  // Registra algo extra para rodar depois que uma tela for desenhada (ex.: avisos de backup).
  const onShow = (name, fn) => { (showHooks[name] ||= []).push(fn); };
  // Registra o que fazer quando alguém clica num elemento com data-action="nome".
  const registerAction = (name, fn) => { actions[name] = fn; };
  // Registra o que fazer quando alguém clica em algo que combina com um seletor (ex.: '[data-pay]').
  const onClick = (selector, fn) => { delegates.push([selector, fn]); };

  // Grupos de telas que ficam sob uma única aba do menu, com sub-abas logo abaixo do título.
  // Ex.: a aba "Financeiro" reúne "Contas a receber" e "Relatórios". A primeira da lista abre por padrão.
  const groups = {
    products: {
      views: ['products', 'purchases', 'suppliers'],
      labels: {products: 'Produtos e serviços', purchases: 'Compras', suppliers: 'Fornecedores'}
    },
    financial: {
      views: ['finance', 'receivables', 'payables', 'fixed', 'collection', 'reports'],
      labels: {finance: 'Resumo', receivables: 'Contas a receber', payables: 'Contas a pagar', fixed: 'Despesas fixas', collection: 'Regras de cobrança', reports: 'Relatórios'}
    }
  };
  const groupOf = view => Object.keys(groups).find(key => groups[key].views.includes(view));

  function renderSubtabs(group, view) {
    const bar = byId('subtabs');
    if (!group) { bar.hidden = true; bar.innerHTML = ''; return; }
    const {views, labels} = groups[group];
    bar.innerHTML = views.map(v => `<button type="button" data-subview="${v}" class="${v === view ? 'active' : ''}">${labels[v]}</button>`).join('');
    bar.hidden = false;
  }

  let current = '';   // nome da tela que está aberta
  // Volta para a tela de onde a ação partiu: se foi do Resumo do Financeiro, volta para ele; senão, para a tela indicada.
  const back = fallback => go(current === 'finance' ? 'finance' : fallback);

  // Mostra uma tela: marca a aba do menu, troca o título, mostra as sub-abas (se houver) e desenha.
  function go(name) {
    const view = groups[name] ? groups[name].views[0] : name; // abrir um grupo = abrir a primeira sub-aba
    const group = groupOf(view);
    document.querySelectorAll('#nav button').forEach(button => button.classList.toggle('active', button.dataset.view === (group || NAV_OF[view] || view)));
    current = view;
    const icon = App.icons ? App.icons.svg(App.icons.forView(view), 28) : '';   // o desenho não tem texto: o texto do título continua o mesmo
    byId('page-title').innerHTML = `${icon ? `<span class="title-icon">${icon}</span>` : ''}<span class="title-text">${String(titles[view]).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`;
    const sub = byId('page-sub');   // linha de apoio embaixo do título: a data de hoje (ex.: "quinta-feira, 15 de outubro de 2026")
    if (sub) sub.textContent = new Intl.DateTimeFormat('pt-BR', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(`${App.format.today()}T12:00:00`));
    renderSubtabs(group, view);
    screens[view]();
    (showHooks[view] || []).forEach(fn => fn());
    const appEl = byId('app');   // reinicia a animação de entrada da tela (css/motion.css)
    appEl.classList.remove('screen-enter'); void appEl.offsetWidth; appEl.classList.add('screen-enter');
    document.dispatchEvent(new CustomEvent('screenchange', {detail: {view}}));   // a barra de baixo do celular marca o item ativo
  }

  // Liga os cliques do menu e de todos os botões da página (um "ouvido" só, para tudo).
  function start() {
    byId('nav').addEventListener('click', event => {
      const button = event.target.closest('[data-view]');
      if (button) go(button.dataset.view);
    });
    document.body.addEventListener('click', event => {
      const actionElement = event.target.closest('[data-action]');
      if (actionElement) { (actions[actionElement.dataset.action] || (() => {}))(actionElement, event); return; }
      for (const [selector, fn] of delegates) {
        const element = event.target.closest(selector);
        if (element) { fn(element, event); return; }
      }
    });
  }

  // Agrupa os campos de um formulário por assunto, cada grupo com uma linha colorida na lateral e um título.
  // kind: 'client' (lilás) | 'product' (azul) | 'pay' (verde) | 'other' (cinza).
  // items: nomes de campos ("client") ou seletores (".item-block", "#pay-compare"). A ordem da lista é a ordem no grupo.
  function groupFields(root, specs) {
    for (const {kind, title, items} of specs) {
      const found = [];
      for (const item of items) {
        const list = /^\w+$/.test(item) ? [root.elements && root.elements[item]].filter(Boolean) : [...root.querySelectorAll(item)];
        for (const element of list) { const unit = element.closest('.field, .item-block') || element; if (!found.includes(unit)) found.push(unit); }
      }
      if (!found.length) continue;
      const box = document.createElement('div');
      box.className = `fgroup g-${kind}`;
      box.innerHTML = `<h3 class="fgroup-title">${title}</h3>`;
      found[0].before(box);
      found.forEach(element => box.appendChild(element));
    }
  }

  // Guarda e devolve o que foi digitado num formulário (para o cadastro rápido de cliente/produto não perder o que já estava preenchido).
  function snapshotForm(form) {
    const state = {};
    for (const element of form.elements) if (element.name && !['file', 'checkbox', 'radio', 'button', 'submit'].includes(element.type)) state[element.name] = element.value;
    return state;
  }
  function applyForm(form, state) {
    for (const [name, value] of Object.entries(state || {})) { const element = form.elements[name]; if (element && element.type !== 'file') element.value = value; }
  }

  registerAction('close-modal', closeModal);
  onClick('[data-subview]', element => go(element.dataset.subview)); // sub-abas

  App.ui = {back, setTitle, get current() { return current; }, byId, openModal, closeModal, registerScreen, registerAction, onShow, onClick, go, start, groupFields, snapshotForm, applyForm};
})();
