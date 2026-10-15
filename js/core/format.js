// Formatação: dinheiro, datas, textos seguros e busca sem acento.
// Tudo fica guardado em App.format (App é a "caixa de ferramentas" única do sistema).
(() => {
  const App = (window.App = window.App || {});

  const money = value => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(value || 0);

  // Data de hoje no formato AAAA-MM-DD, pelo relógio DO COMPUTADOR (horário local), não pelo relógio mundial (UTC):
  // assim, às 22h de Brasília ainda é "hoje" (com UTC já viraria "amanhã").
  const localDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => localDay(new Date());

  // Deixa um texto seguro para entrar no HTML (troca < > & " ' por códigos).
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[c]));

  // 2026-10-15 -> 15/10/2026
  const dateLabel = date => date ? date.split('-').reverse().join('/') : '-';

  // Para buscar sem diferenciar maiúsculas e acentos ("João" = "joao").
  const normalize = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Mês de uma data: 2026-10-15 -> 2026-10
  const monthKey = date => date ? date.slice(0, 7) : '';

  // Anda alguns meses para frente ou para trás: ('2026-10', -1) -> '2026-09'
  const shiftMonth = (key, offset) => {
    const date = new Date(`${key}-01T12:00:00`);
    date.setMonth(date.getMonth() + offset);
    return date.toISOString().slice(0, 7);
  };

  // '2026-10' -> 'outubro de 2026'
  const monthLabel = key => new Intl.DateTimeFormat('pt-BR', {month: 'long', year: 'numeric'}).format(new Date(`${key}-01T12:00:00`));

  // Soma uma lista: sum(vendas, v => v.total)   (parecido com sum(v.total for v in vendas) do Python)
  const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0);

  App.format = {money, today, localDay, esc, dateLabel, normalize, monthKey, shiftMonth, monthLabel, sum};
})();
