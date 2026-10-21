// Medidor (barra) do limite do MEI: título, valor, porcentagem e barra. A cor da barra é fixa (identifica o medidor);
// o estado (ok / atenção / perigo / passou) aparece no TEXTO e num selo, nunca só na cor.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc} = App.format;
  const {data} = App.store;

  const STATES = {ok: 'Dentro do limite', warn: 'Atenção', danger: 'Perigo', over: 'Passou do limite'};

  // {title, value, limit, color, warnPct, alertPct, main, note, lines:[texto,...], overText}
  function meter(o) {
    const pct = o.limit > 0 ? o.value / o.limit * 100 : 0;
    const state = pct > 100 ? 'over' : pct >= o.alertPct ? 'danger' : pct >= o.warnPct ? 'warn' : 'ok';
    const pctText = `${pct.toFixed(1).replace('.', ',')}% do limite`;
    const label = `${o.title}: ${money(o.value)} de ${money(o.limit)}, ${pctText}. ${STATES[state]}.`;
    // traços na barra nos avisos (70% e 90%, ou os escolhidos em Configurações)
    const marks = [{at: Number(o.warnPct), kind: 'mk-warn'}, {at: Number(o.alertPct), kind: 'mk-alert'}].filter(m => m.at > 0 && m.at < 100);
    return `<div class="meter${o.main ? ' meter-main' : ''}" role="group" aria-label="${esc(label)}">
      <div class="meter-head"><h3>${esc(o.title)}</h3><span class="meter-badge ${state}">${STATES[state]}</span></div>
      <p class="meter-value">${money(o.value)} <small>de ${money(o.limit)}</small></p>
      <div class="meter-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(pct))}" aria-label="${esc(pctText)}"><div class="meter-fill" style="width:${Math.min(100, pct).toFixed(1)}%;background:${o.color}"></div>${marks.map(m => `<i class="meter-tick ${m.kind}" style="left:${m.at}%"></i>`).join('')}</div>
      <div class="meter-marks" aria-hidden="true">${marks.map(m => `<span class="${m.kind}" style="left:${m.at}%">${m.at}%</span>`).join('')}</div>
      <p class="meter-pct"><b>${pctText}.</b> ${o.value <= o.limit ? `Faltam ${money(o.limit - o.value)}.` : `Passou ${money(o.value - o.limit)} do limite.`}</p>
      ${state === 'over' && o.overText ? `<p class="meter-over">${esc(o.overText)}</p>` : ''}
      ${(o.lines || []).map(line => `<p class="meter-line">${line}</p>`).join('')}
      ${o.note ? `<p class="muted meter-note">${esc(o.note)}</p>` : ''}
    </div>`;
  }

  // ---------- Limite do MEI: dois medidores lado a lado ----------
  // A RECEITA (o que realmente entrou) é o que decide o enquadramento; as VENDAS (mesmo a receber) mostram o que ainda vai
  // virar receita. Só aparece com "Sou MEI" ligado.
  function meiBlock() {
    const s = data.settings;
    if (!s.isMei) return '';
    const m = App.finance.meiYear(), warn = Number(s.meiWarnPct) || 70, alert = Number(s.meiAlertPct) || 90;
    const limitNote = m.months < 12 ? ` (limite proporcional: ${m.months} ${m.months === 1 ? 'mês' : 'meses'} de atividade no ano)` : '';
    const projection = m.received > 0
      ? `Se o ritmo continuar, o ano termina com: <b>${money(m.projected)}</b>${m.projected > m.limit ? ' <span class="negative">(acima do limite)</span>' : ''}`
      : '';
    const received = meter({
      title: 'Receita do ano', value: m.received, limit: m.limit, color: '#1d7a46', warnPct: warn, alertPct: alert, main: true,
      note: 'Este é o que conta para o limite do MEI. É o dinheiro que realmente entrou no ano (bruto, sem descontar a taxa da maquininha).',
      overText: 'Você passou do limite. Procure seu contador.',
      lines: [`Ainda pode receber no ano: <b>${money(m.remaining)}</b>`, `Média por mês: <b>${money(m.average)}</b>`, projection].filter(Boolean)
    });
    const sold = meter({
      title: 'Vendas do ano', value: m.sold, limit: m.limit, color: '#2a5db0', warnPct: warn, alertPct: alert,
      note: 'Parte disso ainda vai entrar como receita.',
      lines: [`A receber de vendas já feitas: <b>${money(m.toReceive)}</b>`]
    });
    return `<section class="block mei-block"><h2>Limite do MEI em ${m.year}</h2><p class="muted">Limite: ${money(m.limit)}${esc(limitNote)}.</p><div class="meters">${received}${sold}</div></section>`;
  }

  App.components = Object.assign(App.components || {}, {meter, meiBlock});
})();
