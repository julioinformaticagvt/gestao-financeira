// Tela "Compras": entrada de peças no estoque. Cada compra soma ao estoque, atualiza o custo médio
// e gera uma conta a pagar (ou já paga). Dá para ver por mês, ver quais vendas usaram cada compra e estornar
// (desde que nenhuma peça da compra tenha sido vendida e o estoque ainda cubra a compra).
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today, shiftMonth, monthLabel, sum} = App.format;
  const {data, save} = App.store;
  const {openModal, closeModal, byId, go} = App.ui;

  const MAX_ITEMS = 10;
  const round2 = App.finance.round2;
  const nextId = () => App.store.nextCode('purchase');
  const num = value => { const n = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const stockProducts = () => data.products.filter(p => p.type !== 'Serviço');

  let month = today().slice(0, 7);   // mês mostrado ('todos' = todas as compras)

  // ---------- lista (por mês) ----------
  function render() {
    const months = [...new Set([today().slice(0, 7), month, ...data.purchases.map(p => p.date.slice(0, 7))].filter(m => m && m !== 'todos'))].sort().reverse();
    const shown = data.purchases.filter(p => month === 'todos' || p.date.slice(0, 7) === month).slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const total = sum(shown.filter(p => p.status !== 'Estornada'), p => p.total);
    const rows = shown.map(p => {
      const canceled = p.status === 'Estornada';
      const bill = data.payables.find(b => b.id === p.payableId);
      const state = canceled ? '<span class="badge neutral">Estornada</span>' : `<span class="badge ${bill && bill.status === 'paga' ? '' : 'warn'}">${bill && bill.status === 'paga' ? 'Paga' : 'A pagar'}</span>`;
      const sold = p.items.reduce((all, i) => all + App.stock.usedQty(p.id, i.name), 0), bought = sum(p.items, i => i.qty);
      const usage = canceled ? '' : `${sold} de ${bought} ${sold ? `<button class="secondary" data-action="purchase-usage" data-id="${p.id}">Ver</button>` : ''}`;
      return `<tr class="${canceled ? 'voided' : ''}"><td>${p.id}</td><td>${dateLabel(p.date)}</td><td>${esc(p.supplier || '-')}</td><td>${p.items.map(i => `${i.qty}× ${esc(i.name)}`).join(', ')}</td><td>${money(p.total)}</td><td>${state}</td><td>${usage}</td><td>${canceled ? '' : `<button class="secondary" data-action="purchase-cancel" data-id="${p.id}">Estornar</button>`}</td></tr>`;
    }).join('');
    const nav = `<div class="month-nav"><button class="secondary" data-action="purchase-month-step" data-step="-1" ${month === 'todos' ? 'disabled' : ''} title="Mês anterior">‹</button><select id="purchase-month"><option value="todos" ${month === 'todos' ? 'selected' : ''}>Todos os meses</option>${months.map(m => `<option value="${m}" ${m === month ? 'selected' : ''}>${esc(monthLabel(m))}</option>`).join('')}</select><button class="secondary" data-action="purchase-month-step" data-step="1" ${month === 'todos' ? 'disabled' : ''} title="Próximo mês">›</button><span class="muted">${month === 'todos' ? 'Total geral' : 'Total do mês'}: <b>${money(total)}</b> (sem as estornadas)</span></div>`;
    byId('app').innerHTML = `<section class="panel"><div class="panel-head"><h2>Compras de peças</h2><div class="head-buttons"><button class="secondary" data-action="order-paste">Colar pedido</button><button class="primary" data-action="new-purchase">+ Nova compra</button></div></div>${nav}${shown.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Data</th><th>Fornecedor</th><th>Itens</th><th>Total</th><th>Pagamento</th><th>Vendidas</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `${data.purchases.length ? '<div class="empty">Nenhuma compra neste mês.</div>' : App.firstRun.emptyState({title: 'Você ainda não registrou compras de peças.', hint: 'Registre as peças que você compra.', action: 'new-purchase', label: '+ Nova compra'})}`}</section>`;
    byId('purchase-month').onchange = event => { month = event.target.value; render(); };
  }

  // ---------- gravar uma compra ----------
  // Usado pelo formulário e pelo "Colar pedido": soma ao estoque, atualiza o custo médio, cria a conta (paga ou a pagar)
  // e o fornecedor novo. items: [{name, qty, unitCost, link?}]. extra: dados do pedido colado (número, frete, desconto).
  // total: o valor pago de verdade (pedido colado), quando difere da soma só por arredondamento de centavos.
  function registerPurchase({date, supplier, later, dueDate, method, items, extra, total}) {
    const purchase = {id: nextId(), date, supplier: String(supplier || '').trim(), items: [], total: 0, method: later ? '' : method, ...(extra || {})};
    for (const item of items) {
      // produto que ainda não existe é criado na hora (sem estoque e sem custo, para a média sair certa)
      let product = App.stock.productByName(item.name);
      if (!product) { product = {name: item.name, sku: '', type: 'Produto', stock: 0, cost: 0, price: 0}; data.products.push(product); }
      const stock = Number(product.stock) || 0, prevCost = Number(product.cost) || 0;
      const base = Math.max(0, stock);   // estoque negativo não pesa na média
      const avg = base + item.qty > 0 ? round2((base * prevCost + item.qty * item.unitCost) / (base + item.qty)) : item.unitCost;
      purchase.items.push({...item, name: product.name, prevStock: stock, prevCost});   // nome do cadastro
      product.stock = stock + item.qty;
      product.cost = avg;
      purchase.total = round2(purchase.total + item.qty * item.unitCost);
    }
    if (total !== undefined && Math.abs(total - purchase.total) <= 0.05) purchase.total = round2(total);
    const bill = {id: App.bills.nextId(), description: `Compra ${purchase.id}${purchase.supplier ? ' - ' + purchase.supplier : ''}`, category: 'Fornecedor', amount: purchase.total, dueDate: later ? dueDate : date, status: later ? 'pendente' : 'paga', origin: 'compra', purchaseId: purchase.id};
    if (!later) { bill.paidAt = date; bill.method = purchase.method; }
    purchase.payableId = bill.id;
    data.payables.push(bill);
    data.purchases.push(purchase);
    if (purchase.supplier && !data.suppliers.some(s => s.name === purchase.supplier)) data.suppliers.push({name: purchase.supplier, phone: '', notes: ''});   // fornecedor novo já fica cadastrado
    return purchase;
  }

  // ---------- nova compra ----------
  const itemBlock = n => `<div class="item-block" data-pitem="${n}" ${n > 1 ? 'hidden' : ''}><div class="field item-name"><label>${n === 1 ? 'Produto *' : `Item ${n}`}</label><input name="name${n}" list="purchase-products" autocomplete="off" placeholder="Buscar ou digitar um produto..." ${n === 1 ? 'required' : ''}></div><div class="field"><label>Quantidade</label><input name="qty${n}" type="number" min="1" step="1" value="1"></div><div class="field" style="grid-column: 2 / 4"><label>Custo unitário (R$) <small>cada · eu pago</small></label><input name="cost${n}" type="number" min="0" step="0.01" ${n === 1 ? 'required' : ''}></div>${n > 1 ? `<button type="button" class="secondary item-remove" data-remove-pitem="${n}">Remover item ${n}</button>` : ''}</div>`;

  function purchaseForm() {
    const supplierOptions = data.suppliers.map(s => `<option value="${esc(s.name)}">`).join('');
    const productOptions = stockProducts().map(p => `<option value="${esc(p.name)}">`).join('');
    openModal(`<h2>Nova compra</h2><form id="purchase-form" class="form-grid"><div class="field full"><button type="button" class="secondary" data-action="order-paste">Colar pedido da loja</button></div><div class="field full"><label>Fornecedor</label><input name="supplier" list="purchase-suppliers" placeholder="Opcional" autocomplete="off"><datalist id="purchase-suppliers">${supplierOptions}</datalist></div><datalist id="purchase-products">${productOptions}</datalist>${Array.from({length: MAX_ITEMS}, (_, i) => itemBlock(i + 1)).join('')}<div class="field full"><button type="button" class="secondary" id="purchase-add">+ Adicionar outro item</button></div><div class="field"><label>Data da compra *</label><input name="date" type="date" value="${today()}" max="${today()}" required></div><div class="field"><label>Pagamento</label><select name="when"><option value="now">Já paguei</option><option value="later">Pagar depois</option></select></div><div class="field" data-later hidden><label>Vence em</label><input name="dueDate" type="date" value="${today()}"></div><div class="field" data-now><label>Forma de pagamento <small>inclui qual conta (PJ ou PF)</small></label><select name="method">${App.finance.PAY_METHODS.map(m => `<option>${m}</option>`).join('')}</select></div><p class="muted field full">Produto novo é cadastrado na hora. Custo = média das compras.</p><p class="negative field full" id="purchase-error" hidden></p><div class="actions field full"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary">Registrar compra</button></div></form>`);
    const form = byId('purchase-form');
    App.ui.groupFields(form, [{kind: 'client', title: 'Fornecedor', items: ['supplier']}, {kind: 'product', title: 'Produtos comprados', items: ['.item-block', '#purchase-add']}, {kind: 'pay', title: 'Pagamento e datas', items: ['date', 'when', 'dueDate', 'method']}]);

    // itens sob demanda (só o primeiro aparece; "+ Adicionar outro item" mostra o próximo)
    const blocks = () => [...form.querySelectorAll('.item-block')];
    const showItems = count => {
      blocks().forEach((block, i) => { block.hidden = i >= count; });
      form.querySelectorAll('[data-remove-pitem]').forEach(button => { button.hidden = Number(button.dataset.removePitem) !== count; });
      byId('purchase-add').hidden = count >= MAX_ITEMS;
    };
    showItems(1);
    form.addEventListener('click', event => {
      if (event.target.closest('#purchase-add')) showItems(Math.min(MAX_ITEMS, blocks().filter(b => !b.hidden).length + 1));
      const remove = event.target.closest('[data-remove-pitem]');
      if (remove) {
        const n = Number(remove.dataset.removePitem);
        form.elements[`name${n}`].value = ''; form.elements[`qty${n}`].value = 1; form.elements[`cost${n}`].value = '';
        showItems(n - 1);
      }
    });
    form.elements.when.onchange = () => { form.querySelector('[data-later]').hidden = form.elements.when.value !== 'later'; form.querySelector('[data-now]').hidden = form.elements.when.value === 'later'; };

    form.onsubmit = event => {
      event.preventDefault();
      const f = new FormData(form), fail = message => { const box = byId('purchase-error'); box.textContent = message; box.hidden = false; };
      const items = [];
      blocks().filter(block => !block.hidden).forEach(block => {
        const n = block.dataset.pitem, name = (f.get(`name${n}`) || '').trim();
        if (name) items.push({name, qty: Math.max(1, Math.round(num(f.get(`qty${n}`)) || 1)), unitCost: round2(num(f.get(`cost${n}`)))});
      });
      if (!items.length) return fail('Informe pelo menos um produto.');
      const service = items.find(item => { const product = App.stock.productByName(item.name); return product && !App.stock.hasStock(product); });
      if (service) return fail(`"${service.name}" é um serviço e não tem estoque.`);
      const date = f.get('date'), later = f.get('when') === 'later';
      if (date > today()) return fail('A data da compra não pode ser no futuro.');
      registerPurchase({date, supplier: f.get('supplier'), later, dueDate: f.get('dueDate'), method: f.get('method'), items});
      month = date.slice(0, 7);   // mostra o mês da compra que acabou de ser registrada
      save();
      closeModal();
      go('purchases');
    };
  }

  // ---------- colar pedido da loja (SPECS 45) ----------
  // 1º passo: colar o texto. Depois de lido, o texto é jogado fora: só ficam itens, valores, data e número de cada pedido.
  function pasteForm(message) {
    openModal(`<h2>Colar pedido</h2><p class="muted">Na página do pedido da loja, selecione tudo e copie. Aqui, cole. Só itens, valores, data e número são lidos.</p><form id="order-paste-form" class="form-grid"><div class="field full"><textarea name="text" rows="8" placeholder="Cole aqui o pedido" autocomplete="off" spellcheck="false"></textarea></div><p class="negative field full" id="order-paste-error" ${message ? '' : 'hidden'}>${esc(message || '')}</p><div class="actions field full"><button type="button" class="secondary" data-action="new-purchase">Lançar à mão</button><button class="primary">Ler pedido</button></div></form>`);
    const form = byId('order-paste-form');
    form.onsubmit = event => {
      event.preventDefault();
      const orders = App.orderPaste.read(form.elements.text.value);
      form.elements.text.value = '';
      if (!orders.length) return pasteForm('Não achei um pedido neste texto. Copie a página inteira do pedido ou lance à mão.');
      review(orders.map(order => ({order, ...App.orderPaste.stateOf(order)})));
    };
  }

  // 2º passo: conferir. Cada pedido marcado vira uma compra; cada item diz se o produto já existe, parece ser um do cadastro
  // (o dono confirma) ou é novo (com nome simples sugerido e, se quiser, "Pôr no catálogo").
  const shortTitle = title => (title.length > 90 ? `${title.slice(0, 88)}…` : title);
  function review(list) {
    const products = stockProducts().slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const keyOf = p => p.uid || p.name;
    const byKey = key => products.find(p => keyOf(p) === key);
    const catalogOn = App.catalog && App.catalog.enabled();
    const format = (list[0] && list[0].order.format) || '';
    const lastSupplier = (data.settings.orderSuppliers || {})[format] || '';
    const lastMethod = data.settings.orderMethod || App.finance.PAY_METHODS[0];
    list.forEach(entry => entry.order.items.forEach(it => {
      if (it.choice !== undefined) return;
      const found = App.orderPaste.match(it);
      it.found = found;
      it.choice = found.kind === 'sure' ? keyOf(found.product) : found.kind === 'new' ? 'new' : '';
      it.newName = App.orderPaste.simpleName(it.title);
    }));
    const status = it => {
      const product = byKey(it.choice);
      if (product) return `<span class="oi-ok">✔ ${it.found.kind === 'sure' && it.found.product === product ? 'já cadastrado' : 'no cadastro'}: ${esc(product.name)}</span>`;
      if (it.choice === 'new') return '<span class="oi-new">+ produto novo</span>';
      return `<span class="oi-ask">? parece ser: ${esc(it.found.product.name)}. Confirme</span>`;
    };
    const catalogBox = it => {
      if (it.choice === 'new') return '<small class="muted oi-cat">vai para "A completar"</small>';   // todo produto novo entra no catálogo, a completar (SPECS 48)
      if (!catalogOn) return '';
      const product = byKey(it.choice);
      if (product && App.catalog.isShown(product)) return '<small class="muted oi-cat">já no catálogo</small>';
      return `<label class="inline-check oi-cat" ${it.choice ? '' : 'hidden'}><input type="checkbox" data-oi-cat ${it.catalog ? 'checked' : ''}> Pôr no catálogo</label>`;
    };
    const itemHtml = (it, j) => {
      const candidate = it.found.kind === 'maybe' ? it.found.product : null;
      const options = `${it.choice === '' ? '<option value="">Escolha o produto…</option>' : ''}<option value="new" ${it.choice === 'new' ? 'selected' : ''}>+ Produto novo</option>${candidate ? `<option value="${esc(keyOf(candidate))}">${esc(candidate.name)} (parece ser)</option>` : ''}${products.filter(p => p !== candidate).map(p => `<option value="${esc(keyOf(p))}" ${it.choice === keyOf(p) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}`;
      return `<div class="order-item" data-item="${j}"><div class="oi-title"><b>${it.qty}×</b> ${esc(shortTitle(it.title))}</div><div class="oi-fields"><select data-oi-product aria-label="Produto no cadastro">${options}</select><input data-oi-name value="${esc(it.newName)}" placeholder="Nome do produto novo" aria-label="Nome do produto novo" ${it.choice === 'new' ? '' : 'hidden'}><label class="oi-cost">Custo cada <input type="number" step="0.01" min="0" inputmode="decimal" data-oi-cost value="${it.cost}"></label>${catalogBox(it)}</div><small class="oi-status">${status(it)}</small></div>`;
    };
    const orderHtml = (entry, k) => {
      const o = entry.order, tone = entry.key === 'new' ? '' : entry.locked ? 'neutral' : 'warn';
      return `<section class="order-card${entry.locked ? ' is-locked' : ''}" data-order="${k}"><div class="order-head"><label class="inline-check order-pick"><input type="checkbox" data-order-check ${entry.checked ? 'checked' : ''} ${entry.locked ? 'disabled' : ''}> <b>Pedido ${esc(o.number || 'sem número')}</b></label><small>${o.items.length} ${o.items.length === 1 ? 'item' : 'itens'} · pago ${money(o.paid)}</small>${entry.text ? `<span class="badge ${tone}">${esc(entry.text)}</span>` : ''}${entry.locked ? '' : `<label class="order-date">Data <input type="date" data-order-date value="${esc(o.date || today())}" max="${today()}"></label>`}</div>${entry.locked ? '' : `${o.warnings.map(w => `<p class="oi-ask order-warn">${esc(w)}</p>`).join('')}<div class="order-items">${o.items.map(itemHtml).join('')}</div>`}</section>`;
    };
    const count = () => list.filter(e => e.checked).length;
    const canIgnore = () => list.some(e => !e.checked && !e.locked && e.order.number && e.key !== 'ignored');
    openModal(`<h2>Conferir ${list.length === 1 ? 'o pedido' : `${list.length} pedidos`}</h2><form id="order-review-form" class="form-grid"><div class="field"><label>Fornecedor</label><input name="supplier" list="order-suppliers" value="${esc(lastSupplier)}" placeholder="Opcional" autocomplete="off"><datalist id="order-suppliers">${data.suppliers.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist></div><div class="field"><label>Forma de pagamento</label><select name="method">${App.finance.PAY_METHODS.map(m => `<option ${m === lastMethod ? 'selected' : ''}>${m}</option>`).join('')}</select></div><div class="field full order-list">${list.map(orderHtml).join('')}</div><p class="muted field full">Frete e desconto já estão divididos no custo de cada peça.</p><p class="negative field full" id="order-review-error" hidden></p><div class="actions field full"><button type="button" class="secondary" id="order-back">Voltar</button>${canIgnore() ? '<button type="button" class="secondary" id="order-ignore">Ignorar os desmarcados</button>' : ''}<button class="primary" id="order-save">${count() === 1 ? 'Lançar 1 compra' : `Lançar ${count()} compras`}</button></div></form>`);
    const form = byId('order-review-form');
    App.ui.groupFields(form, [{kind: 'client', title: 'Fornecedor', items: ['supplier']}, {kind: 'pay', title: 'Pagamento', items: ['method']}, {kind: 'product', title: 'Pedidos', items: ['.order-list']}]);
    const cardOf = el => el.closest('[data-order]'), itemOf = el => { const card = cardOf(el); return list[card.dataset.order].order.items[el.closest('[data-item]').dataset.item]; };
    // lê o que foi digitado de volta para a lista (para redesenhar sem perder nada)
    const collect = () => form.querySelectorAll('[data-order]').forEach(card => {
      const entry = list[card.dataset.order];
      entry.checked = !!card.querySelector('[data-order-check]').checked;
      const date = card.querySelector('[data-order-date]');
      if (date) entry.order.date = date.value;
      card.querySelectorAll('[data-item]').forEach(row => {
        const it = entry.order.items[row.dataset.item];
        it.choice = row.querySelector('[data-oi-product]').value;
        it.newName = row.querySelector('[data-oi-name]').value;
        it.cost = row.querySelector('[data-oi-cost]').value;
        const cat = row.querySelector('[data-oi-cat]');
        it.catalog = !!(cat && cat.checked);
      });
    });
    form.addEventListener('change', event => {
      if (event.target.matches('[data-order-check]')) { const n = form.querySelectorAll('[data-order-check]:checked').length; byId('order-save').textContent = n === 1 ? 'Lançar 1 compra' : `Lançar ${n} compras`; }
      if (event.target.matches('[data-oi-product]')) {
        const row = event.target.closest('[data-item]'), it = itemOf(event.target);
        it.choice = event.target.value;
        row.querySelector('[data-oi-name]').hidden = it.choice !== 'new';
        row.querySelector('.oi-status').innerHTML = status(it);
        const box = row.querySelector('.oi-cat');
        if (box) box.outerHTML = catalogBox(it);
      }
    });
    byId('order-back').onclick = () => pasteForm();
    if (byId('order-ignore')) byId('order-ignore').onclick = () => {
      collect();
      data.ignoredOrders = data.ignoredOrders || [];
      list.forEach(e => { if (!e.checked && !e.locked && e.order.number && !data.ignoredOrders.includes(e.order.number)) data.ignoredOrders.push(e.order.number); });
      save();
      review(list.map(e => ({...e, ...App.orderPaste.stateOf(e.order)})));
    };

    form.onsubmit = event => {
      event.preventDefault();
      collect();
      const fail = message => { const box = byId('order-review-error'); box.textContent = message; box.hidden = false; };
      const chosen = list.filter(e => e.checked && !e.locked);
      if (!chosen.length) return fail('Marque pelo menos um pedido.');
      for (const {order: o} of chosen) {
        const label = `Pedido ${o.number || 'sem número'}`;
        if (!o.date || o.date > today()) return fail(`${label}: a data não pode ficar em branco nem ser no futuro.`);
        for (const it of o.items) {
          if (!it.choice) return fail(`${label}: escolha o produto de "${shortTitle(it.title)}".`);
          if (it.choice === 'new') {
            if (!it.newName.trim()) return fail(`${label}: dê um nome ao produto novo "${shortTitle(it.title)}".`);
            const same = App.stock.productByName(it.newName.trim());
            if (same && same.type === 'Serviço') return fail(`"${same.name}" é um serviço. Escolha outro nome.`);
          }
          if (!(Number(it.cost) >= 0) || it.cost === '') return fail(`${label}: confira o custo de "${shortTitle(it.title)}".`);
        }
      }
      const supplier = form.elements.supplier.value.trim(), method = form.elements.method.value;
      for (const {order: o} of chosen) {
        const items = o.items.map(it => {
          let product = it.choice === 'new' ? App.stock.productByName(it.newName.trim()) : byKey(it.choice);
          // produto novo: já entra no catálogo com o que o título traz, mas "a completar" (preço e foto) e fora do site até lá (SPECS 48)
          if (!product) { product = {name: it.newName.trim(), sku: '', type: 'Produto', stock: 0, cost: 0, price: 0, toComplete: true, catalog: App.orderPaste.catalogOf(it.title)}; data.products.push(product); }
          // apelido: da próxima vez, o mesmo código ou título é reconhecido sozinho
          product.aliases = [...new Set([...(product.aliases || []), ...App.orderPaste.aliasKeys(it)])].slice(-30);
          if (it.link) product.buyLink = it.link;
          if (it.catalog && !App.catalog.isShown(product)) {
            const kept = Object.fromEntries(Object.entries(product.catalog || {}).filter(([, v]) => v !== '' && v !== false && !(Array.isArray(v) && !v.length)));
            product.catalog = {...App.orderPaste.catalogOf(it.title), ...kept, show: true};
          }
          return {name: product.name, qty: it.qty, unitCost: round2(Number(it.cost)), ...(it.link ? {link: it.link} : {})};
        });
        const extra = {...(o.number ? {orderNo: o.number} : {}), ...(o.freight ? {freight: o.freight} : {}), ...(o.discount ? {discount: o.discount} : {})};
        registerPurchase({date: o.date, supplier, later: false, method, items, total: o.paid, extra});
        if (o.number) data.ignoredOrders = (data.ignoredOrders || []).filter(n => n !== o.number);
      }
      data.settings.orderSuppliers = {...(data.settings.orderSuppliers || {}), [format]: supplier};
      data.settings.orderMethod = method;
      month = chosen.map(e => e.order.date).sort().reverse()[0].slice(0, 7);
      save();
      closeModal();
      go('purchases');
    };
  }

  // ---------- quais vendas usaram esta compra ----------
  function usage(id) {
    const purchase = data.purchases.find(p => p.id === id);
    const rows = App.stock.usageOf(id).sort((a, b) => a.sale.date.localeCompare(b.sale.date));
    openModal(`<h2>Vendas que usaram a compra ${purchase.id}</h2><p class="muted">Fornecedor: ${esc(purchase.supplier || '-')} · comprada em ${dateLabel(purchase.date)}</p>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Venda</th><th>Data</th><th>Cliente</th><th>Produto</th><th>Qtd.</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.sale.id}</td><td>${dateLabel(r.sale.date)}</td><td>${esc(r.sale.client)}</td><td>${esc(r.name)}</td><td>${r.qty}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhuma peça desta compra foi vendida ainda.</div>'}<div class="actions"><button type="button" class="secondary" data-action="close-modal">Fechar</button></div>`);
  }

  // ---------- estorno ----------
  // Estorno: desfaz o estoque e o custo, cancela a conta a pagar. Bloqueia se alguma peça desta compra já foi vendida
  // (ou se o estoque ficaria negativo).
  function cancelConfirm(id) {
    const purchase = data.purchases.find(p => p.id === id);
    const sold = purchase.items.find(i => App.stock.usedQty(purchase.id, i.name) > 0);
    const short = purchase.items.find(i => (Number(App.stock.productByName(i.name)?.stock) || 0) < i.qty);
    const reason = sold ? `Não dá para estornar: já foram vendidas peças desta compra (<b>${esc(sold.name)}</b>). Veja quais em "Vendidas".` : short ? `Não dá para estornar: já foram vendidas peças desta compra e o estoque de <b>${esc(short.name)}</b> ficaria negativo.` : '';
    openModal(`<h2>Estornar a compra ${purchase.id}?</h2>${reason ? `<p class="negative">${reason}</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Voltar</button></div>` : `<p>O estoque volta ao que era, o custo dos produtos volta ao valor anterior e a conta a pagar desta compra é removida. Se você já pagou, o dinheiro devolvido pelo fornecedor é tratado por fora.</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Voltar</button><button type="button" class="danger" data-action="purchase-cancel-confirm" data-id="${purchase.id}">Estornar</button></div>`}`);
  }

  function cancelPurchase(id) {
    const purchase = data.purchases.find(p => p.id === id);
    // de trás para frente: com o mesmo produto em 2 linhas, o custo termina no de ANTES da compra (SPECS 52)
    for (const item of purchase.items.slice().reverse()) {
      const product = App.stock.productByName(item.name);
      if (!product) continue;
      product.stock = (Number(product.stock) || 0) - item.qty;
      // o custo só volta ao de antes se não houve compra mais nova deste produto (senão, o custo atual já reflete a compra mais nova)
      const newer = data.purchases.some(p => p !== purchase && p.status !== 'Estornada' && (p.date > purchase.date || (p.date === purchase.date && p.id > purchase.id)) && p.items.some(i => App.store.findByName('products', i.name) === product));
      if (!newer) product.cost = item.prevCost;
    }
    const index = data.payables.findIndex(b => b.id === purchase.payableId);
    if (index >= 0) data.payables.splice(index, 1);
    purchase.status = 'Estornada';
    purchase.canceledAt = today();
    save();
    closeModal();
    go('purchases');
  }

  App.ui.registerScreen('purchases', render);
  App.ui.registerAction('new-purchase', purchaseForm);
  App.ui.registerAction('order-paste', () => pasteForm());
  App.ui.registerAction('purchase-usage', element => usage(element.dataset.id));
  App.ui.registerAction('purchase-month-step', element => { if (month !== 'todos') { month = shiftMonth(month, Number(element.dataset.step)); render(); } });
  App.ui.registerAction('purchase-cancel', element => cancelConfirm(element.dataset.id));
  App.ui.registerAction('purchase-cancel-confirm', element => cancelPurchase(element.dataset.id));
})();
