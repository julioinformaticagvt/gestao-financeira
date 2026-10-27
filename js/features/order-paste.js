// "Colar pedido" (SPECS 45): lê o texto de um pedido de loja online (copiado da página com Ctrl+A, Ctrl+C) e devolve os pedidos
// com itens, quantidades, valores, frete, desconto, data e número. Lê SÓ isso: nome, endereço, CPF, telefone e e-mail que vierem
// junto são ignorados, e o texto colado não é guardado em lugar nenhum.
// As leituras têm nomes neutros (formato 1 a 6) e reconhecem o pedido pelo jeito do texto, nunca pelo nome da loja.
// Também: achar o produto do cadastro (apelido ou nome parecido), sugerir um nome simples e preencher o catálogo pelo título.
// Analogia: é passar o marca-texto só nas linhas de produto e de valor da nota, e jogar o resto fora.
(() => {
  const App = (window.App = window.App || {});
  const {normalize, today} = App.format;
  const round2 = App.finance.round2;

  const OLD_DAYS = 15;   // pedido mais antigo que isso vem desmarcado

  // ---------- valores e datas ----------
  // "R$ 1.300,99" → 1300.99 ; "441 reais com 16 centavos" → 441.16 (lido pelo extenso quando existe). null = sem valor.
  function valueIn(text) {
    const s = String(text || '');
    const words = s.match(/(\d[\d.]*)\s*reais(?:\s*com\s*(\d{1,2})\s*centavos?)?/i);
    if (words) return round2(Number(words[1].replace(/\./g, '')) + (words[2] ? Number(words[2]) / 100 : 0));
    const cents = s.match(/^\D*?(\d{1,2})\s*centavos/i);
    if (cents) return Number(cents[1]) / 100;
    const price = s.match(/R\$\s*(\d[\d.]*(?:,\d{1,2})?)/);
    return price ? brl(price[1]) : null;
  }
  const brl = text => Number(String(text).replace(/\./g, '').replace(',', '.')) || 0;
  // Todos os valores em R$ de uma linha, na ordem ("R$49,90R$34,93" → [49.9, 34.93]).
  const pricesIn = text => [...String(text || '').matchAll(/R\$\s*(\d[\d.]*(?:,\d{1,2})?)/g)].map(m => brl(m[1]));

  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : '');
  function shiftDays(date, days) {
    const [y, m, d] = date.split('-').map(Number), when = new Date(y, m - 1, d + days);
    return iso(when.getFullYear(), when.getMonth() + 1, when.getDate());
  }
  // Datas de uma linha: 14/10/2026, "5 out, 2026", "14 de outubro" (sem ano: este ano, ou o anterior se ainda não chegou), Hoje, Ontem.
  function datesIn(line) {
    const out = [], now = today(), year = Number(now.slice(0, 4));
    for (const m of line.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) out.push(iso(Number(m[3]), Number(m[2]), Number(m[1])));
    for (const m of normalize(line).matchAll(/\b(\d{1,2})\s+(?:de\s+)?([a-z]{3})[a-z]*\.?,?(?:\s+(?:de\s+)?(\d{4}))?/g)) {
      const month = MONTHS.indexOf(m[2]) + 1;
      if (!month) continue;
      let date = iso(m[3] ? Number(m[3]) : year, month, Number(m[1]));
      if (!m[3] && date > now) date = iso(year - 1, month, Number(m[1]));
      out.push(date);
    }
    if (/^hoje\b/i.test(line)) out.push(now);
    if (/^ontem\b/i.test(line)) out.push(shiftDays(now, -1));
    return out.filter(Boolean);
  }
  // A data do pedido: a mais antiga que não seja no futuro (entrega prevista fica de fora).
  const earliest = dates => dates.filter(d => d <= today()).sort()[0] || '';

  // ---------- linhas ----------
  // Tira os links de "[texto](endereço)" e guarda o 1º endereço https (link do produto).
  function unlink(line) {
    let url = '';
    const text = line.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]*)\)/g, (all, label, href) => { if (!url && /^https:\/\//.test(href)) url = href; return label; });
    return {text: text.trim(), url};
  }
  const toLines = text => String(text || '').split(/\r?\n/).map(l => l.replace(/\t/g, ' ').trim()).filter(Boolean);
  // Código no fim do título: "... Preto - RM-SSD-240" ou "..., TGT-UAV-BL01". Só aceita o que parece código (com número ou maiúsculas).
  function splitCode(title, sep) {
    const at = title.lastIndexOf(sep);
    if (at < 0) return {title, code: ''};
    const code = title.slice(at + sep.length).trim();
    // só o que tem jeito de código de loja (letras, números e - . _ /), com número ou tudo em maiúsculas; "27"" é medida, não código (SPECS 52)
    const looks = /^[A-Za-z0-9][A-Za-z0-9\-_.\/ ]{2,39}$/.test(code) && (/\d/.test(code) || /^[A-Z0-9\-_.\/ ]+$/.test(code));
    return looks ? {title: title.slice(0, at).trim(), code} : {title, code: ''};
  }
  // Valor de um rótulo do resumo: na mesma linha ("Frete:R$ 33,64") ou na linha de baixo ("Frete" / "R$ 0,00"). "Grátis" = 0.
  function labelValue(L, label, all) {
    let total = null;
    for (let i = 0; i < L.length; i++) {
      const m = L[i].match(label);
      if (!m) continue;
      const rest = L[i].slice(m.index + m[0].length);
      let v = valueIn(rest);
      if (v === null && /gr[aá]tis/i.test(rest + ' ' + (L[i + 1] || '').slice(0, 8))) v = 0;
      if (v === null && /^[-−\s]*(R\$|\d+\s*(reais|centavos))/i.test(L[i + 1] || '')) v = valueIn(L[i + 1]);
      if (v === null) continue;
      if (!all) return v;
      total = round2((total || 0) + v);
    }
    return total;
  }
  const order = (format, fields) => ({format, number: '', date: '', status: '', locked: '', items: [], products: null, freight: 0, discount: 0, total: null, ...fields});
  const item = (title, url, qty, unit, sep) => {
    const {text, url: own} = unlink(title);
    const parts = sep ? splitCode(text, sep) : {title: text, code: ''};
    const link = [own, url].find(u => /^https:\/\/[^\s<>"'`]{1,500}$/.test(u || '')) || '';   // só https sem aspas (senão o backup seria recusado)
    const listing = (link.match(/-i\.(\d+\.\d+)/) || [])[1];
    return {title: parts.title, code: parts.code || (listing ? `i.${listing}` : ''), link, qty: Math.max(1, Number(qty) || 1), unit: round2(unit)};
  };
  const firstMatch = (L, re) => { for (const line of L) { const m = line.match(re); if (m) return m[1]; } return ''; };

  // ---------- formatos ----------
  const FORMATS = [
    // Formato 6: lista de vários pedidos ("Número de referência", "R$ 75,90  x2", "Total:R$ 179,05").
    {id: 'f6', test: text => /N[úu]mero de refer[êe]ncia/i.test(text), read(L) {
      const end = L.findIndex(l => /^Mais para amar/i.test(l));
      const lines = end >= 0 ? L.slice(0, end) : L;
      const starts = lines.map((l, i) => (/^Data:\s*\d{1,2}\s+\w+/i.test(l) ? i : -1)).filter(i => i > 0);
      return starts.map((start, k) => {
        const block = lines.slice(start - 1, k + 1 < starts.length ? starts[k + 1] - 1 : lines.length);
        const o = order('f6', {status: block[0], date: earliest(datesIn(block[1])), number: firstMatch(block, /N[úu]mero de refer[êe]ncia:?\s*(\d+)/i)});
        block.forEach((line, i) => {
          const m = line.match(/^R\$\s*(\d[\d.]*(?:,\d{1,2})?)\s+x(\d+)$/i);
          if (!m) return;
          const variant = block[i - 1] && block[i - 1].length <= 45 && i >= 2 ? block[i - 1] : '';
          const title = variant ? block[i - 2] : block[i - 1];
          if (!title || /^(Data:|N[úu]mero)/i.test(title)) return;
          const it = item(variant ? `${title} (${variant})` : title, '', m[2], brl(m[1]));
          o.items.push(it);
        });
        o.total = labelValue(block, /^Total:?/i);
        const text = normalize(block.join(' '));
        if (/cancelad/.test(normalize(block[0])) || /reembolso completo|reembolso.*conclu/.test(text)) o.locked = 'cancelado ou reembolsado';
        else if (/esperando pagamento|aguardando pagamento/.test(text)) o.locked = 'esperando pagamento';
        return o;
      });
    }},
    // Formato 1: "Quantidade: 2R$ 31,66" (preço de uma unidade) abaixo do nome; resumo "Total produto(s)".
    {id: 'f1', test: text => /Total produto\(s\)/i.test(text), read(L) {
      const o = order('f1', {number: firstMatch(L, /Pedido\s*#?\s*(\d{5,})/i), date: earliest(L.filter(l => /pedido/i.test(l)).flatMap(datesIn))});
      L.forEach((line, i) => {
        const m = line.match(/^Quantidade:\s*(\d+)\s*R\$\s*(\d[\d.]*,\d{2})/i);
        if (m && i > 0) o.items.push(item(L[i - 1], '', m[1], brl(m[2]), ' - '));
      });
      Object.assign(o, {products: labelValue(L, /^Total produto\(s\):?/i), freight: labelValue(L, /^Frete:?/i) || 0, discount: labelValue(L, /^Desconto:?/i) || 0, total: labelValue(L, /^Total do pedido:?/i)});
      return [o];
    }},
    // Formato 2: nome, "Quantidade: N", "Preço: R$ X"; resumo "Custo de Entrega", descontos sem sinal de menos.
    {id: 'f2', test: text => /Custo de Entrega|Data do Pedido/i.test(text), read(L) {
      const o = order('f2', {number: firstMatch(L, /Pedido\s*#\s*(\d+)/i), date: earliest(L.filter(l => /Data do Pedido/i.test(l)).flatMap(datesIn))});
      L.forEach((line, i) => {
        if (!/^Quantidade:\s*\d+$/i.test(line) || !i) return;
        const price = L.slice(i + 1, i + 3).map(l => l.match(/^Pre[çc]o:\s*R\$\s*(\d[\d.]*,\d{2})/i)).find(Boolean);
        if (price) o.items.push(item(L[i - 1], '', line.match(/\d+/)[0], brl(price[1]), ', '));
      });
      Object.assign(o, {products: labelValue(L, /^Subtotal/i), freight: labelValue(L, /^(Custo de Entrega|Frete)/i) || 0, discount: labelValue(L, /^Desconto/i, true) || 0, total: labelValue(L, /^Total do Pedido/i)});
      return [o];
    }},
    // Formato 5: título, "x1", preço de antes e preço pago colados ("R$49,90R$34,93"); "ID DO PEDIDO".
    {id: 'f5', test: text => /Subtotal dos Produtos|ID DO PEDIDO/i.test(text), read(L) {
      const o = order('f5', {number: firstMatch(L, /ID DO PEDIDO\.?\s*([A-Z0-9]{6,})/i), date: earliest(L.filter(l => /^(hoje|ontem)\b|\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}/i.test(l)).flatMap(datesIn))});
      L.forEach((raw, i) => {
        const line = unlink(raw);
        if (!/^x\d+$/i.test(line.text) || !i) return;
        let t = i - 1;
        if (/^varia[çc][ãa]o/i.test(unlink(L[t]).text) && t > 0) t--;
        const prices = pricesIn(unlink(L[i + 1] || '').text);
        if (prices.length < 2 && /^R\$/.test(unlink(L[i + 2] || '').text)) prices.push(...pricesIn(unlink(L[i + 2]).text));
        if (prices.length) o.items.push(item(L[t], line.url, line.text.slice(1), prices[prices.length - 1]));
      });
      Object.assign(o, {products: labelValue(L, /^Subtotal dos Produtos/i), freight: labelValue(L, /^Taxa de Frete/i) || 0, discount: labelValue(L, /^(Subtotal de Desconto|Desconto|Cupom|Voucher)/i, true) || 0, total: labelValue(L, /^Total do Pedido/i)});
      return [o];
    }},
    // Formato 4: título e "1 un. | Ver detalhe"; valores por extenso ("441 reais com 16 centavos"); número "# 2000...".
    {id: 'f4', test: text => /reais com|\d+\s*un\.\s*\|/i.test(text), read(L) {
      const o = order('f4', {number: firstMatch(L, /#\s*(\d{8,})/), date: earliest(L.filter(l => /\d{1,2}\s+de\s+[a-zç]+/i.test(l)).flatMap(datesIn))});
      L.forEach((line, i) => { const m = line.match(/^(\d+)\s*un\./i); if (m && i) o.items.push(item(L[i - 1], '', m[1], 0)); });
      Object.assign(o, {products: labelValue(L, /^(Produtos?)+$/i), freight: labelValue(L, /^(Frete)+$/i) || 0, discount: round2((labelValue(L, /^(Descontos?)+$/i, true) || 0) + (labelValue(L, /^(Cupons?)+$/i, true) || 0)), total: labelValue(L, /^(Total)+$/i)});
      // Os itens não trazem preço: o valor dos produtos é dividido pelas unidades.
      const units = o.items.reduce((s, i) => s + i.qty, 0);
      if (units && o.products) o.items.forEach(i => { i.unit = round2(o.products / units); });
      if (o.items.length > 1) o.note = 'Confira o custo de cada item: a loja mostra só o total.';
      return [o];
    }},
    // Formato 3: título e "R$ 447,05 - Quantidade: 1"; resumo com o valor na linha de baixo; "PEDIDO 9031621".
    {id: 'f3', test: text => /R\$\s*\d[\d.]*,\d{2}\s*-\s*Quantidade:\s*\d+/i.test(text), read(L) {
      const o = order('f3', {number: firstMatch(L, /PEDIDO\s*#?\s*(\d{5,})/), date: earliest(L.filter(l => /^Data:/i.test(l)).flatMap(datesIn))});
      L.forEach((line, i) => {
        const m = line.match(/^(.*?)R\$\s*(\d[\d.]*,\d{2})\s*-\s*Quantidade:\s*(\d+)/i);
        if (!m) return;
        const title = m[1].trim() || L[i - 1];
        if (title) o.items.push(item(title, '', m[3], brl(m[2]), ', '));
      });
      Object.assign(o, {products: labelValue(L, /^Subtotal$/i), freight: labelValue(L, /^Frete$/i) || 0, discount: labelValue(L, /^Desconto/i, true) || 0, total: labelValue(L, /^TOTAL$/)});
      return [o];
    }}
  ];

  // ---------- conferência e custo ----------
  // Confere os itens com o subtotal (se o preço lido for o da linha toda, divide pela quantidade), calcula o que foi pago e o
  // custo de cada unidade: frete e desconto divididos pelo valor de cada item (fator = pago ÷ valor dos itens).
  function settle(o) {
    o.warnings = o.note ? [o.note] : [];
    const value = () => round2(o.items.reduce((s, i) => s + i.qty * i.unit, 0));
    if (o.products !== null && o.items.length && Math.abs(value() - o.products) > 0.05) {
      const lineSum = round2(o.items.reduce((s, i) => s + i.unit, 0));
      if (Math.abs(lineSum - o.products) <= 0.05) o.items.forEach(i => { i.unit = round2(i.unit / i.qty); });
      else o.warnings.push('Os valores dos itens não bateram com o subtotal do pedido: confira o custo.');
    }
    const items = value();
    o.paid = round2(o.total !== null ? o.total : (o.products !== null ? o.products : items) + o.freight - o.discount);
    const factor = items > 0 ? o.paid / items : 1;
    o.items.forEach(i => { i.cost = round2(i.unit * factor); });
    return o;
  }

  // Lê o texto colado: lista de pedidos (vazia = não reconheci). O mesmo número de pedido aparece uma vez só.
  function read(text) {
    const L = toLines(text);
    const format = FORMATS.find(f => f.test(L.join('\n')));
    if (!format) return [];
    const seen = new Set();
    return format.read(L).filter(o => {
      const key = o.number || `${o.date}|${o.total}|${o.items.map(i => i.title).join('|')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(settle);
  }

  // Situação do pedido no sistema: já lançado, ignorado, travado, sem itens, antigo (mais de 15 dias) ou novo.
  function stateOf(o) {
    const data = App.store.data;
    const done = o.number && data.purchases.find(p => p.orderNo === o.number && p.status !== 'Estornada');
    if (done) return {key: 'done', text: `já registrado (${done.id})`, checked: false, locked: true};
    if (o.locked) return {key: 'locked', text: o.locked, checked: false, locked: true};
    if (!o.items.length) return {key: 'empty', text: 'sem itens: abra os detalhes do pedido e cole de lá', checked: false, locked: true};
    if (o.number && (data.ignoredOrders || []).includes(o.number)) return {key: 'ignored', text: 'ignorado', checked: false, locked: false};
    if (o.date && App.finance.daysBetween(o.date, today()) > OLD_DAYS) return {key: 'old', text: `mais de ${OLD_DAYS} dias`, checked: false, locked: false};
    return {key: 'new', text: '', checked: true, locked: false};
  }

  // ---------- produto do cadastro ----------
  // Palavras do nome para comparar: sem acento, "240 GB" vira "240gb", "1,8" vira "1.8".
  function words(name) {
    const s = normalize(name).replace(/(\d),(\d)/g, '$1.$2').replace(/(\d)\s+(gb|tb|mb|w|hz|mhz|ghz|pol|mm|cm|m|mah|rpm|ms|v)\b/g, '$1$2');
    return [...new Set(s.split(/[^a-z0-9.]+/).map(w => w.replace(/^\.+|\.+$/g, '')).filter(w => w.length > 1 || /\d/.test(w)))];
  }
  // Chaves de apelido de um item: código na loja, número do anúncio e o título (palavras).
  const aliasKeys = it => [it.code && `cod:${normalize(it.code).replace(/[^a-z0-9.\-\/]/g, '')}`, `tit:${words(it.title).join(' ')}`.slice(0, 200)].filter(k => k && k.length > 4 && /^[a-z0-9.:\-\/ ]+$/.test(k));

  // Procura o produto: (1) apelido = é ele; (2) nome parecido, com TODOS os números e medidas do produto no título
  // (240GB não é 480GB; DDR4 não é DDR5) = "parece ser", o dono confirma; (3) nada = produto novo.
  function match(it) {
    const products = App.store.data.products.filter(p => p.type !== 'Serviço');
    const keys = aliasKeys(it);
    const sure = products.find(p => (p.aliases || []).some(a => keys.includes(a)));
    if (sure) return {kind: 'sure', product: sure};
    const title = new Set(words(it.title));
    let best = null, bestScore = 0;
    for (const p of products) {
      const w = words(p.name);
      if (!w.length || !w.filter(x => /\d/.test(x)).every(x => title.has(x))) continue;
      const score = w.filter(x => title.has(x)).length / w.length;
      if (score > bestScore) { best = p; bestScore = score; }
    }
    return best && bestScore >= 0.67 ? {kind: 'maybe', product: best} : {kind: 'new'};
  }

  // ---------- nome simples e catálogo ----------
  const TYPES = [
    [/placa[\s-]*m[ãa]e/i, 'Placa-mãe', ['placa-mae', 'placas-mae', 'placa mae', 'placas mae']], [/placa de v[íi]deo/i, 'Placa de vídeo', ['video']],
    [/\bssd\b/i, 'SSD', ['ssd', 'armazenamento']], [/\bhd\b(?!mi)|disco r[íi]gido/i, 'HD', ['hd', 'armazenamento']],
    [/\bmem[óo]ria\b/i, 'Memória', ['memoria', 'ram']], [/\bfonte\b/i, 'Fonte', ['fonte']], [/\bprocessador\b/i, 'Processador', ['processador']],
    [/\bmonitor\b/i, 'Monitor', ['monitor']], [/\bgabinete\b/i, 'Gabinete', ['gabinete']], [/water ?cooler/i, 'Water cooler', ['cooler', 'refrigeracao']],
    [/\bcooler\b/i, 'Cooler', ['cooler', 'refrigeracao']], [/\bpasta t[ée]rmica/i, 'Pasta térmica', ['refrigeracao', 'acessorio']],
    [/\bcabo\b/i, 'Cabo', ['cabo', 'acessorio']], [/\badaptador\b/i, 'Adaptador', ['adaptador', 'cabo', 'acessorio']],
    [/\bheadset\b/i, 'Headset', ['headset', 'audio', 'periferico']], [/\bfones?\b/i, 'Fone', ['fone', 'audio', 'periferico']],
    [/\bteclado\b/i, 'Teclado', ['teclado', 'periferico']], [/\bmouse\b/i, 'Mouse', ['mouse', 'periferico']], [/\bcombo\b/i, 'Combo', ['periferico']],
    [/\bcontroladora\b/i, 'Controladora', ['acessorio', 'periferico']], [/\bcontroles?\b/i, 'Controle', ['controle', 'periferico']],
    [/\bmicrofone\b/i, 'Microfone', ['microfone', 'audio', 'periferico']], [/\bwebcam\b/i, 'Webcam', ['periferico']],
    [/\bnotebook\b/i, 'Notebook', ['notebook']], [/\bcarregador\b/i, 'Carregador', ['carregador', 'acessorio']], [/\bbateria\b/i, 'Bateria', ['bateria', 'acessorio']],
    [/\broteador\b/i, 'Roteador', ['rede']], [/\bpen ?drive\b/i, 'Pendrive', ['armazenamento']], [/\bsuporte\b/i, 'Suporte', ['acessorio']]
  ];
  // Marcas conhecidas (fabricantes; nunca nomes de loja). A marca não entra no nome simples, só no catálogo.
  const BRANDS = ['Rise Mode', 'MSI', 'Kingston', 'Asus', 'Gigabyte', 'ASRock', 'Corsair', 'HyperX', 'Logitech', 'Redragon', 'Husky', 'Crucial', 'Samsung', 'Western Digital', 'Seagate', 'AMD', 'Intel', 'XPG', 'Adata', 'Lexar', 'Netac', 'Mancer', 'SuperFrame', 'Galax', 'Zotac', 'PNY', 'Sapphire', 'PowerColor', 'XFX', 'Cooler Master', 'DeepCool', 'Lian Li', 'NZXT', 'Thermaltake', 'Gamdias', 'Fortrek', 'Multilaser', 'Baseus', 'Fifine', 'Binnune', 'TGT', 'Storm Tech', 'SanDisk', 'TP-Link', 'Intelbras', 'Mercusys', 'Aerocool', 'Bluecase', 'C3Tech', 'AOC', 'LG', 'Philips', 'Lenovo', 'Dell', 'Acer', 'Positivo', 'Duex', 'Hayom', 'Exbom', 'Knup', 'F3', 'MD9'];

  const typeOf = title => {
    let found = null;
    for (const [re, name, keys] of TYPES) { const m = title.match(re); if (m && (!found || m.index < found.at)) found = {at: m.index, name, keys}; }
    return found;
  };
  // Medidas que o título costuma trazer; cada uma vira um pedaço do nome e uma linha das especificações.
  const SPECS = [
    ['Capacidade', /\b(\d+(?:[.,]\d+)?)\s?(GB|TB)\b/i, m => `${m[1]}${m[2].toUpperCase()}`],
    ['Leitura', /Leitura:?\s*(\d[\d.]*)\s?MB\/s/i, m => `${m[1].replace('.', '')}MB/s`],
    ['Gravação', /Grava[çc][ãa]o:?\s*(\d[\d.]*)\s?MB\/s/i, m => `${m[1].replace('.', '')}MB/s`],
    ['Interface', /\b(SATA(?: III| 3)?|NVMe|PCIe\s?\d(?:\.\d)?|M\.2)\b/i, m => m[1]],
    ['Potência', /\b(\d{3,4})\s?W\b/, m => `${m[1]}W`],
    ['Chipset', /\b([ABHXZ]\d{3}M?)(?:-[A-Z]+)?\b/, m => m[1]],
    ['Memória', /\b(DDR\d)\b/i, m => m[1].toUpperCase()],
    ['Frequência', /\b(\d{3,4})\s?MHz\b/i, m => `${m[1]}MHz`],
    ['Soquete', /\b(AM[2345]|LGA\s?\d{3,4})\b/i, m => m[1].toUpperCase().replace(/\s/g, '')],
    ['Modelo', /\b(Ryzen\s?\d\s?\d{4}\w*|Core\s?i\d[\s-]?\d{4,5}\w*)/i, m => m[1]],
    ['Formato', /\b(m-?ATX|mini-?ITX|E-?ATX|ATX)\b/i, m => m[1]],
    ['Tamanho', /\b(\d{2}(?:[.,]\d+)?)\s?(?:pol\b|polegadas|")/i, m => `${m[1].replace(',', '.')}"`],
    ['Taxa de atualização', /\b(\d{2,3})\s?Hz\b/, m => `${m[1]}Hz`],
    ['Resolução', /\b(Full HD|Quad HD|QHD|4K|2K|HD)\b/i, m => m[1]],
    ['Painel', /\b(IPS|VA|TN)\b/, m => m[1]],
    ['Tempo de resposta', /\b(\d(?:[.,]\d)?)\s?ms\b/i, m => `${m[1]}ms`],
    ['Comprimento', /\b(\d+(?:[.,]\d+)?)\s?(?:metros?|m)\b/i, m => `${m[1].replace(/[.,]0$/, '').replace(',', '.')}m`],
    ['Bluetooth', /Bluetooth\s?(\d(?:\.\d)?)/i, m => m[1]]
  ];
  // O que entra no nome simples, por tipo (o resto vai só para as especificações).
  const NAME_SPECS = {SSD: ['Capacidade', 'Leitura'], HD: ['Capacidade'], Memória: ['Memória', 'Capacidade', 'Frequência'], Fonte: ['Potência'], 'Placa-mãe': ['Chipset', 'Memória'],
    'Placa de vídeo': ['Capacidade'], Processador: ['Modelo'], Monitor: ['Tamanho', 'Taxa de atualização'], Cabo: ['Comprimento'], Pendrive: ['Capacidade']};
  const CONNECTOR = /^(hdmi|displayport|dp|vga|dvi|usb|usb-c|tipo-c|type-c|micro|mini|rj45|sata|p2|p10|para|a|b|c|f[eê]mea|macho|otg|lightning|\d\.\d)$/i;

  function specsOf(title) {
    const out = [];
    for (const [name, re, fmt] of SPECS) { const m = title.match(re); if (m) out.push([name, fmt(m)]); }
    // pedaços "Nome: valor" do título (ex.: "Leitura: 530 MB/s") que ainda não entraram
    title.split(/,\s*/).forEach(part => { const m = part.match(/^([^:]{2,25}):\s*(.{1,40})$/); if (m && !out.some(s => normalize(s[0]) === normalize(m[1].trim()))) out.push([m[1].trim(), m[2].trim()]); });
    return out.slice(0, 10);
  }
  // "SSD Rise Mode Gamer Line, 240GB, 2.5", SATA III, Leitura: 530 MB/s..." → "SSD 240GB 530MB/s". Sem tipo conhecido: começo do título.
  function simpleName(title) {
    const clean = String(title || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const type = typeOf(clean);
    if (!type) return clean.split(/,\s*/)[0].split(/\s+/).slice(0, 5).join(' ').slice(0, 60);
    const specs = specsOf(clean), pick = name => (specs.find(s => s[0] === name) || [])[1];
    const parts = [type.name];
    const after = clean.slice(type.at).split(/,\s*/)[0].split(/\s+/).slice(type.name.split(' ').length);
    if (type.name === 'Cabo' || type.name === 'Adaptador') parts.push(...after.filter(w => CONNECTOR.test(w)).map(w => (/^(hdmi|vga|dvi|usb|otg|dp|rj45|sata)$/i.test(w) ? w.toUpperCase() : w)));
    (NAME_SPECS[type.name] || ['Capacidade', 'Potência']).map(pick).filter(v => v && !parts.includes(v)).forEach(v => parts.push(v));
    // tipo sem medida no título (ex.: headset): as palavras seguintes, sem a marca
    if (parts.length === 1) { const brand = normalize(brandOf(clean)); parts.push(...after.filter(w => !brand.split(' ').includes(normalize(w))).slice(0, 3)); }
    return parts.join(' ').replace(/\s+/g, ' ').slice(0, 60);
  }
  function brandOf(title) {
    let found = null;
    for (const brand of BRANDS) {
      const m = String(title).match(new RegExp(`(^|[^\\w])${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w]|$)`, 'i'));
      if (m && (!found || m.index < found.at)) found = {at: m.index, brand};
    }
    return found ? found.brand : '';
  }
  // Categoria do catálogo: a 1ª das categorias do dono que tem a palavra do tipo (SSD → "SSD e HD").
  function categoryOf(title) {
    const type = typeOf(title), list = App.catalog ? (App.catalog.cfg().categories || []) : [];
    if (!type) return '';
    return list.find(c => type.keys.some(k => normalize(c).includes(k))) || '';
  }
  // Campos do catálogo pré-preenchidos para um produto novo (o dono confere e põe as fotos depois).
  const catalogOf = title => ({show: true, category: categoryOf(title), brand: brandOf(title), description: String(title).slice(0, 200), specs: specsOf(title), featured: false, isNew: false, condition: '', photoSeq: 0, photos: []});

  App.orderPaste = {read, stateOf, match, aliasKeys, words, simpleName, specsOf, brandOf, categoryOf, catalogOf, valueIn, datesIn, OLD_DAYS};
})();
