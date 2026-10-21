// Tela "Regras de cobrança" (Financeiro): valores padrão de multa e juros por atraso.
// Cada cobrança (botão Receber de uma parcela vencida) pode mudar esses valores só para aquela parcela.
(() => {
  const App = (window.App = window.App || {});
  const {money} = App.format;
  const {data, save} = App.store;
  const {round2} = App.finance;
  const {byId} = App.ui;

  function render() {
    const rule = data.settings.collection;
    byId('app').innerHTML = `<section class="panel"><h2>Regras de cobrança</h2><p class="muted">Multa: uma vez só. Juros: por mês, proporcionais aos dias. Dentro da tolerância, nada é cobrado.</p><form id="collection-form" class="form-grid"><div class="field"><label>Multa por atraso (%)</label><input name="fine" type="number" min="0" step="0.01" value="${rule.fine}"></div><div class="field"><label>Juros por mês de atraso (%)</label><input name="interest" type="number" min="0" step="0.01" value="${rule.interest}"></div><div class="field"><label>Dias de tolerância <small>antes de começar a cobrar</small></label><input name="grace" type="number" min="0" step="1" value="${rule.grace || 0}"></div><p class="negative field full" id="collection-warning" hidden></p><div class="field full"><div class="simulator-result" id="collection-example"></div></div><div class="actions field full"><button class="primary">Salvar regras de cobrança</button></div></form></section><section class="panel"><h3>O que é bom saber (informação geral, não é aconselhamento jurídico; confirme com o seu contador)</h3><ul class="muted"><li><b>Multa:</b> o Código de Defesa do Consumidor (art. 52, §1º) limita a multa de mora a <b>2%</b> do valor da prestação nos contratos de crédito ao consumidor.</li><li><b>Juros:</b> precisam ser <b>combinados e informados antes</b> (por isso a regra aparece no recibo e na mensagem de cobrança). 1% ao mês é a referência mais usada.</li><li><b>Cobrança:</b> o CDC (art. 42) proíbe expor o cliente a ridículo ou constrangimento. Cobre de forma individual e educada, nunca em grupos.</li></ul></section>`;

    const form = byId('collection-form');
    // Exemplo com números: parcela de R$ 600 vencida há 45 dias.
    const refresh = () => {
      const fine = Number(form.elements.fine.value) || 0, interest = Number(form.elements.interest.value) || 0;
      const fineValue = round2(600 * fine / 100), interestValue = round2(600 * interest / 100 * 45 / 30);
      byId('collection-example').innerHTML = `<b>Exemplo:</b> parcela de ${money(600)} vencida há 45 dias → multa ${money(fineValue)} + juros ${money(interestValue)} = <b>${money(600 + fineValue + interestValue)}</b>.`;
      const warning = byId('collection-warning');
      warning.hidden = fine <= 2;
      warning.textContent = fine > 2 ? 'Atenção: o Código de Defesa do Consumidor limita a multa de mora a 2% nos contratos de crédito ao consumidor. Confirme com o seu contador antes de usar mais que isso.' : '';
    };
    form.addEventListener('input', refresh);
    refresh();

    form.onsubmit = event => {
      event.preventDefault();
      data.settings.collection = {fine: Number(form.elements.fine.value) || 0, interest: Number(form.elements.interest.value) || 0, grace: Math.max(0, Math.round(Number(form.elements.grace.value) || 0))};
      save();
      alert('Regras de cobrança salvas.');
      App.ui.go('collection');
    };
  }

  App.ui.registerScreen('collection', render);
})();
