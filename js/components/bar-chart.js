// Gráfico de barras usado na Visão geral e nos Relatórios.
// rows = [{label, first, second?, color?, dot?}]; "second" é opcional (segunda barra de cada coluna).
// Cores (SPECS 30.1): a 1ª série é cinza, a menos que options.color mande outra (ex.: azul para "A receber", verde para "Recebido");
// uma linha pode ter a própria cor (row.color), e row.dot põe uma bolinha dessa cor junto do nome da coluna.
// options.noLegend tira a legenda de cima (quando cada coluna já mostra a cor e o nome).
// A cor NUNCA vem sozinha: cada coluna tem o nome e o valor escritos.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc} = App.format;

  // Cor de cada forma de pagamento (a mesma na Visão geral e nos Relatórios). Pix PJ e Pix PF aparecem separados.
  function methodColor(method) {
    const m = String(method).toLowerCase();
    if (/pix\s*pf/.test(m)) return '#b5e6c9';
    if (/pix/.test(m)) return '#7fcf9f';
    if (/dinheiro/.test(m)) return '#e3a74a';
    if (/cr[eé]dito|cart/.test(m)) return '#6fb1e8';
    if (/d[eé]bito/.test(m)) return '#9cc9ef';
    if (/transfer/.test(m)) return '#b690e8';
    if (/carn|entrada/.test(m)) return '#4fc1c9';
    return '#8a948f';
  }

  function barChart(rows, firstLabel, secondLabel, options = {}) {
    const max = Math.max(1, ...rows.flatMap(row => [row.first, row.second || 0]));
    const firstStyle = color => color ? ` style="background:${color}"` : '';
    const legend = options.noLegend ? '' : `<div class="finance-legend"><span><i class="bar-swatch first"${firstStyle(options.color)}></i>${firstLabel}</span>${secondLabel ? `<span><i class="bar-swatch second"></i>${secondLabel}</span>` : ''}</div>`;
    const columns = rows.map(row => {
      const color = row.color || options.color;
      const name = row.dot ? `<i class="bar-swatch"${firstStyle(row.color)}></i> ${esc(row.label)}` : row.label;
      return `<div class="finance-column"><div class="bar-pair"><span class="finance-bar first" style="height:${Math.max(3, row.first / max * 100)}%${color ? `;background:${color}` : ''}" title="${money(row.first)}"></span>${secondLabel ? `<span class="finance-bar second" style="height:${Math.max(3, (row.second || 0) / max * 100)}%" title="${money(row.second || 0)}"></span>` : ''}</div><small>${name}</small><b>${money(row.first)}</b>${secondLabel ? `<em>${money(row.second || 0)}</em>` : ''}</div>`;
    }).join('');
    return `${legend}<div class="finance-chart">${columns}</div>`;
  }

  App.components = Object.assign(App.components || {}, {barChart, methodColor});
})();
