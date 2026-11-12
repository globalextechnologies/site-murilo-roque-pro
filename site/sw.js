// Service worker: deixa o site abrir rápido e funcionar como app (inclusive com internet fraca)
const VERSAO = 'mrp-v3';
const ARQUIVOS = [
  './', 'index.html', 'acesso.html', 'painel.html', 'manifest.webmanifest',
  'assets/css/base.css', 'assets/css/site.css', 'assets/css/app.css',
  'assets/js/config.js', 'assets/js/auth.js', 'assets/js/site.js', 'assets/js/acesso.js', 'assets/js/painel.js', 'assets/js/pwa.js',
  'assets/img/emblem-white.png', 'assets/img/emblem-hero.png', 'assets/img/wordmark-white.png',
  'assets/img/icon-192.png', 'assets/img/icon-512.png', 'assets/img/icon-180.png', 'assets/img/icon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Login (Cognito) e API da área do cliente passam direto: dados sempre frescos, nunca em cache
  const fonte = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonte) return;

  if (req.mode === 'navigate') {
    // Páginas: rede primeiro, cache se estiver offline
    e.respondWith(fetch(req).then(r => { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
    return;
  }
  // Arquivos estáticos: cache primeiro, atualiza em segundo plano
  e.respondWith(caches.match(req).then(cached => {
    const rede = fetch(req).then(r => { if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); } return r; }).catch(() => cached);
    return cached || rede;
  }));
});
