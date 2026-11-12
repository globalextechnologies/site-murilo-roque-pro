// Registro do service worker e botão "Instalar aplicativo" (Android, Windows, ChromeOS)
(() => {
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  let deferred = null;
  const mostrar = v => document.querySelectorAll('#instalar').forEach(b => b.hidden = !v);
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    window.__mrpInstallReady = true;
    mostrar(true);
  });
  document.addEventListener('click', async e => {
    if (!e.target.closest('#instalar') || !deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null; window.__mrpInstallReady = false;
    mostrar(false);
  });
  window.addEventListener('appinstalled', () => { window.__mrpInstallReady = false; mostrar(false); });
})();
