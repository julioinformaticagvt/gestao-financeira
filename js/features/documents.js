// Documentos para o cliente: Recibo de pagamento e Extrato da conta (SPECS, seção 17).
// Os dois têm a mesma identidade visual (faixa escura, valor grande, faixa cinza com seções) e saem em PDF
// pela impressão do navegador ("Salvar como PDF"). Aqui ficam: a "situação" de um cliente (compras, atrasos e
// próximos vencimentos), as etiquetas coloridas de compra, o HTML dos documentos e as mensagens de WhatsApp.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc, dateLabel, today, sum} = App.format;
  const {data} = App.store;
  const {activeSales, installmentsFor, chargesFor, daysBetween, round2} = App.finance;

  const LIMITS = {receiptUpcoming: 3, extractUpcoming: 5, earlyDays: 7};
  const dm = date => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const list = items => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const pad = number => String(number).padStart(4, '0');
  // O cliente nunca vê "PIX PJ" / "PIX PF" (isso é só controle interno de qual conta recebeu): para ele é só "Pix".
  const customerMethod = method => /^pix/i.test(String(method || '')) ? 'Pix' : String(method || '');

  // ---------- etiquetas de compra (cada compra, uma cor; a cor sempre vem com o texto) ----------
  const COLORS = [['#2a5db0', '#e8eefa'], ['#7b3fa0', '#f1e9f7'], ['#a85a00', '#faf0e1'], ['#00798c', '#e1f3f6'], ['#b03a78', '#f8e8f0']];
  const pill = (n, date) => { const [fg, bg] = COLORS[(n - 1) % COLORS.length]; return `<span class="pill" style="color:${fg};background:${bg}"><i style="background:${fg}"></i>Compra ${n} · ${dm(date)}</span>`; };

  // Itens da compra resumidos: "A e B", "A, B e +2 itens", "2× Mouse".
  function itemsText(sale) {
    const names = (sale.items || []).filter(i => i.name).map(i => `${(i.qty || 1) > 1 ? `${i.qty}× ` : ''}${i.name}`);
    if (!names.length) return sale.product || 'Venda';
    return names.length <= 2 ? names.join(' e ') : `${names.slice(0, 2).join(', ')} e +${names.length - 2} ${names.length - 2 === 1 ? 'item' : 'itens'}`;
  }

  // ---------- situação do cliente numa data ----------
  // alsoSales: compras que entram mesmo quitadas (as pagas hoje, no recibo).
  function situation(client, asOf = today(), alsoSales = []) {
    const sales = activeSales().filter(s => s.client === client).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const purchases = [], late = [], upcoming = [];
    for (const sale of sales) {
      const open = installmentsFor(sale).filter(i => i.balance > 0.004);
      if (!open.length && !alsoSales.includes(sale.id)) continue;
      const lateItems = open.filter(i => i.due < asOf);
      purchases.push({saleId: sale.id, date: sale.date, total: sale.total, paid: sale.paid, remaining: round2(sum(open, i => i.balance)), overdue: round2(sum(lateItems, i => i.balance)), closed: !open.length, itemsText: itemsText(sale)});
      for (const item of open) {
        const row = {saleId: sale.id, saleDate: sale.date, installment: item.number, of: sale.installments, due: item.due, value: round2(item.balance)};
        if (item.due < asOf) { const ch = chargesFor(sale, item, asOf); late.push({...row, days: daysBetween(item.due, asOf), fine: ch.fine, interest: ch.interest, owed: ch.owed, updated: round2(item.balance + ch.owed), rule: App.finance.chargeRules(sale, item.number)}); }
        else upcoming.push(row);
      }
    }
    const byDue = (a, b) => a.due.localeCompare(b.due) || a.saleId.localeCompare(b.saleId) || a.installment - b.installment;
    late.sort(byDue); upcoming.sort(byDue);
    return {purchases, late, upcoming, totalOpen: round2(sum(purchases, p => p.remaining)), totalLate: round2(sum(late, l => l.updated))};
  }

  // ---------- pedaços de HTML dos documentos ----------
  const numberOf = (purchases, saleId) => purchases.findIndex(p => p.saleId === saleId) + 1;
  const section = (title, body) => `<section class="doc-sec"><h4>${title}</h4>${body}</section>`;

  function header(kind, big, date, eco) {
    const b = data.settings.business, blank = (v, n) => v ? esc(v) : `[${n}]`, name = (b.name || '').trim() || 'Meu negócio';
    // logo: a escolhida em Configurações; a logo de arquivo (assets/logo.png) só vale para o sistema que já a usava (settings.useDefaultLogo);
    // sem logo, o documento mostra o nome do negócio em texto.
    const logo = App.branding.logoFor('pdf'), src = logo ? logo.src : (data.settings.useDefaultLogo ? 'assets/logo.png' : '');
    return `<div class="doc-head"><div class="doc-brand">${eco || !src ? `<strong class="doc-eco-name">${esc(name)}</strong>` : `<img class="doc-logo" alt="${esc(name)}" src="${src}"${src === 'assets/logo.png' ? ` onerror="this.replaceWith(Object.assign(document.createElement('strong'),{className:'doc-eco-name',textContent:this.alt}))"` : ''}>`}<div class="doc-small">CNPJ ou CPF ${blank(b.cnpj, 'CNPJ ou CPF')}<br>${blank(b.phone, 'telefone')} · ${blank(b.instagram, 'Instagram')}</div></div><div class="doc-id"><small>${kind}</small><strong>${esc(big)}</strong><span>${dateLabel(date)}</span></div></div>`;
  }
  const frame = (head, main, details, eco) => `<div class="doc${eco ? ' eco' : ''}" id="doc-root">${head}<div class="doc-main">${main}</div><div class="doc-details">${details}</div></div>`;

  // Situação de cada compra (tabela) + total em aberto.
  function purchasesTable(purchases) {
    if (!purchases.length) return '';
    const rows = purchases.map((p, i) => {
      const remaining = p.closed ? '<b class="doc-ok">Compra quitada</b>' : p.overdue > 0 ? `<b class="doc-bad">${money(p.remaining)}</b><small class="doc-bad">${money(p.overdue)} em atraso</small>` : `<b>${money(p.remaining)}</b>`;
      return `<tr><td>${pill(i + 1, p.date)}</td><td class="num">${money(p.total)}</td><td class="num doc-ok">${money(p.paid)}</td><td class="num doc-rest">${remaining}</td></tr>`;
    }).join('');
    return section('Situação de cada compra', `<table class="doc-table"><thead><tr><th>Compra</th><th class="num">Total</th><th class="num">Já pago</th><th class="num">Falta pagar</th></tr></thead><tbody>${rows}<tr class="doc-total"><td colspan="3">Total em aberto</td><td class="num"><strong>${money(sum(purchases, p => p.remaining))}</strong></td></tr></tbody></table>`);
  }

  // Próximos vencimentos (limit linhas + linha-resumo "E mais N parcelas da Compra 2, em ...").
  function upcomingList(upcoming, purchases, limit) {
    if (!upcoming.length) return '';
    const shown = upcoming.slice(0, limit), rest = upcoming.slice(limit);
    const rows = shown.map(u => `<div class="doc-row"><strong>${dateLabel(u.due)}</strong>${pill(numberOf(purchases, u.saleId), u.saleDate)}<span class="doc-muted">parcela ${u.installment} de ${u.of}</span><span class="doc-amount">${money(u.value)}</span></div>`).join('');
    const bySale = {};
    rest.forEach(u => { (bySale[u.saleId] = bySale[u.saleId] || []).push(u); });
    const more = Object.entries(bySale).map(([id, items]) => `E mais ${plural(items.length, 'parcela', 'parcelas')} da Compra ${numberOf(purchases, id)}, em ${list(items.map(u => dateLabel(u.due)))}.`).join(' ');
    return section('Próximos vencimentos', `${rows}${more ? `<p class="doc-note">${more}</p>` : ''}`);
  }

  // Caixa vermelha de atraso. withCalc = true no extrato (mostra o cálculo do dia); false no recibo (só avisa).
  function lateBox(late, purchases, withCalc) {
    if (!late.length) return '';
    const one = l => {
      const head = `<div class="doc-row"><strong>Venceu em ${dateLabel(l.due)}</strong>${pill(numberOf(purchases, l.saleId), l.saleDate)}<span class="doc-muted">parcela ${l.installment} de ${l.of}${withCalc ? ` · ${plural(l.days, 'dia', 'dias')} de atraso` : ''}</span></div>`;
      if (!withCalc) return `${head}<p class="doc-bad doc-strong">${money(l.value)} · ${plural(l.days, 'dia', 'dias')} de atraso</p>`;
      return `${head}<table class="doc-calc"><tr><td>Valor da parcela</td><td>${money(l.value)}</td></tr><tr><td>Multa de ${l.rule.fine}%</td><td>${money(l.fine)}</td></tr><tr><td>Juros de ${l.rule.interest}% ao mês (${plural(l.days, 'dia', 'dias')})</td><td>${money(l.interest)}</td></tr><tr class="doc-bad doc-strong"><td>Valor atualizado hoje</td><td>${money(l.updated)}</td></tr></table>`;
    };
    return section(withCalc ? 'Em atraso' : 'Ainda em atraso', `<div class="doc-alert"><p class="doc-alert-title">ATENÇÃO: PARCELA EM ATRASO</p>${late.map(one).join('')}${withCalc ? '' : '<p class="doc-muted">Multa e juros serão calculados na data do pagamento.</p>'}</div>`);
  }

  // ---------- RECIBO ----------
  // Recibo antigo (sem "lines"): monta as linhas a partir do que ele já guardava.
  const linesOf = r => r.lines || [{kind: r.installments ? (r.installments.number ? 'parcela' : 'entrada') : 'vista', saleId: r.saleId, installment: r.installments ? r.installments.number : 0, of: r.installments ? r.installments.count : 1, value: r.amount - (r.charges || 0), charges: r.charges || 0, items: r.items, legacy: true}];

  function receiptDocument(r, eco) {
    const lines = linesOf(r), after = r.after, b = r.business || data.settings.business;
    const installmentSale = lines.some(l => l.kind !== 'vista') && after;
    const main = `<p class="doc-label">RECIBO DE PAGAMENTO</p><p class="doc-lead-2">Comprovante de pagamento no valor de</p><p class="doc-value">${money(r.amount)}</p><p class="doc-who">Recebido de <b>${esc(r.client)}</b></p><p class="doc-muted">Pago em ${dateLabel(r.date)} · ${esc(customerMethod(r.method))}</p>${r.canceled ? '<p class="doc-bad doc-strong">RECIBO CANCELADO</p>' : ''}`;
    const lead = '<p class="doc-lead">Detalhes do pagamento e situação da sua conta</p>';
    const foot = `<p class="doc-foot">Este recibo comprova o recebimento do valor pago hoje. Obrigado pela confiança!</p>`;
    const warranty = r.warranty || (installmentSale ? '' : '[prazo da garantia]');

    if (!installmentSale) {   // venda à vista: recibo simples
      const items = (lines[0].items || r.items || []).map(i => `<tr><td>${esc(i.name || 'Item')}</td><td class="num">${i.qty || 1}</td><td class="num">${money(i.amount)}</td></tr>`).join('');
      const first = lines[0];
      const note = first.kind === 'entrada' ? '<p class="doc-note">Este recibo é da entrada da venda.</p>' : '';
      const body = section('Itens', `<table class="doc-table"><thead><tr><th>Item</th><th class="num">Qtd.</th><th class="num">Valor</th></tr></thead><tbody>${items}</tbody></table>${note}`)
        + section('Pagamento', `<div class="doc-row"><span>Forma de pagamento</span><span class="doc-amount">${esc(customerMethod(r.method))}</span></div><div class="doc-row"><span>Pago em</span><span class="doc-amount">${dateLabel(r.date)}</span></div>${r.discount > 0 ? `<div class="doc-row"><span>Desconto</span><span class="doc-amount doc-ok">− ${money(r.discount)}</span></div>` : ''}${warranty ? `<div class="doc-row"><span>Garantia</span><span class="doc-amount">${esc(warranty)}</span></div>` : ''}`);
      return frame(header('Recibo', `nº ${pad(r.number)}`, r.date, eco), main, lead + body + foot, eco);
    }

    const purchases = after.purchases;
    const blocks = lines.map(l => {
      const n = numberOf(purchases, l.saleId), purchase = purchases[n - 1] || {date: l.saleDate};
      const title = l.kind === 'entrada' ? 'Entrada' : `Parcela ${l.installment} de ${l.of}`;
      let due = '';
      if (l.kind !== 'entrada') {
        if (l.daysLate > 0) due = `<p class="doc-bad">Venceu em ${dateLabel(l.due)} · paga com ${plural(l.daysLate, 'dia', 'dias')} de atraso</p>`;
        else due = `<p class="doc-muted">Vencimento: ${dateLabel(l.due)}${l.early > LIMITS.earlyDays ? ' · pago antecipado' : ''}</p>`;
      }
      let calc = '';
      if (l.daysLate > 0) {
        const rows = [`<tr><td>Valor da parcela</td><td>${money(l.value)}</td></tr>`];
        if (l.waived) rows.push('<tr><td>Multa e juros</td><td class="doc-ok">Dispensados</td></tr>');
        else if (l.breakdown) rows.push(`<tr><td>Multa de ${l.rule.fine}%</td><td>${money(l.fine)}</td></tr>`, `<tr><td>Juros de ${l.rule.interest}% ao mês (${plural(l.daysLate, 'dia', 'dias')})</td><td>${money(l.interest)}</td></tr>`);
        else if (l.charges > 0) rows.push(`<tr><td>Multa e juros pagos</td><td>${money(l.charges)}</td></tr>`);
        calc = `<table class="doc-calc">${rows.join('')}</table>`;
      }
      return `<div class="doc-block"><div class="doc-block-top">${pill(n, purchase.date)}<strong class="doc-amount">${money(round2(l.value + (l.waived ? 0 : l.charges)))}</strong></div><p class="doc-title">${title}</p><p class="doc-muted">${esc(l.itemsText || '')}</p>${due}${calc}</div>`;
    }).join('');
    const applied = r.applied ? '<p class="doc-note">O valor pago foi aplicado primeiro à parcela mais antiga em atraso.</p>' : '';
    let body = section(lines.length > 1 ? 'Parcelas pagas hoje' : 'Parcela paga hoje', blocks + applied);
    body += lateBox(after.late, purchases, false) + purchasesTable(purchases) + upcomingList(after.upcoming, purchases, LIMITS.receiptUpcoming);
    if (!r.canceled && settlement(r).kind === 'all') body += '<p class="doc-allpaid">Todas as contas quitadas. Obrigado!</p>';
    const garantia = (r.discount > 0 ? `<p class="doc-note doc-ok">Desconto concedido na compra: − ${money(r.discount)}</p>` : '') + (warranty ? `<p class="doc-note">Garantia: ${esc(warranty)}</p>` : '');
    return frame(header('Recibo', `nº ${pad(r.number)}`, r.date, eco), main, lead + body + garantia + foot, eco);
  }

  // ---------- EXTRATO ----------
  function extractDocument(client, asOf = today(), eco = false) {
    const s = situation(client, asOf), n = s.purchases.length;
    const clean = !s.purchases.length;
    const main = `<p class="doc-label">EXTRATO DA CONTA</p><p class="doc-lead-2">Situação de <b>${esc(client)}</b> em ${dateLabel(asOf)}</p>${clean
      ? '<p class="doc-value doc-ok-big">Sem pendências</p><p class="doc-who">Nenhuma parcela em aberto.</p>'
      : `<p class="doc-value">${money(s.totalOpen)}</p><p class="doc-who">em aberto, em ${plural(n, 'compra', 'compras')}</p>${s.late.length ? `<p class="doc-bad">${money(s.totalLate)} já estão em atraso, com multa e juros até hoje</p>` : ''}`}`;
    const lead = '<p class="doc-lead">Compras, atrasos e próximos vencimentos</p>';
    const body = clean ? '' : lateBox(s.late, s.purchases, true) + purchasesTable(s.purchases) + upcomingList(s.upcoming, s.purchases, LIMITS.extractUpcoming);
    const foot = '<p class="doc-foot">Este extrato mostra a situação da conta na data indicada. Valores com atraso mudam a cada dia.</p>';
    return frame(header('Extrato', client, asOf, eco), main, lead + body + foot, eco);
  }

  // ---------- mensagens de WhatsApp ----------
  const businessName = () => (data.settings.business.name || '').trim() || 'nossa empresa';

  // Como o recibo termina: venda à vista, pagou parte, quitou uma (ou mais) compra(s) ou quitou TUDO.
  // Usa a "foto" do recibo (situação do dia do pagamento); recibo antigo usa a situação de hoje.
  function settlement(r) {
    const lines = linesOf(r), saleIds = [...new Set(lines.map(l => l.saleId))];
    if (lines.every(l => l.kind === 'vista')) return {kind: 'vista'};
    const after = r.after || (() => { const s = situation(r.client, r.date, saleIds); return {purchases: s.purchases}; })();
    const closedNow = after.purchases.filter(p => saleIds.includes(p.saleId) && p.closed);
    const stillOpen = after.purchases.filter(p => !p.closed);
    const remaining = round2(sum(stillOpen, p => p.remaining));
    if (!stillOpen.length) return {kind: 'all', closedNow};
    return {kind: closedNow.length ? 'purchase' : 'part', closedNow, remaining, openCount: stillOpen.length};
  }
  const closedText = closed => closed.length === 1
    ? `a sua compra de ${closed[0].itemsText} (${dm(closed[0].date)}) está quitada`
    : `as suas compras de ${list(closed.map(p => `${p.itemsText} (${dm(p.date)})`))} estão quitadas`;

  function receiptMessage(r) {
    const b = data.settings.business, lines = linesOf(r);
    const sale = data.sales.find(s => s.id === lines[0].saleId), discount = Number(sale && sale.discount) || 0;
    const value = money(r.amount) + (discount > 0 ? ` (com ${money(discount)} de desconto)` : '');
    let text = b.receiptMessage.replaceAll('{cliente}', r.client).replaceAll('{negócio}', (r.business && r.business.name) || b.name || 'nossa empresa')
      .replaceAll('{valor}', value).replaceAll('{forma}', customerMethod(r.method)).replaceAll('{data}', dateLabel(r.date));
    const s = r.canceled ? {kind: 'vista'} : settlement(r);
    const remaining = s.remaining ? `\nAinda falta pagar: ${money(s.remaining)}, em ${plural(s.openCount, 'compra', 'compras')}.` : '';
    if (s.kind === 'all') text += `\n\nCom esse pagamento, todas as suas contas ficaram quitadas. Muito obrigado pela confiança e pela parceria! Estamos sempre à disposição.`;
    else if (s.kind === 'purchase') text += `\n\nCom esse pagamento, ${closedText(s.closedNow)}. Muito obrigado!${remaining}`;
    else if (s.kind === 'part') text += `\n\nMuito obrigado pelo pagamento!${remaining}`;
    else text += `\n\nMuito obrigado pela compra!`;
    return `${text}\n\nQualquer dúvida é só me chamar.`;
  }

  function extractMessage(client, asOf = today()) {
    const s = situation(client, asOf);
    if (!s.purchases.length) return `Olá, ${client}! Segue o extrato da sua conta na ${businessName()} em ${dateLabel(asOf)}. Você está sem pendências.\n\nQualquer dúvida é só me chamar.`;
    return `Olá, ${client}! Segue o extrato da sua conta na ${businessName()} em ${dateLabel(asOf)}.\n\nEm aberto: ${money(s.totalOpen)}${s.late.length ? `\nEm atraso, com multa e juros até hoje: ${money(s.totalLate)}` : ''}\n\nQualquer dúvida é só me chamar.`;
  }

  // Cobrança: um bloco por parcela atrasada e, se for mais de uma, o total atualizado.
  function collectionMessage(client, asOf = today()) {
    const late = situation(client, asOf).late;
    if (!late.length) return '';
    const block = l => `Passando para lembrar da parcela ${l.installment} de ${l.of}, que venceu em ${dateLabel(l.due)}.\n\nValor da parcela: ${money(l.value)}\nMulta (${l.rule.fine}%): ${money(l.fine)}\nJuros (${plural(l.days, 'dia', 'dias')}): ${money(l.interest)}\n*Valor atualizado hoje (${dm(asOf)}): ${money(l.updated)}*`;
    const total = late.length > 1 ? `\n\n*Total atualizado hoje (${dm(asOf)}): ${money(sum(late, l => l.updated))}*` : '';
    return App.messages.fill(App.messages.template('collection'), {cliente: client, detalhe: late.map(block).join('\n\n'), total, valor: money(sum(late, l => l.updated)), vencimento: dateLabel(late[0].due)});
  }

  // ---------- janela do documento: prévia, versão econômica, PDF e mensagem ----------
  function printDocument(fileName) {
    const previous = document.title;
    document.title = fileName;
    document.body.classList.add('printing-doc'); document.documentElement.classList.add('printing-doc');
    const done = () => { document.body.classList.remove('printing-doc'); document.documentElement.classList.remove('printing-doc'); document.title = previous; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch { done(); alert('Não consegui abrir a impressão. Use o menu do navegador e escolha Imprimir ou Salvar como PDF.'); }
    if (!/Chrome|Chromium/.test(navigator.userAgent)) setTimeout(done, 1000);
  }

  // build(eco) devolve o HTML do documento; message() devolve o texto do WhatsApp; extra = HTML de campos a mais.
  // message (opcional): sem ela, o documento não mostra a caixa de mensagem (relatórios). client (opcional): liga "Abrir no WhatsApp".
  function openDocument({title, fileName, build, message, extra = '', onExtra, client}) {
    const wa = client ? App.whatsapp.buttonHtml(client, 'doc-wa') : '';
    const messageBox = message ? `<div class="field"><label>Mensagem para o WhatsApp (editável)</label><textarea id="doc-message" class="message-box">${esc(message())}</textarea></div>` : '';
    App.ui.openModal(`<h2>${title}</h2><div class="doc-wrap" id="doc-preview">${build(false)}</div><div class="doc-controls">${extra}<label class="doc-eco-toggle"><input type="checkbox" id="doc-eco"> Versão econômica (sem fundo escuro, para imprimir em papel)</label>${messageBox}<div class="actions"><button type="button" class="primary" id="doc-pdf">Baixar PDF</button>${message ? '<button type="button" class="secondary" id="doc-copy">Copiar mensagem</button>' : ''}${wa}</div><p class="muted mobile-only">No celular: se o botão não abrir a impressão, use o menu do navegador (os três pontinhos ou Compartilhar) e escolha Imprimir ou Salvar como PDF.</p><p id="doc-status" class="positive"></p></div>`);
    document.querySelector('#modal .modal-card').classList.add('wide');
    // Cabe tudo na largura da tela (SPECS 33.3): se o documento passar da largura disponível (celular), ele é reduzido inteiro para caber em
    // uma tela só. Só na tela: no PDF e na impressão o tamanho não muda (css/documents.css).
    const fit = () => {
      const doc = document.querySelector('#modal .doc'), wrap = App.ui.byId('doc-preview');
      if (!doc || !wrap) return;
      doc.style.zoom = '';
      const available = wrap.clientWidth, needed = Math.max(doc.scrollWidth, ...[...doc.querySelectorAll('table')].map(table => table.scrollWidth));
      if (available > 0 && needed > available + 1) doc.style.zoom = String(Math.max(0.35, available / needed).toFixed(3));
    };
    const redraw = () => { App.ui.byId('doc-preview').innerHTML = build(App.ui.byId('doc-eco').checked); fit(); watchImages(); };
    const watchImages = () => App.ui.byId('doc-preview').querySelectorAll('img').forEach(image => { if (!image.complete) image.addEventListener('load', fit, {once: true}); });
    fit(); watchImages();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(App.ui.byId('doc-preview'));   // girar a tela refaz a medida
    App.ui.byId('doc-eco').onchange = redraw;
    App.ui.byId('doc-pdf').onclick = () => { printDocument(fileName); App.ui.byId('doc-status').textContent = 'Na janela que abriu, escolha "Salvar como PDF".'; };
    if (message) App.ui.byId('doc-copy').onclick = () => {
      const area = App.ui.byId('doc-message'), done = () => { App.ui.byId('doc-status').textContent = 'Mensagem copiada!'; };
      if (navigator.clipboard) navigator.clipboard.writeText(area.value).then(done); else { area.select(); document.execCommand('copy'); done(); }
    };
    const waButton = App.ui.byId('doc-wa');
    if (waButton) waButton.onclick = () => App.whatsapp.open(App.whatsapp.phoneOf(waButton.dataset.waClient), App.ui.byId('doc-message') ? App.ui.byId('doc-message').value : '');
    if (onExtra) onExtra({redraw, refreshMessage: () => { if (message) App.ui.byId('doc-message').value = message(); }});
  }

  function showExtract(client) {
    const asOf = today();
    openDocument({title: `Extrato da conta · ${esc(client)}`, fileName: `Extrato-${client.replace(/\s+/g, '-')}-${asOf}`, client, build: eco => extractDocument(client, asOf, eco), message: () => extractMessage(client, asOf)});
  }

  App.documents = {header, frame, section, customerMethod, settlement, LIMITS, COLORS, pill, itemsText, situation, receiptDocument, extractDocument, receiptMessage, extractMessage, collectionMessage, openDocument, showExtract, printDocument, linesOf, pad, dm};
})();
