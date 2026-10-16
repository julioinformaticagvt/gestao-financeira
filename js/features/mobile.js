// Sistema no celular (SPECS, seção 25): barra de baixo com 5 itens, botão "+" no topo, rótulos nas tabelas (que viram cartões no
// celular, só pelo CSS) e atributos de teclado nos campos. No computador (largura maior que 900 px) nada disso aparece nem muda.
// O menu é montado a partir do MESMO menu do computador (#nav e data-view): a lista de telas não é duplicada.
(() => {
  const App = (window.App = window.App || {});
  const {esc} = App.format;
  const {openModal, closeModal, registerAction, go, byId} = App.ui;

  // ---------- rótulos das tabelas ----------
  // Cada <td> recebe data-label="Nome da coluna" (lido do cabeçalho). Em ≤ 620 px o CSS mostra a linha como um cartão.
  // Tabelas de documentos (PDF) e de relatórios não viram cartões: continuam tabela (com rolagem na própria caixa).
  function labelTables(root) {
    root.querySelectorAll('table').forEach(table => {
      if (table.closest('.doc, .report-table, .pay-compare, .sync-compare') || table.classList.contains('report-table')) return;
      const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
      if (!heads.length) return;
      table.classList.add('cards-table');
      table.querySelectorAll('tbody tr').forEach(row => {
        let col = 0;
        [...row.children].forEach(cell => {
          if (cell.tagName !== 'TD') return;
          if (!cell.hasAttribute('data-label')) cell.setAttribute('data-label', heads[col] || '');
          col += cell.colSpan || 1;
        });
      });
    });
  }

  // ---------- campos: teclado certo no celular ----------
  function enhanceFields(root) {
    root.querySelectorAll('input[type="number"]').forEach(input => {
      if (input.hasAttribute('inputmode')) return;
      const step = input.getAttribute('step');
      input.setAttribute('inputmode', step && /[.,]/.test(step) ? 'decimal' : (step === 'any' ? 'decimal' : 'numeric'));
    });
    root.querySelectorAll('input[name="phone"], input[name*="telefone"]').forEach(input => {
      if (!input.hasAttribute('inputmode')) input.setAttribute('inputmode', 'tel');
      if (!input.hasAttribute('autocomplete')) input.setAttribute('autocomplete', 'tel');
    });
    root.querySelectorAll('input[name="email"]').forEach(input => { if (!input.hasAttribute('autocomplete')) input.setAttribute('autocomplete', 'email'); });
    root.querySelectorAll('input[name="name"]').forEach(input => { if (!input.hasAttribute('autocomplete')) input.setAttribute('autocomplete', 'off'); });
  }

  // Aplica nas áreas que mudam (tela e janela). Agrupa várias mudanças seguidas numa só passada.
  let queued = false;
  function apply() {
    queued = false;
    ['app', 'modal-content', 'subtabs'].forEach(id => { const el = byId(id); if (el) { labelTables(el); enhanceFields(el); } });
  }
  function schedule() { if (!queued) { queued = true; Promise.resolve().then(apply); } }
  ['app', 'modal-content'].forEach(id => { const el = byId(id); if (el) new MutationObserver(schedule).observe(el, {childList: true, subtree: true}); });

  // ---------- barra de baixo e botão "+" ----------
  const ICONS = {
    dashboard: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    sales: '<path d="M4 5h2l2 10h10l2-7H8"/><circle cx="10" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
    clients: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    financial: '<path d="M4 19V9M10 19V5M16 19v-7M21 19H3"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'
  };
  const svg = key => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key]}</svg>`;
  // O texto vem do menu do computador (ex.: "Orçamentos e OS" quando a ordem de serviço está ligada).
  const navLabel = (view, fallback) => { const b = document.querySelector(`#nav [data-view="${view}"]`); return b ? b.textContent.trim() : fallback; };
  const MORE_VIEWS = ['quotes', 'products', 'settings'];

  function build() {
    if (byId('bottom-nav')) return;
    const bar = document.createElement('nav');
    bar.id = 'bottom-nav';
    bar.className = 'bottom-nav';
    bar.setAttribute('aria-label', 'Menu do celular');
    const items = [['dashboard', 'Início'], ['sales', 'Vendas'], ['clients', 'Clientes'], ['financial', 'Financeiro']];
    bar.innerHTML = items.map(([view, label]) => `<button type="button" data-action="m-go" data-view="${view}" data-bottom="${view}">${svg(view)}<span>${esc(label)}</span></button>`).join('')
      + `<button type="button" data-action="m-more" data-bottom="more">${svg('more')}<span>Mais</span></button>`;
    document.body.appendChild(bar);
    const top = document.querySelector('.topbar');
    if (top && !top.querySelector('.plus-btn')) {
      const plus = document.createElement('button');
      plus.type = 'button'; plus.className = 'plus-btn'; plus.dataset.action = 'm-plus'; plus.title = 'Novo'; plus.setAttribute('aria-label', 'Novo');
      plus.textContent = '+';
      top.appendChild(plus);
    }
  }

  function markActive() {
    const nav = document.querySelector('#nav button.active'), view = nav ? nav.dataset.view : '';
    const bottom = MORE_VIEWS.includes(view) ? 'more' : view;
    document.querySelectorAll('#bottom-nav [data-bottom]').forEach(b => b.classList.toggle('active', b.dataset.bottom === bottom));
  }
  document.addEventListener('screenchange', markActive);

  // Folha "Mais": Orçamentos (e OS), Produtos, Configurações e Ajuda.
  function more() {
    const rows = [['quotes', navLabel('quotes', 'Orçamentos')], ['products', navLabel('products', 'Produtos')], ['settings', navLabel('settings', 'Configurações')]]
      .map(([view, label]) => `<button type="button" class="secondary sheet-item" data-action="m-go" data-view="${view}">${esc(label)}</button>`).join('');
    openModal(`<h2>Mais</h2><div class="sheet-list">${rows}<button type="button" class="secondary sheet-item" data-action="m-help">Ajuda (Como usar)</button></div>`);
  }

  // Menu "+": Nova venda, Registrar pagamento e Nova OS / Orçamento (os botões grandes do topo saem do celular).
  function plus() {
    const os = App.serviceOrders && App.serviceOrders.enabled();
    openModal(`<h2>Novo</h2><div class="sheet-list"><button type="button" class="primary sheet-item" data-action="m-new" data-target="sale">Nova venda</button><button type="button" class="receive sheet-item" data-action="m-new" data-target="payment">Registrar pagamento</button>${os ? '<button type="button" class="secondary sheet-item" data-action="m-new" data-target="os">Nova ordem de serviço</button>' : ''}<button type="button" class="secondary sheet-item" data-action="m-new" data-target="quote">${os ? 'Novo orçamento' : 'Simular venda'}</button></div>`);
  }
  const TARGETS = {sale: 'new-sale', payment: 'new-payment', os: 'new-os', quote: 'new-quote'};

  registerAction('m-go', element => { closeModal(); go(element.dataset.view); });
  registerAction('m-more', more);
  registerAction('m-plus', plus);
  registerAction('m-help', () => { closeModal(); App.help.open(); });
  registerAction('m-new', element => {
    closeModal();
    // dispara a mesma ação do botão do computador (nada é duplicado)
    const name = TARGETS[element.dataset.target];
    const button = document.querySelector(`[data-action="${name}"]`);
    if (button) button.click();
    else if (name === 'new-os' || name === 'new-quote') { go('quotes'); const b = document.querySelector(`[data-action="${name}"]`); if (b) b.click(); }
  });

  build();
  apply();
  markActive();

  App.mobile = {labelTables, enhanceFields, apply, build, markActive};
})();
