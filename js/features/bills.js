// Contas a pagar: numeração e criação automática das contas das despesas fixas.
// Uma despesa fixa (ex.: aluguel) é um "modelo"; todo mês o sistema cria sozinho uma conta a pagar a partir dele.
(() => {
  const App = (window.App = window.App || {});
  const {today, shiftMonth} = App.format;
  const {data, save} = App.store;

  const nextId = () => App.store.nextCode('payable');   // código C0001... com contador (nunca reaproveita)
  const nextFixedId = () => App.store.nextCode('fixed');

  // Dia de vencimento dentro do mês (dia 31 em mês de 30 dias vira dia 30, e assim por diante).
  function dueDateFor(month, day) {
    const [year, mon] = month.split('-').map(Number), last = new Date(year, mon, 0).getDate();
    return `${month}-${String(Math.min(Number(day) || 1, last)).padStart(2, '0')}`;
  }

  // Cria as contas que faltam: do mês de início até o mês atual, uma por despesa fixa ativa e por mês.
  // Pode rodar quantas vezes quiser: não duplica.
  function generate() {
    const thisMonth = today().slice(0, 7);
    let created = 0;
    for (const fixed of data.fixedExpenses.filter(f => f.active)) {
      const from = fixed.resumeMonth && fixed.resumeMonth > fixed.startMonth ? fixed.resumeMonth : fixed.startMonth;   // reativada: só dali em diante
      for (let month = from; month <= thisMonth; month = shiftMonth(month, 1)) {
        if (data.payables.some(p => p.fixedId === fixed.id && p.month === month)) continue;
        data.payables.push({id: nextId(), description: fixed.description, category: fixed.category, amount: fixed.amount, dueDate: dueDateFor(month, fixed.dueDay), status: 'pendente', origin: 'fixa', fixedId: fixed.id, month});
        created++;
      }
    }
    if (created) save();
    return created;
  }

  // DAS do MEI: uma conta a pagar por mês (só o mês atual; nunca meses passados), com o valor que o dono informou e no dia do DAS.
  // O sistema NÃO calcula imposto. "dasCreated" lembra os meses já criados, para não repetir mesmo se a conta for apagada.
  function ensureDas() {
    const s = data.settings, month = today().slice(0, 7);
    if (!s.isMei || !(Number(s.dasValue) > 0)) return false;
    s.dasCreated = s.dasCreated || [];
    if (s.dasCreated.includes(month)) return false;
    // Já existe um DAS neste mês (conta avulsa ou criada por uma despesa fixa "DAS")? Então não cria outro.
    const hasDas = data.payables.some(p => /\bDAS\b/.test(p.description || '') && (p.month === month || String(p.dueDate || '').slice(0, 7) === month));
    if (hasDas) { s.dasCreated.push(month); save(); return false; }
    const day = Math.min(28, Math.max(1, Number(s.dasDay) || 20));
    data.payables.push({id: nextId(), description: `DAS ${month.slice(5, 7)}/${month.slice(0, 4)}`, category: 'Impostos', amount: Number(s.dasValue), dueDate: dueDateFor(month, day), status: 'pendente', origin: 'avulsa', auto: 'das', month});
    s.dasCreated.push(month);
    save();
    return true;
  }

  App.bills = {nextId, nextFixedId, dueDateFor, generate, ensureDas};
})();
