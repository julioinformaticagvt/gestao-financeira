// Ícones do sistema (traço fino e redondo), usados na barra de baixo do celular e nos títulos das telas.
// Cada ícone é só o "miolo" de um desenho 24x24; App.icons.svg(chave, tamanho) monta o <svg> pronto.
// Analogia: é um carimbo por tela; o mesmo carimbo vale no celular e no computador.
(() => {
  const App = (window.App = window.App || {});

  const ICONS = {
    dashboard: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',                                              // casa
    sales: '<path d="M4 5h2l2 10h10l2-7H8"/><circle cx="10" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',                     // carrinho
    clients: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',                                                     // pessoa
    financial: '<path d="M4 19V9M10 19V5M16 19v-7M21 19H3"/>',                                                                       // barras
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',                      // três pontos
    quotes: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',                                                    // documento
    products: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',                                             // caixa
    settings: '<path d="M10.3 4.3c.4-1.8 2.9-1.8 3.4 0a1.7 1.7 0 0 0 2.5 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.5c1.8.4 1.8 2.9 0 3.4a1.7 1.7 0 0 0-1 2.5c.9 1.5-.8 3.3-2.4 2.4a1.7 1.7 0 0 0-2.5 1c-.4 1.8-2.9 1.8-3.4 0a1.7 1.7 0 0 0-2.5-1c-1.5.9-3.3-.8-2.4-2.4a1.7 1.7 0 0 0-1-2.5c-1.8-.4-1.8-2.9 0-3.4a1.7 1.7 0 0 0 1-2.5c-.9-1.5.8-3.3 2.4-2.4 1 .6 2.3.1 2.5-1.1z"/><circle cx="12" cy="12" r="3"/>',   // engrenagem
    receivables: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.6C9.5 8.5 10.6 8 12 8s2.5.6 2.5 1.7c0 2.4-5 1.4-5 3.9 0 1.1 1.1 1.7 2.5 1.7s2.5-.5 2.5-1.5"/>',  // moeda
    payables: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4z"/><path d="M4 7V6a2 2 0 0 1 2-2h10"/><circle cx="16" cy="13.5" r="1.2"/>',  // carteira
    fixed: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',                                    // calendário
    collection: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',                                             // sino
    reports: '<path d="M5 20V4h10l4 4v12z"/><path d="M9 16v-3M12 16v-6M15 16v-4"/>',                                               // relatório
    purchases: '<path d="M6 3h12l2 5H4z"/><path d="M5 8v12h14V8M10 12h4"/>',                                                         // loja
    suppliers: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>'         // caminhão
  };

  // Qual ícone vai em cada tela (nome da tela -> chave do ícone).
  const OF_VIEW = {dashboard: 'dashboard', sales: 'sales', quotes: 'quotes', clients: 'clients', client: 'clients', products: 'products', purchases: 'purchases', suppliers: 'suppliers',
    finance: 'financial', receivables: 'receivables', payables: 'payables', fixed: 'fixed', collection: 'collection', reports: 'reports', settings: 'settings'};

  const svg = (key, size = 22) => ICONS[key] ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key]}</svg>` : '';

  App.icons = {ICONS, OF_VIEW, svg, forView: view => OF_VIEW[view] || ''};
})();
