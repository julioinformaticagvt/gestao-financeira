// Peças de formulário usadas na venda e no orçamento:
//   - itens (só o Item 1 aparece; "+ Adicionar outro item" mostra os próximos) com quantidade,
//     "Valor de VENDA" e "Valor de COMPRA" (bem explícitos),
//   - desconto,
//   - bloco "Pagamento" (forma, parcelas, juros base e cobrança extra) com a comparação lado a lado
//     e, no carnê, a prévia das datas das parcelas (com a 1ª parcela editável).
// Campos que o sistema preenche sozinho ganham a classe "auto" (cor azul) até o usuário digitar por cima.
// Uso: o formulário monta o HTML com markup.*() e depois chama bind(form) para ligar o comportamento.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today} = App.format;
  const {data} = App.store;
  const {itemType, scheduleFor} = App.finance;
  const P = App.pricing;

  const MAX_ITEMS = 10;
  const num = value => { const n = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const pct = value => `${String(P.round2(value)).replace('.', ',')}%`;
  const productField = n => n === 1 ? 'product' : `product${n}`;

  // ---------- HTML ----------
  // Um item: produto + quantidade + valor de VENDA (cada) + valor de COMPRA (cada).
  const itemBlock = (n, listId) => `<div class="item-block" data-item="${n}" ${n > 1 ? 'hidden' : ''}><div class="field item-name"><label>${n === 1 ? 'Produto ou serviço' : `Item ${n}`}</label><input name="${productField(n)}" list="${listId}" placeholder="Buscar produto..." autocomplete="off"><small class="stock-hint" data-stock-hint="${n}"></small></div><div class="field"><label>Quantidade</label><input name="itemQty${n}" type="number" min="1" step="1" value="1"></div><div class="field"><label>VENDA (R$) <small>cada · o cliente paga</small></label><input name="itemAmount${n}" type="number" min="0" step="0.01" ${n === 1 ? 'required' : ''}></div><div class="field"><label>COMPRA (R$) <small>cada · eu pago</small></label><input name="itemCost${n}" type="number" min="0" step="0.01" ${n === 1 ? 'required' : ''}></div><input type="hidden" name="itemLot${n}" value=""><div class="lot-chips" data-lots="${n}" hidden></div>${n > 1 ? `<button type="button" class="secondary item-remove" data-remove-item="${n}">Remover item ${n}</button>` : ''}</div>`;

  const markup = {
    // listId = id do <datalist> de produtos que já existe no formulário.
    items(listId) {
      return `${Array.from({length: MAX_ITEMS}, (_, i) => itemBlock(i + 1, listId)).join('')}<div class="field full"><button type="button" class="secondary" id="add-item">+ Adicionar outro item</button></div><p class="muted help items-help"><b>Venda</b> = o preço que eu cobro do cliente por unidade. <b>Compra</b> = quanto eu pago para ter cada unidade (ou o custo do serviço). Se não tiver custo, digite 0. <span class="auto-key">Azul</span> = preenchido automaticamente (digite por cima para mudar).</p>`;
    },
    discount() {
      return '<div class="field"><label>Desconto da venda inteira <small>em R$ ou em %</small></label><div class="discount-row"><input name="discount" type="number" min="0" step="0.01" value="0"><select name="discountType"><option value="money">R$</option><option value="percent">%</option></select></div></div>';
    },
    payment(options = {}) {
      return `<div class="field"><label>Forma de pagamento</label><select name="modality">${P.MODALITIES.map(m => `<option value="${m.key}">${m.label}</option>`).join('')}</select></div>
        <div class="field" data-show="credit,carne"><label>Parcelas</label><input name="installments" type="number" min="1" max="12" value="1"></div>
        <div class="field" data-show="pix"><label>Conta que recebeu</label><select name="account"><option value="PJ">Conta PJ (da empresa)</option><option value="PF">Conta PF (pessoal)</option></select></div>
        <div class="field" data-show="carne"><label>Entrada (R$)</label><input name="entry" type="number" min="0" step="0.01" value="0"></div>
        <div class="field" data-show="carne"><label>Vence a 1ª parcela <small>vazio = dia ${Number(data.settings.dueDay) || 12}</small></label><input name="firstDue" type="date"></div>
        ${options.dues ? '<div class="field full" data-show="carne" id="extra-dues-box"><input type="hidden" name="extraDues" value=""><div id="extra-dues"></div></div>' : ''}
        <div class="field" data-show="debit,credit"><label>Taxa da maquininha (%)</label><input name="feeRate" type="number" min="0" step="0.01"></div>
        <div class="field full" data-show="pix,debit,credit,carne"><label class="inline-check no-interest"><input type="checkbox" name="passFee"> Repassar a taxa para o cliente (cobrar juros)</label></div>
        <div class="field"><label>Juros base (%) <small>padrão = taxa da maquininha</small></label><input name="baseRate" type="number" min="0" step="0.01" value="0"></div>
        <div class="field"><label>Cobrar extra (%) <small>acréscimo meu, só desta venda</small></label><input name="extraRate" type="number" min="0" step="0.01" value="0"></div>
        <div class="field full"><div class="pay-compare" id="pay-compare"></div></div>
        <div class="field full" data-show="carne"><div class="muted" id="pay-schedule"></div></div>
        <div class="field full"><label class="inline-check"><input type="checkbox" name="invoiceIssued"> Esta venda teve nota fiscal</label><small class="muted">Só para controle. O sistema não emite nota.</small></div>
        <div class="field" id="invoice-number-field" hidden><label>Número da nota <small>opcional</small></label><input name="invoiceNumber" autocomplete="off"></div>`;
    }
  };

  // Preenche os itens de um formulário com os de uma venda que já existe (para editar).
  function fillItems(form, items) {
    items.slice(0, MAX_ITEMS).forEach((item, i) => {
      const n = i + 1, qty = Math.max(1, item.qty || 1);
      form.elements[productField(n)].value = item.name || '';
      form.elements[`itemQty${n}`].value = qty;
      form.elements[`itemAmount${n}`].value = item.unit ?? P.round2(Number(item.amount) / qty);
      form.elements[`itemCost${n}`].value = item.unitCost ?? (item.cost === undefined ? '' : P.round2(Number(item.cost) / qty));
      form.elements[`itemLot${n}`].value = item.lotId || '';   // compra escolhida (SPECS 44)
    });
  }

  // ---------- comportamento ----------
  // "extraDues" fica num campo escondido como texto "data,data,,data" (assim volta junto quando o formulário é reaberto).
  const parseDues = text => String(text || '').split(',').map(part => (/^\d{4}-\d{2}-\d{2}$/.test(part) ? part : ''));

  function bind(form, initial = {}) {
    const el = name => form.elements[name];
    const touched = {};                                   // campos que o usuário mexeu à mão (não sobrescrever)
    const blocks = () => [...form.querySelectorAll('.item-block')];
    const visible = () => blocks().filter(block => !block.hidden);

    // Escreve num campo pelo código. auto = true pinta de azul ("preenchido automaticamente").
    const set = (name, value, auto) => { const field = el(name); field.value = value ?? ''; field.classList.toggle('auto', !!auto && field.value !== ''); };

    // Mostra os primeiros "count" itens. O botão "Remover" só aparece no último item visível.
    function showItems(count) {
      blocks().forEach((block, i) => { block.hidden = i >= count; });
      form.querySelectorAll('[data-remove-item]').forEach(button => { button.hidden = Number(button.dataset.removeItem) !== count; });
      form.querySelector('#add-item').hidden = count >= MAX_ITEMS;
    }

    // Lê tudo que está no formulário e faz as contas.
    function read() {
      const f = new FormData(form), items = [];
      visible().forEach(block => {
        const n = Number(block.dataset.item);
        const typed = String(f.get(productField(n)) || '').trim(), known = App.store.findByName('products', typed);
        const name = known ? known.name : typed, qty = Math.max(1, Math.round(num(f.get(`itemQty${n}`)) || 1));   // nome do cadastro (mesmo se digitado com outras maiúsculas/acentos)
        const unit = num(f.get(`itemAmount${n}`)), unitCost = num(f.get(`itemCost${n}`));
        const line = {name, type: itemType(name), qty, unit, unitCost, amount: P.round2(qty * unit), cost: P.round2(qty * unitCost)};
        const lotId = String(f.get(`itemLot${n}`) || '');
        if (lotId) line.lotId = lotId;   // compra de onde a peça sai (escolhida nos botões de custo)
        const product = known;
        if (product && product.activityId) line.activityId = product.activityId;   // atividade do produto no momento da venda (cópia gravada)
        if (n === 1 ? (name || unit > 0) : (name && unit > 0)) items.push(line);
      });
      const sold = items.reduce((total, item) => total + item.amount, 0);
      // O desconto pode ser digitado em R$ ou em % (da venda inteira); o sistema guarda sempre o valor em R$ (discount).
      const discountType = f.get('discountType') === 'percent' ? 'percent' : 'money', discountValue = num(f.get('discount'));
      const discount = discountType === 'percent' ? P.round2(sold * Math.min(100, discountValue) / 100) : discountValue;
      const price = Math.max(0, P.round2(sold - discount));
      const cost = P.round2(items.reduce((total, item) => total + item.cost, 0));
      const modality = f.get('modality');
      const meta = P.modality(modality);
      const installments = meta.installments ? Math.min(12, Math.max(1, Math.round(num(f.get('installments')) || 1))) : 1;
      const needsFee = modality === 'debit' || modality === 'credit';
      const feeRate = needsFee ? num(f.get('feeRate')) : modality === 'pix' ? (P.machineRate('pix', 1) ?? 0) : 0;
      // SPECS 47: por padrão EU pago a taxa (o cliente paga o preço; a taxa sai do meu lucro). Marcando "Repassar", o cliente paga os juros.
      const noInterest = modality !== 'cash' && f.get('passFee') !== 'on';
      const base = noInterest ? 0 : num(f.get('baseRate')), extra = noInterest ? 0 : num(f.get('extraRate'));
      const result = P.compare({price, cost, base, extra, feeRate, installments});
      const entry = modality === 'carne' ? Math.min(Math.max(0, num(f.get('entry'))), result.withExtra.total) : 0;
      const firstDue = modality === 'carne' ? (f.get('firstDue') || '') : '';
      const extraDues = firstDue ? parseDues(f.get('extraDues')).slice(0, Math.max(0, installments - 1)) : [];   // datas escolhidas da 2ª parcela em diante ('' = dia padrão)
      const invoiceIssued = f.get('invoiceIssued') === 'on', invoiceNumber = String(f.get('invoiceNumber') || '').trim();
      return {items, invoiceIssued, invoiceNumber, discount, discountType, discountValue, sold, price, cost, modality, account: f.get('account') || 'PJ', installments, base, extra, noInterest, feeRate, entry, firstDue, extraDues, ...result};
    }

    function renderCompare() {
      const r = read(), a = r.onlyFee, b = r.withExtra, n = r.installments;
      const needsFee = r.modality === 'debit' || r.modality === 'credit';
      const missingFee = needsFee && el('feeRate').value === '';
      const row = (label, x, y, strong) => `<tr class="${strong ? 'strong' : ''}"><td>${label}</td><td>${x}</td><td>${y}</td></tr>`;
      document.getElementById('pay-compare').innerHTML = `${missingFee ? '<p class="negative">Falta a taxa da maquininha desta forma. Digite em "Taxa da maquininha (%)" (ou preencha a tabela em Configurações).</p>' : ''}${r.noInterest ? `<p class="no-interest-note">Sem juros: o cliente paga ${money(b.total)}${n > 1 ? ` em ${n}x de ${money(b.installment)}` : ''}. Taxa que você paga: <b>${money(b.fee)}</b>.</p>` : ''}<table><thead><tr><th></th><th>Só a taxa da maquininha</th><th>Com cobrança extra</th></tr></thead><tbody>${row('Juros total', pct(a.totalRate), pct(b.totalRate))}${row('Total cobrado do cliente', money(a.total), money(b.total), true)}${n > 1 ? row(`Parcela (${n}x)`, money(a.installment), money(b.installment)) : ''}${row('Taxa paga à maquininha', money(a.fee), money(b.fee))}${row('Você recebe', money(a.net), money(b.net))}${row('Custo (compra)', money(r.cost), money(r.cost))}${row('Lucro líquido', money(a.profit), money(b.profit), true)}</tbody></table><p class="muted formula">Você recebe = total − taxa. Lucro = você recebe − compra.</p>`;

      // Carnê: prévia das parcelas e das datas de vencimento.
      const box = document.getElementById('pay-schedule');
      if (box) {
        if (r.modality === 'carne' && b.total > 0) {
          const schedule = scheduleFor({date: (el('date') && el('date').value) || today(), total: b.total, entry: r.entry, installments: r.installments, firstDue: r.firstDue, extraDues: r.extraDues});
          box.innerHTML = `<b>Parcelas do carnê:</b> ${schedule.map(s => `${s.number}/${schedule.length} · ${dateLabel(s.due)} · ${money(s.value)}`).join(' &nbsp;|&nbsp; ')}${r.entry > 0 ? ` &nbsp;(entrada de ${money(r.entry)} paga na venda)` : ''}`;
        } else box.innerHTML = '';
      }
    }

    // Aviso de estoque embaixo do campo de cada produto.
    function renderStock() {
      const f = new FormData(form);
      form.querySelectorAll('[data-stock-hint]').forEach(hint => {
        const n = hint.dataset.stockHint, product = App.stock.productByName(f.get(productField(Number(n))));
        if (!product || !App.stock.hasStock(product)) { hint.textContent = ''; hint.className = 'stock-hint'; return; }
        const stock = Number(product.stock) || 0, qty = Math.max(1, Math.round(num(f.get(`itemQty${n}`)) || 1));
        hint.className = `stock-hint${qty > stock ? ' negative' : ''}`;
        hint.textContent = qty > stock ? `Atenção: só há ${stock} em estoque (a venda deixará o estoque negativo).` : `Estoque atual: ${stock}`;
      });
    }

    // ---------- datas da 2ª parcela em diante (só na venda) ----------
    // dues[0] = 2ª parcela, dues[1] = 3ª... ('' = dia padrão). "dueRows" = quantas linhas estão abertas.
    let dues = [], dueRows = 0;
    const duesBox = form.querySelector('#extra-dues');
    const saveDues = () => { const copy = dues.slice(); while (copy.length && !copy[copy.length - 1]) copy.pop(); el('extraDues').value = copy.join(','); };
    const countInstallments = () => (el('modality').value === 'carne' ? Math.min(12, Math.max(1, Math.round(num(el('installments').value) || 1))) : 1);
    function renderDues() {
      if (!duesBox) return;
      const n = countInstallments(), first = el('firstDue').value;
      if (!first || n < 2) { duesBox.innerHTML = ''; return; }
      // linhas abertas: as que a pessoa abriu e as que já têm data (assim nada some se ela trocar a forma ou as parcelas e voltar);
      // as datas além do número de parcelas ficam guardadas, mas não aparecem nem contam (read() corta pelo número de parcelas).
      let filled = dues.length; while (filled > 0 && !dues[filled - 1]) filled -= 1;
      const shownRows = Math.min(Math.max(dueRows, filled), n - 1);
      const rows = [];
      for (let i = 0; i < shownRows; i++) {
        rows.push(`<div class="due-row"><label>Vence a ${i + 2}ª parcela</label><input type="date" class="due-extra" data-idx="${i}" value="${esc(dues[i] || '')}">${i + 2 < n ? `<button type="button" class="link" data-due-all="${i}">Usar este dia nas seguintes</button>` : ''}</div>`);
      }
      const last = shownRows === 0 ? first : dues[shownRows - 1];
      const canAdd = shownRows < n - 1 && last;
      dueRows = shownRows;
      duesBox.innerHTML = `${rows.join('')}<div class="due-actions">${canAdd ? '<button type="button" class="link" data-due-add>+ Personalizar a próxima parcela</button>' : ''}${shownRows > 0 ? '<button type="button" class="link" data-due-reset>Voltar ao padrão</button>' : ''}</div>`;
      checkDues();
    }
    // Uma data não pode vir antes da parcela anterior.
    function checkDues() {
      if (!duesBox) return;
      const n = countInstallments();
      const dates = App.finance.dueDates({date: (el('date') && el('date').value) || today(), count: n, firstDue: el('firstDue').value, extraDues: dues.slice(0, Math.max(0, n - 1))});
      duesBox.querySelectorAll('.due-extra').forEach(input => {
        const i = Number(input.dataset.idx);
        input.setCustomValidity(input.value && i + 1 < dates.length && i >= 0 && dates[i] && input.value < dates[i] ? `A ${i + 2}ª parcela não pode vencer antes da ${i + 1}ª (${dateLabel(dates[i])}).` : '');
      });
    }
    // A 1ª parcela do carnê não pode vencer antes da data da venda (nasceria atrasada, com multa e juros).
    function checkFirstDue() {
      const first = el('firstDue'), date = el('date');
      if (!first || !date) return;
      const late = el('modality').value === 'carne' && first.value && date.value && first.value < date.value;
      first.setCustomValidity(late ? `A 1ª parcela não pode vencer antes da data da venda (${dateLabel(date.value)}).` : '');
    }
    function loadDues(list) {
      dues = list.slice();
      dueRows = dues.length;
      while (dueRows > 0 && !dues[dueRows - 1]) dueRows -= 1;
      saveDues();
      renderDues();
    }
    if (duesBox) {
      duesBox.addEventListener('change', event => {
        const input = event.target.closest('.due-extra');
        if (!input) return;
        dues[Number(input.dataset.idx)] = input.value;
        saveDues(); renderDues(); renderCompare();
      });
      duesBox.addEventListener('click', event => {
        const add = event.target.closest('[data-due-add]'), all = event.target.closest('[data-due-all]'), reset = event.target.closest('[data-due-reset]');
        if (add) { dueRows += 1; while (dues.length < dueRows) dues.push(''); renderDues(); }
        if (reset) { dues = []; dueRows = 0; saveDues(); renderDues(); renderCompare(); }
        if (all) {      // copia o mesmo dia do mês para todas as parcelas seguintes
          const i = Number(all.dataset.dueAll), from = dues[i];
          if (!from) return;
          const n = countInstallments();
          for (let j = i + 1; j < n - 1; j++) dues[j] = App.finance.monthDay(App.format.shiftMonth(from.slice(0, 7), j - i), Number(from.slice(8, 10)));
          dueRows = n - 1;
          saveDues(); renderDues(); renderCompare();
        }
      });
    }

    // Mostra só os campos que fazem sentido para a forma escolhida.
    function applyVisibility() {
      const modality = el('modality').value;
      form.querySelectorAll('[data-show]').forEach(field => { field.hidden = !field.dataset.show.split(',').includes(modality); });
      el('feeRate').required = modality === 'debit' || modality === 'credit';
    }

    // Preenche os valores padrão da forma/parcelas escolhidas (taxa, juros base e extra), em azul.
    // "Repassar a taxa para o cliente" (SPECS 47): vem DESMARCADA (eu pago a taxa), menos no carnê (os juros do carnê são meus)
    // e nas formas com cobrança extra padrão configurada. Depois que o usuário mexe nela, fica como ele deixou.
    const current = () => { const modality = el('modality').value; return {modality, installments: P.modality(modality).installments ? Math.max(1, Math.round(num(el('installments').value) || 1)) : 1}; };
    function applyDefaults() {
      const {modality, installments} = current();
      const fee = P.machineRate(modality, installments);
      set('feeRate', fee === null ? '' : fee, true);
      if (!touched.passFee) el('passFee').checked = modality === 'carne' || P.defaultExtra(modality) > 0;
      applyRates();
    }
    // Juros base e extra: zerados e travados com "sem juros"; senão, os padrões (taxa da maquininha e extra padrão).
    function applyRates() {
      const {modality, installments} = current(), on = !el('passFee').checked && modality !== 'cash';
      set('baseRate', on ? 0 : P.defaultBase(modality, installments), true);
      set('extraRate', on ? 0 : P.defaultExtra(modality), true);
      touched.baseRate = touched.extraRate = false;
      ['baseRate', 'extraRate'].forEach(name => { el(name).readOnly = on; el(name).closest('.field').classList.toggle('is-locked', on); });
    }

    // Escolheu um produto cadastrado: preenche VENDA (preço padrão) e COMPRA (custo) se o usuário ainda não mexeu.
    function fillFromProduct(n) {
      const product = App.store.findByName('products', el(productField(n)).value);
      renderLots(n);
      if (!product) return;
      if (!touched[`itemAmount${n}`] && Number(product.price) > 0) set(`itemAmount${n}`, product.price, true);
      if (touched[`itemCost${n}`]) return;
      // Com compras disponíveis, já vem o MAIOR custo (SPECS 44); sem compras, o custo do cadastro, como antes.
      const lots = App.stock.availableLots(product.name);
      if (lots.length) {
        const top = lots.reduce((best, lot) => lot.unitCost > best.unitCost ? lot : best, lots[0]);
        set(`itemCost${n}`, top.unitCost, true); el(`itemLot${n}`).value = top.purchaseId;
      } else if (Number(product.cost) > 0) { set(`itemCost${n}`, product.cost, true); el(`itemLot${n}`).value = ''; }
      renderLots(n);
    }

    // Botões com o custo de cada compra (e a média) logo abaixo do item: tocar preenche COMPRA (SPECS 44).
    function renderLots(n) {
      const box = form.querySelector(`[data-lots="${n}"]`);
      if (!box) return;
      const product = App.store.findByName('products', el(productField(n)).value);
      const lots = product ? App.stock.availableLots(product.name) : [];
      if (!lots.length) { box.hidden = true; box.innerHTML = ''; return; }
      const chosen = el(`itemLot${n}`).value, cost = num(el(`itemCost${n}`).value);
      const totalQty = lots.reduce((t, l) => t + l.remaining, 0);
      const average = P.round2(lots.reduce((t, l) => t + l.remaining * l.unitCost, 0) / totalQty);
      const chip = (label, value, lotId) => `<button type="button" class="lot-chip${(lotId ? chosen === lotId : !chosen && Math.abs(cost - value) < 0.005) ? ' active' : ''}" data-lot-n="${n}" data-lot-id="${lotId}" data-lot-cost="${value}">${label}</button>`;
      box.hidden = false;
      box.innerHTML = `<span class="lot-label">Custo das compras:</span>${lots.map(l => chip(`Compra ${esc(l.purchaseId)} · ${dateLabel(l.date).slice(0, 5)} · ${money(l.unitCost)} (${l.remaining} un.)`, l.unitCost, l.purchaseId)).join('')}${lots.length > 1 ? chip(`Média ${money(average)}`, average, '') : ''}`;
    }

    // Escolheu um cliente que já comprou: sugere a forma de pagamento que ele mais usa.
    function fillFromClient() {
      if (!el('client')) return;
      const count = {};
      App.finance.activeSales().filter(s => s.client === el('client').value.trim() && s.pricing).forEach(s => { count[s.pricing.modality] = (count[s.pricing.modality] || 0) + 1; });
      const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
      if (!best || el('modality').value === best) return;
      el('modality').value = best;
      applyVisibility(); applyDefaults(); renderCompare();
      el('modality').classList.add('auto');
    }

    // O número da nota só aparece quando a caixa "teve nota fiscal" está marcada.
    const syncInvoice = () => { const box = form.querySelector('#invoice-number-field'); if (box) box.hidden = !el('invoiceIssued').checked; };

    form.addEventListener('input', event => {
      const name = event.target.name;
      if (!name) return;
      if (name === 'invoiceIssued') syncInvoice();
      event.target.classList.remove('auto');               // digitou por cima: deixa de ser "automático"
      if (['baseRate', 'extraRate'].includes(name) || /^item(Amount|Cost)\d+$/.test(name)) touched[name] = true;
      const typedCost = /^itemCost(\d+)$/.exec(name);
      if (typedCost) { el(`itemLot${typedCost[1]}`).value = ''; renderLots(Number(typedCost[1])); }   // digitou o custo: a peça sai da compra mais antiga
      if (name === 'passFee') { touched.passFee = true; applyRates(); }
      else if (name === 'modality') { applyVisibility(); applyDefaults(); }
      else if (name === 'installments') applyDefaults();
      else if (name === 'feeRate' && !touched.baseRate && el('passFee').checked && el('modality').value !== 'carne') set('baseRate', el('feeRate').value === '' ? 0 : el('feeRate').value, true);
      if (['modality', 'installments', 'firstDue', 'date'].includes(name)) {      // datas da 2ª parcela em diante
        if (name === 'firstDue' && !event.target.value) { dues = []; dueRows = 0; saveDues(); }   // sem a 1ª data, volta tudo ao padrão
        renderDues();
        checkFirstDue();
      }
      const match = /^product(\d*)$/.exec(name);
      if (match && event.target.value) fillFromProduct(match[1] ? Number(match[1]) : 1);
      renderStock();
      renderCompare();
    });
    if (el('client')) el('client').addEventListener('change', fillFromClient);

    form.addEventListener('click', event => {
      const lotChip = event.target.closest('[data-lot-n]');
      if (lotChip) {
        const n = Number(lotChip.dataset.lotN);
        set(`itemCost${n}`, lotChip.dataset.lotCost); touched[`itemCost${n}`] = true;
        el(`itemLot${n}`).value = lotChip.dataset.lotId;
        renderLots(n); renderCompare();
        return;
      }
      const add = event.target.closest('#add-item'), remove = event.target.closest('[data-remove-item]');
      if (add) showItems(Math.min(MAX_ITEMS, visible().length + 1));
      if (remove) {
        const n = Number(remove.dataset.removeItem);
        el(`itemLot${n}`).value = ''; renderLots(n);
        for (const name of [productField(n), `itemQty${n}`, `itemAmount${n}`, `itemCost${n}`]) { el(name).value = name.startsWith('itemQty') ? 1 : ''; el(name).classList.remove('auto'); touched[name] = false; }
        showItems(n - 1);
        renderStock(); renderCompare();
      }
    });

    // valores iniciais (formulário novo ou orçamento sendo editado)
    set('modality', initial.modality || 'pix');
    applyVisibility();
    applyDefaults();
    for (const key of ['installments', 'account', 'entry', 'firstDue']) if (initial[key] !== undefined) set(key, initial[key]);
    if (initial.noInterest !== undefined) { el('passFee').checked = !initial.noInterest; touched.passFee = true; }   // venda/orçamento já salvo: a escolha dele
    if (initial.modality) applyDefaults();               // recalcula padrões com as parcelas iniciais
    if (duesBox) loadDues(initial.extraDues ? initial.extraDues : parseDues(el('extraDues').value));
    for (const key of ['feeRate', 'baseRate', 'extraRate']) if (initial[key] !== undefined && initial[key] !== null) { set(key, initial[key]); touched[key] = true; }
    let shown = 1;
    blocks().forEach((block, i) => { const n = i + 1; if (el(productField(n)).value || el(`itemAmount${n}`).value) shown = n; });
    showItems(shown);
    blocks().forEach((block, i) => renderLots(i + 1));
    renderStock();
    renderCompare();
    syncInvoice();
    checkFirstDue();
    return {read, showItems, refresh: () => { renderStock(); renderCompare(); }};
  }

  App.components = Object.assign(App.components || {}, {paymentBlock: {markup, bind, num, fillItems, MAX_ITEMS}});
})();
