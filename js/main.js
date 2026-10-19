// Liga tudo e abre a primeira tela. É o último script a carregar.
// Avisos de proteção dos dados (ver store.js): outra janela salvou, navegador sem espaço, dados grandes e dados corrompidos.
(() => {
  const App = window.App, {openModal} = App.ui;
  App.ui.registerAction('reload-page', () => location.reload());
  App.store.hooks.onStale = () => openModal('<h2>Atenção: dados alterados em outra janela</h2><p>O sistema está aberto em <b>mais de uma janela</b> e outra janela salvou dados depois desta abrir. Para <b>não apagar nada</b>, esta janela parou de salvar.</p><p>Clique em <b>Recarregar</b> para ver os dados mais novos e continue por uma janela só.</p><div class="actions"><button type="button" class="primary" data-action="reload-page">Recarregar agora</button></div>');
  App.store.hooks.onSaveError = () => openModal('<h2>Não consegui salvar</h2><p class="negative"><b>O navegador recusou gravar os dados</b> (provavelmente o espaço do navegador acabou). O que você acabou de fazer <b>pode não ter sido salvo</b>.</p><p>Faça um <b>backup agora</b> (Configurações > Backup e exportação) e fale com quem cuida do sistema antes de continuar.</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Entendi</button></div>');
  App.store.hooks.onSizeWarning = bytes => openModal(`<h2>Os dados estão ficando grandes</h2><p>Os dados já ocupam cerca de <b>${(bytes / 1000000).toFixed(1)} MB</b> dos aproximadamente 5 MB que o navegador permite. Quando acabar, o sistema não consegue mais salvar.</p><p>Faça um <b>backup agora</b> (Configurações > Backup e exportação) e avise para limparmos dados antigos.</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Entendi</button></div>`);
})();

(() => {
  const App = window.App;

  App.ui.start();           // passa a ouvir os cliques do menu e dos botões
  if (App.store.blocked) {  // dados criados por uma versão mais nova: o sistema não abre nem grava nada (SPECS 23.5)
    const bar = document.querySelector('.topbar'); if (bar) bar.hidden = true;
    document.getElementById('page-title').textContent = 'Atualização necessária';
    App.firstRun.run();
    return;
  }
  App.bills.generate();     // cria as contas a pagar do mês das despesas fixas (sem duplicar)
  App.bills.ensureDas();    // MEI: lembrete do DAS do mês (uma vez por mês)
  App.branding.apply();     // nome e logo no topo
  App.serviceOrders.applyLabels();   // aba "Orçamentos" ou "Orçamentos e OS", conforme a chave
  App.ui.go('dashboard');   // primeira tela
  App.backup.start();       // backup automático (depois da primeira tela, porque pode mostrar avisos nela)
  App.sync.start();         // sincronização com o Google Drive (desligada até a pessoa conectar)
  if (App.store.loadProblem) App.ui.openModal('<h2>Os dados salvos estavam ilegíveis</h2><p class="negative">Não consegui ler os dados guardados neste navegador (o arquivo parece danificado). <b>Uma cópia dele foi guardada</b> e o sistema abriu vazio.</p><p>Importe um backup em Configurações > Backup e exportação para recuperar.</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Entendi</button></div>');
  const opened = App.firstRun.run();   // assistente (sistema novo), "O que há de novo" e faixa da demonstração
  if (!opened) App.alerts.showUrgent();   // janela única com os avisos urgentes (se houver mais de um e não tiver sido dispensada hoje)
})();

// Mostra a versão no rodapé (ex.: "Versão 0.2.0 · Cobrar e controlar o caixa").
(() => {
  const version = window.APP_VERSION, element = document.getElementById('app-version');
  if (version && element) { element.textContent = `Versão ${version.number} · ${version.name}`; element.dataset.action = 'open-news'; element.title = 'O que há de novo'; }
})();
