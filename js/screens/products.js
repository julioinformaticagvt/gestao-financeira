// Tela "Produtos e serviços": lista com busca, cadastro, edição completa (inclusive estoque) e exclusão.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, normalize} = App.format;
  const {data, save} = App.store;
  const {openModal, closeModal, byId, go} = App.ui;

  const typeBadge = type => `<span class="item-type ${type === 'Serviço' ? 'service' : ''}">${type}</span>`;
  const find = name => data.products.find(p => p.name === name);
  // Onde um produto já foi usado: vendas, orçamentos e compras (pelo id interno do produto; sem id, pelo nome).
  const itemOf = (item, product) => item.productId ? item.productId === product.uid : item.name === product.name;
  const usedBy = product => data.sales.some(s => (s.items || []).some(i => itemOf(i, product)))
    || data.quotes.some(q => (q.items || []).some(i => itemOf(i, product)))
    || data.purchases.some(p => p.items.some(i => itemOf(i, product)));
  // ---------- lista ----------
  function render() {
    const catalogButton = App.catalog.enabled() ? '<button class="secondary" data-action="catalog-send">Mandar para o catálogo</button>' : '';
    byId('app').innerHTML = `<section class="panel"><div class="panel-head"><h2>Produtos e serviços</h2>${catalogButton ? `<div class="head-buttons">${catalogButton}<button class="primary" data-action="new-product">+ Novo item</button></div>` : '<button class="primary" data-action="new-product">+ Novo item</button>'}</div><div class="toolbar"><input id="item-search" placeholder="Buscar produto ou serviço..."></div><div id="item-table"></div></section>`;

    const draw = () => {
      const query = normalize(byId('item-search').value);
      const items = data.products.filter(p => normalize(p.name).includes(query));
      const rows = items.map(p => {
        const low = App.stock.lowStock().includes(p);
        const stockCell = p.type === 'Serviço' ? 'Não se aplica' : `${p.stock}${low ? ' <span class="badge warn">baixo</span>' : ''}`;
        const inCatalog = App.catalog.enabled() && App.catalog.isShown(p) ? ' <span class="badge info">no catálogo</span>' : '';
        return `<tr><td>${esc(p.name)}${inCatalog}</td><td>${typeBadge(p.type)}</td><td>${money(p.cost)}</td><td>${money(p.price)}</td><td>${stockCell}</td><td>${p.type === 'Serviço' ? '-' : App.stock.minOf(p) + (App.stock.hasOwnMin(p) ? '' : ' <small class="muted">padrão</small>')}</td><td><button class="secondary" data-action="edit-item" data-name="${esc(p.name)}">Editar</button></td></tr>`;
      }).join('');
      byId('item-table').innerHTML = items.length
        ? `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Tipo</th><th>Custo</th><th>Preço</th><th>Estoque</th><th>Mínimo</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : (data.products.length ? '<div class="empty">Nenhum item encontrado.</div>' : App.firstRun.emptyState({title: 'Você ainda não tem produtos ou serviços.', hint: 'Cadastre o que você vende, com o preço de venda e quanto você paga.', action: 'new-product', label: '+ Novo produto ou serviço'}));
    };
    byId('item-search').oninput = draw;
    draw();
  }

  // ---------- formulário (novo e editar) ----------
  const defaultMargin = () => Number(data.settings.defaultMargin) || 0;
  const round2 = App.finance.round2;

  // Atividade do negócio (campo opcional; só aparece se houver atividades cadastradas em Configurações).
  function activityField(v) {
    const list = (data.settings.activities || []).filter(a => a.active !== false || a.id === (v && v.activityId));
    if (!list.length) return '';
    return `<div class="field"><label>Atividade <small>opcional</small></label><select name="activityId"><option value="">Sem atividade</option>${list.map(a => `<option value="${esc(a.id)}" ${v && v.activityId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>`;
  }
  // Campos do catálogo online (só aparecem com o catálogo ligado em Configurações; ver features/catalog.js).
  function formMarkup(product) { return baseFormMarkup(product) + activityField(product) + App.catalog.formFields(product); }
  function baseFormMarkup(product) {
    const v = product || {type: 'Produto', stock: 0};
    const margin = v.margin ?? (Number(v.cost) > 0 && Number(v.price) > 0 ? round2((v.price / v.cost - 1) * 100) : defaultMargin());
    return `<div class="field full"><label>Nome *</label><input name="name" value="${esc(v.name || '')}" required></div><div class="field"><label>SKU</label><input name="sku" value="${esc(v.sku || '')}"></div><div class="field"><label>Tipo do item</label><select name="type"><option ${v.type === 'Produto' ? 'selected' : ''}>Produto</option><option ${v.type === 'Serviço' ? 'selected' : ''}>Serviço</option></select></div><div class="field"><label>Estoque atual</label><input name="stock" type="number" step="1" value="${v.stock ?? 0}"></div><div class="field"><label>Estoque mínimo <small>avisa para comprar quando ficar abaixo dele · em branco = padrão (${App.stock.defaultMin()})</small></label><input name="minStock" type="number" min="0" step="1" value="${App.stock.hasOwnMin(v) ? v.minStock : ''}" placeholder="padrão: ${App.stock.defaultMin()}"></div><div class="field"><label>Custo (R$) <small>quanto eu pago</small></label><input name="cost" type="number" min="0" step="0.01" value="${v.cost ?? ''}"></div><div class="field"><label>Margem de ganho (%) <small>em cima do custo</small></label><input name="margin" type="number" min="0" step="0.01" value="${margin}"></div><div class="field"><label>Preço de venda (R$)</label><input name="price" type="number" min="0" step="0.01" value="${v.price ?? ''}"></div><div class="field"><label>Preço sugerido</label><output id="price-suggest" class="price-suggest"></output></div><p class="muted field full">Serviço não tem estoque. Preço sugerido = custo + margem. O custo é sugerido como valor de COMPRA nas vendas e se atualiza sozinho a cada compra de peças (custo médio).</p>`;
  }

  // Liga custo + margem = preço sugerido. O preço vem preenchido (em azul) até o usuário digitar nele.
  function bindMargin(form, hasPrice) {
    const f = form.elements, out = form.querySelector('#price-suggest');
    let priceTouched = hasPrice;
    const suggest = () => { const cost = Number(f.cost.value) || 0, margin = Number(f.margin.value) || 0; return round2(cost * (1 + margin / 100)); };
    const refresh = () => {
      const cost = Number(f.cost.value) || 0;
      out.textContent = cost > 0 ? `${money(suggest())} (custo ${money(cost)} + ${String(Number(f.margin.value) || 0).replace('.', ',')}%)` : 'Digite o custo para ver';
    };
    form.addEventListener('input', event => {
      const name = event.target.name;
      if (name === 'price') {
        priceTouched = true; f.price.classList.remove('auto');
        const cost = Number(f.cost.value) || 0, price = Number(f.price.value) || 0;
        if (cost > 0 && price > 0) f.margin.value = round2((price / cost - 1) * 100);    // mostra a margem real do preço digitado
      } else if ((name === 'cost' || name === 'margin') && !priceTouched) {
        const value = suggest();
        f.price.value = value > 0 ? value : '';
        f.price.classList.toggle('auto', value > 0);
      }
      if (name === 'cost' || name === 'margin' || name === 'price') refresh();
    });
    refresh();
  }

  function readForm(form) {
    const f = Object.fromEntries(new FormData(form));
    const isService = f.type === 'Serviço';
    return {name: f.name.trim(), sku: f.sku.trim(), type: f.type, cost: Number(f.cost) || 0, price: Number(f.price) || 0, margin: Number(f.margin) || 0, stock: isService ? 0 : Math.round(Number(f.stock) || 0), ...(isService || f.minStock === '' ? {} : {minStock: Math.max(0, Math.round(Number(f.minStock) || 0))}), ...(f.activityId ? {activityId: f.activityId} : {})};
  }

  const groupProduct = form => App.ui.groupFields(form, [
    {kind: 'product', title: 'Produto ou serviço', items: ['name', 'sku', 'type', 'stock', 'minStock', 'activityId']},
    {kind: 'pay', title: 'Custo, margem e preço', items: ['cost', 'margin', 'price', '#price-suggest']}
  ]);

  function productForm() {
    openModal(`<h2>Novo produto</h2><form id="product-form" class="form-grid">${formMarkup(null)}<p class="negative field full" id="product-error" hidden></p><div class="actions field full"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary">Salvar produto</button></div></form>`);
    groupProduct(byId('product-form')); bindMargin(byId('product-form'), false);
    const catalog = App.catalog.bindForm(byId('product-form'), null);
    byId('product-form').onsubmit = async event => {
      event.preventDefault();
      const values = readForm(event.target);
      if (data.products.some(p => normalize(p.name) === normalize(values.name))) { const box = byId('product-error'); box.textContent = 'Já existe um item com esse nome.'; box.hidden = false; return; }
      data.products.push(values);
      save();   // aqui o produto ganha o id interno (as fotos do catálogo usam esse id no nome)
      await catalog.apply(values);
      save();
      closeModal();
      go('products');
    };
  }

  // Renomear: o nome novo vale em todas as vendas, orçamentos e compras que usam o produto (achados pelo id interno).
  // Recibos já emitidos não mudam (são documentos).
  function renameEverywhere(product, newName) {
    const oldName = product.name;
    const rename = items => (items || []).forEach(i => { if (itemOf(i, product)) i.name = newName; });
    data.sales.forEach(s => { rename(s.items); rename(s.stockOut); rename(s.originLinks); if (s.product === oldName) s.product = newName; });
    data.quotes.forEach(q => { rename(q.items); if (q.product === oldName) q.product = newName; });
    data.purchases.forEach(p => rename(p.items));
  }

  function editItem(name) {
    const product = find(name);
    if (!product) return;
    const canDelete = !usedBy(product);
    openModal(`<h2>Editar item</h2><form id="edit-item-form" class="form-grid">${formMarkup(product)}<p class="negative field full" id="product-error" hidden></p><p class="muted field full">${canDelete ? '' : 'Este item já foi usado em vendas, orçamentos ou compras, por isso não pode ser excluído. Se mudar o nome, ele muda em todos eles.'}</p><div class="actions field full">${canDelete ? `<button type="button" class="danger" data-action="product-delete" data-name="${esc(name)}">Excluir</button>` : ''}<button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary">Salvar</button></div></form>`);
    groupProduct(byId('edit-item-form')); bindMargin(byId('edit-item-form'), Number(product.price) > 0);
    const catalog = App.catalog.bindForm(byId('edit-item-form'), product);
    byId('edit-item-form').onsubmit = async event => {
      event.preventDefault();
      const values = readForm(event.target);
      if (values.name !== product.name && data.products.some(p => p !== product && normalize(p.name) === normalize(values.name))) { const box = byId('product-error'); box.textContent = 'Já existe outro item com esse nome.'; box.hidden = false; return; }
      if (values.name !== product.name) renameEverywhere(product, values.name);
      if (values.type === 'Serviço' || values.minStock === undefined) delete product.minStock;   // em branco = segue o padrão
      if (event.target.elements.activityId && !values.activityId) delete product.activityId;   // escolheu "Sem atividade"
      Object.assign(product, values);
      await catalog.apply(product);
      save();
      closeModal();
      go('products');
    };
  }

  function deleteConfirm(name) {
    openModal(`<h2>Excluir ${esc(name)}?</h2><p>O cadastro será apagado. Isso não afeta nenhuma venda (este item não foi usado em nenhuma).</p><div class="actions"><button type="button" class="secondary" data-action="edit-item" data-name="${esc(name)}">Voltar</button><button type="button" class="danger" data-action="product-delete-confirm" data-name="${esc(name)}">Excluir</button></div>`);
  }

  function deleteProduct(name) {
    const product = find(name);
    if (!product || usedBy(product)) return;
    data.products.splice(data.products.indexOf(product), 1);
    App.catalog.forgetProduct(product);
    save();
    closeModal();
    go('products');
  }

  App.ui.registerScreen('products', render);
  App.ui.registerAction('new-product', productForm);
  App.ui.registerAction('edit-item', element => editItem(element.dataset.name));
  App.ui.registerAction('product-delete', element => deleteConfirm(element.dataset.name));
  App.ui.registerAction('product-delete-confirm', element => deleteProduct(element.dataset.name));
})();
