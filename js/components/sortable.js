// Ordenar qualquer tabela clicando no título da coluna (SPECS 42). Clicou: do menor para o maior (▲); clicou de novo: do maior
// para o menor (▼). No celular, onde as tabelas viram cartões, aparece uma caixinha "Ordenar por" com as mesmas colunas.
// Funciona sozinho em todas as tabelas das telas (#app) e das janelas, menos documentos (recibo, extrato...), tabelas com campos de
// digitar e comparações. A ordem escolhida em cada tela fica lembrada neste aparelho (localStorage, fora dos dados).
// Analogia: é o botão "classificar" da planilha, só que em todas as listas do sistema.
(() => {
  const App = (window.App = window.App || {});
  const {normalize} = App.format;

  const KEY = 'julio-informatica-ordem';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const saveAll = all => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* sem acesso: vale só agora */ } };

  // Tabelas que NÃO ordenam: documentos, comparações e tabelas com campos (ex.: taxas da maquininha).
  const skip = table => !!table.closest('.doc, .pay-compare, .sync-compare, .doc-calc') || !table.tHead || !table.tBodies[0] || !!table.tBodies[0].querySelector('input, select, textarea');
  // Linhas de total (ou com células juntadas) ficam sempre no fim.
  const fixedRow = row => row.classList.contains('doc-total') || row.classList.contains('total') || [...row.cells].some(cell => cell.colSpan > 1);
  const heads = table => [...table.tHead.rows[0].cells];
  // Coluna só de botões (Editar, Receber...) ou sem título: não ordena.
  const onlyButtons = cell => { const buttons = [...cell.querySelectorAll('button')]; return buttons.length > 0 && cell.textContent.replace(/s+/g, '') === buttons.map(b => b.textContent.replace(/s+/g, '')).join(''); };
  const sortableCol = (table, col) => {
    const th = heads(table)[col];
    if (!th || !th.textContent.trim()) return false;
    const cells = [...table.tBodies[0].rows].filter(r => !fixedRow(r)).map(r => r.cells[col]).filter(Boolean);
    return cells.some(cell => cell.textContent.trim() && !onlyButtons(cell));
  };

  // O valor de uma célula para comparar: data (dd/mm/aaaa) vira número aaaammdd; R$ e números viram número; o resto é texto.
  function keyOf(cell) {
    const text = (cell ? cell.textContent : '').trim();
    const date = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (date) return {kind: 'n', v: Number(date[3] + date[2] + date[1])};
    const money = text.match(/^(-|−)?\s*R\$\s*(-|−)?\s*([\d.]+,\d{2})/);
    if (money) return {kind: 'n', v: (money[1] || money[2] ? -1 : 1) * Number(money[3].replace(/\./g, '').replace(',', '.'))};
    if (/^-?\d+([.,]\d+)?\s*%?$/.test(text)) return {kind: 'n', v: Number(text.replace('%', '').replace(',', '.'))};
    return {kind: 't', v: normalize(text)};
  }
  function compare(a, b) {
    if (a.kind === 'n' && b.kind === 'n') return a.v - b.v;
    if (a.kind !== b.kind) return a.kind === 'n' ? -1 : 1;
    if (!a.v && b.v) return 1;        // vazios no fim
    if (a.v && !b.v) return -1;
    return a.v.localeCompare(b.v, 'pt-BR', {numeric: true, sensitivity: 'base'});   // V0002 antes de V0010
  }

  let busy = false;
  function sortTable(table, col, dir) {
    const body = table.tBodies[0], rows = [...body.rows];
    const movable = rows.filter(r => !fixedRow(r)), fixed = rows.filter(fixedRow);
    const keyed = movable.map((row, i) => ({row, i, k: keyOf(row.cells[col])}));
    keyed.sort((a, b) => (compare(a.k, b.k) || a.i - b.i) * (dir === 'desc' ? -1 : 1));
    busy = true;
    [...keyed.map(x => x.row), ...fixed].forEach(row => { body.appendChild(row); row.__sorted = true; });
    busy = false;
    heads(table).forEach((th, i) => { if (th.classList.contains('sortable')) th.setAttribute('aria-sort', i === col ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'); });
    const select = table.__sortSelect;
    if (select) select.value = `${col}:${dir}`;
    table.__sortState = {col, dir};
  }

  // Chave para lembrar a ordem: a tela + a posição da tabela nela (só tabelas das telas; nas janelas vale só enquanto estão abertas).
  const keyFor = table => {
    if (!table.closest('#app')) return '';
    const index = [...document.querySelectorAll('#app table')].filter(t => t.__sortReady).indexOf(table);
    return `${App.ui.current || ''}:${index}`;
  };
  function choose(table, col, dir) {
    sortTable(table, col, dir);
    const key = keyFor(table);
    if (key) { const all = load(); all[key] = {col, dir}; saveAll(all); }
  }

  function enhance(table) {
    if (skip(table)) return;
    if (!table.__sortReady) {
      table.__sortReady = true;
      const options = [];
      heads(table).forEach((th, col) => {
        if (!sortableCol(table, col)) return;
        th.classList.add('sortable');
        th.setAttribute('aria-sort', 'none');
        th.tabIndex = 0;
        th.title = 'Clique para ordenar';
        const go = () => { const s = table.__sortState; choose(table, col, s && s.col === col && s.dir === 'asc' ? 'desc' : 'asc'); };
        th.addEventListener('click', go);
        th.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(); } });
        const name = th.textContent.trim();
        options.push(`<option value="${col}:asc">${App.format.esc(name)} ▲</option><option value="${col}:desc">${App.format.esc(name)} ▼</option>`);
      });
      if (!options.length) return;
      // Celular: "Ordenar por" logo acima da tabela (no computador fica escondido; lá se clica no título)
      const box = document.createElement('label');
      box.className = 'sort-select mobile-only';
      box.innerHTML = `Ordenar por <select><option value="">Ordem da tela</option>${options.join('')}</select>`;
      const select = box.querySelector('select');
      select.addEventListener('change', () => { if (select.value) { const [col, dir] = select.value.split(':'); choose(table, Number(col), dir); } });
      (table.closest('.table-wrap') || table).before(box);
      table.__sortSelect = select;
      const saved = load()[keyFor(table)];
      if (saved && heads(table)[saved.col] && heads(table)[saved.col].classList.contains('sortable')) table.__sortState = saved;
    }
    // linhas novas (a tela redesenhou a lista, ex.: busca): aplica de novo a ordem escolhida
    if (table.__sortState && [...table.tBodies[0].rows].some(row => !row.__sorted)) sortTable(table, table.__sortState.col, table.__sortState.dir);
  }

  function enhanceAll(root) { root.querySelectorAll('table').forEach(enhance); }
  let queued = false;
  function schedule() { if (busy || queued) return; queued = true; Promise.resolve().then(() => { queued = false; ['app', 'modal-content'].forEach(id => { const el = document.getElementById(id); if (el) enhanceAll(el); }); }); }
  ['app', 'modal-content'].forEach(id => { const el = document.getElementById(id); if (el) new MutationObserver(schedule).observe(el, {childList: true, subtree: true}); });

  // Listas em cartões (Contas a receber, Orçamentos): "Ordenar por" com opções prontas. Guarda a escolha por tela, neste aparelho.
  function cardSort(screen, fallback) {
    const value = () => load()[`cards:${screen}`] || fallback;
    const set = v => { const all = load(); all[`cards:${screen}`] = v; saveAll(all); };
    return {value, set};
  }

  App.sortable = {enhanceAll, keyOf, compare, cardSort};
})();
