/* ------------------------------------------------------------
   Locus Magnus — service worker
   - L'application (HTML, CSS, JS, polices, icônes) est mise en cache
     pour fonctionner hors ligne.
   - Les textes (data/*.json) sont toujours demandés au réseau d'abord,
     pour voir immédiatement les nouveaux ajouts ; le cache ne sert
     qu'en l'absence de connexion.

   IMPORTANT : quand vous modifiez le code de l'application,
   augmentez VERSION pour que les téléphones récupèrent la nouvelle version.
   (Inutile quand vous ajoutez seulement des textes.)
   ------------------------------------------------------------ */

const VERSION = "v2";
const SHELL_CACHE = `locus-shell-${VERSION}`;
const DATA_CACHE = "locus-data";

const SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "fonts/cormorant-garamond-latin-300-normal.woff2",
  "fonts/cormorant-garamond-latin-300-italic.woff2",
  "fonts/cormorant-garamond-latin-400-italic.woff2",
  "fonts/jost-latin-400-normal.woff2",
  "fonts/jost-latin-500-normal.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith("locus-shell-") && k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Textes : réseau d'abord, cache en secours.
  if (url.pathname.includes("/data/") && url.pathname.endsWith(".json")) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request, { cacheName: DATA_CACHE }))
    );
    return;
  }

  // Application : cache d'abord, réseau en secours.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request))
  );
});
