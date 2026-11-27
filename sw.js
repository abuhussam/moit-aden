const CACHE_PREFIX='moit-aden-gh-';
const CACHE_NAME=CACHE_PREFIX+'v53';
const CORE=['./','./index.html','./ops.html','./manifest.json','./manifest-ops.json','./icon-192.png','./icon-512.png'];
const allowed=new Set(CORE.map(x=>new URL(x,self.registration.scope).pathname));
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.search||!allowed.has(u.pathname))return;
 e.respondWith(fetch(e.request).then(async r=>{if(r.ok&&r.type==='basic'){const c=await caches.open(CACHE_NAME);await c.put(e.request,r.clone());}return r;}).catch(async()=>await caches.match(e.request)||Response.error()));});
