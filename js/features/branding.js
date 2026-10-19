// Logo e nome do negócio: aparecem no topo do sistema e no Recibo/Extrato.
// A logo principal vale para tudo; o usuário pode escolher outra só para o topo e/ou outra só para os documentos (recibo e extrato).
// Cada logo guarda a imagem reduzida em PNG (mantém o fundo transparente) e o tamanho em pixels.
(() => {
  const App = (window.App = window.App || {});
  const {data} = App.store;

  const MAX = 320;   // lado máximo em pixels (a imagem é reduzida para não pesar nos dados)

  // 'top' = topo do sistema, 'pdf' = documentos (recibo e extrato). Devolve {src, w, h} ou null.
  // SEGURANÇA: o endereço da logo vem dos dados (que podem vir de um backup ou do Drive). Só vale uma imagem embutida no formato
  // data:image/png|jpeg|gif|webp;base64,...: qualquer outra coisa é tratada como "sem logo" (assim um arquivo malicioso não consegue
  // colocar código dentro de um <img>).
  const SAFE_SRC = /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+\/=]+$/;
  const safeSrc = src => (typeof src === 'string' && SAFE_SRC.test(src) ? src : '');
  const pick = logo => (logo && safeSrc(logo.src) ? logo : null);
  const logoFor = kind => { const b = data.settings.business; return pick(kind === 'pdf' ? b.logoPdf : b.logoTop) || pick(b.logo) || null; };

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

  // Tamanho da logo do topo (altura em px). Padrão 59; a pessoa pode ajustar de 24 a 90 (SPECS 31.8). A barra de cima acompanha.
  const DEFAULT_TOP = 59, MIN_TOP = 24, MAX_TOP = 90;
  const topHeight = () => { const h = Number(data.settings.business.logoTopHeight); return Number.isFinite(h) && h >= MIN_TOP && h <= MAX_TOP ? Math.round(h) : DEFAULT_TOP; };
  function setTopHeight(value, persist) {
    const b = data.settings.business, h = value === null ? DEFAULT_TOP : Math.max(MIN_TOP, Math.min(MAX_TOP, Math.round(Number(value)) || DEFAULT_TOP));
    if (h === DEFAULT_TOP) delete b.logoTopHeight; else b.logoTopHeight = h;   // o padrão não grava nada
    apply();
    if (persist) App.store.save();
  }

  // Atualiza o topo do sistema (nome e logo).
  function apply() {
    const rootStyle = document.documentElement.style, h = topHeight();
    const barScale = App.appearance ? App.appearance.barScale() : 1, barH = Math.max(Math.round(62 * barScale), h + 17);   // a barra cabe a logo e o texto
    if (h === DEFAULT_TOP) { rootStyle.removeProperty('--logo-h'); rootStyle.removeProperty('--logo-w'); }
    else { rootStyle.setProperty('--logo-h', `${h}px`); rootStyle.setProperty('--logo-w', `${Math.min(320, Math.round(h * 2.75))}px`); }
    if (barH === 76) rootStyle.removeProperty('--topbar-h'); else rootStyle.setProperty('--topbar-h', `${barH}px`);
    const name = document.getElementById('brand-name'), img = document.getElementById('brand-logo');
    const label = (data.settings.business.name || '').trim() || 'Meu negócio';   // sistema novo (sem nome ainda): texto neutro
    if (name) name.textContent = label;
    document.title = `${label} | Gestão financeira`;
    const logo = logoFor('top');
    if (img) { img.hidden = !logo; if (logo) img.src = logo.src; else img.removeAttribute('src'); }
    // Opção "mostrar o nome ao lado da logo" (padrão: sim). Sem logo, o nome aparece sempre.
    const showName = !(logo && data.settings.business.showName === false);
    if (name) name.hidden = !showName;
    if (img) img.alt = showName ? '' : label;
  }

  App.branding = {logoFor, safeSrc, fromFile, apply, topHeight, setTopHeight, DEFAULT_TOP, MIN_TOP, MAX_TOP};
})();
