/* Service worker: keep the last successful roster visible offline (SPEC §7). */
const SHELL_CACHE = "nobetci-shell-v1";
const DATA_CACHE = "nobetci-data-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Roster API: network first, fall back to the last cached good response.
  if (url.pathname === "/api/on-duty") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(event.request, { cacheName: DATA_CACHE, ignoreSearch: true });
          return cached ?? Response.error();
        })
    );
    return;
  }

  // Navigations and static assets: network first with cache fallback.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && (event.request.mode === "navigate" || url.pathname.startsWith("/_next/static"))) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, { cacheName: SHELL_CACHE });
        return cached ?? Response.error();
      })
  );
});
