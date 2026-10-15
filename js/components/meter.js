// Medidor (barra) do limite do MEI: título, valor, porcentagem e barra. A cor da barra é fixa (identifica o medidor);
// o estado (ok / atenção / perigo / passou) aparece no TEXTO e num selo, nunca só na cor.
(() => {
  const App = (window.App = window.App || {});
  const {money, esc} = App.format;

  const STATES = {ok: 'Dentro do limite', warn: 'Atenção', danger: 'Perigo', over: 'Passou do limite'};

  // {title, value, limit, color, warnPct, alertPct, main, note, lines:[texto,...], overText}
  function meter(o) {
    const pct = o.limit > 0 ? o.value / o.limit * 100 : 0;
    const state = pct > 100 ? 'over' : pct >= o.alertPct ? 'danger' : pct >= o.warnPct ? 'warn' : 'ok';
    const pctText = `${pct.toFixed(1).replace('.', ',')}% do limite`;
    const label = `${o.title}: ${money(o.value)} de ${money(o.limit)}, ${pctText}. ${STATES[state]}.`;
    return `<div class="meter${o.main ? ' meter-main' : ''}" role="group" aria-label="${esc(label)}">
      <div class="meter-head"><h3>${esc(o.title)}</h3><span class="meter-badge ${state}">${STATES[state]}</span></div>
      <p class="meter-value">${money(o.value)} <small>de ${money(o.limit)}</small></p>
      <div class="meter-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(pct))}" aria-label="${esc(pctText)}"><div class="meter-fill" style="width:${Math.min(100, pct).toFixed(1)}%;background:${o.color}"></div></div>
      <p class="meter-pct"><b>${pctText}</b></p>
      ${state === 'over' && o.overText ? `<p class="meter-over">${esc(o.overText)}</p>` : ''}
      ${(o.lines || []).map(line => `<p class="meter-line">${line}</p>`).join('')}
      ${o.note ? `<p class="muted meter-note">${esc(o.note)}</p>` : ''}
    </div>`;
  }

  App.components = Object.assign(App.components || {}, {meter});
})();
