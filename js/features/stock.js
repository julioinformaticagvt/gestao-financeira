// Estoque: baixa automática ao vender produtos, devolução ao cancelar, lista de estoque baixo e ORIGEM dos produtos vendidos.
// Serviços não têm estoque.
//
// Origem (rastreio simples): cada item de uma compra funciona como um "lote" com quantidade. Ao vender, o sistema tira do lote
// mais antigo primeiro (PEPS) e grava na venda de qual compra saiu (stockOut[].lots = [{purchaseId, qty}]). Assim, no histórico
// do cliente dá para ver: "este produto veio do fornecedor X, comprado em dd/mm". O estoque e o custo médio NÃO mudam com isso.
(() => {
  const App = (window.App = window.App || {});
  const {data} = App.store;
  const {esc, dateLabel} = App.format;

  const DEFAULT_MIN = 2;   // valor de partida; o usuário muda em Configurações (settings.defaultMinStock)
  const defaultMin = () => { const raw = data.settings.defaultMinStock, n = Number(raw); return raw !== '' && raw != null && Number.isFinite(n) ? n : DEFAULT_MIN; };
  const productByName = name => App.store.findByName('products', name);   // "mouse usb" acha "Mouse USB" (sem diferenciar maiúsculas e acentos)
  const hasStock = product => !!product && product.type !== 'Serviço';
  // Estoque mínimo que vale para o produto: o dele, ou o padrão se ele não tiver um (campo em branco).
  const hasOwnMin = product => product.minStock !== undefined && product.minStock !== null && product.minStock !== '';
  // ---------- grupos de produtos que se substituem (SPECS 61) ----------
  // Ex.: "Suporte articulado preto" = o da marca A + o da marca B. O mínimo vale para o GRUPO (soma do estoque de todos), não para
  // cada produto: vendeu o da marca A, mas ainda tem o da marca B? Não está baixo. O nome do grupo fica no produto (product.group);
  // o mínimo fica em settings.stockGroups [{name, min}] (padrão 2). Analogia: a gaveta "suportes pretos", não a caixa de cada marca.
  const GROUP_MIN = 2;
  const groupKey = product => (hasStock(product) && typeof product.group === 'string' && product.group.trim() ? App.format.normalize(product.group.trim()) : '');
  const groupEntry = key => (data.settings.stockGroups || []).find(g => App.format.normalize(g.name) === key);
  const groupMin = key => { const entry = groupEntry(key), n = Number(entry && entry.min); return entry && entry.min !== '' && Number.isFinite(n) ? n : GROUP_MIN; };
  // Guarda o mínimo do grupo. Devolve o nome que vale: se o grupo já existe (mesmo escrito com outras maiúsculas ou sem acento),
  // fica o nome que ele já tinha; senão, o nome do jeito que foi digitado.
  function setGroupMin(name, min) {
    const key = App.format.normalize(name.trim()), entry = groupEntry(key), other = data.products.find(p => groupKey(p) === key);
    const keep = entry ? entry.name : other ? other.group.trim() : name.trim();
    const list = (data.settings.stockGroups = (data.settings.stockGroups || []).filter(g => App.format.normalize(g.name) !== key));
    list.push({name: keep, min: Math.max(0, Math.round(Number(min) || 0))});
    return keep;
  }
  // Todos os grupos que têm pelo menos 1 produto: nome, mínimo, total em estoque e produtos.
  function groups() {
    const map = new Map();
    data.products.forEach(product => {
      const key = groupKey(product);
      if (!key) return;
      if (!map.has(key)) { const entry = groupEntry(key); map.set(key, {key, name: entry ? entry.name : product.group.trim(), min: groupMin(key), total: 0, members: []}); }
      const group = map.get(key);
      group.total += Number(product.stock) || 0;
      group.members.push(product);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
  const groupOf = product => { const key = groupKey(product); return key ? groups().find(g => g.key === key) : null; };
  const lowGroups = () => groups().filter(g => g.total < g.min);

  const minOf = product => hasStock(product) ? (groupKey(product) ? groupMin(groupKey(product)) : hasOwnMin(product) ? Number(product.minStock) : defaultMin()) : null;

  // ---------- lotes (compras) ----------
  const livePurchases = () => data.purchases.filter(p => p.status !== 'Estornada').slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const liveSales = () => data.sales.filter(s => s.status !== 'Cancelada');

  // Quanto de cada compra/produto já foi usado por vendas (pela baixa automática ou por ligação manual).
  function usedByLot() {
    const used = new Map();
    const add = (name, lots) => (lots || []).forEach(l => { if (l.purchaseId) used.set(`${l.purchaseId}|${name}`, (used.get(`${l.purchaseId}|${name}`) || 0) + l.qty); });
    for (const sale of liveSales()) {
      (sale.stockOut || []).forEach(o => add(o.name, o.lots));
      (sale.originLinks || []).forEach(l => add(l.name, l.lots));
    }
    return used;
  }

  // Lotes de um produto com o que ainda resta em cada um (mais antigo primeiro).
  // Vendas feitas antes desta função (baixa sem origem) contam como saídas dos lotes mais antigos, só para a conta do saldo.
  function lotsFor(name, used = usedByLot()) {
    const lots = [];
    for (const purchase of livePurchases()) {
      const qty = purchase.items.filter(item => item.name === name).reduce((total, item) => total + item.qty, 0);   // (o mesmo produto pode aparecer em 2 linhas da compra)
      if (qty > 0) lots.push({purchaseId: purchase.id, remaining: qty - (used.get(`${purchase.id}|${name}`) || 0)});
    }
    let legacy = 0;
    for (const sale of liveSales()) (sale.stockOut || []).forEach(o => { if (o.name === name && !o.lots) legacy += o.qty; });
    for (const lot of lots) { const take = Math.min(Math.max(0, lot.remaining), legacy); lot.remaining -= take; legacy -= take; }
    return lots;
  }

  // Compras de um produto que ainda têm peças, com a data e o custo de cada uma (SPECS 44): é o que aparece para escolher na venda
  // e no orçamento ("Compra P0003 · 12/10 · R$ 1.000,00 (2 un.)") e na ficha do produto.
  function availableLots(name) {
    const product = productByName(name);
    if (!hasStock(product)) return [];
    return lotsFor(product.name).filter(lot => lot.remaining > 0).map(lot => {
      const purchase = data.purchases.find(p => p.id === lot.purchaseId);
      const lines = purchase.items.filter(item => item.name === product.name), qty = lines.reduce((t, i) => t + i.qty, 0);
      const unitCost = qty > 0 ? Math.round(lines.reduce((t, i) => t + i.qty * i.unitCost, 0) / qty * 100) / 100 : 0;   // a mesma compra pode ter o produto em 2 linhas
      return {purchaseId: lot.purchaseId, date: purchase.date, remaining: lot.remaining, unitCost};
    });
  }

  // Tira "qty" dos lotes: primeiro do lote escolhido na venda (preferred), depois dos mais antigos; o que não couber vira
  // "origem desconhecida" (estoque inicial).
  function allocate(lots, qty, preferred) {
    const out = [];
    let left = qty;
    const ordered = preferred ? [...lots.filter(l => l.purchaseId === preferred), ...lots.filter(l => l.purchaseId !== preferred)] : lots;
    for (const lot of ordered) {
      if (left <= 0) break;
      const take = Math.min(Math.max(0, lot.remaining), left);
      if (take > 0) { out.push({purchaseId: lot.purchaseId, qty: take}); lot.remaining -= take; left -= take; }
    }
    if (left > 0) out.push({purchaseId: null, qty: left});
    return out;
  }

  // ---------- baixa e devolução ----------
  // Dá baixa no estoque dos produtos de uma venda nova e guarda o que saiu e de qual compra (para devolver se a venda for cancelada).
  function consume(sale) {
    sale.stockOut = [];
    const used = usedByLot(), byName = {};
    for (const item of sale.items || []) {
      const product = productByName(item.name);
      if (!hasStock(product)) continue;
      const qty = item.qty || 1;
      product.stock = (Number(product.stock) || 0) - qty;
      byName[product.name] = byName[product.name] || lotsFor(product.name, used);
      sale.stockOut.push({name: product.name, qty, lots: allocate(byName[product.name], qty, item.lotId)});   // lotId = compra escolhida na venda
    }
  }

  // Devolve ao estoque o que a venda tinha tirado.
  function restore(sale) {
    for (const out of sale.stockOut || []) {
      const product = productByName(out.name);
      if (product) product.stock = (Number(product.stock) || 0) + out.qty;
    }
    sale.stockOut = [];
  }

  // Produtos com estoque ABAIXO do mínimo (inclui zerado e negativo). Mínimo 1 = "quero ter sempre pelo menos 1": com 1 está bom, com 0 avisa (SPECS 39.3).
  // Produto de um grupo: só está "baixo" quando o GRUPO inteiro está abaixo do mínimo do grupo (SPECS 61).
  const lowStock = () => {
    const lowKeys = new Set(lowGroups().map(g => g.key));
    return data.products.filter(product => hasStock(product) && (groupKey(product) ? lowKeys.has(groupKey(product)) : (Number(product.stock) || 0) < minOf(product)));
  };
  // Só os produtos SEM grupo que estão baixos (o aviso dos grupos é feito por grupo).
  const lowSingles = () => data.products.filter(product => hasStock(product) && !groupKey(product) && (Number(product.stock) || 0) < minOf(product));

  // ---------- origem (para mostrar) ----------
  const describeLot = lot => {
    const purchase = lot.purchaseId && data.purchases.find(p => p.id === lot.purchaseId);
    return purchase ? {purchaseId: purchase.id, supplier: purchase.supplier || '', date: purchase.date, qty: lot.qty} : {unknown: true, qty: lot.qty};
  };

  // Uma linha por produto (não serviço) da venda: de qual compra veio. lots = null quando não há registro.
  function originLines(sale) {
    const lines = [];
    if (sale.legacy) return lines;   // conta antiga: o item é só um texto, sem produto nem compra (SPECS 53)
    for (const item of sale.items || []) {
      const product = productByName(item.name);
      if (product ? !hasStock(product) : item.type === 'Serviço') continue;
      const entry = (sale.stockOut || []).find(o => o.name === item.name && o.lots), link = (sale.originLinks || []).find(l => l.name === item.name);
      const lots = entry ? entry.lots : link ? link.lots : null;
      lines.push({name: item.name, qty: item.qty || 1, lots: lots ? lots.map(describeLot) : null});
    }
    return lines;
  }

  // HTML pequeno de origem (com o botão "Ligar a uma compra" quando não há registro). withName = mostra o nome do produto.
  function originHtml(sale, withName = true) {
    const parts = originLines(sale).map(line => {
      const label = withName ? `${esc(line.name)}: ` : '';
      if (!line.lots) return `${label}<span class="muted">origem não registrada</span> <button type="button" class="secondary link-origin" data-action="link-origin" data-sale="${sale.id}" data-name="${esc(line.name)}">Ligar a uma compra</button>`;
      return label + line.lots.map(l => l.unknown ? 'estoque inicial (origem desconhecida)' : `${esc(l.supplier || 'fornecedor não informado')}, comprado em ${dateLabel(l.date)} <span class="muted">(${l.purchaseId}${line.lots.length > 1 ? `, ${l.qty} un.` : ''})</span>`).join('; ');
    });
    return parts.join('<br>');
  }

  // Para a tela de Compras: quais vendas usaram unidades de uma compra. [{sale, name, qty}]
  function usageOf(purchaseId) {
    const rows = [];
    for (const sale of liveSales()) {
      (sale.stockOut || []).forEach(o => (o.lots || []).forEach(l => { if (l.purchaseId === purchaseId) rows.push({sale, name: o.name, qty: l.qty}); }));
      (sale.originLinks || []).forEach(link => link.lots.forEach(l => { if (l.purchaseId === purchaseId) rows.push({sale, name: link.name, qty: l.qty}); }));
    }
    return rows;
  }
  const usedQty = (purchaseId, name) => usageOf(purchaseId).filter(r => r.name === name).reduce((total, r) => total + r.qty, 0);

  App.stock = {DEFAULT_MIN, GROUP_MIN, defaultMin, productByName, hasStock, availableLots, hasOwnMin, minOf, consume, restore, lowStock, lowSingles,
    groupKey, groupMin, setGroupMin, groups, groupOf, lowGroups, originLines, originHtml, usageOf, usedQty};
})();
