// ISE Prep offline support (same approach as Ascend). Keeps a copy of the app on the phone so the Home Screen app opens with no signal.
// Your data is in localStorage and is never touched here; this file only stores the app's own files.
// The page: try the network first (so updates still arrive), fall back to the stored copy when offline.
// Update checks (?check=) always go to the network, so "Check for updates" can tell you you're offline.
const CACHE = "iseprep-app-v1";
const SHELL = ["./", "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png"];
const NET_TIMEOUT = 4000;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("iseprep-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function withTimeout(p, ms) {
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
}

async function page(req) {
  const c = await caches.open(CACHE);
  try {
    const r = await withTimeout(fetch(req), NET_TIMEOUT);
    if (r.ok) await c.put("./", r.clone());
    return r;
  } catch (e) {
    return (await c.match("./")) || Response.error();
  }
}

async function asset(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreSearch: true });
  const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; });
  if (hit) { net.catch(() => {}); return hit; }
  return net;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.searchParams.has("check")) return;
  if (req.mode === "navigate" && sameOrigin) { e.respondWith(page(req)); return; }
  if (sameOrigin) e.respondWith(asset(req));
});
