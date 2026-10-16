// Animações em 5 níveis, escolhidos por cada pessoa (SPECS 31.6). O nível vale só para este aparelho (fica fora dos dados e do backup)
// e é aplicado como <html data-anim="0..4">; quem desenha as animações é o css/motion.css. Aqui ficam: a escolha, o painel em
// Configurações e o contador de números do nível 4.
(() => {
  const App = (window.App = window.App || {});
  const {esc} = App.format;
  const {registerAction, byId} = App.ui;

  const KEY = 'julio-informatica-anim';   // só neste aparelho
  const LEVELS = [
    {name: 'Desligado', desc: 'Nada se mexe: nenhuma animação nem transição.'},
    {name: 'Sutil', desc: 'Só o básico: botões e cores mudam com suavidade e as janelas aparecem com um fade.'},
    {name: 'Suave', desc: 'Padrão. Telas que entram com suavidade, janelas que sobem de leve, botões que afundam ao clicar.'},
    {name: 'Animado', desc: 'Tudo do nível 2, mais painéis entrando em cascata, barras dos gráficos crescendo e linhas de tabela entrando uma a uma.'},
    {name: 'Muita animação', desc: 'Tudo do nível 3, mais números que contam até o valor, efeito elástico nas janelas e botões e ícones que dão um pulinho.'}
  ];

  // Padrão: 2; se o aparelho pede "reduzir movimento" e a pessoa nunca escolheu, 0. Nos testes automáticos, sempre 2 (sem depender do aparelho).
  const defaultLevel = () => {
    if (window.__TEST_IDS) return 2;
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 2; } catch { return 2; }
  };
  const read = () => {
    try { const value = localStorage.getItem(KEY); if (/^[0-4]$/.test(value || '')) return Number(value); } catch { /* sem acesso: usa o padrão */ }
    return defaultLevel();
  };
  let level = read();
  const apply = () => { document.documentElement.dataset.anim = String(level); };
  apply();

  function panelHtml() {
    const buttons = LEVELS.map((l, n) => `<button type="button" role="radio" aria-checked="${n === level}" class="${n === level ? 'primary' : 'secondary'}" data-action="motion-set" data-level="${n}"><b>${n}</b> ${esc(l.name)}</button>`).join('');
    return `<section class="panel g-other" id="motion-panel"><h2>Aparência e animações</h2><div class="form-grid">${App.appearance.sliderHtml('zoom')}</div><h3>Animações</h3><p class="muted">Escolha o quanto o sistema se mexe. A escolha vale só para este aparelho (o celular pode ter um nível e o computador outro).</p><div class="level-picker" role="radiogroup" aria-label="Nível de animação">${buttons}</div><p class="muted" id="motion-desc"><b>Nível ${level}:</b> ${esc(LEVELS[level].desc)}</p></section>`;
  }

  function setLevel(n) {
    level = Math.max(0, Math.min(4, Number(n) || 0));
    try { localStorage.setItem(KEY, String(level)); } catch { /* sem acesso: vale só até fechar */ }
    apply();
    const panel = byId('motion-panel');
    if (panel) panel.outerHTML = panelHtml();
  }
  registerAction('motion-set', element => setLevel(element.dataset.level));

  // ---------- nível 4: os números da faixa da Visão geral contam até o valor ----------
  // O valor final é sempre o texto exato que o sistema já tinha escrito (a contagem é só efeito).
  const parse = text => { const n = Number(String(text).replace(/[^\d,-]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  function countUp() {
    if (level !== 4 || window.__TEST_IDS) return;
    document.querySelectorAll('#app .kpi-value').forEach(el => {
      const final = el.textContent, target = parse(final);
      if (!target) return;
      const start = performance.now(), duration = 700;
      const step = now => {
        const p = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - p, 3);
        el.textContent = p >= 1 ? final : App.format.money(target * eased);
        if (p < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = final;
      };
      requestAnimationFrame(step);
    });
  }
  document.addEventListener('screenchange', countUp);

  App.motion = {LEVELS, panelHtml, setLevel, get level() { return level; }};
})();
