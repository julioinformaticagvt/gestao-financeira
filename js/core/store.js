// Dados do sistema: onde ficam, como carregar e como salvar.
// Tudo fica no localStorage do navegador, numa única chave, como um texto JSON.
// Analogia: é uma gaveta com uma única pasta; "salvar" é trocar a pasta inteira pela versão nova.
//
// NOMES INTERNOS (não mudam, para não perder dados e backups já feitos): a chave 'julio-informatica-data', os arquivos
// 'julio-informatica-AAAA-MM-DD.json' e o campo app:'julio-informatica' do backup. O sistema agora é neutro (serve para qualquer
// negócio), mas esses nomes ficam como estão.
(() => {
  const App = (window.App = window.App || {});
  const {today, normalize} = App.format;

  // Modo demonstração (SPECS 23.2): outra chave de armazenamento, para nunca misturar com os dados reais.
  const DEMO_FLAG = 'julio-informatica-demo-active';
  let isDemo = false;
  try { isDemo = localStorage.getItem(DEMO_FLAG) === '1'; } catch { /* sem acesso: segue como dados reais */ }
  const REAL_KEY = 'julio-informatica-data', DEMO_KEY = 'julio-informatica-data-demo';
  const KEY = isDemo ? DEMO_KEY : REAL_KEY;
  const currentVersion = () => (window.APP_VERSION && window.APP_VERSION.number) || '';
  const NEWS_BASELINE = '0.8.0';   // sistema existente: a janela "O que há de novo" aparece uma vez depois desta atualização
  const SCHEMA = 2;   // versão do formato dos dados (2 = todo registro tem id interno e ligações por id)
  const defaults = {clients: [], products: [], sales: [], expenses: [], settings: {installmentInterest: 1.8, maxInstallments: 12}};

  // Carrega o que estava salvo (ou começa vazio) e completa o que faltar com os valores padrão.
  // Com proteção: se o texto salvo estiver corrompido, uma cópia dele fica guardada numa chave de "socorro" (nada se perde)
  // e o sistema abre vazio, avisando.
  let loadProblem = '', rawSaved = null;
  const readSaved = () => {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    rawSaved = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      throw new Error('formato inesperado');
    } catch {
      const rescue = `${KEY}-corrompido-${Date.now()}`;
      try { localStorage.setItem(rescue, raw); } catch { /* sem espaço: segue assim mesmo */ }
      loadProblem = rescue;
      return null;
    }
  };
  const savedData = readSaved();
  // "Sistema existente" = já havia dados guardados neste navegador (mantém tudo como está); senão, é um sistema novo (neutro, em branco).
  const isExistingSystem = rawSaved !== null;
  // Proteção: dados criados por uma versão MAIS NOVA deste sistema nunca são abertos nem gravados (nem a migração roda).
  const blocked = !!(savedData && Number(savedData.schemaVersion) > SCHEMA);
  const saved = savedData || JSON.parse(JSON.stringify(defaults));
  const data = {...defaults, ...saved, settings: {...defaults.settings, ...(saved.settings || {})}, expenses: saved.expenses || []};

  // ---------- IDs internos ----------
  // Todo registro tem um "uid" (id interno): único e nunca muda. O campo "id" que já existia em vendas, orçamentos, compras, contas
  // e lembretes é o CÓDIGO VISÍVEL (V0001...) e continua como está (aparece nos documentos). Clientes, produtos e fornecedores
  // ganham só o uid. Ligações: clientId / productId / supplierId guardam o uid; o nome fica ao lado, só para mostrar.
  let testCounter = 0;
  const randomPart = () => {
    if (window.__TEST_IDS) return String(++testCounter).padStart(6, '0');   // nos testes automáticos os ids saem sempre iguais
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    return Math.random().toString(36).slice(2, 14).padEnd(12, '0');
  };
  const newId = prefix => `${prefix}_${randomPart()}`;
  const LISTS = {clients: 'cli', products: 'prd', suppliers: 'sup', sales: 'sal', quotes: 'quo', receipts: 'rec', purchases: 'pur', payables: 'pbl', fixedExpenses: 'fix', reminders: 'rem', expenses: 'exp'};

  // Códigos visíveis em sequência que NUNCA são reaproveitados (contador guardado em data.counters).
  const CODES = {sale: {list: 'sales', prefix: 'V'}, quote: {list: 'quotes', prefix: 'O'}, purchase: {list: 'purchases', prefix: 'P'}, payable: {list: 'payables', prefix: 'C'}, fixed: {list: 'fixedExpenses', prefix: 'F'}, reminder: {list: 'reminders', prefix: 'L'}, os: {list: 'quotes', prefix: 'OS'}};
  const codeNumber = (code, prefix) => Number(String(code || '').slice(prefix.length)) || 0;
  function peekCode(kind) {
    const {list, prefix} = CODES[kind], counters = data.counters || {};
    // só olha os códigos do prefixo certo (O0001 de orçamento e OS0001 de ordem de serviço moram na mesma lista)
    const prefixOf = record => (/^[A-Z]+/.exec(String(record.id || '')) || [''])[0];
    const scan = (data[list] || []).filter(record => prefixOf(record) === prefix).reduce((max, record) => Math.max(max, codeNumber(record.id, prefix)), 0);
    return prefix + String(Math.max(counters[kind] || 0, scan) + 1).padStart(4, '0');
  }
  function nextCode(kind) {
    const code = peekCode(kind);
    data.counters = data.counters || {};
    data.counters[kind] = codeNumber(code, CODES[kind].prefix);
    return code;
  }
  function nextReceiptNumber() {
    data.counters = data.counters || {};
    const scan = (data.receipts || []).reduce((max, r) => Math.max(max, Number(r.number) || 0), 0);
    data.counters.receipt = Math.max(data.counters.receipt || 0, scan) + 1;
    return data.counters.receipt;
  }

  // Acha um cadastro pelo nome, sem diferenciar maiúsculas e acentos (igual à busca do sistema).
  const findByName = (list, name) => { const key = normalize(String(name || '').trim()); return key ? (data[list] || []).find(r => normalize(r.name) === key) : undefined; };
  const countByName = (list, name) => { const key = normalize(String(name || '').trim()); return key ? (data[list] || []).filter(r => normalize(r.name) === key).length : 0; };

  // Completa o que falta: uid em todo registro e as ligações por id (clientId, productId, supplierId).
  // Só LIGA ao que já existe; não cria cadastros (isso é feito na hora de salvar uma venda ou orçamento). stats conta os problemas.
  function ensureIds(stats) {
    for (const [list, prefix] of Object.entries(LISTS)) {
      (data[list] || []).forEach(record => { if (record && typeof record === 'object' && !record.uid) record.uid = newId(prefix); });
    }
    (data.sales || []).forEach(sale => (sale.payments || []).forEach(payment => { if (!payment.uid) payment.uid = newId('pay'); }));
    (data.purchases || []).forEach(purchase => (purchase.items || []).forEach(item => { if (!item.uid) item.uid = newId('lot'); }));

    // strict = confere também as ligações já existentes: se o nome do registro foi trocado por uma edição (ex.: outro cliente numa
    // venda editada) e já não bate com o cadastro ligado, refaz a ligação pelo nome. Recibos NÃO são strict: são documentos emitidos
    // e guardam o nome da época.
    const link = (record, nameKey, idKey, list, strict = true) => {
      if (!record[nameKey]) return;
      if (record[idKey]) {
        if (!strict) return;
        const target = (data[list] || []).find(r => r.uid === record[idKey]);
        if (target && normalize(String(target.name || '').trim()) === normalize(String(record[nameKey]).trim())) return;
        delete record[idKey];   // ligação velha: refaz abaixo pelo nome atual
      }
      const found = findByName(list, record[nameKey]);
      if (found) { record[idKey] = found.uid; if (stats && countByName(list, record[nameKey]) > 1) stats.duplicates++; }
      else if (stats) stats.unlinked++;
    };
    const linkItems = items => (items || []).forEach(item => link(item, 'name', 'productId', 'products'));
    (data.sales || []).forEach(sale => {
      link(sale, 'client', 'clientId', 'clients');
      linkItems(sale.items); linkItems(sale.stockOut); linkItems(sale.originLinks);
    });
    (data.quotes || []).forEach(quote => { link(quote, 'client', 'clientId', 'clients'); linkItems(quote.items); });
    (data.receipts || []).forEach(receipt => link(receipt, 'client', 'clientId', 'clients', false));
    (data.reminders || []).forEach(reminder => link(reminder, 'client', 'clientId', 'clients'));
    (data.purchases || []).forEach(purchase => { link(purchase, 'supplier', 'supplierId', 'suppliers'); linkItems(purchase.items); });
  }

  // Salvar com proteção:
  //  - se outra janela do sistema salvou depois de abrirmos esta, NÃO sobrescrevemos (senão apagaria o que a outra gravou);
  //  - se o navegador recusar (espaço cheio), avisamos em vez de falhar em silêncio;
  //  - se os dados passarem de ~4 MB (o limite do navegador é ~5 MB), avisamos uma vez para fazer backup.
  let stale = false, warnedSize = false;
  const SIZE_WARNING = 4000000;
  const hooks = {};   // main.js liga aqui as janelas de aviso: onStale(), onSaveError(erro), onSizeWarning(bytes)
  const afterSave = [];   // funções chamadas depois de cada gravação bem-sucedida (a sincronização usa para saber que houve mudança)
  const save = () => {
    if (blocked) return false;   // dados de versão mais nova: não grava nada
    if (stale) { if (hooks.onStale) hooks.onStale(); return false; }
    ensureIds();   // registro novo sempre sai com id e ligações
    const json = JSON.stringify(data);
    try { localStorage.setItem(KEY, json); }
    catch (error) { if (hooks.onSaveError) hooks.onSaveError(error); return false; }
    if (!warnedSize && json.length > SIZE_WARNING / 2) {
      // O navegador guarda ~5 MB no total: a cópia da migração (antes-da-v2) também ocupa espaço e entra na conta.
      let copy = 0;
      try { const key = data.migration && data.migration.backupKey; copy = key ? (localStorage.getItem(key) || '').length : 0; } catch { /* sem acesso */ }
      if (json.length + copy > SIZE_WARNING) { warnedSize = true; if (hooks.onSizeWarning) hooks.onSizeWarning(json.length + copy); }
    }
    afterSave.forEach(fn => { try { fn(); } catch { /* um ouvinte com problema nunca atrapalha o salvamento */ } });
    return true;
  };
  // Congela as gravações desta janela (usado logo antes de recarregar com dados novos, para nada gravar por cima).
  const freeze = () => { stale = true; };
  window.addEventListener('storage', event => { if (event.key === KEY && !stale) { stale = true; if (hooks.onStale) hooks.onStale(); } });

  // ---------- valores de partida ----------
  // Sistema NOVO: tudo em branco/zero (nada do dono original). Quem já tinha dados mantém o que tem.
  const zeroCredit = () => Object.fromEntries(Array.from({length: 12}, (_, i) => [i + 1, 0]));
  const defaultMachine = configured => ({
    plan: 'now',            // 'now' = recebo na hora | 'd30' = recebo em 30 dias (o nome dos planos é editável em planNames)
    planNames: {now: 'Recebo na hora', d30: 'Recebo a cada 30 dias'},
    configured,             // false = o dono ainda não preencheu as taxas da maquininha (aparece um aviso)
    updatedAt: today(),
    rates: {now: {pix: 0, debit: 0, credit: zeroCredit()}, d30: {pix: 0, debit: 0, credit: zeroCredit()}}   // taxas em %
  });
  const DEFAULT_EXTRA = {pix: 0, cash: 0, debit: 0, credit: 0, carne: 0};   // cobrança extra padrão (%) por forma: 0 = não cobrar nada a mais (digita-se na hora da venda)
  const OLD_DEFAULT_EXTRA = {pix: 5, cash: 5, debit: 2, credit: 2, carne: 5}; // padrões antigos (v0.1.0): são zerados, pois o dono pediu padrão 0
  const DEFAULT_COLLECTION = {fine: 2, interest: 1, grace: 0};                        // multa (%) única e juros (% ao mês) por atraso
  const OLD_RECEIPT_MESSAGE = 'Olá, {cliente}! Segue o recibo do seu atendimento na {negócio}.\n\nValor: {valor}\nPagamento: {forma}, em {data}\n\nQualquer dúvida é só me chamar. Obrigado pela confiança!';   // texto padrão antigo: é trocado pelo novo
  const DEFAULT_RECEIPT_MESSAGE = 'Olá, {cliente}! Segue o recibo do seu atendimento na {negócio}.\n\nValor: {valor}\nPagamento: {forma}, em {data}';   // o agradecimento (quitação, falta pagar) é acrescentado sozinho
  const blankBusiness = () => ({name: '', cnpj: '', phone: '', instagram: '', warranty: '', receiptMessage: DEFAULT_RECEIPT_MESSAGE, logo: null, logoTop: null, logoPdf: null});   // logo = principal; logoTop/logoPdf só se o dono quiser outra no topo ou nos documentos
  const OS_DEFAULTS = {
    enabled: false, statusesOff: [], warrantyDays: 90, approvalDays: 3, readyDays: 7,
    warrantyText: 'Cobre o serviço executado e as peças trocadas contra defeitos de mão de obra. Não cobre mau uso, quedas, líquidos, violação do lacre ou problemas novos não relacionados ao serviço.',
    entryTerms: 'Equipamentos não retirados em até 90 dias após o aviso de conclusão poderão ser descartados ou vendidos para cobrir custos. A responsabilidade por dados e arquivos é do cliente (faça cópia antes). Orçamento não aprovado: pode ser cobrada taxa de diagnóstico, se combinada.',
    msgReceived: 'Olá, {cliente}! Recebemos o seu {equipamento} (ordem de serviço {os}). Assim que tivermos o diagnóstico, avisamos.',
    msgQuote: 'Olá, {cliente}! Segue o orçamento da ordem de serviço {os} ({equipamento}): {valor}. Podemos prosseguir com o serviço?',
    msgReady: 'Olá, {cliente}! O seu {equipamento} (ordem de serviço {os}) está pronto para retirada. Valor: {valor}.'
  };
  const MEI_DEFAULTS ={meiLimit: 81000, meiOpenMonth: '', meiWarnPct: 70, meiAlertPct: 90, dasValue: '', dasDay: 20, backupWarnDays: 7, backupAlertDays: 30};

  // Ajusta dados de versões antigas do sistema para o formato atual (roda toda vez que o sistema abre).
  function migrate() {
    data.sales.forEach(sale => {
      sale.date = sale.date || today();
      sale.paid = Number(sale.paid) || 0;
      sale.total = Number(sale.total) || 0;
      sale.balance = Number.isFinite(Number(sale.balance)) ? Number(sale.balance) : sale.total - sale.paid;
      sale.installments = Number(sale.installments) || 1;
      sale.payments = sale.payments || [];
      if (sale.paid && !sale.payments.length) sale.payments = [{amount: sale.paid, date: sale.date, method: sale.method || 'PIX'}];
      sale.entry = sale.entry ?? (sale.installments > 1 ? sale.paid : 0);
    });
    // Configurações que existiram um dia mas não faziam nada (removidas).
    ['margin', 'lateInterest', 'lateFine'].forEach(key => delete data.settings[key]);

    data.settings = {...data.settings, dueDay: Number(data.settings.dueDay) || 12};
    if (data.settings.defaultMargin === undefined) data.settings.defaultMargin = 40;   // margem de ganho padrão (%) sobre o custo, para sugerir o preço
    data.quotes = data.quotes || [];
    data.sales.forEach(sale => { sale.monthlyInterest = Number(sale.monthlyInterest ?? data.settings.installmentInterest) || 0; });

    // Itens: todo produto/serviço tem um tipo, e toda venda/orçamento tem uma lista de itens.
    const normalizeType = item => { item.type = item.type === 'Serviço' ? 'Serviço' : 'Produto'; };
    data.products.forEach(normalizeType);
    data.sales.forEach(sale => {
      sale.items = sale.items || [{name: sale.product || '', type: sale.productType || 'Produto', amount: Number(sale.total) || 0}];
      sale.items.forEach(normalizeType);
      const totals = sale.items.reduce((all, item) => { all[item.type === 'Serviço' ? 'serviceTotal' : 'productTotal'] += Number(item.amount || 0); return all; }, {productTotal: 0, serviceTotal: 0});
      sale.productTotal = totals.productTotal;
      sale.serviceTotal = totals.serviceTotal;
    });
    data.quotes.forEach(quote => { quote.items = quote.items || [{name: quote.product || '', type: quote.productType || 'Produto', amount: Number(quote.total) || 0}]; });

    // Maquininha, juros extra, dados do negócio e recibos.
    // Sistema existente: nada que já está salvo é trocado. Sistema novo: tudo em branco/zero.
    data.settings.machine = data.settings.machine || defaultMachine(isExistingSystem);
    const machine = data.settings.machine;
    machine.planNames = {...defaultMachine(true).planNames, ...(machine.planNames || {})};
    if (machine.configured === undefined) machine.configured = isExistingSystem;
    const savedExtra = (data.settings.pricing || {}).extra || {};
    const wasOldDefault = Object.keys(OLD_DEFAULT_EXTRA).every(key => savedExtra[key] === OLD_DEFAULT_EXTRA[key]);   // ainda são os padrões antigos (ninguém mudou à mão)
    data.settings.pricing = {extra: {...DEFAULT_EXTRA, ...(wasOldDefault ? {} : savedExtra)}};
    const business = {...blankBusiness(), ...(data.settings.business || {})};
    if (business.receiptMessage === OLD_RECEIPT_MESSAGE) business.receiptMessage = DEFAULT_RECEIPT_MESSAGE;
    // SEGURANÇA (SPECS 34): uma logo só pode ser uma imagem embutida (data:image/...;base64). Qualquer outra coisa que venha de um backup ou do
    // Drive é descartada ao abrir, para nunca virar código dentro de uma tela.
    ['logo', 'logoTop', 'logoPdf'].forEach(key => { const l = business[key]; if (l && !(typeof l.src === 'string' && /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+\/=]+$/.test(l.src))) business[key] = null; });
    data.settings.business = business;
    data.receipts = data.receipts || [];

    // Regras de cobrança, contas a pagar e despesas fixas.
    data.settings.collection = {...DEFAULT_COLLECTION, ...(data.settings.collection || {})};
    data.settings.receiptMode = data.settings.receiptMode || 'one';   // 'one' = um recibo para tudo | 'each' = um recibo por parcela
    data.payables = data.payables || [];
    data.fixedExpenses = data.fixedExpenses || [];

    // Estoque, fornecedores, compras e lembretes de clientes.
    data.suppliers = data.suppliers || [];
    data.purchases = data.purchases || [];
    data.reminders = data.reminders || [];
    // Estoque mínimo padrão (Configurações). Produto sem mínimo próprio segue o padrão. Uma vez só: os produtos que estavam com
    // o 2 que o sistema colocou sozinho passam a seguir o padrão (os que o dono mudou para outro número ficam como estão).
    if (data.settings.defaultMinStock === undefined) data.settings.defaultMinStock = 2;
    if (!data.settings.minStockMigrated) {
      data.products.forEach(product => { if (product.minStock === 2) delete product.minStock; });
      data.settings.minStockMigrated = true;
    }

    // MEI (limite, DAS) e avisos de backup. "Sou MEI": ligado em sistema existente, desligado em sistema novo.
    for (const [key, value] of Object.entries(MEI_DEFAULTS)) if (data.settings[key] === undefined) data.settings[key] = value;
    if (data.settings.isMei === undefined) data.settings.isMei = isExistingSystem;
    if (data.settings.useDefaultLogo === undefined) data.settings.useDefaultLogo = isExistingSystem;   // a logo de arquivo (assets/logo.png) só para quem já a usava
    data.settings.dasCreated = data.settings.dasCreated || [];
    // Ordem de serviço (pacote 22): chave ligada em sistema existente, desligada em sistema novo; textos e prazos editáveis.
    data.settings.os = {...OS_DEFAULTS, enabled: isExistingSystem, ...(data.settings.os || {})};
    data.quotes.forEach(quote => { if (!quote.kind) quote.kind = 'quote'; });   // orçamentos antigos
    // Primeiro uso (pacote 23): sistema existente nunca vê o assistente; sistema novo vê até concluir ou pular.
    // Pacote 24: atividades do negócio (o sistema existente começa SEM atividades: nada é classificado sozinho), relatórios e modelos.
    if (data.settings.activities === undefined) data.settings.activities = isExistingSystem ? [] : [{id: 'act_geral', name: 'Geral', active: true}];
    if (data.settings.idleDays === undefined) data.settings.idleDays = 90;
    if (data.settings.minMargin === undefined) data.settings.minMargin = 0;
    if (data.settings.messages === undefined) data.settings.messages = {};
    if (data.settings.setupDone === undefined) data.settings.setupDone = isExistingSystem;
    if (data.settings.lastSeenVersion === undefined) data.settings.lastSeenVersion = isExistingSystem ? NEWS_BASELINE : currentVersion();

    // IDs internos e ligações por id (uma vez só; roda de novo sem mudar nada: só completa o que falta).
    data.counters = data.counters || {};
    if ((data.schemaVersion || 1) < SCHEMA) {
      let backupKey = '';
      if (rawSaved && (data.clients.length || data.products.length || data.sales.length || data.purchases.length)) {
        backupKey = `${KEY}-antes-da-v2`;   // cópia de segurança do que existia antes da mudança
        try { if (localStorage.getItem(backupKey) === null) localStorage.setItem(backupKey, rawSaved); } catch { backupKey = ''; }
      }
      const stats = {duplicates: 0, unlinked: 0};
      ensureIds(stats);
      data.schemaVersion = SCHEMA;
      data.migration = {version: SCHEMA, at: today(), duplicates: stats.duplicates, unlinked: stats.unlinked, backupKey, seen: false};
    } else ensureIds();
    save();
  }

  // SEGURANÇA (SPECS 34): dados vindos de FORA (backup importado, arquivo do Drive) não podem trazer código escondido em campos que o sistema
  // trata como "códigos" (ids, datas, estados). Esses campos só podem ter letras, números e . : - / espaço (estados e formas de pagamento
  // só não podem ter < > " ' `). Textos livres (nomes, observações) são sempre protegidos na hora de mostrar. Devolve o caminho do primeiro
  // campo suspeito ('' = tudo certo).
  const STRICT_KEYS = new Set(['id', 'uid', 'clientId', 'productId', 'supplierId', 'saleId', 'quoteId', 'osId', 'purchaseId', 'lotId', 'orderNo', 'payableId', 'fixedId', 'month', 'startMonth', 'date', 'dueDate', 'paidAt', 'createdAt', 'updatedAt', 'entryDate', 'deliveredAt', 'validUntil', 'firstDue', 'voidedAt', 'at', 'number', 'installment', 'key', 'view', 'kind', 'discountType', 'plan', 'modality', 'account', 'lastSeenVersion', 'backupKey', 'repo', 'branch', 'lastSentAt']);
  const LOOSE_KEYS = new Set(['status', 'method', 'type', 'label']);
  const NUMERIC_KEYS = new Set(['stock', 'qty', 'quantity', 'dueDay', 'amount', 'unit', 'unitCost', 'receipt', 'cost', 'price', 'total', 'paid', 'balance', 'entry', 'minStock', 'installments', 'discount', 'fee', 'charges', 'prevStock', 'prevCost', 'fine', 'interest']);
  const STRICT_TEXT = /^[\w.:\-\/ ]{0,60}$/, LOOSE_TEXT = /^[^<>"'`]*$/, NUMBER_TEXT = /^\s*-?[\d.,]*\s*$/, LINK_TEXT = /^https:\/\/[^\s<>"'`]{1,500}$/;
  // Campos de loja (Colar pedido, SPECS 45/52): apelidos e links que não estejam no padrão são descartados (não são código; antes,
  // um apelido com aspas ou um link com apóstrofo fazia o backup inteiro ser recusado). Devolve quantos itens saíram.
  const ALIAS_TEXT = /^[a-z0-9.:\-\/ ]{1,200}$/, LINK_OK = /^https:\/\/[^\s<>"'`]{1,500}$/;
  function cleanShopFields(root) {
    let removed = 0;
    for (const product of (root && Array.isArray(root.products) ? root.products : [])) {
      if (!product || typeof product !== 'object') continue;
      if (Array.isArray(product.aliases)) { const ok = product.aliases.filter(a => typeof a === 'string' && ALIAS_TEXT.test(a)); removed += product.aliases.length - ok.length; product.aliases = ok; }
      if (product.buyLink !== undefined && !(typeof product.buyLink === 'string' && LINK_OK.test(product.buyLink))) { delete product.buyLink; removed++; }
    }
    for (const purchase of (root && Array.isArray(root.purchases) ? root.purchases : [])) {
      for (const item of (purchase && Array.isArray(purchase.items) ? purchase.items : [])) {
        if (item && item.link !== undefined && !(typeof item.link === 'string' && LINK_OK.test(item.link))) { delete item.link; removed++; }
      }
    }
    return removed;
  }

  function suspicious(root) {
    const stack = [['dados', root]];
    while (stack.length) {
      const [path, node] = stack.pop();
      if (Array.isArray(node)) { node.forEach((item, i) => stack.push([`${path}[${i}]`, item])); continue; }
      if (!node || typeof node !== 'object') continue;
      for (const [key, value] of Object.entries(node)) {
        const here = `${path}.${key}`;
        if (typeof value === 'string') {
          if (STRICT_KEYS.has(key) && !STRICT_TEXT.test(value)) return here;
          if (LOOSE_KEYS.has(key) && !LOOSE_TEXT.test(value)) return here;
          if (NUMERIC_KEYS.has(key) && !NUMBER_TEXT.test(value)) return here;   // número escrito como texto: só dígitos, ponto e vírgula
          if ((key === 'buyLink' || key === 'link') && value && !LINK_TEXT.test(value)) return here;   // link de loja: só https, sem aspas nem < >
        } else if ((key === 'dueDates' || key === 'dasCreated' || key === 'extraDues' || key === 'photos' || key === 'ignoredOrders') && Array.isArray(value)) {
          if (value.some(item => typeof item !== 'string' || !STRICT_TEXT.test(item))) return here;
        } else if (key === 'aliases' && Array.isArray(value)) {
          if (value.some(item => typeof item !== 'string' || item.length > 200 || !LOOSE_TEXT.test(item))) return here;
        } else stack.push([here, value]);
      }
    }
    return '';
  }

  if (!blocked) { migrate(); if (cleanShopFields(data)) save(); }   // apelidos e links de loja fora do padrão já gravados (SPECS 52)
  App.store = {KEY, REAL_KEY, DEMO_KEY, DEMO_FLAG, isDemo, blocked, SCHEMA, data, save, hooks, afterSave, freeze, suspicious, cleanShopFields, newId, nextCode, peekCode, nextReceiptNumber, findByName, isExistingSystem, get loadProblem() { return loadProblem; }};
})();
