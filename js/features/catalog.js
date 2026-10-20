// Catálogo online (SPECS, seção 38): o botão "Mandar para o catálogo" monta o arquivo dados/produtos.js do site do catálogo e envia,
// junto com as fotos, para o repositório do GitHub, num único commit.
// O site é PÚBLICO: o arquivo é montado por uma "lista branca" (só os 11 campos do catálogo). Preço, custo, quantidade em estoque e
// clientes nunca entram. Analogia: é a vitrine da loja; o caderno de preços fica no balcão.
// Também: campos do catálogo no cadastro do produto, fotos (guardadas só neste aparelho, no IndexedDB) e o painel em Configurações.
(() => {
  const App = (window.App = window.App || {});
  const {esc, today, normalize, dateLabel} = App.format;
  const {data, save} = App.store;
  const {openModal, byId} = App.ui;

  const DATA_PATH = 'dados/produtos.js';
  const PHOTO_DIR = 'img/produtos/';
  const PHOTO_PATH = /^img\/produtos\/[\w-]+\.jpg$/;
  const MAX_PHOTOS = 3, MAX_SPECS = 12, PHOTO_SIDE = 1000;
  const CONDITIONS = ['Seminovo', 'Usado'];   // '' = novo de fábrica (sem etiqueta no site)
  // As categorias do js/config.js do catálogo, na mesma ordem (dá para mudar em Configurações).
  const DEFAULT_CATEGORIES = ['Placas de vídeo', 'Processadores', 'Placas-mãe', 'Memória RAM', 'SSD e HD', 'Fontes', 'Gabinetes', 'Monitores', 'Periféricos'];
  const DEFAULTS = {enabled: false, repo: '', branch: 'main', siteUrl: '', categories: DEFAULT_CATEGORIES, lastSentAt: ''};

  // Configuração: só é gravada nos dados quando o dono salva o painel (até lá valem os padrões).
  const cfg = () => ({...DEFAULTS, ...(data.settings.catalog || {})});
  const enabled = () => !!cfg().enabled;
  const categories = () => (Array.isArray(cfg().categories) ? cfg().categories : []).map(c => String(c).trim()).filter(Boolean);
  const siteLink = () => { const url = String(cfg().siteUrl || ''); return /^https:\/\/[\w.\-\/~%]+$/.test(url) ? url : ''; };

  // ---------- fotos (IndexedDB deste aparelho; os testes trocam por uma gaveta na memória) ----------
  const idbStore = (() => {
    let opening;
    const open = () => opening || (opening = new Promise((resolve, reject) => {
      const req = indexedDB.open('julio-informatica-catalogo', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('photos');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { opening = null; reject(req.error); };
    }));
    const run = (mode, action) => open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction('photos', mode), req = action(tx.objectStore('photos'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    }));
    return {
      get: path => run('readonly', s => s.get(path)).then(blob => blob || null),
      put: (path, blob) => run('readwrite', s => s.put(blob, path)),
      remove: path => run('readwrite', s => s.delete(path))
    };
  })();
  let photos = idbStore;
  const getPhoto = path => photos.get(path).catch(() => null);

  // Diminui e comprime a foto para a internet: lado maior 1000 px, JPEG, fundo branco (o catálogo mostra as fotos sobre fundo claro).
  function resizePhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Escolha um arquivo de imagem (foto JPG ou PNG).'));
      const url = URL.createObjectURL(file), image = new Image();
      image.onload = () => {
        const scale = Math.min(1, PHOTO_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não consegui preparar a foto.')), 'image/jpeg', 0.82);
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui abrir essa imagem.')); };
      image.src = url;
    });
  }

  // ---------- "impressão digital" do Git e conversões ----------
  // O Git identifica cada arquivo pelo SHA-1 de "blob <tamanho>\0<conteúdo>". Calculando aqui, dá para saber o que mudou sem baixar tudo.
  async function gitSha(bytes) {
    if (!(window.crypto && crypto.subtle)) return '';   // sem a ferramenta: trata como "mudou" (envia de novo, sem problema)
    const head = new TextEncoder().encode(`blob ${bytes.length}\0`), all = new Uint8Array(head.length + bytes.length);
    all.set(head); all.set(bytes, head.length);
    return [...new Uint8Array(await crypto.subtle.digest('SHA-1', all))].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const utf8 = text => new TextEncoder().encode(text);
  function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  const fromBase64Text = base64 => { const binary = atob(String(base64).replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0))); };

  // ---------- o arquivo do catálogo ----------
  const clip = (value, max) => String(value ?? '').trim().slice(0, max);
  const cleanSpecs = specs => (Array.isArray(specs) ? specs : [])
    .filter(s => Array.isArray(s) && String(s[0] ?? '').trim() && String(s[1] ?? '').trim())
    .slice(0, MAX_SPECS).map(s => [clip(s[0], 40), clip(s[1], 80)]);
  // Serviços também podem ir para o catálogo (SPECS 39.4): entram na categoria "Serviços" e aparecem sempre como "Disponível".
  const SERVICE_CATEGORY = 'Serviços';
  const isService = p => p && p.type === 'Serviço';
  const isShown = p => p && p.catalog && p.catalog.show === true;

  // LISTA BRANCA: cada campo do site é copiado um a um. Nada de preço, custo, quantidade, SKU, margem ou cliente.
  function entryOf(product) {
    const c = product.catalog || {};
    return {
      id: String(product.uid || ''),
      nome: clip(product.name, 120),
      marca: clip(c.brand, 60),
      categoria: isService(product) ? SERVICE_CATEGORY : clip(c.category, 60),
      descricao: clip(c.description, 300),
      especificacoes: cleanSpecs(c.specs),
      imagens: (Array.isArray(c.photos) ? c.photos : []).filter(path => typeof path === 'string' && PHOTO_PATH.test(path)).slice(0, MAX_PHOTOS),
      disponivel: isService(product) || Number(product.stock) > 0,   // serviço não tem estoque
      destaque: c.featured === true,
      novo: c.isNew === true,
      condicao: !isService(product) && CONDITIONS.includes(c.condition) ? c.condition : ''
    };
  }
  const shownProducts = () => data.products.filter(isShown).sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)) || String(a.uid).localeCompare(String(b.uid)));
  const entries = () => shownProducts().map(entryOf);

  // Problemas que impedem o envio (o site precisa de nome e de uma categoria que exista no catálogo).
  function problems(list = shownProducts()) {
    const valid = new Set(categories()), out = [];
    for (const p of list) {
      const c = p.catalog || {}, name = String(p.name || '').trim() || '(sem nome)';
      if (!/^[\w-]+$/.test(String(p.uid || ''))) out.push(`${name}: sem id interno (salve o produto de novo).`);
      if (isService(p)) continue;   // serviço vai sempre para a categoria "Serviços"
      if (!c.category) out.push(`${name}: falta escolher a categoria.`);
      else if (!valid.has(c.category)) out.push(`${name}: a categoria "${c.category}" não está na lista de categorias (Configurações → Catálogo online).`);
    }
    return out;
  }

  // Texto seguro para dentro do arquivo .js: JSON (aspas, barras e acentos escapados) e sem "<" (vira um código que o navegador lê como "<", sem risco);
  // os dois caracteres invisíveis de "fim de linha" do Unicode (U+2028 e U+2029) também viram código.
  const BACKSLASH = String.fromCharCode(92), UNSAFE = new RegExp(`[<${String.fromCharCode(0x2028, 0x2029)}]`, 'g');
  const js = value => JSON.stringify(value).replace(UNSAFE, c => `${BACKSLASH}u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  function buildFile(list, date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('data inválida');
    return '/* ============================================================\n'
      + '   PRODUTOS DO CATÁLOGO: gerado pelo sistema de gestão (botão "Mandar para o catálogo").\n'
      + '   Não edite à mão: o próximo envio troca este arquivo inteiro.\n'
      + '   Sem preço, custo ou quantidade em estoque, de propósito.\n'
      + '   ============================================================ */\n\n'
      + `window.CATALOGO_ATUALIZADO = ${js(date)};\n\n`
      + `window.CATALOGO_PRODUTOS = [\n${list.map(entry => `  ${js(entry)}`).join(',\n')}\n];\n`;
  }
  const withoutDate = text => String(text).replace(/window\.CATALOGO_ATUALIZADO = "[^"\n]*";/, '');

  // ---------- comparar com o site e enviar ----------
  // Monta o "plano": o que mudou em relação ao que está no GitHub (fotos novas, fotos para apagar, arquivo de produtos).
  async function prepare() {
    const c = cfg(), gh = App.catalogGithub.api;
    const head = await gh.headOf(c.repo, c.branch);
    const remote = new Map((await gh.files(c.repo, head.tree)).map(file => [file.path, file.sha]));
    const list = entries(), uploads = [];
    for (const entry of list) {
      const kept = [];
      for (const path of entry.imagens) {
        const blob = await getPhoto(path);
        if (blob) {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (await gitSha(bytes) !== remote.get(path)) uploads.push({path, bytes});
          kept.push(path);
        } else if (remote.has(path)) kept.push(path);   // a foto não está neste aparelho, mas já está no site: fica
      }
      entry.imagens = kept;
    }
    const used = new Set(list.flatMap(entry => entry.imagens));
    const removals = [...remote.keys()].filter(path => path.startsWith(PHOTO_DIR) && !used.has(path));   // só dentro de img/produtos/
    const fileText = buildFile(list, today());
    let fileChanged = true;
    if (remote.has(DATA_PATH)) fileChanged = withoutDate(fromBase64Text(await gh.readBlob(c.repo, remote.get(DATA_PATH)))) !== withoutDate(fileText);
    const available = list.filter(entry => entry.disponivel).length;
    return {c, head, list, uploads, removals, fileText, available, changed: fileChanged || uploads.length > 0 || removals.length > 0};
  }

  // Um commit só: fotos + produtos.js + fotos apagadas. O ramo só avança no fim (se algo falhar antes, o site não muda).
  async function commitPlan(plan) {
    const gh = App.catalogGithub.api, {repo, branch} = plan.c, files = [];
    for (const upload of plan.uploads) files.push({path: upload.path, sha: await gh.createBlob(repo, toBase64(upload.bytes))});
    files.push({path: DATA_PATH, sha: await gh.createBlob(repo, toBase64(utf8(plan.fileText)))});
    plan.removals.forEach(path => files.push({path, sha: null}));
    const tree = await gh.createTree(repo, plan.head.tree, files);
    const commit = await gh.createCommit(repo, `Catálogo atualizado pelo sistema em ${dateLabel(today())}`, tree, plan.head.commit);
    await gh.moveBranch(repo, branch, commit);
  }

  // Mensagem em português para cada tipo de erro (a chave nunca aparece).
  function errorText(error) {
    const c = cfg(), repo = esc(c.repo), branch = esc(c.branch);
    switch (error && error.code) {
      case 'notoken': return 'Falta a chave do GitHub. Cole a chave em Configurações → Catálogo online.';
      case 'offline': return 'Sem internet (ou o GitHub não respondeu). Confira a conexão e tente de novo. Nada foi mudado no site.';
      case 'auth': return 'A chave do GitHub não vale mais (venceu ou foi apagada). Crie outra no GitHub (passo a passo em Configurações → Catálogo online) e cole no lugar. Nada foi mudado no site.';
      case 'forbidden': return `A chave não tem permissão para mudar o catálogo. No GitHub, confira se ela tem acesso ao repositório <b>${repo}</b> com <b>Contents: Read and write</b>. Nada foi mudado no site.`;
      case 'notfound': return `Não achei o repositório <b>${repo}</b> (ramo <b>${branch}</b>). Confira o nome em Configurações → Catálogo online e se a chave tem acesso a ele. Nada foi mudado no site.`;
      case 'conflict': return 'O catálogo mudou no GitHub enquanto o sistema enviava. Nada foi estragado: clique em "Mandar para o catálogo" de novo.';
      case 'badrepo': return 'O nome do repositório ou do ramo está escrito errado. Use o formato dono/nome (ex.: usuario/catalogo).';
      default: return `O GitHub respondeu com erro${error && error.status ? ` (código ${error.status})` : ''}. Tente de novo daqui a pouco. Nada foi mudado no site.`;
    }
  }

  const listHtml = items => `<ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
  const closeButton = '<div class="actions"><button type="button" class="primary" data-action="close-modal">Entendi</button></div>';
  // Antes de falar com o GitHub: demonstração, configuração, chave, produtos marcados e problemas.
  function blocker() {
    const c = cfg();
    if (App.store.isDemo) return '<p>No <b>modo demonstração</b> nada é enviado para o catálogo (os dados de exemplo nunca vão para o site de verdade).</p>';
    if (!App.catalogGithub.REPO_FORMAT.test(c.repo) || !App.catalogGithub.BRANCH_FORMAT.test(c.branch)) return '<p>Preencha o <b>repositório</b> (dono/nome) e o <b>ramo</b> em Configurações → Catálogo online.</p>';
    if (!App.catalogGithub.hasToken()) return '<p>Falta a <b>chave do GitHub</b>. Cole a chave em Configurações → Catálogo online.</p>';
    const list = shownProducts();
    if (!list.length) return '<p>Nenhum produto está marcado para o catálogo. Abra um produto, marque <b>Mostrar no catálogo</b> e escolha a categoria. (Enviar uma lista vazia apagaria todos os produtos do site.)</p>';
    const issues = problems(list);
    if (issues.length) return `<p>Arrume antes de enviar:</p>${listHtml(issues)}`;
    return '';
  }

  let busy = false;
  async function send() {
    if (busy) return;
    const stop = blocker();
    if (stop) { openModal(`<h2>Mandar para o catálogo</h2>${stop}${closeButton}`); return; }
    busy = true;
    openModal('<h2>Mandar para o catálogo</h2><p role="status">Conferindo o catálogo no GitHub…</p>');
    let plan;
    try { plan = await prepare(); }
    catch (error) { busy = false; openModal(`<h2>Não deu para conferir o catálogo</h2><p>${errorText(error)}</p>${closeButton}`); return; }
    busy = false;
    if (!plan.changed) { openModal(`<h2>Mandar para o catálogo</h2><p>O catálogo já está igual ao sistema. Nada foi enviado.</p>${closeButton}`); return; }
    const total = plan.list.length, off = total - plan.available;
    const photoLine = [plan.uploads.length ? `${plan.uploads.length} foto(s) nova(s) ou trocada(s)` : '', plan.removals.length ? `${plan.removals.length} foto(s) que saem do site` : ''].filter(Boolean).join(' e ');
    openModal(`<h2>Mandar para o catálogo?</h2><p><b>${total} produto(s)</b> no catálogo: ${plan.available} disponível(is) e ${off} indisponível(is) no momento.${photoLine ? ` ${photoLine}.` : ''}</p><p class="muted">Preço, custo, quantidade e clientes <b>não são enviados</b>. O site fica igual à lista do sistema: produto não marcado sai do site.</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button type="button" class="primary" id="catalog-confirm">Mandar agora</button></div>`);
    byId('catalog-confirm').onclick = async () => {
      if (busy) return;
      busy = true;
      openModal('<h2>Mandar para o catálogo</h2><p role="status">Enviando para o GitHub…</p>');
      try {
        await commitPlan(plan);
        data.settings.catalog = {...cfg(), lastSentAt: today()};
        save();
        const link = siteLink();
        openModal(`<h2>Catálogo atualizado!</h2><p>Pode levar 1 a 2 minutos para aparecer.</p>${link ? `<p><a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Abrir o catálogo</a></p>` : ''}${closeButton}`);
      } catch (error) {
        openModal(`<h2>Não deu para enviar</h2><p>${errorText(error)}</p>${closeButton}`);
      } finally { busy = false; }
    };
  }

  // Mostra numa janela do sistema (sem enviar e sem baixar) o arquivo que iria para o site.
  // (Antes era um download, mas o Windows barra abrir arquivos .js baixados: ele os trata como programas.)
  function view() {
    const list = shownProducts(), issues = problems(list);
    if (!list.length) { openModal(`<h2>Arquivo do catálogo</h2><p>Nenhum produto está marcado para o catálogo. Abra um produto e marque <b>Mostrar no catálogo</b>.</p>${closeButton}`); return; }
    const entriesNow = list.map(entryOf), available = entriesNow.filter(entry => entry.disponivel).length;
    openModal(`<h2>Arquivo do catálogo</h2><p><b>${list.length} produto(s)</b>: ${available} disponível(is) e ${list.length - available} indisponível(is) no momento. Isto é só para conferir: nada foi enviado.</p>${issues.length ? `<p class="negative">Arrume antes de enviar:</p>${listHtml(issues)}` : ''}<p class="muted">É exatamente o texto do arquivo <code>${DATA_PATH}</code> do site. Preço, custo, quantidade e clientes não aparecem aqui, de propósito.</p><pre class="catalog-file">${esc(buildFile(entriesNow, today()))}</pre>${closeButton}`);
  }

  // ---------- campos do catálogo no cadastro do produto (e do serviço) ----------
  const specRow = (name = '', value = '') => `<div class="cat-spec-row"><input name="catSpecName" maxlength="40" placeholder="Ex.: Memória" value="${esc(name)}" aria-label="Nome da especificação"><input name="catSpecValue" maxlength="80" placeholder="Ex.: 8 GB" value="${esc(value)}" aria-label="Valor da especificação"><button type="button" class="secondary cat-spec-remove" aria-label="Tirar esta linha">×</button></div>`;

  // "Colar ficha técnica" (SPECS 39.5): transforma o texto copiado de uma loja ou do fabricante em linhas "nome / valor".
  // Aceita "Memória: 8 GB", "Memória<TAB>8 GB", "Memória   8 GB" (2 ou mais espaços) e também nome numa linha e valor na linha de baixo.
  // Analogia com Python: é um "for linha in texto.splitlines():" que separa cada linha em duas partes.
  function parseSpecs(text) {
    const lines = String(text || '').split(/\r?\n/).map(line => line.replace(/^[\s•·*-]+/, '').trim()).filter(Boolean);
    const pairs = [];
    let pending = null;   // linha sem separador: espera a próxima para ser o valor
    for (const line of lines) {
      const match = line.match(/^(.+?)\s*(?:\t+|:\s*|\s{2,})(.+)$/);
      if (match) { pending = null; pairs.push([match[1], match[2]]); }
      else if (pending === null) pending = line;
      else { pairs.push([pending, line]); pending = null; }
    }
    return pairs.map(([name, value]) => [clip(name.replace(/:\s*$/, ''), 40), clip(value, 80)]).filter(([name, value]) => name && value);
  }

  function formFields(product) {
    if (!enabled()) return '';
    const c = (product && product.catalog) || {}, list = categories();
    const options = list.map(name => `<option ${c.category === name ? 'selected' : ''}>${esc(name)}</option>`).join('')
      + (c.category && !list.includes(c.category) && c.category !== SERVICE_CATEGORY ? `<option selected value="${esc(c.category)}">${esc(c.category)} (não está na lista)</option>` : '');
    const specs = cleanSpecs(c.specs);
    return `<div class="field full cat-field"><label class="inline-check"><input type="checkbox" name="catShow" ${c.show ? 'checked' : ''}> <b>Mostrar no catálogo</b> (sem preço; produto com estoque aparece "Disponível"; serviço aparece sempre "Disponível")</label></div>`
      + `<div class="field cat-field cat-only-product"><label>Categoria</label><select name="catCategory"><option value="">Escolha...</option>${options}</select></div>`
      + `<div class="field cat-field cat-only-service" hidden><label>Categoria</label><p class="muted">Serviços entram sempre na categoria <b>${SERVICE_CATEGORY}</b> do catálogo.</p></div>`
      + `<div class="field cat-field"><label>Marca <small>opcional</small></label><input name="catBrand" maxlength="60" value="${esc(c.brand || '')}"></div>`
      + `<div class="field full cat-field"><label>Descrição curta <small>1 ou 2 frases</small></label><textarea name="catDescription" rows="2" maxlength="300">${esc(c.description || '')}</textarea></div>`
      + `<div class="field full cat-field"><label>Especificações <small>opcional; nome e valor</small></label><div id="cat-specs">${specs.map(s => specRow(s[0], s[1])).join('')}</div>`
      + `<div class="cat-spec-buttons"><button type="button" class="secondary" id="cat-spec-add">+ adicionar linha</button><button type="button" class="secondary" id="cat-paste-open">Colar ficha técnica</button></div>`
      + `<div id="cat-paste" class="cat-paste" hidden><label for="cat-paste-text">Cole aqui a tabela de especificações copiada da loja ou do fabricante (uma por linha, ex.: "Memória: 8 GB")</label><textarea id="cat-paste-text" rows="5" placeholder="Memória: 8 GB&#10;Tela: 15,6 polegadas"></textarea><div class="actions"><button type="button" class="secondary" id="cat-paste-cancel">Cancelar</button><button type="button" class="secondary" id="cat-paste-apply">Transformar em especificações</button></div></div><p id="cat-paste-msg" class="muted" role="status" hidden></p></div>`
      + `<div class="field full cat-field"><label>Fotos <small>até ${MAX_PHOTOS}; dá para escolher várias de uma vez; a 1ª é a capa (use as setas para mudar a ordem)</small></label><div id="cat-photos" class="cat-photos"></div><label class="secondary button-like" id="cat-photo-pick">Escolher fotos<input type="file" accept="image/*" id="cat-photo-input" multiple hidden></label><p class="negative" id="cat-photo-error" role="status" hidden></p></div>`
      + `<div class="field cat-field cat-only-product"><label>Condição</label><select name="catCondition"><option value="">Novo de fábrica</option>${CONDITIONS.map(x => `<option ${c.condition === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`
      + `<div class="field cat-field"><label class="inline-check"><input type="checkbox" name="catFeatured" ${c.featured ? 'checked' : ''}> Destaque (aparece primeiro)</label><label class="inline-check"><input type="checkbox" name="catNew" ${c.isNew ? 'checked' : ''}> Novidade (etiqueta "Novo")</label></div>`;
  }

  // Liga os campos do formulário (especificações, colar ficha técnica, fotos e a troca produto/serviço) e devolve como gravar.
  function bindForm(form, product) {
    if (!enabled() || !form.querySelector('.cat-field')) return {apply: async () => {}};
    App.ui.groupFields(form, [{kind: 'product', title: 'Catálogo online', items: ['.cat-field']}]);
    const specsBox = form.querySelector('#cat-specs'), photosBox = form.querySelector('#cat-photos'), input = form.querySelector('#cat-photo-input'), error = form.querySelector('#cat-photo-error');
    // Serviço: sem categoria para escolher (vai para "Serviços") e sem condição (novo/usado).
    const toggle = () => {
      const service = form.elements.type.value === 'Serviço';
      form.querySelectorAll('.cat-only-product').forEach(el => { el.hidden = service; });
      form.querySelectorAll('.cat-only-service').forEach(el => { el.hidden = !service; });
    };
    form.elements.type.addEventListener('change', toggle); toggle();
    form.querySelector('#cat-spec-add').onclick = () => { if (specsBox.children.length < MAX_SPECS) specsBox.insertAdjacentHTML('beforeend', specRow()); };
    specsBox.addEventListener('click', event => { const button = event.target.closest('.cat-spec-remove'); if (button) button.parentElement.remove(); });

    // Colar ficha técnica: abre uma caixa dentro do próprio formulário (sem fechar a janela do produto).
    const pasteBox = form.querySelector('#cat-paste'), pasteText = form.querySelector('#cat-paste-text'), pasteMsg = form.querySelector('#cat-paste-msg');
    const say = text => { pasteMsg.textContent = text; pasteMsg.hidden = !text; };
    form.querySelector('#cat-paste-open').onclick = () => { pasteBox.hidden = false; say(''); pasteText.focus(); };
    form.querySelector('#cat-paste-cancel').onclick = () => { pasteText.value = ''; pasteBox.hidden = true; say(''); };
    form.querySelector('#cat-paste-apply').onclick = () => {
      const pairs = parseSpecs(pasteText.value);
      if (!pairs.length) { say('Não achei especificações no texto colado. Use uma por linha, como "Memória: 8 GB".'); return; }
      // linhas vazias que já estavam no formulário saem, para dar lugar às coladas
      [...specsBox.querySelectorAll('.cat-spec-row')].forEach(row => { if (!row.querySelector('[name="catSpecName"]').value.trim() && !row.querySelector('[name="catSpecValue"]').value.trim()) row.remove(); });
      const used = pairs.slice(0, Math.max(0, MAX_SPECS - specsBox.children.length));
      used.forEach(([name, value]) => specsBox.insertAdjacentHTML('beforeend', specRow(name, value)));
      pasteText.value = ''; pasteBox.hidden = true;
      say(`${used.length} especificação(ões) adicionada(s). Confira antes de salvar.${pairs.length > used.length ? ` Cabem no máximo ${MAX_SPECS}: ${pairs.length - used.length} ${pairs.length - used.length === 1 ? 'ficou' : 'ficaram'} de fora.` : ''}`);
    };

    // Fotos: as que já existem (caminho) e as novas (ainda só na memória até salvar). A ordem da lista é a ordem no site.
    const original = ((product && product.catalog && product.catalog.photos) || []).filter(path => PHOTO_PATH.test(path));
    const items = original.map(path => ({path}));
    const urls = [];
    const draw = async () => {
      for (const item of items) if (!item.url && !item.missing) { const blob = item.blob || await getPhoto(item.path); if (blob) { item.url = URL.createObjectURL(blob); urls.push(item.url); } else item.missing = true; }
      photosBox.innerHTML = items.map((item, i) => `<div class="cat-photo"><small class="cat-photo-label">${i === 0 ? '<span class="badge info">Capa</span>' : `Foto ${i + 1}`}</small>${item.url ? `<img alt="Foto ${i + 1}" src="${esc(item.url)}">` : '<span class="muted">foto fora deste aparelho (fica a que já está no site)</span>'}<div class="cat-photo-buttons"><button type="button" class="secondary" data-photo-move="${i}" data-dir="-1" aria-label="Mover a foto ${i + 1} para a esquerda" ${i === 0 ? 'disabled' : ''}>◀</button><button type="button" class="secondary" data-photo-move="${i}" data-dir="1" aria-label="Mover a foto ${i + 1} para a direita" ${i === items.length - 1 ? 'disabled' : ''}>▶</button><button type="button" class="secondary" data-photo-remove="${i}" aria-label="Tirar a foto ${i + 1}">Tirar</button></div></div>`).join('');
      form.querySelector('#cat-photo-pick').hidden = items.length >= MAX_PHOTOS;
    };
    photosBox.addEventListener('click', event => {
      const remove = event.target.closest('[data-photo-remove]'), move = event.target.closest('[data-photo-move]');
      if (remove) { items.splice(Number(remove.dataset.photoRemove), 1); error.hidden = true; draw(); }
      else if (move) {
        const from = Number(move.dataset.photoMove), to = from + Number(move.dataset.dir);
        if (to >= 0 && to < items.length) { [items[from], items[to]] = [items[to], items[from]]; draw(); }   // troca as duas de lugar
      }
    });
    // Várias fotos de uma vez: entram até completar o limite; as que sobrarem ficam de fora (com aviso).
    input.onchange = async () => {
      error.hidden = true;
      const files = [...input.files]; input.value = '';
      const room = MAX_PHOTOS - items.length;
      if (!files.length || room <= 0) return;
      const notes = [];
      for (const file of files.slice(0, room)) {
        try { items.push({blob: await resizePhoto(file)}); }
        catch (problem) { notes.push(`${file.name}: ${problem.message}`); }
      }
      const left = files.length - room;
      if (left > 0) notes.push(`Só cabem ${MAX_PHOTOS} fotos por produto: ${left} ${left === 1 ? 'ficou' : 'ficaram'} de fora.`);
      if (notes.length) { error.textContent = notes.join(' '); error.hidden = false; }
      draw();
    };
    draw();

    return {
      // Grava os campos no produto (depois do save que dá o id interno) e guarda as fotos novas neste aparelho.
      async apply(target) {
        const f = form.elements, service = target.type === 'Serviço';
        const specs = [...specsBox.querySelectorAll('.cat-spec-row')].map(row => [row.querySelector('[name="catSpecName"]').value, row.querySelector('[name="catSpecValue"]').value]);
        const catalog = {...(target.catalog || {}), show: f.catShow.checked, category: service ? SERVICE_CATEGORY : f.catCategory.value, brand: f.catBrand.value.trim(), description: f.catDescription.value.trim(), specs: cleanSpecs(specs), featured: f.catFeatured.checked, isNew: f.catNew.checked, condition: !service && CONDITIONS.includes(f.catCondition.value) ? f.catCondition.value : ''};
        catalog.photoSeq = Number(catalog.photoSeq) || 0;
        const kept = [];
        for (const item of items) {
          if (item.path) { kept.push(item.path); continue; }
          // nome novo a cada foto nova (o site não mostra uma foto velha guardada no navegador do cliente)
          const path = `${PHOTO_DIR}${target.uid}-${++catalog.photoSeq}.jpg`;
          try { await photos.put(path, item.blob); kept.push(path); } catch { alert('Não consegui guardar uma das fotos neste aparelho. Tente de novo.'); }
        }
        for (const path of original) if (!kept.includes(path)) await photos.remove(path).catch(() => {});
        catalog.photos = kept;
        target.catalog = catalog;
        urls.forEach(url => URL.revokeObjectURL(url));
      }
    };
  }

  // Produto apagado: as fotos dele saem deste aparelho (no site, saem no próximo envio).
  function forgetProduct(product) {
    ((product && product.catalog && product.catalog.photos) || []).forEach(path => photos.remove(path).catch(() => {}));
  }

  // ---------- painel em Configurações ----------
  function settingsPanel() {
    const c = cfg(), gh = App.catalogGithub, repoName = esc(String(c.repo || '').split('/')[1] || 'catalogo');
    const keyStatus = gh.hasToken() ? `Chave guardada neste aparelho: <code>${esc(gh.masked())}</code>` : 'Nenhuma chave guardada neste aparelho.';
    const more = `<div class="field"><label>Repositório no GitHub <small>dono/nome</small></label><input name="repo" value="${esc(c.repo)}" placeholder="usuario/catalogo" autocomplete="off" spellcheck="false"></div><div class="field"><label>Ramo</label><input name="branch" value="${esc(c.branch)}" placeholder="main" autocomplete="off" spellcheck="false"></div><div class="field full"><label>Endereço do site <small>para o link "Abrir o catálogo"</small></label><input name="siteUrl" type="url" value="${esc(c.siteUrl)}" placeholder="https://usuario.github.io/catalogo/"></div><div class="field full"><label>Categorias <small>uma por linha; iguais às do catálogo (js/config.js)</small></label><textarea name="categories" rows="6">${esc(categories().join('\n'))}</textarea></div><div class="actions field full"><button class="primary">Salvar catálogo online</button></div>`;
    const key = `<h3>Chave de acesso do GitHub</h3><p class="muted">Fica <b>só neste aparelho</b> (não vai para o backup, para a sincronização nem para o catálogo). ${keyStatus}</p><div class="form-grid"><div class="field full"><label>Colar a chave nova</label><input id="catalog-token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_..."></div></div><div class="actions"><button type="button" class="secondary" data-action="catalog-token-save">Guardar a chave</button><button type="button" class="secondary" data-action="catalog-test">Testar conexão</button>${gh.hasToken() ? '<button type="button" class="danger" data-action="catalog-token-forget">Esquecer a chave</button>' : ''}</div><p id="catalog-key-msg" role="status" hidden></p>`
      + `<details><summary>Como criar a chave no GitHub (passo a passo)</summary><ol class="catalog-howto"><li>Entre no GitHub com a conta dona do catálogo.</li><li>Clique na sua foto (canto de cima) → <b>Settings</b>.</li><li>No fim do menu da esquerda: <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li><li><b>Token name:</b> "Sistema - catálogo". <b>Expiration:</b> 1 ano (quando vencer, o sistema avisa e você cria outra).</li><li><b>Repository access:</b> <b>Only select repositories</b> → escolha <b>${repoName}</b> (só ele).</li><li><b>Permissions → Repository permissions → Contents:</b> <b>Read and write</b>. Não marque mais nada.</li><li><b>Generate token</b>, copie a chave (começa com <code>github_pat_</code>), cole aqui em cima e clique <b>Guardar a chave</b> e depois <b>Testar conexão</b>.</li><li>Não mande a chave para ninguém (nem por WhatsApp). Se ela vazar, apague no GitHub e crie outra.</li></ol></details>`
      + `<div class="actions"><button type="button" class="secondary" data-action="catalog-view">Ver o arquivo para conferir</button></div>${c.lastSentAt ? `<p class="muted">Último envio para o catálogo: ${dateLabel(c.lastSentAt)}.</p>` : ''}`;
    return `<section class="panel g-product" id="catalog-panel"><h2>Catálogo online</h2><p class="muted">Uma página na internet com os seus produtos, sem preço, para o cliente ver o que tem e chamar no WhatsApp. Só aparecem os produtos marcados <b>Mostrar no catálogo</b> no cadastro. <b>Preço, custo, quantidade em estoque e clientes nunca são enviados.</b>${App.store.isDemo ? ' No modo demonstração nada é enviado.' : ''}</p><form id="catalog-form" class="form-grid"><div class="field full"><label class="inline-check"><input type="checkbox" name="enabled" ${c.enabled ? 'checked' : ''}> <b>Uso catálogo online</b></label></div>${c.enabled ? more : ''}</form>${c.enabled ? key : ''}</section>`;
  }

  const keyMessage = (text, bad) => { const box = byId('catalog-key-msg'); if (!box) return; box.innerHTML = text; box.className = bad ? 'negative' : 'positive'; box.hidden = false; };
  // Lê e confere o formulário do painel. Devolve {problem: 'motivo'} ou {values: {...}}.
  function readSettings(form) {
    const f = form.elements, repo = f.repo.value.trim(), branch = f.branch.value.trim() || 'main', siteUrl = f.siteUrl.value.trim();
    if (repo && !App.catalogGithub.REPO_FORMAT.test(repo)) return {problem: 'O repositório tem que ser no formato dono/nome (ex.: usuario/catalogo).'};
    if (!App.catalogGithub.BRANCH_FORMAT.test(branch)) return {problem: 'O nome do ramo está escrito errado (o normal é main).'};
    if (siteUrl && !/^https:\/\/[\w.\-\/~%]+$/.test(siteUrl)) return {problem: 'O endereço do site tem que começar com https://'};
    const list = [...new Set(f.categories.value.split('\n').map(line => line.trim().slice(0, 60)).filter(Boolean))];
    if (!list.length) return {problem: 'Escreva pelo menos uma categoria.'};
    return {values: {repo, branch, siteUrl, categories: list}};
  }
  // "Guardar a chave" e "Testar conexão" redesenham o painel: antes disso, salvam o que foi digitado e ainda não foi salvo
  // (senão o repositório digitado se perderia). Devolve '' (tudo certo) ou o motivo do problema.
  function saveTyped() {
    const form = byId('catalog-form');
    if (!form || !form.elements.repo) return '';
    const {problem, values} = readSettings(form);
    if (problem) return problem;
    const before = cfg();
    if (JSON.stringify([before.repo, before.branch, before.siteUrl, categories()]) !== JSON.stringify([values.repo, values.branch, values.siteUrl, values.categories])) {
      data.settings.catalog = {...before, ...values};
      save();
    }
    return '';
  }
  function bindSettings() {
    const form = byId('catalog-form');
    if (!form) return;
    form.elements.enabled.onchange = () => { data.settings.catalog = {...cfg(), enabled: form.elements.enabled.checked}; save(); App.ui.go('settings'); };
    form.onsubmit = event => {
      event.preventDefault();
      const {problem, values} = readSettings(form);
      if (problem) { alert(problem); return; }
      data.settings.catalog = {...cfg(), ...values};
      save();
      alert('Catálogo online salvo.');
      App.ui.go('settings');
    };
  }

  App.ui.registerAction('catalog-token-save', () => {
    const input = byId('catalog-token'), value = input.value.trim(), problem = App.catalogGithub.checkToken(value);
    if (problem) { keyMessage(esc(problem), true); return; }
    const typed = saveTyped();
    if (typed) { keyMessage(esc(typed), true); return; }
    if (!App.catalogGithub.setToken(value)) { keyMessage('Não consegui guardar a chave neste navegador.', true); return; }
    input.value = '';
    App.ui.go('settings');
    keyMessage('Chave guardada neste aparelho. Agora clique em <b>Testar conexão</b>.', false);
  });
  App.ui.registerAction('catalog-token-forget', () => {
    if (!confirm('Esquecer a chave do GitHub neste aparelho? Para enviar de novo, será preciso colar uma chave.')) return;
    App.catalogGithub.forget();
    App.ui.go('settings');
    keyMessage('Chave apagada deste aparelho. (Se quiser, apague também no GitHub: Settings → Developer settings → Fine-grained tokens.)', false);
  });
  App.ui.registerAction('catalog-test', async () => {
    if (App.store.isDemo) { keyMessage('No modo demonstração o sistema não fala com o GitHub.', true); return; }
    const typed = saveTyped();
    if (typed) { keyMessage(esc(typed), true); return; }
    const c = cfg();
    if (!App.catalogGithub.REPO_FORMAT.test(c.repo)) { keyMessage('Preencha o repositório (dono/nome) antes de testar.', true); return; }
    if (!App.catalogGithub.hasToken()) { keyMessage('Cole e guarde a chave antes de testar.', true); return; }
    keyMessage('Testando…', false);
    try {
      await App.catalogGithub.api.headOf(c.repo, c.branch);
      keyMessage(`Conexão certa: o sistema consegue ler <b>${esc(c.repo)}</b> (ramo <b>${esc(c.branch)}</b>). A permissão para gravar é conferida no primeiro envio. Nada foi mudado no site.`, false);
    } catch (error) { keyMessage(errorText(error), true); }
  });
  App.ui.registerAction('catalog-view', view);
  App.ui.registerAction('catalog-send', send);

  App.catalog = {
    DATA_PATH, PHOTO_DIR, DEFAULT_CATEGORIES, cfg, enabled, isShown, entries, entryOf, problems, buildFile, gitSha, prepare, send, view,
    formFields, bindForm, parseSpecs, forgetProduct, settingsPanel, bindSettings, errorText,
    setPhotoStore(store) { photos = store || idbStore; }   // só para os testes automáticos (gaveta de fotos na memória)
  };
})();
