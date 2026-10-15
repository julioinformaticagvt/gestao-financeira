// Gráfico de barras usado na Visão geral e nos Relatórios.
// rows = [{label, first, second?}]; "second" é opcional (segunda barra de cada coluna).
(() => {
  const App = (window.App = window.App || {});
  const {money} = App.format;

  function barChart(rows, firstLabel, secondLabel) {
    const max = Math.max(1, ...rows.flatMap(row => [row.first, row.second || 0]));
    const legend = `<div class="finance-legend"><span><i class="bar-swatch first"></i>${firstLabel}</span>${secondLabel ? `<span><i class="bar-swatch second"></i>${secondLabel}</span>` : ''}</div>`;
    const columns = rows.map(row => `<div class="finance-column"><div class="bar-pair"><span class="finance-bar first" style="height:${Math.max(3, row.first / max * 100)}%" title="${money(row.first)}"></span>${secondLabel ? `<span class="finance-bar second" style="height:${Math.max(3, (row.second || 0) / max * 100)}%" title="${money(row.second || 0)}"></span>` : ''}</div><small>${row.label}</small><b>${money(row.first)}</b>${secondLabel ? `<em>${money(row.second || 0)}</em>` : ''}</div>`).join('');
    return `${legend}<div class="finance-chart">${columns}</div>`;
  }

  App.components = Object.assign(App.components || {}, {barChart});
})();
