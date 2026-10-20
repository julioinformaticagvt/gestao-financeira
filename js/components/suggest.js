// Lista de sugestões que abre logo ABAIXO da caixa (SPECS 33.2), no lugar da lista nativa do navegador (que no celular abre acima do teclado).
// Funciona sozinha com os campos que já usam <input list="..."> + <datalist>: lê as opções da <datalist>, tira o atributo "list" (para a lista
// nativa não aparecer) e desenha a lista própria. Mostra até 6 nomes que combinam com o que foi digitado (sem diferenciar maiúsculas e acentos).
(() => {
  const App = (window.App = window.App || {});
  const {normalize} = App.format;
  const LIMIT = 6;

  let open = null;   // {input, box, items, index}
  let picking = false;   // durante a escolha: o "input" que a própria escolha dispara não reabre a lista

  const optionsOf = id => { const list = document.getElementById(id); return list ? [...list.options].map(o => o.value).filter(Boolean) : []; };

  function close() {
    if (!open) return;
    open.box.remove();
    open.input.removeAttribute('aria-expanded');
    open = null;
  }

  function pick(value) {
    if (!open) return;
    const {input} = open;
    close();
    input.value = value;
    picking = true;
    try {
      input.dispatchEvent(new Event('input', {bubbles: true}));
      input.dispatchEvent(new Event('change', {bubbles: true}));
    } finally { picking = false; }
  }

  function matches(all, text) {
    const key = normalize(text.trim());
    if (!key) return all.slice(0, LIMIT);
    const starts = [], contains = [];
    for (const name of all) { const n = normalize(name); if (n === key) continue; (n.startsWith(key) ? starts : n.includes(key) ? contains : []).push(name); }
    return [...starts, ...contains].slice(0, LIMIT);
  }

  function render() {
    if (!open) return;
    const {input, box} = open;
    box.innerHTML = open.items.map((name, i) => `<button type="button" role="option" class="suggest-item${i === open.index ? ' active' : ''}" data-i="${i}">${App.format.esc(name)}</button>`).join('');
  }

  function show(input) {
    const all = optionsOf(input.dataset.suggestList);
    const items = matches(all, input.value);
    if (!items.length) { close(); return; }
    if (!open || open.input !== input) {
      close();
      const host = input.parentElement;
      host.classList.add('suggest-host');
      const box = document.createElement('div');
      box.className = 'suggest-box';
      box.setAttribute('role', 'listbox');
      host.appendChild(box);
      input.setAttribute('aria-expanded', 'true');
      open = {input, box, items, index: -1};
      // pointerdown (e não click) e preventDefault: a caixa não perde o foco nem fecha antes de escolher
      box.addEventListener('pointerdown', event => { const item = event.target.closest('.suggest-item'); if (item) { event.preventDefault(); pick(open.items[Number(item.dataset.i)]); } });
    }
    open.items = items; open.index = -1;
    // logo abaixo da caixa (e não abaixo de tudo que está no mesmo campo, como dicas e links)
    Object.assign(open.box.style, {top: `${input.offsetTop + input.offsetHeight + 4}px`, left: `${input.offsetLeft}px`, width: `${input.offsetWidth}px`, right: 'auto'});
    render();
    open.box.scrollIntoView({block: 'nearest'});   // a lista não fica escondida atrás do teclado
  }

  function enhance(input) {
    if (input.dataset.suggestDone || !input.getAttribute('list')) return;
    input.dataset.suggestDone = '1';
    input.dataset.suggestList = input.getAttribute('list');
    input.removeAttribute('list');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-autocomplete', 'list');
    input.addEventListener('focus', () => show(input));
    input.addEventListener('input', () => { if (!picking) show(input); });
    input.addEventListener('keydown', event => {
      if (!open || open.input !== input) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); open.index = (open.index + 1) % open.items.length; render(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); open.index = (open.index - 1 + open.items.length) % open.items.length; render(); }
      else if (event.key === 'Enter' && open.index >= 0) { event.preventDefault(); pick(open.items[open.index]); }
      else if (event.key === 'Escape') { event.stopPropagation(); close(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (open && open.input === input) close(); }, 120));
  }

  function enhanceAll(root) { root.querySelectorAll('input[list]').forEach(enhance); }

  let queued = false;
  function schedule() { if (!queued) { queued = true; Promise.resolve().then(() => { queued = false; ['app', 'modal-content'].forEach(id => { const el = document.getElementById(id); if (el) enhanceAll(el); }); }); } }
  ['app', 'modal-content'].forEach(id => { const el = document.getElementById(id); if (el) new MutationObserver(schedule).observe(el, {childList: true, subtree: true}); });
  document.addEventListener('click', event => { if (open && !event.target.closest('.suggest-box') && event.target !== open.input) close(); });

  App.suggest = {enhanceAll, close, LIMIT};
})();
