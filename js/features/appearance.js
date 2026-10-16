// Tamanhos escolhidos por cada pessoa (SPECS 31.9), guardados só neste aparelho (localStorage `julio-informatica-ui`, fora dos dados e do backup):
//  - "bar": tamanho do texto e dos ícones da barra de cima (80% a 150%; só em tela larga);
//  - "zoom": tamanho geral da tela, para quem enxerga mal (90% a 150%), aplicado como zoom da página inteira.
// O CSS lê as variáveis --bar-scale e --ui-zoom colocadas em <html> (css/layout.css e css/base.css).
// Analogia: é o botão de "aumentar a letra" do sistema, guardado em cada aparelho.
(() => {
  const App = (window.App = window.App || {});
  const {registerAction, byId} = App.ui;

  const KEY = 'julio-informatica-ui';
  const RANGE = {bar: {min: 80, max: 150}, zoom: {min: 90, max: 150}};
  const clamp = (kind, value) => {
    const n = Math.round(Number(value) / 5) * 5;
    return Number.isFinite(n) ? Math.max(RANGE[kind].min, Math.min(RANGE[kind].max, n)) : 100;
  };
  const read = () => {
    try { const saved = JSON.parse(localStorage.getItem(KEY) || '{}'); return {bar: clamp('bar', saved.bar ?? 100), zoom: clamp('zoom', saved.zoom ?? 100)}; }
    catch { return {bar: 100, zoom: 100}; }
  };
  const prefs = read();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* sem acesso: vale só até fechar */ } };

  function apply() {
    const root = document.documentElement.style;
    if (prefs.zoom === 100) root.removeProperty('--ui-zoom'); else root.setProperty('--ui-zoom', String(prefs.zoom / 100));
    if (prefs.bar === 100) root.removeProperty('--bar-scale'); else root.setProperty('--bar-scale', String(prefs.bar / 100));
    if (App.branding) App.branding.apply();   // a altura da barra de cima acompanha o tamanho do texto
  }
  apply();

  const OPTIONS = {
    bar: {id: 'bar-size', label: 'Tamanho do texto e dos ícones da barra de cima', help: 'Só em tela larga (computador). Vale só para este aparelho.'},
    zoom: {id: 'ui-zoom', label: 'Tamanho geral da tela (textos, botões e ícones)', help: 'Para quem precisa de letras maiores: aumenta tudo, como o zoom do navegador. Vale só para este aparelho; use "Voltar ao padrão" se algo ficar grande demais.'}
  };
  function sliderHtml(kind) {
    const o = OPTIONS[kind], r = RANGE[kind];
    return `<div class="field full"><label>${o.label}</label><div class="size-row"><input type="range" id="${o.id}" min="${r.min}" max="${r.max}" step="5" value="${prefs[kind]}" aria-label="${o.label}"><output id="${o.id}-out" for="${o.id}">${prefs[kind]}%</output><button type="button" class="secondary" data-action="${o.id}-reset">Voltar ao padrão (100%)</button></div><p class="muted">${o.help}</p></div>`;
  }

  function set(kind, value, save) {
    prefs[kind] = clamp(kind, value);
    apply();
    if (save) persist();
    const o = OPTIONS[kind], input = byId(o.id), out = byId(`${o.id}-out`);
    if (input) input.value = prefs[kind];
    if (out) out.textContent = `${prefs[kind]}%`;
  }

  // Controles deslizantes: a barra de cima muda na hora; o tamanho geral só ao soltar (senão a tela "foge" debaixo do dedo).
  document.addEventListener('input', event => {
    const id = event.target && event.target.id;
    if (id === 'bar-size') set('bar', event.target.value, false);
    else if (id === 'ui-zoom') { const out = byId('ui-zoom-out'); if (out) out.textContent = `${clamp('zoom', event.target.value)}%`; }
  });
  document.addEventListener('change', event => {
    const id = event.target && event.target.id;
    if (id === 'bar-size') set('bar', event.target.value, true);
    else if (id === 'ui-zoom') set('zoom', event.target.value, true);
  });
  registerAction('bar-size-reset', () => set('bar', 100, true));
  registerAction('ui-zoom-reset', () => set('zoom', 100, true));

  App.appearance = {sliderHtml, set, barScale: () => prefs.bar / 100, get prefs() { return {...prefs}; }, RANGE};
})();
