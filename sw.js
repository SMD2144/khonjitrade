const CACHE='khonji-pwa-v1.5.2-ipad-keyboard';
const CORE=[
  './',
  './index.html?v=112',
  './styles.css?v=112',
  './app.js?v=112',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(CORE))
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);

  if(event.request.mode==='navigate' ||
     url.pathname.endsWith('/index.html') ||
     url.pathname.endsWith('/app.js') ||
     url.pathname.endsWith('/styles.css')){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
          return response;
        })
        .catch(()=>caches.match(event.request).then(r=>r||caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>cached||fetch(event.request))
  );
});
