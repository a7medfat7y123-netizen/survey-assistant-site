// Offline support for the website and the app (the build fills PRECACHE for each).
// The page is network-first with a short wait: an update shows as soon as there is a connection,
// and a slow or missing one still opens the stored copy at once. Libraries, fonts and the DWG reader
// are cache-first. The app's build stores its libraries at install, so it works offline from then on.
// Anything else (sign-in, the assistant's API, the account's /api/) always goes to the network; the
// page keeps its own copy of the account's data for offline use.
// v3: drops the account answers v2 could have stored on geox-survey.pages.dev.
const CACHE = "almohandes-v3";
const PRECACHE = ["./","icons/icon-192.png","icons/icon-512.png"];
const LIBS = /^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;
const WAIT_MS = 3000;

self.addEventListener("install", (e) => {
  // One missing file must not stop the rest from being stored; it is fetched again on first use.
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    const home = new URL("./", self.registration.scope).href;
    const fresh = fetch(req).then(async (res) => {
      if (res.ok) await (await caches.open(CACHE)).put(home, res.clone());
      return res;
    });
    e.waitUntil(fresh.catch(() => {}));
    e.respondWith((async () => {
      const stored = await caches.match(home);
      if (!stored) return fresh;
      const late = new Promise((done) => setTimeout(() => done(stored), WAIT_MS));
      return Promise.race([fresh.catch(() => stored), late]);
    })());
    return;
  }

  if (url.origin !== self.location.origin && !LIBS.test(url.hostname)) return;
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return; // the account: never stored
  if (url.pathname.endsWith(".apk")) return; // a download, not part of the app
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
