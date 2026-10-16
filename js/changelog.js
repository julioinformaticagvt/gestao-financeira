// "O que há de novo": lista de versões em linguagem simples, da mais nova para a mais antiga.
// A cada versão aprovada, acrescente uma entrada AQUI (e em version.js, na tabela do CLAUDE.md e na etiqueta do Git).
window.CHANGELOG = [
  {version: '0.14.0', name: 'Fluidez', date: '16/10/2026', items: [
    'Animações em 5 níveis (0 desligado a 4 muita animação), escolhidos por você em Configurações, no alto. O nível vale só para o aparelho.',
    'Títulos das telas maiores, em negrito e com ícone (o mesmo estilo da barra de baixo do celular). A logo do topo ficou maior.',
    'O menu de cima ganhou ícones e texto em negrito. A logo do topo ficou ainda maior.',
    'Novo: dá para mostrar só a logo, sem o nome escrito, e escolher o tamanho da logo do topo (Configurações > Dados do negócio).',
    'Barra de cima fixa ao rolar a tela. Dá para escolher o tamanho do texto e dos ícones da barra e o tamanho geral da tela (para quem enxerga mal).',
    'O estado da sincronização aparece na barra de cima também no computador.',
    'Reconectar ao Google: tocar em "Reconectar" reconecta na hora, e o sistema tenta reconectar sozinho ao abrir.'
  ]},
  {version: '0.13.3', name: 'Gráficos coloridos e faixa discreta', date: '16/10/2026', items: [
    'Visão geral: "Recebimentos por forma" agora tem uma cor para cada forma de pagamento (as mesmas dos Relatórios), e "Contas a receber por mês" ficou azul.',
    'Relatórios: "Recebido no mês" ficou verde.',
    'No celular, o aviso "Os dados ficam só neste aparelho" ganhou o botão "Entendi" (some de vez) e não aparece com a sincronização ligada nem num sistema vazio.'
  ]},
  {version: '0.13.2', name: 'Reconectar sem escolher a conta', date: '16/10/2026', items: [
    'Ao reconectar ao Google, o sistema lembra qual conta você usa (só neste aparelho) e o Google não pergunta a conta de novo.'
  ]},
  {version: '0.13.1', name: 'Passe do Google na aba', date: '16/10/2026', items: [
    'No celular, puxar a tela para atualizar não pede mais para reconectar ao Google: o login continua valendo (cerca de 1 hora) enquanto o aplicativo estiver aberto.'
  ]},
  {version: '0.13.0', name: 'Sincronização', date: '16/10/2026', items: [
    'Novo: sincronizar o computador e o celular pelo seu Google Drive (opcional, vem desligado). Configurações > Sincronizar com o Google Drive, com passo a passo.',
    'Os dados vão para uma pasta privada do aplicativo no SEU Drive. O autor do sistema não recebe nada.',
    'Se os dois aparelhos mudarem, o sistema pergunta qual usar e nunca apaga nada: guarda cópias de segurança.',
    'O rodapé mostra o estado: Sincronizado, Pendente, Reconectar ou Conflito.'
  ]},
  {version: '0.12.0', name: 'Publicação', date: '14/10/2026', items: [
    'O sistema pode ser instalado como aplicativo e funciona sem internet depois da primeira abertura.',
    'Termos de uso, Privacidade e Licença dentro do sistema (Configurações > Sobre).',
    'Avisa quando há uma versão nova, sem recarregar sozinho.'
  ]},
  {version: '0.11.0', name: 'Sistema no celular', date: '14/10/2026', items: [
    'O sistema agora funciona bem no celular: barra de baixo, botão "+", tabelas em cartões e janelas em tela cheia.',
    'No computador nada mudou.',
    'Os dados ficam só no aparelho: o computador e o celular têm dados separados.'
  ]},
  {version: '0.10.0', name: 'Relatórios e rotina', date: '14/10/2026', items: [
    'Receitas do mês (comércio e serviços, com e sem nota fiscal) e Resumo do ano, com PDF e CSV.',
    'Fechamento do dia e produtos parados; margem mínima opcional.',
    'Atividades do negócio, editáveis (nada é classificado sozinho).',
    'CSV para Excel com mais listas; "Abrir no WhatsApp" e modelos de mensagem editáveis.'
  ]},
  {version: '0.9.0', name: 'Primeiro uso e ajuda', date: '14/10/2026', items: [
    'Assistente de primeira abertura (para quem usa pela primeira vez): negócio, MEI, maquininha e backup.',
    'Modo demonstração com dados de exemplo, separado dos seus dados.',
    'Telas vazias explicam o que fazer, e o cartão "Comece por aqui".',
    'Guia "Como usar" (botão ? no topo) e janela "O que há de novo".',
    'Proteção: o sistema não abre nem altera dados criados por uma versão mais nova.',
    'Aviso de espaço do navegador e de navegador sem backup automático.'
  ]},
  {version: '0.8.0', name: 'Ordem de serviço', date: '14/10/2026', items: [
    'Ordem de serviço na mesma ficha do orçamento, com andamento e histórico.',
    'Comprovante de entrada, orçamento da OS e termo de garantia em PDF.',
    'Desconto em R$ ou em % e linha de desconto no recibo.',
    'Avisos de OS parada e garantias a vencer.'
  ]},
  {version: '0.7.0', name: 'Sistema neutro, MEI e ids internos', date: '10/10/2026', items: [
    'Sistema serve para qualquer negócio (nome, CNPJ ou CPF e maquininha editáveis).',
    'Chave "Sou MEI" com os medidores de Receita e Vendas e o lembrete do DAS.',
    'Financeiro com um quadro por mês; faixa de backup e "Verificar meu último backup".'
  ]},
  {version: '0.6.0', name: 'Compras e origem do produto', date: '09/10/2026', items: [
    'Estoque mínimo padrão, compras por mês e origem do produto no histórico do cliente.'
  ]},
  {version: '0.5.3', name: 'Correções da auditoria', date: '08/10/2026', items: [
    'Proteção dos dados (duas janelas, espaço cheio, dados corrompidos) e várias correções.'
  ]},
  {version: '0.5.0', name: 'Recibo e extrato', date: '08/10/2026', items: [
    'Recibo e Extrato em PDF, tela do cliente e pagamento de visita com divisão sugerida.'
  ]},
  {version: '0.2.0', name: 'Cobrar e controlar o caixa', date: '08/10/2026', items: [
    'Multa e juros por atraso, contas a pagar, despesas fixas, CSV para o contador e avisos.'
  ]},
  {version: '0.1.0', name: 'Vender e receber', date: '07/10/2026', items: [
    'Formas de pagamento, taxa da maquininha, lucro líquido, recibo em PDF e ficha do cliente.'
  ]}
];
