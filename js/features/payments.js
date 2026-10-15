// Receber pagamentos: uma parcela (botão "Receber"), o pagamento de uma visita inteira (botão verde "Registrar pagamento",
// com a divisão sugerida entre parcelas), dispensar multa e juros, histórico da parcela e desfazer um pagamento.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today} = App.format;
  const {data, save} = App.store;
  const {installmentsFor, recalcSale, chargesFor, chargeRules, round2, receivableItems} = App.finance;
  const {openModal, closeModal, byId, go} = App.ui;

  const METHODS = App.finance.PAY_METHODS;
  const near = (a, b) => Math.abs(a - b) < 0.005;
  // Número da parcela escrito no botão (0 = entrada; sem número = 1).
  const installmentOf = element => { const n = Number(element.dataset.installment); return Number.isNaN(n) ? 1 : n; };

  const findSale = id => data.sales.find(s => s.id === id);
  const findItem = (sale, number) => installmentsFor(sale).find(i => i.number === number) || {number, due: sale.due || sale.date, value: sale.total, balance: sale.balance};
  const isWaived = (sale, number) => { const w = (sale.waivers || {})[number]; return !!(w && w.fine && w.interest); };

  // ---------- receber uma parcela ----------
  function paymentForm(saleId, number = 1) {
    const sale = findSale(saleId), item = findItem(sale, number);
    const principal = round2(item.balance), standard = chargeRules(sale, number);
    openModal(`<h2>Receber pagamento</h2><p>${esc(sale.client)} · parcela ${number} · saldo da parcela <b>${money(principal)}</b></p><form id="payment-form" class="form-grid"><div class="field full" id="charges-box" hidden><p id="charges-text" class="negative" style="margin:0"></p><div class="form-grid" style="margin-top:8px"><div class="field"><label>Multa (%) <small>só desta cobrança</small></label><input name="fine" type="number" min="0" step="0.01" value="${standard.fine}"></div><div class="field"><label>Juros ao mês (%) <small>só desta cobrança</small></label><input name="interest" type="number" min="0" step="0.01" value="${standard.interest}"></div></div><div class="actions" style="justify-content:flex-start;margin-top:8px"><button type="button" class="secondary" id="waive-all">Dispensar multa e juros</button></div></div><div class="field"><label>Valor recebido (R$)</label><input name="amount" type="number" step="0.01" min="0" value="${principal}" required></div><div class="field"><label>Data do pagamento *</label><input name="date" type="date" value="${today()}" max="${today()}" required></div><div class="field"><label>Forma de pagamento</label><select name="method">${METHODS.map(m => `<option>${m}</option>`).join('')}</select></div><p class="negative field full" id="payment-error" hidden></p><div class="actions field full"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary">Confirmar recebimento</button></div></form>`);

    const form = byId('payment-form'), f = form.elements;
    App.ui.groupFields(form, [{kind: 'pay', title: 'Pagamento', items: ['#charges-box', 'amount', 'date', 'method']}]);
    let amountTouched = false, current = {owed: 0, due: principal};

    // Refaz as contas (multa e juros) com a data e os percentuais que estão na tela.
    const refresh = () => {
      const rules = {fine: Number(f.fine.value) || 0, interest: Number(f.interest.value) || 0};
      const overdue = item.due < f.date.value;
      const ch = overdue ? chargesFor(sale, item, f.date.value, rules) : {fine: 0, interest: 0, collected: 0, owed: 0};
      current = {owed: ch.owed, due: round2(principal + ch.owed), rules, ch};
      byId('charges-box').hidden = !overdue;
      const waived = (sale.waivers || {})[number] || {};
      byId('charges-text').textContent = overdue
        ? `Parcela ${money(principal)} + multa ${money(ch.fine)}${waived.fine ? ' (dispensada)' : ''} + juros ${money(ch.interest)}${waived.interest ? ' (dispensados)' : ''}${ch.collected ? ` − já pagos de multa e juros ${money(ch.collected)}` : ''} = ${money(current.due)}`
        : '';
      f.amount.max = current.due;
      if (!amountTouched) f.amount.value = current.due;
    };
    form.addEventListener('input', event => { if (event.target.name === 'amount') amountTouched = true; refresh(); });
    refresh();

    byId('waive-all').onclick = () => waiveConfirm(sale.id, number, current.ch);

    const showError = message => { const box = byId('payment-error'); box.textContent = message; box.hidden = false; };
    form.onsubmit = event => {
      event.preventDefault();
      const amount = Number(f.amount.value), date = f.date.value, method = f.method.value;
      if (date > today()) return showError('A data do pagamento não pode ser no futuro.');
      if (date < sale.date) return showError(`A data do pagamento não pode ser antes da venda (${dateLabel(sale.date)}).`);
      if (!(amount > 0)) return showError('Digite um valor maior que zero.');
      if (amount > current.due + 0.004) return showError(`O valor é maior que o saldo (${money(current.due)}).`);
      const charges = Math.min(amount, current.owed);                         // abate primeiro multa e juros
      const payment = {amount, date, method, installment: number, ...(charges > 0 ? {charges: round2(charges)} : {})};
      const rules = current.rules, standard = chargeRules(sale, number);
      const changedRules = rules.fine !== standard.fine || rules.interest !== standard.interest;
      const info = {ch: current.ch, rules, waived: isWaived(sale, number)};
      if (info.waived) payment.dispensed = true;   // se o pagamento for desfeito, a dispensa volta junto
      if (!near(amount, current.due)) return confirmPartial(sale, number, current.due, payment, changedRules ? rules : null, info);
      record(sale, number, payment, changedRules ? rules : null, info);
    };
  }

  // Valor menor que o saldo da parcela: pergunta antes de registrar.
  function confirmPartial(sale, number, totalDue, payment, rules, info) {
    const rest = round2(totalDue - payment.amount);
    openModal(`<h2>Confirmar pagamento parcial</h2><p>Você está recebendo <b>${money(payment.amount)}</b> de <b>${money(totalDue)}</b>. Restarão <b>${money(rest)}</b> em aberto nesta parcela. Confirmar?</p><div class="actions"><button type="button" class="secondary" id="partial-back">Voltar</button><button type="button" class="primary" id="partial-confirm">Confirmar recebimento</button></div>`);
    byId('partial-back').onclick = () => paymentForm(sale.id, number);
    byId('partial-confirm').onclick = () => record(sale, number, payment, rules, info);
  }

  // Grava o pagamento, emite o recibo e mostra o recibo.
  function record(sale, number, payment, rules, info) {
    sale.payments = sale.payments || [];
    sale.payments.push(payment);
    if (rules) { sale.chargeRules = sale.chargeRules || {}; sale.chargeRules[number] = rules; }  // as regras mudadas valem para esta parcela
    recalcSale(sale);
    const [receipt] = App.receipts.issueVisit([{sale, payment, info}]);
    save();
    closeModal();
    App.ui.back('receivables');
    App.receipts.show(receipt.number);
  }

  // ---------- dispensar multa e juros (com motivo) ----------
  function waiveConfirm(saleId, number, ch) {
    const value = ch ? round2(ch.fine + ch.interest) : 0;
    openModal(`<h2>Dispensar multa e juros?</h2><p>Dispensar a multa e os juros da parcela ${number} de ${saleId}${value ? ` (hoje ${money(value)})` : ''}. O cliente paga só o valor da parcela e o recibo mostra "Dispensados". Vale daqui em diante para esta parcela.</p><div class="field"><label>Por que você está dispensando a multa e os juros? <small>opcional</small></label><input id="waive-motive" placeholder="Ex.: cliente avisou antes · combinado por mensagem · cliente antigo"><small class="muted">Só você vê isto: não aparece no recibo nem para o cliente.</small></div><div class="actions"><button type="button" class="secondary" id="waive-back">Voltar</button><button type="button" class="danger" id="waive-ok">Dispensar</button></div>`);
    byId('waive-back').onclick = () => paymentForm(saleId, number);
    byId('waive-ok').onclick = () => {
      const sale = findSale(saleId);
      sale.waivers = sale.waivers || {};
      sale.waivers[number] = {fine: true, interest: true, date: today(), motive: byId('waive-motive').value.trim()};
      save();
      paymentForm(saleId, number);
    };
  }

  // ---------- histórico de pagamentos de uma parcela ----------
  function installmentHistory(saleId, number) {
    const sale = findSale(saleId);
    const rows = (sale.payments || []).map((payment, index) => ({payment, index})).filter(({payment}) => sale.installments <= 1 || payment.installment === number);
    const body = rows.map(({payment, index}) => `<tr class="${payment.voided ? 'voided' : ''}"><td>${dateLabel(payment.date)}</td><td>${money(payment.amount)}${payment.charges ? ` <small class="muted">(inclui ${money(payment.charges)} de multa e juros)</small>` : ''}</td><td>${esc(payment.method)}</td><td>${payment.voided ? `Desfeito em ${dateLabel(payment.voidedAt)}` : 'Valendo'}</td><td>${payment.receipt ? `<button class="secondary" data-action="view-receipt" data-number="${payment.receipt}">Recibo ${App.receipts.pad(payment.receipt)}</button>` : ''}${payment.voided ? '' : ` <button class="secondary" data-action="undo-payment" data-sale="${sale.id}" data-payment-index="${index}" data-installment="${number}">Desfazer</button>`}</td></tr>`).join('');
    const waiver = (sale.waivers || {})[number];
    const waiverNote = waiver && waiver.fine && waiver.interest ? `<p class="muted">Multa e juros desta parcela foram dispensados em ${dateLabel(waiver.date)}${waiver.motive ? ` · motivo: ${esc(waiver.motive)}` : ''}.</p>` : '';
    openModal(`<h2>Pagamentos · ${esc(sale.client)} · ${sale.id} / ${number}</h2>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Valor</th><th>Forma</th><th>Situação</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : '<div class="empty">Nenhum pagamento nesta parcela.</div>'}${waiverNote}`);
  }

  // ---------- desfazer ----------
  function undoConfirm(saleId, index, number) {
    const sale = findSale(saleId), payment = sale.payments[index];
    openModal(`<h2>Desfazer pagamento?</h2><p>Desfazer o pagamento de <b>${money(payment.amount)}</b> do dia <b>${dateLabel(payment.date)}</b> (${esc(payment.method)}) na parcela ${number} de ${sale.id}? O saldo desta parcela aumentará <b>${money(payment.amount - Number(payment.charges || 0))}</b>${payment.charges ? ` e a multa e os juros de ${money(payment.charges)} voltam a ser devidos` : ''}.${payment.dispensed ? ' A dispensa de multa e juros dada neste pagamento também é desfeita.' : ''} O pagamento fica no histórico como "desfeito" e o recibo dele é cancelado.</p><div class="actions"><button type="button" class="secondary" data-action="installment-history" data-sale="${sale.id}" data-installment="${number}">Voltar</button><button type="button" class="danger" data-action="undo-confirm" data-sale="${sale.id}" data-payment-index="${index}" data-installment="${number}">Desfazer pagamento</button></div>`);
  }

  function undo(saleId, index, number) {
    const sale = findSale(saleId), payment = sale.payments[index];
    payment.voided = true;
    payment.voidedAt = today();
    // a dispensa de multa e juros dada neste pagamento volta junto (a parcela volta ao estado anterior)
    if (payment.dispensed && !sale.payments.some(p => p !== payment && !p.voided && p.installment === payment.installment && p.dispensed) && sale.waivers) delete sale.waivers[payment.installment];
    recalcSale(sale);
    const receipt = App.receipts.cancelFor(payment);
    save();
    App.ui.back('receivables');
    // recibo com vários pagamentos: os outros continuam valendo e podem ganhar um recibo novo
    const others = receipt ? App.receipts.paymentsOf(receipt.number) : [];
    if (others.length) {
      openModal(`<h2>Recibo nº ${App.receipts.pad(receipt.number)} cancelado</h2><p>Esse recibo também cobria ${others.length === 1 ? 'outro pagamento, que continua valendo' : `outros ${others.length} pagamentos, que continuam valendo`}. Quer emitir um <b>recibo novo</b> (com número novo) só com ${others.length === 1 ? 'ele' : 'eles'}?</p><div class="actions"><button type="button" class="secondary" data-action="installment-history" data-sale="${saleId}" data-installment="${number}">Agora não</button><button type="button" class="primary" data-action="reissue-receipt" data-number="${receipt.number}">Emitir recibo novo</button></div>`);
      return;
    }
    installmentHistory(saleId, number);
  }

  // ---------- botão verde "Registrar pagamento" (topo): o cliente paga um valor e o sistema sugere a divisão ----------
  // Ordem sugerida: parcelas atrasadas primeiro (da mais antiga), depois as que vencem mais perto. Dentro de cada parcela,
  // multa e juros são quitados antes do valor da parcela.
  function visitWindow(selected, keep = {}) {
    const all = receivableItems();
    const clients = [...new Set(all.map(i => i.sale.client))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const client = selected && clients.includes(selected) ? selected : '';
    const date = keep.date || today(), method = keep.method || METHODS[0];
    const situation = client ? App.documents.situation(client, date) : null;
    const rows = !client ? [] : all.filter(i => i.sale.client === client).map(item => {
      const late = item.due < date, ch = late ? chargesFor(item.sale, item, date) : {fine: 0, interest: 0, collected: 0, owed: 0};
      return {item, sale: item.sale, number: item.number, late, ch, balance: round2(item.balance), owed: ch.owed};
    }).sort((a, b) => (b.late - a.late) || a.item.due.localeCompare(b.item.due) || a.sale.id.localeCompare(b.sale.id) || a.number - b.number);
    const label = sale => { const n = situation ? situation.purchases.findIndex(p => p.saleId === sale.id) + 1 : 0; return n ? App.documents.pill(n, sale.date) : ''; };

    const tableRows = rows.map((r, i) => `<tr data-row="${i}"><td>${label(r.sale)}</td><td>${r.sale.installments > 1 ? `parcela ${r.number} de ${r.sale.installments}` : 'à vista'}</td><td>${dateLabel(r.item.due)}${r.late ? ' <span class="badge warn">atrasada</span>' : ''}</td><td data-due="${i}"></td><td><input name="alloc${i}" type="number" min="0" step="0.01" class="alloc"></td><td>${r.late && r.owed > 0 ? `<label class="inline-check" title="O cliente paga só o valor da parcela, sem multa e juros"><input type="checkbox" name="waive${i}"> dispensar multa e juros <span class="hint">?</span></label>` : ''}</td></tr>`).join('');
    openModal(`<h2>Registrar pagamento</h2>${clients.length ? `<form id="visit-form" class="form-grid"><div class="field full"><label>Cliente <small>digite o nome para pesquisar</small></label><input name="client" list="visit-clients" autocomplete="off" placeholder="Digite o nome do cliente..." value="${esc(client)}"><datalist id="visit-clients">${clients.map(c => `<option value="${esc(c)}">`).join('')}</datalist><small id="visit-hint" class="negative" hidden></small></div>${client ? `<div class="field"><label>Valor recebido (R$) *</label><input name="amount" type="number" min="0" step="0.01" required></div><div class="field"><label>Data do pagamento *</label><input name="date" type="date" value="${date}" max="${today()}" required></div><div class="field"><label>Forma de pagamento</label><select name="method">${METHODS.map(m => `<option ${m === method ? 'selected' : ''}>${m}</option>`).join('')}</select></div><div class="field full" id="visit-table"><p class="muted">Divisão sugerida: atrasadas primeiro (da mais antiga), depois as que vencem mais perto. Você pode ajustar os valores antes de confirmar.</p><div class="table-wrap"><table><thead><tr><th>Compra</th><th>Parcela</th><th>Vencimento</th><th>Devido hoje</th><th>Aplicar (R$)</th><th></th></tr></thead><tbody>${tableRows}</tbody></table></div><p id="visit-sum" class="muted"></p></div><div class="field full motive-box" id="motive-box" hidden><label>Por que você está dispensando a multa e os juros? <small>opcional</small></label><input name="motive" placeholder="Ex.: cliente avisou antes · combinado por mensagem · cliente antigo"><small class="muted">Só você vê isto: não aparece no recibo nem para o cliente.</small></div><p class="negative field full" id="visit-error" hidden></p><div class="actions field full"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary">Confirmar recebimento</button></div>` : '<p class="muted full">Escolha um cliente para ver as parcelas em aberto.</p>'}</form>` : '<div class="empty">Nenhuma parcela em aberto. Pix, dinheiro e cartão já nascem pagos; só o carnê gera parcelas a receber.</div>'}`);
    const form = byId('visit-form');
    if (!form) return;
    form.elements.client.onchange = () => {
      const typed = form.elements.client.value.trim(), match = clients.find(c => c.toLowerCase() === typed.toLowerCase());
      if (match) { visitWindow(match); return; }
      const hint = byId('visit-hint');
      hint.textContent = typed ? 'Nenhum cliente com parcela em aberto com esse nome. Escolha um da lista.' : '';
      hint.hidden = !typed;
    };
    if (!client) { App.ui.groupFields(form, [{kind: 'client', title: 'Cliente', items: ['client']}]); form.elements.client.focus(); return; }
    App.ui.groupFields(form, [{kind: 'client', title: 'Cliente', items: ['client']}, {kind: 'pay', title: 'Pagamento e divisão', items: ['amount', 'date', 'method', '#visit-table', 'motive']}]);

    const f = form.elements;
    const dueOf = (r, waived) => round2(r.balance + (waived ? 0 : r.owed));
    // Divisão sugerida do valor recebido.
    const suggest = () => {
      byId('motive-box').hidden = !rows.some((r, i) => f[`waive${i}`] && f[`waive${i}`].checked);
      let left = round2(Number(f.amount.value) || 0);
      rows.forEach((r, i) => {
        const waived = !!(f[`waive${i}`] && f[`waive${i}`].checked), due = dueOf(r, waived);
        byId('visit-table').querySelector(`[data-due="${i}"]`).textContent = money(due);
        const apply = Math.min(left, due);
        f[`alloc${i}`].value = apply > 0 ? apply : '';
        left = round2(left - apply);
      });
      summary();
    };
    const summary = () => {
      const applied = round2(rows.reduce((total, r, i) => total + (Number(f[`alloc${i}`].value) || 0), 0)), amount = round2(Number(f.amount.value) || 0);
      const diff = round2(amount - applied);
      byId('visit-sum').innerHTML = `Aplicado <b>${money(applied)}</b> de <b>${money(amount)}</b> recebidos${near(diff, 0) ? ' ✓' : diff > 0 ? ` · <span class="negative">sobram ${money(diff)} sem parcela</span>` : ` · <span class="negative">faltam ${money(-diff)}</span>`}`;
    };
    form.addEventListener('input', event => {
      const name = event.target.name || '';
      if (name === 'amount' || name.startsWith('waive')) suggest();
      else if (name.startsWith('alloc')) summary();
    });
    form.elements.date.addEventListener('change', () => visitWindow(client, {date: f.date.value, method: f.method.value, amount: f.amount.value, motive: f.motive.value, waived: rows.filter((r, i) => f[`waive${i}`] && f[`waive${i}`].checked).map(r => `${r.sale.id}#${r.number}`)}));   // trocar a data não perde o que já foi marcado
    if (keep.amount) f.amount.value = keep.amount;
    if (keep.motive) f.motive.value = keep.motive;
    rows.forEach((r, i) => { if (f[`waive${i}`] && (keep.waived || []).includes(`${r.sale.id}#${r.number}`)) f[`waive${i}`].checked = true; });
    suggest();

    const showError = message => { const box = byId('visit-error'); box.textContent = message; box.hidden = false; };
    form.onsubmit = event => {
      event.preventDefault();
      const amount = round2(Number(f.amount.value) || 0), motive = f.motive.value.trim();
      if (!(amount > 0)) return showError('Digite um valor maior que zero.');
      if (f.date.value > today()) return showError('A data do pagamento não pode ser no futuro.');
      const parts = rows.map((r, i) => ({r, i, alloc: round2(Number(f[`alloc${i}`].value) || 0), waived: !!(f[`waive${i}`] && f[`waive${i}`].checked)})).filter(p => p.alloc > 0);
      const applied = round2(parts.reduce((total, p) => total + p.alloc, 0));
      if (!near(applied, amount)) return showError(`A divisão não bate: aplicado ${money(applied)} de ${money(amount)} recebidos.`);
      const early = parts.find(p => f.date.value < p.r.sale.date);
      if (early) return showError(`A data do pagamento não pode ser antes da venda ${early.r.sale.id} (${dateLabel(early.r.sale.date)}).`);
      const over = parts.find(p => p.alloc > dueOf(p.r, p.waived) + 0.004);
      if (over) return showError(`O valor aplicado na ${over.r.sale.id} (parcela ${over.r.number}) é maior que o devido (${money(dueOf(over.r, over.waived))}).`);
      const entries = parts.map(p => {
        const {r, alloc, waived} = p, charges = waived ? 0 : Math.min(alloc, r.owed);
        const payment = {amount: alloc, date: f.date.value, method: f.method.value, installment: r.number, ...(charges > 0 ? {charges: round2(charges)} : {})};
        if (waived) payment.dispensed = true;
        return {sale: r.sale, payment, info: {ch: r.ch, rules: chargeRules(r.sale, r.number), waived}, number: r.number};
      });
      for (const e of entries) {
        e.sale.payments = e.sale.payments || [];
        e.sale.payments.push(e.payment);
        if (e.info.waived) { e.sale.waivers = e.sale.waivers || {}; e.sale.waivers[e.number] = {fine: true, interest: true, date: today(), motive}; }
        recalcSale(e.sale);
      }
      const receipts = App.receipts.issueVisit(entries);
      save();
      closeModal();
      App.ui.back('receivables');
      App.receipts.show(receipts[0].number);
    };
  }
  App.ui.registerAction('new-payment', () => visitWindow(''));
  App.ui.registerAction('reissue-receipt', element => {
    const receipts = App.receipts.reissueRemaining(Number(element.dataset.number));
    closeModal();
    if (receipts.length) App.receipts.show(receipts[0].number);
  });

  // Botões "Receber" (data-pay="V0001" data-installment="2")
  App.ui.onClick('[data-pay]', element => paymentForm(element.dataset.pay, installmentOf(element)));
  App.ui.registerAction('installment-history', element => installmentHistory(element.dataset.sale, installmentOf(element)));
  App.ui.registerAction('undo-payment', element => undoConfirm(element.dataset.sale, Number(element.dataset.paymentIndex), installmentOf(element)));
  App.ui.registerAction('undo-confirm', element => undo(element.dataset.sale, Number(element.dataset.paymentIndex), installmentOf(element)));

  App.payments = {paymentForm, installmentHistory, visitWindow};
})();
