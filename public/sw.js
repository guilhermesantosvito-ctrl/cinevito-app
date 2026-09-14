// Service worker mínimo — só o necessário pra o navegador aceitar
// instalar o app (isso é uma exigência técnica do padrão PWA).
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Deixa tudo passar direto pra rede normalmente
  event.respondWith(fetch(event.request));
});
