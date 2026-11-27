// v54 RC: static assets only. Do not cache requests to Apps Script or credential-bearing responses.
const CACHE_PREFIX='moit-aden-gh-';
const CACHE_NAME=CACHE_PREFIX+'v54-rc-freeze';
const CORE=['./','./index.html','./ops.html','./analytics-v54.js','./hybrid-v54.js','./closure-v54.js','./manifest.json','./manifest-ops.json','./icon-192.png','./icon-512.png'];
const allowed=new Set(CORE.map(x=>new URL(x,self.registration.scope).pathname));
// Let older controlled pages close before activating; avoid forcing a mid-session upgrade.
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==self.location.origin||u.search||!allowed.has(u.pathname))return;
 e.respondWith(fetch(e.request,{cache:'no-cache'}).then(async r=>{
   if(r.ok&&r.type==='basic'&&!/private|no-store/i.test(r.headers.get('Cache-Control')||'')){
     try{const c=await caches.open(CACHE_NAME);await c.put(e.request,r.clone());}catch(_){} // cache failure must not hide a valid network response
   }return r;
 }).catch(async()=>{const c=await caches.open(CACHE_NAME);return await c.match(e.request)||Response.error();}));
});
