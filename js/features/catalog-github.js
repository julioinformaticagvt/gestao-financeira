// Conversa com o GitHub para o catálogo online (SPECS, seção 38). Só "fala" com o GitHub quando a pessoa clica em
// "Testar conexão" ou "Mandar para o catálogo".
// A CHAVE (token) fica só neste aparelho, numa gaveta própria do navegador (localStorage 'julio-informatica-github'), até a pessoa
// clicar "Esquecer a chave". NUNCA vai para os dados, para o backup, para a sincronização do Drive nem para nenhum arquivo do projeto.
// Analogia: é a chave do portão do site; fica pendurada no computador da loja, não vai junto com a pasta de documentos.
(() => {
  const App = (window.App = window.App || {});

  const TOKEN_KEY = 'julio-informatica-github';
  const API = 'https://api.github.com';
  // Chave "fine-grained" do GitHub (começa com github_pat_). A chave "clássica" (ghp_) abre TODOS os repositórios: recusada.
  const TOKEN_FORMAT = /^github_pat_[A-Za-z0-9_]{20,250}$/;
  const REPO_FORMAT = /^[\w.-]+\/[\w.-]+$/, BRANCH_FORMAT = /^[\w.-]+(?:\/[\w.-]+)*$/;

  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  const setToken = value => { try { localStorage.setItem(TOKEN_KEY, value); return true; } catch { return false; } };
  const forget = () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* sem acesso */ } };
  const hasToken = () => !!getToken();
  // Para mostrar na tela sem revelar a chave: só o começo e os 4 últimos caracteres.
  const masked = () => { const t = getToken(); return t ? `${t.slice(0, 11)}…${t.slice(-4)}` : ''; };
  // Confere o formato antes de guardar. Devolve '' (tudo certo) ou o motivo em português.
  function checkToken(value) {
    const t = String(value || '').trim();
    if (!t) return 'Cole a chave do GitHub.';
    if (/^gh[opsu]_/.test(t)) return 'Essa é uma chave "clássica" do GitHub, que abre todos os seus repositórios. Crie uma chave "Fine-grained", só para o repositório do catálogo (passo a passo logo abaixo).';
    if (!TOKEN_FORMAT.test(t)) return 'Essa chave não parece certa. Ela começa com github_pat_ e não tem espaços. Copie de novo no GitHub.';
    return '';
  }

  // Um erro com um código simples, para a tela escolher a mensagem certa. A chave nunca entra no texto do erro.
  const fail = (code, status) => Object.assign(new Error(`GitHub: ${code}${status ? ` (${status})` : ''}`), {code, status});

  async function call(path, options = {}) {
    const token = getToken();
    if (!token) throw fail('notoken');
    let response;
    try {
      response = await fetch(API + path, {...options, headers: {Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${token}`, ...(options.body ? {'Content-Type': 'application/json'} : {})}});
    } catch { throw fail('offline'); }
    if (response.status === 401) throw fail('auth', 401);
    if (response.status === 403) throw fail('forbidden', 403);
    if (response.status === 404) throw fail('notfound', 404);
    if (response.status === 409 || response.status === 422) throw fail('conflict', response.status);
    if (!response.ok) throw fail('http', response.status);
    return response.json();
  }
  const repoPath = repo => { if (!REPO_FORMAT.test(repo)) throw fail('badrepo'); return `/repos/${repo}`; };
  const branchPath = branch => { if (!BRANCH_FORMAT.test(branch)) throw fail('badrepo'); return branch.split('/').map(encodeURIComponent).join('/'); };
  const post = (path, body, method = 'POST') => call(path, {method, body: JSON.stringify(body)});

  // As chamadas (API "Git Data": dá para fazer UM commit com vários arquivos). Os testes trocam por um GitHub de mentira (setApi).
  const realApi = {
    async headOf(repo, branch) {
      const ref = await call(`${repoPath(repo)}/git/ref/heads/${branchPath(branch)}`);
      const commit = await call(`${repoPath(repo)}/git/commits/${ref.object.sha}`);
      return {commit: ref.object.sha, tree: commit.tree.sha};
    },
    // Lista de arquivos do repositório: [{path, sha}] (só arquivos).
    async files(repo, treeSha) {
      const tree = await call(`${repoPath(repo)}/git/trees/${treeSha}?recursive=1`);
      return (tree.tree || []).filter(entry => entry.type === 'blob').map(entry => ({path: entry.path, sha: entry.sha}));
    },
    async readBlob(repo, sha) { return (await call(`${repoPath(repo)}/git/blobs/${sha}`)).content || ''; },   // base64
    async createBlob(repo, base64) { return (await post(`${repoPath(repo)}/git/blobs`, {content: base64, encoding: 'base64'})).sha; },
    // entries: [{path, sha}] (sha null = apagar o arquivo)
    async createTree(repo, baseTree, entries) { return (await post(`${repoPath(repo)}/git/trees`, {base_tree: baseTree, tree: entries.map(e => ({path: e.path, mode: '100644', type: 'blob', sha: e.sha}))})).sha; },
    async createCommit(repo, message, tree, parent) { return (await post(`${repoPath(repo)}/git/commits`, {message, tree, parents: [parent]})).sha; },
    async moveBranch(repo, branch, sha) { await post(`${repoPath(repo)}/git/refs/heads/${branchPath(branch)}`, {sha, force: false}, 'PATCH'); }
  };
  let api = realApi;

  App.catalogGithub = {
    TOKEN_KEY, REPO_FORMAT, BRANCH_FORMAT, getToken, setToken, forget, hasToken, masked, checkToken,
    get api() { return api; },
    setApi(fake) { api = fake || realApi; }   // só para os testes automáticos
  };
})();
