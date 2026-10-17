// Campos de valor em dinheiro com "R$ 1.234,56" (SPECS 33.1), no estilo dos aplicativos de banco: a pessoa digita só os números e eles
// entram da direita para a esquerda (1, 5, 0, 0 mostra R$ 0,01, R$ 0,15, R$ 1,50, R$ 15,00).
// Como funciona (sem mexer em nenhuma conta): cada campo numérico de dinheiro ganha um "espelho" de texto, que é o que a pessoa vê e digita.
// O campo original continua escondido e guardando o número simples (15.5), então TODO o resto do sistema (contas, salvar, listas) lê o
// mesmo valor de sempre. Quando o sistema preenche o campo sozinho, o espelho acompanha. Analogia: é uma tela bonita na frente do mesmo cofre.
(() => {
  const App = (window.App = window.App || {});

  // Quais campos são dinheiro (pelo nome). Porcentagens (taxas, juros, margem), quantidades e dias NÃO entram.
  const MONEY = /^(itemAmount\d+|itemCost\d+|cost\d*|price|amount|entry|discount|meiLimit|dasValue|os_diagnosisFee|alloc\d+)$/;
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const MAX_DIGITS = 12;

  const format = cents => cents === null ? '' : `R$ ${(cents / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  const centsOf = value => { const text = String(value ?? '').trim(); if (text === '') return null; const n = Number(text); return Number.isFinite(n) ? Math.round(n * 100) : null; };

  function enhance(input) {
    if (input.dataset.moneyDone || !MONEY.test(input.name || '')) return;
    input.dataset.moneyDone = '1';
    const mirror = document.createElement('input');
    mirror.type = 'text';
    mirror.setAttribute('inputmode', 'numeric');
    mirror.autocomplete = 'off';
    mirror.className = `${input.className ? input.className + ' ' : ''}money-mirror`.trim();
    mirror.placeholder = input.placeholder || 'R$ 0,00';
    mirror.required = input.required; mirror.disabled = input.disabled; mirror.readOnly = input.readOnly;
    if (input.title) mirror.title = input.title;
    // O original nunca pode ficar "inválido e escondido" (o navegador não acha onde mostrar o aviso): quem valida é o espelho, que herda o
    // "obrigatório" e os limites (mínimo e máximo, como "não receber mais que o saldo"). O espelho vem ANTES do original na tela.
    const limits = {min: null, max: null};
    const takeLimits = () => {
      ['min', 'max'].forEach(key => { if (input.hasAttribute(key)) { limits[key] = Number(input.getAttribute(key)); input.removeAttribute(key); } });
      if (input.hasAttribute('required')) { mirror.required = true; input.removeAttribute('required'); }
    };
    const validate = () => {
      const raw = nativeValue.get.call(input), v = Number(raw);
      let message = '';
      if (raw !== '' && Number.isFinite(v)) {
        if (limits.max !== null && v > limits.max + 1e-9) message = `O valor deve ser menor ou igual a ${format(Math.round(limits.max * 100))}.`;
        else if (limits.min !== null && v < limits.min - 1e-9) message = `O valor deve ser maior ou igual a ${format(Math.round(limits.min * 100))}.`;
      }
      mirror.setCustomValidity(message);
    };
    input.setAttribute('step', 'any');   // sem step o padrão é 1 (e 1500.5 seria "inválido"); com any aceita qualquer valor
    takeLimits();
    const label = input.closest('.field') && input.closest('.field').querySelector('label');
    if (label) mirror.setAttribute('aria-label', label.textContent.trim().slice(0, 80));
    input.before(mirror);

    // O desconto da venda pode ser em R$ ou em %: a máscara só vale em R$ (em % aparece o campo numérico de sempre).
    const typeSelect = input.name === 'discount' && input.form ? input.form.elements.discountType : null;
    const active = () => !typeSelect || typeSelect.value === 'money';
    const show = () => { const on = active(); input.hidden = on; mirror.hidden = !on; mirror.value = on ? format(centsOf(nativeValue.get.call(input))) : ''; };
    if (typeSelect) typeSelect.addEventListener('change', show);

    // Quando o sistema muda o valor por código (preço sugerido, saldo...), o espelho acompanha.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return nativeValue.get.call(this); },
      set(value) { nativeValue.set.call(this, value); if (active()) mirror.value = format(centsOf(value)); validate(); }
    });
    const focusMirror = () => (active() ? mirror.focus() : HTMLInputElement.prototype.focus.call(input));
    input.focus = focusMirror;

    mirror.addEventListener('input', event => {
      event.stopPropagation();
      const digits = mirror.value.replace(/\D/g, '').slice(0, MAX_DIGITS), cents = digits === '' ? null : Number(digits);
      mirror.value = format(cents);
      nativeValue.set.call(input, cents === null ? '' : String(cents / 100));
      mirror.setSelectionRange(mirror.value.length, mirror.value.length);
      validate();
      input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    mirror.addEventListener('change', event => { event.stopPropagation(); input.dispatchEvent(new Event('change', {bubbles: true})); });
    mirror.addEventListener('focus', () => requestAnimationFrame(() => mirror.setSelectionRange(mirror.value.length, mirror.value.length)));

    // classes (como "auto", o azul de preenchido sozinho), bloqueios e dicas do original passam para o espelho
    const copyState = () => {
      mirror.className = `${[...input.classList].join(' ')} money-mirror`.trim();
      mirror.disabled = input.disabled; mirror.readOnly = input.readOnly;
      if (input.placeholder) mirror.placeholder = input.placeholder;
      takeLimits(); validate();   // o sistema pode mudar o máximo (ex.: saldo da parcela) depois que o campo já existe
    };
    new MutationObserver(copyState).observe(input, {attributes: true, attributeFilter: ['class', 'disabled', 'readonly', 'placeholder', 'min', 'max', 'required']});
    show(); validate();
  }

  function enhanceAll(root) { root.querySelectorAll('input[type="number"]').forEach(enhance); }

  let queued = false;
  function schedule() { if (!queued) { queued = true; Promise.resolve().then(() => { queued = false; ['app', 'modal-content'].forEach(id => { const el = document.getElementById(id); if (el) enhanceAll(el); }); }); } }
  ['app', 'modal-content'].forEach(id => { const el = document.getElementById(id); if (el) new MutationObserver(schedule).observe(el, {childList: true, subtree: true}); });

  App.moneyInput = {format, centsOf, enhanceAll, MONEY};
})();
