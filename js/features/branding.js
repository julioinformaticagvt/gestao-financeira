// Logo e nome do negócio: aparecem no topo do sistema e no Recibo/Extrato.
// A logo principal vale para tudo; o usuário pode escolher outra só para o topo e/ou outra só para os documentos (recibo e extrato).
// Cada logo guarda a imagem reduzida em PNG (mantém o fundo transparente) e o tamanho em pixels.
(() => {
  const App = (window.App = window.App || {});
  const {data} = App.store;

  const MAX = 320;   // lado máximo em pixels (a imagem é reduzida para não pesar nos dados)

  // 'top' = topo do sistema, 'pdf' = documentos (recibo e extrato). Devolve {src, w, h} ou null.
  const logoFor = kind => { const b = data.settings.business; return (kind === 'pdf' ? b.logoPdf : b.logoTop) || b.logo || null; };

  // Lê um arquivo de imagem e devolve a logo já reduzida.
  function fromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Escolha um arquivo de imagem (PNG, JPG...).'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Não consegui abrir essa imagem.'));
        image.onload = () => {
          const scale = Math.min(1, MAX / Math.max(image.width, image.height));
          const w = Math.max(1, Math.round(image.width * scale)), h = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(image, 0, 0, w, h);
          resolve({src: canvas.toDataURL('image/png'), w, h});
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Atualiza o topo do sistema (nome e logo).
  function apply() {
    const name = document.getElementById('brand-name'), img = document.getElementById('brand-logo');
    const label = (data.settings.business.name || '').trim() || 'Meu negócio';   // sistema novo (sem nome ainda): texto neutro
    if (name) name.textContent = label;
    document.title = `${label} | Gestão financeira`;
    const logo = logoFor('top');
    if (img) { img.hidden = !logo; if (logo) img.src = logo.src; else img.removeAttribute('src'); }
  }

  App.branding = {logoFor, fromFile, apply};
})();
