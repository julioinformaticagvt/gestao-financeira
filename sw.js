// Service worker: guarda os arquivos do sistema para ele funcionar sem internet (SPECS, seção 26.1).
//  - só GET e só do mesmo endereço; nunca guarda nada de outros sites (como o Google) nem os dados da pessoa
//    (os dados ficam no localStorage, que o service worker não enxerga);
//  - abre da cópia guardada e atualiza em segundo plano; a versão nova só vale depois que a pessoa clica em
//    "Recarregar para atualizar" (a página manda SKIP_WAITING);
//  - o nome do cache leva a versão do sistema; caches antigos são apagados ao ativar.
self.window = self;
importScripts('js/version.js');
const VERSION = (self.APP_VERSION && self.APP_VERSION.number) || 'dev';
const CACHE = `gestao-financeira-${VERSION}`;
const EXTRA = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

// Lista de arquivos lida do próprio index.html (scripts e estilos) e dos estilos (fontes), para não precisar manter outra lista.
async function appFiles() {
  const urls = new Set(EXTRA);
  const html = await (await fetch('index.html', {cache: 'reload'})).text();
  const local = u => u && !/^(https?:)?\/\//.test(u) && !u.startsWith('data:');
  for (const m of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) if (local(m[1])) urls.add(m[1]);
  for (const css of [...urls].filter(u => u.endsWith('.css'))) {
    const text = await (await fetch(css, {cache: 'reload'})).text();
    for (const m of text.matchAll(/url\(["']?([^"')]+)["']?\)/g)) if (local(m[1])) urls.add(new URL(m[1], new URL(css, self.registration.scope)).pathname.replace(new URL(self.registration.scope).pathname, ''));
  }
  return [...urls];
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const files = await appFiles();
    await Promise.all(files.map(async url => { try { await cache.add(new Request(url, {cache: 'reload'})); } catch { /* arquivo opcional ausente: segue */ } }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('gestao-financeira-') && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // outros endereços e outros métodos: nada a ver com o cache
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, {ignoreSearch: true}) || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
    const refresh = fetch(req).then(res => { if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()); return res; }).catch(() => undefined);
    if (hit) { event.waitUntil(refresh); return hit; }   // abre da cópia e atualiza em segundo plano
    return (await refresh) || new Response('Sem internet e este arquivo ainda não foi guardado.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
  })());
});
