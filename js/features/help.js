// Guia "Como usar" (SPECS, seção 23.4): 7 tarefas com passos curtos e um botão "Ir para a tela".
// O texto fica aqui, em uma lista simples, fácil de editar. Linguagem sem jargão.
(() => {
  const App = (window.App = window.App || {});
  const {esc} = App.format;
  const {openModal, closeModal, registerAction, go} = App.ui;

  const TASKS = [
    {title: 'Cadastrar cliente e produto', view: 'clients', go: 'Ir para Clientes', steps: [
      'Abra a aba Clientes e clique em "+ Novo cliente".',
      'Digite o nome (o resto é opcional) e salve.',
      'Abra a aba Produtos e cadastre o produto ou serviço, com o preço e quanto você paga.',
      'Pronto: eles aparecem na lista quando você for vender.'
    ]},
    {title: 'Fazer uma venda (à vista e parcelada)', view: 'sales', go: 'Ir para Vendas', steps: [
      'Clique em "Nova venda" (botão laranja no topo).',
      'Escolha o cliente e o produto ou serviço, e digite o valor de venda e de compra.',
      'Escolha a forma de pagamento: Pix, dinheiro, débito, crédito ou carnê (parcelado por você).',
      'No carnê, informe as parcelas, a entrada e a data da primeira parcela. Confira o resumo e salve.'
    ]},
    {title: 'Registrar um pagamento e gerar o recibo', view: 'receivables', go: 'Ir para Contas a receber', steps: [
      'Abra o Financeiro e, em "Contas a receber", ache a parcela (o mês atual já fica aberto).',
      'Clique em "Receber" e confira o valor e a data.',
      'Confirme: o recibo é gerado na hora.',
      'Use "Baixar PDF" para guardar ou "Copiar mensagem" para mandar pelo WhatsApp.'
    ]},
    {title: 'Cobrar uma parcela vencida', view: 'receivables', go: 'Ir para Contas a receber', steps: [
      'Na Visão geral, veja o painel "Avisos de hoje" ou o valor "Vencido".',
      'Em Contas a receber, as parcelas vencidas têm o botão "Cobrar".',
      'O sistema monta a mensagem com a multa e os juros até hoje; copie e envie.',
      'Ao receber, o sistema já soma multa e juros (você pode dispensá-los, com um motivo).'
    ]},
    {title: 'Abrir uma ordem de serviço e fechar a venda', view: 'quotes', go: 'Ir para Orçamentos e OS', steps: [
      'Abra "Orçamentos e OS" e clique em "+ Ordem de serviço" (se não aparecer, ligue "Uso ordem de serviço" em Configurações).',
      'Preencha o cliente, o equipamento e o defeito. Ao salvar, sai o comprovante de entrada.',
      'Mude o andamento conforme o serviço avança (Em análise, Aguardando aprovação, Em reparo, Pronto...).',
      'Quando o cliente aprovar, clique em "Fechar venda". Depois da entrega, marque "Entregue".'
    ]},
    {title: 'Fazer e restaurar um backup', view: 'settings', go: 'Ir para Configurações', steps: [
      'Abra Configurações e vá até "Backup e exportação".',
      '"Exportar backup" baixa um arquivo: guarde no Google Drive ou num pen drive.',
      'No Chrome ou Edge, ative o backup automático em uma pasta (um arquivo por dia).',
      'Para restaurar, use "Importar backup..." e escolha o arquivo. O sistema guarda uma cópia antes.'
    ]},
    {title: 'Usar no celular e no computador', view: 'settings', go: 'Ir para Configurações', steps: [
      'Abra o sistema pelo endereço publicado, no computador e no celular (não pelo arquivo).',
      'Em Configurações, no quadro "Sincronizar com o Google Drive", clique em "Conectar com o Google" e permita o acesso.',
      'No primeiro aparelho, os dados vão para o seu Drive. Quando o quadro ficar verde e disser "Sincronizado", está pronto.',
      'No outro aparelho, repita o passo 2: ele baixa os dados do Drive. Se os dois já tiverem dados, o sistema pergunta qual usar e não apaga nada.'
    ]}
  ];

  function open() {
    const list = TASKS.map((task, i) => `<section class="help-task"><h3>${i + 1}. ${esc(task.title)}</h3><ol>${task.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol><button type="button" class="secondary" data-action="help-go" data-view="${task.view}">${esc(task.go)}</button></section>`).join('');
    openModal(`<h2>Como usar</h2><p class="muted">Sete tarefas do dia a dia, passo a passo.</p><div class="help-list">${list}</div><p class="help-note"><b>Este sistema não substitui seu contador nem emite nota fiscal.</b> Confira com ele as regras de imposto, multa e juros.</p><div class="actions"><button type="button" class="primary" data-action="close-modal">Fechar</button></div>`);
    document.querySelector('#modal .modal-card').classList.add('wide');
  }

  registerAction('open-help', open);
  registerAction('help-go', element => { closeModal(); go(element.dataset.view); });

  App.help = {TASKS, open};
})();
