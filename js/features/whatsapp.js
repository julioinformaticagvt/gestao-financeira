// "Abrir no WhatsApp" (SPECS, seção 24.6): monta o link https://wa.me/55DDDNÚMERO?text=... e só abre quando a pessoa CLICA.
// Nada é enviado sozinho, e "Copiar mensagem" continua existindo em todo lugar.
(() => {
  const App = (window.App = window.App || {});
  const {data} = App.store;

  // Só dígitos; acrescenta 55 (Brasil) se não houver. incomplete = o número parece curto demais.
  function clean(phone) {
    let digits = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');
    if (!digits) return {number: '', incomplete: true};
    if (!(digits.startsWith('55') && digits.length >= 12)) digits = `55${digits}`;
    return {number: digits, incomplete: digits.length < 12 || digits.length > 13};
  }
  const url = (phone, text) => { const c = clean(phone); return c.number ? `https://wa.me/${c.number}?text=${encodeURIComponent(text || '')}` : ''; };
  const phoneOf = name => { const c = data.clients.find(x => x.name === name); return c ? c.phone || '' : ''; };

  // Abre o WhatsApp numa aba nova (só no clique). Avisa se o número parecer incompleto.
  function open(phone, text) {
    const c = clean(phone);
    if (!c.number) { alert('Este cliente não tem telefone cadastrado.'); return false; }
    if (c.incomplete && !confirm(`O telefone (${phone}) parece incompleto. Abrir o WhatsApp mesmo assim?`)) return false;
    window.open(url(phone, text), '_blank', 'noopener');
    return true;
  }

  // Botão "Abrir no WhatsApp" (só quando o cliente tem telefone).
  const buttonHtml = (client, id) => phoneOf(client) ? `<button type="button" class="secondary" id="${id}" data-wa-client="${String(client).replace(/"/g, '&quot;')}">Abrir no WhatsApp</button>` : '';

  App.whatsapp = {clean, url, phoneOf, open, buttonHtml};
})();
