const CACHE='khonji-pwa-v1.9.0-replace-all-generation';
const CORE=[
  './',
  './index.html?v=190',
  './styles.css?v=190',
  './app.js?v=190',
  './manifest.json?v=190',
  './icon-192.svg',
  './icon-512.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(CORE))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();

    const clients=await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for(const client of clients){
      client.postMessage({type:'KHONJI_SW_ACTIVATED',version:'1.9.0'});
    }
  })());
});

self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET')return;

  const url=new URL(req.url);

  // IMPORTANT: the service worker is only for this GitHub Pages app shell.
  // Never intercept API or any other cross-origin request. On iOS/Safari,
  // intercepting authenticated cross-origin fetches can surface as
  // "FetchEvent.respondWith received an error: TypeError: Load failed".
  if(url.origin !== self.location.origin){
    return;
  }

  // App shell: network first. This prevents Home Screen from being stuck on old HTML.
  if(req.mode==='navigate' || url.pathname.endsWith('/index.html')){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(req,{cache:'no-store'});
        const cache=await caches.open(CACHE);
        cache.put('./index.html?v=190', fresh.clone()).catch(()=>{});
        return fresh;
      }catch(_){
        return (await caches.match('./index.html?v=190')) || (await caches.match('./'));
      }
    })());
    return;
  }

  // Versioned JS/CSS/manifest: network first, cache fallback.
  if(url.pathname.endsWith('/app.js') || url.pathname.endsWith('/styles.css') || url.pathname.endsWith('/manifest.json')){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(req,{cache:'no-store'});
        const cache=await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(()=>{});
        return fresh;
      }catch(_){
        return caches.match(req);
      }
    })());
    return;
  }

  // Static assets: cache first.
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req))
  );
});

self.addEventListener('message', event=>{
  if(event.data?.type==='SKIP_WAITING'){
    self.skipWaiting();
  }
});
