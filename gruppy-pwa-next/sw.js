const CACHE='gruppen-ipad-v60';
const FILES=['./','./index.html','./app.js?v=60','./pdf-vector-glyphs.js?v=60','./group-export.js?v=60','./bridge-client.js?v=60','./styles.css?v=60','./manifest.webmanifest','./version.json','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('gruppen-ipad-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 // Network-first means an installed Home Screen PWA sees newly deployed files.
 event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));}
  return response;
 }).catch(async()=>{
  const cached=await caches.match(request);
  if(cached)return cached;
  if(request.mode==='navigate')return caches.match('./index.html');
  return Response.error();
 }));
});
