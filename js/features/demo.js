// Modo demonstração (SPECS, seção 23.2): dados de exemplo em OUTRA chave de armazenamento, totalmente separada dos dados reais.
// Entrar grava os exemplos e liga uma "chave" (flag); o sistema recarrega e o store.js passa a ler e gravar só na chave de demonstração.
// Sair desliga a chave, apaga os exemplos e recarrega: os dados reais nunca foram tocados.
// Dentro da demonstração o backup (manual, automático e restaurar) fica bloqueado, para não misturar exemplos com dados reais.
(() => {
  const App = (window.App = window.App || {});
  const {today, esc} = App.format;
  const {openModal, closeModal, registerAction} = App.ui;

  const isDemo = () => App.store.isDemo;
  // O sistema real já foi configurado por alguém? (decide o texto do botão de sair)
  function realInUse() {
    try {
      const raw = localStorage.getItem(App.store.REAL_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw), s = d.settings || {};
      return !!(s.setupDone || (d.clients || []).length || (d.sales || []).length);
    } catch { return false; }
  }

  function enter({reload = true} = {}) {
    if (isDemo()) return false;
    try {
      localStorage.setItem(App.store.DEMO_KEY, JSON.stringify(window.DemoData.build(today())));
      localStorage.setItem(App.store.DEMO_FLAG, '1');
    } catch { alert('Não consegui preparar os dados de exemplo (o navegador recusou gravar).'); return false; }
    if (reload) location.reload();
    return true;
  }

  function exit({reload = true} = {}) {
    try {
      localStorage.removeItem(App.store.DEMO_FLAG);
      localStorage.removeItem(App.store.DEMO_KEY);
      localStorage.removeItem(`${App.store.DEMO_KEY}-antes-da-v2`);
    } catch { /* segue */ }
    if (reload) location.reload();
  }

  // Faixa fixa no topo, só na demonstração.
  function installBanner() {
    const old = document.getElementById('demo-banner');
    if (old) old.remove();
    if (!isDemo()) return;
    const fresh = !realInUse();
    const bar = document.createElement('div');
    bar.id = 'demo-banner';
    bar.className = 'demo-banner';
    bar.innerHTML = `<span><b>Modo demonstração:</b> nada aqui é real. O backup fica desligado e seus dados verdadeiros não são tocados.</span><span class="demo-actions"><button type="button" class="secondary" data-action="demo-exit">Sair e voltar aos meus dados</button>${fresh ? '<button type="button" class="primary" data-action="demo-exit">Apagar exemplos e começar de verdade</button>' : ''}</span>`;
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function confirmEnter() {
    const existing = realInUse();
    openModal(`<h2>Ver com dados de exemplo</h2><p>O sistema vai abrir com clientes, vendas e contas <b>inventados</b>, para você conhecer as telas sem medo.</p><p class="${existing ? 'negative' : 'muted'}"><b>Seus dados reais não serão tocados.</b> Eles ficam guardados à parte e voltam quando você clicar em "Sair" na faixa do topo. Dentro da demonstração o backup fica desligado.</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button type="button" class="primary" data-action="demo-confirm">Abrir a demonstração</button></div>`);
  }

  registerAction('demo-enter', confirmEnter);
  registerAction('demo-confirm', () => { closeModal(); enter(); });
  registerAction('demo-exit', () => exit());

  App.demo = {isDemo, enter, exit, installBanner, realInUse};
})();
