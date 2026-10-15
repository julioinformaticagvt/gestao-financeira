// Aplicativo instalável e uso sem internet (SPECS, seção 26.1): registra o service worker (sw.js), avisa quando há versão nova
// e oferece "Instalar como aplicativo". O service worker só é registrado em https ou localhost, nunca em file:// (abrir o
// index.html direto continua igual) e nunca nos testes automáticos. Nunca recarrega a página sozinho.
(() => {
  const App = (window.App = window.App || {});
  const {esc} = App.format;

  let registration = null, deferredInstall = null, refreshing = false, wantsReload = false;
  const secure = () => location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  // Em localhost (desenvolvimento) o service worker só liga com ?pwa=1: assim ele não guarda arquivos velhos enquanto o sistema é editado
  // e testado. Sem ?pwa=1, qualquer registro antigo no localhost é desfeito.
  const dev = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const supported = () => 'serviceWorker' in navigator && secure() && location.protocol !== 'file:' && !window.__TEST_IDS && (!dev() || /[?&]pwa=1/.test(location.search));

  function showUpdateBar() {
    if (document.getElementById('update-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'update-bar';
    bar.className = 'update-bar';
    bar.innerHTML = '<span><b>Há uma versão nova.</b> Recarregue para atualizar (seus dados não mudam).</span><button type="button" class="primary" data-action="pwa-update">Recarregar para atualizar</button><button type="button" class="secondary" data-action="pwa-dismiss">Depois</button>';
    document.body.appendChild(bar);
  }

  function register() {
    if (dev() && !/[?&]pwa=1/.test(location.search) && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(list => list.forEach(r => r.unregister())).catch(() => {});
      if (window.caches) caches.keys().then(keys => keys.filter(k => k.startsWith('gestao-financeira-')).forEach(k => caches.delete(k))).catch(() => {});
    }
    if (!supported()) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar(); });
      });
    }).catch(() => { /* sem service worker: o sistema funciona do mesmo jeito, só não guarda para uso sem internet */ });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (wantsReload && !refreshing) { refreshing = true; location.reload(); } });
  }

  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; const b = document.getElementById('pwa-install'); if (b) b.disabled = false; });
  window.addEventListener('appinstalled', () => { deferredInstall = null; });

  App.ui.registerAction('pwa-update', () => {
    if (registration && registration.waiting) { wantsReload = true; registration.waiting.postMessage({type: 'SKIP_WAITING'}); }
    else location.reload();
  });
  App.ui.registerAction('pwa-dismiss', () => { const bar = document.getElementById('update-bar'); if (bar) bar.remove(); });
  App.ui.registerAction('pwa-install', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch { /* segue */ }
    deferredInstall = null;
    const b = document.getElementById('pwa-install'); if (b) b.disabled = true;
  });

  // Painel de Configurações: instalar como aplicativo.
  function settingsPanel() {
    const can = supported();
    return `<section class="panel g-other"><h2>Instalar como aplicativo</h2>${can
      ? `<p class="muted">Instalado, o sistema abre em tela cheia e funciona mesmo sem internet. Os dados continuam só neste aparelho.</p><div class="actions"><button type="button" class="secondary" id="pwa-install" data-action="pwa-install" ${deferredInstall ? '' : 'disabled'}>Instalar como aplicativo</button></div><p class="muted">Se o botão estiver apagado, o navegador ainda não liberou a instalação (ou o aplicativo já está instalado).</p>`
      : '<p class="muted">A instalação só fica disponível quando o sistema é aberto por um endereço da internet (https). Abrindo o arquivo direto no computador, ele continua funcionando normalmente.</p>'}
      <p><b>Android (Chrome):</b> menu ⋮ → "Instalar aplicativo" ou "Adicionar à tela inicial".<br><b>iPhone (Safari):</b> botão Compartilhar → "Adicionar à Tela de Início".</p></section>`;
  }

  register();
  App.pwa = {supported, settingsPanel, showUpdateBar};
})();
