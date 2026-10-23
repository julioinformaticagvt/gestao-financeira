// "O que há de novo": lista de versões em linguagem simples, da mais nova para a mais antiga.
// A cada versão aprovada, acrescente uma entrada AQUI (e em version.js, na tabela do CLAUDE.md e na etiqueta do Git).
window.CHANGELOG = [
  {version: '0.19.0', name: 'Compras pelo pedido', date: '22/10/2026', items: [
    'Compras: botão "Colar pedido". Copie a página do pedido da loja e cole: o sistema monta a compra com os itens, as quantidades e o custo de cada peça (frete e desconto já divididos).',
    'Vários pedidos numa colagem só: cada um vira uma compra. Pedido já lançado não entra de novo; antigos, cancelados e não pagos vêm desmarcados.',
    'O sistema reconhece os produtos que você já tem e sugere um nome simples para os novos (ex.: "SSD 240GB 530MB/s"). Com o catálogo ligado, já preenche marca, categoria e especificações.',
    'Na ficha do produto: "Comprar de novo" abre a página da loja da última compra.',
    'Só itens, valores, data e número do pedido são lidos: nome, endereço e CPF que vierem junto são descartados.'
  ]},
  {version: '0.18.0', name: 'Novo visual', date: '20/10/2026', items: [
    'Visual novo "Bancada": letra nova (Bricolage Grotesque), botões grandes e redondos, cantos arredondados e o menu numa faixa só dele.',
    'Visão geral: os 4 números em blocos de cor (verde, azul, coral e âmbar), a rosca "Produtos e serviços" com vendido e lucro de cada tipo, avisos com ícones coloridos e próximos vencimentos em cartões.',
    'Contas a receber: cada parcela num cartão, com filtros Todas, Vencidas e A vencer.',
    'Limite do MEI também no topo de Financeiro > Relatórios, com marcas nos avisos (70% e 90%) e quanto falta.',
    'Recibo e extrato com duas versões: Resumido (este mês e o próximo em destaque, o resto numa linha) e Detalhado (todas as parcelas), com data e valor bem grandes.',
    'Segunda via de qualquer recibo, a qualquer momento: a tela do cliente lista todos os recibos dele.',
    'Ordenar listas: clique no título de qualquer coluna (Vendas, Clientes, Produtos, Compras...) para ordenar; clique de novo para inverter. No celular, Contas a receber e Orçamentos, use "Ordenar por".',
    'Configurações: botão "Apagar movimentações" para começar de verdade mantendo clientes e produtos (exige backup).',
    'Venda e orçamento: o custo de cada compra aparece separado (ex.: R$ 1.000 e R$ 1.100); vem o maior, e você escolhe outro com um toque. A peça sai da compra escolhida.',
  ]},
  {version: '0.17.0', name: 'Catálogo online', date: '20/10/2026', items: [
    'Catálogo online: o botão "Mandar para o catálogo" (em Produtos) atualiza o seu catálogo na internet com um clique. Preço, custo, quantidade e clientes nunca vão para o site.',
    'No cadastro do produto e do serviço: mostrar no catálogo, categoria, marca, descrição, especificações (com "Colar ficha técnica") e até 3 fotos, escolhidas de uma vez e na ordem que você quiser (a 1ª é a capa).',
    'Configurações → Catálogo online: repositório, categorias, chave do GitHub (fica só neste aparelho), "Testar conexão" e "Ver o arquivo para conferir".',
    'Os botões "Abrir no WhatsApp" ganharam o símbolo verde do WhatsApp.',
    'Estoque mínimo: o aviso para comprar vem quando o estoque fica abaixo do mínimo (mínimo 1 = avisa quando acabar).'
  ]},
  {version: '0.16.1', name: 'Conferência', date: '20/10/2026', items: [
    'Ao escolher um nome na lista de sugestões, a lista fecha (antes podia reabrir com nomes parecidos).',
    'No orçamento e na ordem de serviço, apertar Enter numa caixa não abre mais a pergunta de fechar venda.',
    'Sincronização: se o aparelho estiver sem espaço ao baixar dados do Drive, o sistema continua funcionando normalmente.'
  ]},
  {version: '0.16.0', name: 'Parcelas, recibo e revisão', date: '19/10/2026', items: [
    'Carnê: depois de escolher a data da 1ª parcela, dá para escolher a data de cada parcela seguinte (ou "usar este dia nas seguintes").',
    'Recibo: CNPJ ou CPF reconhecido sozinho, ícones coloridos do WhatsApp e da rede social (Instagram, Facebook, TikTok, YouTube, site) e sem campos entre colchetes.',
    'Nota fiscal: a caixa ficou mais clara ("Esta venda teve nota fiscal") e o número só aparece quando ela é marcada.',
    'Fechar venda de um orçamento usa a data de hoje; cancelar essa venda devolve o orçamento para "Aprovado".',
    'Revisão geral: nomes de produto com outras maiúsculas ou acentos são reconhecidos, Enter no orçamento não fecha venda sem perguntar, período "Personalizado" correto e outras correções.'
  ]},
  {version: '0.15.1', name: 'Segurança', date: '17/10/2026', items: [
    'Revisão de segurança: arquivos de backup ou do Drive com conteúdo suspeito agora são recusados.',
    'A logo e os códigos de vendas e orçamentos ficaram protegidos contra código escondido.',
    'Nada muda no uso do dia a dia.'
  ]},
  {version: '0.15.0', name: 'Valores em reais e conforto no celular', date: '16/10/2026', items: [
    'Os campos de valor mostram R$ 1.234,56 enquanto você digita (como aplicativo de banco: digite só os números).',
    'As sugestões de nomes (cliente, produto, fornecedor, categoria) abrem logo abaixo da caixa, também no celular.',
    'No celular, o recibo e o extrato aparecem inteiros na tela, sem cortar e sem rolar para o lado.',
    'Aviso no alto quando o aparelho ainda não está sincronizado com o Google (com o botão Sincronizar agora).'
  ]},
  {version: '0.14.1', name: 'Correções gerais', date: '16/10/2026', items: [
    'Celular: as caixas das taxas da maquininha (Configurações) não passam mais da borda do cartão, e a Visão geral não fica mais mais larga que a tela.',
    'Celular pequeno: o filtro de mês das Contas a pagar e os botões da exportação (CSV) cabem na tela.',
    'Computador: o menu de cima agora cabe em telas de 1280 px (Configurações vira só a engrenagem) e, se faltar espaço, passa para uma segunda linha em vez de ficar escondido.',
    'Tamanho geral da tela: as janelas não ficam mais maiores que a tela e o botão de fechar continua visível; o PDF sai no tamanho certo.'
  ]},
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
