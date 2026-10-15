// "Bandejinha" de um mês: um cartão com o nome do mês e os números principais; clicando, abre e mostra os detalhes.
// O mês atual fica sempre aberto (não recolhe). Os outros começam fechados e lembram se foram abertos enquanto o sistema está aberto.
// Analogia: é uma gaveta de arquivo com etiqueta; a etiqueta (números) sempre aparece, o conteúdo só quando abre.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, monthLabel} = App.format;

  const opened = new Set();   // chaves "tela:AAAA-MM" das bandejinhas que o usuário abriu

  // {screen, month, always, tag, tone, stats:[{label, value, kind}], body}
  function monthTray({screen, month, always, tag, tone, stats, body}) {
    const key = `${screen}:${month}`, open = always || opened.has(key);
    const name = monthLabel(month).replace(/^./, c => c.toUpperCase());
    const head = `<span class="tray-title"><b>${esc(name)}</b>${tag ? `<span class="tray-tag ${tone || ''}">${esc(tag)}</span>` : ''}</span><span class="tray-stats">${(stats || []).map(s => `<span class="tray-stat ${s.kind || ''}"><small>${esc(s.label)}</small><b>${money(s.value)}</b></span>`).join('')}</span>`;
    return `<section class="tray ${always ? 'tray-now' : ''} ${open ? 'is-open' : ''}" data-tray-month="${month}">${always
      ? `<div class="tray-head">${head}</div>`
      : `<button type="button" class="tray-head" data-tray="${esc(key)}" aria-expanded="${open}">${head}<span class="tray-chevron" aria-hidden="true">${open ? '▾' : '▸'}</span></button>`}<div class="tray-body ${open ? '' : 'hidden'}">${body}</div></section>`;
  }

  // Abrir/fechar sem redesenhar a tela (para não perder busca nem rolagem).
  App.ui.onClick('[data-tray]', element => {
    const key = element.dataset.tray, section = element.closest('.tray'), open = !opened.has(key);
    open ? opened.add(key) : opened.delete(key);
    section.classList.toggle('is-open', open);
    element.setAttribute('aria-expanded', String(open));
    element.querySelector('.tray-chevron').textContent = open ? '▾' : '▸';
    section.querySelector('.tray-body').classList.toggle('hidden', !open);
  });

  App.components = Object.assign(App.components || {}, {monthTray});
})();
